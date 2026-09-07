/**
 * Guardar y recuperar planes del servidor.
 *
 * Es la unica pieza del front que habla con la base. Todo pasa por RPC: las
 * tablas no tienen ni un permiso para la clave anonima, asi que aunque alguien
 * saque la clave del bundle (es publica por diseno, se saca en diez segundos) no
 * puede llegar a los datos por otro camino.
 *
 * COMO SE PARTE UN PLAN
 * La foto del planificador son 13 campos, y uno solo, la curva de comensales,
 * es el 86,6% del peso: 17.472 enteros por plan (52 semanas x 7 dias x 48
 * franjas), y la mayoria son ceros. Medido sobre Postgres con la rejilla de 44
 * franjas que habia hasta el 2026-09-07, esa curva como jsonb ocupaba 192.198
 * bytes por plan y comprimida 8.041. Al estirar la rejilla a las 24 horas son un
 * 9% mas, y comprime aun mejor porque lo que se anade son ceros seguidos. Con
 * los 500 MB del plan gratis eso siguen siendo decenas de miles de planes.
 *
 * Por eso va partido: la curva viaja comprimida a `planning_plan_datasets` y
 * todo lo demas, que es pequeno y sirve para pintar, va en `config`.
 *
 * `src/lib/` no importa React. Esto es logica pura.
 */

import { supabase } from './supabase'
import { base64ToBytes, bytesToBase64, comprimir, descomprimir, hayCompressionStream } from './comprimir'
import { SNAPSHOT_VERSION, type PlannerSnapshot } from './persistence'
import { ajustarFranjas } from './time'
import type { DemandDataset, WeekDemand } from './types'

/** Lo que devuelve el servidor al crear un plan. El secreto viene UNA vez. */
export interface PlanCreado {
  planId: string
  shareToken: string
  editSecret: string
}

/** Las cifras del resultado que se suben a columna propia para poder agruparlas. */
export interface MetricasDelPlan {
  peopleCount: number | null
  weeklyHours: number | null
  coveragePct: number | null
  peakWeeks: number | null
  peakHoursYear: number | null
}

/**
 * Donde se guarda en ESTE navegador que un plan anonimo es nuestro.
 *
 * El secreto de edicion solo existe aqui. Si se pierde (borrar datos del
 * navegador, otro dispositivo, incognito), el plan sigue viendose por su enlace
 * pero deja de poder editarse. Es el precio de no pedir cuenta por adelantado, y
 * es un precio consciente: el guardado en el propio navegador ya cubre el caso
 * normal, y en cuanto la persona se identifica el plan pasa a ser suyo de verdad
 * y el secreto deja de hacer falta.
 */
const CLAVE_LOCAL = 'shifty-planning:plan-remoto'

export interface PlanLocalGuardado {
  planId: string
  shareToken: string
  editSecret: string
}

export function recordarPlanLocal(p: PlanLocalGuardado): void {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(p))
  } catch {
    // Safari en modo privado lanza al escribir. No es motivo para romper nada:
    // simplemente esta sesion no podra editar el plan mas tarde.
  }
}

export function leerPlanLocal(): PlanLocalGuardado | null {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCAL)
    if (!crudo) return null
    const v = JSON.parse(crudo) as PlanLocalGuardado
    return v && v.planId && v.editSecret ? v : null
  } catch {
    return null
  }
}

export function olvidarPlanLocal(): void {
  try {
    localStorage.removeItem(CLAVE_LOCAL)
  } catch {
    /* da igual */
  }
}

// ─────────────────────────────────────────────────────────────
// Partir y recomponer la foto
// ─────────────────────────────────────────────────────────────

/** La foto sin la curva de comensales. Es lo que va en `config`. */
type ConfigDelPlan = Omit<PlannerSnapshot, 'dataset'> & {
  /** Del dataset se queda lo pequeno: el año, de donde salio y las semanas raras. */
  datasetSource: DemandDataset['source']
  datasetYear: number
  datasetSpecials: DemandDataset['specials']
}

