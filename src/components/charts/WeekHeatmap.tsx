/**
 * Rejilla semana × franjas de 30 min.
 *
 * Es la tabla de demanda editable (comensales) y, con `mode='people'`, la misma
 * rejilla pintada con la necesidad de personal. Dos escalas de color distintas
 * a propósito: si las dos vistas fueran moradas nadie sabría cuál está mirando.
 *
 * Interacción: clic edita la celda, arrastre (o shift+clic) selecciona un rango
 * y lo rellena de golpe, y las cabeceras seleccionan la franja entera o el día
 * entero. Todo se puede hacer también con el teclado.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as RKeyboardEvent,
  type PointerEvent as RPointerEvent,
} from 'react'
import {
  ALL_SLOTS,
  DAYS,
  DAYS_SHORT,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  formatSlot,
  isHourMark,
  slotStartMin,
} from '@/lib/time'
import type { OpeningHours } from '@/lib/types'
import { Button, InfoTip, cn } from '@/components/ui'

type Mode = 'covers' | 'people'

export interface WeekHeatmapProps {
  /** `grid[dia][franja]`. 7 filas × SLOTS_PER_DAY columnas. */
  grid: number[][]
  mode: Mode
  /** Si viene, la rejilla es editable. */
  onCellChange?: (day: number, slot: number, value: number) => void
  /** Franjas fuera del horario: se pintan rayadas y no se pueden editar. */
  openBlocks?: OpeningHours
  /** Alto máximo del área con scroll, en px. */
  height?: number
  title?: string
}

interface Cell {
  day: number
  slot: number
}
interface Rect {
  d0: number
  d1: number
  s0: number
  s1: number
}

// ─────────────────────────────────────────────────────────────
// Escalas de color
// ─────────────────────────────────────────────────────────────

type Rgb = readonly [number, number, number]

/**
 * Los extremos van a mano en RGB porque son colores de dato, no de interfaz:
 * hay que interpolarlos y eso no se puede hacer con clases de Tailwind.
 * Morado de marca para comensales, ámbar para personas.
 */
