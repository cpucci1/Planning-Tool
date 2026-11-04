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
  CalendarDays,
  Clock,
  Download,
  FileText,
  Gauge,
  Layers,
  Link as LinkIcon,
  Printer,
  ChevronDown,
  RotateCcw,
  Save,
  Table2,
  Users,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, InfoTip, Modal, Note, NumberInput, Segmented, Stat, cn } from '@/components/ui'
import { CuentaModal } from '@/components/CuentaModal'
import { AvisosCuadrante } from '@/components/AvisosCuadrante'
import { CriteriaModal, type Criterion } from '@/components/CriteriaModal'
import { RosterGrid } from '@/components/RosterGrid'
import { StaffTable } from '@/components/StaffTable'
import { SubNav, SubProgress } from '@/components/SubSteps'
import { DayCurve } from '@/components/charts/DayCurve'
import { WeekHeatmap } from '@/components/charts/WeekHeatmap'
import { YearChart } from '@/components/charts/YearChart'
import { usePlanner, ventasDelFichero } from '@/hooks/usePlanner'
import { WEEKS_PER_YEAR, baseDeCoste, describeMix, fteFrom, jornadasTexto, summarizeCost, temporadaDelLocal } from '@/lib/contracts'
import {
  VOLUNTARIAS_PCT,
  bolsaComplementarias,
  coberturaAusencias,
  jornadasParaCubrir,
  picosConComplementarias,
  temporadaAlta,
  vacacionesEnSemanasFlojas,
} from '@/lib/ausencias'
import { esMando } from '@/lib/roster'
import { preparacionRecortada } from '@/lib/necesidad'
import { KITCHEN_BLOCK_ID } from '@/data/presets'
import { describirDuraciones, serviciosDelCobro } from '@/lib/demand'
import { comprobacionesHechas, revisarCuadrante } from '@/lib/avisos'
import { calcularMetricas, contarPartidas, fraseHorasDeMas } from '@/lib/metricas'
import { calcularRueda, primerLunesPublicable } from '@/lib/semana'
import { urlDelPlan } from '@/lib/compartir'
import { downloadCuadranteCsv, downloadPlanCsv } from '@/lib/export'
import { descargarCuadranteCocina } from '@/lib/cuadrante-imagen'
import { hayBackend } from '@/lib/supabase'
import { peakOf } from '@/lib/demand'
import { tramoSuperado } from '@/lib/staffing'
import { descargarInforme } from '@/lib/informe'
import type { InformeInput } from '@/lib/informe'
import { DAYS, DAYS_SHORT, formatSlot, slotStartMin } from '@/lib/time'
import type { DayIndex } from '@/lib/types'

const nf = new Intl.NumberFormat('es-ES', { useGrouping: true })
const nf1 = new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 1 })
// `useGrouping`: en es-ES, sin esto, un número de cuatro cifras sale
// sin punto de millar ("7650 €") y al lado de uno de seis que sí lo lleva
// parece un error de la herramienta.
const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: true,
})
/** Para precios por hora, que sin céntimos no se pueden comparar con 18,81. */
const eur2 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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
  { id: 'shifty', label: 'Con Shifty' },
  { id: 'llevatelo', label: 'Llévatelo' },
]

/** Coste de personal sobre ventas, con la Seguridad Social de la empresa dentro: sano hasta 30 %, alarma por encima de 35 %. */
const RATIO_SANO = 30
const RATIO_ALARMA = 35

/** "31 a 35, 1 y 2": semanas en rachas, para leerse de un vistazo. */
function rachas(semanas: number[]): string {
  const ord = [...new Set(semanas)].sort((a, b) => a - b)
  const trozos: string[] = []
  for (let i = 0; i < ord.length; i++) {
    let j = i
    while (j + 1 < ord.length && ord[j + 1] === ord[j] + 1) j++
    // Dos seguidas van sueltas, para que la "y" caiga en su sitio: "45, 47 y 48",
    // no "45 y 47, 48".
    if (j - i >= 2) trozos.push(`${ord[i]} a ${ord[j]}`)
    else if (j > i) trozos.push(`${ord[i]}`, `${ord[j]}`)
    else trozos.push(`${ord[i]}`)
    i = j
  }
  if (trozos.length <= 1) return trozos.join('')
  return `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}`
}

/** Cobertura mínima y máxima que se deja elegir con la línea. */
const MIN_PCT = 20
const MAX_PCT = 98

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/**
 * La etiqueta del "Siguiente:" va en minúscula porque va dentro de una frase,
 * pero Shifty es una marca y en minúscula queda como una errata. Se baja todo
 * menos las palabras que ya venían en mayúscula dentro de la etiqueta.
 */
