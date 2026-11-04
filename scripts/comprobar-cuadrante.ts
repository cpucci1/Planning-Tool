/**
 * Comprobación del cuadrante, con casos que antes salían mal.
 *
 *   npm run comprobar-cuadrante
 *
 * A diferencia de `verificar-calculo.ts`, que imprime la cadena entera para
 * mirarla, esto FALLA (sale con código 1) si alguna de estas reglas no se
 * cumple en alguno de los casos:
 *
 * - ningún día de nadie pasa del máximo de horas al día;
 * - ningún mando tiene menos del 90 % de su contrato en turnos;
 * - mientras una zona con mandos está abierta, siempre hay alguien de la zona
 *   al frente (un mando o, cuando libra, el segundo de la zona), y lo que
 *   quede sin nadie lo dice el cuadrante tal cual;
 * - el número de turnos no se dispara (una vez pasó de 88 a 23.784 sin error);
 * - el puesto grande (70 personas) se calcula en 300 ms o menos, porque esto
 *   se rehace con cada tecla de la tabla de tramos;
 * - doce horas entre el cierre de un día y la apertura del siguiente, también
 *   del domingo al lunes y al cambiar de semana en la rueda;
 * - dos libranzas seguidas para todo el que no sea mando;
 * - nadie (salvo los mandos) viene un solo día a la semana: los parciales
 *   tienen que tener sentido, un fin de semana entero y no un día suelto.
 *
 * Y de la segunda ronda (cambios-cuadrante-r2-2026-11-04.md): el caso de
 * `npm run verificar` con la preparación por zona no puede volver a 26
 * personas ni a 727,5 h en turnos, la rueda reparte los findes, los códigos
 * M/T/P/L y el plazo de publicación salen bien, y los avisos de noche y de
 * menores saltan cuando tienen que saltar.
 *
 * Y de la tercera ronda (cambios-cuadrante-r3-2026-11-04.md): los mandos no
 * se multiplican, el mando hace partida en vez de cruzar la tarde muerta, el
 * responsable de jornada completa está los días fuertes, los refuerzos no
 * entran antes de abrir, el office se queda a recoger, el descanso semanal
 * y los ajustes por encima de la ley avisan, el desglose de la plantilla
 * suma exacto, un día raro no hace el titular de picos, y los códigos M/T/N.
 *
 * Los casos salen de la revisión del 2026-11-04: los datos de ejemplo, el
 * ejemplo con encargado, un local abierto de 9 a 24 seguido con 8 comensales
 * siempre (daba turnos de 15 h), el mínimo de 1 en sala y cocina con una hora
 * de preparación, y un puesto grande.
 */

import { analyzeFile } from '../src/lib/fakeAI'
import { applyLag, clampToHours, typicalWeek } from '../src/lib/demand'
import { applyOpeningMinimums, buildNeedGrid, expandHours } from '../src/lib/staffing'
import { buildRoster, descansoSemanalPedidoMin, esMando, mediaNocturnaMin, minutosDeNocheBloques, minutosSinMando, topeDiarioMin } from '../src/lib/roster'
import { descansoSemanalMasLargoMin, revisarCuadrante } from '../src/lib/avisos'
import { analyzePeaks, summarizePlan } from '../src/lib/contracts'
import { calcularMetricas, contarPartidas } from '../src/lib/metricas'
import { coverageThreshold } from '../src/lib/demand'
import { RECOGIDA_EXTRA_MIN, summarize } from '../src/lib/staffing'
import { calcularRueda, codigoTurno, findesDeMedia, primerLunesPublicable, publicarAntesDe, turnosEnSemana } from '../src/lib/semana'
import { coherentCoveragePct } from '../src/lib/demand'
import {
  cobrosDeLaSemana,
  conColchon,
  contextoDelCuadrante,
  curvaDeTrabajo,
  necesidadCompleta,
  necesidadDeServicio,
  preparacionDe,
  preparacionRecortada,
} from '../src/lib/necesidad'
import { KITCHEN_BLOCK_ID, rolesDeEjemplo } from '../src/data/presets'
import { coherentCoveragePct, usableWeeks } from '../src/lib/demand'
import { detectSpecialWeeks } from '../src/lib/holidays'
import { ESCALA_EJEMPLO } from '../src/data/sampleWeek'
import { CASOS_BANCO, cuadranteDelCaso } from './banco-casos'
import { DEFAULT_BLOCKS, DEFAULT_ROLES, DEFAULT_SETTINGS, DEFAULT_TIERS, DEMO_MANDOS } from '../src/data/presets'
import { SLOTS_PER_DAY, slotStartMin } from '../src/lib/time'
import type { NeedGrid, OpeningHours, Role, Roster, Settings, StaffingModel, WeekDemand } from '../src/lib/types'

const fallos: string[] = []
const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })

interface Caso {
  nombre: string
  grid: NeedGrid
  model: StaffingModel
  settings: Settings
  horario: OpeningHours
  /** Horario de cada zona, con su preparación, como en la app. Si no, `horario` para todas. */
  horarioDe?: (blockId: string) => OpeningHours
  comensalesPorDia?: number[]
  /** Tope de tiempo en ms, solo para el caso grande. */
  maxMs?: number
}

