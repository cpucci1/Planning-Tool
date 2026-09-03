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
  applyLag,
  clampToHours,
  coverageThreshold,
  riskRatio,
  typicalWeek,
  typicalWeekInflation,
  weekTotal,
} from '../src/lib/demand'
import { describeMapping, detectSpecialWeeks, easterSunday, isoWeek } from '../src/lib/holidays'
import { buildNeedGrid, summarize } from '../src/lib/staffing'
import { buildRoster } from '../src/lib/roster'
import { analyzePeaks, describeMix, fteFrom, summarizePlan } from '../src/lib/contracts'
import { DEFAULT_BLOCKS, DEFAULT_ROLES, DEFAULT_SETTINGS, DEFAULT_TIERS } from '../src/data/presets'
import { DAYS, formatMin, formatSlot } from '../src/lib/time'

const n = (v: number) => v.toLocaleString('es-ES')
const h = (v: number) => `${v.toFixed(1).replace('.', ',')} h`
const title = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`)

async function main() {
  const d = await analyzeFile(null, undefined, 1000)
  const settings = DEFAULT_SETTINGS
  const model = { blocks: DEFAULT_BLOCKS, roles: DEFAULT_ROLES, tiers: DEFAULT_TIERS }

  title('HISTÓRICO LEÍDO')
  const yearTotal = d.weeks.reduce((a, w) => a + w.total, 0)
  console.log(`  año ${d.year} · ${d.weeks.length} semanas · ${d.source.dateRange}`)
  console.log(`  ${n(yearTotal)} comensales · media ${n(Math.round(yearTotal / d.weeks.length))}/semana`)
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
    const c = coverageThreshold(d.weeks, pct)
    console.log(
      `  ${String(pct).padStart(2)}% → umbral ${n(c.threshold)} comensales/semana · ` +
        `cubre ${c.weeksCovered}/${d.weeks.length} · quedarse corto pesa ×${riskRatio(pct)}`,
    )
  }

  const typical = typicalWeek(d.weeks, settings.coveragePct, settings.sizingMode)
  const lagged = clampToHours(applyLag(typical, settings.lagMinutes), d.source.detectedHours)

  title(`SEMANA TIPO (${settings.coveragePct}%, ${settings.sizingMode})`)
  const inf = typicalWeekInflation(d.weeks, settings.coveragePct)
  console.log(`  del fichero ${n(weekTotal(typical))} → corregido el desfase y aplicado el horario ${n(weekTotal(lagged))}`)
  console.log(`  el modo conservador daría ${n(inf.conservativeTotal)} frente a ${n(inf.referenceTotal)} de referencia (+${inf.inflationPct.toFixed(1)}%)`)

  const grid = buildNeedGrid(lagged, model)
  const sum = summarize(grid, model)

  title('NECESIDAD DE PERSONAL')
  console.log(`  ${h(sum.totalHours)} a la semana`)
  console.log(`  pico de ${sum.peak.people} personas · ${DAYS[sum.peak.day]} ${formatSlot(sum.peak.slot)}`)
  for (const r of model.roles) {
    console.log(`    ${r.name.padEnd(22)} ${h(sum.hoursByRole[r.id] ?? 0).padStart(9)} · pico ${Math.max(0, ...grid[r.id].flat())}`)
  }

  const roster = buildRoster(grid, model, settings)
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

  const cov = coverageThreshold(d.weeks, settings.coveragePct)
  const peaks = analyzePeaks(d.weeks, cov.threshold, sum.totalHours, weekTotal(lagged))

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
  console.log()
}

main()
