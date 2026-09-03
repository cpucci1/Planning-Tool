/**
 * Rejilla temporal.
 *
 * Todo el producto trabaja en franjas de 30 minutos. Una jornada de restaurante
 * cruza la medianoche, así que la rejilla no son "las 24 horas del día" sino una
 * ventana que arranca por la mañana y termina de madrugada. Los minutos se
 * cuentan desde las 00:00 del día que abre, de modo que las 02:00 de la
 * madrugada siguiente son el minuto 1560 — no el 120.
 *
 * Esa decisión evita el error clásico de que un turno de 21:00 a 01:00 salga
 * "negativo" al restar horas.
 */

export const SLOT_MINUTES = 30

/** 06:00 — nadie sirve comensales antes. */
export const GRID_START_MIN = 6 * 60

/** 04:00 del día siguiente, expresado como minuto 1680. */
export const GRID_END_MIN = 28 * 60

export const SLOTS_PER_DAY = (GRID_END_MIN - GRID_START_MIN) / SLOT_MINUTES // 44

/** 0 = lunes … 6 = domingo. Semana española, no americana. */
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
export const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Minuto absoluto en el que empieza la franja `i`. */
export function slotStartMin(i: number): number {
  return GRID_START_MIN + i * SLOT_MINUTES
}

/** Franja a la que pertenece un minuto absoluto. Puede caer fuera de la rejilla. */
export function minToSlot(min: number): number {
  return Math.floor((min - GRID_START_MIN) / SLOT_MINUTES)
}

/**
 * "13:30", "01:00". Los minutos por encima de 1440 se pintan como hora normal:
 * en un cuadrante nadie escribe "25:00".
 */
export function formatMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function formatSlot(i: number): string {
  return formatMin(slotStartMin(i))
}

/** "13:00 - 17:00" a partir de dos minutos absolutos. */
export function formatRange(startMin: number, endMin: number): string {
  return `${formatMin(startMin)} - ${formatMin(endMin)}`
}

/** True si el minuto cae ya en la madrugada del día siguiente. */
export function isAfterMidnight(min: number): boolean {
  return min >= 1440
}

/** Parsea "21:30" a minutos. Devuelve null si no es una hora válida. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 29 || min > 59) return null
  return h * 60 + min
}

/**
 * Convierte una hora del reloj a minuto de rejilla. Las horas pequeñas se
 * interpretan como madrugada del día siguiente: 01:00 en un horario de noche
 * es el minuto 1500, no el 60.
 */
export function clockToGridMin(h: number, m: number): number {
  const raw = h * 60 + m
  return raw < GRID_START_MIN ? raw + 1440 : raw
}

/** Franjas de la rejilla como array de índices, para iterar en JSX. */
export const ALL_SLOTS: number[] = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i)

/** Horas en punto, para pintar las etiquetas del eje sin saturarlo. */
export function isHourMark(i: number): boolean {
  return slotStartMin(i) % 60 === 0
}
