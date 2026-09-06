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
  ChevronDown,
  RotateCcw,
  Save,
  Table2,
  Users,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, InfoTip, Modal, Note, NumberInput, Stat, cn } from '@/components/ui'
import { CuentaModal } from '@/components/CuentaModal'
import { AvisosCuadrante } from '@/components/AvisosCuadrante'
import { CriteriaModal, type Criterion } from '@/components/CriteriaModal'
import { RosterGrid } from '@/components/RosterGrid'
import { StaffTable } from '@/components/StaffTable'
import { SubNav, SubProgress } from '@/components/SubSteps'
import { DayCurve } from '@/components/charts/DayCurve'
import { WeekHeatmap } from '@/components/charts/WeekHeatmap'
import { YearChart } from '@/components/charts/YearChart'
import { usePlanner } from '@/hooks/usePlanner'
import { WEEKS_PER_YEAR, describeMix, fteFrom, summarizeCost } from '@/lib/contracts'
import { riskRatio } from '@/lib/demand'
import { comprobacionesHechas, revisarCuadrante } from '@/lib/avisos'
import { calcularMetricas } from '@/lib/metricas'
import { urlDelPlan } from '@/lib/compartir'
import { downloadPlanCsv } from '@/lib/export'
import { downloadReport } from '@/lib/report'
import { DAYS, DAYS_SHORT, formatSlot } from '@/lib/time'
import type { DayIndex } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES')
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
// `useGrouping`: en es-ES, sin esto, un número de cuatro cifras sale
// sin punto de millar ("7650 €") y al lado de uno de seis que sí lo lleva
// parece un error de la herramienta.
const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: true,
})

/**
 * La pantalla de resultado, partida en cinco.
 *
 * Antes era un scroll de 1.200 líneas con nueve secciones seguidas, y la queja
 * de Crescente fue literal: "hay muchísima información". Es el mismo patrón que
 * ya usa el paso de demanda y que pide el principio 6 del proyecto: un paso con
 * varias preguntas distintas se parte en sub-pasos con su propio progreso.
 *
 * El orden cuenta una historia: cuánta gente → por qué esa y no otra → quién
 * trabaja cuándo → lo que no cubre la plantilla fija → llévatelo.
 */
