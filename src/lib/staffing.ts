/**
 * De comensales a personas.
 *
 * El usuario define los tramos ("de 11 a 25 comensales: 2 camareros, 1 cocina,
 * 1 office") y aquí se aplican franja a franja sobre la semana tipo ya
 * desplazada por el desgaste.
 *
 * Regla de negocio importante: cuando hay CERO comensales en una franja pero el
 * local está abierto, no se busca tramo — se deja a cero. El personal de
 * apertura y cierre no sale de la curva de comensales, sale del horario, y
 * mezclarlo aquí infla la plantilla en las horas muertas.
 */

import { SLOTS_PER_DAY, SLOT_MINUTES, slotStartMin } from './time'
import type { DayIndex, NeedGrid, NeedSummary, StaffingModel, Tier, OpeningHours } from './types'

/** Tramo al que corresponde un número de comensales. */
export function tierFor(tiers: Tier[], covers: number): Tier | null {
  if (covers <= 0) return null
  for (const t of tiers) {
    if (covers >= t.from && covers <= t.to) return t
  }
  // Por encima del último tramo se aplica el último: mejor pasarse que quedarse
  // corto, y el usuario siempre puede añadir un tramo más arriba.
  return tiers.length > 0 ? tiers[tiers.length - 1] : null
}

/**
 * Necesidad de personal: `[roleId][day][slot]` = personas.
 *
 * `week` son los comensales ya desplazados por el desgaste.
 */
export function buildNeedGrid(week: number[][], model: StaffingModel): NeedGrid {
  const grid: NeedGrid = {}
  for (const role of model.roles) {
    grid[role.id] = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  }

  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const tier = tierFor(model.tiers, week[d][s])
      if (!tier) continue
      for (const role of model.roles) {
        grid[role.id][d][s] = tier.staff[role.id] ?? 0
      }
    }
  }
  return grid
}

/**
 * Recorta la necesidad de UN bloque a un horario propio, más corto o
 * desplazado que el general — típicamente cocina, que puede cerrar antes que
 * sala. Fuera de ese horario, el bloque deja de pedir gente aunque el resto
 * del local siga abierto y todavía haya comensales en la curva.
 *
 * Ojo: esto solo puede RECORTAR, nunca añadir. Si el horario propio se
 * adelanta a que abra sala (para el personal que prepara antes del servicio),
 * ahí no hay comensales en la curva y por tanto tampoco tramo — ese hueco no
 * lo cubre esta función, lo cubriría un mínimo de apertura por bloque
 * (`applyOpeningMinimums`), que es la extensión natural si hace falta.
 */
export function clampNeedToBlockHours(
  grid: NeedGrid,
  model: StaffingModel,
  blockId: string,
  hours: OpeningHours,
): NeedGrid {
  const out: NeedGrid = { ...grid }
  for (const role of model.roles) {
    if (role.blockId !== blockId || !out[role.id]) continue
    out[role.id] = out[role.id].map((day, d) => {
      const blocks = hours[d] ?? []
      return day.map((v, s) => {
        const min = slotStartMin(s)
        return blocks.some((b) => min >= b.startMin && min < b.endMin) ? v : 0
      })
    })
  }
  return out
}

/**
 * Añade el personal de apertura y cierre: las franjas de horario en las que aún
 * no hay (o ya no hay) comensales pero alguien tiene que estar. Se aplica un
 * mínimo por bloque, configurable, sin tocar las franjas con servicio.
 */
