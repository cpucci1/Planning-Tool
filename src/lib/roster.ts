/**
 * De la curva de necesidad al cuadrante.
 *
 * Hay dos clases de puesto y cada una se planifica a su manera (revisión del
 * 2026-11-04, punto 2):
 *
 * - **De volumen** (camarero, ayudante, cocinero, office): salen de los tramos.
 *   La curva de necesidad se cubre con TURNOS TIPO derivados del horario de
 *   cada día (los dos relevos de un día largo, el servicio entero de un
 *   mediodía, el refuerzo del pico), no con piezas a medida de cada media hora
 *   (punto 9). Se eligen por rendimiento: el que más necesidad cubre por hora
 *   pagada.
 * - **De estructura** (encargado, responsable de turno, jefe de cocina): no
 *   salen de los tramos. El usuario dice cuántos tiene y su jornada, y aquí se
 *   les dan turnos enteros garantizando que mientras su zona esté abierta
 *   siempre haya uno al frente (`planificarMandos`).
 *
 * Después los turnos de volumen se empaquetan en personas, siempre como turnos
 * continuos, y se consolida: se vacía a los más flojos repartiendo sus turnos.
 * Solo en la última vuelta se permite juntar dos turnos del mismo día en una
 * jornada partida, y solo si eso quita a una persona entera (punto 10). Nunca se
 * junta un relevo con el turno del que sale: una partida lleva un hueco real de
 * al menos una hora, y ningún día pasa del tope diario (punto 1).
 *
 * Al final cada persona baja al contrato que cubre sus horas: con contratos a
 * medida, el número de horas exacto con un mínimo; si no, el más pequeño de la
 * lista que las cubra (punto 8).
 */

import { GRID_START_MIN, SLOTS_PER_DAY, SLOT_MINUTES, slotStartMin } from './time'
import type {
  ContractType,
  DayIndex,
  NeedGrid,
  OpeningHours,
  Person,
  Role,
  Roster,
  Settings,
  Shift,
  StaffingModel,
} from './types'

// ─────────────────────────────────────────────────────────────
// Reglas compartidas con la revisión (`avisos.ts`)
// ─────────────────────────────────────────────────────────────

/** 9 h al día: el máximo de la ley salvo que el convenio diga otra cosa. */
export const TOPE_DIARIO_DEFECTO_MIN = 9 * 60

/** Contrato parcial más pequeño, si los contratos van a medida y no se dice otro. */
export const MIN_CONTRATO_DEFECTO_H = 10

/**
 * A cuántas horas de la jornada completa un contrato a medida se redondea a
 * completa. Un "parcial de 39 h" delata un cuadrante hecho a máquina.
 */
export const CASI_COMPLETA_H = 4

/** Hueco mínimo entre los dos bloques de una jornada partida. */
export const SPLIT_GAP_MIN = 60

/** Arco máximo de una jornada partida, de la entrada a la salida. */
export const MAX_ARCO_PARTIDA_MIN = 13 * 60

/** 12 h entre el fin de un turno y el inicio del siguiente (Art. 34.3 ET). */
export const MIN_REST_MIN = 12 * 60

/** El trabajo nocturno va de 22:00 a 06:00 (art. 36.1 ET), en minutos de la rejilla. */
export const NOCHE_DESDE_MIN = 22 * 60
export const NOCHE_HASTA_MIN = 24 * 60 + 6 * 60
/** Quien hace al menos 3 h de su jornada de noche es trabajador nocturno (art. 36.1 ET). */
export const NOCTURNO_DESDE_MIN = 3 * 60
/** La jornada de un nocturno no pasa de 8 h de media (art. 36.1 ET). */
export const TOPE_NOCTURNO_MIN = 8 * 60

/**
 * Minutos de unos bloques entre las 22:00 y las 06:00. Los minutos cuentan
 * desde la medianoche del día que abre y pasan de 1440 de madrugada, así que
 * la noche es el tramo 22:00 a 30:00, más lo que haya antes de las 06:00.
 */
export function minutosDeNocheBloques(blocks: readonly { startMin: number; endMin: number }[]): number {
  let m = 0
  for (const b of blocks) {
    m += Math.max(0, Math.min(b.endMin, NOCHE_HASTA_MIN) - Math.max(b.startMin, NOCHE_DESDE_MIN))
    m += Math.max(0, Math.min(b.endMin, 6 * 60) - b.startMin)
  }
  return m
}

/**
 * El tope de UNA jornada (revisión ronda 5, M2): el diario de siempre, y 8 h si
 * la jornada lleva 3 h o más de noche. Antes el generador montaba jornadas de
 * 9 h cerrando a la una y su propia revisión las marcaba ilegales; ahora no
 * las monta. Se aplica jornada a jornada, que es más estricto que la media de
 * la ley: así ninguna persona puede salir con una media de más de 8 h.
 */
export function topeDeJornada(blocks: { startMin: number; endMin: number }[], topeDia: number): number {
  return minutosDeNocheBloques(blocks) >= NOCTURNO_DESDE_MIN ? Math.min(topeDia, TOPE_NOCTURNO_MIN) : topeDia
}

/** Máximo de horas al día que se aplica. Un plan guardado antes no lo trae. */
export function topeDiarioMin(settings: Settings): number {
  return settings.maxDailyMinutes ?? TOPE_DIARIO_DEFECTO_MIN
}

/**
 * Descanso semanal: día y medio sin interrupción (art. 37.1 ET).
 *
 * Ronda 5 (M6): la revisión pedía subirlo a 48 h (36 + las 12 del diario)
 * citando la STS 274/2026. Esa sentencia solo aparece nombrada en una frase
 * del CLAUDE.md del proyecto, sin texto ni enlace, y no se ha podido leer;
 * además, en hostelería el RD 1561/1995 (art. 6) deja acumular el medio día.
 * Sin la fuente no se cambia: se queda en 36 h, A CONFIRMAR CON UN
 * LABORALISTA. Si se confirma, es esta cifra y nada más. La usan el reparto
 * (ronda 6, M3) y la revisión.
 */
export const DESCANSO_SEMANAL_MIN = 36 * 60
/** Un menor de 18 descansa dos días ininterrumpidos a la semana (art. 37.1 ET). */
export const DESCANSO_SEMANAL_MENOR_MIN = 48 * 60
/** Un menor no hace más de 8 h al día (art. 34.3 ET). */
export const MENOR_MAX_MIN = 8 * 60

/**
 * El hueco más largo sin trabajar en la semana, que se repite: del fin de una
 * jornada al inicio de la siguiente, domingo a lunes incluido. `dias[d]` son
 * los bloques de ese día (minutos desde su medianoche, pueden pasar de 1440).
 * `null` si no trabaja ningún día. Una sola cuenta para el reparto y para la
 * revisión: si cada uno midiera a su manera, el cuadrante saldría con lo que
 * su propia revisión marca como ilegal (ronda 6, M3).
 */
export function mayorDescansoSemanalMin(dias: readonly (readonly { startMin: number; endMin: number }[] | undefined)[]): number | null {
  const suyos: { ini: number; fin: number }[] = []
  for (let d = 0; d < 7; d++) {
    const bs = dias[d]
    if (!bs || bs.length === 0) continue
    let ini = Number.POSITIVE_INFINITY
    let fin = Number.NEGATIVE_INFINITY
    for (const b of bs) {
      if (b.startMin < ini) ini = b.startMin
      if (b.endMin > fin) fin = b.endMin
    }
    suyos.push({ ini: d * 1440 + ini, fin: d * 1440 + fin })
  }
  if (suyos.length === 0) return null
  let mayor = 0
  for (let i = 0; i < suyos.length; i++) {
    const sig = i + 1 < suyos.length ? suyos[i + 1].ini : suyos[0].ini + 7 * 1440
    mayor = Math.max(mayor, sig - suyos[i].fin)
  }
  return mayor
}

/**
 * Si quien trabaja estos días es trabajador nocturno (3 h o más de noche en
 * al menos la mitad de sus días, el "normalmente" del art. 36.1 ET), su media
 * de minutos por día trabajado; si no lo es, `null`. Una sola cuenta para el
 * reparto y para la revisión (ronda 7, M4): antes el reparto solo miraba el
 * tope de 8 h jornada a jornada en las noches, y un office con noches de 8 h
 * y tardes de 9 salía con 8,3 h de media.
 */
export function mediaNocturnaMin(dias: readonly (readonly { startMin: number; endMin: number }[] | undefined)[]): number | null {
  let trabajados = 0
  let deNoche = 0
  let minutos = 0
  for (const bs of dias) {
    if (!bs || bs.length === 0) continue
    trabajados++
    if (minutosDeNocheBloques(bs) >= NOCTURNO_DESDE_MIN) deNoche++
    for (const b of bs) minutos += b.endMin - b.startMin
  }
  if (trabajados === 0 || deNoche * 2 < trabajados) return null
  return minutos / trabajados
}

/** ¿Cumple el tope de 8 h de media de un nocturno? Quien no es nocturno, siempre. */
export function mediaNocturnaOk(dias: readonly (readonly { startMin: number; endMin: number }[] | undefined)[]): boolean {
  const m = mediaNocturnaMin(dias)
  return m === null || m <= TOPE_NOCTURNO_MIN + 1e-9
}

/** El descanso semanal que pide quien hace este puesto. */
export function descansoSemanalPedidoMin(role: Role | undefined): number {
  return role?.menores ? DESCANSO_SEMANAL_MENOR_MIN : DESCANSO_SEMANAL_MIN
}

/**
 * Los ajustes con los que se reparte UN puesto (ronda 6, G2). Un puesto de
 * menores lleva sus límites como reglas duras, no como avisos: dos libranzas
 * seguidas aunque el local las tenga apagadas (sus dos días de descanso
 * ininterrumpidos) y nada por encima de 8 h al día. La noche se le quita en
 * `buildRoster`, antes de repartir.
 */
export function ajustesDelPuesto(settings: Settings, role: Role | undefined): Settings {
  if (!role?.menores) return settings
  return {
    ...settings,
    consecutiveDaysOff: true,
    maxShiftMinutes: Math.min(settings.maxShiftMinutes, MENOR_MAX_MIN),
    maxDailyMinutes: Math.min(topeDiarioMin(settings), MENOR_MAX_MIN),
    minShiftMinutes: Math.min(settings.minShiftMinutes, MENOR_MAX_MIN),
  }
}

/** ¿Este puesto es un mando, que va por horario y no por tramos? */
export function esMando(role: Role | undefined): boolean {
  return role?.kind === 'estructura'
}

/** Contratos activos, del más grande al más pequeño. */
function activeContracts(settings: Settings): ContractType[] {
  return settings.contracts.filter((c) => c.enabled).sort((a, b) => b.hours - a.hours)
}

/** Lo que el cuadrante necesita saber además de la curva. */
export interface ContextoCuadrante {
  /**
   * Horario en el que tiene que haber un mando, por zona, ya con la
   * preparación y el cierre. Sin él se deduce de la propia necesidad.
   */
  horarioDe?: (blockId: string) => OpeningHours
  /** Comensales de cada día de la semana tipo, para que se libre en los flojos. */
  comensalesPorDia?: number[]
}

// ─────────────────────────────────────────────────────────────
// Tramos de tiempo
// ─────────────────────────────────────────────────────────────

interface Run {
  startMin: number
  endMin: number
}

const snapDown = (m: number) => Math.floor(m / SLOT_MINUTES) * SLOT_MINUTES
const snapUp = (m: number) => Math.ceil(m / SLOT_MINUTES) * SLOT_MINUTES

/** Tramos contiguos en los que la necesidad llega a `layer`. */
function runsForLayer(need: number[], layer: number): Run[] {
  const runs: Run[] = []
  let start: number | null = null
  for (let s = 0; s < SLOTS_PER_DAY; s++) {
    const active = need[s] >= layer
    if (active && start === null) start = slotStartMin(s)
    if (!active && start !== null) {
      runs.push({ startMin: start, endMin: slotStartMin(s) })
      start = null
    }
  }
  if (start !== null) runs.push({ startMin: start, endMin: slotStartMin(SLOTS_PER_DAY) })
  return runs
}

/** Junta los tramos separados por menos de una hora: nadie sale y vuelve en 30 min. */
function juntarHuecosCortos(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of [...runs].sort((a, b) => a.startMin - b.startMin)) {
    const last = out[out.length - 1]
    if (last && r.startMin - last.endMin < SPLIT_GAP_MIN) last.endMin = Math.max(last.endMin, r.endMin)
    else out.push({ ...r })
  }
  return out
}

/**
 * Parte un tramo largo en relevos del mismo largo: el primero abre, el último
 * cierra y los de en medio se reparten. Si no caben justos se solapan, que es
 * lo que pasa de verdad en un cambio de turno. NUNCA se vuelven a juntar: un
 * relevo es de una persona distinta a la del turno del que sale.
 */
function relevos(run: Run, maxMin: number, minMin: number): Run[] {
  const len = run.endMin - run.startMin
  if (len <= maxMin) return [run]
  const r = Math.ceil(len / maxMin)
  const L = Math.min(maxMin, Math.max(minMin, snapUp(len / r)))
  const out: Run[] = []
  for (let k = 0; k < r; k++) {
    const start = k === r - 1 ? run.endMin - L : run.startMin + snapDown((k * (len - L)) / (r - 1))
    out.push({ startMin: start, endMin: start + L })
  }
  return out
}

/**
 * Los relevos de un tramo sin ninguna jornada nocturna de más de 8 h (ronda 5,
 * M2): si alguno de los relevos lleva 3 h de noche y pasa de 8 h, el tramo
 * entero se vuelve a partir con piezas de 8 h.
 */
function relevosLegales(run: Run, maxMin: number, minMin: number): Run[] {
  const out = relevos(run, maxMin, minMin)
  if (maxMin <= TOPE_NOCTURNO_MIN) return out
  const ilegal = out.some((r) => r.endMin - r.startMin > topeDeJornada([r], maxMin))
  return ilegal ? relevos(run, TOPE_NOCTURNO_MIN, Math.min(minMin, TOPE_NOCTURNO_MIN)) : out
}

/**
 * Alarga un tramo corto hasta el turno mínimo (revisión ronda 3, G3).
 *
 * Un refuerzo de 4 h para un pico de hora y media se alarga HACIA EL CIERRE:
 * primero hasta el final de su propia ventana, después hasta el final del
 * servicio de su zona (recoger, fregar, cerrar la cocina). Solo si aún falta,
 * entra antes, y nunca antes de que abra su zona. Antes se restaba del inicio,
 * y salían refuerzos que entraban dos horas antes de abrir y se iban en pleno
 * pico.
 *
 * Ronda 7 (M2 de cálculo): un tramo que acabaría de noche (después de las
 * 22:00) si se alarga hacia el cierre se alarga primero hacia DENTRO del
 * servicio, entrando antes, y solo después hacia el cierre. Y lo que aún falte va antes de abrir, nunca después del
 * cierre: un camarero de 21:30 a 01:30 en un local que cierra a las 00:30 no
 * tiene nada que hacer esa hora, y esas horas de noche lo volvían trabajador
 * nocturno (plus, sin horas extra y media de 8 h, art. 36 ET). Solo si no cabe
 * antes de las 06:00 sale más tarde.
 */
function rellenar(r: Run, minMin: number, ventana: Run, zona: Run = ventana): Run {
  const len = r.endMin - r.startMin
  if (len >= minMin) return r
  let falta = minMin - len
  let start = r.startMin
  let end = r.endMin
  const haciaElCierre = () => {
    for (const tope of [ventana.endMin, zona.endMin]) {
      const d = Math.max(0, Math.min(falta, tope - end))
      end += d
      falta -= d
    }
  }
  const haciaLaApertura = () => {
    for (const tope of [ventana.startMin, zona.startMin]) {
      const d = Math.max(0, Math.min(falta, start - tope))
      start -= d
      falta -= d
    }
  }
  // Si alargar hacia el cierre lo mete en la noche, primero hacia la apertura.
  if (r.endMin + falta > NOCHE_DESDE_MIN) {
    haciaLaApertura()
    haciaElCierre()
  } else {
    haciaElCierre()
    haciaLaApertura()
  }
  if (falta > 0) {
    const antes = Math.min(snapUp(falta), Math.max(0, start - GRID_START_MIN))
    start -= antes
    falta -= antes
  }
  if (falta > 0) end += snapUp(falta)
  return { startMin: start, endMin: end }
}

/**
 * Un turno de menores no pasa de las 22:00 (art. 6.2 ET, ronda 6, G2). Su
 * necesidad de noche ya se ha quitado antes de repartir, pero estirar un turno
 * corto hasta el mínimo lo podía llevar a la medianoche. Se adelanta lo que
 * sobre: cubre lo mismo de lo que pide, que acaba antes de las 22:00.
 *
 * Ronda 7 (m1): sin entrar antes de que abra su zona. Antes un office menor
 * salía de 19:00 a 22:00 ante una cena que abría a las 21:30: se iba justo
 * cuando empezaba el trabajo. Ahora el bloque se queda dentro de la zona,
 * aunque salga más corto que el turno mínimo, y si dentro no llega a una hora
 * no se pone: esa media hora suelta antes de las 22:00 no la hace un menor.
 */
function sinNocheParaMenores(blocks: Run[], zonas: Run[] = []): Run[] {
  const out: Run[] = []
  for (const b of blocks) {
    let r = b
    if (r.endMin > NOCHE_DESDE_MIN) {
      const sobra = r.endMin - NOCHE_DESDE_MIN
      const zona = zonas.find((z) => z.startMin < NOCHE_DESDE_MIN && z.endMin > Math.max(b.startMin, NOCHE_DESDE_MIN - 60))
      const suelo = zona ? Math.min(zona.startMin, b.startMin) : Number.NEGATIVE_INFINITY
      r = { startMin: Math.max(suelo, r.startMin - sobra), endMin: NOCHE_DESDE_MIN }
      if (r.endMin - r.startMin < 60) continue
    }
    const prev = out[out.length - 1]
    if (prev && r.startMin < prev.endMin) r = { startMin: prev.endMin, endMin: r.endMin }
    if (r.endMin > r.startMin) out.push(r)
  }
  return out
}

/** Las ventanas de una zona en un día: lo que pide cualquiera de sus puestos de volumen. */
function ventanasDeZona(grid: NeedGrid, model: StaffingModel, blockId: string, d: number): Run[] {
  const total = new Array<number>(SLOTS_PER_DAY).fill(0)
  for (const r of model.roles) {
    if (r.blockId !== blockId || esMando(r)) continue
    const g = grid[r.id]?.[d]
    if (g) for (let s = 0; s < SLOTS_PER_DAY; s++) total[s] += g[s]
  }
  return juntarHuecosCortos(runsForLayer(total, 1))
}

