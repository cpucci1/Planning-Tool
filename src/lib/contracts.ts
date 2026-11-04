/**
 * Resumen de contratos y análisis de picos.
 *
 * El titular del producto sale de aquí: "necesitas N personas". Y justo al lado,
 * el argumento honesto: las horas que quedan por encima de la línea de
 * cobertura no se contratan, se cubren con extras.
 */

import type {
  ContractAllocation,
  ContractType,
  NeedGrid,
  NeedSummary,
  PeakAnalysis,
  Roster,
  Settings,
  SpecialWeek,
  StaffingModel,
  StaffPlan,
  WeekDemand,
} from './types'
import { parametrosAusencia, tiempoDisponible } from './ausencias'
import { horasPagadasSinServicio } from './metricas'
import { esMando } from './roster'
import { minutosDeNoche } from './avisos'

export const DEFAULT_CONTRACTS: ContractType[] = [
  { id: 'c40', hours: 40, label: '40h', enabled: true },
  { id: 'c30', hours: 30, label: '30h', enabled: true },
  { id: 'c20', hours: 20, label: '20h', enabled: true },
  { id: 'c15', hours: 15, label: '15h', enabled: true },
]

/** Agrupa las personas del cuadrante por tipo de contrato y explica de dónde sale el número. */
export function summarizePlan(
  roster: Roster,
  settings: Settings,
  needSummary: NeedSummary,
  needGrid: NeedGrid,
  model: StaffingModel,
  fullTimeHours = 40,
): StaffPlan {
  let contractedHours = 0
  let assignedHours = 0
  for (const p of roster.people) {
    contractedHours += p.contractHours
    assignedHours += p.assignedHours
  }
  const allocations = agruparContratos(roster.people)

  const peakByRole = model.roles.map((r) => {
    const g = needGrid[r.id] ?? []
    const peak = g.length ? Math.max(0, ...g.flat()) : 0
    return {
      roleId: r.id,
      peak,
      people: roster.people.filter((p) => p.roleId === r.id).length,
      hours: needSummary.hoursByRole[r.id] ?? 0,
    }
  })

  // Días que puede trabajar una persona a la semana. Con dos libranzas
  // seguidas son cinco; sin esa regla, seis: el descanso semanal es de día y
  // medio (art. 37.1 ET), y con seis días ya no cabe un séptimo.
  const diasPorPersona = settings.consecutiveDaysOff ? 5 : 6

  // De dónde sale cada persona, puesto a puesto, y que sume EXACTO el total
  // (revisión ronda 3, G9). Antes se decía "17 por el pico + 4 por el
  // calendario" y salían 22 con un "es el mínimo" que no cuadraba.
  //   pico: los que coinciden a la vez en su peor franja.
  //   calendario: los que faltan para hacer todos sus turnos sin trabajar
  //     más días de los que se puede.
  //   contratos y horarios: los que salen de que los turnos y las jornadas no
  //     encajan al minuto (turnos cortos, partidas que no cuadran, el
  //     contrato más pequeño). Puede ser negativo si queda algo sin cubrir.
  //   mandos: los puestos de mando, que van aparte de la curva.
  //
  // Ronda 6 (m1 y M5): ninguna parte es negativa. Si un puesto tiene menos
  // gente que su pico es porque un mando hace ese trabajo mientras está (el
  // encargado lleva la sala y no hace falta responsable de sala) o porque
  // queda sin cubrir. Esas plazas del pico no son personas de la plantilla:
  // van aparte, en `picoQueCubreElMando`, para poder decirlo donde se suma.
  const desglose = { pico: 0, calendario: 0, contratosYHorarios: 0, mandos: 0, picoQueCubreElMando: 0 }
  const zonasConMando = new Set(
    model.roles.filter((r) => esMando(r) && roster.people.some((p) => p.roleId === r.id)).map((r) => r.blockId),
  )
  for (const r of model.roles) {
    const personas = roster.people.filter((p) => p.roleId === r.id).length
    if (esMando(r)) {
      desglose.mandos += personas
      continue
    }
    const pico = peakByRole.find((x) => x.roleId === r.id)?.peak ?? 0
    const enEquipo = Math.min(pico, personas)
    if (zonasConMando.has(r.blockId)) desglose.picoQueCubreElMando += pico - enEquipo
    if (personas === 0) continue
    const turnos = roster.shifts.filter((sh) => sh.roleId === r.id).length
    const calendario = Math.max(0, Math.min(personas - enEquipo, Math.ceil(turnos / diasPorPersona) - enEquipo))
    desglose.pico += enEquipo
    desglose.calendario += calendario
    desglose.contratosYHorarios += personas - enEquipo - calendario
  }
  // Personas de puestos que ya no están en el modelo (no debería pasar).
  const sueltas = roster.people.length - (desglose.pico + desglose.calendario + desglose.contratosYHorarios + desglose.mandos)
  desglose.contratosYHorarios += sueltas
  const peopleFromDays = desglose.pico + desglose.calendario

  // Horas pagadas sin servicio, de una sola fuente (G12): las que la gente
  // está en el local de más (la misma cifra que la tarjeta "En turno sin servicio") más
  // las de contrato que no tienen turno.
  const { enElLocal, sinTurno, sinCubrir } = horasPagadasSinServicio(roster, needGrid, model)

  return {
    allocations,
    totalPeople: roster.people.length,
    contractedHours,
    neededHours: needSummary.totalHours,
    assignedHours,
    slackHours: enElLocal + sinTurno,
    slackDesglose: { enElLocal, sinTurno, sinCubrir },
    drivers: {
      fteFromHours: Math.round((needSummary.totalHours / fullTimeHours) * 10) / 10,
      peopleFromPeak: desglose.pico,
      peopleFromDays,
      peakByRole,
      desglose,
    },
  }
}

