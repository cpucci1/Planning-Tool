/**
 * Traduce el cuadrante ya generado a avisos en lenguaje de persona.
 *
 * No calcula nada nuevo: relee `Roster` (y los `Settings` con los que se
 * construyó) y cuenta en castellano lo que ya está ahí. El criterio de
 * descanso es el MISMO que aplica `buildRoster` al montar el cuadrante
 * (`dayRestOk`/`restOk` en `roster.ts`): si aquí se inventara otro, un
 * cuadrante ya válido podría salir marcado como incumplidor, o al revés.
 */

import { DAYS } from './time'
import type { DayIndex, Roster, Settings, Shift, StaffingModel } from './types'

export type AvisoTipo = 'descanso' | 'libranzas' | 'horas' | 'sin-cubrir'

export interface Aviso {
  tipo: AvisoTipo
  /** 'legal' = incumple una norma; 'aviso' = está mal pero no es ilegal. */
  gravedad: 'legal' | 'aviso'
  personId: string | null
  personLabel: string | null
  /** Frase corta en castellano, lista para enseñar tal cual. */
  mensaje: string
  /** Días implicados, para poder resaltar después. */
  days: DayIndex[]
}

/** Igual que en roster.ts: 12h entre el fin de un turno y el inicio del siguiente (Art. 34.3 ET). */
const MIN_REST_MIN = 12 * 60

/** "lunes y martes" — la lista de días como la diría un encargado, no una coma suelta. */
function listarDias(days: DayIndex[]): string {
  const nombres = days.map((d) => DAYS[d].toLowerCase())
  if (nombres.length === 0) return ''
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** Coma española y sin decimales de más: "10" o "10,5", nunca "10.5". */
function fmtNumero(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/** El turno de una persona en un día concreto. Como mucho hay uno por persona y día. */
function turnoDe(shifts: Shift[], personId: string, day: DayIndex): Shift | undefined {
  return shifts.find((s) => s.personId === personId && s.day === day)
}

// ─────────────────────────────────────────────────────────────
// 1. Descanso de 12h entre turnos (Art. 34.3 ET)
// ─────────────────────────────────────────────────────────────

/**
 * Recorre los 7 pares de días consecutivos (domingo-lunes incluido, porque la
 * semana se repite) y mide el hueco real entre el cierre de uno y la apertura
 * del siguiente. Los minutos de los bloques son "minutos desde la medianoche
 * del día que abre" y pueden pasar de 1440 si el turno cierra de madrugada, así
 * que el hueco siempre es `1440 + inicio del día siguiente - fin de este día`:
 * la misma cuenta funciona cierre normal o de madrugada, sin arrastrar un reloj
 * absoluto de la semana.
 */
function avisosDescanso(roster: Roster, settings: Settings): Aviso[] {
  if (!settings.minRestBetweenShifts) return []
  const avisos: Aviso[] = []

  for (const person of roster.people) {
    for (let d = 0; d < 7; d++) {
      const dia = d as DayIndex
      const diaSiguiente = ((d + 1) % 7) as DayIndex
      const hoy = turnoDe(roster.shifts, person.id, dia)
      const manana = turnoDe(roster.shifts, person.id, diaSiguiente)
      if (!hoy || !manana) continue

      const fin = Math.max(...hoy.blocks.map((b) => b.endMin))
      const inicio = Math.min(...manana.blocks.map((b) => b.startMin))
      const descansoMin = 1440 + inicio - fin
      if (descansoMin >= MIN_REST_MIN) continue

      avisos.push({
        tipo: 'descanso',
        gravedad: 'legal',
        personId: person.id,
        personLabel: person.label,
        mensaje: `${person.label} cierra el ${DAYS[dia].toLowerCase()} y abre el ${DAYS[diaSiguiente].toLowerCase()}: solo ${fmtNumero(descansoMin / 60)} h de descanso, la ley pide 12.`,
        days: [dia, diaSiguiente],
      })
    }
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 2. Libranzas no consecutivas
// ─────────────────────────────────────────────────────────────

/**
 * True si los días libres forman un único tramo continuo en el círculo de la
 * semana (domingo-lunes son vecinos). Se cuenta cuántas veces un día libre
 * viene precedido de uno trabajado: un solo arranque de tramo es un bloque
 * seguido; más de uno son libranzas repartidas y sueltas.
 */
function libranzasSeguidas(daysOff: DayIndex[]): boolean {
  if (daysOff.length <= 1) return true
  const libra = new Array(7).fill(false)
  for (const d of daysOff) libra[d] = true
  let tramos = 0
  for (let d = 0; d < 7; d++) {
    if (libra[d] && !libra[(d + 6) % 7]) tramos++
  }
  return tramos <= 1
}

function avisosLibranzas(roster: Roster, settings: Settings): Aviso[] {
  if (!settings.consecutiveDaysOff) return []
  const avisos: Aviso[] = []

  for (const person of roster.people) {
    if (libranzasSeguidas(person.daysOff)) continue

    avisos.push({
      tipo: 'libranzas',
      gravedad: 'aviso',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label} libra ${listarDias(person.daysOff)}: son días sueltos, no seguidos.`,
      days: person.daysOff,
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 3. Horas por encima del contrato
// ─────────────────────────────────────────────────────────────

/**
 * El puesto se cuela en el mensaje porque `person.label` puede ser ya un
 * nombre real (el usuario lo ha editado) y entonces el puesto es la única
 * pista de quién es quién en la lista de avisos.
 */
function avisosHoras(roster: Roster, model: StaffingModel): Aviso[] {
  const avisos: Aviso[] = []

  for (const person of roster.people) {
    if (person.assignedHours <= person.contractHours) continue

    const role = model.roles.find((r) => r.id === person.roleId)
    const puesto = role ? ` (${role.name})` : ''

    avisos.push({
      tipo: 'horas',
      gravedad: 'legal',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label}${puesto} tiene ${fmtNumero(person.assignedHours)} h asignadas: su contrato es de ${fmtNumero(person.contractHours)} h.`,
      days: [],
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 4. Franjas sin cubrir
// ─────────────────────────────────────────────────────────────

function avisoSinCubrir(roster: Roster): Aviso[] {
  if (roster.uncoveredHours <= 0) return []

  return [
    {
      tipo: 'sin-cubrir',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje: `Quedan ${fmtNumero(roster.uncoveredHours)} h a la semana sin nadie que las cubra: no caben en ninguna jornada de las que tienes activadas.`,
      days: [],
    },
  ]
}

// ─────────────────────────────────────────────────────────────

export function revisarCuadrante(roster: Roster, model: StaffingModel, settings: Settings): Aviso[] {
  const avisos = [
    ...avisosDescanso(roster, settings),
    ...avisosHoras(roster, model),
    ...avisosLibranzas(roster, settings),
    ...avisoSinCubrir(roster),
  ]

  // Primero lo legal, después lo que es solo mejorable. Dentro de cada grupo
  // se respeta el orden en que se generó, así que el sort es estable a propósito.
  return avisos.sort((a, b) => {
    if (a.gravedad === b.gravedad) return 0
    return a.gravedad === 'legal' ? -1 : 1
  })
}
