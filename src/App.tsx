/**
 * Shell de la aplicación.
 *
 * Cabecera fija con el progreso y — desde el momento en que hay datos — el
 * resultado provisional siempre a la vista. Que el número de personas esté en
 * pantalla desde el segundo paso y se mueva cuando el usuario toca algo es lo
 * que convierte un formulario en una herramienta: se ve la consecuencia de cada
 * cambio sin tener que llegar al final.
 */

import { useEffect, useMemo } from 'react'
import { ArrowLeft, Users } from 'lucide-react'
import { PlannerContext, STEPS, usePlannerState, type StepId } from '@/hooks/usePlanner'
import { StepImport } from '@/steps/StepImport'
import { StepDemand } from '@/steps/StepDemand'
import { StepTeam } from '@/steps/StepTeam'
import { StepResult } from '@/steps/StepResult'
import { cn } from '@/components/ui'

function Progress({
  current,
  onGo,
  reachable,
}: {
  current: StepId
  onGo: (s: StepId) => void
  reachable: boolean
}) {
  const index = STEPS.findIndex((s) => s.id === current)

  // El progreso nunca arranca en cero: una barra que ya lleva algo recorrido
  // tira más que una vacía, y además es honesto — subir el fichero era un paso.
  const pct = ((index + 1) / STEPS.length) * 100

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <ol className="hidden min-w-0 items-center gap-1 md:flex">
        {STEPS.map((s, i) => {
          const done = i < index
          const active = i === index
          const clickable = reachable && i <= index
          return (
            <li key={s.id} className="flex min-w-0 items-center">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onGo(s.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'rounded-pill px-3 py-1.5 text-[0.82rem] font-bold transition-colors',
                  active && 'bg-brand-light text-brand',
                  done && 'text-content-secondary hover:bg-surface hover:text-content-primary',
                  !active && !done && 'text-content-muted',
                  !clickable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'mr-2 inline-flex h-5 w-5 items-center justify-center rounded-pill text-[0.7rem]',
                    active ? 'bg-brand text-content-inverted' : done ? 'bg-success text-content-inverted' : 'bg-surface',
                  )}
                >
                  {done ? '✓' : i + 1}
                </span>
                {s.short}
              </button>
              {i < STEPS.length - 1 && (
                <span className={cn('mx-1 h-px w-4', done ? 'bg-success' : 'bg-border')} />
              )}
            </li>
          )
        })}
      </ol>

      {/* En móvil no caben los cinco nombres: barra + "paso 2 de 4". */}
      <div className="flex min-w-0 flex-1 items-center gap-3 md:hidden">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface">
          <div
            className="h-full rounded-pill bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[0.75rem] font-bold text-content-secondary">
          {index + 1}/{STEPS.length}
        </span>
      </div>
    </div>
  )
}

function LiveResult({ people, hours }: { people: number; hours: number }) {
  return (
    <div className="animate-slide-down flex items-center gap-2.5 rounded-pill bg-brand-light py-1.5 pr-4 pl-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-brand text-content-inverted">
        <Users size={14} strokeWidth={2.5} />
      </span>
      <span className="leading-tight">
        <span key={people} className="animate-count block text-[0.95rem] font-black text-brand">
          {people} {people === 1 ? 'persona' : 'personas'}
        </span>
        <span className="block text-[0.68rem] font-semibold text-content-secondary">
          {Math.round(hours)} h/semana
        </span>
      </span>
    </div>
  )
}

function Inner() {
  const p = usePlannerState()
  const index = STEPS.findIndex((s) => s.id === p.step)

  // Cambiar de paso remonta `<main>` (ver el `key` de abajo) pero no mueve el
  // scroll: sin esto, si el usuario llegaba abajo del todo en "Equipo", el
  // paso "Plantilla" arrancaba a mitad de pantalla en vez de por el titular.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [p.step])

  const view = useMemo(() => {
    switch (p.step) {
      case 'import':
        return <StepImport />
      case 'demand':
        return <StepDemand />
      case 'team':
        return <StepTeam />
      case 'result':
        return <StepResult />
    }
  }, [p.step])

  return (
    <PlannerContext.Provider value={p}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-border-soft bg-surface-elevated/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
            <a href="https://shifty.es" className="flex shrink-0 items-center gap-2" aria-label="Shifty">
              <img src="/shifty-logo.svg" alt="" className="h-6 w-auto" />
              <span className="hidden text-[0.78rem] font-bold text-content-muted sm:inline">
                Planificador
              </span>
            </a>

            {p.dataset && (
              <>
                <span className="hidden h-6 w-px bg-border sm:block" />
                <Progress current={p.step} onGo={p.setStep} reachable />
                {p.plan && index > 0 && (
                  <div className="hidden shrink-0 lg:block">
                    <LiveResult people={p.plan.totalPeople} hours={p.needSummary?.totalHours ?? 0} />
                  </div>
                )}
              </>
            )}
          </div>
        </header>

        {p.dataset && index > 0 && (
          <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
            <button
              type="button"
              onClick={() => p.setStep(STEPS[index - 1].id)}
              className="inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-content-secondary transition-colors hover:text-brand"
            >
              <ArrowLeft size={15} />
              {STEPS[index - 1].label}
            </button>
          </div>
        )}

        <main key={p.step} className="animate-fade-in mx-auto max-w-[1400px] px-4 pt-4 pb-24 sm:px-6">
          {view}
        </main>

        {/* En móvil el resultado vivo va abajo, donde no tapa nada. */}
        {p.dataset && p.plan && index > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-surface-elevated/95 px-4 py-2.5 backdrop-blur-md lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <LiveResult people={p.plan.totalPeople} hours={p.needSummary?.totalHours ?? 0} />
              <span className="text-right text-[0.7rem] leading-tight font-semibold text-content-muted">
                Cubres {p.coverage?.weeksCovered ?? 0} de {p.weeks.length}
                <br />
                semanas del año
              </span>
            </div>
          </div>
        )}
      </div>
    </PlannerContext.Provider>
  )
}

export default function App() {
  return <Inner />
}
