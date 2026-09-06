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

import { useState } from 'react'
import { BadgeEuro, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InfoTip,
  InlineName,
  Modal,
  NumberInput,
  Note,
  TextInput,
  Toggle,
  cn,
} from './ui'
import { SMI_HORA_EUR, porDebajoDelSmi } from '@/lib/contracts'
import { borrarZona, crearZona, nextColor, renombrarZona, type ModelParts } from '@/lib/catalogo'
import { PALETTE } from '@/data/presets'
import type { Block, Role, Tier } from '@/lib/types'

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function RoleCatalog({
  blocks,
  roles,
  tiers,
  onPartsChange,
  onRolesChange,
  calcularCostes,
  onCalcularCostes,
}: {
  blocks: Block[]
  roles: Role[]
  /** Hacen falta para poder crear y borrar zonas: un puesto nuevo tiene que
   *  nacer presente en todos los tramos, y uno que se borra tiene que
   *  desaparecer de todos. Ver `lib/catalogo`. */
  tiers: Tier[]
  onPartsChange: (p: ModelParts) => void
  onRolesChange: (r: Role[]) => void
  /** Si está apagado, aquí no se pide ni se enseña ni un euro. */
  calcularCostes: boolean
  onCalcularCostes: (v: boolean) => void
}) {
  const [nuevaZona, setNuevaZona] = useState(false)
  const [nombreZona, setNombreZona] = useState('')
  const [zonaABorrar, setZonaABorrar] = useState<Block | null>(null)

  function patch(id: string, d: Partial<Role>) {
    onRolesChange(roles.map((r) => (r.id === id ? { ...r, ...d } : r)))
  }

  function partes(): ModelParts {
    return { blocks, roles, tiers }
  }

  function crear() {
    const nombre = nombreZona.trim()
    if (!nombre) return
    const color = nextColor(
      blocks.map((b) => b.color),
      PALETTE[0],
    )
    onPartsChange(crearZona(partes(), nombre, color))
    setNombreZona('')
    setNuevaZona(false)
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
          calcularCostes ? (
            <>
              Qué puestos tienes y <span className="text-brand italic">qué cuesta cada hora.</span>
            </>
          ) : (
            <>
              Qué puestos <span className="text-brand italic">tienes.</span>
            </>
          )
        }
        subtitle={
          calcularCostes
            ? 'Pon el coste real de una hora de cada puesto y verás lo que cuesta tu plantilla a la semana y al año.'
            : 'Las categorías con las que trabajas. Si además quieres saber lo que cuesta la plantilla, enciende los costes aquí abajo.'
        }
        info={
          <InfoTip title="Qué coste poner">
            El coste real de una hora trabajada de esa categoría, con Seguridad Social incluida si
            quieres que la cifra sea honesta. Nunca ponemos nosotros un precio: ni de mercado ni de
            Shifty.
          </InfoTip>
        }
        action={
          calcularCostes && avg !== null ? (
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
          // Las zonas vacías SÍ se pintan: si una que acabas de crear no
          // aparece hasta que tiene puestos, parece que no se ha creado.
          return (
            <div key={block.id} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-pill"
                  style={{ background: block.color }}
                  aria-hidden="true"
                />
                <InlineName
                  value={block.name}
                  onCommit={(v) => onPartsChange(renombrarZona(partes(), block.id, v))}
                  ariaLabel={`Cambiar el nombre de la zona ${block.name}`}
                  className="text-[0.75rem] font-bold tracking-wide text-content-secondary uppercase"
                />
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setZonaABorrar(block)}
                    aria-label={`Borrar la zona ${block.name}`}
                    className="ml-auto rounded-md p-1 text-content-muted transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {own.length === 0 && (
                <p className="mb-2 text-[0.82rem] text-content-secondary">
                  Todavía no tiene puestos. Se los pones en el paso de equipo, que es donde hay
                  que decir cuánta gente hace falta en cada tramo.
                </p>
              )}

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

                    {calcularCostes && (
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
                        <span className="text-[0.78rem] font-medium text-content-secondary">
                          /hora
                        </span>
                        {porDebajoDelSmi(role.hourlyCostEur) && (
                          <Badge tone="warning">Por debajo del SMI</Badge>
                        )}
                      </span>
                    )}

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

        {/* Las zonas se crean aquí y en la tabla de tramos, y las dos llaman a
            `lib/catalogo`: crear una zona no es solo añadir una fila, es dar de
            alta su puesto en TODOS los tramos. Dos copias de eso acaban en
            tramos sin columna y en un cálculo mal sin ningún error. */}
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={15} />}
          onClick={() => setNuevaZona(true)}
        >
          Añadir una zona
        </Button>

        <Modal
          open={nuevaZona}
          onClose={() => setNuevaZona(false)}
          title="Una zona nueva"
          subtitle="Terraza, barra, reparto… Cualquier parte del local que se plantifique aparte."
          footer={
            <>
              <Button variant="secondary" onClick={() => setNuevaZona(false)}>
                Cancelar
              </Button>
              <Button onClick={crear} disabled={!nombreZona.trim()}>
                Crear la zona
              </Button>
            </>
          }
        >
          <TextInput
            value={nombreZona}
            onChange={(e) => setNombreZona(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crear()
            }}
            placeholder="Terraza"
            aria-label="Nombre de la zona nueva"
            autoFocus
          />
          <p className="mt-3 text-[0.85rem] leading-relaxed text-content-secondary">
            Nace con un puesto del mismo nombre para que puedas empezar a pedirle gente. Lo
            renombras con un doble clic.
          </p>
        </Modal>

        <Modal
          open={zonaABorrar !== null}
          onClose={() => setZonaABorrar(null)}
          title={`¿Borrar ${zonaABorrar?.name ?? ''}?`}
          subtitle="Se van con ella sus puestos y lo que pedías de ellos en cada tramo."
          footer={
            <>
              <Button variant="secondary" onClick={() => setZonaABorrar(null)}>
                Dejarla
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (zonaABorrar) onPartsChange(borrarZona(partes(), zonaABorrar.id))
                  setZonaABorrar(null)
                }}
              >
                Sí, borrarla
              </Button>
            </>
          }
        >
          <p className="text-[0.9rem] leading-relaxed text-content-secondary">
            La plantilla se recalcula sin esa zona. No hay deshacer, pero puedes volver a crearla.
          </p>
        </Modal>

        {/* El interruptor va al final y no arriba: primero se ven los puestos,
            que es a lo que se viene, y el dinero es la segunda pregunta. Apagado
            de partida porque media pantalla de campos de euros que nadie va a
            rellenar solo estorba. */}
        <div className="mt-4 rounded-lg border border-border-soft bg-surface p-4">
          <Toggle
            checked={calcularCostes}
            onChange={onCalcularCostes}
            label="Calcular también lo que cuesta"
            hint="Pide el coste por hora de cada puesto y te da el coste de la plantilla a la semana y al año, y cuánto se lleva el personal de lo que facturas."
          />
        </div>

        <Note tone="neutral" icon={<BadgeEuro size={15} strokeWidth={2.3} />}>
          Los puestos marcados como <strong>solo jornada completa</strong> no bajan nunca a un
          contrato parcial en el cuadrante, aunque sus horas quepan en uno. Es lo normal en los
          puestos de mando. Para añadir o quitar puestos, ve al paso de equipo: allí es donde hay
          que decirles cuánta gente hace falta en cada tramo.
          {calcularCostes && (
            <>
              {' '}
              Y si un coste baja de {eur.format(SMI_HORA_EUR)} la hora te avisamos: es el mínimo
              legal de 2026.
            </>
          )}
        </Note>
      </div>
    </Card>
  )
}
