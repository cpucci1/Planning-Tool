/**
 * Paso 2 — "Esto es lo que hemos leído".
 *
 * El primer momento de valor del producto: el usuario todavía no ha rellenado
 * nada y ya ve su año entero, su horario y sus semanas raras. Por eso el paso
 * está ordenado de mayor a menor asombro (año → horario → semanas especiales →
 * semana tipo) y no de mayor a menor importancia técnica.
 *
 * Todo lo que se enseña aquí es corregible, y corregirlo recalcula el resto
 * solo: excluir una semana cambia `usableWeeks`, tocar el horario cambia el
 * recorte de la demanda, y corregir una celda de la semana tipo entra en la
 * cadena a través de `overrides` en usePlanner.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarRange,
  Check,
  FileSpreadsheet,
  Rows3,
  Sparkles,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { usePlanner } from '@/hooks/usePlanner'
import { YearChart } from '@/components/charts/YearChart'
import { WeekHeatmap } from '@/components/charts/WeekHeatmap'
import { DayCurve } from '@/components/charts/DayCurve'
import { HoursEditor } from '@/components/HoursEditor'
import { RoleCatalog } from '@/components/RoleCatalog'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  InfoTip,
  InlineName,
  Note,
  NumberInput,
  Segmented,
  Stat,
  TextInput,
  Toggle,
  cn,
} from '@/components/ui'
import { KITCHEN_BLOCK_ID } from '@/data/presets'
import { TERRITORIOS, sugerirNombreSemana } from '@/lib/territorio'
import { overcoverage } from '@/lib/demand'
import { SPECIAL_LABELS, describeMapping, isoWeekStart } from '@/lib/holidays'
import { DAYS } from '@/lib/time'
import type { SpecialWeek } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES')

// Meses propios en vez de Intl: el CLDR nuevo abrevia septiembre como "sept" y
// desencaja con las etiquetas del gráfico anual, que ya usan estos mismos.
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAY_ABBR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Colchón sobre la demanda. Pasado el 20% deja de ser colchón y es otra plantilla. */
const SAFETY_OPTIONS = [0, 5, 10, 15, 20]

/** Preparación y cierre, en minutos. Media hora y una hora son lo habitual. */
const PREP_OPTIONS = [0, 30, 60, 90]

/** "13 – 19 abr" a partir de una semana ISO. */
function weekDates(year: number, week: number): string {
  const start = isoWeekStart(year, week)
  const end = new Date(start.getTime() + 6 * 86400000)
  const m0 = start.getUTCMonth()
  const m1 = end.getUTCMonth()
  return m0 === m1
    ? `${start.getUTCDate()} – ${end.getUTCDate()} ${MONTHS[m1]}`
    : `${start.getUTCDate()} ${MONTHS[m0]} – ${end.getUTCDate()} ${MONTHS[m1]}`
}

function deviationText(d: number): string {
  return `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`
}

function confidenceTone(c: number): 'success' | 'warning' | 'danger' {
  if (c >= 0.95) return 'success'
  if (c >= 0.85) return 'warning'
  return 'danger'
}

// ─────────────────────────────────────────────────────────────
// Sub-pasos
// ─────────────────────────────────────────────────────────────

/**
 * Este paso tenía seis secciones en una sola pantalla interminable. Se ven de
 * una en una: menos que asimilar de golpe, y cada una se lee como su propia
 * pregunta ("¿esto que hemos leído es correcto?", "¿y tu horario?"...) en vez
 * de un muro de scroll. El sub-progreso es el único rastro de que hay más
 * detrás, y calca el estilo del `Progress` del shell para que no parezca un
 * flujo aparte.
 */
const DEMAND_SUBSTEPS: { id: string; label: string }[] = [
  { id: 'lectura', label: 'Lectura' },
  { id: 'ano', label: 'Tu año' },
  { id: 'horario', label: 'Horario' },
  { id: 'especiales', label: 'Semanas raras' },
  { id: 'semana', label: 'Semana tipo' },
]

