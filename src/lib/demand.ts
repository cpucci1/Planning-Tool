/**
 * De 52 semanas de histórico a una semana tipo.
 *
 * Dos decisiones de método que condicionan todo el resultado:
 *
 * 1. EL DESFASE ES UNA CORRECCIÓN DE LA HORA DEL DATO. El fichero que sale del
 *    TPV marca la hora del COBRO, y se cobra al terminar — unos 30 minutos
 *    después de que el trabajo haya ocurrido. Así que la curva del fichero va
 *    sistemáticamente tarde: los 60 comensales que aparecen a las 15:00 se
 *    atendieron en realidad sobre las 14:30.
 *    La corrección es adelantar la curva ese desfase. No es una estimación ni
 *    un colchón de seguridad: es enderezar un sesgo conocido del dato. Por eso
 *    es un desplazamiento limpio y no un máximo móvil, que ensancharía los
 *    picos y sobredimensionaría la plantilla.
 *
 * 2. EL PERCENTIL SE CALIBRA. Aplicar el percentil 80 franja a franja y sumar
 *    NO da el percentil 80 de la semana: da bastante más, porque los máximos de
 *    cada franja no ocurren todos en la misma semana (es el factor de
 *    diversidad de toda la vida). Si el usuario ha dicho "quiero cubrir 42 de
 *    52 semanas", la plantilla tiene que salir para 42 de 52 — no para 50.
 *    Por eso se busca el percentil por franja cuyo total semanal coincide con
 *    el percentil pedido del total. Quien quiera el cálculo conservador lo tiene
 *    en ajustes avanzados.
 */

import { SLOTS_PER_DAY, SLOT_MINUTES, GRID_START_MIN } from './time'
import type { DemandDataset, OpeningHours, SpecialWeek, WeekDemand } from './types'

/**
 * Percentil por interpolación lineal, el mismo método que PERCENTILE de Excel.
 * `p` va de 0 a 1.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** Semanas que entran en el cálculo: las que el usuario no ha excluido. */
export function usableWeeks(dataset: DemandDataset, specials: SpecialWeek[]): WeekDemand[] {
  const excluded = new Set(specials.filter((s) => s.excluded).map((s) => s.isoWeek))
  const weeks = dataset.weeks.filter((w) => !excluded.has(w.isoWeek))
  // Si el usuario excluye tanto que no queda casi nada, mejor calcular sobre
  // todo que sobre tres semanas sueltas.
  return weeks.length >= 8 ? weeks : dataset.weeks
}

/**
 * Los valores de cada franja, ya ordenados, para las 52 semanas.
 * `[dia][franja]` → array ordenado de comensales.
 *
 * Ordenar es todo el coste de sacar un percentil, y al arrastrar la línea eso
 * se repite cientos de veces con las mismas semanas. Se ordena una vez y a
 * partir de ahí cada percentil es una lectura por índice.
 */
export type SortedDemand = number[][][]

export function sortDemand(weeks: WeekDemand[]): SortedDemand {
  const out: SortedDemand = []
  for (let d = 0; d < 7; d++) {
    const row: number[][] = []
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const values = new Array<number>(weeks.length)
      for (let w = 0; w < weeks.length; w++) values[w] = weeks[w].days[d][s]
      values.sort((a, b) => a - b)
      row.push(values)
    }
    out.push(row)
  }
  return out
}

/** Semana tipo cruda: percentil `p` aplicado a cada franja por separado. */
export function typicalWeekRaw(sorted: SortedDemand, p: number): number[][] {
  const out: number[][] = []
  for (let d = 0; d < 7; d++) {
    const row = new Array<number>(SLOTS_PER_DAY)
    for (let s = 0; s < SLOTS_PER_DAY; s++) row[s] = Math.round(percentile(sorted[d][s], p))
    out.push(row)
  }
  return out
}

