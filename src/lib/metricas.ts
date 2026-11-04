/**
 * Tres métricas derivadas de lo que la herramienta ya calcula, para que el
 * cuadrante se pueda leer y corregir en vez de solo mirarse.
 *
 * Las tres cruzan datos que ya existen (curva de comensales, necesidad por
 * franja, cuadrante generado): no piden ningún dato nuevo al usuario.
 *
 * Lógica pura, no importa React — sigue la misma regla que el resto de `lib/`.
 */

import { DAYS, SLOT_MINUTES, SLOTS_PER_DAY, formatMin, minToSlot, slotStartMin } from './time'
import type { DayIndex, NeedGrid, Roster, Settings, StaffingModel } from './types'
import { totalPeopleGrid } from './staffing'
import { findesDeMedia, type Rueda } from './semana'

export interface HolguraFranja {
  day: DayIndex
  slot: number
  /** Horas-persona contratadas de más en esa franja. */
  horasSobrantes: number
  /** "el martes de 17:00 a 19:00", ya formateado. */
  cuando: string
}

export interface RepartoFindes {
  personId: string
  label: string
  /** Sábados o domingos que trabaja a la semana. Con rueda, de media (puede llevar decimales). */
  findesTrabajados: number
}

export interface Metricas {
  /** Comensales atendidos por hora-persona trabajada. La medida que usa la
   *  industria para saber si un cuadrante rinde. null si no hay horas. */
  comensalesPorHora: number | null
  /** Las franjas donde más gente sobra, de mayor a menor. Máximo 6. */
  peoresHolguras: HolguraFranja[]
  /** Horas-persona de más en TODA la semana, no solo en los seis peores tramos.
   *  Es el número que se puede comparar con el total contratado; el peor tramo
   *  suelto ya lo cuenta la lista de debajo y repetirlo era decir dos veces lo
   *  mismo con dos cifras distintas. */
  horasSobrantesTotal: number
  /** Horas-persona que la gente está en el local según el cuadrante. Es el
   *  denominador con el que las horas de más cuadran: necesarias + de más =
   *  esto. Las CONTRATADAS son otra cifra mayor, porque incluyen contrato que
   *  no llega a ponerse en ningún turno, y compararlas mezclaba dos cosas. */
  horasEnTurnos: number
  /** Cuántos findes trabaja cada persona, de más a menos. */
  findes: RepartoFindes[]
  /** Diferencia entre quien más findes trabaja y quien menos. */
  desequilibrioFindes: number
}

/**
 * Personas puestas en el cuadrante, por franja: `[day][slot]`, sumando todos
 * los puestos. Un turno con jornada partida tiene dos bloques ese mismo día y
 * los dos cuentan, porque se recorren todos los bloques de cada turno.
 *
 * Los minutos de los bloques son absolutos sobre la rejilla (GRID_START_MIN);
 * `minToSlot` hace la conversión a franja, no se calcula a mano.
 */
function staffedPeopleGrid(roster: Roster): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  for (const shift of roster.shifts) {
    for (const block of shift.blocks) {
      const startSlot = Math.max(0, minToSlot(block.startMin))
      const endSlot = Math.min(SLOTS_PER_DAY, minToSlot(block.endMin))
      for (let s = startSlot; s < endSlot; s++) {
        grid[shift.day][s] += 1
      }
    }
  }
  return grid
}

/**
 * Agrupa las franjas donde sobra gente (cuadrante > necesidad) en tramos
 * seguidos del mismo día, para no soltar un aviso por cada media hora. Es la
 * parte que hace la métrica accionable en vez de un muro de ruido.
 */
function groupHolguras(
  staffed: number[][],
  needed: number[][],
): { tramos: HolguraFranja[]; total: number } {
  const tramos: HolguraFranja[] = []
  let total = 0

  for (let d = 0; d < 7; d++) {
    let groupStart = -1
    let groupHoras = 0

    // Se recorre una franja de más (SLOTS_PER_DAY) para poder cerrar, con el
    // mismo código, un grupo que llegue hasta el final del día.
    for (let s = 0; s <= SLOTS_PER_DAY; s++) {
      const sobra = s < SLOTS_PER_DAY ? staffed[d][s] - needed[d][s] : 0
      const dentroDelGrupo = s < SLOTS_PER_DAY && sobra > 0

      if (dentroDelGrupo) {
        if (groupStart === -1) groupStart = s
        const horas = (sobra * SLOT_MINUTES) / 60
        groupHoras += horas
        total += horas
        continue
      }

      if (groupStart !== -1) {
        // `s` es la primera franja ya fuera del grupo: su inicio es el fin del tramo.
        const startMin = slotStartMin(groupStart)
        const endMin = slotStartMin(s)
        tramos.push({
          day: d as DayIndex,
          slot: groupStart,
          horasSobrantes: groupHoras,
          cuando: `el ${DAYS[d].toLowerCase()} de ${formatMin(startMin)} a ${formatMin(endMin)}`,
        })
        groupStart = -1
        groupHoras = 0
      }
    }
  }

  // El total sale de TODOS los tramos; la lista se queda con los seis peores,
  // que es lo que cabe en pantalla sin volverse un muro.
  return { tramos: tramos.sort((a, b) => b.horasSobrantes - a.horasSobrantes).slice(0, 6), total }
}

