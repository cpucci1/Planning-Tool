/**
 * Del cuadrante tipo al cuadrante que se cuelga: fechas reales, códigos de
 * turno, la rueda de semanas y el plazo para publicarlo.
 *
 * El cuadrante que monta `roster.ts` es UNA semana que se repite. Eso tiene
 * dos problemas que cualquier encargado ve a la primera:
 *
 * - Siempre libran los mismos y siempre trabajan el finde los mismos. Con la
 *   rueda, cada persona hace una semana distinta del cuadrante cada semana, y
 *   al cabo de la vuelta todas han hecho todas: los sábados y los domingos se
 *   reparten por igual (revisión del 2026-11-04, punto 12).
 * - No tiene fechas. Lo que se manda al grupo es "la semana del 10 al 16 de
 *   noviembre", con un código por día (M, T, P, L) y las horas de cada uno, y
 *   con tiempo: el Estatuto pide cinco días de preaviso para la distribución
 *   irregular de la jornada, y muchos convenios piden el calendario antes
 *   (punto 24).
 *
 * Lógica pura, sin React: la usan el cuadrante en pantalla, el PDF y las
 * métricas, y tiene que dar lo mismo en los tres.
 */

import { MIN_REST_MIN, descansoSemanalPedidoMin } from './roster'
import { formatMin } from './time'
import type { DayIndex, Person, Role, Roster, Shift } from './types'

// ─────────────────────────────────────────────────────────────
// Códigos de turno
// ─────────────────────────────────────────────────────────────

export type CodigoTurno = 'M' | 'T' | 'N' | 'P' | 'L'

/** Lo que significa cada código, para la leyenda. */
export const LEYENDA_CODIGOS: Record<CodigoTurno, string> = {
  M: 'Mañana',
  T: 'Mediodía y tarde',
  N: 'Noche (cierra a las 23 o más tarde)',
  P: 'Partido (dos tramos)',
  L: 'Libra',
}

/** Entra antes de esta hora y su mitad cae antes de las 14:00: mañana. */
const MANANA_ENTRA_ANTES_MIN = 12 * 60
const MANANA_MITAD_ANTES_MIN = 14 * 60
/** Sale a esta hora o más tarde: noche. */
const NOCHE_SALE_DESDE_MIN = 23 * 60

/**
 * El código de un día (revisión ronda 3, G11). Antes, un 13:00 a 17:30 salía
 * "M · Mañana" porque solo se miraba si la mitad del turno caía antes de las
 * 16:00. Ahora, por este orden:
 *   L: no trabaja.
 *   P: dos tramos el mismo día.
 *   N: sale a las 23:00 o más tarde (cierre).
 *   M: entra antes de las 12:00 y la mitad de su turno cae antes de las 14:00.
 *   T: todo lo demás, que es mediodía y tarde.
 */
export function codigoTurno(sh: Shift | undefined): CodigoTurno {
  if (!sh || sh.blocks.length === 0) return 'L'
  if (sh.blocks.length > 1) return 'P'
  const b = sh.blocks[0]
  if (b.endMin >= NOCHE_SALE_DESDE_MIN) return 'N'
  if (b.startMin < MANANA_ENTRA_ANTES_MIN && (b.startMin + b.endMin) / 2 < MANANA_MITAD_ANTES_MIN) return 'M'
  return 'T'
}

/**
 * "13" o "17:30": la hora corta de un cuadrante de pared. Pasada la
 * medianoche va entera, "00:00", "00:30", "01:00": antes salían a la vez
 * "19:30-24", "19:30-0:30" y "20-1" en el mismo papel (revisión ronda 6, m4).
 */
export function horaCorta(min: number): string {
  if (min >= 1440) return formatMin(min)
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm === 0 ? String(h) : `${h}:${String(mm).padStart(2, '0')}`
}

/** "13-17:30": un tramo con horas cortas. */
export function tramoCorto(startMin: number, endMin: number): string {
  return `${horaCorta(startMin)}-${horaCorta(endMin)}`
}

// ─────────────────────────────────────────────────────────────
// Fechas y preaviso
// ─────────────────────────────────────────────────────────────

/** Días de preaviso con los que se publica el cuadrante (Art. 34.2 ET). */
export const DIAS_PREAVISO = 5

/** Medianoche local de una fecha, para no arrastrar horas en las cuentas. */
function soloDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function sumarDias(d: Date, n: number): Date {
  const out = soloDia(d)
  out.setDate(out.getDate() + n)
  return out
}

/** El lunes de la semana de esa fecha. */
export function lunesDe(d: Date): Date {
  const dia = soloDia(d)
  const desdeLunes = (dia.getDay() + 6) % 7
  return sumarDias(dia, -desdeLunes)
}

