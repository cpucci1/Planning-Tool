/**
 * Cuando falta alguien: vacaciones, festivos, bajas, y las tres formas de
 * cubrirlo sin contratar de más (ronda 2 de la revisión del 2026-11-04,
 * puntos 5, 6, 23 y 26).
 *
 * El cuadrante es UNA semana con todo el mundo presente. En el año real cada
 * persona falta unas siete semanas: 30 días naturales de vacaciones (art. 38.1
 * del Estatuto de los Trabajadores), los festivos que libra o se le compensan
 * (14 al año, art. 37.2 ET) y las bajas. Este módulo dice cuántas horas deja
 * eso sin cubrir y cuánta gente costaría cubrirlas, como lo calcula la
 * industria: con las horas disponibles de cada persona al año.
 *
 * ⚠️ Las bajas se aplican DIVIDIENDO por el tiempo disponible, no
 * multiplicando. Para tener W horas cubiertas con gente que solo está una
 * fracción f del año, hace falta W / f de plantilla, no W × (1 + ausencia):
 * quien contratas para cubrir también se va de vacaciones y se pone malo. Con
 * un 10 % multiplicar da 1,10 y dividir 1,11, y la diferencia crece con la
 * tasa. Es el "shrinkage" de la planificación de centros de llamadas.
 *
 * No toca el cuadrante ni el número de personas: es una línea más del
 * resultado, que dice lo que el cuadrante de una semana no puede decir.
 */

import type { Person, Settings, WeekDemand } from './types'

/** 30 días naturales de vacaciones al año (art. 38.1 ET). */
export const VACACIONES_DIAS_DEFECTO = 30
/** 14 festivos al año como máximo, dos de ellos locales (art. 37.2 ET). */
export const FESTIVOS_DEFECTO = 14
/**
 * Bajas, en % del tiempo disponible. Absentismo en hostelería del 6,3 % según
 * Randstad (marzo de 2025, citado por un tercero); la media nacional de Adecco
 * para 2025 es del 7,6 %. Se redondea a 6 y es editable.
 */
export const BAJAS_PCT_DEFECTO = 6
/** Horas complementarias pactadas: hasta el 30 % de la jornada, 60 % si el convenio lo dice (art. 12.5 ET). */
export const COMPLEMENTARIAS_PCT_DEFECTO = 30
/** Voluntarias: hasta el 15 % (30 % por convenio), solo en indefinidos de 10 h o más (art. 12.5 ET). */
export const VOLUNTARIAS_PCT = 15

/** Días de trabajo de una semana normal. Un festivo cae en un día de trabajo. */
const DIAS_LABORABLES_SEMANA = 5
export const SEMANAS_ANO = 52

export interface ParametrosAusencia {
  vacacionesDias: number
  festivosDias: number
  bajasPct: number
}

/** Lo que el usuario ha puesto, o los valores legales por defecto si el plan es de antes. */
export function parametrosAusencia(settings: Settings): ParametrosAusencia {
  const num = (v: number | undefined, def: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def)
  return {
    vacacionesDias: num(settings.vacacionesDias, VACACIONES_DIAS_DEFECTO),
    festivosDias: num(settings.festivosDias, FESTIVOS_DEFECTO),
    bajasPct: Math.min(50, num(settings.bajasPct, BAJAS_PCT_DEFECTO)),
  }
}

export interface TiempoDisponible {
  /** Vacaciones en semanas: días naturales entre 7. */
  semanasVacaciones: number
  /** Festivos en semanas: días de trabajo entre 5. */
  semanasFestivos: number
  /** Semanas del año en que la persona está, antes de bajas. Pagadas y trabajadas. */
  semanasTrabajadas: number
  /** Fracción del año que de verdad está, con las bajas: (semanas trabajadas / 52) × (1 − bajas). */
  fraccionPresente: number
  /** Horas al año que trabaja una jornada de 40 h, sin contar bajas. Es la cifra que se compara con la jornada anual del convenio. */
  horasAnoJornadaCompleta: number
}

