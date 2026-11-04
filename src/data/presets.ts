/**
 * Valores de partida.
 *
 * Nada arranca en blanco: el usuario abre la herramienta y ya hay bloques,
 * puestos y tramos razonables. Todo es editable, pero puede ver el resultado
 * completo sin tocar nada. Es lo que separa "otra hoja de cálculo" de "ah, vale,
 * esto ya me dice algo".
 */

import type { Block, ContractType, Role, Settings, Tier } from '@/lib/types'
import { DEFAULT_CONTRACTS } from '@/lib/contracts'
import { ESTANCIAS_DEFECTO } from '@/lib/demand'

/** Paleta categórica que convive con el morado de Shifty sin pelearse. */
export const PALETTE = [
  '#6C0FD8',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#8244C7',
  '#0EA5E9',
  '#84CC16',
]

/** El único bloque con id fijo que el cálculo mira por su cuenta: el toggle
 *  de "horario propio de cocina" se engancha a este id, no al nombre — así
 *  sobrevive a que el usuario lo renombre. */
export const KITCHEN_BLOCK_ID = 'cocina'

export const DEFAULT_BLOCKS: Block[] = [
  { id: 'sala', name: 'Sala', color: '#6C0FD8' },
  { id: KITCHEN_BLOCK_ID, name: 'Cocina', color: '#F59E0B' },
]

/** Bloques que el usuario puede añadir de un clic, sin escribir el nombre. */
export const SUGGESTED_BLOCKS: { name: string; color: string }[] = [
  { name: 'Barra', color: '#3B82F6' },
  { name: 'Terraza', color: '#10B981' },
  { name: 'Reparto', color: '#EC4899' },
  { name: 'Limpieza', color: '#14B8A6' },
  { name: 'Recepción', color: '#F97316' },
]

/**
 * El catálogo de puestos de partida.
 *
 * Están las nueve categorías estándar de hostelería para que el usuario
 * reconozca las suyas y no tenga que escribirlas, pero **las de mando arrancan
 * a cero en todos los tramos**: un bar de menú no tiene encargado ni jefe de
 * partida, y meterlos con gente por defecto inflaría la plantilla de alguien
 * que ni los tiene. Se rellenan si el local los tiene.
 *
 * Encargado, responsable de turno y jefe de cocina son **mandos**
 * (`kind: 'estructura'`, revisión del 2026-11-04): no salen de los tramos, el
 * usuario dice cuántos tiene y su jornada, y el cuadrante les da turnos enteros
 * con uno siempre al frente de su zona. Arrancan con 0 personas por lo mismo
 * de arriba.
 *
 * `hourlyCostEur` arranca en `null` a propósito: el coste lo pone el usuario
 * en el catálogo, nunca se inventa un precio (ver `shifty-dinero`).
 */
export const DEFAULT_ROLES: Role[] = [
  { id: 'encargado', name: 'Encargado', blockId: 'sala', color: '#4C1D95', hourlyCostEur: null, fullTimeOnly: true, kind: 'estructura', headcount: 0 },
  { id: 'resp-turno', name: 'Responsable de turno', blockId: 'sala', color: '#7C3AED', hourlyCostEur: null, fullTimeOnly: true, kind: 'estructura', headcount: 0 },
  { id: 'responsable', name: 'Responsable de sala', blockId: 'sala', color: '#6C0FD8', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'camarero', name: 'Camarero', blockId: 'sala', color: '#8244C7', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'ayudante', name: 'Ayudante', blockId: 'sala', color: '#0EA5E9', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'jefe-cocina', name: 'Jefe de cocina', blockId: 'cocina', color: '#B45309', hourlyCostEur: null, fullTimeOnly: true, kind: 'estructura', headcount: 0 },
  { id: 'jefe-partida', name: 'Jefe de partida', blockId: 'cocina', color: '#D97706', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'cocinero', name: 'Cocinero', blockId: 'cocina', color: '#F59E0B', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'office', name: 'Office', blockId: 'cocina', color: '#F97316', hourlyCostEur: null, fullTimeOnly: false, cierraServicio: true },
]

