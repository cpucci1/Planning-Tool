/**
 * El resultado: la pantalla del entregable.
 *
 * Se lee de arriba abajo como una historia: cuánta gente necesitas → dónde has
 * puesto la línea y qué significa esa apuesta → de dónde sale el número → cómo
 * queda la semana → el cuadrante → y, solo al final, qué hacer con lo que la
 * plantilla fija no cubre.
 *
 * Shifty aparece aquí y en ningún otro sitio del flujo, y aparece con los
 * números del propio cálculo. Si el argumento no sale de la cuenta, no se pone.
 */

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Clock,
  Download,
  Gauge,
  Layers,
  Link as LinkIcon,
  RotateCcw,
  Save,
  Table2,
  Users,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, InfoTip, Modal, Note, NumberInput, Stat, cn } from '@/components/ui'
import { AccountTeaserModal } from '@/components/AccountTeaserModal'
import { AvisosCuadrante } from '@/components/AvisosCuadrante'
import { CriteriaModal, type Criterion } from '@/components/CriteriaModal'
import { RosterGrid } from '@/components/RosterGrid'
import { StaffTable } from '@/components/StaffTable'
import { DayCurve } from '@/components/charts/DayCurve'
import { WeekHeatmap } from '@/components/charts/WeekHeatmap'
import { YearChart } from '@/components/charts/YearChart'
import { usePlanner } from '@/hooks/usePlanner'
import { WEEKS_PER_YEAR, describeMix, fteFrom, summarizeCost } from '@/lib/contracts'
import { riskRatio } from '@/lib/demand'
import { revisarCuadrante } from '@/lib/avisos'
import { calcularMetricas } from '@/lib/metricas'
import { urlDelPlan } from '@/lib/compartir'
import { downloadPlanCsv } from '@/lib/export'
import { downloadReport } from '@/lib/report'
import { DAYS, DAYS_SHORT, formatSlot } from '@/lib/time'
import type { DayIndex } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES')
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** Cobertura mínima y máxima que se deja elegir con la línea. */
const MIN_PCT = 20
const MAX_PCT = 98

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/**
 * Eyebrow sobre fondo morado.
 *
 * La clase `.eyebrow` de index.css fija el color fuera de las capas de
 * Tailwind, así que una utilidad `text-content-inverted` no la puede pisar.
 * Sobre el bloque de marca se replica a mano con los mismos valores.
 */
function EyebrowInverted({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.68rem] font-bold tracking-[0.12em] text-content-inverted/70 uppercase">
      <span className="block h-4 w-[3px] shrink-0 rounded-[2px] bg-content-inverted/70" />
      {children}
    </span>
  )
}

