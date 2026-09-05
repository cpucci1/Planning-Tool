/**
 * Tres métricas derivadas de lo que la herramienta ya calcula, para que el
 * cuadrante se pueda leer y corregir en vez de solo mirarse.
 *
 * Las tres cruzan datos que ya existen (curva de comensales, necesidad por
 * franja, cuadrante generado): no piden ningún dato nuevo al usuario.
 *
 * Lógica pura, no importa React — sigue la misma regla que el resto de `lib/`.
 */

import { DAYS, SLOT_MINUTES, SLOTS_PER_DAY, formatMin, minToSlot, slotStartMin } from './time'
import type { DayIndex, NeedGrid, Roster, StaffingModel } from './types'
import { summarize, totalPeopleGrid } from './staffing'

export interface HolguraFranja {
  day: DayIndex
  slot: number
  /** Horas-persona contratadas de más en esa franja. */
  horasSobrantes: number
  /** "el martes de 17:00 a 19:00", ya formateado. */
  cuando: string
}

export interface RepartoFindes {
  personId: string
  label: string
  /** Sábados o domingos que trabaja. */
  findesTrabajados: number
}

export interface Metricas {
  /** Comensales atendidos por hora-persona trabajada. La medida que usa la
   *  industria para saber si un cuadrante rinde. null si no hay horas. */
  comensalesPorHora: number | null
  /** Las franjas donde más gente sobra, de mayor a menor. Máximo 6. */
  peoresHolguras: HolguraFranja[]
  /** Cuántos findes trabaja cada persona, de más a menos. */
  findes: RepartoFindes[]
  /** Diferencia entre quien más findes trabaja y quien menos. */
  desequilibrioFindes: number
}

/**
 * Personas puestas en el cuadrante, por franja: `[day][slot]`, sumando todos
 * los puestos. Un turno con jornada partida tiene dos bloques ese mismo día y
 * los dos cuentan, porque se recorren todos los bloques de cada turno.
 *
 * Los minutos de los bloques son absolutos sobre la rejilla (GRID_START_MIN);
 * `minToSlot` hace la conversión a franja, no se calcula a mano.
 */
function staffedPeopleGrid(roster: Roster): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  for (const shift of roster.shifts) {
    for (const block of shift.blocks) {
      const startSlot = Math.max(0, minToSlot(block.startMin))
      const endSlot = Math.min(SLOTS_PER_DAY, minToSlot(block.endMin))
      for (let s = startSlot; s < endSlot; s++) {
        grid[shift.day][s] += 1
      }
    }
  }
  return grid
}

/**
 * Agrupa las franjas donde sobra gente (cuadrante > necesidad) en tramos
 * seguidos del mismo día, para no soltar un aviso por cada media hora. Es la
 * parte que hace la métrica accionable en vez de un muro de ruido.
 */
function groupHolguras(staffed: number[][], needed: number[][]): HolguraFranja[] {
  const tramos: HolguraFranja[] = []

  for (let d = 0; d < 7; d++) {
    let groupStart = -1
    let groupHoras = 0

    // Se recorre una franja de más (SLOTS_PER_DAY) para poder cerrar, con el
    // mismo código, un grupo que llegue hasta el final del día.
    for (let s = 0; s <= SLOTS_PER_DAY; s++) {
      const sobra = s < SLOTS_PER_DAY ? staffed[d][s] - needed[d][s] : 0
      const dentroDelGrupo = s < SLOTS_PER_DAY && sobra > 0

      if (dentroDelGrupo) {
        if (groupStart === -1) groupStart = s
        groupHoras += (sobra * SLOT_MINUTES) / 60
        continue
      }

      if (groupStart !== -1) {
        // `s` es la primera franja ya fuera del grupo: su inicio es el fin del tramo.
        const startMin = slotStartMin(groupStart)
        const endMin = slotStartMin(s)
        tramos.push({
          day: d as DayIndex,
          slot: groupStart,
          horasSobrantes: groupHoras,
          cuando: `el ${DAYS[d].toLowerCase()} de ${formatMin(startMin)} a ${formatMin(endMin)}`,
        })
        groupStart = -1
        groupHoras = 0
      }
    }
  }

  return tramos.sort((a, b) => b.horasSobrantes - a.horasSobrantes).slice(0, 6)
}

export function calcularMetricas(
  roster: Roster,
  needGrid: NeedGrid,
  model: StaffingModel,
  lagged: number[][],
): Metricas {
  // 1. Comensales por hora: comensales totales de la semana tipo entre las
  // horas-persona que pide la curva de necesidad. Mismo criterio que
  // `summarize()` — cada franja de necesidad son SLOT_MINUTES minutos de una
  // persona — para que este número case con el resto de la herramienta.
  let totalComensales = 0
  for (const day of lagged) for (const v of day) totalComensales += v
  const { totalHours } = summarize(needGrid, model)
  const comensalesPorHora = totalHours > 0 ? totalComensales / totalHours : null

  // 2. Holgura por franja: gente puesta en el cuadrante menos gente que pide
  // needGrid, franja a franja. Se compara en total (todos los puestos juntos),
  // igual que pide el encargo, no puesto a puesto.
  const staffed = staffedPeopleGrid(roster)
  const needed = totalPeopleGrid(needGrid, model)
  const peoresHolguras = groupHolguras(staffed, needed)

  // 3. Reparto de findes: sábado es el día 5 y domingo el 6 (ver DAYS en
  // lib/time.ts, semana española 0=lunes). Un turno partido en el mismo día
  // de fin de semana solo cuenta una vez: es el mismo día trabajado.
  const findes: RepartoFindes[] = roster.people.map((person) => {
    const trabajaSabado = roster.shifts.some((sh) => sh.personId === person.id && sh.day === 5)
    const trabajaDomingo = roster.shifts.some((sh) => sh.personId === person.id && sh.day === 6)
    return {
      personId: person.id,
      label: person.label,
      findesTrabajados: (trabajaSabado ? 1 : 0) + (trabajaDomingo ? 1 : 0),
    }
  })
  findes.sort((a, b) => b.findesTrabajados - a.findesTrabajados)

  const desequilibrioFindes =
    findes.length > 0
      ? Math.max(...findes.map((f) => f.findesTrabajados)) -
        Math.min(...findes.map((f) => f.findesTrabajados))
      : 0

  return { comensalesPorHora, peoresHolguras, findes, desequilibrioFindes }
}