/**
 * Tramos de partida.
 *
 * Salen del planificador real de un restaurante de menú y carta: un responsable
 * siempre, camareros que escalan con el volumen, y cocina que crece por
 * partidas. El usuario los va a cambiar — el objetivo es que arranque desde algo
 * que reconoce, no desde una tabla vacía.
 */
/** Los puestos de mando arrancan a cero: ver el comentario de `DEFAULT_ROLES`. */
const NO_MANDO = { encargado: 0, 'resp-turno': 0, 'jefe-cocina': 0, 'jefe-partida': 0 }

/**
 * Tramos de partida, en PERSONAS SENTADAS A LA VEZ (recalibrados el 2026-11-04,
 * ronda 3).
 *
 * Los de antes eran los equipos de la escala de cobros con los límites
 * multiplicados por 2,5, y con 301 sentados o más daban 7 camareros: unos 50
 * comensales por camarero, el doble de lo que lleva nadie. Ahora cada tramo
 * sale de dos reglas del sector, que son orientativas (no hay norma ni
 * convenio que las fije) y por eso son editables:
 *
 * - Sala: un camarero por cada 20 a 25 comensales sentados. Es la cifra que más
 *   se repite (ComboHR, "Cuántos camareros se necesitan en un restaurante";
 *   Qamarero, "Número de comensales en un restaurante"); a la carta fina se
 *   baja a 15. Un ayudante por cada tres camareros.
 * - Cocina: un cocinero por cada 30 a 40 comensales a la vez (ComboHR, misma
 *   guía: "150 comensales, de 6 a 8 cocineros sin contar al chef"). Office, uno
 *   por cada 100 o 120.
 * - Un responsable de sala siempre, y dos a partir de 200 sentados.
 *
 * El último tramo es abierto, pero está pensado para unos 375 sentados. Por
 * encima, la pantalla de equipo avisa (ver `tramoSuperado` en `lib/staffing.ts`).
 */
export const DEFAULT_TIERS: Tier[] = [
  {
    id: 't1',
    from: 1,
    to: 20,
    staff: { ...NO_MANDO, responsable: 1, camarero: 1, ayudante: 0, cocinero: 1, office: 0 },
  },
  {
    id: 't2',
    from: 21,
    to: 40,
    staff: { ...NO_MANDO, responsable: 1, camarero: 2, ayudante: 0, cocinero: 1, office: 1 },
  },
  {
    id: 't3',
    from: 41,
    to: 60,
    staff: { ...NO_MANDO, responsable: 1, camarero: 3, ayudante: 0, cocinero: 2, office: 1 },
  },
  {
    id: 't4',
    from: 61,
    to: 90,
    staff: { ...NO_MANDO, responsable: 1, camarero: 4, ayudante: 1, cocinero: 3, office: 1 },
  },
  {
    id: 't5',
    from: 91,
    to: 120,
    staff: { ...NO_MANDO, responsable: 1, camarero: 5, ayudante: 1, cocinero: 3, office: 1 },
  },
  {
    id: 't6',
    from: 121,
    to: 160,
    staff: { ...NO_MANDO, responsable: 1, camarero: 7, ayudante: 2, cocinero: 4, office: 2 },
  },
  {
    id: 't7',
    from: 161,
    to: 200,
    staff: { ...NO_MANDO, responsable: 1, camarero: 8, ayudante: 2, cocinero: 5, office: 2 },
  },
  {
    id: 't8',
    from: 201,
    to: 260,
    staff: { ...NO_MANDO, responsable: 2, camarero: 11, ayudante: 3, cocinero: 7, office: 2 },
  },
  {
    id: 't9',
    from: 261,
    to: 320,
    staff: { ...NO_MANDO, responsable: 2, camarero: 13, ayudante: 4, cocinero: 8, office: 3 },
  },
  {
    id: 't10',
    from: 321,
    to: Number.POSITIVE_INFINITY,
    staff: { ...NO_MANDO, responsable: 2, camarero: 15, ayudante: 5, cocinero: 10, office: 3 },
  },
]

