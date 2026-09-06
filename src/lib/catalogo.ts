/**
 * Zonas y puestos: crear, renombrar y borrar.
 *
 * Esto vivía dentro de `TiersTable`, que era el único sitio desde donde se
 * podían tocar. Al pedir Crescente que también se puedan añadir zonas desde el
 * catálogo de puestos ("además de sala y cocina, poder añadir otras, tipo
 * terraza"), la lógica pasaba a estar en dos sitios, y ahí es donde empiezan
 * los problemas: crear un puesto no es solo añadirlo a la lista, es añadirlo
 * también a TODOS los tramos con un cero. Una copia que se olvide de esa
 * segunda mitad deja tramos sin esa columna y el cálculo sale mal sin dar
 * ningún error.
 *
 * Por eso vive aquí, en `lib/`, y las dos pantallas llaman a lo mismo. Son
 * funciones puras: reciben el modelo y devuelven uno nuevo, sin tocar React.
 */

import { PALETTE } from '@/data/presets'
import type { Block, Role, StaffingModel, Tier } from './types'

/** Id corto y único. No hace falta más: viven solo en el navegador. */
function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

/** Primer color de la paleta sin usar, para que dos cosas no salgan iguales. */
export function nextColor(used: string[], fallback: string): string {
  return PALETTE.find((c) => !used.includes(c)) ?? fallback
}

/** Las tres listas que forman el modelo, para devolverlas juntas. */
export type ModelParts = Pick<StaffingModel, 'blocks' | 'roles' | 'tiers'>

/**
 * Crea una zona con un puesto homónimo dentro.
 *
 * Una zona sin puestos no es nada: no aparece como columna en la tabla de
 * tramos y no se le puede pedir gente. Por eso arranca con uno, que el usuario
 * renombra en un doble clic.
 */
export function crearZona(m: ModelParts, name: string, color: string): ModelParts {
  const blockId = newId('b')
  const roleId = newId('r')
  return {
    blocks: [...m.blocks, { id: blockId, name, color }],
    roles: [
      ...m.roles,
      { id: roleId, name, blockId, color, hourlyCostEur: null, fullTimeOnly: false },
    ],
    tiers: m.tiers.map((t) => ({ ...t, staff: { ...t.staff, [roleId]: 0 } })),
  }
}

export function renombrarZona(m: ModelParts, blockId: string, name: string): ModelParts {
  return { ...m, blocks: m.blocks.map((b) => (b.id === blockId ? { ...b, name } : b)) }
}

/**
 * Borra una zona y, con ella, sus puestos y las columnas que esos puestos
 * ocupaban en cada tramo. Dejar la columna huérfana en los tramos es lo que
 * hace que la plantilla siga pidiendo gente de un puesto que ya no existe.
 */
export function borrarZona(m: ModelParts, blockId: string): ModelParts {
  const condenados = m.roles.filter((r) => r.blockId === blockId).map((r) => r.id)
  return {
    blocks: m.blocks.filter((b) => b.id !== blockId),
    roles: m.roles.filter((r) => r.blockId !== blockId),
    tiers: m.tiers.map((t) => ({ ...t, ...sinPuestos(t, condenados) })),
  }
}

/** Crea un puesto dentro de una zona, ya presente en todos los tramos a cero. */
export function crearPuesto(m: ModelParts, block: Block, name = 'Nuevo puesto'): {
  parts: ModelParts
  roleId: string
} {
  const id = newId('r')
  const color = nextColor(
    m.roles.map((r) => r.color),
    block.color,
  )
  const role: Role = {
    id,
    name,
    blockId: block.id,
    color,
    hourlyCostEur: null,
    fullTimeOnly: false,
  }
  return {
    parts: {
      blocks: m.blocks,
      roles: [...m.roles, role],
      tiers: m.tiers.map((t) => ({ ...t, staff: { ...t.staff, [id]: 0 } })),
    },
    roleId: id,
  }
}

export function renombrarPuesto(m: ModelParts, roleId: string, name: string): ModelParts {
  return { ...m, roles: m.roles.map((r) => (r.id === roleId ? { ...r, name } : r)) }
}

export function borrarPuesto(m: ModelParts, roleId: string): ModelParts {
  return {
    blocks: m.blocks,
    roles: m.roles.filter((r) => r.id !== roleId),
    tiers: m.tiers.map((t) => ({ ...t, ...sinPuestos(t, [roleId]) })),
  }
}

/**
 * Quita esos puestos de un tramo, de las tres tablas a la vez: la cifra
 * objetivo, el mínimo y el máximo. Olvidar los dos últimos deja un techo
 * apuntando a un puesto que ya no existe, y `clampToTierMax` recorta contra
 * él sin que nadie lo vea.
 */
function sinPuestos(t: Tier, ids: string[]): Pick<Tier, 'staff' | 'staffMin' | 'staffMax'> {
  const staff = { ...t.staff }
  const staffMin = { ...(t.staffMin ?? {}) }
  const staffMax = { ...(t.staffMax ?? {}) }
  for (const id of ids) {
    delete staff[id]
    delete staffMin[id]
    delete staffMax[id]
  }
  return { staff, staffMin, staffMax }
}
