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

import { GRID_END_MIN, GRID_START_MIN, SLOTS_PER_DAY, SLOT_MINUTES, slotStartMin } from './time'
import type { DayIndex, NeedGrid, NeedSummary, Role, StaffingModel, Tier, OpeningHours, TrabajoFijo } from './types'

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
 * ¿Se queda corto el último tramo? Por encima del último se aplica el último
 * (`tierFor`), y con un local mucho más grande que la tabla eso es quedarse
 * corto sin decirlo (revisión del cálculo, m1). Se da por superado cuando el
 * pico pasa del último tramo más una anchura del tramo anterior: con los de
 * partida, de 321 en adelante pensado hasta unos 380.
 *
 * Devuelve el tramo y desde dónde se queda corto, o `null` si cabe.
 */
export function tramoSuperado(tiers: Tier[], peak: number): { tier: Tier; hasta: number } | null {
  if (tiers.length === 0 || peak <= 0) return null
  const ord = [...tiers].sort((a, b) => a.from - b.from)
  const ultimo = ord[ord.length - 1]
  if (Number.isFinite(ultimo.to)) return peak > ultimo.to ? { tier: ultimo, hasta: ultimo.to } : null
  const anterior = ord.length > 1 ? ord[ord.length - 2] : null
  const ancho = anterior ? Math.max(1, ultimo.from - anterior.from) : ultimo.from
  const hasta = ultimo.from + ancho - 1
  return peak > hasta ? { tier: ultimo, hasta } : null
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
        // Los mandos no salen de los tramos: van por horario (roster.ts,
        // planificarMandos). Se quedan a cero aquí aunque un plan viejo traiga
        // una columna con números.
        if (role.kind === 'estructura') continue
        // El suelo del tramo solo actúa DENTRO del tramo: con cero comensales
        // no hay tramo, y ahí sigue mandando "local abierto sin servicio no
        // pide gente" (eso lo cubre el mínimo por local, si lo hay).
        const target = tier.staff[role.id] ?? 0
        grid[role.id][d][s] = Math.max(target, tier.staffMin?.[role.id] ?? 0)
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
 * ahí no hay comensales en la curva y por tanto tampoco tramo — ese hueco lo
 * cubre `applyOpeningMinimums`, el mínimo por local, que corre justo después.
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
 * no hay (o ya no hay) comensales pero alguien tiene que estar — el mínimo que
 * pide un local por el simple hecho de estar abierto, independiente de la
 * curva de demanda. Se aplica un mínimo por bloque, configurable, sin tocar
 * las franjas donde el servicio ya pide más gente que ese mínimo.
 *
 * `hoursForBlock` resuelve el horario de CADA bloque por separado: cocina
 * puede tener uno propio (ver el toggle de horario de cocina), y el mínimo
 * tiene que respetarlo, no el horario general.
 *
 * `openingRoleByBlock` es el puesto que elige el usuario para abrir y cerrar
 * cada zona. Sin elección, `openingRoleFor` toma el puesto más básico con
 * gente en los tramos.
 */
export function applyOpeningMinimums(
  grid: NeedGrid,
  model: StaffingModel,
  minimumsByBlock: Record<string, number>,
  hoursForBlock: (blockId: string) => OpeningHours,
  openingRoleByBlock: Record<string, string> = {},
): NeedGrid {
  const out: NeedGrid = {}
  for (const k of Object.keys(grid)) out[k] = grid[k].map((r) => [...r])

  for (const block of model.blocks) {
    const min = minimumsByBlock[block.id] ?? 0
    if (min <= 0) continue
    const role = openingRoleFor(model, block.id, openingRoleByBlock[block.id])
    if (!role) continue
    const hours = hoursForBlock(block.id)

    for (let d = 0; d < 7; d++) {
      for (const b of hours[d] ?? []) {
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
          const minAbs = slotStartMin(s)
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

/**
 * Quién abre y cierra una zona: el puesto que cubre el mínimo por local y el
 * que, sin elección del usuario, se toma por defecto.
 *
 * Si el usuario ha elegido uno y sigue existiendo en esa zona, ese. Si no, el
 * puesto MÁS BÁSICO que tenga gente en los tramos: el que aparece ya en el
 * tramo más bajo, y a igualdad, el que más gente suma en todos los tramos (en
 * los de partida, el camarero frente al responsable de sala, y el cocinero).
 *
 * Antes se cogía el primer puesto declarado que no fuera de solo jornada
 * completa. En cocina ese era el jefe de partida, que arranca a cero en todos
 * los tramos: el mínimo se lo comía un puesto que el local ni tiene, y el
 * cuadrante sacaba una persona de un puesto fantasma.
 *
 * Nunca uno de solo jornada completa si hay otro: abrir y cerrar son unas
 * 20 h y obligarían a un contrato de 40 h con medio sueldo sin trabajo. Y
 * nunca un mando, ni aunque el usuario lo tuviera elegido de antes.
 */
export function openingRoleFor(model: StaffingModel, blockId: string, chosenId?: string): Role | null {
  // ⚠️ Nunca un mando (`kind: 'estructura'`): el cuadrante no reparte turnos
  // de volumen a los mandos (van por horario, `planificarMandos`), así que el
  // mínimo que se le cargara a uno se perdería sin ningún error. Una zona que
  // solo tiene mandos no tiene quién abra: ahí ya hay siempre un mando al
  // frente, y el mínimo de más no se puede asignar a nadie.
  const own = model.roles.filter((r) => r.blockId === blockId && r.kind !== 'estructura')
  if (own.length === 0) return null
  const chosen = chosenId ? own.find((r) => r.id === chosenId) : undefined
  if (chosen) return chosen

  const tiers = [...model.tiers].sort((a, b) => a.from - b.from)
  const candidates = own.some((r) => !r.fullTimeOnly) ? own.filter((r) => !r.fullTimeOnly) : own
  let best: Role | null = null
  let bestFirst = Number.POSITIVE_INFINITY
  let bestTotal = -1
  for (const r of candidates) {
    const first = tiers.findIndex((t) => (t.staff[r.id] ?? 0) > 0 || (t.staffMin?.[r.id] ?? 0) > 0)
    if (first < 0) continue
    const total = tiers.reduce((acc, t) => acc + (t.staff[r.id] ?? 0), 0)
    if (first < bestFirst || (first === bestFirst && total > bestTotal)) {
      best = r
      bestFirst = first
      bestTotal = total
    }
  }
  // Ningún puesto con gente en los tramos: el primero que no sea de mando.
  return best ?? candidates[0]
}

/** Minutos de preparación antes de abrir y de recogida después de cerrar, de UNA zona. */
export interface PrepWindow {
  beforeMin: number
  afterMin: number
}

/**
 * Preparación y recogida: la gente que abre entra antes y la que cierra sale
 * después.
 *
 * En cada tramo del horario de cada zona se busca la primera franja con
 * necesidad: el equipo de esa franja (puesto a puesto) se adelanta hasta
 * `beforeMin` antes de abrir. Y el equipo de la última franja con necesidad
 * se queda hasta `afterMin` después de cerrar. No es una persona más: son las
 * mismas que empiezan y terminan el servicio, con su turno más largo, que es
 * como se monta un cuadrante a mano.
 *
 * Solo sube, nunca baja: si en esas franjas ya hacía falta más gente, se deja.
 * Un tramo del horario sin ninguna franja con necesidad no se toca: ahí no
 * hay servicio que preparar (eso, si hace falta, lo pide el mínimo por local).
 *
 * Va ANTES del mínimo por local y del techo del tramo. El techo no la recorta:
 * fuera del horario al público no hay comensales, así que no hay tramo.
 */
export function applyPrep(
  grid: NeedGrid,
  model: StaffingModel,
  prepByBlock: Record<string, PrepWindow>,
  hoursForBlock: (blockId: string) => OpeningHours,
): NeedGrid {
  const out: NeedGrid = {}
  for (const k of Object.keys(grid)) out[k] = grid[k].map((r) => [...r])

  for (const block of model.blocks) {
    const prep = prepByBlock[block.id]
    if (!prep || (prep.beforeMin <= 0 && prep.afterMin <= 0)) continue
    const own = model.roles.filter((r) => r.blockId === block.id && out[r.id])
    if (own.length === 0) continue
    const hours = hoursForBlock(block.id)
    const busy = (d: number, s: number) => own.some((r) => grid[r.id][d][s] > 0)

    for (let d = 0; d < 7; d++) {
      for (const b of hours[d] ?? []) {
        const slots: number[] = []
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
          const m = slotStartMin(s)
          if (m >= b.startMin && m < b.endMin && busy(d, s)) slots.push(s)
        }
        if (slots.length === 0) continue
        const first = slots[0]
        const last = slots[slots.length - 1]
        const from = Math.max(GRID_START_MIN, b.startMin - Math.max(0, prep.beforeMin))
        const to = Math.min(GRID_END_MIN, b.endMin + Math.max(0, prep.afterMin))
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
          const m = slotStartMin(s)
          const crew = s < first && m >= from ? first : s > last && m < to ? last : -1
          if (crew < 0) continue
          for (const r of own) out[r.id][d][s] = Math.max(out[r.id][d][s], grid[r.id][d][crew])
        }
      }
    }
  }
  return out
}

/**
 * Trabajo fijo por puesto y servicio (ronda 2, punto 25): lo que no depende de
 * los comensales, como la mise en place de cocina o la limpieza de office.
 *
 * Cada tarea pide `personas` de su puesto durante `minutos` antes de que abra
 * cada servicio (cada tramo del horario de su zona) o después de que cierre.
 * Se aplica aunque ese servicio tenga pocos comensales: es justo lo que la
 * diferencia del trabajo variable, y por eso un martes flojo no baja a cero.
 *
 * Encaja con `applyPrep` en vez de sumarse: se queda con el MÁXIMO de lo que ya
 * hay en cada franja. Si la preparación por zona ya trae a un cocinero una hora
 * antes, una tarea de "1 cocinero, 60 min antes" no añade a nadie. Va después
 * de la preparación y antes del mínimo por local, como ella.
 *
 * Los mandos se saltan: van por horario y el cuadrante no les reparte turnos de
 * volumen.
 */
export function applyTrabajoFijo(
  grid: NeedGrid,
  model: StaffingModel,
  tareas: TrabajoFijo[],
  hoursForBlock: (blockId: string) => OpeningHours,
): NeedGrid {
  const validas = tareas.filter((t) => t.minutos > 0 && t.personas > 0)
  if (validas.length === 0) return grid
  const out: NeedGrid = {}
  for (const k of Object.keys(grid)) out[k] = grid[k].map((r) => [...r])

  for (const t of validas) {
    const role = model.roles.find((r) => r.id === t.roleId)
    if (!role || role.kind === 'estructura' || !out[role.id]) continue
    const hours = hoursForBlock(role.blockId)
    const personas = Math.round(t.personas)
    for (let d = 0; d < 7; d++) {
      for (const b of hours[d] ?? []) {
        const from = t.momento === 'antes' ? Math.max(GRID_START_MIN, b.startMin - t.minutos) : b.endMin
        const to = t.momento === 'antes' ? b.startMin : Math.min(GRID_END_MIN, b.endMin + t.minutos)
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
          const m = slotStartMin(s)
          if (m >= from && m < to) out[role.id][d][s] = Math.max(out[role.id][d][s], personas)
        }
      }
    }
  }
  return out
}

/** Lo que el office (o quien friegue) se queda de más sobre la recogida de su zona. */
export const RECOGIDA_EXTRA_MIN = 30

/**
 * El puesto que recoge se queda hasta el final (ronda 3, M6).
 *
 * El office pide gente por comensales, y en la cola de la cena el tramo baja y
 * deja de pedirlo: salía a las 22:30 con el servicio hasta las 00:30, y la
 * vajilla de la cena se quedaba sin nadie. Aquí, para los puestos marcados con
 * `cierraServicio`, en el ÚLTIMO servicio del día se pide al menos una
 * persona desde la última franja en que ya trabajaba hasta el cierre de su
 * zona, con la recogida y media hora más. Solo sube, nunca baja, y solo si el
 * puesto trabajaba en ese servicio.
 */
export function applyCierreServicio(
  grid: NeedGrid,
  model: StaffingModel,
  hoursForBlock: (blockId: string) => OpeningHours,
  afterMinForBlock: (blockId: string) => number,
): NeedGrid {
  const roles = model.roles.filter((r) => r.cierraServicio && r.kind !== 'estructura' && grid[r.id])
  if (roles.length === 0) return grid
  const out: NeedGrid = { ...grid }
  for (const role of roles) {
    const g = grid[role.id].map((r) => [...r])
    const hours = hoursForBlock(role.blockId)
    const after = Math.max(0, afterMinForBlock(role.blockId))
    for (let d = 0; d < 7; d++) {
      const tramos = (hours[d] ?? []).filter((b) => b.endMin > b.startMin)
      if (tramos.length === 0) continue
      const ultimo = tramos.reduce((a, b) => (b.endMin > a.endMin ? b : a))
      const fin = Math.min(GRID_END_MIN, ultimo.endMin + after + RECOGIDA_EXTRA_MIN)
      let desde = -1
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const m = slotStartMin(s)
        if (m >= ultimo.startMin && m < fin && g[d][s] > 0) desde = s
      }
      if (desde < 0) continue
      for (let s = desde; s < SLOTS_PER_DAY && slotStartMin(s) < fin; s++) g[d][s] = Math.max(g[d][s], 1)
    }
    out[role.id] = g
  }
  return out
}

/**
 * Estira el horario con los minutos de preparación y de cierre.
 *
 * Solo se usa para la ventana del mínimo por local: la curva de comensales
 * sigue recortada al horario al público, porque antes de abrir no hay
 * comensales por definición.
 */
export function expandHours(hours: OpeningHours, beforeMin: number, afterMin: number): OpeningHours {
  if (beforeMin <= 0 && afterMin <= 0) return hours
  return hours.map((day) =>
    day.map((b) => ({
      startMin: Math.max(GRID_START_MIN, b.startMin - beforeMin),
      endMin: Math.min(GRID_END_MIN, b.endMin + afterMin),
    })),
  )
}

/**
 * Aplica el techo por tramo y puesto. Va el ÚLTIMO de la cadena, después del
 * mínimo por local: un tope que se pudiera saltar por otra vía no es un tope.
 *
 * Necesita la curva de comensales para saber en qué tramo cae cada franja, la
 * misma con la que se construyó la rejilla.
 */
export function clampToTierMax(grid: NeedGrid, week: number[][], model: StaffingModel): NeedGrid {
  const hasMax = model.tiers.some((t) => Object.values(t.staffMax ?? {}).some((v) => v > 0))
  if (!hasMax) return grid

  const out: NeedGrid = {}
  for (const k of Object.keys(grid)) out[k] = grid[k].map((r) => [...r])

  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const tier = tierFor(model.tiers, week[d][s])
      if (!tier?.staffMax) continue
      for (const role of model.roles) {
        const max = tier.staffMax[role.id] ?? 0
        if (max > 0 && out[role.id][d][s] > max) out[role.id][d][s] = max
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

    // Un techo por debajo del objetivo (o del suelo) se aplica igualmente,
    // pero la celda sigue enseñando el número grande: el usuario ve 7 y el
    // plan monta 5 sin que nada lo explique.
    for (const [roleId, max] of Object.entries(t.staffMax ?? {})) {
      if (max <= 0) continue
      const target = t.staff[roleId] ?? 0
      const min = t.staffMin?.[roleId] ?? 0
      if (min > max) {
        issues.push({
          tierId: t.id,
          message: `Hay un puesto con el mínimo (${min}) por encima del máximo (${max}).`,
        })
      } else if (target > max) {
        issues.push({
          tierId: t.id,
          message: `Hay un puesto con ${target} de objetivo pero un máximo de ${max}: manda el máximo.`,
        })
      }
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