/**
 * Personas por horas de contrato, de la jornada más grande a la más pequeña.
 *
 * Se agrupa por HORAS y no por el id del contrato: con contratos a medida
 * (revisión del 2026-11-04) cada persona puede tener un número de horas que no
 * está en la lista de ajustes, y agrupar por la lista la dejaba fuera de la
 * cuenta sin ningún error.
 */
export function agruparContratos(people: { contractId: string; contractHours: number }[]): ContractAllocation[] {
  const porHoras = new Map<number, { contractId: string; count: number }>()
  for (const p of people) {
    const a = porHoras.get(p.contractHours)
    if (a) a.count++
    else porHoras.set(p.contractHours, { contractId: p.contractId, count: 1 })
  }
  return [...porHoras.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([hours, a]) => ({ contractId: a.contractId, hours, count: a.count }))
}

/**
 * "una jornada completa", "2,1 jornadas completas": con un decimal y coma, y
 * en singular cuando es una (ronda 7: salía "unas 1 jornadas").
 */
export function jornadasTexto(j: number): string {
  const r = Math.round(j * 10) / 10
  if (r === 1) return 'una jornada completa'
  return `${r.toLocaleString('es-ES', { maximumFractionDigits: 1 })} jornadas completas`
}

/**
 * Las horas del contrato más pequeño que se firma con estos ajustes: el mínimo
 * a medida, o el contrato activo más pequeño de la lista.
 */
export function contratoMinimoHoras(settings: Pick<Settings, 'contratosAMedida' | 'minContractHours' | 'contracts'>): number {
  if (settings.contratosAMedida ?? true) return settings.minContractHours ?? 10
  const activos = settings.contracts.filter((c) => c.enabled).map((c) => c.hours)
  return activos.length ? Math.min(...activos) : 10
}

/** Más de estas jornadas distintas y el mix se resume en completas y parciales. */
const MAX_JORNADAS_A_LA_VISTA = 4

/**
 * "6 de 40h · 2 de 20h", el mix en una línea. Con contratos a medida puede
 * haber diez jornadas distintas, y entonces se dice "6 de 40h · 9 parciales
 * de 20 a 38h", que se lee de un vistazo.
 */