function comprobar(c: Caso) {
  const horarioDe = c.horarioDe ?? (() => c.horario)
  // Se calcula varias veces y se toma el mejor tiempo: la primera vuelta paga
  // el arranque del motor de JavaScript, y eso no es lo que nota el usuario.
  let roster: Roster | null = null
  let ms = Number.POSITIVE_INFINITY
  for (let i = 0; i < 3; i++) {
    const t = performance.now()
    roster = buildRoster(c.grid, c.model, c.settings, { horarioDe, comensalesPorDia: c.comensalesPorDia })
    ms = Math.min(ms, performance.now() - t)
  }
  const r = roster as Roster
  const tope = topeDiarioMin(c.settings)
  const contratadas = r.people.reduce((a, p) => a + p.contractHours, 0)
  const enTurnos = r.people.reduce((a, p) => a + p.assignedHours, 0)
  const largo = Math.max(0, ...r.shifts.map((s) => s.hours))
  const partidas = contarPartidas(r)

  console.log(`\n\x1b[1m${c.nombre}\x1b[0m`)
  console.log(
    `  ${r.people.length} personas · ${fmt(contratadas)} h contratadas · ${fmt(enTurnos)} h en turnos · ` +
      `turno más largo ${fmt(largo)} h · ${r.shifts.length} turnos · ${partidas} partidas · ${fmt(ms)} ms`,
  )

  const falla = (msg: string) => {
    fallos.push(`${c.nombre}: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }

  for (const sh of r.shifts) {
    const min = sh.blocks.reduce((a, b) => a + (b.endMin - b.startMin), 0)
    if (min > tope) falla(`${sh.personId} trabaja ${fmt(min / 60)} h el día ${sh.day}, el máximo es ${fmt(tope / 60)}`)
    if (sh.blocks.length === 2 && sh.blocks[1].startMin - sh.blocks[0].endMin < 60) {
      falla(`${sh.personId} tiene una partida sin hueco real el día ${sh.day}`)
    }
  }

  const porPersona = new Map<string, Set<number>>()
  for (const sh of r.shifts) {
    const dias = porPersona.get(sh.personId) ?? new Set<number>()
    if (dias.has(sh.day)) falla(`${sh.personId} tiene dos turnos el día ${sh.day}`)
    dias.add(sh.day)
    porPersona.set(sh.personId, dias)
  }
  if (r.shifts.length > r.people.length * 7) falla(`hay ${r.shifts.length} turnos para ${r.people.length} personas`)

  for (const p of r.people) {
    const role = c.model.roles.find((x) => x.id === p.roleId)
    if (!esMando(role)) continue
    console.log(`    mando ${p.label}: contrato ${fmt(p.contractHours)} h, turnos ${fmt(p.assignedHours)} h`)
    if (p.assignedHours < p.contractHours * 0.9) {
      falla(`${p.label} tiene ${fmt(p.assignedHours)} h de turnos con un contrato de ${fmt(p.contractHours)} h`)
    }
  }

  // Alguien de la zona al frente, medido aquí por separado y no fiándose de
  // lo que diga el propio cuadrante de sí mismo (ronda 3: cuando el mando
  // libra se queda el segundo de la zona; no se añaden mandos para eso). Lo
  // que quede sin nadie tiene que estar dicho en el cuadrante, no escondido.
  for (const block of c.model.blocks) {
    const roles = c.model.roles.filter((x) => x.blockId === block.id && esMando(x))
    if (!roles.some((x) => (x.headcount ?? 0) > 0)) continue
    const deLaZona = new Set(c.model.roles.filter((x) => x.blockId === block.id).map((x) => x.id))
    const turnos = r.shifts.filter((s) => deLaZona.has(s.roleId))
    const ventanas = Array.from({ length: 7 }, (_, d) => horarioDe(block.id)[d] ?? [])
    const falta = minutosSinMando(ventanas, turnos)
    const info = r.mandos?.find((m) => m.blockId === block.id)
    const dicho = info?.minutosSinNadie ?? 0
    if (falta > dicho) falla(`en ${block.name} hay ${fmt(falta / 60)} h abiertas sin nadie de la zona y el cuadrante dice ${fmt(dicho / 60)}`)
    if (falta > 0) console.log(`    ${block.name}: ${fmt(falta / 60)} h abiertas sin nadie de la zona (avisado)`)
    if (info?.roleIdAnadido) console.log(`    ${block.name}: pedidos ${info.pedidos}, hacen falta ${info.necesarios}`)
  }

  // Doce horas de descanso, dentro de la semana (domingo-lunes incluido) y
  // en cada cambio de semana de la rueda.
  if (c.settings.minRestBetweenShifts) {
    const rueda = calcularRueda(r, c.settings)
    for (let w = 0; w < rueda.semanas; w++) {
      const a = turnosEnSemana(r, rueda, w)
      const b = turnosEnSemana(r, rueda, w + 1)
      for (const p of r.people) {
        for (let d = 0; d < 7; d++) {
          const hoy = a.find((s) => s.personId === p.id && s.day === d)
          const manana = (d === 6 ? b : a).find((s) => s.personId === p.id && s.day === (d + 1) % 7)
          if (!hoy || !manana) continue
          const hueco = 1440 + Math.min(...manana.blocks.map((x) => x.startMin)) - Math.max(...hoy.blocks.map((x) => x.endMin))
          if (hueco < 12 * 60) falla(`${p.label} descansa ${fmt(hueco / 60)} h del día ${d} al ${(d + 1) % 7} (semana ${w + 1} de la rueda)`)
        }
      }
    }
  }

  // El descanso semanal en cada semana REAL de la rueda (ronda 9): medido aquí
  // por separado, con los turnos de la semana anterior, la suya y la siguiente.
  {
    const rueda = calcularRueda(r, c.settings, c.model.roles)
    const tramosDe = (turnos: typeof r.shifts, id: string, semana: number) =>
      turnos
        .filter((s) => s.personId === id && s.blocks.length > 0)
        .map((s) => [
          (semana * 7 + s.day) * 1440 + Math.min(...s.blocks.map((x) => x.startMin)),
          (semana * 7 + s.day) * 1440 + Math.max(...s.blocks.map((x) => x.endMin)),
        ])
    for (let w = 0; w < rueda.semanas; w++) {
      const antes = turnosEnSemana(r, rueda, w + rueda.semanas - 1)
      const esta = turnosEnSemana(r, rueda, w)
      const despues = turnosEnSemana(r, rueda, w + 1)
      for (const p of r.people) {
        if (!rueda.grupos.some((g) => g.personIds.includes(p.id))) continue
        const t = [...tramosDe(antes, p.id, -1), ...tramosDe(esta, p.id, 0), ...tramosDe(despues, p.id, 1)].sort((a, b) => a[0] - b[0])
        let max = 0
        for (let i = 1; i < t.length; i++) if (t[i][0] > 0 && t[i - 1][1] < 7 * 1440) max = Math.max(max, t[i][0] - t[i - 1][1])
        const pide = descansoSemanalPedidoMin(c.model.roles.find((x) => x.id === p.roleId))
        if (t.length > 0 && max < pide) falla(`${p.label} descansa como mucho ${fmt(max / 60)} h seguidas en la semana ${w + 1} de la rueda (pide ${fmt(pide / 60)})`)
      }
    }
  }

  for (const p of r.people) {
    const role = c.model.roles.find((x) => x.id === p.roleId)
    if (esMando(role)) continue
    const dias = porPersona.get(p.id)?.size ?? 0
    if (dias === 1) falla(`${p.label} viene un solo día a la semana (${fmt(p.assignedHours)} h)`)
    if (c.settings.consecutiveDaysOff && p.daysOff.length >= 2) {
      const libra = new Array(7).fill(false)
      for (const d of p.daysOff) libra[d] = true
      if (!libra.some((v, d) => v && libra[(d + 1) % 7])) falla(`${p.label} no tiene dos libranzas seguidas`)
    }
  }

  if (c.maxMs !== undefined && ms > c.maxMs) falla(`tarda ${fmt(ms)} ms, el tope es ${c.maxMs}`)
  return r
}

function conMandos(roles: Role[], cuantos: Record<string, number>): Role[] {
  return roles.map((r) => (cuantos[r.id] !== undefined ? { ...r, headcount: cuantos[r.id] } : r))
}

async function main() {
  const d = await analyzeFile(null, undefined, 0)
  const settings = DEFAULT_SETTINGS
  const lagged = clampToHours(
    applyLag(typicalWeek(d.weeks, settings.coveragePct, settings.sizingMode), settings.lagMinutes),
    d.source.detectedHours,
  )
  const comensales = lagged.map((day) => day.reduce((a, b) => a + b, 0))
  const base: StaffingModel = { blocks: DEFAULT_BLOCKS, roles: DEFAULT_ROLES, tiers: DEFAULT_TIERS }
  const horario = d.source.detectedHours

  comprobar({
    nombre: 'Datos de ejemplo',
    grid: buildNeedGrid(lagged, base),
    model: base,
    settings,
    horario,
    comensalesPorDia: comensales,
  })

  const conEncargado: StaffingModel = {
    ...base,
    roles: conMandos(base.roles, { encargado: 1, 'resp-turno': 1, 'jefe-cocina': 1 }),
  }
  comprobar({
    nombre: 'Ejemplo con encargado, responsable de turno y jefe de cocina',
    grid: buildNeedGrid(lagged, conEncargado),
    model: conEncargado,
    settings,
    horario,
    comensalesPorDia: comensales,
  })

  const soloEncargado: StaffingModel = { ...base, roles: conMandos(base.roles, { encargado: 1 }) }
  comprobar({
    nombre: 'Ejemplo con un solo encargado (hay que añadir quien le cubra)',
    grid: buildNeedGrid(lagged, soloEncargado),
    model: soloEncargado,
    settings,
    horario,
    comensalesPorDia: comensales,
  })

  const seguido: OpeningHours = Array.from({ length: 7 }, () => [{ startMin: 9 * 60, endMin: 24 * 60 }])
  const ocho = Array.from({ length: 7 }, () =>
    Array.from({ length: SLOTS_PER_DAY }, (_, s) => (slotStartMin(s) >= 540 && slotStartMin(s) < 1440 ? 8 : 0)),
  )
  comprobar({
    nombre: 'Abierto de 9 a 24 seguido, 8 comensales siempre, con encargado',
    grid: buildNeedGrid(ocho, conEncargado),
    model: conEncargado,
    settings,
    horario: seguido,
  })

  const s4: Settings = { ...settings, prepBeforeMin: 60, minStaffByBlock: { sala: 1, cocina: 1 } }
  const conPrep = expandHours(horario, 60, 0)
  comprobar({
    nombre: 'Mínimo de 1 en sala y cocina, con 60 min de preparación',
    grid: applyOpeningMinimums(buildNeedGrid(lagged, base), base, s4.minStaffByBlock, () => conPrep),
    model: base,
    settings: s4,
    horario: conPrep,
    comensalesPorDia: comensales,
  })

  const grande: StaffingModel = { blocks: [DEFAULT_BLOCKS[0]], roles: [DEFAULT_ROLES[3]], tiers: [] }
  comprobar({
    nombre: 'Un puesto grande (unas 70 personas)',
    // La curva del ejemplo se bajó de tamaño en la ronda 4 (`ESCALA_EJEMPLO`):
    // se deshace aquí para que el puesto siga siendo de unas 70 personas.
    grid: { [DEFAULT_ROLES[3].id]: lagged.map((day) => day.map((v) => Math.ceil(v / (2.2 * ESCALA_EJEMPLO)))) },
    model: grande,
    settings,
    horario,
    comensalesPorDia: comensales,
    maxMs: 300,
  })

  // ── Segunda ronda ──────────────────────────────────────────
  // El mismo camino que `npm run verificar`: necesidad de servicio más
  // preparación y recogida por zona.
  const d1 = await analyzeFile(null, undefined, 1000)
  const sv: Settings = { ...DEFAULT_SETTINGS, coveragePct: coherentCoveragePct(d1.weeks, DEFAULT_SETTINGS.coveragePct) }
  const tipica = typicalWeek(d1.weeks, sv.coveragePct, sv.sizingMode)
  const conCol = conColchon(curvaDeTrabajo(tipica, d1.source.detectedHours, sv), sv)
  const gridV = necesidadCompleta(
    necesidadDeServicio(conCol, base, null, KITCHEN_BLOCK_ID),
    conCol,
    base,
    d1.source.detectedHours,
    null,
    KITCHEN_BLOCK_ID,
    sv,
  )
  const rv = comprobar({
    nombre: 'El caso de npm run verificar (preparación por zona)',
    grid: gridV,
    model: base,
    settings: sv,
    horario: d1.source.detectedHours,
  })
  const enTurnosV = rv.shifts.reduce((a, s) => a + s.hours, 0)
  const falla2 = (msg: string) => {
    fallos.push(`Segunda ronda: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }
  // Antes de la ronda 2: 26 personas y 727,5 h en turnos; la ronda 2 dejó 22 y
  // 666,5. La ronda 3 de pantallas recalibró los tramos de partida a 20-25
  // sentados por camarero y 30-40 por cocinero, y con la misma curva salían
  // 40 personas y 1.292 h: un local de 366 sentados a la vez. La ronda 4 bajó
  // la curva del ejemplo al tamaño del cliente típico (`ESCALA_EJEMPLO` en
  // `data/sampleWeek.ts`), y sin mandos salen 21 personas y 577,5 h en turnos
  // para 488,5 h de necesidad: es la nueva base. Puede bajar, no subir.
  if (rv.people.length > 21) falla2(`salen ${rv.people.length} personas, la base de la ronda 4 es 21`)
  if (enTurnosV > 578) falla2(`salen ${fmt(enTurnosV)} h en turnos, la base de la ronda 4 es 577,5`)
  // Holgura: las horas en turnos sobre las que pide el servicio. Todo lo que
  // queda sale de que nadie viene menos de 4 h seguidas (con un turno mínimo
  // de media hora sale cero), y la pantalla lo dice en una frase. Antes de la
  // ronda 4 era un 33 % con la curva grande.
  const necV = summarize(gridV, base).totalHours
  const holguraV = (enTurnosV - necV) / necV
  console.log(`  holgura ${fmt(Math.round(holguraV * 1000) / 10)} % (${fmt(enTurnosV)} h en turnos para ${fmt(necV)} h de necesidad)`)
  if (holguraV > 0.19) falla2(`la holgura es del ${fmt(Math.round(holguraV * 100))} %, la base de la ronda 4 es el 18 %`)

  // Ronda 4: el ejemplo tal y como lo abre la app, con su encargado y su jefe
  // de cocina. Es el restaurante típico, de 20 a 25 personas, y el mando hace
  // el trabajo del segundo de su zona mientras está: el encargado y el
  // responsable de sala no están los dos a la vez llevando la misma sala.
  const conDemo: StaffingModel = { ...base, roles: conMandos(base.roles, DEMO_MANDOS) }
  // Con el mismo contexto que la app (ronda 5): sin él, esto no era "como lo
  // abre la app" y daba otras cifras.
  const ctxDemo = contextoDelCuadrante(
    d1.source.detectedHours,
    null,
    KITCHEN_BLOCK_ID,
    sv,
    cobrosDeLaSemana(tipica, curvaDeTrabajo(tipica, d1.source.detectedHours, sv), d1.source.detectedHours, sv),
  )
  const casoDemo: Caso = {
    nombre: 'El ejemplo con encargado y jefe de cocina, como lo abre la app',
    grid: gridV,
    model: conDemo,
    settings: sv,
    horario: d1.source.detectedHours,
    horarioDe: ctxDemo.horarioDe,
    comensalesPorDia: ctxDemo.comensalesPorDia,
  }
  const rd = comprobar(casoDemo)
  // Ronda 5: de 21 a 19, porque los dos responsables de sala de 10 h que solo
  // venían cuando libraba el encargado ya no son un puesto (queda al frente
  // un camarero). El techo sigue en 25.
  if (rd.people.length < 17 || rd.people.length > 23) falla2(`el ejemplo sale con ${rd.people.length} personas, tiene que estar entre 17 y 23`)
  const enTurnosD = rd.shifts.reduce((a, x) => a + x.hours, 0)
  const holguraD = (enTurnosD - necV) / necV
  console.log(`  holgura ${fmt(Math.round(holguraD * 1000) / 10)} %`)
  if (holguraD > 0.18) falla2(`la holgura del ejemplo es del ${fmt(Math.round(holguraD * 100))} %, la base de la ronda 4 es el 16 %`)
  let doble = 0
  for (const sh of rd.shifts.filter((x) => x.roleId === 'encargado')) {
    for (const b of sh.blocks) {
      for (let m = b.startMin; m < b.endMin; m += 30) {
        const sl = (m - slotStartMin(0)) / 30
        const necesita = gridV.responsable?.[sh.day]?.[sl] ?? 0
        const hay = rd.shifts.filter(
          (x) => x.roleId === 'responsable' && x.day === sh.day && x.blocks.some((y) => m >= y.startMin && m < y.endMin),
        ).length
        if (hay > 0 && hay >= necesita) doble += 0.5
      }
    }
  }
  if (doble > 2) falla2(`el encargado y un responsable de sala llevan la sala a la vez ${fmt(doble)} h a la semana`)
  const cortos = rv.people.filter((p) => p.contractHours < 20)
  for (const p of cortos) {
    const dias = rv.shifts.filter((s) => s.personId === p.id).map((s) => s.day)
    if (!(dias.includes(5) && dias.includes(6))) falla2(`${p.label} tiene un contrato de ${p.contractHours} h que no es de fin de semana`)
  }

  const rueda = calcularRueda(rv, sv)
  const findes = findesDeMedia(rv, rueda)
  console.log(`  rueda de ${rueda.semanas} semanas, rotan ${rueda.grupos.reduce((a, g) => a + g.personIds.length, 0)} personas`)
  if (rueda.semanas < 2) falla2('no sale ninguna rueda')
  for (const g of rueda.grupos) {
    const v = g.personIds.map((id) => findes.get(id) ?? 0)
    if (Math.max(...v) - Math.min(...v) > 1e-9) falla2(`en la rueda de ${g.roleId} los findes no salen iguales`)
    // Cada persona hace todas las filas del grupo una vez en la vuelta.
    const filas = new Set<string>()
    for (let w = 0; w < g.personIds.length; w++) {
      const turnos = turnosEnSemana(rv, rueda, w).filter((s) => s.personId === g.personIds[0])
      filas.add(turnos.map((s) => `${s.day}:${s.blocks.map((b) => b.startMin).join('-')}`).join('|'))
    }
    if (filas.size < Math.min(2, g.personIds.length)) falla2(`en la rueda de ${g.roleId} ${g.personIds[0]} repite siempre la misma semana`)
  }

  // Códigos y fechas.
  const cod = (blocks: [number, number][]) =>
    codigoTurno({ id: 'x', personId: 'x', roleId: 'x', day: 0, hours: 0, blocks: blocks.map(([a, b]) => ({ startMin: a, endMin: b })) })
  if (cod([]) !== 'L' || cod([[600, 960]]) !== 'M' || cod([[1080, 1500]]) !== 'N' || cod([[720, 960], [1200, 1440]]) !== 'P') {
    falla2('los códigos M/T/N/P/L no salen bien')
  }
  // Ronda 3, G11: 13:00 a 17:30 no es de mañana; 8:00 a 14:30 sí; 14:00 a
  // 20:30 es de tarde; 16:30 a 00:30 es de noche.
  if (cod([[780, 1050]]) !== 'T') falla2('13:00 a 17:30 sale de mañana: es mediodía y tarde')
  if (cod([[480, 870]]) !== 'M') falla2('8:00 a 14:30 no sale de mañana')
  if (cod([[840, 1230]]) !== 'T') falla2('14:00 a 20:30 no sale de tarde')
  if (cod([[990, 1470]]) !== 'N') falla2('16:30 a 00:30 no sale de noche')
  const miercoles = new Date(2026, 10, 4)
  const lunes = primerLunesPublicable(miercoles)
  if (lunes.getDate() !== 9 || lunes.getMonth() !== 10) falla2(`desde el miércoles 4-11 la primera semana publicable sale el ${lunes.toDateString()}, debía ser el lunes 9`)
  if (publicarAntesDe(lunes).getDate() !== 4) falla2('el plazo de publicación del lunes 9 debía ser el miércoles 4')
  const jueves = primerLunesPublicable(new Date(2026, 10, 5))
  if (jueves.getDate() !== 16) falla2('desde el jueves 5-11 la semana del 9 ya no llega con cinco días: debía salir la del 16')

  // Menores y noche.
  const conMenores: StaffingModel = { ...base, roles: base.roles.map((x) => (x.id === 'ayudante' ? { ...x, menores: true } : x)) }
  const avisosMenores = revisarCuadrante(rv, conMenores, sv).filter((a) => a.tipo === 'menores' && a.gravedad === 'legal')
  const ayudantesDeNoche = rv.shifts.some((s) => s.roleId === 'ayudante' && s.blocks.some((b) => b.endMin > 22 * 60))
  if (ayudantesDeNoche && avisosMenores.length === 0) falla2('hay ayudantes pasadas las 22:00 y el aviso de menores no salta')
  if (revisarCuadrante(rv, base, sv).some((a) => a.tipo === 'menores')) falla2('sin puestos de menores sale un aviso de menores')
  const noche: Roster = {
    ...rv,
    shifts: [0, 1, 2, 3, 4].map((day) => ({ id: `n${day}`, personId: rv.people[0].id, roleId: rv.people[0].roleId, day: day as 0, hours: 9, blocks: [{ startMin: 20 * 60, endMin: 29 * 60 }] })),
  }
  const nocturno = revisarCuadrante(noche, base, sv).filter((a) => a.tipo === 'nocturno')
  if (!nocturno.some((a) => a.gravedad === 'legal')) falla2('9 h de 20:00 a 05:00 cinco días y no salta el máximo de 8 h de los nocturnos')
  if (!nocturno.some((a) => a.gravedad === 'aviso')) falla2('cinco noches y no avisa de que es trabajador nocturno')
  console.log(`  menores: ${avisosMenores.length} avisos legales · nocturno: ${nocturno.length} avisos`)

  tercerRonda(base)
  quintaRonda(base, casoDemo, rd)
  await sextaRonda()
  await septimaRonda()
  await octavaRonda()

  if (fallos.length > 0) {
    console.log(`\n\x1b[31m${fallos.length} comprobaciones fallan.\x1b[0m`)
    process.exit(1)
  }
  console.log('\n\x1b[32mTodo en regla.\x1b[0m')
}

// ── Tercera ronda ────────────────────────────────────────────

/** Una semana de comensales por franja: [desde, hasta, comensales por franja] por día. */
function curvaSintetica(porDia: (d: number) => [number, number, number][]): number[][] {
  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: SLOTS_PER_DAY }, (_, s) => {
      const m = slotStartMin(s)
      let v = 0
      for (const [a, b, n] of porDia(d)) if (m >= a * 60 && m < b * 60) v += n
      return v
    }),
  )
}

