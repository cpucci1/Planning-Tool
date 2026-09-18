/**
 * El informe descargable, en dos versiones.
 *
 * Es el único entregable que sale de la herramienta y se va por correo o se
 * imprime, así que es lo que ve un socio, una gestoría o un jefe que no ha
 * pasado por las cuatro pantallas. Por eso aquí pesa más el remate que en
 * cualquier otro sitio del producto.
 *
 * ── LAS DOS VERSIONES ────────────────────────────────────────────────────
 * - `resumen`: UNA página. La conclusión, las cuatro cifras, de dónde sale el
 *   número, los picos y, si hay precios, lo que cuesta. Es la que se manda por
 *   WhatsApp o se pega en un correo.
 * - `completo`: varias páginas. Lo mismo y además el detalle: la plantilla
 *   persona a persona, el cuadrante de la semana, el horario, la demanda hora
 *   a hora, la revisión legal del cuadrante, las métricas y los criterios con
 *   los que se ha calculado. Es la que se lleva a una reunión.
 *
 * Las dos salen del MISMO `InformeInput`: el contenido no se recalcula por
 * versión, solo se elige qué secciones se pintan. Si un dato falta (los
 * precios son opcionales), su sección desaparece entera: nunca sale a cero.
 *
 * ── DÓNDE SE DESCARGA ────────────────────────────────────────────────────
 * Solo desde el último sub-paso, "Llévatelo". Decisión de Crescente del
 * 2026-09-18: el informe es el final del camino, y un botón de descarga a
 * mitad de la pantalla de resultado invita a llevarse el plan antes de haber
 * mirado de dónde sale.
 */

import type { Aviso, AvisoTipo } from './avisos'
import type { CostSummary } from './contracts'
import type { Metricas } from './metricas'
import type {
  NeedSummary,
  OpeningHours,
  PeakAnalysis,
  Roster,
  Settings,
  SpecialWeek,
  StaffPlan,
  StaffingModel,
  WeekDemand,
} from './types'

export type VersionInforme = 'resumen' | 'completo'

/**
 * Todo lo que el informe puede llegar a pintar, tal y como ya está calculado
 * en la pantalla de resultado. Nada se vuelve a calcular en el PDF: ese módulo
 * dibuja, no decide.
 */
export interface InformeInput {
  /** El fichero del que salió el histórico, si vino de un fichero. */
  fileName: string | null
  /** Año del histórico. */
  year: number

  /* La plantilla */
  plan: StaffPlan
  roster: Roster
  model: StaffingModel
  settings: Settings
  needSummary: NeedSummary
  /** Nombres de verdad que el usuario le ha puesto a su gente. */
  personNames: Record<string, string>

  /* La demanda */
  weeks: WeekDemand[]
  /** La semana tipo, ya corregida del desfase y recortada al horario. */
  typical: number[][]
  hours: OpeningHours | null
  kitchenHours: OpeningHours | null
  specials: SpecialWeek[]
  coveragePct: number
  weeksCovered: number

  /* Los picos */
  peaks: PeakAnalysis
  extraPeopleIfHired: number

  /* El dinero. `null` = el usuario no ha puesto precios, y entonces no hay ni
     una cifra de dinero en todo el informe. */
  cost: CostSummary | null
  ratioPersonal: number | null
  weeklySalesEur: number | null

  /* La revisión del cuadrante y sus métricas */
  avisos: Aviso[]
  comprobaciones: { tipo: AvisoTipo; nombre: string }[]
  metricas: Metricas

  /** Los criterios con los que se ha calculado, ya en castellano. */
  criterios: { label: string; value: string }[]
}

export async function descargarInforme(
  input: InformeInput,
  version: VersionInforme,
): Promise<void> {
  const { construirInforme } = await import('./informe-pdf')
  await construirInforme(input, version)
}
