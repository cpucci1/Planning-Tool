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
  StaffingModel,
  StaffPlan,
  WeekDemand,
} from './types'

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
  const byContract = new Map<string, number>()
  let contractedHours = 0
  let assignedHours = 0

  for (const p of roster.people) {
    byContract.set(p.contractId, (byContract.get(p.contractId) ?? 0) + 1)
    contractedHours += p.contractHours
    assignedHours += p.assignedHours
  }

  const allocations = settings.contracts
    .filter((c) => (byContract.get(c.id) ?? 0) > 0)
    .sort((a, b) => b.hours - a.hours)
    .map((c) => ({ contractId: c.id, hours: c.hours, count: byContract.get(c.id) ?? 0 }))

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
  // seguidas son cinco; sin esa regla, seis, porque el descanso semanal de un
  // día no se negocia (Art. 37.1 ET).
  const diasPorPersona = settings.consecutiveDaysOff ? 5 : 6
  const peopleFromDays = model.roles.reduce((total, r) => {
    const turnos = roster.shifts.filter((sh) => sh.roleId === r.id).length
    return total + Math.ceil(turnos / diasPorPersona)
  }, 0)

  return {
    allocations,
    totalPeople: roster.people.length,
    contractedHours,
    neededHours: needSummary.totalHours,
    assignedHours,
    slackHours: Math.max(0, contractedHours - needSummary.totalHours),
    drivers: {
      fteFromHours: Math.round((needSummary.totalHours / fullTimeHours) * 10) / 10,
      peopleFromPeak: peakByRole.reduce((a, r) => a + r.peak, 0),
      peopleFromDays,
      peakByRole,
    },
  }
}

/** "6 de 40h, 2 de 20h" — el mix en una línea. */
export function describeMix(
  allocations: ContractAllocation[],
  contracts: ContractType[],
): string {
  if (allocations.length === 0) return 'Sin plantilla'
  return allocations
    .map((a) => {
      const c = contracts.find((x) => x.id === a.contractId)
      return `${a.count} de ${c?.label ?? `${a.hours}h`}`
    })
    .join(' · ')
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
  weeks: WeekDemand[],
  threshold: number,
  neededHoursTypicalWeek: number,
  typicalWeekCovers: number,
  fullTimeHours = 40,
): PeakAnalysis {
  const peaks = weeks.filter((w) => w.total > threshold)

  // Las horas extra de una semana punta se estiman con la misma productividad
  // de la semana tipo: si con X comensales hacen falta H horas, los comensales
  // de más piden proporcionalmente más horas.
  const hoursPerCover = typicalWeekCovers > 0 ? neededHoursTypicalWeek / typicalWeekCovers : 0

  const extraByWeek = peaks.map((w) => Math.max(0, w.total - threshold) * hoursPerCover)
  const peakHoursPerYear = extraByWeek.reduce((a, b) => a + b, 0)
  const worstWeekHours = extraByWeek.length ? Math.max(...extraByWeek) : 0
  const avgPeakHours = extraByWeek.length ? peakHoursPerYear / extraByWeek.length : 0

  // Cuánta gente hace falta de más en la peor semana. Este es el titular.
  const peopleInWorstWeek = Math.ceil(worstWeekHours / fullTimeHours)

  return {
    peakWeeks: peaks.map((w) => w.isoWeek),
    peakHoursPerYear: Math.round(peakHoursPerYear),
    worstWeek: peaks.length
      ? {
          isoWeek: peaks[extraByWeek.indexOf(worstWeekHours)].isoWeek,
          extraHours: Math.round(worstWeekHours),
          extraPeople: peopleInWorstWeek,
        }
      : null,
    avgExtraPeople: Math.max(1, Math.round(avgPeakHours / fullTimeHours)),
    // Contratar para el pico significa pagar esas personas las 52 semanas del
    // año, no solo las de punta. Esa es la comparación honesta.
    weeksPaidPerWeekWorked: peaks.length > 0 ? Math.round(weeks.length / peaks.length) : 0,
    weeksCovered: weeks.length - peaks.length,
  }
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
}

/**
 * Un año de nómina son 52 semanas, siempre. NO las semanas que queden en el
 * análisis: excluir la Navidad del cálculo de la demanda no hace que ese mes
 * no se pague.
 */
export const WEEKS_PER_YEAR = 52

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

export interface CostSummary {
  byRole: RoleCost[]
  /** Coste semanal de lo que SÍ tiene precio. */
  weeklyEur: number
  /** El semanal por las semanas del histórico. */
  annualEur: number
  /** Coste medio por hora de la plantilla con precio, para valorar los picos. */
  avgHourlyEur: number
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
 */
export function summarizeCost(
  roster: Roster,
  model: StaffingModel,
  weeksPerYear = WEEKS_PER_YEAR,
): CostSummary | null {
  const byRole: RoleCost[] = []
  let weeklyEur = 0
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
      byRole.push({ roleId: role.id, name: role.name, people: people.length, contractedHours, weeklyEur: null })
      continue
    }

    anyPriced = true
    const roleWeekly = contractedHours * cost
    weeklyEur += roleWeekly
    pricedHours += contractedHours
    byRole.push({
      roleId: role.id,
      name: role.name,
      people: people.length,
      contractedHours,
      weeklyEur: roleWeekly,
    })
  }

  if (!anyPriced) return null

  return {
    byRole,
    weeklyEur,
    annualEur: weeklyEur * weeksPerYear,
    avgHourlyEur: pricedHours > 0 ? weeklyEur / pricedHours : 0,
    missing,
    complete: missing.length === 0,
  }
}