function horarioDeCurva(porDia: (d: number) => [number, number, number][]): OpeningHours {
  return Array.from({ length: 7 }, (_, d) => porDia(d).map(([a, b]) => ({ startMin: a * 60, endMin: b * 60 })))
}

/** El mismo camino que la app: curva, colchón, servicio, preparación por zona, y el horario de cada zona. */
function casoComoLaApp(
  nombre: string,
  porDia: (d: number) => [number, number, number][],
  model: StaffingModel,
  settings: Settings,
): Caso {
  const typ = curvaSintetica(porDia)
  const horario = horarioDeCurva(porDia)
  const st = conColchon(curvaDeTrabajo(typ, horario, settings), settings)
  const grid = necesidadCompleta(necesidadDeServicio(st, model, null, KITCHEN_BLOCK_ID), st, model, horario, null, KITCHEN_BLOCK_ID, settings)
  const horarioDe = (b: string) => {
    const p = settings.prepByBlock?.[b]
    return expandHours(horario, p?.beforeMin ?? 0, p?.afterMin ?? 0)
  }
  return { nombre, grid, model, settings, horario, horarioDe, comensalesPorDia: typ.map((d) => d.reduce((a, b) => a + b, 0)) }
}

function tercerRonda(base: StaffingModel) {
  console.log('\n\x1b[1mTercera ronda\x1b[0m')
  const falla3 = (msg: string) => {
    fallos.push(`Tercera ronda: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }
  const fuerte = (d: number) => d >= 4
  const comidasYCenas = (k: number) => (d: number): [number, number, number][] => [
    [13, 16.5, (fuerte(d) ? 15 : 9) * k],
    [20.5, 24, (fuerte(d) ? 13 : 6) * k],
  ]
  const cuantos = (r: Roster, roleId: string) => r.people.filter((p) => p.roleId === roleId).length

  // G1 y G5. Mediano con encargado 1 y jefe de cocina 1: antes salían 3 jefes
  // de cocina y un responsable de turno de más, 17 personas.
  const conMandos2: StaffingModel = { ...base, roles: conMandos(base.roles, { encargado: 1, 'jefe-cocina': 1 }) }
  const mediano = casoComoLaApp('Mediano con encargado y jefe de cocina', comidasYCenas(1), conMandos2, DEFAULT_SETTINGS)
  const rm = comprobar(mediano)
  if (cuantos(rm, 'jefe-cocina') !== 1) falla3(`salen ${cuantos(rm, 'jefe-cocina')} jefes de cocina con uno pedido`)
  if (cuantos(rm, 'encargado') !== 1 || cuantos(rm, 'resp-turno') !== 0) falla3('se añaden mandos de sala con uno pedido')
  if (rm.people.length > 15) falla3(`salen ${rm.people.length} personas, antes de la ronda 3 eran 17 y quedaron 14`)
  // Ningún mando en el local con su zona cerrada: hace partida.
  for (const sh of rm.shifts) {
    const role = conMandos2.roles.find((x) => x.id === sh.roleId)
    if (!esMando(role) || !role) continue
    const v = mediano.horarioDe?.(role.blockId)[sh.day] ?? []
    for (const b of sh.blocks) {
      let fuera = 0
      for (let m = b.startMin; m < b.endMin; m += 30) if (!v.some((x) => m >= x.startMin && m < x.endMin)) fuera += 30
      if (fuera > 30) falla3(`${sh.personId} está ${fmt(fuera / 60)} h en el local el día ${sh.day} con su zona cerrada`)
    }
  }
  // Las libranzas del mando, en días flojos.
  for (const p of rm.people.filter((x) => esMando(conMandos2.roles.find((r) => r.id === x.roleId)))) {
    if (p.daysOff.some((d) => fuerte(d))) falla3(`${p.label} libra un día fuerte (${p.daysOff.join(', ')})`)
  }
  const avisosM = revisarCuadrante(rm, conMandos2, DEFAULT_SETTINGS)
  if (!avisosM.some((a) => a.tipo === 'mando-relevo')) falla3('cuando el mando libra no se dice quién se queda al frente')

  // Continuo de 8 a 2: antes 5 jefes de cocina y 4 responsables de turno, 39 personas.
  const continuo = (d: number): [number, number, number][] => {
    const k = fuerte(d) ? 1.4 : 1
    return [
      [8, 12, 2 * k],
      [12, 17, 7 * k],
      [17, 20, 3 * k],
      [20, 26, 6 * k],
    ]
  }
  const rc = comprobar(casoComoLaApp('Continuo de 8 a 2 con encargado y jefe de cocina', continuo, conMandos2, DEFAULT_SETTINGS))
  if (cuantos(rc, 'jefe-cocina') > 1 || cuantos(rc, 'resp-turno') > 0) {
    falla3(`continuo de 8 a 2: salen ${cuantos(rc, 'jefe-cocina')} jefes de cocina y ${cuantos(rc, 'resp-turno')} responsables de turno`)
  }

  // G2. Pequeño: el responsable de jornada completa está viernes y sábado.
  const pequeno = (d: number): [number, number, number][] => [
    [13, 16.5, fuerte(d) ? 6 : 3.5],
    [20.5, 24, fuerte(d) ? 5 : 2],
  ]
  const casoP = casoComoLaApp('Pequeño de comidas y cenas', pequeno, base, DEFAULT_SETTINGS)
  const rp = comprobar(casoP)
  const resp = rp.people.filter((p) => p.roleId === 'responsable').sort((a, b) => b.contractHours - a.contractHours)[0]
  if (resp && (resp.daysOff.includes(4) || resp.daysOff.includes(5))) {
    falla3(`${resp.label} (${resp.contractHours} h) libra ${resp.daysOff.join(', ')}: debía estar viernes y sábado`)
  }

  // G3 y G7. Solo comidas: nadie entra antes de que abra su zona, y el office
  // se queda hasta después de la recogida de cocina.
  const comidas = (d: number): [number, number, number][] => (d < 5 ? [[13, 16.5, 12]] : [])
  const casoC = casoComoLaApp('Solo comidas de lunes a viernes', comidas, base, DEFAULT_SETTINGS)
  const rco = comprobar(casoC)
  for (const caso of [casoP, casoC]) {
    const r = caso === casoP ? rp : rco
    for (const sh of r.shifts) {
      const role = base.roles.find((x) => x.id === sh.roleId)
      if (!role || esMando(role)) continue
      const v = caso.horarioDe?.(role.blockId)[sh.day] ?? []
      if (v.length === 0) continue
      const abre = v[0].startMin
      if (sh.blocks[0].startMin < abre) falla3(`${caso.nombre}: ${sh.personId} entra a las ${fmt(sh.blocks[0].startMin / 60)} y su zona abre a las ${fmt(abre / 60)}`)
    }
    for (let d = 0; d < 7; d++) {
      const v = caso.horarioDe?.(KITCHEN_BLOCK_ID)[d] ?? []
      if (v.length === 0) continue
      const cierra = v[v.length - 1].endMin
      const office = r.shifts.filter((s) => s.day === d && base.roles.find((x) => x.id === s.roleId)?.cierraServicio)
      if (office.length === 0) continue
      const sale = Math.max(...office.flatMap((s) => s.blocks.map((b) => b.endMin)))
      if (sale < cierra) falla3(`${caso.nombre}: el día ${d} el office se va a las ${fmt(sale / 60)} y cocina recoge hasta las ${fmt(cierra / 60)}`)
    }
  }

  // G6. Descanso semanal de 36 h, y avisos si se apagan las 12 h o se sube el tope.
  const sinSeguidas: Settings = { ...DEFAULT_SETTINGS, consecutiveDaysOff: false }
  const casoS = casoComoLaApp('Mediano sin libranzas seguidas', comidasYCenas(1), base, sinSeguidas)
  const rs = comprobar(casoS)
  const avS = revisarCuadrante(rs, base, sinSeguidas)
  for (const p of rs.people) {
    const mayor = descansoSemanalMasLargoMin(rs.shifts, p.id)
    const avisado = avS.some((a) => a.tipo === 'descanso-semanal' && a.personId === p.id)
    if (mayor !== null && mayor < 36 * 60 && !avisado) falla3(`${p.label} descansa ${fmt(mayor / 60)} h seguidas a la semana y no hay aviso`)
    if (avisado && (mayor === null || mayor >= 36 * 60)) falla3(`${p.label} tiene aviso de descanso semanal sin motivo`)
  }
  const sin12: Settings = { ...DEFAULT_SETTINGS, minRestBetweenShifts: false }
  const r12 = buildRoster(casoS.grid, base, sin12, { horarioDe: casoS.horarioDe, comensalesPorDia: casoS.comensalesPorDia })
  if (!revisarCuadrante(r12, base, sin12).some((a) => a.tipo === 'ajustes-legales' && /12 h/.test(a.mensaje))) {
    falla3('con las 12 h apagadas no se avisa de que la ley las pide')
  }
  const tope10: Settings = { ...DEFAULT_SETTINGS, maxDailyMinutes: 600 }
  const r10 = buildRoster(casoS.grid, base, tope10, { horarioDe: casoS.horarioDe, comensalesPorDia: casoS.comensalesPorDia })
  if (!revisarCuadrante(r10, base, tope10).some((a) => a.tipo === 'ajustes-legales' && /10 h/.test(a.mensaje))) {
    falla3('con el tope a 10 h no se avisa de que la ley pone 9')
  }

  // G9. El desglose de la plantilla suma exacto.
  for (const [caso, r] of [[mediano, rm], [casoP, rp], [casoC, rco]] as [Caso, Roster][]) {
    const plan = summarizePlan(r, caso.settings, summarize(caso.grid, caso.model), caso.grid, caso.model)
    const d = plan.drivers.desglose
    const suma = d ? d.pico + d.calendario + d.contratosYHorarios + d.mandos : -1
    if (suma !== plan.totalPeople) falla3(`${caso.nombre}: el desglose suma ${suma} y son ${plan.totalPeople}`)
    // G12. Una sola cifra de horas de más.
    const metricas = calcularMetricas(r, caso.grid, caso.model, curvaSintetica(() => []))
    if (Math.abs((plan.slackDesglose?.enElLocal ?? -1) - metricas.horasSobrantesTotal) > 1e-6) {
      falla3(`${caso.nombre}: las horas de más del local no cuadran con las de las métricas`)
    }
    if (Math.abs(plan.slackHours - (plan.slackDesglose?.enElLocal ?? 0) - (plan.slackDesglose?.sinTurno ?? 0)) > 1e-6) {
      falla3(`${caso.nombre}: las horas pagadas sin servicio no son la suma de sus dos partes`)
    }
  }

  // G10. Un sábado x10 no hace el titular de picos.
  const semanas: WeekDemand[] = Array.from({ length: 52 }, (_, i) => {
    const k = 1 + 0.15 * Math.sin(i / 4)
    const days = curvaSintetica(comidasYCenas(k))
    return { isoWeek: i + 1, year: 2025, startDate: '2025-01-01', days, total: days.flat().reduce((a, b) => a + b, 0) }
  })
  semanas[10].days[5] = semanas[10].days[5].map((v) => v * 10)
  semanas[10].total = semanas[10].days.flat().reduce((a, b) => a + b, 0)
  const tipica = typicalWeek(semanas, DEFAULT_SETTINGS.coveragePct, DEFAULT_SETTINGS.sizingMode)
  const horario = horarioDeCurva(comidasYCenas(1))
  const servicio = (days: number[][]) =>
    necesidadDeServicio(conColchon(curvaDeTrabajo(days, horario, DEFAULT_SETTINGS), DEFAULT_SETTINGS), base, null, KITCHEN_BLOCK_ID)
  const sumT = summarize(servicio(tipica), base)
  const umbral = coverageThreshold(semanas, DEFAULT_SETTINGS.coveragePct).threshold
  const picos = analyzePeaks(semanas, umbral, sumT.totalHours, tipica.flat().reduce((a, b) => a + b, 0), 40, {
    personasPico: (days) => summarize(servicio(days), base).peak.people,
    picoTipico: sumT.peak.people,
  })
  if (!picos.diasRaros?.some((x) => x.isoWeek === 11 && x.day === 5)) falla3('el sábado x10 de la semana 11 no sale como día raro')
  if ((picos.worstWeek?.extraPeople ?? 0) > 3) falla3(`un sábado x10 da un titular de "faltan ${picos.worstWeek?.extraPeople} personas"`)
  console.log(`  picos con un sábado x10: peor semana ${picos.worstWeek?.isoWeek ?? '-'}, faltan ${picos.worstWeek?.extraPeople ?? 0}`)
}

// ── Quinta ronda ─────────────────────────────────────────────

/**
 * Ronda 5 (cambios-motor-r5-2026-11-04.md). Falla si vuelve alguno de estos:
 * los dos mandos libran el mismo día y la casa se queda sin ninguno; el mando
 * no está al cierre de los días fuertes; salen responsables de 10 h que solo
 * vienen cuando libra el mando; el aviso no dice quién queda al frente; el
 * cuadrante hace a un nocturno más de 8 h; una preparación antes de las 06:00
 * se pierde sin aviso; y en un local abierto de 8 a 2 la gente rota de
 * mañana, tarde y noche en la misma semana.
 */
function quintaRonda(base: StaffingModel, casoDemo: Caso, rd: Roster) {
  console.log('\n\x1b[1mQuinta ronda\x1b[0m')
  const falla5 = (msg: string) => {
    fallos.push(`Quinta ronda: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }
  const esDeMando = (r: Roster, model: StaffingModel, personId: string) =>
    esMando(model.roles.find((x) => x.id === r.people.find((p) => p.id === personId)?.roleId))

  // M1. Ningún día abierto sin un mando en la casa.
  const casa = (nombre: string, r: Roster, model: StaffingModel) => {
    for (let d = 0; d < 7; d++) {
      const abierto = r.shifts.some((sh) => sh.day === d)
      const hayMando = r.shifts.some((sh) => sh.day === d && esDeMando(r, model, sh.personId))
      if (abierto && !hayMando) falla5(`${nombre}: el día ${d} no trabaja ningún mando en todo el local`)
    }
  }
  casa('el ejemplo', rd, casoDemo.model)
  const dias = (roleId: string) => rd.people.find((p) => p.roleId === roleId)?.daysOff ?? []
  console.log(`  libran: encargado ${dias('encargado').join(', ')} · jefe de cocina ${dias('jefe-cocina').join(', ')}`)

  // M8. El mando cierra los días fuertes: en los tres días de más comensales,
  // el mando de cada zona está en la última hora de la zona en al menos dos.
  const fuerza = casoDemo.comensalesPorDia ?? []
  const fuertes = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => fuerza[b] - fuerza[a]).slice(0, 3)
  for (const b of casoDemo.model.blocks) {
    const v = casoDemo.horarioDe?.(b.id) ?? casoDemo.horario
    const mandos = rd.shifts.filter((sh) => esMando(casoDemo.model.roles.find((x) => x.id === sh.roleId)) && casoDemo.model.roles.find((x) => x.id === sh.roleId)?.blockId === b.id)
    if (mandos.length === 0) continue
    let cierra = 0
    for (const d of fuertes) {
      const fin = Math.max(...(v[d] ?? []).map((x) => x.endMin))
      if (mandos.some((sh) => sh.day === d && sh.blocks.some((x) => x.startMin < fin && x.endMin >= fin - 30))) cierra++
    }
    console.log(`  ${b.name}: el mando cierra ${cierra} de los 3 días fuertes`)
    if (cierra < 2) falla5(`en ${b.name} el mando cierra solo ${cierra} de los 3 días más fuertes`)
  }

  // Responsables de 10 h que solo vienen cuando libra el mando.
  for (const p of rd.people) {
    const role = casoDemo.model.roles.find((x) => x.id === p.roleId)
    if (!role || esMando(role) || p.contractHours > 12) continue
    if (role.id === 'responsable') falla5(`${p.label} es un responsable de ${p.contractHours} h: el relevo del mando lo hace el equipo`)
  }
  const avisosD = revisarCuadrante(rd, casoDemo.model, casoDemo.settings)
  const relevo = avisosD.filter((a) => a.tipo === 'mando-relevo')
  if (relevo.length === 0 || relevo.some((a) => !rd.people.some((p) => a.mensaje.includes(`al frente ${p.label}`)))) {
    falla5('el aviso de relevo del mando no dice quién queda al frente')
  }

  // M2. Ningún nocturno pasa de 8 h: el cuadrante no hace lo que su revisión marca ilegal.
  const H = (h: number) => h
  const copas = casoComoLaApp('Bar de copas de 20 a 4', (d) => [[H(20), H(23), d >= 4 ? 10 : 5], [H(23), H(28), d >= 4 ? 16 : 7]], base, DEFAULT_SETTINGS)
  const rCopas = comprobar(copas)
  const continuo = casoComoLaApp(
    'Continuo de 8 a 2, siete días',
    (d) => {
      const k = d >= 4 ? 1.4 : 1
      return [[8, 12, 3 * k], [12, 17, 9 * k], [17, 20, 3 * k], [20, 26, 8 * k]]
    },
    base,
    DEFAULT_SETTINGS,
  )
  const rCont = comprobar(continuo)
  for (const [nombre, r] of [['bar de copas', rCopas], ['continuo de 8 a 2', rCont], ['el ejemplo', rd]] as [string, Roster][]) {
    for (const sh of r.shifts) {
      const largo = sh.blocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
      if (minutosDeNocheBloques(sh.blocks) >= 180 && largo > 480) {
        falla5(`${nombre}: ${sh.personId} hace ${fmt(largo / 60)} h el día ${sh.day} con 3 h o más de noche (máximo 8 h, art. 36.1 ET)`)
      }
    }
    const ilegal = revisarCuadrante(r, base, DEFAULT_SETTINGS).filter((a) => a.tipo === 'nocturno' && a.gravedad === 'legal')
    if (ilegal.length > 0) falla5(`${nombre}: la revisión marca ${ilegal.length} nocturnos por encima de 8 h`)
  }

  // M7. Turnos estables: nadie entra de mañana, de tarde y de noche en la misma semana.
  let rotan = 0
  for (const p of rCont.people) {
    const franjas = new Set(rCont.shifts.filter((s) => s.personId === p.id).map((s) => Math.floor(s.blocks[0].startMin / 240)))
    if (franjas.size >= 3) rotan++
  }
  console.log(`  continuo de 8 a 2: ${rotan} de ${rCont.people.length} personas entran en tres franjas distintas`)
  if (rotan > 1) falla5(`en el continuo de 8 a 2 hay ${rotan} personas que entran de mañana, tarde y noche en la misma semana`)

  // M5. La preparación de un local que abre a las 06:00 no se pierde en silencio.
  const madrugador: Settings = { ...DEFAULT_SETTINGS, prepByBlock: { [KITCHEN_BLOCK_ID]: { beforeMin: 60, afterMin: 30 } } }
  const abreSeis = horarioDeCurva(() => [[6, 15, 4]])
  const recortes = preparacionRecortada(abreSeis, null, KITCHEN_BLOCK_ID, madrugador, base)
  const casoSeis = casoComoLaApp('Bar que abre a las 06:00, con una hora de preparación en cocina', () => [[6, 15, 4]], base, madrugador)
  const rSeis = comprobar(casoSeis)
  const avisoPrep = revisarCuadrante(rSeis, base, madrugador, { preparacionRecortada: recortes }).filter((a) => a.tipo === 'preparacion')
  if (recortes.length !== 1 || recortes[0].antesMin !== 60) falla5(`a las 06:00 con 60 min de preparación se pierden ${recortes[0]?.antesMin ?? 0} min, tienen que ser 60`)
  if (avisoPrep.length === 0) falla5('la preparación antes de las 06:00 se pierde y no hay aviso')
  if (preparacionRecortada(horarioDeCurva(() => [[8, 15, 4]]), null, KITCHEN_BLOCK_ID, madrugador, base).length > 0) {
    falla5('un local que abre a las 08:00 sale con preparación recortada')
  }
}

