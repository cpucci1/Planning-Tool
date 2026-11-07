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
 * Los puestos se añaden y se quitan AQUÍ además de en la tabla de tramos.
 * Antes solo allí, y esta pantalla se titulaba "qué puestos tienes" sin dejar
 * decir que no tienes uno: la única forma era ir a la otra pantalla y poner
 * ceros a mano en todas las filas. Las dos llaman a `lib/catalogo`, que es lo
 * que impide que acaben con dos listas distintas: dar de alta un puesto no es
 * añadir una fila, es meterlo en TODOS los tramos.
 */

import { useState } from 'react'
import { BadgeEuro, Plus, Trash2, UserCheck } from 'lucide-react'
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
  Segmented,
  TextInput,
  Toggle,
  cn,
} from './ui'
import { COTIZACION_EMPRESA_PCT_DEFECTO, SMI_HORA_EUR, porDebajoDelSmi } from '@/lib/contracts'
import {
  borrarPuesto,
  borrarZona,
  crearPuesto,
  crearZona,
  nextColor,
  renombrarZona,
  type ModelParts,
} from '@/lib/catalogo'
import { PALETTE } from '@/data/presets'
import type { Block, Role, Tier } from '@/lib/types'

const eur = new Intl.NumberFormat('es-ES', { useGrouping: true, style: 'currency', currency: 'EUR' })

