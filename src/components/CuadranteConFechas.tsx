/**
 * El cuadrante como se cuelga: una semana con fechas de verdad, un código por
 * día (M, T, P, L), las horas que suma cada uno y hasta cuándo hay que
 * publicarlo para que llegue con preaviso.
 *
 * Con la rueda (lib/semana.ts), cada semana del calendario le toca a cada
 * persona una fila distinta del cuadrante tipo, y aquí se ve cuál.
 */

import { Fragment, useMemo, useState } from 'react'
import { CalendarClock, Printer, RefreshCw } from 'lucide-react'
import { Button, Note, cn } from '@/components/ui'
import { descargarCuadranteCocina } from '@/lib/cuadrante-imagen'
import {
  LEYENDA_CODIGOS,
  SEMANA,
  aIso,
  codigoTurno,
  desdeIso,
  tramoCorto,
  diaLargo,
  lunesDe,
  primerLunesPublicable,
  publicarAntesDe,
  rangoSemana,
  sumarDias,
  turnosEnSemana,
  type CodigoTurno,
  type Rueda,
} from '@/lib/semana'
import { DAYS_SHORT, formatRange } from '@/lib/time'
import type { Person, Role, Roster, Shift, StaffingModel } from '@/lib/types'

interface Grupo {
  key: string
  name: string
  color: string
  people: Person[]
}

const DIA_MS = 24 * 60 * 60 * 1000
const nf1 = new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 1 })

/** Semanas enteras entre dos lunes (puede ser negativo). */
function semanasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (7 * DIA_MS))
}

const TONO_CODIGO: Record<CodigoTurno, string> = {
  M: 'bg-info-light text-info',
  T: 'bg-brand-light text-brand',
  N: 'bg-brand-light text-brand',
  P: 'bg-warning-light text-warning',
  L: 'bg-surface text-content-muted',
}