const SCALE: Record<Mode, { from: Rgb; to: Rgb }> = {
  covers: { from: [245, 238, 253], to: [108, 15, 216] },
  people: { from: [255, 244, 224], to: [176, 66, 8] },
}

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const c = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * t)
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`
}

/**
 * Intensidad de la celda. Arranca en 0.14 para que un valor de 1 sobre un
 * máximo de 200 se vea igualmente, y usa una potencia < 1 para no aplastar
 * todo el rango bajo, que es donde está la mayoría de las franjas.
 */
function intensity(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return 0.14 + 0.86 * Math.pow(Math.min(1, value / max), 0.72)
}

function scaleColor(mode: Mode, t: number): string {
  const s = SCALE[mode]
  return mixRgb(s.from, s.to, t)
}

/** Patrón de rayas para "cerrado". Textura, no color de marca. */
const CLOSED_PATTERN =
  'repeating-linear-gradient(45deg, transparent 0 3px, rgba(17,17,24,0.045) 3px 6px)'

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

function rectOf(a: Cell, b: Cell): Rect {
  return {
    d0: Math.min(a.day, b.day),
    d1: Math.max(a.day, b.day),
    s0: Math.min(a.slot, b.slot),
    s1: Math.max(a.slot, b.slot),
  }
}
function inRect(r: Rect, d: number, s: number): boolean {
  return d >= r.d0 && d <= r.d1 && s >= r.s0 && s <= r.s1
}
function rectCells(r: Rect): number {
  return (r.d1 - r.d0 + 1) * (r.s1 - r.s0 + 1)
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (n >= 10000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function cellElFrom(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return null
  return el.closest<HTMLElement>('[data-cell]')
}

// ─────────────────────────────────────────────────────────────

export function WeekHeatmap({
  grid,
  mode,
  onCellChange,
  openBlocks,
  height,
  title,
}: WeekHeatmapProps) {
  const editable = Boolean(onCellChange)
  const unit = mode === 'covers' ? 'comensales' : 'personas'

  const valueAt = useCallback((d: number, s: number) => grid[d]?.[s] ?? 0, [grid])

  // Máscara de apertura. Sin `openBlocks` se asume todo abierto.
  const open = useMemo(() => {
    const mask: boolean[][] = []
    for (let d = 0; d < 7; d++) {
      const blocks = openBlocks?.[d] ?? []
      const row: boolean[] = []
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const min = slotStartMin(s)
        row.push(
          !openBlocks ? true : blocks.some((b) => min >= b.startMin && min < b.endMin),
        )
      }
      mask.push(row)
    }
    return mask
  }, [openBlocks])

  const isEditable = useCallback(
    (d: number, s: number) => editable && open[d][s],
    [editable, open],
  )

  const { max, dayTotals, slotTotals } = useMemo(() => {
    let m = 0
    const dt = new Array<number>(7).fill(0)
    const st = new Array<number>(SLOTS_PER_DAY).fill(0)
    for (let d = 0; d < 7; d++) {
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const v = grid[d]?.[s] ?? 0
        if (v > m) m = v
        dt[d] += v
        st[s] += v
      }
    }
    return { max: m, dayTotals: dt, slotTotals: st }
  }, [grid])

  // ── Medidas: la rejilla se estira si cabe y se queda en el mínimo táctil si no
  const wrapRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({ cellW: 26, labelW: 78, totalW: 56, narrow: false })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const minCell = coarse ? 34 : 22

    const compute = () => {
      const narrow = el.clientWidth < 560
      const labelW = narrow ? 44 : 78
      const totalW = narrow ? 46 : 56
      const avail = el.clientWidth - labelW - totalW
      const cellW = Math.max(minCell, Math.min(46, Math.floor(avail / SLOTS_PER_DAY)))
      setMetrics((prev) =>
        prev.cellW === cellW && prev.labelW === labelW && prev.narrow === narrow
          ? prev
          : { cellW, labelW, totalW, narrow },
      )
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { cellW, labelW, totalW, narrow } = metrics
  const rowH = Math.min(40, Math.max(30, cellW))
  const fontPx = Math.max(9, Math.min(12, Math.round(cellW * 0.42)))
  // Con celdas estrechas las etiquetas de hora se pisarían: se pintan cada 2 h.
  const labelEvery = cellW >= 30 ? 2 : cellW >= 24 ? 4 : 6

  // ── Estado de interacción
  const [cursor, setCursor] = useState<Cell>({ day: 0, slot: 0 })
  const [hover, setHover] = useState<{ day: number; slot: number; x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [edit, setEdit] = useState<{ day: number; slot: number; draft: string } | null>(null)
  const [bulk, setBulk] = useState('')

  const anchorRef = useRef<Cell | null>(null)
  const draggingRef = useRef(false)
  const downRef = useRef<{ day: number; slot: number; x: number; y: number } | null>(null)
  const skipBlurRef = useRef(false)
  const wantFocusRef = useRef(false)
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())
  const bulkRef = useRef<HTMLInputElement>(null)

  const registerCell = useCallback((d: number, s: number, el: HTMLTableCellElement | null) => {
    const k = `${d}:${s}`
    if (el) cellRefs.current.set(k, el)
    else cellRefs.current.delete(k)
  }, [])

  // El foco solo se mueve cuando lo pide el teclado, nunca en un render suelto.
  useEffect(() => {
    if (!wantFocusRef.current) return
    wantFocusRef.current = false
    cellRefs.current.get(`${cursor.day}:${cursor.slot}`)?.focus()
  }, [cursor])

  const moveCursor = useCallback((d: number, s: number, extend: boolean) => {
    const day = Math.max(0, Math.min(6, d))
    const slot = Math.max(0, Math.min(SLOTS_PER_DAY - 1, s))
    wantFocusRef.current = true
    setCursor({ day, slot })
    if (extend) {
      const a = anchorRef.current ?? { day, slot }
      anchorRef.current = a
      setSelection(rectOf(a, { day, slot }))
    } else {
      anchorRef.current = { day, slot }
      setSelection(null)
    }
  }, [])

  // ── Edición
  const beginEdit = useCallback(
    (d: number, s: number, initial?: string) => {
      if (!isEditable(d, s)) return
      const v = grid[d]?.[s] ?? 0
      setEdit({ day: d, slot: s, draft: initial ?? (v === 0 ? '' : String(v)) })
    },
    [grid, isEditable],
  )

  /** Siguiente celda abierta en una dirección. null si no queda ninguna. */
  const nextOpen = useCallback(
    (d: number, s: number, dd: number, ds: number): Cell | null => {
      let day = d + dd
      let slot = s + ds
      while (day >= 0 && day < 7 && slot >= 0 && slot < SLOTS_PER_DAY) {
        if (isEditable(day, slot)) return { day, slot }
        day += dd
        slot += ds
      }
      return null
    },
    [isEditable],
  )

  const commit = useCallback(
    (move: 'up' | 'down' | 'left' | 'right' | null) => {
      const e = edit
      if (!e) return
      skipBlurRef.current = true
      const raw = e.draft.trim()
      const n = raw === '' ? 0 : Number(raw.replace(',', '.'))
      if (Number.isFinite(n)) {
        onCellChange?.(e.day, e.slot, Math.max(0, Math.round(n * 10) / 10))
      }
      const step: Record<string, [number, number]> = {
        up: [-1, 0],
        down: [1, 0],
        left: [0, -1],
        right: [0, 1],
      }
      const target = move ? nextOpen(e.day, e.slot, step[move][0], step[move][1]) : null
      if (target) {
        setCursor(target)
        anchorRef.current = target
        setSelection(null)
        setEdit({ day: target.day, slot: target.slot, draft: '' })
      } else {
        setEdit(null)
        if (move) {
          wantFocusRef.current = true
          setCursor({ day: e.day, slot: e.slot })
        }
      }
      window.setTimeout(() => {
        skipBlurRef.current = false
      }, 0)
    },
    [edit, nextOpen, onCellChange],
  )

  const applyValue = useCallback(
    (r: Rect, value: number) => {
      if (!onCellChange) return
      for (let d = r.d0; d <= r.d1; d++) {
        for (let s = r.s0; s <= r.s1; s++) {
          if (open[d][s]) onCellChange(d, s, value)
        }
      }
    },
    [onCellChange, open],
  )

  // ── Puntero (delegado en la tabla: 300 celdas con handler propio serían 300 closures por render)
  const handlePointerDown = useCallback(
    (e: RPointerEvent<HTMLTableElement>) => {
      const el = cellElFrom(e.target)
      if (!el) return
      const d = Number(el.dataset.d)
      const s = Number(el.dataset.s)
      setCursor({ day: d, slot: s })

      if (!isEditable(d, s)) {
        setSelection(null)
        return
      }
      downRef.current = { day: d, slot: s, x: e.clientX, y: e.clientY }

      // Solo el ratón arrastra para seleccionar: en táctil el arrastre es scroll.
      if (e.pointerType === 'mouse') {
        e.preventDefault()
        el.focus()
        if (e.shiftKey && anchorRef.current) {
          setSelection(rectOf(anchorRef.current, { day: d, slot: s }))
        } else {
          anchorRef.current = { day: d, slot: s }
          setSelection({ d0: d, d1: d, s0: s, s1: s })
        }
        draggingRef.current = true
      }
    },
    [isEditable],
  )

  const handlePointerOver = useCallback(
    (e: RPointerEvent<HTMLTableElement>) => {
      const el = cellElFrom(e.target)
      if (!el) {
        setHover(null)
        return
      }
      const d = Number(el.dataset.d)
      const s = Number(el.dataset.s)

      if (draggingRef.current && anchorRef.current) {
        setSelection(rectOf(anchorRef.current, { day: d, slot: s }))
      }
      if (e.pointerType !== 'mouse') return
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top
      setHover((prev) => (prev && prev.day === d && prev.slot === s ? prev : { day: d, slot: s, x, y }))
    },
    [],
  )

  useEffect(() => {
    function onUp(e: PointerEvent) {
      const down = downRef.current
      const wasDragging = draggingRef.current
      downRef.current = null
      draggingRef.current = false
      if (!down) return
      const moved = Math.abs(e.clientX - down.x) > 6 || Math.abs(e.clientY - down.y) > 6
      if (!moved) {
        setSelection({ d0: down.day, d1: down.day, s0: down.slot, s1: down.slot })
        anchorRef.current = { day: down.day, slot: down.slot }
        beginEdit(down.day, down.slot)
      } else if (wasDragging) {
        // Al soltar un rango, el sitio útil para el cursor es el campo de valor.
        setBulk('')
        window.setTimeout(() => bulkRef.current?.focus(), 0)
      }
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [beginEdit])

  // ── Teclado sobre las celdas
  const handleKeyDown = useCallback(
    (e: RKeyboardEvent<HTMLTableElement>) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'TD') return // el input de edición gestiona lo suyo
      const el = cellElFrom(target)
      if (!el) return
      const d = Number(el.dataset.d)
      const s = Number(el.dataset.s)
      const ext = e.shiftKey

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          moveCursor(d - 1, s, ext)
          return
        case 'ArrowDown':
          e.preventDefault()
          moveCursor(d + 1, s, ext)
          return
        case 'ArrowLeft':
          e.preventDefault()
          moveCursor(d, s - 1, ext)
          return
        case 'ArrowRight':
          e.preventDefault()
          moveCursor(d, s + 1, ext)
          return
        case 'Home':
          e.preventDefault()
          moveCursor(d, 0, ext)
          return
        case 'End':
          e.preventDefault()
          moveCursor(d, SLOTS_PER_DAY - 1, ext)
          return
        case 'Escape':
          setSelection(null)
          return
        case 'Enter':
        case 'F2':
          e.preventDefault()
          beginEdit(d, s)
          return
        case 'Delete':
        case 'Backspace': {
          if (!editable) return
          e.preventDefault()
          const r = selection ?? { d0: d, d1: d, s0: s, s1: s }
          applyValue(r, 0)
          return
        }
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        if (selection && rectCells(selection) > 1) {
          setBulk(e.key)
          window.setTimeout(() => bulkRef.current?.focus(), 0)
        } else {
          beginEdit(d, s, e.key)
        }
      }
    },
    [applyValue, beginEdit, editable, moveCursor, selection],
  )

  const selectColumn = (s: number) => {
    if (!editable) return
    anchorRef.current = { day: 0, slot: s }
    setSelection({ d0: 0, d1: 6, s0: s, s1: s })
    setCursor({ day: 0, slot: s })
    setBulk('')
    window.setTimeout(() => bulkRef.current?.focus(), 0)
  }

  const selectRow = (d: number) => {
    if (!editable) return
    anchorRef.current = { day: d, slot: 0 }
    setSelection({ d0: d, d1: d, s0: 0, s1: SLOTS_PER_DAY - 1 })
    setCursor({ day: d, slot: 0 })
    setBulk('')
    window.setTimeout(() => bulkRef.current?.focus(), 0)
  }

  const selCount = selection ? rectCells(selection) : 0
  const showBulk = editable && selection !== null && selCount > 1

  const applyBulk = () => {
    if (!selection) return
    const n = Number(bulk.trim().replace(',', '.'))
    if (!Number.isFinite(n)) return
    applyValue(selection, Math.max(0, Math.round(n * 10) / 10))
  }

  // ── Cabecera
  const defaultTitle =
    mode === 'covers' ? (
      <>
        La demanda, <span className="text-brand italic">franja a franja.</span>
      </>
    ) : (
      <>
        La plantilla, <span className="text-brand italic">franja a franja.</span>
      </>
    )

  const totalLabel = (n: number) =>
    mode === 'people' ? `${fmt((n * SLOT_MINUTES) / 60)} h` : fmt(n)

  return (
    <div className="w-full">
      {/* Título, leyenda y barra de relleno múltiple */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="h3 flex items-center gap-2">
            {title ?? defaultTitle}
            <InfoTip title="Cómo leer la rejilla">
              Cada celda son 30 minutos de un día.{' '}
              {mode === 'covers'
                ? 'El color va del más flojo al más lleno respecto al máximo de la semana.'
                : 'El color marca cuánta gente hace falta a la vez en esa franja.'}{' '}
              Las celdas rayadas caen fuera de tu horario: ahí no se cuenta nada.
            </InfoTip>
          </h3>
          <p className="mt-1 text-[0.82rem] text-content-secondary">
            {max > 0
              ? `Máximo de la semana: ${fmt(max)} ${unit} en una franja.`
              : 'Todavía no hay datos en la rejilla.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] font-bold text-content-muted">0</span>
            <span
              className="h-2.5 w-24 rounded-pill border border-border-soft"
              style={{
                backgroundImage: `linear-gradient(90deg, ${scaleColor(mode, 0.14)}, ${scaleColor(mode, 0.55)}, ${scaleColor(mode, 1)})`,
              }}
              aria-hidden="true"
            />
            <span className="text-[0.7rem] font-bold text-content-muted">{fmt(max)}</span>
          </div>
          {openBlocks && (
            <div className="flex items-center gap-1.5">
              <span
                className="h-3.5 w-3.5 rounded-sm border border-border bg-surface-alt"
                style={{ backgroundImage: CLOSED_PATTERN }}
                aria-hidden="true"
              />
              <span className="text-[0.7rem] font-bold text-content-muted">Cerrado</span>
            </div>
          )}
        </div>
      </div>

      {showBulk && (
        <div className="animate-slide-down mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-brand-light px-3 py-2">
          <span className="text-[0.82rem] font-bold text-brand">
            {selCount} franjas seleccionadas
          </span>
          <input
            ref={bulkRef}
            type="number"
            inputMode="numeric"
            min={0}
            value={bulk}
            aria-label={`Valor para las ${selCount} franjas seleccionadas`}
            placeholder={mode === 'covers' ? 'Comensales' : 'Personas'}
            onChange={(e) => setBulk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyBulk()
              }
              if (e.key === 'Escape') setSelection(null)
            }}
            className="h-9 w-28 rounded-md border border-border bg-surface-elevated px-3 text-center text-[0.9rem] font-semibold text-content-primary placeholder:font-medium placeholder:text-content-muted focus:border-border-focus focus:outline-none"
          />
          <Button size="sm" onClick={applyBulk} disabled={bulk.trim() === ''}>
            Aplicar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => selection && applyValue(selection, 0)}>
            Vaciar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection(null)}>
            Quitar selección
          </Button>
        </div>
      )}

      {/* Rejilla */}
      <div
        ref={wrapRef}
        className="scroll-thin overflow-x-auto overflow-y-auto rounded-lg border border-border-soft"
        style={{ maxHeight: height }}
      >
        <table
          role="grid"
          className="table-fixed border-separate border-spacing-0 select-none"
          style={{ width: labelW + cellW * SLOTS_PER_DAY + totalW }}
          onPointerDown={handlePointerDown}
          onPointerOver={handlePointerOver}
          onPointerLeave={() => setHover(null)}
          onKeyDown={handleKeyDown}
        >
          <caption className="sr-only">
            {mode === 'covers' ? 'Comensales' : 'Personas necesarias'} por día y franja de 30
            minutos.
            {editable && ' Puedes editar cada celda con Enter o escribiendo un número.'}
          </caption>

          <colgroup>
            <col style={{ width: labelW }} />
            {ALL_SLOTS.map((s) => (
              <col key={s} style={{ width: cellW }} />
            ))}
            <col style={{ width: totalW }} />
          </colgroup>

          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-40 border-r border-b border-border bg-surface-elevated px-2 py-1.5 text-left text-[0.68rem] font-bold tracking-wide text-content-muted uppercase"
              >
                Día
              </th>
              {ALL_SLOTS.map((s) => {
                const isHour = isHourMark(s)
                const showLabel = isHour && s % labelEvery === 0
                return (
                  <th
                    key={s}
                    scope="col"
                    className={cn(
                      'relative sticky top-0 z-20 h-7 border-b border-border bg-surface-elevated p-0 align-bottom',
                      isHour ? 'border-l border-l-border' : 'border-l border-l-border-soft',
                      hover?.slot === s && 'bg-brand-light',
                    )}
                  >
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => selectColumn(s)}
                        aria-label={`Seleccionar la franja de las ${formatSlot(s)} en los siete días`}
                        className="absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                      />
                    ) : null}
                    {showLabel && (
                      <span
                        className={cn(
                          'pointer-events-none absolute bottom-1 whitespace-nowrap text-[0.62rem] font-bold',
                          hover?.slot === s ? 'text-brand' : 'text-content-secondary',
                          s === 0 ? 'left-0.5' : 'left-0 -translate-x-1/2',
                        )}
                      >
                        {formatSlot(s)}
                      </span>
                    )}
                  </th>
                )
              })}
              <th
                scope="col"
                className="sticky top-0 right-0 z-40 border-b border-l border-border bg-surface-elevated px-1 text-[0.62rem] font-bold tracking-wide text-content-muted uppercase"
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {DAYS.map((dayName, d) => {
              const rowHot = hover?.day === d
              return (
                <tr key={dayName}>
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-30 border-r border-b border-border bg-surface-elevated px-2 text-left text-[0.72rem] font-bold',
                      rowHot ? 'text-brand' : 'text-content-primary',
                    )}
                    style={{ height: rowH }}
                  >
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => selectRow(d)}
                        aria-label={`Seleccionar todo el ${dayName}`}
                        className="h-full w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                      >
                        {narrow ? DAYS_SHORT[d] : dayName}
                      </button>
                    ) : narrow ? (
                      DAYS_SHORT[d]
                    ) : (
                      dayName
                    )}
                  </th>

                  {ALL_SLOTS.map((s) => {
                    const v = valueAt(d, s)
                    const isOpen = open[d][s]
                    const t = intensity(v, max)
                    const dark = t > 0.55
                    const sel = selection ? inRect(selection, d, s) : false
                    const isCursor = cursor.day === d && cursor.slot === s
                    const isEditing = edit?.day === d && edit.slot === s
                    const cross = hover ? hover.day === d || hover.slot === s : false
                    const canEdit = isEditable(d, s)

                    return (
                      <td
                        key={s}
                        ref={(el) => registerCell(d, s, el)}
                        data-cell=""
                        data-d={d}
                        data-s={s}
                        role="gridcell"
                        aria-readonly={!canEdit}
                        aria-selected={sel}
                        aria-label={`${dayName} ${formatSlot(s)}, ${isOpen ? `${fmt(v)} ${unit}` : 'cerrado'}`}
                        tabIndex={isCursor ? 0 : -1}
                        className={cn(
                          'relative border-b border-border-soft p-0 text-center align-middle',
                          isHourMark(s) ? 'border-l border-l-border' : 'border-l border-l-border-soft',
                          !isOpen && 'bg-surface-alt',
                          isOpen && t === 0 && 'bg-surface',
                          dark ? 'text-content-inverted' : 'text-content-primary',
                          canEdit && 'cursor-cell',
                          isCursor && 'z-10 ring-2 ring-brand ring-inset',
                          'focus:z-10 focus:ring-2 focus:ring-brand focus:ring-inset focus:outline-none',
                        )}
                        style={{
                          height: rowH,
                          touchAction: 'pan-x pan-y',
                          backgroundColor: isOpen && t > 0 ? scaleColor(mode, t) : undefined,
                          backgroundImage: !isOpen ? CLOSED_PATTERN : undefined,
                          fontSize: fontPx,
                        }}
                      >
                        {isEditing ? (
                          <CellInput
                            value={edit.draft}
                            onValue={(next) => setEdit({ day: d, slot: s, draft: next })}
                            onCommit={commit}
                            onCancel={() => {
                              setEdit(null)
                              wantFocusRef.current = true
                              setCursor({ day: d, slot: s })
                            }}
                            skipBlurRef={skipBlurRef}
                            label={`${dayName} ${formatSlot(s)}`}
                          />
                        ) : (
                          <span className="font-bold tabular-nums">{v > 0 ? fmt(v) : ''}</span>
                        )}

                        {/* Realce de cruz y de selección, por encima del color del dato */}
                        {cross && !sel && (
                          <span className="pointer-events-none absolute inset-0 bg-content-primary/5" />
                        )}
                        {sel && (
                          <span className="pointer-events-none absolute inset-0 bg-brand/15 ring-1 ring-brand/40 ring-inset" />
                        )}
                      </td>
                    )
                  })}

                  <td
                    className={cn(
                      'sticky right-0 z-30 border-b border-l border-border bg-surface-alt px-1 text-center text-[0.7rem] font-black tabular-nums',
                      rowHot ? 'text-brand' : 'text-content-secondary',
                    )}
                  >
                    {totalLabel(dayTotals[d])}
                  </td>
                </tr>
              )
            })}
          </tbody>

          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky bottom-0 left-0 z-40 border-t border-r border-border bg-surface-elevated px-2 text-left text-[0.68rem] font-bold tracking-wide text-content-muted uppercase"
                style={{ height: 26 }}
              >
                Total
              </th>
              {ALL_SLOTS.map((s) => (
                <td
                  key={s}
                  className={cn(
                    'sticky bottom-0 z-20 border-t border-border bg-surface-elevated text-center font-bold tabular-nums',
                    isHourMark(s) ? 'border-l border-l-border' : 'border-l border-l-border-soft',
                    hover?.slot === s ? 'text-brand' : 'text-content-muted',
                  )}
                  style={{ fontSize: Math.max(8, fontPx - 1) }}
                >
                  {slotTotals[s] > 0 ? fmt(slotTotals[s]) : ''}
                </td>
              ))}
              <td className="sticky right-0 bottom-0 z-40 border-t border-l border-border bg-surface-elevated px-1 text-center text-[0.7rem] font-black tabular-nums text-content-primary">
                {totalLabel(dayTotals.reduce((a, b) => a + b, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-content-muted">
          Arrastra o usa mayús + clic para corregir varias franjas de golpe.
        </p>
      )}

      {/* Tooltip anclado a la celda, fuera del contenedor con scroll para que no lo recorte */}
      {hover && (
        <div
          className="animate-fade-in pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-content-primary px-2.5 py-1.5 text-[0.72rem] leading-tight font-semibold text-content-inverted shadow-lg"
          style={{ left: hover.x, top: hover.y - 8 }}
          aria-hidden="true"
        >
          <span className="block">
            {DAYS[hover.day]} · {formatSlot(hover.slot)}–{formatSlot(hover.slot + 1)}
          </span>
          <span className="block font-black">
            {open[hover.day][hover.slot]
              ? `${fmt(valueAt(hover.day, hover.slot))} ${unit}`
              : 'Fuera de horario'}
          </span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Input de celda
// ─────────────────────────────────────────────────────────────

function CellInput({
  value,
  onValue,
  onCommit,
  onCancel,
  skipBlurRef,
  label,
}: {
  value: string
  onValue: (v: string) => void
  onCommit: (move: 'up' | 'down' | 'left' | 'right' | null) => void
  onCancel: () => void
  skipBlurRef: { current: boolean }
  label: string
}) {
  // Callback estable: React solo la invoca al montar, así no se reselecciona
  // el texto en cada pulsación.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  return (
    <input
      ref={focusOnMount}
      type="number"
      inputMode="numeric"
      min={0}
      value={value}
      aria-label={`Valor de ${label}`}
      onChange={(e) => onValue(e.target.value)}
      onBlur={() => {
        if (skipBlurRef.current) return
        onCommit(null)
      }}
      onKeyDown={(e) => {
        switch (e.key) {
          case 'Enter':
            e.preventDefault()
            onCommit(e.shiftKey ? 'up' : 'down')
            break
          case 'Tab':
            e.preventDefault()
            onCommit(e.shiftKey ? 'left' : 'right')
            break
          case 'ArrowDown':
            e.preventDefault()
            onCommit('down')
            break
          case 'ArrowUp':
            e.preventDefault()
            onCommit('up')
            break
          case 'Escape':
            e.preventDefault()
            onCancel()
            break
        }
      }}
      className="absolute inset-0 z-20 h-full w-full bg-surface-elevated px-0.5 text-center text-[0.8rem] font-bold text-content-primary outline-2 -outline-offset-2 outline-brand"
    />
  )
}
