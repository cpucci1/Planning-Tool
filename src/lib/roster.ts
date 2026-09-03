/**
 * De la curva de necesidad al cuadrante.
 *
 * La idea que lo hace tratable: si en una franja hacen falta 3 camareros, hay
 * una "capa 1" que está presente siempre que haga falta al menos 1, una "capa 2"
 * siempre que hagan falta al menos 2, y así. Cada capa, recortada al horario,
 * dibuja de forma natural el turno de una persona: la capa 1 abre y cierra, las
 * capas de arriba entran solo en el pico.
 *
 * Es exactamente lo que hace a mano un jefe de sala, y por eso el cuadrante que
 * sale se parece a uno de verdad y no a un reparto matemático.
 *
 * Después las capas se empaquetan en personas: primero se intenta llenar
 * jornadas de 40h, y al final cada persona se ajusta al contrato más pequeño
 * que cubra sus horas, que es de donde salen los parciales de 30, 20 y 15.
 */

import { SLOTS_PER_DAY, SLOT_MINUTES, slotStartMin } from './time'
import type {
  ContractType,
  DayIndex,
  NeedGrid,
  Person,
  Roster,
  Settings,
  Shift,
  StaffingModel,
} from './types'

interface Run {
  startMin: number
  endMin: number
}

/** Tramos contiguos en los que la necesidad llega a `layer`. */
function runsForLayer(need: number[], layer: number): Run[] {
  const runs: Run[] = []
  let start: number | null = null
  for (let s = 0; s < SLOTS_PER_DAY; s++) {
    const active = need[s] >= layer
    if (active && start === null) start = slotStartMin(s)
    if (!active && start !== null) {
      runs.push({ startMin: start, endMin: slotStartMin(s) })
      start = null
    }
  }
  if (start !== null) runs.push({ startMin: start, endMin: slotStartMin(SLOTS_PER_DAY) })
  return runs
}

/** Parte los tramos que se pasan del máximo por turno en varios relevos. */
function splitLongRuns(runs: Run[], maxMinutes: number): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    const len = r.endMin - r.startMin
    if (len <= maxMinutes) {
      out.push(r)
      continue
    }
    const parts = Math.ceil(len / maxMinutes)
    // Se reparte a partes iguales y redondeando a la franja, para no generar
    // relevos a y cuarto.
    const each = Math.ceil(len / parts / SLOT_MINUTES) * SLOT_MINUTES
    let cur = r.startMin
    while (cur < r.endMin) {
      const end = Math.min(cur + each, r.endMin)
      out.push({ startMin: cur, endMin: end })
      cur = end
    }
  }
  return out
}

/** Alarga los tramos demasiado cortos hasta el mínimo. Genera holgura, y se reporta. */
function padShortRuns(runs: Run[], minMinutes: number): Run[] {
  return runs.map((r) => {
    const len = r.endMin - r.startMin
    if (len >= minMinutes) return r
    const missing = minMinutes - len
    // Se alarga hacia adelante: entrar antes de la hora es más útil que salir
    // más tarde, porque cubre la preparación.
    return { startMin: r.startMin - Math.ceil(missing / SLOT_MINUTES) * SLOT_MINUTES, endMin: r.endMin }
  })
}

function runHours(runs: Run[]): number {
  return runs.reduce((a, r) => a + (r.endMin - r.startMin), 0) / 60
}

/** Un turno pendiente de asignar a una persona. */
interface PendingShift {
  roleId: string
  day: DayIndex
  blocks: Run[]
  hours: number
}

/**
 * Descompone la necesidad en turnos sin asignar.
 * Con jornada partida activada, los tramos del mismo día y la misma capa se
 * juntan en un solo turno; sin ella, cada tramo es un turno independiente que
 * irá a una persona distinta.
 */
