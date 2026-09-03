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
export const SNAPSHOT_VERSION = 1
const STORE_KEY = 'shifty-planning:autosave'

export interface PlannerSnapshot {
  source: typeof SNAPSHOT_SOURCE
  version: typeof SNAPSHOT_VERSION
  savedAt: string
  step: StepId
  dataset: DemandDataset
  hours: OpeningHours | null
  specials: SpecialWeek[]
  blocks: Block[]
  roles: Role[]
  tiers: Tier[]
  settings: Settings
  /** `overrides` es un Map en memoria; en JSON viaja como pares [clave, valor]. */
  overrides: [string, number][]
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
    !!s.settings
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
    if (isSnapshot(v)) return v
  } catch {
    idbBroken = true
  }
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const v: unknown = JSON.parse(raw)
      if (isSnapshot(v)) return v
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
      resolve(parsed)
    }
    reader.readAsText(file)
  })
}
