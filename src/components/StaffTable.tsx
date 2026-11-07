/**
 * La plantilla en tabla: puesto por jornada.
 *
 * Es la lectura que pide un jefe de sala cuando va a contratar — "camarero:
 * cinco de 40 y tres de 30" — y la que no daba el resumen anterior, que solo
 * decía el mix del total. Se pinta la misma tabla para todo el local y luego
 * una por bloque (`blockId`), porque quien contrata sala no contrata cocina.
 *
 * Las columnas de jornada salen de los contratos activos, no de una lista fija:
 * si el usuario apaga los de 20h, esa columna desaparece en vez de quedarse a
 * cero ocupando sitio.
 */

import { Card, CardHeader, InfoTip, cn } from './ui'
import { columnasDeJornada } from '@/lib/contracts'
import { esMando } from '@/lib/roster'
import type { ContractType, Roster, StaffingModel } from '@/lib/types'

const nf1 = new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 1 })
const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: true,
})

/**
 * "1 de 35 h", "4 parciales", "2 de 40 h" (ronda 7, m3): "4 de parcial" no es
 * castellano. La etiqueta de la columna llega como "40h", "35h" o "Parcial".
 */
function jornadaEnTexto(n: number, etiqueta: string): string {
  const e = etiqueta.toLowerCase()
  if (/^\d+([.,]\d+)?\s*h$/.test(e)) return `${n} de ${e.replace(/\s*h$/, ' h')}`
  if (e === 'parcial') return `${n} ${n === 1 ? 'parcial' : 'parciales'}`
  return `${n} de ${e}`
}

interface Row {
  roleId: string
  name: string
  color: string
  /** columna de jornada → personas */
  byContract: Record<string, number>
  people: number
  contractedHours: number
  weeklyEur: number | null
}

