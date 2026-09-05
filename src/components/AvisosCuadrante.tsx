/**
 * Los avisos del cuadrante, en una lista compacta.
 *
 * No es un paso más del flujo ni necesita acordeón: es lo mismo que un
 * encargado ve de un vistazo al mirar el cuadrante — o está todo en regla, o
 * hay dos o tres cosas que corregir, casi nunca más.
 *
 * Se enseña SIEMPRE lo que ha pasado la revisión, no solo lo que falla. Una
 * lista con dos avisos sueltos deja sin saber si lo demás se ha llegado a
 * mirar, y esa duda es la que hace que nadie se fíe del resultado.
 */

import { Check, TriangleAlert } from 'lucide-react'
import { Note } from '@/components/ui'
import type { Aviso, AvisoTipo } from '@/lib/avisos'

export function AvisosCuadrante({
  avisos,
  comprobaciones,
}: {
  avisos: Aviso[]
  comprobaciones: { tipo: AvisoTipo; nombre: string }[]
}) {
  const fallan = new Set(avisos.map((a) => a.tipo))
  const cumplen = comprobaciones.filter((c) => !fallan.has(c.tipo))

  if (avisos.length === 0) {
    // Sin comprobaciones que enumerar la frase se quedaría en "cumple: .".
    // Hoy siempre hay al menos dos, pero eso depende de `comprobacionesHechas`
    // y no de aquí, y una frase rota no avisa de nada al romperse.
    const lista = listar(comprobaciones.map((c) => c.nombre))
    return (
      <Note tone="success" icon={<Check size={16} strokeWidth={2.4} />}>
        {lista ? `El cuadrante cumple: ${lista}.` : 'El cuadrante no tiene nada que corregir.'}
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

      {cumplen.length > 0 && (
        <Note tone="success" icon={<Check size={16} strokeWidth={2.4} />}>
          Lo demás está en regla: {listar(cumplen.map((c) => c.nombre))}.
        </Note>
      )}
    </div>
  )
}

/** "a, b y c" — como lo diría una persona, no una lista con comas hasta el final. */
function listar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}
