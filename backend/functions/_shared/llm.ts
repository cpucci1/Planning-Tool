// Adaptador unico para llamadas a Gemini.
//
// Existe para que migrar las funciones que llamaban a api.anthropic.com sea un
// diff minimo en cada call site: la forma de entrada (system + messages + tools)
// es la de Anthropic, y aqui dentro se traduce a la de Gemini. Asi el codigo de
// negocio de cada funcion no se toca.
//
// Todo el manejo de reintentos, errores y extraccion de usage vive aqui, que
// antes estaba duplicado en 20 sitios con criterios distintos.
//
// ───────────────────────────────────────────────────────────────────────────
// DE DONDE SALE ESTE FICHERO
//
// Es una COPIA de Web-Panel/supabase/functions/_shared/llm.ts, el adaptador que
// Shifty ya tiene corriendo en produccion. Se copia y no se importa porque el
// planificador vive en otro proyecto de Supabase ("freetools") y no comparte
// despliegue con Web-Panel.
//
// UNICA DIFERENCIA con el original: la constante FLASH. Todo lo demas es
// identico a proposito, incluido el soporte de tools, que aqui hoy no usa nadie:
// mientras las dos copias sean iguales, un arreglo en la de produccion se trae
// tal cual. En cuanto se podan cosas distintas en cada lado, dejan de poder
// compararse y es cuando se desincronizan sin que nadie lo note.
//
// Si tocas algo aqui que no sea el id del modelo, tocalo tambien alli.
// ───────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Ids fijados a proposito, no alias '-latest': un alias flotante cambia el
// modelo por debajo sin avisar y aqui hay prompts afinados.
//
// FLASH: gemini-3.8-flash. Salio en general el 2026-09-02 y lo fija el encargo
// de este backend; NO esta comprobado contra la API desde aqui, porque en esta
// maquina no hay clave de Gemini. Se comprueba en un comando antes del primer
// despliegue (esta en el README de planning-ai, apartado "Comprobar el modelo")
// o llamando a assertModelAvailable() del final de este fichero. Si ese id no
// existiese, la API responde 404 y la funcion devuelve error del modelo, asi que
// se ve en el primer intento; no se degrada en silencio.
//
// FLASH_LITE: verificado contra la API el 2026-08-22 en produccion. Aqui no lo
// usa nadie todavia; se deja porque es el id barato ya comprobado y la siguiente
// herramienta gratuita lo va a querer.
export const FLASH = 'gemini-3.8-flash'
export const FLASH_LITE = 'gemini-3.5-flash-lite'

/**
 * Cada familia acepta distintos thinkingLevel y la API devuelve 400 si le pasas
 * uno que no soporta (3.7 NO acepta 'minimal'). Pedimos intencion — "lo minimo"
 * o "algo mas" — y aqui se traduce al valor que ese modelo entiende.
 *
 * Importante: los tokens de razonamiento salen del presupuesto de maxOutputTokens.
 * Con 'medium'/'high' y un max_tokens ajustado la respuesta sale VACIA y truncada
 * (comprobado: 113 tokens pensando, 0 de salida). Por eso el default es lo minimo.
 */
function wireThinkingLevel(model: string, level: 'minimal' | 'standard'): string {
  // Valores validos en la API: minimal | low | medium | high. 'standard' NO
  // existe (devuelve 400), y 3.7 en adelante tampoco acepta 'minimal'.
  //
  // Comprobado el 2026-09-06 para el modelo de este proyecto: 'gemini-3.8-flash'
  // hace match con gemini-3\.(7|8|9), asi que cae del lado bueno y sale 'low'.
  // No hay que tocar nada.
  //
  // Ojo para el dia que Google saque un 3.10 o un 3.11: la expresion mira UN
  // digito detras del punto, asi que 'gemini-3.10' NO haria match y se le
  // mandaria 'minimal', que esas familias rechazan con un 400. No se cambia hoy
  // porque ese id no existe y porque este fichero tiene que poder compararse
  // linea a linea con el de produccion, pero queda dicho.
  if (level === 'standard') return 'medium'
  const isV37Plus = /gemini-3\.(7|8|9)|gemini-[4-9]/.test(model)
  return isV37Plus ? 'low' : 'minimal'
}

export type Role = 'user' | 'assistant'

