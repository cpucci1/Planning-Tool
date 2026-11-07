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
import { ESTANCIAS_DEFECTO, aperturaConEstancia, applyLag, conPeriodoAbierto, inferHours, periodoDelFichero, semanaVacia, weekTotal } from './demand'
import { isoWeekStart } from './holidays'
import { GRID_START_MIN, SLOTS_PER_DAY, SLOT_MINUTES, clockToGridMin, minToSlot } from './time'
import type { DemandDataset, PeriodoDelFichero, WeekDemand } from './types'

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
  | 'fichero-agrupado'
  | 'sin-detalle-horario'
  | 'codificacion-latin1'
  | 'sin-cabecera'
  | 'sin-hora'
  | 'comensales-estimados'
  | 'tickets-son-codigo'
  | 'historico-corto'
  | 'horario-poco-poblado'
  | 'horario-deja-fuera'
  | 'hora-con-zona'
  | 'varios-anos'
  | 'semana-incompleta'
  | 'periodo-del-fichero'
  | 'hueco-en-el-fichero'
  | 'lineas-por-ticket'
  | 'importe-con-iva'
  | 'solo-titulos'

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
  | 'tickets-ilegibles'
  | 'ticket-vacio'
  | 'devolucion'
  | 'venta-devuelta'
  | 'sin-cantidad'

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
   * Año ISO que se quiere construir, entero y solo él. Lo mismo que pedir el
   * periodo `ano-AAAA`. Si no se dice nada, manda `periodo`.
   */
  year?: number
  /**
   * El periodo que ha elegido el usuario, por su `clave` (ver `OpcionPeriodo`).
   * Si no se dice, todo el fichero si cabe en un año, y si no las últimas 52
   * semanas. Las filas de fuera se descartan y se cuentan.
   */
  periodo?: string
  /**
   * Comensales que trae un ticket medio. SOLO se usa si ninguna columna está
   * mapeada como 'comensales' — igual que en `MapeoColumnas`.
   */
  comensalesPorTicket?: number
  /** Desfase para deducir el horario. 30 por defecto, como `fakeAI`. */
  lagMinutes?: number
  /** Formato de fecha. Si no se dice, se deduce de las propias filas. */
  formatoFecha?: FormatoFecha
  /**
   * El día de hoy, para decidir si un fichero que no cubre el año entero es
   * una temporada ya cerrada o un export de los últimos meses. Solo lo pasan
   * las pruebas; la app usa el reloj.
   */
  hoy?: Date
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
  /**
   * Ventas de una semana normal sacadas de la columna de importe: la mediana
   * de lo facturado por semana, contando solo las semanas con ventas. `null`
   * si no hay columna de importe o no trae ni un número (ronda 3, 2026-11-04).
   * Se usa para rellenar el ratio sobre ventas, que el usuario puede corregir.
   */
  ventasSemanaNormal?: number | null
  /** Semanas con importe que han entrado en esa mediana. */
  semanasConVentas?: number
  /**
   * Ronda 8, m5: `ventasSemanaNormal` va SIEMPRE sin IVA. Si la columna traía el
   * IVA (lo normal en un ticket), aquí queda la cifra con IVA tal cual salía y
   * en `ivaDescontado` el tipo que se le ha quitado (0,10). Si la columna ya
   * venía sin IVA (base, neto), los dos son `null`.
   */
  ventasSemanaNormalConIva?: number | null
  ivaDescontado?: number | null
  /** True si el fichero no trae ni comensales ni tickets y cada fila se cuenta como un ticket. */
  cadaFilaEsUnTicket?: boolean
  /** Líneas por ticket de media si el fichero traía una línea por producto y se han juntado; `null` si no. */
  lineasPorTicket?: number | null
  /**
   * Los huecos largos dentro del fichero (ronda 7, M3 de cálculo): semanas
   * seguidas sin una sola venta con datos a los dos lados. Pueden ser un
   * cierre o datos que faltan, y la pantalla lo pregunta. Ver `aplicarHueco`.
   */
  huecos?: HuecoDelFichero[]
}

/** Un hueco largo dentro del fichero. */
export interface HuecoDelFichero {
  /** Lunes de la primera semana sin datos y domingo de la última, 'YYYY-MM-DD'. */
  desde: string
  hasta: string
  /** Las semanas del hueco, cada una con su año. */
  semanas: { isoWeek: number; year: number }[]
  /** Lo que se usa: true = el local estuvo cerrado; false = faltan datos. */
  cerrado: boolean
  /** Lo que propuso la lectura, antes de que el usuario dijera nada. */
  propuesto: boolean
}

/**
 * Un periodo que se puede usar de un fichero que trae más de un año, o que
 * cruza el cambio de año. Siempre semanas enteras y seguidas.
 */
export interface OpcionPeriodo {
  /** 'todo', 'ultimas-52' o 'ano-AAAA'. Es lo que se pasa en `OpcionesDataset.periodo`. */
  clave: string
  /** Para enseñarla tal cual: "Las últimas 52 semanas, del 3 de noviembre de 2025 al 1 de noviembre de 2026". */
  etiqueta: string
  /** Lunes de la primera y de la última semana, en días desde 1970. */
  desdeLunes: number
  hastaLunes: number
  /** Semanas con datos dentro de ese periodo. */
  semanas: number
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
  /**
   * Los periodos que se pueden elegir (ronda 7, G1 de pantallas). Más de uno
   * solo si el fichero trae más de un año o cruza el cambio de año: entonces
   * la pantalla deja verlos y cambiar de uno a otro.
   */
  periodos: OpcionPeriodo[]
  /** La clave del periodo que se ha usado. Vacía si no ha entrado ninguna semana. */
  periodoUsado: string
  advertencias: Advertencia[]
  /** Semanas que ha dado el histórico. Menos de 52 es normal y no se rellena. */
  semanas: number
  /** Formato de fecha que se ha acabado usando. */
  formatoFecha: FormatoFecha
  /**
   * Cada cuántos minutos trae horas el fichero. 1 o 5 en un fichero de tickets
   * de verdad, 60 en uno agrupado por horas, 1.440 en uno con un total por día.
   */
  paso: number
  /**
   * True si el paso se ha repartido entre varias franjas por venir agrupado.
   * Ver `detectarPasoHorario`.
   */
  repartido: boolean
  /**
   * True si el fichero no tiene detalle dentro del día y no sirve para
   * dimensionar turnos. La pantalla de subida lo rechaza con eso.
   */
  sinDetalleHorario: boolean
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

/**
 * Filas con las que se decide si las fechas son día/mes o mes/día (ronda 7, M1
 * de pantallas). Con las 400 primeras, un export que empieza el día 1 de un
 * mes no veía ni un día mayor que 12 y avisaba de que no sabía leer fechas
 * españolas. Leer una sola columna con una expresión es barato: hasta este
 * número se mira entera, y por encima se toma una muestra repartida por todo
 * el fichero, que es donde están los días del 13 al 31.
 */
const FILAS_PARA_EL_FORMATO = 20_000

/**
 * Semanas seguidas sin ventas a partir de las cuales un hueco dentro del
 * fichero ya no se da por cierre sin preguntar (ronda 7, M3 de cálculo). Seis
 * semanas caben en unas vacaciones de agosto con su puente; siete ya no.
 */
const SEMANAS_HUECO_DUDOSO = 7

/**
 * Hasta dónde se reparte un fichero que viene agrupado, en minutos.
 *
 * Un fichero por horas se reparte entre sus dos medias horas y el resultado es
 * casi el mismo. Un fichero de bloques de cuatro horas se reparte entre ocho
 * franjas: se pierde la forma de dentro del bloque, pero el número de gente
 * sale del orden correcto, y se dice en pantalla.
 *
 * Por encima de eso (un total por servicio o por día) NO se reparte: repartir
 * un total diario entre las 48 franjas dibujaría comensales a las siete de la
 * mañana, que es inventar la forma del día. Ahí se rechaza el fichero.
 */
const PASO_MAXIMO_REPARTIBLE = 4 * 60

/**
 * Filas con hora que hacen falta para fiarse del paso detectado.
 *
 * Con cuatro filas, dos horas separadas no significan que el fichero venga
 * agrupado. Por debajo de este número se avisa pero no se rechaza nada: el
 * usuario sabe de su fichero más que una muestra de cuatro filas.
 */
const FILAS_PARA_FIARSE_DEL_PASO = 40

/** Peso mínimo de una hora para contar en el paso. Ver `detectarPasoHorario`. */
const PESO_MINIMO_DE_UNA_HORA = 0.005

/**
 * Filas que tienen que encajar en el paso para creerse que el fichero viene
 * agrupado. Ver la comprobación de encaje en `detectarPasoHorario`.
 */
const ENCAJE_MINIMO_DEL_PASO = 0.95

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
  'fuera-del-ano': 'La fecha queda fuera del periodo que se usa.',
  'tickets-ilegibles': 'El número de tickets no era un número.',
  'ticket-vacio': 'La fila no traía número de ticket.',
  'devolucion':
    'Era una devolución o una anulación (importe o comensales en negativo): no es un servicio más.',
  'venta-devuelta':
    'Era la venta que anula una devolución del mismo día y el mismo importe: se quitan las dos para no contar un servicio que se devolvió.',
  'sin-cantidad':
    'Tu fichero viene agrupado por horas y no trae ni comensales ni número de tickets: con solo el importe no se sabe cuánta gente entró. Marca la columna que cuente tickets o comensales.',
}

/**
 * El IVA que se le quita al importe del fichero para comparar el coste de
 * personal con las ventas (ronda 8, m5). Es el tipo reducido de restauración,
 * que es lo que vende un local de los que usan esta herramienta. Si algún día
 * entra otro sector, este número tiene que salir de su configuración.
 */
const IVA_DEL_IMPORTE = 0.1

/** Una columna de importe que dice venir sin IVA: base imponible, neto, "sin IVA". */
const RE_SIN_IVA = /sin ?iva|s\/ ?iva|siniva|\bbase\b|imponible|\bneto\b|antes de iva/

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

