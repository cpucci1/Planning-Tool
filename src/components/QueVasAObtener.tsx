/**
 * "Qué vas a obtener" — la prueba antes del pedido.
 *
 * El problema que resuelve: la portada de siempre pide un fichero antes de haber
 * enseñado nada, y ahí es donde más gente se cae. Esta sección va ANTES de pedir
 * el fichero: enseña las cuatro cosas que se lleva el usuario, con una miniatura
 * de cada una dibujada solo con HTML y CSS — no hay assets y no queremos pesar.
 *
 * Las cifras de las miniaturas (personas por jornada, coste, semanas punta) son
 * las del restaurante de ejemplo tal y como sale al abrirlo, con sus costes de
 * muestra: viven en `data/ejemploPortada.ts` y `npm run verificar` falla si el
 * cálculo las mueve (ronda 3). La miniatura del cuadrante (nombres y turnos) y
 * la forma de las barras de las semanas no son reales: son dibujos creíbles
 * para explicar el concepto, y la cuenta de semanas sí lo es.
 */

import { Fragment, type ReactNode } from 'react'
import { BarChart3, Euro, LayoutGrid, Users } from 'lucide-react'
import { Card } from '@/components/ui'
import { DEFAULT_ROLES } from '@/data/presets'
import {
  PORTADA_CONTRATOS,
  PORTADA_COSTE_ANO_EUR,
  PORTADA_COSTE_PUESTOS,
  PORTADA_COSTE_SEMANA_EUR,
  PORTADA_SEMANAS_PUNTA,
} from '@/data/ejemploPortada'

// ─────────────────────────────────────────────────────────────
// Datos de ejemplo
// ─────────────────────────────────────────────────────────────

/**
 * Las jornadas del ejemplo, de `data/ejemploPortada.ts`: las mismas que salen al
 * abrirlo, y `npm run verificar` falla si dejan de serlo.
 */
const CONTRACT_COLORS = [
  'var(--color-brand-dark)',
  'var(--color-brand)',
  'var(--color-brand-secondary)',
  'var(--color-content-muted)',
]
const CONTRACTS = PORTADA_CONTRATOS.map((c, i) => ({ ...c, color: CONTRACT_COLORS[i % CONTRACT_COLORS.length] }))
const MAX_CONTRACT_COUNT = Math.max(...CONTRACTS.map((c) => c.count))

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

/** Los cuatro puestos que más cuestan en el ejemplo, con los costes de muestra. */
const ROLE_COST_COLORS = ['var(--color-brand-secondary)', 'var(--color-warning)', 'var(--color-brand-dark)', 'var(--color-info)']
const ROLE_COSTS = PORTADA_COSTE_PUESTOS.map((r, i) => ({
  name: DEFAULT_ROLES.find((x) => x.id === r.roleId)?.name ?? r.roleId,
  pct: r.pct,
  color: ROLE_COST_COLORS[i % ROLE_COST_COLORS.length],
}))
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: true })

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
const WEEKS_OVER = PORTADA_SEMANAS_PUNTA

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

export function QueVasAObtener() {
  return (
    <section className="mx-auto mt-14 max-w-4xl sm:mt-16">
      <div className="text-center">
        <span className="eyebrow eyebrow--purple">Antes de subir nada</span>
        <h2 className="h2 mt-3 text-[1.4rem] sm:text-[1.75rem]">Así sale con un restaurante de ejemplo</h2>
        <p className="mx-auto mt-3 max-w-lg text-[0.95rem] leading-relaxed text-content-secondary">
          Un menú y carta de tamaño medio, de comidas y cenas, con encargado y jefe de cocina.{' '}
          <span className="font-bold text-content-primary">No son tus datos</span>: es lo mismo que
          verás si abres el ejemplo de arriba, para que sepas qué sale antes de subir nada tuyo.
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
                {CONTRACTS.reduce((n, c) => n + c.count, 0)}
              </div>
              <div className="mt-1.5 text-[0.68rem] font-bold tracking-wide text-content-secondary uppercase">
                personas
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2" aria-hidden="true">
              {CONTRACTS.map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 whitespace-nowrap text-[0.68rem] font-bold text-content-secondary">
                    {c.label}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface">
                    <span
                      className="block h-full rounded-pill"
                      style={{ width: `${c.count ? Math.max((c.count / MAX_CONTRACT_COUNT) * 100, 8) : 0}%`, background: c.color }}
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
                  {eur.format(PORTADA_COSTE_SEMANA_EUR)}
                </div>
                <div className="mt-0.5 text-[0.66rem] font-bold tracking-wide text-content-muted uppercase">
                  a la semana
                </div>
              </div>
              <div>
                <div className="tnum text-[1.3rem] font-black tracking-tight text-content-primary">
                  {eur.format(PORTADA_COSTE_ANO_EUR)}
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
              Con sueldos de ejemplo y la Seguridad Social. Pones los tuyos, o lo dejas apagado y no se enseña ninguna cifra.
            </p>
          </div>
        </Card>

        {/* 4 — Las semanas que necesitan refuerzo */}
        <Card className="flex h-full flex-col p-5 sm:p-6">
          <MiniHeader
            icon={<BarChart3 size={17} strokeWidth={2.4} />}
            title="Las semanas que necesitan refuerzo"
            text="Los picos que conviene cubrir solo cuando aparecen."
          />
          <div className="mt-5 flex flex-1 flex-col justify-center">
            <div className="flex items-baseline gap-2">
              <span className="tnum text-[1.9rem] leading-none font-black tracking-tight text-warning">
                {WEEKS_OVER}
              </span>
              <span className="text-[0.8rem] font-bold text-content-secondary">de 52 semanas necesitan refuerzo</span>
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
              Las 52 semanas del histórico, en orden. Lo que asoma por encima de la línea necesita refuerzo.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-9 text-center">
        <p className="mx-auto max-w-md text-[0.98rem] font-bold text-content-primary">
          Con tu fichero no se calcula a ojo: sale de tu propio histórico, semana a semana.
        </p>
      </div>
    </section>
  )
}
