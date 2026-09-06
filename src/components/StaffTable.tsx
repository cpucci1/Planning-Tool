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
import type { ContractType, Roster, StaffingModel } from '@/lib/types'

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: true,
})

interface Row {
  roleId: string
  name: string
  color: string
  /** contractId → personas */
  byContract: Record<string, number>
  people: number
  contractedHours: number
  weeklyEur: number | null
}

export function StaffTable({
  roster,
  model,
  contracts,
  blockId,
  title,
  eyebrow,
  subtitle,
}: {
  roster: Roster
  model: StaffingModel
  contracts: ContractType[]
  /** Si viene, solo los puestos de ese bloque. */
  blockId?: string
  title: React.ReactNode
  eyebrow: string
  subtitle?: string
}) {
  const roles = model.roles.filter((r) => (blockId ? r.blockId === blockId : true))
  const used = contracts.filter((c) =>
    roster.people.some(
      (p) => p.contractId === c.id && roles.some((r) => r.id === p.roleId),
    ),
  )

  const rows: Row[] = []
  for (const role of roles) {
    const own = roster.people.filter((p) => p.roleId === role.id)
    if (own.length === 0) continue
    const byContract: Record<string, number> = {}
    for (const p of own) byContract[p.contractId] = (byContract[p.contractId] ?? 0) + 1
    const contractedHours = own.reduce((a, p) => a + p.contractHours, 0)
    rows.push({
      roleId: role.id,
      name: role.name,
      color: role.color,
      byContract,
      people: own.length,
      contractedHours,
      weeklyEur:
        role.hourlyCostEur !== null && role.hourlyCostEur > 0
          ? contractedHours * role.hourlyCostEur
          : null,
    })
  }

  if (rows.length === 0) return null

  const totalPeople = rows.reduce((a, r) => a + r.people, 0)
  const totalHours = rows.reduce((a, r) => a + r.contractedHours, 0)
  const anyCost = rows.some((r) => r.weeklyEur !== null)
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

      <div className="scroll-thin overflow-x-auto border-t border-border-soft">
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
                Horas/sem
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
                      <span className="text-content-muted">—</span>
                    )}
                  </td>
                ))}
                <td className={cn(td, 'text-center font-black')}>{r.people}</td>
                <td className={cn(td, 'text-right text-content-secondary')}>
                  {nf1.format(r.contractedHours)}
                </td>
                {anyCost && (
                  <td className={cn(td, 'text-right text-content-secondary')}>
                    {r.weeklyEur !== null ? eur.format(r.weeklyEur) : '—'}
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
    </Card>
  )
}