/**
 * La zona que trae una hora escrita con ella, en minutos respecto a UTC: `Z`
 * es 0, `+02:00` son 120 y `-03:00` son -180. `null` si la hora no trae zona,
 * que es lo normal en un TPV español: entonces la hora ya es la del local.
 *
 * Solo se lee la zona en una hora con forma ISO: con la `T` entre fecha y
 * hora (`2025-06-14T19:30+02:00`) o con segundos (`19:30:00Z`,
 * `20:30:00.000+00:00`). Una celda `13:00-14:00` es una franja horaria, no
 * las 13:00 con zona −14:00: leída así se movía el ticket catorce horas
 * (revisión ronda 10, hallazgo 1). Por eso una celda con forma de franja
 * (`hh:mm-hh:mm`) nunca trae zona, aunque lleve segundos.
 */
export function zonaDeLaHora(valor: ValorCrudo): number | null {
  if (typeof valor !== 'string') return null
  const s = valor.trim()
  // Franja horaria: "13:00-14:00", "23:00 - 00:00", "13:00:00-14:00".
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*[-\u2013]\s*\d{1,2}:\d{2}/.test(s)) return null
  const m =
    /(T)?\d{1,2}:\d{2}(:\d{2}(?:[.,]\d+)?)?\s*(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)\s*$/i.exec(s)
  if (!m) return null
  // Sin la T de ISO ni segundos, no es una hora ISO: el signo no es una zona.
  if (!m[1] && !m[2]) return null
  if (m[3]) return 0
  const h = Number(m[5])
  const min = Number(m[6] ?? 0)
  if (h > 14 || min > 59) return null
  return (m[4] === '-' ? -1 : 1) * (h * 60 + min)
}

/**
 * Pasa una fecha y hora escritas en otra zona a la hora local del navegador.
 * Un export que da las cenas de las 21:30 de Madrid como `19:30:00Z` las tiene en
 * UTC; contadas tal cual caerían dos horas antes. `Date` ya sabe el horario de
 * verano y la zona del navegador (Canarias, si está allí), así que no se
 * escribe ninguna regla a mano. Puede cambiar el día: las 23:30Z de un sábado
 * de verano son las 01:30 del domingo en Madrid.
 */
export function aHoraLocal(y: number, m: number, d: number, minutos: number, zonaMin: number): { y: number; m: number; d: number; minutos: number } {
  const t = new Date(Date.UTC(y, m - 1, d) + (minutos - zonaMin) * 60_000)
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), minutos: t.getHours() * 60 + t.getMinutes() }
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
 * dd/mm o mm/dd, decidido con los valores que se le pasen, no fila a fila.
 * Quien la llama le pasa la columna de fechas entera o una muestra repartida
 * por todo el fichero (`FILAS_PARA_EL_FORMATO`), nunca solo el principio.
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
          `Se han leído como ${ddmm >= mmdd ? 'día/mes' : 'mes/día'}, que es lo que encaja en más filas. ` +
          'Revísalo abajo, donde dice cómo se leen tus fechas: si el orden es el otro, las semanas se colocan mal.',
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
          'Se han leído como día/mes, que es lo normal en España. Si tu fichero viene en formato americano, ' +
          'cámbialo en el botón de abajo, donde dice cómo se leen tus fechas.',
      },
    }
  }

  return { formato: 'dd/mm', advertencia: null }
}

/**
 * Cada cuánto trae horas el fichero, y si eso se puede creer.
 *
 * ── POR QUÉ HACE FALTA ───────────────────────────────────────────────────
 * Toda la herramienta descansa en una curva de comensales por media hora. Un
 * export de tickets la da tal cual. Pero medio TPV exporta YA AGRUPADO: una
 * fila por hora, o por bloque de dos horas, o un total por servicio.
 *
 * Sin esto, las 80 comidas de una hora entraban enteras en la franja de las
 * 13:00 y la de las 13:30 se quedaba a cero. El pico simultáneo salía al doble
 * y el pico es justo lo que marca cuánta gente hace falta (ver `drivers` en
 * staffing): la plantilla salía inflada, con un número creíble y sin un solo
 * aviso. Es el error más caro que puede cometer esta herramienta.
 *
 * ── CÓMO SE DECIDE ───────────────────────────────────────────────────────
 * Con las horas que de verdad aparecen, no con la cabecera ni con el nombre
 * del fichero. Se cuenta cuántas filas hay en cada hora distinta, se tiran las
 * que no llegan al 0,5% (una fila sucia a las 13:37 en un fichero por horas no
 * lo convierte en un fichero de tickets) y el paso es la **distancia más
 * pequeña** entre dos horas que queden.
 *
 * La distancia más pequeña, y no la media ni el máximo común divisor, porque:
 * - Un hueco entre comida y cena es normal y no dice nada del paso.
 * - Un fichero de tickets a horas exactas por casualidad da 30 y se trata como
 *   lo que es, media hora, que no necesita reparto.
 * - Cerrar los lunes no cambia la respuesta.
 *
 * ── Y LUEGO SE COMPRUEBA QUE ENCAJA ──────────────────────────────────────
 * El paso solo se cree si el 95% de las filas cae justo en él. Sin esa segunda
 * vuelta, un fichero de tickets de verdad con mucho volumen podía acabar
 * repartido: al tirar las horas flojas quedan las puntas, que en un local con
 * reserva son las horas en punto, y de ahí sale un paso de 60 que el fichero
 * NO tiene. Eso partiría los picos en dos y sacaría MENOS gente de la que hace
 * falta, que es el error peor de los dos. Con la comprobación de encaje, un
 * fichero con horas sueltas se queda como está.
 *
 * El encaje se mide contra la hora más temprana y no contra medianoche: un
 * fichero con un total por servicio (13:00 y 21:00) tiene un paso de 8 horas
 * perfectamente real, y 780 no es múltiplo de 480.
 *
 * Una sola hora en todo el fichero (el total del día colgado de las 00:00) da
 * 1.440: no hay nada dentro del día que repartir.
 */
export function detectarPasoHorario(minutos: number[]): { paso: number; fiable: boolean } {
  const fiable = minutos.length >= FILAS_PARA_FIARSE_DEL_PASO

  const cuenta = new Map<number, number>()
  for (const m of minutos) {
    // El reloj, no el minuto de rejilla: la 01:00 de la madrugada es la misma
    // hora del día tanto si el turno la cuenta como del día anterior o no.
    const hora = ((m % 1440) + 1440) % 1440
    cuenta.set(hora, (cuenta.get(hora) ?? 0) + 1)
  }
  if (cuenta.size === 0) return { paso: 1440, fiable: false }

  const umbral = minutos.length * PESO_MINIMO_DE_UNA_HORA
  let horas = [...cuenta.entries()]
    .filter(([, n]) => n >= umbral)
    .map(([h]) => h)
    .sort((a, b) => a - b)
  // Con tan pocas filas que el umbral se lo come todo, se mira sin umbral: es
  // mejor decidir con lo que hay que decidir con una lista vacía.
  if (horas.length === 0) horas = [...cuenta.keys()].sort((a, b) => a - b)
  if (horas.length === 1) return { paso: 1440, fiable }

  let paso = 1440
  for (let i = 1; i < horas.length; i++) {
    const d = horas[i] - horas[i - 1]
    if (d > 0 && d < paso) paso = d
  }
  if (paso <= SLOT_MINUTES) return { paso, fiable }

  // El encaje: con el paso ya calculado, ¿caen las filas donde deberían?
  const base = horas[0]
  let encajan = 0
  for (const [hora, n] of cuenta) {
    if ((((hora - base) % paso) + paso) % paso === 0) encajan += n
  }
  if (encajan / minutos.length < ENCAJE_MINIMO_DEL_PASO) {
    // No viene agrupado: son horas de verdad con sus puntas. Se deja como está.
    return { paso: 1, fiable }
  }
  return { paso, fiable }
}

/**
 * Redondea un día de la curva a enteros SIN cambiar su total.
 *
 * Hace falta desde que un fichero agrupado reparte cada bloque entre varias
 * franjas: repartir 5 comensales entre dos medias horas da 2,5 y 2,5, y
 * redondear cada una por su cuenta da 3 y 3, o sea, un comensal salido de la
 * nada en cada bloque del día. Con la promesa de "el total es el tuyo" escrita
 * en pantalla, eso no puede pasar.
 *
 * Reparto por mayor resto: cada franja se queda con su parte entera y los que
 * faltan para cuadrar el total van a las franjas con la fracción más alta. Un
 * día que ya venía en enteros (el caso normal) sale idéntico.
 */
export function redondearConservandoTotal(dia: number[]): number[] {
  const base = dia.map((v) => Math.floor(v))
  const objetivo = Math.round(dia.reduce((s, v) => s + v, 0))
  let faltan = objetivo - base.reduce((s, v) => s + v, 0)
  if (faltan <= 0) return base

  const orden = dia
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
  for (const { i } of orden) {
    if (faltan === 0) break
    base[i] += 1
    faltan--
  }
  return base
}

/**
 * En cuántas franjas hay que repartir una fila, según el paso del fichero.
 *
 * 1 = tal cual, que es el caso normal. Nunca más de las que caben en el tope
 * repartible: un total diario no se reparte, se rechaza.
 */
