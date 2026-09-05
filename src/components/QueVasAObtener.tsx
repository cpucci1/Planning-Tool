/**
 * "Qué vas a obtener" — la prueba antes del pedido.
 *
 * El problema que resuelve: la portada de siempre pide un fichero antes de haber
 * enseñado nada, y ahí es donde más gente se cae. Esta sección va ANTES de pedir
 * el fichero: enseña las cuatro cosas que se lleva el usuario, con una miniatura
 * de cada una dibujada solo con HTML y CSS — no hay assets y no queremos pesar.
 *
 * Las cifras de las miniaturas 1 y 4 (19 personas, el desglose de contratos, 11
 * de 52 semanas) son las del dataset de ejemplo real del proyecto: si el usuario
 * pulsa "ver el ejemplo" tienen que cuadrar con lo que ve después, o el efecto es
 * el contrario al buscado. La miniatura del coste es la excepción a propósito:
 * `Role.hourlyCostEur` nace en `null` en todo el catálogo (`data/presets.ts`) —
 * el precio lo pone el usuario, nunca se inventa — así que el ejemplo de coste de
 * aquí es ilustrativo y lleva su propia nota diciéndolo. La miniatura del
 * cuadrante (nombres y turnos) tampoco es un cuadrante real: es una rejilla
 * creíble para explicar el concepto.
 */

import { Fragment, type ReactNode } from 'react'
import { ArrowRight, BarChart3, Euro, LayoutGrid, Sparkles, Users } from 'lucide-react'
import { Button, Card } from '@/components/ui'

// ─────────────────────────────────────────────────────────────
// Datos de ejemplo
// ─────────────────────────────────────────────────────────────

/** Mismas cifras que el dataset de ejemplo: 12 jornadas de 40h + 6 de 30h + 1 de 15h = 19. */
const CONTRACTS = [
  { hours: 40, count: 12, color: 'var(--color-brand-dark)' },
  { hours: 30, count: 6, color: 'var(--color-brand)' },
  { hours: 15, count: 1, color: 'var(--color-brand-secondary)' },
] as const
const MAX_CONTRACT_COUNT = 12

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Sala en morado, cocina en ámbar — los mismos colores de bloque por defecto de `data/presets.ts`. */
const SALA = 'var(--color-brand)'
const COCINA = 'var(--color-warning)'

/** Rejilla creíble, no un cuadrante real: dos días de descanso por persona, casi siempre seguidos. */
const ROSTER_ROWS: { name: string; shifts: (string | null)[] }[] = [
  { name: 'Ana', shifts: [SALA, SALA, null, null, SALA, SALA, SALA] },
  { name: 'Leo', shifts: [null, null, SALA, SALA, SALA, SALA, SALA] },
  { name: 'Iván', shifts: [COCINA, COCINA, COCINA, null, null, COCINA, COCINA] },
  { name: 'Sara', shifts: [COCINA, null, COCINA, COCINA, COCINA, COCINA, null] },
  { name: 'Max', shifts: [SALA, SALA, SALA, SALA, null, null, SALA] },
]

/** Ejemplo ilustrativo con precio puesto a mano — ver nota de cabecera. */
const ROLE_COSTS = [
  { name: 'Encargado', pct: 45, color: '#4C1D95' },
  { name: 'Camarero', pct: 100, color: 'var(--color-brand-secondary)' },
  { name: 'Cocinero', pct: 62, color: 'var(--color-warning)' },
  { name: 'Ayudante', pct: 38, color: '#0EA5E9' },
]

/**
 * Altura (0-100) de las 52 semanas del año, en orden de calendario. Diseñada a
 * mano para que exactamente 11 superen `WEEK_THRESHOLD` — la misma cifra que el
 * dataset de ejemplo real. Los valores en sí son ilustrativos, la cuenta no.
 */
const WEEK_BARS = [
  38, 42, 40, 45, 50, 44, 48, 52, 55, 50, 58, 60, 54, 78, 88, 72, 50, 53, 56, 52, 58, 60, 62, 64,
  68, 72, 66, 60, 58, 55, 30, 28, 32, 35, 33, 50, 54, 58, 60, 56, 52, 55, 50, 48, 62, 70, 82, 90,
  95, 85, 60, 40,
]
const WEEK_THRESHOLD = 65
const WEEKS_OVER = WEEK_BARS.filter((h) => h > WEEK_THRESHOLD).length // 11

// ─────────────────────────────────────────────────────────────
// Cabecera compartida de cada miniatura
// ─────────────────────────────────────────────────────────────

