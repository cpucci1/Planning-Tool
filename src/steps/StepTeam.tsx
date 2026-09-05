/**
 * Paso 3 — Tu equipo por tramos.
 *
 * El único input de verdad del producto: "con X comensales, cuánta gente
 * necesitas". Todo lo demás de esta pantalla existe para que el usuario vea la
 * consecuencia de lo que escribe MIENTRAS lo escribe — de ahí el panel vivo,
 * pegado al lateral en escritorio y anclado abajo en móvil.
 *
 * Los ajustes finos (desgaste, contratos, turnos) van escondidos: son la
 * segunda pregunta, no la primera. Quien no los abra tiene defaults sensatos.
 */

import { useId, useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Coffee,
  Flame,
  Settings2,
  Sliders,
  Users,
} from 'lucide-react'
import { TiersTable } from '@/components/TiersTable'
import { DayCurve } from '@/components/charts/DayCurve'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  InfoTip,
  Note,
  NumberInput,
  Segmented,
  Stat,
  Toggle,
  cn,
} from '@/components/ui'
import { usePlanner } from '@/hooks/usePlanner'
import { DAYS, formatSlot } from '@/lib/time'
import type { Settings } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES')

/** El sábado es el día que todo el mundo reconoce como el fuerte. */
const SHOWCASE_DAY = 5

const LAG_OPTIONS: number[] = [0, 15, 30, 45, 60]
const MAX_SHIFT_HOURS: number[] = [6, 7, 8, 9, 10, 12]
const MIN_SHIFT_HOURS: number[] = [1, 2, 3, 4, 5]

const SELECT_CLASS =
  'h-input w-full rounded-md border border-border bg-surface-elevated px-3 text-[0.92rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none'

// ─────────────────────────────────────────────────────────────
// Panel vivo
// ─────────────────────────────────────────────────────────────

/**
 * Barras de horas por bloque. El color viene del dato (lo elige el usuario en
 * la tabla), así que va inline: es la excepción declarada del design system.
 */