/**
 * Aplana la curva a un solo array de enteros.
 *
 * El orden es semana, dia, franja, y se escribe sin separadores porque las tres
 * dimensiones son fijas y conocidas: recomponerla es la operacion inversa exacta.
 * Un JSON anidado con corchetes por cada dia costaria casi el doble antes de
 * comprimir.
 */
function aplanarCurva(weeks: WeekDemand[]): { texto: string; franjas: number } {
  const franjas = weeks[0]?.days[0]?.length ?? 0
  const trozos: string[] = []
  for (const w of weeks) {
    for (const dia of w.days) {
      trozos.push(dia.join(','))
    }
  }
  return { texto: trozos.join(','), franjas }
}

function recomponerCurva(
  texto: string,
  semanas: { isoWeek: number; year: number; startDate: string; total: number }[],
  franjas: number,
): WeekDemand[] {
  const plano = texto.length === 0 ? [] : texto.split(',').map((n) => Number(n) || 0)
  const porDia = franjas
  const porSemana = porDia * 7
  return semanas.map((meta, i) => {
    const base = i * porSemana
    const days: number[][] = []
    for (let d = 0; d < 7; d++) {
      // `ajustarFranjas` y no el trozo a secas: un plan guardado antes del
      // 2026-09-07 trae 44 franjas por día, porque la rejilla llegaba hasta las
      // 04:00 y ahora cubre las 24 horas. Sin rellenar, el cálculo lee
      // `undefined` en las cuatro últimas y la plantilla sale mal sin dar ningún
      // error. El enlace de un plan viejo tiene que seguir abriéndose bien.
      days.push(ajustarFranjas(plano.slice(base + d * porDia, base + (d + 1) * porDia)))
    }
    return { isoWeek: meta.isoWeek, year: meta.year, startDate: meta.startDate, days, total: meta.total }
  })
}

/**
 * Los metadatos de cada semana, fuera del bulto comprimido.
 *
 * El grafico del año y la linea de cobertura solo necesitan el total de cada
 * semana. Sacandolos fuera, la primera pantalla del plan se pinta sin
 * descomprimir 8 KB.
 */
function metaDeSemanas(weeks: WeekDemand[]) {
  return weeks.map((w) => ({
    isoWeek: w.isoWeek,
    year: w.year,
    startDate: w.startDate,
    total: w.total,
  }))
}

/**
 * Comprime la curva y la deja en base64.
 *
 * BASE64 Y NO EL bytea CRUDO, a proposito. Como PostgREST serializa un bytea
 * depende de su version y de su configuracion, y eso es una suposicion que no
 * se puede comprobar desde aqui. Las funciones de la base reciben y devuelven
 * base64 explicitamente (`decode`/`encode` dentro), asi que los dos lados saben
 * exactamente que formato se estan mandando y no hay nada que adivinar.
 */
async function curvaParaGuardar(weeks: WeekDemand[]): Promise<{ b64: string; franjas: number }> {
  const { texto, franjas } = aplanarCurva(weeks)
  const bytes = new TextEncoder().encode(texto)
  // Sin CompressionStream (navegador viejo) va en claro. Ocupa mas, pero un plan
  // que se guarda gordo es infinitamente mejor que uno que no se guarda.
  const salida = hayCompressionStream() ? await comprimir(bytes) : bytes
  return { b64: bytesToBase64(salida), franjas }
}

/** El camino de vuelta, desde el base64 que devuelve la base. */
async function curvaDesdeGuardado(b64: string, comprimida: boolean): Promise<string> {
  const bytes = base64ToBytes(b64)
  const crudos = comprimida && hayCompressionStream() ? await descomprimir(bytes) : bytes
  return new TextDecoder().decode(crudos)
}

// ─────────────────────────────────────────────────────────────
// Las llamadas
// ─────────────────────────────────────────────────────────────

function exigirCliente() {
  if (!supabase) throw new Error('backend_no_configurado')
  return supabase
}

