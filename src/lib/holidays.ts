/**
 * Festivos móviles y semanas atípicas.
 *
 * El problema real: si Semana Santa cayó en la semana 15 del histórico y el año
 * que viene cae en la 16, comparar semana 15 con semana 15 es comparar una
 * semana de picos con una normal. Hay que alinear por evento, no por número de
 * semana.
 *
 * Aquí se calcula la fecha de Pascua, se localizan las semanas ancla de cada
 * año y se construye el mapa de traslación semana_origen → semana_destino.
 */

import type { SpecialKind, SpecialWeek, WeekDemand } from './types'

// ─────────────────────────────────────────────────────────────
// Calendario
// ─────────────────────────────────────────────────────────────

/**
 * Domingo de Pascua en el calendario gregoriano.
 * Algoritmo de Meeus/Jones/Butcher — el estándar, exacto para 1583-4099.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

/** Semana ISO 8601 de una fecha (1-53). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // El jueves de esa semana decide a qué año ISO pertenece.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Número de semanas ISO que tiene un año: 52 o 53. */
export function isoWeeksInYear(year: number): number {
  return isoWeek(new Date(Date.UTC(year, 11, 28)))
}

/** Lunes de una semana ISO. */
export function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1)
  const target = new Date(week1Monday)
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  return target
}

// ─────────────────────────────────────────────────────────────
// Anclas móviles
// ─────────────────────────────────────────────────────────────

export interface Anchor {
  kind: SpecialKind
  label: string
  /** Semana ISO en la que cae ese año. */
  week: number
  /** Cuántas semanas ocupa el evento. */
  span: number
  moveable: boolean
}

/**
 * Semanas ancla de un año. Las móviles se calculan desde Pascua; las fijas
 * (Navidad, agosto) se derivan del calendario.
 */
export function anchorsFor(year: number): Anchor[] {
  const easter = easterSunday(year)

  // La Semana Santa hostelera es la semana que TERMINA en el Domingo de
  // Resurrección: de Lunes Santo a Domingo de Pascua. Por eso se toma el lunes
  // anterior, no el propio domingo, que ya cae en la semana ISO siguiente.
  const holyWeek = isoWeek(new Date(easter.getTime() - 6 * 86400000))

  // Carnaval: 47 días antes de Pascua es Miércoles de Ceniza.
  const ash = new Date(easter)
  ash.setUTCDate(easter.getUTCDate() - 46)
  const carnival = isoWeek(new Date(ash.getTime() - 3 * 86400000))

  const christmas = isoWeek(new Date(Date.UTC(year, 11, 25)))

  return [
    // Enero arranca flojo en toda la hostelería de ciudad: la cuesta es real y
    // conviene reconocerla, porque si no se etiqueta sale como "semana rara".
    { kind: 'temporada-baja', label: 'Cuesta de enero', week: 1, span: 3, moveable: false },
    { kind: 'carnaval', label: 'Carnaval', week: carnival, span: 1, moveable: true },
    { kind: 'semana-santa', label: 'Semana Santa', week: holyWeek, span: 1, moveable: true },
    // Agosto vacía la ciudad durante cinco semanas, no tres.
    { kind: 'agosto', label: 'Agosto', week: isoWeek(new Date(Date.UTC(year, 7, 1))), span: 5, moveable: false },
    // Las tres semanas previas a Navidad son las comidas de empresa, que en
    // muchos locales pesan más que la Navidad en sí.
    { kind: 'navidad', label: 'Comidas de empresa', week: christmas - 3, span: 3, moveable: false },
    { kind: 'navidad', label: 'Navidad', week: christmas, span: 1, moveable: false },
    { kind: 'nochevieja', label: 'Nochevieja y Reyes', week: christmas + 1, span: 1, moveable: false },
  ]
}

/**
 * Mapa de traslación entre dos años: para cada semana del histórico, en qué
 * semana del año destino toca colocarla.
 *
 * Solo se mueven las semanas que caen sobre un ancla móvil. El resto se queda
 * donde está: mover el año entero por un desfase de Pascua distorsionaría el
 * verano y la Navidad, que no se mueven.
 */
