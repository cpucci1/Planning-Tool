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
import { DAYS, formatMin } from './time'
import type { OpeningHours } from './types'

function cell(value: string | number): string {
  const s = String(value)
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
}

/** Arma el CSV completo. Separado de la descarga para poder probarlo. */
export function buildPlanCsv(input: ExportInput): string {
  const rows: (string | number)[][] = []
  const add = (...r: (string | number)[]) => rows.push(r)

  add('PLANTILLA POR PUESTO')
  add('Bloque', 'Puesto', 'Personas', 'Horas contratadas/semana', 'Coste/hora', 'Coste/semana')
  for (const block of input.model.blocks) {
    for (const role of input.model.roles.filter((r) => r.blockId === block.id)) {
      const own = input.roster.people.filter((p) => p.roleId === role.id)
      if (own.length === 0) continue
      const h = own.reduce((a, p) => a + p.contractHours, 0)
      const c = role.hourlyCostEur
      add(
        block.name,
        role.name,
        own.length,
        h,
        c !== null ? c : 'sin definir',
        c !== null ? Math.round(h * c) : 'sin definir',
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
      `${p.contractHours}h`,
      p.assignedHours,
      p.daysOff.map((d) => DAYS[d]).join(', '),
    )
  }

  add('')
  add('COSTE')
  if (input.cost) {
    add('Coste semanal', Math.round(input.cost.weeklyEur))
    add('Coste anual', Math.round(input.cost.annualEur))
    add('Coste medio por hora', Math.round(input.cost.avgHourlyEur * 100) / 100)
    if (!input.cost.complete) add('Puestos sin coste definido', input.cost.missing.join(', '))
  } else {
    add('Sin costes: rellena el coste por hora en el catálogo de puestos')
  }

  add('')
  add('CRITERIOS DE CÁLCULO')
  add('Cobertura', `${input.coveragePct}%`)
  add('Semanas cubiertas', `${input.weeksCovered} de ${input.totalWeeks}`)
  add('Margen de seguridad', `${input.settings.safetyMarginPct}%`)
  add('Modo de dimensionado', input.settings.sizingMode)
  add('Desgaste del dato', `${input.settings.lagMinutes} min`)
  add('Turno más largo', `${input.settings.maxShiftMinutes / 60} h`)
  add('Turno más corto', `${input.settings.minShiftMinutes / 60} h`)
  add('Jornada partida', input.settings.allowSplitShifts ? 'sí' : 'no')
  add('Dos días de libranza seguidos', input.settings.consecutiveDaysOff ? 'sí' : 'no')
  add('12 h de descanso entre turnos', input.settings.minRestBetweenShifts ? 'sí' : 'no')
  add(
    'Contratos activos',
    input.settings.contracts.filter((c) => c.enabled).map((c) => c.label).join(', '),
  )
  for (const block of input.model.blocks) {
    const min = input.settings.minStaffByBlock[block.id] ?? 0
    if (min > 0) add(`Mínimo de personal en ${block.name}`, `${min} personas`)
  }
  add('Horas necesarias/semana', Math.round(input.neededHours))
  add('Horas contratadas/semana', Math.round(input.contractedHours))
  add('Holgura/semana', Math.round(input.slackHours))

  add('')
  add('HORARIO')
  for (const line of hoursLine(input.hours)) add(line)
  if (input.kitchenHours) {
    add('')
    add('HORARIO DE COCINA')
    for (const line of hoursLine(input.kitchenHours)) add(line)
  }

  add('')
  add('TRAMOS (comensales → personas)')
  add('Desde', 'Hasta', ...input.model.roles.map((r) => r.name))
  for (const t of input.model.tiers) {
    add(
      t.from,
      Number.isFinite(t.to) ? t.to : 'o más',
      ...input.model.roles.map((r) => t.staff[r.id] ?? 0),
    )
  }

  return rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

/** Descarga el CSV completo. El BOM es para que Excel no rompa los acentos. */
export function downloadPlanCsv(input: ExportInput): void {
  const blob = new Blob(['﻿', buildPlanCsv(input)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-completa-shifty.csv'
  a.click()
  URL.revokeObjectURL(url)
}