export function RoleCatalog({
  blocks,
  roles,
  tiers,
  onPartsChange,
  onRolesChange,
  calcularCostes,
  onCalcularCostes,
  costeBase = 'empresa',
  onCosteBase,
  cotizacionPct = COTIZACION_EMPRESA_PCT_DEFECTO,
  onCotizacion,
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
  /**
   * Qué es la cifra por hora: sueldo bruto (y se suma la Seguridad Social de
   * la empresa) o ya coste de empresa. Un plan de antes del 2026-11-04 no lo
   * trae y se lee como coste de empresa, que es lo que se le pedía entonces.
   */
  costeBase?: 'bruto' | 'empresa'
  onCosteBase?: (b: 'bruto' | 'empresa') => void
  cotizacionPct?: number
  onCotizacion?: (pct: number) => void
}) {
  const [nuevaZona, setNuevaZona] = useState(false)
  const [nombreZona, setNombreZona] = useState('')
  const [zonaABorrar, setZonaABorrar] = useState<Block | null>(null)
  const [puestoABorrar, setPuestoABorrar] = useState<Role | null>(null)
  /** El puesto recién creado, para abrirle el nombre y que no se quede
   *  llamándose "Nuevo puesto". Mismo patrón que la tabla de tramos. */
  const [puestoNuevo, setPuestoNuevo] = useState<string | null>(null)

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
            ? costeBase === 'bruto'
              ? 'Todos los de la lista son puestos que tienes; para quitar uno, la papelera. Pon el sueldo bruto por hora de cada uno, con las pagas extra prorrateadas (el bruto del año entre 52 semanas de su jornada: a 40 h son 2.080 h), y verás lo que te cuesta tu plantilla, con la Seguridad Social.'
              : 'Todos los de la lista son puestos que tienes; para quitar uno, la papelera. Pon el coste de empresa de una hora de cada uno y verás lo que cuesta tu plantilla.'
            : 'Todos los de la lista son puestos que tienes; para quitar uno, la papelera. Si además quieres saber lo que cuesta la plantilla, enciende los costes aquí abajo.'
        }
        info={
          <InfoTip title="Qué cifra poner">
            {costeBase === 'bruto'
              ? 'El sueldo bruto por hora de contrato, con las pagas extra: el bruto del año entre las horas del contrato. Si alguien cobra 1.400 € brutos al mes en 14 pagas a 40 h, son 1.400 × 14 entre 2.080, unos 9,40 €. La Seguridad Social de la empresa la sumamos nosotros. Nunca ponemos un precio por ti.'
              : 'El coste de empresa de una hora de contrato de esa categoría: el sueldo bruto más la Seguridad Social de la empresa. Nunca ponemos un precio por ti.'}
          </InfoTip>
        }
        action={
          // Revisión ronda 5, m10: aquí había una "media del catálogo" que la
          // propia pantalla decía que no servía (no cuenta cuánta gente hay de
          // cada puesto). El coste medio de verdad sale en el resultado. Se
          // queda lo útil: cuántos puestos tienen ya precio.
          calcularCostes && roles.length > 0 ? (
            <div className="text-right whitespace-nowrap">
              <div className="text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                Con precio
              </div>
              <div className="mt-1 text-[1.25rem] leading-none font-black tracking-tight text-content-primary tnum">
                {priced.length} de {roles.length}
              </div>
            </div>
          ) : undefined
        }
      />

      <div className="border-t border-border-soft px-4 py-5 sm:px-6">
        <div className="mb-5">
          <Note tone="neutral" icon={<UserCheck size={15} strokeWidth={2.3} />}>
            {/* Revisión ronda 5, M2: prometía "siempre uno al frente", y con
                un encargado de 40 h para 57 h de apertura no puede ser. Se
                promete lo que hace: cubrir mientras la jornada dé, y marcar
                los huecos en la revisión del cuadrante. */}
            Los mandos no van por comensales. Dinos cuántos tienes y su jornada: el cuadrante pone
            uno al frente de su zona mientras su jornada lo permita, y los huecos te los marcamos en
            la revisión. Si no tienes, déjalo en 0.
          </Note>
        </div>
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
                  Todavía no tiene puestos. Añádele el primero aquí abajo.
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
                    {/* En móvil el nombre se queda con su propia línea: con el
                        coste al lado, "Responsable de turno" y el € se tocaban. */}
                    <span className="w-full min-w-0 lg:w-auto lg:flex-1">
                      <InlineName
                        value={role.name}
                        onCommit={(v) => patch(role.id, { name: v })}
                        ariaLabel={`Cambiar el nombre del puesto ${role.name}`}
                        autoEdit={puestoNuevo === role.id}
                        onEditEnd={() => setPuestoNuevo(null)}
                        className="text-[0.9rem] font-bold text-content-primary"
                      />
                    </span>

                    {calcularCostes && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[0.9rem] font-bold text-content-secondary">€</span>
                        <NumberInput
                          value={role.hourlyCostEur ?? NaN}
                          onChange={(v) => patch(role.id, { hourlyCostEur: v > 0 ? v : null })}
                          permitirVacio
                          min={0}
                          max={200}
                          step={0.5}
                          placeholder="-"
                          aria-label={`Coste por hora de ${role.name}, en euros`}
                          className="w-20"
                        />
                        <span className="text-[0.78rem] font-medium text-content-secondary">
                          {costeBase === 'bruto' ? 'brutos/hora' : '/hora'}
                        </span>
                        {porDebajoDelSmi(role.hourlyCostEur) && (
                          <Badge tone="warning">Por debajo del SMI</Badge>
                        )}
                      </span>
                    )}

                    {/* UN DESPLEGABLE Y NO UN INTERRUPTOR, Y NO ES UN CAPRICHO.
                        Esta pantalla se titula "qué puestos tienes", así que una
                        fila por puesto con un interruptor a la derecha se lee
                        como "este puesto lo tengo" / "no lo tengo" — y encendido
                        además sale en morado, que remata el engaño. Tres puestos
                        vienen de serie con esto encendido (encargado,
                        responsable de turno y jefe de cocina), o sea que el
                        usuario veía tres puestos "activados" y seis "apagados"
                        cuando en realidad tenía los nueve.

                        Con un desplegable las DOS opciones llevan su nombre, no
                        hay estado apagado que interpretar, y la palabra
                        "contrato" dice de qué va la pregunta. Quitar un puesto
                        es la papelera, que es lo único que lo quita. */}
                    {/* Dos clases de puesto (revisión del 2026-11-04). Los de
                        volumen salen de los comensales, en la tabla de tramos.
                        Los mandos no: con 90 comensales no hacen falta "más
                        encargados", hace falta que siempre haya uno. Así que se
                        dice cuántos hay y su jornada, y el cuadrante les da
                        turnos enteros cubriendo toda la apertura de su zona. */}
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[0.7rem] font-bold tracking-wide text-content-muted uppercase">
                        Se calcula
                      </span>
                      <select
                        aria-label={`Cómo se calcula el puesto ${role.name}`}
                        value={role.kind === 'estructura' ? 'estructura' : 'volumen'}
                        onChange={(e) =>
                          patch(
                            role.id,
                            e.target.value === 'estructura'
                              ? { kind: 'estructura', headcount: role.headcount ?? 1, fullTimeOnly: true }
                              : { kind: 'volumen' },
                          )
                        }
                        className="h-9 rounded-md border border-border bg-surface-elevated px-2.5 text-[0.8rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none"
                      >
                        <option value="volumen">Por comensales</option>
                        <option value="estructura">Mando, siempre presente</option>
                      </select>
                    </span>

                    {role.kind === 'estructura' && (
                      <span className="flex shrink-0 items-center gap-2">
                        <NumberInput
                          value={role.headcount ?? 0}
                          onChange={(v) => patch(role.id, { headcount: Math.max(0, Math.round(v || 0)) })}
                          min={0}
                          max={10}
                          step={1}
                          aria-label={`Cuántas personas de ${role.name} tienes`}
                          className="w-14"
                        />
                        <span className="text-[0.78rem] font-medium text-content-secondary">
                          {(role.headcount ?? 0) === 1 ? 'persona de' : 'personas de'}
                        </span>
                        <NumberInput
                          value={role.weeklyHours ?? 40}
                          onChange={(v) => patch(role.id, { weeklyHours: v > 0 ? Math.min(40, Math.round(v)) : undefined })}
                          min={4}
                          max={40}
                          step={1}
                          aria-label={`Horas a la semana de cada ${role.name}`}
                          className="w-14"
                        />
                        <span className="text-[0.78rem] font-medium text-content-secondary">h/sem</span>
                      </span>
                    )}

                    {role.kind !== 'estructura' && (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[0.7rem] font-bold tracking-wide text-content-muted uppercase">
                        Contrato
                      </span>
                      <select
                        aria-label={`Qué contrato admite el puesto ${role.name}`}
                        value={role.fullTimeOnly ? 'completa' : 'cualquiera'}
                        onChange={(e) =>
                          patch(role.id, { fullTimeOnly: e.target.value === 'completa' })
                        }
                        className="h-9 rounded-md border border-border bg-surface-elevated px-2.5 text-[0.8rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none"
                      >
                        <option value="cualquiera">Completa o parcial</option>
                        <option value="completa">Solo jornada completa</option>
                      </select>
                    </span>
                    )}

                    {/* Un ayudante de 17 años no puede cerrar a la una ni
                        hacer nueve horas. Si el puesto lo cubren menores, la
                        revisión del cuadrante lo vigila (lib/avisos.ts). */}
                    {role.kind !== 'estructura' && (
                      <span className="flex shrink-0 items-center gap-1">
                      <label
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[0.78rem] font-semibold text-content-secondary"
                        title="La ley no les deja trabajar de 22:00 a 06:00 ni más de 8 h al día"
                      >
                        <input
                          type="checkbox"
                          checked={role.menores ?? false}
                          onChange={(e) => patch(role.id, { menores: e.target.checked || undefined })}
                          className="h-4 w-4 accent-brand"
                        />
                        Menores de 18
                      </label>
                      {/* El `title` no se ve en el móvil (revisión ronda 5,
                          m11). Fuera del label: dentro, un clic en el texto
                          del globo marcaba la casilla. */}
                      <InfoTip title="Si lo cubren menores">
                        La ley no les deja trabajar de 22:00 a 06:00 ni más de 8 h al día. Si lo
                        marcas, la revisión del cuadrante te avisa cuando un turno de este puesto no
                        lo cumple.
                      </InfoTip>
                      </span>
                    )}

                    {/* "Qué puestos tienes" tiene que dejar decir que NO tienes
                        uno. Antes solo se podía en la tabla de tramos, poniendo
                        ceros a mano en todas las filas, y esta pantalla ni lo
                        insinuaba: prometía una cosa y hacía otra. */}
                    <button
                      type="button"
                      onClick={() => setPuestoABorrar(role)}
                      aria-label={`Quitar el puesto ${role.name}`}
                      title="No tengo este puesto"
                      className="shrink-0 rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-elevated hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>

              <Button
                variant="ghost"
                size="sm"
                icon={<Plus size={14} />}
                className="mt-2"
                onClick={() => {
                  const { parts, roleId } = crearPuesto(partes(), block)
                  onPartsChange(parts)
                  setPuestoNuevo(roleId)
                }}
              >
                Añadir un puesto a {block.name}
              </Button>
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

        <Modal
          open={puestoABorrar !== null}
          onClose={() => setPuestoABorrar(null)}
          title={`¿Quitar ${puestoABorrar?.name ?? ''}?`}
          subtitle="Deja de contar en la plantilla y desaparece de la tabla de tramos."
          footer={
            <>
              <Button variant="secondary" onClick={() => setPuestoABorrar(null)}>
                Dejarlo
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (puestoABorrar) onPartsChange(borrarPuesto(partes(), puestoABorrar.id))
                  setPuestoABorrar(null)
                }}
              >
                Sí, quitarlo
              </Button>
            </>
          }
        >
          <p className="text-[0.9rem] leading-relaxed text-content-secondary">
            Se va también lo que pedías de él en cada tramo. No hay deshacer, pero puedes volver a
            añadirlo.
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
            hint="Pide el sueldo por hora de cada puesto y te da lo que te cuesta la plantilla a la semana y al año, con la Seguridad Social, y cuánto se lleva el personal de lo que facturas."
          />
          {/* Qué es la cifra de arriba. Sin esto, la mitad pone el sueldo y la
              otra mitad el coste de empresa, y el porcentaje sobre ventas sale
              un tercio corto para la primera mitad sin que nadie lo note. */}
          {calcularCostes && onCosteBase && (
            <div className="mt-4 space-y-3 border-t border-border-soft pt-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[0.85rem] font-bold text-content-primary">La cifra por hora es</span>
                <Segmented
                  value={costeBase}
                  onChange={onCosteBase}
                  options={[
                    { value: 'bruto', label: 'Sueldo bruto' },
                    { value: 'empresa', label: 'Coste de empresa' },
                  ]}
                />
              </div>
              {costeBase === 'bruto' && onCotizacion && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="text-[0.85rem] font-medium text-content-secondary">
                    Le sumamos la Seguridad Social de la empresa:
                  </span>
                  <NumberInput
                    value={cotizacionPct}
                    onChange={onCotizacion}
                    min={0}
                    max={60}
                    step={0.5}
                    aria-label="Seguridad Social de la empresa, en porcentaje sobre el bruto"
                    className="w-20"
                  />
                  <span className="text-[0.85rem] font-bold text-content-secondary">%</span>
                  <InfoTip title="De dónde sale el 32 %">
                    Cotización de empresa de 2026 en un contrato indefinido: 23,60 % de
                    contingencias comunes, 5,50 % de desempleo, 0,20 % de FOGASA, 0,60 % de
                    formación y 0,75 % de MEI, que suman 30,65 %, más accidentes de trabajo, en
                    torno al 1,5 % en restaurantes. En un temporal el desempleo sube al 6,70 %.
                    Fuente: Orden de cotización de 2026. Cambia la cifra si tu gestoría te da otra.
                  </InfoTip>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3">
          <Note tone="neutral" icon={<BadgeEuro size={15} strokeWidth={2.3} />}>
            El contrato de cada puesto decide una sola cosa: los de{' '}
            <strong>solo jornada completa</strong> no bajan nunca a un contrato parcial en el
            cuadrante, aunque sus horas quepan en uno, así que les pagas la jornada entera. Es lo
            normal en los puestos de mando. En el paso de equipo es donde dices cuánta gente de
            cada puesto hace falta según los comensales que tengas sentados a la vez.
            {calcularCostes && (
              <>
                {' '}
                Y si un coste baja de {eur.format(SMI_HORA_EUR)} la hora te avisamos: es el mínimo
                legal de 2026.
              </>
            )}
          </Note>
        </div>
      </div>
    </Card>
  )
}