export function applyOpeningMinimums(
  grid: NeedGrid,
  hours: OpeningHours,
  model: StaffingModel,
  minimumsByBlock: Record<string, number>,
): NeedGrid {
  const out: NeedGrid = {}
  for (const k of Object.keys(grid)) out[k] = grid[k].map((r) => [...r])

  for (const block of model.blocks) {
    const min = minimumsByBlock[block.id] ?? 0
    if (min <= 0) continue
    // El mínimo lo cubre el primer puesto declarado del bloque: es el
    // responsable de abrir, y así el cuadrante le asigna a alguien concreto.
    const role = model.roles.find((r) => r.blockId === block.id)
    if (!role) continue

    for (let d = 0; d < 7; d++) {
      for (const b of hours[d] ?? []) {
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
          const minAbs = 6 * 60 + s * SLOT_MINUTES
          if (minAbs < b.startMin || minAbs >= b.endMin) continue
          const totalHere = model.roles
            .filter((r) => r.blockId === block.id)
            .reduce((acc, r) => acc + out[r.id][d][s], 0)
          if (totalHere < min) out[role.id][d][s] += min - totalHere
        }
      }
    }
  }
  return out
}

/** Horas-persona, picos y totales a partir de la rejilla de necesidad. */
export function summarize(grid: NeedGrid, model: StaffingModel): NeedSummary {
  const hoursByRole: Record<string, number> = {}
  const hoursByBlock: Record<string, number> = {}
  let totalHours = 0
  let peak = { people: 0, day: 0 as DayIndex, slot: 0 }

  for (const role of model.roles) {
    let h = 0
    for (const day of grid[role.id] ?? []) for (const v of day) h += v
    h = (h * SLOT_MINUTES) / 60
    hoursByRole[role.id] = h
    hoursByBlock[role.blockId] = (hoursByBlock[role.blockId] ?? 0) + h
    totalHours += h
  }

  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      let people = 0
      for (const role of model.roles) people += grid[role.id]?.[d][s] ?? 0
      if (people > peak.people) peak = { people, day: d as DayIndex, slot: s }
    }
  }

  return { hoursByRole, hoursByBlock, totalHours, peak }
}

/** Personas simultáneas por franja, sumando todos los puestos. `[day][slot]`. */
export function totalPeopleGrid(grid: NeedGrid, model: StaffingModel): number[][] {
  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: SLOTS_PER_DAY }, (_, s) =>
      model.roles.reduce((acc, r) => acc + (grid[r.id]?.[d][s] ?? 0), 0),
    ),
  )
}

/** Personas simultáneas por franja de un bloque concreto. */
export function blockPeopleGrid(grid: NeedGrid, model: StaffingModel, blockId: string): number[][] {
  const roles = model.roles.filter((r) => r.blockId === blockId)
  return Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: SLOTS_PER_DAY }, (_, s) =>
      roles.reduce((acc, r) => acc + (grid[r.id]?.[d][s] ?? 0), 0),
    ),
  )
}

/**
 * Valida los tramos y devuelve los problemas en lenguaje llano, para pintarlos
 * junto a la tabla en vez de dejar que el cálculo salga mal en silencio.
 */
export function validateTiers(tiers: Tier[]): { tierId: string; message: string }[] {
  const issues: { tierId: string; message: string }[] = []
  const sorted = [...tiers].sort((a, b) => a.from - b.from)

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    if (t.to < t.from) {
      issues.push({ tierId: t.id, message: 'El final del tramo es menor que el inicio.' })
    }
    const prev = sorted[i - 1]
    if (prev) {
      if (t.from <= prev.to) {
        issues.push({ tierId: t.id, message: `Se solapa con el tramo de ${prev.from} a ${prev.to}.` })
      } else if (t.from > prev.to + 1) {
        issues.push({
          tierId: t.id,
          message: `Quedan comensales sin tramo entre ${prev.to + 1} y ${t.from - 1}.`,
        })
      }
    }
  }
  return issues
}

/** Reordena los tramos por comensales y renumera los límites para que encajen. */
export function normalizeTiers(tiers: Tier[]): Tier[] {
  const sorted = [...tiers].sort((a, b) => a.from - b.from)
  return sorted.map((t, i) => {
    const next = sorted[i + 1]
    const to = i === sorted.length - 1 ? Number.POSITIVE_INFINITY : next ? next.from - 1 : t.to
    return { ...t, to: Math.max(t.from, to) }
  })
}
