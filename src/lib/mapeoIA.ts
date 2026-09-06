/**
 * La segunda opinión sobre qué es cada columna del fichero.
 *
 * `parseFichero.ts` decide qué es cada columna con heurísticas: mira el nombre
 * de la cabecera y perfila hasta 400 filas de valores. Acierta casi siempre.
 * Este módulo le pone delante una segunda opinión — un modelo — y **solo la usa
 * donde la heurística dudaba**.
 *
 * POR QUÉ AQUÍ Y NO DENTRO DE `parseFichero.ts`
 * Ese fichero promete en su cabecera que no hace ni una llamada de red, y deja
 * escrito que el día que se le enseñen las cabeceras a un modelo lo hará otro
 * módulo con lo que él devuelva. Esto es ese módulo. Meterlo allí rompería una
 * promesa escrita y contaminaría la única pieza con 112 pruebas.
 *
 * POR QUÉ EL MODELO NO PISA A LA HEURÍSTICA, LA COMPLETA
 * No es prudencia: es que la heurística está mejor informada. Ella ve hasta 400
 * filas de valores; al modelo se le mandan tres celdas por columna, porque la
 * portada promete que el fichero no sale del navegador. En evidencia de valores
 * gana ella siempre.
 *
 * Donde SÍ gana el modelo, y por eso merece la pena:
 *   - Cabeceras opacas (`F3`, `CAMP_07`) y ficheros sin fila de títulos, donde
 *     la heurística se queda solo con los valores.
 *   - Distinguir **tickets de importe**, que es el caso normal del TPV español
 *     que no exporta comensales. En `parseFichero` los dos destinos tienen
 *     exactamente la misma fórmula sobre los valores, así que hoy los separa
 *     únicamente la expresión regular del nombre.
 *
 * SI ESTO FALLA, NO SE ENTERA NADIE
 * Sin backend, sin red, con el modelo caído, fuera de límite o tardando de más,
 * se devuelve el mapeo de la heurística y la pantalla sigue igual. Es un lead
 * magnet: que se caiga el modelo no puede significar que alguien no pueda
 * calcular su plantilla.
 *
 * `src/lib/` no importa React. Esto es lógica pura.
 */

import { CONFIANZA_MINIMA, mapeoSuficiente } from './mapeo'
import type { ColumnaDetectada, DestinoColumna } from './mapeo'
import { reetiquetarEjemplos, type FicheroLeido } from './parseFichero'
import { supabase } from './supabase'

/**
 * Lo que tarda como mucho en contestar antes de seguir sin él.
 *
 * Siete segundos y no treinta: esto pasa dentro de la pantalla de análisis, y
 * una espera que se nota es peor que no tener la segunda opinión. Medido contra
 * la función de verdad, una respuesta normal ronda el segundo y medio.
 */
const TIMEOUT_MS = 7000

/**
 * Confianza mínima del modelo para que se le haga caso.
 *
 * Es más baja que `CONFIANZA_MINIMA` (0,85, la línea a partir de la cual la
 * pantalla le dice al usuario que mire esa columna) a propósito: el modelo solo
 * entra donde la heurística ya estaba por debajo de esa línea, así que la
 * comparación no es contra "seguro", es contra "más seguro que lo que había".
 */
const CONFIANZA_MINIMA_MODELO = 0.7

const DESTINOS: DestinoColumna[] = ['fecha', 'hora', 'comensales', 'tickets', 'importe', 'ignorada']

interface RespuestaMapeo {
  ok?: boolean
  columnas?: { nombre?: unknown; destino?: unknown; confianza?: unknown }[]
}

/**
 * Las tres filas de muestra, tal y como las quiere la función.
 *
 * `fichero.muestras` viene POR COLUMNA (`muestras[i]` son los 3 ejemplos de la
 * columna `i`) y la función las quiere por FILA. Se traspone y se rellena para
 * que todas midan igual.
 *
 * Ojo con lo que esto es y lo que no: como los ejemplos se sacan saltándose las
 * celdas vacías, estas pseudo filas pueden juntar la fecha de la fila 1 con los
 * comensales de la fila 5. Para lo único que el modelo tiene que decidir — qué
 * TIPO de dato es cada columna — da exactamente igual, y a cambio sale del
 * navegador exactamente lo que `parseFichero` dejó escrito que podía salir:
 * cabeceras y muestras, nada más.
 */
function filasDeMuestra(muestras: string[][]): string[][] {
  const alto = Math.min(3, Math.max(0, ...muestras.map((m) => m.length)))
  const filas: string[][] = []
  for (let f = 0; f < alto; f++) {
    filas.push(muestras.map((m) => m[f] ?? ''))
  }
  return filas
}

/** Deja una sola columna por destino: la que más confianza tenga. */
function unDestinoUnaColumna(columnas: ColumnaDetectada[]): ColumnaDetectada[] {
  const mejor = new Map<DestinoColumna, number>()
  columnas.forEach((c, i) => {
    if (c.destino === 'ignorada') return
    const actual = mejor.get(c.destino)
    if (actual === undefined || columnas[actual].confianza < c.confianza) mejor.set(c.destino, i)
  })
  return columnas.map((c, i) =>
    c.destino === 'ignorada' || mejor.get(c.destino) === i
      ? c
      : // La que pierde baja a ignorada con la confianza de lo ignorado, no con
        // la suya: si se le dejara su 0,9 la pantalla diría que está segura de
        // algo que acabamos de descartar.
        { ...c, destino: 'ignorada' as DestinoColumna, confianza: 0.9 },
  )
}

