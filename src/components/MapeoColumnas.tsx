/**
 * Mapeo de columnas — confirmar qué es cada columna del fichero.
 *
 * Evolución de la lista de columnas de `StepDemand` ("Lectura del fichero"):
 * aquí cada columna, además del nombre y la confianza, enseña un par de
 * valores tal cual vienen (es lo único que le permite a un jefe de sala sin
 * conocimientos técnicos saber si "F_SERV" es la fecha o no) y deja
 * corregirla en el momento con un desplegable, en vez de solo "marcar como
 * mal interpretada" y esperar a subir otro fichero.
 *
 * Componente controlado: no guarda el mapeo, todo sube por `onChange`. El
 * caso importante es el de siempre en TPV español — ninguna columna trae
 * comensales — y ahí la pantalla es explícita: lo que se calcule a partir de
 * ahí es una ESTIMA a partir de tickets, nunca un dato del fichero.
 */

import { CalendarDays, TriangleAlert } from 'lucide-react'
import { CONFIANZA_MINIMA, mapeoSuficiente } from '@/lib/mapeo'
import type { ColumnaDetectada, DestinoColumna } from '@/lib/mapeo'
import type { FormatoFecha } from '@/lib/parseFichero'
import { Badge, Card, CardHeader, Field, InfoTip, Note, NumberInput, cn } from './ui'

// El tipo, el umbral y la condición de "se puede seguir" viven en `lib/mapeo.ts`:
// de ellos dependen ahora el lector del fichero y la segunda opinión del modelo,
// y `src/lib/` no puede importar React. Se vuelven a exportar desde aquí para
// que nadie que ya importara de este fichero tenga que cambiar nada.
export { CONFIANZA_MINIMA, mapeoSuficiente }
export type { ColumnaDetectada, DestinoColumna }

const DESTINO_OPTIONS: { value: DestinoColumna; label: string }[] = [
  { value: 'fecha', label: 'Día del servicio' },
  { value: 'hora', label: 'Hora' },
  { value: 'comensales', label: 'Comensales' },
  { value: 'tickets', label: 'Nº de tickets' },
  { value: 'importe', label: 'Importe' },
  { value: 'ignorada', label: 'No la uses' },
]