export function calcularMetricas(
  roster: Roster,
  needGrid: NeedGrid,
  model: StaffingModel,
  lagged: number[][],
  /** Con la rueda de semanas, los findes se cuentan de media a lo largo de la vuelta. */
  rueda?: Rueda,
): Metricas {
  // 1. Comensales por hora: comensales de la semana tipo entre las horas que
  // de verdad se PAGAN, que son las contratadas del cuadrante, no las que
  // pide la curva.
  //
  // La diferencia entre las dos cifras es exactamente la holgura, que esta
  // misma pantalla enseña dos tarjetas más allá: dividir entre las horas de
  // la curva daba un número inflado en esa proporción y contradecía al de al
  // lado. Y lo que le importa a quien paga la nómina es cuántos comensales
  // saca por cada hora que abona, no por cada hora teórica.
  let totalComensales = 0
  for (const day of lagged) for (const v of day) totalComensales += v
  const horasPagadas = roster.people.reduce((a, p) => a + p.contractHours, 0)
  const comensalesPorHora = horasPagadas > 0 ? totalComensales / horasPagadas : null

  // 2. Holgura por franja: gente puesta en el cuadrante menos gente que pide
  // needGrid, franja a franja. Se compara en total (todos los puestos juntos),
  // igual que pide el encargo, no puesto a puesto.
  const staffed = staffedPeopleGrid(roster)
  const needed = totalPeopleGrid(needGrid, model)
  let horasEnTurnos = 0
  for (const day of staffed) for (const v of day) horasEnTurnos += (v * SLOT_MINUTES) / 60
  // La lista de dónde sobra gente es franja a franja; la cifra total es la
  // neta, la misma que el resumen de la plantilla (ronda 5).
  const { tramos: peoresHolguras } = groupHolguras(staffed, needed)
  const horasSobrantesTotal = horasDeMasNetas(staffed, needed)

  // 3. Reparto de findes: sábado es el día 5 y domingo el 6 (ver DAYS en
  // lib/time.ts, semana española 0=lunes). Un turno partido en el mismo día
  // de fin de semana solo cuenta una vez: es el mismo día trabajado. Con la
  // rueda, quien rota trabaja de media lo que su grupo a lo largo de la vuelta
  // (lib/semana.ts), y eso es lo que se compara.
  const media = rueda ? findesDeMedia(roster, rueda) : null
  const findes: RepartoFindes[] = roster.people.map((person) => {
    const trabajaSabado = roster.shifts.some((sh) => sh.personId === person.id && sh.day === 5)
    const trabajaDomingo = roster.shifts.some((sh) => sh.personId === person.id && sh.day === 6)
    return {
      personId: person.id,
      label: person.label,
      findesTrabajados: media?.get(person.id) ?? (trabajaSabado ? 1 : 0) + (trabajaDomingo ? 1 : 0),
    }
  })
  findes.sort((a, b) => b.findesTrabajados - a.findesTrabajados)

  const desequilibrioFindes =
    findes.length > 0
      ? Math.max(...findes.map((f) => f.findesTrabajados)) -
        Math.min(...findes.map((f) => f.findesTrabajados))
      : 0

  return {
    comensalesPorHora,
    peoresHolguras,
    horasSobrantesTotal,
    horasEnTurnos,
    findes,
    desequilibrioFindes,
  }
}

/**
 * Jornadas partidas a la semana. El cuadrante solo parte una jornada cuando
 * eso ahorra una persona (revisión del 2026-11-04, punto 10), y la pantalla
 * lo dice con este número para que se vea cuántas son.
 */
/**
 * Horas que la gente está en el local por encima de lo que pide la necesidad,
 * franja a franja y sumando todos los puestos. Es LA cifra de "horas de más":
 * la tarjeta de métricas y el desglose de las horas pagadas sin servicio
 * (`summarizePlan`) salen de aquí, para que no haya dos números distintos.
 */