export function buildPendingShifts(grid: NeedGrid, model: StaffingModel, settings: Settings): PendingShift[] {
  const pending: PendingShift[] = []

  for (const role of model.roles) {
    const roleGrid = grid[role.id]
    if (!roleGrid) continue

    for (let d = 0; d < 7; d++) {
      const need = roleGrid[d]
      const maxLayer = Math.max(0, ...need)

      for (let layer = 1; layer <= maxLayer; layer++) {
        let runs = runsForLayer(need, layer)
        if (runs.length === 0) continue
        runs = splitLongRuns(runs, settings.maxShiftMinutes)
        runs = padShortRuns(runs, settings.minShiftMinutes)

        if (settings.allowSplitShifts && runs.length > 1) {
          // Una sola persona hace mediodía y noche. Se limita a dos bloques:
          // un turno de tres tramos no existe en un restaurante.
          const head = runs.slice(0, 2)
          pending.push({ roleId: role.id, day: d as DayIndex, blocks: head, hours: runHours(head) })
          for (const r of runs.slice(2)) {
            pending.push({ roleId: role.id, day: d as DayIndex, blocks: [r], hours: runHours([r]) })
          }
        } else {
          for (const r of runs) {
            pending.push({ roleId: role.id, day: d as DayIndex, blocks: [r], hours: runHours([r]) })
          }
        }
      }
    }
  }
  return pending
}

/** Contratos activos, del más grande al más pequeño. */
function activeContracts(settings: Settings): ContractType[] {
  return settings.contracts.filter((c) => c.enabled).sort((a, b) => b.hours - a.hours)
}

interface Slot {
  person: Person
  days: Set<DayIndex>
}

/**
 * Pares de días libres consecutivos, en orden de preferencia. Lunes-martes
 * primero porque son los días flojos de la mayoría de restaurantes; el
 * fin de semana es el último recurso.
 */
const DAY_OFF_PAIRS: DayIndex[][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [6, 0],
  [4, 5],
  [5, 6],
]

/**
 * Empaqueta los turnos en personas.
 *
 * Se ordena por horas descendente (los turnos largos son los difíciles de
 * colocar) y se van metiendo en la primera persona del mismo puesto que tenga
 * hueco, que no trabaje ya ese día y que no rompa su libranza. Cuando no cabe
 * en nadie, se abre una persona nueva con la jornada más grande disponible.
 */