/**
 * Funde lo que dice el modelo sobre lo que dice la heurística.
 *
 * El cruce es POR ÍNDICE y no por nombre: la función ya garantiza una entrada
 * por columna del usuario, en su orden, y ya resuelve por dentro el cruce por
 * nombre con su rescate por posición. Volver a cruzar por nombre aquí sería
 * duplicar esa lógica, y además frágil, porque el lector renombra las cabeceras
 * repetidas. A cambio hay que comprobar que vienen tantas como columnas hay, que
 * son dos líneas.
 */
export function fundirMapeos(
  heuristica: ColumnaDetectada[],
  delModelo: { destino: DestinoColumna; confianza: number }[],
): ColumnaDetectada[] {
  if (delModelo.length !== heuristica.length) return heuristica

  const fundido = heuristica.map((c, i) => {
    const m = delModelo[i]
    // Lo que el modelo se deja vuelve como ignorada con confianza 0. La
    // heurística, en cambio, le pone 0,9 fijo a lo ignorado justo para que no
    // salte el aviso amarillo. Dejar pasar ese 0 pintaría de amarillo las quince
    // columnas irrelevantes de un TPV normal, que es el ruido con cara de dato
    // que la pantalla de mapeo existe para evitar.
    if (m.destino === 'ignorada' && m.confianza === 0) return c
    // La heurística ya estaba segura: no se toca.
    if (c.confianza >= CONFIANZA_MINIMA) return c
    // El modelo tampoco lo tiene claro: se queda lo que había.
    if (m.confianza < CONFIANZA_MINIMA_MODELO) return c
    if (m.destino === c.destino) {
      // Coinciden. Se sube la confianza a la del modelo para que la pantalla
      // deje de pedirle al usuario que mire una columna que dos caminos
      // distintos han clasificado igual.
      return { ...c, confianza: Math.max(c.confianza, m.confianza) }
    }
    return { ...c, destino: m.destino, confianza: m.confianza }
  })

  const limpio = unDestinoUnaColumna(fundido)

  // Última red: si la fusión deja el mapeo peor de lo que estaba — sin columna
  // de fecha, o sin comensales ni tickets — se tira entera. Sin esto, un modelo
  // que se despiste con la fecha deja al usuario delante de un cartel que le
  // bloquea el paso, y encima con una columna que la heurística SÍ había
  // encontrado.
  if (mapeoSuficiente(heuristica) && !mapeoSuficiente(limpio)) return heuristica

  return limpio
}

/**
 * Pregunta al modelo qué es cada columna y devuelve el mapeo ya fundido.
 *
 * Nunca lanza y nunca tarda más de `TIMEOUT_MS`: ante cualquier problema
 * devuelve el mapeo de la heurística, que es el que traía el fichero.
 */
export async function mapearColumnasConIA(fichero: FicheroLeido): Promise<ColumnaDetectada[]> {
  const heuristica = fichero.columnas
  if (!supabase) return heuristica
  if (fichero.cabeceras.length === 0) return heuristica
  // Los mismos topes que impone la función. Pasarse devuelve un 400, así que no
  // se gasta ni el viaje: se sigue con la heurística, que para un fichero así
  // funciona igual de bien.
  if (fichero.cabeceras.length > 60) return heuristica
  if (fichero.cabeceras.some((c) => c.length > 120)) return heuristica

  const muestra = filasDeMuestra(fichero.muestras).map((fila) =>
    fila.map((celda) => celda.slice(0, 120)),
  )

  const corte = new AbortController()
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS)

  try {
    const { data, error } = await supabase.functions.invoke<RespuestaMapeo>('planning-ai', {
      body: { accion: 'mapear_columnas', columnas: fichero.cabeceras, muestra },
      // Sin esto, un modelo que se quede colgado deja la pantalla de análisis
      // esperando para siempre.
      signal: corte.signal,
    })
    if (error || !data?.ok || !Array.isArray(data.columnas)) return heuristica

    const delModelo = data.columnas.map((c) => {
      const destino = typeof c?.destino === 'string' && (DESTINOS as string[]).includes(c.destino)
        ? (c.destino as DestinoColumna)
        : ('ignorada' as DestinoColumna)
      const bruta = Number(c?.confianza)
      return {
        destino,
        confianza: Number.isFinite(bruta) ? Math.max(0, Math.min(1, bruta)) : 0,
      }
    })

    const fundido = fundirMapeos(heuristica, delModelo)
    // Los ejemplos se formatean SEGÚN el destino: en un Excel una fecha es el
    // número 45.822. Si el modelo cambia el destino de una columna y no se
    // regeneran, el usuario ve ese número donde debería ver una fecha — y los
    // ejemplos son literalmente lo único que le permite reconocer su columna.
    return reetiquetarEjemplos(fichero.filas, fundido)
  } catch {
    // Cortado por tiempo, sin red, o cualquier otra cosa. Se sigue igual.
    return heuristica
  } finally {
    clearTimeout(alarma)
  }
}
