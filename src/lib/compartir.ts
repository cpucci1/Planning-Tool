/**
 * Compartir un plan por enlace, sin cuentas y sin servidor.
 *
 * El estado del cálculo va comprimido dentro del fragmento de la URL (la
 * parte después de `#`), que el navegador NUNCA envía al servidor: es lo que
 * permite mandar un plan a otra persona sin que los datos de ventas de un
 * restaurante pasen por ningún sitio intermedio. Mismo criterio y vocabulario
 * que `persistence.ts` (que resuelve el mismo problema para el guardado
 * local): se guarda lo que el usuario ha decidido, no lo que se puede
 * recalcular a partir de ello.
 */

import type {
  Block,
  DemandDataset,
  OpeningHours,
  Role,
  Settings,
  SpecialWeek,
  Tier,
} from './types'

/**
 * Versión del formato del enlace. Deliberadamente independiente de
 * `SNAPSHOT_VERSION` de `persistence.ts`: son dos formatos distintos que
 * viajan por sitios distintos (uno por IndexedDB/fichero, este por la URL) y
 * no tienen por qué cambiar a la vez.
 */
export const PLAN_COMPARTIDO_VERSION = 1

/** Lo que viaja en el enlace. Mismo criterio que `persistence.ts`: se guarda lo
 *  que el usuario ha decidido, no lo que se puede recalcular. */
export interface PlanCompartido {
  version: number
  dataset: DemandDataset | null
  hours: OpeningHours | null
  kitchenHours: OpeningHours | null
  specials: SpecialWeek[]
  blocks: Block[]
  roles: Role[]
  tiers: Tier[]
  settings: Settings
  overrides: [string, number][]
  personNames: Record<string, string>
}

// Marca de un carácter al principio del texto, antes del base64: dice con qué
// algoritmo se generó el resto, para poder leer un enlace hecho en un
// navegador con `CompressionStream` desde uno que no la tiene (o al revés).
const MARKER_COMPRIMIDO = 'c' // deflate-raw + base64url
const MARKER_PLANO = 'p' // JSON en crudo + base64url, sin comprimir

// JSON no sabe representar `Infinity` (`JSON.stringify` lo convierte en
// `null`), y el último tramo de la tabla de personal lo usa como techo
// abierto ("de 40 en adelante"). Se sustituye por este número centinela antes
// de codificar y se deshace al decodificar; si no, el plan que le llega a
// quien recibe el enlace tiene el último tramo roto. 1e15 es un número de
// comensales que ningún tramo real va a alcanzar nunca, así que no choca con
// un valor que el usuario haya escrito de verdad.
const INFINITO_CENTINELA = 1e15

function reemplazarInfinitoAlCodificar(plan: PlanCompartido): PlanCompartido {
  return {
    ...plan,
    tiers: plan.tiers.map((t) => (t.to === Number.POSITIVE_INFINITY ? { ...t, to: INFINITO_CENTINELA } : t)),
  }
}

function restaurarInfinitoAlDecodificar(plan: PlanCompartido): PlanCompartido {
  return {
    ...plan,
    tiers: plan.tiers.map((t) => (t.to === INFINITO_CENTINELA ? { ...t, to: Number.POSITIVE_INFINITY } : t)),
  }
}

// ─────────────────────────────────────────────────────────────
// base64url: el base64 normal usa '+' y '/', que en una URL hay que escapar,
// y termina en '=' de relleno, que tampoco hace falta ahí. Se traduce a la
// variante "segura para URL" quitando ambos problemas.
// ─────────────────────────────────────────────────────────────

/** `btoa`/`atob` solo trabajan con "binary strings" (un char = un byte), así
 *  que hay que pasar por ahí para meter bytes arbitrarios (el resultado de
 *  comprimir) en base64. Se trocea en bloques de 0x8000 para no reventar el
 *  límite de argumentos de `String.fromCharCode(...bytes)` con un plan grande. */