/**
 * La primera semana que todavía se puede publicar a tiempo: el primer lunes
 * que queda a cinco días o más de hoy.
 */
export function primerLunesPublicable(hoy: Date): Date {
  let lunes = lunesDe(hoy)
  while (sumarDias(lunes, -DIAS_PREAVISO) < soloDia(hoy)) lunes = sumarDias(lunes, 7)
  return lunes
}

/** Hasta qué día hay que tenerlo publicado para que esa semana llegue con preaviso. */
export function publicarAntesDe(lunes: Date): Date {
  return sumarDias(lunes, -DIAS_PREAVISO)
}

/** "2026-11-09" para un `<input type="date">`, en hora local. */
export function aIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

/** Lee "2026-11-09" en hora local. Null si no es una fecha. */
export function desdeIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

const fmtDiaMes = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })
const fmtNombreDia = new Intl.DateTimeFormat('es-ES', { weekday: 'long' })
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'long' })

/** "del 9 al 15 de noviembre", o "del 30 de noviembre al 6 de diciembre". */
export function rangoSemana(lunes: Date): string {
  const domingo = sumarDias(lunes, 6)
  if (lunes.getMonth() === domingo.getMonth()) return `del ${lunes.getDate()} al ${fmtDiaMes.format(domingo)}`
  return `del ${fmtDiaMes.format(lunes)} al ${fmtDiaMes.format(domingo)}`
}

/** "jueves 4 de noviembre", sin la coma que pone el formato del navegador. */
export function diaLargo(d: Date): string {
  return `${fmtNombreDia.format(d)} ${d.getDate()} de ${fmtMes.format(d)}`
}

// ─────────────────────────────────────────────────────────────
// La rueda
// ─────────────────────────────────────────────────────────────

/** Por encima de esta gente en un grupo, el orden de la rueda no se busca: se toma tal cual. */
const MAX_GRUPO_BUSQUEDA = 8

export interface GrupoRueda {
  roleId: string
  /** Horas de contrato que comparten. */
  contractHours: number
  /** Las personas, en el orden de la rueda. */
  personIds: string[]
  /** Más días seguidos trabajando que salen al pasar de una semana a otra. */
  maxDiasSeguidos: number
}

export interface Rueda {
  /**
   * Semanas hasta que todo el cuadrante vuelve a ser el de la primera: cada
   * grupo da su vuelta en tantas semanas como personas tiene, y esto es el
   * mínimo común múltiplo. 1 = no hay rueda.
   */
  semanas: number
  grupos: GrupoRueda[]
  /** Personas que no rotan: los parciales (su contrato es de esos días) y quien va solo. */
  fijos: string[]
  /** Grupos que no se pueden rotar sin romper las 12 h entre el domingo de una semana y el lunes de la siguiente. */
  sinRotar: string[]
}

/**
 * Agrupa a la gente que puede cambiarse la semana entre sí (mismo puesto y
 * mismo contrato) y busca el orden en que pasa cada uno de una semana del
 * cuadrante a la siguiente.
 *
 * Al cambiar de semana, el domingo de una fila va seguido del lunes de la
 * siguiente, así que el orden importa: si alguien cierra el domingo a la
 * 01:00 no puede abrir el lunes a las 12:00, y si una fila trabaja de
 * miércoles a domingo y la siguiente de lunes a viernes, salen diez días
 * seguidos. Se elige el orden que respeta las 12 h y deja menos días
 * seguidos. Si no hay ninguno que respete las 12 h, ese grupo no rota y se
 * dice.
 *
 * Los parciales no entran: su contrato es de unos días concretos (un fin de
 * semana, unas noches), y cambiárselos sería cambiarles el contrato.
 */
