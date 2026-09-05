/**
 * Catálogo de puestos: el nombre, lo que cuesta la hora y si solo se contrata
 * a jornada completa.
 *
 * Vive antes que los tramos a propósito: aquí se dice QUÉ categorías tiene el
 * local y cuánto cuestan, y en el paso de equipo se dice CUÁNTA gente de cada
 * una hace falta según los comensales. Antes había un único "coste medio por
 * hora" en ajustes avanzados; no servía, porque un jefe de cocina y un office
 * no cuestan lo mismo y la plantilla mezcla los dos.
 *
 * Los puestos se añaden y se borran en la tabla de tramos, no aquí: allí es
 * donde hay que ponerles número, y tener dos sitios que crean puestos acaba
 * con dos listas distintas.
 */

import { BadgeEuro } from 'lucide-react'
import { Card, CardHeader, InfoTip, InlineName, NumberInput, Note, Toggle, cn } from './ui'
import type { Block, Role } from '@/lib/types'

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function RoleCatalog({
  blocks,
  roles,
  onRolesChange,
}: {
  blocks: Block[]
  roles: Role[]
  onRolesChange: (r: Role[]) => void
}) {
  function patch(id: string, d: Partial<Role>) {
    onRolesChange(roles.map((r) => (r.id === id ? { ...r, ...d } : r)))
  }

  const priced = roles.filter((r) => r.hourlyCostEur !== null && r.hourlyCostEur > 0)
  const avg =
    priced.length > 0
      ? priced.reduce((a, r) => a + (r.hourlyCostEur ?? 0), 0) / priced.length
      : null

  return (
    <Card>
      <CardHeader
        eyebrow="Tus puestos"
        title={
          <>
            Qué puestos tienes y <span className="text-brand italic">qué cuesta cada hora.</span>
          </>
        }
        subtitle="El coste es opcional: si lo dejas en blanco, el resultado se queda en personas y horas. Si lo rellenas, verás lo que cuesta tu plantilla a la semana y al año."
        info={
          <InfoTip title="Qué coste poner">
            El coste real de una hora trabajada de esa categoría, con Seguridad Social incluida si
            quieres que la cifra sea honesta. Nunca ponemos nosotros un precio: ni de mercado ni de
            Shifty.
          </InfoTip>
        }
        action={
          avg !== null ? (
            <div className="text-right whitespace-nowrap">
              <div className="text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                Media del catálogo
              </div>
              <div className="mt-1 text-[1.25rem] leading-none font-black tracking-tight text-content-primary">
                {eur.format(avg)}
              </div>
              <div className="mt-1 text-[0.75rem] font-medium text-content-secondary">
                {priced.length} de {roles.length} con precio
              </div>
              {/* Se avisa de que NO es el coste medio de la plantilla: aquel va
                  ponderado por horas y sale distinto. */}
              <div className="mt-0.5 text-[0.7rem] font-medium text-content-muted">
                sin contar cuánta gente hay de cada
              </div>
            </div>
          ) : undefined
        }
      />

      <div className="border-t border-border-soft px-4 py-5 sm:px-6">
        {blocks.map((block) => {
          const own = roles.filter((r) => r.blockId === block.id)
          if (own.length === 0) return null
          return (
            <div key={block.id} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-center gap-2 text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-pill"
                  style={{ background: block.color }}
                  aria-hidden="true"
                />
                {block.name}
              </div>

              <ul className="space-y-2">
                {own.map((role) => (
                  <li
                    key={role.id}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-soft bg-surface px-3 py-2.5',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <InlineName
                        value={role.name}
                        onCommit={(v) => patch(role.id, { name: v })}
                        ariaLabel={`Cambiar el nombre del puesto ${role.name}`}
                        className="text-[0.9rem] font-bold text-content-primary"
                      />
                    </span>

                    <span className="flex items-center gap-1.5">
                      <span className="text-[0.9rem] font-bold text-content-secondary">€</span>
                      <NumberInput
                        value={role.hourlyCostEur ?? NaN}
                        onChange={(v) => patch(role.id, { hourlyCostEur: v > 0 ? v : null })}
                        min={0}
                        max={200}
                        step={0.5}
                        placeholder="—"
                        aria-label={`Coste por hora de ${role.name}, en euros`}
                        className="w-20"
                      />
                      <span className="text-[0.78rem] font-medium text-content-secondary">/hora</span>
                    </span>

                    <Toggle
                      checked={role.fullTimeOnly}
                      onChange={(v) => patch(role.id, { fullTimeOnly: v })}
                      label="Solo jornada completa"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        <Note tone="neutral" icon={<BadgeEuro size={15} strokeWidth={2.3} />}>
          Los puestos marcados como <strong>solo jornada completa</strong> no bajan nunca a un
          contrato parcial en el cuadrante, aunque sus horas quepan en uno. Es lo normal en los
          puestos de mando. Para añadir o quitar puestos, ve al paso de equipo: allí es donde hay
          que decirles cuánta gente hace falta en cada tramo.
        </Note>
      </div>
    </Card>
  )
}