/** La ventana de la zona que contiene (o toca) un tramo. */
function zonaDe(r: Run, zonas: Run[], defecto: Run): Run {
  return (
    zonas.find((z) => r.startMin >= z.startMin && r.endMin <= z.endMin) ??
    zonas.find((z) => r.startMin < z.endMin && r.endMin > z.startMin) ??
    defecto
  )
}

/** Nombre del turno tipo, como lo diría un encargado. */
function nombreTurno(r: Run, finDelDia: number): string {
  const medio = (r.startMin + r.endMin) / 2
  if (r.endMin >= finDelDia && medio >= 15 * 60) return 'Cierre'
  return medio < 15 * 60 ? 'Mañana' : 'Tarde'
}

// ─────────────────────────────────────────────────────────────
// Turnos de volumen
// ─────────────────────────────────────────────────────────────

/** Un turno pendiente de asignar a una persona. */
interface PendingShift {
  roleId: string
  day: DayIndex
  blocks: Run[]
  hours: number
  /** Nombre del turno tipo. */
  tipo: string
  /** El turno tipo exacto (entrada y salida), para que cada persona repita el suyo. */
  clave: string
}

interface Candidato {
  run: Run
  s0: number
  s1: number
  tipo: string
}

/**
 * Descompone la necesidad de los puestos de volumen en turnos sin asignar.
 *
 * Por cada puesto y día se monta la lista de turnos tipo posibles: los relevos
 * que cubren cada ventana del día (el servicio entero si cabe en un turno, la
 * mañana y el cierre si no) y los refuerzos de los picos, todos de al menos el
 * turno mínimo y como mucho el turno más largo y el tope diario. Después se van
 * eligiendo, uno a uno, el que más necesidad pendiente cubre por hora pagada,
 * hasta cubrirla entera. A igualdad, el más largo: menos turnos son menos
 * personas. Los mismos horarios se repiten de un día a otro porque salen de las
 * mismas ventanas, y eso es lo que hace que el cuadrante se pueda seguir.
 */
export function buildPendingShifts(grid: NeedGrid, model: StaffingModel, settings: Settings): PendingShift[] {
  const pending: PendingShift[] = []
  const tope = Math.min(settings.maxShiftMinutes, topeDiarioMin(settings))
  const minimo = Math.min(settings.minShiftMinutes, tope)

  for (const role of model.roles) {
    if (esMando(role)) continue
    const roleGrid = grid[role.id]
    if (!roleGrid) continue
    for (let d = 0; d < 7; d++) {
      const need = roleGrid[d]
      if (!need.some((v) => v > 0)) continue
      const ventanas = juntarHuecosCortos(runsForLayer(need, 1))
      const finDelDia = ventanas[ventanas.length - 1].endMin
      const zonas = ventanasDeZona(grid, model, role.blockId, d)
      for (const crudo of cubrir(need, ventanas, tope, minimo, zonas)) {
        const run = role.menores ? sinNocheParaMenores([crudo], zonas)[0] : crudo
        if (!run) continue
        pending.push({
          roleId: role.id,
          day: d as DayIndex,
          blocks: [run],
          hours: (run.endMin - run.startMin) / 60,
          tipo: nombreTurno(run, finDelDia),
          clave: `${run.startMin}-${run.endMin}`,
        })
      }
    }
  }
  return pending
}

/**
 * Cubre la necesidad de un día con turnos continuos de entre `minMin` y
 * `maxMin`, sin salirse de `ventanas` salvo para llegar al turno mínimo.
 *
 * Se monta la lista de turnos posibles: los relevos que cubren cada ventana
 * (el servicio entero si cabe en un turno, la mañana y el cierre si no) y los
 * refuerzos de los picos. Después se van eligiendo, uno a uno, el que más
 * necesidad pendiente cubre por hora pagada, hasta cubrirla entera. A
 * igualdad, el más largo: menos turnos son menos personas. Los mismos horarios
 * se repiten de un día a otro porque salen de las mismas ventanas, y eso es lo
 * que hace que el cuadrante se pueda seguir.
 */