export function MapeoColumnas({
  columnas,
  onChange,
  comensalesPorTicket,
  onComensalesPorTicket,
  formatoFecha,
  formatoDudoso = false,
  formatoElegido = null,
  onFormatoFecha,
}: {
  columnas: ColumnaDetectada[]
  onChange: (columnas: ColumnaDetectada[]) => void
  /** Solo se usa si NINGUNA columna es 'comensales'. */
  comensalesPorTicket: number
  onComensalesPorTicket: (v: number) => void
  /** El orden con el que se están leyendo las fechas ahora mismo. */
  formatoFecha?: FormatoFecha
  /**
   * El lector no ha podido deducir el orden, o ha encontrado filas que se
   * contradicen. Solo entonces se pregunta: en un fichero donde algún día pasa
   * de 12 la respuesta es segura, y preguntarla sería sembrar una duda que no
   * existe y dar la ocasión de elegir mal.
   */
  formatoDudoso?: boolean
  /** Lo que ya eligió el usuario, si eligió algo. */
  formatoElegido?: FormatoFecha | null
  onFormatoFecha?: (f: FormatoFecha) => void
}) {
  const tieneFecha = columnas.some((c) => c.destino === 'fecha')
  const tieneComensales = columnas.some((c) => c.destino === 'comensales')
  const tieneTickets = columnas.some((c) => c.destino === 'tickets')
  const puedeConfirmar = mapeoSuficiente(columnas)

  function setDestino(nombre: string, destino: DestinoColumna) {
    onChange(columnas.map((c) => (c.nombre === nombre ? { ...c, destino } : c)))
  }

  function queFalta(): string {
    if (!tieneFecha && !tieneComensales && !tieneTickets) {
      return 'Marca una columna como día del servicio y otra como comensales o como tickets.'
    }
    if (!tieneFecha) return 'Marca qué columna es el día del servicio.'
    return 'Marca una columna como comensales o como tickets: sin eso no hay nada que calcular.'
  }

  return (
    <Card className="p-0">
      <CardHeader
        eyebrow="Lectura del fichero"
        title={
          <>
            Esto es lo que <span className="text-brand italic">hemos entendido.</span>
          </>
        }
        subtitle="Cada fila es una columna de tu fichero. Si algo no es lo que parece, cámbialo en el desplegable."
        info={
          <InfoTip title="Por qué te pedimos revisar una columna">
            Cuando el nombre de una columna es poco claro o se parece a otro, te la señalamos para
            que confirmes qué contiene. Lo hacemos cuando la lectura queda por debajo del 85% de
            seguridad.
          </InfoTip>
        }
      />

      <div className="px-4 pb-5 sm:px-6">
        <ul className="space-y-2">
          {columnas.map((c) => {
            const dudosa = c.confianza < CONFIANZA_MINIMA
            return (
              <li
                key={c.nombre}
                className={cn(
                  'rounded-lg border p-3 transition-colors sm:px-4',
                  dudosa ? 'border-warning/40 bg-warning-light' : 'border-border-soft bg-surface',
                )}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[0.92rem] font-bold text-content-primary">
                        {c.nombre}
                      </span>
                      {/* Solo cuando hay algo que mirar. Cinco insignias de
                          "94% segura" en la primera pantalla útil son cinco
                          cifras que no piden nada: ruido con aspecto de dato. */}
                      {dudosa && (
                        <Badge tone="warning">
                          {Math.round(c.confianza * 100)}% · Revísala
                        </Badge>
                      )}
                    </div>

                    {/* Un solo ejemplo y no tres: los tres decían lo mismo (el
                        formato de la columna, que es lo único que hay que
                        reconocer) y llenaban la fila de cajas. */}
                    {c.ejemplos.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.68rem] font-bold tracking-wide text-content-muted uppercase">
                          Ejemplo
                        </span>
                        <span className="rounded-md border border-border-soft bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.75rem] text-content-secondary">
                          {c.ejemplos[0]}
                        </span>
                      </div>
                    )}

                    {dudosa && (
                      <p className="mt-1.5 text-[0.78rem] leading-snug font-semibold text-warning">
                        No estamos seguros de esta columna: mira el ejemplo de arriba y, si no es lo
                        que dice el desplegable, corrígelo.
                      </p>
                    )}
                  </div>

                  <select
                    aria-label={`Qué es la columna ${c.nombre}`}
                    value={c.destino}
                    onChange={(e) => setDestino(c.nombre, e.target.value as DestinoColumna)}
                    className="h-10 w-full min-w-0 rounded-md border border-border bg-surface-elevated px-3 text-[0.85rem] font-semibold text-content-primary transition-colors focus:border-border-focus focus:outline-none sm:w-52 sm:shrink-0"
                  >
                    {DESTINO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* EL ORDEN DE LA FECHA, SOLO CUANDO NO SE PUEDE SABER.
          Con 03/02/2026 y ninguna fila que pase de 12 en todo el fichero, día/mes
          y mes/día son las dos posibles y la herramienta elige la española. Si
          acierta, bien; si no, las semanas se colocan en el mes equivocado y el
          año sale descuadrado sin un solo error. Es la única pregunta que no se
          puede contestar leyendo el fichero, así que se hace aquí. */}
      {formatoDudoso && onFormatoFecha && (
        <div className="border-t border-border-soft px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-[220px] flex-1">
              <span className="flex items-center gap-1.5 text-[0.9rem] font-bold text-content-primary">
                <CalendarDays size={15} strokeWidth={2.3} />
                ¿Cómo se leen tus fechas?
              </span>
              <p className="mt-1 text-[0.82rem] leading-relaxed text-content-secondary">
                En tu fichero ningún número pasa de 12, así que no hay forma de saberlo. Estamos
                leyendo <strong>{formatoFecha === 'mm/dd' ? 'mes/día' : 'día/mes'}</strong>. Si es
                al revés, dilo aquí.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {(
                [
                  { valor: 'dd/mm' as FormatoFecha, label: 'Día/mes', pie: '31/12/2026' },
                  { valor: 'mm/dd' as FormatoFecha, label: 'Mes/día', pie: '12/31/2026' },
                ]
              ).map((o) => {
                const activo = (formatoElegido ?? formatoFecha) === o.valor
                return (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => onFormatoFecha(o.valor)}
                    aria-pressed={activo}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      activo
                        ? 'border-brand bg-brand-light text-brand'
                        : 'border-border-soft bg-surface text-content-secondary hover:border-border',
                    )}
                  >
                    <span className="block text-[0.85rem] font-bold">{o.label}</span>
                    <span className="block font-mono text-[0.72rem] opacity-80">{o.pie}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* El caso de siempre en TPV español: ninguna columna trae comensales.
          Se usa el nº de tickets como referencia, y la cifra que salga de ahí
          es una estima — nunca se presenta con cara de dato real. */}
      {!tieneComensales && (
        <div className="border-t border-border-soft px-4 py-5 sm:px-6">
          <Note tone="warning" icon={<TriangleAlert size={15} />}>
            {tieneTickets
              ? 'Tu fichero no trae una columna de comensales — es lo normal, casi ningún TPV español la guarda. La vamos a estimar a partir de tus tickets: dinos cuántos comensales trae uno medio.'
              : 'Tu fichero no trae una columna de comensales. Para poder estimarla hace falta al menos una columna marcada como "Nº de tickets" — márcala arriba.'}
          </Note>

          {tieneTickets && (
            <>
              <div className="mt-4 max-w-[220px]">
                <Field
                  label="Comensales por ticket"
                  hint="Por defecto 2. Súbelo si tus mesas suelen ser grandes, bájalo si es mucho para llevar."
                >
                  <NumberInput
                    value={comensalesPorTicket}
                    onChange={onComensalesPorTicket}
                    min={1}
                    max={10}
                    step={0.5}
                    aria-label="Comensales por ticket medio"
                  />
                </Field>
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-[0.8rem] leading-relaxed font-semibold text-warning">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                A partir de aquí, los comensales son una estimación calculada desde tus tickets:
                no es un dato que traiga tu TPV.
              </p>
            </>
          )}
        </div>
      )}

      {/* Ya no hay botón propio aquí. La pantalla tenía dos botones grandes
          haciendo lo mismo: este y el "Siguiente" del pie del paso, y con dos
          no se sabe cuál es el que avanza. Se queda solo el aviso de lo que
          falta, que es la parte que aportaba de verdad. */}
      {!puedeConfirmar && (
        <div className="border-t border-border-soft px-4 py-4 sm:px-6">
          <p className="flex items-start gap-1.5 text-[0.82rem] leading-relaxed font-semibold text-warning">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            {queFalta()}
          </p>
        </div>
      )}
    </Card>
  )
}
