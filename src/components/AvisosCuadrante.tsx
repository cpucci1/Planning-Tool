/**
 * Los avisos del cuadrante, en una lista compacta.
 *
 * No es un paso más del flujo ni necesita acordeón: es lo mismo que un
 * encargado ve de un vistazo al mirar el cuadrante — o está todo en regla, o
 * hay dos o tres cosas que corregir, casi nunca más.
 */

import { Check, TriangleAlert } from 'lucide-react'
import { Note } from '@/components/ui'
import type { Aviso } from '@/lib/avisos'

export function AvisosCuadrante({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) {
    return (
      <Note tone="success" icon={<Check size={16} strokeWidth={2.4} />}>
        El cuadrante cumple: descansos, libranzas y contratos están en regla.
      </Note>
    )
  }

  return (
    <div className="space-y-2">
      {avisos.map((aviso, i) => (
        <Note
          key={`${aviso.tipo}-${aviso.personId ?? 'global'}-${i}`}
          tone={aviso.gravedad === 'legal' ? 'danger' : 'warning'}
          icon={<TriangleAlert size={16} strokeWidth={2.4} />}
        >
          {aviso.mensaje}
        </Note>
      ))}
    </div>
  )
}