// ── Sexta ronda ──────────────────────────────────────────────

/** El camino de la app desde un año de semanas: semanas útiles, semana tipo, necesidad y cuadrante. */
function cuadranteDe(weeks: WeekDemand[], hours: OpeningHours, roles: Role[], extra: Partial<Settings> = {}) {
  const specials = detectSpecialWeeks(weeks, 2025)
  const utiles = usableWeeks({ weeks, year: 2025, specials: [], source: { fileName: '', rowsDetected: 0, dateRange: '', columnsDetected: [], detectedHours: hours } }, specials)
  let settings: Settings = { ...DEFAULT_SETTINGS, ...extra }
  settings = { ...settings, coveragePct: coherentCoveragePct(utiles, settings.coveragePct) }
  const model: StaffingModel = { blocks: DEFAULT_BLOCKS, roles, tiers: DEFAULT_TIERS }
  const typ = typicalWeek(utiles, settings.coveragePct, settings.sizingMode)
  const curva = curvaDeTrabajo(typ, hours, settings)
  const st = conColchon(curva, settings)
  const dg = necesidadDeServicio(st, model, null, KITCHEN_BLOCK_ID)
  const grid = necesidadCompleta(dg, st, model, hours, null, KITCHEN_BLOCK_ID, settings)
  const ctx = contextoDelCuadrante(hours, null, KITCHEN_BLOCK_ID, settings, cobrosDeLaSemana(typ, curva, hours, settings))
  const roster = buildRoster(grid, model, settings, ctx)
  const plan = summarizePlan(roster, settings, summarize(grid, model), grid, model)
  const avisos = revisarCuadrante(roster, model, settings, { preparacionRecortada: preparacionRecortada(hours, null, KITCHEN_BLOCK_ID, settings, model) })
  return { roster, model, settings, plan, avisos, fuerza: ctx.comensalesPorDia ?? [] }
}

