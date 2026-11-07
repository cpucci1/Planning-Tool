/**
 * Verificación del cálculo de punta a punta.
 *
 *   npm run verificar
 *
 * Recorre toda la cadena con los datos de ejemplo y la imprime: demanda leída,
 * horario deducido, semanas especiales, cobertura, semana tipo, necesidad,
 * plantilla y picos. No es un test automático — es la forma rápida de ver si un
 * cambio en `src/lib/` ha movido algún número que no debía moverse.
 *
 * Los datos de ejemplo son deterministas, así que dos ejecuciones seguidas dan
 * exactamente lo mismo: cualquier diferencia es culpa del código.
 */

import { analyzeFile } from '../src/lib/fakeAI'
import {
  coherentCoveragePct,
  coverageThreshold,
  peakOf,
  riskRatio,
  typicalWeek,
  typicalWeekInflation,
  usableWeeks,
  weekTotal,
} from '../src/lib/demand'
import { describeMapping, detectSpecialWeeks, easterSunday, isoWeek } from '../src/lib/holidays'
import { summarize } from '../src/lib/staffing'
import { cobrosDeLaSemana, conColchon, contextoDelCuadrante, curvaDeTrabajo, necesidadCompleta, necesidadDeServicio } from '../src/lib/necesidad'
import { buildRoster } from '../src/lib/roster'
import { analyzePeaks, describeMix, fteFrom, summarizeCost, summarizePlan } from '../src/lib/contracts'
import {
  PORTADA_CONTRATOS,
  PORTADA_COSTE_ANO_EUR,
  PORTADA_COSTE_PUESTOS,
  PORTADA_COSTE_SEMANA_EUR,
  PORTADA_SEMANAS_PUNTA,
} from '../src/data/ejemploPortada'
import {
  DEFAULT_BLOCKS,
  DEFAULT_ROLES,
  DEFAULT_SETTINGS,
  DEFAULT_TIERS,
  DEMO_VENTAS_SEMANA,
  KITCHEN_BLOCK_ID,
  rolesDeEjemplo,
} from '../src/data/presets'
import { DAYS, formatMin, formatSlot } from '../src/lib/time'

