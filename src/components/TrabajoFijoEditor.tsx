/**
 * Trabajo fijo por puesto y servicio (ronda 2, punto 25).
 *
 * La división clásica de la industria (Fourth, UniFocus, Quinyx): una parte del
 * trabajo sube y baja con los comensales, y otra es igual todos los días pase lo
 * que pase, como la mise en place o la limpieza. Esta lista es la segunda. El
 * cálculo vive en `applyTrabajoFijo` (`lib/staffing.ts`); aquí solo se edita.
 *
 * Va debajo de "antes de abrir y después de cerrar" porque es su continuación:
 * aquello estira el turno de quien abre y cierra; esto pide un puesto concreto
 * aunque ese servicio venga flojo. Y no se suman: cuenta el máximo.
 */

import { Plus, Trash2 } from 'lucide-react'
import { Button, InfoTip, NumberInput, cn } from '@/components/ui'
import type { Role, TrabajoFijo } from '@/lib/types'

const MINUTOS = [15, 30, 45, 60, 90, 120]

/** Dos tareas típicas para no empezar en blanco. Solo se ofrecen si existen esos puestos. */
const SUGERENCIAS: { roleId: string; momento: TrabajoFijo['momento']; minutos: number; texto: string }[] = [
  { roleId: 'cocinero', momento: 'antes', minutos: 60, texto: 'Mise en place (1 h)' },
  { roleId: 'office', momento: 'despues', minutos: 30, texto: 'Limpieza de office (30 min)' },
]

const selectCls =
  'h-9 rounded-md border border-border bg-surface-elevated px-2.5 text-[0.82rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none'

export function TrabajoFijoEditor({
  roles,
  tareas,
  onChange,
}: {
  roles: Role[]
  tareas: TrabajoFijo[]
  onChange: (tareas: TrabajoFijo[]) => void
}) {
  // Los mandos van por horario: el cuadrante no les reparte este trabajo.
  const puestos = roles.filter((r) => r.kind !== 'estructura')
  if (puestos.length === 0) return null

  const nuevoId = () => `tf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const patch = (id: string, cambio: Partial<TrabajoFijo>) =>
    onChange(tareas.map((t) => (t.id === id ? { ...t, ...cambio } : t)))
  const sugerencias = SUGERENCIAS.filter(
    (s) => puestos.some((r) => r.id === s.roleId) && !tareas.some((t) => t.roleId === s.roleId && t.momento === s.momento),
  )

  return (
    <div className="border-t border-border-soft px-4 pt-5 pb-5 sm:px-6">
      <h4 className="h4 flex items-center gap-2">
        Trabajo fijo de cada servicio
        <InfoTip title="Fijo y variable">
          Una parte del trabajo sube y baja con los comensales; otra es igual todos los días, como
          montar la cocina o limpiar. Lo que pongas aquí se pide en cada servicio aunque venga
          flojo. Si ya entra alguien de ese puesto por la preparación de arriba, cuenta: no se suma
          dos veces.
        </InfoTip>
      </h4>
      <p className="mt-1 text-[0.82rem] leading-relaxed text-content-secondary">
        Lo que hace falta pase lo que pase con los comensales, puesto por puesto, antes o después de
        cada servicio. La preparación de arriba alarga el turno de quien abre y cierra; esto es
        para cuando hace falta más gente que esa, por ejemplo dos cocineros en la mise en place.
        Si con quien abre te basta, no añadas nada.
      </p>

      {tareas.length > 0 && (
        <ul className="mt-3 space-y-2">
          {tareas.map((t) => (
            <li
              key={t.id}
              className="animate-pop-in flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-surface px-3 py-2.5"
            >
              <NumberInput
                value={t.personas}
                onChange={(v) => patch(t.id, { personas: Math.max(1, Math.round(v) || 1) })}
                min={1}
                max={10}
                step={1}
                aria-label="Personas"
                className="w-16"
              />
              <select
                value={t.roleId}
                onChange={(e) => patch(t.id, { roleId: e.target.value })}
                aria-label="Puesto"
                className={selectCls}
              >
                {puestos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                value={String(t.minutos)}
                onChange={(e) => patch(t.id, { minutos: Number(e.target.value) })}
                aria-label="Minutos"
                className={selectCls}
              >
                {[...new Set([...MINUTOS, t.minutos])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <select
                value={t.momento}
                onChange={(e) => patch(t.id, { momento: e.target.value as TrabajoFijo['momento'] })}
                aria-label="Cuándo"
                className={selectCls}
              >
                <option value="antes">antes de cada servicio</option>
                <option value="despues">después de cada servicio</option>
              </select>
              <button
                type="button"
                onClick={() => onChange(tareas.filter((x) => x.id !== t.id))}
                aria-label="Quitar esta tarea"
                className="ml-auto rounded-md p-1 text-content-muted transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={cn('mt-3 flex flex-wrap gap-2')}>
        {sugerencias.map((s) => (
          <Button
            key={s.roleId + s.momento}
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() =>
              onChange([...tareas, { id: nuevoId(), roleId: s.roleId, momento: s.momento, minutos: s.minutos, personas: 1 }])
            }
          >
            {s.texto}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() =>
            onChange([...tareas, { id: nuevoId(), roleId: puestos[0].id, momento: 'antes', minutos: 30, personas: 1 }])
          }
        >
          Otra tarea
        </Button>
      </div>
    </div>
  )
}