export function calcularRueda(
  roster: Roster,
  settings: { minRestBetweenShifts: boolean },
  roles: readonly Role[] = [],
): Rueda {
  // La jornada completa es el contrato más largo del cuadrante (40 h con la lista por defecto).
  const jornadaCompleta = roster.people.reduce((a, p) => Math.max(a, p.contractHours), 0)
  const porPersona = new Map<string, Shift[]>()
  for (const sh of roster.shifts) {
    const l = porPersona.get(sh.personId)
    if (l) l.push(sh)
    else porPersona.set(sh.personId, [sh])
  }
  const trabajo = (id: string) => {
    const dias = new Array<Shift | undefined>(7).fill(undefined)
    for (const sh of porPersona.get(id) ?? []) dias[sh.day] = sh
    return dias
  }

  const grupos = new Map<string, Person[]>()
  const fijos: string[] = []
  for (const p of roster.people) {
    if (p.contractHours < jornadaCompleta) {
      fijos.push(p.id)
      continue
    }
    const k = `${p.roleId}|${p.contractHours}`
    const l = grupos.get(k)
    if (l) l.push(p)
    else grupos.set(k, [p])
  }

  const out: Rueda = { semanas: 1, grupos: [], fijos, sinRotar: [] }
  for (const gente of grupos.values()) {
    if (gente.length < 2) {
      fijos.push(...gente.map((p) => p.id))
      continue
    }
    const filas = gente.map((p) => trabajo(p.id))
    const descansoMin = descansoSemanalPedidoMin(roles.find((r) => r.id === gente[0].roleId))
    const orden = mejorOrden(filas, settings.minRestBetweenShifts, descansoMin)
    if (!orden) {
      out.sinRotar.push(...gente.map((p) => p.id))
      fijos.push(...gente.map((p) => p.id))
      continue
    }
    out.grupos.push({
      roleId: gente[0].roleId,
      contractHours: gente[0].contractHours,
      personIds: orden.orden.map((i) => gente[i].id),
      maxDiasSeguidos: orden.maxSeguidos,
    })
    out.semanas = mcm(out.semanas, gente.length)
  }
  return out
}

function mcm(a: number, b: number): number {
  const mcd = (x: number, y: number): number => (y === 0 ? x : mcd(y, x % y))
  return (a * b) / mcd(a, b)
}

/** ¿Se puede pasar de la semana `a` a la semana `b` sin romper las 12 h, y cuántos días seguidos salen? */
function transicion(a: (Shift | undefined)[], b: (Shift | undefined)[], conDescanso: boolean): number | null {
  const dom = a[6]
  const lun = b[0]
  if (conDescanso && dom && lun) {
    const fin = Math.max(...dom.blocks.map((x) => x.endMin))
    const ini = Math.min(...lun.blocks.map((x) => x.startMin))
    if (1440 + ini - fin < MIN_REST_MIN) return null
  }
  // Días seguidos que cruzan el cambio de semana: los del final de `a` más los del principio de `b`.
  let cola = 0
  for (let d = 6; d >= 0 && a[d]; d--) cola++
  let cabeza = 0
  for (let d = 0; d < 7 && b[d]; d++) cabeza++
  return cola + cabeza
}

/** Inicio y fin de cada turno de una fila, en minutos desde el lunes a las 00:00 de esa semana. */
function tramos(fila: (Shift | undefined)[], semana: number): [number, number][] {
  const out: [number, number][] = []
  fila.forEach((sh, d) => {
    if (!sh || sh.blocks.length === 0) return
    const base = (semana * 7 + d) * 1440
    out.push([base + Math.min(...sh.blocks.map((x) => x.startMin)), base + Math.max(...sh.blocks.map((x) => x.endMin))])
  })
  return out
}

/**
 * El descanso seguido más largo que tiene la semana `cur` cuando va entre
 * `prev` y `next` en la rueda (ronda 9, hallazgo 4 de cálculo). Cuenta los
 * descansos que tocan la semana: el que viene de `prev`, los de dentro y el
 * que sigue hacia `next`. Antes solo se miraban las 12 h del cambio, y una
 * fila cuyo descanso largo era el del domingo al lunes de SU misma semana lo
 * perdía al ir seguida de otra: salían semanas de 34,5 h.
 */
function descansoMaxEnRueda(prev: (Shift | undefined)[], cur: (Shift | undefined)[], next: (Shift | undefined)[]): number {
  const t = [...tramos(prev, -1), ...tramos(cur, 0), ...tramos(next, 1)].sort((a, b) => a[0] - b[0])
  const iniSemana = 0
  const finSemana = 7 * 1440
  let max = 0
  for (let i = 1; i < t.length; i++) {
    const desde = t[i - 1][1]
    const hasta = t[i][0]
    // Solo los huecos que caen, al menos en parte, dentro de la semana `cur`.
    if (hasta > iniSemana && desde < finSemana) max = Math.max(max, hasta - desde)
  }
  return t.length === 0 ? Number.POSITIVE_INFINITY : max
}

/** ¿Tiene cada semana del ciclo su descanso semanal? */
function cicloConDescanso(filas: (Shift | undefined)[][], orden: number[], descansoMin: number): boolean {
  const n = orden.length
  for (let i = 0; i < n; i++) {
    const prev = filas[orden[(i - 1 + n) % n]]
    const cur = filas[orden[i]]
    const next = filas[orden[(i + 1) % n]]
    if (descansoMaxEnRueda(prev, cur, next) < descansoMin) return false
  }
  return true
}

/**
 * El orden cíclico de las filas (quién pasa a qué semana) que respeta las 12 h
 * en todos los cambios y deja menos días seguidos. Con pocos se prueban todos;
 * con muchos, se va eligiendo el siguiente que mejor encaja.
 */