export function buildRoster(grid: NeedGrid, model: StaffingModel, settings: Settings): Roster {
  const contracts = activeContracts(settings)
  const biggest = contracts[0] ?? { id: '40', hours: 40, label: '40h', enabled: true }

  const pending = buildPendingShifts(grid, model, settings).sort((a, b) => b.hours - a.hours)

  const slots: Slot[] = []
  const shifts: Shift[] = []
  const uncovered: Record<string, number[][]> = {}
  for (const role of model.roles) {
    uncovered[role.id] = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  }
  let uncoveredHours = 0

  const counters: Record<string, number> = {}

  /** Bloques que esa persona ya tiene ese día, para poder encadenar partidos. */
  function blocksOn(slot: Slot, day: DayIndex): Run[] {
    return shifts
      .filter((sh) => sh.personId === slot.person.id && sh.day === day)
      .flatMap((sh) => sh.blocks)
  }

  /** Descanso mínimo entre los dos bloques de una jornada partida. */
  const SPLIT_GAP_MIN = 60

  /**
   * Descanso mínimo entre jornadas: 12h entre el fin de un turno y el
   * inicio del siguiente de la misma persona (Art. 34.3 ET). La semana se
   * repite, así que el domingo también se comprueba contra el lunes.
   */
  const MIN_REST_MIN = 12 * 60

  /**
   * `startMin`/`endMin` son minutos desde la medianoche del día en el que
   * arranca ESE turno, y un turno que cierra de madrugada ya viene con un
   * valor por encima de 1440 (p.ej. 02:00 = 1560). Por eso el hueco entre el
   * turno de un día y el del día siguiente es sencillamente
   * `1440 + inicioSiguiente - finAnterior`: no hay que arrastrar un reloj
   * absoluto de la semana, cada par de días consecutivos se mira igual,
   * domingo-lunes incluido.
   */
  /**
   * `extraBlocks` son los bloques que se quieren añadir a `day` (encima de
   * los que esa persona ya tenga ese mismo día, si los hay: una jornada
   * partida se mide entera, no bloque a bloque).
   */
  function dayRestOk(slot: Slot, day: DayIndex, extraBlocks: Run[]): boolean {
    if (!settings.minRestBetweenShifts) return true
    const todayBlocks = [...blocksOn(slot, day), ...extraBlocks]
    const start = Math.min(...todayBlocks.map((b) => b.startMin))
    const end = Math.max(...todayBlocks.map((b) => b.endMin))

    const prevDay = ((day + 6) % 7) as DayIndex
    const prevBlocks = blocksOn(slot, prevDay)
    if (prevBlocks.length > 0) {
      const prevEnd = Math.max(...prevBlocks.map((b) => b.endMin))
      if (1440 + start - prevEnd < MIN_REST_MIN) return false
    }

    const nextDay = ((day + 1) % 7) as DayIndex
    const nextBlocks = blocksOn(slot, nextDay)
    if (nextBlocks.length > 0) {
      const nextStart = Math.min(...nextBlocks.map((b) => b.startMin))
      if (1440 + nextStart - end < MIN_REST_MIN) return false
    }

    return true
  }

  function restOk(slot: Slot, p: PendingShift): boolean {
    return dayRestOk(slot, p.day, p.blocks)
  }

  function fits(slot: Slot, p: PendingShift): boolean {
    if (slot.person.roleId !== p.roleId) return false
    if (slot.person.assignedHours + p.hours > slot.person.contractHours) return false
    if (!restOk(slot, p)) return false

    if (slot.days.has(p.day)) {
      // Solo se puede repetir día si la jornada partida está activada, si el
      // turno nuevo es de un bloque suelto y si cabe sin solaparse, dejando
      // hueco real para salir y volver.
      if (!settings.allowSplitShifts) return false
      if (p.blocks.length !== 1) return false
      const existing = blocksOn(slot, p.day)
      if (existing.length !== 1) return false
      const a = existing[0]
      const b = p.blocks[0]
      const gap = b.startMin >= a.endMin ? b.startMin - a.endMin : a.startMin - b.endMin
      if (gap < SPLIT_GAP_MIN) return false
      // Una jornada partida es de dos bloques; el arco total no puede ser
      // interminable o el turno deja de ser humano.
      const span = Math.max(a.endMin, b.endMin) - Math.min(a.startMin, b.startMin)
      if (span > 13 * 60) return false
      return true
    }

    if (settings.consecutiveDaysOff) {
      const wouldWork = new Set([...slot.days, p.day])
      return DAY_OFF_PAIRS.some((pair) => !wouldWork.has(pair[0]) && !wouldWork.has(pair[1]))
    }
    return slot.days.size < 6
  }

  for (const p of pending) {
    // Mejor ajuste, no primer ajuste: se elige a quien menos hueco le sobre
    // después de meter el turno. Reduce mucho el número de personas frente a
    // ir llenando por orden, que deja a todo el mundo a medias.
    let target: Slot | undefined
    let bestLeftover = Number.POSITIVE_INFINITY
    for (const slot of slots) {
      if (!fits(slot, p)) continue
      const leftover = slot.person.contractHours - slot.person.assignedHours - p.hours
      if (leftover < bestLeftover) {
        bestLeftover = leftover
        target = slot
      }
    }

    if (!target) {
      // ¿Cabe siquiera en la jornada más grande? Si no, el turno es imposible y
      // se marca como descubierto en vez de inventarse un contrato a medida.
      if (p.hours > biggest.hours) {
        for (const b of p.blocks) {
          for (let m = b.startMin; m < b.endMin; m += SLOT_MINUTES) {
            const s = (m - slotStartMin(0)) / SLOT_MINUTES
            if (s >= 0 && s < SLOTS_PER_DAY) uncovered[p.roleId][p.day][s] += 1
          }
        }
        uncoveredHours += p.hours
        continue
      }
      counters[p.roleId] = (counters[p.roleId] ?? 0) + 1
      const role = model.roles.find((r) => r.id === p.roleId)
      const person: Person = {
        id: `${p.roleId}-${counters[p.roleId]}`,
        label: `${role?.name ?? 'Puesto'} ${counters[p.roleId]}`,
        roleId: p.roleId,
        contractId: biggest.id,
        contractHours: biggest.hours,
        assignedHours: 0,
        daysOff: [],
      }
      target = { person, days: new Set<DayIndex>() }
      slots.push(target)
    }

    target.person.assignedHours += p.hours

    const sameDay = target.days.has(p.day)
      ? shifts.find((sh) => sh.personId === target.person.id && sh.day === p.day)
      : undefined

    if (sameDay) {
      // Ya trabajaba ese día: los dos bloques son una única jornada partida.
      sameDay.blocks = [...sameDay.blocks, ...p.blocks].sort((a, b) => a.startMin - b.startMin)
      sameDay.hours += p.hours
    } else {
      target.days.add(p.day)
      shifts.push({
        id: `${target.person.id}-${p.day}-${shifts.length}`,
        personId: target.person.id,
        roleId: p.roleId,
        day: p.day,
        blocks: p.blocks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
        hours: p.hours,
      })
    }
  }

  // ── Consolidación ──────────────────────────────────────────────────────
  // El reparto voraz deja cola: gente con cuatro horas sueltas que existe solo
  // porque en ese momento no cabía en nadie. Se intenta vaciar a los más
  // flojos repartiendo sus turnos entre el resto; quien se queda sin nada,
  // desaparece. Es lo que baja la plantilla de "matemáticamente correcta" a
  // "contratable".
  function shiftsOf(slot: Slot): Shift[] {
    return shifts.filter((sh) => sh.personId === slot.person.id)
  }

  function removeShift(sh: Shift) {
    const i = shifts.indexOf(sh)
    if (i >= 0) shifts.splice(i, 1)
  }

  let progress = true
  let guard = 0
  while (progress && guard++ < 20) {
    progress = false
    // De menos cargado a más: el candidato a desaparecer es el que menos aporta.
    const order = [...slots].sort((a, b) => a.person.assignedHours - b.person.assignedHours)

    for (const donor of order) {
      const mine = shiftsOf(donor)
      if (mine.length === 0) continue

      // Se simula el traslado completo antes de tocar nada: o se va entero, o
      // no se mueve. Vaciar a medias solo cambia el problema de sitio.
      const receivers = slots.filter((s) => s !== donor && s.person.roleId === donor.person.roleId)
      if (receivers.length === 0) continue

      const trial = receivers.map((s) => ({
        slot: s,
        hours: s.person.assignedHours,
        days: new Set(s.days),
      }))

      const plan: { sh: Shift; to: (typeof trial)[number] }[] = []
      let allPlaced = true

      for (const sh of mine) {
        const target = trial
          .filter((t) => {
            if (t.hours + sh.hours > t.slot.person.contractHours) return false
            if (t.days.has(sh.day)) return false
            if (!dayRestOk(t.slot, sh.day, sh.blocks)) return false
            if (settings.consecutiveDaysOff) {
              const would = new Set([...t.days, sh.day])
              return DAY_OFF_PAIRS.some((pair) => !would.has(pair[0]) && !would.has(pair[1]))
            }
            return t.days.size < 6
          })
          .sort(
            (a, b) =>
              a.slot.person.contractHours - a.hours - (b.slot.person.contractHours - b.hours),
          )[0]

        if (!target) {
          allPlaced = false
          break
        }
        target.hours += sh.hours
        target.days.add(sh.day)
        plan.push({ sh, to: target })
      }

      if (!allPlaced) continue

      for (const { sh, to } of plan) {
        removeShift(sh)
        const moved: Shift = { ...sh, personId: to.slot.person.id }
        shifts.push(moved)
        to.slot.person.assignedHours += sh.hours
        to.slot.days.add(sh.day)
      }
      donor.person.assignedHours = 0
      donor.days.clear()
      slots.splice(slots.indexOf(donor), 1)
      progress = true
      break
    }
  }

  // Cada persona baja al contrato más pequeño que cubra sus horas. Aquí es donde
  // aparecen los parciales: nadie con 18h asignadas se queda con un 40h.
  const ascending = [...contracts].sort((a, b) => a.hours - b.hours)
  for (const s of slots) {
    const fit = ascending.find((c) => c.hours >= s.person.assignedHours)
    if (fit) {
      s.person.contractId = fit.id
      s.person.contractHours = fit.hours
    }
    s.person.daysOff = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).filter((d) => !s.days.has(d))
  }

  // Orden final: primero por jornada y, a igualdad, por carga. Y la numeración
  // se hace EN ESE MISMO ORDEN — si se numera por un criterio y se ordena por
  // otro, el cuadrante sale con "Camarero 3, 4, 6, 7, 5" y parece un error.
  const ordered = [...slots].sort(
    (a, b) =>
      b.person.contractHours - a.person.contractHours ||
      b.person.assignedHours - a.person.assignedHours,
  )

  const seen: Record<string, number> = {}
  for (const s of ordered) {
    seen[s.person.roleId] = (seen[s.person.roleId] ?? 0) + 1
    const role = model.roles.find((r) => r.id === s.person.roleId)
    s.person.label = `${role?.name ?? 'Puesto'} ${seen[s.person.roleId]}`
  }

  return {
    people: ordered.map((s) => s.person),
    shifts,
    uncovered,
    uncoveredHours,
  }
}
