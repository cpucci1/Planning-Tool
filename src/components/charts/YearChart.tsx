/**
 * El gráfico del año: 52 semanas en orden de calendario y una línea arrastrable
 * que decide hasta dónde llega la plantilla fija.
 *
 * Todo a mano en SVG. Recharts no vale aquí: la línea se arrastra con el dedo,
 * la barra se parte en dos (lo cubierto y lo que se sale) y el tooltip sigue al
 * puntero. Con una librería de gráficos eso es pelear contra el motor.
 */

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SpecialWeek, WeekDemand } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES')

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTHS_INITIAL = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Referencia estable para que el memo de specials no se rehaga en cada render. */
const NO_SPECIALS: SpecialWeek[] = []

const PAD = { l: 46, r: 64, t: 14, b: 36 }

interface Geometry {
  scaleMax: number
  tickStep: number
  plotW: number
  plotH: number
  yBase: number
  slotW: number
  barW: number
}

/**
 * Escala con topes redondos (100, 250, 500, 1.000…) en vez del máximo pelado:
 * un eje que pone "8.437" no lo lee nadie.
 */
function niceScale(rawMax: number, intervals: number): { max: number; step: number } {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return { max: 100, step: 100 / intervals }
  const rough = rawMax / intervals
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  return { max: Math.ceil(rawMax / step) * step, step }
}

