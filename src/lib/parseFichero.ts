/**
 * Lectura REAL del fichero del usuario.
 *
 * Es el sustituto de `fakeAI.analyzeFile`, que hoy no lee nada: genera un
 * histórico con semilla. Aquí se lee de verdad, y la forma de salida es la
 * misma (`DemandDataset`), así que el resto de la herramienta no se entera.
 *
 * ── LO QUE PROMETE LA PORTADA ────────────────────────────────────────────
 * "El fichero se lee en tu navegador. No se sube a ningún servidor."
 *
 * Este módulo lo cumple literalmente: no hay ni una llamada de red. El fichero
 * se parsea entero aquí, en la pestaña del usuario. Si algún día se le enseñan
 * las cabeceras y tres filas de muestra a un modelo para que ayude a mapear las
 * columnas, eso lo hará OTRO módulo con lo que devuelve `leerFichero`, y solo
 * con esas cabeceras y esas tres filas. Nunca con el fichero.
 *
 * ── LO QUE HACE ──────────────────────────────────────────────────────────
 * 1. `leerFichero(file)` → cabeceras, muestras, filas en crudo y una propuesta
 *    de mapeo de columnas. Soporta CSV (separador y codificación detectados) y
 *    Excel (la librería `xlsx` entra por `import()` dinámico: pesa 900 kB y no
 *    puede lastrar la primera carga de una herramienta que presume de abrir
 *    rápido).
 * 2. `construirDataset(filas, mapeo, opciones)` → el `DemandDataset`.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ──────────────────────────────────────────
 * No tira ni una fila en silencio. Todo lo que no cuadra sale contado y con su
 * motivo en `construirDatasetConDiagnostico`, para que la pantalla pueda decir
 * "he descartado 340 filas de 51.000, y por esto". Una lectura que se come el
 * 20% del fichero sin avisar da un número más bonito y más falso.
 *
 * Y no inventa semanas: si el histórico son 30 semanas, salen 30. El resto de
 * la herramienta ya trabaja con menos (ver `usableWeeks` en demand.ts).
 */

// El tipo del mapeo vive en el componente que lo edita. Es un `import type`:
// desaparece al compilar, así que `lib/` sigue sin importar nada de React en
// tiempo de ejecución. Se importa en vez de copiarse para que el contrato no
// pueda desincronizarse en silencio; su sitio natural sería `lib/types.ts`, y
// ahí debería mudarse el día que se pueda tocar ese fichero.
import type { ColumnaDetectada, DestinoColumna } from './mapeo'
import { applyLag, inferHours, weekTotal } from './demand'
import { isoWeekStart } from './holidays'
import { GRID_START_MIN, SLOTS_PER_DAY, clockToGridMin, minToSlot } from './time'
import type { DemandDataset, WeekDemand } from './types'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

/** Una celda tal y como sale del fichero. Excel devuelve números de verdad. */
export type ValorCrudo = string | number | null

/** Una fila del fichero, en el mismo orden que `cabeceras`. */
export type FilaCruda = ValorCrudo[]

export type FormatoFichero = 'csv' | 'excel'

/** Las dos codificaciones que se ven en la práctica en un TPV español. */
export type Codificacion = 'utf-8' | 'windows-1252'

/** Cómo se leen las fechas de tipo `a/b/aaaa`. */
export type FormatoFecha = 'dd/mm' | 'mm/dd'

export type CodigoAdvertencia =
  | 'fecha-ambigua'
  | 'fecha-en-conflicto'
  | 'codificacion-latin1'
  | 'sin-cabecera'
  | 'sin-hora'
  | 'comensales-estimados'
  | 'tickets-son-codigo'
  | 'historico-corto'
  | 'horario-poco-poblado'
  | 'varios-anos'

export interface Advertencia {
  codigo: CodigoAdvertencia
  /** Ya redactado en castellano, listo para enseñar. */
  mensaje: string
}

export type MotivoDescarte =
  | 'fila-vacia'
  | 'fecha-ilegible'
  | 'hora-ilegible'
  | 'hora-fuera-de-rejilla'
  | 'comensales-ilegibles'
  | 'fuera-del-ano'

export interface Descarte {
  motivo: MotivoDescarte
  /** Cuántas filas se han caído por ese motivo. */
  filas: number
  /** El motivo explicado, para enseñarlo tal cual. */
  mensaje: string
  /** Hasta tres números de fila de ejemplo, para que el usuario las mire. */
  ejemplos: number[]
}

export interface FicheroLeido {
  nombre: string
  formato: FormatoFichero
  /** Solo en CSV: el separador que se ha detectado. */
  separador: string | null
  /** Solo en CSV. */
  codificacion: Codificacion | null
  cabeceras: string[]
  /** `muestras[i]` = las 3 primeras filas de la columna `i`, ya en texto. */
  muestras: string[][]
  /** Todas las filas de datos, sin la cabecera. */
  filas: FilaCruda[]
  /** Filas de datos del fichero. `filas.length`, cacheado para no recorrerlo. */
  numeroDeFilas: number
  /** Propuesta de mapeo, en el mismo orden que `cabeceras`. */
  columnas: ColumnaDetectada[]
  advertencias: Advertencia[]
}

export interface OpcionesDataset {
  /** Nombre del fichero, para `source.fileName`. */
  fileName: string
  /**
   * Año ISO que se quiere construir. Si no se dice, el que más filas tenga.
   * Las filas de otros años se descartan y se cuentan.
   */
  year?: number
  /**
   * Comensales que trae un ticket medio. SOLO se usa si ninguna columna está
   * mapeada como 'comensales' — igual que en `MapeoColumnas`.
   */
  comensalesPorTicket?: number
  /** Desfase para deducir el horario. 30 por defecto, como `fakeAI`. */
  lagMinutes?: number
  /** Formato de fecha. Si no se dice, se deduce de las propias filas. */
  formatoFecha?: FormatoFecha
}

/**
 * `DemandDataset.source` con dos marcas más.
 *
 * `DemandDataset` no tiene dónde decir "esto es una estima", y sin decirlo se
 * colaría una estimación con cara de dato — justo lo que `MapeoColumnas`
 * promete que no va a pasar. Son campos añadidos, no cambiados: sigue siendo
 * un `DemandDataset` para todo lo que ya existe.
 */
export type FuenteLeida = DemandDataset['source'] & {
  /** True si los comensales salen de multiplicar tickets, no del fichero. */
  estimadoDesdeTickets: boolean
  /** El multiplicador usado. `null` si los comensales son dato de verdad. */
  comensalesPorTicket: number | null
}

export interface DatasetLeido extends DemandDataset {
  source: FuenteLeida
}

export interface ResultadoDataset {
  dataset: DatasetLeido
  /** Filas de datos que traía el fichero. */
  filasLeidas: number
  /** Filas que han entrado de verdad en el cálculo. */
  filasUsadas: number
  /** Lo que se ha caído, por motivo. Solo los motivos con al menos una fila. */
  descartes: Descarte[]
  advertencias: Advertencia[]
  /** Semanas que ha dado el histórico. Menos de 52 es normal y no se rellena. */
  semanas: number
  /** Formato de fecha que se ha acabado usando. */
  formatoFecha: FormatoFecha
}

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

/**
 * Desfase por defecto, en minutos. Duplicado a propósito, igual que en
 * `fakeAI`: `data/presets` importa de `lib/`, y hacerlo al revés cerraría el
 * círculo.
 */
