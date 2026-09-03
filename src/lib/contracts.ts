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
