/**
 * El cuadrante: quién trabaja, qué día y a qué hora.
 *
 * Es el entregable final del flujo, así que se enseña de dos maneras porque son
 * dos preguntas distintas: "¿qué hace cada uno esta semana?" (por persona, la
 * vista del contrato) y "¿quién hay en el local a las nueve del sábado?" (por
 * día, la vista del servicio).
 *
 * Lo que el cuadrante no llega a cubrir se enseña, no se esconde: son las horas
 * que hay que resolver con extras.
 */

import { Fragment, useMemo, useState } from 'react'
import { CalendarDays, Clock, Download, Printer, Share2, TriangleAlert, Users } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoTip,
  InlineName,
  Note,
  Segmented,
  Stat,
  cn,
} from '@/components/ui'
import { describeMix } from '@/lib/contracts'
import { descargarCuadranteCocina, descargarTurnoPersona } from '@/lib/cuadrante-imagen'
import {
  DAYS,
  DAYS_SHORT,
  GRID_START_MIN,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  formatMin,
  formatRange,
  formatSlot,
  isHourMark,
  slotStartMin,
} from '@/lib/time'
import type {
  ContractType,
  DayIndex,
  NeedGrid,
  OpeningHours,
  Person,
  Role,
  Roster,
  Shift,
  ContractAllocation,
  StaffingModel,
} from '@/lib/types'

/** Ancho de una franja de 30 min en la vista por día. */
const SLOT_W = 30
/** Ancho de la columna fija de nombres, en las dos vistas del timeline. */
const LABEL_W = 148
const CURVE_H = 78

type View = 'persona' | 'dia'

interface RosterGridProps {
  roster: Roster
  model: StaffingModel
  needGrid: NeedGrid
  openBlocks?: OpeningHours
  onRenamePerson?: (personId: string, name: string) => void
}

// ─────────────────────────────────────────────────────────────
// Utilidades locales
// ─────────────────────────────────────────────────────────────

/** El color de un puesto viene del dato, así que se usa inline y con alfa. */
function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) return hex
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

function fmtHours(n: number): string {
  return `${fmtNum(n)} h`
}

function slotOfStart(min: number): number {
  return Math.floor((min - GRID_START_MIN) / SLOT_MINUTES)
}

function slotOfEnd(min: number): number {
  return Math.ceil((min - GRID_START_MIN) / SLOT_MINUTES)
}

function clampSlot(s: number): number {
  return Math.min(SLOTS_PER_DAY - 1, Math.max(0, s))
}