export function describeMix(
  allocations: ContractAllocation[],
  contracts: ContractType[],
): string {
  if (allocations.length === 0) return 'Sin plantilla'
  const etiqueta = (a: ContractAllocation) =>
    contracts.find((x) => x.id === a.contractId && x.hours === a.hours)?.label ?? `${a.hours}h`
  if (allocations.length <= MAX_JORNADAS_A_LA_VISTA) {
    return allocations.map((a) => `${a.count} de ${etiqueta(a)}`).join(' · ')
  }
  const [completa, ...parciales] = allocations
  const n = parciales.reduce((acc, a) => acc + a.count, 0)
  const min = parciales[parciales.length - 1].hours
  const max = parciales[0].hours
  return `${completa.count} de ${etiqueta(completa)} · ${n} parciales de ${min} a ${max}h`
}

/**
 * Las columnas de jornada de una tabla de plantilla. Con pocas jornadas
 * distintas, una por jornada; con muchas, "completa" y "parcial", para que la
 * tabla no tenga diez columnas casi vacías.
 */
export function columnasDeJornada(
  people: { contractHours: number }[],
): { id: string; label: string; incluye: (horas: number) => boolean }[] {
  const horas = [...new Set(people.map((p) => p.contractHours))].sort((a, b) => b - a)
  if (horas.length <= MAX_JORNADAS_A_LA_VISTA) {
    return horas.map((h) => ({ id: `h${h}`, label: `${h}h`, incluye: (x: number) => x === h }))
  }
  const max = horas[0]
  return [
    { id: 'completa', label: `${max}h`, incluye: (x: number) => x === max },
    { id: 'parcial', label: `Parcial`, incluye: (x: number) => x < max },
  ]
}

/**
 * Equivalente a jornada completa. Es el número que se compara entre locales,
 * porque "12 personas" no dice nada si ocho son de 15 horas.
 */
export function fteFrom(plan: StaffPlan, fullTimeHours = 40): number {
  return Math.round((plan.contractedHours / fullTimeHours) * 10) / 10
}

/**
 * Los picos: qué se queda fuera de la plantilla fija.
 *
 * Se mide sobre las semanas reales del histórico que superan el umbral, no
 * sobre una estimación: son horas que el restaurante ya vivió.
 *
 * El número que de verdad convence no es el total anual de horas — sale
 * pequeño repartido entre 52 semanas y no dice nada. Es cuánta gente falta
 * DENTRO de una semana punta, comparado con lo que costaría tener a esa gente
 * en plantilla los doce meses. Ahí es donde se ve el disparate de contratar
 * fijo para cubrir diez semanas.
 */