const DEFAULT_LAG_MINUTES = 30

/** Comensales por ticket por defecto. El mismo 2 que enseña `MapeoColumnas`. */
const COMENSALES_POR_TICKET_DEFECTO = 2

/** Separadores que usa un TPV español, por orden de probabilidad. */
const SEPARADORES = [';', ',', '\t', '|'] as const

/**
 * Rango de fechas serie de Excel que se acepta: de 1954 a 2064.
 *
 * El corte por abajo es lo que impide que una columna de comensales (2, 4, 6)
 * se lea como un montón de fechas de 1900 y se lleve la detección por delante.
 */
const SERIE_EXCEL_MIN = 20000
const SERIE_EXCEL_MAX = 60000

/** Epoch de las fechas serie de Excel: el 0 es el 30/12/1899. */
const EPOCH_EXCEL = Date.UTC(1899, 11, 30)

/**
 * Cuántas filas se miran para adivinar separador, formato de fecha y tipo de
 * cada columna. Con 400 sobra: mirar 51.000 para saber que una columna trae
 * fechas es tiempo tirado y bloquea la pestaña.
 */
const FILAS_A_OLFATEAR = 400

/** Etiquetas de `mappedTo`, las que entiende la pantalla de mapeo. */
const ETIQUETA_POR_DESTINO: Record<DestinoColumna, string> = {
  fecha: 'Día del servicio',
  hora: 'Franja horaria',
  comensales: 'Comensales',
  tickets: 'Nº de tickets',
  importe: 'Importe',
  ignorada: 'Ignorada',
}

/** La vuelta: de la etiqueta guardada en `source` al destino. */
export const DESTINO_POR_ETIQUETA: Record<string, DestinoColumna> = {
  'Día del servicio': 'fecha',
  'Franja horaria': 'hora',
  Comensales: 'comensales',
  'Nº de tickets': 'tickets',
  Importe: 'importe',
  Ignorada: 'ignorada',
}

const MENSAJE_DESCARTE: Record<MotivoDescarte, string> = {
  'fila-vacia': 'La fila estaba vacía.',
  'fecha-ilegible': 'No se ha podido leer la fecha.',
  'hora-ilegible': 'No se ha podido leer la hora.',
  'hora-fuera-de-rejilla': 'La hora cae entre las 04:00 y las 06:00, fuera de la rejilla de franjas.',
  'comensales-ilegibles': 'Los comensales no eran un número.',
  'fuera-del-ano': 'La fecha es de otro año.',
}

// ─────────────────────────────────────────────────────────────
// Texto: codificación y CSV
// ─────────────────────────────────────────────────────────────

const CARACTER_DE_REEMPLAZO = '�'

/**
 * Decodifica los bytes probando UTF-8 y, si no cuela, windows-1252.
 *
 * Muchos TPV españoles exportan en latin1. Leído como UTF-8 salen "MenÃº del
 * dÃ­a" o directamente el carácter de reemplazo, y con las cabeceras rotas la
 * detección de columnas falla justo donde más importa.
 *
 * Se prueba UTF-8 en modo estricto: si los bytes no son UTF-8 válido, lanza y
 * se reintenta en windows-1252. Y por si acaso se mira también el carácter de
 * reemplazo, que es el síntoma del modo tolerante.
 */
export function decodificarTexto(bytes: Uint8Array): { texto: string; codificacion: Codificacion } {
  const sinBom = quitarBom(bytes)

  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(sinBom)
    if (!texto.includes(CARACTER_DE_REEMPLAZO)) return { texto, codificacion: 'utf-8' }
  } catch {
    // No es UTF-8 válido: se cae al latin1 de abajo.
  }

  try {
    return { texto: new TextDecoder('windows-1252').decode(sinBom), codificacion: 'windows-1252' }
  } catch {
    // Un entorno sin windows-1252 (Node sin ICU completo). Mejor UTF-8
    // tolerante con algún carácter roto que no poder leer el fichero.
    return { texto: new TextDecoder('utf-8').decode(sinBom), codificacion: 'utf-8' }
  }
}

function quitarBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3)
  }
  return bytes
}

/**
 * Parser de CSV con comillas.
 *
 * Hace falta uno de verdad y no un `split(sep)`: el nombre de un plato lleva
 * comas ("Solomillo, salsa de vino"), va entrecomillado, y una comilla dentro
 * viaja duplicada. Partir por el separador rompe esas filas y desplaza todas
 * las columnas de la derecha.
 */
export function parsearCSV(texto: string, separador: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let enComillas = false
  let i = 0

  const cerrarCelda = () => {
    fila.push(celda)
    celda = ''
  }
  const cerrarFila = () => {
    cerrarCelda()
    filas.push(fila)
    fila = []
  }

  while (i < texto.length) {
    const c = texto[i]

    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"'
          i += 2
          continue
        }
        enComillas = false
        i++
        continue
      }
      celda += c
      i++
      continue
    }

    if (c === '"' && celda === '') {
      enComillas = true
      i++
      continue
    }
    if (c === separador) {
      cerrarCelda()
      i++
      continue
    }
    if (c === '\r') {
      // CRLF y CR sueltos cuentan como un solo fin de línea.
      cerrarFila()
      i += texto[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (c === '\n') {
      cerrarFila()
      i++
      continue
    }

    celda += c
    i++
  }

  // La última fila solo cuenta si había algo escrito: un fichero que termina
  // en salto de línea no tiene una fila vacía al final.
  if (celda !== '' || fila.length > 0) cerrarFila()

  return filas
}

/**
 * Adivina el separador.
 *
 * No se cuentan caracteres a pelo: se parsea el principio del fichero con cada
 * candidato y gana el que da un número de columnas CONSTANTE. Contar comas es
 * lo que hace que un fichero de punto y coma con descripciones llenas de comas
 * se lea con 40 columnas distintas por fila.
 *
 * En España el punto y coma es lo normal, porque Excel lo usa cuando el
 * decimal es la coma. Por eso, a igualdad de todo, gana el que va antes en
 * `SEPARADORES`.
 */
export function detectarSeparador(texto: string): string {
  const muestra = texto.slice(0, 64_000)
  let mejor: string = SEPARADORES[0]
  let mejorPuntuacion = -1

  for (const sep of SEPARADORES) {
    const filas = parsearCSV(muestra, sep)
      .filter((f) => f.some((c) => c.trim() !== ''))
      .slice(0, 30)
    if (filas.length === 0) continue

    // Moda del número de columnas y qué parte de las filas la cumplen.
    const cuenta = new Map<number, number>()
    for (const f of filas) cuenta.set(f.length, (cuenta.get(f.length) ?? 0) + 1)
    let columnas = 0
    let repeticiones = 0
    for (const [n, veces] of cuenta) {
      if (veces > repeticiones || (veces === repeticiones && n > columnas)) {
        columnas = n
        repeticiones = veces
      }
    }
    if (columnas < 2) continue

    const consistencia = repeticiones / filas.length
    // La consistencia manda; el número de columnas solo desempata.
    const puntuacion = consistencia * 100 + Math.min(columnas, 40)
    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion
      mejor = sep
    }
  }

  return mejor
}

// ─────────────────────────────────────────────────────────────
// Números, fechas y horas
// ─────────────────────────────────────────────────────────────

/** Quita euros, porcentajes y los espacios raros que mete Excel al copiar. */
function limpiarNumero(s: string): string {
  return s.replace(new RegExp(String.raw`[\s\u00a0\u2007\u202f\u20ac$\u00a3%]`, 'g'), '')
}