function MiniHeader({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-brand-light text-brand">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.92rem] font-extrabold text-content-primary">{title}</span>
        <span className="mt-0.5 block text-[0.78rem] leading-snug text-content-secondary">
          {text}
        </span>
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export function QueVasAObtener({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="mx-auto mt-14 max-w-4xl sm:mt-16">
      <div className="text-center">
        <span className="eyebrow eyebrow--purple">Antes de subir nada</span>
        <h2 className="h2 mt-3 text-[1.4rem] sm:text-[1.75rem]">Esto es lo que sale de tu histórico</h2>
        <p className="mx-auto mt-3 max-w-lg text-[0.95rem] leading-relaxed text-content-secondary">
          Con el ejemplo de un restaurante real de menú y carta.{' '}
          <span className="font-bold text-content-primary">No son tus datos</span>: son los
          nuestros, para que veas el resultado antes de tocar nada.
        </p>
      </div>

      <div className="stagger mt-8 grid gap-4 sm:grid-cols-2">
        {/* 1 — Cuántas personas necesitas */}
        <Card className="flex h-full flex-col p-5 sm:p-6">
          <MiniHeader
            icon={<Users size={17} strokeWidth={2.4} />}
            title="Cuántas personas necesitas"
            text="La plantilla exacta que pide tu demanda, no una regla general."
          />
          <div className="mt-5 flex flex-1 items-center gap-5">
            <div className="shrink-0">
              <div className="tnum text-[2.75rem] leading-none font-black tracking-tight text-content-primary">
                19
              </div>
              <div className="mt-1.5 text-[0.68rem] font-bold tracking-wide text-content-secondary uppercase">
                personas
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2" aria-hidden="true">
              {CONTRACTS.map((c) => (
                <div key={c.hours} className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-[0.68rem] font-bold text-content-secondary">
                    {c.hours}h
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface">
                    <span
                      className="block h-full rounded-pill"
                      style={{ width: `${Math.max((c.count / MAX_CONTRACT_COUNT) * 100, 8)}%`, background: c.color }}
                    />
                  </span>
                  <span className="tnum w-4 shrink-0 text-right text-[0.68rem] font-bold text-content-primary">
                    {c.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 2 — El cuadrante, persona a persona */}
        <Card className="flex h-full flex-col p-5 sm:p-6">
          <MiniHeader
            icon={<LayoutGrid size={17} strokeWidth={2.4} />}
            title="El cuadrante, persona a persona"
            text="Quién entra, quién libra y en qué turno cada día."
          />
          <div className="mt-5 flex flex-1 flex-col justify-center" aria-hidden="true">
            <div
              className="grid items-center gap-x-1 gap-y-1.5"
              style={{ gridTemplateColumns: '2.1rem repeat(7, 1fr)' }}
            >
              <span />
              {DAYS.map((d, i) => (
                <span
                  key={i}
                  className="text-center text-[0.62rem] font-bold text-content-muted"
                >
                  {d}
                </span>
              ))}
              {ROSTER_ROWS.map((row) => (
                <Fragment key={row.name}>
                  <span className="truncate pr-1 text-[0.66rem] font-bold text-content-secondary">
                    {row.name}
                  </span>
                  {row.shifts.map((color, i) => (
                    <span
                      key={i}
                      className="h-3.5 rounded-[3px]"
                      style={{ background: color ?? 'var(--color-border-soft)' }}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </Card>

        {/* 3 — Lo que cuesta */}
        <Card className="flex h-full flex-col p-5 sm:p-6">
          <MiniHeader
            icon={<Euro size={17} strokeWidth={2.4} />}
            title="Lo que cuesta"
            text="Coste semanal y anual, puesto a puesto."
          />
          <div className="mt-5 flex flex-1 flex-col justify-center gap-3.5">
            <div className="flex items-baseline gap-6" aria-hidden="true">
              <div>
                <div className="tnum text-[1.3rem] font-black tracking-tight text-content-primary">
                  ≈ 6.750 €
                </div>
                <div className="mt-0.5 text-[0.66rem] font-bold tracking-wide text-content-muted uppercase">
                  a la semana
                </div>
              </div>
              <div>
                <div className="tnum text-[1.3rem] font-black tracking-tight text-content-primary">
                  ≈ 351.000 €
                </div>
                <div className="mt-0.5 text-[0.66rem] font-bold tracking-wide text-content-muted uppercase">
                  al año
                </div>
              </div>
            </div>
            <div className="space-y-1.5" aria-hidden="true">
              {ROLE_COSTS.map((r) => (
                <div key={r.name} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 truncate text-[0.66rem] font-bold text-content-secondary">
                    {r.name}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface">
                    <span
                      className="block h-full rounded-pill"
                      style={{ width: `${r.pct}%`, background: r.color }}
                    />
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[0.72rem] leading-snug text-content-muted">
              Ejemplo con el coste por hora puesto a mano. Tú pones el tuyo, o lo dejas en blanco.
            </p>
          </div>
        </Card>

        {/* 4 — Las semanas que se te salen */}
        <Card className="flex h-full flex-col p-5 sm:p-6">
          <MiniHeader
            icon={<BarChart3 size={17} strokeWidth={2.4} />}
            title="Las semanas que se te salen"
            text="Los picos que no compensa contratar: se cubren con extras."
          />
          <div className="mt-5 flex flex-1 flex-col justify-center">
            <div className="flex items-baseline gap-2">
              <span className="tnum text-[1.9rem] leading-none font-black tracking-tight text-warning">
                {WEEKS_OVER}
              </span>
              <span className="text-[0.8rem] font-bold text-content-secondary">de 52 semanas se salen</span>
            </div>
            <div className="relative mt-3.5 flex h-14 items-end gap-[1.5px]" aria-hidden="true">
              <span
                className="pointer-events-none absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `${WEEK_THRESHOLD}%`, borderColor: 'var(--color-content-muted)' }}
              />
              {WEEK_BARS.map((h, i) => (
                <span
                  key={i}
                  className="min-w-0 flex-1 rounded-t-[1px]"
                  style={{
                    height: `${h}%`,
                    background: h > WEEK_THRESHOLD ? 'var(--color-warning)' : 'var(--color-brand)',
                    opacity: h > WEEK_THRESHOLD ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-[0.72rem] leading-snug text-content-muted">
              Las 52 semanas del año, en orden. Lo que asoma por encima de la línea es pico.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-9 text-center">
        <p className="mx-auto max-w-md text-[0.98rem] font-bold text-content-primary">
          Esto no lo calculamos a ojo: sale de tu propio histórico, semana a semana.
        </p>
        <Button
          size="lg"
          className="mt-5"
          onClick={onDemo}
          icon={<Sparkles size={17} strokeWidth={2.3} />}
          iconRight={<ArrowRight size={16} />}
        >
          Ver el ejemplo funcionando
        </Button>
      </div>
    </section>
  )
}