function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let result = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return result
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(bytesToBinaryString(bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(relleno)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ─────────────────────────────────────────────────────────────
// Compresión con la API nativa del navegador. Si no existe (navegador viejo),
// se cae a JSON sin comprimir: peor enlace, pero uno que funciona.
// ─────────────────────────────────────────────────────────────

function hayCompressionStream(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

interface StreamDeTransformacion {
  readable: ReadableStream
  writable: WritableStream
}

/** Escribe `bytes` en un `CompressionStream`/`DecompressionStream` y devuelve
 *  el resultado. Escribe y lee A LA VEZ (no espera a que `write` termine para
 *  empezar `new Response(...).arrayBuffer()`): si se esperara, un plan grande
 *  podría llenar el buffer interno del stream y quedarse colgado esperando a
 *  un lector que todavía no ha arrancado. */
async function pasarPorStream(bytes: Uint8Array, stream: StreamDeTransformacion): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  const escritura = writer.write(bytes).then(() => writer.close())
  const lectura = new Response(stream.readable).arrayBuffer()
  const [, buffer] = await Promise.all([escritura, lectura])
  return new Uint8Array(buffer)
}

function comprimir(bytes: Uint8Array): Promise<Uint8Array> {
  return pasarPorStream(bytes, new CompressionStream('deflate-raw'))
}

function descomprimir(bytes: Uint8Array): Promise<Uint8Array> {
  return pasarPorStream(bytes, new DecompressionStream('deflate-raw'))
}

// ─────────────────────────────────────────────────────────────
// Validación de forma. Mismo nivel que `isSnapshot` en `persistence.ts`: lo
// justo para no reventar con un enlace cortado o de otra versión, sin
// convertirse en un validador exhaustivo de todo el árbol.
// ─────────────────────────────────────────────────────────────

function esPlanCompartido(v: unknown): v is PlanCompartido {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  const datasetValido = s.dataset === null || (typeof s.dataset === 'object' && Array.isArray((s.dataset as DemandDataset)?.weeks))
  const hoursValido = s.hours === null || Array.isArray(s.hours)
  const kitchenHoursValido = s.kitchenHours === null || Array.isArray(s.kitchenHours)
  return (
    s.version === PLAN_COMPARTIDO_VERSION &&
    datasetValido &&
    hoursValido &&
    kitchenHoursValido &&
    Array.isArray(s.specials) &&
    Array.isArray(s.blocks) &&
    Array.isArray(s.roles) &&
    Array.isArray(s.tiers) &&
    !!s.settings &&
    typeof s.settings === 'object' &&
    // Los ajustes, campo a campo, igual que `isSnapshot` en `persistence.ts`:
    // un enlace de una versión anterior con un ajuste de menos no revienta al
    // abrirlo, revienta después y en silencio (una curva con NaN cae al último
    // tramo y pide plantilla máxima en todas las franjas). Y sin `contracts`
    // el cuadrante ni se puede montar.
    typeof (s.settings as Settings).safetyMarginPct === 'number' &&
    typeof (s.settings as Settings).prepBeforeMin === 'number' &&
    typeof (s.settings as Settings).prepAfterMin === 'number' &&
    typeof (s.settings as Settings).coveragePct === 'number' &&
    !!(s.settings as Settings).minStaffByBlock &&
    Array.isArray((s.settings as Settings).contracts) &&
    Array.isArray(s.overrides) &&
    !!s.personNames &&
    typeof s.personNames === 'object'
  )
}

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────

/** Devuelve el texto para meter en el `#` de la URL. */
export async function codificarPlan(plan: PlanCompartido): Promise<string> {
  const normalizado = reemplazarInfinitoAlCodificar(plan)
  const bytesJson = new TextEncoder().encode(JSON.stringify(normalizado))

  if (hayCompressionStream()) {
    try {
      const comprimido = await comprimir(bytesJson)
      return MARKER_COMPRIMIDO + bytesToBase64Url(comprimido)
    } catch {
      // Un enlace más largo pero que funciona es mejor que uno roto: si
      // comprimir falla por lo que sea, se cae al camino sin comprimir.
    }
  }
  return MARKER_PLANO + bytesToBase64Url(bytesJson)
}

/** Lee ese texto. Devuelve null ante CUALQUIER problema, nunca lanza. */
export async function decodificarPlan(texto: string): Promise<PlanCompartido | null> {
  try {
    if (typeof texto !== 'string' || texto.length < 2) return null
    const marca = texto[0]
    const cuerpo = texto.slice(1)

    let bytesJson: Uint8Array
    if (marca === MARKER_COMPRIMIDO) {
      // Un enlace comprimido generado en otro navegador no se puede leer sin
      // `DecompressionStream`: es preferible decir "no se pudo abrir" (null)
      // que intentar adivinar el contenido.
      if (typeof DecompressionStream === 'undefined') return null
      bytesJson = await descomprimir(base64UrlToBytes(cuerpo))
    } else if (marca === MARKER_PLANO) {
      bytesJson = base64UrlToBytes(cuerpo)
    } else {
      return null
    }

    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytesJson))
    if (!esPlanCompartido(parsed)) return null
    return restaurarInfinitoAlDecodificar(parsed)
  } catch {
    // Base64 inválido, JSON roto, un stream de descompresión que revienta con
    // datos corruptos... Un enlace mal copiado es un caso normal de uso, no
    // un fallo de la aplicación: nunca se propaga como excepción.
    return null
  }
}

/** URL completa lista para copiar, a partir de la de la página actual. */
export async function urlDelPlan(plan: PlanCompartido, baseUrl: string): Promise<string> {
  const texto = await codificarPlan(plan)
  const url = new URL(baseUrl)
  // El fragmento es la parte que el navegador nunca manda al servidor; es lo
  // que hace que compartir el plan no filtre datos de ventas a ningún sitio.
  url.hash = texto
  return url.toString()
}

/** Tamaño en caracteres, para poder avisar si el enlace se va de las manos. */
export function longitudAproximada(texto: string): number {
  return texto.length
}
