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
 * `hourlyCostEur` arranca en `null` a propósito: el coste lo pone el usuario
 * en el catálogo, nunca se inventa un precio (ver `shifty-dinero`).
 */
export const DEFAULT_ROLES: Role[] = [
  { id: 'encargado', name: 'Encargado', blockId: 'sala', color: '#4C1D95', hourlyCostEur: null, fullTimeOnly: true },
  { id: 'resp-turno', name: 'Responsable de turno', blockId: 'sala', color: '#7C3AED', hourlyCostEur: null, fullTimeOnly: true },
  { id: 'responsable', name: 'Responsable de sala', blockId: 'sala', color: '#6C0FD8', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'camarero', name: 'Camarero', blockId: 'sala', color: '#8244C7', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'ayudante', name: 'Ayudante', blockId: 'sala', color: '#0EA5E9', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'jefe-cocina', name: 'Jefe de cocina', blockId: 'cocina', color: '#B45309', hourlyCostEur: null, fullTimeOnly: true },
  { id: 'jefe-partida', name: 'Jefe de partida', blockId: 'cocina', color: '#D97706', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'cocinero', name: 'Cocinero', blockId: 'cocina', color: '#F59E0B', hourlyCostEur: null, fullTimeOnly: false },
  { id: 'office', name: 'Office', blockId: 'cocina', color: '#F97316', hourlyCostEur: null, fullTimeOnly: false },
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

export const DEFAULT_TIERS: Tier[] = [
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
  lagMinutes: 30,
  coveragePct: 80,
  safetyMarginPct: 0,
  sizingMode: 'calibrado',
  allowSplitShifts: true,
  consecutiveDaysOff: true,
  minRestBetweenShifts: true,
  minStaffByBlock: {},
  maxShiftMinutes: 9 * 60,
  minShiftMinutes: 3 * 60,
  contracts: DEFAULT_CONTRACTS as ContractType[],
}
