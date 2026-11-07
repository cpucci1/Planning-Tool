/**
 * Las cifras del restaurante de ejemplo que enseña la portada ("Qué vas a
 * obtener"), antes de que nadie suba nada.
 *
 * Tienen que ser las que salen al abrir el ejemplo, no unas dibujadas a mano:
 * una cifra inventada en la portada es una promesa que el producto incumple en
 * la pantalla siguiente. Por eso viven aquí, en un fichero que también lee
 * `npm run verificar`: si el cálculo las mueve, el script FALLA y dice qué
 * poner. Así no se quedan viejas en silencio (ronda 3, 2026-11-04).
 *
 * Ronda 5 (2026-11-04): `npm run verificar` usa ya el mismo contexto que la
 * app, y el relevo del mando lo hace el equipo; de ahí las cifras de ahora.
 *
 * Ronda 8 (2026-11-04): los mandos libran juntos sus días flojos y nadie de
 * equipo viene un solo día; el ejemplo sigue en 19 personas, con una más a
 * jornada completa y 50 € menos a la semana.
 */

/** Personas por jornada del ejemplo. Las etiquetas van tal cual a la portada. */
export const PORTADA_CONTRATOS: { label: string; desde: number; hasta: number; count: number }[] = [
  { label: '40 h', desde: 40, hasta: 40, count: 8 },
  { label: '25-39 h', desde: 25, hasta: 39, count: 5 },
  { label: '20-24 h', desde: 20, hasta: 24, count: 2 },
  { label: '< 20 h', desde: 0, hasta: 19, count: 4 },
]

/** Semanas punta del ejemplo, de las 52. */
export const PORTADA_SEMANAS_PUNTA = 11

/**
 * Coste de empresa del ejemplo, con los costes de muestra (`DEMO_COSTES_HORA`)
 * y la Seguridad Social. Al euro, igual que dentro de la herramienta (ronda 9).
 */
export const PORTADA_COSTE_SEMANA_EUR = 9154
export const PORTADA_COSTE_ANO_EUR = 476008

/** Los cuatro puestos que más cuestan en el ejemplo, en % del que más. */
export const PORTADA_COSTE_PUESTOS: { roleId: string; pct: number }[] = [
  { roleId: 'camarero', pct: 100 },
  { roleId: 'cocinero', pct: 53 },
  { roleId: 'office', pct: 27 },
  { roleId: 'jefe-cocina', pct: 23 },
]
