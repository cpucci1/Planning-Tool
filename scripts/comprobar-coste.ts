/**
 * Comprobación del coste, las ausencias y el trabajo fijo (ronda 2).
 *
 *   npm run comprobar-coste
 *
 * Sale con código 1 si algo no se cumple:
 *
 * - el bruto se multiplica por 1 + Seguridad Social (1,32 de partida), y un
 *   plan de antes (sin `costeBase`) se queda tal cual, a factor 1;
 * - la hora trabajada cuesta entre 1,4 y 1,6 veces el bruto por hora;
 * - las ausencias se cubren DIVIDIENDO por el tiempo disponible, no
 *   multiplicando por (1 + %);
 * - las horas de vacaciones, festivos y bajas suman el total;
 * - las complementarias nunca llevan a nadie a jornada completa, y con el 30 %
 *   no pasan del 30 %;
 * - la temporada da la vuelta del año y pide al menos 4 semanas seguidas;
 * - las vacaciones en semanas flojas nunca absorben más de lo que hay;
 * - quien abre y cierra nunca es un mando, ni aunque estuviera elegido;
 * - el trabajo fijo se queda con el máximo (no suma a la preparación) y no
 *   carga nada a un mando;
 * - con la lista de trabajo fijo vacía, la plantilla sale idéntica.
 */

import { analyzeFile } from '../src/lib/fakeAI'
import { ESTANCIAS_DEFECTO, aperturaConEstancia, applyLag, coverageThreshold, inferHours, typicalWeek } from '../src/lib/demand'
import { applyTrabajoFijo, openingRoleFor, summarize } from '../src/lib/staffing'
import { conColchon, curvaDeTrabajo, necesidadCompleta, necesidadDeServicio } from '../src/lib/necesidad'
import { buildRoster } from '../src/lib/roster'
import { analyzePeaks, baseDeCoste, jornadasTexto, summarizeCost, summarizePlan, temporadaDelLocal } from '../src/lib/contracts'
import {
  bolsaComplementarias,
  coberturaAusencias,
  parametrosAusencia,
  temporadaAlta,
  tiempoDisponible,
  vacacionesEnSemanasFlojas,
} from '../src/lib/ausencias'
import { DEFAULT_BLOCKS, DEFAULT_ROLES, DEFAULT_SETTINGS, DEFAULT_TIERS, DEMO_COSTES_HORA, KITCHEN_BLOCK_ID } from '../src/data/presets'
import { SLOTS_PER_DAY, slotStartMin } from '../src/lib/time'
import type { NeedGrid, OpeningHours, Roster, Settings, StaffingModel, WeekDemand } from '../src/lib/types'

const fallos: string[] = []
const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 3 })
function ok(cond: boolean, msg: string) {
  console.log(`  ${cond ? '\x1b[32mBIEN\x1b[0m ' : '\x1b[31mFALLA\x1b[0m'} ${msg}`)
  if (!cond) fallos.push(msg)
}
const cerca = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol

async function main() {
  const d = await analyzeFile(null, undefined, 0)
  const settings: Settings = DEFAULT_SETTINGS
  const model: StaffingModel = {
    blocks: DEFAULT_BLOCKS,
    roles: DEFAULT_ROLES.map((r) => ({ ...r, hourlyCostEur: DEMO_COSTES_HORA[r.id] ?? null })),
    tiers: DEFAULT_TIERS,
  }
  const hours = d.source.detectedHours
  const typical = typicalWeek(d.weeks, settings.coveragePct, settings.sizingMode)
  const staffing = conColchon(curvaDeTrabajo(typical, hours, settings), settings)
  const demandGrid = necesidadDeServicio(staffing, model, null, KITCHEN_BLOCK_ID)
  const plan = (s: Settings) => buildRoster(necesidadCompleta(demandGrid, staffing, model, hours, null, KITCHEN_BLOCK_ID, s), model, s)

  console.log('\n\x1b[1mCoste de empresa\x1b[0m')
  const b = baseDeCoste(settings)
  ok(b.base === 'bruto' && cerca(b.factor, 1.32), `de partida el catálogo es bruto y se multiplica por ${fmt(b.factor)}`)
  const viejo = { ...settings, costeBase: undefined, cotizacionEmpresaPct: undefined } as Settings
  ok(baseDeCoste(viejo).factor === 1 && baseDeCoste(undefined).factor === 1, 'un plan de antes se queda a factor 1')

  const roster = plan(settings)
  const cost = summarizeCost(roster, model, settings)
  const costViejo = summarizeCost(roster, model, viejo)
  ok(!!cost && !!costViejo && cerca(cost.weeklyEur, costViejo.weeklyEur * 1.32, 1e-6), 'el semanal de empresa es el bruto por 1,32')
  ok(!!cost && cost.weeklyBrutoEur !== null && cerca(cost.weeklyBrutoEur, costViejo!.weeklyEur, 1e-6), 'el bruto semanal se conserva aparte')
  const sumaRoles = cost?.byRole.reduce((a, r) => a + (r.weeklyEur ?? 0), 0) ?? 0
  ok(!!cost && cerca(sumaRoles, cost.weeklyEur, 1e-6), 'los puestos suman el total, con la Seguridad Social dentro')
  const brutoHora = cost && cost.weeklyBrutoEur !== null ? cost.weeklyBrutoEur / roster.people.reduce((a, p) => a + p.contractHours, 0) : 0
  const mult = cost ? cost.costeHoraTrabajadaEur / brutoHora : 0
  ok(mult >= 1.4 && mult <= 1.6, `la hora trabajada cuesta ${fmt(mult)} veces el bruto por hora de contrato`)
  console.log(`    bruto/hora ${fmt(brutoHora)} € · empresa/hora de contrato ${fmt(cost?.avgHourlyEur ?? 0)} € · hora trabajada ${fmt(cost?.costeHoraTrabajadaEur ?? 0)} €`)
  console.log(`    semanal bruto ${fmt(cost?.weeklyBrutoEur ?? 0)} € · empresa ${fmt(cost?.weeklyEur ?? 0)} € · anual ${fmt(cost?.annualEur ?? 0)} €`)

  console.log('\n\x1b[1mAusencias\x1b[0m')
  const t = tiempoDisponible(parametrosAusencia(settings))
  ok(t.fraccionPresente > 0.8 && t.fraccionPresente < 0.82, `fracción presente con 30 días, 14 festivos y 6 % de bajas: ${fmt(t.fraccionPresente)}`)
  const a = coberturaAusencias(roster.people, settings)
  const W = a.horasTurnoSemana
  ok(cerca(a.horasVacaciones + a.horasFestivos + a.horasBajas, a.horasACubrirAno), 'vacaciones + festivos + bajas = total')
  const esperado = (W * 52 * (1 - t.fraccionPresente)) / (2080 * t.fraccionPresente)
  ok(cerca(a.jornadasExtra, esperado, 1e-9), `jornadas extra = horas / (2.080 × f): ${fmt(a.jornadasExtra)}`)
  const multiplicando = (W * (1 - t.fraccionPresente)) / 40
  ok(a.jornadasExtra > multiplicando, `dividir da más que multiplicar (${fmt(a.jornadasExtra)} frente a ${fmt(multiplicando)})`)
  const sinBajas = coberturaAusencias(roster.people, { ...settings, bajasPct: 0 })
  ok(sinBajas.horasBajas === 0 && sinBajas.jornadasExtra < a.jornadasExtra, 'con 0 % de bajas no hay horas de bajas y salen menos jornadas')
  console.log(`    ${fmt(W)} h en turnos a la semana · ${fmt(a.horasACubrirAno)} h al año sin nadie · ${fmt(a.jornadasExtra)} jornadas`)

  console.log('\n\x1b[1mVacaciones en semanas flojas y temporada\x1b[0m')
  const cov = coverageThreshold(d.weeks, settings.coveragePct)
  const servicio = summarize(demandGrid, model).totalHours
  for (const vac of [0, 50, a.horasVacaciones, 1e6]) {
    const f = vacacionesEnSemanasFlojas(d.weeks, cov.threshold, servicio, vac)
    ok(
      f.horasAbsorbidas <= vac + 1e-9 && cerca(f.horasAbsorbidas + f.horasRestantes, vac, 1e-6),
      `con ${fmt(vac)} h de vacaciones absorbe ${fmt(f.horasAbsorbidas)} y quedan ${fmt(f.horasRestantes)}`,
    )
  }
  ok(temporadaAlta([50, 51, 52, 1])?.semanas === 4, 'la temporada da la vuelta del año (50 a 1)')
  ok(temporadaAlta([10, 11, 12]) === null, 'tres semanas seguidas no son temporada')
  ok(temporadaAlta([1, 2, 3, 4, 20])?.desde === 1, 'una racha de 4 al principio del año sí')

  console.log('\n\x1b[1mHoras complementarias\x1b[0m')
  const gente = [10, 15, 20, 30, 38, 40].map((h) => ({ contractHours: h }))
  const bolsa = bolsaComplementarias(gente, { ...settings, complementariasPct: 30 })
  ok(bolsa.parciales === 5, 'cuentan los parciales y no las jornadas completas')
  const topeIndividual = (h: number, pct: number) => bolsaComplementarias([{ contractHours: h }], { ...settings, complementariasPct: pct }).horasSemana
  ok(
    gente.filter((g) => g.contractHours < 40).every((g) => g.contractHours + topeIndividual(g.contractHours, 60) < 40),
    'ni con el 60 % llega nadie a jornada completa',
  )
  ok(gente.every((g) => topeIndividual(g.contractHours, 30) <= g.contractHours * 0.3 + 1e-9), 'con el 30 % nadie pasa del 30 % de su jornada')
  ok(topeIndividual(38, 30) === 1, 'un parcial de 38 h solo puede hacer 1 h (se queda por debajo de 40)')

  console.log('\n\x1b[1mQuien abre y cierra\x1b[0m')
  ok(openingRoleFor(model, 'cocina', 'jefe-cocina')?.kind !== 'estructura', 'con el jefe de cocina elegido, abre otro puesto que no es mando')
  ok(openingRoleFor(model, 'sala', 'encargado')?.kind !== 'estructura', 'con el encargado elegido, tampoco')
  const soloMandos: StaffingModel = { ...model, roles: model.roles.filter((r) => r.blockId !== 'cocina' || r.kind === 'estructura') }
  ok(openingRoleFor(soloMandos, 'cocina') === null, 'una zona solo con mandos no tiene a quién cargar el mínimo')

  console.log('\n\x1b[1mTrabajo fijo\x1b[0m')
  const horario: OpeningHours = Array.from({ length: 7 }, () => [{ startMin: 13 * 60, endMin: 16 * 60 }])
  const vacia = (): NeedGrid => Object.fromEntries(model.roles.map((r) => [r.id, Array.from({ length: 7 }, () => new Array(SLOTS_PER_DAY).fill(0))]))
  const g0 = vacia()
  const slot = (m: number) => Array.from({ length: SLOTS_PER_DAY }, (_, s) => s).find((s) => slotStartMin(s) === m) as number
  // Ya hay 1 cocinero de 12:00 a 13:00 por la preparación.
  for (let d0 = 0; d0 < 7; d0++) {
    g0.cocinero[d0][slot(12 * 60)] = 1
    g0.cocinero[d0][slot(12 * 60 + 30)] = 1
  }
  const g1 = applyTrabajoFijo(g0, model, [{ id: 'a', roleId: 'cocinero', momento: 'antes', minutos: 60, personas: 1 }], () => horario)
  ok(g1.cocinero[0][slot(12 * 60)] === 1 && g1.cocinero[0][slot(12 * 60 + 30)] === 1, 'con la preparación ya puesta, no suma a nadie (máximo)')
  const g2 = applyTrabajoFijo(g0, model, [{ id: 'b', roleId: 'office', momento: 'despues', minutos: 30, personas: 2 }], () => horario)
  ok(g2.office[3][slot(16 * 60)] === 2 && g2.office[3][slot(16 * 60 + 30)] === 0, '2 de office 30 min después de cerrar, y ni un minuto más')
  const g3 = applyTrabajoFijo(g0, model, [{ id: 'c', roleId: 'jefe-cocina', momento: 'antes', minutos: 60, personas: 1 }], () => horario)
  ok(g3['jefe-cocina'].flat().every((v) => v === 0), 'a un mando no se le carga nada')

  const conVacia = plan({ ...settings, trabajoFijo: [] })
  const sinCampo = plan({ ...settings, trabajoFijo: undefined })
  ok(
    conVacia.people.length === sinCampo.people.length && conVacia.shifts.length === sinCampo.shifts.length,
    `con la lista vacía la plantilla no cambia: ${conVacia.people.length} personas, ${conVacia.shifts.length} turnos`,
  )
  const hTurnos = (r: typeof roster) => r.people.reduce((x, p) => x + p.assignedHours, 0)
  for (const tarea of [
    { id: 'm', roleId: 'cocinero', momento: 'antes' as const, minutos: 60, personas: 1 },
    { id: 'm2', roleId: 'cocinero', momento: 'antes' as const, minutos: 90, personas: 2 },
    { id: 'o', roleId: 'office', momento: 'despues' as const, minutos: 30, personas: 1 },
  ]) {
    const r = plan({ ...settings, trabajoFijo: [tarea] })
    console.log(
      `    ${tarea.personas} ${tarea.roleId} ${tarea.minutos} min ${tarea.momento}: ${r.people.length} personas, ${fmt(hTurnos(r))} h en turnos (sin ella ${fmt(hTurnos(conVacia))} h)`,
    )
    ok(hTurnos(r) >= hTurnos(conVacia) - 1e-9, 'añadir trabajo fijo nunca baja las horas en turnos')
  }

  quintaRonda(roster, model, settings, necesidadCompleta(demandGrid, staffing, model, hours, null, KITCHEN_BLOCK_ID, settings))
  sextaRonda(d.weeks, hours, model, settings)
  septimaRonda(roster, model, settings)

  console.log()
  if (fallos.length) {
    console.log(`\x1b[31m${fallos.length} fallo(s)\x1b[0m`)
    process.exit(1)
  }
  console.log('\x1b[32mTodo en regla\x1b[0m')
}

