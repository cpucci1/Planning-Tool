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
  TriangleAlert,
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
  Segmented,
  Stat,
  Toggle,
  cn,
} from '@/components/ui'
import { usePlanner } from '@/hooks/usePlanner'
import { DAYS, formatSlot } from '@/lib/time'
import { peakOf, serviciosDelCobro } from '@/lib/demand'
import { tramoSuperado } from '@/lib/staffing'
import type { Settings } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES', { useGrouping: true })
/** Un decimal, como en el resultado: allí sale 488,5 h y aquí salía 489 (ronda 9). */
const nf1 = new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 1 })

/** El sábado es el día que todo el mundo reconoce como el fuerte. */
const SHOWCASE_DAY = 5

const LAG_OPTIONS: number[] = [0, 15, 30, 45, 60]
/** Lo que puede durar sentada una mesa, en minutos. De un menú rápido a una cena de mantel. */
const MEAL_OPTIONS: number[] = [45, 60, 75, 90, 105, 120, 150]
/** Un desayuno o una copa duran menos que una comida: opciones propias. */
const DESAYUNO_OPTIONS: number[] = [15, 20, 25, 30, 45, 60]
const COPAS_OPTIONS: number[] = [30, 45, 60, 75, 90, 120]
/** Café o merienda de la tarde (ronda 8, M1). */
const MERIENDA_OPTIONS: number[] = [15, 20, 25, 30, 35, 45, 60, 75]
const MAX_SHIFT_HOURS: number[] = [6, 7, 8, 9, 10, 12]
/** Desde 3 h: por debajo nadie viene a trabajar (ronda 3, punto 36). Un plan
 *  guardado con 1 o 2 h la sigue viendo en la lista para no perderla. */
