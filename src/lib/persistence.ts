/**
 * Guardado sin cuenta: autoguardado en IndexedDB y exportación/importación de
 * un fichero .json. La herramienta no tiene login ni backend, así que "guarda
 * tu planificación y vuelve a editarla" se resuelve hoy así — y el snapshot
 * está pensado para poder sincronizarse con una cuenta real el día de mañana
 * sin cambiar de forma.
 *
 * Dos mecanismos, no uno solo:
 * - Autoguardado silencioso: para que un refresco accidental no borre nada.
 *   IndexedDB en vez de localStorage porque en Safari en modo privado
 *   `localStorage.setItem` lanza `QuotaExceededError` en la primera escritura,
 *   e IndexedDB lo tolera mucho mejor.
 * - Fichero .json descargable: es el guardado "de verdad" — cruza de
 *   dispositivo, se puede mandar a un compañero, y sobrevive a que el
 *   navegador borre su almacenamiento.
 */

import { get, set, del } from 'idb-keyval'
import { ajustarFranjas } from './time'
import type {
  Block,
  DemandDataset,
  OpeningHours,
  Role,
  Settings,
  SpecialWeek,
  StepId,
  Tier,
} from './types'

export const SNAPSHOT_SOURCE = 'shifty-planning'
/**
 * Versión 2: la 1 es de antes del catálogo de puestos con coste, del horario
 * de cocina y de los ajustes de margen y preparación. Una foto de la 1 no
 * trae esos campos, y sin ellos el cálculo sale mal en silencio (una curva
 * con NaN cae al último tramo y pide plantilla máxima en todas las franjas).
 * Se rechaza en vez de intentar adivinarlos.
 */
export const SNAPSHOT_VERSION = 2
const STORE_KEY = 'shifty-planning:autosave'

export interface PlannerSnapshot {
  source: typeof SNAPSHOT_SOURCE
  version: typeof SNAPSHOT_VERSION
  savedAt: string
  step: StepId
  dataset: DemandDataset
  hours: OpeningHours | null
  /** Horario propio de cocina, si el usuario lo activó. */
  kitchenHours: OpeningHours | null
  specials: SpecialWeek[]
  blocks: Block[]
  roles: Role[]
  tiers: Tier[]
  settings: Settings
  /** `overrides` es un Map en memoria; en JSON viaja como pares [clave, valor]. */
  overrides: [string, number][]
  /** Los nombres reales que el usuario le ha puesto a la gente del cuadrante. */
  personNames: Record<string, string>
}

export interface SnapshotMeta {
  savedAt: string
  fileName: string
  weeks: number
  year: number
}

export function metaOf(snap: PlannerSnapshot): SnapshotMeta {
  return {
    savedAt: snap.savedAt,
    fileName: snap.dataset.source.fileName,
    weeks: snap.dataset.weeks.length,
    year: snap.dataset.year,
  }
}

/** Lo justo para no reventar con un fichero cualquiera o uno de otra versión. */
/**
 * Deja la curva de la foto con las franjas que espera el cálculo de HOY.
 *
 * Una foto guardada antes del 2026-09-07 trae días de 44 franjas, porque la
 * rejilla llegaba hasta las 04:00. El cálculo ahora recorre 48 y las cuatro
 * últimas saldrían `undefined`: la plantilla saldría mal sin dar ningún error.
 * Se rellenan con ceros, que es exacto, porque en aquella rejilla esas franjas
 * no existían y nadie pudo registrar nada en ellas.
 *
 * Muta la foto que se acaba de leer del disco a propósito: es un objeto recién
 * parseado que todavía no ha visto nadie.
 */
function ajustarCurva(snap: PlannerSnapshot): PlannerSnapshot {
  for (const semana of snap.dataset.weeks) {
    for (let d = 0; d < semana.days.length; d++) {
      semana.days[d] = ajustarFranjas(semana.days[d])
    }
  }
  return snap
}

function isSnapshot(v: unknown): v is PlannerSnapshot {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    s.source === SNAPSHOT_SOURCE &&
    s.version === SNAPSHOT_VERSION &&
    !!s.dataset &&
    Array.isArray((s.dataset as DemandDataset).weeks) &&
    Array.isArray(s.tiers) &&
    Array.isArray(s.roles) &&
    Array.isArray(s.blocks) &&
    !!s.settings &&
    // Los ajustes nuevos: si falta cualquiera, la foto es de una versión
    // anterior aunque diga lo contrario, y más vale rechazarla aquí que
    // calcular con un hueco.
    typeof (s.settings as Settings).safetyMarginPct === 'number' &&
    typeof (s.settings as Settings).prepBeforeMin === 'number' &&
    typeof (s.settings as Settings).prepAfterMin === 'number' &&
    !!(s.settings as Settings).minStaffByBlock
  )
}