/**
 * Ronda 5 (cambios-motor-r5-2026-11-04.md): el local de temporada se paga por
 * las semanas que abre, la peor semana pide las jornadas de sus horas y no
 * solo la gente de más a la vez, y las horas pagadas sin servicio se
 * comprueban restando.
 */
function quintaRonda(roster: Roster, model: StaffingModel, settings: Settings, grid: NeedGrid) {
  console.log('\nRonda 5')
  const costes: Settings = { ...settings, calcularCostes: true }
  // G1. Temporada: 29 semanas de cierre, 23 abiertas.
  const cierre = (n: number) => Array.from({ length: n }, (_, i) => ({ isoWeek: i + 1, kind: 'cierre' as const, excluded: true }))
  const playa = temporadaDelLocal(cierre(29))
  ok(playa.deTemporada && playa.semanasDePago === 23, `29 semanas cerradas: de temporada, se pagan ${playa.semanasDePago} semanas`)
  const vacaciones = temporadaDelLocal(cierre(4))
  ok(!vacaciones.deTemporada && vacaciones.semanasDePago === 52, 'cuatro semanas de vacaciones se pagan igual: 52 semanas')
  const reabiertas = temporadaDelLocal(cierre(29).map((x) => ({ ...x, excluded: false })))
  ok(reabiertas.semanasDePago === 52, 'si el usuario vuelve a meter las semanas cerradas, cuentan como abiertas')
  const c52 = summarizeCost(roster, model, costes)
  const c23 = summarizeCost(roster, model, costes, playa.semanasDePago)
  if (c52 && c23) {
    ok(cerca(c23.annualEur, Math.round(c23.weeklyEur) * 23, 1e-6), `de temporada el año son 23 semanas: ${fmt(Math.round(c23.annualEur))} € frente a ${fmt(Math.round(c52.annualEur))} €`)
    ok(cerca(c23.costeHoraTrabajadaEur, c52.costeHoraTrabajadaEur, 1e-9), 'la hora trabajada cuesta lo mismo con fijo discontinuo')
    // Ronda 8, m1: el año es el coste semanal que se enseña por 52, al euro.
    ok(c52.annualEur === Math.round(c52.weeklyEur) * 52, `el año es la semana que se enseña por 52: ${fmt(Math.round(c52.weeklyEur))} × 52 = ${fmt(c52.annualEur)} €`)
  }
  const a52 = coberturaAusencias(roster.people, settings)
  const a23 = coberturaAusencias(roster.people, settings, 40, 23)
  ok(cerca(a23.horasACubrirAno, (a52.horasACubrirAno * 23) / 52, 1e-6), 'las ausencias de un fijo discontinuo van en proporción a lo que trabaja')
  ok(cerca(a23.jornadasExtra, a52.jornadasExtra, 1e-9), 'y las jornadas para cubrirlas durante la temporada son las mismas')
  // m2. La temporada con semanas excluidas: el calendario son 52 semanas.
  ok(temporadaAlta([46, 47, 48, 49], 52) !== null, 'la racha 46 a 49 es temporada con el calendario de 52 semanas')

  // G2 de pantallas. La peor semana pide sus jornadas, no solo la gente a la vez.
  const semanas: WeekDemand[] = Array.from({ length: 52 }, (_, i) => {
    const k = i === 30 ? 1.5 : 1
    const days = Array.from({ length: 7 }, () => Array.from({ length: SLOTS_PER_DAY }, (_, s) => (slotStartMin(s) >= 13 * 60 && slotStartMin(s) < 16 * 60 ? 10 * k : 0)))
    return { isoWeek: i + 1, year: 2025, startDate: '2025-01-01', days, total: days.flat().reduce((a, b) => a + b, 0) }
  })
  // La semana punta pide 12 a la vez; las normales, 10 (ronda 7: el pico se
  // compara con el de una semana normal medida igual).
  const picos = analyzePeaks(semanas, semanas[0].total, 400, semanas[0].total, 40, {
    personasPico: (days) => (days[0].some((v) => v > 10) ? 12 : 10),
    picoTipico: 10,
  })
  const peor = picos.worstWeek
  ok(!!peor && peor.extraHours === 200, `la peor semana pide ${peor?.extraHours} h más (200 esperadas)`)
  ok(!!peor && peor.extraPeople === 2 && peor.jornadasPorHoras === 5 && peor.personasParaContratar === 5,
    `con 200 h que faltan se contratan ${peor?.personasParaContratar} personas (5 jornadas por horas), no las ${peor?.extraPeople} de más a la vez`)

  // G1 de pantallas. Horas pagadas sin servicio: se comprueban restando.
  const plan = summarizePlan(roster, settings, summarize(grid, model), grid, model)
  const enTurnos = roster.shifts.reduce((a, sh) => a + sh.hours, 0)
  ok(cerca(plan.slackHours, plan.contractedHours - plan.neededHours, 1e-6),
    `pagadas sin servicio = contratadas menos necesidad: ${fmt(plan.slackHours)} = ${fmt(plan.contractedHours)} - ${fmt(plan.neededHours)}`)
  ok(cerca(plan.slackDesglose?.enElLocal ?? -1, enTurnos - plan.neededHours, 1e-6),
    `en el local de más = en turnos menos necesidad: ${fmt(plan.slackDesglose?.enElLocal ?? -1)} = ${fmt(enTurnos)} - ${fmt(plan.neededHours)}`)
}