/**
 * Número con separadores españoles.
 *
 * "1.234,5" son mil doscientos treinta y cuatro con cinco, no 1,2345. La regla
 * es la que aplica cualquiera al leerlo:
 *
 * - Si aparecen coma Y punto, el decimal es el ÚLTIMO de los dos.
 * - Si solo aparece uno y sale varias veces, es separador de millares.
 * - Si solo aparece una vez: con exactamente tres cifras detrás es millar
 *   ("1.234" y "1,234" son 1234); si no, es decimal ("12,5" y "12.5" son 12,5).
 *
 * "1.234" con el punto de decimal existe en un fichero inglés, pero un importe
 * o un número de comensales de 1,234 no existe en ningún restaurante.
 */
export function parsearNumero(valor: ValorCrudo): number | null {
  if (valor === null) return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null

  const limpio = limpiarNumero(valor)
  if (limpio === '' || !/^[+-]?[\d.,]+$/.test(limpio)) return null

  const signo = limpio.startsWith('-') ? -1 : 1
  let cuerpo = limpio.replace(/^[+-]/, '')

  const puntos = (cuerpo.match(/\./g) ?? []).length
  const comas = (cuerpo.match(/,/g) ?? []).length

  if (puntos > 0 && comas > 0) {
    const decimal = cuerpo.lastIndexOf(',') > cuerpo.lastIndexOf('.') ? ',' : '.'
    const millar = decimal === ',' ? '.' : ','
    cuerpo = cuerpo.split(millar).join('').replace(decimal, '.')
  } else if (puntos > 1 || comas > 1) {
    cuerpo = cuerpo.replace(/[.,]/g, '')
  } else if (puntos === 1 || comas === 1) {
    const sep = puntos === 1 ? '.' : ','
    const detras = cuerpo.length - cuerpo.indexOf(sep) - 1
    cuerpo = detras === 3 ? cuerpo.replace(sep, '') : cuerpo.replace(sep, '.')
  }

  const n = Number(cuerpo)
  return Number.isFinite(n) ? signo * n : null
}

export interface FechaHora {
  y: number
  m: number
  d: number
  /** Minutos desde las 00:00 si el valor traía la hora dentro. `null` si no. */
  minutos: number | null
}

/** Fecha con separador, con hora opcional detrás. Cubre ISO, dd/mm y mm/dd. */
const RE_FECHA = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/

function esFechaReal(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Año de dos cifras: 70-99 es el siglo XX, 00-69 el XXI. Lo estándar. */
function anoCompleto(y: number): number {
  if (y >= 100) return y
  return y < 70 ? 2000 + y : 1900 + y
}

/**
 * Fecha del valor de una celda. Acepta dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, el
 * punto como separador, el año de dos cifras, la hora pegada detrás y las
 * fechas serie de Excel (un número).
 */
export function parsearFecha(valor: ValorCrudo, formato: FormatoFecha): FechaHora | null {
  if (valor === null) return null

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < SERIE_EXCEL_MIN || valor > SERIE_EXCEL_MAX) return null
    const dias = Math.floor(valor)
    const fraccion = valor - dias
    const t = new Date(EPOCH_EXCEL + dias * 86_400_000)
    return {
      y: t.getUTCFullYear(),
      m: t.getUTCMonth() + 1,
      d: t.getUTCDate(),
      minutos: fraccion > 0 ? Math.round(fraccion * 1440) : null,
    }
  }

  const m = RE_FECHA.exec(valor.trim())
  if (!m) return null

  const a = Number(m[1])
  const b = Number(m[2])
  const c = Number(m[3])

  let y: number
  let mes: number
  let dia: number

  if (m[1].length === 4) {
    // aaaa-mm-dd. Sin ambigüedad posible.
    y = a
    mes = b
    dia = c
  } else if (formato === 'mm/dd') {
    y = anoCompleto(c)
    mes = a
    dia = b
  } else {
    y = anoCompleto(c)
    mes = b
    dia = a
  }

  if (!esFechaReal(y, mes, dia)) return null

  let minutos: number | null = null
  if (m[4] !== undefined) {
    const h = Number(m[4])
    const min = Number(m[5])
    if (h <= 29 && min < 60) minutos = h * 60 + min
  }

  return { y, m: mes, d: dia, minutos }
}

/** Hora en minutos desde las 00:00. hh:mm, hh:mm:ss, HHMM y Excel. */
export function parsearHora(valor: ValorCrudo): number | null {
  if (valor === null) return null

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0) return null
    // Fracción de día: 0,604166… son las 14:30.
    if (valor < 1) return Math.round(valor * 1440)
    // Una serie de Excel completa (fecha y hora) en la columna de la hora:
    // vale la parte decimal. Sin decimales es medianoche, o sea, no hay hora.
    const fraccion = valor - Math.floor(valor)
    return fraccion > 0 ? Math.round(fraccion * 1440) : null
  }

  const s = valor.trim()
  if (s === '') return null

  const reloj = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?/i.exec(s) ?? /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (reloj) {
    let h = Number(reloj[1])
    const min = Number(reloj[2])
    if (h > 29 || min > 59) return null
    // Reloj de 12 horas, que es como viene un fichero americano: 12:15 AM es
    // la madrugada y 2:05 PM son las 14:05. Sin esto, una comida se contaría
    // como un desayuno y encima se iría al día anterior.
    const sufijo = reloj[4]?.toLowerCase()
    if (sufijo === 'p' && h < 12) h += 12
    if (sufijo === 'a' && h === 12) h = 0
    return h * 60 + min
  }

  // "14/06/2025 14:32": la columna trae la fecha entera y la hora está dentro.
  const conFecha = RE_FECHA.exec(s)
  if (conFecha && conFecha[4] !== undefined) {
    const h = Number(conFecha[4])
    const min = Number(conFecha[5])
    if (h <= 29 && min < 60) return h * 60 + min
  }

  // "1430" y "930": lo escupen algunos TPV antiguos. Solo en texto — un número
  // de verdad en la columna de la hora es una serie de Excel, no un HHMM.
  const hhmm = /^(\d{3,4})$/.exec(s)
  if (hhmm) {
    const n = Number(hhmm[1])
    const h = Math.floor(n / 100)
    const min = n % 100
    if (h <= 29 && min < 60) return h * 60 + min
  }

  return null
}

/**
 * dd/mm o mm/dd, decidido con TODO el fichero, no fila a fila.
 *
 * Si alguna fila tiene el primer número por encima de 12, es un día y el
 * fichero entero es dd/mm. Si lo que se pasa de 12 es el segundo, es mm/dd. Si
 * ninguna lo aclara (un fichero de una sola semana puede no tener ni un día
 * mayor que 12), se asume dd/mm, que es lo español, y se AVISA: adivinar sin
 * decirlo puede colocar julio en el día 7 y nadie se enteraría.
 */