/** Un año de 52 semanas con el mismo patrón: f(día, franja, semana) → comensales. */
function anoDe(f: (d: number, s: number, w: number) => number): WeekDemand[] {
  return Array.from({ length: 52 }, (_, i) => {
    const days = Array.from({ length: 7 }, (_, d) => Array.from({ length: SLOTS_PER_DAY }, (_, s) => Math.max(0, Math.round(f(d, s, i + 1)))))
    return { isoWeek: i + 1, year: 2025, startDate: '', days, total: days.flat().reduce((a, b) => a + b, 0) }
  })
}
/** Campana de comensales entre dos horas (en horas, 24+ para la madrugada). */
function campana(s: number, desde: number, hasta: number, pico: number): number {
  const a = (desde * 60 - 360) / 30
  const b = (hasta * 60 - 360) / 30
  if (s < a || s >= b) return 0
  return pico * Math.max(0.15, 1 - Math.abs(s - (a + b - 1) / 2) / ((b - a) / 2 + 0.5))
}
const tramos = (spec: [number, number][][]): OpeningHours => spec.map((d) => d.map(([a, b]) => ({ startMin: a * 60, endMin: b * 60 })))

/**
 * Ronda 6 (cambios-motor-r6-2026-11-04.md). Falla si vuelve alguno de estos:
 * un menor de noche, de más de 8 h o sin 48 h de descanso; alguien sin 36 h
 * de descanso semanal con las libranzas sueltas; el jefe de cocina del asador
 * que solo viene el sábado; un mando con un tramo más largo que el turno
 * máximo; en un local de 24 h los dos mandos de noche o un aviso falso de
 * preparación; el desglose de la plantilla en negativo; y una zona sin mando
 * que no avisa.
 */