export function horasDeMasEnElLocal(roster: Roster, needGrid: NeedGrid, model: StaffingModel): number {
  return horasDeMasNetas(staffedPeopleGrid(roster), totalPeopleGrid(needGrid, model))
}

/**
 * Las horas de más, en NETO (ronda 5, G1 de pantallas): horas en turnos menos
 * horas que pide el servicio, nunca por debajo de cero. Antes se sumaban solo
 * las franjas con gente de sobra, sin restar las que tenían de menos (las que
 * cubre el mando o el equipo que ya está), y las cifras no se podían
 * comprobar restando: 582 contratadas y 488,5 de necesidad decían 100 h, no
 * 93,5. Así, contratadas = necesidad + en el local de más + sin turno, exacto.
 */
function horasDeMasNetas(staffed: number[][], needed: number[][]): number {
  return Math.max(0, netoEnTurnos(staffed, needed))
}

/** Horas en turnos menos horas que pide el servicio, con signo: negativo si faltan. */
function netoEnTurnos(staffed: number[][], needed: number[][]): number {
  let neto = 0
  for (let d = 0; d < 7; d++) for (let s = 0; s < SLOTS_PER_DAY; s++) neto += staffed[d][s] - needed[d][s]
  return (neto * SLOT_MINUTES) / 60
}

/**
 * Las horas que se pagan y el servicio no pide, en sus dos partes (ronda 4):
 * las que la gente está en el local de más y las de contrato que no llevan
 * turno. La usan el resumen de la plantilla y la cabecera del cuadrante, para
 * que las dos pantallas digan la misma cifra.
 */
export function horasPagadasSinServicio(
  roster: Roster,
  needGrid: NeedGrid,
  model: StaffingModel,
): { enElLocal: number; sinTurno: number; sinCubrir: number } {
  let contratadas = 0
  let enTurnos = 0
  for (const p of roster.people) contratadas += p.contractHours
  for (const sh of roster.shifts) enTurnos += sh.hours
  const neto = netoEnTurnos(staffedPeopleGrid(roster), totalPeopleGrid(needGrid, model))
  // `sinCubrir` (ronda 9, hallazgo 6 de cálculo): cuando los turnos no llegan
  // a lo que pide el servicio, las horas de contrato sin turno se pagan pero
  // NO son "de más" sobre el servicio. Con él la cuenta vuelve a ser exacta:
  // contratadas = necesidad + en el local de más + sin turno - sin cubrir.
  return { enElLocal: Math.max(0, neto), sinTurno: Math.max(0, contratadas - enTurnos), sinCubrir: Math.max(0, -neto) }
}

/** Por encima de esta parte de la necesidad, las horas de más se explican en pantalla. */
export const HORAS_DE_MAS_EXPLICAR = 0.1

/**
 * La frase que explica las horas que se pagan sin servicio, cuando pasan del
 * 10 % de lo que pide el servicio (ronda 4). Una plantilla bien hecha no se
 * queda más allá del 10 o 15 % sin una razón que se pueda decir, y esta es
 * la razón, con sus cifras. Null si no hace falta.
 */
export function fraseHorasDeMas(
  d: { enElLocal: number; sinTurno: number; sinCubrir?: number },
  neededHours: number,
  settings: Pick<Settings, 'minShiftMinutes' | 'minContractHours'>,
): string | null {
  // Lo que se paga POR ENCIMA del servicio: si quedan horas sin cubrir, las
  // de contrato sin turno no son de más (ronda 9).
  const total = Math.max(0, d.enElLocal + d.sinTurno - (d.sinCubrir ?? 0))
  if (neededHours <= 0 || total <= neededHours * HORAS_DE_MAS_EXPLICAR) return null
  const n = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  const pct = Math.round((total / neededHours) * 100)
  const partes: string[] = []
  if (d.enElLocal >= 0.5) {
    partes.push(
      `${n(d.enElLocal)} h son de turnos más largos que el pico: nadie viene menos de ${n(settings.minShiftMinutes / 60)} h seguidas, ` +
        'así que quien refuerza un pico corto se queda hasta cerrar el servicio',
    )
  }
  if (d.sinTurno >= 0.5) {
    partes.push(
      `${n(d.sinTurno)} h son de contrato sin turno, porque los contratos se redondean hacia arriba ` +
        `(a 4 h o menos de la jornada completa se firma la completa, y nadie baja de ${n(settings.minContractHours ?? 10)} h)`,
    )
  }
  return `Pagas ${n(total)} h más de las que pide el servicio, un ${pct} %. ${partes.join('; ')}.`
}

export function contarPartidas(roster: Roster): number {
  return roster.shifts.filter((s) => s.blocks.length > 1).length
}
