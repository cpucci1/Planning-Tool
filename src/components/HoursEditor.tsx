/**
 * Editor del horario de apertura.
 *
 * Una fila por día sobre una pista que va de GRID_START_MIN a GRID_END_MIN
 * (06:00 → 06:00 del día siguiente). Cada tramo es una barra que se mueve
 * entera o se estira por los extremos, siempre en saltos de 30 minutos.
 *
 * SOLAPES: al arrastrar, la barra hace TOPE contra sus vecinas — nunca se come
 * un tramo que ya estaba puesto, que es lo que más sorprende al usuario. Como
 * el tope deja las barras pegadas, al soltar se fusionan las que se tocan: dos
 * tramos consecutivos sin hueco son, de hecho, un solo tramo de apertura.
 * Los solapes de verdad solo pueden venir de escribir las horas a mano, y ahí
 * también se fusionan.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, MoreHorizontal, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  DAYS,
  DAYS_SHORT,
  GRID_END_MIN,
  GRID_START_MIN,
  SLOT_MINUTES,
  clockToGridMin,
  formatMin,
  formatRange,
  parseTime,
} from '@/lib/time'
import type { OpenBlock, OpeningHours } from '@/lib/types'
import { Badge, Button, Card, CardHeader, InfoTip, cn } from '@/components/ui'

// ─────────────────────────────────────────────────────────────
// Geometría de la pista
// ─────────────────────────────────────────────────────────────

const TRACK_MIN = GRID_END_MIN - GRID_START_MIN

/** Marcas de hora en punto, sin la primera ni la última. */
const HOUR_MARKS: number[] = (() => {
  const out: number[] = []
  for (let m = GRID_START_MIN + 60; m < GRID_END_MIN; m += 60) out.push(m)
  return out
})()

/** Solo cinco etiquetas: más satura la fila en móvil. */
const LABEL_MARKS = [8 * 60, 12 * 60, 16 * 60, 20 * 60, 24 * 60]

const MIDNIGHT = 24 * 60

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function snap(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES
}

function pct(min: number): number {
  return ((min - GRID_START_MIN) / TRACK_MIN) * 100
}

function blockMinutes(b: OpenBlock): number {
  return b.endMin - b.startMin
}

function dayMinutes(blocks: OpenBlock[]): number {
  return blocks.reduce((acc, b) => acc + blockMinutes(b), 0)
}

function formatHours(minutes: number): string {
  return `${(minutes / 60).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`
}

/** Ordena, recorta a la rejilla y fusiona lo que se toca o se solapa. */
function normalizeDay(blocks: OpenBlock[]): OpenBlock[] {
  const sorted = blocks
    .map((b) => ({
      startMin: clamp(snap(b.startMin), GRID_START_MIN, GRID_END_MIN - SLOT_MINUTES),
      endMin: clamp(snap(b.endMin), GRID_START_MIN + SLOT_MINUTES, GRID_END_MIN),
    }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin)

  const out: OpenBlock[] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    if (last && b.startMin <= last.endMin) last.endMin = Math.max(last.endMin, b.endMin)
    else out.push({ ...b })
  }
  return out
}

/** Huecos libres del día, de mayor a menor prioridad de uso. */
function gapsOf(blocks: OpenBlock[]): [number, number][] {
  const gaps: [number, number][] = []
  let cursor = GRID_START_MIN
  for (const b of blocks) {
    if (b.startMin - cursor >= SLOT_MINUTES) gaps.push([cursor, b.startMin])
    cursor = Math.max(cursor, b.endMin)
  }
  if (GRID_END_MIN - cursor >= SLOT_MINUTES) gaps.push([cursor, GRID_END_MIN])
  return gaps
}

// ─────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────

const PRESETS: { id: string; label: string; blocks: OpenBlock[] }[] = [
  { id: 'comidas', label: 'Solo comidas', blocks: [{ startMin: 13 * 60, endMin: 16 * 60 + 30 }] },
  {
    id: 'comidas-cenas',
    label: 'Comidas y cenas',
    blocks: [
      { startMin: 13 * 60, endMin: 16 * 60 + 30 },
      { startMin: 20 * 60, endMin: MIDNIGHT },
    ],
  },
  { id: 'todo', label: 'Todo el día', blocks: [{ startMin: 12 * 60, endMin: MIDNIGHT }] },
  { id: 'cenas', label: 'Solo cenas', blocks: [{ startMin: 19 * 60 + 30, endMin: MIDNIGHT }] },
]

