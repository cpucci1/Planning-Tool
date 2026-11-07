/**
 * La cadena entera de la demanda a la necesidad de personal, en un solo sitio.
 *
 * La usan `usePlanner` (en sus `useMemo`, un trozo cada uno para que arrastrar
 * la línea de cobertura no rehaga lo que no ha cambiado) y los guiones de
 * `scripts/`. Antes cada guion repetía la cadena a su manera y uno de ellos se
 * saltaba el mínimo por local: dos cuentas distintas para la misma pregunta.
 *
 * El orden, y por qué:
 *
 *   cobros por media hora (el fichero)
 *   → sentados a la vez (cada cobro ocupa su silla durante la comida)
 *   → recorte al horario al público
 *   → colchón de seguridad (solo para dimensionar, no se pinta)
 *   → tramos → recorte al horario propio de cocina → techo del tramo
 *   → preparación y recogida (el equipo que abre entra antes, el que cierra sale después)
 *   → trabajo fijo por puesto y servicio (mise en place, limpieza), por máximo, no sumado
 *   → el que recoge (office) se queda al cierre del último servicio
 *   → mínimo por local (con la ventana estirada por la preparación)
 *   → techo del tramo otra vez (un tope que se pudiera saltar no sería un tope)
 *
 * Los planes de antes del 2026-11-04 no traen `mealMinutes` y siguen el camino
 * de entonces: desfase de 30 min y tramos sobre cobros por media hora, con la
 * preparación global que solo estiraba el mínimo. Sus tramos están escritos en
 * esa escala, y cambiarles el cálculo por debajo les daría otra plantilla sin
 * que nadie haya tocado nada.
 */

import { applyLag, clampToHours, seatedAtOnce } from './demand'
import {
  applyCierreServicio,
  applyOpeningMinimums,
  applyPrep,
  applyTrabajoFijo,
  buildNeedGrid,
  clampNeedToBlockHours,
  clampToTierMax,
  expandHours,
} from './staffing'
import type { ContextoCuadrante } from './roster'
import { GRID_END_MIN, GRID_START_MIN } from './time'
import type { DayIndex, NeedGrid, OpeningHours, Settings, StaffingModel } from './types'

/** ¿Este plan cuenta en sentados a la vez? Los anteriores al 2026-11-04 no. */
export function usaSentados(settings: Settings): boolean {
  return !!settings.mealMinutes
}

/**
 * La curva con la que se trabaja: sentados a la vez si el plan es de los
 * nuevos, cobros adelantados el desfase si es de los de antes. Ya recortada al
 * horario.
 *
 * Los sentados se calculan sobre los cobros SIN recortar y se recortan
 * después: el último cobro de la comida cae a veces en la franja del cierre,
 * y recortarlo antes se llevaría por delante la mesa entera que lo ocupó.
 */
export function curvaDeTrabajo(
  typical: number[][],
  hours: OpeningHours | null,
  settings: Settings,
): number[][] {
  const base = settings.mealMinutes
    ? seatedAtOnce(typical, settings.mealMinutes)
    : applyLag(typical, settings.lagMinutes)
  return hours ? clampToHours(base, hours) : base
}

/** El colchón de seguridad, que solo entra donde se traduce a personas. */
export function conColchon(curve: number[][], settings: Settings): number[][] {
  const margin = 1 + Math.max(0, settings.safetyMarginPct || 0) / 100 // `|| 0`: foto antigua sin el campo
  if (margin === 1) return curve
  return curve.map((day) => day.map((v) => Math.round(v * margin)))
}

/** Necesidad que sale SOLO de la curva: sin preparación ni mínimo por local. */
export function necesidadDeServicio(
  staffingCurve: number[][],
  model: StaffingModel,
  kitchenHours: OpeningHours | null,
  kitchenBlockId: string,
): NeedGrid {
  let grid = buildNeedGrid(staffingCurve, model)
  if (kitchenHours) grid = clampNeedToBlockHours(grid, model, kitchenBlockId, kitchenHours)
  return clampToTierMax(grid, staffingCurve, model)
}

/**
 * Lo que pide estar abierto además del servicio: preparación, recogida y
 * mínimo por local. Devuelve la rejilla final, la que va al cuadrante.
 */
export function necesidadCompleta(
  demandGrid: NeedGrid,
  staffingCurve: number[][],
  model: StaffingModel,
  hours: OpeningHours | null,
  kitchenHours: OpeningHours | null,
  kitchenBlockId: string,
  settings: Settings,
): NeedGrid {
  if (!hours) return demandGrid
  const hoursFor = (blockId: string) => (blockId === kitchenBlockId && kitchenHours ? kitchenHours : hours)
  let grid = demandGrid

  const prepByBlock = settings.prepByBlock
  if (prepByBlock) grid = applyPrep(grid, model, prepByBlock, hoursFor)

  if (settings.trabajoFijo?.length) grid = applyTrabajoFijo(grid, model, settings.trabajoFijo, hoursFor)

  // El que recoge (el office) se queda hasta el cierre del último servicio.
  grid = applyCierreServicio(grid, model, hoursFor, (b) =>
    prepByBlock ? (prepByBlock[b]?.afterMin ?? 0) : settings.prepAfterMin || 0,
  )

  const minStaffByBlock = settings.minStaffByBlock ?? {}
  if (Object.values(minStaffByBlock).some((v) => v > 0)) {
    // La ventana del mínimo incluye la preparación de cada zona: es justo la
    // gente que entra antes y sale después.
    const window = (blockId: string) => {
      const p = prepByBlock
        ? (prepByBlock[blockId] ?? { beforeMin: 0, afterMin: 0 })
        : { beforeMin: settings.prepBeforeMin || 0, afterMin: settings.prepAfterMin || 0 }
      return expandHours(hoursFor(blockId), p.beforeMin, p.afterMin)
    }
    grid = applyOpeningMinimums(grid, model, minStaffByBlock, window, settings.openingRoleByBlock ?? {})
  }

  return grid === demandGrid ? grid : clampToTierMax(grid, staffingCurve, model)
}