export function tiempoDisponible(p: ParametrosAusencia, jornadaCompleta = 40): TiempoDisponible {
  const semanasVacaciones = p.vacacionesDias / 7
  const semanasFestivos = p.festivosDias / DIAS_LABORABLES_SEMANA
  const semanasTrabajadas = Math.max(1, SEMANAS_ANO - semanasVacaciones - semanasFestivos)
  return {
    semanasVacaciones,
    semanasFestivos,
    semanasTrabajadas,
    fraccionPresente: (semanasTrabajadas / SEMANAS_ANO) * (1 - p.bajasPct / 100),
    horasAnoJornadaCompleta: semanasTrabajadas * jornadaCompleta,
  }
}

export interface CoberturaAusencias {
  parametros: ParametrosAusencia
  tiempo: TiempoDisponible
  /** Horas en turnos a la semana de toda la plantilla: lo que hay que tener cubierto. */
  horasTurnoSemana: number
  /** Horas al año que quedan sin nadie, por motivo. */
  horasVacaciones: number
  horasFestivos: number
  horasBajas: number
  horasACubrirAno: number
  /**
   * Días de vacaciones que ya se disfrutan con el local cerrado (ronda 7, G1):
   * las semanas de cierre por 7, hasta los días de vacaciones. No se cubren.
   */
  vacacionesEnCierreDias: number
  /**
   * Jornadas completas de más para cubrirlas con plantilla propia. Sale de
   * dividir: horas a cubrir / (horas de una jornada al año × fracción presente).
   */
  jornadasExtra: number
}

/**
 * Las horas al año que deja sin cubrir que la gente falte, y la plantilla que
 * costaría cubrirlas.
 *
 * Sobre las horas EN TURNOS (no las contratadas): lo que hay que cubrir cuando
 * alguien falta son sus turnos.
 */
export function coberturaAusencias(
  people: Pick<Person, 'assignedHours'>[],
  settings: Settings,
  jornadaCompleta = 40,
  /**
   * Semanas que se pagan al año (`temporadaDelLocal`). Un local de temporada
   * con fijos discontinuos genera vacaciones, festivos y bajas solo por lo
   * que está abierto: se escalan en esa proporción (ronda 5, G1 de cálculo).
   */
  semanasDePago = SEMANAS_ANO,
  /**
   * Semanas que el local cierra (`temporadaDelLocal().semanasCerradas`). Ronda
   * 7, G1 de cálculo: un local que no es de temporada y cierra en agosto da
   * las vacaciones en el cierre, y esas no hay que cubrirlas otra vez. Antes
   * un menú del día que cerraba 4 semanas contaba 1.091 h de vacaciones a
   * cubrir, como si abriera todo el año; quedan unos 2 días por persona. En
   * un local de temporada (fijo discontinuo) las semanas cerradas no se pagan
   * y ya están fuera por `semanasDePago`, así que aquí no cuentan.
   */
  semanasCerradas = 0,
): CoberturaAusencias {
  const parametros = parametrosAusencia(settings)
  const tiempo = tiempoDisponible(parametros, jornadaCompleta)
  const W = people.reduce((a, p) => a + p.assignedHours, 0)
  const k = Math.min(1, Math.max(0, semanasDePago / SEMANAS_ANO))
  const cierreCuenta = semanasDePago >= SEMANAS_ANO ? Math.max(0, semanasCerradas) : 0
  const vacacionesEnCierreDias = Math.min(parametros.vacacionesDias, cierreCuenta * 7)
  const horasVacaciones = W * ((parametros.vacacionesDias - vacacionesEnCierreDias) / 7) * k
  const horasFestivos = W * tiempo.semanasFestivos * k
  const horasBajas = W * tiempo.semanasTrabajadas * (parametros.bajasPct / 100) * k
  const horasACubrirAno = horasVacaciones + horasFestivos + horasBajas
  return {
    parametros,
    tiempo,
    horasTurnoSemana: W,
    horasVacaciones,
    horasFestivos,
    horasBajas,
    horasACubrirAno,
    vacacionesEnCierreDias,
    jornadasExtra: jornadasParaCubrir(horasACubrirAno, tiempo, jornadaCompleta, semanasDePago),
  }
}