export function detectarFormatoFecha(valores: ValorCrudo[]): {
  formato: FormatoFecha
  advertencia: Advertencia | null
} {
  let ddmm = 0
  let mmdd = 0
  let ambiguas = 0

  for (const v of valores) {
    if (typeof v !== 'string') continue
    const m = RE_FECHA.exec(v.trim())
    if (!m || m[1].length === 4) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12 && b <= 12) ddmm++
    else if (b > 12 && a <= 12) mmdd++
    else ambiguas++
  }

  if (ddmm > 0 && mmdd > 0) {
    return {
      formato: ddmm >= mmdd ? 'dd/mm' : 'mm/dd',
      advertencia: {
        codigo: 'fecha-en-conflicto',
        mensaje:
          'Hay fechas que solo cuadran como día/mes y otras que solo cuadran como mes/día. ' +
          `Se han leído como ${ddmm >= mmdd ? 'día/mes' : 'mes/día'}, que es lo que encaja en más filas, pero revísalo.`,
      },
    }
  }
  if (ddmm > 0) return { formato: 'dd/mm', advertencia: null }
  if (mmdd > 0) return { formato: 'mm/dd', advertencia: null }

  if (ambiguas > 0) {
    return {
      formato: 'dd/mm',
      advertencia: {
        codigo: 'fecha-ambigua',
        mensaje:
          'En tus fechas ningún número pasa de 12, así que no se puede saber si son día/mes o mes/día. ' +
          'Se han leído como día/mes, que es lo normal en España. Si tu fichero viene en formato americano, dilo.',
      },
    }
  }

  return { formato: 'dd/mm', advertencia: null }
}

// ─────────────────────────────────────────────────────────────
// Detección de columnas
// ─────────────────────────────────────────────────────────────

/** Sin acentos, en minúsculas: "Nº COMENSALES" y "n comensales" son lo mismo. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(new RegExp(String.raw`[\u0300-\u036f]`, 'g'), '')
    .toLowerCase()
    .trim()
}

/** Pistas por el nombre de la cabecera. Nombres reales de TPV españoles. */
const PISTAS: { destino: DestinoColumna; re: RegExp }[] = [
  { destino: 'fecha', re: /\b(fecha|f_?serv|dia|día|date|jornada|f_?apertura|f_?cierre)\b|fecha/ },
  { destino: 'hora', re: /\b(hora|h_?serv|time|franja|hh|apertura|cierre)\b|hora/ },
  { destino: 'comensales', re: /comensal|cubierto|\bpax\b|\bpaxs\b|personas|clientes|covers|diners/ },
  { destino: 'tickets', re: /ticket|cuenta|factura|albaran|albarán|documento|\bdocs?\b|operacion|operación|servicio|venta(s)?\b|num_?tick/ },
  { destino: 'importe', re: /importe|total|euro|\beur\b|precio|base|neto|bruto|ingreso|facturacion|facturación|\biva\b/ },
]

function pistaDeCabecera(cabecera: string): DestinoColumna | null {
  const n = normalizar(cabecera)
  if (n === '') return null
  for (const p of PISTAS) if (p.re.test(n)) return p.destino
  return null
}

interface PerfilColumna {
  fracFecha: number
  fracHora: number
  fracNumero: number
  /** Qué parte de los números son enteros pequeños (1-30): huele a comensales. */
  fracEnteroPequeno: number
  /** Cuántos valores no vacíos se han mirado. */
  vistos: number
}

function perfilarColumna(valores: ValorCrudo[], formato: FormatoFecha): PerfilColumna {
  let vistos = 0
  let fechas = 0
  let horas = 0
  let numeros = 0
  let pequenos = 0

  for (const v of valores) {
    if (v === null || (typeof v === 'string' && v.trim() === '')) continue
    vistos++
    if (parsearFecha(v, formato)) fechas++
    if (parsearHora(v) !== null) horas++
    const n = parsearNumero(v)
    if (n !== null) {
      numeros++
      if (Number.isInteger(n) && n >= 1 && n <= 30) pequenos++
    }
  }

  if (vistos === 0) {
    return { fracFecha: 0, fracHora: 0, fracNumero: 0, fracEnteroPequeno: 0, vistos: 0 }
  }
  return {
    fracFecha: fechas / vistos,
    fracHora: horas / vistos,
    fracNumero: numeros / vistos,
    fracEnteroPequeno: pequenos / vistos,
    vistos,
  }
}

/**
 * Confianza que se enseña en la pantalla de mapeo.
 *
 * Con el nombre de la cabecera a favor se llega arriba (0,99). Sin él, aunque
 * los valores encajen perfectamente, no se pasa de 0,80: es justo por debajo
 * del 0,85 que hace saltar el aviso de "échale un ojo". Adivinar "F3" por sus
 * valores puede estar bien, pero el usuario tiene que mirarlo.
 */
function confianza(fraccion: number, conPista: boolean): number {
  const base = Math.max(0, Math.min(1, fraccion))
  return conPista ? 0.6 + 0.39 * base : 0.45 + 0.35 * base
}

/**
 * Reparte los destinos entre las columnas.
 *
 * Cada destino se lo lleva UNA sola columna, la que mejor puntúe. Dos columnas
 * marcadas como fecha no significan nada, y en el mapeo el usuario tendría que
 * deshacer una de las dos antes de poder avanzar.
 */
function detectarColumnas(
  cabeceras: string[],
  filas: FilaCruda[],
  formato: FormatoFecha,
): ColumnaDetectada[] {
  const muestra = filas.slice(0, FILAS_A_OLFATEAR)
  const perfiles = cabeceras.map((_, i) => perfilarColumna(muestra.map((f) => f[i] ?? null), formato))
  const pistas = cabeceras.map(pistaDeCabecera)

  const puntuacion = (i: number, destino: DestinoColumna): number => {
    const p = perfiles[i]
    if (p.vistos === 0) return 0
    const pista = pistas[i] === destino ? 1 : 0
    // Una pista que apunta a otro sitio resta: "IMPORTE" con números no es
    // comensales por mucho que sean números.
    const contraria = pistas[i] !== null && pistas[i] !== destino ? -0.25 : 0

    switch (destino) {
      case 'fecha':
        return p.fracFecha * 0.7 + pista * 0.5 + contraria
      case 'hora':
        // Una fecha completa también parsea como hora; que no le robe el sitio.
        return (p.fracHora - p.fracFecha * 0.5) * 0.7 + pista * 0.5 + contraria
      case 'comensales':
        return p.fracNumero * 0.35 + p.fracEnteroPequeno * 0.25 + pista * 0.7 + contraria
      case 'tickets':
        return p.fracNumero * 0.3 + pista * 0.8 + contraria
      case 'importe':
        return p.fracNumero * 0.3 + pista * 0.8 + contraria
      default:
        return 0
    }
  }

  const destinos: DestinoColumna[] = cabeceras.map(() => 'ignorada')
  const asignada = new Set<number>()

  // El orden importa: primero lo que sin ello no hay nada que calcular.
  for (const destino of ['fecha', 'hora', 'comensales', 'tickets', 'importe'] as const) {
    let mejor = -1
    let mejorPunt = 0.45 // umbral: por debajo de esto, mejor no decir nada
    for (let i = 0; i < cabeceras.length; i++) {
      if (asignada.has(i)) continue
      const punt = puntuacion(i, destino)
      if (punt > mejorPunt) {
        mejorPunt = punt
        mejor = i
      }
    }
    if (mejor >= 0) {
      destinos[mejor] = destino
      asignada.add(mejor)
    }
  }

  return cabeceras.map((nombre, i) => {
    const destino = destinos[i]
    const p = perfiles[i]
    const fraccion =
      destino === 'fecha'
        ? p.fracFecha
        : destino === 'hora'
          ? p.fracHora
          : destino === 'ignorada'
            ? 1
            : p.fracNumero

    return {
      nombre,
      destino,
      // Una columna que no hace falta no tiene nada que acertar: la confianza
      // que se enseña es la de "seguro que no la necesitamos".
      confianza:
        destino === 'ignorada'
          ? 0.9
          : Math.round(confianza(fraccion, pistas[i] === destino) * 100) / 100,
      ejemplos: muestrasDe(filas, i, destino),
    }
  })
}