/**
 * La preparación de cada zona, la del plan si la trae y la global si es de
 * antes. Es la misma regla que usan `necesidadCompleta` y el cuadrante.
 */
export function preparacionDe(settings: Settings, blockId: string): { beforeMin: number; afterMin: number } {
  const p = settings.prepByBlock
  return p
    ? (p[blockId] ?? { beforeMin: 0, afterMin: 0 })
    : { beforeMin: settings.prepBeforeMin || 0, afterMin: settings.prepAfterMin || 0 }
}

/**
 * Los cobros de la semana tipo, que es lo que cuentan los totales (comensales
 * por día, por hora trabajada). En los planes nuevos son los cobros a su hora,
 * recortados al horario con media hora de margen al cierre; en los de antes,
 * la misma curva de trabajo. La app (`usePlanner`) y `npm run verificar` usan
 * esta misma función, para que den la misma cifra (ronda 5).
 */
export function cobrosDeLaSemana(
  typical: number[][],
  workCurve: number[][],
  hours: OpeningHours | null,
  settings: Settings,
): number[][] {
  if (!usaSentados(settings)) return workCurve
  return hours ? clampToHours(typical, expandHours(hours, 0, 30)) : typical
}

/**
 * Lo que el cuadrante necesita además de la necesidad (ronda 5): el horario de
 * cada zona con su preparación, para el mando, y los comensales de cada día,
 * para librar en los flojos. Lo usan la app y `npm run verificar`: antes el
 * guion llamaba al cuadrante sin esto y la portada decía 9.150 € cuando la app
 * decía 9.191 €.
 */
export function contextoDelCuadrante(
  hours: OpeningHours | null,
  kitchenHours: OpeningHours | null,
  kitchenBlockId: string,
  settings: Settings,
  cobros: number[][] | null,
): ContextoCuadrante {
  const ctx: ContextoCuadrante = {}
  if (hours) {
    ctx.horarioDe = (blockId: string) => {
      const p = preparacionDe(settings, blockId)
      return expandHours(blockId === kitchenBlockId && kitchenHours ? kitchenHours : hours, p.beforeMin, p.afterMin)
    }
  }
  if (cobros) ctx.comensalesPorDia = cobros.map((day) => day.reduce((a, b) => a + b, 0))
  return ctx
}

/** Preparación que no cabe en el día del cuadrante, que empieza a las 06:00 y acaba a las 06:00 del día siguiente. */
export interface PreparacionRecortada {
  blockId: string
  /** Minutos de preparación antes de abrir que se pierden, el peor día. */
  antesMin: number
  /** Minutos de recogida después de cerrar que se pierden, el peor día. */
  despuesMin: number
  days: DayIndex[]
}

/**
 * Lo que la preparación pierde por el borde del día (ronda 5): un local que
 * abre a las 06:00 con una hora de preparación necesita gente a las 05:00, y
 * el cuadrante empieza a las 06:00. Antes se perdía sin decir nada; ahora el
 * cuadrante lo avisa. Mover el borde del día cambiaría todos los planes
 * guardados, así que se dice en vez de mover.
 */
export function preparacionRecortada(
  hours: OpeningHours | null,
  kitchenHours: OpeningHours | null,
  kitchenBlockId: string,
  settings: Settings,
  model: StaffingModel,
): PreparacionRecortada[] {
  if (!hours) return []
  const out: PreparacionRecortada[] = []
  for (const block of model.blocks) {
    const p = preparacionDe(settings, block.id)
    if (p.beforeMin <= 0 && p.afterMin <= 0) continue
    const horario = block.id === kitchenBlockId && kitchenHours ? kitchenHours : hours
    let antes = 0
    let despues = 0
    const days: DayIndex[] = []
    horario.forEach((day, d) => {
      let a = 0
      let b = 0
      // Un día que no cierra (de 06:00 a 06:00) no tiene apertura que
      // preparar ni cierre que recoger (ronda 6, m5): el aviso era falso.
      const abiertoEntero = day.some((t) => t.endMin - t.startMin >= GRID_END_MIN - GRID_START_MIN)
      if (abiertoEntero) return
      for (const t of day) {
        a = Math.max(a, GRID_START_MIN - (t.startMin - Math.max(0, p.beforeMin)))
        b = Math.max(b, t.endMin + Math.max(0, p.afterMin) - GRID_END_MIN)
      }
      if (a > 0 || b > 0) days.push(d as DayIndex)
      antes = Math.max(antes, a)
      despues = Math.max(despues, b)
    })
    if (days.length > 0) out.push({ blockId: block.id, antesMin: antes, despuesMin: despues, days })
  }
  return out
}