// ─────────────────────────────────────────────────────────────
// Autoguardado
// ─────────────────────────────────────────────────────────────

/** Si IndexedDB falla una vez (cuota, modo privado en algún navegador raro,
 *  bloqueo por política), no se reintenta en cada tecla: se cae a
 *  localStorage el resto de la sesión. */
let idbBroken = false

export async function saveAutosave(snap: PlannerSnapshot): Promise<void> {
  if (!idbBroken) {
    try {
      await set(STORE_KEY, snap)
      return
    } catch {
      idbBroken = true
    }
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snap))
  } catch {
    // Sin sitio donde guardar: se sigue sin autoguardado. La descarga manual
    // del fichero .json sigue funcionando siempre.
  }
}

export async function loadAutosave(): Promise<PlannerSnapshot | null> {
  try {
    const v = await get(STORE_KEY)
    if (isSnapshot(v)) return ajustarCurva(v)
  } catch {
    idbBroken = true
  }
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const v: unknown = JSON.parse(raw)
      if (isSnapshot(v)) return ajustarCurva(v)
    }
  } catch {
    // Sin nada que recuperar.
  }
  return null
}

export async function clearAutosave(): Promise<void> {
  try {
    await del(STORE_KEY)
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Las filas del fichero
//
// POR QUE VAN APARTE Y NO DENTRO DE LA FOTO
// La foto se reescribe cada 600 ms mientras alguien toca la tabla de tramos.
// Meter ahi las filas del fichero (varios megas en un historico de un ano) seria
// reescribir esos megas en cada tecla. Las filas, en cambio, NO cambian nunca
// dentro de una lectura: se escriben una vez, al leer el fichero, y se leen una
// vez, al recuperar el plan.
//
// Y hacen falta: sin ellas, quien recupera un plan del dia anterior puede
// corregir una columna en la pantalla de lectura y el calculo NO se rehace, sin
// que la pantalla diga nada. Es el mismo engano que se quito el 2026-09-06, pero
// apareciendo solo en unas sesiones.
// ─────────────────────────────────────────────────────────────

const FILAS_KEY = 'shifty-planning:filas'

/** Lo que hace falta para poder rehacer el calculo sin volver a abrir el fichero. */
export interface FilasGuardadas {
  nombre: string
  /** Las filas de datos, sin la cabecera. */
  filas: unknown[][]
  /** El mapeo que se estaba usando, y lo que se estimo por ticket. */
  mapeo: unknown[]
  comensalesPorTicket: number
}

export async function guardarFilas(v: FilasGuardadas): Promise<void> {
  try {
    await set(FILAS_KEY, v)
  } catch {
    // Sin sitio (cuota, modo privado): el plan se recupera igual, lo unico que
    // se pierde es poder corregir una columna sin volver a subir el fichero.
    // No se cae a localStorage a proposito: son megas y ahi no caben.
  }
}

export async function leerFilas(): Promise<FilasGuardadas | null> {
  try {
    const v = await get(FILAS_KEY)
    if (
      v &&
      typeof v === 'object' &&
      Array.isArray((v as FilasGuardadas).filas) &&
      Array.isArray((v as FilasGuardadas).mapeo)
    ) {
      return v as FilasGuardadas
    }
  } catch {
    // ignore
  }
  return null
}

export async function borrarFilas(): Promise<void> {
  try {
    await del(FILAS_KEY)
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Fichero .json
// ─────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Nombre ordenable por fecha, como recomienda cualquier guía de nombrado. */
function fileName(): string {
  const now = new Date()
  return `shifty-planificacion-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

export function downloadSnapshot(snap: PlannerSnapshot): void {
  const json = JSON.stringify(snap, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName()
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function readSnapshotFile(file: File): Promise<PlannerSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se ha podido leer el fichero.'))
    reader.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(reader.result))
      } catch {
        reject(new Error('El fichero no es un JSON válido.'))
        return
      }
      if (!isSnapshot(parsed)) {
        const looksLikeOurs =
          !!parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).source === SNAPSHOT_SOURCE
        reject(
          new Error(
            looksLikeOurs
              ? 'Este fichero es de otra versión del planificador.'
              : 'Este fichero no es una planificación de Shifty.',
          ),
        )
        return
      }
      resolve(ajustarCurva(parsed))
    }
    reader.readAsText(file)
  })
}