/**
 * Vuelve a sacar los ejemplos de cada columna con el destino que tenga AHORA.
 *
 * Hace falta porque los ejemplos se formatean según lo que se ha entendido que
 * es la columna (ver `comoTexto`): en un Excel una fecha es el número 45.822, y
 * enseñárselo así no le dice a nadie si esa columna es la suya. Cuando algo
 * cambia el destino después de leer el fichero — el modelo, o el propio
 * usuario en la pantalla de mapeo — los ejemplos se quedan formateados para el
 * destino viejo y el usuario ve un número donde debería ver una fecha, que es
 * justo lo único que le permite reconocer su columna.
 */
export function reetiquetarEjemplos(
  filas: FilaCruda[],
  columnas: ColumnaDetectada[],
): ColumnaDetectada[] {
  return columnas.map((c, i) => ({ ...c, ejemplos: muestrasDe(filas, i, c.destino) }))
}

/** Las 3 primeras filas de una columna, en texto y listas para enseñar. */
function muestrasDe(filas: FilaCruda[], i: number, destino: DestinoColumna): string[] {
  const fuera: string[] = []
  for (const f of filas) {
    const v = f[i] ?? null
    if (v === null || (typeof v === 'string' && v.trim() === '')) continue
    fuera.push(comoTexto(v, destino))
    if (fuera.length === 3) break
  }
  return fuera
}

/**
 * Un valor tal y como se le enseña al usuario.
 *
 * En CSV la celda ya es el texto literal del fichero. En Excel no hay texto:
 * una fecha es el número 45.822, y enseñárselo así no le dice a nadie si esa
 * columna es la suya. Por eso los números de Excel se pintan según lo que se
 * ha entendido que son.
 */
function comoTexto(v: ValorCrudo, destino: DestinoColumna): string {
  if (v === null) return ''
  if (typeof v === 'string') return v
  if (destino === 'fecha') {
    const f = parsearFecha(v, 'dd/mm')
    if (f) {
      const dd = String(f.d).padStart(2, '0')
      const mm = String(f.m).padStart(2, '0')
      const hora =
        f.minutos === null
          ? ''
          : ` ${String(Math.floor(f.minutos / 60)).padStart(2, '0')}:${String(f.minutos % 60).padStart(2, '0')}`
      return `${dd}/${mm}/${f.y}${hora}`
    }
  }
  if (destino === 'hora') {
    const min = parsearHora(v)
    if (min !== null) {
      return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
    }
  }
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',')
}

/**
 * ¿La primera fila es la cabecera?
 *
 * Lo es si trae al menos un texto que no sea una fecha, una hora ni un número.
 * Un fichero que arranca directamente con datos existe, y ponerle de cabecera
 * su primera fila la perdería para el cálculo.
 */
function pareceCabecera(fila: FilaCruda): boolean {
  return fila.some((v) => {
    if (typeof v !== 'string') return false
    const s = v.trim()
    if (s === '') return false
    return parsearNumero(s) === null && parsearFecha(s, 'dd/mm') === null && parsearHora(s) === null
  })
}

/** Cabeceras sin huecos ni repetidas: son la clave con la que se mapea. */
function limpiarCabeceras(fila: FilaCruda): string[] {
  const vistas = new Map<string, number>()
  return fila.map((v, i) => {
    let nombre = typeof v === 'string' ? v.trim() : v === null ? '' : String(v)
    if (nombre === '') nombre = `Columna ${i + 1}`
    const veces = vistas.get(nombre) ?? 0
    vistas.set(nombre, veces + 1)
    return veces === 0 ? nombre : `${nombre} (${veces + 1})`
  })
}

// ─────────────────────────────────────────────────────────────
// Lectura del fichero
// ─────────────────────────────────────────────────────────────

function esExcelPorBytes(bytes: Uint8Array): boolean {
  // xlsx/xlsm son un zip (PK\x03\x04); xls es un compuesto OLE2.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return true
  }
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  return bytes.length >= 8 && ole.every((b, i) => bytes[i] === b)
}

/**
 * Lee el fichero ENTERO en el navegador y devuelve lo que hay dentro.
 *
 * No hay red por ninguna parte. Las cabeceras y `muestras` son justo lo que
 * otro módulo podría mandarle a un modelo para que ayude con el mapeo: tres
 * filas, no el fichero.
 */
export async function leerFichero(file: File): Promise<FicheroLeido> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const nombre = file.name || 'fichero'

  // Manda lo que dicen los bytes, no la extensión: hay TPV que exportan un CSV
  // y lo llaman `.xls`, y también quien renombra un Excel a `.csv` para que se
  // lo acepte otro programa. Los dos casos se leen bien mirando los bytes.
  const esExcel = esExcelPorBytes(bytes)

  const advertencias: Advertencia[] = []
  let tabla: FilaCruda[]
  let separador: string | null = null
  let codificacion: Codificacion | null = null

  if (esExcel) {
    tabla = await leerExcel(bytes)
  } else {
    const { texto, codificacion: cod } = decodificarTexto(bytes)
    codificacion = cod
    separador = detectarSeparador(texto)
    tabla = parsearCSV(texto, separador)
    if (cod === 'windows-1252') {
      advertencias.push({
        codigo: 'codificacion-latin1',
        mensaje:
          'Tu fichero no está en UTF-8, sino en la codificación antigua de Windows. Se ha leído igual, ' +
          'pero si ves algún acento raro en los nombres de las columnas, es por eso.',
      })
    }
  }

  // Fuera las filas del todo vacías: sobran al final de casi cualquier export.
  tabla = tabla.filter((f) => f.some((c) => c !== null && String(c).trim() !== ''))

  if (tabla.length === 0) {
    return {
      nombre,
      formato: esExcel ? 'excel' : 'csv',
      separador,
      codificacion,
      cabeceras: [],
      muestras: [],
      filas: [],
      numeroDeFilas: 0,
      columnas: [],
      advertencias,
    }
  }

  let cabeceras: string[]
  let filas: FilaCruda[]
  if (pareceCabecera(tabla[0])) {
    cabeceras = limpiarCabeceras(tabla[0])
    filas = tabla.slice(1)
  } else {
    cabeceras = tabla[0].map((_, i) => `Columna ${i + 1}`)
    filas = tabla
    advertencias.push({
      codigo: 'sin-cabecera',
      mensaje:
        'Tu fichero no parece traer una fila de títulos, así que las columnas salen como "Columna 1", ' +
        '"Columna 2"… Mira los valores de ejemplo para decir qué es cada una.',
    })
  }

  // Todas las filas al mismo ancho que la cabecera: un CSV con una fila corta
  // dejaría `undefined` sueltos por ahí.
  const ancho = cabeceras.length
  filas = filas.map((f) => {
    if (f.length === ancho) return f
    const out: FilaCruda = new Array(ancho).fill(null)
    for (let i = 0; i < Math.min(ancho, f.length); i++) out[i] = f[i]
    return out
  })

  // Dos pasadas, y hacen falta las dos.
  //
  // Para saber QUÉ columna es la fecha hay que poder leer fechas, y para leer
  // fechas hay que saber si el fichero es día/mes o mes/día. Se rompe el
  // círculo con una primera pasada sobre todas las celdas: lo único que casa
  // con el patrón de fecha son fechas, así que sale un formato provisional
  // suficiente para perfilar las columnas.
  const olfateo = filas.slice(0, FILAS_A_OLFATEAR)
  const provisional = detectarFormatoFecha(olfateo.flat()).formato
  const columnas = detectarColumnas(cabeceras, filas, provisional)

  // Ya con la columna de fechas identificada, se decide en serio y solo con
  // ella: es de donde sale la advertencia que ve el usuario, y mezclarla con
  // números de ticket que casualmente parecen fechas la haría mentir.
  const iFecha = columnas.findIndex((c) => c.destino === 'fecha')
  const { advertencia } = detectarFormatoFecha(
    iFecha >= 0 ? olfateo.map((f) => f[iFecha] ?? null) : olfateo.flat(),
  )
  if (advertencia) advertencias.push(advertencia)

  return {
    nombre,
    formato: esExcel ? 'excel' : 'csv',
    separador,
    codificacion,
    cabeceras,
    muestras: columnas.map((c) => c.ejemplos),
    filas,
    numeroDeFilas: filas.length,
    columnas,
    advertencias,
  }
}