export function analyzePeaks(
  weeksEnBruto: WeekDemand[],
  threshold: number,
  neededHoursTypicalWeek: number,
  typicalWeekCovers: number,
  fullTimeHours = 40,
  opciones: {
    /** Personas a la vez en el peor momento de una semana, con la misma cuenta que la semana tipo. */
    personasPico?: (days: number[][]) => number
    /** Personas a la vez en el peor momento de la semana tipo. */
    picoTipico?: number
    /**
     * Margen de seguridad de la plantilla, en % (ronda 6, M1). La plantilla
     * fija ya cubre la semana tipo más este margen, así que una semana punta
     * solo pide lo que pasa de ahí. Antes las horas por cobro llevaban el
     * margen y la línea no, y subir el margen SUBÍA las horas de pico.
     * `personasPico` tiene que medir la semana punta SIN margen: el margen es
     * capacidad que ya tiene la plantilla, no gente que pida la semana.
     */
    margenPct?: number
    /** Horas del contrato más pequeño que se firma (ajustes de Equipo). Para costar el pico contratado. */
    contratoMinimoHoras?: number
    /**
     * Con "Con más margen" la semana tipo sale de un percentil por franja y
     * suma más que la línea: la plantilla ya cubre esa semana entera. Sin
     * esto, semanas por debajo de la semana tipo salían como punta y se
     * vendía refuerzo para ellas (ronda 9, hallazgo 3 de cálculo).
     */
    capacidadEsSemanaTipo?: boolean
    /**
     * Semanas que se pagan al año (`temporadaDelLocal`). Un fijo cobra estas,
     * no las semanas con datos: un local que cierra 8 semanas sin ser de
     * temporada salía con 44 / 8 y paga 52 (ronda 9, hallazgo 8).
     */
    semanasDePago?: number
  } = {},
): PeakAnalysis {
  // Días raros fuera (revisión ronda 3, G10): un sábado con diez veces lo de
  // un sábado normal es un error del fichero o un evento, no una semana
  // punta, y no puede dar un titular de "faltan 11 personas".
  const { weeks, diasRaros } = limpiarDiasRaros(weeksEnBruto)
  const margen = 1 + Math.max(0, opciones.margenPct ?? 0) / 100
  // Lo que cubre la plantilla fija: la línea más el margen. Con la misma vara
  // a los dos lados: las semanas de más y las horas por cobro.
  const capacidad = (opciones.capacidadEsSemanaTipo ? Math.max(threshold, typicalWeekCovers) : threshold) * margen
  // Las horas extra de una semana punta se estiman con la misma productividad
  // de la semana tipo: si con X comensales hacen falta H horas, los comensales
  // de más piden proporcionalmente más horas. Las H horas son para X comensales
  // con el margen puesto, así que el cobro se mide también con él.
  const hoursPerCover = typicalWeekCovers > 0 ? neededHoursTypicalWeek / (typicalWeekCovers * margen) : 0

  // Punta es la semana que pide horas de más. Una por encima de la línea que no
  // pide ni una hora (sin horas por comensal, por ejemplo) no es punta: contaba
  // como tal con 0 h (revisión ronda 10, hallazgo 5).
  const extraDe = (w: (typeof weeks)[number]) => Math.max(0, w.total - capacidad) * hoursPerCover
  const peaks = weeks.filter((w) => w.total > capacidad && extraDe(w) > 0)
  const extraByWeek = peaks.map(extraDe)
  const peakHoursPerYear = extraByWeek.reduce((a, b) => a + b, 0)
  const worstWeekHours = extraByWeek.length ? Math.max(...extraByWeek) : 0
  const avgPeakHours = extraByWeek.length ? peakHoursPerYear / extraByWeek.length : 0

  // La peor semana, en dos cifras que no se mezclan (ronda 7, G2 de cálculo):
  //   - gente de más A LA VEZ en su momento más fuerte, comparada con el pico
  //     de una semana NORMAL medida igual (no con la semana tipo suavizada:
  //     en un bar de tapas 19 de 41 semanas normales ya daban "+3", que era
  //     ruido de los tramos y no pico);
  //   - jornadas, que salen de las HORAS de más entre la jornada completa,
  //     con un decimal.
  // Antes el titular era el mayor de los dos y se vendía como "N jornadas
  // completas más" a 40 h todo el año: 3 jornadas para 10 h de una semana.
  const peor = peaks.length ? peaks[extraByWeek.indexOf(worstWeekHours)] : null
  let peopleInWorstWeek = 0
  if (peor && worstWeekHours > 0) {
    if (opciones.personasPico && opciones.picoTipico !== undefined) {
      const normales = weeks.filter((w) => w.total <= capacidad && w.total > 0)
      const picoNormal = Math.max(opciones.picoTipico, percentilAlto(normales.map((w) => opciones.personasPico!(w.days))))
      peopleInWorstWeek = Math.max(0, opciones.personasPico(peor.days) - picoNormal)
    } else {
      peopleInWorstWeek = Math.ceil(worstWeekHours / fullTimeHours)
    }
  }
  const jornadasPorHoras = Math.round((worstWeekHours / fullTimeHours) * 10) / 10
  // Las personas que tendrías que meter en nómina: las que coinciden de más a
  // la vez y, si las horas no caben en ellas a jornada completa, las que pidan
  // las horas. Al menos una si falta alguna hora.
  const personasParaContratar =
    worstWeekHours > 0 ? Math.max(1, peopleInWorstWeek, Math.ceil(Math.round(worstWeekHours) / fullTimeHours)) : 0
  // Y sus horas de contrato a la semana: las que pide esa semana, con el
  // contrato mínimo por persona. Es lo que se paga todo el año si se contrata
  // fijo, no N contratos de 40 h.
  const minimo = Math.max(0, opciones.contratoMinimoHoras ?? 10)
  const horasContratoSemana =
    worstWeekHours > 0
      ? Math.min(personasParaContratar * fullTimeHours, Math.max(Math.round(worstWeekHours), personasParaContratar * minimo))
      : 0

  return {
    peakWeeks: peaks.map((w) => w.isoWeek),
    peakHoursPerYear: Math.round(peakHoursPerYear),
    worstWeek: peor
      ? {
          isoWeek: peor.isoWeek,
          extraHours: Math.round(worstWeekHours),
          extraPeople: peopleInWorstWeek,
          jornadasPorHoras,
          personasParaContratar,
          horasContratoSemana,
        }
      : null,
    // Sin picos, cero (ronda 7, m7: antes valía 1 como mínimo aunque no hubiera ninguno).
    avgExtraPeople: extraByWeek.length ? Math.max(1, Math.round(avgPeakHours / fullTimeHours)) : 0,
    // Contratar para el pico significa pagar esas personas las 52 semanas del
    // año, no solo las de punta. Esa es la comparación honesta.
    weeksPaidPerWeekWorked: peaks.length > 0 ? Math.round((opciones.semanasDePago ?? weeks.length) / peaks.length) : 0,
    weeksCovered: weeks.length - peaks.length,
    extraHoursByWeek: peaks.map((w, i) => ({ isoWeek: w.isoWeek, extraHours: extraByWeek[i] })),
    diasRaros,
  }
}

