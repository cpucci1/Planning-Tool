/**
 * Comprimir y descomprimir con la API nativa del navegador.
 *
 * Esto vivia dentro de `compartir.ts`, que fue el primero en necesitarlo para
 * meter el plan entero en el `#` de la direccion. Al llegar el backend hacia
 * falta exactamente lo mismo para guardar la curva de comensales, y dos copias
 * de un formato de compresion es la peor clase de duplicado: el dia que una se
 * toque, lo escrito por un camino deja de poder leerse por el otro, y no falla
 * al compilar, falla al abrir el plan de alguien.
 *
 * El formato es `deflate-raw`, que entienden todos los navegadores modernos y
 * tambien Postgres y Deno del otro lado.
 *
 * `src/lib/` no importa React. Esto es logica pura.
 */

/** ¿Tiene este navegador la API de compresion? Los muy viejos no. */
export function hayCompressionStream(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

interface StreamDeTransformacion {
  readable: ReadableStream
  writable: WritableStream
}

/**
 * Escribe `bytes` en un stream de transformacion y devuelve el resultado.
 *
 * Escribe y lee A LA VEZ, y eso no es un adorno: si se esperara a que `write`
 * termine antes de empezar a leer, un plan grande podria llenar el buffer
 * interno del stream y quedarse colgado esperando a un lector que todavia no
 * ha arrancado.
 */
async function pasarPorStream(bytes: Uint8Array, stream: StreamDeTransformacion): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  const escritura = writer.write(bytes).then(() => writer.close())
  const lectura = new Response(stream.readable).arrayBuffer()
  const [, buffer] = await Promise.all([escritura, lectura])
  return new Uint8Array(buffer)
}

export function comprimir(bytes: Uint8Array): Promise<Uint8Array> {
  return pasarPorStream(bytes, new CompressionStream('deflate-raw'))
}

export function descomprimir(bytes: Uint8Array): Promise<Uint8Array> {
  return pasarPorStream(bytes, new DecompressionStream('deflate-raw'))
}

// ─────────────────────────────────────────────────────────────
// base64url
//
// El base64 normal usa '+' y '/', que en una direccion hay que escapar, y '='
// de relleno al final. La variante url los cambia por '-' y '_' y se come el
// relleno. Lo usa el enlace compartido; el backend manda bytes por otro camino
// (ver `backend.ts`) pero comparte estas piezas.
// ─────────────────────────────────────────────────────────────

/**
 * Bytes a texto binario, en bloques.
 *
 * Se trocea en bloques de 0x8000 a proposito: `String.fromCharCode` con un
 * array de decenas de miles de elementos desborda la pila de argumentos y
 * revienta con un plan grande, que es justo cuando hace falta que funcione.
 */
export function bytesToBinaryString(bytes: Uint8Array): string {
  const BLOQUE = 0x8000
  let salida = ''
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    salida += String.fromCharCode(...bytes.subarray(i, i + BLOQUE))
  }
  return salida
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(bytesToBinaryString(bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binario = atob(relleno)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/** base64 normal, con relleno. Es lo que entiende Postgres al recibir un bytea. */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinaryString(bytes))
}

export function base64ToBytes(texto: string): Uint8Array {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}
