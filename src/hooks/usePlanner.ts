/**
 * Estado del planificador.
 *
 * Un único hook con todo el estado del flujo y los cálculos derivados. Los
 * cálculos van en `useMemo` encadenados, de forma que mover la línea de
 * cobertura solo recalcula lo que depende de ella y el cuadrante no se rehace
 * mientras el usuario arrastra.
 */

import { createContext, useContext, useMemo, useState } from 'react'
import {
  applyLag,
  clampToHours,
  coverageFromThreshold,
  coverageThreshold,
  sortDemand,
  typicalWeek,
  typicalWeekInflation,
  usableWeeks,
} from '@/lib/demand'
import { detectSpecialWeeks } from '@/lib/holidays'
import {
  applyOpeningMinimums,
  buildNeedGrid,
  clampNeedToBlockHours,
  clampToTierMax,
  summarize,
  totalPeopleGrid,
} from '@/lib/staffing'
import { buildRoster } from '@/lib/roster'
import { analyzePeaks, summarizePlan } from '@/lib/contracts'
import {
  DEFAULT_BLOCKS,
  DEFAULT_ROLES,
  DEFAULT_SETTINGS,
  DEFAULT_TIERS,
  KITCHEN_BLOCK_ID,
} from '@/data/presets'
import type {
  Block,
  DemandDataset,
  OpeningHours,
  Role,
  Settings,
  SpecialWeek,
  StaffingModel,
  StepId,
  Tier,
} from '@/lib/types'

export type { StepId }
export const STEPS: { id: StepId; label: string; short: string }[] = [
  { id: 'import', label: 'Tu histórico', short: 'Histórico' },
  { id: 'demand', label: 'Lo que hemos leído', short: 'Demanda' },
  { id: 'team', label: 'Tu equipo por tramos', short: 'Equipo' },
  { id: 'result', label: 'Tu plantilla', short: 'Plantilla' },
]