/** Tramo por defecto al añadir: cuatro horas, y si cabe, a la hora de comer. */
const NEW_BLOCK_MIN = 4 * 60
const PREFERRED_START = 13 * 60

type DragMode = 'move' | 'start' | 'end'

interface DragState {
  day: number
  index: number
  mode: DragMode
  pointerId: number
  originX: number
  origin: OpenBlock
  trackWidth: number
  current: OpenBlock
  moved: boolean
}

// ─────────────────────────────────────────────────────────────

export function HoursEditor({
  hours,
  onChange,
  detected,
  eyebrow = 'Horario de actividad del centro',
  title = (
    <>
      Cuándo está <span className="text-brand italic">en marcha el local.</span>
    </>
  ),
  subtitle = 'Arrastra las barras para ajustar cada día. Un día sin barras es un día cerrado.',
}: {
  hours: OpeningHours
  onChange: (h: OpeningHours) => void
  detected?: OpeningHours
  /** Para reutilizar este mismo editor con el horario de un bloque (cocina),
   *  que necesita su propia cabecera para no confundirse con el general. */
  eyebrow?: string
  title?: React.ReactNode
  subtitle?: string
}) {
  // Normalizamos siempre para pintar: el editor nunca debe dibujar solapes,
  // vengan de donde vengan.
  const week = useMemo<OpenBlock[][]>(
    () => Array.from({ length: 7 }, (_, d) => normalizeDay(hours[d] ?? [])),
    [hours],
  )

  const [selected, setSelected] = useState<{ day: number; index: number } | null>(null)
  const [pickedDays, setPickedDays] = useState<number[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const trackRefs = useRef<(HTMLDivElement | null)[]>([])

  // El editor de horas del tramo ahora flota sobre el propio tramo en vez de
  // empujar contenido debajo, así que un clic fuera de él (o de la barra que
  // lo abrió) tiene que cerrarlo — si no, queda flotando sobre lo que sea que
  // el usuario mire después.
  useEffect(() => {
    if (!selected) return
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[data-tramo-bar], [data-tramo-popover]')) return
      setSelected(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selected])

  // El ancho real de la pista decide qué etiqueta cabe dentro de cada barra:
  // en móvil un tramo de 3 h son 40 px y ahí no entra ninguna hora.
  const [trackPx, setTrackPx] = useState(0)
  useEffect(() => {
    const el = trackRefs.current[0]
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => setTrackPx(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const totalWeek = week.reduce((acc, d) => acc + dayMinutes(d), 0)
  const openDays = week.filter((d) => d.length > 0).length

  const detectedNormalized = useMemo(
    () => (detected ? Array.from({ length: 7 }, (_, d) => normalizeDay(detected[d] ?? [])) : null),
    [detected],
  )
  const sameAsDetected =
    detectedNormalized !== null && JSON.stringify(detectedNormalized) === JSON.stringify(week)

  // ── Mutaciones ────────────────────────────────────────────

  function commit(next: OpenBlock[][]) {
    onChange(next.map((d) => normalizeDay(d)))
  }

  function setDay(day: number, blocks: OpenBlock[]) {
    commit(week.map((d, i) => (i === day ? blocks : d)))
  }

  /** Sustituye un tramo y deja seleccionado el que lo contiene tras fusionar. */
  function applyBlock(day: number, index: number, block: OpenBlock) {
    const normalized = normalizeDay(week[day].map((b, i) => (i === index ? block : b)))
    onChange(week.map((d, i) => (i === day ? normalized : d)))
    const idx = normalized.findIndex((b) => block.startMin >= b.startMin && block.startMin < b.endMin)
    setSelected({ day, index: idx < 0 ? 0 : idx })
  }

  function removeBlock(day: number, index: number) {
    setDay(
      day,
      week[day].filter((_, i) => i !== index),
    )
    setSelected(null)
  }

  /** Crea un tramo en el hueco que contiene `at`. */
  function createAt(day: number, at: number) {
    const gap = gapsOf(week[day]).find(([gs, ge]) => at >= gs && at < ge)
    if (!gap) return
    const [gs, ge] = gap
    const len = Math.min(NEW_BLOCK_MIN, ge - gs)
    const startMin = clamp(snap(at), gs, ge - len)
    const blocks = normalizeDay([...week[day], { startMin, endMin: startMin + len }])
    onChange(week.map((d, i) => (i === day ? blocks : d)))
    const idx = blocks.findIndex((b) => startMin >= b.startMin && startMin < b.endMin)
    setSelected({ day, index: idx < 0 ? 0 : idx })
  }

  /** Botón "+": usa el hueco más ancho, empezando a la hora de comer si cabe. */
  function addBlock(day: number) {
    const gaps = gapsOf(week[day])
    if (gaps.length === 0) return
    const [gs, ge] = gaps.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a))
    const at = PREFERRED_START >= gs && PREFERRED_START < ge ? PREFERRED_START : gs
    createAt(day, at)
  }

  function copyDay(from: number, targets: number[]) {
    commit(week.map((d, i) => (targets.includes(i) ? week[from].map((b) => ({ ...b })) : d)))
    setSelected(null)
  }

  function applyPreset(blocks: OpenBlock[]) {
    const targets = pickedDays.length > 0 ? pickedDays : [0, 1, 2, 3, 4, 5, 6]
    commit(week.map((d, i) => (targets.includes(i) ? blocks.map((b) => ({ ...b })) : d)))
    setSelected(null)
  }

  function setEdge(day: number, index: number, edge: 'start' | 'end', value: string) {
    const raw = parseTime(value)
    if (raw === null) return
    const min = clamp(snap(clockToGridMin(Math.floor(raw / 60), raw % 60)), GRID_START_MIN, GRID_END_MIN)
    const b = week[day][index]
    if (!b) return
    if (edge === 'start') {
      if (min > b.endMin - SLOT_MINUTES) return
      applyBlock(day, index, { startMin: min, endMin: b.endMin })
    } else {
      if (min < b.startMin + SLOT_MINUTES) return
      applyBlock(day, index, { startMin: b.startMin, endMin: min })
    }
  }

  // ── Arrastre ──────────────────────────────────────────────

  function boundsOf(day: number, index: number): [number, number] {
    const blocks = week[day]
    return [
      index > 0 ? blocks[index - 1].endMin : GRID_START_MIN,
      index < blocks.length - 1 ? blocks[index + 1].startMin : GRID_END_MIN,
    ]
  }

  function resolve(mode: DragMode, origin: OpenBlock, delta: number, lower: number, upper: number): OpenBlock {
    if (mode === 'move') {
      const len = blockMinutes(origin)
      const startMin = clamp(origin.startMin + delta, lower, upper - len)
      return { startMin, endMin: startMin + len }
    }
    if (mode === 'start') {
      return {
        startMin: clamp(origin.startMin + delta, lower, origin.endMin - SLOT_MINUTES),
        endMin: origin.endMin,
      }
    }
    return {
      startMin: origin.startMin,
      endMin: clamp(origin.endMin + delta, origin.startMin + SLOT_MINUTES, upper),
    }
  }

  function startDrag(e: React.PointerEvent<HTMLElement>, mode: DragMode, day: number, index: number) {
    if (e.button !== 0) return
    const track = trackRefs.current[day]
    const block = week[day][index]
    if (!track || !block) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected({ day, index })
    setDrag({
      day,
      index,
      mode,
      pointerId: e.pointerId,
      originX: e.clientX,
      origin: block,
      trackWidth: track.getBoundingClientRect().width,
      current: block,
      moved: false,
    })
  }

  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    if (!drag || drag.pointerId !== e.pointerId) return
    const delta = snap(((e.clientX - drag.originX) * TRACK_MIN) / Math.max(1, drag.trackWidth))
    const [lower, upper] = boundsOf(drag.day, drag.index)
    const current = resolve(drag.mode, drag.origin, delta, lower, upper)
    const moved = drag.moved || delta !== 0
    const changed = current.startMin !== drag.current.startMin || current.endMin !== drag.current.endMin
    if (!changed && moved === drag.moved) return
    setDrag({ ...drag, current, moved })
  }

  function endDrag(e: React.PointerEvent<HTMLElement>) {
    if (!drag || drag.pointerId !== e.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (drag.moved) applyBlock(drag.day, drag.index, drag.current)
    setDrag(null)
  }

  function onBarKey(e: React.KeyboardEvent, day: number, index: number) {
    const b = week[day][index]
    if (!b) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeBlock(day, index)
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    const [lower, upper] = boundsOf(day, index)
    // Con Mayús se estira por el final; sin Mayús se mueve el tramo entero.
    const next = resolve(e.shiftKey ? 'end' : 'move', b, dir * SLOT_MINUTES, lower, upper)
    applyBlock(day, index, next)
  }

  /** Un día cerrado se reabre con el horario más común: comidas y cenas. */
  function applyPresetToDay(day: number) {
    commit(week.map((d, i) => (i === day ? PRESETS[1].blocks.map((b) => ({ ...b })) : d)))
  }

  function onTrackClick(e: React.MouseEvent<HTMLDivElement>, day: number) {
    const el = trackRefs.current[day]
    if (!el || e.target !== el) return
    const rect = el.getBoundingClientRect()
    createAt(day, GRID_START_MIN + ((e.clientX - rect.left) / rect.width) * TRACK_MIN)
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <Card
      className="no-select"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setSelected(null)
      }}
    >
      <CardHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        info={
          <InfoTip title="Para qué sirve el horario">
            Fuera del horario no se calcula plantilla. Recorta el ruido del histórico: si el fichero
            trae comensales a las 06:00 de un martes que estás cerrado, aquí se descartan.
          </InfoTip>
        }
        action={
          <div className="text-right whitespace-nowrap">
            <div className="text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
              <span className="sm:hidden">Semana</span>
              <span className="hidden sm:inline">Apertura semanal</span>
            </div>
            <div className="mt-1 text-[1.25rem] leading-none font-black tracking-tight text-content-primary sm:text-[1.4rem]">
              {formatHours(totalWeek)}
            </div>
            <div className="mt-1 text-[0.75rem] font-medium text-content-secondary">
              {openDays === 7 ? 'los 7 días' : `${openDays} ${openDays === 1 ? 'día' : 'días'} abiertos`}
            </div>
          </div>
        }
      />

      <div className="px-4 pb-5 sm:px-6">
        {/* Acciones rápidas — lo que de verdad ahorra tiempo */}
        <div className="mb-5 rounded-lg border border-border-soft bg-surface-alt p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => copyDay(0, [1, 2, 3, 4, 5, 6])}
            >
              Copiar lunes al resto
            </Button>
            {detectedNormalized && (
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={14} />}
                disabled={sameAsDetected}
                title={sameAsDetected ? 'Ya estás en el horario que se detectó' : undefined}
                onClick={() => {
                  commit(detectedNormalized.map((d) => d.map((b) => ({ ...b }))))
                  setSelected(null)
                }}
              >
                Volver a lo detectado
              </Button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
            <span className="text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
              Presets
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.blocks)}
                className={cn(
                  'h-9 rounded-pill border border-border bg-surface-elevated px-3.5 text-[0.8rem] font-bold text-content-primary',
                  'transition-colors hover:border-brand hover:text-brand',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                )}
              >
                {p.label}
              </button>
            ))}
            <span className="flex items-center gap-1.5 text-[0.78rem] font-medium text-content-secondary">
              se aplican a
              <Badge tone="brand">
                {pickedDays.length === 0
                  ? 'toda la semana'
                  : `${pickedDays.length} ${pickedDays.length === 1 ? 'día' : 'días'}`}
              </Badge>
              {pickedDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPickedDays([])}
                  className="rounded-pill px-1.5 py-0.5 font-bold text-brand underline underline-offset-2 hover:bg-brand-light"
                >
                  quitar selección
                </button>
              )}
            </span>
          </div>
        </div>

        {/* Regla horaria, alineada con las pistas */}
        <div className="mb-1 flex items-center gap-x-3">
          <div className="hidden sm:block sm:w-24" aria-hidden="true" />
          <div className="relative h-4 flex-1" aria-hidden="true">
            {LABEL_MARKS.map((m) => (
              <span
                key={m}
                style={{ left: `${pct(m)}%` }}
                className={cn(
                  'absolute -translate-x-1/2 text-[0.65rem] font-bold tabular-nums',
                  m === MIDNIGHT ? 'text-content-secondary' : 'text-content-muted',
                )}
              >
                {formatMin(m)}
              </span>
            ))}
          </div>
          <div className="hidden sm:block sm:w-[7.5rem]" aria-hidden="true" />
        </div>

        {/* Una fila por día */}
        <div className="divide-y divide-border-soft">
          {week.map((blocks, day) => {
            const closed = blocks.length === 0
            const selIndex =
              selected && selected.day === day && week[day][selected.index] ? selected.index : null
            const picked = pickedDays.includes(day)

            return (
              <div key={day} className="py-2.5" role="group" aria-label={DAYS[day]}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Nombre del día: también selecciona el día para los presets */}
                  <button
                    type="button"
                    aria-pressed={picked}
                    aria-label={`${DAYS[day]}: seleccionar para aplicar presets`}
                    onClick={() =>
                      setPickedDays((prev) =>
                        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
                      )
                    }
                    className={cn(
                      'flex h-9 flex-1 items-center gap-2 rounded-pill px-2.5 text-[0.85rem] font-bold transition-colors sm:w-24 sm:flex-none',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      picked
                        ? 'bg-brand-light text-brand'
                        : 'text-content-primary hover:bg-surface',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-pill transition-colors',
                        picked ? 'bg-brand' : 'bg-border',
                      )}
                    />
                    <span className="sm:hidden">{DAYS_SHORT[day]}</span>
                    <span className="hidden sm:inline">{DAYS[day]}</span>
                  </button>

                  {/* Pista horaria */}
                  <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                    <div
                      ref={(el) => {
                        trackRefs.current[day] = el
                      }}
                      onClick={(e) => onTrackClick(e, day)}
                      className={cn(
                        'relative h-12 w-full rounded-lg border transition-colors sm:h-10',
                        closed
                          ? 'border-dashed border-border bg-surface/50'
                          : 'cursor-copy border-border-soft bg-surface',
                      )}
                    >
                      {HOUR_MARKS.map((m) => (
                        <span
                          key={m}
                          aria-hidden="true"
                          style={{ left: `${pct(m)}%` }}
                          className={cn(
                            'pointer-events-none absolute inset-y-0 w-px',
                            closed ? 'opacity-40' : '',
                            m === MIDNIGHT ? 'bg-content-muted' : 'bg-border',
                          )}
                        />
                      ))}

                      {closed && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[0.78rem] font-bold text-content-muted">
                          Cerrado
                        </span>
                      )}

                      {blocks.map((b, i) => {
                        const dragging = drag !== null && drag.day === day && drag.index === i
                        const shown = dragging ? drag.current : b
                        const isSel = selIndex === i
                        const len = blockMinutes(shown)
                        const barPx = (len / TRACK_MIN) * trackPx
                        const label =
                          barPx >= 108
                            ? formatRange(shown.startMin, shown.endMin)
                            : barPx >= 62
                              ? formatMin(shown.startMin)
                              : null
                        const barMidPct = (pct(shown.startMin) + pct(shown.endMin)) / 2
                        const anchor = barMidPct < 25 ? 'left' : barMidPct > 75 ? 'right' : 'center'

                        return (
                          <div
                            key={i}
                            data-tramo-bar=""
                            role="button"
                            tabIndex={0}
                            aria-label={`Tramo de ${formatRange(shown.startMin, shown.endMin)} el ${DAYS[
                              day
                            ].toLowerCase()}. Flechas para moverlo, Mayús y flechas para alargarlo, Suprimir para borrarlo.`}
                            onPointerDown={(e) => startDrag(e, 'move', day, i)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onLostPointerCapture={endDrag}
                            onKeyDown={(e) => onBarKey(e, day, i)}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelected({ day, index: i })
                            }}
                            style={{
                              left: `${pct(shown.startMin)}%`,
                              width: `${pct(shown.endMin) - pct(shown.startMin)}%`,
                            }}
                            className={cn(
                              'group absolute inset-y-0.5 flex touch-none items-center justify-center rounded-md bg-brand',
                              'cursor-grab text-content-inverted transition-shadow',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                              dragging ? 'z-20 cursor-grabbing shadow-cta-hover' : 'shadow-cta',
                              isSel && !dragging ? 'ring-2 ring-brand-dark ring-offset-1' : '',
                            )}
                          >
                            {label && (
                              <span className="pointer-events-none truncate px-2 text-[0.7rem] font-bold tabular-nums">
                                {label}
                              </span>
                            )}

                            {/* Extremos: estiran el tramo */}
                            <span
                              aria-hidden="true"
                              onPointerDown={(e) => startDrag(e, 'start', day, i)}
                              onPointerMove={moveDrag}
                              onPointerUp={endDrag}
                              onPointerCancel={endDrag}
                              onLostPointerCapture={endDrag}
                              className="absolute inset-y-0 left-0 flex w-3.5 cursor-ew-resize touch-none items-center justify-center rounded-l-md"
                            >
                              <span className="h-4 w-0.5 rounded-pill bg-content-inverted/60" />
                            </span>
                            <span
                              aria-hidden="true"
                              onPointerDown={(e) => startDrag(e, 'end', day, i)}
                              onPointerMove={moveDrag}
                              onPointerUp={endDrag}
                              onPointerCancel={endDrag}
                              onLostPointerCapture={endDrag}
                              className="absolute inset-y-0 right-0 flex w-3.5 cursor-ew-resize touch-none items-center justify-center rounded-r-md"
                            >
                              <span className="h-4 w-0.5 rounded-pill bg-content-inverted/60" />
                            </span>

                            {/* Borrar: fuera de la barra para no pisar los extremos */}
                            <button
                              type="button"
                              aria-label={`Borrar el tramo de ${formatRange(b.startMin, b.endMin)} del ${DAYS[
                                day
                              ].toLowerCase()}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                removeBlock(day, i)
                              }}
                              className={cn(
                                'absolute -top-2 -right-2 z-30 flex h-6 w-6 items-center justify-center rounded-pill',
                                'border border-border bg-surface-elevated text-content-secondary shadow-sm',
                                'transition-all hover:border-destructive hover:text-destructive',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                                isSel
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                                dragging ? 'hidden' : '',
                              )}
                            >
                              <X size={13} strokeWidth={3} />
                            </button>

                            {/* La hora en curso, grande, mientras se arrastra */}
                            {dragging && (
                              <span className="absolute -top-10 left-1/2 z-40 -translate-x-1/2 rounded-pill bg-content-primary px-3 py-1.5 text-[0.9rem] font-black tabular-nums whitespace-nowrap text-content-inverted shadow-lg">
                                {formatRange(shown.startMin, shown.endMin)}
                                <span className="ml-2 font-bold opacity-60">{formatHours(len)}</span>
                              </span>
                            )}

                            {/* Editor de horas a mano: pegado al propio tramo, no
                                en un banner aparte — si no, no queda claro a qué
                                tramo pertenece. */}
                            {isSel && !dragging && (
                              <div
                                data-tramo-popover=""
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  'animate-slide-down absolute top-full z-30 mt-2 flex w-max flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-surface-elevated px-3 py-2 shadow-lg',
                                  anchor === 'left' && 'left-0',
                                  anchor === 'right' && 'right-0',
                                  anchor === 'center' && 'left-1/2 -translate-x-1/2',
                                )}
                              >
                                <TimeField
                                  label={`Hora de apertura del tramo, ${DAYS[day].toLowerCase()}`}
                                  value={formatMin(shown.startMin)}
                                  onChange={(v) => setEdge(day, i, 'start', v)}
                                />
                                <span className="text-content-muted">→</span>
                                <TimeField
                                  label={`Hora de cierre del tramo, ${DAYS[day].toLowerCase()}`}
                                  value={formatMin(shown.endMin)}
                                  onChange={(v) => setEdge(day, i, 'end', v)}
                                />
                                <span className="text-[0.82rem] font-bold tabular-nums text-content-secondary">
                                  {formatHours(len)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeBlock(day, i)}
                                  className={cn(
                                    'inline-flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-[0.8rem] font-bold text-content-secondary',
                                    'transition-colors hover:bg-destructive-light hover:text-destructive',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                                  )}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Resumen y acciones de la fila */}
                  <div className="flex items-center gap-1 sm:w-[7.5rem] sm:justify-end">
                    <span
                      className={cn(
                        'w-14 text-right text-[0.82rem] font-bold tabular-nums',
                        closed ? 'text-content-muted' : 'text-content-primary',
                      )}
                    >
                      {closed ? '—' : formatHours(dayMinutes(blocks))}
                    </span>
                    <button
                      type="button"
                      aria-label={`Añadir un tramo el ${DAYS[day].toLowerCase()}`}
                      onClick={() => addBlock(day)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-pill text-content-secondary transition-colors',
                        'hover:bg-brand-light hover:text-brand',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      )}
                    >
                      <Plus size={16} strokeWidth={2.5} />
                    </button>
                    <RowMenu
                      day={day}
                      closed={closed}
                      onCopyTo={(targets) => copyDay(day, targets)}
                      onClose={() => {
                        setDay(day, [])
                        setSelected(null)
                      }}
                      onOpenDefault={() => applyPresetToDay(day)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-[0.78rem] leading-relaxed font-medium text-content-secondary">
          Toca una zona vacía de la pista para abrir un tramo nuevo, o la X de una barra para
          cerrarlo.
        </p>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Campo de hora — la vía sin arrastre
// ─────────────────────────────────────────────────────────────

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="time"
      step={SLOT_MINUTES * 60}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 rounded-md border border-border bg-surface-elevated px-2 text-[0.85rem] font-bold tabular-nums text-content-primary',
        'transition-colors focus:border-border-focus focus:outline-none',
      )}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Menú de fila — copiar este día a otros
// ─────────────────────────────────────────────────────────────

function RowMenu({
  day,
  closed,
  onCopyTo,
  onClose,
  onOpenDefault,
}: {
  day: number
  closed: boolean
  onCopyTo: (targets: number[]) => void
  onClose: () => void
  onOpenDefault: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const others = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== day)

  const itemClass = cn(
    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.82rem] font-semibold text-content-primary',
    'transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none',
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Más acciones del ${DAYS[day].toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-pill transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          open ? 'bg-brand-light text-brand' : 'text-content-secondary hover:bg-surface',
        )}
      >
        <MoreHorizontal size={16} strokeWidth={2.5} />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-slide-down scroll-thin absolute top-9 right-0 z-50 max-h-80 w-56 overflow-y-auto rounded-lg border border-border-soft bg-surface-elevated p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onCopyTo(others)
              setOpen(false)
            }}
          >
            <Copy size={14} className="text-content-muted" />
            Copiar al resto de la semana
          </button>

          <div className="mt-1 mb-1 border-t border-border-soft pt-1">
            <span className="block px-2.5 py-1 text-[0.68rem] font-bold tracking-wide text-content-secondary uppercase">
              Copiar este día a
            </span>
            {others.map((d) => (
              <button
                key={d}
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  onCopyTo([d])
                  setOpen(false)
                }}
              >
                {DAYS[d]}
              </button>
            ))}
          </div>

          <div className="border-t border-border-soft pt-1">
            {closed ? (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  onOpenDefault()
                  setOpen(false)
                }}
              >
                <Plus size={14} className="text-content-muted" />
                Abrir con comidas y cenas
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className={cn(itemClass, 'text-destructive hover:bg-destructive-light')}
                onClick={() => {
                  onClose()
                  setOpen(false)
                }}
              >
                <Trash2 size={14} />
                Cerrar este día
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