function parseISODate(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function dayMonth(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()].toLowerCase()}`
}

/** "5 – 11 jun" o "29 may – 4 jun" según crucen o no de mes. */
function weekRangeLabel(startDate: string): string {
  const start = parseISODate(startDate)
  if (!start) return ''
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()} – ${dayMonth(end)}`
    : `${dayMonth(start)} – ${dayMonth(end)}`
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function YearChart({
  weeks,
  threshold,
  onThresholdChange,
  specials = NO_SPECIALS,
  height = 280,
  coveragePct,
}: {
  weeks: WeekDemand[]
  threshold: number
  onThresholdChange: (t: number) => void
  specials?: SpecialWeek[]
  height?: number
  coveragePct: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const rawId = useId()
  const uid = rawId.replace(/:/g, '')

  const [width, setWidth] = useState(880)
  const [dragging, setDragging] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState<{ i: number; px: number } | null>(null)

  // Medimos el ancho real y pintamos el viewBox a esa medida: 1 unidad = 1 píxel.
  // Así el texto no se deforma al escalar y el puntero cae donde parece.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const specialByWeek = useMemo(
    () => new Map(specials.map((s) => [s.isoWeek, s])),
    [specials],
  )

  const geo = useMemo<Geometry>(() => {
    const plotW = Math.max(60, width - PAD.l - PAD.r)
    const plotH = Math.max(70, height - PAD.t - PAD.b)
    const maxTotal = weeks.reduce((m, w) => Math.max(m, w.total), 0)
    const { max, step } = niceScale(Math.max(maxTotal * 1.06, threshold), 3)
    const slotW = plotW / Math.max(1, weeks.length)
    const gap = Math.min(3.5, slotW * 0.24)
    return {
      scaleMax: max,
      tickStep: step,
      plotW,
      plotH,
      yBase: PAD.t + plotH,
      slotW,
      barW: Math.max(1.5, slotW - gap),
    }
  }, [width, height, weeks, threshold])

  const yOf = (value: number) => geo.yBase - (clamp(value, 0, geo.scaleMax) / geo.scaleMax) * geo.plotH
  const xOf = (i: number) => PAD.l + i * geo.slotW + (geo.slotW - geo.barW) / 2

  const lineY = yOf(threshold)

  // Los recuentos salen de las barras, no del porcentaje: lo que se cuenta abajo
  // tiene que ser exactamente lo que se ve pintado de morado.
  const covered = useMemo(() => weeks.filter((w) => w.total <= threshold).length, [weeks, threshold])
  const peaks = weeks.length - covered
  const excessCovers = useMemo(
    () => weeks.reduce((sum, w) => sum + Math.max(0, w.total - threshold), 0),
    [weeks, threshold],
  )

  /** Primer índice de cada mes, para las etiquetas y las separaciones del eje X. */
  const months = useMemo(() => {
    const out: { month: number; from: number; to: number }[] = []
    weeks.forEach((w, i) => {
      const d = parseISODate(w.startDate)
      if (!d) return
      const m = d.getUTCMonth()
      const last = out[out.length - 1]
      if (last && last.month === m) last.to = i
      else out.push({ month: m, from: i, to: i })
    })
    return out
  }, [weeks])

  // ── Arrastre ────────────────────────────────────────────────
  const step = Math.max(1, Math.round(geo.scaleMax / 100))

  function valueFromClientY(clientY: number): number {
    const svg = svgRef.current
    if (!svg) return threshold
    const rect = svg.getBoundingClientRect()
    const scale = rect.height > 0 ? height / rect.height : 1
    const y = (clientY - rect.top) * scale
    return Math.round(clamp(((geo.yBase - y) / geo.plotH) * geo.scaleMax, 0, geo.scaleMax))
  }

  function beginDrag(e: React.PointerEvent) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setHover(null)
    onThresholdChange(valueFromClientY(e.clientY))
  }

  function moveDrag(e: React.PointerEvent) {
    if (!dragging) return
    onThresholdChange(valueFromClientY(e.clientY))
  }

  function endDrag(e: React.PointerEvent) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const big = step * 10
    let next: number | null = null
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = threshold + step
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = threshold - step
    else if (e.key === 'PageUp') next = threshold + big
    else if (e.key === 'PageDown') next = threshold - big
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = geo.scaleMax
    if (next === null) return
    e.preventDefault()
    onThresholdChange(Math.round(clamp(next, 0, geo.scaleMax)))
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-[0.85rem] font-medium text-content-secondary">
        Todavía no hay histórico que pintar. Carga un fichero o usa los datos de ejemplo.
      </div>
    )
  }

  const hovered = hover ? weeks[hover.i] : null
  const hoveredSpecial = hovered ? specialByWeek.get(hovered.isoWeek) : undefined
  const hoveredOver = hovered ? hovered.total - threshold : 0
  const tooltipY = hovered ? yOf(hovered.total) : 0
  const tooltipAbove = tooltipY > 84
  const handleW = PAD.r - 12
  const handleX = PAD.l + geo.plotW + 8

  return (
    <div className="w-full">
      <div ref={wrapRef} className="no-select relative w-full">
        {/* role="group" y no "img": con "img" hay lectores de pantalla que dan por
            presentacional todo el contenido y se llevan por delante el slider. */}
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`Comensales por semana del año. ${covered} de ${weeks.length} semanas quedan por debajo del umbral de ${nf.format(threshold)} comensales.`}
          className="block touch-pan-y overflow-visible"
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {/* La parte que se sale va rayada: se lee como "esto no lo cubre la plantilla". */}
            <pattern
              id={`peak-${uid}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="var(--color-warning)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-surface-elevated)" strokeWidth="2.2" opacity="0.6" />
            </pattern>
          </defs>

          {/* Rejilla y eje Y */}
          {Array.from({ length: 4 }, (_, k) => k * geo.tickStep)
            .filter((v) => v <= geo.scaleMax + 0.5)
            .map((v) => (
              <g key={v}>
                <line
                  x1={PAD.l}
                  x2={PAD.l + geo.plotW}
                  y1={yOf(v)}
                  y2={yOf(v)}
                  stroke="var(--color-border-soft)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.l - 8}
                  y={yOf(v) + 3.5}
                  textAnchor="end"
                  className="fill-content-muted"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {nf.format(Math.round(v))}
                </text>
              </g>
            ))}

          {/* Banda de la semana señalada, por debajo de las barras */}
          {hover && (
            <rect
              x={PAD.l + hover.i * geo.slotW}
              y={PAD.t}
              width={geo.slotW}
              height={geo.plotH}
              fill="var(--color-surface)"
            />
          )}

          {/* Barras */}
          {weeks.map((w, i) => {
            const x = xOf(i)
            const isPeak = w.total > threshold
            const yTop = yOf(w.total)
            if (!isPeak) {
              return (
                <rect
                  key={w.isoWeek}
                  x={x}
                  y={yTop}
                  width={geo.barW}
                  height={Math.max(1, geo.yBase - yTop)}
                  rx={Math.min(2.5, geo.barW / 2)}
                  fill="var(--color-brand)"
                  opacity={hover && hover.i !== i ? 0.55 : 1}
                />
              )
            }
            const yCut = yOf(threshold)
            return (
              <g key={w.isoWeek} opacity={hover && hover.i !== i ? 0.55 : 1}>
                {/* Lo que sí cubre la plantilla, en ámbar apagado */}
                <rect
                  x={x}
                  y={yCut}
                  width={geo.barW}
                  height={Math.max(0, geo.yBase - yCut)}
                  fill="var(--color-warning)"
                  opacity={0.3}
                />
                {/* Lo que se sale: ámbar pleno y rayado */}
                <rect
                  x={x}
                  y={yTop}
                  width={geo.barW}
                  height={Math.max(2.5, yCut - yTop + 2.5)}
                  rx={Math.min(2.5, geo.barW / 2)}
                  fill={`url(#peak-${uid})`}
                />
              </g>
            )
          })}

          {/* Eje X: separaciones y etiqueta de mes */}
          {months.map((m, k) => {
            const from = PAD.l + m.from * geo.slotW
            const center = from + ((m.to - m.from + 1) * geo.slotW) / 2
            return (
              <g key={`${m.month}-${m.from}`}>
                {k > 0 && (
                  <line
                    x1={from}
                    x2={from}
                    y1={PAD.t}
                    y2={geo.yBase + 4}
                    stroke="var(--color-border-soft)"
                    strokeWidth={1}
                  />
                )}
                <text
                  x={center}
                  y={geo.yBase + 25}
                  textAnchor="middle"
                  className="fill-content-muted"
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}
                >
                  {geo.plotW < 430 ? MONTHS_INITIAL[m.month] : MONTHS_SHORT[m.month]}
                </text>
              </g>
            )
          })}

          <line
            x1={PAD.l}
            x2={PAD.l + geo.plotW}
            y1={geo.yBase}
            y2={geo.yBase}
            stroke="var(--color-border)"
            strokeWidth={1}
          />

          {/* Semanas etiquetadas: un punto discreto bajo la barra */}
          {weeks.map((w, i) =>
            specialByWeek.has(w.isoWeek) ? (
              <circle
                key={`sp-${w.isoWeek}`}
                cx={xOf(i) + geo.barW / 2}
                cy={geo.yBase + 8}
                r={2.4}
                fill="var(--color-brand-secondary)"
                opacity={hover && hover.i === i ? 1 : 0.7}
              />
            ) : null,
          )}

          {/* Zonas de escucha del tooltip, una por semana */}
          {weeks.map((w, i) => (
            <rect
              key={`hit-${w.isoWeek}`}
              x={PAD.l + i * geo.slotW}
              y={PAD.t}
              width={geo.slotW}
              height={geo.plotH}
              fill="transparent"
              onPointerMove={(e) => {
                if (dragging) return
                const rect = svgRef.current?.getBoundingClientRect()
                const scale = rect && rect.width > 0 ? width / rect.width : 1
                setHover({ i, px: rect ? (e.clientX - rect.left) * scale : xOf(i) })
              }}
              onPointerDown={(e) => {
                const rect = svgRef.current?.getBoundingClientRect()
                const scale = rect && rect.width > 0 ? width / rect.width : 1
                setHover({ i, px: rect ? (e.clientX - rect.left) * scale : xOf(i) })
              }}
            />
          ))}

          {/* Línea de cobertura: halo blanco debajo para que se lea sobre las barras */}
          <line
            x1={PAD.l}
            x2={PAD.l + geo.plotW + 6}
            y1={lineY}
            y2={lineY}
            stroke="var(--color-surface-elevated)"
            strokeWidth={dragging ? 6 : 4.5}
            strokeLinecap="round"
            opacity={0.9}
            pointerEvents="none"
          />
          <line
            x1={PAD.l}
            x2={PAD.l + geo.plotW + 6}
            y1={lineY}
            y2={lineY}
            stroke="var(--color-brand)"
            strokeWidth={dragging || focused ? 2.5 : 1.75}
            strokeLinecap="round"
            pointerEvents="none"
          />

          {/* Banda de agarre sobre la línea. Estrecha a propósito: si fuese de 40px
              se comería el hover de las barras. El área táctil grande va en el tirador. */}
          <rect
            x={PAD.l}
            y={lineY - 7}
            width={geo.plotW}
            height={14}
            fill="transparent"
            style={{ cursor: 'ns-resize', touchAction: 'none' }}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />

          {/* Tirador */}
          <g
            role="slider"
            tabIndex={0}
            aria-label="Umbral de cobertura semanal"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={geo.scaleMax}
            aria-valuenow={threshold}
            aria-valuetext={`${nf.format(threshold)} comensales por semana. Cubre ${covered} de ${weeks.length} semanas.`}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: 'ns-resize', touchAction: 'none', outline: 'none' }}
          >
            {/* Área táctil: 44px de alto, fuera de la zona de barras */}
            <rect x={handleX - 8} y={lineY - 22} width={handleW + 12} height={44} fill="transparent" />
            {(focused || dragging) && (
              <rect
                x={handleX - 3}
                y={lineY - 15}
                width={handleW + 6}
                height={30}
                rx={15}
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth={1.5}
                opacity={0.35}
              />
            )}
            <rect
              x={handleX}
              y={lineY - 12}
              width={handleW}
              height={24}
              rx={12}
              fill="var(--color-brand)"
              stroke="var(--color-surface-elevated)"
              strokeWidth={dragging ? 2 : 1.5}
            />
            <text
              x={handleX + handleW / 2}
              y={lineY + 3.5}
              textAnchor="middle"
              fill="var(--color-content-inverted)"
              style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '-0.01em' }}
            >
              {nf.format(threshold)}
            </text>
            {/* Grip: dos rayitas que dicen "esto se arrastra" */}
            <g stroke="var(--color-content-inverted)" strokeWidth={1.2} strokeLinecap="round" opacity={0.55}>
              <line x1={handleX + handleW / 2 - 4} x2={handleX + handleW / 2 + 4} y1={lineY - 7.5} y2={lineY - 7.5} />
              <line x1={handleX + handleW / 2 - 4} x2={handleX + handleW / 2 + 4} y1={lineY + 7.5} y2={lineY + 7.5} />
            </g>
          </g>
        </svg>

        {/* Tooltip */}
        {hovered && !dragging && (
          <div
            className="animate-fade-in pointer-events-none absolute z-20 w-[172px] rounded-lg border border-border-soft bg-surface-elevated px-3 py-2.5 shadow-lg"
            style={{
              left: clamp(hover ? hover.px : 0, 90, Math.max(90, width - 90)),
              top: tooltipAbove ? tooltipY - 12 : tooltipY + 16,
              transform: `translate(-50%, ${tooltipAbove ? '-100%' : '0'})`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.8rem] font-extrabold text-content-primary">
                Semana {hovered.isoWeek}
              </span>
              <span className="text-[0.68rem] font-semibold text-content-muted">
                {weekRangeLabel(hovered.startDate)}
              </span>
            </div>
            <div className="mt-1.5 text-[1.05rem] leading-none font-black tracking-tight text-content-primary">
              {nf.format(Math.round(hovered.total))}
              <span className="ml-1 text-[0.7rem] font-bold text-content-secondary">comensales</span>
            </div>
            {hoveredOver > 0 ? (
              <div className="mt-1.5 text-[0.73rem] font-bold text-warning">
                Pico: {nf.format(Math.round(hoveredOver))} por encima
                {threshold > 0 && ` (+${Math.round((hoveredOver / threshold) * 100)}%)`}
              </div>
            ) : (
              <div className="mt-1.5 text-[0.73rem] font-bold text-brand">Cubierta por plantilla fija</div>
            )}
            {hoveredSpecial && (
              <div className="mt-2 border-t border-border-soft pt-1.5 text-[0.72rem] font-semibold text-content-secondary">
                {hoveredSpecial.label}
                {!hoveredSpecial.confirmed && <span className="text-content-muted"> · sin confirmar</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumen vivo */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.85rem] font-medium text-content-secondary">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-pill bg-brand" aria-hidden="true" />
        <span>
          Cubres{' '}
          <strong className="font-extrabold text-content-primary">
            {covered} de {weeks.length}
          </strong>{' '}
          semanas
        </span>
        <span className="text-content-muted">·</span>
        {peaks > 0 ? (
          <>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-pill bg-warning" aria-hidden="true" />
            <span>
              las otras <strong className="font-extrabold text-warning">{peaks}</strong> son picos
            </span>
          </>
        ) : (
          <span>ni una sola semana se te sale</span>
        )}
        <span className="text-content-muted">·</span>
        <span className="font-semibold">{Math.round(coveragePct)}% del año</span>
      </div>
      <p className="mt-1 text-[0.78rem] leading-relaxed font-medium text-content-muted">
        {peaks > 0
          ? `Contratas hasta ${nf.format(threshold)} comensales por semana. Los ${nf.format(Math.round(excessCovers))} comensales que se salen al año son los que cubres con extras.`
          : `Contratas para la peor semana del año. Sobra plantilla el resto del tiempo: baja la línea y mira qué pasa.`}
      </p>
    </div>
  )
}