export function usePlannerState() {
  const [step, setStep] = useState<StepId>('import')
  const [dataset, setDataset] = useState<DemandDataset | null>(null)
  const [hours, setHours] = useState<OpeningHours | null>(null)
  /**
   * Horario propio de cocina, opcional. `null` = comparte el horario general.
   * Activar el toggle copia el horario general como punto de partida; el
   * cálculo solo puede usarlo para RECORTAR cuándo cocina pide personal, no
   * para añadir horas fuera del horario general — ver `clampNeedToBlockHours`.
   */
  const [kitchenHours, setKitchenHours] = useState<OpeningHours | null>(null)
  const [specials, setSpecials] = useState<SpecialWeek[]>([])
  const [blocks, setBlocksRaw] = useState<Block[]>(DEFAULT_BLOCKS)
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES)
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [seenTips, setSeenTips] = useState<Set<string>>(new Set())

  /**
   * Correcciones a mano de la semana tipo: `'dia:franja' → comensales`.
   *
   * La semana tipo es un derivado del histórico, así que no se puede "editar"
   * sin más. Estas correcciones se aplican justo encima del cálculo y entran en
   * la cadena completa (desfase → necesidad → cuadrante), de modo que tocar una
   * celda mueve de verdad el número de personas. Si solo se guardaran en la
   * pantalla, el usuario escribiría 80 comensales y no pasaría nada: eso engaña
   * más de lo que ayuda.
   */
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map())

  /**
   * Nombres reales por encima del cuadrante generado, `personId → nombre`.
   * El cuadrante se recalcula entero con cada cambio (`roster` es un
   * `useMemo`), así que un nombre no puede vivir dentro de `Person`: se
   * guarda aparte y se decora encima en el memo de `roster`, igual que
   * `overrides` decora la semana tipo. Si la composición de la plantilla
   * cambia mucho (se añade o quita gente de ese puesto), el id puede pasar a
   * referirse a otra persona — es la misma aproximación de "razonable, no
   * perfecta" que ya asume el resto del cálculo derivado.
   */
  const [personNames, setPersonNames] = useState<Record<string, string>>({})

  function setPersonName(personId: string, name: string) {
    setPersonNames((prev) => ({ ...prev, [personId]: name }))
  }

  /** Redondeado: es gente, no puede haber 2,5 personas de mínimo. */
  function setMinStaffForBlock(blockId: string, value: number) {
    setSettings((s) => ({
      ...s,
      minStaffByBlock: { ...s.minStaffByBlock, [blockId]: Math.round(value) },
    }))
  }

  function setTypicalOverride(day: number, slot: number, value: number) {
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(`${day}:${slot}`, Math.max(0, Math.round(value)))
      return next
    })
  }

  function clearOverrides() {
    setOverrides(new Map())
  }

  /** El toggle "la cocina tiene un horario distinto". Al activarlo arranca
   *  desde una copia del horario general, no en blanco. */
  function setKitchenHoursEnabled(enabled: boolean) {
    setKitchenHours(enabled ? (hours ?? []).map((day) => day.map((b) => ({ ...b }))) : null)
  }

  /**
   * Envuelve `setBlocksRaw` para podar `settings.minStaffByBlock` cuando un
   * bloque desaparece — si no, el mínimo de un bloque borrado se queda
   * huérfano en el estado para siempre (inofensivo hoy porque nadie lo lee,
   * pero es basura que confunde si alguien exporta o inspecciona el ajuste).
   */
  function setBlocks(next: Block[]) {
    setBlocksRaw(next)
    const validIds = new Set(next.map((b) => b.id))
    setSettings((s) => {
      const entries = Object.entries(s.minStaffByBlock).filter(([id]) => validIds.has(id))
      if (entries.length === Object.keys(s.minStaffByBlock).length) return s
      return { ...s, minStaffByBlock: Object.fromEntries(entries) }
    })
  }

  /** Carga el resultado del análisis y arranca con lo detectado. */
  function loadDataset(d: DemandDataset) {
    setDataset(d)
    setHours(d.source.detectedHours)
    setSpecials(detectSpecialWeeks(d.weeks, d.year))
    setStep('demand')
  }

  function reset() {
    setDataset(null)
    setHours(null)
    setKitchenHours(null)
    setSpecials([])
    setBlocks(DEFAULT_BLOCKS)
    setRoles(DEFAULT_ROLES)
    setTiers(DEFAULT_TIERS)
    setSettings(DEFAULT_SETTINGS)
    setOverrides(new Map())
    setPersonNames({})
    setStep('import')
  }

  function markTipSeen(id: string) {
    setSeenTips((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  const model: StaffingModel = useMemo(() => ({ blocks, roles, tiers }), [blocks, roles, tiers])

  const weeks = useMemo(
    () => (dataset ? usableWeeks(dataset, specials) : []),
    [dataset, specials],
  )

  /**
   * Los comensales de cada franja, ordenados. Se calcula una sola vez por
   * conjunto de semanas y es lo que hace que arrastrar la línea de cobertura
   * vaya fluido: sin esto, cada píxel de arrastre reordenaba 52 valores en
   * cada una de las 308 franjas.
   */
  const sorted = useMemo(() => sortDemand(weeks), [weeks])

  const coverage = useMemo(
    () => (weeks.length ? coverageThreshold(weeks, settings.coveragePct) : null),
    [weeks, settings.coveragePct],
  )

  /**
   * `typical` es la semana tipo TAL Y COMO VIENE EN EL FICHERO — con la hora del
   * cobro. Es la que se le enseña al usuario como "tu demanda", porque es la
   * que él reconoce.
   */
  const typical = useMemo(() => {
    if (!weeks.length) return null
    const base = typicalWeek(weeks, settings.coveragePct, settings.sizingMode, sorted)
    if (overrides.size === 0) return base
    // Las correcciones del usuario se aplican encima del percentil, antes de
    // que la curva entre en el desfase y en el cálculo de plantilla.
    const out = base.map((day) => [...day])
    for (const [key, value] of overrides) {
      const [d, s] = key.split(':').map(Number)
      if (out[d] && s >= 0 && s < out[d].length) out[d][s] = value
    }
    return out
  }, [weeks, settings.coveragePct, settings.sizingMode, sorted, overrides])

  /**
   * `lagged` es la curva de TRABAJO REAL: primero se corrige el desfase del dato
   * (el cobro va después del trabajo) y solo después se recorta al horario. Ese
   * orden importa: corregir es arreglar el dato, recortar es aplicar una regla
   * de negocio, y no tiene sentido aplicar la regla sobre el dato torcido.
   * Es la que alimenta todo el cálculo de plantilla.
   */
  const lagged = useMemo(() => {
    if (!typical) return null
    // El margen de seguridad va sobre la curva de comensales, antes de
    // traducirla a personas: es "cuenta con algo más de gente de la que dice
    // el histórico", no un ajuste de plantilla a posteriori.
    const margin = 1 + Math.max(0, settings.safetyMarginPct) / 100
    const cushioned =
      margin === 1 ? typical : typical.map((day) => day.map((v) => Math.round(v * margin)))
    const corrected = applyLag(cushioned, settings.lagMinutes)
    return hours ? clampToHours(corrected, hours) : corrected
  }, [typical, settings.lagMinutes, settings.safetyMarginPct, hours])

  const inflation = useMemo(
    () => (weeks.length ? typicalWeekInflation(weeks, settings.coveragePct, sorted) : null),
    [weeks, settings.coveragePct, sorted],
  )

  /**
   * Necesidad que sale SOLO de la curva de comensales, sin el mínimo por
   * bloque. Es la base del ratio "horas por comensal" que estima las semanas
   * punta (`analyzePeaks`, más abajo): el mínimo es un coste plano por estar
   * abierto, igual todas las semanas, así que no debe repartirse otra vez de
   * más en las semanas con más comensales — eso infla justo el número que
   * vende Shifty. El cuadrante de verdad SÍ necesita el mínimo, por eso
   * sigue en `needGrid` de abajo.
   */
  const needGridDemand = useMemo(() => {
    if (!lagged) return null
    let grid = buildNeedGrid(lagged, model)
    // El horario propio de cocina solo RECORTA su necesidad, nunca la amplía
    // más allá de lo que ya marca el horario general — ver `clampNeedToBlockHours`.
    if (kitchenHours) grid = clampNeedToBlockHours(grid, model, KITCHEN_BLOCK_ID, kitchenHours)
    return grid
  }, [lagged, model, kitchenHours])

  const needGrid = useMemo(() => {
    if (!needGridDemand) return null
    // `?? {}`: por si algún día vuelve a enchufarse `persistence.ts` con una
    // foto guardada de antes de que existiera este campo — ver CLAUDE.md.
    const minStaffByBlock = settings.minStaffByBlock ?? {}
    // El mínimo por bloque va DESPUÉS: añade el personal de apertura/cierre
    // aunque la curva esté a cero, respetando el horario propio de cada
    // bloque si lo tiene (cocina) — ver `applyOpeningMinimums`.
    let grid = needGridDemand
    if (hours && Object.values(minStaffByBlock).some((v) => v > 0)) {
      grid = applyOpeningMinimums(needGridDemand, model, minStaffByBlock, (blockId) =>
        blockId === KITCHEN_BLOCK_ID && kitchenHours ? kitchenHours : hours,
      )
    }
    // El techo por tramo va el último: si se pudiera saltar por el mínimo por
    // local, no sería un techo.
    return lagged ? clampToTierMax(grid, lagged, model) : grid
  }, [needGridDemand, model, kitchenHours, hours, settings.minStaffByBlock, lagged])

  const needSummary = useMemo(
    () => (needGrid ? summarize(needGrid, model) : null),
    [needGrid, model],
  )

  const needSummaryDemand = useMemo(
    () => (needGridDemand ? summarize(needGridDemand, model) : null),
    [needGridDemand, model],
  )

  const peopleGrid = useMemo(
    () => (needGrid ? totalPeopleGrid(needGrid, model) : null),
    [needGrid, model],
  )

  const roster = useMemo(() => {
    if (!needGrid) return null
    const built = buildRoster(needGrid, model, settings)
    if (Object.keys(personNames).length === 0) return built
    return {
      ...built,
      people: built.people.map((p) => (personNames[p.id] ? { ...p, label: personNames[p.id] } : p)),
    }
  }, [needGrid, model, settings, personNames])

  const plan = useMemo(
    () =>
      roster && needSummary && needGrid
        ? summarizePlan(roster, settings, needSummary, needGrid, model)
        : null,
    [roster, settings, needSummary, needGrid, model],
  )

  const peaks = useMemo(() => {
    if (!weeks.length || !coverage || !needSummaryDemand || !lagged) return null
    const covers = lagged.flat().reduce((a, b) => a + b, 0)
    // `needSummaryDemand`, no `needSummary`: el ratio horas/comensal que
    // estima las semanas punta solo puede venir de lo que de verdad escala
    // con los comensales. El mínimo por bloque es un coste plano, igual en
    // todas las semanas, así que no debe repartirse otra vez de más aquí.
    return analyzePeaks(weeks, coverage.threshold, needSummaryDemand.totalHours, covers)
  }, [weeks, coverage, needSummaryDemand, lagged])

  return {
    step,
    setStep,
    dataset,
    loadDataset,
    reset,
    hours,
    setHours,
    kitchenHours,
    setKitchenHoursEnabled,
    setKitchenHours,
    specials,
    setSpecials,
    blocks,
    setBlocks,
    roles,
    setRoles,
    tiers,
    setTiers,
    settings,
    setSettings,
    seenTips,
    markTipSeen,
    overrides,
    setTypicalOverride,
    clearOverrides,
    setPersonName,
    setMinStaffForBlock,
    model,
    weeks,
    coverage,
    coverageFromThreshold: (t: number) => coverageFromThreshold(weeks, t),
    typical,
    lagged,
    inflation,
    needGrid,
    needSummary,
    peopleGrid,
    roster,
    plan,
    peaks,
  }
}

export type PlannerState = ReturnType<typeof usePlannerState>

export const PlannerContext = createContext<PlannerState | null>(null)

export function usePlanner(): PlannerState {
  const ctx = useContext(PlannerContext)
  if (!ctx) throw new Error('usePlanner debe usarse dentro de PlannerContext')
  return ctx
}