/**
 * El percentil 90 de una lista (por rango, sin interpolar). Para el pico de
 * una semana normal: el máximo dependería de una sola semana rara, y la
 * mediana dejaría fuera el ruido que se repite en media temporada.
 */
function percentilAlto(v: number[]): number {
  if (v.length === 0) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]
}

/** Un día con más de estas veces lo normal de su día de la semana es raro. */
const DIA_RARO_VECES = 3

/**
 * Cambia cada día raro por un día normal de su día de la semana: la misma
 * forma, escalada a la mediana de ese día (lunes con lunes, sábado con
 * sábado). La mediana se toma de los días con algo, para que las semanas
 * cerradas no la hundan. No toca el histórico: devuelve una copia.
 */
export function limpiarDiasRaros(weeks: WeekDemand[]): {
  weeks: WeekDemand[]
  diasRaros: { isoWeek: number; day: number; veces: number }[]
} {
  const diasRaros: { isoWeek: number; day: number; veces: number }[] = []
  const totalDia = (day: number[] | undefined) => (day ?? []).reduce((a, b) => a + b, 0)
  const medianas = Array.from({ length: 7 }, (_, d) => {
    const v = weeks.map((w) => totalDia(w.days[d])).filter((x) => x > 0).sort((a, b) => a - b)
    if (v.length === 0) return 0
    const m = Math.floor(v.length / 2)
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
  })
  const out = weeks.map((w) => {
    let cambia = false
    const days = w.days.map((day, d) => {
      const t = totalDia(day)
      const med = medianas[d] ?? 0
      if (med <= 0 || t <= DIA_RARO_VECES * med) return day
      cambia = true
      diasRaros.push({ isoWeek: w.isoWeek, day: d, veces: Math.round((t / med) * 10) / 10 })
      return day.map((x) => (x * med) / t)
    })
    if (!cambia) return w
    return { ...w, days, total: days.reduce((a, day) => a + totalDia(day), 0) }
  })
  return { weeks: out, diasRaros }
}

// ─────────────────────────────────────────────────────────────
// Coste de la plantilla
// ─────────────────────────────────────────────────────────────

export interface RoleCost {
  roleId: string
  name: string
  people: number
  /** Horas contratadas a la semana entre toda la gente de este puesto. */
  contractedHours: number
  /** null si el puesto no tiene coste/hora puesto en el catálogo. */
  weeklyEur: number | null
  /**
   * El mismo coste en euros enteros, repartidos para que los puestos sumen
   * exactamente el total redondeado (ronda 7, m6 de pantallas: la tabla sumaba
   * 9.232 y el total decía 9.231). Es lo que se enseña fila a fila.
   */
  weeklyEurEntero: number | null
}