/**
 * Excel, con la librería cargada a demanda.
 *
 * `import()` dinámico y NO un import de arriba: `xlsx` pesa cerca de un mega y
 * la mayoría de los ficheros que llegan son CSV. Metiéndola arriba, todo el
 * mundo se la descarga antes de ver la portada de una herramienta cuyo
 * argumento es que abre rápido.
 *
 * Se lee con `raw: true`: las fechas llegan como número de serie y las horas
 * como fracción de día, que es lo que `parsearFecha` y `parsearHora` saben
 * leer. Pedir el texto formateado dependería de cómo tenga cada uno puesto su
 * Excel.
 */
async function leerExcel(bytes: Uint8Array): Promise<FilaCruda[]> {
  const modulo = await import('xlsx')
  const XLSX = (modulo as unknown as { default?: typeof modulo }).default ?? modulo

  const libro = XLSX.read(bytes, { type: 'array' })
  const nombreHoja = libro.SheetNames[0]
  if (!nombreHoja) return []
  const hoja = libro.Sheets[nombreHoja]
  if (!hoja) return []

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  })

  return filas.map((f) =>
    (f as unknown[]).map((v): ValorCrudo => {
      if (v === null || v === undefined) return null
      if (typeof v === 'number') return Number.isFinite(v) ? v : null
      if (typeof v === 'boolean') return v ? '1' : '0'
      if (v instanceof Date) {
        // Por si alguien cambia la lectura a `cellDates`: se devuelve como
        // serie, que es lo que el resto del módulo espera de un Excel.
        return (v.getTime() - EPOCH_EXCEL) / 86_400_000
      }
      return String(v)
    }),
  )
}

// ─────────────────────────────────────────────────────────────
// Construcción del dataset
// ─────────────────────────────────────────────────────────────

/** Año ISO de una fecha: el 31/12/2025 puede ser la semana 1 de 2026. */
function anoISO(t: Date): number {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  return d.getUTCFullYear()
}

/** Semana ISO de una fecha. Misma cuenta que `holidays.isoWeek`. */
function semanaISO(t: Date): number {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7)
}

/** 0 = lunes … 6 = domingo. Semana española, la de `DAYS` en time.ts. */
function diaEspanol(t: Date): number {
  return (t.getUTCDay() + 6) % 7
}

/**
 * Lleva la cuenta de lo que se cae y por qué.
 *
 * Guarda además los tres primeros números de fila de cada motivo: "he
 * descartado 340 filas porque no se les entendía la fecha, por ejemplo la 12,
 * la 87 y la 204" se puede comprobar; "he descartado 340 filas" solo se puede
 * creer o no.
 */
class Contador {
  private readonly mapa = new Map<MotivoDescarte, { filas: number; ejemplos: number[] }>()

  anota(motivo: MotivoDescarte, fila: number) {
    const actual = this.mapa.get(motivo) ?? { filas: 0, ejemplos: [] }
    actual.filas++
    if (actual.ejemplos.length < 3 && fila > 0) actual.ejemplos.push(fila)
    this.mapa.set(motivo, actual)
  }

  lista(): Descarte[] {
    return [...this.mapa.entries()]
      .map(([motivo, v]) => ({
        motivo,
        filas: v.filas,
        mensaje: MENSAJE_DESCARTE[motivo],
        ejemplos: v.ejemplos,
      }))
      .sort((a, b) => b.filas - a.filas)
  }
}

/** Índice de la primera columna con ese destino, o -1. */
function indiceDe(mapeo: ColumnaDetectada[], destino: DestinoColumna): number {
  return mapeo.findIndex((c) => c.destino === destino)
}

/**
 * De filas a `DemandDataset`, con el detalle de lo que se ha quedado fuera.
 *
 * `mapeo` va en el mismo orden que las columnas del fichero: `mapeo[i]`
 * describe la columna `i`. Es el orden que devuelve `leerFichero` y el que
 * conserva `MapeoColumnas` al editarlo.
 */
