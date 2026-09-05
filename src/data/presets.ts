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

export const DEFAULT_ROLES: Role[] = [
  { id: 'responsable', name: 'Responsable de sala', blockId: 'sala', color: '#6C0FD8' },
  { id: 'camarero', name: 'Camarero', blockId: 'sala', color: '#8244C7' },
  { id: 'ayudante', name: 'Ayudante', blockId: 'sala', color: '#0EA5E9' },
  { id: 'cocinero', name: 'Cocinero', blockId: 'cocina', color: '#F59E0B' },
  { id: 'office', name: 'Office', blockId: 'cocina', color: '#F97316' },
]

/**
 * Tramos de partida.
 *
 * Salen del planificador real de un restaurante de menú y carta: un responsable
 * siempre, camareros que escalan con el volumen, y cocina que crece por
 * partidas. El usuario los va a cambiar — el objetivo es que arranque desde algo
 * que reconoce, no desde una tabla vacía.
 */
export const DEFAULT_TIERS: Tier[] = [
  {
    id: 't1',
    from: 1,
    to: 10,
    staff: { responsable: 1, camarero: 1, ayudante: 0, cocinero: 1, office: 0 },
  },
  {
    id: 't2',
    from: 11,
    to: 25,
    staff: { responsable: 1, camarero: 2, ayudante: 0, cocinero: 1, office: 1 },
  },
  {
    id: 't3',
    from: 26,
    to: 40,
    staff: { responsable: 1, camarero: 2, ayudante: 1, cocinero: 2, office: 1 },
  },
  {
    id: 't4',
    from: 41,
    to: 60,
    staff: { responsable: 1, camarero: 3, ayudante: 1, cocinero: 2, office: 1 },
  },
  {
    id: 't5',
    from: 61,
    to: 90,
    staff: { responsable: 1, camarero: 4, ayudante: 2, cocinero: 3, office: 1 },
  },
  {
    id: 't6',
    from: 91,
    to: 120,
    staff: { responsable: 1, camarero: 5, ayudante: 2, cocinero: 4, office: 1 },
  },
  {
    id: 't7',
    from: 121,
    to: Number.POSITIVE_INFINITY,
    staff: { responsable: 1, camarero: 7, ayudante: 3, cocinero: 4, office: 2 },
  },
]

export const DEFAULT_SETTINGS: Settings = {
  lagMinutes: 30,
  coveragePct: 80,
  sizingMode: 'calibrado',
  allowSplitShifts: true,
  consecutiveDaysOff: true,
  minRestBetweenShifts: true,
  hourlyCostEur: null,
  minStaffByBlock: {},
  maxShiftMinutes: 9 * 60,
  minShiftMinutes: 3 * 60,
  contracts: DEFAULT_CONTRACTS as ContractType[],
}
