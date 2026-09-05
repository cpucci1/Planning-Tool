/**
 * Curva de un día: comensales (área morada) y personas necesarias (escalones).
 *
 * Las dos series viven en escalas distintas — 40 comensales frente a 4 personas —
 * así que cada una tiene su eje: comensales a la izquierda, personas a la derecha.
 * Sin eso, la línea de personas quedaría pegada al suelo y no se leería nada.
 *
 * Las personas se pintan como escalones porque el dato ES un escalón: la necesidad
 * se calcula por franja de 30 minutos y se mantiene constante dentro de ella.
 * Interpolarla sería inventar un dato intermedio que no existe.
 */

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { SLOTS_PER_DAY, formatSlot, isHourMark, slotStartMin } from '@/lib/time'
import type { OpenBlock } from '@/lib/types'
import { cn } from '@/components/ui'

// ─────────────────────────────────────────────────────────────
// Utilidades de dibujo
// ─────────────────────────────────────────────────────────────

interface Pt {
  x: number
  y: number
}

/**
 * Curva suave con control points recortados al tramo que unen. El recorte evita
 * el defecto clásico del spline: que al bajar a cero se pase de largo y pinte
 * comensales negativos bajo la línea base.
 */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

  const T = 0.85
  let d = `M ${pts[0].x} ${pts[0].y}`

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? pts[i + 1]

    const lo = Math.min(p1.y, p2.y)
    const hi = Math.max(p1.y, p2.y)
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v))

    const c1x = p1.x + ((p2.x - p0.x) / 6) * T
    const c1y = clamp(p1.y + ((p2.y - p0.y) / 6) * T)
    const c2x = p2.x - ((p3.x - p1.x) / 6) * T
    const c2y = clamp(p2.y - ((p3.y - p1.y) / 6) * T)

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

/** Techo "redondo" para el eje: 37 → 50, 3,2 → 5. */
function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function at(arr: number[] | undefined, i: number): number {
  const v = arr?.[i]
  return Number.isFinite(v) ? (v as number) : 0
}

function fmtPeople(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** True si la franja `i` cae dentro de algún tramo de apertura. */
function isSlotOpen(i: number, blocks: OpenBlock[]): boolean {
  const start = slotStartMin(i)
  const end = start + 30
  return blocks.some((b) => b.startMin < end && b.endMin > start)
}

/** Mide el ancho real del contenedor: el SVG se dibuja a píxeles, no escalado. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width] as const
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export interface DayCurveProps {
  /** Comensales por franja de 30 min. SLOTS_PER_DAY valores. */
  covers: number[]
  /** Personas necesarias por franja. */
  people?: number[]
  /** Comensales tras aplicar el desgaste, para ver el desplazamiento. */
  laggedCovers?: number[]
  /** Tramos de apertura. Lo que quede fuera se pinta como cerrado. */
  openBlocks?: OpenBlock[]
  height?: number
  /** Versión reducida: sin ejes ni leyenda, para pintar los 7 días en rejilla. */
  compact?: boolean
  dayLabel?: string
  className?: string
}

