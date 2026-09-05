/**
 * Informe descargable: un one-pager en PDF con la conclusión del cálculo, para
 * que el cliente se lo lleve o se lo enseñe a quien decide. Se dibuja entero
 * con jsPDF — vectorial, sin capturar la pantalla — así que pesa poco y el
 * texto sale nítido a cualquier zoom. No lleva nada del DOM: son los mismos
 * números que ya se ven en `StepResult`, pasados como datos.
 *
 * jsPDF se importa de forma perezosa (`import()` dentro de la función, no en
 * la cabecera): son ~130 KB gzip que nadie necesita hasta que pulsa
 * "Descargar informe", y este proyecto presume de cargar rápido en el primer
 * paso. Cargarlo por delante penalizaría a todo el mundo por un botón que
 * solo se usa al final.
 */

const BRAND = '#6C0FD8'
const BRAND_DARK = '#4A0A94'
const INK = '#111118'
const MUTED = '#71717A'
const LIGHT = '#F4ECFC'
const LINE = '#E4E4E7'

export interface ReportInput {
  totalPeople: number
  mix: string
  fte: number
  contractedHours: number
  neededHours: number
  coveragePct: number
  weeksCovered: number
  totalWeeks: number
  fteFromHours: number
  peakDayLabel: string
  peakSlotLabel: string
  peakPeople: number
  topPeakRoleName: string | null
  topPeakCount: number
  peakWeekCount: number
  peakHoursPerYear: number
  extraPeopleIfHired: number
  /** Coste medio por hora de la plantilla, solo si el catálogo de puestos tiene precios. */
  hourlyCostEur: number | null
  weeklyCostEur: number | null
  annualCostEur: number | null
  peakHiredAnnualCostEur: number | null
  peakOnlyAnnualCostEur: number | null
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const nf = new Intl.NumberFormat('es-ES')
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export async function downloadReport(input: ReportInput): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const margin = 16
  let y: number