export function StepResult() {
  const p = usePlanner()
  const [dayOverride, setDayOverride] = useState<DayIndex | null>(null)
  const [askReset, setAskReset] = useState(false)
  const [showCriteria, setShowCriteria] = useState(false)
  const [enlaceCopiado, setEnlaceCopiado] = useState(false)

  /**
   * El teaser de cuenta sale UNA vez, cuando el usuario llega al cuadrante
   * donde puede poner nombres reales — ahí es donde "no perderlo" significa
   * algo, porque ya ha invertido algo suyo (los nombres), no antes con solo
   * el número. `teaserShown` evita que reaparezca si vuelve a pasar por
   * encima de la sección al hacer scroll hacia arriba y abajo.
   *
   * El cuadrante puede medir miles de píxeles de alto (una fila por persona),
   * así que observarlo entero con un threshold alto nunca dispararía: un
   * 60% de un elemento mucho más alto que la ventana no cabe nunca en ella.
   * En su lugar se observa un marcador de 0 px justo antes del cuadrante, con
   * un rootMargin que reduce la "ventana" a una franja fina en el centro —
   * el truco habitual para detectar "el usuario ha llegado a esta sección",
   * no "esta sección entera está a la vista".
   */
  const rosterSectionRef = useRef<HTMLDivElement>(null)
  const [showAccountTeaser, setShowAccountTeaser] = useState(false)
  const teaserShown = useRef(false)

  useEffect(() => {
    const el = rosterSectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !teaserShown.current) {
          teaserShown.current = true
          setShowAccountTeaser(true)
        }
      },
      { threshold: 0, rootMargin: '-45% 0px -45% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { plan, roster, needGrid, needSummary, coverage, peaks, peopleGrid, lagged } = p

  if (!plan || !roster || !needGrid || !needSummary || !coverage || !peaks || !peopleGrid || !lagged) {
    return (
      <Card className="px-6 py-16 text-center">
        <h2 className="text-[1.5rem] leading-tight font-extrabold tracking-[-0.028em] text-content-primary">
          Todavía no hay <span className="text-brand italic">nada que calcular.</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-content-secondary">
          Necesitamos tu histórico de comensales para sacar la plantilla. Sube tu fichero o carga
          los datos de ejemplo y vuelve aquí.
        </p>
        <div className="mt-6">
          <Button onClick={() => p.setStep('import')}>Ir al primer paso</Button>
        </div>
      </Card>
    )
  }

  const { settings, model, weeks, hours, specials } = p
  const mix = describeMix(plan.allocations, settings.contracts)
  const fte = fteFrom(plan)
  const peakWeekCount = peaks.peakWeeks.length
  const ratio = riskRatio(settings.coveragePct)
  const slackPct = plan.contractedHours > 0 ? Math.round((plan.slackHours / plan.contractedHours) * 100) : 0

  const dayIdx: DayIndex = dayOverride ?? needSummary.peak.day

  const roleName = new Map(model.roles.map((r) => [r.id, r.name]))
  const topPeakRole = [...plan.drivers.peakByRole].sort((a, b) => b.peak - a.peak)[0]

  const blockHours = model.blocks
    .map((b) => ({ ...b, hours: needSummary.hoursByBlock[b.id] ?? 0 }))
    .filter((b) => b.hours > 0)
    .sort((a, b) => b.hours - a.hours)
  const maxBlockHours = blockHours.length ? blockHours[0].hours : 0

  /**
   * Contratar para el pico obliga a dimensionar por la peor semana, no por la
   * media: quien entra en nómina lo hace para el día que más aprieta. Por eso
   * el "si los contratases" sale de `worstWeek`, con la media como red por si
   * no hay ninguna semana punta identificada.
   */
  const extraPeopleIfHired = peaks.worstWeek?.extraPeople ?? peaks.avgExtraPeople

  /**
   * Coste, solo con los precios por categoría que haya rellenado el usuario
   * en el catálogo de puestos: nunca se inventa un precio, ni de mercado ni
   * de Shifty. Si no hay ninguno, `cost` es null y la pantalla se queda en
   * personas y horas, como antes.
   *
   * Para valorar los picos se usa el coste medio por hora DE SU PROPIA
   * plantilla: los extras no son de un puesto concreto, así que ponerles el
   * precio del jefe de cocina o el del office sería igual de arbitrario.
   */
  const cost = summarizeCost(roster, model)
  const weeklyCostEur = cost?.weeklyEur ?? null
  const annualCostEur = cost?.annualEur ?? null
  const avgHourlyCost = cost?.avgHourlyEur ?? null
  // 52 semanas, no las analizadas: a esa gente se le paga el año entero, que
  // es justamente el argumento.
  const peakHiredAnnualCostEur = avgHourlyCost
    ? extraPeopleIfHired * 40 * WEEKS_PER_YEAR * avgHourlyCost
    : null
  const peakOnlyAnnualCostEur = avgHourlyCost ? peaks.peakHoursPerYear * avgHourlyCost : null

  /** La revisión legal del cuadrante y las métricas que salen de él. */
  const avisos = revisarCuadrante(roster, model, settings)
  const metricas = calcularMetricas(roster, needGrid, model, lagged)

  /** Coste de personal sobre ventas. Solo si él ha puesto las dos cifras. */
  const ratioPersonal =
    weeklyCostEur !== null && settings.weeklySalesEur && settings.weeklySalesEur > 0
      ? Math.round((weeklyCostEur / settings.weeklySalesEur) * 100)
      : null
  const ratioTono =
    ratioPersonal === null
      ? ''
      : ratioPersonal <= 32
        ? 'text-success'
        : ratioPersonal <= 40
          ? 'text-warning'
          : 'text-destructive'

  /** Todo lo que ha entrado en el cálculo, para el modal de criterios (7.8). */
  const criteria: Criterion[] = [
    { label: 'Cobertura', value: `${settings.coveragePct}%`, step: 'result', where: 'La línea del gráfico de arriba' },
    { label: 'Margen de seguridad', value: `${settings.safetyMarginPct}%`, step: 'demand', where: 'Demanda, pantalla de tu año' },
    { label: 'Dimensionado', value: settings.sizingMode === 'calibrado' ? 'Calibrado' : 'Conservador', step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Desgaste del dato', value: `${settings.lagMinutes} min`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Turno más largo', value: `${settings.maxShiftMinutes / 60} h`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Turno más corto', value: `${settings.minShiftMinutes / 60} h`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Jornada partida', value: settings.allowSplitShifts ? 'Sí' : 'No', step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Dos libranzas seguidas', value: settings.consecutiveDaysOff ? 'Sí' : 'No', step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: '12 h de descanso', value: settings.minRestBetweenShifts ? 'Sí' : 'No', step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Contratos activos', value: settings.contracts.filter((c) => c.enabled).map((c) => c.label).join(', '), step: 'team', where: 'Equipo, ajustes avanzados' },
    ...model.blocks
      .filter((b) => (settings.minStaffByBlock[b.id] ?? 0) > 0)
      .map((b) => ({
        label: `Mínimo en ${b.name}`,
        value: `${settings.minStaffByBlock[b.id]} personas`,
        step: 'demand' as const,
        where: 'Demanda, pantalla de horario',
      })),
    { label: 'Tramos de personal', value: `${model.tiers.length} tramos`, step: 'team', where: 'Equipo, la tabla principal' },
    { label: 'Puestos', value: `${model.roles.length} puestos`, step: 'demand', where: 'Demanda, catálogo de puestos' },
    { label: 'Semanas excluidas', value: `${specials.filter((x) => x.excluded).length}`, step: 'demand', where: 'Demanda, semanas raras' },
  ]

  const exportInput = {
    roster,
    model,
    settings,
    cost,
    hours: hours ?? null,
    kitchenHours: p.kitchenHours,
    coveragePct: settings.coveragePct,
    weeksCovered: coverage.weeksCovered,
    totalWeeks: weeks.length,
    neededHours: plan.neededHours,
    contractedHours: plan.contractedHours,
    slackHours: plan.slackHours,
  }

  /**
   * La línea manda: el usuario mueve comensales, nosotros traducimos a
   * porcentaje y ese porcentaje recalcula toda la pantalla. Se redondea a
   * entero a propósito — durante el arrastre llegan decenas de eventos por
   * segundo, y así el cuadrante solo se rehace cuando la cobertura cambia de
   * verdad.
   */
  function handleThreshold(t: number) {
    const raw = p.coverageFromThreshold(t)
    const pct = Math.round(Math.min(MAX_PCT, Math.max(MIN_PCT, raw)))
    p.setSettings((s) => (s.coveragePct === pct ? s : { ...s, coveragePct: pct }))
  }

  /**
   * El PDF es un one-pager independiente, dibujado con jsPDF: no una captura
   * de esta pantalla, sino los mismos números ya calculados aquí. Se arma el
   * objeto en el cuerpo del componente (no dentro del handler) para que
   * TypeScript siga viendo `plan`, `coverage`, etc. como no-nulos: dentro de
   * una función anidada esa comprobación ya no se conserva.
   */
  const reportInput = {
    totalPeople: plan.totalPeople,
    mix,
    fte,
    contractedHours: plan.contractedHours,
    neededHours: plan.neededHours,
    coveragePct: settings.coveragePct,
    weeksCovered: coverage.weeksCovered,
    totalWeeks: weeks.length,
    fteFromHours: plan.drivers.fteFromHours,
    peakDayLabel: DAYS[needSummary.peak.day].toLowerCase(),
    peakSlotLabel: formatSlot(needSummary.peak.slot),
    peakPeople: needSummary.peak.people,
    topPeakRoleName:
      topPeakRole && topPeakRole.peak > 0 ? (roleName.get(topPeakRole.roleId) ?? null) : null,
    topPeakCount: topPeakRole?.peak ?? 0,
    peakWeekCount,
    peakHoursPerYear: peaks.peakHoursPerYear,
    extraPeopleIfHired,
    hourlyCostEur: avgHourlyCost,
    weeklyCostEur,
    annualCostEur,
    peakHiredAnnualCostEur,
    peakOnlyAnnualCostEur,
  }
  /**
   * Copia un enlace que reproduce este mismo plan. El estado va dentro del
   * `#` de la dirección, la parte que el navegador NO envía a ningún servidor:
   * así se puede mandar al socio o a la gestoría sin que las ventas del
   * restaurante pasen por ningún sitio.
   */
  async function copiarEnlace() {
    const url = await urlDelPlan(
      {
        version: 1,
        dataset: p.dataset,
        hours: p.hours,
        kitchenHours: p.kitchenHours,
        specials: p.specials,
        blocks: model.blocks,
        roles: model.roles,
        tiers: model.tiers,
        settings,
        overrides: [...p.overrides],
        personNames: p.personNames,
      },
      window.location.href,
    )
    try {
      await navigator.clipboard.writeText(url)
      setEnlaceCopiado(true)
      setTimeout(() => setEnlaceCopiado(false), 2500)
    } catch {
      // Sin permiso de portapapeles (pasa en algunos navegadores si no hay
      // gesto del usuario): al menos se le enseña para que lo copie a mano.
      window.prompt('Copia este enlace:', url)
    }
  }

  function handleDownloadReport() {
    void downloadReport(reportInput)
  }

  return (
    <div className="space-y-6">
      {/* ── 1. El titular ─────────────────────────────────────── */}
      <section className="animate-slide-up pt-2">
        <span className="eyebrow eyebrow--purple">Tu plantilla</span>
        <h1 className="mt-3 text-[2.5rem] leading-[1.02] font-black tracking-[-0.035em] text-content-primary sm:text-[3.4rem]">
          {plan.totalPeople} {plural(plan.totalPeople, 'persona', 'personas')}{' '}
          <span className="text-brand italic">en plantilla fija.</span>
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone="brand" className="text-[0.8rem]">
            {mix}
          </Badge>
          <span className="text-[0.85rem] font-semibold text-content-secondary">
            {nf1.format(fte)} {plural(fte, 'jornada completa', 'jornadas completas')} equivalentes
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-content-secondary">
          {peakWeekCount > 0 ? (
            <>
              Con esta plantilla cubres{' '}
              <strong className="font-bold text-content-primary">
                {coverage.weeksCovered} de {weeks.length} semanas
              </strong>{' '}
              del año con gente tuya. Las otras {peakWeekCount} se salen, y para eso están los
              extras.
            </>
          ) : (
            <>
              Con esta plantilla cubres{' '}
              <strong className="font-bold text-content-primary">
                las {weeks.length} semanas
              </strong>{' '}
              del año sin pedir ayuda. Eso también quiere decir que estás pagando el peor mes los
              doce meses.
            </>
          )}
        </p>

        <div className="mt-5">
          <Button
            variant="secondary"
            icon={<Download size={17} strokeWidth={2.3} />}
            onClick={handleDownloadReport}
          >
            Descargar informe (PDF)
          </Button>
        </div>
      </section>

      {/* ── 2. Dónde te sitúas ────────────────────────────────── */}
      <Card>
        <CardHeader
          eyebrow="Tu semana tipo"
          title={
            <>
              Tu semana tipo, <span className="text-brand italic">contra el año entero.</span>
            </>
          }
          subtitle="Arrastra la línea. Lo que queda por debajo lo cubre tu plantilla fija; lo que asoma por encima son picos. Todo lo demás de esta pantalla se recalcula solo."
        />
        <div className="grid gap-6 border-t border-border-soft px-4 pt-5 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <YearChart
              weeks={weeks}
              threshold={coverage.threshold}
              onThresholdChange={handleThreshold}
              specials={specials}
              coveragePct={settings.coveragePct}
              height={300}
            />
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg bg-brand-light px-4 py-4">
              <div className="text-[0.72rem] font-bold tracking-wide text-brand uppercase">
                Cobertura
              </div>
              <div className="mt-1 text-[2.4rem] leading-none font-black text-brand tnum">
                {settings.coveragePct}%
              </div>
              <p className="mt-2 text-[0.83rem] leading-relaxed font-medium text-content-body">
                La línea está en <strong>{nf.format(coverage.threshold)} comensales</strong> a la
                semana. Por debajo caen {coverage.weeksCovered}{' '}
                {plural(coverage.weeksCovered, 'semana', 'semanas')}; por encima,{' '}
                {peakWeekCount}.
              </p>
            </div>

            <Note tone="neutral">
              <span className="flex items-center gap-1.5 font-bold text-content-primary">
                Lo que estás apostando
                <InfoTip title="Por qué se lee así">
                  Elegir un percentil es elegir un equilibrio entre dos errores: quedarte corto y
                  que te sobre gente. El percentil {settings.coveragePct} equivale a decir que el
                  primero te duele {nf1.format(ratio)} veces más que el segundo. Es la lectura de
                  toda la vida del problema del vendedor de periódicos.
                </InfoTip>
              </span>
              <p className="mt-1.5">
                Al {settings.coveragePct}% estás diciendo que{' '}
                <strong>quedarte corto es {nf1.format(ratio)} veces más grave</strong> que
                pasarte de gente. Si un servicio flojo te cuesta más caro que una nómina de más,
                sube la línea; si vas justo de margen, bájala.
              </p>
            </Note>

            {settings.sizingMode === 'conservador' && p.inflation && (
              <Note tone="warning">
                <strong>Estás en modo conservador.</strong> El percentil se aplica a cada media hora
                por separado, así que tu semana tipo suma{' '}
                {nf.format(p.inflation.conservativeTotal)} comensales cuando una semana real de ese
                percentil son {nf.format(p.inflation.referenceTotal)}: un{' '}
                {Math.round(p.inflation.inflationPct)}% de demanda que nunca ocurre toda a la vez, y
                que acabas pagando en plantilla las 52 semanas.
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => p.setSettings((s) => ({ ...s, sizingMode: 'calibrado' }))}
                  >
                    Pasar a calibrado
                  </Button>
                </div>
              </Note>
            )}
          </aside>
        </div>
      </Card>

      {/* ── 2 bis. La plantilla, puesto por jornada ───────────── */}
      <StaffTable
        roster={roster}
        model={model}
        contracts={settings.contracts}
        eyebrow="Plantilla total"
        title={
          <>
            Lo que tendrías que <span className="text-brand italic">contratar.</span>
          </>
        }
        subtitle="Cada puesto con su desglose de jornada. Es la lista con la que se ficha."
      />

      {/* Y la misma partida por bloque: quien contrata sala no contrata
          cocina, y mirarlo junto obliga a hacer la resta a mano. */}
      {model.blocks.length > 1 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {model.blocks.map((b) => (
            <StaffTable
              key={b.id}
              roster={roster}
              model={model}
              contracts={settings.contracts}
              blockId={b.id}
              eyebrow={`Plantilla ${b.name.toLowerCase()}`}
              title={<>{b.name}</>}
            />
          ))}
        </div>
      )}

      {/* ── 3. De dónde sale el número ────────────────────────── */}
      <Card>
        <CardHeader
          eyebrow="De dónde sale"
          title={
            <>
              El número, <span className="text-brand italic">y de dónde sale.</span>
            </>
          }
          subtitle="Personas, jornadas equivalentes y horas. Lo contratado nunca cuadra al minuto con lo necesario: esa diferencia es la holgura."
        />

        <div className="grid grid-cols-2 gap-5 border-t border-border-soft px-6 py-5 lg:grid-cols-4">
          <Stat
            icon={<Users size={13} strokeWidth={2.6} />}
            label="Personas"
            value={plan.totalPeople}
            hint={mix}
            tone="brand"
          />
          <Stat
            icon={
              <InfoTip title="Jornadas completas equivalentes">
                Las horas contratadas divididas entre una jornada de 40 h. Es el número que se
                compara entre locales, porque "{plan.totalPeople} personas" no dice nada si la mitad
                son de 15 horas.
              </InfoTip>
            }
            label="Plantilla equivalente"
            value={nf1.format(fte)}
            hint="A jornada de 40 h: un 20 h cuenta 0,5"
          />
          <Stat
            icon={<Clock size={13} strokeWidth={2.6} />}
            label="Horas contratadas"
            value={`${nf1.format(plan.contractedHours)} h`}
            hint={`La curva pide ${nf1.format(plan.neededHours)} h`}
          />
          <Stat
            icon={
              <InfoTip title="Holgura">
                Horas contratadas que sobran sobre la necesidad real. Siempre hay algunas: los
                turnos no se cortan al minuto y nadie entra a las 13:20 para salir a las 15:40. Si
                se dispara, baja la duración mínima de turno o activa la jornada partida en el paso
                anterior.
              </InfoTip>
            }
            label="Holgura"
            value={`${nf1.format(plan.slackHours)} h`}
            hint={`${slackPct}% de lo contratado`}
            tone={plan.slackHours > plan.neededHours * 0.15 ? 'warning' : 'default'}
          />
        </div>

        <div className="border-t border-border-soft px-6 py-5">
          <Note tone="brand">
            Por horas te bastarían{' '}
            <strong>
              {nf1.format(plan.drivers.fteFromHours)}{' '}
              {plural(plan.drivers.fteFromHours, 'jornada completa', 'jornadas completas')}
            </strong>
            . Son {plan.totalPeople} {plural(plan.totalPeople, 'persona', 'personas')} porque manda
            el pico: el {DAYS[needSummary.peak.day].toLowerCase()} a las{' '}
            {formatSlot(needSummary.peak.slot)} necesitas {needSummary.peak.people} a la vez
            {topPeakRole && topPeakRole.peak > 0 ? (
              <>
                , {topPeakRole.peak} de {roleName.get(topPeakRole.roleId) ?? 'un mismo puesto'}
              </>
            ) : null}
            . Esa gente está en nómina aunque entre todos no llenen la jornada.
          </Note>

          {/* El ratio con el que de verdad piensa un hostelero. Solo aparece si
              nos ha dicho lo que factura; si no, ni se menciona. */}
          {weeklyCostEur !== null && (
            <div className="mt-4 rounded-lg border border-border-soft bg-surface-alt p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[0.85rem] font-bold text-content-primary">
                  ¿Cuánto factura una semana normal?
                </span>
                <span className="flex items-center gap-1.5">
                  <NumberInput
                    value={settings.weeklySalesEur ?? NaN}
                    onChange={(v) =>
                      p.setSettings((st) => ({ ...st, weeklySalesEur: v > 0 ? v : null }))
                    }
                    min={0}
                    max={1000000}
                    step={500}
                    placeholder="—"
                    aria-label="Ventas de una semana normal, en euros"
                    className="w-28"
                  />
                  <span className="text-[0.85rem] font-bold text-content-secondary">€</span>
                </span>
                <InfoTip title="Para qué sirve">
                  Para darte el coste de personal sobre ventas, que es el ratio con el que hablas
                  con tu asesor. No se guarda en ningún sitio ni sale de tu navegador.
                </InfoTip>
              </div>

              {ratioPersonal !== null && (
                <p className="mt-3 text-[0.9rem] leading-relaxed text-content-secondary">
                  Tu personal se lleva el{' '}
                  <strong className={cn('text-[1.05rem]', ratioTono)}>{ratioPersonal}%</strong> de
                  lo que facturas.{' '}
                  {ratioPersonal <= 32
                    ? 'Está en la banda sana del sector, entre el 25% y el 32%.'
                    : ratioPersonal <= 40
                      ? 'Por encima de la banda sana (25% a 32%), pero dentro de lo normal.'
                      : 'Por encima del 40%, que es donde el sector enciende la alarma.'}
                </p>
              )}
            </div>
          )}

          {cost !== null && weeklyCostEur !== null && annualCostEur !== null && (
            <p className="mt-3 text-[0.85rem] leading-relaxed text-content-secondary">
              Con los costes de tu catálogo, esta plantilla sale por{' '}
              <strong className="text-content-primary">{eur.format(weeklyCostEur)} a la semana</strong>{' '}
              y <strong className="text-content-primary">{eur.format(annualCostEur)} al año</strong>.
              {!cost.complete && (
                <>
                  {' '}
                  Falta el coste de {cost.missing.join(', ')}, así que la cifra real es mayor.
                </>
              )}
            </p>
          )}
        </div>

        <div className="grid gap-8 border-t border-border-soft px-6 py-5 md:grid-cols-2">
          <div>
            <h4 className="h4 flex items-center gap-2">
              Cómo se reparten los contratos
              <InfoTip title="Cómo se elige cada contrato">
                Primero se llena con jornadas de 40 h y lo que queda se cubre con parciales. Después
                cada persona baja al contrato más pequeño que cubra sus horas, para no pagar horas
                que nadie va a trabajar.
              </InfoTip>
            </h4>
            <ul className="mt-3 space-y-2.5">
              {plan.allocations.map((a) => {
                const label = settings.contracts.find((c) => c.id === a.contractId)?.label ?? `${a.hours}h`
                const share = plan.totalPeople > 0 ? a.count / plan.totalPeople : 0
                return (
                  <li key={a.contractId} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-[0.85rem] font-bold text-content-primary tnum">
                      {label}
                    </span>
                    <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface">
                      <span
                        className="block h-full rounded-pill bg-brand"
                        style={{ width: `${Math.max(share * 100, 3)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-[0.82rem] font-semibold text-content-secondary tnum">
                      {a.count} {plural(a.count, 'persona', 'personas')}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[0.8rem] font-medium text-content-muted">
              {nf1.format(plan.contractedHours)} h contratadas a la semana en total.
            </p>
          </div>

          <div>
            <h4 className="h4 flex items-center gap-2">
              <Layers size={15} strokeWidth={2.4} className="text-content-muted" />
              Horas por bloque
            </h4>
            {blockHours.length === 0 ? (
              <p className="mt-3 text-[0.85rem] text-content-secondary">
                Tus tramos no asignan personal a ningún bloque todavía.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-2.5">
                  {blockHours.map((b) => (
                    <li key={b.id} className="flex items-center gap-3">
                      <span className="flex w-28 shrink-0 items-center gap-2 text-[0.85rem] font-bold text-content-primary">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-pill"
                          style={{ background: b.color }}
                        />
                        <span className="truncate">{b.name}</span>
                      </span>
                      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface">
                        <span
                          className="block h-full rounded-pill"
                          style={{
                            width: `${maxBlockHours > 0 ? Math.max((b.hours / maxBlockHours) * 100, 3) : 0}%`,
                            background: b.color,
                          }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[0.82rem] font-semibold text-content-secondary tnum">
                        {nf1.format(b.hours)} h
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.8rem] font-medium text-content-muted">
                  {nf1.format(needSummary.totalHours)} h a la semana que pide la curva de necesidad.
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ── 4. La semana, franja a franja ─────────────────────── */}
      <Card>
        <CardHeader
          eyebrow="Tu semana"
          title={
            <>
              La demanda y la gente, <span className="text-brand italic">hora a hora.</span>
            </>
          }
          subtitle="La curva morada son comensales; los escalones, las personas que piden tus tramos en esa media hora."
        />

        <div className="border-t border-border-soft px-4 pt-4 pb-5 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[0.78rem] font-bold text-content-secondary">Día</span>
            {DAYS_SHORT.map((short, i) => {
              const d = i as DayIndex
              const active = d === dayIdx
              return (
                <button
                  key={short}
                  type="button"
                  aria-label={DAYS[d]}
                  aria-pressed={active}
                  onClick={() => setDayOverride(d)}
                  className={cn(
                    'h-9 w-9 rounded-pill text-[0.8rem] font-bold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    active
                      ? 'bg-brand text-content-inverted'
                      : 'bg-surface text-content-secondary hover:text-content-primary',
                  )}
                >
                  {short}
                </button>
              )
            })}
            {dayIdx === needSummary.peak.day && (
              <Badge tone="warning">El día que más aprieta</Badge>
            )}
          </div>

          <DayCurve
            covers={lagged[dayIdx]}
            people={peopleGrid[dayIdx]}
            openBlocks={hours?.[dayIdx]}
            dayLabel={DAYS[dayIdx]}
            height={220}
          />
        </div>

        <div className="border-t border-border-soft px-4 py-5 sm:px-6">
          <WeekHeatmap grid={peopleGrid} mode="people" openBlocks={hours ?? undefined} height={430} />
        </div>
      </Card>

      {/* ── 4 bis. ¿Cuadra? ───────────────────────────────────── */}
      {/* Antes del cuadrante a propósito: si algo incumple, que se sepa antes
          de ponerse a leer nombres y horas. */}
      <Card>
        <CardHeader
          eyebrow="La revisión"
          title={
            <>
              Lo que hay que <span className="text-brand italic">mirar antes de firmarlo.</span>
            </>
          }
          subtitle="Descansos, libranzas y horas de contrato, revisados uno a uno sobre el cuadrante de abajo."
        />
        <div className="border-t border-border-soft px-4 py-5 sm:px-6">
          <AvisosCuadrante avisos={avisos} />
        </div>

        {metricas.comensalesPorHora !== null && (
          <div className="grid gap-5 border-t border-border-soft px-6 py-5 sm:grid-cols-3">
            <Stat
              icon={<Users size={13} strokeWidth={2.6} />}
              label="Comensales por hora"
              value={nf1.format(metricas.comensalesPorHora)}
              hint="Por cada hora de trabajo pagada"
            />
            <Stat
              icon={
                <InfoTip title="Dónde sobra gente">
                  La holgura total no se puede accionar; saber la franja concreta sí. Estas son
                  las horas donde hay más gente puesta de la que pide tu curva.
                </InfoTip>
              }
              label="Franja con más sobra"
              value={
                metricas.peoresHolguras[0]
                  ? `${nf1.format(metricas.peoresHolguras[0].horasSobrantes)} h`
                  : '—'
              }
              hint={metricas.peoresHolguras[0]?.cuando ?? 'Nada que recortar'}
              tone={metricas.peoresHolguras[0] ? 'warning' : 'default'}
            />
            <Stat
              icon={
                <InfoTip title="Reparto de fines de semana">
                  La diferencia entre quien más findes trabaja y quien menos. Es lo que hace que
                  un cuadrante se perciba justo, y de lo que más se habla en una plantilla.
                </InfoTip>
              }
              label="Diferencia de findes"
              value={metricas.desequilibrioFindes}
              hint={
                metricas.desequilibrioFindes <= 1
                  ? 'Repartido de forma pareja'
                  : 'Hay quien carga con más findes'
              }
              tone={metricas.desequilibrioFindes <= 1 ? 'default' : 'warning'}
            />
          </div>
        )}

        {metricas.peoresHolguras.length > 1 && (
          <div className="border-t border-border-soft px-6 py-5">
            <h4 className="h4">Dónde sobra gente</h4>
            <ul className="mt-3 space-y-1.5">
              {metricas.peoresHolguras.map((h) => (
                <li
                  key={`${h.day}-${h.slot}`}
                  className="flex items-baseline justify-between gap-3 text-[0.88rem]"
                >
                  <span className="text-content-secondary">{h.cuando}</span>
                  <span className="shrink-0 font-bold tabular-nums text-content-primary">
                    {nf1.format(h.horasSobrantes)} h de más
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* ── 5. El cuadrante ───────────────────────────────────── */}
      {/* Marcador de 0 px: el teaser de cuenta dispara cuando ESTE punto
          cruza el centro de la pantalla, no cuando el cuadrante entero
          (que puede medir miles de píxeles) está a la vista. */}
      <div ref={rosterSectionRef} aria-hidden="true" />
      <RosterGrid
        roster={roster}
        model={model}
        needGrid={needGrid}
        openBlocks={hours ?? undefined}
        onRenamePerson={p.setPersonName}
      />

      {/* ── 6. Los picos → Shifty ─────────────────────────────── */}
      <section className="rounded-card bg-brand px-6 py-10 shadow-lg sm:px-10 sm:py-12">
        <EyebrowInverted>Los picos</EyebrowInverted>

        {peakWeekCount > 0 ? (
          <>
            <h2 className="mt-4 max-w-3xl text-[1.7rem] leading-[1.12] font-extrabold tracking-[-0.028em] text-content-inverted sm:text-[2.2rem]">
              {peakWeekCount} {plural(peakWeekCount, 'semana', 'semanas')} al año{' '}
              <span className="text-content-inverted/70 italic">se salen de tu plantilla.</span>
            </h2>

            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              <div>
                <div className="text-[2.4rem] leading-none font-black text-content-inverted tnum">
                  {peakWeekCount}
                </div>
                <div className="mt-1.5 text-[0.85rem] leading-snug font-semibold text-content-inverted/70">
                  {plural(peakWeekCount, 'semana', 'semanas')} por encima de tu línea, de las{' '}
                  {weeks.length} del año
                </div>
              </div>
              <div>
                <div className="text-[2.4rem] leading-none font-black text-content-inverted tnum">
                  {nf.format(peaks.peakHoursPerYear)}
                </div>
                <div className="mt-1.5 text-[0.85rem] leading-snug font-semibold text-content-inverted/70">
                  horas-persona que esas semanas piden de más
                </div>
              </div>
              <div>
                <div className="text-[2.4rem] leading-none font-black text-content-inverted tnum">
                  +{extraPeopleIfHired}
                </div>
                <div className="mt-1.5 text-[0.85rem] leading-snug font-semibold text-content-inverted/70">
                  {plural(extraPeopleIfHired, 'persona', 'personas')} en nómina si decidieras
                  contratarlas
                </div>
              </div>
            </div>

            <p className="mt-8 max-w-2xl text-[1rem] leading-relaxed font-medium text-content-inverted/85">
              Y este es el punto: esas {extraPeopleIfHired}{' '}
              {plural(extraPeopleIfHired, 'persona', 'personas')} cobrarían las {weeks.length}{' '}
              semanas del año, no solo las {peakWeekCount} en las que hacen falta. Pagas{' '}
              {weeks.length} semanas de sueldo para cubrir {peakWeekCount}
              {peaks.worstWeek ? (
                <>
                  {' '}
                  — y ni siquiera van sobradas: la semana {peaks.worstWeek.isoWeek} sola se lleva{' '}
                  {nf.format(peaks.worstWeek.extraHours)} horas de más
                </>
              ) : null}
              .
            </p>

            {avgHourlyCost !== null && peakHiredAnnualCostEur !== null && peakOnlyAnnualCostEur !== null && (
              <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed font-medium text-content-inverted/85">
                Al coste medio de tu plantilla, {eur.format(avgHourlyCost)}/h, contratar esa gente
                fija son{' '}
                <strong className="text-content-inverted">{eur.format(peakHiredAnnualCostEur)} al año</strong>
                . Cubrir solo esas horas de pico, en cambio, son{' '}
                <strong className="text-content-inverted">{eur.format(peakOnlyAnnualCostEur)}</strong>.
              </p>
            )}

            <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed font-medium text-content-inverted/85">
              Los picos no se contratan, se cubren. Para eso existe Shifty: personal de hostelería
              con experiencia, por horas, el día que lo necesitas y solo ese día.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-4 max-w-3xl text-[1.7rem] leading-[1.12] font-extrabold tracking-[-0.028em] text-content-inverted sm:text-[2.2rem]">
              No dejas ninguna semana fuera.{' '}
              <span className="text-content-inverted/70 italic">Y eso también se paga.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-[1rem] leading-relaxed font-medium text-content-inverted/85">
              Al {settings.coveragePct}% estás dimensionando para tu peor semana las {weeks.length}{' '}
              del año. Baja la línea y mira cuánta plantilla te ahorras: las semanas que se queden
              arriba se cubren con extras, que es exactamente para lo que existe Shifty.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="https://shifty.es"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-surface-elevated px-7',
              'text-[0.95rem] font-bold text-brand transition-transform duration-150 hover:scale-[1.02] active:scale-[.98]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverted',
            )}
          >
            Ver cómo funciona Shifty
            <ArrowUpRight size={17} strokeWidth={2.6} />
          </a>
          <span className="text-[0.82rem] font-semibold text-content-inverted/70">
            Sin cuota fija. Pagas las horas que cubres.
          </span>
        </div>
      </section>

      {/* ── 7. Acciones finales ───────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={15} />}
            onClick={handleDownloadReport}
          >
            Descargar informe
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Table2 size={15} />}
            onClick={() => downloadPlanCsv(exportInput)}
          >
            Exportar todo (CSV)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Save size={15} />}
            onClick={p.exportSnapshot}
          >
            Guardar en un fichero
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<LinkIcon size={15} />}
            onClick={() => void copiarEnlace()}
          >
            {enlaceCopiado ? 'Enlace copiado' : 'Copiar enlace'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Gauge size={15} />}
            onClick={() => setShowCriteria(true)}
          >
            Revisar algún criterio
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={15} />}
          onClick={() => setAskReset(true)}
        >
          Empezar de nuevo
        </Button>
      </div>

      <Modal
        open={askReset}
        onClose={() => setAskReset(false)}
        title="¿Empezar de nuevo?"
        subtitle="Se borra todo lo que has hecho en esta sesión."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskReset(false)}>
              Seguir aquí
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setAskReset(false)
                p.reset()
              }}
            >
              Sí, empezar de nuevo
            </Button>
          </>
        }
      >
        <p className="text-[0.9rem] leading-relaxed text-content-secondary">
          Vuelves a la primera pantalla: se descarta el histórico cargado y los tramos, los puestos
          y los ajustes vuelven a los valores de partida. No hay deshacer, y esta herramienta no
          guarda nada en ningún sitio.
        </p>
      </Modal>

      <CriteriaModal
        open={showCriteria}
        onClose={() => setShowCriteria(false)}
        criteria={criteria}
        onGo={(step) => p.setStep(step)}
      />

      <AccountTeaserModal open={showAccountTeaser} onClose={() => setShowAccountTeaser(false)} />
    </div>
  )
}