function cubrir(need: number[], ventanas: Run[], maxMin: number, minMin: number, zonas: Run[] = ventanas): Run[] {
  const dentro = (s: number) => {
    const m = slotStartMin(s)
    return ventanas.some((v) => m >= v.startMin && m < v.endMin)
  }
  const pendiente = need.map((v, s) => (v > 0 && dentro(s) ? v : 0))
  let maxLayer = 0
  for (const v of pendiente) if (v > maxLayer) maxLayer = v
  if (maxLayer <= 0) return []
  const ventanaDe = (r: Run) =>
    ventanas.find((v) => r.startMin >= v.startMin && r.endMin <= v.endMin) ?? ventanas[0]

  const candidatos: Candidato[] = []
  const vistos = new Set<string>()
  const anadir = (r: Run, ventana: Run) => {
    const run = rellenar(r, minMin, ventana, zonaDe(r, zonas, ventana))
    const clave = `${run.startMin}-${run.endMin}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    candidatos.push({
      run,
      s0: (run.startMin - slotStartMin(0)) / SLOT_MINUTES,
      s1: (run.endMin - slotStartMin(0)) / SLOT_MINUTES,
      tipo: '',
    })
  }
  for (const v of ventanas) for (const r of relevosLegales(v, maxMin, minMin)) anadir(r, v)
  for (let layer = 2; layer <= maxLayer; layer++) {
    for (const run of runsForLayer(pendiente, layer)) {
      const v = ventanaDe(run)
      for (const r of relevosLegales(run, maxMin, minMin)) anadir(r, v)
    }
  }

  const out: Run[] = []
  let quedan = 0
  for (const v of pendiente) quedan += v
  while (quedan > 0) {
    let mejor: Candidato | null = null
    let mejorRend = 0
    let mejorLargo = 0
    for (const c of candidatos) {
      let cubre = 0
      const a = Math.max(0, c.s0)
      const b = Math.min(SLOTS_PER_DAY, c.s1)
      for (let s = a; s < b; s++) if (pendiente[s] > 0) cubre++
      if (cubre === 0) continue
      const largo = c.s1 - c.s0
      const rend = cubre / largo
      if (rend > mejorRend + 1e-9 || (Math.abs(rend - mejorRend) <= 1e-9 && largo > mejorLargo)) {
        mejor = c
        mejorRend = rend
        mejorLargo = largo
      }
    }
    if (!mejor) break
    for (let s = Math.max(0, mejor.s0); s < Math.min(SLOTS_PER_DAY, mejor.s1); s++) {
      if (pendiente[s] > 0) {
        pendiente[s]--
        quedan--
      }
    }
    out.push({ ...mejor.run })
  }
  return out
}

/** Bloque más corto de una jornada partida: nadie viene tres cuartos de hora a la comida. */
const MIN_BLOQUE_PARTIDA_MIN = 3 * 60

/**
 * Las jornadas de un puesto en un día de dos servicios, ya hechas: cada
 * persona del día hace un turno continuo o una partida (comida y cena) de
 * como mucho el tope diario.
 *
 * Es la diferencia con montar primero los turnos y juntarlos después: si la
 * comida entera son 5,5 h y la cena otras 5,5, juntarlas da 11 h y no cabe en
 * las 9 h de ley, así que cada servicio acababa siendo una persona distinta y
 * el día pedía el doble de gente. Un encargado no lo hace así: parte el
 * servicio en piezas más cortas (uno entra a las 12:00 y otro a las 13:30) y
 * empareja cada pieza de la comida con una de la cena para que todos hagan su
 * jornada. Aquí se prueba con varios largos de pieza en cada servicio, se
 * emparejan comida y cena con el máximo de parejas posible, y se queda la
 * combinación que pide menos personas ese día y, a igualdad, menos horas.
 *
 * Devuelve null si el día no tiene dos servicios separados.
 */
function jornadasDelDia(
  need: number[],
  tope: number,
  minimo: number,
  maxBloque: number,
  conDescanso: boolean,
  zonas: Run[],
): Run[][] | null {
  const ventanas = juntarHuecosCortos(runsForLayer(need, 1))
  if (ventanas.length < 2) return null
  // Los dos servicios se separan por el hueco más largo del día.
  let corte = 1
  let hueco = -1
  for (let i = 1; i < ventanas.length; i++) {
    const g = ventanas[i].startMin - ventanas[i - 1].endMin
    if (g > hueco) {
      hueco = g
      corte = i
    }
  }
  const primero = ventanas.slice(0, corte)
  const segundo = ventanas.slice(corte)
  const bloqueMin = Math.min(minimo, MIN_BLOQUE_PARTIDA_MIN)
  const largos: number[] = []
  // De hora y media en hora y media: más fino no quitó a nadie en las pruebas y
  // costaba el doble, y esto se rehace con cada tecla.
  for (let L = Math.min(maxBloque, tope); L >= bloqueMin; L -= 90) largos.push(L)
  if (largos[largos.length - 1] !== bloqueMin) largos.push(bloqueMin)

  const opcionesA = largos.map((L) => cubrir(need, primero, L, bloqueMin, zonas))
  const opcionesB = largos.map((L) => cubrir(need, segundo, L, bloqueMin, zonas))
  const vistosA = new Set<string>()
  const vistosB = new Set<string>()
  const clave = (rs: Run[]) => rs.map((r) => `${r.startMin}-${r.endMin}`).join(',')

  // Una jornada que va de la entrada a la salida más de 12 h no se puede
  // repetir al día siguiente sin romper el descanso: quien cierra a las 00:30
  // no abre a las 12:00. Se prueba también a emparejar sin ellas, y a igualdad
  // de personas se prefiere la combinación que tenga menos.
  const arcoRepetible = 1440 - MIN_REST_MIN
  const largas = (js: Run[][]) =>
    conDescanso ? js.filter((j) => j[j.length - 1].endMin - j[0].startMin > arcoRepetible).length : 0

  let mejor: Run[][] | null = null
  let mejorPersonas = Number.POSITIVE_INFINITY
  let mejorLargas = Number.POSITIVE_INFINITY
  let mejorMin = Number.POSITIVE_INFINITY
  for (const A of opcionesA) {
    const ka = clave(A)
    if (vistosA.has(ka)) continue
    vistosA.add(ka)
    vistosB.clear()
    for (const B of opcionesB) {
      const kb = clave(B)
      if (vistosB.has(kb)) continue
      vistosB.add(kb)
      const arcos = conDescanso ? [arcoRepetible, MAX_ARCO_PARTIDA_MIN] : [MAX_ARCO_PARTIDA_MIN]
      for (const arco of arcos) {
        const jornadas = emparejarServicios(A, B, tope, minimo, primero, segundo, arco, zonas)
        const personas = jornadas.length
        const nLargas = largas(jornadas)
        const min = jornadas.reduce((a, j) => a + j.reduce((x, b) => x + b.endMin - b.startMin, 0), 0)
        if (
          personas < mejorPersonas ||
          (personas === mejorPersonas &&
            (nLargas < mejorLargas || (nLargas === mejorLargas && min < mejorMin)))
        ) {
          mejor = jornadas
          mejorPersonas = personas
          mejorLargas = nLargas
          mejorMin = min
        }
      }
    }
  }
  return mejor
}

/**
 * Empareja piezas de la comida con piezas de la cena en jornadas partidas,
 * con el máximo de parejas posible (emparejamiento por caminos de aumento).
 * Una pareja vale si hay al menos una hora de hueco, no pasa del tope diario
 * ni de 13 h de la entrada a la salida. Lo que se queda sin pareja es un turno
 * continuo, alargado hasta el turno mínimo.
 */
function emparejarServicios(
  A: Run[],
  B: Run[],
  tope: number,
  minimo: number,
  va: Run[],
  vb: Run[],
  maxArco: number,
  zonas: Run[],
): Run[][] {
  const vale = (a: Run, b: Run) =>
    b.startMin - a.endMin >= SPLIT_GAP_MIN &&
    a.endMin - a.startMin + (b.endMin - b.startMin) <= topeDeJornada([a, b], tope) &&
    b.endMin - a.startMin <= maxArco
  // Las piezas largas primero: son las que más cuesta colocar.
  const ordenA = A.map((_, i) => i).sort((x, y) => A[y].endMin - A[y].startMin - (A[x].endMin - A[x].startMin))
  const parejaB = new Array<number>(B.length).fill(-1)
  const aumentar = (i: number, visto: boolean[]): boolean => {
    for (let j = 0; j < B.length; j++) {
      if (visto[j] || !vale(A[i], B[j])) continue
      visto[j] = true
      if (parejaB[j] < 0 || aumentar(parejaB[j], visto)) {
        parejaB[j] = i
        return true
      }
    }
    return false
  }
  for (const i of ordenA) aumentar(i, new Array<boolean>(B.length).fill(false))
  const parejaA = new Array<number>(A.length).fill(-1)
  parejaB.forEach((i, j) => {
    if (i >= 0) parejaA[i] = j
  })
  const ventanaDe = (r: Run, vs: Run[]) =>
    vs.find((v) => r.startMin >= v.startMin && r.endMin <= v.endMin) ?? vs[0]
  const out: Run[][] = []
  A.forEach((a, i) => {
    if (parejaA[i] >= 0) out.push([{ ...a }, { ...B[parejaA[i]] }])
    else out.push([rellenar(a, minimo, ventanaDe(a, va), zonaDe(a, zonas, ventanaDe(a, va)))])
  })
  B.forEach((b, j) => {
    if (parejaB[j] < 0) out.push([rellenar(b, minimo, ventanaDe(b, vb), zonaDe(b, zonas, ventanaDe(b, vb)))])
  })
  return out
}

/**
 * Los turnos de los puestos de volumen ya hechos jornada a jornada: en los
 * días de dos servicios, partidas emparejadas por `jornadasDelDia`; en los de
 * horario seguido, los relevos de siempre.
 */
export function buildJornadas(grid: NeedGrid, model: StaffingModel, settings: Settings, soloRol?: string): PendingShift[] {
  const out: PendingShift[] = []
  const topeDia = topeDiarioMin(settings)
  const maxBloque = Math.min(settings.maxShiftMinutes, topeDia)
  const minimo = Math.min(settings.minShiftMinutes, maxBloque)
  for (const role of model.roles) {
    if (esMando(role)) continue
    if (soloRol && role.id !== soloRol) continue
    const roleGrid = grid[role.id]
    if (!roleGrid) continue
    for (let d = 0; d < 7; d++) {
      const need = roleGrid[d]
      if (!need.some((v) => v > 0)) continue
      const ventanas = juntarHuecosCortos(runsForLayer(need, 1))
      const finDelDia = ventanas[ventanas.length - 1].endMin
      const zonas = ventanasDeZona(grid, model, role.blockId, d)
      const jornadas =
        jornadasDelDia(need, topeDia, minimo, maxBloque, settings.minRestBetweenShifts, zonas) ??
        cubrir(need, ventanas, maxBloque, minimo, zonas).map((r) => [r])
      for (const crudos of jornadas) {
        const blocks = role.menores ? sinNocheParaMenores(crudos, zonas) : crudos
        if (blocks.length === 0) continue
        const minutos = blocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
        out.push({
          roleId: role.id,
          day: d as DayIndex,
          blocks,
          hours: minutos / 60,
          tipo: blocks.length > 1 ? 'Partido' : nombreTurno(blocks[0], finDelDia),
          clave: blocks.map((x) => `${x.startMin}-${x.endMin}`).join('+'),
        })
      }
    }
  }
  return out
}

/**
 * Junta en jornadas partidas los turnos de un mismo día que tienen un hueco
 * real entre ellos (la comida y la cena), del más largo con el más largo. Solo
 * se usa en la variante con partida de cada puesto, que se queda únicamente si
 * ahorra gente. Dos piezas pegadas o solapadas (un relevo y el turno del que
 * sale) no tienen hueco, así que no se juntan nunca.
 */
function emparejarPartidas(pend: PendingShift[], topeDia: number): PendingShift[] {
  const out: PendingShift[] = []
  const porDia = new Map<number, PendingShift[]>()
  for (const p of pend) {
    const lista = porDia.get(p.day)
    if (lista) lista.push(p)
    else porDia.set(p.day, [p])
  }
  for (const lista of porDia.values()) {
    const libres = [...lista].sort((a, b) => b.hours - a.hours)
    while (libres.length) {
      const a = libres.shift() as PendingShift
      const ra = a.blocks[0]
      let j = -1
      for (let k = 0; k < libres.length; k++) {
        const rb = libres[k].blocks[0]
        const gap = rb.startMin >= ra.endMin ? rb.startMin - ra.endMin : ra.startMin - rb.endMin
        if (gap < SPLIT_GAP_MIN) continue
        if ((a.hours + libres[k].hours) * 60 > topeDeJornada([ra, rb], topeDia)) continue
        if (Math.max(ra.endMin, rb.endMin) - Math.min(ra.startMin, rb.startMin) > MAX_ARCO_PARTIDA_MIN) continue
        j = k
        break
      }
      if (j < 0) {
        out.push(a)
        continue
      }
      const b = libres.splice(j, 1)[0]
      const blocks = [...a.blocks, ...b.blocks].sort((x, y) => x.startMin - y.startMin)
      out.push({
        roleId: a.roleId,
        day: a.day,
        blocks,
        hours: a.hours + b.hours,
        tipo: 'Partido',
        clave: blocks.map((x) => `${x.startMin}-${x.endMin}`).join('+'),
      })
    }
  }
  return out
}

/**
 * Pares de días libres consecutivos. Lunes-martes primero porque son los días
 * flojos de la mayoría de restaurantes; el fin de semana es el último recurso.
 */
const DAY_OFF_PAIRS: DayIndex[][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [6, 0],
  [4, 5],
  [5, 6],
]

/** ¿Le quedan dos días libres seguidos si además trabaja `extra`? */
function libranzaSeguidaOk(days: Set<DayIndex>, extra: DayIndex): boolean {
  return DAY_OFF_PAIRS.some((pair) => pair[0] !== extra && pair[1] !== extra && !days.has(pair[0]) && !days.has(pair[1]))
}

// ─────────────────────────────────────────────────────────────
// Reparto por libranzas: como lo monta un encargado
// ─────────────────────────────────────────────────────────────

const TODA_LA_SEMANA = 0b1111111
const bit = (d: number) => 1 << d

/** Semanas de cinco días con las dos libranzas seguidas, una por cada par de `DAY_OFF_PAIRS`. */
const SEMANAS_COMPLETAS = DAY_OFF_PAIRS.map((par) => TODA_LA_SEMANA & ~bit(par[0]) & ~bit(par[1]))

/**
 * Los días que puede hacer un parcial de `n` días: seguidos, y antes los que
 * caen en fin de semana. Un parcial con sentido es "viernes, sábado y
 * domingo", no "el jueves".
 */
function semanasParciales(n: number, fuerza: number[], dem?: number[]): number[] {
  const out: { mask: number; peso: number; vacios: number }[] = []
  for (let inicio = 0; inicio < 7; inicio++) {
    let mask = 0
    let peso = 0
    let vacios = 0
    for (let k = 0; k < n; k++) {
      const d = (inicio + k) % 7
      mask |= bit(d)
      peso += fuerza[d]
      if (dem && dem[d] === 0) vacios++
    }
    out.push({ mask, peso, vacios })
  }
  const unaPersonaAlDia = !!dem && Math.max(...dem) <= 1
  // Las tres de más peso: el fin de semana y sus vecinas. Probar las siete
  // multiplicaba el tiempo y nunca salía mejor una de entre semana.
  //
  // Salvo en un puesto que hace UNA sola persona cada día (revisión ronda 3,
  // G2): ahí el parcial estaría solo, al frente, y el de jornada completa
  // libraría los días fuertes. Es el responsable de sala librando viernes y
  // sábado con un parcial de 16 h a cargo. En ese puesto el parcial va a los
  // días flojos y el completo se queda los fuertes.
  return out
    .sort((a, b) => (unaPersonaAlDia ? a.vacios - b.vacios || a.peso - b.peso : b.peso - a.peso))
    .slice(0, 3)
    .map((x) => x.mask)
}

/** Por encima de esta gente en un puesto, el reparto por libranzas no se intenta. */
const MAX_PERSONAS_POR_LIBRANZAS = 16

/** Soluciones de libranzas que se prueban como mucho antes de rendirse con un número de personas. */
const MAX_SOLUCIONES = 8

/**
 * Las personas que piden unas jornadas como poco: la gente del día más
 * cargado, las jornadas entre cinco días por persona y las horas entre la
 * jornada completa.
 */
function suelo(pend: PendingShift[], capHoras: number): number {
  const dem = new Array<number>(7).fill(0)
  let horas = 0
  for (const p of pend) {
    dem[p.day]++
    horas += p.hours
  }
  return Math.max(...dem, Math.ceil(pend.length / 5), Math.ceil(horas / capHoras - 1e-9))
}

/**
 * Reparte las jornadas de UN puesto como lo haría un encargado con papel y
 * lápiz: primero decide cuántas personas y qué dos días libra cada una, de
 * forma que cada día trabaje al menos la gente que ese día pide, y después
 * reparte las jornadas de cada día entre quien trabaja.
 *
 * El reparto voraz de `empaquetar` mete turnos uno a uno y deja cola: alguien
 * con un sábado suelto de 4 h porque en ese momento no cabía en nadie. Aquí la
 * cuenta va al revés. Si las jornadas de la semana no salen justas entre cinco
 * días por persona, lo que sobra lo hace UN parcial, y sus días van seguidos y
 * en el fin de semana si se puede (viernes, sábado y domingo), que es un
 * contrato que existe. Si ni así cuadra, todos completos con alguna libranza
 * de más.
 *
 * Respeta lo mismo que el reparto voraz: un día de trabajo por persona, dos
 * libranzas seguidas, las 12 h de descanso (domingo contra lunes incluido,
 * porque la semana se repite) y la jornada más grande activa. Si no encuentra
 * cómo, devuelve null y se queda el reparto voraz.
 */
export function repartirPorLibranzas(
  pend: PendingShift[],
  role: Role | undefined,
  settings: Settings,
  capHoras: number,
  fuerza: number[],
): { people: Person[]; shifts: Shift[] } | null {
  if (!settings.consecutiveDaysOff || pend.length === 0) return null
  const porDia: PendingShift[][] = Array.from({ length: 7 }, () => [])
  for (const p of pend) porDia[p.day].push(p)
  for (const lista of porDia) lista.sort((a, b) => b.hours - a.hours)
  const dem = porDia.map((l) => l.length)
  const total = pend.length
  const k0 = suelo(pend, capHoras)
  if (k0 > MAX_PERSONAS_POR_LIBRANZAS) return null

  // Las semanas completas, de la que libra en los días más flojos a la que libra en los fuertes.
  const completas = [...SEMANAS_COMPLETAS].sort((a, b) => {
    const libre = (m: number) => [0, 1, 2, 3, 4, 5, 6].reduce((acc, d) => acc + (m & bit(d) ? 0 : fuerza[d]), 0)
    return libre(a) - libre(b)
  })

  for (let k = k0; k <= k0 + 2 && k <= MAX_PERSONAS_POR_LIBRANZAS; k++) {
    // Primero con un parcial de dos a cuatro días seguidos que se lleve el
    // resto; después, todos completos; y solo al final un parcial de un día
    // suelto, que es justo lo que se quiere evitar.
    const configs: { parcial: number | null }[] = []
    const resto = Math.max(1, total - 5 * (k - 1))
    for (let n = Math.max(2, resto); n <= 4; n++) for (const m of semanasParciales(n, fuerza, dem)) configs.push({ parcial: m })
    configs.push({ parcial: null })
    if (resto === 1) for (const m of semanasParciales(1, fuerza, dem)) configs.push({ parcial: m })

    for (const { parcial } of configs) {
      const nCompletas = parcial === null ? k : k - 1
      const base = dem.map((v, d) => v - (parcial !== null && parcial & bit(d) ? 1 : 0))
      let probadas = 0
      const elegidas: number[] = []
      let resultado: { people: Person[]; shifts: Shift[] } | null = null

      // Búsqueda en profundidad de cuántos libran cada par de días.
      const buscar = (i: number, quedan: number, cobertura: number[]): boolean => {
        if (probadas >= MAX_SOLUCIONES) return true
        if (quedan === 0) {
          if (cobertura.some((c, d) => c < base[d])) return false
          probadas++
          const semanas = parcial === null ? [...elegidas] : [...elegidas, parcial]
          resultado = asignarJornadas(porDia, semanas, role, settings, capHoras)
          return resultado !== null
        }
        if (i >= completas.length) return false
        for (let d = 0; d < 7; d++) if (cobertura[d] + quedan < base[d]) return false
        for (let n = quedan; n >= 0; n--) {
          for (let x = 0; x < n; x++) elegidas.push(completas[i])
          const cob = cobertura.map((c, d) => c + (completas[i] & bit(d) ? n : 0))
          const ok = buscar(i + 1, quedan - n, cob)
          for (let x = 0; x < n; x++) elegidas.pop()
          if (ok) return true
        }
        return false
      }
      buscar(0, nCompletas, new Array<number>(7).fill(0))
      if (resultado) return resultado
    }
  }
  return null
}

/**
 * Con las semanas de cada persona ya decididas, reparte las jornadas de cada
 * día entre quien trabaja ese día. Por emparejamiento, para no dejar una
 * jornada sin nadie si existe una forma de colocarlas todas; y dentro de eso,
 * a quien ya hace ese mismo turno (para que cada uno repita su horario) y a
 * quien menos horas lleva. Los días más cargados se reparten primero.
 */
/** Dos turnos que entran con esta diferencia o menos son de la misma familia. */
const MISMA_FAMILIA_MIN = 90
/** Diferencia de horas que se admite al cambiar dos jornadas para que cada uno repita su franja. */
const CAMBIO_FAMILIA_MAX_H = 2

/**
 * Turnos estables (revisión ronda 3, G4): con la plantilla, los días y las
 * jornadas de cada día ya decididos, intercambia jornadas del MISMO día entre
 * dos personas del mismo puesto si así cada una repite más su familia de
 * turno (mañana, tarde, noche: entrar más o menos a la misma hora). Solo
 * entre jornadas de las mismas horas, así que no cambia cuánta gente hay, ni
 * quién libra, ni lo que se cubre, ni las horas ni el contrato de nadie: solo
 * quién hace qué jornada. Respeta las 12 h entre jornadas.
 *
 * Antes salía el mismo responsable de noche el lunes, de mañana el sábado y
 * de tarde el domingo, con otros tres haciendo lo mismo al revés.
 */
function estabilizarFamilias(shifts: Shift[], settings: Settings, capHoras: number): void {
  const porPersona = new Map<string, (Shift | undefined)[]>()
  const horas = new Map<string, number>()
  for (const sh of shifts) {
    if (!porPersona.has(sh.personId)) porPersona.set(sh.personId, new Array<Shift | undefined>(7).fill(undefined))
    ;(porPersona.get(sh.personId) as (Shift | undefined)[])[sh.day] = sh
    horas.set(sh.personId, (horas.get(sh.personId) ?? 0) + sh.hours)
  }
  const ini = (sh: { blocks: Run[] }) => sh.blocks[0].startMin
  const fin = (sh: { blocks: Run[] }) => sh.blocks[sh.blocks.length - 1].endMin
  const afinidad = (semana: (Shift | undefined)[], d: number, sh: { blocks: Run[] }) => {
    let n = 0
    for (let e = 0; e < 7; e++) {
      const o = semana[e]
      if (e !== d && o && Math.abs(ini(o) - ini(sh)) <= MISMA_FAMILIA_MIN) n++
    }
    return n
  }
  const descansoOk = (semana: (Shift | undefined)[], d: number, sh: { blocks: Run[] }) => {
    if (!settings.minRestBetweenShifts) return true
    const antes = semana[(d + 6) % 7]
    if (antes && 1440 + ini(sh) - fin(antes) < MIN_REST_MIN) return false
    const despues = semana[(d + 1) % 7]
    if (despues && 1440 + ini(despues) - fin(sh) < MIN_REST_MIN) return false
    return true
  }
  const ids = [...porPersona.keys()]
  // Se cambian tramos de 1 a 3 días seguidos (ronda 5, M7): un día suelto
  // casi nunca se puede cambiar de noche a mañana sin romper las 12 h con el
  // día de al lado, y el tramo entero sí, porque viaja con su descanso.
  const cambiar = (a: Shift, b: Shift) => {
    const tmp = { blocks: a.blocks, hours: a.hours, tipo: a.tipo }
    a.blocks = b.blocks
    a.hours = b.hours
    a.tipo = b.tipo
    b.blocks = tmp.blocks
    b.hours = tmp.hours
    b.tipo = tmp.tipo
  }
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let mejora = false
    for (let largo = 1; largo <= 3; largo++) {
      for (let d = 0; d < 7; d++) {
        const dias = Array.from({ length: largo }, (_, k) => (d + k) % 7)
        for (let x = 0; x < ids.length; x++) {
          for (let y = x + 1; y < ids.length; y++) {
            const A = porPersona.get(ids[x]) as (Shift | undefined)[]
            const B = porPersona.get(ids[y]) as (Shift | undefined)[]
            const pares = dias.map((e) => [A[e], B[e]] as const)
            // Jornadas del mismo tipo (seguida con seguida, partida con
            // partida) y de horas parecidas: hasta dos horas de diferencia
            // entre las del tramo (ronda 5, M7). Con solo las de las mismas
            // horas, en un local abierto de 8 a 2 seguía habiendo quien
            // entraba de mañana, de tarde y de noche en la misma semana.
            if (pares.some(([a, b]) => !a || !b || a.blocks.length !== b.blocks.length)) continue
            if (pares.every(([a, b]) => ini(a!) === ini(b!) && fin(a!) === fin(b!))) continue
            const delta = pares.reduce((t, [a, b]) => t + b!.hours - a!.hours, 0)
            if (Math.abs(delta) > CAMBIO_FAMILIA_MAX_H + 1e-9) continue
            let antes = 0
            for (const [k, e] of dias.entries()) antes += afinidad(A, e, pares[k][0]!) + afinidad(B, e, pares[k][1]!)
            const hA = (horas.get(ids[x]) ?? 0) + delta
            const hB = (horas.get(ids[y]) ?? 0) - delta
            if (hA > capHoras + 1e-9 || hB > capHoras + 1e-9) continue
            // Y sin que suban los contratos: a 4 h o menos de la completa se
            // firma la completa, y el resto se redondea a la hora (como
            // `asignarContrato`). Cambiar de franja no puede costar dinero.
            if (delta !== 0) {
              const contrato = (h: number) => (Math.ceil(h - 1e-9) >= capHoras - 4 ? capHoras : Math.ceil(h - 1e-9))
              const hA0 = horas.get(ids[x]) ?? 0
              const hB0 = horas.get(ids[y]) ?? 0
              if (contrato(hA) + contrato(hB) > contrato(hA0) + contrato(hB0)) continue
            }
            const semanalAntes = settings.consecutiveDaysOff
              ? 0
              : Math.min(
                  mayorDescansoSemanalMin(A.map((sh) => sh?.blocks)) ?? Infinity,
                  mayorDescansoSemanalMin(B.map((sh) => sh?.blocks)) ?? Infinity,
                )
            for (const [a, b] of pares) cambiar(a!, b!)
            let despues = 0
            let vale = true
            // Con libranzas sueltas, el cambio no puede bajar a nadie del día
            // y medio de descanso seguido (ronda 6, M3).
            if (!settings.consecutiveDaysOff) {
              const semanalDespues = Math.min(
                mayorDescansoSemanalMin(A.map((sh) => sh?.blocks)) ?? Infinity,
                mayorDescansoSemanalMin(B.map((sh) => sh?.blocks)) ?? Infinity,
              )
              if (semanalDespues < Math.min(DESCANSO_SEMANAL_MIN, semanalAntes)) vale = false
            }
            // Ni deja a un nocturno por encima de 8 h de media (ronda 7, M4).
            if (!mediaNocturnaOk(A.map((sh) => sh?.blocks)) || !mediaNocturnaOk(B.map((sh) => sh?.blocks))) vale = false
            for (const [k, e] of dias.entries()) {
              despues += afinidad(A, e, pares[k][0]!) + afinidad(B, e, pares[k][1]!)
              if (!descansoOk(A, e, pares[k][0]!) || !descansoOk(B, e, pares[k][1]!)) vale = false
            }
            if (!vale || despues <= antes) {
              for (const [a, b] of pares) cambiar(a!, b!)
              continue
            }
            horas.set(ids[x], hA)
            horas.set(ids[y], hB)
            mejora = true
          }
        }
      }
    }
    if (!mejora) break
  }
}

/** Por debajo de estas horas a la semana, un parcial se pone en fin de semana. */
const PARCIAL_CORTO_H = 20

/**
 * Los parciales cortos, al fin de semana (ronda 4). Un contrato de menos de
 * 20 h tiene sentido si viene sábado y domingo, que es cuando hace falta
 * gente de más; uno de 11 h que viene el lunes y el sábado no lo firma nadie
 * y deja a un completo sin su fin de semana libre.
 *
 * Con la plantilla y los turnos ya puestos, cambia un día suyo de entre semana
 * por un sábado o un domingo de un compañero del mismo puesto que no trabaje
 * ese día de entre semana: los dos se quedan con el mismo número de jornadas,
 * nadie rompe las dos libranzas seguidas ni las 12 h, y el compañero no pasa
 * de la jornada completa. No cambia la plantilla ni lo que se cubre.
 *
 * No toca un puesto que hace UNA sola persona cada día: ahí el parcial va a
 * los días flojos a propósito, para que el de jornada completa esté los
 * fuertes (ronda 3, G2).
 */
function parcialesAlFinde(shifts: Shift[], settings: Settings, capHoras: number): void {
  const porDia = new Array<number>(7).fill(0)
  for (const sh of shifts) porDia[sh.day]++
  if (Math.max(...porDia) <= 1) return
  const semana = new Map<string, (Shift | undefined)[]>()
  const horas = new Map<string, number>()
  for (const sh of shifts) {
    if (!semana.has(sh.personId)) semana.set(sh.personId, new Array<Shift | undefined>(7).fill(undefined))
    ;(semana.get(sh.personId) as (Shift | undefined)[])[sh.day] = sh
    horas.set(sh.personId, (horas.get(sh.personId) ?? 0) + sh.hours)
  }
  const ini = (sh: Shift) => sh.blocks[0].startMin
  const fin = (sh: Shift) => sh.blocks[sh.blocks.length - 1].endMin
  const descansoOk = (w: (Shift | undefined)[]) => {
    if (!settings.minRestBetweenShifts) return true
    for (let d = 0; d < 7; d++) {
      const a = w[d]
      const b = w[(d + 1) % 7]
      if (a && b && 1440 + ini(b) - fin(a) < MIN_REST_MIN) return false
    }
    return true
  }
  const libranzaOk = (w: (Shift | undefined)[]) => {
    // Un cambio de días tampoco deja a un nocturno por encima de 8 h de media (ronda 7, M4).
    if (!mediaNocturnaOk(w.map((sh) => sh?.blocks))) return false
    const dias = w.filter(Boolean).length
    if (settings.consecutiveDaysOff) return DAY_OFF_PAIRS.some((par) => !w[par[0]] && !w[par[1]])
    if (dias > 6) return false
    // Con libranzas sueltas, el día y medio seguido de descanso (ronda 6, M3).
    const mayor = mayorDescansoSemanalMin(w.map((sh) => sh?.blocks))
    return mayor === null || mayor >= DESCANSO_SEMANAL_MIN
  }
  const finde = (w: (Shift | undefined)[]) => Number(!!w[5]) + Number(!!w[6])
  // Grupos de uno o dos días de una semana, para cambiarlos de una vez: a
  // veces cambiar un solo día deja al compañero sin sus libranzas seguidas, y
  // cambiar dos las arregla.
  const grupos = (w: (Shift | undefined)[]) => {
    const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => w[d])
    const out: number[][] = dias.map((d) => [d])
    for (let i = 0; i < dias.length; i++) for (let j = i + 1; j < dias.length; j++) out.push([dias[i], dias[j]])
    return out
  }
  const ids = [...semana.keys()]
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    let cambio = false
    for (const p of ids) {
      const P = semana.get(p) as (Shift | undefined)[]
      if ((horas.get(p) ?? 0) >= PARCIAL_CORTO_H || finde(P) === 2) continue
      buscar: for (const A of grupos(P)) {
        if (!A.some((d) => d < 5)) continue
        for (const q of ids) {
          if (q === p) continue
          const Q = semana.get(q) as (Shift | undefined)[]
          if (A.some((d) => Q[d])) continue
          for (const B of grupos(Q)) {
            if (B.length !== A.length || B.some((d) => P[d] && !A.includes(d))) continue
            const nP = [...P]
            const nQ = [...Q]
            for (const d of A) nP[d] = undefined
            for (const d of B) nQ[d] = undefined
            for (const d of B) nP[d] = Q[d]
            for (const d of A) nQ[d] = P[d]
            if (finde(nP) <= finde(P)) continue
            // Otro parcial corto no regala su fin de semana.
            if ((horas.get(q) ?? 0) < PARCIAL_CORTO_H && finde(nQ) < finde(Q)) continue
            const dA = A.reduce((acc, d) => acc + (P[d] as Shift).hours, 0)
            const dB = B.reduce((acc, d) => acc + (Q[d] as Shift).hours, 0)
            const hQ = (horas.get(q) ?? 0) - dB + dA
            if (hQ > capHoras + 1e-9) continue
            if (!libranzaOk(nP) || !libranzaOk(nQ) || !descansoOk(nP) || !descansoOk(nQ)) continue
            for (const d of A) (P[d] as Shift).personId = q
            for (const d of B) (Q[d] as Shift).personId = p
            semana.set(p, nP)
            semana.set(q, nQ)
            horas.set(p, (horas.get(p) ?? 0) - dA + dB)
            horas.set(q, hQ)
            cambio = true
            break buscar
          }
        }
      }
    }
    if (!cambio) break
  }
}

/**
 * Nadie de un solo día (revisión ronda 8, M2). Con la plantilla y los turnos
 * ya puestos, a quien le ha quedado UN día suelto se le pasa un día de un
 * compañero del mismo puesto que trabaja tres o más, mejor el de al lado de
 * su día (sábado y domingo antes que sábado y martes). No cambia la gente ni
 * lo que se cubre: solo quién hace qué jornada. Respeta las libranzas, las
 * 12 h, el descanso semanal, la media de los nocturnos y la jornada completa,
 * y el compañero no baja del contrato más pequeño.
 *
 * La ronda 2 dio esto por arreglado con sus casos de prueba, pero con
 * ficheros reales volvía: un cocinero de 10 h que solo venía el sábado.
 */
function sinDiaSuelto(shifts: Shift[], settings: Settings, capHoras: number, minContrato: number): void {
  const semana = new Map<string, (Shift | undefined)[]>()
  const horas = new Map<string, number>()
  for (const sh of shifts) {
    if (!semana.has(sh.personId)) semana.set(sh.personId, new Array<Shift | undefined>(7).fill(undefined))
    ;(semana.get(sh.personId) as (Shift | undefined)[])[sh.day] = sh
    horas.set(sh.personId, (horas.get(sh.personId) ?? 0) + sh.hours)
  }
  const ini = (sh: Shift) => sh.blocks[0].startMin
  const fin = (sh: Shift) => sh.blocks[sh.blocks.length - 1].endMin
  const descansoOk = (w: (Shift | undefined)[]) => {
    if (!settings.minRestBetweenShifts) return true
    for (let d = 0; d < 7; d++) {
      const a = w[d]
      const b = w[(d + 1) % 7]
      if (a && b && 1440 + ini(b) - fin(a) < MIN_REST_MIN) return false
    }
    return true
  }
  const libranzaOk = (w: (Shift | undefined)[]) => {
    if (!mediaNocturnaOk(w.map((sh) => sh?.blocks))) return false
    if (settings.consecutiveDaysOff) return DAY_OFF_PAIRS.some((par) => !w[par[0]] && !w[par[1]])
    if (w.filter(Boolean).length > 6) return false
    const mayor = mayorDescansoSemanalMin(w.map((sh) => sh?.blocks))
    return mayor === null || mayor >= DESCANSO_SEMANAL_MIN
  }
  const dias = (w: (Shift | undefined)[]) => w.filter(Boolean).length
  const ids = [...semana.keys()]
  for (const p of ids) {
    const P = semana.get(p) as (Shift | undefined)[]
    if (dias(P) !== 1) continue
    const suyo = P.findIndex(Boolean)
    let mejor: { q: string; d: number; clave: number[] } | null = null
    for (const q of ids) {
      if (q === p) continue
      const Q = semana.get(q) as (Shift | undefined)[]
      if (dias(Q) < 3) continue
      for (let d = 0; d < 7; d++) {
        const sh = Q[d]
        if (!sh || P[d]) continue
        const hQ = (horas.get(q) ?? 0) - sh.hours
        if (hQ < minContrato - 1e-9) continue
        if ((horas.get(p) ?? 0) + sh.hours > capHoras + 1e-9) continue
        const nP = [...P]
        const nQ = [...Q]
        nP[d] = sh
        nQ[d] = undefined
        if (!libranzaOk(nP) || !libranzaOk(nQ) || !descansoOk(nP) || !descansoOk(nQ)) continue
        const pegado = (d + 1) % 7 === suyo || (suyo + 1) % 7 === d ? 0 : 1
        // El día de al lado; después, de quien más horas lleva (que así se
        // queda más cerca de la jornada que firma el otro); y el turno más
        // parecido al suyo.
        const clave = [pegado, -(horas.get(q) ?? 0), Math.abs(sh.hours - (P[suyo] as Shift).hours)]
        if (!mejor || menorClave(clave, mejor.clave)) mejor = { q, d, clave }
      }
    }
    if (!mejor) continue
    const Q = semana.get(mejor.q) as (Shift | undefined)[]
    const sh = Q[mejor.d] as Shift
    sh.personId = p
    P[mejor.d] = sh
    Q[mejor.d] = undefined
    horas.set(p, (horas.get(p) ?? 0) + sh.hours)
    horas.set(mejor.q, (horas.get(mejor.q) ?? 0) - sh.hours)
  }
}

/** ¿Va antes `a` que `b`, comparando cifra a cifra? */
function menorClave(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - 1e-9) return true
    if (a[i] > b[i] + 1e-9) return false
  }
  return false
}

/** Lo más que pueden sumar las jornadas largas frente a los relevos de siempre (ronda 8, M4). */
const MAX_HORAS_JORNADAS_LARGAS = 1.3

/**
 * Las jornadas de un puesto de una o dos personas a la vez, como las monta un
 * encargado (revisión ronda 8, M4). Si el horario seguido del puesto es más
 * largo que el turno (de 12:00 a 01:00), en vez de partirlo en relevos de 6 h
 * y refuerzos de 4 h se hacen jornadas enteras (lo que da la semana completa
 * entre cinco días, 8 h con 40 h) que se cruzan en la hora fuerte: una que
 * abre y otra que cierra. La segunda persona que pide el pico ya está en ese
 * cruce, y lo que quede fuera se cubre como siempre.
 *
 * Solo para puestos que nunca piden más de dos a la vez (el responsable de
 * sala, el camarero de un local pequeño) y solo si algún día el horario
 * seguido no cabe en un turno. Devuelve null si no aplica. El reparto elige
 * esta variante solo si deja menos gente (o menos cola), y nunca si suma más
 * de un 20 % de horas.
 */
function jornadasLargas(
  grid: NeedGrid,
  model: StaffingModel,
  role: Role,
  settings: Settings,
  jornadaCompletaH: number,
): PendingShift[] | null {
  if (esMando(role)) return null
  const roleGrid = grid[role.id]
  if (!roleGrid) return null
  let maxNeed = 0
  for (const day of roleGrid) for (const v of day) if (v > maxNeed) maxNeed = v
  if (maxNeed <= 0 || maxNeed > 2) return null
  const tope = Math.min(settings.maxShiftMinutes, topeDiarioMin(settings))
  const minimo = Math.min(settings.minShiftMinutes, tope)
  // Lo que da la jornada completa entre cinco días: 8 h con 40 h.
  const jornadaDia = Math.min(tope, snapDown((jornadaCompletaH * 60) / 5))
  let aplica = false
  const out: PendingShift[] = []
  for (let d = 0; d < 7; d++) {
    const need = roleGrid[d]
    if (!need.some((v) => v > 0)) continue
    const ventanas = juntarHuecosCortos(runsForLayer(need, 1))
    const finDelDia = ventanas[ventanas.length - 1].endMin
    const zonas = ventanasDeZona(grid, model, role.blockId, d)
    const piezas: Run[] = []
    const cubierto = new Array<number>(SLOTS_PER_DAY).fill(0)
    for (const v of ventanas) {
      const W = v.endMin - v.startMin
      let trozos: Run[]
      if (W <= tope) {
        const entero = rellenar(v, minimo, v, zonaDe(v, zonas, v))
        // Un servicio de noche de más de 8 h se parte como siempre (ronda 5, M2).
        trozos = entero.endMin - entero.startMin > topeDeJornada([entero], tope) ? relevosLegales(v, tope, minimo) : [entero]
      } else {
        aplica = true
        const k = Math.ceil(W / tope)
        let L = Math.min(tope, Math.max(snapUp(W / k), jornadaDia))
        const colocar = (largo: number) =>
          Array.from({ length: k }, (_, i) => {
            const st = i === k - 1 ? v.endMin - largo : v.startMin + snapDown((i * (W - largo)) / Math.max(1, k - 1))
            return { startMin: st, endMin: st + largo }
          })
        trozos = colocar(L)
        // Ningún nocturno de más de 8 h (ronda 5, M2).
        if (trozos.some((r) => r.endMin - r.startMin > topeDeJornada([r], tope))) {
          L = Math.min(L, TOPE_NOCTURNO_MIN)
          trozos = k * L >= W ? colocar(L) : relevosLegales(v, tope, minimo)
        }
      }
      for (const r of trozos) {
        piezas.push(r)
        for (let m = r.startMin; m < r.endMin; m += SLOT_MINUTES) {
          const sl = (m - slotStartMin(0)) / SLOT_MINUTES
          if (sl >= 0 && sl < SLOTS_PER_DAY) cubierto[sl]++
        }
      }
    }
    const aPendiente = (run: Run): PendingShift => ({
      roleId: role.id,
      day: d as DayIndex,
      blocks: [run],
      hours: (run.endMin - run.startMin) / 60,
      tipo: nombreTurno(run, finDelDia),
      clave: `${run.startMin}-${run.endMin}`,
    })
    out.push(...piezas.map(aPendiente))
    // Lo que el cruce no cubre (la segunda persona fuera de la hora fuerte),
    // como siempre; y si es a la comida y a la cena, en una sola partida.
    const resto = need.map((v, sl) => Math.max(0, v - cubierto[sl]))
    if (resto.some((v) => v > 0)) {
      const vr = juntarHuecosCortos(runsForLayer(resto, 1))
      const extra = cubrir(resto, vr, tope, minimo, zonas).map(aPendiente)
      out.push(...(settings.allowSplitShifts ? emparejarPartidas(extra, tope) : extra))
    }
  }
  return aplica ? out : null
}

/**
 * Un puesto que pide menos horas a la semana que el contrato más pequeño no
 * da para un contrato (revisión ronda 8, M2): el ayudante de una cafetería
 * pedía 1,5 h y salía una persona de 10 h que venía un día a hacer 4. Sus
 * horas pasan al puesto de su zona que más horas pide (el camarero, el
 * cocinero), como el relevo del mando (`plegarRelevo`), y la revisión lo dice.
 *
 * No pasa a un puesto de menores (no puede hacer la noche) ni sale de un
 * puesto que se queda a recoger hacia uno que no (el cierre del office no lo
 * alarga un cocinero).
 */
function plegarPuestosPequenos(
  grid: NeedGrid,
  model: StaffingModel,
  minHoras: number,
): { grid: NeedGrid; plegados: { roleId: string; haciaRoleId: string; horas: number }[] } {
  const horas = (id: string) =>
    ((grid[id] ?? []).reduce((a, day) => a + day.reduce((x, v) => x + v, 0), 0) * SLOT_MINUTES) / 60
  const plegados: { roleId: string; haciaRoleId: string; horas: number }[] = []
  let out: NeedGrid = grid
  for (const role of model.roles) {
    if (esMando(role) || !grid[role.id]) continue
    const h = horas(role.id)
    if (h <= 0 || h >= minHoras) continue
    const destino = model.roles
      .filter(
        (r) =>
          r.id !== role.id &&
          r.blockId === role.blockId &&
          !esMando(r) &&
          !r.menores &&
          (!role.cierraServicio || r.cierraServicio) &&
          horas(r.id) >= minHoras,
      )
      .sort((a, b) => horas(b.id) - horas(a.id))[0]
    if (!destino) continue
    if (out === grid) out = { ...grid }
    const g = (out[destino.id] ?? grid[destino.id]).map((day) => [...day])
    const suyo = grid[role.id]
    for (let d = 0; d < 7; d++) for (let sl = 0; sl < SLOTS_PER_DAY; sl++) g[d][sl] += suyo[d][sl]
    out[destino.id] = g
    out[role.id] = suyo.map((day) => day.map(() => 0))
    plegados.push({ roleId: role.id, haciaRoleId: destino.id, horas: h })
  }
  return { grid: out, plegados }
}

function asignarJornadas(
  porDia: PendingShift[][],
  semanas: number[],
  role: Role | undefined,
  settings: Settings,
  capHoras: number,
): { people: Person[]; shifts: Shift[] } | null {
  const k = semanas.length
  const horas = new Array<number>(k).fill(0)
  const delDia: (PendingShift | null)[][] = Array.from({ length: k }, () => new Array<PendingShift | null>(7).fill(null))
  const claves: Map<string, number>[] = Array.from({ length: k }, () => new Map())
  const diasMask = semanas.map((m) => [0, 1, 2, 3, 4, 5, 6].filter((d) => m & bit(d)).length)

  const descansoOk = (i: number, d: number, p: PendingShift) => {
    if (!settings.minRestBetweenShifts) return true
    const ini = p.blocks[0].startMin
    const fin = p.blocks[p.blocks.length - 1].endMin
    const antes = delDia[i][(d + 6) % 7]
    if (antes && 1440 + ini - antes.blocks[antes.blocks.length - 1].endMin < MIN_REST_MIN) return false
    const despues = delDia[i][(d + 1) % 7]
    if (despues && 1440 + despues.blocks[0].startMin - fin < MIN_REST_MIN) return false
    return true
  }

  const orden = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => porDia[b].length - porDia[a].length || a - b)
  for (const d of orden) {
    const jornadas = porDia[d]
    if (jornadas.length === 0) continue
    const quien = semanas.map((_, i) => i).filter((i) => semanas[i] & bit(d))
    // Quien cierra tarde, mejor si al día siguiente libra (o entra tarde): si
    // no, puede que mañana no le quepa ninguna jornada sin romper las 12 h.
    const sig = (d + 1) % 7
    const ant = (d + 6) % 7
    const entradaMasTemprana = Math.min(...porDia[sig].map((p) => p.blocks[0].startMin), Number.POSITIVE_INFINITY)
    const salidaMasTardia = Math.max(
      ...porDia[ant].map((p) => p.blocks[p.blocks.length - 1].endMin),
      Number.NEGATIVE_INFINITY,
    )
    const riesgo = (i: number, j: PendingShift) => {
      if (!settings.minRestBetweenShifts) return 0
      let r = 0
      const fin = j.blocks[j.blocks.length - 1].endMin
      if (semanas[i] & bit(sig) && !delDia[i][sig] && 1440 + entradaMasTemprana - fin < MIN_REST_MIN) r++
      if (semanas[i] & bit(ant) && !delDia[i][ant] && 1440 + j.blocks[0].startMin - salidaMasTardia < MIN_REST_MIN) r++
      return r
    }
    const preferencia = (j: PendingShift) =>
      quien
        .filter((i) => horas[i] + j.hours <= capHoras + 1e-9 && descansoOk(i, d, j))
        .sort(
          (a, b) =>
            riesgo(a, j) - riesgo(b, j) ||
            // El parcial hace sus días: si sobra alguien un día, que sea uno
            // de los completos, que así libra uno más.
            diasMask[a] - diasMask[b] ||
            (claves[b].get(j.clave) ?? 0) - (claves[a].get(j.clave) ?? 0) ||
            horas[a] - horas[b],
        )
    const opciones = jornadas.map(preferencia)
    const deQuien = new Map<number, number>()
    const aumentar = (j: number, visto: Set<number>): boolean => {
      for (const i of opciones[j]) {
        if (visto.has(i)) continue
        visto.add(i)
        const otra = deQuien.get(i)
        if (otra === undefined || aumentar(otra, visto)) {
          deQuien.set(i, j)
          return true
        }
      }
      return false
    }
    for (let j = 0; j < jornadas.length; j++) if (!aumentar(j, new Set())) return null
    for (const [i, j] of deQuien) {
      const p = jornadas[j]
      delDia[i][d] = p
      horas[i] += p.hours
      claves[i].set(p.clave, (claves[i].get(p.clave) ?? 0) + 1)
    }
  }

  const people: Person[] = []
  const shifts: Shift[] = []
  let n = 0
  for (let i = 0; i < k; i++) {
    if (horas[i] <= 0) continue
    n++
    const roleId = porDia.flat()[0].roleId
    const person: Person = {
      id: `${roleId}-${n}`,
      label: `${role?.name ?? 'Puesto'} ${n}`,
      roleId,
      contractId: '',
      contractHours: capHoras,
      assignedHours: horas[i],
      daysOff: [],
    }
    people.push(person)
    for (let d = 0; d < 7; d++) {
      const p = delDia[i][d]
      if (!p) continue
      shifts.push({
        id: `${person.id}-${d}`,
        personId: person.id,
        roleId,
        day: d as DayIndex,
        blocks: p.blocks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
        hours: p.hours,
        tipo: p.tipo,
      })
    }
  }
  return { people, shifts }
}

/**
 * Cuánta gente de la cola se intenta vaciar con la cadena en cada vuelta.
 *
 * Tres es de sobra: la cadena desatasca al que menos horas tiene, y si ese no
 * se puede mover, el cuarto por abajo tampoco. Subirlo no quitó a nadie más en
 * las pruebas y multiplicaba el tiempo.
 */
const DONANTES_EN_CADENA = 3

/** Por encima de estos turnos de un puesto, una sola pasada por variante. */
const MAX_TURNOS_VARIAS_PASADAS = 120

/** ¿Algún día trabaja más de una persona de este puesto? */
function masDeUnoAlDia(slots: { days: Set<DayIndex> }[]): boolean {
  const porDia = new Array<number>(7).fill(0)
  for (const sl of slots) for (const d of sl.days) porDia[d]++
  return Math.max(...porDia) > 1
}

interface Slot {
  person: Person
  days: Set<DayIndex>
  /** Turnos tipo que ya hace, para que tienda a repetir el mismo. */
  claves: Map<string, number>
}

/**
 * Monta el cuadrante: los turnos de volumen en personas, y los mandos aparte.
 *
 * `contexto` es opcional para que el cálculo se pueda llamar con solo la curva
 * (el guion de verificación lo hace): sin él, el horario de los mandos se
 * deduce de la necesidad y los días flojos, también.
 */
export function buildRoster(
  grid: NeedGrid,
  model: StaffingModel,
  settingsDelLocal: Settings,
  contexto: ContextoCuadrante = {},
): Roster {
  /**
   * Los ajustes con los que se reparte. Son los del local salvo mientras se
   * reparte un puesto de menores, que lleva los suyos (`ajustesDelPuesto`,
   * ronda 6, G2). Todo lo de abajo lee esta variable, así que basta con
   * cambiarla al entrar en cada puesto y devolverla al salir.
   */
  let settings = settingsDelLocal
  const contracts = activeContracts(settings)
  const biggest = contracts[0] ?? { id: 'c40', hours: 40, label: '40h', enabled: true }
  let topeDia = topeDiarioMin(settings)

  // Fuerza de cada día: lo que pide la semana tipo. Los turnos de los días
  // fuertes se reparten antes, así que caen en quien más horas acaba teniendo,
  // y la gente con más horas libra en los días flojos (punto 11).
  const fuerza = contexto.comensalesPorDia ?? fuerzaDesdeNecesidad(grid, model)

  // Los mandos van primero (ronda 4): mientras están, hacen el trabajo del
  // segundo de su zona, y el resto del equipo se monta con lo que queda.
  const mandosColocados = colocarMandos(grid, model, settings, contexto, fuerza)
  const gridTrasMandos = descontarMandos(
    grid,
    mandosColocados,
    Math.min(settings.minShiftMinutes, settings.maxShiftMinutes, topeDia),
  )
  // Un puesto que pide menos horas que el contrato más pequeño no es un
  // contrato: sus horas las hace otro puesto de la zona (ronda 8, M2).
  const { grid: gridEquipo, plegados } = plegarPuestosPequenos(
    gridTrasMandos,
    model,
    settings.minContractHours ?? MIN_CONTRATO_DEFECTO_H,
  )

  const pending = buildPendingShifts(gridEquipo, model, settings)

  type Orden = (a: PendingShift, b: PendingShift) => number
  const ORDENES: Orden[] = [
    (a, b) => b.hours - a.hours || fuerza[b.day] - fuerza[a.day],
    (a, b) => fuerza[b.day] - fuerza[a.day] || b.hours - a.hours,
    (a, b) => b.hours - a.hours || fuerza[a.day] - fuerza[b.day],
  ]
  const concentracion = (r: { slots: Slot[] }) =>
    r.slots.reduce((acc, sl) => acc + sl.person.assignedHours ** 2, 0)
  /**
   * La cola que delata un cuadrante hecho a máquina: gente que viene un solo
   * día, o tan pocas horas que no llega al contrato más pequeño.
   */
  const minContrato = settings.minContractHours ?? MIN_CONTRATO_DEFECTO_H
  const colaDe = (r: { slots: Slot[] }) =>
    // Un día suelto pesa el doble que unas horas por debajo del contrato más
    // pequeño: dos días de 4 h se pueden firmar, uno solo no (ronda 4).
    r.slots.reduce((acc, sl) => acc + (sl.days.size < 2 ? 2 : sl.person.assignedHours < minContrato ? 1 : 0), 0)
  /**
   * Parciales cortos que no vienen el fin de semana (ronda 4): también delatan
   * un cuadrante hecho a máquina, pero menos que un día suelto, así que cuentan
   * después. En un puesto de una persona al día no cuentan: ahí el parcial va
   * a los días flojos a propósito (ronda 3, G2).
   */
  const cortosEntreSemana = (r: { slots: Slot[] }) =>
    !masDeUnoAlDia(r.slots)
      ? 0
      : r.slots.filter(
          (sl) =>
            sl.days.size >= 2 &&
            sl.person.assignedHours >= minContrato &&
            sl.person.assignedHours < PARCIAL_CORTO_H &&
            !(sl.days.has(5) && sl.days.has(6)),
        ).length


  /**
   * Reparte los turnos de UN puesto en personas y consolida. Se llama dos
   * veces por puesto: sin partida y con ella. La partida solo se queda si
   * quita a alguien (punto 10 de la revisión): así un local de dos servicios
   * junta comida y cena en la misma persona, y uno de horario seguido no ve
   * una jornada partida que no le ahorra nada.
   */
  function empaquetar(pendIn: PendingShift[], conPartida: boolean, orden: Orden) {
    const pend = (conPartida ? emparejarPartidas(pendIn, topeDia) : [...pendIn]).sort(orden)
    const slots: Slot[] = []
    const shifts: Shift[] = []
    const uncovered: Record<string, number[][]> = {}
    for (const p of pend) {
      if (!uncovered[p.roleId]) {
        uncovered[p.roleId] = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
      }
    }
    let uncoveredHours = 0
    const counters: Record<string, number> = {}

    /**
     * Turnos por persona, en un índice.
     *
     * Antes esto filtraba el cuadrante entero en cada llamada, y se llama desde
     * dentro de tres bucles anidados: con 70 personas de un mismo puesto el
     * reparto tardaba 9,5 segundos, y esto se recalcula en cada tecla de la tabla
     * de tramos. El índice lo baja a la décima parte.
     */
    const porPersona = new Map<string, Shift[]>()
    function indexar(sh: Shift) {
      const lista = porPersona.get(sh.personId)
      if (lista) lista.push(sh)
      else porPersona.set(sh.personId, [sh])
    }
    function shiftsOf(slot: Slot): Shift[] {
      return porPersona.get(slot.person.id) ?? []
    }
    function turnoDelDia(slot: Slot, day: DayIndex): Shift | undefined {
      return shiftsOf(slot).find((sh) => sh.day === day)
    }
    function blocksOn(slot: Slot, day: DayIndex, extra?: Map<DayIndex, Run[]>): Run[] {
      const sh = turnoDelDia(slot, day)
      const mas = extra?.get(day)
      if (!sh) return mas ?? []
      return mas ? [...sh.blocks, ...mas] : sh.blocks
    }

    /**
     * 12 h de descanso con el día de antes y el de después. Los minutos son desde
     * la medianoche del día en que arranca el turno (las 02:00 de la madrugada
     * son 1560), así que el hueco con el día siguiente es siempre
     * `1440 + inicioSiguiente - finAnterior`, domingo-lunes incluido porque la
     * semana se repite. `extra` son turnos que se están probando y aún no están
     * en el cuadrante.
     */
    function dayRestOk(slot: Slot, day: DayIndex, extraBlocks: Run[], extra?: Map<DayIndex, Run[]>): boolean {
      if (!settings.minRestBetweenShifts) return true
      const today = [...blocksOn(slot, day, extra), ...extraBlocks]
      let start = Number.POSITIVE_INFINITY
      let end = Number.NEGATIVE_INFINITY
      for (const b of today) {
        if (b.startMin < start) start = b.startMin
        if (b.endMin > end) end = b.endMin
      }
      const prev = blocksOn(slot, ((day + 6) % 7) as DayIndex, extra)
      if (prev.length > 0) {
        let prevEnd = Number.NEGATIVE_INFINITY
        for (const b of prev) if (b.endMin > prevEnd) prevEnd = b.endMin
        if (1440 + start - prevEnd < MIN_REST_MIN) return false
      }
      const next = blocksOn(slot, ((day + 1) % 7) as DayIndex, extra)
      if (next.length > 0) {
        let nextStart = Number.POSITIVE_INFINITY
        for (const b of next) if (b.startMin < nextStart) nextStart = b.startMin
        if (1440 + nextStart - end < MIN_REST_MIN) return false
      }
      return true
    }

    /**
     * Día y medio seguido de descanso en la semana (ronda 6, M3). Con dos
     * libranzas seguidas sale solo; con libranzas sueltas había que mirarlo,
     * o un cocinero de seis días acababa con 32 h que la propia revisión
     * marcaba como ilegales.
     */
    function semanalOk(slot: Slot, day: DayIndex, extraBlocks: Run[], extra?: Map<DayIndex, Run[]>): boolean {
      const dias: Run[][] = []
      for (let d = 0; d < 7; d++) {
        const b = blocksOn(slot, d as DayIndex, extra)
        dias.push(d === day ? [...b, ...extraBlocks] : b)
      }
      // Ronda 7 (M4): ninguna colocación deja a un nocturno por encima de 8 h
      // de media. Va aquí porque esta comprobación ya está en todas las
      // colocaciones: el reparto, el vaciado y los traslados.
      if (!mediaNocturnaOk(dias)) return false
      if (settings.consecutiveDaysOff) return true
      const mayor = mayorDescansoSemanalMin(dias)
      return mayor === null || mayor >= DESCANSO_SEMANAL_MIN
    }

    /** ¿Le cabe otro día de trabajo sin romper la libranza? */
    function diasOk(days: Set<DayIndex>, day: DayIndex): boolean {
      if (settings.consecutiveDaysOff) return libranzaSeguidaOk(days, day)
      return days.size < 6
    }

    /**
     * ¿Puede este turno ser el segundo bloque de una jornada partida de quien ya
     * trabaja ese día? Dos bloques como mucho, una hora de hueco real, el tope
     * diario y un arco de 13 h. Un relevo pegado al turno del que sale no tiene
     * hueco, así que nunca pasa por aquí.
     */
    function partidaOk(existentes: Run[], b: Run): boolean {
      if (!conPartida) return false
      if (existentes.length !== 1) return false
      const a = existentes[0]
      const gap = b.startMin >= a.endMin ? b.startMin - a.endMin : a.startMin - b.endMin
      if (gap < SPLIT_GAP_MIN) return false
      const minutos = a.endMin - a.startMin + (b.endMin - b.startMin)
      if (minutos > topeDeJornada([a, b], topeDia)) return false
      const arco = Math.max(a.endMin, b.endMin) - Math.min(a.startMin, b.startMin)
      return arco <= MAX_ARCO_PARTIDA_MIN
    }

    // ── Reparto voraz ──────────────────────────────────────────────────────
    // Sin partida, un turno por persona y día. Con partida, un turno puede ser
    // el segundo bloque del día de quien ya trabaja ese día, y se prefiere: es
    // lo que junta la comida y la cena en una sola persona.
    for (const p of pend) {
      // Mejor ajuste, no primer ajuste: se elige a quien menos hueco le sobre
      // después de meter el turno. Y a igualdad, a quien ya hace ese mismo turno.
      let target: Slot | undefined
      let bestLeftover = Number.POSITIVE_INFINITY
      let bestRepite = -1
      let bestPartida = false
      for (const slot of slots) {
        if (slot.person.roleId !== p.roleId) continue
        if (slot.person.assignedHours + p.hours > slot.person.contractHours) continue
        let partida = false
        if (slot.days.has(p.day)) {
          if (!conPartida || !partidaOk(blocksOn(slot, p.day), p.blocks[0])) continue
          partida = true
        } else if (!diasOk(slot.days, p.day)) continue
        if (!dayRestOk(slot, p.day, p.blocks)) continue
        if (!semanalOk(slot, p.day, p.blocks)) continue
        if (bestPartida && !partida) continue
        const leftover = slot.person.contractHours - slot.person.assignedHours - p.hours
        const repite = slot.claves.get(p.clave) ?? 0
        if (
          (partida && !bestPartida) ||
          leftover < bestLeftover - 1e-9 ||
          (Math.abs(leftover - bestLeftover) <= 1e-9 && repite > bestRepite)
        ) {
          bestLeftover = leftover
          bestRepite = repite
          bestPartida = partida
          target = slot
        }
      }

      if (!target) {
        // ¿Cabe siquiera en la jornada más grande? Si no, el turno es imposible y
        // se marca como descubierto en vez de inventarse un contrato a medida.
        if (p.hours > biggest.hours) {
          for (const b of p.blocks) {
            for (let m = b.startMin; m < b.endMin; m += SLOT_MINUTES) {
              const s = (m - slotStartMin(0)) / SLOT_MINUTES
              if (s >= 0 && s < SLOTS_PER_DAY) uncovered[p.roleId][p.day][s] += 1
            }
          }
          uncoveredHours += p.hours
          continue
        }
        counters[p.roleId] = (counters[p.roleId] ?? 0) + 1
        const role = model.roles.find((r) => r.id === p.roleId)
        const person: Person = {
          id: `${p.roleId}-${counters[p.roleId]}`,
          label: `${role?.name ?? 'Puesto'} ${counters[p.roleId]}`,
          roleId: p.roleId,
          contractId: biggest.id,
          contractHours: biggest.hours,
          assignedHours: 0,
          daysOff: [],
        }
        target = { person, days: new Set<DayIndex>(), claves: new Map() }
        slots.push(target)
      }

      target.person.assignedHours += p.hours
      target.claves.set(p.clave, (target.claves.get(p.clave) ?? 0) + 1)
      if (bestPartida) {
        const suyo = turnoDelDia(target, p.day)
        if (suyo) {
          suyo.blocks = [...suyo.blocks, ...p.blocks].sort((x, y) => x.startMin - y.startMin)
          suyo.hours += p.hours
          suyo.tipo = 'Partido'
          continue
        }
      }
      target.days.add(p.day)
      const sh: Shift = {
        id: `${target.person.id}-${p.day}-${shifts.length}`,
        personId: target.person.id,
        roleId: p.roleId,
        day: p.day,
        blocks: p.blocks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
        hours: p.hours,
        tipo: p.tipo,
      }
      shifts.push(sh)
      indexar(sh)
    }

    // ── Consolidación ──────────────────────────────────────────────────────
    // El reparto voraz deja cola: gente con cuatro horas sueltas que existe solo
    // porque en ese momento no cabía en nadie. Se intenta vaciar a los más
    // flojos repartiendo sus turnos entre el resto; quien se queda sin nada,
    // desaparece. Es lo que baja la plantilla de "matemáticamente correcta" a
    // "contratable".

    function removeShift(sh: Shift) {
      const i = shifts.indexOf(sh)
      if (i >= 0) shifts.splice(i, 1)
      const lista = porPersona.get(sh.personId)
      if (lista) {
        const j = lista.indexOf(sh)
        if (j >= 0) lista.splice(j, 1)
      }
    }

    /** ¿Cabe este turno en esta persona como turno continuo, con todas las reglas? */
    function admite(receptor: Slot, sh: Shift): boolean {
      if (receptor.person.roleId !== sh.roleId) return false
      if (receptor.person.assignedHours + sh.hours > receptor.person.contractHours) return false
      if (receptor.days.has(sh.day)) return false
      if (!diasOk(receptor.days, sh.day)) return false
      return dayRestOk(receptor, sh.day, sh.blocks) && semanalOk(receptor, sh.day, sh.blocks)
    }

    /**
     * Mete un turno en una persona y DEVUELVE el turno que ha quedado en el
     * cuadrante, que es un objeto nuevo. Devolverlo no es un detalle: para
     * deshacer un movimiento hay que quitar exactamente ese, y buscarlo después
     * por día y horas encuentra el de otro y deja dos copias del mismo turno.
     */
    function colocar(receptor: Slot, sh: Shift): Shift {
      const puesto: Shift = { ...sh, personId: receptor.person.id }
      shifts.push(puesto)
      indexar(puesto)
      receptor.person.assignedHours += sh.hours
      receptor.days.add(sh.day)
      return puesto
    }

    /** Saca del cuadrante ese turno concreto, el objeto que se le pasa. */
    function sacar(donante: Slot, sh: Shift) {
      removeShift(sh)
      donante.person.assignedHours -= sh.hours
      donante.days.delete(sh.day)
    }

    function quitarSiVacio(slot: Slot) {
      if (shiftsOf(slot).length === 0) {
        const i = slots.indexOf(slot)
        if (i >= 0) slots.splice(i, 1)
      }
    }

    /**
     * Las funciones de abajo miden si un movimiento mejora con la SUMA DE LOS
     * CUADRADOS de las horas de cada persona. Mover horas de quien tiene menos a
     * quien tiene más siempre la sube, y al revés la baja, así que sirve para dos
     * cosas: dice qué movimiento acerca al objetivo (poca gente con muchas horas
     * en vez de mucha gente a media jornada) y garantiza que el bucle termina,
     * porque solo se aplican movimientos que la suben y está acotada por arriba.
     */

    /**
     * Un solo traslado que concentre horas: coge UN turno de quien va más flojo
     * y lo pasa a alguien que va más cargado y tiene hueco. Solo se acepta si el
     * receptor va igual o más cargado que el donante: así las horas siempre suben
     * hacia arriba y nunca se reparten hacia abajo.
     */
    function trasladoQueConcentra(): boolean {
      const porCarga = [...slots].sort((a, b) => a.person.assignedHours - b.person.assignedHours)
      for (const donante of porCarga) {
        const suyos = shiftsOf(donante)
        if (suyos.length === 0) continue
        for (const sh of [...suyos].sort((a, b) => b.hours - a.hours)) {
          let receptor: Slot | undefined
          let hueco = Number.POSITIVE_INFINITY
          for (const r of slots) {
            if (r === donante || r.person.assignedHours < donante.person.assignedHours) continue
            const h = r.person.contractHours - r.person.assignedHours
            if (h >= hueco) continue
            if (!admite(r, sh)) continue
            receptor = r
            hueco = h
          }
          if (!receptor) continue
          sacar(donante, sh)
          colocar(receptor, sh)
          quitarSiVacio(donante)
          return true
        }
      }
      return false
    }

    /**
     * Traslado en cadena: A le pasa un turno a B, y B le pasa a C el turno suyo
     * que estorbaba. Solo se aplica si la CUENTA COMPLETA concentra más horas de
     * las que dispersa, calculada antes de tocar nada.
     */
    function cadenaQueConcentra(): boolean {
      // Solo se intenta vaciar a los MÁS FLOJOS: la cadena existe para la cola.
      const porCarga = [...slots]
        .sort((a, b) => a.person.assignedHours - b.person.assignedHours)
        .slice(0, DONANTES_EN_CADENA)

      for (const a of porCarga) {
        const suyos = shiftsOf(a)
        if (suyos.length === 0) continue

        for (const turnoA of [...suyos].sort((x, y) => y.hours - x.hours)) {
          for (const b of slots) {
            if (b === a || b.person.roleId !== turnoA.roleId) continue
            if (!b.days.has(turnoA.day)) continue
            const estorbo = turnoDelDia(b, turnoA.day)
            if (!estorbo || estorbo.blocks.length !== 1) continue

            // ⚠️ El estorbo se quita UNA vez, fuera del bucle de C, y se repone
            // con lo que devuelve `colocar`. Quitarlo y reponerlo dentro del
            // bucle reponía un turno NUEVO mientras la variable seguía apuntando
            // al viejo: el cuadrante pasó de 88 turnos a 23.784 sin ningún error.
            sacar(b, estorbo)
            if (!admite(b, turnoA)) {
              colocar(b, estorbo)
              continue
            }

            let movido = false
            for (const c of slots) {
              if (c === a || c === b || c.person.roleId !== turnoA.roleId) continue
              if (!admite(c, estorbo)) continue
              const dA = a.person.assignedHours
              const dB = b.person.assignedHours
              const dC = c.person.assignedHours
              const antes = dA * dA + (dB + estorbo.hours) ** 2 + dC * dC
              const despues = (dA - turnoA.hours) ** 2 + (dB + turnoA.hours) ** 2 + (dC + estorbo.hours) ** 2
              if (despues <= antes) continue
              colocar(c, estorbo)
              sacar(a, turnoA)
              colocar(b, turnoA)
              quitarSiVacio(a)
              movido = true
              break
            }
            if (!movido) {
              colocar(b, estorbo)
              continue
            }
            return true
          }
        }
      }
      return false
    }

    /**
     * Vaciado completo: se intenta repartir TODOS los turnos de una persona entre
     * el resto y quitarla. Se simula antes de tocar nada: o se va entera, o no se
     * mueve.
     *
     * Con `conPartida`, un turno puede ir a quien ya trabaja ese día como segundo
     * bloque de una jornada partida. Solo aquí, y por eso la partida solo sale
     * cuando ahorra una persona entera (punto 10 de la revisión).
     */
    function vaciado(conPartida: boolean): boolean {
      const order = [...slots].sort((a, b) => a.person.assignedHours - b.person.assignedHours)
      for (const donor of order) {
        const mine = shiftsOf(donor)
        if (mine.length === 0) continue
        if (conPartida && mine.some((sh) => sh.blocks.length !== 1)) continue
        const receivers = slots.filter((s) => s !== donor && s.person.roleId === donor.person.roleId)
        if (receivers.length === 0) continue

        const trial = receivers.map((s) => ({
          slot: s,
          hours: s.person.assignedHours,
          days: new Set(s.days),
          partidas: new Set<DayIndex>(),
          extra: new Map<DayIndex, Run[]>(),
        }))
        const plan: { sh: Shift; to: (typeof trial)[number]; partida: boolean }[] = []
        let allPlaced = true

        for (const sh of mine) {
          let target: (typeof trial)[number] | undefined
          let targetPartida = false
          let hueco = Number.POSITIVE_INFINITY
          for (const t of trial) {
            if (t.hours + sh.hours > t.slot.person.contractHours) continue
            const h = t.slot.person.contractHours - t.hours - sh.hours
            // A igualdad de hueco se prefiere el turno continuo.
            if (h > hueco || (h === hueco && !targetPartida)) continue
            let partida = false
            if (t.days.has(sh.day)) {
              if (!conPartida || t.partidas.has(sh.day) || t.extra.has(sh.day)) continue
              if (!partidaOk(blocksOn(t.slot, sh.day), sh.blocks[0])) continue
              partida = true
            } else if (!diasOk(t.days, sh.day)) continue
            if (!dayRestOk(t.slot, sh.day, sh.blocks, t.extra)) continue
            if (!semanalOk(t.slot, sh.day, sh.blocks, t.extra)) continue
            target = t
            targetPartida = partida
            hueco = h
          }
          if (!target) {
            allPlaced = false
            break
          }
          target.hours += sh.hours
          target.days.add(sh.day)
          if (targetPartida) target.partidas.add(sh.day)
          target.extra.set(sh.day, [...(target.extra.get(sh.day) ?? []), ...sh.blocks])
          plan.push({ sh, to: target, partida: targetPartida })
        }
        if (!allPlaced) continue

        for (const { sh, to, partida } of plan) {
          removeShift(sh)
          if (partida) {
            const suyo = turnoDelDia(to.slot, sh.day)
            if (suyo) {
              suyo.blocks = [...suyo.blocks, ...sh.blocks].sort((a, b) => a.startMin - b.startMin)
              suyo.hours += sh.hours
              suyo.tipo = 'Partido'
              to.slot.person.assignedHours += sh.hours
              continue
            }
          }
          colocar(to.slot, sh)
        }
        donor.person.assignedHours = 0
        donor.days.clear()
        slots.splice(slots.indexOf(donor), 1)
        return true
      }
      return false
    }

    let progress = true
    let guard = 0
    while (progress && guard++ < 400) {
      // Primero todo lo que se puede hacer con turnos continuos. La partida, la
      // última: solo entra si nada de lo anterior ha quitado a nadie.
      progress =
        vaciado(false) ||
        trasladoQueConcentra() ||
        cadenaQueConcentra() ||
        (conPartida && vaciado(true))
    }
    return { slots, shifts, uncovered, uncoveredHours }
  }

  const slots: Slot[] = []
  const shifts: Shift[] = []
  const uncovered: Record<string, number[][]> = {}
  for (const role of model.roles) {
    uncovered[role.id] = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  }
  let uncoveredHours = 0
  const partidasInfo = { personasAhorradas: 0, roles: 0 }
  for (const role of model.roles) {
    settings = ajustesDelPuesto(settingsDelLocal, role)
    topeDia = topeDiarioMin(settings)
    // Un puesto de menores no trabaja de noche (art. 6.2 ET, ronda 6, G2): lo
    // que su puesto pide de 22:00 en adelante no se le reparte. Se queda sin
    // cubrir y la revisión lo dice, para que lo haga alguien mayor de edad.
    let gridDelPuesto = gridEquipo
    let nocheMenor: number[][] | null = null
    if (role.menores && gridEquipo[role.id]) {
      nocheMenor = gridEquipo[role.id].map((dia) => dia.map((v, sl) => (slotStartMin(sl) >= NOCHE_DESDE_MIN ? v : 0)))
      gridDelPuesto = {
        ...gridEquipo,
        [role.id]: gridEquipo[role.id].map((dia) => dia.map((v, sl) => (slotStartMin(sl) >= NOCHE_DESDE_MIN ? 0 : v))),
      }
    }
    const pend =
      settings === settingsDelLocal && gridDelPuesto === gridEquipo
        ? pending.filter((p) => p.roleId === role.id)
        : buildPendingShifts(gridDelPuesto, { ...model, roles: [role] }, settings)
    if (nocheMenor) {
      for (let d = 0; d < 7; d++) {
        for (let sl = 0; sl < SLOTS_PER_DAY; sl++) {
          const v = nocheMenor[d][sl]
          if (v <= 0) continue
          uncovered[role.id][d][sl] += v
          uncoveredHours += (v * SLOT_MINUTES) / 60
        }
      }
    }
    if (pend.length === 0) continue
    // Varias pasadas baratas y se queda la mejor: el reparto voraz depende del
    // orden en que le llegan los turnos, y con las libranzas seguidas un orden
    // u otro deja a veces a una persona con un turno suelto. Primero se mira
    // quién deja menos gente; a igualdad, quién concentra más las horas. La
    // partida solo gana si de verdad quita a alguien.
    //
    // Las variantes: turnos continuos; continuos que se juntan en partidas al
    // repartir; y jornadas ya hechas día a día (`jornadasDelDia`), que es la
    // que puede partir un servicio en piezas para que comida y cena quepan en
    // el tope diario.
    const variantes: { pend: PendingShift[]; conPartida: boolean; esPartida: boolean }[] = [
      { pend, conPartida: false, esPartida: false },
    ]
    if (settings.allowSplitShifts) {
      variantes.push({ pend, conPartida: true, esPartida: true })
      // ⚠️ Solo en puestos de tamaño normal: con 70 personas de un puesto,
      // probar largos de pieza en cada servicio cuesta cientos de ms, y ahí el
      // reparto de siempre ya sale bien porque hay gente de sobra para encajar.
      const jornadas =
        pend.length <= MAX_TURNOS_VARIAS_PASADAS ? buildJornadas(gridDelPuesto, model, settings, role.id) : null
      if (jornadas && jornadas.some((j) => j.blocks.length > 1)) {
        variantes.push({ pend: jornadas, conPartida: false, esPartida: true })
      }
    }
    // Jornadas largas que se solapan (ronda 8, M4): en un puesto de una o dos
    // personas a la vez con un horario seguido más largo que el turno (el
    // responsable de sala de un local de 12 a 01), dos turnos de jornada
    // entera que se cruzan en la hora fuerte en vez de relevos de 6 h y
    // refuerzos sueltos. Es lo que da dos o tres contratos de verdad en vez
    // de cinco medias jornadas.
    const largas = role.menores ? null : jornadasLargas(gridDelPuesto, model, role, settings, biggest.hours)
    const horasDe = (lista: PendingShift[]) => lista.reduce((a, x) => a + x.hours, 0)
    const conLargas = !!largas && horasDe(largas) <= horasDe(pend) * MAX_HORAS_JORNADAS_LARGAS
    // Se elige por este orden: menos personas; menos cola (gente de un día
    // suelto o de menos horas que el contrato más pequeño); sin partida mejor
    // que con ella (la partida solo gana si quita a alguien o la cola); el
    // reparto por libranzas, que es el que haría un encargado; y por último
    // el que más concentra las horas.
    type Reparto = ReturnType<typeof empaquetar>
    let elegido = null as Reparto | null
    let elegidoEsPartida = false
    let clave: number[] = []
    // La mejor plantilla vista sin ninguna partida, para poder decir cuánta
    // gente ahorran de verdad las partidas (ronda 3, G8).
    let mejorSinPartida = Number.POSITIVE_INFINITY
    const considerar = (r: Reparto, esPartida: boolean, porLibranzas: boolean) => {
      if (!esPartida && r.uncoveredHours <= 0) mejorSinPartida = Math.min(mejorSinPartida, r.slots.length)
      const c = [
        r.slots.length,
        r.uncoveredHours > 0 ? 1 : 0,
        colaDe(r),
        cortosEntreSemana(r),
        Number(esPartida),
        Number(!porLibranzas),
        -concentracion(r),
      ]
      let mejor = !elegido
      for (let i = 0; !mejor && i < c.length; i++) {
        if (c[i] < clave[i] - 1e-9) mejor = true
        else if (c[i] > clave[i] + 1e-9) break
      }
      if (mejor) {
        elegido = r
        elegidoEsPartida = esPartida
        clave = c
      }
    }

    // Primero el reparto por libranzas, con las jornadas ya hechas si las hay
    // (son las que mejor encajan) o con los turnos continuos si no.
    const paraLibranzas = variantes.find((x) => x.esPartida && !x.conPartida) ?? variantes[0]
    const porLibranzas = repartirPorLibranzas(paraLibranzas.pend, role, settings, biggest.hours, fuerza)
    const optimo = !!porLibranzas && porLibranzas.people.length <= suelo(paraLibranzas.pend, biggest.hours)
    const considerarLibranzas = (rl: { people: Person[]; shifts: Shift[] } | null, esPartida: boolean) => {
      if (!rl) return
      considerar(
        {
          slots: rl.people.map((person) => ({
            person,
            days: new Set(rl.shifts.filter((sh) => sh.personId === person.id).map((sh) => sh.day)),
            claves: new Map<string, number>(),
          })),
          shifts: rl.shifts,
          uncovered: {},
          uncoveredHours: 0,
        },
        esPartida,
        true,
      )
    }
    considerarLibranzas(porLibranzas, paraLibranzas.esPartida)

    for (const v of variantes) {
      // ⚠️ Con un puesto grande cada pasada cuesta ~70 ms y esto corre con cada
      // tecla: ahí basta con el primer orden, que es el que mejor sale con
      // mucha gente (las otras pasadas existen para la cola de los puestos
      // pequeños, donde una persona de más se nota). Y si el reparto por
      // libranzas ya ha llegado al suelo, el voraz solo se mira una vez.
      const unaPasada = v.pend.length > MAX_TURNOS_VARIAS_PASADAS || v.conPartida || optimo
      for (const orden of unaPasada ? ORDENES.slice(0, 1) : ORDENES) {
        considerar(empaquetar(v.pend, v.conPartida, orden), v.esPartida, false)
      }
    }
    // Las jornadas largas solo entran si quitan a alguien: alargar turnos
    // suma horas, y eso solo compensa si deja menos contratos (ronda 8, M4).
    if (conLargas && largas && elegido) {
      const sinLargas = (elegido as Reparto).slots.length
      const probar = (r: Reparto, porLib: boolean) => {
        if (r.slots.length < sinLargas && r.uncoveredHours <= 0) considerar(r, false, porLib)
      }
      const rl = repartirPorLibranzas(largas, role, settings, biggest.hours, fuerza)
      if (rl) {
        probar(
          {
            slots: rl.people.map((person) => ({
              person,
              days: new Set(rl.shifts.filter((sh) => sh.personId === person.id).map((sh) => sh.day)),
              claves: new Map<string, number>(),
            })),
            shifts: rl.shifts,
            uncovered: {},
            uncoveredHours: 0,
          },
          true,
        )
      }
      for (const orden of largas.length > MAX_TURNOS_VARIAS_PASADAS ? ORDENES.slice(0, 1) : ORDENES) {
        probar(empaquetar(largas, false, orden), false)
      }
    }
    if (!elegido) continue
    const elegidoFinal = elegido as Reparto
    parcialesAlFinde(elegidoFinal.shifts, settings, biggest.hours)
    sinDiaSuelto(elegidoFinal.shifts, settings, biggest.hours, minContrato)
    estabilizarFamilias(elegidoFinal.shifts, settings, biggest.hours)
    for (const sl of elegidoFinal.slots) {
      const suyos = elegidoFinal.shifts.filter((sh) => sh.personId === sl.person.id)
      sl.person.assignedHours = suyos.reduce((a, sh) => a + sh.hours, 0)
      sl.days = new Set(suyos.map((sh) => sh.day))
    }
    if (elegidoEsPartida && elegidoFinal.shifts.some((sh) => sh.blocks.length > 1)) {
      // Si el reparto por libranzas solo se probó con partidas, se prueba
      // también seguido: es el que haría un encargado sin partir a nadie.
      if (paraLibranzas.esPartida) {
        const seguido = repartirPorLibranzas(variantes[0].pend, role, settings, biggest.hours, fuerza)
        if (seguido) mejorSinPartida = Math.min(mejorSinPartida, seguido.people.length)
      }
      partidasInfo.roles += 1
      if (Number.isFinite(mejorSinPartida)) {
        partidasInfo.personasAhorradas += Math.max(0, mejorSinPartida - elegidoFinal.slots.length)
      }
    }
    slots.push(...elegido.slots)
    shifts.push(...elegido.shifts)
    if (elegido.uncovered[role.id]) {
      const suyo = elegido.uncovered[role.id]
      uncovered[role.id] = uncovered[role.id].map((dia, d) => dia.map((v, sl) => v + (suyo[d]?.[sl] ?? 0)))
    }
    uncoveredHours += elegido.uncoveredHours
  }
  settings = settingsDelLocal
  topeDia = topeDiarioMin(settings)

  // ── Contratos ──────────────────────────────────────────────────────────
  const ascending = [...contracts].sort((a, b) => a.hours - b.hours)
  for (const s of slots) {
    const role = model.roles.find((r) => r.id === s.person.roleId)
    asignarContrato(s.person, role, settings, biggest, ascending)
    s.person.daysOff = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).filter((d) => !s.days.has(d))
  }

  // ── Mandos ─────────────────────────────────────────────────────────────
  const mandos = completarMandos(mandosColocados, model, settings, fuerza, shifts)
  for (const p of mandos.people) {
    const role = model.roles.find((r) => r.id === p.roleId)
    asignarContrato(p, role, settings, biggest, ascending)
  }

  // Orden final: los mandos primero, luego por jornada y, a igualdad, por
  // carga. Y la numeración se hace EN ESE MISMO ORDEN — si se numera por un
  // criterio y se ordena por otro, el cuadrante sale con "Camarero 3, 4, 6, 7,
  // 5" y parece un error.
  const todos = [...mandos.people, ...slots.map((s) => s.person)]
  const ordered = todos.sort(
    (a, b) =>
      Number(esMando(model.roles.find((r) => r.id === b.roleId))) -
        Number(esMando(model.roles.find((r) => r.id === a.roleId))) ||
      b.contractHours - a.contractHours ||
      b.assignedHours - a.assignedHours,
  )

  const seen: Record<string, number> = {}
  for (const p of ordered) {
    seen[p.roleId] = (seen[p.roleId] ?? 0) + 1
    const role = model.roles.find((r) => r.id === p.roleId)
    p.label = `${role?.name ?? 'Puesto'} ${seen[p.roleId]}`
  }

  return {
    people: ordered,
    shifts: [...mandos.shifts, ...shifts],
    uncovered,
    uncoveredHours,
    mandos: mandos.info,
    partidas: partidasInfo,
    plegados,
  }
}

/**
 * El contrato de cada persona, a partir de las horas que hace.
 *
 * - Solo jornada completa: la más grande activa, haga las horas que haga.
 * - Mando: su jornada si los turnos llegan al 90 %; si su zona abre menos de lo
 *   que da su jornada, baja a lo que de verdad trabaja (con contratos a medida).
 * - Contratos a medida: el número de horas exacto, redondeado hacia arriba, con
 *   el mínimo que se haya puesto y como mucho la jornada completa; a cuatro
 *   horas o menos de la completa, la completa.
 * - Si no, el contrato más pequeño de la lista que cubra sus horas.
 */
function asignarContrato(
  p: Person,
  role: Role | undefined,
  settings: Settings,
  biggest: ContractType,
  ascending: ContractType[],
) {
  const aMedida = settings.contratosAMedida ?? true
  const minimo = Math.min(settings.minContractHours ?? MIN_CONTRATO_DEFECTO_H, biggest.hours)
  const exactas = Math.ceil(p.assignedHours - 1e-9)

  let horas: number
  if (esMando(role)) {
    const jornada = Math.min(role?.weeklyHours ?? biggest.hours, biggest.hours)
    // "Solo jornada completa" manda también en un mando (ronda 7, m4): antes
    // un encargado con la casilla puesta salía a 35 h si su zona abría poco.
    horas = role?.fullTimeOnly
      ? biggest.hours
      : p.assignedHours >= jornada * 0.9 || !aMedida
        ? jornada
        : Math.max(minimo, exactas)
  } else if (role?.fullTimeOnly) {
    horas = biggest.hours
  } else if (aMedida) {
    // A 36 h o más, jornada completa: un parcial de 38 o 39 h no lo firma
    // nadie, y las dos horas que sobran se usan en preparación o limpieza.
    horas =
      exactas >= biggest.hours - CASI_COMPLETA_H ? biggest.hours : Math.min(biggest.hours, Math.max(minimo, exactas))
  } else {
    horas = (ascending.find((c) => c.hours >= p.assignedHours) ?? biggest).hours
  }
  const deLaLista = settings.contracts.find((c) => c.hours === horas)
  p.contractId = deLaLista?.id ?? `h${horas}`
  p.contractHours = horas
}

/** Lo que pide cada día sumando todos los puestos, si no llegan los comensales. */
function fuerzaDesdeNecesidad(grid: NeedGrid, model: StaffingModel): number[] {
  const out = new Array<number>(7).fill(0)
  for (const role of model.roles) {
    const g = grid[role.id]
    if (!g) continue
    for (let d = 0; d < 7; d++) for (const v of g[d]) out[d] += v
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// Mandos
// ─────────────────────────────────────────────────────────────

interface Mando {
  role: Role
  /** Minutos de su jornada a la semana. */
  semanaMin: number
  /** Días que trabaja a la semana. */
  dias: number
  /** Minutos de cada turno. */
  diarioMin: number
}

interface PlanMandos {
  people: Person[]
  shifts: Shift[]
  info: NonNullable<Roster['mandos']>
}

/** Ventanas de un día, con los huecos de menos de una hora juntados. */
function ventanasDelDia(hours: OpeningHours, d: number): Run[] {
  return juntarHuecosCortos((hours[d] ?? []).filter((b) => b.endMin > b.startMin))
}

/** Horario de una zona deducido de lo que piden sus puestos de volumen. */
function horarioDesdeNecesidad(grid: NeedGrid, model: StaffingModel, blockId: string): OpeningHours {
  const roles = model.roles.filter((r) => r.blockId === blockId && !esMando(r))
  return Array.from({ length: 7 }, (_, d) => {
    const total = new Array<number>(SLOTS_PER_DAY).fill(0)
    for (const r of roles) {
      const g = grid[r.id]?.[d]
      if (g) for (let s = 0; s < SLOTS_PER_DAY; s++) total[s] += g[s]
    }
    return runsForLayer(total, 1)
  })
}

/** Lo que queda de los mandos de una zona antes de montar el resto del equipo. */
interface MandosDeZona {
  block: StaffingModel['blocks'][number]
  roles: Role[]
  pedidos: number
  lista: Mando[]
  turnos: TurnoMando[][]
  ventanas: Run[][]
  needZona: number[][]
  /** El primer puesto de volumen de la zona con necesidad: quien queda al frente. */
  segundoId: string | null
  /** Los demás puestos de volumen de la zona. */
  otrosIds: string[]
  /**
   * Lo que le quedaba al segundo eran solo las horas de relevo del mando, y
   * las hace el equipo en vez de un puesto aparte (ronda 5). Lo marca
   * `descontarMandos`.
   */
  relevoEnEquipo?: boolean
}

/**
 * Los mandos de cada zona, PRIMER paso (revisión ronda 3, G1, G2 y G5; ronda 4).
 *
 * Como lo monta un director de operaciones: el mando que el usuario ha dicho
 * está los días fuertes y libra los flojos, y cada día hace su jornada donde
 * más falta hace, que en un local de comidas y cenas es una partida que coge
 * los dos servicios, no ocho horas seguidas cruzando la tarde con la cocina
 * cerrada. Cuando libra, o en las horas que su jornada no llega a cubrir, se
 * queda al frente el segundo de la zona: el primer puesto de su zona que tiene
 * necesidad (el responsable de sala, el cocinero). Eso es lo que pasa en
 * cualquier local, y por eso NO se añaden mandos para cubrir sus libranzas:
 * antes salían tres jefes de cocina para una sola cocina.
 *
 * Se colocan ANTES que el resto del equipo (ronda 4): mientras el mando está,
 * hace el trabajo de ese segundo (el encargado lleva la sala, el jefe de
 * cocina cocina), y `descontarMandos` se lo quita a la necesidad de ese
 * puesto. Antes se ponían encima, y el ejemplo pagaba 80 h a la semana de un
 * encargado y un responsable de sala haciendo lo mismo a la vez.
 *
 * Las 12 h entre jornadas son un límite duro: un turno que las rompe no se
 * coloca, ni siquiera si deja la zona sin mando ese día (G5).
 */
function colocarMandos(
  grid: NeedGrid,
  model: StaffingModel,
  settings: Settings,
  contexto: ContextoCuadrante,
  fuerza: number[],
): MandosDeZona[] {
  const out: MandosDeZona[] = []
  const tope = topeDiarioMin(settings)
  const maxDias = settings.consecutiveDaysOff ? 5 : 6
  const jornadaCompleta = activeContracts(settings)[0]?.hours ?? 40

  // Días en que ya trabaja algún mando de otra zona (ronda 5, M1): las
  // libranzas se cruzan para que ningún día se quede la casa sin mando.
  const trabajanOtras = new Array<number>(7).fill(0)

  // Ronda 8 (M5): las libranzas de todos los mandos se deciden JUNTAS. Antes
  // elegía primero el de sala sus dos días más flojos, y al jefe de cocina, que
  // no podía librar esos mismos para no dejar la casa sin mando, le tocaban el
  // jueves y el viernes, el tercer día más fuerte del ejemplo. Juntas salen
  // lunes y martes para uno y miércoles y jueves para el otro.
  const libresDe = libranzasDeLosMandos(grid, model, settings, contexto, fuerza, tope, maxDias, jornadaCompleta)
  let zonaN = 0

  for (const block of model.blocks) {
    const roles = model.roles.filter((r) => r.blockId === block.id && esMando(r))
    const pedidos = roles.reduce((a, r) => a + Math.max(0, Math.round(r.headcount ?? 0)), 0)
    if (roles.length === 0 || pedidos <= 0) continue

    const horario = contexto.horarioDe?.(block.id) ?? horarioDesdeNecesidad(grid, model, block.id)
    const ventanas = Array.from({ length: 7 }, (_, d) => ventanasDelDia(horario, d))
    const diasAbiertos = ventanas.filter((v) => v.length > 0).length
    if (diasAbiertos === 0) continue

    // Lo que pide la zona en cada franja: el mando se pone donde más falta hace.
    const volRoles = model.roles.filter((r) => r.blockId === block.id && !esMando(r))
    const needZona = Array.from({ length: 7 }, (_, d) => {
      const t = new Array<number>(SLOTS_PER_DAY).fill(0)
      for (const r of volRoles) {
        const g = grid[r.id]?.[d]
        if (g) for (let s = 0; s < SLOTS_PER_DAY; s++) t[s] += g[s]
      }
      return t
    })
    const segundo = volRoles.find((r) => grid[r.id]?.some((day) => day.some((v) => v > 0))) ?? null

    const lista: Mando[] = []
    for (const role of roles) {
      for (let i = 0; i < Math.max(0, Math.round(role.headcount ?? 0)); i++) {
        lista.push(nuevoMando(role, jornadaCompleta, tope, maxDias, diasAbiertos))
      }
    }
    const forzadas = libresDe?.[zonaN++]
    const turnos = repartirMandos(lista, ventanas, needZona, fuerza, settings, [], trabajanOtras, forzadas)
    for (const ts of turnos) for (const t of ts) trabajanOtras[t.day]++
    out.push({
      block,
      roles,
      pedidos,
      lista,
      turnos,
      ventanas,
      needZona,
      segundoId: segundo?.id ?? null,
      otrosIds: volRoles.filter((r) => r.id !== segundo?.id).map((r) => r.id),
    })
  }
  return out
}

/** Combinaciones de libranzas que se prueban como mucho al decidirlas juntas. */
const MAX_COMBINACIONES_LIBRANZAS = 20000

/**
 * Las libranzas de todos los mandos del local a la vez (revisión ronda 8, M5).
 *
 * Lo mismo que pesaba el reparto de uno en uno (`repartirMandos`), pero sobre
 * todas las combinaciones: dos mandos de la misma zona no libran el mismo día
 * (100), ningún día abierto se queda la casa sin ningún mando (60), un día
 * cerrado es el mejor para librar (−50) y, con eso, cada mando libra en los
 * días de menos comensales (la fuerza del día, hasta 10). A igualdad, el
 * primero de la lista (el de más rango) se queda los más flojos.
 *
 * Devuelve, por zona con mandos y en el orden de `model.blocks`, los días que
 * libra cada mando; o null si hay demasiadas combinaciones, y entonces se
 * decide como antes, uno detrás de otro.
 */
function libranzasDeLosMandos(
  grid: NeedGrid,
  model: StaffingModel,
  settings: Settings,
  contexto: ContextoCuadrante,
  fuerza: number[],
  tope: number,
  maxDias: number,
  jornadaCompleta: number,
): number[][][] | null {
  const zonas: { ventanas: Run[][]; mandos: number }[] = []
  const opciones: number[][][] = []
  const zonaDeMando: number[] = []
  for (const block of model.blocks) {
    const roles = model.roles.filter((r) => r.blockId === block.id && esMando(r))
    const pedidos = roles.reduce((a, r) => a + Math.max(0, Math.round(r.headcount ?? 0)), 0)
    if (roles.length === 0 || pedidos <= 0) continue
    const horario = contexto.horarioDe?.(block.id) ?? horarioDesdeNecesidad(grid, model, block.id)
    const ventanas = Array.from({ length: 7 }, (_, d) => ventanasDelDia(horario, d))
    const diasAbiertos = ventanas.filter((v) => v.length > 0).length
    if (diasAbiertos === 0) continue
    const z = zonas.length
    let n = 0
    for (const role of roles) {
      for (let i = 0; i < Math.max(0, Math.round(role.headcount ?? 0)); i++) {
        const m = nuevoMando(role, jornadaCompleta, tope, maxDias, diasAbiertos)
        const libres = 7 - m.dias
        opciones.push(combinacionesDeLibranza(libres, settings.consecutiveDaysOff))
        zonaDeMando.push(z)
        n++
      }
    }
    zonas.push({ ventanas, mandos: n })
  }
  if (zonas.length === 0) return null
  if (opciones.reduce((a, o) => a * Math.max(1, o.length), 1) > MAX_COMBINACIONES_LIBRANZAS) return null
  const maxFuerza = Math.max(1, ...fuerza)
  const abiertaAlgunaZona = [0, 1, 2, 3, 4, 5, 6].map((d) => zonas.some((z) => z.ventanas[d].length > 0))
  let mejor: number[][] | null = null
  let mejorCoste = Number.POSITIVE_INFINITY
  const elegidas: number[][] = []
  const probar = (i: number) => {
    if (i === opciones.length) {
      let coste = 0
      const trabajaAlguno = new Array<boolean>(7).fill(false)
      for (let z = 0; z < zonas.length; z++) {
        for (let d = 0; d < 7; d++) {
          const abierta = zonas[z].ventanas[d].length > 0
          let libran = 0
          let total = 0
          elegidas.forEach((set, k) => {
            if (zonaDeMando[k] !== z) return
            total++
            if (set.includes(d)) {
              libran++
              coste += abierta ? (fuerza[d] / maxFuerza) * 10 * (1 + 0.01 * (opciones.length - k)) : -50
            }
          })
          if (abierta && libran > 1) coste += 100 * (libran - 1)
          if (abierta && total - libran > 0) trabajaAlguno[d] = true
        }
      }
      for (let d = 0; d < 7; d++) if (abiertaAlgunaZona[d] && !trabajaAlguno[d]) coste += 60
      if (coste < mejorCoste - 1e-9) {
        mejorCoste = coste
        mejor = elegidas.map((x) => [...x])
      }
      return
    }
    for (const o of opciones[i]) {
      elegidas.push(o)
      probar(i + 1)
      elegidas.pop()
    }
  }
  probar(0)
  if (!mejor) return null
  const elegido = mejor as number[][]
  return zonas.map((_, z) => elegido.filter((_, k) => zonaDeMando[k] === z))
}

/** Los conjuntos de días que puede librar un mando: con dos seguidos si se piden. */
function combinacionesDeLibranza(libres: number, seguidas: boolean): number[][] {
  if (libres <= 0) return [[]]
  const out: number[][] = []
  for (let mask = 0; mask < 1 << 7; mask++) {
    const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d))
    if (dias.length !== libres) continue
    if (seguidas && libres >= 2 && !DAY_OFF_PAIRS.some((p) => dias.includes(p[0]) && dias.includes(p[1]))) continue
    out.push(dias)
  }
  return out
}

function nuevoMando(role: Role, jornadaCompleta: number, tope: number, maxDias: number, diasAbiertos: number): Mando {
  const semanaMin = Math.min(role.weeklyHours ?? jornadaCompleta, jornadaCompleta) * 60
  let dias = Math.round(semanaMin / 480)
  dias = Math.max(dias, Math.ceil(semanaMin / tope), 1)
  dias = Math.min(dias, maxDias, diasAbiertos)
  const diarioMin = Math.min(tope, snapDown(semanaMin / dias))
  return { role, semanaMin, dias, diarioMin }
}

/**
 * La necesidad que le queda al resto del equipo con los mandos ya puestos
 * (ronda 4): en cada franja en la que hay un mando, el segundo de su zona
 * necesita una persona menos. Nunca baja de cero ni toca otro puesto.
 *
 * Y los ratos sueltos que la jornada del mando deja al abrir y al cerrar (la
 * media hora antes de que entre, la hora después de que se vaya) no piden un
 * segundo aparte: un trozo más corto que el turno mínimo y pegado al turno del
 * mando lo lleva el equipo que ya está en la zona. Sin esto, cada uno de esos
 * trozos se volvía un turno de 4 h de un responsable más, y el ejemplo pasaba
 * de uno a tres. El aviso `mando-relevo` dice esas horas.
 */
function descontarMandos(grid: NeedGrid, zonas: MandosDeZona[], minMin: number): NeedGrid {
  if (zonas.length === 0) return grid
  const out: NeedGrid = { ...grid }
  const slotDe = (m: number) => (m - slotStartMin(0)) / SLOT_MINUTES
  for (const z of zonas) {
    if (!z.segundoId || !grid[z.segundoId]) continue
    const g = grid[z.segundoId].map((day) => [...day])
    const quitado = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
    const turnos = z.turnos.flat()
    for (const t of turnos) {
      for (const b of t.blocks) {
        for (let m = b.startMin; m < b.endMin; m += SLOT_MINUTES) {
          const s = slotDe(m)
          if (s >= 0 && s < SLOTS_PER_DAY && g[t.day][s] > 0) {
            g[t.day][s]--
            quitado[t.day][s]++
          }
        }
      }
    }
    for (let d = 0; d < 7; d++) {
      const bordes = turnos.filter((t) => t.day === d).flatMap((t) => t.blocks.flatMap((b) => [b.startMin, b.endMin]))
      if (bordes.length === 0) continue
      for (const r of runsForLayer(g[d], 1)) {
        if (r.endMin - r.startMin >= minMin) continue
        if (!bordes.includes(r.startMin) && !bordes.includes(r.endMin)) continue
        // Solo si en ese rato hay más gente de la zona: si el segundo es el
        // único, quitarlo dejaría la zona abierta sin nadie.
        let acompanado = true
        for (let m = r.startMin; m < r.endMin && acompanado; m += SLOT_MINUTES) {
          const s = slotDe(m)
          if (s < 0 || s >= SLOTS_PER_DAY) continue
          let otros = 0
          for (const id of z.otrosIds) otros += grid[id]?.[d]?.[s] ?? 0
          if (otros < 1) acompanado = false
        }
        if (!acompanado) {
          // Si el segundo se queda solo en ese rato, viene, y su turno se
          // alarga hacia donde está el mando hasta el turno mínimo: mejor
          // que coincida un rato con él que un turno de media hora.
          let a = slotDe(r.startMin)
          let b = slotDe(r.endMin)
          while ((b - a) * SLOT_MINUTES < minMin) {
            if (b < SLOTS_PER_DAY && quitado[d][b] > 0) {
              g[d][b]++
              quitado[d][b]--
              b++
            } else if (a > 0 && quitado[d][a - 1] > 0) {
              a--
              g[d][a]++
              quitado[d][a]--
            } else break
          }
          continue
        }
        for (let m = r.startMin; m < r.endMin; m += SLOT_MINUTES) {
          const s = slotDe(m)
          if (s >= 0 && s < SLOTS_PER_DAY && g[d][s] > 0) g[d][s]--
        }
      }
    }
    out[z.segundoId] = g
    plegarRelevo(out, grid, z)
  }
  return out
}

/** Horas a la semana por debajo de las cuales el relevo del mando no es un puesto (ronda 5). */
const RELEVO_EN_EQUIPO_MAX_MIN = 20 * 60

/**
 * El relevo del mando sin puesto aparte (ronda 5, revisión de pantallas).
 *
 * Si el segundo de la zona es un puesto de una sola persona a la vez (el
 * responsable de sala: la necesidad nunca pide dos) y, con el mando puesto,
 * solo le quedan las horas de los días que el mando libra, ese puesto no
 * existe como contrato: el ejemplo sacaba dos responsables de sala de 10 h
 * que solo venían martes y miércoles. Lo que hace un director de operaciones
 * es que el veterano del equipo quede al frente esos días, con su plus. Esas
 * horas pasan al siguiente puesto de la zona (el camarero) y el aviso
 * `mando-relevo` dice quién queda al frente.
 */
function plegarRelevo(out: NeedGrid, original: NeedGrid, z: MandosDeZona): void {
  if (!z.segundoId) return
  const destino = z.otrosIds.find((id) => original[id]?.some((day) => day.some((v) => v > 0)))
  if (!destino) return
  const orig = original[z.segundoId]
  if (orig.some((day) => day.some((v) => v > 1))) return
  const resto = out[z.segundoId]
  const minutos = resto.reduce((a, day) => a + day.reduce((x, v) => x + v, 0), 0) * SLOT_MINUTES
  if (minutos === 0 || minutos > RELEVO_EN_EQUIPO_MAX_MIN) return
  const g = (out[destino] ?? original[destino]).map((day) => [...day])
  for (let d = 0; d < 7; d++) for (let s = 0; s < SLOTS_PER_DAY; s++) g[d][s] += resto[d][s]
  out[destino] = g
  out[z.segundoId] = resto.map((day) => day.map(() => 0))
  z.relevoEnEquipo = true
}

/**
 * Los mandos de cada zona, SEGUNDO paso: con el equipo ya montado.
 *
 * Solo se añade otro mando, del último puesto de mando de la zona, si hay
 * ratos con la zona abierta en los que no queda NADIE de ella en el local
 * (ni mando ni equipo), y se dice. Es lo que de verdad "no llega". El que se
 * añade se coloca sin mover a los que ya estaban, porque el equipo se ha
 * montado contando con ellos.
 */
function completarMandos(
  zonas: MandosDeZona[],
  model: StaffingModel,
  settings: Settings,
  fuerza: number[],
  volumen: Shift[],
): PlanMandos {
  const out: PlanMandos = { people: [], shifts: [], info: [] }
  const tope = topeDiarioMin(settings)
  const maxDias = settings.consecutiveDaysOff ? 5 : 6
  const jornadaCompleta = activeContracts(settings)[0]?.hours ?? 40

  for (const z of zonas) {
    const { block, roles, pedidos, ventanas, needZona } = z
    const diasAbiertos = ventanas.filter((v) => v.length > 0).length
    const volRoles = model.roles.filter((r) => r.blockId === block.id && !esMando(r))
    const idsZona = new Set(volRoles.map((r) => r.id))
    const volumenZona = volumen.filter((sh) => idsZona.has(sh.roleId))
    const segundo = volRoles.find((r) => volumenZona.some((sh) => sh.roleId === r.id)) ?? null
    const rolAnadir = roles[roles.length - 1]

    let lista = [...z.lista]
    let turnos = [...z.turnos]
    let sinNadie = minutosSinMando(ventanas, [...turnos.flat(), ...volumenZona])
    // Un mando más solo si cubre de verdad: al menos una jornada suya entera
    // de horas en las que no había nadie de la zona. Media hora suelta al
    // abrir cada día no justifica un contrato; se dice en el aviso.
    for (let extra = 0; sinNadie > 0 && extra < 3; extra++) {
      const nuevo = nuevoMando(rolAnadir, jornadaCompleta, tope, maxDias, diasAbiertos)
      const suyo = repartirMandos([nuevo], ventanas, needZona, fuerza, settings, turnos.flat())
      const s2 = minutosSinMando(ventanas, [...turnos.flat(), ...suyo[0], ...volumenZona])
      if (sinNadie - s2 < nuevo.diarioMin) break
      lista = [...lista, nuevo]
      turnos = [...turnos, suyo[0]]
      sinNadie = s2
    }

    const contador: Record<string, number> = {}
    lista.forEach((m, i) => {
      contador[m.role.id] = (contador[m.role.id] ?? 0) + 1
      const id = `${m.role.id}-${contador[m.role.id]}`
      const suyos = turnos[i]
      let horas = 0
      suyos.forEach((t) => {
        const h = t.blocks.reduce((a, b) => a + (b.endMin - b.startMin), 0) / 60
        horas += h
        out.shifts.push({
          id: `${id}-${t.day}`,
          personId: id,
          roleId: m.role.id,
          day: t.day,
          blocks: t.blocks,
          hours: h,
          tipo: t.tipo,
        })
      })
      out.people.push({
        id,
        label: `${m.role.name} ${contador[m.role.id]}`,
        roleId: m.role.id,
        contractId: '',
        contractHours: m.semanaMin / 60,
        assignedHours: horas,
        daysOff: ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).filter((d) => !suyos.some((t) => t.day === d)),
      })
    })

    const todos = turnos.flat()
    const diasSin = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).filter(
      (d) => ventanas[d].length > 0 && !todos.some((t) => t.day === d),
    )
    out.info.push({
      blockId: block.id,
      pedidos,
      necesarios: lista.length,
      roleIdAnadido: lista.length > pedidos ? rolAnadir.id : null,
      minutosSinMando: minutosSinMando(ventanas, todos),
      diasSinMando: diasSin,
      segundoRoleId: segundo?.id ?? z.segundoId,
      minutosSinNadie: sinNadie,
      alFrente: quienQuedaAlFrente(diasSin, ventanas, volumenZona),
      relevoEnEquipo: z.relevoEnEquipo,
    })
  }
  return out
}

/**
 * Quién queda al frente de la zona cada día que libra el mando (ronda 5): la
 * persona del equipo que más rato está dentro del horario de la zona ese día
 * y, a igualdad (o casi, media hora), la misma de los otros días, para que el
 * equipo sepa siempre a quién mirar y el plus vaya a una sola persona.
 */
function quienQuedaAlFrente(
  dias: DayIndex[],
  ventanas: Run[][],
  volumenZona: Shift[],
): { day: DayIndex; personId: string }[] {
  // Minutos de cada persona dentro del horario de la zona, día a día.
  const dentro = dias.map((d) => {
    const porPersona = new Map<string, number>()
    for (const sh of volumenZona) {
      if (sh.day !== d) continue
      let min = 0
      for (const b of sh.blocks) {
        for (const v of ventanas[d]) min += Math.max(0, Math.min(b.endMin, v.endMin) - Math.max(b.startMin, v.startMin))
      }
      porPersona.set(sh.personId, (porPersona.get(sh.personId) ?? 0) + min)
    }
    return porPersona
  })
  const mejorDelDia = dentro.map((m) => Math.max(0, ...m.values()))
  // Primero, una sola persona para todos esos días si está todos y cada día
  // cubre al menos las tres cuartas partes de lo que cubre la que más.
  let unica: { id: string; min: number } | null = null
  for (const id of new Set(volumenZona.map((sh) => sh.personId))) {
    let total = 0
    let vale = dias.length > 0
    dentro.forEach((m, i) => {
      const min = m.get(id) ?? 0
      if (min === 0 || min < mejorDelDia[i] * 0.75) vale = false
      total += min
    })
    if (vale && (!unica || total > unica.min || (total === unica.min && id < unica.id))) unica = { id, min: total }
  }
  if (unica) return dias.map((day) => ({ day, personId: unica!.id }))
  // Si no, la que más rato está cada día.
  const out: { day: DayIndex; personId: string }[] = []
  dias.forEach((day, i) => {
    let mejor: { id: string; min: number } | null = null
    for (const [id, min] of dentro[i]) {
      if (!mejor || min > mejor.min || (min === mejor.min && id < mejor.id)) mejor = { id, min }
    }
    if (mejor) out.push({ day, personId: mejor.id })
  })
  return out
}

interface TurnoMando {
  day: DayIndex
  blocks: Run[]
  tipo: string
}

/**
 * Minutos de la semana en los que la zona está abierta y no hay ningún mando.
 * La revisión del cuadrante y el guion de comprobación miran esta misma cifra.
 */
export function minutosSinMando(ventanas: Run[][], turnos: { day: DayIndex; blocks: Run[] }[]): number {
  let falta = 0
  for (let d = 0; d < 7; d++) {
    const delDia = turnos.filter((t) => t.day === d).flatMap((t) => t.blocks)
    for (const v of ventanas[d]) {
      for (let m = v.startMin; m < v.endMin; m += SLOT_MINUTES) {
        if (!delDia.some((b) => m >= b.startMin && m < b.endMin)) falta += SLOT_MINUTES
      }
    }
  }
  return falta
}

/** Días fuertes de la semana en los que el mando se queda al cierre (ronda 5, M8). */
const DIAS_FUERTES_CIERRE = 3
/** El rato del cierre que cubre el mando: la última hora de su zona abierta. */
const CIERRE_MANDO_MIN = 60
/** Lo que pesa cada media hora de ese cierre frente al centro del servicio (que pesa de 1 a 2). */
const PESO_CIERRE_MANDO = 3

/** Lo que pesa la noche para un mando de un local que no cierra, frente al día. */
const PESO_NOCHE_SIN_CIERRE = 0.6

/** Bloque más corto de la partida de un mando, o el servicio entero si es más corto. */
const MIN_BLOQUE_MANDO_MIN = 3 * 60

/**
 * Los turnos que puede hacer un mando un día, todos de `L` minutos como mucho:
 * los seguidos que caben en la apertura y, si el día tiene dos servicios y se
 * permite la partida, las partidas que cogen un trozo de cada uno.
 */
function candidatosMando(v: Run[], L: number, conPartida: boolean, maxBloque: number = L): Run[][] {
  const out: Run[][] = []
  if (v.length === 0) return out
  const a = v[0].startMin
  const z = v[v.length - 1].endMin
  // Ningún turno de mando nocturno de más de 8 h (ronda 5, M2).
  const legal = (bs: Run[]) => bs.reduce((x, b) => x + b.endMin - b.startMin, 0) <= topeDeJornada(bs, L)
  // El turno máximo vale también para los mandos (ronda 6, m4): un bloque
  // seguido no pasa de él, y la jornada larga va partida si el día lo deja.
  const Lc = Math.min(L, maxBloque)
  if (z - a <= Lc) {
    const entero = [{ startMin: a, endMin: z }]
    if (legal(entero)) out.push(entero)
    else for (let st = a; st + TOPE_NOCTURNO_MIN <= z; st += SLOT_MINUTES) out.push([{ startMin: st, endMin: st + TOPE_NOCTURNO_MIN }])
    // Y el mismo servicio entrando más tarde o saliendo antes, hasta dos
    // horas (ronda 6, M2). Sin esto, si el turno entero rompía las 12 h con
    // el día de al lado, el mando perdía el día: el jefe de cocina de un
    // asador de fin de semana iba solo el sábado por media hora de descanso.
    // Pesan menos que el entero, así que solo salen cuando el entero no cabe.
    for (let recorte = SLOT_MINUTES; recorte <= 2 * 60; recorte += SLOT_MINUTES) {
      if (z - a - recorte < Math.min(MIN_BLOQUE_MANDO_MIN, z - a)) break
      for (const c of [
        [{ startMin: a + recorte, endMin: z }],
        [{ startMin: a, endMin: z - recorte }],
      ]) {
        if (legal(c)) out.push(c)
      }
    }
  } else {
    for (let st = a; st + Lc <= z; st += SLOT_MINUTES) {
      const c = [{ startMin: st, endMin: st + Lc }]
      out.push(legal(c) ? c : [{ startMin: st + Lc - TOPE_NOCTURNO_MIN, endMin: st + Lc }])
    }
  }

  if (!conPartida || v.length < 2) return out
  let corte = 1
  let hueco = -1
  for (let i = 1; i < v.length; i++) {
    const g = v[i].startMin - v[i - 1].endMin
    if (g > hueco) {
      hueco = g
      corte = i
    }
  }
  if (hueco < SPLIT_GAP_MIN) return out
  const P = { startMin: v[0].startMin, endMin: v[corte - 1].endMin }
  const Q = { startMin: v[corte].startMin, endMin: v[v.length - 1].endMin }
  const lenP = P.endMin - P.startMin
  const lenQ = Q.endMin - Q.startMin
  const minP = Math.min(MIN_BLOQUE_MANDO_MIN, lenP)
  const minQ = Math.min(MIN_BLOQUE_MANDO_MIN, lenQ)
  for (let l1 = minP; l1 <= Math.min(lenP, L - minQ, maxBloque); l1 += SLOT_MINUTES) {
    const l2 = Math.min(lenQ, L - l1, maxBloque)
    if (l2 < minQ) continue
    for (let p1 = P.startMin; p1 + l1 <= P.endMin; p1 += SLOT_MINUTES) {
      for (let p2 = Q.startMin; p2 + l2 <= Q.endMin; p2 += SLOT_MINUTES) {
        if (p2 - (p1 + l1) < SPLIT_GAP_MIN) continue
        if (p2 + l2 - p1 > MAX_ARCO_PARTIDA_MIN) continue
        if (l1 + l2 > topeDeJornada([{ startMin: p1, endMin: p1 + l1 }, { startMin: p2, endMin: p2 + l2 }], L)) continue
        out.push([
          { startMin: p1, endMin: p1 + l1 },
          { startMin: p2, endMin: p2 + l2 },
        ])
      }
    }
  }
  return out
}

/**
 * Reparte días y turnos entre una lista concreta de mandos.
 *
 * Libranzas: el de más rango elige primero, en los días de menos comensales, y
 * los siguientes libran en días distintos para que coincidan lo menos posible.
 * Turnos: día a día, del más fuerte al más flojo, cada mando coge el turno que
 * más horas de servicio sin mando cubre (pesando más las franjas con más
 * gente), sin romper las 12 h con su día de antes ni con el de después. A
 * igualdad, el mismo horario que ya hace otros días, para que no cambie de un
 * día a otro.
 */
function repartirMandos(
  lista: Mando[],
  ventanas: Run[][],
  needZona: number[][],
  fuerza: number[],
  settings: Settings,
  previos: TurnoMando[] = [],
  /** Mandos de OTRAS zonas que ya trabajan cada día (ronda 5, M1). */
  trabajanOtras: number[] = new Array<number>(7).fill(0),
  /** Los días que libra cada mando, ya decididos para todo el local (ronda 8, M5). */
  libresForzados?: number[][],
): TurnoMando[][] {
  const maxFuerza = Math.max(1, ...fuerza)
  const conPartida = settings.allowSplitShifts
  // Los días fuertes, en los que el mando cierra (ronda 5, M8): los tres de
  // más comensales entre los que abre la zona.
  const fuertes = new Set(
    [0, 1, 2, 3, 4, 5, 6]
      .filter((d) => ventanas[d].length > 0)
      .sort((a, b) => fuerza[b] - fuerza[a] || a - b)
      .slice(0, DIAS_FUERTES_CIERRE),
  )

  // Libranzas.
  // Los mandos que ya estaban (`previos`) cuentan: el que llega libra cuando
  // ellos trabajan y se pone donde ellos no están.
  const libranEseDia = new Array<number>(7).fill(0)
  if (previos.length > 0) {
    for (let d = 0; d < 7; d++) if (!previos.some((t) => t.day === d)) libranEseDia[d]++
  }
  const trabaja: Set<number>[] = []
  /** Mandos de esta zona ya colocados que trabajan ese día. */
  const trabajanEsta = (d: number) =>
    trabaja.filter((t) => t.has(d)).length + (previos.some((t) => t.day === d) ? 1 : 0)
  for (const [idx, m] of lista.entries()) {
    const forzado = libresForzados && libresForzados.length === lista.length ? libresForzados[idx] : null
    if (forzado) {
      for (const d of forzado) libranEseDia[d]++
      trabaja.push(new Set([0, 1, 2, 3, 4, 5, 6].filter((d) => !forzado.includes(d))))
      continue
    }
    const libres = 7 - m.dias
    const coste = (d: number) => {
      if (ventanas[d].length === 0) return -50
      // Librar un día en que no trabaja ningún mando de otra zona ni otro de
      // esta deja la casa entera sin mando: pesa más que librar un día fuerte.
      const casaSola = trabajanOtras[d] === 0 && trabajanEsta(d) === 0 ? 60 : 0
      return 100 * libranEseDia[d] + casaSola + (fuerza[d] / maxFuerza) * 10
    }
    let mejor: number[] = []
    let mejorCoste = Number.POSITIVE_INFINITY
    const bases: number[][] = settings.consecutiveDaysOff && libres >= 2 ? DAY_OFF_PAIRS.map((p) => [...p]) : [[]]
    for (const b of bases) {
      const set = [...b]
      const resto = [0, 1, 2, 3, 4, 5, 6].filter((d) => !set.includes(d)).sort((x, y) => coste(x) - coste(y))
      while (set.length < libres && resto.length) set.push(resto.shift() as number)
      const c = set.reduce((acc, d) => acc + coste(d), 0)
      if (c < mejorCoste - 1e-9) {
        mejorCoste = c
        mejor = set
      }
    }
    for (const d of mejor) libranEseDia[d]++
    trabaja.push(new Set([0, 1, 2, 3, 4, 5, 6].filter((d) => !mejor.includes(d))))
  }

  const turnos: TurnoMando[][] = lista.map(() => [])
  const conMando = Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))
  for (const t of previos) {
    for (const b of t.blocks) {
      for (let m = b.startMin; m < b.endMin; m += SLOT_MINUTES) {
        const s = (m - slotStartMin(0)) / SLOT_MINUTES
        if (s >= 0 && s < SLOTS_PER_DAY) conMando[t.day][s]++
      }
    }
  }
  const dias = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => fuerza[b] - fuerza[a] || a - b)
  const cache = new Map<string, Run[][]>()
  const claveDe = (bs: Run[]) => bs.map((b) => `${b.startMin}-${b.endMin}`).join('+')

  for (const d of dias) {
    const v = ventanas[d]
    if (v.length === 0) continue
    const maxNeed = Math.max(1, ...needZona[d])
    const abierto = (s: number) => {
      const m = slotStartMin(s)
      return v.some((x) => m >= x.startMin && m < x.endMin)
    }
    // El cierre de los días fuertes: la última hora de la zona abierta, que
    // es cuando se hace la caja y se cierra la sala. Pesa más que el centro
    // del servicio, que ya lleva el equipo.
    const finZona = v[v.length - 1].endMin
    // Un local que no cierra no tiene cierre que hacer (ronda 6, m6): en uno
    // de 24 h el peso del cierre mandaba a los dos mandos de noche y el día,
    // con proveedores, clientes y más gente, quedaba sin mando.
    const noCierra = finZona - v[0].startMin >= 24 * 60 - SLOT_MINUTES
    const esCierre = (s: number) => !noCierra && fuertes.has(d) && slotStartMin(s) >= finZona - CIERRE_MANDO_MIN
    for (let i = 0; i < lista.length; i++) {
      if (!trabaja[i].has(d)) continue
      const L = lista[i].diarioMin
      const k = `${d}:${L}`
      let cands = cache.get(k)
      if (!cands) {
        cands = candidatosMando(v, L, conPartida, settings.maxShiftMinutes)
        cache.set(k, cands)
      }
      const suyas = new Set(turnos[i].map((t) => claveDe(t.blocks)))
      let mejor: Run[] | null = null
      let mejorGain = -1
      const validos: { c: Run[]; gain: number }[] = []
      for (const c of cands) {
        if (descansoRoto(turnos[i], d as DayIndex, c, settings)) continue
        let gain = 0
        for (const b of c) {
          for (let m = b.startMin; m < b.endMin; m += SLOT_MINUTES) {
            const s = (m - slotStartMin(0)) / SLOT_MINUTES
            if (s < 0 || s >= SLOTS_PER_DAY || !abierto(s)) continue
            const peso = esCierre(s) ? PESO_CIERRE_MANDO : 1 + needZona[d][s] / maxNeed
            // En un local que no cierra, la noche pesa menos: el día lleva
            // proveedores, clientes y más gente que dirigir (ronda 6, m6).
            const deNoche = noCierra && slotStartMin(s) >= NOCHE_DESDE_MIN ? PESO_NOCHE_SIN_CIERRE : 1
            gain += peso * deNoche * (conMando[d][s] > 0 ? 0.15 : 1)
          }
        }
        validos.push({ c, gain })
        if (gain > mejorGain) {
          mejorGain = gain
          mejor = c
        }
      }
      if (!mejor) continue
      // El mismo horario que otros días, si cubre casi lo mismo.
      const igual = validos.find((x) => x.gain >= mejorGain * 0.97 && suyas.has(claveDe(x.c)))
      const elegido = igual ? igual.c : mejor
      turnos[i].push({
        day: d as DayIndex,
        blocks: elegido.map((b) => ({ ...b })),
        tipo: elegido.length > 1 ? 'Partido' : 'Mando',
      })
      for (const b of elegido) {
        for (let m = b.startMin; m < b.endMin; m += SLOT_MINUTES) {
          const s = (m - slotStartMin(0)) / SLOT_MINUTES
          if (s >= 0 && s < SLOTS_PER_DAY) conMando[d][s]++
        }
      }
    }
  }
  for (const t of turnos) t.sort((a, b) => a.day - b.day)
  return turnos
}

/** ¿Este turno rompe las 12 h con el día de antes o el de después de ese mando? */
function descansoRoto(suyos: TurnoMando[], day: DayIndex, blocks: Run[], settings: Settings): boolean {
  if (!settings.minRestBetweenShifts) return false
  const start = Math.min(...blocks.map((b) => b.startMin))
  const end = Math.max(...blocks.map((b) => b.endMin))
  const prev = suyos.find((t) => t.day === (day + 6) % 7)
  if (prev && 1440 + start - Math.max(...prev.blocks.map((b) => b.endMin)) < MIN_REST_MIN) return true
  const next = suyos.find((t) => t.day === (day + 1) % 7)
  if (next && 1440 + Math.min(...next.blocks.map((b) => b.startMin)) - end < MIN_REST_MIN) return true
  return false
}