/**
 * Un año de nómina son 52 semanas, siempre. NO las semanas que queden en el
 * análisis: excluir la Navidad del cálculo de la demanda no hace que ese mes
 * no se pague.
 */
export const WEEKS_PER_YEAR = 52

/**
 * Semanas cerradas a partir de las cuales el local es de temporada (ronda 5,
 * G1 de cálculo). Unas vacaciones de verano y otras de Navidad son cuatro o
 * cinco semanas, y se pagan: la plantilla es la misma todo el año. Diez o
 * más semanas cerradas ya no son vacaciones, son un local que abre por
 * temporada, y ahí la plantilla base va con contrato fijo discontinuo
 * (art. 16 ET): se paga solo lo que está abierto.
 */
export const SEMANAS_CIERRE_TEMPORADA = 10

export interface Temporada {
  /** Semanas del año con el local cerrado (las de cierre que siguen fuera del cálculo). */
  semanasCerradas: number
  /** Semanas que se pagan al año: 52, o las abiertas si el local es de temporada. */
  semanasDePago: number
  /** Si cierra tantas semanas que la plantilla base va con fijo discontinuo. */
  deTemporada: boolean
}

/**
 * Cuántas semanas se pagan al año (ronda 5, G1 de cálculo). Antes eran 52
 * siempre, y un local de playa abierto 23 semanas salía por 452.000 € al año
 * cuando con fijos discontinuos son unos 200.000 €. Las cerradas son las que
 * la lectura marcó como cierre y siguen fuera del cálculo: si el usuario
 * vuelve a meter una, para él estaba abierta.
 */
export function temporadaDelLocal(specials: Pick<SpecialWeek, 'kind' | 'excluded'>[]): Temporada {
  const semanasCerradas = Math.min(
    WEEKS_PER_YEAR - 1,
    specials.filter((s) => s.kind === 'cierre' && s.excluded).length,
  )
  const deTemporada = semanasCerradas >= SEMANAS_CIERRE_TEMPORADA
  return {
    semanasCerradas,
    semanasDePago: deTemporada ? WEEKS_PER_YEAR - semanasCerradas : WEEKS_PER_YEAR,
    deTemporada,
  }
}

/**
 * Redondea el coste de cada puesto a euros enteros por el mayor resto, para
 * que la suma de las filas sea el total redondeado y no uno de más o de menos.
 */
function repartirEnteros(byRole: RoleCost[], total: number): void {
  const con = byRole.filter((r) => r.weeklyEur !== null)
  for (const r of con) r.weeklyEurEntero = Math.floor(r.weeklyEur as number)
  let falta = total - con.reduce((a, r) => a + (r.weeklyEurEntero as number), 0)
  const porResto = [...con].sort((a, b) => ((b.weeklyEur as number) % 1) - ((a.weeklyEur as number) % 1))
  for (let i = 0; falta > 0 && porResto.length > 0; i = (i + 1) % porResto.length, falta--) {
    porResto[i].weeklyEurEntero = (porResto[i].weeklyEurEntero as number) + 1
  }
}

/**
 * Salario mínimo por hora, para avisar de que un coste se queda corto.
 *
 * Es la versión pequeña y segura de "meter el convenio": una cifra nacional
 * que cambia una vez al año, en vez de cincuenta tablas provinciales que
 * caducan a distinto ritmo y que nadie mantiene. Sale del SMI de 2026
 * (1.221 € al mes en 14 pagas, RD 126/2026) repartido sobre la jornada de
 * 40 h: 1.221 × 14 / 12 / (40 × 52 / 12).
 *
 * `SMI_DESDE` es la fecha de la cifra: sirve para avisar a quien vuelve con un
 * plan guardado de antes de la última subida.
 */
export const SMI_HORA_EUR = 8.22
export const SMI_DESDE = '2026-01-01'