async function sextaRonda() {
  console.log('\n\x1b[1mSexta ronda\x1b[0m')
  const falla6 = (msg: string) => {
    fallos.push(`Sexta ronda: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }
  const d = await analyzeFile(null, undefined, 1000)
  const ejemplo = rolesDeEjemplo(DEFAULT_ROLES)
  const minTramo = (sh: Roster['shifts'][number]) => sh.blocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
  const mandoDe = (r: Roster, model: StaffingModel, personId: string) =>
    esMando(model.roles.find((x) => x.id === r.people.find((p) => p.id === personId)?.roleId))

  // G2. Menores: sin noche, sin pasar de 8 h y con dos días seguidos de descanso.
  const conMenores = ejemplo.map((r) => (r.id === 'ayudante' || r.id === 'office' ? { ...r, menores: true } : r))
  for (const extra of [{}, { consecutiveDaysOff: false }] as Partial<Settings>[]) {
    const c = cuadranteDe(d.weeks, d.source.detectedHours, conMenores, extra)
    const menores = c.roster.people.filter((p) => p.roleId === 'ayudante' || p.roleId === 'office')
    let noche = 0
    let largos = 0
    let pocoDescanso = 0
    for (const p of menores) {
      const suyos = c.roster.shifts.filter((s) => s.personId === p.id)
      noche += suyos.filter((s) => s.blocks.some((b) => b.endMin > 22 * 60)).length
      largos += suyos.filter((s) => minTramo(s) > 480).length
      if ((descansoSemanalMasLargoMin(c.roster.shifts, p.id) ?? 9999) < 48 * 60) pocoDescanso++
    }
    const legales = c.avisos.filter((a) => a.tipo === 'menores' && a.gravedad === 'legal').length
    const sinCubrir = c.avisos.some((a) => a.tipo === 'menores' && a.mensaje.includes('quedan sin cubrir'))
    const n = extra.consecutiveDaysOff === false ? 'menores con libranzas sueltas' : 'menores'
    console.log(`  ${n}: ${menores.length} personas, ${noche} turnos pasadas las 22:00, ${largos} de más de 8 h, ${pocoDescanso} sin 48 h, ${legales} avisos legales`)
    if (noche > 0) falla6(`${n}: ${noche} turnos de menores pasadas las 22:00`)
    if (largos > 0) falla6(`${n}: ${largos} turnos de menores de más de 8 h`)
    if (pocoDescanso > 0) falla6(`${n}: ${pocoDescanso} menores sin dos días seguidos de descanso`)
    if (legales > 0) falla6(`${n}: el cuadrante hace lo que su revisión marca ilegal (${legales} avisos)`)
    if (!sinCubrir) falla6(`${n}: la noche que no se pone a un menor no se avisa como sin cubrir`)
  }

  // M3. 36 h de descanso semanal también con las libranzas sueltas, y los
  // casos que salían mal en el barrido de ajustes.
  const asador = anoDe((dd, s, w) => (1 + 0.2 * Math.sin(w)) * (dd === 4 ? campana(s, 20.5, 23.5, 40) : dd === 5 ? campana(s, 13.5, 16.5, 70) + campana(s, 20.5, 23.5, 60) : dd === 6 ? campana(s, 13.5, 16.5, 80) : 0))
  const hAsador = tramos([[], [], [], [], [[20, 24]], [[13, 17], [20, 24]], [[13, 17]]])
  const hotel = anoDe((_, s, w) => (1 + 0.25 * Math.sin(w / 3)) * (campana(s, 7, 10.5, 45) + campana(s, 20, 23, 35)))
  const hHotel = tramos(Array.from({ length: 7 }, () => [[7, 10.5], [20, 23]]))
  const copas = anoDe((dd, s, w) => (dd >= 3 ? 1 + dd * 0.2 : 0.6) * (1 + 0.2 * Math.cos(w)) * campana(s, 19, 27, 30))
  const hCopas = tramos(Array.from({ length: 7 }, () => [[19, 27]]))
  const dia24 = anoDe((_, s, w) => (1 + 0.15 * Math.sin(w)) * (8 + (s > 12 && s < 30 ? 10 : 0)))
  const h24 = tramos(Array.from({ length: 7 }, () => [[6, 30]]))
  const barrido: [string, WeekDemand[], OpeningHours, Partial<Settings>][] = [
    ['hotel, libranzas sueltas', hotel, hHotel, { consecutiveDaysOff: false, maxShiftMinutes: 360, minShiftMinutes: 180, maxDailyMinutes: 480 }],
    ['24 h, libranzas sueltas', dia24, h24, { consecutiveDaysOff: false, maxShiftMinutes: 360, minShiftMinutes: 180, maxDailyMinutes: 480 }],
    ['ejemplo, libranzas sueltas', d.weeks, d.source.detectedHours, { consecutiveDaysOff: false, maxShiftMinutes: 540, minShiftMinutes: 360, maxDailyMinutes: 480 }],
    ['ejemplo, turno máximo de 6 h', d.weeks, d.source.detectedHours, { allowSplitShifts: false, maxShiftMinutes: 360, minShiftMinutes: 180, maxDailyMinutes: 480 }],
    ['copas, turnos de 6 h justas', copas, hCopas, { maxShiftMinutes: 360, minShiftMinutes: 360, maxDailyMinutes: 480 }],
    ['asador, turnos de 6 h justas', asador, hAsador, { minRestBetweenShifts: false, maxShiftMinutes: 360, minShiftMinutes: 360, maxDailyMinutes: 720 }],
  ]
  for (const [n, weeks, hours, extra] of barrido) {
    const c = cuadranteDe(weeks, hours, ejemplo, extra)
    const sinDescanso = c.roster.people.filter((p) => (descansoSemanalMasLargoMin(c.roster.shifts, p.id) ?? 9999) < 36 * 60)
    const largos = c.roster.shifts.filter((sh) => mandoDe(c.roster, c.model, sh.personId) && sh.blocks.some((b) => b.endMin - b.startMin > c.settings.maxShiftMinutes))
    const des = c.plan.drivers.desglose
    const negativo = des ? Object.values(des).some((v) => typeof v === 'number' && v < 0) : false
    console.log(`  ${n}: ${sinDescanso.length} sin 36 h de descanso · ${largos.length} tramos de mando por encima del turno máximo · desglose ${JSON.stringify(des)}`)
    if (sinDescanso.length > 0) falla6(`${n}: ${sinDescanso.map((p) => p.label).join(', ')} sin día y medio de descanso a la semana`)
    if (largos.length > 0) falla6(`${n}: ${largos.length} tramos de mando más largos que el turno máximo de ${c.settings.maxShiftMinutes / 60} h`)
    if (negativo) falla6(`${n}: el desglose de la plantilla sale en negativo`)
  }

  // M2. El asador de fin de semana: el jefe de cocina viene los tres días.
  const casoAsador = cuadranteDe(
    anoDe((dd, s) => (dd === 4 ? campana(s, 20.5, 23.5, 40) : dd === 5 ? campana(s, 13.5, 16.5, 70) + campana(s, 20.5, 23.5, 60) : dd === 6 ? campana(s, 13.5, 16.5, 80) : 0)),
    hAsador,
    ejemplo,
    { minRestBetweenShifts: false },
  )
  const diasJefe = new Set(casoAsador.roster.shifts.filter((s) => s.roleId === 'jefe-cocina').map((s) => s.day))
  console.log(`  asador: el jefe de cocina viene ${diasJefe.size} de los 3 días que abre`)
  if (diasJefe.size < 3) falla6(`en el asador el jefe de cocina viene ${diasJefe.size} días de los 3 que abre el local`)

  // m5 y m6. Local de 24 h: sin aviso falso de preparación y los mandos no
  // se van los dos a la noche.
  const c24 = cuadranteDe(anoDe((_, s) => 6 + (s % 8 === 0 ? 4 : 0)), h24, ejemplo, { plusNocturnidadPct: 25 })
  const prep = c24.avisos.filter((a) => a.tipo === 'preparacion')
  const mandosDeNoche = c24.roster.people.filter((p) => {
    if (!mandoDe(c24.roster, c24.model, p.id)) return false
    const suyos = c24.roster.shifts.filter((s) => s.personId === p.id)
    return suyos.length > 0 && suyos.filter((s) => minutosDeNocheBloques(s.blocks) >= 240).length * 2 >= suyos.length
  })
  const mandos24 = c24.roster.people.filter((p) => mandoDe(c24.roster, c24.model, p.id))
  console.log(`  24 h: ${prep.length} avisos de preparación · ${mandosDeNoche.length} de ${mandos24.length} mandos de noche`)
  if (prep.length > 0) falla6('en un local abierto las 24 h sale el aviso de que se pierde la preparación')
  if (mandos24.length > 0 && mandosDeNoche.length === mandos24.length) falla6('en el local de 24 h todos los mandos están de noche')

  // M6. Una zona con equipo y sin mando avisa.
  const sinMandos = DEFAULT_ROLES.map((x) => ({ ...x, headcount: x.kind === 'estructura' ? 0 : x.headcount }))
  const cSin = cuadranteDe(d.weeks, d.source.detectedHours, sinMandos)
  const zonas = cSin.avisos.filter((a) => a.tipo === 'mando' && a.mensaje.includes('no has puesto ningún mando'))
  console.log(`  sin mandos: ${zonas.length} avisos de zona sin nadie al frente`)
  if (zonas.length === 0) falla6('sin ningún mando no hay aviso de que nadie queda al frente')
}

/**
 * Ronda 7 (cambios-motor-r7-2026-11-04.md). Falla si vuelve alguno de estos:
 * un nocturno por encima de 8 h de media (M4, el office de 8,3 h), un turno
 * de equipo que se alarga después del cierre (M2, el camarero de 21:30 a
 * 01:30 con la sala cerrada a las 00:30), un mando de "solo jornada
 * completa" a menos de la completa (m4) y un menor que entra antes de que
 * abra su zona (m1).
 */
async function septimaRonda() {
  console.log('\n\x1b[1mSéptima ronda\x1b[0m')
  const falla7 = (msg: string) => {
    fallos.push(`Séptima ronda: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }
  const d = await analyzeFile(null, undefined, 1000)
  const ejemplo = rolesDeEjemplo(DEFAULT_ROLES)
  const mandoDe = (r: Roster, model: StaffingModel, personId: string) =>
    esMando(model.roles.find((x) => x.id === r.people.find((p) => p.id === personId)?.roleId))
  const conMandosN = (n: number) => ejemplo.map((r) => (r.id === 'encargado' || r.id === 'jefe-cocina' ? { ...r, headcount: n } : r))
  // Un local grande de comidas y cenas hasta la una, y un menú que cierra a las 00:30.
  const grande = anoDe((dd, s, w) => (1 + 0.2 * Math.sin(w)) * (campana(s, 13, 16.5, dd >= 4 ? 90 : 60) + campana(s, 20, 25, dd >= 4 ? 110 : 60)))
  const hGrande = tramos(Array.from({ length: 7 }, () => [[13, 17], [20, 25]]))
  const menu = anoDe((dd, s, w) => (1 + 0.15 * Math.cos(w)) * (dd === 0 ? 0 : campana(s, 13.5, 16.5, 45) + (dd >= 3 ? campana(s, 20.5, 24.5, 30) : 0)))
  const hMenu = tramos([[], [[13.5, 16.5]], [[13.5, 16.5]], [[13.5, 16.5], [20.5, 24.5]], [[13.5, 16.5], [20.5, 24.5]], [[13.5, 17], [20.5, 24.5]], [[13.5, 17]]])
  const copas = anoDe((dd, s, w) => (dd >= 3 ? 1 + dd * 0.2 : 0.6) * (1 + 0.2 * Math.cos(w)) * campana(s, 19, 27, 30))
  const hCopas = tramos(Array.from({ length: 7 }, () => [[19, 27]]))
  const casos: [string, WeekDemand[], OpeningHours][] = [
    ['ejemplo', d.weeks, d.source.detectedHours],
    ['local grande', grande, hGrande],
    ['menú hasta las 00:30', menu, hMenu],
    ['copas', copas, hCopas],
  ]
  let combinaciones = 0
  let nocturnos = 0
  for (const [n, weeks, hours] of casos) {
    for (const mandos of [0, 1, 2]) {
      for (const extra of [{}, { allowSplitShifts: false }, { consecutiveDaysOff: false }, { minRestBetweenShifts: false }] as Partial<Settings>[]) {
        const c = cuadranteDe(weeks, hours, conMandosN(mandos), extra)
        combinaciones++
        // M4: ningún nocturno por encima de 8 h de media, y la revisión no lo marca.
        for (const p of c.roster.people) {
          const dias = Array.from({ length: 7 }, (_, dd) => c.roster.shifts.filter((x) => x.personId === p.id && x.day === dd).flatMap((x) => x.blocks))
          const m = mediaNocturnaMin(dias)
          if (m === null) continue
          nocturnos++
          if (m > 480 + 1e-9) falla7(`${n}, ${mandos} mandos ${JSON.stringify(extra)}: ${p.label} es nocturno con ${fmt(m / 60)} h de media`)
        }
        const legal = c.avisos.filter((a) => a.tipo === 'nocturno' && a.gravedad === 'legal')
        if (legal.length > 0) falla7(`${n}, ${mandos} mandos ${JSON.stringify(extra)}: la revisión marca ${legal.length} nocturnos por encima de 8 h`)
        // M2: ningún turno de equipo acaba después del cierre más su recogida (y la
        // media hora de más del office que friega la cena, ronda 3).
        for (const sh of c.roster.shifts) {
          if (mandoDe(c.roster, c.model, sh.personId)) continue
          const role = c.model.roles.find((r) => r.id === sh.roleId)
          const cierre = Math.max(...(hours[sh.day] ?? []).map((b) => b.endMin)) + preparacionDe(c.settings, role?.blockId ?? '').afterMin + (role?.cierraServicio ? RECOGIDA_EXTRA_MIN : 0)
          const fin = Math.max(...sh.blocks.map((b) => b.endMin))
          if (fin > cierre) falla7(`${n}, ${mandos} mandos ${JSON.stringify(extra)}: ${sh.personId} sale a las ${fmt(fin / 60)} el día ${sh.day}, después del cierre (${fmt(cierre / 60)})`)
        }
      }
    }
  }
  console.log(`  ${combinaciones} combinaciones · ${nocturnos} nocturnos, ninguno por encima de 8 h de media ni más allá del cierre`)

  // m4. "Solo jornada completa" manda también en un mando con poca apertura.
  const asador = anoDe((dd, s) => (dd === 4 ? campana(s, 20.5, 23.5, 40) : dd === 5 ? campana(s, 13.5, 16.5, 70) + campana(s, 20.5, 23.5, 60) : dd === 6 ? campana(s, 13.5, 16.5, 80) : 0))
  const hAsador = tramos([[], [], [], [], [[20, 24]], [[13, 17], [20, 24]], [[13, 17]]])
  const completo = conMandosN(1).map((r) => (r.id === 'encargado' ? { ...r, fullTimeOnly: true } : r))
  const cAs = cuadranteDe(asador, hAsador, completo)
  const enc = cAs.roster.people.filter((p) => p.roleId === 'encargado')
  console.log(`  asador con encargado de solo jornada completa: ${enc.map((p) => `${p.contractHours} h`).join(', ') || 'sin encargado'}`)
  if (enc.some((p) => p.contractHours < 40)) falla7(`un encargado de solo jornada completa sale a ${enc.map((p) => p.contractHours).join(', ')} h`)

  // m1. Un menor no entra antes de que abra su zona (con su preparación).
  const conMenores = ejemplo.map((r) => (r.id === 'ayudante' || r.id === 'office' ? { ...r, menores: true } : r))
  const cMen = cuadranteDe(menu, hMenu, conMenores)
  let antes = 0
  for (const sh of cMen.roster.shifts) {
    if (sh.roleId !== 'ayudante' && sh.roleId !== 'office') continue
    const role = cMen.model.roles.find((r) => r.id === sh.roleId)
    const prep = preparacionDe(cMen.settings, role?.blockId ?? '').beforeMin
    for (const b of sh.blocks) {
      const abre = (hMenu[sh.day] ?? []).filter((t) => t.endMin > b.startMin).map((t) => t.startMin)[0]
      if (abre !== undefined && b.startMin < abre - prep && b.endMin > abre - prep && b.endMin <= abre + 60) antes++
    }
  }
  console.log(`  menores en el menú: ${antes} tramos que se van cuando empieza el servicio`)
  if (antes > 0) falla7(`${antes} tramos de menores entran antes de que abra su zona y se van al empezar el servicio`)
}

/**
 * Ronda 8 (cambios-motor-r8-2026-11-04.md). La comprobación de "nadie viene
 * un solo día" solo miraba los casos de este fichero y con ficheros de verdad
 * volvió. Ahora mira también el banco de la revisión (`banco-casos.ts`), que
 * pasa por la lectura del fichero como la app. Falla si vuelve alguno de
 * estos: alguien de equipo con un solo día; la revisión que no lo avisa; la
 * cafetería con su merienda contada como cena (18 personas); el responsable
 * del local de 12 a 01 partido en cinco; un mando que libra uno de los tres
 * días más fuertes; o un puesto de pocas horas sin el aviso de que lo hace
 * otro puesto.
 */
async function octavaRonda() {
  console.log('\n\x1b[1mOctava ronda\x1b[0m')
  const falla8 = (msg: string) => {
    fallos.push(`Octava ronda: ${msg}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${msg}`)
  }
  const tresMasFuertes = (fuerza: number[]) =>
    new Set(fuerza.map((v, d) => [v, d] as const).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, d]) => d))
  const mandosEnDiaFuerte = (r: Roster, model: StaffingModel, fuerza: number[]) => {
    const fuertes = tresMasFuertes(fuerza)
    return r.people
      .filter((p) => esMando(model.roles.find((x) => x.id === p.roleId)))
      .flatMap((p) => p.daysOff.filter((d) => fuertes.has(d) && fuerza[d] > 0).map((d) => `${p.label} libra el día ${d}`))
  }

  const resultados = new Map<string, Awaited<ReturnType<typeof cuadranteDelCaso>>>()
  for (const caso of CASOS_BANCO) {
    const c = await cuadranteDelCaso(caso)
    resultados.set(caso.nombre, c)
    const dias = new Map<string, Set<number>>()
    for (const sh of c.roster.shifts) {
      const set = dias.get(sh.personId) ?? new Set<number>()
      set.add(sh.day)
      dias.set(sh.personId, set)
    }
    const sueltos = c.roster.people.filter((p) => !esMando(c.model.roles.find((r) => r.id === p.roleId)) && (dias.get(p.id)?.size ?? 0) === 1)
    for (const p of sueltos) falla8(`${caso.nombre}: ${p.label} viene un solo día (${fmt(p.assignedHours)} h de ${p.contractHours})`)
    if (c.avisos.some((a) => a.tipo === 'dia-suelto')) falla8(`${caso.nombre}: la revisión avisa de un día suelto`)
    console.log(`  ${caso.nombre}: ${c.plan.totalPeople} personas, ${fmt(c.plan.contractedHours)} h contratadas`)
  }

  // La revisión avisa si alguien viene un solo día: se le quitan los turnos a uno.
  const tapas = resultados.get('bar de tapas')!
  const victima = tapas.roster.people.find((p) => !esMando(tapas.model.roles.find((r) => r.id === p.roleId)))!
  const suyos = tapas.roster.shifts.filter((s) => s.personId === victima.id)
  const falso: Roster = { ...tapas.roster, shifts: [...tapas.roster.shifts.filter((s) => s.personId !== victima.id), suyos[0]] }
  if (!revisarCuadrante(falso, tapas.model, tapas.settings).some((a) => a.tipo === 'dia-suelto' && a.personId === victima.id)) {
    falla8('alguien con un solo día y la revisión no lo avisa')
  }

  // M1: la merienda de la cafetería dura lo que un café, no lo que una cena.
  const cafe = resultados.get('cafetería')!
  if (cafe.plan.totalPeople > 14) falla8(`la cafetería sale con ${cafe.plan.totalPeople} personas (antes de la merienda, 18; ahora 13)`)
  // Y el ayudante de pocas horas lo hace otro puesto, y se dice.
  const plegados = [...resultados.values()].flatMap((c) => c.avisos.filter((a) => a.tipo === 'puesto-plegado'))
  if (plegados.length === 0) falla8('ningún caso del banco avisa de un puesto de pocas horas que hace otro puesto')

  // M4: el responsable de un local de 12 a 01 sin mandos, en pocas personas y con contratos de verdad.
  const seguido = resultados.get('horario seguido de 12 a 01, sin mandos')!
  const resp = seguido.roster.people.filter((p) => p.roleId === 'responsable')
  console.log(`  responsable del horario seguido: ${resp.map((p) => `${p.contractHours} h`).join(', ')}`)
  if (resp.length > 3) falla8(`el responsable del horario seguido queda en ${resp.length} personas`)
  if (resp.some((p) => p.contractHours < 20)) falla8(`el responsable del horario seguido tiene contratos de ${resp.map((p) => p.contractHours).join(', ')} h`)
  if (seguido.avisos.some((a) => a.tipo === 'puesto-partido')) falla8('el horario seguido avisa de un puesto partido')

  // M5: los mandos libran los días flojos, no uno de los tres más fuertes.
  const grande = resultados.get('restaurante grande con mandos')!
  for (const m of mandosEnDiaFuerte(grande.roster, grande.model, grande.fuerza)) falla8(`restaurante grande: ${m}, uno de los tres más fuertes`)
  const d = await analyzeFile(null, undefined, 0)
  const ej = cuadranteDe(d.weeks, d.source.detectedHours, rolesDeEjemplo(DEFAULT_ROLES))
  const enFuerte = mandosEnDiaFuerte(ej.roster, ej.model, ej.fuerza)
  for (const m of enFuerte) falla8(`ejemplo: ${m}, uno de los tres más fuertes`)
  const libranzas = ej.roster.people
    .filter((p) => esMando(ej.model.roles.find((x) => x.id === p.roleId)))
    .map((p) => `${p.label} ${p.daysOff.join('-')}`)
  console.log(`  libranzas de los mandos del ejemplo: ${libranzas.join(' · ')}`)
}

main()