/** Solo el total, sin construir la semana. Es lo único que necesita la calibración. */
function totalAtPercentile(sorted: SortedDemand, p: number): number {
  let t = 0
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) t += Math.round(percentile(sorted[d][s], p))
  }
  return t
}

function totalOf(week: number[][]): number {
  let t = 0
  for (const d of week) for (const v of d) t += v
  return t
}

/**
 * Percentil por franja que reproduce el total semanal pedido.
 *
 * Búsqueda binaria sobre p. Converge en ~14 iteraciones sobre 52×7×44 valores,
 * que en un portátil son milisegundos, y el resultado se cachea aguas arriba.
 */
export function calibratedSlotPercentile(sorted: SortedDemand, targetTotal: number): number {
  let lo = 0
  let hi = 1
  let best = 0.5
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    const total = totalAtPercentile(sorted, mid)
    best = mid
    if (total > targetTotal) hi = mid
    else lo = mid
    if (Math.abs(total - targetTotal) / Math.max(1, targetTotal) < 0.002) break
  }
  return best
}

export type SizingMode = 'calibrado' | 'conservador'

/**
 * Semana tipo definitiva.
 *
 * - `calibrado`: el total semanal coincide con el percentil pedido. Es lo que
 *   el usuario cree que está pidiendo cuando arrastra la línea.
 * - `conservador`: percentil aplicado a cada franja. Cada media hora queda
 *   cubierta el % pedido, a costa de una plantilla mayor.
 */
export function typicalWeek(
  weeks: WeekDemand[],
  coveragePct: number,
  mode: SizingMode = 'calibrado',
  sorted?: SortedDemand,
): number[][] {
  const p = coveragePct / 100
  const data = sorted ?? sortDemand(weeks)
  if (mode === 'conservador' || weeks.length === 0) return typicalWeekRaw(data, p)

  const totals = weeks.map((w) => w.total).sort((a, b) => a - b)
  const target = percentile(totals, p)
  return typicalWeekRaw(data, calibratedSlotPercentile(data, target))
}

/**
 * Cuánto se infla la semana tipo conservadora respecto a la semana real que
 * está en ese percentil. Se enseña al usuario para justificar la calibración.
 */
export function typicalWeekInflation(
  weeks: WeekDemand[],
  coveragePct: number,
  sorted?: SortedDemand,
): {
  conservativeTotal: number
  referenceTotal: number
  inflationPct: number
} {
  const p = coveragePct / 100
  const conservativeTotal = totalOf(typicalWeekRaw(sorted ?? sortDemand(weeks), p))
  const totals = weeks.map((w) => w.total).sort((a, b) => a - b)
  const referenceTotal = percentile(totals, p)
  return {
    conservativeTotal,
    referenceTotal: Math.round(referenceTotal),
    inflationPct: referenceTotal > 0 ? ((conservativeTotal - referenceTotal) / referenceTotal) * 100 : 0,
  }
}

/**
 * Umbral de comensales semanales que corresponde a una cobertura dada, y las
 * semanas que quedan por encima. Es lo que alimenta la línea arrastrable.
 */
export function coverageThreshold(weeks: WeekDemand[], coveragePct: number): {
  threshold: number
  weeksCovered: number
  peakWeeks: number[]
} {
  const totals = weeks.map((w) => w.total).sort((a, b) => a - b)
  const threshold = percentile(totals, coveragePct / 100)
  const peakWeeks = weeks.filter((w) => w.total > threshold).map((w) => w.isoWeek)
  return {
    threshold: Math.round(threshold),
    weeksCovered: weeks.length - peakWeeks.length,
    peakWeeks,
  }
}

/**
 * Cobertura que corresponde a un umbral. Es la inversa de `coverageThreshold`,
 * y la que hace falta mientras el usuario arrastra la línea: él mueve un valor
 * en comensales, nosotros le devolvemos el porcentaje.
 */