export function buildWeekMapping(fromYear: number, toYear: number): Map<number, number> {
  const map = new Map<number, number>()
  const from = anchorsFor(fromYear)
  const to = anchorsFor(toYear)

  for (const a of from) {
    if (!a.moveable) continue
    const target = to.find((t) => t.label === a.label)
    if (!target || target.week === a.week) continue
    for (let i = 0; i < a.span; i++) {
      map.set(a.week + i, target.week + i)
    }
  }
  return map
}

/** Explica en una frase qué se ha movido y cuánto. Para enseñárselo al usuario. */
export function describeMapping(fromYear: number, toYear: number): string[] {
  const from = anchorsFor(fromYear)
  const to = anchorsFor(toYear)
  const out: string[] = []
  for (const a of from) {
    if (!a.moveable) continue
    const t = to.find((x) => x.label === a.label)
    if (!t) continue
    if (t.week === a.week) {
      out.push(`${a.label} se queda en la semana ${a.week}.`)
    } else {
      const delta = t.week - a.week
      const dir = delta > 0 ? 'más tarde' : 'antes'
      out.push(
        `${a.label} pasa de la semana ${a.week} a la ${t.week} — ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'semana' : 'semanas'} ${dir}.`,
      )
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// Detección de semanas atípicas
// ─────────────────────────────────────────────────────────────

/** Mediana simple, robusta frente a los propios picos que queremos detectar. */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Detecta las semanas que se salen de la norma y les pone nombre.
 *
 * Se usa la desviación respecto a la MEDIANA, no a la media: con una media, los
 * propios picos suben el listón y dejan de detectarse. El umbral es 18% por
 * defecto, que en hostelería separa bien una semana buena de una semana de
 * fiesta.
 */
export function detectSpecialWeeks(weeks: WeekDemand[], year: number, threshold = 0.18): SpecialWeek[] {
  const totals = weeks.map((w) => w.total)
  const med = median(totals.filter((t) => t > 0))
  if (med === 0) return []

  const anchors = anchorsFor(year)
  const anchorByWeek = new Map<number, Anchor>()
  for (const a of anchors) {
    for (let i = 0; i < a.span; i++) anchorByWeek.set(a.week + i, a)
  }

  const out: SpecialWeek[] = []
  for (const w of weeks) {
    const deviation = (w.total - med) / med

    // Cierre por vacaciones: semana con actividad casi nula.
    if (w.total < med * 0.15) {
      out.push({
        isoWeek: w.isoWeek,
        kind: 'cierre',
        label: 'Cierre o vacaciones',
        deviation,
        confirmed: false,
        excluded: true,
        moveable: false,
      })
      continue
    }

    if (Math.abs(deviation) < threshold) continue

    const anchor = anchorByWeek.get(w.isoWeek)
    if (anchor) {
      out.push({
        isoWeek: w.isoWeek,
        kind: anchor.kind,
        label: anchor.label,
        deviation,
        confirmed: false,
        excluded: false,
        moveable: anchor.moveable,
      })
    } else {
      out.push({
        isoWeek: w.isoWeek,
        kind: deviation > 0 ? 'fiesta-local' : 'anomalia',
        label: deviation > 0 ? 'Pico sin identificar' : 'Semana floja',
        deviation,
        confirmed: false,
        excluded: false,
        moveable: false,
      })
    }
  }
  return out.sort((a, b) => a.isoWeek - b.isoWeek)
}

/** Etiquetas que puede elegir el usuario al corregir una semana detectada. */
export const SPECIAL_LABELS: { kind: SpecialKind; label: string; moveable: boolean }[] = [
  { kind: 'semana-santa', label: 'Semana Santa', moveable: true },
  { kind: 'carnaval', label: 'Carnaval', moveable: true },
  { kind: 'navidad', label: 'Navidad', moveable: false },
  { kind: 'nochevieja', label: 'Nochevieja y Reyes', moveable: false },
  { kind: 'agosto', label: 'Agosto', moveable: false },
  { kind: 'temporada-baja', label: 'Temporada baja', moveable: false },
  { kind: 'puente', label: 'Puente', moveable: true },
  { kind: 'fiesta-local', label: 'Fiesta local', moveable: false },
  { kind: 'cierre', label: 'Cierre o vacaciones', moveable: false },
  { kind: 'anomalia', label: 'Otra cosa', moveable: false },
]