export async function crearPlan(
  snap: PlannerSnapshot,
  metricas: MetricasDelPlan,
): Promise<PlanCreado> {
  const cliente = exigirCliente()
  const { b64, franjas } = await curvaParaGuardar(snap.dataset.weeks)

  const config: ConfigDelPlan & { franjasPorDia: number; comprimida: boolean } = {
    source: snap.source,
    version: snap.version,
    savedAt: snap.savedAt,
    step: snap.step,
    hours: snap.hours,
    kitchenHours: snap.kitchenHours,
    specials: snap.specials,
    blocks: snap.blocks,
    roles: snap.roles,
    tiers: snap.tiers,
    settings: snap.settings,
    overrides: snap.overrides,
    personNames: snap.personNames,
    datasetSource: snap.dataset.source,
    datasetYear: snap.dataset.year,
    datasetSpecials: snap.dataset.specials,
    franjasPorDia: franjas,
    comprimida: hayCompressionStream(),
  }

  const { data, error } = await cliente.rpc('planning_create_plan', {
    p_config: config,
    p_config_version: SNAPSHOT_VERSION,
    p_covers_b64: b64,
    p_weeks_meta: metaDeSemanas(snap.dataset.weeks),
    p_year: snap.dataset.year,
    p_source_name: snap.dataset.source.fileName,
    p_is_demo: snap.dataset.source.isDemo ?? false,
    p_people_count: metricas.peopleCount,
    p_weekly_hours: metricas.weeklyHours,
    p_coverage_pct: metricas.coveragePct,
    p_peak_weeks: metricas.peakWeeks,
    p_peak_hours: metricas.peakHoursYear,
  })

  if (error) throw new Error(error.message)
  const r = data as { plan_id: string; share_token: string; edit_secret: string }
  return { planId: r.plan_id, shareToken: r.share_token, editSecret: r.edit_secret }
}

export async function actualizarPlan(
  planId: string,
  editSecret: string | null,
  snap: PlannerSnapshot,
  metricas: MetricasDelPlan,
): Promise<void> {
  const cliente = exigirCliente()
  const { b64, franjas } = await curvaParaGuardar(snap.dataset.weeks)

  const config = {
    source: snap.source,
    version: snap.version,
    savedAt: snap.savedAt,
    step: snap.step,
    hours: snap.hours,
    kitchenHours: snap.kitchenHours,
    specials: snap.specials,
    blocks: snap.blocks,
    roles: snap.roles,
    tiers: snap.tiers,
    settings: snap.settings,
    overrides: snap.overrides,
    personNames: snap.personNames,
    datasetSource: snap.dataset.source,
    datasetYear: snap.dataset.year,
    datasetSpecials: snap.dataset.specials,
    franjasPorDia: franjas,
    comprimida: hayCompressionStream(),
  }

  const { error } = await cliente.rpc('planning_update_plan', {
    p_plan_id: planId,
    p_edit_secret: editSecret,
    p_config: config,
    p_config_version: SNAPSHOT_VERSION,
    p_covers_b64: b64,
    p_weeks_meta: metaDeSemanas(snap.dataset.weeks),
    p_people_count: metricas.peopleCount,
    p_weekly_hours: metricas.weeklyHours,
    p_coverage_pct: metricas.coveragePct,
    p_peak_weeks: metricas.peakWeeks,
    p_peak_hours: metricas.peakHoursYear,
  })
  if (error) throw new Error(error.message)
}

