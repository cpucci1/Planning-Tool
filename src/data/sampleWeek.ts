/**
 * Curva base de comensales.
 *
 * Son los datos reales de un restaurante de Madrid (menú al mediodía de lunes a
 * viernes, carta por la noche, fin de semana fuerte a las dos horas de comida).
 * Sobre esta curva se generan las 52 semanas del histórico simulado, así que la
 * forma del día — las dos jorobas y el valle de la tarde — es auténtica.
 *
 * Índices de la rejilla: 0 = 06:00, cada paso son 30 minutos (ver lib/time.ts).
 */

import { SLOTS_PER_DAY } from '@/lib/time'

/** [hora, [L, M, X, J, V, S, D]] */
const RAW: [string, number[]][] = [
  ['13:30', [15, 15, 13, 15, 12, 66, 59]],
  ['14:00', [34, 32, 26, 32, 27, 105, 102]],
  ['14:30', [53, 51, 39, 48, 43, 132, 131]],
  ['15:00', [60, 50, 45, 54, 52, 133, 134]],
  ['15:30', [53, 49, 45, 44, 54, 121, 122]],
  ['16:00', [34, 37, 33, 39, 40, 103, 99]],
  ['16:30', [26, 26, 26, 25, 26, 65, 62]],
  ['17:00', [11, 11, 11, 11, 11, 23, 27]],
  ['17:30', [0, 0, 0, 0, 0, 1, 0]],
  ['20:00', [14, 15, 17, 15, 20, 30, 20]],
  ['20:30', [28, 30, 33, 34, 44, 62, 38]],
  ['21:00', [41, 47, 50, 56, 69, 93, 56]],
  ['21:30', [55, 54, 63, 71, 94, 113, 65]],
  ['22:00', [57, 56, 53, 66, 88, 120, 67]],
  ['22:30', [43, 46, 43, 50, 82, 112, 49]],
  ['23:00', [24, 29, 25, 30, 63, 89, 29]],
  ['23:30', [12, 12, 12, 14, 34, 60, 12]],
  ['00:00', [0, 0, 0, 0, 18, 29, 0]],
  ['00:30', [0, 0, 0, 0, 5, 8, 0]],
]

function slotOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const raw = h * 60 + m
  const abs = raw < 6 * 60 ? raw + 1440 : raw
  return (abs - 6 * 60) / 30
}

/** `[day][slot]` = comensales de una semana media. */
export const BASE_WEEK: number[][] = (() => {
  const week = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  for (const [time, values] of RAW) {
    const s = slotOf(time)
    if (s < 0 || s >= SLOTS_PER_DAY) continue
    for (let d = 0; d < 7; d++) week[d][s] = values[d]
  }
  return week
})()

export const BASE_WEEK_TOTAL = BASE_WEEK.flat().reduce((a, b) => a + b, 0)