function mejorOrden(
  filas: (Shift | undefined)[][],
  conDescanso: boolean,
  descansoMin: number,
): { orden: number[]; maxSeguidos: number } | null {
  const n = filas.length
  const t: (number | null)[][] = filas.map((a) => filas.map((b) => transicion(a, b, conDescanso)))
  let mejor: number[] | null = null
  let mejorMax = Number.POSITIVE_INFINITY

  if (n <= MAX_GRUPO_BUSQUEDA) {
    // La primera fila fija (es un ciclo): se permutan las demás.
    const resto = Array.from({ length: n - 1 }, (_, i) => i + 1)
    const camino = [0]
    const usado = new Array<boolean>(n).fill(false)
    usado[0] = true
    const probar = (maxHasta: number) => {
      if (maxHasta >= mejorMax) return
      if (camino.length === n) {
        const cierre = t[camino[n - 1]][camino[0]]
        if (cierre === null) return
        const m = Math.max(maxHasta, cierre)
        if (m < mejorMax && cicloConDescanso(filas, camino, descansoMin)) {
          mejorMax = m
          mejor = [...camino]
        }
        return
      }
      for (const j of resto) {
        if (usado[j]) continue
        const v = t[camino[camino.length - 1]][j]
        if (v === null) continue
        usado[j] = true
        camino.push(j)
        probar(Math.max(maxHasta, v))
        camino.pop()
        usado[j] = false
      }
    }
    probar(0)
  } else {
    const camino = [0]
    const usado = new Set([0])
    let max = 0
    while (camino.length < n) {
      const de = camino[camino.length - 1]
      let elegido = -1
      let mejorV = Number.POSITIVE_INFINITY
      for (let j = 0; j < n; j++) {
        if (usado.has(j)) continue
        const v = t[de][j]
        if (v !== null && v < mejorV) {
          mejorV = v
          elegido = j
        }
      }
      if (elegido < 0) return null
      camino.push(elegido)
      usado.add(elegido)
      max = Math.max(max, mejorV)
    }
    const cierre = t[camino[n - 1]][0]
    if (cierre === null) return null
    if (!cicloConDescanso(filas, camino, descansoMin)) return null
    mejor = camino
    mejorMax = Math.max(max, cierre)
  }
  return mejor ? { orden: mejor, maxSeguidos: mejorMax } : null
}

/**
 * Qué semana del cuadrante hace cada persona en la semana `w` de la rueda
 * (empezando en 0): el id de la persona cuya fila le toca. Sin rueda, o para
 * quien no rota, la suya.
 */
export function filaEnSemana(rueda: Rueda, personId: string, w: number): string {
  for (const g of rueda.grupos) {
    const i = g.personIds.indexOf(personId)
    if (i < 0) continue
    const n = g.personIds.length
    return g.personIds[(((i + w) % n) + n) % n]
  }
  return personId
}

/** Los turnos que hace cada persona en la semana `w` de la rueda, con su propio id. */
export function turnosEnSemana(roster: Roster, rueda: Rueda, w: number): Shift[] {
  if (w === 0 || rueda.grupos.length === 0) return roster.shifts
  const porPersona = new Map<string, Shift[]>()
  for (const sh of roster.shifts) {
    const l = porPersona.get(sh.personId)
    if (l) l.push(sh)
    else porPersona.set(sh.personId, [sh])
  }
  const out: Shift[] = []
  for (const p of roster.people) {
    const fila = filaEnSemana(rueda, p.id, w)
    for (const sh of porPersona.get(fila) ?? []) out.push({ ...sh, id: `${p.id}-${sh.day}-s${w}`, personId: p.id })
  }
  return out
}

/**
 * Días de fin de semana (sábado y domingo) que trabaja de media cada persona
 * a la semana, a lo largo de su vuelta de la rueda. Sin rueda, los de su
 * única semana.
 */
export function findesDeMedia(roster: Roster, rueda: Rueda): Map<string, number> {
  const finde = new Map<string, number>()
  for (const p of roster.people) finde.set(p.id, 0)
  for (const sh of roster.shifts) {
    if (sh.day === 5 || sh.day === 6) finde.set(sh.personId, (finde.get(sh.personId) ?? 0) + 1)
  }
  const out = new Map<string, number>()
  for (const p of roster.people) out.set(p.id, finde.get(p.id) ?? 0)
  for (const g of rueda.grupos) {
    const media = g.personIds.reduce((a, id) => a + (finde.get(id) ?? 0), 0) / g.personIds.length
    for (const id of g.personIds) out.set(id, media)
  }
  return out
}

/** Para que el tipo de los días no se pierda al indexar. */
export const SEMANA: DayIndex[] = [0, 1, 2, 3, 4, 5, 6]
