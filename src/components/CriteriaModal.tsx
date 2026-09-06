/**
 * "Revisar algún criterio": todos los parámetros con los que salió el número,
 * en una lista, con el valor de ahora y el sitio donde se cambia.
 *
 * Antes había tres atajos sueltos al pie del resultado ("cambiar los tramos",
 * "revisar la demanda") y el resto de criterios no se veían por ningún lado:
 * quien preguntaba "¿y esto con qué turno máximo está hecho?" tenía que
 * acordarse de que eso vivía en ajustes avanzados. Esto los pone todos juntos
 * sin tener que recordar dónde estaba cada uno.
 */

import { ArrowRight } from 'lucide-react'
import { Modal, cn } from './ui'
import type { StepId } from '@/lib/types'

export interface Criterion {
  label: string
  value: string
  /** A qué paso hay que ir para cambiarlo. */
  step: StepId
  /** Dónde está exactamente dentro de ese paso. */
  where: string
}

export function CriteriaModal({
  open,
  onClose,
  criteria,
  onGo,
}: {
  open: boolean
  onClose: () => void
  criteria: Criterion[]
  onGo: (step: StepId) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Con qué criterios está hecho"
      subtitle="Todo lo que ha entrado en el cálculo. Toca cualquiera para ir a cambiarlo."
    >
      <ul className="divide-y divide-border-soft">
        {criteria.map((c, i) => (
          // Por índice: dos bloques pueden llamarse igual y la etiqueta no es
          // única ("Mínimo en Terraza" dos veces).
          <li key={`${c.label}-${i}`}>
            <button
              type="button"
              onClick={() => {
                onGo(c.step)
                onClose()
              }}
              className={cn(
                'group flex w-full items-center gap-3 px-1 py-2.5 text-left',
                'transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.88rem] font-bold text-content-primary">
                  {c.label}
                </span>
                <span className="mt-0.5 block text-[0.78rem] text-content-secondary">
                  {c.where}
                </span>
              </span>
              <span className="shrink-0 text-[0.88rem] font-black tabular-nums text-brand">
                {c.value}
              </span>
              <ArrowRight
                size={15}
                className="shrink-0 text-content-muted transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
