/**
 * El nombre de una semana rara, preguntado a un modelo.
 *
 * EL REPARTO DE PAPELES ES LO QUE HACE ESTO SEGURO, y es el mismo que ya explica
 * `territorio.ts`: **el pico lo detectamos nosotros**, con el histórico del
 * usuario. El modelo solo pone la etiqueta. Al revés — preguntarle qué festivos
 * tiene una provincia y creerle — sería meter datos inventados en el cálculo sin
 * que nadie los mire.
 *
 * Si no hay backend, si el modelo no lo sabe o si falla, se cae a la tabla de
 * fiestas de `territorio.ts`, que sigue ahí precisamente para esto.
 *
 * `src/lib/` no importa React. Esto es lógica pura.
 */

import { sugerirNombreSemana, type Sugerencia } from './territorio'
import { supabase } from './supabase'

/**
 * Cinco segundos. Esto pasa mientras el usuario está mirando la lista de
 * semanas raras, y una etiqueta que aparece sola cuando ya ha pasado de
 * pantalla no le sirve a nadie.
 */
const TIMEOUT_MS = 5000

interface RespuestaSemana {
  ok?: boolean
  sugerencia?: { nombre?: unknown; motivo?: unknown } | null
}

/**
 * Pregunta el nombre de UNA semana. Nunca lanza.
 *
 * Devuelve `null` tanto si no hay nada que proponer como si algo falla: para la
 * pantalla las dos cosas son lo mismo, no enseñar sugerencia. Inventarse una
 * fiesta es el único error grave posible aquí, porque el usuario se lo creería:
 * viene con cara de dato.
 */
export async function sugerirNombreSemanaConIA(
  territorioNombre: string | null,
  territorioId: string | null,
  isoWeek: number,
  deviation: number,
  sinNombre: boolean,
): Promise<Sugerencia | null> {
  // La misma puerta que la tabla, y ANTES de la red: solo se nombran las semanas
  // que suben. Una fiesta llena el local, no lo vacía. Además la función
  // contesta 400 con una desviación de cero o negativa, así que sin esta guarda
  // el front se comería un error por cada valle.
  if (!sinNombre || deviation <= 0) return null

  const respaldo = sugerirNombreSemana(territorioId, isoWeek, deviation, sinNombre)
  if (!supabase || !territorioNombre) return respaldo

  const pct = Math.round(deviation * 100)
  // La función acota la desviación a 1000% y exige que sea positiva. Una
  // desviación absurda es un histórico raro, no una fiesta.
  if (pct <= 0 || pct > 1000) return respaldo

  const corte = new AbortController()
  const alarma = setTimeout(() => corte.abort(), TIMEOUT_MS)
  try {
    const { data, error } = await supabase.functions.invoke<RespuestaSemana>('planning-ai', {
      body: {
        accion: 'nombrar_semana',
        territorio: territorioNombre,
        semana: isoWeek,
        desviacion_pct: pct,
      },
      signal: corte.signal,
    })
    if (error || !data?.ok) return respaldo

    const s = data.sugerencia
    const nombre = typeof s?.nombre === 'string' ? s.nombre.trim() : ''
    const motivo = typeof s?.motivo === 'string' ? s.motivo.trim() : ''
    // "No lo sé" es una respuesta correcta y esperada del modelo, y NO se tapa
    // con la tabla: si el modelo, que conoce el calendario de verdad, dice que
    // no hay fiesta esa semana, proponer la de la tabla aproximada sería colocar
    // una fiesta en una semana que no es.
    if (!nombre) return null
    return { nombre, motivo: motivo || `La semana ${isoWeek} se dispara un ${pct}% y coincide con ${nombre}.` }
  } catch {
    return respaldo
  } finally {
    clearTimeout(alarma)
  }
}