function SubProgress({ index, onGo }: { index: number; onGo: (i: number) => void }) {
  const pct = ((index + 1) / DEMAND_SUBSTEPS.length) * 100
  return (
    <div className="mb-6 flex items-center gap-3">
      <ol className="hidden flex-wrap items-center gap-1 sm:flex">
        {DEMAND_SUBSTEPS.map((s, i) => {
          const done = i < index
          const active = i === index
          return (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'rounded-pill px-2.5 py-1.5 text-[0.78rem] font-bold transition-colors',
                  active && 'bg-brand-light text-brand',
                  !active &&
                    'text-content-secondary hover:bg-surface hover:text-content-primary',
                )}
              >
                <span
                  className={cn(
                    'mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-pill text-[0.65rem]',
                    active
                      ? 'bg-brand text-content-inverted'
                      : done
                        ? 'bg-success text-content-inverted'
                        : 'bg-surface',
                  )}
                >
                  {done ? '✓' : i + 1}
                </span>
                {s.label}
              </button>
              {i < DEMAND_SUBSTEPS.length - 1 && (
                <span className="mx-1 h-px w-3 bg-border" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-1 items-center gap-3 sm:hidden">
        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface">
          <div
            className="h-full rounded-pill bg-brand transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[0.75rem] font-bold text-content-secondary">
          {index + 1}/{DEMAND_SUBSTEPS.length} · {DEMAND_SUBSTEPS[index].label}
        </span>
      </div>
    </div>
  )
}

function SubNav({
  index,
  onBack,
  onNext,
  nextLabel,
  nextHint,
}: {
  index: number
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextHint?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-2 pb-4">
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-center">
        {index > 0 ? (
          <Button variant="secondary" size="lg" icon={<ArrowLeft size={17} />} onClick={onBack}>
            Atrás
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button size="lg" onClick={onNext} iconRight={<ArrowRight size={18} />}>
          {nextLabel}
        </Button>
      </div>
      {nextHint && (
        <p className="max-w-md text-center text-[0.82rem] leading-relaxed text-content-secondary">
          {nextHint}
        </p>
      )}
    </div>
  )
}

export function StepDemand() {
  const p = usePlanner()

  // Columnas que el usuario marca como mal leídas. De momento solo se apunta:
  // remapear a mano necesita backend, y prometerlo sin tenerlo sería peor.
  const [wrongCols, setWrongCols] = useState<string[]>([])

  // `null` = "el que mande el dato". Así el día grande sigue siendo el más
  // fuerte mientras el usuario no elija uno a mano.
  const [pickedDay, setPickedDay] = useState<number | null>(null)

  // Un año normal saca 12-15 semanas raras. Enseñarlas todas de golpe es un
  // muro; se abren a demanda.
  const [showAllSpecials, setShowAllSpecials] = useState(false)

  // Qué sección de las cinco se ve ahora mismo. Ver `DEMAND_SUBSTEPS`.
  const [sub, setSub] = useState(0)

  /** Provincia del local. Solo sirve para proponer nombres de fiestas locales. */
  const [territorio, setTerritorio] = useState<string | null>(null)

  // Igual que al cambiar de paso principal (ver App.tsx): moverse de sub-paso
  // no debe dejar al usuario a mitad de la pantalla anterior.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [sub])

  const dataset = p.dataset
  const typical = p.typical

  const yearStats = useMemo(() => {
    const weeks = dataset?.weeks ?? []
    if (weeks.length === 0) return null
    let total = 0
    let best = weeks[0]
    for (const w of weeks) {
      total += w.total
      if (w.total > best.total) best = w
    }
    return { total, avg: Math.round(total / weeks.length), best, count: weeks.length }
  }, [dataset])

  const busiestDay = useMemo(() => {
    if (!typical) return 5
    let bestIndex = 0
    let bestTotal = -1
    typical.forEach((day, i) => {
      const t = day.reduce((a, b) => a + b, 0)
      if (t > bestTotal) {
        bestTotal = t
        bestIndex = i
      }
    })
    return bestIndex
  }, [typical])

  /**
   * 2.1 — cuánto sobra la plantilla en las semanas que sí cubre.
   *
   * Sobre `p.weeks` (las utilizables), NO sobre el histórico entero: la línea
   * de cobertura se calcula con esas mismas, y las semanas excluidas son
   * justo los cierres de agosto, que con 30 comensales darían un "sobra un
   * 4000%" que no significa nada.
   */
  const over = useMemo(() => {
    if (!p.coverage) return null
    // Contra la capacidad de verdad: si hay colchón, la plantilla está
    // dimensionada por encima de la línea y la sobrecobertura es mayor.
    // Medirla contra la línea pelada dejaría el contrapeso corto justo cuando
    // más gente sobra.
    const conColchon = p.coverage.threshold * (1 + Math.max(0, p.settings.safetyMarginPct) / 100)
    return overcoverage(p.weeks, conColchon)
  }, [p.weeks, p.coverage, p.settings.safetyMarginPct])

  const mappingLines = useMemo(
    () => (dataset ? describeMapping(dataset.year, dataset.year + 1) : []),
    [dataset],
  )

  if (!dataset) return null

  const src = dataset.source
  const day = pickedDay ?? busiestDay
  const excludedCount = p.specials.filter((s) => s.excluded).length
  const remainingWeeks = dataset.weeks.length - excludedCount

  const patchSpecial = (isoWeek: number, patch: Partial<SpecialWeek>) => {
    p.setSpecials(p.specials.map((s) => (s.isoWeek === isoWeek ? { ...s, ...patch } : s)))
  }

  const pendingSpecials = p.specials.filter((s) => !s.confirmed).length
  const COLLAPSED = 6
  const collapsible = p.specials.length > COLLAPSED + 2
  const visibleSpecials =
    collapsible && !showAllSpecials ? p.specials.slice(0, COLLAPSED) : p.specials

  const toggleWrongCol = (label: string) => {
    setWrongCols((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    )
  }

  return (
    <div className="stagger space-y-6">
      <SubProgress index={sub} onGo={setSub} />

      {/* ── 1. Lo que ha leído la IA ─────────────────────────────── */}
      {sub === 0 && (
      <div className="space-y-6">
      <Card className="p-5 sm:p-7">
        <span className="eyebrow eyebrow--purple">Lectura del fichero</span>
        <h1 className="h1 mt-3">
          Esto es lo que <span className="text-brand italic">he entendido.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-content-secondary">
          Mira si te cuadra antes de seguir. Si me he colado en algo, corrígeme aquí mismo: todo lo
          de esta pantalla es editable y el cálculo se rehace solo.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            { icon: <FileSpreadsheet size={15} />, label: 'Fichero', value: src.fileName },
            { icon: <CalendarRange size={15} />, label: 'Rango de fechas', value: src.dateRange },
            {
              icon: <Rows3 size={15} />,
              label: 'Filas procesadas',
              value: `${nf.format(src.rowsDetected)} · ${dataset.weeks.length} semanas`,
            },
          ].map((chip) => (
            <div key={chip.label} className="min-w-0 rounded-lg bg-surface px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                {chip.icon}
                {chip.label}
              </div>
              <div className="mt-1 truncate text-[0.9rem] font-bold text-content-primary">
                {chip.value}
              </div>
            </div>
          ))}
        </div>

        <h4 className="h4 mt-6 flex items-center gap-2">
          Las columnas, una a una
          <InfoTip title="Qué es la confianza">
            Cuánto de seguro estoy de haber entendido esa columna. Por debajo del 85% conviene que
            le eches un ojo: suele pasar cuando la cabecera del fichero es rara o hay dos columnas
            que se parecen.
          </InfoTip>
        </h4>
        <p className="mt-1 text-[0.85rem] text-content-secondary">
          A la izquierda, como se llama en tu fichero. A la derecha, para qué la he usado.
        </p>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {src.columnsDetected.map((c) => {
            const wrong = wrongCols.includes(c.label)
            const ignored = c.mappedTo === 'Ignorada'
            return (
              <li
                key={c.label}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
                  wrong ? 'border-warning/40 bg-warning-light' : 'border-border-soft bg-surface',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[0.88rem] font-bold">
                    <span className="truncate text-content-primary">{c.label}</span>
                    <ArrowRight size={13} className="shrink-0 text-content-muted" />
                    <span className={cn('truncate', ignored ? 'text-content-muted' : 'text-brand')}>
                      {c.mappedTo}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1 w-14 shrink-0 overflow-hidden rounded-pill bg-border">
                      <span
                        className="block h-full rounded-pill bg-brand"
                        style={{ width: `${Math.round(c.confidence * 100)}%` }}
                      />
                    </span>
                    <Badge tone={confidenceTone(c.confidence)}>
                      {Math.round(c.confidence * 100)}%
                    </Badge>
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={wrong}
                  aria-label={
                    wrong
                      ? `Deshacer: la columna ${c.label} sí está bien interpretada`
                      : `Marcar la columna ${c.label} como mal interpretada`
                  }
                  onClick={() => toggleWrongCol(c.label)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[0.75rem] font-bold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    wrong
                      ? 'bg-warning text-content-inverted'
                      : 'border border-border text-content-secondary hover:border-content-muted hover:text-content-primary',
                  )}
                >
                  {wrong ? <Undo2 size={13} /> : null}
                  {wrong ? 'Deshacer' : 'No es eso'}
                </button>
              </li>
            )
          })}
        </ul>

        {wrongCols.length > 0 && (
          <div className="mt-3">
            <Note tone="warning" icon={<TriangleAlert size={15} />}>
              Apuntado: {wrongCols.join(', ')}. En esta versión todavía no puedo reasignar una
              columna a mano. Si el dato ha salido mal del todo, vuelve atrás y sube el fichero con
              las cabeceras más claras — con "Fecha", "Hora" y "Comensales" no falla.
            </Note>
          </div>
        )}
      </Card>

      {/* El catálogo de puestos vive aquí, antes que los tramos: primero qué
          categorías hay y qué cuestan, y en el paso de equipo cuánta gente de
          cada una. Ver `RoleCatalog`. */}
      <RoleCatalog blocks={p.model.blocks} roles={p.model.roles} onRolesChange={p.setRoles} />
      </div>
      )}

      {/* ── 2. El año de un vistazo ──────────────────────────────── */}
      {sub === 1 && (
      <Card>
        <CardHeader
          eyebrow="Tu año"
          title={
            <>
              Tu año, <span className="text-brand italic">de un vistazo.</span>
            </>
          }
          subtitle="Cada barra es una semana, en orden de calendario. Se ve el verano, se ve diciembre y se ven los picos."
          info={
            <InfoTip title="De dónde sale este gráfico">
              Es la suma de comensales de cada semana del fichero, sin tocar nada. Las semanas
              marcadas son las que he detectado como especiales: las revisas más abajo.
            </InfoTip>
          }
        />
        <div className="px-4 pb-5 sm:px-6">
          <YearChart
            weeks={dataset.weeks}
            threshold={p.coverage?.threshold ?? 0}
            onThresholdChange={(t) =>
              p.setSettings((s) => ({
                ...s,
                coveragePct: Math.min(99, Math.max(1, Math.round(p.coverageFromThreshold(t)))),
              }))
            }
            specials={p.specials}
            coveragePct={p.settings.coveragePct}
            height={260}
          />
          <p className="mt-3 text-[0.82rem] leading-relaxed text-content-secondary">
            La línea marca hasta dónde llegaría tu plantilla fija. Aquí solo te sitúa: dónde la
            dejas se decide al final, cuando ya se vea lo que cuesta cada centímetro.
          </p>

          {over && (
            <div className="mt-4 rounded-lg border border-border-soft bg-surface-alt p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
                    Sobrecobertura
                    <InfoTip title="Qué es la sobrecobertura">
                      La plantilla se dimensiona para la línea, así que en una semana floja sobra
                      gente. Esto mide cuánto: de media, cuánto queda tu plantilla por encima de lo
                      que pide cada semana que sí cubre. Subir la línea cubre más semanas y sube
                      esto; bajarla, al revés.
                    </InfoTip>
                  </div>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-content-secondary">
                    En las semanas que cubres, tu plantilla queda de media un{' '}
                    <strong className="text-content-primary">
                      {Math.round(over.avgPct)}% por encima
                    </strong>{' '}
                    de lo que pide esa semana
                    {over.worstWeek !== null && (
                      <>
                        {' '}
                        (la semana {over.worstWeek} es la que más sobra, un{' '}
                        {Math.round(over.worstPct)}%)
                      </>
                    )}
                    .
                  </p>
                </div>

                <div className="w-full sm:w-auto">
                  <div className="flex items-center gap-1.5 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
                    Margen de seguridad
                    <InfoTip title="Margen de seguridad">
                      Un colchón deliberado sobre la demanda, por si entra más gente de la
                      prevista. No es lo mismo que la cobertura: la cobertura elige qué semanas
                      cubres, y esto añade holgura dentro de la semana que ya has elegido. Cada
                      punto que subes aquí es plantilla de más las 52 semanas.
                    </InfoTip>
                  </div>
                  <div className="mt-2">
                    <Segmented
                      value={String(p.settings.safetyMarginPct)}
                      onChange={(v) =>
                        p.setSettings((st) => ({ ...st, safetyMarginPct: Number(v) }))
                      }
                      options={SAFETY_OPTIONS.map((v) => ({
                        value: String(v),
                        label: v === 0 ? 'Sin colchón' : `+${v}%`,
                      }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {yearStats && (
            <div className="mt-5 grid grid-cols-2 gap-5 border-t border-border-soft pt-5 sm:grid-cols-3">
              <Stat
                value={nf.format(yearStats.total)}
                label="Comensales al año"
                hint={`${yearStats.count} semanas de histórico`}
                tone="brand"
              />
              <Stat
                value={nf.format(yearStats.avg)}
                label="Semana media"
                hint="de lunes a domingo"
              />
              <Stat
                value={nf.format(yearStats.best.total)}
                label="Mejor semana"
                hint={`Semana ${yearStats.best.isoWeek} · ${weekDates(dataset.year, yearStats.best.isoWeek)}`}
                tone="success"
              />
            </div>
          )}
        </div>
      </Card>
      )}

      {/* ── 3. Horario ───────────────────────────────────────────── */}
      {sub === 2 && (
      <div className="space-y-6">
        <div>
          <p className="mb-3 max-w-3xl text-[0.9rem] leading-relaxed text-content-secondary">
            El horario no venía en el fichero: lo he deducido de las franjas en las que tienes
            comensales de verdad. Si algún día no cuadra, ajústalo — fuera del horario no se calcula
            plantilla.
          </p>
          <HoursEditor
            hours={p.hours ?? src.detectedHours}
            onChange={p.setHours}
            detected={src.detectedHours}
          />
        </div>

        {p.model.blocks.some((b) => b.id === KITCHEN_BLOCK_ID) && (
          <div>
            <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-border-soft bg-surface p-4">
              <Toggle
                checked={p.kitchenHours !== null}
                onChange={p.setKitchenHoursEnabled}
                label="La cocina tiene un horario distinto"
                hint="Actívalo si cocina abre, cierra o descansa en otro momento que el resto del local — por ejemplo, si cierra la cocina antes que la sala."
              />
              <InfoTip title="Qué hace este horario">
                Cocina deja de pedir personal fuera de este horario, aunque el resto del local siga
                abierto. Lo que no hace: añadir personal de apertura antes de que haya comensales —
                para eso manda la curva de demanda, no el horario.
              </InfoTip>
            </div>

            {p.kitchenHours !== null && (
              <HoursEditor
                hours={p.kitchenHours}
                onChange={p.setKitchenHours}
                eyebrow="Horario de cocina"
                title={
                  <>
                    Cuándo trabaja <span className="text-brand italic">cocina.</span>
                  </>
                }
                subtitle="Independiente del horario general. Arrastra las barras igual que arriba."
              />
            )}
          </div>
        )}

        {/* Un bloque sin puestos no tiene a quién asignarle el mínimo — ver
            `applyOpeningMinimums` en `lib/staffing.ts`, que lo ignora en
            silencio. Mejor no enseñar un campo que no haría nada. */}
        {p.model.blocks.some((b) => p.model.roles.some((r) => r.blockId === b.id)) && (
        <Card>
          <CardHeader
            eyebrow="Mínimo por local"
            title={
              <>
                El personal que hace falta <span className="text-brand italic">solo por estar abierto.</span>
              </>
            }
            subtitle="Al margen de cuántos comensales tengas: quien abre, cierra o prepara. Se garantiza en todo el horario de cada área, el suyo propio si lo tiene, como cocina, y también durante la preparación y el cierre."
            info={
              <InfoTip title="Cómo se cubre">
                El mínimo lo cubre el primer puesto de cada área (el responsable de abrirla), para
                que el cuadrante se lo asigne a alguien concreto. Si la curva de comensales ya pide
                más gente que el mínimo en una franja, este número no suma nada extra: solo actúa
                donde la curva pide menos.
              </InfoTip>
            }
          />
          <div className="grid gap-4 border-t border-border-soft px-4 py-5 sm:grid-cols-2 sm:px-6">
            {p.model.blocks
              .filter((block) => p.model.roles.some((r) => r.blockId === block.id))
              .map((block) => (
                <Field key={block.id} label={block.name}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-pill"
                      style={{ background: block.color }}
                      aria-hidden="true"
                    />
                    <NumberInput
                      value={p.settings.minStaffByBlock[block.id] ?? 0}
                      onChange={(v) => p.setMinStaffForBlock(block.id, v)}
                      min={0}
                      max={20}
                      step={1}
                      aria-label={`Mínimo de personas en ${block.name}, en todo su horario`}
                      className="w-20"
                    />
                    <span className="text-[0.8rem] font-medium text-content-secondary">
                      {(p.settings.minStaffByBlock[block.id] ?? 0) > 0
                        ? 'personas mínimo, siempre'
                        : 'sin mínimo'}
                    </span>
                  </div>
                </Field>
              ))}
          </div>

          {/* 3.2 — el horario de arriba es el horario AL PÚBLICO. La gente
              entra antes y sale después, y esas horas son plantilla igual. */}
          <div className="grid gap-4 border-t border-border-soft px-4 py-5 sm:grid-cols-2 sm:px-6">
            <Field
              label="Preparación antes de abrir"
              info={
                <InfoTip title="Horario al público y horario del personal">
                  El horario que has puesto arriba es cuando entra el cliente. La mise en place, el
                  montaje y la puesta a punto ocurren antes, y esas horas se pagan igual. Aquí se
                  dice cuánto antes entra la gente: durante ese rato se mantiene el mínimo de cada
                  área, no la plantilla de servicio.
                </InfoTip>
              }
            >
              <Segmented
                value={String(p.settings.prepBeforeMin)}
                onChange={(v) => p.setSettings((st) => ({ ...st, prepBeforeMin: Number(v) }))}
                options={PREP_OPTIONS.map((v) => ({
                  value: String(v),
                  label: v === 0 ? 'Nada' : `${v} min`,
                }))}
              />
            </Field>

            <Field
              label="Cierre después de cerrar"
              info={
                <InfoTip title="El cierre">
                  Recoger, limpiar y cuadrar la caja. Igual que la preparación: durante ese rato se
                  mantiene el mínimo del área, no la plantilla de servicio.
                </InfoTip>
              }
            >
              <Segmented
                value={String(p.settings.prepAfterMin)}
                onChange={(v) => p.setSettings((st) => ({ ...st, prepAfterMin: Number(v) }))}
                options={PREP_OPTIONS.map((v) => ({
                  value: String(v),
                  label: v === 0 ? 'Nada' : `${v} min`,
                }))}
              />
            </Field>

            {/* Sin ningún mínimo puesto, la preparación no cambia nada: no hay
                comensales a esa hora, así que no hay a quién estirar. Decirlo,
                en vez de dejar al usuario tocando un control muerto. */}
            {(p.settings.prepBeforeMin > 0 || p.settings.prepAfterMin > 0) &&
              !Object.values(p.settings.minStaffByBlock).some((v) => v > 0) && (
                <div className="sm:col-span-2">
                  <Note tone="warning">
                    La preparación y el cierre no cambian nada mientras no pongas un mínimo arriba:
                    a esas horas no hay comensales, así que lo único que puede haber es la gente que
                    abre y cierra, y eso sale del mínimo por local.
                  </Note>
                </div>
              )}
          </div>
        </Card>
        )}
      </div>
      )}

      {/* ── 4. Semanas especiales ────────────────────────────────── */}
      {sub === 3 && (
      <Card>
        <CardHeader
          eyebrow="Semanas especiales"
          title={
            <>
              Las semanas que <span className="text-brand italic">se salen de la norma.</span>
            </>
          }
          subtitle={
            p.specials.length > 0
              ? `He encontrado ${p.specials.length} ${p.specials.length === 1 ? 'semana rara' : 'semanas raras'} comparando cada semana con la mediana del año. Dime si acerté.`
              : 'Comparo cada semana con la mediana del año para encontrar las que se disparan o se hunden.'
          }
          info={
            <InfoTip title="Por qué importa esto">
              Si Semana Santa cayó en la semana 15 de tu histórico y el año que viene cae en la 16,
              comparar semana 15 con semana 15 es comparar una semana de fiesta con una normal. Por
              eso los festivos móviles se recolocan por evento, no por número de semana.
            </InfoTip>
          }
        />

        <div className="px-4 pb-5 sm:px-6">
          {p.specials.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center">
              <p className="text-[0.9rem] font-bold text-content-primary">
                Tu año es de los tranquilos.
              </p>
              <p className="mx-auto mt-1 max-w-md text-[0.85rem] leading-relaxed text-content-secondary">
                Ninguna semana se sale lo suficiente de la norma como para tratarla aparte. No hay
                nada que corregir: sigue adelante.
              </p>
            </div>
          ) : (
            <>
              {/* La acción en bloque va aquí y no en la cabecera de la Card:
                  en móvil le robaba el ancho al título y lo partía en cuatro
                  líneas. */}
              {/* Dónde está el local. Con esto podemos proponer el nombre de las
                  fiestas que le pegan a cada semana rara: el pico lo hemos
                  medido nosotros y el nombre es una propuesta que él confirma.
                  Ver `lib/territorio.ts`. */}
              <div className="mb-4 rounded-lg border border-border-soft bg-surface-alt p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-[0.8rem] font-bold text-content-primary">
                    ¿Dónde está el local?
                  </span>
                  <select
                    value={territorio ?? ''}
                    onChange={(e) => setTerritorio(e.target.value || null)}
                    aria-label="Provincia del local, para reconocer las fiestas locales"
                    className="h-9 rounded-md border border-border bg-surface-elevated px-2.5 text-[0.82rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none"
                  >
                    <option value="">Elige provincia</option>
                    {TERRITORIOS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  <span className="text-[0.8rem] text-content-secondary">
                    y te digo qué fiesta cae en cada semana rara.
                  </span>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.78rem] font-bold text-content-secondary">
                  {pendingSpecials === 0
                    ? 'Todas revisadas'
                    : `${pendingSpecials} sin revisar de ${p.specials.length}`}
                </span>
                {pendingSpecials > 1 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Check size={14} strokeWidth={3} />}
                    onClick={() => p.setSpecials(p.specials.map((s) => ({ ...s, confirmed: true })))}
                  >
                    Confirmar todas
                  </Button>
                )}
              </div>

              <ul className="space-y-2">
                {visibleSpecials.map((s) => {
                  // La frase del traslado solo existe para los eventos que
                  // están en el calendario móvil (Semana Santa, Carnaval).
                  const moveLine = s.moveable
                    ? mappingLines.find((l) => l.startsWith(s.label))
                    : undefined
                  return (
                    <li
                      key={s.isoWeek}
                      className={cn(
                        'rounded-lg border p-3 transition-colors sm:px-4',
                        s.excluded
                          ? 'border-border-soft bg-surface'
                          : s.confirmed
                            ? 'border-success/30 bg-success-light'
                            : 'border-border-soft bg-surface-elevated',
                      )}
                    >
                      {/* En móvil la fila se parte: identidad arriba, controles
                          abajo a ancho completo. Todo en una línea a 375 px
                          dejaba el nombre del evento en "Cue…". */}
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                        <div className="min-w-0 sm:flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-pill bg-surface px-2 py-0.5 text-[0.7rem] font-black text-content-secondary">
                              S{s.isoWeek}
                            </span>
                            <InlineName
                              value={s.label}
                              onCommit={(v) => patchSpecial(s.isoWeek, { label: v, confirmed: true })}
                              ariaLabel={`Cambiar el nombre de la semana ${s.isoWeek}`}
                              className={cn(
                                'h4',
                                s.excluded && 'text-content-muted line-through',
                              )}
                            />
                            <Badge tone={s.deviation > 0 ? 'success' : 'warning'}>
                              {deviationText(s.deviation)}
                            </Badge>
                            {s.moveable && <Badge tone="brand">Festivo móvil</Badge>}
                          </div>
                          <p className="mt-1 text-[0.78rem] font-medium text-content-secondary">
                            {weekDates(dataset.year, s.isoWeek)}
                            <span className="mx-1.5 text-content-muted">·</span>
                            {s.deviation > 0 ? 'por encima' : 'por debajo'} de una semana normal
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`Qué fue la semana ${s.isoWeek}`}
                            value={s.kind}
                            onChange={(e) => {
                              const opt = SPECIAL_LABELS.find((o) => o.kind === e.target.value)
                              if (!opt) return
                              // Elegir una etiqueta es confirmarla: nadie toca el
                              // desplegable y luego quiere seguir viendo "sin revisar".
                              patchSpecial(s.isoWeek, {
                                kind: opt.kind,
                                label: opt.label,
                                moveable: opt.moveable,
                                confirmed: true,
                              })
                            }}
                            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface-elevated px-2.5 text-[0.82rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none sm:flex-none"
                          >
                            {SPECIAL_LABELS.map((o) => (
                              <option key={o.kind} value={o.kind}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-pressed={s.confirmed}
                            aria-label={`Confirmar la etiqueta de la semana ${s.isoWeek}`}
                            onClick={() => patchSpecial(s.isoWeek, { confirmed: !s.confirmed })}
                            className={cn(
                              'inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-[0.78rem] font-bold transition-colors',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                              s.confirmed
                                ? 'bg-success text-content-inverted'
                                : 'border border-border text-content-secondary hover:border-content-muted hover:text-content-primary',
                            )}
                          >
                            <Check size={14} strokeWidth={3} />
                            <span className="hidden sm:inline">
                              {s.confirmed ? 'Confirmada' : 'Confirmar'}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-pressed={s.excluded}
                            aria-label={`Excluir la semana ${s.isoWeek} del cálculo`}
                            onClick={() => patchSpecial(s.isoWeek, { excluded: !s.excluded })}
                            className={cn(
                              'inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-[0.78rem] font-bold transition-colors',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                              s.excluded
                                ? 'bg-warning text-content-inverted'
                                : 'border border-border text-content-secondary hover:border-content-muted hover:text-content-primary',
                            )}
                          >
                            <Ban size={14} strokeWidth={2.5} />
                            <span className="hidden sm:inline">
                              {s.excluded ? 'Excluida' : 'Excluir'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* 4.2 — el motivo en palabras del usuario. El desplegable
                          no cubre "cerramos por obras" ni "congreso en la
                          feria", y eso es justo lo que hay que recordar el año
                          que viene. */}
                      <div className="mt-2">
                        <TextInput
                          value={s.note ?? ''}
                          onChange={(e) => patchSpecial(s.isoWeek, { note: e.target.value })}
                          placeholder="¿Por qué se salió esta semana? (opcional)"
                          aria-label={`Motivo de la semana ${s.isoWeek}`}
                          className="h-9 text-[0.82rem]"
                        />
                      </div>

                      {(() => {
                        const sug = sugerirNombreSemana(territorio, s.isoWeek, s.deviation)
                        if (!sug || s.label === sug.nombre) return null
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-brand-light px-2.5 py-2">
                            <Sparkles size={14} className="shrink-0 text-brand" />
                            <span className="min-w-0 flex-1 text-[0.8rem] leading-snug text-brand">
                              {sug.motivo}
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                patchSpecial(s.isoWeek, {
                                  label: sug.nombre,
                                  note: s.note || sug.motivo,
                                  confirmed: true,
                                })
                              }
                            >
                              Ponerle ese nombre
                            </Button>
                          </div>
                        )
                      })()}

                      {moveLine && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-brand-light px-2.5 py-1.5 text-[0.78rem] leading-snug font-semibold text-brand">
                          <Sparkles size={13} className="mt-px shrink-0" />
                          {moveLine}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>

              {collapsible && (
                <button
                  type="button"
                  onClick={() => setShowAllSpecials((v) => !v)}
                  className="mt-2 w-full rounded-lg border border-dashed border-border py-2.5 text-[0.82rem] font-bold text-content-secondary transition-colors hover:border-content-muted hover:text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {showAllSpecials
                    ? 'Ver solo las primeras'
                    : `Ver las ${p.specials.length} semanas`}
                </button>
              )}

              {remainingWeeks < 8 && (
                <div className="mt-3">
                  <Note tone="warning" icon={<TriangleAlert size={15} />}>
                    Has excluido tantas semanas que no queda histórico suficiente para calcular una
                    semana tipo fiable. Mientras queden menos de 8, sigo calculando con el año
                    entero.
                  </Note>
                </div>
              )}

              {mappingLines.length > 0 && (
                <div className="mt-4 rounded-lg border border-border-soft bg-surface p-4">
                  <h4 className="h4 flex items-center gap-2">
                    Cómo se colocan en {dataset.year + 1}
                    <InfoTip title="Festivos móviles">
                      Solo se mueve lo que de verdad cambia de semana. Agosto y Navidad se quedan
                      donde están: moverlo todo por el desfase de Pascua distorsionaría el verano.
                    </InfoTip>
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {mappingLines.map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-[0.85rem] leading-relaxed font-medium text-content-secondary"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-brand" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
      )}

      {/* ── 5. La semana tipo ────────────────────────────────────── */}
      {sub === 4 && typical && (
        <Card className="p-4 sm:p-6">
          <span className="eyebrow eyebrow--purple mb-3">La semana tipo</span>

          {/* La definición va ARRIBA y en grande a propósito: es la frase que
              explica qué es esta pantalla y, de paso, para qué existe Shifty.
              Sin ella el usuario ve una rejilla de números sin saber qué
              decisión está tomando. */}
          <Note tone="brand" icon={<Sparkles size={15} strokeWidth={2.3} />}>
            La semana tipo recoge la actividad del{' '}
            <strong>{p.settings.coveragePct}% de las semanas del año</strong>: es con la que se
            planifica tu <strong>plantilla estable</strong>. Las{' '}
            {Math.max(0, p.weeks.length - (p.coverage?.weeksCovered ?? 0))} semanas que se salen
            piden gente puntual, y eso se cubre con extras en vez de contratando de más.
          </Note>

          {/* Las celdas que el usuario corrige entran en la cadena completa
              (desfase → necesidad → cuadrante) a través de `overrides` en
              usePlanner, así que tocar una celda mueve de verdad el contador de
              personas de la cabecera. Una edición que no cambiase el resultado
              engañaría más de lo que ayuda. */}
          <WeekHeatmap
            grid={typical}
            mode="covers"
            openBlocks={p.hours ?? undefined}
            onCellChange={(d, slot, value) => p.setTypicalOverride(d, slot, value)}
          />

          {p.overrides.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge tone="brand">
                {p.overrides.size} {p.overrides.size === 1 ? 'celda corregida' : 'celdas corregidas'}
              </Badge>
              <button
                type="button"
                onClick={p.clearOverrides}
                className="inline-flex items-center gap-1.5 text-[0.82rem] font-bold text-content-secondary transition-colors hover:text-brand"
              >
                <Undo2 size={14} />
                Deshacer mis correcciones
              </button>
            </div>
          )}

          <p className="mt-3 max-w-3xl text-[0.85rem] leading-relaxed text-content-secondary">
            No es una semana concreta del fichero. Toca cualquier celda si sabes algo que el
            histórico no sabe; si lo que no cuadra es una franja entera, casi siempre es una semana
            especial mal etiquetada o un horario mal detectado: arréglalo atrás y esta rejilla se
            recalcula sola.
          </p>

          <h4 className="h4 mt-6 flex items-center gap-2">
            Día a día
            <InfoTip title="La línea discontinua">
              Es tu curva corregida. El fichero marca la hora del cobro, y se cobra al terminar: los
              comensales que aparecen a las 15:00 se atendieron sobre las 14:30. La plantilla se
              calcula sobre la corregida, no sobre la del fichero.
            </InfoTip>
          </h4>
          <p className="mt-1 text-[0.85rem] text-content-secondary">
            Elige un día para verlo en grande. Empezamos por el{' '}
            {DAYS[busiestDay].toLowerCase()}, que es el más fuerte de tu semana.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {DAYS.map((name, d) => (
              <button
                key={name}
                type="button"
                aria-pressed={day === d}
                aria-label={`Ver ${name} en detalle`}
                onClick={() => setPickedDay(d)}
                className={cn(
                  'rounded-lg border p-1.5 transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  day === d
                    ? 'border-brand bg-brand-light'
                    : 'border-border-soft bg-surface hover:border-border',
                )}
              >
                <DayCurve
                  compact
                  covers={typical[d]}
                  openBlocks={p.hours?.[d]}
                  dayLabel={DAY_ABBR[d]}
                />
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-border-soft bg-surface-elevated p-3 sm:p-4">
            <DayCurve
              covers={typical[day]}
              laggedCovers={p.lagged?.[day]}
              openBlocks={p.hours?.[day]}
              dayLabel={DAYS[day]}
              height={220}
            />
          </div>
        </Card>
      )}

      {/* ── 6. Siguiente ─────────────────────────────────────────── */}
      <SubNav
        index={sub}
        onBack={() => setSub((s) => Math.max(0, s - 1))}
        onNext={() => {
          if (sub < DEMAND_SUBSTEPS.length - 1) setSub((s) => s + 1)
          else p.setStep('team')
        }}
        nextLabel={
          sub < DEMAND_SUBSTEPS.length - 1
            ? `Siguiente: ${DEMAND_SUBSTEPS[sub + 1].label.toLowerCase()}`
            : 'Ahora dime tu equipo'
        }
        nextHint={
          sub === DEMAND_SUBSTEPS.length - 1
            ? 'El fichero dice cuánta gente entra por la puerta, no cuánta necesitas detrás. Eso lo pones tú en el siguiente paso, y de ahí sale la plantilla.'
            : undefined
        }
      />
    </div>
  )
}
