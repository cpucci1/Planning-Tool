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

import { ArrowRight, TriangleAlert } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Field, InfoTip, Note, NumberInput, cn } from './ui'

export type DestinoColumna = 'fecha' | 'hora' | 'comensales' | 'tickets' | 'importe' | 'ignorada'

export interface ColumnaDetectada {
  /** Cómo se llama en el fichero del usuario. */
  nombre: string
  /** Qué creemos que es. */
  destino: DestinoColumna
  /** 0 a 1. Por debajo de 0.85 hay que llamar la atención sobre ella. */
  confianza: number
  /** Dos o tres valores de ejemplo de esa columna, tal cual vienen. */
  ejemplos: string[]
}

/** Por debajo de esto, la fila se marca y se explica por qué mirarla. */
const CONFIANZA_MINIMA = 0.85

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
  onConfirmar,
  comensalesPorTicket,
  onComensalesPorTicket,
}: {
  columnas: ColumnaDetectada[]
  onChange: (columnas: ColumnaDetectada[]) => void
  onConfirmar: () => void
  /** Solo se usa si NINGUNA columna es 'comensales'. */
  comensalesPorTicket: number
  onComensalesPorTicket: (v: number) => void
}) {
  const tieneFecha = columnas.some((c) => c.destino === 'fecha')
  const tieneComensales = columnas.some((c) => c.destino === 'comensales')
  const tieneTickets = columnas.some((c) => c.destino === 'tickets')
  const puedeConfirmar = tieneFecha && (tieneComensales || tieneTickets)

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
          <InfoTip title="Qué es la confianza">
            Cuánto de seguros estamos de haber adivinado bien esa columna. Por debajo del 85% te lo
            señalamos: suele pasar cuando la cabecera es rara o dos columnas se parecen entre sí.
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
                      <Badge tone={dudosa ? 'warning' : 'success'}>
                        {Math.round(c.confianza * 100)}% {dudosa ? 'revisar' : 'segura'}
                      </Badge>
                    </div>

                    {c.ejemplos.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.68rem] font-bold tracking-wide text-content-muted uppercase">
                          Así viene
                        </span>
                        {c.ejemplos.map((ej, i) => (
                          <span
                            key={i}
                            className="rounded-md border border-border-soft bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.75rem] text-content-secondary"
                          >
                            {ej}
                          </span>
                        ))}
                      </div>
                    )}

                    {dudosa && (
                      <p className="mt-1.5 text-[0.78rem] leading-snug font-semibold text-warning">
                        No estamos seguros de esta columna: mira los ejemplos de arriba y, si no es
                        lo que dice el desplegable, corrígelo.
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
                A partir de aquí, toda cifra de comensales que veas es una estima calculada desde
                tus tickets — no es un dato que traiga tu TPV.
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-3 border-t border-border-soft px-4 py-5 sm:px-6">
        <Button
          size="lg"
          onClick={onConfirmar}
          disabled={!puedeConfirmar}
          iconRight={<ArrowRight size={18} />}
        >
          Confirmar y calcular
        </Button>
        {!puedeConfirmar && (
          <p className="max-w-md text-center text-[0.82rem] leading-relaxed font-semibold text-warning">
            {queFalta()}
          </p>
        )}
      </div>
    </Card>
  )
}
