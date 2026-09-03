/**
 * Lectura del fichero — SIMULADA.
 *
 * Este es el único punto del producto que finge. Se acepta cualquier fichero, se
 * enseña un análisis creíble y se devuelven datos generados aquí mismo. Cuando
 * exista backend, `analyzeFile()` pasa a ser una llamada de red y el resto del
 * producto no se entera: la firma y el tipo de vuelta ya son los definitivos.
 *
 * Los datos generados no son ruido: parten de la curva real de un restaurante
 * (data/sampleWeek.ts) y se le aplica estacionalidad anual, festivos y una
 * variación semanal con semilla fija. Así el histórico simulado se comporta como
 * uno de verdad — Semana Santa se dispara, agosto se hunde, diciembre sube — y
 * el resto de la herramienta se puede probar en serio.
 */

import { BASE_WEEK } from '@/data/sampleWeek'
import { anchorsFor, isoWeekStart, isoWeeksInYear } from './holidays'
import { applyLag, inferHours, weekTotal } from './demand'
import { SLOTS_PER_DAY } from './time'
import type { DemandDataset, WeekDemand } from './types'

/**
 * Desfase por defecto, en minutos. Duplicado a propósito de
 * `DEFAULT_SETTINGS.lagMinutes`: `data/presets` importa de `lib/`, y hacerlo al
 * revés cerraría el círculo.
 */
const DEFAULT_LAG_MINUTES = 30

/** PRNG con semilla: el mismo fichero da siempre el mismo resultado. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Índice de estacionalidad por semana ISO, para un restaurante de ciudad.
 * Enero flojo, agosto vacío porque la gente se va, diciembre disparado.
 */
function seasonalIndex(week: number, weeksInYear: number): number {
  const t = week / weeksInYear
  // Onda anual suave con el mínimo en enero y el máximo a final de primavera.
  const base = 1 + 0.1 * Math.sin(2 * Math.PI * (t - 0.08))

  let mult = base
  if (week <= 2) mult *= 0.7 // cuesta de enero
  else if (week <= 6) mult *= 0.85
  else if (week >= 31 && week <= 35) mult *= 0.62 // agosto: la ciudad se vacía
  else if (week >= 36 && week <= 38) mult *= 0.95 // vuelta al cole
  else if (week >= 49 && week <= 51) mult *= 1.35 // comidas de empresa
  else if (week >= 52) mult *= 1.1

  return mult
}

function generateWeeks(year: number, seed: number): WeekDemand[] {
  const rand = mulberry32(seed)
  const weeksInYear = isoWeeksInYear(year)
  const anchors = anchorsFor(year)

  const anchorMult = new Map<number, number>()
  for (const a of anchors) {
    const mult =
      a.label === 'Semana Santa' ? 1.55 : a.label === 'Carnaval' ? 1.2 : a.label === 'Navidad' ? 1.3 : 1
    if (mult === 1) continue
    for (let i = 0; i < a.span; i++) anchorMult.set(a.week + i, mult)
  }

  // Una fiesta local que no está en ningún calendario: es justo el caso que la
  // herramienta tiene que enseñar al usuario para que la confirme.
  const localFiesta = 20 + Math.floor(rand() * 4)

  const weeks: WeekDemand[] = []
  for (let w = 1; w <= weeksInYear; w++) {
    let mult = seasonalIndex(w, weeksInYear)
    mult *= anchorMult.get(w) ?? 1
    if (w === localFiesta) mult *= 1.45
    // Ruido semanal: el tiempo, un partido, un puente cualquiera.
    mult *= 0.92 + rand() * 0.16

    const days = BASE_WEEK.map((day) => {
      // Cada día se mueve además por su cuenta.
      const dayMult = mult * (0.94 + rand() * 0.12)
      return day.map((v) => {
        if (v === 0) return 0
        const noise = 0.88 + rand() * 0.24
        return Math.max(0, Math.round(v * dayMult * noise))
      })
    })

    weeks.push({
      isoWeek: w,
      year,
      startDate: isoWeekStart(year, w).toISOString().slice(0, 10),
      days,
      total: weekTotal(days),
    })
  }
  return weeks
}

/** Los pasos que ve el usuario mientras "la IA lee". */
export const ANALYSIS_STEPS = [
  { label: 'Leyendo el fichero', detail: 'Abriendo y detectando el formato' },
  { label: 'Buscando las fechas', detail: 'Identificando el rango del histórico' },
  { label: 'Localizando los comensales', detail: 'Distinguiendo comensales de tickets y de importes' },
  { label: 'Repartiendo en franjas', detail: 'Agrupando en tramos de media hora' },
  { label: 'Detectando el horario', detail: 'Deduciendo cuándo abres cada día' },
  { label: 'Buscando semanas raras', detail: 'Festivos, cierres y picos fuera de lo normal' },
] as const

export interface AnalysisProgress {
  step: number
  label: string
  detail: string
}

/**
 * Simula la lectura del fichero. Llama a `onProgress` en cada paso para que la
 * UI pueda ir contando lo que "está pasando".
 */
export async function analyzeFile(
  file: { name: string; size: number } | null,
  onProgress?: (p: AnalysisProgress) => void,
  speed = 1,
): Promise<DemandDataset> {
  const name = file?.name ?? 'datos-de-ejemplo.csv'
  const seed = hashString(name + (file?.size ?? 0))

  for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
    onProgress?.({ step: i, label: ANALYSIS_STEPS[i].label, detail: ANALYSIS_STEPS[i].detail })
    // Los pasos no duran lo mismo: leer es rápido, "entender" tarda. Que el
    // ritmo sea irregular es lo que hace que parezca trabajo de verdad.
    const base = i === 0 ? 320 : i === 2 ? 780 : 520
    await new Promise((r) => setTimeout(r, (base + (seed % 200)) / speed))
  }

  // El año del histórico es el anterior completo.
  const year = new Date().getFullYear() - 1
  const weeks = generateWeeks(year, seed)

  // Semana media para deducir el horario, sin que un pico lo alargue de más.
  const avg = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: SLOTS_PER_DAY }, (_, s) => {
      const vals = weeks.map((w) => w.days[d][s]).sort((a, b) => a - b)
      return vals[Math.floor(vals.length / 2)]
    }),
  )

  // El horario se deduce de la curva YA CORREGIDA, no de la del fichero. Si no,
  // el horario saldría media hora tarde — porque las horas del fichero son de
  // cobro — y al recortar la demanda por horario nos comeríamos justo la media
  // hora de trabajo que acabábamos de recuperar.
  const workingCurve = applyLag(avg, DEFAULT_LAG_MINUTES)

  const firstWeek = weeks[0]
  const lastWeek = weeks[weeks.length - 1]

  return {
    weeks,
    year,
    specials: [],
    source: {
      fileName: name,
      rowsDetected: weeks.length * 7 * 14,
      dateRange: `${firstWeek.startDate} → ${lastWeek.startDate}`,
      columnsDetected: [
        { label: 'Fecha', mappedTo: 'Día del servicio', confidence: 0.99 },
        { label: 'Hora', mappedTo: 'Franja horaria', confidence: 0.97 },
        { label: 'Comensales', mappedTo: 'Comensales', confidence: 0.94 },
        { label: 'Nº ticket', mappedTo: 'Ignorada', confidence: 0.88 },
        { label: 'Importe', mappedTo: 'Ignorada', confidence: 0.91 },
      ],
      detectedHours: inferHours(workingCurve, 3),
    },
  }
}