export function CuadranteConFechas({
  roster,
  model,
  grupos,
  roleById,
  rueda,
}: {
  roster: Roster
  model: StaffingModel
  grupos: Grupo[]
  roleById: Map<string, Role>
  rueda?: Rueda
}) {
  // La semana de partida de la rueda es la primera que aún se puede publicar
  // a tiempo; desde ahí se cuentan las demás.
  const [inicio] = useState(() => primerLunesPublicable(new Date()))
  const [lunes, setLunes] = useState(inicio)
  const hoy = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  const semanas = rueda?.semanas ?? 1
  const w = ((semanasEntre(inicio, lunes) % semanas) + semanas) % semanas
  const turnos = useMemo(
    () => (rueda ? turnosEnSemana(roster, rueda, w) : roster.shifts),
    [roster, rueda, w],
  )
  const porPersonaDia = useMemo(() => {
    const m = new Map<string, Shift[]>()
    for (const s of turnos) {
      const k = `${s.personId}|${s.day}`
      const l = m.get(k)
      if (l) l.push(s)
      else m.set(k, [s])
    }
    return m
  }, [turnos])

  const limite = publicarAntesDe(lunes)
  const tarde = limite < hoy
  const rotan = rueda?.grupos.reduce((a, g) => a + g.personIds.length, 0) ?? 0
  const maxSeguidos = Math.max(0, ...(rueda?.grupos.map((g) => g.maxDiasSeguidos) ?? []))

  const textoRueda = !rueda
    ? null
    : rueda.semanas > 1
      ? `Semana ${w + 1} de la rueda. Rotan ${rotan} personas: ${rueda.grupos
          .map(
            (g) =>
              `los ${g.personIds.length} de ${roleById.get(g.roleId)?.name.toLowerCase() ?? g.roleId} a ${g.contractHours} h vuelven a su semana cada ${g.personIds.length}`,
          )
          .join('; ')}. Cada semana hacen la fila de otro compañero, así que al cabo de la vuelta todos han librado lo mismo y han hecho los mismos findes.`
      : 'Este cuadrante no tiene rueda: no hay dos personas del mismo puesto con el mismo contrato que puedan cambiarse la semana. Cada uno repite la suya.'

  const nota = rueda && rueda.semanas > 1 ? `Semana ${w + 1} de la rueda.` : undefined

  return (
    <div className="space-y-4 px-4 pb-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[0.72rem] font-bold tracking-wide text-content-secondary uppercase">
            Semana que empieza el lunes
          </span>
          <input
            type="date"
            value={aIso(lunes)}
            onChange={(e) => {
              const d = desdeIso(e.target.value)
              if (d) setLunes(lunesDe(d))
            }}
            className={cn(
              'h-10 rounded-md border border-border bg-surface-elevated px-3 text-[0.9rem] font-bold tabular-nums text-content-primary',
              'transition-colors focus:border-border-focus focus:outline-none',
            )}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLunes(sumarDias(lunes, -7))}>
            Semana anterior
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLunes(sumarDias(lunes, 7))}>
            Siguiente
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={16} />}
            onClick={() => void descargarCuadranteCocina(roster, model, { lunes, turnos, nota })}
          >
            PDF para colgar
          </Button>
        </div>
      </div>

      <Note tone={tarde ? 'warning' : 'brand'} icon={<CalendarClock size={16} strokeWidth={2.4} />}>
        <p className="font-bold">
          Cuadrante {rangoSemana(lunes)}.{' '}
          {tarde
            ? `Tenía que estar publicado el ${diaLargo(limite)}: ya no llega con los cinco días de preaviso.`
            : `Publícalo como tarde el ${diaLargo(limite)}.`}
        </p>
        <p className="mt-1 opacity-85">
          El Estatuto pide avisar con cinco días de antelación del día y la hora de trabajo cuando la
          jornada se reparte de forma irregular, y muchos convenios piden el calendario antes. Mira
          el tuyo.
        </p>
      </Note>

      {textoRueda && (
        <Note tone="neutral" icon={<RefreshCw size={16} strokeWidth={2.4} />}>
          <p>{textoRueda}</p>
          {rueda && rueda.semanas > 1 && (
            <p className="mt-1">
              Los parciales no rotan: su contrato es de unos días concretos (un fin de semana, unas
              tardes entre semana), y cambiárselos sería cambiarles el contrato.
              {maxSeguidos > 6
                ? ` Ojo: al pasar de una semana a otra, alguien encadena hasta ${maxSeguidos} días seguidos. Cada semana conserva su descanso semanal, pero conviene avisarle.`
                : ''}
            </p>
          )}
          {rueda && rueda.sinRotar.length > 0 && (
            <p className="mt-1">
              {rueda.sinRotar.length} personas no rotan porque al pasar de una semana a otra se
              quedarían sin las doce horas entre jornadas o sin su descanso semanal.
            </p>
          )}
        </Note>
      )}

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 border-y border-border-soft bg-surface-elevated px-3 py-2 text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                Persona
              </th>
              {SEMANA.map((d) => (
                <th
                  key={d}
                  className="border-y border-border-soft bg-surface-elevated px-1 py-2 text-center text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase"
                >
                  {DAYS_SHORT[d]} {sumarDias(lunes, d).getDate()}
                </th>
              ))}
              <th className="border-y border-border-soft bg-surface-elevated px-3 py-2 text-right text-[0.7rem] font-bold tracking-wide text-content-secondary uppercase">
                Horas
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.key}>
                <tr>
                  <td colSpan={9} className="bg-surface-alt px-3 py-1.5 text-[0.75rem] font-extrabold text-content-primary">
                    {g.name}
                  </td>
                </tr>
                {g.people.map((person) => {
                  let horas = 0
                  const celdas = SEMANA.map((d) => {
                    const list = porPersonaDia.get(`${person.id}|${d}`) ?? []
                    for (const s of list) horas += s.hours
                    const blocks = list.flatMap((s) => s.blocks).sort((a, b) => a.startMin - b.startMin)
                    const codigo = codigoTurno(list[0] ? { ...list[0], blocks } : undefined)
                    return {
                      codigo,
                      tramos: blocks.map((b) => tramoCorto(b.startMin, b.endMin)),
                      horario: blocks.map((b) => formatRange(b.startMin, b.endMin)).join(' y '),
                    }
                  })
                  return (
                    <tr key={person.id}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 min-w-[150px] border-b border-border-soft bg-surface-elevated px-3 py-1.5 text-left font-normal"
                      >
                        <span className="block text-[0.82rem] font-bold text-content-primary">{person.label}</span>
                        <span className="block text-[0.7rem] font-medium text-content-secondary">
                          {roleById.get(person.roleId)?.name ?? 'Sin puesto'} · {person.contractHours} h
                        </span>
                      </th>
                      {celdas.map((c, d) => (
                        <td key={d} className="border-b border-border-soft px-1 py-1.5 text-center" title={c.horario || 'Libra'}>
                          <span
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-md text-[0.8rem] font-extrabold',
                              TONO_CODIGO[c.codigo],
                            )}
                          >
                            {c.codigo}
                          </span>
                          {c.tramos.map((t) => (
                            <span
                              key={t}
                              className="mt-0.5 block text-[0.62rem] leading-tight font-semibold whitespace-nowrap text-content-secondary tabular-nums"
                            >
                              {t}
                            </span>
                          ))}
                        </td>
                      ))}
                      <td className="border-b border-border-soft px-3 py-1.5 text-right text-[0.82rem] font-bold text-content-primary tabular-nums">
                        {nf1.format(horas)} h
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-surface-alt px-3 py-2 text-left text-[0.75rem] font-extrabold text-content-primary">
                Trabajan
              </th>
              {SEMANA.map((d) => (
                <td key={d} className="bg-surface-alt px-1 py-2 text-center text-[0.8rem] font-extrabold text-content-primary tabular-nums">
                  {new Set(turnos.filter((s) => s.day === d).map((s) => s.personId)).size}
                </td>
              ))}
              <td className="bg-surface-alt px-3 py-2 text-right text-[0.8rem] font-extrabold text-content-primary tabular-nums">
                {nf1.format(turnos.reduce((a, s) => a + s.hours, 0))} h
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-medium text-content-secondary">
        {(Object.keys(LEYENDA_CODIGOS) as CodigoTurno[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[0.7rem] font-extrabold', TONO_CODIGO[k])}>
              {k}
            </span>
            {LEYENDA_CODIGOS[k]}
          </span>
        ))}
      </p>
    </div>
  )
}