/** Bloque de contenido estilo Anthropic. El texto plano tambien vale. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  // signature: Gemini 3.x exige devolver el thoughtSignature que acompañaba a la
  // functionCall original. Si falta, la API responde 400 y el bucle de tools no
  // avanza. Viene en LlmToolCall.signature; hay que pasarlo tal cual de vuelta.
  | {
    type: 'tool_use'
    id: string
    name: string
    input: Record<string, unknown>
    signature?: string
  }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface LlmMessage {
  role: Role
  content: string | ContentBlock[]
}

export interface LlmTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface LlmOptions {
  messages: LlmMessage[]
  system?: string
  model?: string
  maxTokens?: number
  temperature?: number
  /** Fuerza responseMimeType JSON. Equivale a pedirle a Claude que responda solo JSON. */
  json?: boolean
  /**
   * Esquema de la respuesta (subconjunto de OpenAPI que acepta Gemini). Fuerza
   * la FORMA del JSON, no solo que sea JSON.
   *
   * La diferencia importa: con `json: true` a secas el modelo puede omitir un
   * campo, o escribir una comilla doble sin escapar dentro de un string y dejar
   * la respuesta imparseable — pasa de verdad con textos en espanol del tipo
   * `los "extras" del fin de semana`. Con esquema, la decodificacion va
   * restringida y eso no puede ocurrir.
   *
   * Implica responseMimeType JSON: no hace falta pasar `json` tambien.
   */
  jsonSchema?: Record<string, unknown>
  tools?: LlmTool[]
  /**
   * 'any' obliga al modelo a responder SIEMPRE llamando a una tool (nunca texto
   * suelto). Es lo que en Gemini es toolConfig.functionCallingConfig.mode.
   * El bot de soporte depende de esto: su contrato es que toda respuesta sale
   * por la tool final_response. Sin ello el modelo contesta en texto plano y el
   * codigo de abajo no encuentra la respuesta.
   * 'auto' (por defecto) deja que el modelo elija.
   */
  toolChoice?: 'auto' | 'any'
  /** 'minimal' abarata y acelera; 'standard' para razonamiento de verdad. */
  thinking?: 'minimal' | 'standard'
  /** Reintentos ante 429/5xx. Por defecto 3. */
  retries?: number
  signal?: AbortSignal
}

export interface LlmToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  /** Devolver tal cual en el tool_use del siguiente turno, o Gemini responde 400. */
  signature?: string
}

export interface LlmResult {
  text: string
  toolCalls: LlmToolCall[]
  /**
   * output  = tokens de texto visible.
   * thinking= tokens de razonamiento. NO aparecen en la respuesta pero Google
   *           LOS FACTURA COMO SALIDA. Con el nivel minimo suelen ser 0, pero
   *           con 'standard' son la mayor parte del gasto.
   * billedOutput = output + thinking. ES EL QUE HAY QUE USAR PARA CALCULAR COSTE.
   *           Usar 'output' a secas infravalora la factura entre 2 y 3 veces.
   */
  usage: { input: number; output: number; thinking: number; billedOutput: number }
  finishReason: string
  raw: unknown
}

// ─── Traduccion Anthropic -> Gemini ──────────────────────────────────────

interface GeminiPart {
  text?: string
  thoughtSignature?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}

/**
 * Gemini no tiene tool_use_id: correlaciona la respuesta de una tool por
 * NOMBRE. Guardamos el mapa id->nombre al traducir la llamada para poder
 * resolver el nombre cuando llegue el tool_result correspondiente.
 */
function toGeminiContents(messages: LlmMessage[]): Array<{ role: string; parts: GeminiPart[] }> {
  const toolNameById = new Map<string, string>()
  const out: Array<{ role: string; parts: GeminiPart[] }> = []

  for (const msg of messages) {
    const parts: GeminiPart[] = []

    if (typeof msg.content === 'string') {
      // Gemini rechaza parts con texto vacio; un string vacio se omite entero.
      if (msg.content.length > 0) parts.push({ text: msg.content })
    } else {
      for (const block of msg.content) {
        switch (block.type) {
          case 'text':
            if (block.text.length > 0) parts.push({ text: block.text })
            break
          case 'image':
            parts.push({
              inlineData: { mimeType: block.source.media_type, data: block.source.data },
            })
            break
          case 'tool_use':
            toolNameById.set(block.id, block.name)
            parts.push({
              functionCall: { name: block.name, args: block.input ?? {} },
              ...(block.signature ? { thoughtSignature: block.signature } : {}),
            })
            break
          case 'tool_result': {
            const name = toolNameById.get(block.tool_use_id) ?? block.tool_use_id
            // functionResponse.response debe ser un objeto, nunca string suelto.
            parts.push({
              functionResponse: {
                name,
                response: block.is_error
                  ? { error: block.content }
                  : { result: block.content },
              },
            })
            break
          }
        }
      }
    }

    if (parts.length === 0) continue
    // Gemini usa 'model' donde Anthropic usa 'assistant'.
    out.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts })
  }

  return out
}

/**
 * Gemini no acepta las palabras clave de JSON Schema que si acepta Anthropic
 * (additionalProperties, $schema, etc). Las quitamos o la API devuelve 400.
 */