function etiquetaSiguiente(label: string): string {
  return label
    .split(' ')
    .map((w, i) => (i > 0 && w[0] === w[0]?.toUpperCase() ? w : w.toLowerCase()))
    .join(' ')
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
  // Un solo porcentaje en toda la herramienta: sobre lo que pide el servicio,
  // el mismo que la frase de debajo (ronda 5, G1 de pantallas).
  const slackPct = plan.neededHours > 0 ? Math.round((plan.slackHours / plan.neededHours) * 100) : 0
  const partidas = roster ? contarPartidas(roster) : 0
  const fraseDeMas = plan.slackDesglose ? fraseHorasDeMas(plan.slackDesglose, plan.neededHours, settings) : null

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
  // Lo que hay que meter en nómina para la peor semana: la mayor entre la
  // gente de más a la vez y las jornadas que piden sus horas (ronda 5, G2 de
  // pantallas). Antes salía "2 personas fijas más" para 187 h que faltan.
  // Ronda 7 (G2 de cálculo): las personas, sus horas de contrato y la gente
  // de más a la vez son tres cifras distintas, y ninguna es "jornadas
  // completas". Las jornadas salen de las horas, con un decimal.
  const extraPeopleIfHired =
    peaks.worstWeek?.personasParaContratar ?? peaks.worstWeek?.extraPeople ?? peaks.avgExtraPeople
  /** Cuánta gente más coincide a la vez en el peor momento de esa semana, frente a una semana normal. */
  const extraALaVez = peaks.worstWeek?.extraPeople ?? null
  /** Horas de contrato a la semana que sumarían esas personas: lo que se paga todo el año. */
  const horasContratoPico = peaks.worstWeek?.horasContratoSemana ?? extraPeopleIfHired * 40
  const jornadasPico = peaks.worstWeek?.jornadasPorHoras ?? null
  /** "La semana más exigente pide 85 h más (unas 2,1 jornadas completas) y hasta 7 personas más a la vez". */
  const fraseSemanaPico = peaks.worstWeek
    ? `La semana más exigente pide ${nf.format(peaks.worstWeek.extraHours)} h más${jornadasPico !== null ? ` (${jornadasTexto(jornadasPico)})` : ''}${
        extraALaVez !== null && extraALaVez > 0
          ? ` y hasta ${extraALaVez} ${plural(extraALaVez, 'persona', 'personas')} más a la vez en su momento más fuerte`
          : ', sin más gente a la vez que una semana normal'
      }`
    : ''
  /**
   * Ronda 8 (M3): si la peor semana no pide más gente a la vez, el pico se
   * cubre con más horas de los mismos o con refuerzo, y contratar fijo es la
   * opción descartada. Antes el mismo bloque decía "son más horas, no más
   * gente" y debajo, en grande, "10 personas fijas más".
   */
  const picoSoloHoras = extraALaVez === 0
  const contratosPicoTexto = `${extraPeopleIfHired === 1 ? `un contrato de ${nf.format(horasContratoPico)} h` : `${extraPeopleIfHired} contratos que suman ${nf.format(horasContratoPico)} h`} a la semana`
  /** Semanas que se pagan al año: 52, o las abiertas en un local de temporada (ronda 5). */
  const temporadaLocal = temporadaDelLocal(specials)
  const semanasDePago = temporadaLocal.semanasDePago

  /**
   * Las semanas punta escritas una a una. Es la prueba de que la necesidad es
   * IRREGULAR — apunte del advisor de Crescente, 2026-09-18: el argumento no
   * es cuántas horas faltan, es que faltan en semanas sueltas repartidas por
   * el año, y eso no se cubre con una contratación.
   *
   * A partir de ocho se corta: una lista de treinta números deja de leerse y
   * pasa a ser ruido, y que la necesidad esté repartida ya se ve con seis.
   */
  const semanasPuntaTexto = (() => {
    const ns = peaks.peakWeeks
    if (ns.length === 0) return ''
    if (ns.length === 1) return `la semana ${ns[0]}`
    const visibles = ns.length > 8 ? ns.slice(0, 6) : ns.slice(0, -1)
    const resto = ns.length - visibles.length
    const cola = ns.length > 8 ? `y ${resto} más` : `y la ${ns[ns.length - 1]}`
    return `las semanas ${visibles.join(', ')} ${cola}`
  })()

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
  const cost = (settings.calcularCostes ?? false) ? summarizeCost(roster, model, settings, semanasDePago) : null
  /** Por cuánto se multiplica la cifra del catálogo para tener coste de empresa (1 en un plan de antes). */
  const factorCoste = baseDeCoste(settings).factor
  /** El coste de cada puesto, del mismo resumen que el total (con la nocturnidad). */
  // En euros enteros que suman el total (ronda 7, m6).
  const costePorPuesto = cost ? new Map(cost.byRole.map((r) => [r.roleId, r.weeklyEurEntero])) : undefined
  const weeklyCostEur = cost?.weeklyEur ?? null
  const annualCostEur = cost?.annualEur ?? null
  const avgHourlyCost = cost?.avgHourlyEur ?? null
  // Las semanas de pago, no las analizadas: a esa gente se le paga todo lo
  // que el local abre, que es justamente el argumento.
  const peakHiredAnnualCostEur = avgHourlyCost
    ? horasContratoPico * semanasDePago * avgHourlyCost
    : null
  // Peras con peras: la hora de un refuerzo se compara con lo que te cuesta
  // una hora TRABAJADA de tu gente (con Seguridad Social, vacaciones y
  // festivos), no con la hora de contrato, que esconde las semanas que se
  // pagan sin trabajarse.
  const costeHoraTrabajada = cost?.costeHoraTrabajadaEur ?? null
  const peakOnlyAnnualCostEur = costeHoraTrabajada ? peaks.peakHoursPerYear * costeHoraTrabajada : null

  /**
   * Cuando falta alguien (ronda 2, puntos 5, 6 y 26). El cuadrante es una semana
   * con todos presentes; en el año, cada persona falta unas siete semanas. Ver
   * `lib/ausencias.ts`.
   */
  const ausencias = coberturaAusencias(roster.people, settings, 40, semanasDePago, temporadaLocal.semanasCerradas)
  const horasServicioSemana = p.needSummaryDemand?.totalHours ?? needSummary.totalHours
  const horasFijasSemana = Math.max(0, needSummary.totalHours - horasServicioSemana)
  const flojas = vacacionesEnSemanasFlojas(weeks, coverage.threshold, horasServicioSemana, ausencias.horasVacaciones)
  const horasAusenciaTrasFlojas = Math.max(0, ausencias.horasACubrirAno - flojas.horasAbsorbidas)
  const jornadasTrasFlojas = jornadasParaCubrir(horasAusenciaTrasFlojas, ausencias.tiempo, 40, semanasDePago)
  // Ronda 3: por HORAS a lo que cuesta una hora trabajada, la misma cifra que
  // se enseña en "Por qué" y en "Con Shifty". Antes iba por jornadas × 52
  // semanas, que mete además las bajas de quien cubre, y salía otro precio por
  // hora (17,88 frente a 16,81 con el ejemplo) para la misma plantilla.
  const costeAusenciasEur = costeHoraTrabajada !== null ? horasAusenciaTrasFlojas * costeHoraTrabajada : null
  /** El coste de cubrir las ausencias, por semana: entra en el ratio sobre ventas. */
  const costeAusenciasSemanaEur = costeAusenciasEur !== null ? costeAusenciasEur / semanasDePago : null
  // Las semanas del calendario, no las que quedan en el análisis (ronda 5,
  // m2): con 48 semanas usables, la racha 46 a 49 no se reconocía.
  const temporada = temporadaAlta(peaks.peakWeeks, Math.max(WEEKS_PER_YEAR, ...weeks.map((w) => w.isoWeek)))
  /** Cuántas veces el bruto por hora de contrato cuesta una hora trabajada: Seguridad Social y semanas pagadas sin trabajar. */
  // Con `factorCoste`, y no con la cotización a pelo: si el catálogo ya es
  // coste de empresa, sumarle la Seguridad Social otra vez la contaba dos veces.
  const multiplicadorHoraTrabajada = factorCoste * (WEEKS_PER_YEAR / ausencias.tiempo.semanasTrabajadas)
  /** Las horas complementarias de los parciales, el escalón antes de contratar o pedir extras (punto 23). */
  const bolsa = bolsaComplementarias(
    roster.people.filter((per) => !esMando(model.roles.find((r) => r.id === per.roleId))),
    settings,
  )
  const picosBolsa = picosConComplementarias(peaks.extraHoursByWeek ?? [], bolsa.horasSemana)
  /**
   * Las horas de los picos con una sola cuenta en todas las pantallas (ronda 3,
   * punto 3): las que faltan en las semanas punta, las que pueden hacer los
   * parciales con sus complementarias y las que quedan de refuerzo. Antes "Los
   * picos" decía 870, la tarjeta de complementarias 549 de 870, y "Con Shifty"
   * volvía a vender 870 como si los parciales no existieran.
   */
  const horasFaltanPicos = peaks.peakHoursPerYear
  const horasRefuerzo = Math.min(horasFaltanPicos, Math.round(picosBolsa.restantes))
  const horasComplementariasPicos = horasFaltanPicos - horasRefuerzo

  /**
   * ¿El hueco de "dónde sobra gente" empieza antes de abrir? Entonces es la
   * preparación, y hay que decirlo: si no, "el sábado de 12:00 a 14:00" parece
   * contradecir que el sábado a las 14:00 es el pico (ronda 3, punto 11).
   */
  const fueraDeHorario = (day: DayIndex, slot: number): boolean => {
    const bloques = hours?.[day] ?? []
    const t = slotStartMin(slot)
    return bloques.length > 0 && !bloques.some((b) => t >= b.startMin && t < b.endMin)
  }

  /** La revisión legal del cuadrante y las métricas que salen de él. */
  const avisos = revisarCuadrante(roster, model, settings, {
    preparacionRecortada: preparacionRecortada(hours ?? null, p.kitchenHours, KITCHEN_BLOCK_ID, settings, model),
  })
  const tramoCorto = (() => {
    if (!p.seated) return null
    const pico = peakOf(p.seated)
    const sup = tramoSuperado(model.tiers, pico.value)
    return sup ? { pico: pico.value, hasta: sup.hasta } : null
  })()
  const comprobaciones = comprobacionesHechas(settings, roster.mandos, model.roles)
  /** Cuántas personas del cuadrante tienen ya un nombre de verdad puesto. */
  const conNombre = roster.people.filter(
    (per) => (p.personNames[per.id] ?? '').trim().length > 0,
  ).length
  /** La rueda de semanas: quién hace qué semana del cuadrante (lib/semana.ts). */
  const rueda = calcularRueda(roster, settings)
  const metricas = calcularMetricas(roster, needGrid, model, lagged, rueda)
  /** Quien se queda sin ningún finde porque su semana no rota: hay que decirlo, no esconderlo. */
  const findesSinRueda = metricas.findes.filter(
    (f) => f.findesTrabajados === 0 && !rueda.grupos.some((g) => g.personIds.includes(f.personId)),
  ).length

  /** Coste de personal sobre ventas. Solo si él ha puesto las dos cifras. */
  // Ronda 3 (revisión del cálculo, M1): el ratio va con el coste COMPLETO, el
  // de la plantilla más el de cubrir sus vacaciones, festivos y bajas. Es el
  // que se compara con las bandas del sector; el de solo la plantilla se dice
  // al lado para que se vea de dónde sale.
  const costeCompletoSemanaEur = weeklyCostEur !== null ? weeklyCostEur + (costeAusenciasSemanaEur ?? 0) : null
  const ventasFichero = p.dataset ? ventasDelFichero(p.dataset) : null
  /** Con los datos de ejemplo no hay fichero del que hablar (revisión ronda 5, m8). */
  const esDemo = p.dataset?.source.isDemo ?? false
  const semanasConVentas = (p.dataset?.source as { semanasConVentas?: number } | undefined)?.semanasConVentas ?? 0
  /** Ronda 8 (lectura), m5: la lectura ya da las ventas sin IVA y dice si lo ha quitado. */
  // `undefined` = un plan leído antes de la ronda 8, con las ventas tal cual venían.
  const ivaQuitado = (p.dataset?.source as { ivaDescontado?: number | null } | undefined)?.ivaDescontado
  const ventasSemana = settings.weeklySalesEur && settings.weeklySalesEur > 0 ? settings.weeklySalesEur : null
  const ratioPersonal =
    costeCompletoSemanaEur !== null && ventasSemana !== null ? Math.round((costeCompletoSemanaEur / ventasSemana) * 100) : null
  const ratioSoloPlantilla =
    weeklyCostEur !== null && ventasSemana !== null ? Math.round((weeklyCostEur / ventasSemana) * 100) : null
  // Bandas con cargas sociales incluidas, que es lo que ahora se compara: sano
  // entre el 25 y el 30 %, alarma por encima del 35 % (guías de plan de negocio
  // de restauración citadas en la investigación del 2026-11-04). Las de antes
  // (32 y 40) eran para el sueldo sin Seguridad Social.
  const ratioTono =
    ratioPersonal === null
      ? ''
      : ratioPersonal <= RATIO_SANO
        ? 'text-success'
        : ratioPersonal <= RATIO_ALARMA
          ? 'text-warning'
          : 'text-destructive'

  /** Todo lo que ha entrado en el cálculo, para el modal de criterios (7.8). */
  const criteria: Criterion[] = [
    { label: 'Cobertura', value: `${settings.coveragePct}%`, step: 'result', where: 'Tu plan, Por qué: la línea del gráfico del año. También en Demanda, Tu año' },
    { label: 'Margen de seguridad', value: `${settings.safetyMarginPct}%`, step: 'demand', where: 'Demanda, pantalla de tu histórico' },
    { label: 'Dimensionado', value: settings.sizingMode === 'calibrado' ? 'Ajustado al histórico' : 'Con más margen', step: 'team', where: 'Equipo, ajustes avanzados' },
    settings.mealMinutes
      ? { label: 'Duración de cada estancia', value: describirDuraciones(settings.mealMinutes, serviciosDelCobro(lagged)), step: 'team', where: 'Equipo, encima de los tramos' }
      : { label: 'Adelanto respecto al cobro', value: `${settings.lagMinutes} min`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Turno más largo', value: `${settings.maxShiftMinutes / 60} h`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Turno más corto', value: `${settings.minShiftMinutes / 60} h`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Máximo de horas al día', value: `${(settings.maxDailyMinutes ?? 540) / 60} h`, step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Jornada partida', value: settings.allowSplitShifts ? 'Sí' : 'No', step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: 'Dos libranzas seguidas', value: settings.consecutiveDaysOff ? 'Sí' : 'No', step: 'team', where: 'Equipo, ajustes avanzados' },
    { label: '12 h de descanso', value: settings.minRestBetweenShifts ? 'Sí' : 'No', step: 'team', where: 'Equipo, ajustes avanzados' },
    {
      label: 'Contratos',
      value:
        (settings.contratosAMedida ?? true)
          ? `A medida, desde ${settings.minContractHours ?? 10} h`
          : settings.contracts.filter((c) => c.enabled).map((c) => c.label).join(', '),
      step: 'team',
      where: 'Equipo, ajustes avanzados',
    },
    {
      label: 'Mandos con horario',
      value:
        model.roles.filter((r) => r.kind === 'estructura' && (r.headcount ?? 0) > 0).map((r) => `${r.name} (${r.headcount})`).join(', ') || 'ninguno',
      step: 'import',
      where: 'Tus puestos',
    },
    // Entra en la lista porque explica el caso que más parece un error del
    // cálculo: un contrato de 40 h con nueve horas de turnos.
    {
      label: 'Solo jornada completa',
      value:
        model.roles.filter((r) => r.fullTimeOnly).length > 0
          ? model.roles.filter((r) => r.fullTimeOnly).map((r) => r.name).join(', ')
          : 'ningún puesto',
      step: 'demand',
      where: 'Demanda, catálogo de puestos',
    },
    ...model.blocks
      .filter((b) => (settings.minStaffByBlock[b.id] ?? 0) > 0)
      .map((b) => ({
        label: `Mínimo en ${b.name}`,
        value: `${settings.minStaffByBlock[b.id]} personas`,
        step: 'demand' as const,
        where: 'Demanda, pantalla de horario',
      })),
    ...model.blocks
      .filter((b) => {
        const pr = settings.prepByBlock?.[b.id]
        return !!pr && (pr.beforeMin > 0 || pr.afterMin > 0)
      })
      .map((b) => ({
        label: `Preparación en ${b.name}`,
        value: `${settings.prepByBlock?.[b.id]?.beforeMin ?? 0} min antes, ${settings.prepByBlock?.[b.id]?.afterMin ?? 0} después`,
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
    slackDesglose: plan.slackDesglose,
    semanasDePago,
    semanasCerradas: temporadaLocal.semanasCerradas,
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
   * Lo que se lleva el informe descargable, en cualquiera de sus dos versiones.
   *
   * Son los mismos objetos que ya pinta esta pantalla: el informe no recalcula
   * nada, así que el PDF y la pantalla no pueden contar cosas distintas. Se
   * arma en el cuerpo del componente y no dentro del handler para que
   * TypeScript siga viendo `plan`, `coverage` y compañía como no-nulos: dentro
   * de una función anidada esa comprobación ya no se conserva.
   */
  const informeInput: InformeInput = {
    fileName: p.dataset?.source.fileName ?? null,
    year: p.dataset?.year ?? new Date().getFullYear(),
    plan,
    roster,
    model,
    settings,
    needSummary,
    personNames: p.personNames,
    weeks,
    // La curva con la que se dimensiona: sentados a la vez, o en un plan de
    // antes, los cobros corregidos.
    typical: p.seated ?? lagged,
    hours: hours ?? null,
    kitchenHours: p.kitchenHours,
    specials,
    coveragePct: settings.coveragePct,
    weeksCovered: coverage.weeksCovered,
    peaks,
    extraPeopleIfHired,
    horasComplementariasPicos,
    horasRefuerzo,
    cost,
    ratioPersonal,
    costeAusenciasEur,
    weeklySalesEur: settings.weeklySalesEur ?? null,
    avisos,
    comprobaciones,
    metricas,
    criterios: criteria.map((c) => ({ label: c.label, value: c.value })),
  }
  /**
   * Copia el enlace de este plan. Hay dos, y se prefiere el corto.
   *
   * EL CORTO (`?plan=xxxxxxxxxxxx`) existe desde que hay servidor: son doce
   * caracteres que se pegan en un WhatsApp y se pueden dictar por teléfono. El
   * token solo da permiso para MIRAR; para escribir hace falta el secreto de
   * edición, que no sale de este navegador. Por eso enseñarle el plan a tu jefe
   * no le da permiso para borrarlo.
   *
   * EL LARGO lleva el plan entero comprimido dentro del `#`, la parte de la
   * dirección que el navegador NO envía a ningún servidor. Son unos 14.000
   * caracteres y hay clientes de correo que lo parten por la mitad, pero
   * funciona SIN backend, y por eso se queda: es el respaldo cuando el plan
   * todavía no se ha guardado o cuando el guardado ha fallado.
   */
  async function copiarEnlace() {
    if (p.planRemoto && !p.falloGuardado) {
      const corta = new URL(window.location.href)
      corta.hash = ''
      corta.search = ''
      corta.searchParams.set('plan', p.planRemoto.shareToken)
      await copiarAlPortapapeles(corta.toString())
      return
    }
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
    await copiarAlPortapapeles(url)
  }

  async function copiarAlPortapapeles(url: string) {
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
              del histórico con gente tuya.{' '}
              {plural(peakWeekCount, 'En la otra', `En las otras ${peakWeekCount}`)} necesitarás
              más gente, y para eso están los extras.
            </>
          ) : (
            <>
              Con esta plantilla cubres{' '}
              <strong className="font-bold text-content-primary">
                las {weeks.length} semanas del histórico
              </strong>{' '}
              sin pedir ayuda. Eso también quiere decir que has dimensionado la plantilla para la
              semana más exigente.
            </>
          )}
        </p>

        {/* AQUÍ NO HAY BOTÓN DE DESCARGA, Y ES A PROPÓSITO.
            Estuvo aquí arriba desde el 2026-09-05 para no obligar a recorrer
            una pantalla de 5.000 px. Crescente lo retiró el 2026-09-18: el
            informe se baja SOLO en el último sub-paso, "Llévatelo". Un botón de
            descarga en la primera pantalla invita a llevarse el plan antes de
            haber mirado de dónde sale, y quien se lo lleva así no vuelve. */}
      </section>

      {/* ── 2 bis. La plantilla, puesto por jornada ───────────── */}
      <StaffTable
        roster={roster}
        model={model}
        contracts={settings.contracts}
        conCostes={settings.calcularCostes ?? false}
        factorCoste={factorCoste}
        costePorPuesto={costePorPuesto}
        eyebrow="Plantilla total"
        title={
          <>
            Lo que tendrías que <span className="text-brand italic">contratar.</span>
          </>
        }
        subtitle={
          // Una sola cifra coherente (ronda 5): la tabla es la semana tipo con
          // todos presentes, y las ausencias del año piden más. Se dice aquí,
          // con la misma cifra de la tarjeta de ausencias, para que el titular
          // no diga 21 y más abajo aparezcan jornadas de más sin explicar.
          ausencias.jornadasExtra >= 0.05
            ? `Cada puesto con su desglose de jornada, para la semana tipo con todos presentes. Para cubrir vacaciones, festivos y bajas te harán falta además ${Math.round(ausencias.jornadasExtra * 10) / 10 === 1 ? '' : 'unas '}${jornadasTexto(ausencias.jornadasExtra)}, con gente tuya o con extras: lo ves en "Cuando falta alguien".`
            : 'Cada puesto con su desglose de jornada. Es la lista que necesitas para contratar.'
        }
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
                  factorCoste={factorCoste}
                  costePorPuesto={costePorPuesto}
                  blockId={b.id}
                  eyebrow={`Plantilla ${b.name.toLowerCase()}`}
                  title={<>{b.name}</>}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Cuando falta alguien (ronda 2, puntos 5, 6 y 26) ──────
          El cuadrante es una semana con todo el mundo presente. Sin esto,
          cualquier hostelero ve en el primer minuto que nadie se va nunca de
          vacaciones ni se pone malo. No cambia el número de personas de
          arriba: dice lo que una semana tipo no puede decir. */}
      <Card>
        <CardHeader
          eyebrow="Cuando falta alguien"
          title={
            <>
              Vacaciones, festivos y bajas{' '}
              <span className="text-brand italic">también hay que cubrirlos.</span>
            </>
          }
          subtitle={`El cuadrante es una semana con todos. En el año, cada persona trabaja unas ${nf1.format(ausencias.tiempo.semanasTrabajadas)} semanas de 52, y de ese tiempo un ${nf1.format(ausencias.parametros.bajasPct)} % se va en bajas.`}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border-soft px-6 py-4">
          {(
            [
              {
                key: 'vacacionesDias',
                label: 'Vacaciones',
                unidad: 'días naturales',
                value: ausencias.parametros.vacacionesDias,
                max: 60,
                info: 'Treinta días naturales al año como mínimo (art. 38 del Estatuto de los Trabajadores). Pon más si tu convenio da más.',
              },
              {
                key: 'festivosDias',
                label: 'Festivos',
                unidad: 'al año',
                value: ausencias.parametros.festivosDias,
                max: 20,
                info: 'Catorce festivos al año, dos de ellos locales (art. 37.2 ET). En hostelería se suelen trabajar y se compensan con un día libre: es un día más en que esa persona no está.',
              },
              {
                key: 'bajasPct',
                label: 'Bajas',
                unidad: '% del tiempo',
                value: ausencias.parametros.bajasPct,
                max: 30,
                info: 'El absentismo en hostelería ronda el 6,3 % (Randstad, 2025). Se aplica dividiendo por el tiempo disponible, no multiplicando: quien te cubre también se pone malo.',
              },
            ] as const
          ).map((f) => (
            <span key={f.key} className="flex items-center gap-2">
              <span className="text-[0.85rem] font-bold text-content-primary">{f.label}</span>
              <NumberInput
                value={f.value}
                onChange={(v) => p.setSettings((st) => ({ ...st, [f.key]: v }))}
                min={0}
                max={f.max}
                step={1}
                aria-label={`${f.label}, ${f.unidad}`}
                className="w-16"
              />
              <span className="text-[0.8rem] font-medium text-content-secondary">{f.unidad}</span>
              <InfoTip title={f.label}>{f.info}</InfoTip>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-5 border-t border-border-soft px-6 py-5 lg:grid-cols-3">
          <Stat
            icon={<Clock size={13} strokeWidth={2.6} />}
            label="Horas de ausencia que cubrir"
            value={`${nf.format(Math.round(ausencias.horasACubrirAno))} h`}
            hint={`${nf.format(Math.round(ausencias.horasVacaciones))} de vacaciones, ${nf.format(Math.round(ausencias.horasFestivos))} de festivos y ${nf.format(Math.round(ausencias.horasBajas))} de bajas${ausencias.vacacionesEnCierreDias > 0 ? `. Sin los ${ausencias.vacacionesEnCierreDias} días de vacaciones que se toman con el local cerrado` : ''}`}
            tone="brand"
          />
          <Stat
            icon={<Gauge size={13} strokeWidth={2.6} />}
            label="Cada semana, de media"
            value={`${nf1.format(ausencias.horasACubrirAno / semanasDePago)} h`}
            hint={`de las ${nf1.format(ausencias.horasTurnoSemana)} h en turnos que tiene tu cuadrante`}
          />
          <Stat
            icon={
              <InfoTip title="Por qué dividiendo">
                Cada persona está, de media, un {Math.round(ausencias.tiempo.fraccionPresente * 100)} %
                del año. Para tener las horas cubiertas hace falta dividir entre esa fracción, no sumar
                el porcentaje: la gente que contratas para cubrir también tiene vacaciones y bajas.
              </InfoTip>
            }
            label="Con plantilla propia"
            value={`${nf1.format(ausencias.jornadasExtra)}`}
            hint={plural(Math.round(ausencias.jornadasExtra * 10) / 10, 'jornada completa más', 'jornadas completas más')}
          />
        </div>

        {flojas.semanas.length > 0 && (
          <div className="border-t border-border-soft px-6 py-5">
            <Note tone="brand">
              <strong className="text-content-primary">Pon las vacaciones en tus semanas flojas.</strong>{' '}
              En las semanas {rachas(flojas.semanas)} el local pide menos gente que la de tu
              plantilla, y quien se va esas semanas no hace falta sustituirlo:{' '}
              {Math.round(flojas.horasAbsorbidas) >= Math.round(flojas.horasVacaciones) ? (
                <>te ahorras cubrir todas las {nf.format(Math.round(flojas.horasVacaciones))} h de vacaciones.</>
              ) : (
                <>
                  te ahorras cubrir unas {nf.format(Math.round(flojas.horasAbsorbidas))} de las{' '}
                  {nf.format(Math.round(flojas.horasVacaciones))} h de vacaciones.
                </>
              )} Lo que queda por cubrir
              baja a <strong>{nf.format(Math.round(horasAusenciaTrasFlojas))} h al año</strong>,{' '}
              {Math.round(jornadasTrasFlojas * 10) / 10 === 1 ? '' : 'unas '}{jornadasTexto(jornadasTrasFlojas)}
              {costeAusenciasEur !== null && costeHoraTrabajada !== null ? (
                <>
                  {' '}o {eur.format(costeAusenciasEur)} al año en coste de empresa, a{' '}
                  {eur2.format(costeHoraTrabajada)} la hora trabajada
                </>
              ) : null}
              .
              {/* Ronda 8 (m6): esa hora trabajada sale solo de los puestos con
                  precio. Las demás pantallas ya lo decían; esta no. */}
              {costeAusenciasEur !== null && cost && !cost.complete && (
                <strong className="text-warning">
                  {' '}Ojo: falta el coste de {cost.missing.join(', ')}, así que esas horas se valoran
                  con el precio medio de los demás puestos y la cifra no es exacta.
                </strong>
              )} Las vacaciones se fijan de acuerdo con cada persona y se tienen que saber con dos
              meses de antelación (art. 38 ET), así que esto se decide al hacer el calendario del año.
            </Note>
          </div>
        )}
      </Card>

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
              Tu semana tipo, <span className="text-brand italic">frente al histórico.</span>
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
              margenPct={settings.safetyMarginPct}
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
                Qué cambia al mover la línea
                <InfoTip title="Cómo leer esta decisión">
                  Subir la línea reduce el riesgo de quedarte corto, pero aumenta la plantilla
                  fija. Bajarla hace lo contrario: reduce el coste fijo y deja más horas para
                  cubrir con refuerzos.
                </InfoTip>
              </span>
              <p className="mt-1.5">
                Al {settings.coveragePct}%, tu plantilla fija cubre{' '}
                <strong>
                  {coverage.weeksCovered} de tus {weeks.length} semanas
                </strong>
                ; en las otras {Math.max(0, weeks.length - coverage.weeksCovered)} te faltará
                alguien en las horas punta. Sube la línea si quieres más cobertura fija; bájala si
                prefieres cubrir más picos con refuerzos.
              </p>
            </Note>

            {settings.sizingMode === 'conservador' && p.inflation && (
              <Note tone="warning">
                <strong>Has elegido más margen.</strong> La referencia se aplica a cada media hora
                por separado, así que tu semana tipo suma{' '}
                {nf.format(p.inflation.conservativeTotal)} comensales cuando una semana real de ese
                percentil son {nf.format(p.inflation.referenceTotal)}: un{' '}
                {Math.round(p.inflation.inflationPct)}% de demanda que nunca ocurre toda a la vez, y
                que acabas pagando en plantilla las {semanasDePago} semanas.
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => p.setSettings((s) => ({ ...s, sizingMode: 'calibrado' }))}
                  >
                    Ajustar al histórico
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
            subtitle="Personas y horas contratadas. La diferencia entre lo contratado y lo que pide el servicio son horas que pagas sin servicio."
        />

        <div className="grid grid-cols-2 gap-5 border-t border-border-soft px-6 py-5 lg:grid-cols-5">
          <Stat
            icon={<Users size={13} strokeWidth={2.6} />}
            label="Personas"
            value={plan.totalPeople}
            hint={mix}
            tone="brand"
          />
          <Stat
            icon={
              <InfoTip title="Equivalente en jornadas de 40 h">
                Las horas contratadas divididas entre una jornada de 40 h. Es el número que se
                compara entre locales, porque "{plan.totalPeople} personas" no dice nada si la mitad
                son de 15 horas.
              </InfoTip>
            }
            label="Equivalente en jornadas de 40 h"
            value={nf1.format(fte)}
            hint="A jornada de 40 h: un 20 h cuenta 0,5"
          />
          <Stat
            icon={<Clock size={13} strokeWidth={2.6} />}
            label="Horas contratadas"
            value={`${nf1.format(plan.contractedHours)} h`}
            hint={`El servicio necesita ${nf1.format(plan.neededHours)} h`}
          />
          <Stat
            icon={
              <InfoTip title="Horas pagadas sin servicio">
                Horas que pagas y que el servicio no pide. Salen de que los turnos no se cortan al
                minuto, de que nadie baja del turno más corto ni del contrato más pequeño, y de las
                horas de contrato que no llevan turno. Se pueden aprovechar para montar, limpiar o
                hacer pedidos, pero se pagan igual. Para bajarlas, baja el turno más corto o el
                contrato más pequeño en el paso anterior.
              </InfoTip>
            }
            label="Horas pagadas sin servicio"
            value={`${nf1.format(plan.slackHours)} h`}
            hint={
              plan.slackDesglose && plan.slackDesglose.sinTurno > 0.05
                ? `${nf1.format(plan.slackDesglose.enElLocal)} h en el local de más y ${nf1.format(plan.slackDesglose.sinTurno)} h de contrato sin turno`
                : `${slackPct} % más de lo que pide el servicio`
            }
            tone={plan.slackHours > plan.neededHours * 0.15 ? 'warning' : 'default'}
          />
          <Stat
            icon={
              <InfoTip title="Jornadas partidas">
                Días en que alguien hace comida y cena con un hueco en medio. Solo se parte una
                jornada cuando así hace falta una persona menos: si no ahorra a nadie, el turno va
                seguido.
              </InfoTip>
            }
            label="Jornadas partidas"
            value={partidas}
            hint={
              partidas === 0
                ? 'Todos los turnos van seguidos'
                : roster?.partidas && roster.partidas.personasAhorradas > 0
                  ? `a la semana: sin ellas harían falta ${roster.partidas.personasAhorradas} ${plural(roster.partidas.personasAhorradas, 'persona', 'personas')} más`
                  : 'a la semana'
            }
          />
        </div>

        {fraseDeMas && (
          <p className="border-t border-border-soft px-6 py-4 text-sm leading-relaxed text-content-secondary">
            {fraseDeMas}
          </p>
        )}

        <div className="border-t border-border-soft px-6 py-5">
          <Note tone="brand">
            Si solo dividieras las horas entre jornadas de 40 h, saldrían{' '}
            <strong>
              {nf1.format(plan.drivers.fteFromHours)}{' '}
              {plural(plan.drivers.fteFromHours, 'jornada completa', 'jornadas completas')}
            </strong>
            . La plantilla real es de {plan.totalPeople} {plural(plan.totalPeople, 'persona', 'personas')}
            {' '}porque manda el pico: el {DAYS[needSummary.peak.day].toLowerCase()} a las{' '}
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
          {/* De dónde sale cada persona, sumando exacto el total (ronda 3, G9). */}
          {plan.drivers.desglose && plan.totalPeople > plan.drivers.desglose.pico && (
            <Note tone="neutral">
              <span className="font-bold text-content-primary">
                {plan.totalPeople} {plural(plan.totalPeople, 'persona', 'personas')}:{' '}
                {listarPartes([
                  [plan.drivers.desglose.pico, 'por el pico'],
                  [plan.drivers.desglose.calendario, 'por el calendario'],
                  [plan.drivers.desglose.contratosYHorarios, 'porque los turnos no encajan al minuto'],
                  [plan.drivers.desglose.mandos, plural(plan.drivers.desglose.mandos, 'de mando', 'de mando')],
                ])}
                .
              </span>{' '}
              {(plan.drivers.desglose.picoQueCubreElMando ?? 0) > 0 &&
                `Del pico, ${plan.drivers.desglose.picoQueCubreElMando} ${
                  plan.drivers.desglose.picoQueCubreElMando === 1 ? 'plaza la hace' : 'plazas las hacen'
                } un mando mientras está (el encargado lleva la sala, el jefe de cocina cocina), así que no ${
                  plan.drivers.desglose.picoQueCubreElMando === 1 ? 'es una persona más' : 'son personas de más'
                }. `}
              {plan.drivers.desglose.calendario > 0 &&
                `El calendario pone gente porque nadie trabaja los siete días: hay puestos con más turnos de los que caben ${
                  settings.consecutiveDaysOff ? 'en cinco días' : 'en seis días'
                }. `}
              {plan.drivers.desglose.contratosYHorarios > 0 &&
                'Los turnos no encajan al minuto cuando un hueco es más corto que el turno más corto, o cuando comida y cena no caben en la misma jornada. '}
              {settings.consecutiveDaysOff && plan.drivers.desglose.calendario > 0
                ? 'Para bajar las del calendario, quita las dos libranzas seguidas en el paso de equipo. '
                : ''}
              {!settings.allowSplitShifts && plan.drivers.desglose.contratosYHorarios > 0
                ? 'Permitir jornada partida puede bajar las otras. '
                : ''}
              {!settings.allowSplitShifts && (roster?.shifts.length ?? 0) > 0
                ? 'Sin jornada partida, la comida y la cena las hacen personas distintas: por eso salen más personas y casi todas a tiempo parcial, y las horas de contrato suben mucho menos que el número de personas.'
                : ''}
            </Note>
          )}

          {/* El ratio con el que de verdad piensa un hostelero. Solo aparece si
              nos ha dicho lo que factura; si no, ni se menciona. */}
          {weeklyCostEur !== null && (
            <div className="mt-4 rounded-lg border border-border-soft bg-surface-alt p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[0.85rem] font-bold text-content-primary">
                  ¿Cuánto factura una semana normal, sin IVA?
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
                    placeholder="-"
                    aria-label="Ventas de una semana normal sin IVA, en euros"
                    className="w-28"
                  />
                  <span className="text-[0.85rem] font-bold text-content-secondary">€</span>
                </span>
                <InfoTip title="Para qué sirve">
                  Para calcular qué porcentaje de tus ventas se va en personal y poder compararlo
                  con otros periodos o centros.
                </InfoTip>
              </div>
              {ventasFichero !== null && (
                <p className="mt-2 text-[0.8rem] leading-relaxed text-content-muted">
                  {settings.weeklySalesEur === ventasFichero
                    ? `Sale de la columna de importe de tu fichero: lo que facturas en una semana normal, la del medio de tus ${nf.format(semanasConVentas)} semanas con ventas. ${ivaQuitado === undefined ? 'Si tu TPV da el importe con IVA, divídelo entre 1,10 (es quitarle un 9 %, no un 10 %) para que el porcentaje no salga más bajo de lo real.' : ivaQuitado !== null ? `Ya va sin IVA: tu fichero lo traía incluido y se ha dividido entre ${(1 + ivaQuitado).toLocaleString('es-ES', { minimumFractionDigits: 2 })}, para compararlo con tu cuenta de resultados. Si tu columna ya venía sin IVA, escribe aquí la cifra buena.` : 'Tu columna de importe venía sin IVA, así que va tal cual.'}`
                    : `Tu fichero da ${eur.format(ventasFichero)} en una semana normal; has puesto otra cifra y manda la tuya.`}
                </p>
              )}

              {ratioPersonal !== null && (
                <p className="mt-3 text-[0.9rem] leading-relaxed text-content-secondary">
                  Tu personal, en coste de empresa y contando quien cubre vacaciones, festivos y
                  bajas, se lleva el{' '}
                  <strong className={cn('text-[1.05rem]', ratioTono)}>{ratioPersonal} %</strong> de
                  lo que facturas sin IVA
                  {ratioSoloPlantilla !== null && ratioSoloPlantilla !== ratioPersonal
                    ? ` (el ${ratioSoloPlantilla} % con solo la plantilla del cuadrante)`
                    : ''}
                  .{' '}
                  {ratioPersonal < 25
                    ? `Por debajo de la banda habitual del sector (25 % a ${RATIO_SANO} %, con Seguridad Social): repasa que los precios por hora y las ventas sean de la misma semana.`
                    : ratioPersonal <= RATIO_SANO
                    ? `Contando la Seguridad Social, está en la banda sana del sector, entre el 25 % y el ${RATIO_SANO} %.`
                    : ratioPersonal <= RATIO_ALARMA
                      ? `Por encima de la banda sana (25 % a ${RATIO_SANO} %, con Seguridad Social), pero sin llegar a la alarma del ${RATIO_ALARMA} %.`
                      : `Por encima del ${RATIO_ALARMA} %, que es donde el sector enciende la alarma cuando cuenta la Seguridad Social.`}
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
              {cost.base === 'bruto' && cost.weeklyBrutoEur !== null ? (
                <>
                  Esta plantilla te cuesta{' '}
                  <strong className="text-content-primary">{eur.format(weeklyCostEur)} a la semana</strong>{' '}
                  y <strong className="text-content-primary">{eur.format(annualCostEur)} al año</strong>{' '}
                  en coste de empresa: {eur.format(cost.weeklyBrutoEur)} de sueldo bruto a la semana más
                  un {nf1.format(cost.cotizacionPct)} % de Seguridad Social,{' '}
                  {temporadaLocal.deTemporada
                    ? `las ${semanasDePago} semanas que abres, con la plantilla en fijo discontinuo, porque las vacaciones y los festivos de esas semanas también se pagan.`
                    : 'las 52 semanas, porque las vacaciones y los festivos también se pagan.'} Cada hora trabajada te sale por{' '}
                  <strong className="text-content-primary">{eur2.format(cost.costeHoraTrabajadaEur)}</strong>
                  , frente a {eur2.format(cost.avgHourlyEur / (1 + cost.cotizacionPct / 100))} de
                  sueldo bruto por hora de contrato.
                </>
              ) : (
                <>
                  Con los costes de empresa de tu catálogo, esta plantilla sale por{' '}
                  <strong className="text-content-primary">{eur.format(weeklyCostEur)} a la semana</strong>{' '}
                  y <strong className="text-content-primary">{eur.format(annualCostEur)} al año</strong>
                  {temporadaLocal.deTemporada ? `, contando las ${semanasDePago} semanas que abres con la plantilla en fijo discontinuo` : ''}
                  . Cada hora trabajada, contando que las vacaciones y los festivos se pagan sin
                  trabajarse, te sale por{' '}
                  <strong className="text-content-primary">{eur2.format(cost.costeHoraTrabajadaEur)}</strong>.
                </>
              )}
              {cost.nocturnidad.weeklyEur > 0 && (
                <>
                  {' '}
                  Lleva dentro {eur.format(cost.nocturnidad.weeklyEur)} a la semana de plus de
                  nocturnidad, el {nf1.format(cost.nocturnidad.pct)} % de{' '}
                  {nf1.format(cost.nocturnidad.horasSemana)} h entre las 22:00 y las 06:00.
                </>
              )}
              {!cost.complete && (
                <>
                  {' '}
                  Falta el coste de {cost.missing.join(', ')}, así que la cifra real es mayor.
                </>
              )}
            </p>
          )}

          {/* La nocturnidad (revisión del cálculo, M5): las horas de noche
              salen del cuadrante; el porcentaje lo pone quien sabe su convenio. */}
          {cost !== null && cost.nocturnidad.horasSemana > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.85rem] text-content-secondary">
              <span>
                Tu cuadrante tiene{' '}
                <strong className="text-content-primary">
                  {nf1.format(cost.nocturnidad.horasSemana)} h a la semana entre las 22:00 y las 06:00
                </strong>
                {cost.nocturnidad.pct > 0
                  ? '.'
                  : '. Si tu convenio paga plus de nocturnidad, ponlo aquí: hasta entonces no está sumado.'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-content-primary">Plus de nocturnidad</span>
                <NumberInput
                  value={settings.plusNocturnidadPct ?? 0}
                  onChange={(v) => p.setSettings((st) => ({ ...st, plusNocturnidadPct: v > 0 ? v : 0 }))}
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Plus de nocturnidad, en % sobre el sueldo bruto de la hora"
                  className="w-16"
                />
                <span>% sobre el bruto de la hora</span>
                <InfoTip title="Plus de nocturnidad">
                  Las horas entre las 22:00 y las 06:00 se pagan con el plus que fije tu convenio
                  (art. 36.2 ET); un 25 % es habitual. Algunos convenios no lo pagan si el local es
                  de noche por naturaleza. Lo sabes tú, por eso no lo ponemos.
                </InfoTip>
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-8 border-t border-border-soft px-6 py-5 md:grid-cols-2">
          <div>
            <h4 className="h4 flex items-center gap-2">
              Cómo se reparten los contratos
              <InfoTip title="Cómo se elige cada contrato">
                Primero se llena con jornadas completas y lo que queda se cubre con parciales.
                Después cada persona baja a un contrato con las horas que trabaja, para no pagar
                horas que nadie va a trabajar. Los mandos van a su jornada.
              </InfoTip>
            </h4>
            <ul className="mt-3 space-y-2.5">
              {plan.allocations.map((a) => {
                const label = settings.contracts.find((c) => c.id === a.contractId && c.hours === a.hours)?.label ?? `${a.hours}h`
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
                  {nf1.format(needSummary.totalHours)} h de trabajo necesarias a la semana
                  {horasFijasSemana > 0.25 ? (
                    <>
                      : {nf1.format(horasServicioSemana)} que suben y bajan con los comensales y{' '}
                      {nf1.format(horasFijasSemana)} fijas (preparar, recoger, trabajo fijo y mínimos
                      por zona), igual todas las semanas.
                    </>
                  ) : (
                    '.'
                  )}
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
          subtitle={
            p.seated
              ? 'La curva morada es la gente sentada a la vez; los escalones, cuántas personas hacen falta en cada franja, con la preparación y la recogida.'
              : 'La curva morada muestra los comensales; los escalones, cuántas personas hacen falta en cada franja.'
          }
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
            covers={(p.seated ?? lagged)[dayIdx]}
            people={peopleGrid[dayIdx]}
            openBlocks={hours?.[dayIdx]}
            dayLabel={DAYS[dayIdx]}
            height={220}
            {...(p.seated ? { coversUnit: 'sentados a la vez', coversLegend: 'Sentados a la vez' } : {})}
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
          {/* El mismo aviso que en Equipo (revisión de cálculo ronda 5, m6):
              un local más lleno que el último tramo saca gente de menos en
              sus horas punta, y aquí no se decía. */}
          {tramoCorto && (
            <div className="mb-4">
              <Note tone="warning">
                Tu local llega a {nf.format(tramoCorto.pico)} sentados a la vez y tu tabla de
                tramos está pensada hasta unos {nf.format(tramoCorto.hasta)}. Por encima se aplica
                el mismo equipo del último tramo, así que en tus horas más llenas puede salirte
                gente de menos. Añade un tramo más arriba en Equipo.
              </Note>
            </div>
          )}
          <AvisosCuadrante avisos={avisos} comprobaciones={comprobaciones} />
        </div>

        {metricas.comensalesPorHora !== null && (
          <div className="grid gap-5 border-t border-border-soft px-6 py-5 sm:grid-cols-3">
            <Stat
              icon={
                <InfoTip title="Contra qué se compara">
                  No hay una cifra buena universal: un menú del día y un restaurante de mantel
                  no se parecen en nada. Sirve contra ti mismo: vuelve a calcularlo dentro de
                  tres meses, o con la línea de cobertura en otro sitio, y mira si sube.
                </InfoTip>
              }
              label="Comensales por hora"
              value={nf1.format(metricas.comensalesPorHora)}
              hint="Por cada hora de trabajo que pagas"
            />
            <Stat
              icon={
                <InfoTip title="En turno sin servicio">
                  Horas que alguien está en el local, en su turno, por encima de lo que pide tu
                  curva. Son una parte de las horas pagadas sin servicio: el resto son horas de
                  contrato que no están en ningún turno. No
                  sobran por error: son el precio de que los turnos tengan una duración
                  razonable y de que la gente entre y salga a horas de persona. Las tres
                  cifras cuadran: las horas que pide la curva más estas de más son las horas
                  que la gente pasa en el local. Abajo tienes dónde se concentran.
                  <br />
                  <br />
                  Y son las horas que puedes destinar a las tareas auxiliares que no salen en el
                  cuadrante: montaje, limpieza, pedidos, inventario o formar a alguien nuevo.
                </InfoTip>
              }
              label="En turno sin servicio"
              value={`${nf1.format(metricas.horasSobrantesTotal)} h`}
              hint={
                metricas.horasSobrantesTotal > 0
                  ? plan.slackHours > metricas.horasSobrantesTotal + 0.25
                    ? `De las ${nf1.format(plan.slackHours)} h pagadas sin servicio; las otras ${nf1.format(plan.slackHours - metricas.horasSobrantesTotal)} son de contrato sin turno`
                    : `Sobre las ${nf1.format(metricas.horasEnTurnos)} h que la gente está en el local`
                  : 'Nada que recortar'
              }
              tone={metricas.horasSobrantesTotal > 0 ? 'warning' : 'default'}
            />
            <Stat
              icon={
                <InfoTip title="Reparto de fines de semana">
                  Cuántos días de finde (sábado y domingo) trabaja a la semana quien más y quien
                  menos. Con la rueda se cuenta la media de toda la vuelta, porque cada semana le
                  toca una fila distinta. Los contratos de fin de semana trabajan los dos por
                  contrato y entran en la cuenta.
                </InfoTip>
              }
              label="Findes: el que más y el que menos"
              value={
                metricas.findes.length > 0
                  ? `de ${nf1.format(metricas.findes[metricas.findes.length - 1].findesTrabajados)} a ${nf1.format(metricas.findes[0].findesTrabajados)} días`
                  : '-'
              }
              hint={
                metricas.desequilibrioFindes <= 1
                  ? rueda.semanas > 1
                    ? 'Días de sábado y domingo a la semana por persona, de media en la rueda'
                    : 'Días de sábado y domingo a la semana por persona, repartidos de forma pareja'
                  : findesSinRueda > 0
                    ? `${findesSinRueda} ${findesSinRueda === 1 ? 'persona no rota y no hace' : 'personas no rotan y no hacen'} ningún finde: su semana es fija. Los que rotan se los reparten.`
                    : `${nf1.format(metricas.desequilibrioFindes)} días de diferencia entre unos y otros`
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
                  <span className="text-content-secondary">
                    {h.cuando}
                    {fueraDeHorario(h.day, h.slot) && (
                      <span className="text-content-muted"> · empieza fuera del horario: es preparación o recogida</span>
                    )}
                  </span>
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
            {/* Lo que pasa con los nombres, dicho donde se escriben (revisión
                ronda 5, M6). Son datos de terceros: los empleados del local.
                Se guardan con el plan en el servidor (`personNames` en
                `crearPlan`/`actualizarPlan`, lib/backend.ts) y los ve quien
                tenga el enlace. El texto tiene que ser cierto al pie de la
                letra, y no hay nombre obligatorio. */}
            <p className="mt-2 max-w-2xl text-[0.8rem] leading-relaxed text-content-secondary">
              Es opcional: puedes dejar &laquo;Camarero 1&raquo; o poner solo un nombre de pila.
              {hayBackend()
                ? ' Los nombres se guardan con tu plan en nuestro servidor, y los ve quien tenga su enlace.'
                : ' Los nombres se quedan en este navegador y en el enlace largo si lo compartes.'}
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
        rueda={rueda}
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
            {/* "Se salen de tu plantilla" y "por encima de tu línea" son la
                jerga de esta herramienta, no la de un hostelero: hay que
                haberse leído las tres pantallas anteriores para saber qué es
                la línea. Se dice lo que pasa: esas semanas hace falta más
                gente de la que tiene fija. */}
            <h2 className="mt-4 max-w-3xl text-[1.7rem] leading-[1.12] font-extrabold tracking-[-0.028em] text-content-inverted sm:text-[2.2rem]">
              Tu plantilla fija se queda corta{' '}
              <span className="text-content-inverted/70 italic">
                {peakWeekCount} {plural(peakWeekCount, 'semana', 'semanas')}.
              </span>
            </h2>

            {/* Dos cifras, no tres. Apunte del advisor (2026-09-18): arriba van
                solo las semanas y las horas, que es lo que el restaurante
                mide. Las personas que habría que contratar siguen estando,
                pero abajo y en prosa, que es donde el argumento se entiende.
                Y la advertencia de que todo esto cuelga de que se cumplan las
                ventas previstas, que es suya y es verdad: el cálculo sale del
                histórico proyectado al año que viene. */}
            <div className="mt-8 grid gap-6 sm:grid-cols-2 sm:gap-10">
              <div>
                <div className="text-[2.4rem] leading-none font-black text-content-inverted tnum">
                  {peakWeekCount}
                </div>
                <div className="mt-1.5 text-[0.85rem] leading-snug font-semibold text-content-inverted/70">
                  {plural(peakWeekCount, 'semana con falta', 'semanas con falta')} de personal, de
                  {' '}{weeks.length} analizadas
                </div>
              </div>
              <div>
                <div className="text-[2.4rem] leading-none font-black text-content-inverted tnum">
                  {nf.format(peaks.peakHoursPerYear)}
                </div>
                <div className="mt-1.5 text-[0.85rem] leading-snug font-semibold text-content-inverted/70">
                  horas que faltan en esas semanas
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              <div className="rounded-card border border-content-inverted/20 bg-content-inverted/10 p-5">
                <div className="text-[0.72rem] font-bold tracking-wide text-content-inverted/65 uppercase">
                  Si contratas para el pico
                </div>
                <div className="mt-2 text-[1.55rem] leading-tight font-black text-content-inverted">
                  {picoSoloHoras
                    ? 'No te hace falta más gente'
                    : `${extraPeopleIfHired} ${plural(extraPeopleIfHired, 'persona fija más', 'personas fijas más')}`}
                </div>
                <p className="mt-2 text-[0.86rem] leading-relaxed font-medium text-content-inverted/75">
                  {peaks.worstWeek
                    ? picoSoloHoras
                      ? `${fraseSemanaPico}: son más horas de los mismos, no más personas. Meterlas en nómina serían ${contratosPicoTexto} pagados ${temporadaLocal.deTemporada ? `las ${semanasDePago} semanas que abres` : 'todo el año'}, para horas que solo faltan en semanas sueltas.`
                      : `${fraseSemanaPico}. Tenerlo fijo ${extraPeopleIfHired === 1 ? 'es' : 'son'} ${contratosPicoTexto}, con nómina ${temporadaLocal.deTemporada ? `las ${semanasDePago} semanas que abres` : 'todo el año'}.`
                    : `Para cubrir la semana más exigente, con nómina ${temporadaLocal.deTemporada ? `las ${semanasDePago} semanas que abres` : 'durante todo el año'}.`}
                </p>
                {peakHiredAnnualCostEur !== null && (
                  <div
                    className={cn(
                      'mt-4 font-black text-content-inverted tnum',
                      picoSoloHoras ? 'text-[1.05rem] text-content-inverted/70' : 'text-[1.35rem]',
                    )}
                  >
                    {picoSoloHoras
                      ? `${eur.format(peakHiredAnnualCostEur)} al año si lo metieras en nómina`
                      : `${eur.format(peakHiredAnnualCostEur)} al año`}
                  </div>
                )}
              </div>

              <div className="rounded-card bg-surface-elevated p-5 text-content-primary shadow-md">
                <div className="text-[0.72rem] font-bold tracking-wide text-brand uppercase">
                  Si cubres solo lo que falta
                </div>
                <div className="mt-2 text-[1.55rem] leading-tight font-black text-brand">
                  {nf.format(horasFaltanPicos)} horas que faltan
                </div>
                <p className="mt-2 text-[0.86rem] leading-relaxed font-medium text-content-body">
                  Durante {peakWeekCount} {plural(peakWeekCount, 'semana', 'semanas')} de las{' '}
                  {weeks.length} analizadas.
                  {horasComplementariasPicos > 0 && (
                    <>
                      {' '}
                      {nf.format(horasComplementariasPicos)} las pueden hacer tus parciales con horas
                      complementarias;{' '}
                      <strong className="text-content-primary">
                        quedan {nf.format(horasRefuerzo)} de refuerzo
                      </strong>
                      .
                    </>
                  )}
                </p>
                {peakOnlyAnnualCostEur !== null && (
                  <div className="mt-4 text-[1.35rem] font-black text-content-primary tnum">
                    {eur.format(peakOnlyAnnualCostEur)} a tu coste por hora trabajada
                  </div>
                )}
              </div>
            </div>

            {peaks.worstWeek && (
              <p className="mt-5 max-w-3xl text-[0.88rem] leading-relaxed font-semibold text-content-inverted/75">
                La referencia es la semana {peaks.worstWeek.isoWeek}, la más exigente: le faltan{' '}
                {nf.format(peaks.worstWeek.extraHours)} horas. Si contratas gente fija para esa semana,
                le pagas {nf1.format(peaks.weeksPaidPerWeekWorked)}{' '}
                {plural(peaks.weeksPaidPerWeekWorked, 'semana', 'semanas')} de sueldo por cada
                semana en la que de verdad hace falta.
              </p>
            )}

            {peakWeekCount > 1 && semanasPuntaTexto && (
              <p className="mt-6 max-w-3xl text-[0.9rem] leading-relaxed font-semibold text-content-inverted/75">
                Además, no van seguidas: son {semanasPuntaTexto}. La necesidad aparece en momentos
                concretos, no como un puesto estable durante todo el año.
              </p>
            )}

            <p className="mt-6 max-w-3xl text-[1rem] leading-relaxed font-bold text-content-inverted">
              Son dos formas de cubrir lo mismo: con gente fija la tienes todas las semanas; con
              refuerzos pagas solo las horas que faltan. Si tus semanas punta van seguidas, como
              una temporada, también puedes contratar fijos discontinuos solo para ellas.
            </p>
            <p className="mt-2 max-w-3xl text-[0.82rem] leading-relaxed font-medium text-content-inverted/60">
              {avgHourlyCost !== null && costeHoraTrabajada !== null
                ? `Las dos cifras son coste de empresa. Contratar fijo se paga a ${eur2.format(avgHourlyCost)} por hora de contrato las ${semanasDePago} semanas; las horas de refuerzo, a ${eur2.format(costeHoraTrabajada)}, lo que te cuesta de verdad una hora trabajada de tu gente. El precio de cubrir un turno con Shifty aparece en la siguiente pantalla.`
                : 'En la siguiente pantalla verás cómo cubrir esos turnos con Shifty y cuánto cuesta.'}
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-4 max-w-3xl text-[1.7rem] leading-[1.12] font-extrabold tracking-[-0.028em] text-content-inverted sm:text-[2.2rem]">
              Has dimensionado la plantilla{' '}
              <span className="text-content-inverted/70 italic">para la semana más exigente.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-[1rem] leading-relaxed font-medium text-content-inverted/85">
              Tu equipo cubre las {weeks.length} semanas del histórico. Eso evita pedir refuerzos,
              pero también mantiene la capacidad de la semana más fuerte en las semanas normales.
              Baja la línea para comparar ambas opciones.
            </p>
          </>
        )}

        {/* El remate de esta pantalla es el "Siguiente" del pie. Lo que
            Shifty hace, cuánto cuesta y cómo se pide vive en la pantalla de
            al lado: aquí se acaba de contar un problema y meter la venta
            encima es lo que hacía que esta pantalla diera la chapa. */}
      </section>

      {/* ── Antes de contratar o pedir extras (ronda 2, puntos 6 y 23) ──
          Un gestor salta de "plantilla" a "extras" pasando por dos escalones
          que la herramienta no contaba: las horas complementarias de los
          parciales para los picos medianos, y el fijo discontinuo cuando el
          pico es una temporada entera. */}
      {peakWeekCount > 0 && (
        <Card>
          <CardHeader
            eyebrow="Antes de contratar"
            title={
              <>
                Lo que ya tienes <span className="text-brand italic">antes de pedir refuerzos.</span>
              </>
            }
          />
          <div className="space-y-4 border-t border-border-soft px-6 py-5">
            {bolsa.parciales > 0 && (
              <div>
                <h4 className="h4 flex flex-wrap items-center gap-2">
                  Horas complementarias de tus parciales
                  <InfoTip title="Qué son">
                    Horas de más que un contrato parcial puede hacer sin cambiar de contrato, si está
                    pactado por escrito con esa persona y se avisa con tres días (art. 12.5 del
                    Estatuto de los Trabajadores). El pacto se firma con cada uno, no lo da el
                    convenio: la ley deja pactar hasta el 30 % de su jornada y el convenio puede
                    subir ese tope hasta el 60 %. A un parcial no se le pueden pedir horas extra.
                  </InfoTip>
                </h4>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-content-secondary">
                  Tus {bolsa.parciales} {plural(bolsa.parciales, 'parcial puede', 'parciales pueden')} hacer
                  hasta <strong className="text-content-primary">{nf1.format(bolsa.horasSemana)} h más a la semana</strong>{' '}
                  con las pactadas, sin llegar ninguno a la jornada completa. En tus semanas punta eso
                  cubre <strong className="text-content-primary">{nf.format(horasComplementariasPicos)} de las{' '}
                  {nf.format(horasFaltanPicos)} h</strong> que faltan; quedan{' '}
                  {nf.format(horasRefuerzo)} para refuerzos.
                  {bolsa.horasVoluntariasSemana > 0 && (
                    <>
                      {' '}Si son indefinidos y aceptan, las voluntarias dan hasta{' '}
                      {nf1.format(bolsa.horasVoluntariasSemana)} h más a la semana ({VOLUNTARIAS_PCT} % de su
                      jornada), pero no se pueden dar por hechas y no entran en la cuenta.
                    </>
                  )}
                </p>
                {/* Revisión ronda 5, M7: decía "Pactadas en tu convenio", y el
                    pacto se firma por escrito con cada persona. El 30 % de
                    partida se queda (está pendiente de decidir si arranca en
                    "No pacto"), pero se dice que es un supuesto. */}
                <p className="mt-2 text-[0.82rem] leading-relaxed text-content-muted">
                  De partida contamos el 30 %, el tope de la ley, como si lo tuvieras firmado con cada
                  parcial. Si no tienes ese pacto por escrito, elige &laquo;No pacto&raquo;.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[0.82rem] font-medium text-content-secondary">Pactadas con tus parciales</span>
                  <Segmented
                    value={String(bolsa.pct)}
                    onChange={(v) => p.setSettings((st) => ({ ...st, complementariasPct: Number(v) }))}
                    options={[
                      { value: '0', label: 'No pacto' },
                      { value: '30', label: '30 %' },
                      { value: '45', label: '45 %' },
                      { value: '60', label: '60 %' },
                    ]}
                  />
                </div>
              </div>
            )}

            <div className={cn(bolsa.parciales > 0 && 'border-t border-border-soft pt-4')}>
              <h4 className="h4">Si el pico es una temporada</h4>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-content-secondary">
                {temporadaLocal.deTemporada ? (
                  <>
                    Tu local cierra {temporadaLocal.semanasCerradas} semanas al año: es un local de
                    temporada. Para eso existe el contrato{' '}
                    <strong className="text-content-primary">fijo discontinuo</strong> (art. 16 ET):
                    toda la plantilla base es tuya y fija, trabaja las {semanasDePago} semanas que
                    abres y la llamas cada año en el orden que diga tu convenio. Así está calculado
                    el coste de esta pantalla. Para los picos dentro de la temporada, refuerzos.
                  </>
                ) : temporada ? (
                  <>
                    Tus semanas {temporada.desde} a {temporada.hasta} van seguidas: son{' '}
                    {temporada.semanas} semanas, una temporada y no un pico suelto. Para eso existe el
                    contrato <strong className="text-content-primary">fijo discontinuo</strong> (art. 16
                    ET): la persona es tuya y fija, trabaja solo la temporada y la llamas cada año en el
                    orden que diga tu convenio. Te ahorra buscar gente nueva cada vez. Para los picos
                    sueltos que quedan, mejor refuerzos.
                  </>
                ) : (
                  <>
                    Tus picos van sueltos, no forman una temporada de cuatro semanas o más seguidas.
                    El contrato fijo discontinuo (art. 16 ET) encaja cuando el pico dura una temporada
                    entera; para semanas sueltas como las tuyas, lo que encaja son los refuerzos.
                  </>
                )}
              </p>
            </div>
          </div>
        </Card>
      )}

      </div>
      )}

      {/* ══ sub-paso 4: con Shifty ══ */}
      {/* Pantalla propia, a peticion de Crescente (2026-09-18). Todo esto vivia
          pegado debajo de los picos y la pantalla daba la chapa: se acababa de
          contar un problema y encima venia la venta entera. Partido en dos, la
          de picos es el diagnostico con sus numeros y esta es la comercial.
          El lenguaje visual sale de la propuesta comercial de cadenas
          (Sales/assets/decks/Shifty_Cadena_Restauracion_Comercialv8.html): el
          titular a dos lineas con la segunda en cursiva, las dos columnas de
          cuatro pasos comparando el antes y el con Shifty, y la banda de
          metricas con su fuente escrita debajo. Las cifras son las de ese
          deck, con su fuente literal: no se inventa ninguna aqui. */}
      {sub === 4 && (
      <div className="space-y-6">

        <section className="rounded-card bg-brand px-6 py-10 shadow-lg sm:px-10 sm:py-12">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
            <div>
              <EyebrowInverted>Con Shifty</EyebrowInverted>

              <h2 className="mt-4 max-w-3xl text-[1.7rem] leading-[1.12] font-extrabold tracking-[-0.028em] text-content-inverted sm:text-[2.2rem]">
                Cubre los picos{' '}
                <span className="text-content-inverted/70 italic">
                  sin inflar tu plantilla fija.
                </span>
              </h2>

              <p className="mt-6 max-w-2xl text-[1rem] leading-relaxed font-medium text-content-inverted/85">
                {peakWeekCount > 0
                  ? horasRefuerzo > 0
                    ? `Tu plan ya ha localizado ${peakWeekCount} ${plural(peakWeekCount, 'semana', 'semanas')} en las que faltan ${nf.format(horasFaltanPicos)} horas${horasComplementariasPicos > 0 ? `: ${nf.format(horasComplementariasPicos)} las pueden hacer tus parciales con complementarias, y quedan ${nf.format(horasRefuerzo)} horas de refuerzo` : ' de refuerzo'}.`
                    : `Tu plan ha localizado ${peakWeekCount} ${plural(peakWeekCount, 'semana', 'semanas')} punta, y las horas que faltan las pueden hacer tus parciales con complementarias. Para bajas, vacaciones y reservas inesperadas sigues necesitando a alguien.`
                  : 'Aunque hoy cubras el histórico con plantilla fija, una baja o una reserva inesperada puede dejar un turno corto.'}{' '}
                En Shifty publicas el turno, eliges profesionales verificados y la ETT colaboradora
                se ocupa del contrato, el alta y la nómina.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  'Picos, bajas y vacaciones',
                  'Sin cuota mensual',
                  'Tú eliges quién va',
                  'Historial y favoritos',
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-pill border border-content-inverted/25 bg-content-inverted/10 px-3 py-1.5 text-[0.78rem] font-bold text-content-inverted"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <figure className="mx-auto w-full max-w-[420px]">
              {/* ⚠️ La captura necesita su propio fondo claro: el menú morado
                  de Shifty se pierde si vuelve a apoyarse directamente sobre
                  el morado de esta sección.
                  ⚠️ La imagen es la pantalla real del panel de empresas con las
                  caras y los nombres sustituidos por avatares genéricos y
                  "Profesional 1, 2, 3", y "Shifts/Shifters" por "turnos" y
                  "profesionales" (revisión ronda 5, M9). La original llevaba
                  fotos y nombres que podían ser de trabajadores reales: no se
                  vuelve a poner una captura con personas sin anonimizarla. El
                  `?v=2` es para que nadie siga viendo la vieja desde la caché. */}
              <a
                href="/shifty-turno.webp?v=2"
                target="_blank"
                rel="noopener noreferrer"
                className="block cursor-zoom-in rounded-[18px] border border-content-inverted/40 bg-surface-elevated p-2 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverted sm:p-2.5"
              >
                <img
                  src="/shifty-turno.webp?v=2"
                  alt="Pantalla de Shifty con un turno publicado, las personas confirmadas y la valoración de cada profesional."
                  width={1900}
                  height={929}
                  loading="lazy"
                  decoding="async"
                  className="w-full rounded-[10px]"
                />
              </a>
              <figcaption className="mt-3 text-[0.78rem] leading-relaxed font-semibold text-content-inverted/70">
                Ves quién viene, a qué hora y con qué valoración. Imagen de ejemplo, con los
                nombres y las fotos ocultos. Ábrela para verla en grande.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Las dos columnas de la propuesta de cadenas. El argumento no es que
            seamos más rápidos: es que la información de a quién cogiste y qué
            tal fue se queda guardada, y la siguiente vez se elige mejor. */}
        <Card className="p-6 sm:p-8">
          <h3 className="text-[1.1rem] font-extrabold tracking-[-0.02em] text-content-primary">
            Tres formas de cubrir el mismo pico
          </h3>
          <p className="mt-2 max-w-3xl text-[0.9rem] leading-relaxed text-content-secondary">
            La diferencia no está solo en encontrar a alguien. Está en cuánto pagas, cuánto
            tarda el equipo y qué información conservas para el siguiente turno.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[
              {
                titulo: 'Contratar de más',
                pie: 'Pagas capacidad fija',
                destacado: false,
                puntos: [
                  picoSoloHoras
                    ? `La peor semana no pide más gente a la vez, solo más horas: meterlas en nómina serían ${contratosPicoTexto}.`
                    : `${extraPeopleIfHired} ${plural(extraPeopleIfHired, 'persona fija más', 'personas fijas más')}, con ${nf.format(horasContratoPico)} h de contrato a la semana, para llegar a la peor semana.`,
                  temporadaLocal.deTemporada
                    ? `Nómina las ${semanasDePago} semanas que abres, aunque el pico dure menos.`
                    : 'Nómina todo el año, o un fijo discontinuo si los picos van seguidos.',
                  'Más coste fijo y menos margen para ajustar cada centro.',
                ],
              },
              {
                titulo: 'Llamadas y WhatsApp',
                pie: 'Cada turno empieza de cero',
                destacado: false,
                puntos: [
                  'Preguntas uno a uno hasta encontrar a alguien libre.',
                  'Decides con la información repartida entre chats y contactos.',
                  'Si cambia el responsable, parte de ese aprendizaje se pierde.',
                ],
              },
              {
                titulo: 'Con Shifty',
                pie: 'Cubres solo lo que falta',
                destacado: true,
                puntos: [
                  'Publicas día, horario, puesto y condiciones.',
                  'Eliges con experiencia, valoraciones e historial contigo.',
                  'Guardas favoritos para volver a contar con quien funciona.',
                ],
              },
            ].map((col) => (
              <div
                key={col.titulo}
                className={cn(
                  'rounded-card border p-5',
                  col.destacado ? 'border-brand/30 bg-brand-light' : 'border-border bg-surface-alt',
                )}
              >
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
                  <b
                    className={cn(
                      'text-[0.95rem] font-extrabold',
                      col.destacado ? 'text-brand' : 'text-content-primary',
                    )}
                  >
                    {col.titulo}
                  </b>
                  <span className="text-[0.75rem] font-semibold text-content-secondary">
                    {col.pie}
                  </span>
                </div>

                <ul className="mt-4 space-y-3">
                  {col.puntos.map((punto) => (
                    <li key={punto} className="flex gap-2.5">
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-pill',
                          col.destacado
                            ? 'bg-brand'
                            : 'bg-content-muted',
                        )}
                      />
                      <p className="text-[0.85rem] leading-relaxed text-content-body">{punto}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-3 rounded-card border border-brand/20 bg-brand-light px-4 py-4">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-brand" />
            <p className="text-[0.85rem] leading-relaxed text-content-body">
              <strong className="text-content-primary">Para cadenas y hoteles:</strong> cada centro
              sigue el mismo proceso y no depende de la agenda privada de una sola persona. Las
              valoraciones, los favoritos y el historial quedan disponibles para la siguiente
              necesidad.
            </p>
          </div>

          <div className="mt-3 flex gap-3 rounded-card bg-surface-alt px-4 py-3.5">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-brand" />
            <p className="text-[0.85rem] leading-relaxed text-content-body">
              Tú eliges a la persona. La ETT colaboradora hace el contrato, el alta en la Seguridad
              Social y la nómina. Tú recibes una sola factura.
            </p>
          </div>
        </Card>

        {/* Las tres cifras y el precio, juntos: son la misma pregunta
            ("¿funciona y cuánto cuesta?") y separarlos alarga la pantalla. */}
        <Card className="p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              ['9 min', 'hasta el primer candidato, de mediana'],
              ['81 %', 'de los turnos pedidos con menos de 24 h se cubren'],
              ['4,89', 'de valoración media de los profesionales, sobre 5'],
            ].map(([cifra, texto]) => (
              <div key={cifra}>
                <div className="text-[2.1rem] leading-none font-black tracking-tight text-brand tnum">
                  {cifra}
                </div>
                <div className="mt-1.5 text-[0.85rem] leading-snug font-semibold text-content-body">
                  {texto}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[0.75rem] leading-relaxed text-content-tertiary">
            Mediana sobre 701 anuncios y cobertura de junio a agosto de 2026. Valoración media de
            2.806 valoraciones desde marzo de 2026.
          </p>

          <div className="mt-6 border-t border-border pt-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[1.6rem] leading-none font-black tracking-tight text-content-primary">
                Desde 18,81 €/hora
              </span>
              <span className="text-[0.95rem] font-bold text-brand">todo incluido</span>
            </div>
            <p className="mt-2.5 max-w-2xl text-[0.9rem] leading-relaxed text-content-body">
              El salario del profesional, el contrato y el alta que hace la ETT colaboradora, y
              nuestra comisión. Sin cuota mensual y sin permanencia. Si el turno no se cubre, no
              pagas nada.
            </p>
            {/* Peras con peras (ronda 2, punto 20). El 18,81 es por hora
                trabajada y lo lleva todo; compararlo con el sueldo por hora de
                contrato de tu gente es comparar cosas distintas, porque a tu
                gente le pagas también las semanas que no trabaja. */}
            <p className="mt-3 max-w-2xl rounded-lg bg-surface-alt px-4 py-3 text-[0.86rem] leading-relaxed text-content-body">
              <strong className="text-content-primary">Para compararlo con lo mismo:</strong>{' '}
              {costeHoraTrabajada !== null ? (
                <>
                  una hora trabajada de tu plantilla te cuesta{' '}
                  <strong className="text-content-primary">{eur2.format(costeHoraTrabajada)}</strong> en
                  coste de empresa:{' '}
                  {cost?.base === 'bruto'
                    ? 'el sueldo bruto por hora de tu catálogo, que ya lleva las pagas extra prorrateadas, más la Seguridad Social, y las'
                    : 'el coste de empresa por hora de tu catálogo, y las'}{' '}
                  vacaciones y los festivos, que se pagan sin trabajarse. Con un refuerzo pagas solo
                  la hora que trabaja.
                </>
              ) : (
                <>
                  no lo pongas al lado del sueldo por hora. Una hora trabajada de tu plantilla cuesta
                  unas {nf1.format(multiplicadorHoraTrabajada)} veces el sueldo bruto por hora de
                  contrato, porque encima van la Seguridad Social y las semanas de vacaciones y
                  festivos que se pagan sin trabajarse. Enciende los costes en tus puestos y te damos
                  la cifra exacta.
                </>
              )}
            </p>
          </div>
        </Card>

        {/* La llamada a la acción, sola y en morado: quien llega hasta aquí ya
            ha visto el problema, la solución y el precio. El enlace lleva las
            etiquetas de campaña, que el formulario de shifty.es sí guarda,
            para saber cuántos leads salen de la herramienta. */}
        <section className="rounded-card bg-brand px-6 py-8 shadow-lg sm:px-10">
          <h3 className="max-w-2xl text-[1.3rem] leading-tight font-extrabold tracking-[-0.025em] text-content-inverted">
            ¿Quieres probarlo en tu local?
          </h3>
          <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed font-medium text-content-inverted/85">
            Cuéntanos qué turnos necesitas cubrir, en un local o en varios, y te ayudamos a
            calcular el coste, sin compromiso.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="https://shifty.es/contacto?utm_source=planificador&utm_medium=herramienta&utm_campaign=picos"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-surface-elevated px-7',
                'text-[0.95rem] font-bold text-brand transition-transform duration-150 hover:scale-[1.02] active:scale-[.98]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverted',
              )}
            >
              Quiero probar Shifty
              <ArrowUpRight size={17} strokeWidth={2.6} />
            </a>
            <a
              href="https://shifty.es"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex h-12 items-center justify-center gap-2 rounded-pill border border-content-inverted/35 px-7',
                'text-[0.95rem] font-bold text-content-inverted transition-colors duration-150 hover:bg-content-inverted/10',
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

      {/* ══ sub-paso 5: llevatelo ══ */}
      {sub === 5 && (
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
              No hemos podido guardar el plan{esDemo ? '' : '. Tu fichero sigue solo en este navegador'};
              descarga una copia aquí abajo para no perder el trabajo.{' '}
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
        {/* El texto tiene que decir la verdad de lo que está pasando AHORA. Decía
            "nada de esto se guarda en ningún servidor" mientras el plan se
            estaba subiendo, que es exactamente el tipo de frase que hace que
            luego nadie se crea nada de lo que dice la pantalla. */}
        <p className="mt-1 text-[0.86rem] leading-relaxed text-content-secondary">
          {p.planRemoto && !p.falloGuardado ? (
            <>
              {esDemo ? '' : 'Tu fichero nunca sale de este navegador. '}Lo que se guarda es el
              plan ya calculado, con los nombres que hayas puesto en el cuadrante, para que puedas
              volver a él y compartirlo con un enlace corto. Quien lo abra lo ve, pero no lo puede
              cambiar ni borrar.
            </>
          ) : (
            <>
              {esDemo ? '' : 'Tu fichero sigue solo en este navegador. '}Este plan aún no está
              guardado en nuestro servidor: puedes descargar una copia o compartir el enlace largo,
              que lleva el plan dentro (también los nombres del cuadrante).
            </>
          )}
        </p>

        {/* DOS VERSIONES, Y LA CORTA PRIMERO.
            El resumen de una página es el que de verdad se manda por WhatsApp o
            se pega en un correo; el completo es el que se lleva a una reunión y
            trae el cuadrante, el horario, la revisión y los criterios. Con un
            solo botón, quien quería enseñar una cifra mandaba seis páginas. */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button
            icon={<Download size={16} />}
            onClick={() => void descargarInforme(informeInput, 'resumen')}
          >
            Resumen en una página
          </Button>
          <Button
            variant="secondary"
            icon={<FileText size={16} />}
            onClick={() => void descargarInforme(informeInput, 'completo')}
          >
            Informe completo
          </Button>
          <Button
            variant="secondary"
            icon={<LinkIcon size={16} />}
            onClick={() => void copiarEnlace()}
          >
            {enlaceCopiado ? 'Enlace copiado' : 'Copiar enlace'}
          </Button>
        </div>

        {/* EL CUADRANTE, TAMBIÉN AQUÍ (ronda 7, M2 de pantallas). Quien va
            directo al final a por el cuadrante para colgarlo el lunes no lo
            encontraba: solo estaba en el sub-paso "El cuadrante". Los mismos
            dos botones, que llaman a lo mismo que los de allí. */}
        <div className="mt-3 flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={15} />}
            onClick={() =>
              void descargarCuadranteCocina(roster, model, {
                lunes: primerLunesPublicable(new Date()),
                nota: rueda.semanas > 1 ? 'Semana 1 de la rueda.' : undefined,
              })
            }
          >
            PDF para colgar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<CalendarDays size={15} />}
            onClick={() => downloadCuadranteCsv(roster, model)}
          >
            Cuadrante (CSV)
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

      <section className="rounded-card border border-brand/20 bg-brand-light p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div>
          <h3 className="text-[1.05rem] font-extrabold tracking-[-0.02em] text-content-primary">
            El plan cubre lo previsible. Shifty cubre lo que cambia.
          </h3>
          <p className="mt-1.5 max-w-3xl text-[0.86rem] leading-relaxed text-content-body">
            Si aparece una baja, una reserva grande o una semana punta en cualquiera de tus
            centros, publica solo el turno que falta y elige entre profesionales verificados.
          </p>
        </div>
        <a
          href="https://shifty.es/contacto?utm_source=planificador&utm_medium=herramienta&utm_campaign=resultado"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-brand px-5 text-[0.88rem] font-bold text-content-inverted transition-transform duration-150 hover:scale-[1.02] active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:mt-0"
        >
          Cubrir un turno con Shifty
          <ArrowUpRight size={16} strokeWidth={2.6} />
        </a>
      </section>

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
        // Al final no hay un botón apagado, que parecía un fallo (ronda 3,
        // punto 34): vuelve al resumen de la plantilla.
        onNext={() => setSub((v) => (v < RESULT_SUBSTEPS.length - 1 ? v + 1 : 0))}
        nextLabel={
          sub < RESULT_SUBSTEPS.length - 1
            ? `Siguiente: ${etiquetaSiguiente(RESULT_SUBSTEPS[sub + 1].label)}`
            : 'Volver a tu plantilla'
        }
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

/** "17 por el pico, 4 por el calendario y 1 de mando": solo las partes que no son cero. */
function listarPartes(partes: [number, string][]): string {
  const t = partes.filter(([n]) => n !== 0).map(([n, txt]) => `${n} ${txt}`)
  if (t.length <= 1) return t[0] ?? ''
  return `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`
}
