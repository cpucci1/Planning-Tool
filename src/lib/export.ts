/**
 * Exportación completa del plan.
 *
 * El CSV del cuadrante y el PDF de una página cuentan el resultado, pero no
 * los criterios con los que salió. Esto se lleva las tres cosas: la plantilla
 * puesto a puesto, el coste, y todos los parámetros con los que se calculó —
 * para poder revisarlo con alguien, guardarlo o rehacerlo dentro de un año.
 *
 * Un solo CSV con secciones, no varios ficheros: se abre en Excel de un clic,
 * que es donde va a acabar de todas formas.
 */

import type { Roster, Settings, StaffingModel } from './types'
import type { CostSummary } from './contracts'
import { agruparContratos, baseDeCoste } from './contracts'
import { coberturaAusencias } from './ausencias'
import { esMando } from './roster'
import { describirDuraciones } from './demand'
import { DAYS, SLOTS_PER_DAY, formatMin, formatRange, slotStartMin } from './time'
import type { OpeningHours } from './types'

/**
 * Un número como lo lee un Excel en castellano: coma decimal y sin separador
 * de miles. Con el punto, 11.5 se convertía en el 11 de mayo y 37.5 quedaba
 * como texto (revisión ronda 5, M4). El CSV del cuadrante ya lo hacía así
 * (`fmtNum` en RosterGrid.tsx), y los dos ficheros tienen que leerse igual.
 * Sin miles a propósito: "1.316" en una celda suelta se puede leer como 1,316
 * en un Excel en inglés, y "1316" no se puede leer mal en ninguno.
 */
function numeroEs(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 2, useGrouping: false })
}

/**
 * El cuadrante en filas: una por persona, en el orden de los bloques y de los
 * puestos, con lo que hace cada día. Lo usan el CSV del cuadrante y el de
 * "todo" (ronda 7, M2 de pantallas: "todo" no traía ni un turno), para que los
 * dos digan lo mismo turno a turno.
 */
export function filasDelCuadrante(roster: Roster, model: StaffingModel): string[][] {
  const out: string[][] = [['Zona', 'Puesto', 'Persona', 'Contrato', 'Horas asignadas', ...DAYS]]
  const porPersonaDia = new Map<string, typeof roster.shifts>()
  for (const s of roster.shifts) {
    const k = `${s.personId}|${s.day}`
    const arr = porPersonaDia.get(k)
    if (arr) arr.push(s)
    else porPersonaDia.set(k, [s])
  }
  const puestos = new Map(model.roles.map((r) => [r.id, r]))
  const colocadas = new Set<string>()
  const fila = (bloque: string, p: (typeof roster.people)[number]) => [
    bloque,
    puestos.get(p.roleId)?.name ?? '',
    p.label,
    `${numeroEs(p.contractHours)} h`,
    numeroEs(p.assignedHours),
    ...DAYS.map((_, d) => {
      const lista = porPersonaDia.get(`${p.id}|${d}`) ?? []
      if (lista.length === 0) return 'Libra'
      return lista.flatMap((s) => s.blocks.map((b) => formatRange(b.startMin, b.endMin))).join(' + ')
    }),
  ]
  for (const block of model.blocks) {
    for (const role of model.roles.filter((r) => r.blockId === block.id)) {
      for (const p of roster.people) {
        if (p.roleId !== role.id) continue
        colocadas.add(p.id)
        out.push(fila(block.name, p))
      }
    }
  }
  for (const p of roster.people) if (!colocadas.has(p.id)) out.push(fila('Sin zona', p))
  return out
}

/** Un tramo seguido de un día con la misma gente sin cubrir. */
export interface FranjaSinCubrir {
  roleId: string
  day: number
  startMin: number
  endMin: number
  people: number
}

/** Agrupa las franjas descubiertas en tramos contiguos con la misma falta. */
export function franjasSinCubrir(uncovered: Record<string, number[][]>): FranjaSinCubrir[] {
  const gaps: FranjaSinCubrir[] = []
  for (const roleId of Object.keys(uncovered)) {
    const byDay = uncovered[roleId] ?? []
    for (let d = 0; d < byDay.length; d++) {
      const row = byDay[d] ?? []
      let start = 0
      let value = 0
      for (let s = 0; s <= SLOTS_PER_DAY; s++) {
        const v = s < SLOTS_PER_DAY ? (row[s] ?? 0) : 0
        if (v === value) continue
        if (value > 0) {
          gaps.push({ roleId, day: d, startMin: slotStartMin(start), endMin: slotStartMin(s), people: value })
        }
        start = s
        value = v
      }
    }
  }
  return gaps.sort((a, b) => a.day - b.day || a.startMin - b.startMin)
}