export function construirDatasetConDiagnostico(
  filas: FilaCruda[],
  mapeo: ColumnaDetectada[],
  opciones: OpcionesDataset,
): ResultadoDataset {
  const advertencias: Advertencia[] = []
  const descartes = new Contador()

  const iFecha = indiceDe(mapeo, 'fecha')
  const iHora = indiceDe(mapeo, 'hora')
  const iComensales = indiceDe(mapeo, 'comensales')
  const iTickets = indiceDe(mapeo, 'tickets')

  // El contrato de `MapeoColumnas`: si el fichero no trae comensales, se
  // estiman desde los tickets y se dice. Nunca se cuela una estima con cara de
  // dato — por eso la marca viaja dentro del propio dataset.
  const estimado = iComensales < 0 && iTickets >= 0
  const porTicket = opciones.comensalesPorTicket ?? COMENSALES_POR_TICKET_DEFECTO

  // ¿La columna de tickets CUENTA tickets o los IDENTIFICA?
  //
  // Es la diferencia entre `3` y `T0010101`, y en el TPV español lo segundo es
  // lo normal: una fila por ticket y una columna con su número de documento.
  // Multiplicar ese código por los comensales por ticket no tiene sentido, así
  // que hasta el 2026-09-07 esas filas se descartaban TODAS y el usuario se
  // encontraba con que su fichero "no valía". Ahora se mira la propia columna:
  // si la mayoría de sus valores no son números, es un identificador, y
  // entonces lo que hay que contar es UNA fila, UN ticket.
  //
  // El umbral es la mitad a propósito y no "alguno": un fichero con la columna
  // bien puesta puede traer un puñado de celdas sucias, y eso no lo convierte en
  // una columna de códigos.
  const ticketsSonCodigo = (() => {
    if (!estimado) return false
    const muestra = filas.slice(0, FILAS_A_OLFATEAR)
    let vistos = 0
    let numericos = 0
    for (const f of muestra) {
      const v = f[iTickets] ?? null
      if (v === null || String(v).trim() === '') continue
      vistos++
      if (parsearNumero(v) !== null) numericos++
    }
    return vistos > 0 && numericos / vistos < 0.5
  })()

  if (estimado) {
    advertencias.push({
      codigo: 'comensales-estimados',
      mensaje:
        `Tu fichero no trae comensales, así que se han estimado a ${porTicket.toLocaleString('es-ES')} por ticket. ` +
        'Toda cifra de comensales que veas a partir de aquí es una estima, no un dato de tu TPV.',
    })
  }

  if (ticketsSonCodigo) {
    advertencias.push({
      codigo: 'tickets-son-codigo',
      mensaje:
        'Tu columna de tickets trae códigos y no cantidades, así que se ha contado un ticket por cada línea del fichero. ' +
        'Si tu export trae una línea por PRODUCTO y no por ticket, ese número sale alto: marca esa columna como "No la uses" y dinos cuál cuenta.',
    })
  }

  // El formato de fecha se decide aquí también, y no solo en `leerFichero`:
  // esta función se vuelve a llamar cada vez que el usuario corrige el mapeo,
  // y con otra columna marcada como fecha la respuesta puede ser otra. Si la
  // advertencia solo saliera de la lectura inicial, el aviso de "no se sabe si
  // son día/mes o mes/día" se perdería justo cuando el usuario acaba de
  // cambiar la columna.
  let formatoFecha: FormatoFecha
  if (opciones.formatoFecha) {
    // Lo ha dicho el usuario: no hay nada que adivinar ni de qué avisar.
    formatoFecha = opciones.formatoFecha
  } else {
    const detectado = detectarFormatoFecha(
      iFecha >= 0
        ? filas.slice(0, FILAS_A_OLFATEAR).map((f) => f[iFecha] ?? null)
        : filas.slice(0, FILAS_A_OLFATEAR).flat(),
    )
    formatoFecha = detectado.formato
    if (detectado.advertencia) advertencias.push(detectado.advertencia)
  }

  // Primera pasada: fecha, hora y comensales de cada fila. Se guarda entero
  // porque el año no se sabe hasta haberlas leído todas.
  interface Punto {
    ano: number
    semana: number
    dia: number
    franja: number
    comensales: number
    /** Número de fila en el fichero, para poder señalarla si se descarta. */
    fila: number
  }
  const puntos: Punto[] = []
  const porAno = new Map<number, number>()
  let sinHoraPropia = 0

  for (let n = 0; n < filas.length; n++) {
    const fila = filas[n]
    const numeroDeFila = n + 1

    if (fila.every((v) => v === null || String(v).trim() === '')) {
      descartes.anota('fila-vacia', numeroDeFila)
      continue
    }

    const fecha = iFecha >= 0 ? parsearFecha(fila[iFecha] ?? null, formatoFecha) : null
    if (!fecha) {
      descartes.anota('fecha-ilegible', numeroDeFila)
      continue
    }

    // La hora puede venir en su columna o dentro de la propia fecha
    // ("14/06/2025 21:40"), que es como la escupe medio TPV.
    let minutos = iHora >= 0 ? parsearHora(fila[iHora] ?? null) : null
    if (minutos === null) {
      minutos = fecha.minutos
      if (minutos !== null && iHora < 0) sinHoraPropia++
    }
    if (minutos === null) {
      descartes.anota('hora-ilegible', numeroDeFila)
      continue
    }

    let comensales: number
    if (iComensales >= 0) {
      const v = parsearNumero(fila[iComensales] ?? null)
      if (v === null || v < 0) {
        descartes.anota('comensales-ilegibles', numeroDeFila)
        continue
      }
      comensales = v
    } else if (iTickets >= 0) {
      if (ticketsSonCodigo) {
        // La columna identifica, no cuenta: esta fila ES un ticket. Una celda
        // vacía no lo es, y ahí sí se descarta, porque una fila sin ticket en un
        // fichero de tickets es una fila que no sabemos qué hace ahí.
        const bruto = fila[iTickets]
        if (bruto === null || bruto === undefined || String(bruto).trim() === '') {
          descartes.anota('comensales-ilegibles', numeroDeFila)
          continue
        }
        comensales = porTicket
      } else {
        const v = parsearNumero(fila[iTickets] ?? null)
        if (v === null || v < 0) {
          descartes.anota('comensales-ilegibles', numeroDeFila)
          continue
        }
        comensales = v * porTicket
      }
    } else {
      // Sin comensales y sin tickets no hay nada que contar. `mapeoSuficiente`
      // ya lo impide en pantalla; aquí se para igual en vez de inventar un 1
      // por fila, que daría un histórico entero salido de la nada.
      descartes.anota('comensales-ilegibles', numeroDeFila)
      continue
    }

    // Un ticket de la 01:00 del domingo es del servicio del SÁBADO noche. El
    // TPV pone la fecha del reloj; la rejilla va por el día que abre. Sin esta
    // corrección, cada noche de fin de semana se parte en dos días y el
    // domingo aparece con un pico a la 01:00 que nunca existió.
    const dias = minutos < GRID_START_MIN ? -1 : 0
    const t = new Date(Date.UTC(fecha.y, fecha.m - 1, fecha.d + dias))

    const franja = minToSlot(clockToGridMin(Math.floor(minutos / 60), minutos % 60))
    if (franja < 0 || franja >= SLOTS_PER_DAY) {
      // Solo cae aquí lo que va entre las 04:00 y las 06:00, que es el hueco
      // que la rejilla no cubre. Ver GRID_START_MIN / GRID_END_MIN.
      descartes.anota('hora-fuera-de-rejilla', numeroDeFila)
      continue
    }

    const ano = anoISO(t)
    puntos.push({
      ano,
      semana: semanaISO(t),
      dia: diaEspanol(t),
      franja,
      comensales,
      fila: numeroDeFila,
    })
    porAno.set(ano, (porAno.get(ano) ?? 0) + 1)
  }

  if (sinHoraPropia > 0 && iHora < 0) {
    advertencias.push({
      codigo: 'sin-hora',
      mensaje:
        'No has marcado ninguna columna como hora, así que se ha usado la que viene dentro de la fecha.',
    })
  }

  // El año: el que el usuario diga, o el que más filas tenga. Un export suele
  // traer el rabo del año anterior, y mezclarlos daría semanas con el doble.
  let year = opciones.year ?? 0
  if (!year) {
    let mejor = 0
    for (const [a, n] of porAno) {
      if (n > mejor) {
        mejor = n
        year = a
      }
    }
  }
  if (!year) year = new Date().getFullYear() - 1

  if (porAno.size > 1) {
    const otros = [...porAno.entries()].filter(([a]) => a !== year)
    const fuera = otros.reduce((s, [, n]) => s + n, 0)
    // El rabo de diciembre SIEMPRE cae en el año siguiente: las semanas van
    // por norma ISO, y el 30 de diciembre suele ser ya la semana 1 del año que
    // viene. Avisar de eso en un fichero que es exactamente un año natural
    // sería dar una alarma por algo que está bien. Se avisa cuando lo que se
    // queda fuera es de verdad otro trozo de histórico, no ese rabo — pero se
    // cuenta siempre en los descartes, que es donde se puede comprobar.
    if (fuera > puntos.length * 0.02) {
      advertencias.push({
        codigo: 'varios-anos',
        mensaje:
          `Tu fichero abarca ${porAno.size} años. Se ha usado ${year}, que es el que más filas tiene; ` +
          `las ${fuera.toLocaleString('es-ES')} filas de ${otros.map(([a]) => a).join(', ')} se han dejado fuera. ` +
          'Las semanas se cuentan como semanas ISO, así que los últimos días de diciembre pueden contar ya como del año siguiente.',
      })
    }
  }

  // Segunda pasada: al cubo de su semana.
  const porSemana = new Map<number, number[][]>()
  let usadas = 0
  for (const p of puntos) {
    if (p.ano !== year) {
      descartes.anota('fuera-del-ano', p.fila)
      continue
    }
    let dias = porSemana.get(p.semana)
    if (!dias) {
      dias = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
      porSemana.set(p.semana, dias)
    }
    dias[p.dia][p.franja] += p.comensales
    usadas++
  }

  // Se redondea al final, no fila a fila: con tickets a 2,5 comensales,
  // redondear cada uno antes de sumar desvía el total de la semana.
  const weeks: WeekDemand[] = [...porSemana.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([isoWeek, dias]) => {
      const days = dias.map((d) => d.map((v) => Math.round(v)))
      return {
        isoWeek,
        year,
        startDate: isoWeekStart(year, isoWeek).toISOString().slice(0, 10),
        days,
        total: weekTotal(days),
      }
    })

  if (weeks.length > 0 && weeks.length < 40) {
    advertencias.push({
      codigo: 'historico-corto',
      mensaje:
        `Tu histórico son ${weeks.length} semanas, no un año entero. El cálculo se hace con lo que hay: ` +
        'no se inventa lo que falta, pero cuantas más semanas le des, mejor sabrá cuál es tu semana normal.',
    })
  }

  const { detectedHours, poblado } = deducirHorario(weeks, opciones.lagMinutes ?? DEFAULT_LAG_MINUTES)
  if (weeks.length > 0 && !poblado) {
    advertencias.push({
      codigo: 'horario-poco-poblado',
      mensaje:
        'Tu histórico tiene pocos comensales por franja, así que el horario se ha deducido con el ' +
        'listón más bajo. Repásalo en el paso de horario antes de seguir.',
    })
  }

  const dataset: DatasetLeido = {
    weeks,
    year,
    specials: [],
    source: {
      fileName: opciones.fileName,
      // Estos son los datos de una persona: nunca son el ejemplo, y de ahí
      // depende que no se le rellene un solo precio por su cuenta.
      isDemo: false,
      rowsDetected: filas.length,
      dateRange:
        weeks.length > 0 ? `${weeks[0].startDate} → ${weeks[weeks.length - 1].startDate}` : '—',
      columnsDetected: mapeo.map((c) => ({
        label: c.nombre,
        mappedTo: ETIQUETA_POR_DESTINO[c.destino],
        confidence: c.confianza,
        samples: c.ejemplos,
      })),
      detectedHours,
      estimadoDesdeTickets: estimado,
      comensalesPorTicket: estimado ? porTicket : null,
    },
  }

  return {
    dataset,
    filasLeidas: filas.length,
    filasUsadas: usadas,
    descartes: descartes.lista(),
    advertencias,
    semanas: weeks.length,
    formatoFecha,
  }
}