/** Coste por hora que se queda por debajo del mínimo legal. */
export function porDebajoDelSmi(hourlyCostEur: number | null): boolean {
  return hourlyCostEur !== null && hourlyCostEur > 0 && hourlyCostEur < SMI_HORA_EUR
}

/**
 * Seguridad Social a cargo de la empresa en 2026, régimen general, contrato
 * indefinido: contingencias comunes 23,60 % + desempleo 5,50 % + FOGASA
 * 0,20 % + formación profesional 0,60 % + MEI 0,75 % = 30,65 %, más
 * accidentes de trabajo y enfermedad profesional, en torno al 1,50 % en
 * restaurantes. Ronda el 32 %. En temporal el desempleo sube al 6,70 % (unos
 * 33 %). Fuente: Orden de cotización 2026 (resúmenes de Cuatrecasas y de
 * Asepeyo, "Bases y tipos de cotización 2026"); el 1,50 % de accidentes es de
 * un sitio de terceros y NO está comprobado contra la tarifa oficial. Por eso
 * es editable.
 */
export const COTIZACION_EMPRESA_PCT_DEFECTO = 32

/** Qué es la cifra del catálogo y cuánto se le suma. Un plan de antes, sin `costeBase`, ya traía coste de empresa. */
export function baseDeCoste(settings: Settings | undefined): { base: 'bruto' | 'empresa'; cotizacionPct: number; factor: number } {
  if (!settings || settings.costeBase !== 'bruto') return { base: 'empresa', cotizacionPct: 0, factor: 1 }
  const raw = settings.cotizacionEmpresaPct
  const cotizacionPct = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.min(60, raw) : COTIZACION_EMPRESA_PCT_DEFECTO
  return { base: 'bruto', cotizacionPct, factor: 1 + cotizacionPct / 100 }
}

export interface CostSummary {
  byRole: RoleCost[]
  /**
   * Coste de EMPRESA semanal de lo que SÍ tiene precio: sueldo bruto más la
   * Seguridad Social de la empresa. Lo que de verdad sale de la cuenta, y lo
   * que se compara con las ventas. Se paga las 52 semanas, vacaciones y
   * festivos incluidos.
   */
  weeklyEur: number
  /** El semanal por 52. */
  annualEur: number
  /** Solo el sueldo bruto semanal, sin la Seguridad Social. `null` si el catálogo ya es coste de empresa. */
  weeklyBrutoEur: number | null
  /** Qué se puso en el catálogo y cuánto se le ha sumado. */
  base: 'bruto' | 'empresa'
  cotizacionPct: number
  /** Coste de empresa por hora DE CONTRATO, media de la plantilla con precio. */
  avgHourlyEur: number
  /**
   * Coste de empresa por hora TRABAJADA: el anual entre las horas que de verdad
   * se trabajan, sin las vacaciones ni los festivos, que se pagan y no se
   * trabajan. Las pagas extra ya van dentro si el bruto por hora sale del
   * bruto del año. Con los valores de partida, unas 1,5 veces el bruto por
   * hora de contrato. Es la cifra que se compara con el precio por hora de un
   * extra, que solo cobra la hora que trabaja.
   */
  costeHoraTrabajadaEur: number
  /**
   * Horas a la semana entre las 22:00 y las 06:00, el plus de nocturnidad
   * aplicado y lo que suma (ya dentro de `weeklyEur` y de cada puesto). Con el
   * plus a 0 el coste no lo incluye, y las horas sirven para decirlo.
   */
  nocturnidad: { horasSemana: number; pct: number; weeklyEur: number }
  /** Puestos con gente pero sin coste: la cifra de arriba no los incluye. */
  missing: string[]
  /** True si TODOS los puestos con gente tienen precio. */
  complete: boolean
}