export function coverageFromThreshold(weeks: WeekDemand[], threshold: number): number {
  if (weeks.length === 0) return 0
  return (weeks.filter((w) => w.total <= threshold).length / weeks.length) * 100
}

/**
 * "Quedarse corto es 4 veces más grave que sobrar" — la lectura en cristiano
 * del percentil elegido. Es el ratio crítico del modelo del vendedor de
 * periódicos, y ayuda al usuario a decidir mejor que un porcentaje pelado.
 */
export function riskRatio(coveragePct: number): number {
  const p = Math.min(0.98, Math.max(0.02, coveragePct / 100))
  return Math.round((p / (1 - p)) * 10) / 10
}

/**
 * Corrige el desfase del dato: adelanta la curva `lagMinutes`, porque el
 * fichero marca la hora del cobro y se cobra después de trabajar.
 *
 * Es un desplazamiento puro: `corregida[s] = fichero[s + desfase]`. Con
 * desfases que no son múltiplo de 30 se interpola entre las dos franjas
 * afectadas, para no dar saltos artificiales.
 *
 * Lo que se sale por el final se descarta y lo que queda al descubierto se
 * rellena con ceros, que es lo correcto: no hay dato de después del cierre.
 */
export function applyLag(week: number[][], lagMinutes: number): number[][] {
  const span = lagMinutes / SLOT_MINUTES
  if (span === 0) return week.map((d) => [...d])

  const whole = Math.floor(span)
  const frac = span - whole

  return week.map((day) => {
    const at = (i: number) => (i >= 0 && i < SLOTS_PER_DAY ? day[i] : 0)
    const out = new Array<number>(SLOTS_PER_DAY).fill(0)
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const a = at(s + whole)
      const b = at(s + whole + 1)
      out[s] = Math.round(a * (1 - frac) + b * frac)
    }
    return out
  })
}

/** Minuto absoluto de rejilla en el que empieza la franja `s`. */
function slotMin(s: number): number {
  return GRID_START_MIN + s * SLOT_MINUTES
}

/**
 * Recorta la demanda al horario de apertura. Si el local está cerrado no hay
 * comensales, por mucho ruido que traiga el histórico a esa hora.
 */
export function clampToHours(week: number[][], hours: OpeningHours): number[][] {
  return week.map((day, d) => {
    const blocks = hours[d] ?? []
    if (blocks.length === 0) return new Array<number>(SLOTS_PER_DAY).fill(0)
    return day.map((v, s) => {
      const min = slotMin(s)
      return blocks.some((b) => min >= b.startMin && min < b.endMin) ? v : 0
    })
  })
}

/** Deduce el horario a partir de dónde hay comensales de verdad. */
export function inferHours(week: number[][], minCovers = 1): OpeningHours {
  return week.map((day) => {
    const blocks: { startMin: number; endMin: number }[] = []
    let start: number | null = null
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const active = day[s] >= minCovers
      if (active && start === null) start = slotMin(s)
      if (!active && start !== null) {
        blocks.push({ startMin: start, endMin: slotMin(s) })
        start = null
      }
    }
    if (start !== null) blocks.push({ startMin: start, endMin: slotMin(SLOTS_PER_DAY) })

    // Une tramos separados por menos de hora y media: un hueco corto a media
    // tarde es una bajada de servicio, no un cierre.
    const merged: { startMin: number; endMin: number }[] = []
    for (const b of blocks) {
      const last = merged[merged.length - 1]
      if (last && b.startMin - last.endMin <= 90) last.endMin = b.endMin
      else merged.push({ ...b })
    }
    return merged.filter((b) => b.endMin - b.startMin >= 60)
  })
}

/** Total de comensales de una semana. */
export function weekTotal(days: number[][]): number {
  return totalOf(days)
}

/** Comensales por día de una semana, para el gráfico de barras por día. */
export function dayTotals(days: number[][]): number[] {
  return days.map((d) => d.reduce((a, b) => a + b, 0))
}