/** Lee un plan por el token de su enlace y lo devuelve como la foto de siempre. */
export async function leerPlan(shareToken: string): Promise<PlannerSnapshot | null> {
  const cliente = exigirCliente()
  const { data, error } = await cliente.rpc('planning_get_plan', { p_share_token: shareToken })
  if (error) throw new Error(error.message)

  const filas = data as Array<Record<string, unknown>> | null
  if (!filas || filas.length === 0) return null
  const f = filas[0]

  const config = f.config as Record<string, unknown>
  const meta = f.weeks_meta as { isoWeek: number; year: number; startDate: string; total: number }[]
  const franjas = (config.franjasPorDia as number) ?? 0
  const comprimida = (config.comprimida as boolean) ?? true

  const texto = await curvaDesdeGuardado(f.covers_b64 as string, comprimida)
  const weeks = recomponerCurva(texto, meta, franjas)

  const dataset: DemandDataset = {
    weeks,
    year: (config.datasetYear as number) ?? (f.year as number),
    specials: (config.datasetSpecials as DemandDataset['specials']) ?? [],
    source: config.datasetSource as DemandDataset['source'],
  }

  return {
    source: config.source as PlannerSnapshot['source'],
    version: config.version as PlannerSnapshot['version'],
    savedAt: config.savedAt as string,
    step: config.step as PlannerSnapshot['step'],
    dataset,
    hours: config.hours as PlannerSnapshot['hours'],
    kitchenHours: config.kitchenHours as PlannerSnapshot['kitchenHours'],
    specials: config.specials as PlannerSnapshot['specials'],
    blocks: config.blocks as PlannerSnapshot['blocks'],
    roles: config.roles as PlannerSnapshot['roles'],
    tiers: config.tiers as PlannerSnapshot['tiers'],
    settings: config.settings as PlannerSnapshot['settings'],
    overrides: (config.overrides as PlannerSnapshot['overrides']) ?? [],
    personNames: (config.personNames as PlannerSnapshot['personNames']) ?? {},
  }
}

/** Convierte el plan anonimo en propiedad de quien acaba de identificarse. */
export async function reclamarPlan(planId: string, editSecret: string): Promise<void> {
  const cliente = exigirCliente()
  const { error } = await cliente.rpc('planning_claim_plan', {
    p_plan_id: planId,
    p_edit_secret: editSecret,
  })
  if (error) throw new Error(error.message)
}

export interface PlanEnLista {
  planId: string
  shareToken: string
  peopleCount: number | null
  weeklyHours: number | null
  coveragePct: number | null
  sourceName: string | null
  year: number | null
  updatedAt: string
}

export async function misPlanes(): Promise<PlanEnLista[]> {
  const cliente = exigirCliente()
  const { data, error } = await cliente.rpc('planning_my_plans')
  if (error) throw new Error(error.message)
  return ((data as Array<Record<string, unknown>>) ?? []).map((f) => ({
    planId: f.plan_id as string,
    shareToken: f.share_token as string,
    peopleCount: f.people_count as number | null,
    weeklyHours: f.weekly_hours as number | null,
    coveragePct: f.coverage_pct as number | null,
    sourceName: f.source_name as string | null,
    year: f.year as number | null,
    updatedAt: f.updated_at as string,
  }))
}

// ─────────────────────────────────────────────────────────────
// Entrar por email
// ─────────────────────────────────────────────────────────────

/**
 * Manda el codigo al email. Supabase lo llama OTP y sirve para las dos cosas a
 * la vez: si el email no existe crea la cuenta, y si existe entra. No hay
 * "registrarse" separado de "entrar", que es justo lo que queremos: la persona
 * pone su correo y ya.
 */
export async function pedirCodigo(email: string): Promise<void> {
  const cliente = exigirCliente()
  const { error } = await cliente.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(error.message)
}

/** Comprueba el codigo de seis digitos y deja la sesion abierta. */
export async function comprobarCodigo(email: string, codigo: string): Promise<void> {
  const cliente = exigirCliente()
  const { error } = await cliente.auth.verifyOtp({ email, token: codigo, type: 'email' })
  if (error) throw new Error(error.message)
  // Crea o refresca la fila de la cuenta. Es idempotente: se puede llamar siempre.
  await cliente.rpc('planning_touch_account')
}

export async function sesionActual(): Promise<{ email: string } | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const email = data.session?.user?.email
  return email ? { email } : null
}

export async function cerrarSesion(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