/**
 * Ronda 6 (cambios-motor-r6-2026-11-04.md): las complementarias pactadas solo
 * con contratos de 10 h o más; con más margen de seguridad las horas de pico
 * nunca suben; y el desglose de la plantilla nunca sale en negativo.
 */
function sextaRonda(weeks: WeekDemand[], hours: OpeningHours, model: StaffingModel, settings: Settings) {
  console.log('\nRonda 6')
  // m7. Contratos de 6 y 8 h no pactan complementarias (art. 12.5 ET).
  const cortos = bolsaComplementarias([{ contractHours: 6 }, { contractHours: 8 }], { ...settings, complementariasPct: 30 })
  ok(cortos.parciales === 0 && cortos.horasSemana === 0 && cortos.horasVoluntariasSemana === 0,
    `contratos de 6 y 8 h: ${cortos.horasSemana} h pactadas y ${cortos.horasVoluntariasSemana} voluntarias (0 esperadas)`)
  const diez = bolsaComplementarias([{ contractHours: 10 }], { ...settings, complementariasPct: 30 })
  ok(diez.parciales === 1 && diez.horasSemana === 3, `un contrato de 10 h pacta ${diez.horasSemana} h (3 esperadas)`)

  // M1. Más margen de seguridad no puede dar más horas de pico al año.
  const anteriores: number[] = []
  for (const m of [0, 10, 20]) {
    const s: Settings = { ...settings, safetyMarginPct: m }
    const typ = typicalWeek(weeks, s.coveragePct, s.sizingMode)
    const curva = curvaDeTrabajo(typ, hours, s)
    const sumD = summarize(necesidadDeServicio(conColchon(curva, s), model, null, KITCHEN_BLOCK_ID), model)
    const cov = coverageThreshold(weeks, s.coveragePct)
    const pk = analyzePeaks(weeks, cov.threshold, sumD.totalHours, typ.flat().reduce((a, b) => a + b, 0), 40, {
      personasPico: (days) => summarize(necesidadDeServicio(curvaDeTrabajo(days, hours, s), model, null, KITCHEN_BLOCK_ID), model).peak.people,
      picoTipico: sumD.peak.people,
      margenPct: m,
    })
    console.log(`    margen ${m} %: ${pk.peakHoursPerYear} h de pico al año, peor semana ${pk.worstWeek?.extraPeople ?? 0} personas`)
    if (anteriores.length) ok(pk.peakHoursPerYear <= anteriores[anteriores.length - 1], `con margen ${m} % las horas de pico no suben (${pk.peakHoursPerYear} frente a ${anteriores[anteriores.length - 1]})`)
    anteriores.push(pk.peakHoursPerYear)
  }

  // m1. El desglose de la plantilla nunca en negativo, con y sin mandos.
  const sinMandos: StaffingModel = { ...model, roles: model.roles.map((r) => (r.kind === 'estructura' ? { ...r, headcount: 0 } : r)) }
  for (const [nombre, mdl] of [['el ejemplo', model], ['sin mandos', sinMandos]] as [string, StaffingModel][]) {
    const typ = typicalWeek(weeks, settings.coveragePct, settings.sizingMode)
    const st = conColchon(curvaDeTrabajo(typ, hours, settings), settings)
    const dg = necesidadDeServicio(st, mdl, null, KITCHEN_BLOCK_ID)
    const g = necesidadCompleta(dg, st, mdl, hours, null, KITCHEN_BLOCK_ID, settings)
    const r = buildRoster(g, mdl, settings, { horarioDe: () => hours })
    const pl = summarizePlan(r, settings, summarize(g, mdl), g, mdl)
    const negativos = Object.entries(pl.drivers.desglose ?? {}).filter(([, v]) => typeof v === 'number' && v < 0)
    ok(negativos.length === 0, `${nombre}: desglose sin negativos ${JSON.stringify(pl.drivers.desglose)}`)
  }
}

