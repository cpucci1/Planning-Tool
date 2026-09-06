/**
 * Sub-pasos dentro de un paso: la fila de puntos de arriba y la barra de
 * avanzar de abajo.
 *
 * Estaba escrito dentro de `StepDemand`, que fue el primero en necesitarlo.
 * Al partir también la pantalla de resultado en sub-pasos hacía falta lo mismo
 * otra vez, y dos copias de una barra de progreso terminan siempre igual: una
 * se retoca, la otra no, y el usuario ve dos navegaciones distintas dentro de
 * la misma herramienta.
 *
 * Es el patrón que pide el principio 6 del proyecto: un paso con varias
 * preguntas distintas se parte en sub-pasos con su propio progreso en vez de
 * dejar un scroll interminable.
 */

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button, cn } from './ui'

export interface SubStep {
  id: string
  label: string
}

export function SubProgress({
  steps,
  index,
  onGo,
}: {
  steps: SubStep[]
  index: number
  onGo: (i: number) => void
}) {
  const pct = ((index + 1) / steps.length) * 100
  return (
    <div className="mb-6 flex items-center gap-3">
      <ol className="hidden flex-wrap items-center gap-1 sm:flex">
        {steps.map((s, i) => {
          const done = i < index
          const active = i === index
          return (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'rounded-pill px-2.5 py-1.5 text-[0.78rem] font-bold transition-colors',
                  active && 'bg-brand-light text-brand',
                  !active && 'text-content-secondary hover:bg-surface hover:text-content-primary',
                )}
              >
                <span
                  className={cn(
                    'mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-pill text-[0.65rem]',
                    active
                      ? 'bg-brand text-content-inverted'
                      : done
                        ? 'bg-success text-content-inverted'
                        : 'bg-surface',
                  )}
                >
                  {done ? '✓' : i + 1}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <span className="mx-1 h-px w-3 bg-border" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-1 items-center gap-3 sm:hidden">
        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface">
          <div
            className="h-full rounded-pill bg-brand transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[0.75rem] font-bold text-content-secondary">
          {index + 1}/{steps.length} · {steps[index].label}
        </span>
      </div>
    </div>
  )
}

export function SubNav({
  index,
  onBack,
  onNext,
  nextLabel,
  nextHint,
  nextDisabled,
}: {
  index: number
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextHint?: string
  /** Bloquea el avance. Se usa en la lectura del fichero: sin saber qué columna
   *  es la fecha no hay nada que calcular, y antes se podía seguir igualmente. */
  nextDisabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-2 pb-4">
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-center">
        {index > 0 ? (
          <Button variant="secondary" size="lg" icon={<ArrowLeft size={17} />} onClick={onBack}>
            Atrás
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={nextDisabled}
          iconRight={<ArrowRight size={18} />}
        >
          {nextLabel}
        </Button>
      </div>
      {nextHint && (
        <p className="max-w-md text-center text-[0.82rem] leading-relaxed text-content-secondary">
          {nextHint}
        </p>
      )}
    </div>
  )
}