export function franjasPorFila(paso: number): number {
  if (paso <= SLOT_MINUTES) return 1
  if (paso > PASO_MAXIMO_REPARTIBLE) return 1
  return Math.round(paso / SLOT_MINUTES)
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
  const olfateo = muestraRepartida(filas, FILAS_A_OLFATEAR)
  const provisional = detectarFormatoFecha(olfateo.flat()).formato
  const columnas = detectarColumnas(cabeceras, filas, provisional)

  // Ya con la columna de fechas identificada, se decide en serio y solo con
  // ella: es de donde sale la advertencia que ve el usuario, y mezclarla con
  // números de ticket que casualmente parecen fechas la haría mentir.
  const iFecha = columnas.findIndex((c) => c.destino === 'fecha')
  const { advertencia } = detectarFormatoFecha(
    iFecha >= 0
      ? muestraRepartida(filas, FILAS_PARA_EL_FORMATO).map((f) => f[iFecha] ?? null)
      : olfateo.flat(),
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

/**
 * Qué días de la semana abre el local: los que tienen comensales en al menos
 * la mitad de las semanas. Sirve para no tomar por "semana a medias" la
 * primera de un fichero que empieza en martes porque el lunes se cierra.
 */
function diasQueAbre(weeks: WeekDemand[], sin: WeekDemand): boolean[] {
  const otras = weeks.filter((w) => w !== sin)
  // Con menos de dos semanas más no hay con qué comparar: no se quita nada.
  if (otras.length < 2) return new Array<boolean>(7).fill(false)
  // Ni con un fichero de filas sueltas: si las demás semanas traen tres días
  // o menos, faltar un día no dice nada.
  const diasConDatos = (w: WeekDemand) => w.days.filter((d) => d.some((v) => v > 0)).length
  if (otras.some((w) => diasConDatos(w) < 4)) return new Array<boolean>(7).fill(false)
  return Array.from({ length: 7 }, (_, d) => {
    const conDatos = otras.filter((w) => w.days[d].some((v) => v > 0)).length
    return conDatos * 4 >= otras.length * 3
  })
}

/** "a, b y c". */
function listarConY(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
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

  /** Varias filas de golpe, con sus ejemplos ya elegidos. */
  suma(motivo: MotivoDescarte, filas: number, ejemplos: number[]) {
    if (filas <= 0) return
    const actual = this.mapa.get(motivo) ?? { filas: 0, ejemplos: [] }
    actual.filas += filas
    for (const e of ejemplos) if (actual.ejemplos.length < 3 && e > 0) actual.ejemplos.push(e)
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
/**
 * La semana normal de ventas: la mediana de lo facturado por semana, sin las
 * semanas a cero (cierres). La mediana y no la media, por lo mismo que la semana
 * tipo: Navidad no puede subir la semana normal de todo el año.
 */
function ventasNormales(ventas: Map<number, number>): { ventasSemanaNormal: number | null; semanasConVentas: number } {
  const v = [...ventas.values()].filter((x) => x > 0).sort((a, b) => a - b)
  if (v.length === 0) return { ventasSemanaNormal: null, semanasConVentas: 0 }
  const m = v.length % 2 === 1 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  return { ventasSemanaNormal: Math.round(m), semanasConVentas: v.length }
}

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Días desde 1970 a 'YYYY-MM-DD'. */
function fechaISO(abs: number): string {
  return new Date(abs * 86_400_000).toISOString().slice(0, 10)
}

/** Días desde 1970 a "4 de noviembre de 2025". */
function fechaLarga(abs: number, conAno = true): string {
  const d = new Date(abs * 86_400_000)
  return `${d.getUTCDate()} de ${MESES_LARGOS[d.getUTCMonth()]}${conAno ? ` de ${d.getUTCFullYear()}` : ''}`
}

/** "del 4 de noviembre al 28 de diciembre de 2025", o con los dos años si cruza. */
function rangoDeFechas(desde: number, hasta: number): string {
  const mismoAno = new Date(desde * 86_400_000).getUTCFullYear() === new Date(hasta * 86_400_000).getUTCFullYear()
  return `del ${fechaLarga(desde, !mismoAno)} al ${fechaLarga(hasta)}`
}

/** Lunes de la semana ISO 1 de un año, en días desde 1970. */
function lunesDeLaSemana1(ano: number): number {
  return Math.round(isoWeekStart(ano, 1).getTime() / 86_400_000)
}

/** El año ISO entero como periodo, de su semana 1 a su última semana. */
function ventanaDeAno(ano: number, semanas = 0): OpcionPeriodo {
  const desdeLunes = lunesDeLaSemana1(ano)
  const hastaLunes = lunesDeLaSemana1(ano + 1) - 7
  return {
    clave: `ano-${ano}`,
    etiqueta: `Solo ${ano}, ${rangoDeFechas(desdeLunes, hastaLunes + 6)}`,
    desdeLunes,
    hastaLunes,
    semanas,
  }
}

/**
 * Los periodos que se pueden usar de un fichero (ronda 7, G1 de pantallas).
 *
 * El primero es el que se usa si nadie dice otra cosa: el fichero entero si
 * cabe en 52 semanas (aunque cruce el cambio de año, que es lo que trae un
 * export de "los últimos 12 meses"), y si no, las últimas 52, que son las más
 * parecidas a lo que viene. Después, cada año natural que traiga al menos
 * cuatro semanas, para quien prefiera mirar un año en concreto. Un fichero de
 * un solo año natural no tiene nada que elegir y da una sola opción.
 *
 * `semanas` llega en orden de calendario y sin las semanas a medias de los
 * bordes, que no cuentan.
 */
export function periodosDelFichero(
  semanas: { lunes: number; ano: number; primerDia?: number; ultimoDia?: number }[],
): OpcionPeriodo[] {
  if (semanas.length === 0) return []
  const min = semanas[0].lunes
  const max = semanas[semanas.length - 1].lunes
  const cuenta = (d: number, h: number) => semanas.filter((x) => x.lunes >= d && x.lunes <= h).length
  const out: OpcionPeriodo[] = []
  if ((max - min) / 7 + 1 <= 52) {
    out.push({
      clave: 'todo',
      // Con los días de verdad, no los lunes: "del 4 de noviembre", no del 3.
      etiqueta: `Todo el fichero, ${rangoDeFechas(semanas[0].primerDia ?? min, semanas[semanas.length - 1].ultimoDia ?? max + 6)}`,
      desdeLunes: min,
      hastaLunes: max,
      semanas: cuenta(min, max),
    })
  } else {
    const desde = max - 51 * 7
    out.push({
      clave: 'ultimas-52',
      etiqueta: `Las últimas 52 semanas, ${rangoDeFechas(desde, max + 6)}`,
      desdeLunes: desde,
      hastaLunes: max,
      semanas: cuenta(desde, max),
    })
  }
  const anos = [...new Set(semanas.map((x) => x.ano))].sort((a, b) => b - a)
  if (anos.length > 1) {
    for (const a of anos) {
      const v = ventanaDeAno(a)
      const n = cuenta(v.desdeLunes, v.hastaLunes)
      if (n >= 4) out.push({ ...v, semanas: n })
    }
  }
  return out
}

/**
 * Filas repartidas por todo el fichero, en orden. Si caben, todas. Lo que se
 * decide con una muestra tiene que ver el fichero entero, no su primera semana.
 */
function muestraRepartida<T>(filas: T[], cuantas: number): T[] {
  if (filas.length <= cuantas) return filas
  const paso = filas.length / cuantas
  return Array.from({ length: cuantas }, (_, i) => filas[Math.floor(i * paso)])
}

/**
 * El usuario dice qué fue un hueco largo del fichero (ronda 7, M3 de cálculo):
 * un cierre (sus semanas entran a cero y la lectura las marca como cierre, y
 * diez o más hacen el local de temporada) o datos que faltan (sus semanas no
 * están y el cálculo se hace con las demás, como si abriera todo el año).
 */
export function aplicarHueco<T extends DemandDataset>(dataset: T, indice: number, cerrado: boolean): T {
  const huecos = (dataset.source as FuenteLeida).huecos
  const h = huecos?.[indice]
  if (!huecos || !h || h.cerrado === cerrado) return dataset
  const clave = (w: { isoWeek: number; year: number }) => `${w.year}-${w.isoWeek}`
  const delHueco = new Set(h.semanas.map(clave))
  let weeks = dataset.weeks.filter((w) => !(w.relleno && delHueco.has(clave(w))))
  if (cerrado) {
    weeks = [...weeks, ...h.semanas.map((x) => semanaVacia(x.year, x.isoWeek, 'hueco'))].sort(
      (a, b) => a.isoWeek - b.isoWeek,
    )
  }
  return {
    ...dataset,
    weeks,
    source: { ...dataset.source, huecos: huecos.map((x, j) => (j === indice ? { ...x, cerrado } : x)) },
  }
}

/**
 * ¿La columna de tickets IDENTIFICA tickets en vez de contarlos?
 *
 * Es la diferencia entre `3` y `T0010101`. Lo es si la mayoría de sus valores
 * no son números (el umbral es la mitad a propósito: un puñado de celdas
 * sucias no convierte una columna de cantidades en una de códigos). Y desde la
 * ronda 8 también si son números que no pueden ser una cantidad: un número de
 * documento (10234) o la numeración del día (1, 2, 3… 180), que no se repite
 * casi nunca. Una cantidad de tickets por fila se repite mucho y es pequeña.
 */
function columnaEsCodigo(filas: FilaCruda[], i: number): boolean {
  const muestra = muestraRepartida(filas, FILAS_A_OLFATEAR)
  let vistos = 0
  const nums: number[] = []
  for (const f of muestra) {
    const v = f[i] ?? null
    if (v === null || String(v).trim() === '') continue
    vistos++
    const n = parsearNumero(v)
    if (n !== null) nums.push(n)
  }
  if (vistos === 0) return false
  if (nums.length / vistos < 0.5) return true
  if (!nums.every(Number.isInteger)) return false
  const orden = [...nums].sort((a, b) => a - b)
  const mediana = orden[Math.floor(orden.length / 2)]
  if (mediana >= 500) return true
  return new Set(nums).size / nums.length > 0.5 && orden[orden.length - 1] > 30
}

/** Minutos máximos entre las líneas de un mismo ticket para creerse que lo son. */
const MINUTOS_MAXIMOS_DE_UN_TICKET = 180

/**
 * ¿Se pueden juntar las líneas por su número de ticket?
 *
 * Casi siempre sí. La excepción es una columna que se ha marcado como ticket y
 * es otra cosa que se repite en el día (la mesa, el camarero): sus "líneas" se
 * reparten por todo el servicio. Si muchas de las repetidas están separadas
 * más de tres horas, no es un número de ticket y no se junta.
 */
function codigoAgrupaLineas(lineas: { diaAbs: number; codigo: string | null; orden: number }[]): boolean {
  const rango = new Map<string, { min: number; max: number; n: number }>()
  for (const l of lineas) {
    if (l.codigo === null) continue
    const k = `${l.diaAbs}|${l.codigo}`
    const r = rango.get(k)
    if (r) {
      r.n++
      if (l.orden < r.min) r.min = l.orden
      if (l.orden > r.max) r.max = l.orden
    } else {
      rango.set(k, { min: l.orden, max: l.orden, n: 1 })
    }
  }
  let repetidos = 0
  let separados = 0
  for (const r of rango.values()) {
    if (r.n < 2) continue
    repetidos++
    if (r.max - r.min > MINUTOS_MAXIMOS_DE_UN_TICKET) separados++
  }
  return repetidos === 0 || separados / repetidos <= 0.3
}

/**
 * Sin número de ticket, ¿trae el fichero una línea por producto?
 *
 * Se nota en que muchas líneas comparten la fecha y la hora EXACTAS. Pero dos
 * mesas que pagan en el mismo minuto también lo hacen, y más cuanto más lleno
 * está el local, así que no basta con ver repeticiones: se comparan con las
 * que saldrían por pura casualidad. En cada hora de cada día, con `n` cobros
 * repartidos al azar entre los R minutos que usa esa hora (o sus segundos, si el
 * fichero trae segundos), salen de media `R·(1 − (1 − 1/R)^n)` horas
 * distintas. Si salen muchas menos, las líneas vienen en racimos: son
 * productos de un mismo ticket. Con pocas filas no se afirma nada.
 */
function lineasJuntasPorHora(lineas: { diaAbs: number; orden: number; marca: string }[]): boolean {
  if (lineas.length < 200) return false
  let conSegundos = 0
  let miradas = 0
  for (const l of muestraRepartida(lineas, FILAS_A_OLFATEAR)) {
    const [fecha, hora] = l.marca.split('|')
    const texto = hora !== '' ? hora : fecha
    miradas++
    const numero = Number(texto)
    if (texto.trim() !== '' && Number.isFinite(numero)) {
      if (Math.round((numero % 1) * 86_400) % 60 !== 0) conSegundos++
      continue
    }
    const m = /\d{1,2}:\d{2}:(\d{2})/.exec(texto)
    if (m && m[1] !== '00') conSegundos++
  }
  const porMinuto = miradas > 0 && conSegundos / miradas > 0.2 ? 60 : 1
  // Los minutos que de verdad usa cada hora: una hora de la que solo se trabaja
  // la media hora final no tiene 60 sitios donde caer, sino 30, y contar 60
  // haría parecer racimos lo que solo es un local lleno.
  const cubos = new Map<string, { n: number; marcas: Set<string>; min: number; max: number }>()
  for (const l of lineas) {
    const k = `${l.diaAbs}|${Math.floor(l.orden / 60)}`
    const minuto = l.orden % 60
    const c = cubos.get(k)
    if (c) {
      c.n++
      c.marcas.add(l.marca)
      if (minuto < c.min) c.min = minuto
      if (minuto > c.max) c.max = minuto
    } else {
      cubos.set(k, { n: 1, marcas: new Set([l.marca]), min: minuto, max: minuto })
    }
  }
  let esperadas = 0
  let distintas = 0
  for (const c of cubos.values()) {
    const r = (c.max - c.min + 1) * porMinuto
    esperadas += r * (1 - Math.pow(1 - 1 / r, c.n))
    distintas += c.marcas.size
  }
  return lineas.length / distintas >= 1.3 && distintas / esperadas < 0.7
}

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
  const iImporte = indiceDe(mapeo, 'importe')

  // QUÉ CUENTA CADA FILA (ronda 8, G1 y G2 de la entrada).
  //
  // Tres casos, y los tres entran:
  // - Hay columna de comensales: es el dato, y manda.
  // - Hay columna de tickets: o CUENTA tickets (3, 5…) o los IDENTIFICA
  //   (T0010101). Si los identifica, cada número distinto es un ticket.
  // - No hay ni una ni otra (el export más simple de un TPV: fecha, hora e
  //   importe): cada fila es un cobro, es decir, un ticket. Hasta la ronda 8
  //   eso se descartaba entero con "los comensales no eran un número" y el
  //   usuario se quedaba en la portada sin nada que tocar.
  //
  // En los dos últimos los comensales son una estima (comensales por ticket,
  // que el usuario cambia en la lectura), y se dice. Nunca se cuela una estima
  // con cara de dato: por eso la marca viaja dentro del propio dataset.
  const estimado = iComensales < 0
  const cadaFilaEsTicket = iComensales < 0 && iTickets < 0
  const porTicket = opciones.comensalesPorTicket ?? COMENSALES_POR_TICKET_DEFECTO

  // ¿La columna de tickets CUENTA tickets o los IDENTIFICA? Ver `columnaEsCodigo`:
  // desde la ronda 8 también se reconoce un número de ticket que es un número
  // (10234, o el 1, 2, 3 del día), que antes se multiplicaba por los comensales.
  const ticketsSonCodigo = iTickets >= 0 && columnaEsCodigo(filas, iTickets)

  // ¿El importe trae IVA? (ronda 8, m5). Lo normal en un ticket es que sí.
  const nombreImporte = iImporte >= 0 ? mapeo[iImporte].nombre : ''
  const importeConIva = iImporte >= 0 ? !RE_SIN_IVA.test(normalizar(nombreImporte)) : null

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
        ? muestraRepartida(filas, FILAS_PARA_EL_FORMATO).map((f) => f[iFecha] ?? null)
        : muestraRepartida(filas, FILAS_A_OLFATEAR).flat(),
    )
    formatoFecha = detectado.formato
    if (detectado.advertencia) advertencias.push(detectado.advertencia)
  }

  // Primera pasada: cada LÍNEA del fichero, leída. Todavía no es un ticket: en
  // un export por producto, un ticket son varias líneas, y eso se decide
  // después de haberlas visto todas.
  interface Linea {
    fila: number
    diaAbs: number
    ano: number
    semana: number
    dia: number
    franja: number
    minutos: number
    /** Minutos en el orden de la rejilla (de 06:00 a 06:00), para comparar horas de la misma noche. */
    orden: number
    /** Con signo: negativo es una devolución. */
    comensales: number
    importe: number | null
    /** Número de ticket, si la columna identifica tickets. */
    codigo: string | null
    /** Fecha y hora tal cual vienen, para juntar las líneas del mismo instante. */
    marca: string
  }
  const lineas: Linea[] = []
  let sinHoraPropia = 0
  /** Filas cuya hora traía zona y se ha pasado a la hora local. */
  let horasConZona = 0

  for (let n = 0; n < filas.length; n++) {
    const fila = filas[n]
    const numeroDeFila = n + 1

    if (fila.every((v) => v === null || String(v).trim() === '')) {
      descartes.anota('fila-vacia', numeroDeFila)
      continue
    }

    let fecha = iFecha >= 0 ? parsearFecha(fila[iFecha] ?? null, formatoFecha) : null
    if (!fecha) {
      descartes.anota('fecha-ilegible', numeroDeFila)
      continue
    }

    // La hora puede venir en su columna o dentro de la propia fecha
    // ("14/06/2025 21:40"), que es como la escupe medio TPV.
    let minutos = iHora >= 0 ? parsearHora(fila[iHora] ?? null) : null
    const horaDeLaFecha = minutos === null
    if (minutos === null) {
      minutos = fecha.minutos
      if (minutos !== null && iHora < 0) sinHoraPropia++
    }
    if (minutos === null) {
      descartes.anota('hora-ilegible', numeroDeFila)
      continue
    }

    // La hora con zona (`19:30:00Z`, `T19:30+00:00`) se pasa a la hora del local. Sin
    // zona se queda como viene, que ya es la del local. Una fecha a medianoche
    // en punto (`2025-06-14T00:00:00Z`) es una fecha sin hora escrita en ISO,
    // no un ticket de las 00:00 UTC: moverla la cambiaría de día.
    const zona = zonaDeLaHora(horaDeLaFecha ? (fila[iFecha] ?? null) : (fila[iHora] ?? null))
    if (zona !== null && !(horaDeLaFecha && minutos === 0)) {
      const local = aHoraLocal(fecha.y, fecha.m, fecha.d, minutos, zona)
      fecha = { ...fecha, y: local.y, m: local.m, d: local.d }
      minutos = local.minutos
      horasConZona++
    }

    // Los comensales de la línea, con su signo: un negativo es una devolución
    // y se trata más abajo, no se tira como "no era un número" (ronda 8, m2).
    let comensales: number
    if (iComensales >= 0) {
      const v = parsearNumero(fila[iComensales] ?? null)
      if (v === null) {
        descartes.anota('comensales-ilegibles', numeroDeFila)
        continue
      }
      comensales = v
    } else if (iTickets >= 0 && !ticketsSonCodigo) {
      const v = parsearNumero(fila[iTickets] ?? null)
      if (v === null) {
        descartes.anota('tickets-ilegibles', numeroDeFila)
        continue
      }
      comensales = v * porTicket
    } else {
      comensales = porTicket
    }

    let codigo: string | null = null
    if (ticketsSonCodigo) {
      const bruto = fila[iTickets]
      if (bruto === null || bruto === undefined || String(bruto).trim() === '') {
        // En un fichero que se cuenta por número de ticket, una fila sin número
        // no sabemos qué es. Con comensales, en cambio, la fila vale sola.
        if (iComensales < 0) {
          descartes.anota('ticket-vacio', numeroDeFila)
          continue
        }
      } else {
        codigo = String(bruto).trim()
      }
    }

    // Un ticket de la 01:00 del domingo es del servicio del SÁBADO noche. El
    // TPV pone la fecha del reloj; la rejilla va por el día que abre. Sin esta
    // corrección, cada noche de fin de semana se parte en dos días y el
    // domingo aparece con un pico a la 01:00 que nunca existió.
    const dias = minutos < GRID_START_MIN ? -1 : 0
    const t = new Date(Date.UTC(fecha.y, fecha.m - 1, fecha.d + dias))

    const orden = clockToGridMin(Math.floor(minutos / 60), minutos % 60)
    const franja = minToSlot(orden)
    if (franja < 0 || franja >= SLOTS_PER_DAY) {
      // Solo cae aquí lo que va entre las 04:00 y las 06:00, que es el hueco
      // que la rejilla no cubre. Ver GRID_START_MIN / GRID_END_MIN.
      descartes.anota('hora-fuera-de-rejilla', numeroDeFila)
      continue
    }

    lineas.push({
      fila: numeroDeFila,
      diaAbs: Math.round(t.getTime() / 86_400_000),
      ano: anoISO(t),
      semana: semanaISO(t),
      dia: diaEspanol(t),
      franja,
      minutos,
      orden,
      comensales,
      importe: iImporte >= 0 ? parsearNumero(fila[iImporte] ?? null) : null,
      codigo,
      marca: `${String(fila[iFecha] ?? '')}|${iHora >= 0 ? String(fila[iHora] ?? '') : ''}`,
    })
  }

  // UNA LÍNEA POR PRODUCTO NO SON VARIOS TICKETS (ronda 8, G2).
  //
  // El detalle de ventas de muchos TPV trae una línea por cada cosa que se
  // cobra, todas con el mismo número de ticket. Contadas como tickets, un menú
  // con bebida y café eran tres mesas, y la plantilla salía casi al doble. Se
  // juntan por número de ticket; y si no hay número, por la fecha y la hora
  // exactas, pero solo si el fichero lo pide a gritos (ver `lineasJuntasPorHora`):
  // dos mesas que pagan en el mismo minuto son normales en un sábado.
  const agrupaPorCodigo = ticketsSonCodigo && codigoAgrupaLineas(lineas)
  const agrupaPorHora = cadaFilaEsTicket && lineasJuntasPorHora(lineas)
  const claveDe = (l: Linea): string | null =>
    agrupaPorCodigo && l.codigo !== null
      ? `c|${l.diaAbs}|${l.codigo}`
      : agrupaPorHora
        ? `h|${l.marca}`
        : null

  /** Un ticket: una o varias líneas del fichero. */
  interface Unidad {
    lineas: Linea[]
    /** La línea que manda la hora: la del cobro, la última. */
    principal: Linea
    comensales: number
    importe: number | null
    devolucion: boolean
  }
  const agrupar = (clave: (l: Linea) => string | null): Linea[][] => {
    const grupos = new Map<string, Linea[]>()
    const sueltas: Linea[][] = []
    for (const l of lineas) {
      const k = clave(l)
      if (k === null) {
        sueltas.push([l])
        continue
      }
      const g = grupos.get(k)
      if (g) g.push(l)
      else grupos.set(k, [l])
    }
    return [...grupos.values(), ...sueltas]
  }
  let conjuntos = agrupar(claveDe)

  // El importe de un ticket de varias líneas: unos TPV ponen lo de cada línea
  // (y se suma) y otros repiten el total del ticket en todas (y se cuenta una
  // vez). Se decide mirando el fichero entero, no ticket a ticket: dos cañas
  // iguales en un ticket son normales, y no por eso el fichero repite totales.
  let multiConImporte = 0
  let multiRepetido = 0
  for (const g of conjuntos) {
    if (g.length < 2) continue
    const imps = g.map((l) => l.importe).filter((v): v is number => v !== null)
    if (imps.length < 2) continue
    multiConImporte++
    if (imps.every((v) => Math.abs(v - imps[0]) < 0.005)) multiRepetido++
  }
  const importeRepetido = multiConImporte > 0 && multiRepetido / multiConImporte >= 0.8

  // Sin número de ticket y con el total repetido en cada línea, el total ES lo
  // que distingue a dos tickets cobrados en el mismo minuto: se separan por él.
  // Así tampoco se mezcla una devolución con la venta que anula.
  if (agrupaPorHora && importeRepetido) {
    conjuntos = agrupar((l) => `h|${l.marca}|${l.importe === null ? '' : Math.round(l.importe * 100)}`)
  }

  const unidades: Unidad[] = conjuntos.map((g) => {
    let principal = g[0]
    for (const l of g) if (l.orden > principal.orden) principal = l
    const imps = g.map((l) => l.importe).filter((v): v is number => v !== null)
    const importe = imps.length === 0 ? null : importeRepetido ? imps[0] : imps.reduce((a, b) => a + b, 0)
    let comensales: number
    if (iComensales >= 0) {
      // Los comensales son del ticket, no de la línea: si se repiten en cada
      // línea, se cuentan una vez.
      const vals = g.map((l) => l.comensales)
      const pos = vals.filter((v) => v > 0)
      comensales = pos.length > 0 ? Math.max(...pos) : Math.min(...vals)
    } else if (g.length > 1) {
      comensales = porTicket
    } else {
      comensales = g[0].comensales
    }
    // Una devolución: comensales o tickets en negativo, o, cuando cada fila es
    // un ticket, el importe en negativo.
    const devolucion =
      iComensales >= 0 || (iTickets >= 0 && !ticketsSonCodigo)
        ? comensales < 0
        : importe !== null && importe < 0
    return { lineas: g, principal, comensales, importe, devolucion }
  })

  // LAS DEVOLUCIONES (ronda 8, m2). Una devolución no es un servicio más, y la
  // venta que anula tampoco: la mesa se cobró mal y se volvió a cobrar, o no se
  // llegó a servir. Se quita la devolución y la venta del mismo día y el mismo
  // importe (o, sin importe, los mismos comensales), la más cercana antes de
  // ella. Si no aparece, solo se quita la devolución.
  const anuladas = new Set<Unidad>()
  const devoluciones = unidades.filter((u) => u.devolucion)
  if (devoluciones.length > 0) {
    const claveVenta = (u: Unidad, conImporte: boolean) =>
      conImporte && u.importe !== null
        ? `i|${u.principal.diaAbs}|${Math.round(Math.abs(u.importe) * 100)}`
        : `c|${u.principal.diaAbs}|${Math.abs(u.comensales)}`
    const conImporte = iImporte >= 0
    const ventas = new Map<string, Unidad[]>()
    for (const u of unidades) {
      if (u.devolucion) continue
      const k = claveVenta(u, conImporte)
      const lista = ventas.get(k)
      if (lista) lista.push(u)
      else ventas.set(k, [u])
    }
    for (const d of devoluciones) {
      const candidatas = (ventas.get(claveVenta(d, conImporte)) ?? []).filter((u) => !anuladas.has(u))
      if (candidatas.length === 0) continue
      const antes = candidatas.filter((u) => u.principal.orden <= d.principal.orden)
      const pool = antes.length > 0 ? antes : candidatas
      let mejor = pool[0]
      for (const u of pool) {
        if (Math.abs(u.principal.orden - d.principal.orden) < Math.abs(mejor.principal.orden - d.principal.orden)) mejor = u
      }
      anuladas.add(mejor)
    }
    for (const d of devoluciones) {
      descartes.suma('devolucion', d.lineas.length, d.lineas.map((l) => l.fila))
    }
    for (const u of anuladas) {
      descartes.suma('venta-devuelta', u.lineas.length, u.lineas.map((l) => l.fila))
    }
  }

  // Lo que entra: cada ticket, en la hora de su cobro.
  interface Punto {
    ano: number
    semana: number
    dia: number
    franja: number
    comensales: number
    /** Lo que factura el ticket, si hay columna de importe y trae un número. */
    importe: number | null
    /** Número de la primera fila en el fichero, para poder señalarla si se descarta. */
    fila: number
    /** Cuántas líneas del fichero son este ticket. */
    lineas: number
    /** Día del servicio en días desde 1970, para saber dónde empieza y acaba el fichero. */
    diaAbs: number
  }
  let puntos: Punto[] = []
  /** Las horas de los tickets que valen, para saber si el fichero viene agrupado. */
  const horasVistas: number[] = []
  for (const u of unidades) {
    if (u.devolucion || anuladas.has(u)) continue
    const l = u.principal
    horasVistas.push(l.minutos)
    puntos.push({
      ano: l.ano,
      semana: l.semana,
      dia: l.dia,
      franja: l.franja,
      comensales: u.comensales,
      importe: u.importe,
      fila: Math.min(...u.lineas.map((x) => x.fila)),
      lineas: u.lineas.length,
      diaAbs: l.diaAbs,
    })
  }
  // En el orden del fichero: los ejemplos de cada semana son sus primeras filas.
  puntos.sort((a, b) => a.fila - b.fila)

  const tickets = unidades.length
  const lineasJuntadas = agrupaPorCodigo || agrupaPorHora ? lineas.length - tickets : 0

  // Un fichero con la fila de títulos y nada debajo (revisión ronda 10,
  // hallazgo 7). Antes salía "contamos cada fila como un ticket", que no dice
  // nada a quien no tiene ni una fila: se le dice qué pasa y qué exportar.
  const soloTitulos = filas.every((f) => f.every((v) => v === null || (typeof v === 'string' && v.trim() === '')))
  if (soloTitulos) {
    advertencias.push({
      codigo: 'solo-titulos',
      mensaje:
        'Tu fichero solo trae la fila de títulos, sin ventas. Exporta del TPV el histórico con una fila por ticket y vuelve a subirlo.',
    })
  }

  if (estimado && !soloTitulos) {
    const n = porTicket.toLocaleString('es-ES', { useGrouping: true })
    advertencias.push({
      codigo: 'comensales-estimados',
      mensaje: cadaFilaEsTicket
        ? `Tu fichero no trae ni comensales ni número de ticket, así que contamos cada ${agrupaPorHora ? 'cobro' : 'fila'} como un ticket ` +
          `y le ponemos ${n} comensales, que puedes cambiar abajo, en "Comensales por ticket". ` +
          'Toda cifra de comensales que veas a partir de aquí es una estima, no un dato de tu TPV.'
        : `Tu fichero no trae comensales, así que se han estimado a ${n} por ticket. ` +
          'Toda cifra de comensales que veas a partir de aquí es una estima, no un dato de tu TPV.',
    })
  }

  if (ticketsSonCodigo && !agrupaPorCodigo) {
    advertencias.push({
      codigo: 'tickets-son-codigo',
      mensaje:
        `Tu columna "${mapeo[iTickets].nombre}" se repite en líneas separadas por horas dentro del mismo día, así que no parece el número de ticket ` +
        'y contamos cada línea por separado. Si es la mesa o el camarero, márcala como "No la uses".',
    })
  } else if (ticketsSonCodigo && iComensales < 0 && lineasJuntadas === 0) {
    advertencias.push({
      codigo: 'tickets-son-codigo',
      mensaje: 'Tu columna de tickets trae el número de cada ticket y no una cantidad, así que contamos un ticket por cada número.',
    })
  }

  if (lineasJuntadas > 0) {
    const fmt = (v: number) => v.toLocaleString('es-ES', { useGrouping: true })
    const media = (lineas.length / Math.max(1, tickets)).toLocaleString('es-ES', { maximumFractionDigits: 1 })
    advertencias.push({
      codigo: 'lineas-por-ticket',
      mensaje:
        `Tu fichero trae una línea por producto: ${fmt(lineas.length)} líneas que son ${fmt(tickets)} tickets, ${media} de media por ticket. ` +
        (agrupaPorCodigo
          ? 'Contamos cada número de ticket una vez, no cada línea.'
          : importeRepetido
            ? 'Como no trae número de ticket, juntamos en una las líneas con la misma fecha, la misma hora exacta y el mismo total.'
            : 'Como no trae número de ticket, juntamos en una las líneas con la misma fecha y hora exactas.') +
        (iImporte >= 0
          ? importeRepetido
            ? ' El importe venía repetido en cada línea y se cuenta una vez por ticket.'
            : ' El importe de cada ticket es la suma de sus líneas.'
          : ''),
    })
  }

  if (horasConZona > 0) {
    const zonaLocal = Intl.DateTimeFormat().resolvedOptions().timeZone
    advertencias.push({
      codigo: 'hora-con-zona',
      mensaje:
        `${horasConZona.toLocaleString('es-ES', { useGrouping: true })} ${horasConZona === 1 ? 'hora venía' : 'horas venían'} con zona horaria ` +
        `(por ejemplo, en UTC) y se han convertido a la hora de este ordenador${zonaLocal ? ` (${zonaLocal})` : ''}, ` +
        'con su horario de verano. Si tu local está en otra zona, abre el fichero desde un ordenador que esté en la del local.',
    })
  }

  if (sinHoraPropia > 0 && iHora < 0) {
    advertencias.push({
      codigo: 'sin-hora',
      mensaje:
        'No has marcado ninguna columna como hora, así que se ha usado la que viene dentro de la fecha.',
    })
  }

  // ¿Viene el fichero agrupado? Se decide con las horas que han entrado, no con
  // la cabecera. Ver `detectarPasoHorario`: de esto depende que el pico no salga
  // al doble.
  // Nada de esto se hace con una muestra que no lo sostiene. Cuatro tickets a
  // las 22:00, 00:30, 01:30 y 14:00 dan un paso de 60 minutos por pura
  // casualidad, y repartir ahi partiria en dos una copa que si tenia su hora
  // exacta. Por debajo de `FILAS_PARA_FIARSE_DEL_PASO` no se reparte ni se
  // afirma nada: un historico asi ya lleva su propio aviso de corto.
  const { paso, fiable: pasoFiable } = detectarPasoHorario(horasVistas)
  const franjasPorBloque = pasoFiable ? franjasPorFila(paso) : 1
  const repartido = franjasPorBloque > 1
  const sinDetalleHorario = pasoFiable && paso > PASO_MAXIMO_REPARTIBLE

  // Cada fila es un ticket... salvo que el fichero venga agrupado por horas
  // (ronda 8). Una fila por hora con solo el importe no dice cuánta gente
  // entró: contarla como un ticket sería inventarse la demanda. No se tira en
  // silencio: se dice por qué y la pantalla de columnas deja marcar la que cuente.
  const filasSonBloques = cadaFilaEsTicket && pasoFiable && paso >= 60
  if (filasSonBloques) {
    descartes.suma(
      'sin-cantidad',
      puntos.reduce((s, p) => s + p.lineas, 0),
      puntos.slice(0, 3).map((p) => p.fila),
    )
    puntos = []
  }

  if (repartido && !filasSonBloques) {
    const bloque =
      paso >= 60
        ? `${(paso / 60).toLocaleString('es-ES', { useGrouping: true })} ${paso === 60 ? 'hora' : 'horas'}`
        : `${paso} minutos`
    advertencias.push({
      codigo: 'fichero-agrupado',
      mensaje:
        `Tu fichero no trae la hora de cada ticket: viene agrupado en bloques de ${bloque}. ` +
        `Cada bloque se ha repartido a partes iguales entre sus ${franjasPorBloque} franjas de media hora, ` +
        'porque meterlo entero en la primera dispararía el pico y te saldría más plantilla de la que necesitas. ' +
        'El total de comensales es el tuyo; lo que no sabemos es cómo se movían dentro del bloque. ' +
        'Con un export ticket a ticket el cuadrante sale más fino.',
    })
  }

  if (sinDetalleHorario) {
    advertencias.push({
      codigo: 'sin-detalle-horario',
      mensaje:
        (paso >= 1440
          ? 'Tu fichero trae un solo total por día, sin hora. '
          : `Tu fichero trae bloques de ${Math.round(paso / 60)} horas, demasiado grandes para saber cómo se reparte el día. `) +
        'Esta herramienta dimensiona turnos a partir de lo que pasa dentro del día, así que con esto no se puede: ' +
        'repartir ese total a ojo sería inventarse la forma de tu servicio. Pide a tu TPV el export de ventas ' +
        'con la hora de cada ticket, o al menos por tramos de media hora o de una hora.',
    })
  }

  // Segunda pasada: cada fila al cubo de su semana, con TODO el fichero.
  //
  // Las semanas se agrupan por su lunes, no por su número: hasta la ronda 7 se
  // agrupaban por número dentro del año que más filas tenía, y un export de
  // "los últimos 12 meses" (del 4 de noviembre al 1 de noviembre) perdía en
  // silencio noviembre y diciembre, la Navidad incluida. Ahora primero se
  // juntan todas las semanas del fichero en orden de calendario y DESPUÉS se
  // elige el periodo que se usa (ver `elegirVentana`).
  //
  // Si el fichero viene agrupado, la fila no cae en una franja: se reparte entre
  // las que cubre su bloque. El reparto se queda DENTRO de la rejilla y divide
  // solo entre las franjas que caben, para que el total de comensales de la
  // semana siga siendo exactamente el del fichero.
  interface Cubo {
    lunes: number
    ano: number
    semana: number
    dias: number[][]
    filas: number
    ejemplos: number[]
    ventas: number
    conVentas: boolean
    primerDia: number
    ultimoDia: number
  }
  const cubos = new Map<number, Cubo>()
  for (const p of puntos) {
    const lunes = p.diaAbs - p.dia
    let c = cubos.get(lunes)
    if (!c) {
      c = {
        lunes,
        ano: p.ano,
        semana: p.semana,
        dias: Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0)),
        filas: 0,
        ejemplos: [],
        ventas: 0,
        conVentas: false,
        primerDia: p.diaAbs,
        ultimoDia: p.diaAbs,
      }
      cubos.set(lunes, c)
    }
    c.filas += p.lineas
    if (c.ejemplos.length < 3) c.ejemplos.push(p.fila)
    if (p.diaAbs < c.primerDia) c.primerDia = p.diaAbs
    if (p.diaAbs > c.ultimoDia) c.ultimoDia = p.diaAbs
    if (p.importe !== null && Number.isFinite(p.importe)) {
      c.ventas += p.importe
      c.conVentas = true
    }
    if (franjasPorBloque === 1) {
      c.dias[p.dia][p.franja] += p.comensales
    } else {
      const ultima = Math.min(p.franja + franjasPorBloque, SLOTS_PER_DAY)
      const cuantas = ultima - p.franja
      const parte = p.comensales / cuantas
      for (let f = p.franja; f < ultima; f++) c.dias[p.dia][f] += parte
    }
  }

  // Se redondea al final, no fila a fila: con tickets a 2,5 comensales,
  // redondear cada uno antes de sumar desvía el total de la semana.
  const enOrden = [...cubos.values()].sort((a, b) => a.lunes - b.lunes)
  const semanaDe = new Map<Cubo, WeekDemand>()
  for (const c of enOrden) {
    const days = c.dias.map(redondearConservandoTotal)
    semanaDe.set(c, {
      isoWeek: c.semana,
      year: c.ano,
      startDate: fechaISO(c.lunes),
      days,
      total: weekTotal(days),
    })
  }
  const todas = enOrden.map((c) => semanaDe.get(c)!)

  // Semanas a medias en los bordes del FICHERO (ronda 6, M3 de pantallas). Un
  // export "del 1 de enero al 31 de diciembre" empieza y acaba a mitad de
  // semana, y esa semana con dos días de menos salía como "semana floja, -28 %"
  // y entraba en la cobertura. Se quita si le faltan días que el local abre
  // normalmente; un lunes que falta en un local que cierra los lunes no la deja
  // a medias. Se mira antes de elegir el periodo, para que el rabo de un año
  // natural no cuente como "otro año" del fichero.
  const incompletas = new Set<Cubo>()
  if (enOrden.length > 1) {
    const flojaFrenteALasDemas = (w: WeekDemand) => {
      const otras = todas.filter((x) => x !== w).map((x) => x.total).sort((a, b) => a - b)
      const mediana = otras[Math.floor(otras.length / 2)] ?? 0
      return w.total < mediana * 0.9
    }
    const primera = enOrden[0]
    const wPrimera = semanaDe.get(primera)!
    const abreAlPrincipio = diasQueAbre(todas, wPrimera)
    const diaIni = primera.primerDia - primera.lunes
    if ([0, 1, 2, 3, 4, 5, 6].some((d) => d < diaIni && abreAlPrincipio[d]) && flojaFrenteALasDemas(wPrimera)) {
      incompletas.add(primera)
    }
    const ultima = enOrden[enOrden.length - 1]
    const wUltima = semanaDe.get(ultima)!
    const abreAlFinal = diasQueAbre(todas, wUltima)
    const diaFin = ultima.ultimoDia - ultima.lunes
    if ([0, 1, 2, 3, 4, 5, 6].some((d) => d > diaFin && abreAlFinal[d]) && flojaFrenteALasDemas(wUltima)) {
      incompletas.add(ultima)
    }
    if (enOrden.length - incompletas.size < 1) incompletas.clear()
  }
  const completas = enOrden.filter((c) => !incompletas.has(c))

  // El periodo que se usa: el que haya elegido el usuario o, si no, todo el
  // fichero si cabe en un año, y las últimas 52 semanas si es más largo.
  const periodos = periodosDelFichero(
    completas.map((c) => ({ lunes: c.lunes, ano: c.ano, primerDia: c.primerDia, ultimoDia: c.ultimoDia })),
  )
  // La semana a medias del borde sigue siendo del fichero: el periodo la
  // abarca para que se diga que no se cuenta, en vez de darla por "fuera".
  for (const o of periodos) {
    if (o.clave !== 'todo' && o.clave !== 'ultimas-52') continue
    for (const c of incompletas) {
      if (c.lunes === o.hastaLunes + 7) o.hastaLunes = c.lunes
      if (o.clave === 'todo' && c.lunes === o.desdeLunes - 7) o.desdeLunes = c.lunes
    }
  }
  const clavePedida = opciones.periodo ?? (opciones.year ? `ano-${opciones.year}` : undefined)
  const ventana =
    periodos.find((o) => o.clave === clavePedida) ??
    (opciones.year ? ventanaDeAno(opciones.year) : periodos[0]) ??
    null
  const dentro = (c: Cubo) => ventana !== null && c.lunes >= ventana.desdeLunes && c.lunes <= ventana.hastaLunes

  let usadas = 0
  const usados: Cubo[] = []
  const ventasPorSemana = new Map<number, number>()
  for (const c of enOrden) {
    if (!dentro(c)) {
      descartes.suma('fuera-del-ano', c.filas, c.ejemplos)
      continue
    }
    usadas += c.filas
    if (incompletas.has(c)) continue
    usados.push(c)
    if (c.conVentas) ventasPorSemana.set(c.lunes, c.ventas)
  }
  const incompletasDentro = [...incompletas].filter(dentro)

  // El año del histórico: el que más semanas pone dentro del periodo (a igualdad,
  // el más reciente). Solo sirve para colocar los festivos móviles; cada semana
  // lleva el suyo.
  const semanasPorAno = new Map<number, number>()
  for (const c of usados) semanasPorAno.set(c.ano, (semanasPorAno.get(c.ano) ?? 0) + 1)
  let year = 0
  let masSemanas = -1
  for (const [a, n] of semanasPorAno) {
    if (n > masSemanas || (n === masSemanas && a > year)) {
      masSemanas = n
      year = a
    }
  }
  if (!year) year = opciones.year ?? new Date().getFullYear() - 1

  // Cada semana en su número del año, aunque venga de otro año natural: así un
  // export de noviembre a octubre da sus 52 semanas, con la Navidad en su sitio.
  let weeks: WeekDemand[] = usados.map((c) => semanaDe.get(c)!).sort((a, b) => a.isoWeek - b.isoWeek)

  // Lo que se queda fuera por el periodo, dicho con fechas y no solo en filas.
  const fueraDelPeriodo = enOrden.filter((c) => !dentro(c))
  if (fueraDelPeriodo.length > 0 && ventana) {
    const filasFuera = fueraDelPeriodo.reduce((s, c) => s + c.filas, 0)
    const antes = fueraDelPeriodo.filter((c) => c.lunes < ventana.desdeLunes)
    const despues = fueraDelPeriodo.filter((c) => c.lunes > ventana.hastaLunes)
    const tramos: string[] = []
    if (antes.length > 0) tramos.push(rangoDeFechas(antes[0].primerDia, antes[antes.length - 1].ultimoDia))
    if (despues.length > 0) tramos.push(rangoDeFechas(despues[0].primerDia, despues[despues.length - 1].ultimoDia))
    advertencias.push({
      codigo: 'varios-anos',
      mensaje:
        `Uso ${ventana.etiqueta.charAt(0).toLowerCase()}${ventana.etiqueta.slice(1)}; ` +
        `quedan fuera ${filasFuera.toLocaleString('es-ES', { useGrouping: true })} ${filasFuera === 1 ? 'fila' : 'filas'}, ${listarConY(tramos)}. ` +
        'Puedes elegir otro periodo justo debajo.',
    })
  }

  if (incompletasDentro.length > 0) {
    const partes = incompletasDentro.map((c) => {
      const dias = c.ultimoDia - c.primerDia + 1
      // Con la fecha y no con el número: "la semana 1" de un fichero de 2025
      // es la del 29 de diciembre, y dicho así no lo entiende nadie.
      return `la semana del ${fechaLarga(c.lunes, false)} solo trae ${dias} ${dias === 1 ? 'día' : 'días'}`
    })
    advertencias.push({
      codigo: 'semana-incompleta',
      mensaje:
        `Tu fichero empieza o acaba a mitad de semana: ${listarConY(partes)}, y no la contamos. ` +
        'Una semana a la que le faltan días parecería floja sin serlo.',
    })
  }

  const semanasConDatos = weeks.length
  if (semanasConDatos > 0 && semanasConDatos < 40) {
    advertencias.push({
      codigo: 'historico-corto',
      mensaje:
        `Tu histórico tiene ${semanasConDatos} semanas. El cálculo se hace con lo que hay: ` +
        'no se inventa lo que falta, pero cuantas más semanas le des, mejor sabrá cuál es tu semana normal.',
    })
  }

  // El horario se deduce SOLO de las semanas con datos: las que se rellenan a
  // cero justo debajo bajarían la mediana de cada franja a nada.
  const { detectedHours, poblado, diasConCobrosFuera } = deducirHorario(weeks, opciones.lagMinutes ?? DEFAULT_LAG_MINUTES)
  if (weeks.length > 0 && !poblado) {
    advertencias.push({
      codigo: 'horario-poco-poblado',
      mensaje:
        'Tu histórico tiene pocos comensales por franja, así que el horario de algunos días se ha deducido con el ' +
        'listón más bajo. Repásalo en el paso de horario antes de seguir.',
    })
  }
  if (diasConCobrosFuera.length > 0) {
    // Un día que sale cerrado no "deja fuera el 100 %": sale cerrado y tiene
    // cobros, y se dice así (revisión ronda 10, hallazgo 6).
    const cerrados = diasConCobrosFuera.filter((x) => x.cerrado)
    const recortados = diasConCobrosFuera.filter((x) => !x.cerrado)
    const partes: string[] = []
    if (cerrados.length > 0) {
      const dias = listarConY(cerrados.map((x) => `el ${NOMBRE_DIA[x.dia]}`))
      partes.push(
        cerrados.length === 1
          ? `El horario deducido deja cerrado ${dias}, pero ese día tiene cobros en tu fichero.`
          : `El horario deducido deja cerrados ${dias}, pero esos días tienen cobros en tu fichero.`,
      )
    }
    if (recortados.length > 0) {
      const lista = recortados.map((x) => `el ${NOMBRE_DIA[x.dia]} (${Math.round(x.fuera * 100)} %)`).join(', ')
      partes.push(`El horario deducido deja fuera una parte de los cobros de algunos días: ${lista}.`)
    }
    advertencias.push({
      codigo: 'horario-deja-fuera',
      mensaje:
        `${partes.join(' ')} ` +
        'Esos cobros no cuentan para la plantilla. Repasa el horario de esos días antes de seguir.',
    })
  }

  // Los huecos DENTRO del fichero (ronda 6, y ronda 7 M3 de cálculo). Un TPV no
  // escribe filas las semanas que el local está cerrado, así que un hueco corto
  // (vacaciones, obras, agosto) es un cierre y se rellena a cero para que la
  // lectura lo marque como tal. Pero un hueco largo también puede ser un cambio
  // de TPV o un export a trozos, y tomarlo por cierre convertía un restaurante
  // abierto todo el año en uno de temporada que paga 40 semanas. Ese no se
  // decide a ciegas: se propone lo más probable y la pantalla lo pregunta.
  const huecos: HuecoDelFichero[] = []
  if (usados.length > 1) {
    const presentes = new Set(usados.map((c) => c.lunes))
    const conDatos = weeks.map((w) => w.total).filter((t) => t > 0).sort((a, b) => a - b)
    const mediana = conDatos[Math.floor(conDatos.length / 2)] ?? 0
    const totalDe = (c: Cubo) => semanaDe.get(c)!.total
    const primero = usados[0].lunes
    const ultimo = usados[usados.length - 1].lunes
    let lunes = primero + 7
    while (lunes < ultimo) {
      if (presentes.has(lunes)) {
        lunes += 7
        continue
      }
      const inicio = lunes
      while (lunes < ultimo && !presentes.has(lunes)) lunes += 7
      const fin = lunes - 7
      const semanas = Array.from({ length: (fin - inicio) / 7 + 1 }, (_, i) => {
        const d = new Date((inicio + i * 7) * 86_400_000)
        return { isoWeek: semanaISO(d), year: anoISO(d) }
      })
      if (semanas.length < SEMANAS_HUECO_DUDOSO) {
        for (const s of semanas) weeks.push(semanaVacia(s.year, s.isoWeek, 'hueco'))
        continue
      }
      // ¿Se apaga el local antes y se enciende después, o se corta en seco?
      // Una temporada baja poco a poco; un cambio de TPV corta con semanas
      // normales a los dos lados. Y un hueco que cae entero en verano es el
      // patrón de quien cierra en verano.
      const lado = (cs: Cubo[]) => (cs.length ? cs.reduce((s, c) => s + totalDe(c), 0) / cs.length : 0)
      const antes = lado(usados.filter((c) => c.lunes < inicio).slice(-3))
      const despues = lado(usados.filter((c) => c.lunes > fin).slice(0, 3))
      const normalALosDosLados = mediana > 0 && antes >= mediana * 0.6 && despues >= mediana * 0.6
      const enVerano = semanas.every((s) => s.isoWeek >= 26 && s.isoWeek <= 37)
      const cerrado = !normalALosDosLados || enVerano
      huecos.push({
        desde: fechaISO(inicio),
        hasta: fechaISO(fin + 6),
        semanas,
        cerrado,
        propuesto: cerrado,
      })
      if (cerrado) for (const s of semanas) weeks.push(semanaVacia(s.year, s.isoWeek, 'hueco'))
      advertencias.push({
        codigo: 'hueco-en-el-fichero',
        mensaje:
          `Entre el ${fechaLarga(inicio)} y el ${fechaLarga(fin + 6)} tu fichero no trae ninguna venta (${semanas.length} semanas). ` +
          (cerrado
            ? 'Lo tomo como un cierre del local. Si es que faltan datos (por ejemplo, cambiaste de TPV), dímelo en la lectura.'
            : 'Lo tomo como datos que faltan (por ejemplo, un cambio de TPV), no como un cierre. Si estuviste cerrado, dímelo en la lectura.'),
      })
    }
    weeks.sort((a, b) => a.isoWeek - b.isoWeek)
  }

  // El periodo del fichero (ronda 6, G1 y G3 de cálculo). Lo de FUERA del
  // fichero (antes de la primera semana y después de la última) puede ser una
  // temporada o un export de los últimos meses, y eso no lo sabe el fichero:
  // `periodoDelFichero` lo propone y la pantalla de demanda lo pregunta.
  let periodo: PeriodoDelFichero | undefined
  if (usados.length > 0) {
    const primero = usados[0]
    const ultimo = usados[usados.length - 1]
    // Primer y último día de lo que de verdad cuenta: si se ha quitado una
    // semana a medias, el rango empieza en la siguiente.
    const quitadaAlPrincipio = incompletasDentro.some((c) => c.lunes < primero.lunes)
    const quitadaAlFinal = incompletasDentro.some((c) => c.lunes > ultimo.lunes)
    const desdeAbs = quitadaAlPrincipio ? primero.lunes : primero.primerDia
    const hastaAbs = quitadaAlFinal ? ultimo.lunes + 6 : ultimo.ultimoDia
    // Una semana a medias quitada del borde sigue siendo del fichero: no es
    // una semana "fuera" que preguntar, es una que no se cuenta.
    const bordes = [primero, ultimo, ...incompletasDentro].map((c) => c.lunes)
    const lunesIni = Math.min(...bordes)
    const lunesFin = Math.max(...bordes)
    const semIni = semanaISO(new Date(lunesIni * 86_400_000))
    const semFin = semanaISO(new Date(lunesFin * 86_400_000))
    const largo = (lunesFin - lunesIni) / 7 + 1
    // Un periodo que cruza el cambio de año (de octubre a marzo, por ejemplo)
    // se cuenta por su largo: la semana 40 a la 12 no son "fuera" las 40 de
    // antes y las 40 de después.
    const cruza = anoISO(new Date(lunesIni * 86_400_000)) !== anoISO(new Date(lunesFin * 86_400_000))
    const base = periodoDelFichero({
      year,
      desde: fechaISO(desdeAbs),
      hasta: fechaISO(hastaAbs),
      primeraSemana: cruza ? 1 : semIni,
      ultimaSemana: cruza ? Math.min(52, largo) : semFin,
      semanasConDatos,
      hoy: opciones.hoy ?? new Date(),
    })
    periodo = { ...base, primeraSemana: semIni, ultimaSemana: semFin }
    if (periodo.semanasFuera > 0) {
      const tramo = `Tu fichero solo trae del ${fechaLarga(desdeAbs)} al ${fechaLarga(hastaAbs)}.`
      advertencias.push({
        codigo: 'periodo-del-fichero',
        mensaje: periodo.soloEstePeriodo
          ? `${tramo} Lo tomo como tu temporada: el resto del año, cerrado. Si abres todo el año, cámbialo en la lectura.`
          : `${tramo} Calculo como si abrieras todo el año; si solo abres esas semanas, cámbialo en la lectura.`,
      })
      if (periodo.soloEstePeriodo) weeks = conPeriodoAbierto(weeks, year, periodo, true)
    }
  }

  // Las ventas de una semana normal, SIN IVA (ronda 8, m5). El coste de
  // personal se compara con la cuenta de resultados, que va sin IVA; con el
  // importe del ticket tal cual, el ratio salía un 9 % más bajo de lo real.
  const ventasBrutas = ventasNormales(ventasPorSemana)
  const ivaDescontado = importeConIva && ventasBrutas.ventasSemanaNormal !== null ? IVA_DEL_IMPORTE : null
  const ventasSinIva =
    ventasBrutas.ventasSemanaNormal === null
      ? null
      : ivaDescontado !== null
        ? Math.round(ventasBrutas.ventasSemanaNormal / (1 + ivaDescontado))
        : ventasBrutas.ventasSemanaNormal
  if (ventasBrutas.ventasSemanaNormal !== null) {
    const eur = (v: number) => `${v.toLocaleString('es-ES', { useGrouping: true })} €`
    advertencias.push({
      codigo: 'importe-con-iva',
      mensaje:
        ivaDescontado !== null
          ? `Tu columna "${nombreImporte}" trae el importe con IVA, que es como sale en el ticket. Para compararlo con tu cuenta de resultados ` +
            `lo paso sin IVA, dividiendo entre ${(1 + ivaDescontado).toLocaleString('es-ES', { minimumFractionDigits: 2 })}: ` +
            `una semana normal son ${eur(ventasSinIva ?? 0)} sin IVA (${eur(ventasBrutas.ventasSemanaNormal)} con IVA). ` +
            'Si tu columna ya venía sin IVA, pon la cifra buena en el resultado, donde se piden las ventas.'
          : `Tu columna "${nombreImporte}" viene sin IVA, así que las ventas se usan tal cual: ${eur(ventasSinIva ?? 0)} en una semana normal.`,
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
      // El primer y el último día con datos (ronda 6, m1 de pantallas): antes
      // salía el lunes de la última semana, no el último día.
      dateRange: periodo ? `${periodo.desde} → ${periodo.hasta}` : '—',
      columnsDetected: mapeo.map((c) => ({
        label: c.nombre,
        mappedTo: ETIQUETA_POR_DESTINO[c.destino],
        confidence: c.confianza,
        samples: c.ejemplos,
      })),
      detectedHours,
      estimadoDesdeTickets: estimado,
      comensalesPorTicket: estimado ? porTicket : null,
      ventasSemanaNormal: ventasSinIva,
      semanasConVentas: ventasBrutas.semanasConVentas,
      ventasSemanaNormalConIva: importeConIva ? ventasBrutas.ventasSemanaNormal : null,
      ivaDescontado,
      cadaFilaEsUnTicket: cadaFilaEsTicket,
      lineasPorTicket: lineasJuntadas > 0 ? lineas.length / Math.max(1, tickets) : null,
      ...(periodo ? { periodo } : {}),
      ...(huecos.length > 0 ? { huecos } : {}),
    },
  }

  return {
    dataset,
    filasLeidas: filas.length,
    filasUsadas: usadas,
    descartes: descartes.lista(),
    periodos,
    periodoUsado: ventana && usados.length > 0 ? ventana.clave : '',
    advertencias,
    semanas: semanasConDatos,
    formatoFecha,
    paso,
    repartido,
    sinDetalleHorario,
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
 *
 * El listón se elige DÍA A DÍA, no para toda la semana (ronda 9). Antes bastaba
 * con que un solo día pasara de 3 en alguna franja para quedarse con el 3, y los
 * demás días salían cerrados sin decir nada: una cafetería de lunes a sábado de
 * 8 a 16 con unos 28 cobros al día abría solo el viernes de 9:30 a 11:30. Ahora
 * cada día baja el listón hasta que su horario recoja al menos el
 * `RECOGIDO_MIN` de sus cobros, y si ni con el más bajo lo consigue se avisa
 * (`horario-deja-fuera`) con el día y el porcentaje que queda fuera.
 */
const LISTONES = [3, 2, 1] as const

/** Parte de los cobros de un día que su horario tiene que recoger para darlo por bueno. */
const RECOGIDO_MIN = 0.9

/** Un día cuenta para el aviso si tiene al menos esta parte de los cobros del día más fuerte. */
const DIA_RELEVANTE = 0.1

const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

/** Cobros de un día que caen dentro de su horario, y los del día entero. */
function cobrosRecogidos(dia: number[], bloques: { startMin: number; endMin: number }[]): { dentro: number; total: number } {
  let dentro = 0
  let total = 0
  for (let s = 0; s < dia.length; s++) {
    const v = dia[s] ?? 0
    if (v <= 0) continue
    total += v
    const t = GRID_START_MIN + s * SLOT_MINUTES
    if (bloques.some((b) => t >= b.startMin && t < b.endMin)) dentro += v
  }
  return { dentro, total }
}

export interface DiaConCobrosFuera {
  /** 0 = lunes. */
  dia: number
  /** Parte de los cobros del día que el horario deja fuera, de 0 a 1. */
  fuera: number
  /** El horario deducido deja el día cerrado entero, aunque tiene cobros. */
  cerrado: boolean
}

function deducirHorario(
  weeks: WeekDemand[],
  lagMinutes: number,
): {
  detectedHours: DemandDataset['source']['detectedHours']
  poblado: boolean
  diasConCobrosFuera: DiaConCobrosFuera[]
} {
  if (weeks.length === 0) {
    return { detectedHours: Array.from({ length: 7 }, () => []), poblado: true, diasConCobrosFuera: [] }
  }

  const porFranja = (elegir: (valoresOrdenados: number[]) => number) =>
    Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: SLOTS_PER_DAY }, (_, s) =>
        elegir(weeks.map((w) => w.days[d][s]).sort((a, b) => a - b)),
      ),
    )

  // La mediana es la buena: un sábado de feria no puede estirar el horario de
  // todo el año. El máximo solo entra si la mediana no da nada.
  const cobrosMediana = porFranja((v) => v[Math.floor(v.length / 2)])
  const mediana = applyLag(cobrosMediana, lagMinutes)

  // Un horario por listón, y cada día se queda con el más alto que recoja casi
  // todos sus cobros. Si ninguno llega, el que más recoja (a igualdad, el más
  // alto: un horario más largo sin recoger más es ruido).
  const porListon = LISTONES.map((l) => inferHours(mediana, l))
  const elegido: number[] = Array.from({ length: 7 }, (_, d) => {
    let mejor = -1
    let mejorDentro = -1
    for (let i = 0; i < LISTONES.length; i++) {
      const bloques = porListon[i][d]
      if (bloques.length === 0) continue
      const { dentro, total } = cobrosRecogidos(mediana[d], bloques)
      if (total > 0 && dentro >= RECOGIDO_MIN * total) return i
      if (dentro > mejorDentro) {
        mejor = i
        mejorDentro = dentro
      }
    }
    return mejor
  })

  if (elegido.every((i) => i < 0)) {
    const maximo = applyLag(porFranja((v) => v[v.length - 1]), lagMinutes)
    return { detectedHours: inferHours(maximo, 1), poblado: false, diasConCobrosFuera: [] }
  }

  // La apertura, cuando se sientan los primeros, no cuando pagan (ronda 7, M1),
  // con el listón de cada día.
  const conApertura = LISTONES.map((l, i) =>
    elegido.includes(i) ? aperturaConEstancia(porListon[i], cobrosMediana, ESTANCIAS_DEFECTO, Math.min(l, 2)) : null,
  )
  const detectedHours = elegido.map((i, d) => (i < 0 ? [] : conApertura[i]![d]))

  // Qué días se dejan fuera una parte de sus cobros que importa. Se mide con
  // el horario antes de adelantar la apertura, que es contra el que se eligió.
  const totales = mediana.map((dia) => dia.reduce((a, b) => a + Math.max(0, b), 0))
  const masFuerte = Math.max(...totales)
  const diasConCobrosFuera: DiaConCobrosFuera[] = []
  for (let d = 0; d < 7; d++) {
    if (totales[d] <= 0 || totales[d] < DIA_RELEVANTE * masFuerte) continue
    const { dentro, total } = cobrosRecogidos(mediana[d], elegido[d] < 0 ? [] : porListon[elegido[d]][d])
    const fuera = 1 - dentro / total
    if (fuera > 1 - RECOGIDO_MIN) diasConCobrosFuera.push({ dia: d, fuera, cerrado: detectedHours[d].length === 0 })
  }

  const poblado = elegido.every((i) => i <= 0)
  return { detectedHours, poblado, diasConCobrosFuera }
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