const MIN_SHIFT_HOURS: number[] = [3, 4, 5, 6]
/** Lo que permiten los convenios más habituales: 9 es el del Estatuto. */
const MAX_DAILY_HOURS: number[] = [8, 9, 10, 12]
/** Contrato parcial más pequeño, con los contratos a medida. */
const MIN_CONTRACT_HOURS: number[] = [6, 8, 10, 12, 15, 16, 20]

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
        Horas por zona
        <InfoTip title="Horas por zona">
          Horas de trabajo semanales que necesita cada zona. Es la suma de todos sus puestos, franja
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
                {nf1.format(r.hours)} h
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
  const hours = Math.round(s.totalHours * 10) / 10
  // Con un decimal, como en el resultado (ronda 6, m6 de pantallas): aquí
  // salía 13 y en "Por qué" 12,2 con las mismas horas.
  const fte = Math.round((s.totalHours / 40) * 10) / 10
  /** Plazas del pico que en tu plantilla hace un mando (ronda 6, M5). */
  const cubreElMando = p.plan?.drivers.desglose?.picoQueCubreElMando ?? 0
  const momentos = momentosDelPico(p.needGrid, p.model.roles.map((r) => r.id), peak)
  const hayMandos = p.model.roles.some((r) => r.kind === 'estructura' && (r.headcount ?? 0) > 0)

  return (
    <div className="space-y-5">
      <Stat
        icon={<Users size={13} strokeWidth={2.5} />}
        // "Sin mandos" solo si de verdad no entra ninguno (ronda 7, M3 de
        // pantallas): si una plaza del pico la cubre el mando, la nota de abajo
        // lo dice y la etiqueta no puede contradecirla.
        label={hayMandos && cubreElMando === 0 ? 'Pico de tu equipo, sin mandos' : 'Pico de tu equipo'}
        tone="brand"
        value={
          <span key={peak.people} className="animate-count">
            {peak.people}
          </span>
        }
        hint={
          peak.people > 0
            ? `A la vez, el ${DAYS[peak.day].toLowerCase()} ${momentos}`
            : 'Con estos tramos no pides a nadie'
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <Stat
          icon={<Clock size={13} strokeWidth={2.5} />}
          label="Horas/semana"
          value={
            <span key={hours} className="animate-count">
              {nf1.format(hours)}
            </span>
          }
          hint="Horas de trabajo necesarias en total"
        />
        <Stat
          icon={<Coffee size={13} strokeWidth={2.5} />}
          label="Jornadas de 40 h"
          value={
            <span key={fte} className="animate-count">
              {fte.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
            </span>
          }
          hint="Solo dividiendo horas"
        />
      </div>

      <Note tone="warning">
        Dividir las horas entre 40 es solo una referencia. La plantilla real también depende del
        pico: el{' '}
        {DAYS[peak.day].toLowerCase()} {momentos} necesitas{' '}
        <strong>{peak.people} personas a la vez</strong>
        {cubreElMando > 0
          ? `, ${cubreElMando === 1 ? 'una de ellas la hace' : `${cubreElMando} de ellas las hacen`} tu mando mientras está`
          : hayMandos
            ? ' más tus mandos'
            : ''}
        , y esa gente tiene que estar en nómina
        por pocas horas que sume. El resultado completo lo verás en el paso siguiente.
      </Note>

      <BlockBars />
    </div>
  )
}

/**
 * "a las 14:00 y a las 21:00": cuándo se llega al pico ese día, contando cada
 * vez que se llega y no solo la primera. Revisión ronda 5, M8: la tarjeta de
 * comensales decía que el momento más lleno era a las 21:00 y esta, que el
 * pico de gente era a las 14:00, porque es la primera franja que llega a ese
 * número; las dos eran ciertas y se leían como una contradicción. Solo busca
 * en la rejilla que ya existe; no calcula nada nuevo.
 */
function momentosDelPico(
  grid: Record<string, number[][]> | null,
  roleIds: string[],
  peak: { people: number; day: number; slot: number },
): string {
  if (!grid) return `a las ${formatSlot(peak.slot)}`
  const inicios: number[] = []
  let dentro = false
  const franjas = grid[roleIds.find((id) => grid[id]) ?? '']?.[peak.day]?.length ?? 0
  for (let s = 0; s < franjas; s++) {
    let gente = 0
    for (const id of roleIds) gente += grid[id]?.[peak.day]?.[s] ?? 0
    const enPico = gente === peak.people
    if (enPico && !dentro) inicios.push(s)
    dentro = enPico
  }
  if (inicios.length <= 1) return `a las ${formatSlot(peak.slot)}`
  const horas = inicios.slice(0, 3).map((s) => formatSlot(s))
  return `a las ${horas.slice(0, -1).join(', a las ')} y a las ${horas[horas.length - 1]}`
}

/** "40 h, 30 h, 20 h o 15 h": la lista de contratos fijos, nombrada (revisión ronda 5, m6). */
function listaContratos(etiquetas: string[]): string {
  if (etiquetas.length <= 1) return etiquetas[0] ?? ''
  return `${etiquetas.slice(0, -1).join(', ')} o ${etiquetas[etiquetas.length - 1]}`
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

  const hours = Math.round(s.totalHours * 10) / 10

  return (
    // Sola en la pantalla: en este paso la barra del shell no sale (ronda 3,
    // punto 7), así que va pegada abajo y lleva también las personas.
    <div className="fixed inset-x-0 bottom-0 z-40 pb-2 lg:hidden">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-6">
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
                a la vez en el pico
              </span>
              {/* Dos líneas limpias a 375 px (revisión ronda 5, m15): las
                  personas iban colgando en una línea suelta y el "toca para
                  ver el detalle" salía cortado. La flecha ya dice que se abre. */}
              <span className="block truncate text-[0.72rem] font-semibold text-content-muted">
                <span key={hours} className="animate-count">{nf1.format(hours)}</span> h a la semana
                {p.plan && (
                  <>
                    {' · '}
                    <span key={p.plan.totalPeople} className="animate-count">{p.plan.totalPeople}</span>{' '}
                    {p.plan.totalPeople === 1 ? 'persona en plantilla' : 'personas en plantilla'}
                  </>
                )}
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
            {p.seated
              ? 'Contratos, jornada partida, máximo de horas al día y duración de los turnos. Si no los tocas, van con valores sensatos.'
              : 'Hora del cobro, contratos, jornada partida, máximo de horas al día y duración de los turnos. Si no los tocas, van con valores sensatos.'}
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
          {/* ── Desgaste ── Solo en los planes de antes del 2026-11-04: en los
              nuevos lo sustituye la duración de la comida (`MealCard`), que es
              lo mismo bien hecho, y enseñar los dos invitaría a aplicar el
              desfase dos veces. */}
          {!p.seated && (
          <Field
            label="Adelantar la necesidad respecto al cobro"
            hint="El TPV guarda la hora del cobro, pero la mesa se atiende antes. Si 60 comensales aparecen a las 15:00, este ajuste adelanta la necesidad de personal para colocarla en la hora real del servicio."
            info={
              <InfoTip title="Por qué se adelanta">
                El mismo adelanto se aplica a todos los puestos. No aumenta el pico: solo lo mueve
                a la franja en la que el equipo ya estaba atendiendo a esos comensales.
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
                  falta. Aumenta el adelanto y verás cómo el equipo entra antes.
                </p>
              </div>
            )}
          </Field>
          )}

          {/* ── Turnos ── */}
          <div className={cn(!p.seated && 'border-t border-border-soft pt-6')}>
            <div className="mb-3 flex items-center gap-1.5 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
              <Settings2 size={13} strokeWidth={2.5} />
              Cómo se montan los turnos
            </div>

            <div className="space-y-3">
              <Toggle
                checked={s.allowSplitShifts}
                onChange={(v) => patch({ allowSplitShifts: v })}
                label="Jornada partida"
                hint="Permite que una persona haga comidas y cenas el mismo día. Solo se usa cuando ahorra a una persona: si con turnos seguidos sale la misma plantilla, van seguidos."
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

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field
                label="Máximo de horas al día, según tu convenio"
                info={
                  <InfoTip title="Máximo de horas al día">
                    Nadie trabaja más que esto en un día, sumando los dos bloques si hace partida. La
                    ley pone 9 horas salvo que tu convenio diga otra cosa. Si un día lo pasa, la
                    revisión del cuadrante te lo marca.
                  </InfoTip>
                }
              >
                <select
                  value={s.maxDailyMinutes ?? 9 * 60}
                  onChange={(e) => patch({ maxDailyMinutes: Number(e.target.value) })}
                  aria-label="Máximo de horas al día"
                  className={SELECT_CLASS}
                >
                  {MAX_DAILY_HOURS.map((h) => (
                    <option key={h} value={h * 60}>
                      {h} horas
                    </option>
                  ))}
                </select>
              </Field>

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
                  {[...new Set([...MIN_SHIFT_HOURS, s.minShiftMinutes / 60])].sort((a, b) => a - b).map((h) => (
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
            <Toggle
              checked={s.contratosAMedida ?? true}
              onChange={(v) => patch({ contratosAMedida: v })}
              label="Contratos a medida"
              hint={`Cada persona lleva un contrato con las horas que de verdad trabaja, de jornada completa a parciales de cualquier número de horas. Si lo apagas, solo se usan contratos fijos de ${listaContratos(s.contracts.map((c) => c.label))}, y eliges cuáles.`}
            />

            {(s.contratosAMedida ?? true) && (
              <div className="mt-4 max-w-xs">
                <Field
                  label="Contrato parcial más pequeño"
                  hint="Nadie baja de aquí aunque trabaje menos, y las horas de más se pagan aunque no haya clientes."
                >
                  <select
                    value={s.minContractHours ?? 10}
                    onChange={(e) => patch({ minContractHours: Number(e.target.value) })}
                    aria-label="Contrato parcial más pequeño"
                    className={SELECT_CLASS}
                  >
                    {MIN_CONTRACT_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h} horas
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {!(s.contratosAMedida ?? true) && (
            <div className="mt-4">
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
            )}
          </div>

          {/* El coste ya no vive aquí: es por categoría, y se rellena en el
              catálogo de puestos del primer paso. Un único "coste medio" no
              sirve cuando un jefe de cocina y un office no cuestan igual. */}

          {/* ── Dimensionado ── */}
          <div className="border-t border-border-soft pt-6">
            <Field
              label="Cómo dimensionamos la semana tipo"
              hint={`Con la misma cobertura, la opción con más margen deja más gente en plantilla. Se suma al margen de seguridad que pusiste en Demanda (${s.safetyMarginPct} %): si ya pusiste uno allí, aquí deja "ajustado".`}
              info={
                <InfoTip title="Ajustado al histórico o con más margen">
                  <p className="mb-1.5">
                    <strong>Ajustado al histórico:</strong> la semana tipo conserva el volumen total
                    de una semana real con la cobertura que has elegido.
                  </p>
                  <p>
                    <strong>Con más margen:</strong> toma una referencia alta en cada media hora. La
                    suma sale más alta y la plantilla también.
                  </p>
                </InfoTip>
              }
            >
              <Segmented
                value={s.sizingMode}
                onChange={(v) => patch({ sizingMode: v })}
                options={[
                  { value: 'calibrado', label: 'Ajustado al histórico' },
                  { value: 'conservador', label: 'Con más margen' },
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
// Sentados a la vez
// ─────────────────────────────────────────────────────────────

/**
 * La referencia para rellenar los tramos: cuánta gente llega a tener sentada
 * a la vez, y cuánto dura una mesa, que es de donde sale esa cifra.
 *
 * Va encima de la tabla y no en los ajustes avanzados: sin saber que su
 * sábado llega a 300 sentados, nadie sabe si "de 101 a 150" es su hora punta
 * o una tarde floja. Y la duración de la comida es la que convierte cobros en
 * sentados, así que va al lado de la cifra que mueve.
 */
function MealCard() {
  const p = usePlanner()
  const meal = p.settings.mealMinutes
  const peak = useMemo(() => (p.seated ? peakOf(p.seated) : null), [p.seated])
  const superado = peak ? tramoSuperado(p.tiers, peak.value) : null
  if (!meal || !p.seated) return null

  const setMeal = (patch: Partial<typeof meal>) =>
    p.setSettings((st) => ({ ...st, mealMinutes: { ...meal, ...patch } }))
  // El desayuno y las copas solo se preguntan si el local cobra a esas horas
  // (ronda 5, G2). Un plan de antes no los trae: se enseña lo que vale hoy
  // (la comida o la cena) y se guarda al tocarlo.
  const servicios = p.typical ? serviciosDelCobro(p.typical) : null
  const conDesayuno = !!servicios?.desayuno
  const conCopas = !!servicios?.copas
  // La merienda, igual (ronda 8, M1): solo si el local cobra de 17:30 a 20:00.
  // En un plan de antes esos cobros contaban como comida hasta las 18:00 y
  // como cena después; se enseña la cena y se guarda al tocarla.
  const conMerienda = !!servicios?.merienda
  const tieneMerienda = meal.merienda !== undefined

  return (
    <Card>
      <CardHeader
        eyebrow="Sentados a la vez"
        title={
          peak && peak.value > 0 ? (
            <>
              Tu {DAYS[peak.day].toLowerCase()} llega a{' '}
              <span className="text-brand italic">{nf.format(peak.value)} comensales sentados</span>
            </>
          ) : (
            'Comensales sentados a la vez'
          )
        }
        subtitle={
          peak && peak.value > 0
            ? `Es tu momento con más comensales dentro, a las ${formatSlot(peak.slot)}. Los tramos de abajo se leen en esta escala: comensales sentados a la vez, no tickets.`
            : 'Los tramos de abajo se leen en esta escala: gente sentada a la vez, no tickets.'
        }
        info={
          <InfoTip title="De dónde sale">
            Tu fichero dice a qué hora paga cada mesa, y se paga al terminar. Quien paga a las
            15:00 con una comida de 75 minutos llevaba sentado desde las 13:45, y todo ese rato
            ocupó una silla y le dio trabajo a la sala y a la cocina. Sumando las mesas que están
            dentro en cada media hora sale la gente sentada a la vez.
          </InfoTip>
        }
      />
      {superado && peak && (
        <div className="border-t border-border-soft px-4 py-4 sm:px-6">
          <Note tone="warning" icon={<TriangleAlert size={15} />}>
            <strong className="text-content-primary">Tu local es más grande que la tabla.</strong>{' '}
            El último tramo empieza en {nf.format(superado.tier.from)} sentados y está pensado hasta
            unos {nf.format(superado.hasta)}; tu {DAYS[peak.day].toLowerCase()} llega a{' '}
            {nf.format(peak.value)}. Por encima se aplica ese mismo equipo, así que en tus horas
            más llenas te saldría gente de menos. Añade un tramo más arriba con el equipo que de
            verdad pones.
          </Note>
        </div>
      )}
      <div className="grid gap-4 border-t border-border-soft px-4 py-5 sm:grid-cols-2 sm:px-6">
        {conDesayuno && (
          <Field label="Un desayuno dura" hint="Mesas y barra que pagan antes de las 12:30.">
            <select
              value={meal.breakfast ?? meal.midday}
              onChange={(e) => setMeal({ breakfast: Number(e.target.value) })}
              aria-label="Cuánto dura un desayuno"
              className={SELECT_CLASS}
            >
              {[...new Set([...DESAYUNO_OPTIONS, meal.breakfast ?? meal.midday])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label="Una comida dura"
          hint={
            conDesayuno
              ? `Mesas que pagan de 12:30 a ${tieneMerienda ? '17:30' : '18:00'}.`
              : `Mesas que pagan antes de las ${tieneMerienda ? '17:30' : '18:00'}.`
          }
        >
          <select
            value={meal.midday}
            onChange={(e) => setMeal({ midday: Number(e.target.value) })}
            aria-label="Cuánto dura sentada una mesa a mediodía"
            className={SELECT_CLASS}
          >
            {MEAL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </Field>
        {conMerienda && (
          <Field label="Una merienda dura" hint="Cafés y mesas de la tarde que pagan de 17:30 a 20:00.">
            <select
              value={meal.merienda ?? meal.night}
              onChange={(e) => setMeal({ merienda: Number(e.target.value) })}
              aria-label="Cuánto dura una merienda o un café de la tarde"
              className={SELECT_CLASS}
            >
              {[...new Set([...MERIENDA_OPTIONS, meal.merienda ?? meal.night])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label="Una cena dura"
          hint={
            tieneMerienda
              ? `${conCopas ? 'Mesas que pagan de 20:00 a 01:00.' : 'Mesas que pagan de las 20:00 en adelante.'}${
                  // Sin casilla de merienda a la vista quedaba un hueco de 17:30
                  // a 20:00 sin explicar (ronda 9): se dice dónde cuenta.
                  conMerienda ? '' : ` Lo que se cobra de 17:30 a 20:00 cuenta como merienda, de ${meal.merienda} min.`
                }`
              : conCopas
                ? 'Mesas que pagan de 18:00 a 01:00.'
                : 'Mesas que pagan de las 18:00 en adelante.'
          }
        >
          <select
            value={meal.night}
            onChange={(e) => setMeal({ night: Number(e.target.value) })}
            aria-label="Cuánto dura sentada una mesa por la noche"
            className={SELECT_CLASS}
          >
            {MEAL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </Field>
        {conCopas && (
          <Field label="Una copa dura" hint="Lo que se cobra de la 01:00 en adelante.">
            <select
              value={meal.drinks ?? meal.night}
              onChange={(e) => setMeal({ drinks: Number(e.target.value) })}
              aria-label="Cuánto dura una copa de noche"
              className={SELECT_CLASS}
            >
              {[...new Set([...COPAS_OPTIONS, meal.drinks ?? meal.night])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
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
        {/* Los planes de antes del 2026-11-04 tienen los tramos en cobros por
            media hora, y la pregunta tiene que decir la escala que de verdad
            lee el cálculo. */}
        <h1 className="h1 mt-3 text-content-primary">
          {p.seated ? 'Con tu sala llena,' : 'Cuando entran 40 comensales,'}{' '}
          <span className="italic text-brand">
            {p.seated ? '¿cuánta gente necesitas?' : '¿con cuánta gente lo sacas?'}
          </span>
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {p.seated && <MealCard />}

          <TiersTable
            escala={p.seated ? 'sentados' : 'cobros'}
            model={p.model}
            onTiersChange={p.setTiers}
            onRolesChange={p.setRoles}
            onBlocksChange={p.setBlocks}
          />

          <AdvancedSettings />

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.85rem] leading-snug font-medium text-content-secondary">
              Con estos tramos pides{' '}
              <strong className="text-content-primary">{nf1.format(hours)} h</strong> de
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