function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema)
  if (schema === null || typeof schema !== 'object') return schema

  const DROP = new Set([
    'additionalProperties',
    '$schema',
    '$id',
    'definitions',
    '$defs',
    'default',
    'examples',
    'const',
  ])

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (DROP.has(k)) continue
    out[k] = sanitizeSchema(v)
  }
  return out
}

function toGeminiTools(tools: LlmTool[]) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: sanitizeSchema(t.input_schema),
    })),
  }]
}

// ─── Llamada ─────────────────────────────────────────────────────────────

export class LlmError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message)
    this.name = 'LlmError'
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function callLlm(opts: LlmOptions): Promise<LlmResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new LlmError('GEMINI_API_KEY no configurada')

  const model = opts.model ?? FLASH
  const retries = opts.retries ?? 3

  const body: Record<string, unknown> = {
    contents: toGeminiContents(opts.messages),
    generationConfig: {
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...(opts.json || opts.jsonSchema ? { responseMimeType: 'application/json' } : {}),
      ...(opts.jsonSchema ? { responseSchema: sanitizeSchema(opts.jsonSchema) } : {}),
      thinkingConfig: { thinkingLevel: wireThinkingLevel(model, opts.thinking ?? 'minimal') },
    },
  }
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }
  if (opts.tools?.length) {
    body.tools = toGeminiTools(opts.tools)
    if (opts.toolChoice === 'any') {
      body.toolConfig = { functionCallingConfig: { mode: 'ANY' } }
    }
  }

  let lastErr: LlmError | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response
    try {
      res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
    } catch (e) {
      // Fallo de red: reintentable.
      lastErr = new LlmError(`Gemini red: ${(e as Error).message}`)
      if (attempt < retries) {
        await sleep(2 ** attempt * 500)
        continue
      }
      throw lastErr
    }

    if (res.ok) return parseGeminiResponse(await res.json())

    const text = (await res.text()).slice(0, 500)
    lastErr = new LlmError(`Gemini ${res.status}: ${text}`, res.status, text)

    // 429 y 5xx son transitorios; 4xx restantes son culpa nuestra, no reintentar.
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === retries) throw lastErr
    await sleep(2 ** attempt * 500)
  }

  throw lastErr ?? new LlmError('Gemini: fallo desconocido')
}

export function parseGeminiResponse(data: unknown): LlmResult {
  const d = data as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      thoughtsTokenCount?: number
    }
    promptFeedback?: { blockReason?: string }
  }

  // Sin candidates suele significar que el filtro de seguridad corto la respuesta.
  const cand = d.candidates?.[0]
  if (!cand) {
    const reason = d.promptFeedback?.blockReason
    throw new LlmError(reason ? `Gemini bloqueo la peticion: ${reason}` : 'Gemini no devolvio candidates')
  }

  const parts = cand.content?.parts ?? []
  const text = parts.map((p) => p.text ?? '').join('')

  // Fallo silencioso mas peligroso de esta migracion: el modelo agota el
  // presupuesto razonando y devuelve texto vacio o JSON a medias, con HTTP 200.
  // El parser de turno lo interpretaria como "sin violacion" / "sin resultado"
  // en vez de como un error. Preferimos romper alto y que el fallback actue.
  if (cand.finishReason === 'MAX_TOKENS') {
    const thoughts = d.usageMetadata?.thoughtsTokenCount ?? 0
    throw new LlmError(
      `Gemini trunco la respuesta (MAX_TOKENS, ${thoughts} tokens en thinking, ` +
        `${text.length} chars utiles). Sube maxTokens o baja el nivel de thinking.`,
    )
  }
  const toolCalls: LlmToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      // Gemini no da id; sintetizamos uno estable para poder correlacionar.
      id: `${p.functionCall!.name}_${i}`,
      name: p.functionCall!.name,
      input: p.functionCall!.args ?? {},
      signature: p.thoughtSignature,
    }))

  const outTokens = d.usageMetadata?.candidatesTokenCount ?? 0
  const thinkTokens = d.usageMetadata?.thoughtsTokenCount ?? 0

  return {
    text,
    toolCalls,
    usage: {
      input: d.usageMetadata?.promptTokenCount ?? 0,
      output: outTokens,
      thinking: thinkTokens,
      billedOutput: outTokens + thinkTokens,
    },
    finishReason: cand.finishReason ?? 'STOP',
    raw: data,
  }
}

/** Comprueba contra la API que un id de modelo existe. Para no dar por hecho el de lite. */
export async function assertModelAvailable(model: string): Promise<boolean> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new LlmError('GEMINI_API_KEY no configurada')
  const res = await fetch(`${GEMINI_BASE}/${model}?key=${apiKey}`)
  return res.ok
}