/**
 * ⚠️ Los tramos de antes del 2026-11-04, en COBROS POR MEDIA HORA. Ya no se
 * cargan en ningún plan nuevo: solo los usa "volver a los de partida" en un
 * plan guardado con esa escala (sin `mealMinutes`), para no meterle tramos de
 * sentados a una curva de cobros.
 */
export const DEFAULT_TIERS_COBROS: Tier[] = [
  {
    id: 't1',
    from: 1,
    to: 10,
    staff: { ...NO_MANDO, responsable: 1, camarero: 1, ayudante: 0, cocinero: 1, office: 0 },
  },
  {
    id: 't2',
    from: 11,
    to: 25,
    staff: { ...NO_MANDO, responsable: 1, camarero: 2, ayudante: 0, cocinero: 1, office: 1 },
  },
  {
    id: 't3',
    from: 26,
    to: 40,
    staff: { ...NO_MANDO, responsable: 1, camarero: 2, ayudante: 1, cocinero: 2, office: 1 },
  },
  {
    id: 't4',
    from: 41,
    to: 60,
    staff: { ...NO_MANDO, responsable: 1, camarero: 3, ayudante: 1, cocinero: 2, office: 1 },
  },
  {
    id: 't5',
    from: 61,
    to: 90,
    staff: { ...NO_MANDO, responsable: 1, camarero: 4, ayudante: 2, cocinero: 3, office: 1 },
  },
  {
    id: 't6',
    from: 91,
    to: 120,
    staff: { ...NO_MANDO, responsable: 1, camarero: 5, ayudante: 2, cocinero: 4, office: 1 },
  },
  {
    id: 't7',
    from: 121,
    to: Number.POSITIVE_INFINITY,
    staff: { ...NO_MANDO, responsable: 1, camarero: 7, ayudante: 3, cocinero: 4, office: 2 },
  },
]

export const DEFAULT_SETTINGS: Settings = {
  // 0: con `mealMinutes` el desfase ya no se aplica (ver `Settings.lagMinutes`).
  lagMinutes: 0,
  // Desayuno 25 y copas 60 desde la ronda 5 (G2): antes un café contaba como
  // una comida de 75 minutos y una cafetería salía con un 46 % más de horas.
  mealMinutes: { ...ESTANCIAS_DEFECTO },
  coveragePct: 80,
  safetyMarginPct: 0,
  sizingMode: 'calibrado',
  allowSplitShifts: true,
  consecutiveDaysOff: true,
  minRestBetweenShifts: true,
  weeklySalesEur: null,
  calcularCostes: false,
  prepBeforeMin: 0,
  prepAfterMin: 0,
  minStaffByBlock: {},
  // Cocina entra una hora antes (mise en place) y las dos zonas recogen media
  // hora después de cerrar. Sala entra media hora antes a montar (mesas,
  // mantelería, cartas): antes del 2026-11-04 (ronda 3) entraba a la hora de
  // abrir, y ningún camarero abre la puerta con la sala sin montar.
  prepByBlock: { cocina: { beforeMin: 60, afterMin: 30 }, sala: { beforeMin: 30, afterMin: 30 } },
  openingRoleByBlock: {},
  maxShiftMinutes: 9 * 60,
  // 4 h: por debajo nadie se desplaza a trabajar, y el cuadrante a mano
  // tampoco las pone (revisión del 2026-11-04, punto 9).
  minShiftMinutes: 4 * 60,
  // 9 h al día: el tope del Estatuto salvo que el convenio diga otra cosa.
  maxDailyMinutes: 9 * 60,
  contratosAMedida: true,
  minContractHours: 10,
  contracts: DEFAULT_CONTRACTS as ContractType[],
  // Ronda 2 (2026-11-04). El catálogo pide el sueldo bruto, que es lo que se
  // sabe, y la Seguridad Social de la empresa se suma diciéndolo. Ausencias y
  // complementarias con sus valores legales; ver `lib/ausencias.ts`.
  costeBase: 'bruto',
  cotizacionEmpresaPct: 32,
  vacacionesDias: 30,
  festivosDias: 14,
  bajasPct: 6,
  complementariasPct: 30,
  // Vacío: la preparación por zona ya trae a la cocina una hora antes. Las
  // tareas fijas las añade quien las tenga (paso de Horario).
  trabajoFijo: [],
}