  // ── Cabecera de marca ──
  const headerH = 36
  doc.setFillColor(...hexToRgb(BRAND))
  doc.rect(0, 0, W, headerH, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(23)
  doc.text('shifty', margin, 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Planificador de plantilla · informe gratuito', margin, 27)

  const dateLabel = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
  doc.text(dateLabel, W - margin, 19, { align: 'right' })
  doc.text('shifty.es', W - margin, 27, { align: 'right' })

  y = headerH + 20

  // ── Titular ──
  doc.setTextColor(...hexToRgb(INK))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.text(
    `${input.totalPeople} ${plural(input.totalPeople, 'persona', 'personas')} en plantilla fija`,
    margin,
    y,
  )
  y += 11

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12.5)
  doc.setTextColor(...hexToRgb(MUTED))
  const coverLine =
    input.peakWeekCount > 0
      ? `Cubre ${input.weeksCovered} de ${input.totalWeeks} semanas del año. Las otras ${input.peakWeekCount} son picos, para extras.`
      : `Cubre las ${input.totalWeeks} semanas del año sin pedir ayuda.`
  doc.text(coverLine, margin, y)
  y += 18

  // ── Cifras ──
  const stats: [string, string, string][] = [
    ['Personas', String(input.totalPeople), input.mix],
    ['Jornadas equiv.', nf1.format(input.fte), 'Sobre jornada de 40 h'],
    [
      'Horas contratadas',
      `${nf1.format(input.contractedHours)} h`,
      `La curva pide ${nf1.format(input.neededHours)} h`,
    ],
    ['Cobertura', `${input.coveragePct}%`, `${input.weeksCovered} de ${input.totalWeeks} semanas`],
  ]
  const statW = (W - margin * 2) / stats.length
  stats.forEach(([label, value, hint], i) => {
    const x = margin + i * statW
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text(label.toUpperCase(), x, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(23)
    doc.setTextColor(...hexToRgb(BRAND))
    doc.text(value, x, y + 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text(doc.splitTextToSize(hint, statW - 4), x, y + 16)
  })
  y += 32
  doc.setDrawColor(...hexToRgb(LINE))
  doc.line(margin, y, W - margin, y)
  y += 15

  // ── El pico manda ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const costLine =
    input.weeklyCostEur !== null && input.annualCostEur !== null
      ? ` Con los costes de tu catálogo, esta plantilla sale por ${eur.format(input.weeklyCostEur)} a la semana y ${eur.format(input.annualCostEur)} al año.`
      : ''
  const insightLines: string[] = doc.splitTextToSize(
    `Por horas bastarían ${nf1.format(input.fteFromHours)} ${plural(input.fteFromHours, 'jornada completa', 'jornadas completas')}. Son ${input.totalPeople} ${plural(input.totalPeople, 'persona', 'personas')} porque manda el pico: el ${input.peakDayLabel} a las ${input.peakSlotLabel} necesitas ${input.peakPeople} a la vez${input.topPeakRoleName ? `, ${input.topPeakCount} de ${input.topPeakRoleName}` : ''}. Esa gente está en nómina aunque entre todos no llenen la jornada.${costLine}`,
    W - margin * 2 - 12,
  )
  const insightH = insightLines.length * 6.3 + 14
  doc.setFillColor(...hexToRgb(LIGHT))
  doc.roundedRect(margin, y, W - margin * 2, insightH, 2, 2, 'F')
  doc.setTextColor(...hexToRgb(BRAND_DARK))
  doc.text(insightLines, margin + 6, y + 9)
  y += insightH + 14

  // ── Los picos → Shifty ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  const peakCostLine =
    input.hourlyCostEur !== null && input.peakHiredAnnualCostEur !== null && input.peakOnlyAnnualCostEur !== null
      ? ` A tu coste, contratar fijo son ${eur.format(input.peakHiredAnnualCostEur)} al año; cubrir solo esas horas de pico son ${eur.format(input.peakOnlyAnnualCostEur)}.`
      : ''
  const boxBodyLines: string[] =
    input.peakWeekCount > 0
      ? doc.splitTextToSize(
          `${nf.format(input.peakHoursPerYear)} horas-persona de más al año. Cubrirlas contratando son +${input.extraPeopleIfHired} ${plural(input.extraPeopleIfHired, 'persona', 'personas')} en nómina las ${input.totalWeeks} semanas para tapar solo ${input.peakWeekCount}.${peakCostLine} Los picos no se contratan, se cubren: para eso existe Shifty — personal de hostelería con experiencia, por horas, el día que lo necesitas y solo ese día.`,
          W - margin * 2 - 14,
        )
      : doc.splitTextToSize(
          `Al ${input.coveragePct}% estás dimensionando para tu peor semana las ${input.totalWeeks} del año: ninguna se queda fuera, pero también pagas el peor mes los doce meses. Bajar la línea y cubrir las semanas punta con extras de Shifty suele salir más barato que tener a todo el mundo en nómina todo el año.`,
          W - margin * 2 - 14,
        )
  const boxTitle =
    input.peakWeekCount > 0
      ? `${input.peakWeekCount} ${plural(input.peakWeekCount, 'semana', 'semanas')} al año se salen de tu plantilla`
      : 'No dejas ninguna semana fuera'
  const boxH = 14 + boxBodyLines.length * 6.3 + 10

  doc.setFillColor(...hexToRgb(BRAND))
  doc.roundedRect(margin, y, W - margin * 2, boxH, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(boxTitle, margin + 7, y + 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.text(boxBodyLines, margin + 7, y + 22)

  // ── Pie ──
  doc.setDrawColor(...hexToRgb(LINE))
  doc.line(margin, H - 14, W - margin, H - 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...hexToRgb(MUTED))
  doc.text(
    'Generado con el planificador gratuito de Shifty · shifty.es · Cálculo hecho en tu navegador, sin guardar ningún dato.',
    margin,
    H - 8,
  )

  doc.save('shifty-plantilla.pdf')
}
