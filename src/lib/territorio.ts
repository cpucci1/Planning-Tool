/**
 * Ponerle nombre a las semanas raras según dónde esté el local.
 *
 * SIMULACIÓN. El día que se conecte, esto es una llamada a un modelo barato
 * desde una función suelta, y la tabla de abajo desaparece. El reparto de
 * papeles es importante y es lo que hace la idea segura:
 *
 *   - El PICO lo detectamos nosotros, con el histórico del usuario. El modelo
 *     no inventa semanas ni decide que algo se dispara.
 *   - El NOMBRE lo pone el modelo. Lo peor que puede pasar es que se equivoque
 *     de fiesta, y eso el usuario lo ve y lo corrige, porque el nombre y el
 *     motivo de cada semana ya son editables.
 *
 * Al revés (preguntarle qué festivos tiene una provincia y creerle) sería
 * meter datos inventados en el cálculo sin que nadie los mire. No se hace.
 *
 * La tabla de aquí abajo NO pretende ser un calendario de festivos: son cuatro
 * fiestas grandes y conocidas por provincia, con su semana aproximada, para
 * poder probar la pantalla entera antes de conectar nada.
 */

export interface Territorio {
  id: string
  nombre: string
}

/** Las provincias con más hostelería, que es donde va a estar el usuario. */
export const TERRITORIOS: Territorio[] = [
  { id: 'madrid', nombre: 'Madrid' },
  { id: 'barcelona', nombre: 'Barcelona' },
  { id: 'valencia', nombre: 'Valencia' },
  { id: 'sevilla', nombre: 'Sevilla' },
  { id: 'malaga', nombre: 'Málaga' },
  { id: 'bilbao', nombre: 'Bizkaia' },
  { id: 'zaragoza', nombre: 'Zaragoza' },
  { id: 'baleares', nombre: 'Baleares' },
  { id: 'canarias', nombre: 'Canarias' },
]

interface FiestaLocal {
  /** Semana ISO aproximada. Las fiestas de fecha fija apenas se mueven. */
  semana: number
  nombre: string
}

/**
 * Cuatro fiestas grandes por sitio. Aproximadas a propósito: sirven para
 * enseñar cómo se verá la pantalla, no como calendario oficial.
 */
const FIESTAS: Record<string, FiestaLocal[]> = {
  madrid: [
    { semana: 20, nombre: 'San Isidro' },
    { semana: 45, nombre: 'La Almudena' },
    { semana: 32, nombre: 'Verbenas de agosto' },
    { semana: 18, nombre: 'Dos de Mayo' },
  ],
  barcelona: [
    { semana: 38, nombre: 'La Mercè' },
    { semana: 16, nombre: 'Sant Jordi' },
    { semana: 25, nombre: 'Sant Joan' },
    { semana: 37, nombre: 'Diada' },
  ],
  valencia: [
    { semana: 11, nombre: 'Fallas' },
    { semana: 41, nombre: 'Nou d’Octubre' },
    { semana: 28, nombre: 'Feria de julio' },
    { semana: 34, nombre: 'La Tomatina' },
  ],
  sevilla: [
    { semana: 16, nombre: 'Feria de Abril' },
    { semana: 15, nombre: 'Semana Santa' },
    { semana: 24, nombre: 'Corpus' },
    { semana: 32, nombre: 'Velá de Triana' },
  ],
  malaga: [
    { semana: 33, nombre: 'Feria de Málaga' },
    { semana: 15, nombre: 'Semana Santa' },
    { semana: 25, nombre: 'Noche de San Juan' },
    { semana: 36, nombre: 'Fin de temporada de playa' },
  ],
  bilbao: [
    { semana: 34, nombre: 'Aste Nagusia' },
    { semana: 31, nombre: 'Fiestas de julio' },
    { semana: 15, nombre: 'Semana Santa' },
    { semana: 50, nombre: 'Santo Tomás' },
  ],
  zaragoza: [
    { semana: 41, nombre: 'Fiestas del Pilar' },
    { semana: 15, nombre: 'Semana Santa' },
    { semana: 5, nombre: 'San Valero' },
    { semana: 32, nombre: 'Agosto flojo' },
  ],
  baleares: [
    { semana: 30, nombre: 'Plena temporada turística' },
    { semana: 33, nombre: 'Pico de agosto' },
    { semana: 25, nombre: 'Sant Joan' },
    { semana: 44, nombre: 'Cierre de temporada' },
  ],
  canarias: [
    { semana: 8, nombre: 'Carnaval' },
    { semana: 22, nombre: 'Día de Canarias' },
    { semana: 32, nombre: 'Pico de agosto' },
    { semana: 51, nombre: 'Temporada alta de invierno' },
  ],
}

export interface Sugerencia {
  nombre: string
  /** Por qué se propone, para poder enseñarlo y que no parezca magia opaca. */
  motivo: string
}

/**
 * Propone un nombre para una semana que YA hemos detectado como rara.
 *
 * Se acepta una semana de margen porque las fiestas caen en fin de semana y
 * se comen parte de la semana ISO siguiente o anterior.
 */
export function sugerirNombreSemana(
  territorioId: string | null,
  isoWeek: number,
  deviation: number,
): Sugerencia | null {
  if (!territorioId) return null
  const fiestas = FIESTAS[territorioId]
  if (!fiestas) return null

  const fiesta = fiestas.find((f) => Math.abs(f.semana - isoWeek) <= 1)
  if (!fiesta) return null

  const signo = deviation > 0 ? 'se dispara' : 'se hunde'
  const pct = Math.round(Math.abs(deviation) * 100)
  return {
    nombre: fiesta.nombre,
    motivo: `La semana ${isoWeek} ${signo} un ${pct}% y coincide con ${fiesta.nombre}.`,
  }
}