/**
 * Costes por hora de MUESTRA, solo para los datos de ejemplo.
 *
 * Con el catálogo en blanco, el ejemplo esconde media pantalla de resultado
 * (el coste, el ratio sobre ventas) y el usuario no llega a ver lo que la
 * herramienta hace. Aquí se puede rellenar porque todo el dataset es de
 * mentira y está etiquetado como tal; en el fichero de una persona **jamás**
 * se rellena un precio (ver `Role.hourlyCostEur`).
 *
 * Son cifras de andar por casa, por encima del SMI, de un menú y carta.
 * Desde el 2026-11-04 se leen como SUELDO BRUTO por hora (`costeBase:
 * 'bruto'`): la Seguridad Social de la empresa se suma encima.
 */
export const DEMO_COSTES_HORA: Record<string, number> = {
  encargado: 16,
  'resp-turno': 14,
  responsable: 13,
  camarero: 11.5,
  ayudante: 10,
  'jefe-cocina': 17,
  'jefe-partida': 13,
  cocinero: 12,
  office: 9.5,
}

/**
 * Mandos del restaurante de ejemplo (ronda 3, 2026-11-04): un encargado y un
 * jefe de cocina. Un local de este tamaño sin nadie al mando es lo primero que
 * un hostelero ve raro, y así el ejemplo enseña que el cuadrante deja siempre
 * a uno al frente. En el fichero de una persona arrancan a 0, como siempre.
 */
export const DEMO_MANDOS: Record<string, number> = { encargado: 1, 'jefe-cocina': 1 }

/**
 * Ticket medio por comensal del ejemplo: menú del día entre semana a mediodía
 * (13 a 16 €) y carta por la noche y el fin de semana (25 a 35 €), con bebida.
 * Mezclado, unos 20 € por persona, en lo bajo de la banda de 20 a 35 € de un
 * restaurante de ciudad.
 */
export const DEMO_TICKET_MEDIO_EUR = 20

/**
 * Ventas de una semana normal del restaurante de ejemplo: la semana media del
 * histórico de ejemplo (unos 1.942 comensales desde que la curva se bajó al
 * tamaño de un restaurante de unas 20 personas, ronda 4) por el ticket medio,
 * redondeado: unos 20 € por persona. Con eso la plantilla se lleva en torno
 * al 23 % de lo que factura, y con quien cubre vacaciones, festivos y bajas
 * algo más, dentro de la banda sana del sector (25 a 30 %, la de
 * `RATIO_SANO` en `StepResult.tsx`: una sola banda en todo el código). Antes eran
 * 109.500 €, que con la curva pequeña daban 56 € por persona; y antes de la
 * ronda 3, 26.000 €, que daban 4,25 € y ponían el ratio en rojo (G6).
 * `npm run verificar` comprueba que el ticket que sale siga entre 20 y 35 €.
 */
export const DEMO_VENTAS_SEMANA = 39000

/** El catálogo con lo que lleva el ejemplo: costes de muestra y sus dos mandos. */
export function rolesDeEjemplo(roles: Role[]): Role[] {
  return roles.map((r) => ({
    ...r,
    hourlyCostEur: DEMO_COSTES_HORA[r.id] ?? null,
    ...(DEMO_MANDOS[r.id] !== undefined ? { headcount: DEMO_MANDOS[r.id] } : {}),
  }))
}