export function StaffTable({
  roster,
  model,
  blockId,
  title,
  eyebrow,
  subtitle,
  conCostes,
  factorCoste = 1,
  costePorPuesto,
}: {
  roster: Roster
  model: StaffingModel
  /** Ya no se usa: las columnas salen de las jornadas que de verdad hay en el
   *  cuadrante, que con contratos a medida no están en la lista. */
  contracts?: ContractType[]
  /** Si es false no se enseña la columna de coste, aunque los puestos tengan
   *  precio guardado de una sesión anterior. El interruptor de costes manda. */
  conCostes: boolean
  /**
   * Por cuánto se multiplica la cifra del catálogo para tener coste de
   * empresa: 1,32 si es sueldo bruto, 1 si ya era coste de empresa. Sale de
   * `baseDeCoste` (`lib/contracts.ts`), el mismo que usa el total, para que la
   * columna y el total de la pantalla no cuenten cosas distintas.
   */
  factorCoste?: number
  /**
   * Coste de empresa semanal de cada puesto, tal y como sale del resumen de
   * coste (`summarizeCost().byRole`), con la nocturnidad dentro. Si viene,
   * manda sobre la cuenta de aquí, para que esta columna sume lo mismo que el
   * total de la pantalla.
   */
  costePorPuesto?: Map<string, number | null>
  /** Si viene, solo los puestos de ese bloque. */
  blockId?: string
  title: React.ReactNode
  eyebrow: string
  subtitle?: string
}) {
  const roles = model.roles.filter((r) => (blockId ? r.blockId === blockId : true))
  const used = columnasDeJornada(roster.people.filter((p) => roles.some((r) => r.id === p.roleId)))

  const rows: Row[] = []
  for (const role of roles) {
    const own = roster.people.filter((p) => p.roleId === role.id)
    if (own.length === 0) continue
    const byContract: Record<string, number> = {}
    for (const p of own) {
      const col = used.find((c) => c.incluye(p.contractHours))
      if (col) byContract[col.id] = (byContract[col.id] ?? 0) + 1
    }
    const contractedHours = own.reduce((a, p) => a + p.contractHours, 0)
    rows.push({
      roleId: role.id,
      name: role.name,
      color: role.color,
      byContract,
      people: own.length,
      contractedHours,
      weeklyEur: costePorPuesto?.has(role.id)
        ? (costePorPuesto.get(role.id) ?? null)
        : role.hourlyCostEur !== null && role.hourlyCostEur > 0
          ? contractedHours * role.hourlyCostEur * factorCoste
          : null,
    })
  }

  if (rows.length === 0) return null

  /**
   * Los puestos que los tramos piden y que no salen en la tabla porque los hace
   * un mando mientras está (ronda 7, M4 de pantallas). Quien ha puesto el
   * responsable de sala con su precio y no lo ve aquí piensa que se ha perdido:
   * se dice en la misma tabla, no dos pantallas después.
   */
  const conGente = (id: string) => roster.people.some((p) => p.roleId === id)
  const hechosPorMando = roles
    .filter((r) => !esMando(r) && !conGente(r.id) && model.tiers.some((t) => (t.staff[r.id] ?? 0) > 0))
    .map((r) => {
      const mando = model.roles.find((m) => m.blockId === r.blockId && esMando(m) && conGente(m.id))
      if (!mando) return null
      const relevo = model.roles.find((x) => x.blockId === r.blockId && !esMando(x) && conGente(x.id))
      return (
        `${r.name}: no sale como puesto aparte. Lo hace tu ${mando.name.toLowerCase()} mientras está` +
        (relevo ? ` y, cuando libra, queda al frente un ${relevo.name.toLowerCase()}.` : '.')
      )
    })
    .filter((x): x is string => x !== null)

  const totalPeople = rows.reduce((a, r) => a + r.people, 0)
  const totalHours = rows.reduce((a, r) => a + r.contractedHours, 0)
  const anyCost = conCostes && rows.some((r) => r.weeklyEur !== null)
  const totalEur = rows.reduce((a, r) => a + (r.weeklyEur ?? 0), 0)

  const th = 'px-3 py-2 text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase'
  const td = 'px-3 py-2 text-[0.85rem] tabular-nums text-content-primary'

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        info={
          <InfoTip title="Cómo leer esta tabla">
            Cada fila es un puesto y cada columna una jornada. Es lo que tendrías que contratar:
            el número de la columna de 40 h son personas a jornada completa de ese puesto, y así
            con el resto.
          </InfoTip>
        }
        action={
          <div className="text-right whitespace-nowrap">
            <div className="text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
              Personas
            </div>
            <div className="mt-1 text-[1.4rem] leading-none font-black tracking-tight text-content-primary">
              {totalPeople}
            </div>
          </div>
        }
      />

      {/* En el móvil, lista y no tabla (ronda 3, punto 18): en la tabla el
          total, las horas y el coste se quedaban fuera, a la derecha. */}
      <ul className="divide-y divide-border-soft border-t border-border-soft sm:hidden">
        {rows.map((r) => (
          <li key={r.roleId} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ background: r.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[0.9rem] font-bold text-content-primary">{r.name}</span>
              <span className="text-[0.95rem] font-black text-content-primary tabular-nums">{r.people}</span>
            </div>
            <div className="mt-1 pl-[18px] text-[0.78rem] leading-snug text-content-secondary">
              {used
                .filter((c) => r.byContract[c.id])
                .map((c) => jornadaEnTexto(r.byContract[c.id], c.label))
                .reduce((acc, t, i, all) => (i === 0 ? t : `${acc}${i === all.length - 1 ? ' y ' : ', '}${t}`), '')}
              {' · '}
              {nf1.format(r.contractedHours)} h de contrato
              {anyCost && r.weeklyEur !== null ? ` · ${eur.format(r.weeklyEur)}/sem` : ''}
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 bg-surface px-4 py-3 text-[0.85rem]">
          <span className="font-black text-content-primary">Total</span>
          <span className="text-right text-content-secondary tabular-nums">
            <strong className="text-brand">{totalPeople}</strong> personas · {nf1.format(totalHours)} h
            {anyCost ? ` · ${eur.format(totalEur)}/sem` : ''}
          </span>
        </li>
      </ul>

      <div className="scroll-thin hidden overflow-x-auto border-t border-border-soft sm:block">
        <table className="w-full min-w-[440px] border-collapse">
          <thead>
            <tr className="border-b border-border-soft bg-surface">
              <th scope="col" className={cn(th, 'text-left')}>
                Puesto
              </th>
              {used.map((c) => (
                <th key={c.id} scope="col" className={cn(th, 'text-center')}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className={cn(th, 'text-center')}>
                Total
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Horas de contrato
              </th>
              {anyCost && (
                <th scope="col" className={cn(th, 'text-right')}>
                  Coste/sem
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.roleId} className="border-b border-border-soft last:border-b-0">
                <th scope="row" className={cn(td, 'text-left font-bold')}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-pill"
                      style={{ background: r.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{r.name}</span>
                  </span>
                </th>
                {used.map((c) => (
                  <td key={c.id} className={cn(td, 'text-center')}>
                    {r.byContract[c.id] ? (
                      <span className="font-bold">{r.byContract[c.id]}</span>
                    ) : (
                      <span className="text-content-muted">-</span>
                    )}
                  </td>
                ))}
                <td className={cn(td, 'text-center font-black')}>{r.people}</td>
                <td className={cn(td, 'text-right text-content-secondary')}>
                  {nf1.format(r.contractedHours)}
                </td>
                {anyCost && (
                  <td className={cn(td, 'text-right text-content-secondary')}>
                    {r.weeklyEur !== null ? eur.format(r.weeklyEur) : '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border bg-surface">
              <th scope="row" className={cn(td, 'text-left font-black')}>
                Total
              </th>
              {used.map((c) => (
                <td key={c.id} className={cn(td, 'text-center font-bold')}>
                  {rows.reduce((a, r) => a + (r.byContract[c.id] ?? 0), 0)}
                </td>
              ))}
              <td className={cn(td, 'text-center font-black text-brand')}>{totalPeople}</td>
              <td className={cn(td, 'text-right font-bold')}>{nf1.format(totalHours)}</td>
              {anyCost && (
                <td className={cn(td, 'text-right font-bold')}>{eur.format(totalEur)}</td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {hechosPorMando.length > 0 && (
        <div className="space-y-1 border-t border-border-soft px-4 py-3 text-[0.8rem] leading-snug text-content-secondary sm:px-5">
          {hechosPorMando.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      )}
    </Card>
  )
}
