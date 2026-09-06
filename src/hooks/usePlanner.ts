/**
 * Estado del planificador.
 *
 * Un único hook con todo el estado del flujo y los cálculos derivados. Los
 * cálculos van en `useMemo` encadenados, de forma que mover la línea de
 * cobertura solo recalcula lo que depende de ella y el cuadrante no se rehace
 * mientras el usuario arrastra.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  actualizarPlan,
  crearPlan,
  leerPlanLocal,
  olvidarPlanLocal,
  recordarPlanLocal,
  reclamarPlan,
  type PlanLocalGuardado,
} from '@/lib/backend'
import { hayBackend } from '@/lib/supabase'
import { detectSpecialWeeks } from '@/lib/holidays'
import {
  applyOpeningMinimums,
  buildNeedGrid,
  clampNeedToBlockHours,
  clampToTierMax,
  expandHours,
  summarize,
  totalPeopleGrid,
} from '@/lib/staffing'
import { buildRoster } from '@/lib/roster'
import { analyzePeaks, summarizePlan } from '@/lib/contracts'
import { decodificarPlan } from '@/lib/compartir'
import {
  SNAPSHOT_SOURCE,
  SNAPSHOT_VERSION,
  clearAutosave,
  downloadSnapshot,
  loadAutosave,
  metaOf,
  saveAutosave,
  type PlannerSnapshot,
  type SnapshotMeta,
} from '@/lib/persistence'
import {
  DEMO_COSTES_HORA,
  DEMO_VENTAS_SEMANA,
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
  { id: 'result', label: 'Tu plan', short: 'Tu plan' },
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
   * Guardado sin cuenta. `savedMeta` es la foto que había al abrir: si hay
   * algo, la pantalla de import PREGUNTA si quiere seguir con ello en vez de
   * restaurarlo solo. Esta es la pantalla de venta del producto, y un visitante
   * nuevo tiene que poder verla entera antes de que nada le salte encima.
   */
  const [savedMeta, setSavedMeta] = useState<SnapshotMeta | null>(null)
  const savedSnap = useRef<PlannerSnapshot | null>(null)
  /**
   * Este arranque vino de un enlace compartido. Mientras siga en pie:
   * - NO se autoguarda, porque el plan es de otro y machacaría el del dueño
   *   del navegador, que igual lo tenía a medias.
   * - NO se ofrece lo guardado, porque ha venido a ver ESTE plan.
   * Se levanta en cuanto toca cualquier cosa: a partir de ahí el plan ya es
   * suyo y se guarda como cualquier otro.
   */
  /**
   * El plan tal y como esta guardado en el servidor, si lo esta.
   *
   * Se guarda al llegar a la pantalla de resultado, que es el primer instante en
   * que la persona tiene algo que perder. Guardar solo despues de identificarse
   * perderia el trabajo de todo el que cierre la pestana antes, que son la
   * mayoria; y guardar desde el primer paso seria mandar datos de alguien que
   * todavia no ha visto nada a cambio.
   */
  const [planRemoto, setPlanRemoto] = useState<PlanLocalGuardado | null>(() => leerPlanLocal())
  /** Se esta guardando ahora mismo. Para poder decirlo en pantalla. */
  const [guardando, setGuardando] = useState(false)
  /** El ultimo guardado fallo. Callarse aqui es lo peor que se puede hacer. */
  const [falloGuardado, setFalloGuardado] = useState(false)
  /** Evita dos creaciones a la vez si el efecto se dispara dos veces. */
  const guardadoEnCurso = useRef(false)
  /** Siempre el `buildSnapshot` de este render. Ver `guardarEnServidor`. */
  const ultimoSnapshot = useRef<() => PlannerSnapshot | null>(() => null)

  const vieneDeEnlace = useRef(false)
  /**
   * Y esto es lo otro, que NO es lo mismo: el plan del enlace tal cual llegó,
   * sin que nadie lo haya tocado. Se baja solo en el primer disparo del
   * autoguardado, que es el de la propia carga. A partir del siguiente cambio
   * el plan ya es suyo y se guarda como cualquier otro.
   *
   * Iban juntos en un solo ref con una función `adoptarPlan()` que no llamaba
   * nadie: el resultado era que quien abría un enlace y se ponía a trabajar
   * encima no guardaba NUNCA, y al cerrar la pestaña lo perdía todo.
   */
  const enlaceSinTocar = useRef(false)
  /** Un enlace que no se puede leer: hay que decirlo, no callar. */
  const [enlaceRoto, setEnlaceRoto] = useState(false)

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

  /**
   * Aplica de una vez las tres listas del modelo, que es como las devuelven
   * las funciones de `lib/catalogo`.
   *
   * Va junto y no en tres llamadas sueltas porque las tres se mueven a la vez:
   * crear una zona añade un bloque, un puesto Y una columna en cada tramo, y
   * aplicar dos de las tres deja un instante con el modelo incoherente.
   */
  function setModelParts(next: { blocks: Block[]; roles: Role[]; tiers: Tier[] }) {
    setBlocks(next.blocks)
    setRoles(next.roles)
    setTiers(next.tiers)
  }

  /** Carga el resultado del análisis y arranca con lo detectado. */
  function loadDataset(d: DemandDataset) {
    // Un fichero nuevo es un plan NUEVO, y hay que olvidar el del servidor.
    // Sin esto, quien sube su segundo fichero sin pasar por "empezar de nuevo"
    // llega al resultado con el id y el secreto del plan anterior todavia en el
    // navegador, y el guardado hace un UPDATE: el primer plan se sobrescribe
    // con el segundo y desaparece, sin ningun error y sin que nadie lo vea.
    olvidarPlanLocal()
    setPlanRemoto(null)
    setFalloGuardado(false)
    setDataset(d)
    setHours(d.source.detectedHours)
    setSpecials(detectSpecialWeeks(d.weeks, d.year))
    // El ejemplo arranca con costes y ventas de muestra para que se vea el
    // producto entero. Un fichero de verdad NO: ahí el precio lo pone su dueño.
    //
    // El `else` no es simetría bonita, es obligatorio: quien prueba el ejemplo
    // y luego sube SU fichero por la barra de arriba se llevaría los 16 €/h de
    // encargado y las ventas de 26.000 € que nunca escribió, y el resultado le
    // daría un coste inventado con cara de dato suyo.
    if (d.source.isDemo) {
      setRoles((prev) => prev.map((r) => ({ ...r, hourlyCostEur: DEMO_COSTES_HORA[r.id] ?? null })))
      setSettings((st) => ({ ...st, weeklySalesEur: DEMO_VENTAS_SEMANA }))
    } else {
      setRoles((prev) => prev.map((r) => ({ ...r, hourlyCostEur: null })))
      setSettings((st) => ({ ...st, weeklySalesEur: null }))
    }
    setStep('demand')
  }

  function reset() {
    // Y se borra lo guardado, que es lo que espera quien pulsa "empezar de
    // nuevo": si no, al refrescar le saldría otra vez el aviso ofreciéndole
    // justo el plan que acaba de tirar.
    savedSnap.current = null
    setSavedMeta(null)
    void clearAutosave()
    // Quien empieza de cero ya no viene de ningún enlace: si esto no se baja,
    // el fichero que suba a continuación tampoco se autoguardaría, y el aviso
    // del enlace roto seguiría en pantalla hablando de algo de hace media hora.
    vieneDeEnlace.current = false
    enlaceSinTocar.current = false
    setEnlaceRoto(false)
    // Y se olvida el plan del servidor de ESTE navegador. Si no, el siguiente
    // fichero que suba se guardaria encima del plan anterior.
    olvidarPlanLocal()
    setPlanRemoto(null)
    setFalloGuardado(false)
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

  // ── Guardado sin cuenta ───────────────────────────────────

  /** La foto de lo que el usuario ha DECIDIDO. Lo derivado no se guarda: se
   *  recalcula solo al cargarla, y guardarlo sería arriesgarse a que la foto
   *  y el cálculo se contradigan. */
  function buildSnapshot(): PlannerSnapshot | null {
    if (!dataset) return null
    return {
      source: SNAPSHOT_SOURCE,
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      step,
      dataset,
      hours,
      kitchenHours,
      specials,
      blocks,
      roles,
      tiers,
      settings,
      overrides: [...overrides],
      personNames,
    }
  }

  ultimoSnapshot.current = buildSnapshot

  /**
   * Un plan compartido llega en el `#` de la dirección. Ese SÍ se carga solo:
   * quien abre un enlace lo abre para ver ese plan, no para empezar de cero.
   * Se limpia la dirección después para que un refresco no lo vuelva a
   * imponer por encima de lo que el usuario haya tocado desde entonces.
   */
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash || hash.length < 20) return
    let vivo = true
    decodificarPlan(hash).then((plan) => {
      if (!vivo) return
      if (!plan || !plan.dataset) {
        // Le han mandado un plan y no se puede abrir (enlace partido por el
        // cliente de correo, navegador antiguo). Callarse es peor: creería
        // que el plan no existía.
        setEnlaceRoto(true)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        return
      }
      vieneDeEnlace.current = true
      enlaceSinTocar.current = true
      setDataset(plan.dataset)
      setHours(plan.hours)
      setKitchenHours(plan.kitchenHours)
      setSpecials(plan.specials)
      setBlocksRaw(plan.blocks)
      setRoles(plan.roles)
      setTiers(plan.tiers)
      setSettings(plan.settings)
      setOverrides(new Map(plan.overrides))
      setPersonNames(plan.personNames ?? {})
      setStep('result')
      setSavedMeta(null)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    })
    return () => {
      vivo = false
    }
  }, [])

  /** Al abrir, mira si hay algo guardado. No lo restaura: solo lo ofrece. */
  useEffect(() => {
    let vivo = true
    loadAutosave().then((snap) => {
      // `vieneDeEnlace` se comprueba AQUÍ, no antes: IndexedDB tarda más que
      // descomprimir el hash, así que sin esto el aviso reaparecería encima
      // del plan compartido en cuanto el usuario volviera al primer paso.
      if (!vivo || !snap || vieneDeEnlace.current) return
      savedSnap.current = snap
      setSavedMeta(metaOf(snap))
    })
    return () => {
      vivo = false
    }
  }, [])

  /**
   * Autoguardado con un respiro de 600 ms: sin él se escribiría en cada tecla
   * de la tabla de tramos y en cada fotograma de un arrastre.
   */
  useEffect(() => {
    if (!dataset) return
    if (enlaceSinTocar.current) {
      // Este disparo es el del propio enlace al cargarse: ese no se guarda,
      // porque machacaría el plan a medias del dueño del navegador. El
      // siguiente ya viene de que él ha cambiado algo.
      enlaceSinTocar.current = false
      return
    }
    const t = setTimeout(() => {
      const snap = buildSnapshot()
      if (snap) void saveAutosave(snap)
    }, 600)
    return () => clearTimeout(t)
    // `buildSnapshot` lee todo el estado, así que las dependencias son los
    // trozos que de verdad cambian el plan.
  }, [dataset, hours, kitchenHours, specials, blocks, roles, tiers, settings, overrides, personNames, step])

  /** Aplica una foto guardada al estado actual. */
  function applySnapshot(snap: PlannerSnapshot) {
    setDataset(snap.dataset)
    setHours(snap.hours)
    setKitchenHours(snap.kitchenHours ?? null)
    setSpecials(snap.specials)
    setBlocksRaw(snap.blocks)
    setRoles(snap.roles)
    setTiers(snap.tiers)
    setSettings(snap.settings)
    setOverrides(new Map(snap.overrides))
    setPersonNames(snap.personNames ?? {})
    setStep(snap.step)
    setSavedMeta(null)
  }

  /** "Sigue donde lo dejaste". */
  function resumeSaved() {
    if (savedSnap.current) applySnapshot(savedSnap.current)
  }

  /** "Empiezo de cero": se olvida la foto para que no vuelva a ofrecerse. */
  function discardSaved() {
    savedSnap.current = null
    setSavedMeta(null)
    void clearAutosave()
  }

  /** El guardado de verdad: un fichero que cruza de ordenador. */
  function exportSnapshot() {
    const snap = buildSnapshot()
    if (snap) downloadSnapshot(snap)
  }

  /** Carga un fichero guardado. Devuelve false si no es de esta herramienta. */
  function importSnapshot(snap: PlannerSnapshot) {
    applySnapshot(snap)
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
    const corrected = applyLag(typical, settings.lagMinutes)
    return hours ? clampToHours(corrected, hours) : corrected
  }, [typical, settings.lagMinutes, hours])

  /**
   * La misma curva con el colchón de seguridad aplicado. Va SEPARADA de
   * `lagged` a propósito: `lagged` es lo que se pinta en los gráficos con la
   * etiqueta "comensales", y enseñar ahí un número inflado por una decisión de
   * plantilla sería mentir sobre el dato. El colchón es política de personal,
   * así que solo entra donde se traduce a personas.
   */
  const laggedStaffing = useMemo(() => {
    if (!lagged) return null
    const margin = 1 + Math.max(0, settings.safetyMarginPct || 0) / 100  // `|| 0`: ver CLAUDE.md, foto antigua sin el campo
    if (margin === 1) return lagged
    return lagged.map((day) => day.map((v) => Math.round(v * margin)))
  }, [lagged, settings.safetyMarginPct])

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
    if (!laggedStaffing) return null
    let grid = buildNeedGrid(laggedStaffing, model)
    // El horario propio de cocina solo RECORTA su necesidad, nunca la amplía
    // más allá de lo que ya marca el horario general — ver `clampNeedToBlockHours`.
    if (kitchenHours) grid = clampNeedToBlockHours(grid, model, KITCHEN_BLOCK_ID, kitchenHours)
    // El techo del tramo entra YA aquí, no solo al final: si el suelo está en
    // esta rejilla y el techo no, los picos se estiman con una plantilla que
    // el plan se niega a montar.
    return clampToTierMax(grid, laggedStaffing, model)
  }, [laggedStaffing, model, kitchenHours])

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
      // La ventana del mínimo incluye la preparación y el cierre: es
      // justamente la gente que entra antes y sale después (ver `expandHours`).
      const withPrep = (h: OpeningHours) =>
        expandHours(h, settings.prepBeforeMin || 0, settings.prepAfterMin || 0)
      grid = applyOpeningMinimums(needGridDemand, model, minStaffByBlock, (blockId) =>
        withPrep(blockId === KITCHEN_BLOCK_ID && kitchenHours ? kitchenHours : hours),
      )
    }
    // Y se vuelve a aplicar al final: si el mínimo por local se lo pudiera
    // saltar, no sería un techo.
    return laggedStaffing ? clampToTierMax(grid, laggedStaffing, model) : grid
  }, [
    needGridDemand,
    model,
    kitchenHours,
    hours,
    settings.minStaffByBlock,
    settings.prepBeforeMin,
    settings.prepAfterMin,
    laggedStaffing,
  ])

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

  // ─────────────────────────────────────────────────────────────
  // Guardado en el servidor
  //
  // Solo si hay backend configurado. Si no lo hay, TODO lo demas sigue igual:
  // el calculo, el autoguardado en el navegador y el enlace. Es un lead magnet;
  // que se caiga el servidor no puede significar que la gente no pueda calcular.
  // ─────────────────────────────────────────────────────────────

  /** Las cinco cifras del resultado que suben a columna propia para agruparlas. */
  const metricasDelPlan = useMemo(
    () => ({
      peopleCount: plan?.totalPeople ?? null,
      weeklyHours: needSummary ? Math.round(needSummary.totalHours * 10) / 10 : null,
      coveragePct: settings.coveragePct,
      peakWeeks: peaks?.peakWeeks.length ?? null,
      peakHoursYear: peaks ? Math.round(peaks.peakHoursPerYear * 10) / 10 : null,
    }),
    [plan, needSummary, settings.coveragePct, peaks],
  )

  const guardarEnServidor = useCallback(async () => {
    if (!hayBackend()) return
    if (guardadoEnCurso.current) return
    // Por el ref y no llamando a `buildSnapshot` directamente: esta funcion es
    // un useCallback, asi que se queda con el `buildSnapshot` del render en que
    // cambiaron sus dependencias. Cambiar un nombre del cuadrante NO mueve esas
    // dependencias, asi que al reintentar se guardaba la foto de antes de los
    // nombres. El ref siempre apunta al ultimo.
    const snap = ultimoSnapshot.current()
    if (!snap) return

    guardadoEnCurso.current = true
    setGuardando(true)
    setFalloGuardado(false)
    try {
      if (planRemoto) {
        await actualizarPlan(planRemoto.planId, planRemoto.editSecret, snap, metricasDelPlan)
      } else {
        const creado = await crearPlan(snap, metricasDelPlan)
        const guardado = {
          planId: creado.planId,
          shareToken: creado.shareToken,
          editSecret: creado.editSecret,
        }
        recordarPlanLocal(guardado)
        setPlanRemoto(guardado)
      }
    } catch {
      // No se enseña el error de la base. Lo que importa es que la persona sepa
      // que su plan NO esta a salvo en el servidor, y eso lo dice `falloGuardado`.
      setFalloGuardado(true)
    } finally {
      setGuardando(false)
      guardadoEnCurso.current = false
    }
  }, [planRemoto, metricasDelPlan])

  /**
   * Al llegar al resultado, se guarda.
   *
   * Solo al ENTRAR en ese paso, no en cada cambio: reescribir 8 KB en cada tecla
   * de la tabla de tramos seria absurdo. Para volver a guardar despues de tocar
   * algo esta el boton de "Guardar en mi cuenta", que llama a lo mismo.
   */
  useEffect(() => {
    if (step !== 'result') return
    if (!hayBackend()) return
    // Un plan que viene del enlace de otra persona NO se guarda. Abrir el
    // enlace de tu jefe te deja en la pantalla de resultado, asi que sin esta
    // guarda se subiria su plan como tuyo y, peor, si ya tenias uno guardado se
    // sobrescribiria con el suyo. Se guarda en cuanto la persona toca algo, que
    // es cuando el plan pasa a ser suyo de verdad.
    if (vieneDeEnlace.current) return
    void guardarEnServidor()
    // A proposito solo depende del paso: se guarda al llegar, no al cambiar nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  /** Tras entrar con el email: el plan anonimo pasa a ser suyo. */
  const reclamarEsteplan = useCallback(async () => {
    if (!planRemoto) {
      // Todavia no se habia guardado (por ejemplo si el guardado fallo antes).
      // Se guarda ahora, y al crearlo ya con sesion nace suyo.
      await guardarEnServidor()
      return
    }
    await reclamarPlan(planRemoto.planId, planRemoto.editSecret)
  }, [planRemoto, guardarEnServidor])

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
    personNames,
    setTypicalOverride,
    clearOverrides,
    setPersonName,
    setMinStaffForBlock,
    setModelParts,
    savedMeta,
    enlaceRoto,
    planRemoto,
    guardando,
    falloGuardado,
    guardarEnServidor,
    reclamarEstePlan: reclamarEsteplan,
    resumeSaved,
    discardSaved,
    exportSnapshot,
    importSnapshot,
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