/** Jornadas completas que hacen falta para cubrir esas horas al año, contando que también faltan. */
export function jornadasParaCubrir(
  horasAno: number,
  tiempo: TiempoDisponible,
  jornadaCompleta = 40,
  /** Las semanas que trabaja quien cubre: las de pago del local (ronda 5). */
  semanasDePago = SEMANAS_ANO,
): number {
  const horasUtilesJornada = jornadaCompleta * Math.min(SEMANAS_ANO, semanasDePago) * tiempo.fraccionPresente
  return horasUtilesJornada > 0 ? horasAno / horasUtilesJornada : 0
}

// ─────────────────────────────────────────────────────────────
// Vacaciones en las semanas flojas (punto 6)
// ─────────────────────────────────────────────────────────────

export interface VacacionesFlojas {
  /** Semanas ISO elegidas, de la más floja a la menos. */
  semanas: number[]
  horasVacaciones: number
  /** Horas de vacaciones que no hace falta sustituir porque esas semanas piden menos gente. */
  horasAbsorbidas: number
  /** Las que quedan por cubrir aun así. */
  horasRestantes: number
}

/**
 * Si las vacaciones se dan en las semanas flojas, la gente que se va no hace
 * falta sustituirla: esa semana el local pide menos.
 *
 * La plantilla está hecha para la semana de la línea de cobertura. En una
 * semana con un 30 % menos de comensales sobra un 30 % de las horas que suben y
 * bajan con los comensales (`horasServicioSemana`, sin la preparación, el
 * mínimo por local ni los mandos, que son fijos y no bajan nunca). Esas horas
 * de sobra son las que se pueden ir de vacaciones sin dejar un hueco. Se toman
 * las semanas de menos a más comensales hasta colocar todas.
 *
 * Es una aproximación: no reparte persona a persona ni mira que dos del mismo
 * puesto no coincidan. Lo que dice es el orden de magnitud y QUÉ semanas.
 */
export function vacacionesEnSemanasFlojas(
  weeks: WeekDemand[],
  threshold: number,
  horasServicioSemana: number,
  horasVacaciones: number,
): VacacionesFlojas {
  const flojas = weeks
    .filter((w) => threshold > 0 && w.total < threshold)
    .map((w) => ({ isoWeek: w.isoWeek, holgura: horasServicioSemana * (1 - w.total / threshold) }))
    .sort((a, b) => b.holgura - a.holgura)

  const semanas: number[] = []
  let absorbidas = 0
  for (const f of flojas) {
    if (absorbidas >= horasVacaciones) break
    if (f.holgura <= 0) continue
    semanas.push(f.isoWeek)
    absorbidas += Math.min(f.holgura, horasVacaciones - absorbidas)
  }
  return {
    semanas,
    horasVacaciones,
    horasAbsorbidas: absorbidas,
    horasRestantes: Math.max(0, horasVacaciones - absorbidas),
  }
}

// ─────────────────────────────────────────────────────────────
// Fijo discontinuo (punto 6)
// ─────────────────────────────────────────────────────────────

/** Semanas punta seguidas que ya son una temporada y no un pico suelto. */
export const SEMANAS_TEMPORADA_MIN = 4

/**
 * La racha más larga de semanas punta seguidas, si llega a temporada.
 *
 * Una temporada (verano en costa, Navidad en un local de comidas de empresa)
 * se puede cubrir con fijos discontinuos (art. 16 ET): gente fija que trabaja
 * solo esas semanas y a la que se llama cada año. Los picos sueltos no: para
 * esos están los extras. Se cuenta la vuelta del año (semana 52 → 1).
 */
