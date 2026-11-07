/**
 * Qué es cada columna del fichero: el tipo, el umbral y la condición de "se
 * puede seguir".
 *
 * POR QUÉ ESTÁ AQUÍ Y NO DENTRO DEL COMPONENTE
 * Vivía en `components/MapeoColumnas.tsx`, que es donde se pinta. Pero de esto
 * dependen ahora tres sitios que no tienen nada que ver con la pantalla: el
 * lector del fichero (`parseFichero.ts`), la segunda opinión del modelo
 * (`mapeoIA.ts`) y el bloqueo del "Siguiente" en `StepDemand`. Con el umbral
 * dentro del componente, la lógica que decide si una columna es dudosa
 * importaba React, y `src/lib/` no puede importar React.
 *
 * El componente lo vuelve a exportar, así que nadie que ya importara de ahí se
 * entera de nada.
 */

export type DestinoColumna = 'fecha' | 'hora' | 'comensales' | 'tickets' | 'importe' | 'ignorada'

export interface ColumnaDetectada {
  /** Cómo se llama en el fichero del usuario. */
  nombre: string
  /** Qué creemos que es. */
  destino: DestinoColumna
  /** 0 a 1. Por debajo de `CONFIANZA_MINIMA` hay que llamar la atención sobre ella. */
  confianza: number
  /** Dos o tres valores de ejemplo de esa columna, tal cual vienen. */
  ejemplos: string[]
}

/**
 * Por debajo de esto, la fila se marca y se explica por qué mirarla.
 *
 * Es UN solo número y se usa en los dos sitios que importan: lo que la pantalla
 * pinta en amarillo, y lo que el modelo tiene permiso para corregir. Con dos
 * umbrales distintos se acaba con la pantalla diciendo una cosa y el cálculo
 * haciendo otra.
 */
export const CONFIANZA_MINIMA = 0.85

/**
 * ¿Se puede seguir con este mapeo? Vive fuera del componente porque quien
 * bloquea el paso es el "Siguiente" del pie, no un botón de la tarjeta: la
 * pantalla tenía dos botones grandes compitiendo y se quitó el de dentro. Sin
 * esta condición, el aviso de "marca qué columna es la fecha" quedaba en un
 * cartel que no impedía nada.
 *
 * Desde la ronda 8 basta con la fecha. Sin columna de comensales ni de tickets
 * el lector cuenta cada fila como un ticket, que es lo que es en el export más
 * simple de un TPV (fecha, hora e importe). Pedir además una columna de
 * cantidad dejaba sin salida a quien marcaba la de tickets como "No la uses",
 * que era justo lo que la herramienta le aconsejaba hacer.
 */
export function mapeoSuficiente(columnas: ColumnaDetectada[]): boolean {
  return columnas.some((c) => c.destino === 'fecha')
}

/**
 * ¿Trae el mapeo algo que CUENTE (comensales o tickets)? Ya no bloquea nada:
 * lo usa la segunda opinión del modelo para no aceptar un mapeo que pierda la
 * columna de cantidad que la lectura sí había encontrado.
 */
export function mapeoConCantidad(columnas: ColumnaDetectada[]): boolean {
  return (
    mapeoSuficiente(columnas) &&
    columnas.some((c) => c.destino === 'comensales' || c.destino === 'tickets')
  )
}