function BlockBars() {
  const p = usePlanner()
  const rows = useMemo(() => {
    const byBlock = p.needSummary?.hoursByBlock ?? {}
    return p.model.blocks
      .map((b) => ({ id: b.id, name: b.name, color: b.color, hours: byBlock[b.id] ?? 0 }))
      .filter((r) => r.hours > 0)
      .sort((a, b) => b.hours - a.hours)
  }, [p.model.blocks, p.needSummary])

  if (!rows.length) return null

  const max = Math.max(...rows.map((r) => r.hours))
  const total = rows.reduce((a, r) => a + r.hours, 0)

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
        Horas por bloque
        <InfoTip title="Horas por bloque">
          Horas-persona a la semana que pide cada área. Es la suma de todos sus puestos, franja
          a franja. Si Cocina se dispara, mira sus tramos: normalmente sobra una partida en las
          horas flojas.
        </InfoTip>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.85rem] font-semibold text-content-primary">
                {r.name}
              </span>
              <span
                key={Math.round(r.hours)}
                className="animate-count shrink-0 text-[0.82rem] font-bold text-content-secondary tabular-nums"
              >
                {nf.format(Math.round(r.hours))} h
                <span className="ml-1.5 font-semibold text-content-muted">
                  {Math.round((r.hours / total) * 100)}%
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-pill bg-surface">
              <div
                className="h-full rounded-pill transition-[width] duration-300 ease-out"
                style={{ width: `${(r.hours / max) * 100}%`, backgroundColor: r.color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Las tres cifras que cambian con cada tecla de la tabla. */
function LiveNumbers() {
  const p = usePlanner()
  const s = p.needSummary
  if (!s) return null

  const peak = s.peak
  const hours = Math.round(s.totalHours)
  const fte = Math.ceil(s.totalHours / 40)

  return (
    <div className="space-y-5">
      <Stat
        icon={<Users size={13} strokeWidth={2.5} />}
        label="Pico de personas"
        tone="brand"
        value={
          <span key={peak.people} className="animate-count">
            {peak.people}
          </span>
        }
        hint={
          peak.people > 0
            ? `A la vez, el ${DAYS[peak.day].toLowerCase()} a las ${formatSlot(peak.slot)}`
            : 'Con estos tramos no pides a nadie'
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <Stat
          icon={<Clock size={13} strokeWidth={2.5} />}
          label="Horas/semana"
          value={
            <span key={hours} className="animate-count">
              {nf.format(hours)}
            </span>
          }
          hint="Horas-persona que pide la curva"
        />
        <Stat
          icon={<Coffee size={13} strokeWidth={2.5} />}
          label="Jornadas de 40 h"
          value={
            <span key={fte} className="animate-count">
              {fte}
            </span>
          }
          hint="Solo dividiendo horas"
        />
      </div>

      <Note tone="warning">
        Esas jornadas son la cuenta de la servilleta. La plantilla real sale más alta: el{' '}
        {DAYS[peak.day].toLowerCase()} a las {formatSlot(peak.slot)} necesitas{' '}
        <strong>{peak.people} personas a la vez</strong>, y esa gente tiene que estar en nómina
        por pocas horas que sume. El número fino lo verás en el paso siguiente.
      </Note>

      <BlockBars />
    </div>
  )
}

/** Versión de escritorio: card pegajosa a la derecha de la tabla. */
function LivePanel() {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="En vivo"
        title={
          <>
            Lo que estás <span className="italic text-brand">pidiendo.</span>
          </>
        }
        subtitle="Se recalcula con cada número que escribes."
      />
      <div className="px-6 pb-6">
        <LiveNumbers />
      </div>
    </Card>
  )
}

/**
 * Versión móvil: barra anclada abajo, por encima de la del shell. Colapsada
 * enseña las dos cifras que importan; desplegada, el panel entero.
 */
function LivePanelMobile() {
  const p = usePlanner()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const s = p.needSummary
  if (!s) return null

  const hours = Math.round(s.totalHours)

  return (
    <div className="fixed inset-x-0 bottom-15 z-30 lg:hidden">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="overflow-hidden rounded-card border border-border-soft bg-surface-elevated/95 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-light text-brand">
              <Flame size={15} strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[0.9rem] font-black text-content-primary">
                <span key={s.peak.people} className="animate-count">
                  {s.peak.people}
                </span>{' '}
                en el pico
                <span className="ml-2 font-bold text-content-secondary">
                  · <span key={hours} className="animate-count">{nf.format(hours)}</span> h/semana
                </span>
              </span>
              <span className="block truncate text-[0.7rem] font-semibold text-content-muted">
                {open ? 'Toca para cerrar el detalle' : 'Toca para ver el detalle'}
              </span>
            </span>
            <ChevronDown
              size={18}
              className={cn(
                'shrink-0 text-content-muted transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
          {open && (
            <div
              id={panelId}
              className="scroll-thin max-h-[50vh] overflow-y-auto border-t border-border-soft px-4 py-4"
            >
              <LiveNumbers />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Ajustes avanzados
// ─────────────────────────────────────────────────────────────

function AdvancedSettings() {
  const p = usePlanner()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const s = p.settings

  function patch(d: Partial<Settings>) {
    p.setSettings({ ...s, ...d })
  }

  const enabledContracts = s.contracts.filter((c) => c.enabled).length

  /** Cambiar el máximo no puede dejar el mínimo por encima: se arrastra con él. */
  function setMaxShift(minutes: number) {
    patch({
      maxShiftMinutes: minutes,
      minShiftMinutes: Math.min(s.minShiftMinutes, minutes),
    })
  }

  function setMinShift(minutes: number) {
    patch({
      minShiftMinutes: minutes,
      maxShiftMinutes: Math.max(s.maxShiftMinutes, minutes),
    })
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-6 py-5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-surface text-content-secondary">
          <Sliders size={16} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="h4 block">Ajustes avanzados</span>
          <span className="mt-0.5 block text-[0.83rem] leading-snug text-content-secondary">
            Desgaste del dato, contratos, jornada partida y duración de los turnos. Si no los
            tocas, van con valores sensatos.
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-content-muted transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="animate-slide-down space-y-7 border-t border-border-soft px-6 py-6"
        >
          {/* ── Desgaste ── */}
          <Field
            label="Desgaste del dato"
            hint="El TPV marca la hora del cobro, y se cobra al terminar. Los 60 comensales que aparecen a las 15:00 se atendieron antes: tu gente ya estaba colocada. Por eso adelantamos la curva de personal ese rato. No es un colchón de seguridad, es enderezar un sesgo conocido del fichero."
            info={
              <InfoTip title="Desgaste del dato">
                Un desplazamiento limpio de toda la curva, igual para todos los puestos. No
                usamos un máximo móvil: ensancharía los picos y te haría contratar de más.
              </InfoTip>
            }
          >
            <div className="scroll-thin -mx-1 overflow-x-auto px-1 pb-1">
              <Segmented
                value={String(s.lagMinutes)}
                onChange={(v) => patch({ lagMinutes: Number(v) })}
                options={LAG_OPTIONS.map((v) => ({
                  value: String(v),
                  label: v === 0 ? 'Sin desfase' : `${v} min`,
                }))}
              />
            </div>

            {p.typical && p.lagged && (
              <div className="mt-4 rounded-lg border border-border-soft bg-surface-alt p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.8rem] font-bold text-content-primary">
                    Efecto en un {DAYS[SHOWCASE_DAY].toLowerCase()}
                  </span>
                  <Badge tone={s.lagMinutes === 0 ? 'neutral' : 'brand'}>
                    {s.lagMinutes === 0
                      ? 'Curva sin corregir'
                      : `Personal ${s.lagMinutes} min por delante`}
                  </Badge>
                </div>
                <DayCurve
                  covers={p.typical[SHOWCASE_DAY]}
                  laggedCovers={p.lagged[SHOWCASE_DAY]}
                  people={p.peopleGrid?.[SHOWCASE_DAY]}
                  openBlocks={p.hours?.[SHOWCASE_DAY]}
                  dayLabel={DAYS[SHOWCASE_DAY]}
                />
                <p className="mt-1 text-[0.78rem] leading-relaxed text-content-secondary">
                  La discontinua es tu fichero ya corregido; los escalones, la gente que hace
                  falta. Sube el desgaste y verás cómo el equipo entra antes.
                </p>
              </div>
            )}
          </Field>

          {/* ── Turnos ── */}
          <div className="border-t border-border-soft pt-6">
            <div className="mb-3 flex items-center gap-1.5 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
              <Settings2 size={13} strokeWidth={2.5} />
              Cómo se montan los turnos
            </div>

            <div className="space-y-3">
              <Toggle
                checked={s.allowSplitShifts}
                onChange={(v) => patch({ allowSplitShifts: v })}
                label="Jornada partida"
                hint="Permite que una persona haga comidas y cenas el mismo día. Sin esto salen más personas, porque nadie puede cubrir los dos servicios."
              />
              <Toggle
                checked={s.consecutiveDaysOff}
                onChange={(v) => patch({ consecutiveDaysOff: v })}
                label="Dos días de libranza seguidos"
                hint="Se intentan pegar los libres. Es lo que pide casi toda la plantilla, pero ata más el cuadrante."
              />
              <Toggle
                checked={s.minRestBetweenShifts}
                onChange={(v) => patch({ minRestBetweenShifts: v })}
                label="Respetar las 12h de descanso entre turnos"
                hint="Nadie cierra una noche y abre a la mañana siguiente. Es el mínimo legal en España (Art. 34.3 ET); desactívalo solo si sabes lo que haces."
              />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Turno más largo"
                info={
                  <InfoTip title="Turno más largo">
                    Tope de horas seguidas de un turno. Con jornada partida se aplica a cada
                    bloque por separado, no a la suma del día.
                  </InfoTip>
                }
              >
                <select
                  value={s.maxShiftMinutes}
                  onChange={(e) => setMaxShift(Number(e.target.value))}
                  aria-label="Duración máxima de un turno"
                  className={SELECT_CLASS}
                >
                  {MAX_SHIFT_HOURS.map((h) => (
                    <option key={h} value={h * 60}>
                      {h} horas
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Turno más corto"
                info={
                  <InfoTip title="Turno más corto">
                    Suelo para no generar turnos de una hora suelta que nadie vendría a hacer.
                    Cuanto más alto, más horas de más se pagan en las franjas flojas.
                  </InfoTip>
                }
              >
                <select
                  value={s.minShiftMinutes}
                  onChange={(e) => setMinShift(Number(e.target.value))}
                  aria-label="Duración mínima de un turno"
                  className={SELECT_CLASS}
                >
                  {MIN_SHIFT_HOURS.map((h) => (
                    <option key={h} value={h * 60}>
                      {h} {h === 1 ? 'hora' : 'horas'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* ── Contratos ── */}
          <div className="border-t border-border-soft pt-6">
            <Field
              label="Contratos que puedes usar"
              hint="Primero se llena con jornadas completas y lo que queda se completa con parciales. Si quitas los parciales, todo el mundo va a 40 h y pagas más horas vacías."
            >
              <div className="flex flex-wrap gap-2">
                {s.contracts.map((c) => {
                  const last = c.enabled && enabledContracts === 1
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-pill border px-3.5 py-2 text-[0.85rem] font-bold transition-colors',
                        c.enabled
                          ? 'border-brand/30 bg-brand-light text-brand'
                          : 'border-border bg-surface-elevated text-content-secondary',
                        last ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        disabled={last}
                        aria-label={`Usar contratos de ${c.label}`}
                        onChange={() =>
                          patch({
                            contracts: s.contracts.map((x) =>
                              x.id === c.id ? { ...x, enabled: !x.enabled } : x,
                            ),
                          })
                        }
                        className="h-4 w-4 accent-brand"
                      />
                      {c.label}
                    </label>
                  )
                })}
              </div>
              {enabledContracts === 1 && (
                <p className="mt-2 text-[0.78rem] font-semibold text-content-muted">
                  Deja al menos un tipo de contrato activo.
                </p>
              )}
            </Field>
          </div>

          {/* ── Coste ── */}
          <div className="border-t border-border-soft pt-6">
            <Field
              label="Coste medio por hora (opcional)"
              hint="Si lo rellenas, el resultado también enseña una cifra de coste — con tu número, no con uno inventado por nosotros."
              info={
                <InfoTip title="Coste por hora">
                  El coste real por hora trabajada, con Seguridad Social incluida si quieres que la
                  cifra sea honesta. Déjalo en blanco y el resultado se queda solo en personas y
                  horas, como hasta ahora.
                </InfoTip>
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-[0.95rem] font-bold text-content-secondary">€</span>
                <NumberInput
                  value={s.hourlyCostEur ?? NaN}
                  onChange={(v) => patch({ hourlyCostEur: v > 0 ? v : null })}
                  min={0}
                  max={200}
                  step={0.5}
                  placeholder="—"
                  aria-label="Coste medio por hora trabajada, en euros"
                  className="w-24"
                />
                <span className="text-[0.8rem] font-medium text-content-secondary">
                  por hora trabajada
                </span>
              </div>
            </Field>
          </div>

          {/* ── Dimensionado ── */}
          <div className="border-t border-border-soft pt-6">
            <Field
              label="Cómo dimensionamos la semana tipo"
              hint="Con la misma cobertura, el conservador te deja más gente en plantilla."
              info={
                <InfoTip title="Calibrado o conservador">
                  <p className="mb-1.5">
                    <strong>Calibrado:</strong> la semana tipo suma, en total, lo que sumaría una
                    semana del percentil que has pedido. Es la lectura honesta del año.
                  </p>
                  <p>
                    <strong>Conservador:</strong> aplica ese percentil a cada media hora por
                    separado. Como los picos de cada franja no ocurren el mismo día, la suma sale
                    más alta y la plantilla también.
                  </p>
                </InfoTip>
              }
            >
              <Segmented
                value={s.sizingMode}
                onChange={(v) => patch({ sizingMode: v })}
                options={[
                  { value: 'calibrado', label: 'Calibrado' },
                  { value: 'conservador', label: 'Conservador' },
                ]}
              />
            </Field>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Paso
// ─────────────────────────────────────────────────────────────

export function StepTeam() {
  const p = usePlanner()
  const hours = p.needSummary?.totalHours ?? 0

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <span className="eyebrow eyebrow--purple">Tu equipo</span>
        <h1 className="h1 mt-3 text-content-primary">
          Cuando entran 40 comensales,{' '}
          <span className="italic text-brand">¿con cuánta gente lo sacas?</span>
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-content-secondary">
          Eso es lo único que te pedimos. Tu histórico ya nos dice cuánta gente entra y a qué
          hora; lo que no puede decirnos es cómo trabajáis vosotros. Rellena la tabla con lo que
          ya haces de memoria cada semana y el resto lo montamos nosotros.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <TiersTable
            model={p.model}
            onTiersChange={p.setTiers}
            onRolesChange={p.setRoles}
            onBlocksChange={p.setBlocks}
          />

          <AdvancedSettings />

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.85rem] leading-snug font-medium text-content-secondary">
              Con estos tramos pides{' '}
              <strong className="text-content-primary">{nf.format(Math.round(hours))} h</strong> de
              trabajo a la semana. Vamos a repartirlas en turnos y contratos.
            </p>
            <Button
              size="lg"
              onClick={() => p.setStep('result')}
              iconRight={<ArrowRight size={18} />}
              className="w-full shrink-0 sm:w-auto"
            >
              Ver mi plantilla
            </Button>
          </div>

          {/* Hueco para que el panel fijo y la barra del shell no tapen el CTA. */}
          <div className="h-24 lg:hidden" aria-hidden="true" />
        </div>

        <aside className="scroll-thin hidden max-h-[calc(100vh-6rem)] overflow-y-auto lg:sticky lg:top-20 lg:block">
          <LivePanel />
        </aside>
      </div>

      <LivePanelMobile />
    </div>
  )
}