const n = (v: number) => v.toLocaleString('es-ES')
const h = (v: number) => `${v.toFixed(1).replace('.', ',')} h`
const title = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`)

async function main() {
  const d = await analyzeFile(null, undefined, 1000)
  // Las semanas que cuentan, como en la app: sin las que se excluyen solas
  // (`usableWeeks` con las semanas especiales detectadas). Ronda 5.
  const weeks = usableWeeks(d, detectSpecialWeeks(d.weeks, d.year))
  // El porcentaje se ajusta a las semanas que cubre, igual que en la app al
  // leer un fichero (`coherentCoveragePct`).
  const settings = { ...DEFAULT_SETTINGS, coveragePct: coherentCoveragePct(weeks, DEFAULT_SETTINGS.coveragePct) }
  // El catálogo del ejemplo, tal y como lo carga la app: con su encargado y su
  // jefe de cocina (ronda 3).
  const model = { blocks: DEFAULT_BLOCKS, roles: rolesDeEjemplo(DEFAULT_ROLES), tiers: DEFAULT_TIERS }

  title('HISTÓRICO LEÍDO')
  const yearTotal = d.weeks.reduce((a, w) => a + w.total, 0)
  console.log(`  año ${d.year} · ${d.weeks.length} semanas · ${d.source.dateRange}`)
  console.log(`  ${n(yearTotal)} comensales · media ${n(Math.round(yearTotal / d.weeks.length))}/semana`)
  const ticket = DEMO_VENTAS_SEMANA / (yearTotal / d.weeks.length)
  console.log(`  ventas de ejemplo ${n(DEMO_VENTAS_SEMANA)} € a la semana · ${ticket.toFixed(2).replace('.', ',')} € por comensal`)
  if (ticket < 20 || ticket > 35) {
    console.log('  \x1b[31mFALLA\x1b[0m el ticket medio del ejemplo no está entre 20 y 35 €')
    process.exitCode = 1
  }
  console.log(`  rango semanal ${n(Math.min(...d.weeks.map((w) => w.total)))} – ${n(Math.max(...d.weeks.map((w) => w.total)))}`)

  title('HORARIO DEDUCIDO')
  d.source.detectedHours.forEach((blocks, i) => {
    const txt = blocks.map((b) => `${formatMin(b.startMin)}-${formatMin(b.endMin)}`).join('  +  ')
    console.log(`  ${DAYS[i].padEnd(10)} ${txt || 'cerrado'}`)
  })

  title('SEMANAS ESPECIALES DETECTADAS')
  for (const s of detectSpecialWeeks(d.weeks, d.year)) {
    const dev = `${s.deviation > 0 ? '+' : ''}${(s.deviation * 100).toFixed(0)}%`
    console.log(
      `  sem ${String(s.isoWeek).padStart(2)} · ${s.label.padEnd(22)} ${dev.padStart(5)}` +
        `${s.excluded ? '  [se excluye]' : ''}${s.moveable ? '  [se mueve de año a año]' : ''}`,
    )
  }
  console.log(`  Pascua ${d.year}: ${easterSunday(d.year).toISOString().slice(0, 10)} → semana ${isoWeek(easterSunday(d.year))}`)
  console.log(`  Pascua ${d.year + 1}: ${easterSunday(d.year + 1).toISOString().slice(0, 10)} → semana ${isoWeek(easterSunday(d.year + 1))}`)
  for (const line of describeMapping(d.year, d.year + 1)) console.log(`    · ${line}`)

  title('NIVEL DE COBERTURA')
  for (const pct of [60, 70, 80, 90]) {
    const c = coverageThreshold(weeks, pct)
    console.log(
      `  ${String(pct).padStart(2)}% → umbral ${n(c.threshold)} comensales/semana · ` +
        `cubre ${c.weeksCovered}/${weeks.length} · quedarse corto pesa ×${riskRatio(pct)}`,
    )
  }

  const typical = typicalWeek(weeks, settings.coveragePct, settings.sizingMode)
  // La misma cadena que la app (`lib/necesidad.ts`), con preparación y mínimo.
  const curve = curvaDeTrabajo(typical, d.source.detectedHours, settings)
  const staffing = conColchon(curve, settings)

  title(`SEMANA TIPO (${settings.coveragePct}%, ${settings.sizingMode})`)
  const inf = typicalWeekInflation(weeks, settings.coveragePct)
  const pk = peakOf(curve)
  console.log(`  del fichero ${n(weekTotal(typical))} cobros`)
  console.log(
    `  sentados a la vez (comida ${settings.mealMinutes?.midday} min, cena ${settings.mealMinutes?.night} min): máximo ${n(pk.value)} · ${DAYS[pk.day]} ${formatSlot(pk.slot)}`,
  )
  console.log(`  el modo conservador daría ${n(inf.conservativeTotal)} frente a ${n(inf.referenceTotal)} de referencia (+${inf.inflationPct.toFixed(1)}%)`)

  const demandGrid = necesidadDeServicio(staffing, model, null, KITCHEN_BLOCK_ID)
  const grid = necesidadCompleta(demandGrid, staffing, model, d.source.detectedHours, null, KITCHEN_BLOCK_ID, settings)
  const sum = summarize(grid, model)
  const sumDemand = summarize(demandGrid, model)

  title('NECESIDAD DE PERSONAL')
  console.log(`  ${h(sum.totalHours)} a la semana (${h(sumDemand.totalHours)} de servicio + ${h(sum.totalHours - sumDemand.totalHours)} de preparación y recogida)`)
  console.log(`  pico de ${sum.peak.people} personas · ${DAYS[sum.peak.day]} ${formatSlot(sum.peak.slot)}`)
  for (const r of model.roles) {
    console.log(`    ${r.name.padEnd(22)} ${h(sum.hoursByRole[r.id] ?? 0).padStart(9)} · pico ${Math.max(0, ...grid[r.id].flat())}`)
  }

  // El mismo contexto que la app (`contextoDelCuadrante`): el horario de cada
  // zona con su preparación y los comensales de cada día. Sin él la portada
  // decía 9.150 € y la app 9.191 € (ronda 5).
  const cobros = cobrosDeLaSemana(typical, curve, d.source.detectedHours, settings)
  const contexto = contextoDelCuadrante(d.source.detectedHours, null, KITCHEN_BLOCK_ID, settings, cobros)
  const roster = buildRoster(grid, model, settings, contexto)
  const plan = summarizePlan(roster, settings, sum, grid, model)

  title('PLANTILLA')
  console.log(`  ${plan.totalPeople} personas · ${describeMix(plan.allocations, settings.contracts)} · ${fteFrom(plan)} jornadas completas`)
  console.log(`  necesarias ${h(plan.neededHours)} → en turnos ${h(plan.assignedHours)} → contratadas ${h(plan.contractedHours)}`)
  console.log(
    `  por horas bastarían ${plan.drivers.fteFromHours} jornadas, pero el pico simultáneo obliga a ${plan.drivers.peopleFromPeak} personas`,
  )
  console.log(`  ${roster.shifts.length} turnos · ${h(roster.uncoveredHours)} sin cubrir`)
  for (const p of roster.people) {
    console.log(
      `    ${p.label.padEnd(24)} ${`${p.contractHours}h`.padStart(4)} · asignadas ${h(p.assignedHours).padStart(9)} · libra ${p.daysOff.map((x) => DAYS[x].slice(0, 3)).join(', ') || '—'}`,
    )
  }

  const cov = coverageThreshold(weeks, settings.coveragePct)
  // Como en la app: el ratio de las semanas punta sale solo del servicio y de los cobros.
  // Y la gente de más, del pico real de la peor semana con la misma cadena (ronda 3).
  // La semana punta sin margen, como la app (ronda 6, M1).
  const personasPico = (days: number[][]) =>
    summarize(necesidadDeServicio(curvaDeTrabajo(days, d.source.detectedHours, settings), model, null, KITCHEN_BLOCK_ID), model).peak.people
  const peaks = analyzePeaks(weeks, cov.threshold, sumDemand.totalHours, weekTotal(cobros), 40, {
    personasPico,
    picoTipico: sumDemand.peak.people,
    margenPct: settings.safetyMarginPct,
    capacidadEsSemanaTipo: settings.sizingMode === 'conservador',
  })

  title('PICOS QUE NO CUBRE LA PLANTILLA')
  console.log(`  ${peaks.peakWeeks.length} semanas: ${peaks.peakWeeks.join(', ')}`)
  console.log(`  ${n(peaks.peakHoursPerYear)} horas-persona al año fuera de plantilla`)
  if (peaks.worstWeek) {
    console.log(
      `  la peor es la semana ${peaks.worstWeek.isoWeek}: faltan ${peaks.worstWeek.extraPeople} personas (${n(peaks.worstWeek.extraHours)} h)`,
    )
  }
  console.log(`  de media faltan ${peaks.avgExtraPeople} personas en una semana punta`)
  console.log(`  contratarlas fijas serían ${peaks.weeksPaidPerWeekWorked} semanas de sueldo por cada semana punta trabajada`)

  // Lo que enseña la portada tiene que ser esto mismo (src/data/ejemploPortada.ts).
  title('PORTADA (src/data/ejemploPortada.ts)')
  const fallosPortada: string[] = []
  const contratos = PORTADA_CONTRATOS.map((c) => ({
    ...c,
    real: roster.people.filter((p) => p.contractHours >= c.desde && p.contractHours <= c.hasta).length,
  }))
  for (const c of contratos) {
    console.log(`  ${c.label.padEnd(8)} portada ${c.count} · cálculo ${c.real}`)
    if (c.count !== c.real) fallosPortada.push(`contratos ${c.label}: pon ${c.real}`)
  }
  if (contratos.reduce((a, c) => a + c.real, 0) !== plan.totalPeople) fallosPortada.push('las jornadas de la portada no suman la plantilla')
  if (PORTADA_SEMANAS_PUNTA !== peaks.peakWeeks.length) fallosPortada.push(`semanas punta: pon ${peaks.peakWeeks.length}`)
  const cost = summarizeCost(roster, model, settings)
  if (cost) {
    // Al euro, las mismas cifras que enseña el resultado (ronda 9): la portada
    // promete "es lo mismo que verás" y redondeada a 50 € decía 9.150 y
    // 475.800 cuando dentro salía 9.154 y 476.008.
    const sem = Math.round(cost.weeklyEur)
    const ano = Math.round(cost.annualEur)
    console.log(`  coste portada ${PORTADA_COSTE_SEMANA_EUR} €/sem y ${PORTADA_COSTE_ANO_EUR} €/año · cálculo ${sem} y ${ano}`)
    if (sem !== PORTADA_COSTE_SEMANA_EUR) fallosPortada.push(`coste semanal: pon ${sem}`)
    if (ano !== PORTADA_COSTE_ANO_EUR) fallosPortada.push(`coste anual: pon ${ano}`)
    const top = [...cost.byRole].filter((r) => (r.weeklyEur ?? 0) > 0).sort((a, b) => (b.weeklyEur ?? 0) - (a.weeklyEur ?? 0)).slice(0, 4)
    const max = top[0]?.weeklyEur ?? 1
    const puestos = top.map((r) => ({ roleId: r.roleId, pct: Math.round(((r.weeklyEur ?? 0) / max) * 100) }))
    console.log(`  puestos: ${puestos.map((x) => `${x.roleId} ${x.pct}`).join(', ')}`)
    if (JSON.stringify(puestos) !== JSON.stringify(PORTADA_COSTE_PUESTOS)) fallosPortada.push(`puestos del coste: pon ${JSON.stringify(puestos)}`)
    const ticket = DEMO_VENTAS_SEMANA > 0 ? Math.round((cost.weeklyEur / DEMO_VENTAS_SEMANA) * 100) : 0
    console.log(`  ratio de personal del ejemplo, solo plantilla: ${ticket} %`)
  }
  for (const f of fallosPortada) console.log(`  \x1b[31mFALLA\x1b[0m ${f}`)
  if (fallosPortada.length > 0) process.exitCode = 1
  console.log()
}

main()