export function DayCurve({
  covers,
  people,
  laggedCovers,
  openBlocks,
  height,
  compact = false,
  dayLabel,
  className,
}: DayCurveProps) {
  const gradId = useId()
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const h = height ?? (compact ? 88 : 200)
  const hasPeople = !!people && people.length > 0

  const padT = compact ? 6 : 12
  const padB = compact ? 4 : 24
  const padL = compact ? 0 : 36
  const padR = compact ? 0 : hasPeople ? 26 : 10

  const plotW = Math.max(0, width - padL - padR)
  const plotH = Math.max(0, h - padT - padB)
  const slotW = plotW / SLOTS_PER_DAY

  /** Por debajo de este ancho las horas se pintan cada 2, si no se amontonan. */
  const dense = width >= 520

  const coversMax = useMemo(() => {
    let m = 0
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      m = Math.max(m, at(covers, i), at(laggedCovers, i))
    }
    return niceMax(m)
  }, [covers, laggedCovers])

  const peopleMax = useMemo(() => {
    if (!hasPeople) return 1
    let m = 0
    for (let i = 0; i < SLOTS_PER_DAY; i++) m = Math.max(m, at(people, i))
    return Math.max(1, Math.ceil(m))
  }, [people, hasPeople])

  const yC = useCallback(
    (v: number) => padT + plotH - (v / coversMax) * plotH,
    [padT, plotH, coversMax],
  )
  const yP = useCallback(
    (v: number) => padT + plotH - (v / peopleMax) * plotH,
    [padT, plotH, peopleMax],
  )
  const xEdge = useCallback((i: number) => padL + i * slotW, [padL, slotW])
  const xMid = useCallback((i: number) => padL + (i + 0.5) * slotW, [padL, slotW])

  // Los puntos van al centro de la franja, pero la primera y la última se estiran
  // hasta el borde para que el área no deje medio hueco a cada lado.
  const coversPath = useMemo(() => {
    if (plotW <= 0) return ''
    const pts: Pt[] = [{ x: padL, y: yC(at(covers, 0)) }]
    for (let i = 0; i < SLOTS_PER_DAY; i++) pts.push({ x: xMid(i), y: yC(at(covers, i)) })
    pts.push({ x: padL + plotW, y: yC(at(covers, SLOTS_PER_DAY - 1)) })
    return smoothPath(pts)
  }, [covers, plotW, padL, xMid, yC])

  const laggedPath = useMemo(() => {
    if (!laggedCovers || plotW <= 0) return ''
    const pts: Pt[] = [{ x: padL, y: yC(at(laggedCovers, 0)) }]
    for (let i = 0; i < SLOTS_PER_DAY; i++) pts.push({ x: xMid(i), y: yC(at(laggedCovers, i)) })
    pts.push({ x: padL + plotW, y: yC(at(laggedCovers, SLOTS_PER_DAY - 1)) })
    return smoothPath(pts)
  }, [laggedCovers, plotW, padL, xMid, yC])

  const peoplePath = useMemo(() => {
    if (!hasPeople || plotW <= 0) return ''
    let d = `M ${xEdge(0)} ${yP(at(people, 0))}`
    for (let i = 1; i < SLOTS_PER_DAY; i++) {
      d += ` L ${xEdge(i)} ${yP(at(people, i - 1))} L ${xEdge(i)} ${yP(at(people, i))}`
    }
    d += ` L ${xEdge(SLOTS_PER_DAY)} ${yP(at(people, SLOTS_PER_DAY - 1))}`
    return d
  }, [people, hasPeople, plotW, xEdge, yP])

  /** Tramos cerrados agrupados en rectángulos contiguos. */
  const closedRuns = useMemo(() => {
    if (!openBlocks || openBlocks.length === 0) return []
    const runs: { from: number; to: number }[] = []
    let start: number | null = null
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const open = isSlotOpen(i, openBlocks)
      if (!open && start === null) start = i
      if (open && start !== null) {
        runs.push({ from: start, to: i })
        start = null
      }
    }
    if (start !== null) runs.push({ from: start, to: SLOTS_PER_DAY })
    return runs
  }, [openBlocks])

  const peak = useMemo(() => {
    let best = 0
    let slot = 0
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      if (at(covers, i) > best) {
        best = at(covers, i)
        slot = i
      }
    }
    return { value: best, slot }
  }, [covers])

  const summary = `${dayLabel ? `${dayLabel}. ` : ''}Pico de ${Math.round(peak.value)} comensales a las ${formatSlot(peak.slot)}${
    hasPeople ? `, hasta ${fmtPeople(peopleMax)} personas necesarias` : ''
  }.`

  // ── Interacción ────────────────────────────────────────────

  const svgRef = useRef<SVGSVGElement>(null)

  const slotFromClientX = useCallback(
    (clientX: number) => {
      const box = svgRef.current?.getBoundingClientRect()
      if (!box || slotW <= 0) return null
      const i = Math.floor((clientX - box.left - padL) / slotW)
      return Math.min(SLOTS_PER_DAY - 1, Math.max(0, i))
    },
    [padL, slotW],
  )

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowLeft' ? -1 : 1
      setHover((h0) => Math.min(SLOTS_PER_DAY - 1, Math.max(0, (h0 ?? peak.slot) + step)))
    } else if (e.key === 'Escape') {
      setHover(null)
    }
  }

  const tipCovers = hover === null ? 0 : at(covers, hover)
  const tipPeople = hover === null ? 0 : at(people, hover)
  const tipLagged = hover === null ? 0 : at(laggedCovers, hover)

  // El tooltip se pega a los bordes en vez de salirse del contenedor.
  const tipX =
    hover === null ? 0 : Math.min(Math.max(xMid(hover), 78), Math.max(78, width - 78))

  return (
    <div className={cn('relative w-full', className)}>
      {/* `overflow-hidden` no es decorativo: el ancho del SVG sale de medir este
          mismo contenedor, así que sin recorte un SVG que se queda ancho ensancha
          a su padre y la medida siguiente vuelve a salir ancha. El bucle se nota
          al girar el móvil estando ya en la pantalla: la página se quedaba con
          scroll lateral y el gráfico no volvía a encoger. El tooltip vive dentro
          y ya va sujeto a los bordes, así que no se recorta nada visible. */}
      <div ref={wrapRef} className="relative w-full overflow-hidden" style={{ height: h }}>
        {width > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={h}
            role="img"
            aria-label={summary}
            tabIndex={compact ? -1 : 0}
            onKeyDown={compact ? undefined : onKeyDown}
            onPointerMove={(e) => setHover(slotFromClientX(e.clientX))}
            onPointerDown={(e) => setHover(slotFromClientX(e.clientX))}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            className="block touch-pan-y focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            style={{ borderRadius: 12 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.24" />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horas cerradas */}
            {closedRuns.map((r) => (
              <rect
                key={`closed-${r.from}`}
                x={xEdge(r.from)}
                y={padT}
                width={Math.max(0, (r.to - r.from) * slotW)}
                height={plotH}
                fill="var(--color-surface)"
              />
            ))}

            {/* Rejilla horizontal y eje de comensales */}
            {!compact &&
              [0, 0.5, 1].map((f) => {
                const y = padT + plotH - f * plotH
                return (
                  <g key={`grid-${f}`}>
                    <line
                      x1={padL}
                      x2={padL + plotW}
                      y1={y}
                      y2={y}
                      stroke="var(--color-border-soft)"
                      strokeWidth={1}
                    />
                    <text
                      x={padL - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={10}
                      fontWeight={600}
                      fill="var(--color-content-muted)"
                    >
                      {Math.round(coversMax * f)}
                    </text>
                  </g>
                )
              })}

            {/* Eje derecho: personas */}
            {!compact &&
              hasPeople &&
              Array.from({ length: peopleMax + 1 }, (_, k) => k)
                .filter((k) => peopleMax <= 5 || k % Math.ceil(peopleMax / 4) === 0)
                .map((k) => (
                  <text
                    key={`py-${k}`}
                    x={padL + plotW + 7}
                    y={yP(k) + 3}
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--color-content-muted)"
                  >
                    {k}
                  </text>
                ))}

            {/* Comensales tras el desgaste */}
            {laggedPath && (
              <path
                d={laggedPath}
                fill="none"
                stroke="var(--color-brand)"
                strokeOpacity={0.4}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            )}

            {/* Comensales */}
            {coversPath && (
              <>
                <path
                  d={`${coversPath} L ${padL + plotW} ${padT + plotH} L ${padL} ${padT + plotH} Z`}
                  fill={`url(#${gradId})`}
                />
                <path
                  d={coversPath}
                  fill="none"
                  stroke="var(--color-brand)"
                  strokeWidth={compact ? 1.5 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}

            {/* Personas necesarias — escalones, nunca interpolados */}
            {peoplePath && (
              <path
                d={peoplePath}
                fill="none"
                stroke="var(--color-content-primary)"
                strokeWidth={compact ? 1 : 1.4}
                strokeLinejoin="round"
                strokeOpacity={0.75}
              />
            )}

            {/* Eje de horas */}
            {!compact &&
              Array.from({ length: SLOTS_PER_DAY }, (_, i) => i)
                .filter((i) => isHourMark(i) && (dense || slotStartMin(i) % 120 === 0))
                .map((i) => (
                  <text
                    key={`x-${i}`}
                    x={Math.min(Math.max(xEdge(i), padL + 14), padL + plotW - 14)}
                    y={h - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--color-content-muted)"
                  >
                    {formatSlot(i)}
                  </text>
                ))}

            {/* Guía de hover */}
            {hover !== null && (
              <g pointerEvents="none">
                <line
                  x1={xMid(hover)}
                  x2={xMid(hover)}
                  y1={padT}
                  y2={padT + plotH}
                  stroke="var(--color-content-primary)"
                  strokeOpacity={0.25}
                  strokeWidth={1}
                />
                <circle
                  cx={xMid(hover)}
                  cy={yC(tipCovers)}
                  r={3.5}
                  fill="var(--color-brand)"
                  stroke="var(--color-surface-elevated)"
                  strokeWidth={2}
                />
                {hasPeople && (
                  <circle
                    cx={xMid(hover)}
                    cy={yP(tipPeople)}
                    r={3}
                    fill="var(--color-content-primary)"
                    stroke="var(--color-surface-elevated)"
                    strokeWidth={2}
                  />
                )}
              </g>
            )}
          </svg>
        )}

        {dayLabel && (
          <span className="pointer-events-none absolute top-1 left-2 text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
            {dayLabel}
          </span>
        )}

      </div>

      {/* El tooltip va AQUÍ, fuera del contenedor recortado, y no dentro: el
          `overflow-hidden` de arriba hace falta para que el SVG no se ensanche
          a sí mismo, pero recortaría también este globo cuando cae pegado a un
          borde. Fuera puede sobresalir un poco sobre el margen de la tarjeta,
          que es lo que hacía antes. Las coordenadas son las mismas porque el
          contenedor recortado es el primer hijo y arranca en este mismo punto. */}
      {hover !== null && (
        <div
          className="animate-fade-in pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-border-soft bg-surface-elevated px-3 py-2 shadow-lg"
          style={{ left: tipX, top: padT + 2 }}
        >
          <div className="text-[0.72rem] font-bold text-content-primary">
            {formatSlot(hover)} - {formatSlot(hover + 1)}
          </div>
          <div className="mt-1 space-y-0.5 text-[0.72rem] font-medium whitespace-nowrap text-content-secondary">
            <div>
              <span className="font-bold text-brand">{Math.round(tipCovers)}</span> comensales
            </div>
            {laggedCovers && (
              <div>
                <span className="font-bold text-brand/70">{Math.round(tipLagged)}</span> hora real
              </div>
            )}
            {hasPeople && (
              <div>
                <span className="font-bold text-content-primary">{fmtPeople(tipPeople)}</span>{' '}
                {tipPeople === 1 ? 'persona' : 'personas'}
              </div>
            )}
          </div>
        </div>
      )}

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[0.72rem] font-semibold text-content-secondary">
          <LegendDot color="var(--color-brand)" label="Comensales" />
          {laggedCovers && (
            <LegendDot color="var(--color-brand)" faded dashed label="Hora real del servicio" />
          )}
          {hasPeople && <LegendDot color="var(--color-content-primary)" label="Personas necesarias" />}
          {closedRuns.length > 0 && <LegendDot color="var(--color-surface)" bordered label="Cerrado" />}
        </div>
      )}

      {/* Lectura para lector de pantalla al navegar con las flechas */}
      {!compact && (
        <span className="sr-only" aria-live="polite">
          {hover !== null
            ? `${formatSlot(hover)}: ${Math.round(tipCovers)} comensales${
                hasPeople ? `, ${fmtPeople(tipPeople)} personas` : ''
              }`
            : ''}
        </span>
      )}
    </div>
  )
}

function LegendDot({
  color,
  label,
  faded,
  dashed,
  bordered,
}: {
  color: string
  label: string
  faded?: boolean
  dashed?: boolean
  bordered?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span
          className="inline-block h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: color, opacity: faded ? 0.5 : 1 }}
        />
      ) : (
        <span
          className={cn('inline-block h-2 w-2 rounded-pill', bordered && 'border border-border')}
          style={{ background: color, opacity: faded ? 0.5 : 1 }}
        />
      )}
      {label}
    </span>
  )
}