/**
 * Ronda 7 (cambios-motor-r7-2026-11-04.md). Falla si vuelve alguno de estos:
 * un local que cierra en agosto paga otra vez las vacaciones (G1); el pico se
 * vende como jornadas completas a 40 h cuando son pocas horas, o sale "+3"
 * de ruido en una semana normal (G2); "unas 1 jornadas"; los puestos que no
 * suman el total; avgExtraPeople a 1 sin picos; y el horario deducido que
 * abre después de que se sienten los clientes (M1).
 */
function septimaRonda(roster: Roster, model: StaffingModel, settings: Settings) {
  console.log('\nRonda 7')
  // G1. Cuatro semanas de cierre son 28 de los 30 días de vacaciones.
  const a0 = coberturaAusencias(roster.people, settings)
  const a4 = coberturaAusencias(roster.people, settings, 40, 52, 4)
  const a5 = coberturaAusencias(roster.people, settings, 40, 52, 5)
  const W = a0.horasTurnoSemana
  ok(cerca(a4.horasVacaciones, (W * 2) / 7, 1e-6), `con 4 semanas de cierre quedan 2 días de vacaciones por cubrir: ${fmt(a4.horasVacaciones)} h (antes ${fmt(a0.horasVacaciones)})`)
  ok(a5.horasVacaciones === 0 && a5.vacacionesEnCierreDias === 30, 'con 5 semanas de cierre no queda ninguna vacación por cubrir, y nunca más de 30 días')
  ok(cerca(a4.horasFestivos, a0.horasFestivos, 1e-9) && cerca(a4.horasBajas, a0.horasBajas, 1e-9), 'el cierre no toca festivos ni bajas')
  const temp = coberturaAusencias(roster.people, settings, 40, 23, 29)
  const tempAntes = coberturaAusencias(roster.people, settings, 40, 23)
  ok(cerca(temp.horasVacaciones, tempAntes.horasVacaciones, 1e-9), 'en un local de temporada las semanas cerradas no se pagan y no descuentan vacaciones')
  const cierre = (n: number) => Array.from({ length: n }, (_, i) => ({ isoWeek: 31 + i, kind: 'cierre' as const, excluded: true }))
  ok(temporadaDelLocal(cierre(4)).semanasCerradas === 4, 'temporadaDelLocal cuenta las 4 semanas de cierre que se pasan a las ausencias')

  // G2. El pico de un bar de tapas: 10 h más y "+3" que ya sale en la mitad
  // de las semanas normales. No son 3 jornadas completas.
  const dia = (k: number) => Array.from({ length: 7 }, () => Array.from({ length: SLOTS_PER_DAY }, (_, s2) => (slotStartMin(s2) >= 13 * 60 && slotStartMin(s2) < 16 * 60 ? 10 * k : 0)))
  const tapas: WeekDemand[] = Array.from({ length: 52 }, (_, i) => {
    const k = i === 30 ? 1.05 : i % 2 ? 0.98 : 0.97
    const days = dia(k)
    return { isoWeek: i + 1, year: 2025, startDate: '2025-01-01', days, total: days.flat().reduce((a, b) => a + b, 0) }
  })
  const umbral = Math.max(...tapas.filter((_, i) => i !== 30).map((w) => w.total))
  const ruido = analyzePeaks(tapas, umbral, 200, umbral, 40, {
    // Las semanas impares dan "+3" por el salto de tramo, igual que la punta.
    personasPico: (days) => (days[0].some((v) => v > 9.75) ? 10 : 7),
    picoTipico: 7,
    contratoMinimoHoras: 10,
  })
  const pt = ruido.worstWeek
  console.log(`    tapas: ${pt?.extraHours} h más · ${pt?.extraPeople} más a la vez · ${pt?.jornadasPorHoras} jornadas · ${pt?.personasParaContratar} personas · ${pt?.horasContratoSemana} h de contrato`)
  ok(!!pt && pt.extraPeople === 0, `el "+3" que ya sale en semanas normales no es gente de más a la vez (${pt?.extraPeople})`)
  ok(!!pt && pt.personasParaContratar === 1 && (pt.jornadasPorHoras ?? 9) < 1, `unas pocas horas son 1 persona y menos de una jornada, no 3 jornadas (${pt?.personasParaContratar}, ${pt?.jornadasPorHoras})`)
  ok(!!pt && pt.horasContratoSemana === Math.max(pt.extraHours, 10), `el contrato para el pico son sus horas (${pt?.horasContratoSemana} h), no 40 h por persona`)
  const sinPicos = analyzePeaks(tapas.slice(0, 10), 1e9, 200, 100, 40)
  ok(sinPicos.avgExtraPeople === 0 && sinPicos.worstWeek === null, 'sin semanas punta, la media de gente de más es 0')
  ok(jornadasTexto(1) === 'una jornada completa' && jornadasTexto(12.24) === '12,2 jornadas completas', `jornadas en castellano: "${jornadasTexto(1)}", "${jornadasTexto(12.24)}"`)

  // m6 de pantallas. Los puestos en euros enteros suman el total.
  const c = summarizeCost(roster, model, { ...settings, calcularCostes: true })
  if (c) {
    const suma = c.byRole.reduce((a, r) => a + (r.weeklyEurEntero ?? 0), 0)
    ok(suma === Math.round(c.weeklyEur), `los puestos redondeados suman el total: ${suma} = ${Math.round(c.weeklyEur)}`)
  }

  // M1. La cena que paga de 22:00 a 23:30 se sentó desde las 20:30.
  const cobros = Array.from({ length: 7 }, () => Array.from({ length: SLOTS_PER_DAY }, (_, s2) => (slotStartMin(s2) >= 22 * 60 && slotStartMin(s2) < 23 * 60 + 30 ? 12 : 0)))
  const deCobros = inferHours(applyLag(cobros, 30), 3)
  const conEstancia = aperturaConEstancia(deCobros, cobros, ESTANCIAS_DEFECTO, 2)
  console.log(`    cena que paga de 22:00 a 23:30: abre a las ${deCobros[0][0].startMin / 60} con el desfase, a las ${conEstancia[0][0].startMin / 60} con la estancia`)
  ok(conEstancia[0][0].startMin <= 20 * 60 + 30, 'el horario deducido abre cuando se sientan los primeros (20:30), no cuando pagan')
  ok(conEstancia[0][0].endMin === deCobros[0][0].endMin, 'la estancia no mueve el cierre')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