/**
 * El CSV del cuadrante, el mismo desde el sub-paso "El cuadrante" y desde
 * "Llévatelo" (ronda 7, M2): quien va directo al final a por el cuadrante
 * para colgarlo el lunes no lo encontraba ahí.
 */
export function buildCuadranteCsv(roster: Roster, model: StaffingModel): string {
  const contratadas = roster.people.reduce((a, p) => a + p.contractHours, 0)
  const mezcla = agruparContratos(roster.people)
    .map((c) => `${c.count} de ${numeroEs(c.hours)} h`)
    .join(', ')
  const rows: string[][] = [
    ['Cuadrante semanal, planificador de plantilla de Shifty'],
    [`${roster.people.length} personas`, mezcla, `${numeroEs(contratadas)} h contratadas`],
    [],
    ...filasDelCuadrante(roster, model),
  ]
  const gaps = franjasSinCubrir(roster.uncovered)
  if (gaps.length > 0) {
    const puestos = new Map(model.roles.map((r) => [r.id, r.name]))
    rows.push([], ['Franjas sin cubrir'], ['Puesto', 'Día', 'Desde', 'Hasta', 'Personas que faltan'])
    for (const g of gaps) {
      rows.push([puestos.get(g.roleId) ?? g.roleId, DAYS[g.day], formatMin(g.startMin), formatMin(g.endMin), String(g.people)])
    }
  }
  return rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

/** Descarga el CSV del cuadrante. BOM y ';', que es lo que espera Excel en España. */
export function downloadCuadranteCsv(roster: Roster, model: StaffingModel): void {
  descargar(buildCuadranteCsv(roster, model), 'cuadrante-shifty.csv')
}

function descargar(csv: string, nombre: string): void {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  // Enganchado al documento antes de pulsarlo: un enlace suelto no descarga
  // en Firefox. Mismo patrón que persistence.ts.
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function cell(value: string | number): string {
  const s = typeof value === 'number' ? numeroEs(value) : value
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function hoursLine(hours: OpeningHours | null): string[] {
  if (!hours) return ['Sin horario definido']
  return DAYS.map((day, d) => {
    const blocks = hours[d] ?? []
    if (blocks.length === 0) return `${day}: cerrado`
    return `${day}: ${blocks.map((b) => `${formatMin(b.startMin)}-${formatMin(b.endMin)}`).join(' y ')}`
  })
}

export interface ExportInput {
  roster: Roster
  model: StaffingModel
  settings: Settings
  cost: CostSummary | null
  hours: OpeningHours | null
  kitchenHours: OpeningHours | null
  coveragePct: number
  weeksCovered: number
  totalWeeks: number
  neededHours: number
  contractedHours: number
  slackHours: number
  /** El reparto de `slackHours` que ya trae el plan (`summarizePlan`), la misma fuente que la pantalla. */
  slackDesglose?: { enElLocal: number; sinTurno: number; sinCubrir?: number }
  /** Semanas que se pagan al año (`temporadaDelLocal`); sin él, las 52. */
  semanasDePago?: number
  /** Semanas que el local cierra (`temporadaDelLocal`): sus vacaciones no se cubren otra vez (ronda 7, G1). */
  semanasCerradas?: number
}

/** Arma el CSV completo. Separado de la descarga para poder probarlo. */
export function buildPlanCsv(input: ExportInput): string {
  const rows: (string | number)[][] = []
  const add = (...r: (string | number)[]) => rows.push(r)

  add('PLANTILLA POR PUESTO')
  const base = baseDeCoste(input.settings)
  // Con los costes apagados el CSV no lleva ni un euro, igual que la pantalla
  // (revisión ronda 5, M3). Antes miraba si el puesto tenía precio, y con
  // precios puestos y "calcular costes" apagado sacaba sueldo y coste por
  // puesto mientras la sección de coste decía "sin costes".
  const conCostes = input.cost !== null
  add(
    'Zona',
    'Puesto',
    'Personas',
    'Horas contratadas/semana',
    ...(conCostes
      ? [base.base === 'bruto' ? 'Sueldo bruto/hora' : 'Coste de empresa/hora', 'Coste de empresa/semana']
      : []),
  )
  for (const block of input.model.blocks) {
    for (const role of input.model.roles.filter((r) => r.blockId === block.id)) {
      const own = input.roster.people.filter((p) => p.roleId === role.id)
      if (own.length === 0) continue
      const h = own.reduce((a, p) => a + p.contractHours, 0)
      // Misma guarda que `summarizeCost`: un precio a 0, nulo o roto es "sin
      // definir", no un coste de cero euros.
      const c = role.hourlyCostEur
      const tienePrecio = c !== null && Number.isFinite(c) && c > 0
      // El del resumen de coste si lo hay, que lleva también la nocturnidad:
      // así los puestos suman el total de abajo.
      const delResumen = input.cost?.byRole.find((r) => r.roleId === role.id)?.weeklyEurEntero
      add(
        block.name,
        role.name,
        own.length,
        h,
        ...(conCostes
          ? [
              tienePrecio ? c : 'sin definir',
              tienePrecio ? Math.round(delResumen ?? h * c * base.factor) : 'sin definir',
            ]
          : []),
      )
    }
  }

  add('')
  add('PERSONAS')
  add('Nombre', 'Puesto', 'Jornada', 'Horas asignadas', 'Libra')
  for (const p of input.roster.people) {
    const role = input.model.roles.find((r) => r.id === p.roleId)
    add(
      p.label,
      role?.name ?? '',
      `${numeroEs(p.contractHours)} h`,
      p.assignedHours,
      p.daysOff.map((d) => DAYS[d]).join(', '),
    )
  }

  add('')
  add('CUADRANTE DE LA SEMANA TIPO')
  for (const f of filasDelCuadrante(input.roster, input.model)) add(...f)

  add('')
  add('COSTE')
  if (input.cost) {
    if (input.cost.weeklyBrutoEur !== null) {
      add('Sueldo bruto semanal', Math.round(input.cost.weeklyBrutoEur))
      add('Seguridad Social de la empresa (%)', input.cost.cotizacionPct)
    }
    add('Coste de empresa semanal', Math.round(input.cost.weeklyEur))
    // Las semanas que de verdad se pagan: un local de temporada salía como
    // "anual (52 semanas)" con el importe de 23 (revisión ronda 6, m2).
    const semanas = input.semanasDePago ?? 52
    add(`Coste de empresa anual (${numeroEs(semanas)} ${semanas === 1 ? 'semana' : 'semanas'} de pago)`, Math.round(input.cost.annualEur))
    add('Coste de empresa por hora de contrato', Math.round(input.cost.avgHourlyEur * 100) / 100)
    // "(sin vacaciones ni festivos)" se leía al revés: la cifra LLEVA dentro
    // lo que se paga de vacaciones y festivos sin trabajarse (ronda 6, m3).
    add('Coste de empresa por hora trabajada (con vacaciones y festivos pagados dentro)', Math.round(input.cost.costeHoraTrabajadaEur * 100) / 100)
    add('Horas nocturnas/semana (22:00 a 06:00)', Math.round(input.cost.nocturnidad.horasSemana * 10) / 10)
    add(
      'Plus de nocturnidad',
      input.cost.nocturnidad.pct > 0
        ? `${numeroEs(input.cost.nocturnidad.pct)} %, ${Math.round(input.cost.nocturnidad.weeklyEur)} € a la semana, ya sumado`
        : 'no sumado: ponlo si tu convenio lo paga',
    )
    if (!input.cost.complete) add('Puestos sin coste definido', input.cost.missing.join(', '))
  } else {
    add('Sin costes: el cálculo de costes está apagado o falta el coste por hora en Tus puestos')
  }

  add('')
  add('CUANDO FALTA ALGUIEN')
  {
    const a = coberturaAusencias(input.roster.people, input.settings, 40, input.semanasDePago, input.semanasCerradas)
    add('Vacaciones (días naturales)', a.parametros.vacacionesDias)
    if (a.vacacionesEnCierreDias > 0) add('De ellas, con el local cerrado (no se cubren)', a.vacacionesEnCierreDias)
    add('Festivos al año', a.parametros.festivosDias)
    add('Bajas (% del tiempo disponible)', a.parametros.bajasPct)
    add('Horas de ausencia al año que cubrir', Math.round(a.horasACubrirAno))
    add('Jornadas completas para cubrirlas', Math.round(a.jornadasExtra * 10) / 10)
  }

  add('')
  add('CRITERIOS DE CÁLCULO')
  add('Cobertura', `${input.coveragePct}%`)
  add('Semanas cubiertas', `${input.weeksCovered} de ${input.totalWeeks}`)
  add('Margen de seguridad', `${input.settings.safetyMarginPct}%`)
  // El nombre de la pantalla, no el interno ("calibrado"). Ronda 6, m3.
  add('Dimensionado', input.settings.sizingMode === 'calibrado' ? 'Ajustado al histórico' : 'Con más margen')
  if (input.settings.mealMinutes) {
    add('Duración de cada estancia', describirDuraciones(input.settings.mealMinutes))
  } else {
    add('Adelanto respecto al cobro', `${input.settings.lagMinutes} min`)
  }
  add('Turno más largo', `${numeroEs(input.settings.maxShiftMinutes / 60)} h`)
  add('Turno más corto', `${numeroEs(input.settings.minShiftMinutes / 60)} h`)
  add('Jornada partida', input.settings.allowSplitShifts ? 'sí' : 'no')
  add('Dos días de libranza seguidos', input.settings.consecutiveDaysOff ? 'sí' : 'no')
  add('12 h de descanso entre turnos', input.settings.minRestBetweenShifts ? 'sí' : 'no')
  // Los contratos que de verdad salen, no la lista de partida: con contratos a
  // medida salen 34 h, 31 h... y el CSV decía "40h, 30h, 20h, 15h".
  add(
    'Contratos del plan',
    agruparContratos(input.roster.people)
      .map((c) => `${c.count} de ${numeroEs(c.hours)} h`)
      .join(', '),
  )
  for (const block of input.model.blocks) {
    const min = input.settings.minStaffByBlock[block.id] ?? 0
    if (min > 0) add(`Mínimo de personal en ${block.name}`, `${min} personas`)
    const prep = input.settings.prepByBlock?.[block.id]
    if (prep && (prep.beforeMin > 0 || prep.afterMin > 0)) {
      add(`Preparación en ${block.name}`, `${prep.beforeMin} min antes, ${prep.afterMin} min después`)
    }
  }
  // Las tres en fila, para que la resta se vea: lo que pide el servicio, lo que
  // está en turnos y lo que está en contrato. El nombre es el de la pantalla.
  // Con un decimal, como la pantalla y el PDF: "489" frente a "488,5 h" se
  // leía como otra cifra (ronda 7, m5 de pantallas).
  add('Horas que pide el servicio/semana', Math.round(input.neededHours * 10) / 10)
  add('Horas en turnos/semana', Math.round(input.roster.people.reduce((x, p) => x + p.assignedHours, 0) * 10) / 10)
  add('Horas contratadas/semana', Math.round(input.contractedHours * 10) / 10)
  // Las horas pagadas sin servicio, partidas en lo que la gente está en el
  // local de más (lo mismo que "En turno sin servicio" en pantalla) y lo que es
  // contrato sin turno. Las dos suman la de abajo.
  // Del reparto del plan, que es el que enseña la pantalla; sin él (un plan de
  // antes), se deduce con la misma cuenta.
  const sinTurno =
    input.slackDesglose?.sinTurno ??
    Math.max(0, input.contractedHours - input.roster.people.reduce((a, p) => a + p.assignedHours, 0))
  const enElLocal = input.slackDesglose?.enElLocal ?? input.slackHours - sinTurno
  add('Horas en turno sin servicio/semana', Math.round(enElLocal * 10) / 10)
  add('Horas de contrato sin turno/semana', Math.round(sinTurno * 10) / 10)
  add('Horas pagadas sin servicio/semana', Math.round(input.slackHours * 10) / 10)

  add('')
  add('HORARIO')
  for (const line of hoursLine(input.hours)) add(line)
  if (input.kitchenHours) {
    add('')
    add('HORARIO DE COCINA')
    for (const line of hoursLine(input.kitchenHours)) add(line)
  }

  add('')
  add(input.settings.mealMinutes ? 'TRAMOS (sentados a la vez → personas)' : 'TRAMOS (comensales → personas)')
  add('Desde', 'Hasta', ...input.model.roles.map((r) => r.name))
  for (const t of input.model.tiers) {
    add(
      t.from,
      Number.isFinite(t.to) ? t.to : 'o más',
      // El mando va por horario, no por tramo (ronda 10): un 0 aquí parecía
      // que no hace falta.
      ...input.model.roles.map((r) => (esMando(r) ? 'por horario' : (t.staff[r.id] ?? 0))),
    )
  }

  return rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

/** Descarga el CSV completo. El BOM es para que Excel no rompa los acentos. */
export function downloadPlanCsv(input: ExportInput): void {
  descargar(buildPlanCsv(input), 'plantilla-completa-shifty.csv')
}