/**
 * El horario, deducido igual que en `fakeAI`.
 *
 * Mediana por franja de todas las semanas (para que un sábado de feria no
 * alargue el horario de todo el año) y `inferHours` sobre la curva YA
 * CORREGIDA del desfase. Ese orden es el que importa: las horas del fichero
 * son de cobro, van media hora tarde, y si el horario se dedujera de la curva
 * cruda saldría media hora tarde también. Al recortar después la demanda por
 * ese horario nos comeríamos justo la media hora de trabajo que acabábamos de
 * recuperar.
 *
 * Lo único que se añade a `fakeAI` son dos redes debajo, y las dos hacen falta
 * porque `fakeAI` solo se ha enfrentado a un histórico generado, que siempre
 * tiene volumen y siempre trae las 52 semanas:
 *
 * - Su listón de 3 comensales por franja deja "cerrado" los siete días a un
 *   bar pequeño de verdad, así que se baja hasta que el horario diga algo.
 * - Con pocas semanas la MEDIANA se va a cero en casi todas las franjas: si
 *   solo dos de seis semanas tienen datos del martes, la mediana del martes es
 *   cero. Ahí se cae al máximo por franja, que con tan pocas semanas no tiene
 *   contra qué protegerse.
 *
 * Las dos avisan (`horario-poco-poblado`): un horario deducido con el listón
 * bajo hay que mirarlo, y la pantalla de horario está justo al lado para
 * corregirlo.
 */
function deducirHorario(
  weeks: WeekDemand[],
  lagMinutes: number,
): { detectedHours: DemandDataset['source']['detectedHours']; poblado: boolean } {
  if (weeks.length === 0) {
    return { detectedHours: Array.from({ length: 7 }, () => []), poblado: true }
  }

  const porFranja = (elegir: (valoresOrdenados: number[]) => number) =>
    Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: SLOTS_PER_DAY }, (_, s) =>
        elegir(weeks.map((w) => w.days[d][s]).sort((a, b) => a - b)),
      ),
    )

  // La mediana es la buena: un sábado de feria no puede estirar el horario de
  // todo el año. El máximo solo entra si la mediana no da nada.
  const mediana = applyLag(porFranja((v) => v[Math.floor(v.length / 2)]), lagMinutes)

  for (const liston of [3, 2, 1]) {
    const horario = inferHours(mediana, liston)
    if (horario.some((d) => d.length > 0)) {
      return { detectedHours: horario, poblado: liston === 3 }
    }
  }

  const maximo = applyLag(porFranja((v) => v[v.length - 1]), lagMinutes)
  return { detectedHours: inferHours(maximo, 1), poblado: false }
}

/**
 * El `DemandDataset` a secas, que es lo que consume el resto de la
 * herramienta.
 *
 * Usa `construirDatasetConDiagnostico` si vas a enseñar la pantalla de
 * lectura: es donde están las filas descartadas y por qué. Esta versión corta
 * es para cuando esos números ya se han recogido en otro sitio.
 */
export function construirDataset(
  filas: FilaCruda[],
  mapeo: ColumnaDetectada[],
  opciones: OpcionesDataset,
): DatasetLeido {
  return construirDatasetConDiagnostico(filas, mapeo, opciones).dataset
}

/**
 * El camino entero: fichero → dataset, con todo lo que ha pasado por medio.
 *
 * `mapeo` se pasa cuando el usuario ya ha corregido las columnas en la
 * pantalla de mapeo; si no se pasa, se usa la detección automática.
 */
export async function leerYConstruir(
  file: File,
  opciones?: Partial<OpcionesDataset> & { mapeo?: ColumnaDetectada[] },
): Promise<ResultadoDataset & { fichero: FicheroLeido }> {
  const fichero = await leerFichero(file)
  const mapeo = opciones?.mapeo ?? fichero.columnas

  const resultado = construirDatasetConDiagnostico(fichero.filas, mapeo, {
    ...opciones,
    fileName: opciones?.fileName ?? fichero.nombre,
  })

  // La lectura y la construcción pueden llegar al mismo aviso (el formato de
  // fecha lo miran las dos). Se queda uno de cada: un aviso repetido en
  // pantalla se lee como dos problemas distintos.
  const porCodigo = new Map<CodigoAdvertencia, Advertencia>()
  for (const a of [...fichero.advertencias, ...resultado.advertencias]) {
    if (!porCodigo.has(a.codigo)) porCodigo.set(a.codigo, a)
  }

  return { ...resultado, advertencias: [...porCodigo.values()], fichero }
}