/** "lunes y martes" — la lista de libranza como la diría un encargado. */
function listDays(days: DayIndex[]): string {
  const names = days.map((d) => DAYS[d].toLowerCase())
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

interface Gap {
  roleId: string
  day: DayIndex
  startMin: number
  endMin: number
  people: number
}

/** Agrupa las franjas descubiertas en tramos contiguos con la misma falta. */
function findGaps(uncovered: Record<string, number[][]>): Gap[] {
  const gaps: Gap[] = []
  for (const roleId of Object.keys(uncovered)) {
    const byDay = uncovered[roleId] ?? []
    for (let d = 0; d < byDay.length; d++) {
      const row = byDay[d] ?? []
      let start = 0
      let value = 0
      for (let s = 0; s <= SLOTS_PER_DAY; s++) {
        const v = s < SLOTS_PER_DAY ? (row[s] ?? 0) : 0
        if (v === value) continue
        if (value > 0) {
          gaps.push({
            roleId,
            day: d as DayIndex,
            startMin: slotStartMin(start),
            endMin: slotStartMin(s),
            people: value,
          })
        }
        start = s
        value = v
      }
    }
  }
  return gaps.sort((a, b) => a.day - b.day || a.startMin - b.startMin)
}

/**
 * El cuadrante ya trae las personas con su contrato asignado, así que el mix se
 * reconstruye desde ahí en vez de pedir los Settings: este componente pinta un
 * resultado, no participa en el cálculo.
 */
function contractsFromRoster(people: Person[]): ContractType[] {
  const map = new Map<string, ContractType>()
  for (const p of people) {
    if (!map.has(p.contractId)) {
      map.set(p.contractId, { id: p.contractId, hours: p.contractHours, label: `${p.contractHours}h`, enabled: true })
    }
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours)
}

/** Resumen mínimo para la cabecera. No es un StaffPlan: aquí solo se pinta. */
interface RosterSummary {
  allocations: ContractAllocation[]
  totalPeople: number
  contractedHours: number
  neededHours: number
  slackHours: number
}

function planFromRoster(
  people: Person[],
  contracts: ContractType[],
  neededHours: number,
): RosterSummary {
  const counts = new Map<string, number>()
  let contractedHours = 0
  for (const p of people) {
    counts.set(p.contractId, (counts.get(p.contractId) ?? 0) + 1)
    contractedHours += p.contractHours
  }
  return {
    allocations: contracts.map((c) => ({ contractId: c.id, hours: c.hours, count: counts.get(c.id) ?? 0 })),
    totalPeople: people.length,
    contractedHours,
    neededHours,
    slackHours: Math.max(0, contractedHours - neededHours),
  }
}

/** Camino escalonado: la necesidad es constante dentro de cada franja, no una curva suave. */
function stepPath(values: number[], max: number, close: boolean): string {
  const top = 4
  const y = (v: number) => CURVE_H - (v / max) * (CURVE_H - top)
  let d = ''
  values.forEach((v, i) => {
    const x0 = i * SLOT_W
    const x1 = (i + 1) * SLOT_W
    d += `${i === 0 ? 'M' : 'L'} ${x0} ${y(v)} L ${x1} ${y(v)} `
  })
  if (close) d += `L ${values.length * SLOT_W} ${CURVE_H} L 0 ${CURVE_H} Z`
  return d.trim()
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export function RosterGrid({ roster, model, needGrid, openBlocks, onRenamePerson }: RosterGridProps) {
  const [view, setView] = useState<View>('persona')
  // Arranca en el día más cargado: es el que el usuario quiere mirar primero.
  const [day, setDay] = useState<DayIndex>(() => {
    const hours = new Array<number>(7).fill(0)
    for (const s of roster.shifts) hours[s.day] += s.hours
    let best = 0
    for (let d = 1; d < 7; d++) if (hours[d] > hours[best]) best = d
    return best as DayIndex
  })

  const roleById = useMemo(() => new Map(model.roles.map((r) => [r.id, r])), [model.roles])

  /** Personas agrupadas por bloque y, dentro, en el orden de los puestos. */
  const groups = useMemo(() => {
    const out: { key: string; name: string; color: string; people: Person[] }[] = []
    const placed = new Set<string>()
    for (const block of model.blocks) {
      const people: Person[] = []
      for (const role of model.roles.filter((r) => r.blockId === block.id)) {
        for (const p of roster.people) {
          if (p.roleId === role.id) {
            people.push(p)
            placed.add(p.id)
          }
        }
      }
      if (people.length > 0) out.push({ key: block.id, name: block.name, color: block.color, people })
    }
    const rest = roster.people.filter((p) => !placed.has(p.id))
    if (rest.length > 0) out.push({ key: '__sin-bloque', name: 'Sin bloque', color: '#A1A1AA', people: rest })
    return out
  }, [model.blocks, model.roles, roster.people])

  const shiftsByPersonDay = useMemo(() => {
    const m = new Map<string, Shift[]>()
    for (const s of roster.shifts) {
      const key = `${s.personId}|${s.day}`
      const arr = m.get(key)
      if (arr) arr.push(s)
      else m.set(key, [s])
    }
    return m
  }, [roster.shifts])

  const neededHours = useMemo(() => {
    let total = 0
    for (const role of model.roles) {
      for (const dayRow of needGrid[role.id] ?? []) for (const v of dayRow) total += v
    }
    return (total * SLOT_MINUTES) / 60
  }, [needGrid, model.roles])

  const contracts = useMemo(() => contractsFromRoster(roster.people), [roster.people])
  const plan = useMemo(
    () => planFromRoster(roster.people, contracts, neededHours),
    [roster.people, contracts, neededHours],
  )

  const gaps = useMemo(() => findGaps(roster.uncovered), [roster.uncovered])

  /** Franjas abiertas por día. Sin horario declarado se asume todo abierto. */
  const openSlots = useMemo(() => {
    if (!openBlocks) return null
    return Array.from({ length: 7 }, (_, d) => {
      const row = new Array<boolean>(SLOTS_PER_DAY).fill(false)
      for (const b of openBlocks[d] ?? []) {
        for (let s = clampSlot(slotOfStart(b.startMin)); s < Math.min(SLOTS_PER_DAY, slotOfEnd(b.endMin)); s++) {
          row[s] = true
        }
      }
      return row
    })
  }, [openBlocks])

  /**
   * Ventana visible del timeline. La rejilla va de 06:00 a 04:00, pero pintar 44
   * franjas vacías esconde el servicio: se recorta a lo que de verdad ocurre.
   */
  const slots = useMemo(() => {
    let min = SLOTS_PER_DAY
    let max = -1
    const push = (s: number) => {
      const c = clampSlot(s)
      if (c < min) min = c
      if (c > max) max = c
    }
    for (const sh of roster.shifts) {
      for (const b of sh.blocks) {
        push(slotOfStart(b.startMin))
        push(slotOfEnd(b.endMin) - 1)
      }
    }
    for (const role of model.roles) {
      const grid = needGrid[role.id] ?? []
      for (const dayRow of grid) {
        for (let s = 0; s < dayRow.length; s++) if (dayRow[s] > 0) push(s)
      }
    }
    if (openSlots) {
      for (const row of openSlots) for (let s = 0; s < row.length; s++) if (row[s]) push(s)
    }
    if (max < min) {
      // Cuadrante sin nada: una ventana de mediodía a medianoche para no fallar.
      min = clampSlot(slotOfStart(12 * 60))
      max = clampSlot(slotOfStart(24 * 60))
    }
    const from = Math.max(0, min - 1)
    const to = Math.min(SLOTS_PER_DAY - 1, max + 1)
    return Array.from({ length: to - from + 1 }, (_, i) => from + i)
  }, [roster.shifts, model.roles, needGrid, openSlots])

  /** Todo lo que depende del día elegido: filas, necesidad, cobertura y huecos. */
  const dayData = useMemo(() => {
    const rows: { person: Person; role: Role | undefined; shifts: Shift[]; start: number }[] = []
    for (const g of groups) {
      for (const person of g.people) {
        const list = shiftsByPersonDay.get(`${person.id}|${day}`) ?? []
        if (list.length === 0) continue
        const start = Math.min(...list.flatMap((s) => s.blocks.map((b) => b.startMin)))
        rows.push({ person, role: roleById.get(person.roleId), shifts: list, start })
      }
    }

    const need = slots.map((s) =>
      model.roles.reduce((acc, r) => acc + (needGrid[r.id]?.[day]?.[s] ?? 0), 0),
    )
    const covered = slots.map((s) => {
      const t = slotStartMin(s)
      let n = 0
      for (const r of rows) {
        for (const sh of r.shifts) {
          for (const b of sh.blocks) if (t >= b.startMin && t < b.endMin) n++
        }
      }
      return n
    })
    const missing = slots.map((s) =>
      model.roles.reduce((acc, r) => acc + (roster.uncovered[r.id]?.[day]?.[s] ?? 0), 0),
    )
    const offToday = roster.people.filter((p) => !shiftsByPersonDay.has(`${p.id}|${day}`)).length

    return { rows, need, covered, missing, offToday, max: Math.max(1, ...need, ...covered) }
  }, [groups, shiftsByPersonDay, roleById, day, slots, model.roles, needGrid, roster.uncovered, roster.people])

  function downloadCsv() {
    const rows: string[][] = [
      ['Cuadrante semanal — Shifty Planning'],
      [`${plan.totalPeople} personas`, describeMix(plan.allocations, contracts), `${fmtNum(plan.contractedHours)} h contratadas`],
      [],
      ['Bloque', 'Puesto', 'Persona', 'Contrato', 'Horas asignadas', ...DAYS],
    ]

    for (const g of groups) {
      for (const person of g.people) {
        const cells = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => {
          const list = shiftsByPersonDay.get(`${person.id}|${d}`) ?? []
          if (list.length === 0) return 'Libra'
          return list.flatMap((s) => s.blocks.map((b) => formatRange(b.startMin, b.endMin))).join(' + ')
        })
        rows.push([
          g.name,
          roleById.get(person.roleId)?.name ?? '',
          person.label,
          `${person.contractHours}h`,
          fmtNum(person.assignedHours),
          ...cells,
        ])
      }
    }

    if (gaps.length > 0) {
      rows.push([], ['Franjas sin cubrir'], ['Puesto', 'Día', 'Desde', 'Hasta', 'Personas que faltan'])
      for (const gap of gaps) {
        rows.push([
          roleById.get(gap.roleId)?.name ?? gap.roleId,
          DAYS[gap.day],
          formatMin(gap.startMin),
          formatMin(gap.endMin),
          String(gap.people),
        ])
      }
    }

    // BOM + separador ';': es lo que espera Excel en configuración española.
    const csv = rows.map((r) => r.map(csvCell).join(';')).join('\r\n')
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cuadrante-shifty.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (roster.people.length === 0) {
    return (
      <Card className="px-6 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-brand-light text-brand">
          <CalendarDays size={26} strokeWidth={2.2} />
        </div>
        <h3 className="h2 mt-5">
          Todavía no hay <span className="italic text-brand">cuadrante.</span>
        </h3>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-content-secondary">
          Con la demanda y los tramos actuales no sale ni un turno: o no hay comensales en ninguna
          franja, o los tramos no asignan personal. Revisa la tabla de tramos y vuelve a este paso.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Resumen ─────────────────────────────────────────── */}
      <Card>
        <CardHeader
          eyebrow="Cuadrante"
          title={
            <>
              Tu plantilla <span className="italic text-brand">al detalle.</span>
            </>
          }
          subtitle="Quién trabaja, qué día y a qué hora. Sale de tu curva de necesidad, no de una plantilla genérica. Pon nombres reales: doble clic o el lápiz de cada fila."
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer size={16} />}
                onClick={() => void descargarCuadranteCocina(roster, model)}
              >
                Para la cocina (PDF)
              </Button>
              <Button variant="secondary" size="sm" icon={<Download size={16} />} onClick={downloadCsv}>
                CSV
              </Button>
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-5 border-t border-border-soft px-6 py-5 sm:grid-cols-4">
          <Stat
            icon={<Users size={13} strokeWidth={2.6} />}
            label="Plantilla"
            value={plan.totalPeople}
            hint={describeMix(plan.allocations, contracts)}
            tone="brand"
          />
          <Stat
            icon={<Clock size={13} strokeWidth={2.6} />}
            label="Contratadas"
            value={fmtHours(plan.contractedHours)}
            hint={`Necesarias: ${fmtHours(plan.neededHours)}`}
          />
          <Stat
            icon={
              <InfoTip title="Horas de holgura">
                Son las horas contratadas que sobran sobre la necesidad. Siempre hay algunas: los
                turnos no se cortan al minuto y nadie entra a las 13:20 para salir a las 15:40. Si la
                holgura se dispara, prueba a bajar la duración mínima de turno o a activar la jornada
                partida.
              </InfoTip>
            }
            label="Holgura"
            value={fmtHours(plan.slackHours)}
            hint={
              plan.contractedHours > 0
                ? `${Math.round((plan.slackHours / plan.contractedHours) * 100)}% de lo contratado`
                : undefined
            }
            tone={plan.slackHours > plan.neededHours * 0.15 ? 'warning' : 'default'}
          />
          {roster.uncoveredHours > 0 ? (
            <Stat
              icon={<TriangleAlert size={13} strokeWidth={2.6} />}
              label="Sin cubrir"
              value={fmtHours(roster.uncoveredHours)}
              hint="No caben en ninguna jornada"
              tone="warning"
            />
          ) : (
            <Stat label="Cobertura" value="100%" hint="Toda la necesidad tiene a alguien" tone="success" />
          )}
        </div>
      </Card>

      {/* ── Descubiertos ────────────────────────────────────── */}
      {gaps.length > 0 && (
        <Note tone="danger" icon={<TriangleAlert size={16} strokeWidth={2.4} />}>
          <p className="font-bold">
            Quedan {fmtHours(roster.uncoveredHours)} sin cubrir en {gaps.length}{' '}
            {gaps.length === 1 ? 'tramo' : 'tramos'}.
          </p>
          <ul className="mt-2 space-y-1">
            {gaps.slice(0, 6).map((g, i) => (
              <li key={`${g.roleId}-${g.day}-${g.startMin}-${i}`}>
                Falta{g.people === 1 ? '' : 'n'} <strong>{g.people}</strong> de{' '}
                <strong>{roleById.get(g.roleId)?.name ?? g.roleId}</strong> el {DAYS[g.day].toLowerCase()} de{' '}
                {formatRange(g.startMin, g.endMin)}.
              </li>
            ))}
            {gaps.length > 6 && <li>Y {gaps.length - 6} tramos más, todos en el CSV.</li>}
          </ul>
          <p className="mt-2 opacity-80">
            Son horas que no caben en ninguna jornada de las que tienes activadas. Es justo lo que se
            cubre con extras en lugar de contratar de más.
          </p>
        </Note>
      )}

      {/* ── Vistas ──────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6">
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'persona', label: 'Por persona' },
              { value: 'dia', label: 'Por día' },
            ]}
          />
          {view === 'dia' && (
            <div className="flex gap-1 overflow-x-auto scroll-thin" role="group" aria-label="Día del cuadrante">
              {DAYS_SHORT.map((short, i) => {
                const d = i as DayIndex
                const people = roster.people.filter((p) => shiftsByPersonDay.has(`${p.id}|${d}`)).length
                return (
                  <button
                    key={short}
                    type="button"
                    aria-label={DAYS[d]}
                    aria-pressed={day === d}
                    onClick={() => setDay(d)}
                    className={cn(
                      'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-pill text-[0.8rem] font-bold transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      day === d
                        ? 'bg-brand text-content-inverted'
                        : 'bg-surface text-content-secondary hover:text-content-primary',
                    )}
                  >
                    {short}
                    <span className="text-[0.6rem] font-semibold opacity-70">{people}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {view === 'persona' ? (
          <PersonView
            groups={groups}
            roleById={roleById}
            shiftsByPersonDay={shiftsByPersonDay}
            todosLosTurnos={roster.shifts}
            onRenamePerson={onRenamePerson}
          />
        ) : (
          <DayView day={day} slots={slots} data={dayData} openSlots={openSlots} groups={groups} />
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Vista por persona
// ─────────────────────────────────────────────────────────────

interface Group {
  key: string
  name: string
  color: string
  people: Person[]
}

function ShiftPills({ shifts, color }: { shifts: Shift[]; color: string }) {
  return (
    <span className="flex flex-col gap-1">
      {shifts.flatMap((s) =>
        s.blocks.map((b, i) => (
          <span
            key={`${s.id}-${i}`}
            className="rounded-pill px-2 py-1 text-center text-[0.72rem] font-bold whitespace-nowrap"
            style={{ backgroundColor: withAlpha(color, 0.13), color }}
          >
            {formatRange(b.startMin, b.endMin)}
          </span>
        )),
      )}
    </span>
  )
}

function DayOff() {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-surface text-[0.7rem] font-bold text-content-muted"
      title="Libra"
    >
      L<span className="sr-only">ibra</span>
    </span>
  )
}

function OccupancyBar({ assigned, contracted }: { assigned: number; contracted: number }) {
  const pct = contracted > 0 ? Math.min(100, Math.round((assigned / contracted) * 100)) : 0
  return (
    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-pill bg-surface" aria-hidden="true">
      <span
        className={cn('block h-full rounded-pill', pct >= 90 ? 'bg-success' : 'bg-brand')}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}

function PersonView({
  groups,
  roleById,
  shiftsByPersonDay,
  todosLosTurnos,
  onRenamePerson,
}: {
  groups: Group[]
  roleById: Map<string, Role>
  shiftsByPersonDay: Map<string, Shift[]>
  /** Hace falta la lista entera para poder armar la imagen de una persona. */
  todosLosTurnos: Shift[]
  onRenamePerson?: (personId: string, name: string) => void
}) {
  const week = [0, 1, 2, 3, 4, 5, 6] as DayIndex[]

  return (
    <>
      {/* Tablet y escritorio: la semana entera de un vistazo. */}
      <div className="hidden overflow-x-auto scroll-thin md:block">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[200px] border-y border-border-soft bg-surface-elevated px-6 py-2.5 text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                Persona
              </th>
              {week.map((d) => (
                <th
                  key={d}
                  className="min-w-[104px] border-y border-border-soft bg-surface-elevated px-2 py-2.5 text-center text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase"
                >
                  {DAYS[d]}
                </th>
              ))}
              <th className="w-[168px] border-y border-border-soft bg-surface-elevated px-5 py-2.5 text-right text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                Contrato
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr>
                  <td colSpan={9} className="bg-surface-alt px-0 py-2">
                    <div className="sticky left-0 flex w-max items-center gap-2 px-6">
                      <span
                        className="h-2.5 w-2.5 rounded-pill"
                        style={{ backgroundColor: g.color }}
                        aria-hidden="true"
                      />
                      <span className="text-[0.78rem] font-extrabold text-content-primary">{g.name}</span>
                      <span className="text-[0.75rem] font-semibold text-content-secondary">
                        · {g.people.length} {g.people.length === 1 ? 'persona' : 'personas'}
                      </span>
                    </div>
                  </td>
                </tr>
                {g.people.map((person) => {
                  const role = roleById.get(person.roleId)
                  const color = role?.color ?? g.color
                  return (
                    <tr key={person.id} className="align-middle">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-border-soft bg-surface-elevated px-6 py-2.5 text-left font-normal"
                      >
                        {onRenamePerson ? (
                          <InlineName
                            value={person.label}
                            onCommit={(v) => onRenamePerson(person.id, v)}
                            ariaLabel={`Ponerle nombre a ${person.label}`}
                            className="text-[0.88rem] font-bold text-content-primary"
                          />
                        ) : (
                          <span className="block text-[0.88rem] font-bold text-content-primary">
                            {person.label}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[0.75rem] font-medium text-content-secondary">
                          {role?.name ?? 'Sin puesto'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            descargarTurnoPersona(
                              person,
                              todosLosTurnos.filter((sh) => sh.personId === person.id),
                              role?.name ?? '',
                            )
                          }
                          aria-label={`Descargar el turno de ${person.label} para mandarlo`}
                          title="Descargar su turno para mandárselo"
                          className={cn(
                            'mt-1 inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5',
                            'text-[0.7rem] font-bold text-content-muted transition-colors',
                            'hover:bg-brand-light hover:text-brand',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                          )}
                        >
                          <Share2 size={11} strokeWidth={2.6} />
                          Su turno
                        </button>
                      </th>
                      {week.map((d) => {
                        const shifts = shiftsByPersonDay.get(`${person.id}|${d}`) ?? []
                        return (
                          <td key={d} className="border-b border-border-soft px-2 py-2 text-center">
                            {shifts.length > 0 ? <ShiftPills shifts={shifts} color={color} /> : <DayOff />}
                          </td>
                        )
                      })}
                      <td className="border-b border-border-soft px-5 py-2.5 text-right">
                        <span className="flex items-center justify-end gap-2">
                          <Badge tone="neutral">{person.contractHours}h</Badge>
                          <span className="text-[0.78rem] font-bold text-content-primary tabular-nums">
                            {fmtHours(person.assignedHours)}
                          </span>
                        </span>
                        <OccupancyBar assigned={person.assignedHours} contracted={person.contractHours} />
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: una ficha por persona con los días apilados. */}
      <div className="space-y-4 px-4 pb-5 md:hidden">
        {groups.map((g) => (
          <div key={g.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-pill" style={{ backgroundColor: g.color }} aria-hidden="true" />
              <span className="text-[0.78rem] font-extrabold text-content-primary">{g.name}</span>
            </div>
            {g.people.map((person) => {
              const role = roleById.get(person.roleId)
              const color = role?.color ?? g.color
              const working = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).filter((d) =>
                (shiftsByPersonDay.get(`${person.id}|${d}`) ?? []).length > 0,
              )
              return (
                <div key={person.id} className="rounded-lg border border-border-soft bg-surface-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {onRenamePerson ? (
                        <InlineName
                          value={person.label}
                          onCommit={(v) => onRenamePerson(person.id, v)}
                          ariaLabel={`Ponerle nombre a ${person.label}`}
                          className="text-[0.9rem] font-bold text-content-primary"
                        />
                      ) : (
                        <p className="truncate text-[0.9rem] font-bold text-content-primary">
                          {person.label}
                        </p>
                      )}
                      <p className="text-[0.76rem] font-medium text-content-secondary">
                        {role?.name ?? 'Sin puesto'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone="neutral">{person.contractHours}h</Badge>
                      <p className="mt-1 text-[0.76rem] font-bold text-content-primary tabular-nums">
                        {fmtHours(person.assignedHours)}
                      </p>
                    </div>
                  </div>
                  <OccupancyBar assigned={person.assignedHours} contracted={person.contractHours} />
                  <ul className="mt-3 space-y-1.5">
                    {working.map((d) => (
                      <li key={d} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-[0.76rem] font-bold text-content-secondary">
                          {DAYS[d]}
                        </span>
                        <ShiftPills shifts={shiftsByPersonDay.get(`${person.id}|${d}`) ?? []} color={color} />
                      </li>
                    ))}
                  </ul>
                  {person.daysOff.length > 0 && (
                    <p className="mt-3 text-[0.76rem] font-medium text-content-muted">
                      Libra {listDays(person.daysOff)}.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Vista por día
// ─────────────────────────────────────────────────────────────

interface DayData {
  rows: { person: Person; role: Role | undefined; shifts: Shift[]; start: number }[]
  need: number[]
  covered: number[]
  missing: number[]
  offToday: number
  max: number
}

/** Fondo de la rejilla: una celda por franja de 30 min, con las horas cerradas apagadas. */
function SlotBackdrop({ slots, open }: { slots: number[]; open: boolean[] | null }) {
  return (
    <>
      {slots.map((s, i) => (
        <div
          key={s}
          style={{ gridColumn: i + 1, gridRow: 1 }}
          className={cn(
            'border-r',
            isHourMark(s) ? 'border-border' : 'border-border-soft',
            open && !open[s] ? 'bg-surface/70' : '',
          )}
        />
      ))}
    </>
  )
}

function DayView({
  day,
  slots,
  data,
  openSlots,
  groups,
}: {
  day: DayIndex
  slots: number[]
  data: DayData
  openSlots: boolean[][] | null
  groups: Group[]
}) {
  const open = openSlots ? openSlots[day] : null
  const width = slots.length * SLOT_W
  const blockOf = new Map<string, Group>()
  for (const g of groups) for (const p of g.people) blockOf.set(p.id, g)

  const colStart = (min: number) => Math.max(0, slotOfStart(min) - slots[0])
  const colEnd = (min: number) => Math.min(slots.length, slotOfEnd(min) - slots[0])

  if (data.rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[0.95rem] font-bold text-content-primary">Cerrado: nadie trabaja el {DAYS[day].toLowerCase()}.</p>
        <p className="mt-1 text-[0.85rem] text-content-secondary">
          No hay comensales en ninguna franja de este día, así que el cuadrante no asigna turnos.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto scroll-thin pb-4">
      <div style={{ minWidth: LABEL_W + width }} className="px-4 sm:px-6">
        {/* Eje de horas */}
        <div className="flex">
          <div
            className="sticky left-0 z-20 shrink-0 bg-surface-elevated"
            style={{ width: LABEL_W }}
            aria-hidden="true"
          />
          <div className="grid" style={{ gridTemplateColumns: `repeat(${slots.length}, ${SLOT_W}px)` }}>
            {slots.map((s) => (
              <div key={s} className="pb-1.5 text-[0.65rem] font-bold text-content-muted tabular-nums">
                {isHourMark(s) ? formatSlot(s) : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Una fila por persona que trabaja hoy */}
        <div className="border-t border-border-soft">
          {data.rows
            .slice()
            .sort((a, b) => a.start - b.start)
            .map(({ person, role, shifts }) => {
              const color = role?.color ?? blockOf.get(person.id)?.color ?? '#6C0FD8'
              return (
                <div key={person.id} className="flex items-stretch border-b border-border-soft">
                  <div
                    className="sticky left-0 z-20 flex shrink-0 items-center gap-2 bg-surface-elevated py-1.5 pr-3"
                    style={{ width: LABEL_W }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-pill"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8rem] font-bold text-content-primary">
                        {person.label}
                      </span>
                      <span className="block truncate text-[0.7rem] font-medium text-content-secondary">
                        {person.contractHours}h · {fmtHours(person.assignedHours)}
                      </span>
                    </span>
                  </div>
                  <div
                    className="relative grid min-h-[42px]"
                    style={{ gridTemplateColumns: `repeat(${slots.length}, ${SLOT_W}px)` }}
                  >
                    <SlotBackdrop slots={slots} open={open} />
                    {shifts.flatMap((s) =>
                      s.blocks.map((b, i) => (
                        <div
                          key={`${s.id}-${i}`}
                          style={{
                            gridColumn: `${colStart(b.startMin) + 1} / ${Math.max(colStart(b.startMin) + 2, colEnd(b.endMin) + 1)}`,
                            gridRow: 1,
                            backgroundColor: withAlpha(color, 0.16),
                            borderColor: withAlpha(color, 0.35),
                            color,
                          }}
                          className="z-10 my-1.5 flex items-center overflow-hidden rounded-pill border px-2.5 text-[0.7rem] font-bold whitespace-nowrap"
                          title={`${person.label} · ${formatRange(b.startMin, b.endMin)}`}
                        >
                          {formatRange(b.startMin, b.endMin)}
                        </div>
                      )),
                    )}
                  </div>
                </div>
              )
            })}
        </div>

        {/* Franjas descubiertas del día */}
        {data.missing.some((m) => m > 0) && (
          <div className="flex items-stretch border-b border-border-soft">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 bg-surface-elevated py-2 pr-3 text-[0.75rem] font-bold text-destructive"
              style={{ width: LABEL_W }}
            >
              <TriangleAlert size={14} strokeWidth={2.4} />
              Sin cubrir
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${slots.length}, ${SLOT_W}px)` }}>
              {data.missing.map((m, i) => (
                <div key={slots[i]} className="px-px py-2">
                  {m > 0 && (
                    <div
                      className="rounded-sm bg-destructive-light py-0.5 text-center text-[0.62rem] font-black text-destructive"
                      title={`Faltan ${m} a las ${formatSlot(slots[i])}`}
                    >
                      {m}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Curva de necesidad contra lo que cubre el cuadrante */}
        <div className="flex items-stretch">
          <div
            className="sticky left-0 z-20 flex shrink-0 flex-col justify-center bg-surface-elevated pr-3"
            style={{ width: LABEL_W }}
          >
            <span className="text-[0.75rem] font-bold text-content-primary">Necesidad</span>
            <span className="text-[0.7rem] font-medium text-content-secondary">
              Pico: {Math.max(...data.need)} personas
            </span>
          </div>
          <svg
            width={width}
            height={CURVE_H}
            viewBox={`0 0 ${width} ${CURVE_H}`}
            role="img"
            aria-label={`Necesidad del ${DAYS[day].toLowerCase()}: pico de ${Math.max(...data.need)} personas; el cuadrante llega a ${Math.max(...data.covered)}.`}
            className="mt-2 shrink-0"
          >
            <path d={stepPath(data.need, data.max, true)} className="fill-brand" opacity={0.12} />
            <path
              d={stepPath(data.need, data.max, false)}
              className="fill-none stroke-brand"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <path
              d={stepPath(data.covered, data.max, false)}
              className="fill-none stroke-success"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.75rem] font-medium text-content-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-brand/25" aria-hidden="true" />
            Personas que pide la demanda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-pill bg-success" aria-hidden="true" />
            Personas del cuadrante
          </span>
          {data.offToday > 0 && (
            <span>
              {data.offToday} {data.offToday === 1 ? 'persona libra' : 'personas libran'} el{' '}
              {DAYS[day].toLowerCase()}.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