const RESULT_SUBSTEPS = [
  { id: 'plantilla', label: 'Tu plantilla' },
  { id: 'porque', label: 'Por qué' },
  { id: 'cuadrante', label: 'El cuadrante' },
  { id: 'picos', label: 'Los picos' },
  { id: 'llevatelo', label: 'Llévatelo' },
]

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
  const [sub, setSub] = useState(0)
  const [verPorArea, setVerPorArea] = useState(false)

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

  // Igual que al cambiar de paso principal (ver App.tsx) y que en el paso de
  // demanda: moverse de sub-paso no puede dejar al usuario a mitad de la
  // pantalla anterior, que es peor que no haberla partido.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [sub])

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
    // `sub` en las dependencias, y no vacío: el marcador solo existe cuando se
    // está viendo el sub-paso del cuadrante. Con la lista vacía el efecto corre
    // una vez al montar, cuando `sub` es 0 y el marcador todavía no está en la
    // pantalla, sale por el `if (!el) return` y el modal no aparecía nunca.
  }, [sub])

  const { plan, roster, needGrid, needSummary, coverage, peaks, peopleGrid, lagged } = p

  if (!plan || !roster || !needGrid || !needSummary || !coverage || !peaks || !peopleGrid || !lagged) {
    return (
      <Card className="px-6 py-16 text-center">
        <h2 className="text-[1.5rem] leading-tight font-extrabold tracking-[-0.028em] text-content-primary">
          Todavía no hay <span className="text-brand italic">nada que calcular.</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-content-secondary">
          Necesitamos tu histórico de comensales para sacar la plantilla. Sube tu fichero y vuelve
          aquí.
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
  // Un único punto de corte para todo el dinero de la pantalla: si el usuario
  // no ha encendido los costes, `cost` es null y a partir de ahí no hay coste
  // semanal, ni anual, ni ratio sobre ventas, ni precio de los picos. Apagarlo
  // en cada sitio por separado es como se acaba colando un euro suelto en una
  // pantalla que prometía no hablar de dinero.
  const cost = (settings.calcularCostes ?? false) ? summarizeCost(roster, model) : null
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
  const comprobaciones = comprobacionesHechas(settings)
  /** Cuántas personas del cuadrante tienen ya un nombre de verdad puesto. */
  const conNombre = roster.people.filter(
    (per) => (p.personNames[per.id] ?? '').trim().length > 0,
  ).length
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
      <SubProgress steps={RESULT_SUBSTEPS} index={sub} onGo={setSub} />

      {/* ══ sub-paso 0: plantilla ══ */}
      {sub === 0 && (
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

        {/* El mismo botón está abajo del todo, en "Llévatelo". Se repite a
            propósito: la página mide casi 5.000 px y quien solo quiere el PDF
            no tiene por qué recorrerla entera. Lo que no puede pasar es que se
            llamen distinto, que es lo que hacía dudar de si eran dos cosas. */}
        <div className="mt-5">
          <Button
            variant="secondary"
            icon={<Download size={17} strokeWidth={2.3} />}
            onClick={handleDownloadReport}
          >
            Descargar el informe
          </Button>
        </div>
      </section>

      {/* ── 2 bis. La plantilla, puesto por jornada ───────────── */}
      <StaffTable
        roster={roster}
        model={model}
        contracts={settings.contracts}
        conCostes={settings.calcularCostes ?? false}
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
        <div>
          {/* Plegadas: las filas son las mismas de la tabla de arriba,
              repartidas. Útiles para quien contrata solo un área, ruido para
              todos los demás. */}
          <button
            type="button"
            onClick={() => setVerPorArea((v) => !v)}
            aria-expanded={verPorArea}
            className={cn(
              'flex w-full items-center gap-2 rounded-card border border-border-soft bg-surface-elevated px-6 py-4',
              'text-left text-[0.9rem] font-bold text-content-primary transition-colors hover:bg-surface',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            )}
          >
            <ChevronDown
              size={17}
              className={cn('shrink-0 text-content-muted transition-transform', verPorArea && 'rotate-180')}
            />
            {verPorArea ? 'Ocultar el desglose por área' : 'Ver la plantilla de cada área por separado'}
          </button>

          {verPorArea && (
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              {model.blocks.map((b) => (
                <StaffTable
                  key={b.id}
                  roster={roster}
                  model={model}
                  contracts={settings.contracts}
                  conCostes={settings.calcularCostes ?? false}
                  blockId={b.id}
                  eyebrow={`Plantilla ${b.name.toLowerCase()}`}
                  title={<>{b.name}</>}
                />
              ))}
            </div>
          )}
        </div>
      )}

      </div>
      )}

      {/* ══ sub-paso 1: porque ══ */}
      {sub === 1 && (
      <div className="space-y-6">
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
                Qué estás priorizando
                <InfoTip title="De dónde sale este equilibrio">
                  Elegir un percentil es elegir un equilibrio entre dos errores: quedarte corto y
                  que te sobre gente. El percentil {settings.coveragePct} equivale a decir que el
                  primero te duele {nf1.format(ratio)} veces más que el segundo. Es el cálculo clásico
                  de cuánto stock pedir cuando la demanda es irregular.
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

          {/* El tercer motivo, que faltaba y hacía que las últimas personas
              parecieran holgura del cálculo. Con los datos de ejemplo el pico
              pide 17 y salen 19: las dos que sobran son las que hacen falta
              para cubrir todos los días de la semana, porque nadie trabaja
              siete. Sin decirlo, un usuario que sabe sumar cree que sobran. */}
          {plan.drivers.peopleFromDays > plan.drivers.peopleFromPeak && (
            <Note tone="neutral">
              <span className="font-bold text-content-primary">
                Y el calendario pone {plan.drivers.peopleFromDays - plan.drivers.peopleFromPeak}{' '}
                {plural(plan.drivers.peopleFromDays - plan.drivers.peopleFromPeak, 'más', 'más')}.
              </span>{' '}
              Por el pico bastarían {plan.drivers.peopleFromPeak}, pero nadie trabaja los siete
              días: hay puestos con más turnos a la semana de los que cabe hacer{' '}
              {settings.consecutiveDaysOff ? 'en cinco días' : 'en seis días'}, y por eso hace
              falta alguien más aunque nunca coincidan todos a la vez.{' '}
              <strong className="text-content-primary">
                {plan.totalPeople} es el mínimo con tus reglas.
              </strong>{' '}
              Para bajarlo hay que tocar las reglas, no el cálculo: quitar las dos libranzas
              seguidas o permitir jornada partida, en el paso de equipo.
            </Note>
          )}

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
                  {cost && !cost.complete && (
                    <>
                      {' '}
                      <strong className="text-warning">
                        Ojo: falta el coste de {cost.missing.join(', ')}, así que el porcentaje
                        real es mayor.
                      </strong>
                    </>
                  )}
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

      </div>
      )}

      {/* ══ sub-paso 2: cuadrante ══ */}
      {sub === 2 && (
      <div className="space-y-6">
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
          subtitle="Descansos, libranzas y horas de contrato, revisados uno a uno sobre el cuadrante ya montado."
        />
        <div className="border-t border-border-soft px-4 py-5 sm:px-6">
          <AvisosCuadrante avisos={avisos} comprobaciones={comprobaciones} />
        </div>

        {metricas.comensalesPorHora !== null && (
          <div className="grid gap-5 border-t border-border-soft px-6 py-5 sm:grid-cols-3">
            <Stat
              icon={
                <InfoTip title="Contra qué se compara">
                  No hay una cifra buena universal: un menú del día y un restaurante de mantel
                  no se parecen en nada. Sirve contra ti mismo — vuelve a calcularlo dentro de
                  tres meses, o con la línea de cobertura en otro sitio, y mira si sube.
                </InfoTip>
              }
              label="Comensales por hora"
              value={nf1.format(metricas.comensalesPorHora)}
              hint="Por cada hora de trabajo que pagas"
            />
            <Stat
              icon={
                <InfoTip title="Horas de más">
                  Horas que alguien está en el local por encima de lo que pide tu curva. No
                  sobran por error: son el precio de que los turnos tengan una duración
                  razonable y de que la gente entre y salga a horas de persona. Las tres
                  cifras cuadran: las horas que pide la curva más estas de más son las horas
                  que la gente pasa en el local. Abajo tienes dónde se concentran.
                </InfoTip>
              }
              label="Horas de más"
              value={`${nf1.format(metricas.horasSobrantesTotal)} h`}
              hint={
                metricas.horasSobrantesTotal > 0
                  ? `Sobre las ${nf1.format(metricas.horasEnTurnos)} h que la gente está en el local`
                  : 'Nada que recortar'
              }
              tone={metricas.horasSobrantesTotal > 0 ? 'warning' : 'default'}
            />
            <Stat
              icon={
                <InfoTip title="Reparto de fines de semana">
                  Cuántos días de finde trabaja quien más y quien menos. Es lo que hace que un
                  cuadrante se perciba justo, y de lo que más se habla en una plantilla.
                </InfoTip>
              }
              label="Findes: el que más y el que menos"
              value={
                metricas.findes.length > 0
                  ? `${metricas.findes[0].findesTrabajados} y ${metricas.findes[metricas.findes.length - 1].findesTrabajados}`
                  : '—'
              }
              hint={
                metricas.desequilibrioFindes <= 1
                  ? 'Repartido de forma pareja'
                  : `${metricas.desequilibrioFindes} días de diferencia entre unos y otros`
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

      {/* ── 6. El cuadrante ───────────────────────────────────── */}
      {/* Ya no va plegado: tiene pantalla propia. Estaba escondido tras un
          botón porque medía 9.000 px en un scroll que traía otras ocho
          secciones detrás; con la pantalla partida, ese motivo desapareció y
          esconderlo solo tapa la parte que Crescente quiere que se use. */}
      {/* La invitación a poner nombres, arriba del cuadrante y no escondida.
          Es lo que Crescente quiere que la gente use: con las etiquetas
          genéricas esto es un estudio que se mira una vez, y con los nombres
          de su gente es el cuadrante de la semana que viene, que se imprime y
          se manda. La barra de cuántos llevas es lo que convierte "puedes
          renombrar" en algo que se termina. */}
      <Card className="border-brand/25 bg-brand-light">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-6 py-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-[1.05rem] font-extrabold tracking-[-0.02em] text-brand">
              Ponle los nombres de tu gente
            </h3>
            <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-relaxed text-content-body">
              Doble clic en cualquier nombre del cuadrante y escribe el de verdad. Con los
              nombres puestos esto deja de ser un estudio y pasa a ser el cuadrante de la semana:
              lo descargas, lo cuelgas en cocina y le mandas a cada uno su turno por WhatsApp.
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[0.7rem] font-bold tracking-wide text-brand uppercase">
              Con nombre
            </div>
            <div className="mt-1 text-[1.6rem] leading-none font-black tracking-tight text-brand tnum">
              {conNombre} de {roster.people.length}
            </div>
            <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-pill bg-surface-elevated">
              <div
                className="h-full rounded-pill bg-brand transition-[width] duration-300 ease-out"
                style={{ width: `${roster.people.length ? (conNombre / roster.people.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Marcador para el teaser de cuenta: dispara al llegar aquí, que es
          donde el usuario empieza a poner nombres y el guardado pasa a valer
          algo. Lleva altura de verdad porque un elemento de 0 px es un objetivo
          dudoso para el observador. */}
      <div ref={rosterSectionRef} className="h-px w-full" aria-hidden="true" />

      <RosterGrid
        roster={roster}
        model={model}
        needGrid={needGrid}
        openBlocks={hours ?? undefined}
        onRenamePerson={p.setPersonName}
      />

      </div>
      )}

      {/* ══ sub-paso 3: picos ══ */}
      {sub === 3 && (
      <div className="space-y-6">
      {/* ── 5. Los picos → Shifty ─────────────────────────────── */}
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

      </div>
      )}

      {/* ══ sub-paso 4: llevatelo ══ */}
      {sub === 4 && (
      <div className="space-y-6">
      {/* ── 7. Llevárselo ─────────────────────────────────────── */}
      {/* Cinco botones iguales en fila no dejaban ver cuál era el importante.
          Arriba las dos cosas que de verdad hace la gente al terminar (bajarse
          el informe y mandárselo a alguien); debajo, y en pequeño, lo demás. */}
      <Card className="p-6">
        <h3 className="text-[1.05rem] font-extrabold tracking-[-0.02em] text-content-primary">
          Llévatelo
        </h3>

        {/* El estado del guardado, dicho. Con un guardado que ocurre solo, la
            unica senal de que el trabajo esta a salvo es la que le demos aqui, y
            callarse cuando falla es la peor de las opciones. */}
        {p.falloGuardado && (
          <div className="mt-3">
            <Note tone="warning">
              No hemos podido guardar este plan en el servidor. Lo tienes igualmente en este
              navegador y te lo puedes bajar en un fichero aquí abajo.{' '}
              <button
                type="button"
                onClick={() => void p.guardarEnServidor()}
                className="font-bold underline underline-offset-2"
              >
                Volver a intentarlo
              </button>
            </Note>
          </div>
        )}
        {!p.falloGuardado && p.planRemoto && (
          <p className="mt-2 text-[0.83rem] font-semibold text-success">
            {p.guardando ? 'Guardando…' : 'Guardado. Este plan tiene enlace propio.'}
          </p>
        )}
        <p className="mt-1 text-[0.86rem] leading-relaxed text-content-secondary">
          Nada de esto se guarda en ningún servidor. El enlace lleva el plan dentro, así que quien
          lo abra ve exactamente esto.
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button icon={<Download size={16} />} onClick={handleDownloadReport}>
            Descargar el informe
          </Button>
          <Button
            variant="secondary"
            icon={<LinkIcon size={16} />}
            onClick={() => void copiarEnlace()}
          >
            {enlaceCopiado ? 'Enlace copiado' : 'Copiar enlace'}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-border-soft pt-4">
          <Button
            variant="ghost"
            size="sm"
            icon={<Table2 size={15} />}
            onClick={() => downloadPlanCsv(exportInput)}
          >
            Exportar todo (CSV)
          </Button>
          <Button variant="ghost" size="sm" icon={<Save size={15} />} onClick={p.exportSnapshot}>
            Guardar en un fichero
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
      </Card>

      <div className="flex justify-end border-t border-border-soft pt-6">
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={15} />}
          onClick={() => setAskReset(true)}
        >
          Empezar de nuevo
        </Button>
      </div>
      </div>
      )}


      <SubNav
        index={sub}
        onBack={() => setSub((v) => Math.max(0, v - 1))}
        onNext={() => setSub((v) => Math.min(RESULT_SUBSTEPS.length - 1, v + 1))}
        nextLabel={
          sub < RESULT_SUBSTEPS.length - 1
            ? `Siguiente: ${RESULT_SUBSTEPS[sub + 1].label.toLowerCase()}`
            : 'Ya está'
        }
        nextDisabled={sub === RESULT_SUBSTEPS.length - 1}
      />

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
          y los ajustes vuelven a los valores de partida. Se borra también lo que hay guardado en
          este navegador, y no hay deshacer. Si quieres conservarlo, guárdatelo antes en un
          fichero.
        </p>
      </Modal>

      <CriteriaModal
        open={showCriteria}
        onClose={() => setShowCriteria(false)}
        criteria={criteria}
        onGo={(step) => p.setStep(step)}
      />

      <CuentaModal
        open={showAccountTeaser}
        onClose={() => setShowAccountTeaser(false)}
        onEntrado={p.reclamarEstePlan}
      />
    </div>
  )
}