export function temporadaAlta(peakWeeks: number[], totalWeeks = SEMANAS_ANO): { desde: number; hasta: number; semanas: number } | null {
  const set = new Set(peakWeeks)
  if (set.size === 0) return null
  if (set.size >= totalWeeks) return { desde: 1, hasta: totalWeeks, semanas: totalWeeks }
  let mejor: { desde: number; hasta: number; semanas: number } | null = null
  for (const w of set) {
    const anterior = w === 1 ? totalWeeks : w - 1
    if (set.has(anterior)) continue // no es el principio de una racha
    let n = 1
    let fin = w
    for (;;) {
      const sig = fin === totalWeeks ? 1 : fin + 1
      if (!set.has(sig) || n >= totalWeeks) break
      fin = sig
      n++
    }
    if (!mejor || n > mejor.semanas) mejor = { desde: w, hasta: fin, semanas: n }
  }
  return mejor && mejor.semanas >= SEMANAS_TEMPORADA_MIN ? mejor : null
}

// ─────────────────────────────────────────────────────────────
// Horas complementarias de los parciales (punto 23)
// ─────────────────────────────────────────────────────────────

export interface BolsaComplementarias {
  /** Parciales que pueden hacerlas (no los mandos ni los de jornada completa). */
  parciales: number
  pct: number
  /** Horas a la semana que pueden hacer entre todos con las pactadas. */
  horasSemana: number
  /** Y con las voluntarias, si las aceptan y son indefinidos. No entran en la cuenta. */
  horasVoluntariasSemana: number
}

/** Jornada mínima para pactar horas complementarias (art. 12.5 ET). */
const COMPLEMENTARIAS_MIN_H = 10

/**
 * Lo que dan de sí las horas complementarias de los parciales.
 *
 * Pactadas: hasta el `pct` de su jornada (30 % por ley, hasta 60 % si el
 * convenio lo sube), con 3 días de preaviso, y solo si está pactado por escrito
 * (art. 12.5 ET). Nunca hasta llegar a la jornada completa: entonces ya no sería
 * un parcial, así que cada persona se queda al menos una hora por debajo.
 */
export function bolsaComplementarias(
  people: Pick<Person, 'contractHours'>[],
  settings: Settings,
  jornadaCompleta = 40,
): BolsaComplementarias {
  const raw = settings.complementariasPct
  const pct = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(60, Math.max(0, raw)) : COMPLEMENTARIAS_PCT_DEFECTO
  // Solo con jornadas de 10 h o más a la semana (art. 12.5 ET), las pactadas
  // y las voluntarias (ronda 6, m7): antes las pactadas contaban también los
  // contratos de 6 u 8 h que la pantalla deja poner.
  const parciales = people.filter((p) => p.contractHours < jornadaCompleta && p.contractHours >= COMPLEMENTARIAS_MIN_H)
  const tope = (h: number, porcentaje: number) =>
    Math.max(0, Math.floor(Math.min((h * porcentaje) / 100, jornadaCompleta - h - 1) * 2) / 2)
  const horasSemana = parciales.reduce((a, p) => a + tope(p.contractHours, pct), 0)
  const horasVoluntariasSemana = parciales
    .reduce((a, p) => {
      const yaPactadas = tope(p.contractHours, pct)
      const conTodo = tope(p.contractHours, pct + VOLUNTARIAS_PCT)
      return a + Math.max(0, conTodo - yaPactadas)
    }, 0)
  return { parciales: parciales.length, pct, horasSemana, horasVoluntariasSemana }
}

/**
 * Cuántas horas de los picos se cubren con esa bolsa, semana punta a semana
 * punta: cada semana como mucho lo que da la bolsa, y lo que falte en una
 * semana fuerte no se compensa con la que sobra en otra.
 */
export function picosConComplementarias(
  extraHoursByWeek: { extraHours: number }[],
  horasSemana: number,
): { horasPico: number; cubiertas: number; restantes: number } {
  let horasPico = 0
  let cubiertas = 0
  for (const w of extraHoursByWeek) {
    horasPico += w.extraHours
    cubiertas += Math.min(w.extraHours, horasSemana)
  }
  return { horasPico, cubiertas, restantes: Math.max(0, horasPico - cubiertas) }
}