/**
 * Traduce la plantilla a euros con el coste por categoría del catálogo.
 *
 * Devuelve `null` si no hay ni un solo puesto con precio: sin dato del
 * usuario no se enseña ninguna cifra, y **nunca se rellena con un precio de
 * mercado ni de Shifty**. Si solo algunos puestos tienen precio, se devuelve
 * lo que se sabe y la lista de los que faltan, para poder decirlo en pantalla
 * en vez de presentar un total incompleto como si fuera el total.
 *
 * Con `settings.costeBase === 'bruto'` la cifra del catálogo es sueldo bruto y
 * se le suma la Seguridad Social de la empresa (`baseDeCoste`). Sin `settings`
 * o en un plan de antes, se usa tal cual, como siempre.
 */
export function summarizeCost(
  roster: Roster,
  model: StaffingModel,
  settings?: Settings,
  weeksPerYear = WEEKS_PER_YEAR,
): CostSummary | null {
  const { base, cotizacionPct, factor } = baseDeCoste(settings)
  const rawNoche = settings?.plusNocturnidadPct
  const plusNochePct = typeof rawNoche === 'number' && Number.isFinite(rawNoche) && rawNoche > 0 ? Math.min(100, rawNoche) : 0
  /** Horas de noche por persona, del cuadrante tal cual. */
  const nochePorPersona = new Map<string, number>()
  for (const sh of roster.shifts) {
    nochePorPersona.set(sh.personId, (nochePorPersona.get(sh.personId) ?? 0) + minutosDeNoche(sh) / 60)
  }
  const horasNoche = [...nochePorPersona.values()].reduce((a, b) => a + b, 0)
  let weeklyNoche = 0
  const byRole: RoleCost[] = []
  let weeklyBruto = 0
  let pricedHours = 0
  const missing: string[] = []
  let anyPriced = false

  for (const role of model.roles) {
    const people = roster.people.filter((p) => p.roleId === role.id)
    if (people.length === 0) continue
    const contractedHours = people.reduce((a, p) => a + p.contractHours, 0)
    const cost = role.hourlyCostEur

    if (cost === null || !Number.isFinite(cost) || cost <= 0) {
      missing.push(role.name)
      byRole.push({ roleId: role.id, name: role.name, people: people.length, contractedHours, weeklyEur: null, weeklyEurEntero: null })
      continue
    }

    anyPriced = true
    weeklyBruto += contractedHours * cost
    pricedHours += contractedHours
    // El plus va sobre el bruto de la hora de noche, y cotiza como el resto.
    const nocheRol = people.reduce((a, p) => a + (nochePorPersona.get(p.id) ?? 0), 0) * cost * (plusNochePct / 100) * factor
    weeklyNoche += nocheRol
    byRole.push({
      roleId: role.id,
      name: role.name,
      people: people.length,
      contractedHours,
      weeklyEur: contractedHours * cost * factor + nocheRol,
      weeklyEurEntero: null,
    })
  }

  if (!anyPriced) return null

  const weeklyEur = weeklyBruto * factor + weeklyNoche
  repartirEnteros(byRole, Math.round(weeklyEur))
  const avgHourlyEur = pricedHours > 0 ? weeklyEur / pricedHours : 0
  const tiempo = tiempoDisponible(parametrosAusencia(settings ?? ({} as Settings)))
  return {
    byRole,
    weeklyEur,
    // El año sale del coste semanal YA redondeado al euro, que es el que se
    // enseña: "9.200 € a la semana y 478.421 € al año" no cuadraba al
    // multiplicar por 52 (revisión ronda 8, m1). La diferencia con el exacto
    // es de menos de medio euro por semana.
    annualEur: Math.round(weeklyEur) * weeksPerYear,
    weeklyBrutoEur: base === 'bruto' ? weeklyBruto : null,
    base,
    cotizacionPct,
    avgHourlyEur,
    // La hora trabajada se calcula siempre sobre el año entero: un fijo
    // discontinuo genera vacaciones y festivos en proporción a lo que trabaja,
    // así que la relación entre hora de contrato y hora trabajada es la misma.
    costeHoraTrabajadaEur: (avgHourlyEur * WEEKS_PER_YEAR) / tiempo.semanasTrabajadas,
    nocturnidad: { horasSemana: horasNoche, pct: plusNochePct, weeklyEur: weeklyNoche },
    missing,
    complete: missing.length === 0,
  }
}
