/**
 * Modelo de dominio.
 *
 * La cadena completa del producto es:
 *
 *   comensales por franja        (Demanda, viene del fichero)
 *     → semana tipo al percentil elegido   (Cobertura)
 *     → desplazada por el desgaste         (Desgaste)
 *     → personas por puesto y franja       (Tramos, los define el usuario)
 *     → horas semanales por puesto
 *     → contratos                          (40h primero, luego parciales)
 *     → cuadrante
 *
 * Todo lo que hay en `lib/` es lógica pura: no importa React ni toca el DOM.
 */

import type { DayIndex } from './time'

// Se reexporta para que quien trabaje con el dominio no tenga que importar de
// dos sitios distintos.
export type { DayIndex }

/** Los cuatro pasos del flujo. Vive aquí (no en el hook) para que `lib/`
 *  pueda tiparlo sin importar de `hooks/`. */
export type StepId = 'import' | 'demand' | 'team' | 'result'

// ─────────────────────────────────────────────────────────────
// Demanda
// ─────────────────────────────────────────────────────────────

/**
 * Una semana del histórico.
 * `days[d][s]` = comensales del día `d` (0=lunes) en la franja `s`.
 */
export interface WeekDemand {
  /** Semana ISO, 1-53. */
  isoWeek: number
  year: number
  /** Lunes de esa semana, en ISO 'YYYY-MM-DD'. */
  startDate: string
  days: number[][]
  /** Total de comensales de la semana. Cacheado porque se usa en cada render del gráfico. */
  total: number
}

export type SpecialKind =
  | 'semana-santa'
  | 'carnaval'
  | 'navidad'
  | 'nochevieja'
  | 'agosto'
  | 'temporada-baja'
  | 'puente'
  | 'fiesta-local'
  | 'cierre'
  | 'anomalia'

/** Una semana que se sale de la norma y que el usuario confirma o corrige. */
export interface SpecialWeek {
  isoWeek: number
  kind: SpecialKind
  label: string
  /** Cuánto se desvía del patrón normal, en tanto por uno. +0.4 = 40% por encima. */
  deviation: number
  /** El usuario ha confirmado que la etiqueta es correcta. */
  confirmed: boolean
  /** Excluir del cálculo de la semana tipo. */
  excluded: boolean
  /** True si es un festivo que cambia de semana según el año. */
  moveable: boolean
  /**
   * Por qué se salió esa semana, en palabras del usuario ("cerramos por obras",
   * "congreso en el recinto ferial"). El desplegable solo tiene las diez
   * etiquetas habituales, y la mitad de las anomalías de un local no están
   * ahí. Se guarda con el plan para que el año que viene siga explicando por
   * qué esa semana se trató distinto.
   */
  note?: string
}

export interface DemandDataset {
  weeks: WeekDemand[]
  /** Año del histórico. */
  year: number
  specials: SpecialWeek[]
  /** Metadatos de lo que "leyó la IA", para enseñarlos en la pantalla de importación. */
  source: {
    fileName: string
    /** True solo en los datos de ejemplo. Sirve para rellenar el catálogo con
     *  costes de muestra: en el ejemplo se puede, en el fichero de alguien
     *  jamás (nunca se inventa un precio de nadie). */
    isDemo?: boolean
    rowsDetected: number
    dateRange: string
    /** `samples` son valores tal y como vienen en el fichero: es lo que de
     *  verdad permite a alguien no técnico saber si la columna es la suya. */
    columnsDetected: { label: string; mappedTo: string; confidence: number; samples: string[] }[]
    /** Horario detectado a partir de las franjas con comensales. */
    detectedHours: OpeningHours
  }
}

// ─────────────────────────────────────────────────────────────
// Horario
// ─────────────────────────────────────────────────────────────

/** Un tramo de apertura. Minutos absolutos de rejilla (ver lib/time.ts). */
export interface OpenBlock {
  startMin: number
  endMin: number
}

/** Horario por día. Un día cerrado es un array vacío. */
export type OpeningHours = OpenBlock[][]

// ─────────────────────────────────────────────────────────────
// Puestos y bloques
// ─────────────────────────────────────────────────────────────

export interface Role {
  id: string
  name: string
  blockId: string
  /** Color del puesto en gráficos y cuadrante. Hex. */
  color: string
  /**
   * Coste por hora trabajada de esta categoría, en euros. `null` = sin
   * rellenar, y entonces no se enseña ninguna cifra de coste de este puesto.
   * Lo pone el usuario en el catálogo de puestos: **nunca se inventa un
   * precio**, ni de mercado ni de Shifty.
   */
  hourlyCostEur: number | null
  /**
   * Puestos de mando que solo se contratan a jornada completa (jefe de
   * cocina, encargado, responsable de turno). El cuadrante no les baja a
   * parcial aunque sus horas asignadas quepan en uno.
   */
  fullTimeOnly: boolean
}

/** Un área del local: Sala, Cocina, y las que el usuario añada. */
export interface Block {
  id: string
  name: string
  color: string
}

// ─────────────────────────────────────────────────────────────
// Tramos — el input clave del usuario
// ─────────────────────────────────────────────────────────────

/**
 * "De 11 a 25 comensales necesito 2 camareros, 1 de cocina y 1 office."
 *
 * `staff` mapea roleId → nº de personas. `to` en el último tramo es Infinity.
 */
export interface Tier {
  id: string
  from: number
  to: number
  staff: Record<string, number>
  /**
   * Suelo y techo por puesto en este tramo, `roleId → personas`. La cifra de
   * `staff` es el objetivo; estos dos son los límites operativos entre los que
   * puede moverse cuando algo empuja el número (hoy, el mínimo por local).
   * Sin entrada = sin límite por ese lado.
   */
  staffMin?: Record<string, number>
  staffMax?: Record<string, number>
}

export interface StaffingModel {
  blocks: Block[]
  roles: Role[]
  tiers: Tier[]
}

// ─────────────────────────────────────────────────────────────
// Ajustes
// ─────────────────────────────────────────────────────────────

export interface ContractType {
  id: string
  /** Horas semanales de la jornada. */
  hours: number
  label: string
  enabled: boolean
}

export interface Settings {
  /**
   * Desfase del dato, en minutos: el fichero marca la hora del cobro y se cobra
   * al terminar, así que la curva viene retrasada respecto al trabajo real.
   * Se adelanta la curva esta cantidad. Uno solo, global, igual para todos los
   * puestos y bloques.
   */
  lagMinutes: number
  /** Porcentaje de semanas que se quieren cubrir con plantilla fija (0-100). */
  coveragePct: number
  /**
   * Colchón deliberado sobre la demanda, en tanto por ciento. Es una decisión
   * de negocio distinta de la cobertura: la cobertura elige QUÉ semanas se
   * cubren, y esto añade holgura DENTRO de la semana elegida, para no ir al
   * límite si un día entra más gente de la prevista. 0 = sin colchón.
   */
  safetyMarginPct: number
  /**
   * Cómo se construye la semana tipo. 'calibrado' hace que el total coincida
   * con el percentil pedido; 'conservador' aplica el percentil a cada franja
   * por separado y sale una plantilla mayor. Ver lib/demand.ts.
   */
  sizingMode: 'calibrado' | 'conservador'
  /** Permitir jornada partida al montar el cuadrante. */
  allowSplitShifts: boolean
  /** Garantizar dos días de libranza consecutivos. */
  consecutiveDaysOff: boolean
  /**
   * Exigir 12h de descanso entre el fin de un turno y el inicio del
   * siguiente de la misma persona (Art. 34.3 ET), incluida la vuelta del
   * domingo al lunes al repetirse la semana. Es un mínimo legal en España,
   * así que por defecto va activado.
   */
  minRestBetweenShifts: boolean
  /**
   * Ventas de una semana normal, en euros. Es el ÚNICO dato que la herramienta
   * pide y no puede sacar del histórico, y sirve para el ratio con el que de
   * verdad piensa un hostelero: cuánto se lleva el personal de lo que entra.
   * `null` = no lo ha puesto, y entonces no se enseña ningún porcentaje.
   */
  weeklySalesEur: number | null
  /**
   * ¿Se calculan también los costes?
   *
   * Apagado de partida. Con él apagado no se pide ningún precio por hora ni se
   * enseña ninguna cifra de dinero: la herramienta se queda en personas, horas
   * y cuadrante, que es lo que casi todo el mundo viene a buscar. Media
   * pantalla de campos de euros que nadie va a rellenar solo estorba.
   *
   * Al encenderlo aparece la columna de coste por hora en el catálogo de
   * puestos y, con ella, el coste semanal y anual y el ratio sobre ventas.
   *
   * Puede llegar `undefined` desde un guardado anterior a que existiera: eso
   * se lee como apagado, que es el lado seguro. Nunca se enseña un precio que
   * el usuario no haya escrito.
   */
  calcularCostes?: boolean
  /**
   * Minutos de preparación antes de abrir y de cierre después de cerrar: la
   * mise en place, el montaje, la limpieza. El horario que edita el usuario es
   * el horario AL PÚBLICO; la gente entra antes y sale después.
   *
   * No añade personal de servicio (a esas horas no hay comensales y no hay
   * tramo): lo que hace es estirar la ventana en la que se garantiza el mínimo
   * por local, que es exactamente la gente que abre y cierra.
   */
  prepBeforeMin: number
  prepAfterMin: number
  /**
   * Mínimo de personas que tiene que haber en cada bloque (Sala, Cocina...)
   * durante TODO su horario de apertura, aunque la curva de comensales pida
   * menos o nada — el que abre, cierra o limpia. `blockId → personas`; un
   * bloque sin entrada o a 0 no lleva mínimo. Ver `applyOpeningMinimums`.
   */
  minStaffByBlock: Record<string, number>
  /** Duración máxima de un turno, o de cada bloque si la jornada es partida (minutos). */
  maxShiftMinutes: number
  /** Duración mínima de un turno, para no generar turnos de una hora suelta (minutos). */
  minShiftMinutes: number
  contracts: ContractType[]
}

// ─────────────────────────────────────────────────────────────
// Resultados
// ─────────────────────────────────────────────────────────────

/** Necesidad de personal ya calculada: `[roleId][day][slot]` = nº de personas. */
export type NeedGrid = Record<string, number[][]>

export interface NeedSummary {
  /** Horas-persona a la semana, por puesto. */
  hoursByRole: Record<string, number>
  /** Horas-persona a la semana, por bloque. */
  hoursByBlock: Record<string, number>
  totalHours: number
  /** Pico simultáneo de personas, y cuándo ocurre. */
  peak: { people: number; day: DayIndex; slot: number }
}

export interface ContractAllocation {
  contractId: string
  hours: number
  count: number
}

export interface StaffPlan {
  allocations: ContractAllocation[]
  totalPeople: number
  /** Horas contratadas, que serán algo más que las necesarias por el encaje de turnos. */
  contractedHours: number
  /** Horas que pide la curva de necesidad, sin más. */
  neededHours: number
  /** Horas que suman los turnos del cuadrante: la necesidad más el turno mínimo. */
  assignedHours: number
  /** Horas de más que se pagan por no poder cuadrar los turnos al minuto. */
  slackHours: number
  /**
   * Por qué salen tantas personas. La plantilla no la marcan las horas: la marca
   * el pico simultáneo. Si el sábado a las 14:00 hacen falta 7 camareros a la
   * vez, hay 7 camareros en nómina aunque entre todos sumen 4 jornadas.
   */
  drivers: {
    /** Jornadas completas que darían las horas necesarias. El número engañoso. */
    fteFromHours: number
    /** Personas que impone el pico simultáneo, sumando el de cada puesto. */
    peopleFromPeak: number
    /**
     * Personas que impone el CALENDARIO: nadie puede trabajar los siete días,
     * así que un puesto con 34 turnos a la semana necesita al menos siete
     * personas aunque nunca coincidan más de cinco a la vez.
     *
     * Es el motivo que faltaba. Con los datos de ejemplo el pico pide 17
     * personas y salen 19: las dos que sobran no son holgura del cálculo, son
     * el responsable de sala y el cocinero que hacen falta para cubrir todos
     * los días. Sin decirlo, esas dos parecen un fallo.
     */
    peopleFromDays: number
    /** Pico simultáneo por puesto, para poder señalar al culpable. */
    peakByRole: { roleId: string; peak: number; people: number; hours: number }[]
  }
}

/** Un turno del cuadrante. Puede tener dos bloques si la jornada es partida. */
export interface Shift {
  id: string
  personId: string
  roleId: string
  day: DayIndex
  blocks: { startMin: number; endMin: number }[]
  hours: number
}

export interface Person {
  id: string
  label: string
  roleId: string
  contractId: string
  contractHours: number
  assignedHours: number
  daysOff: DayIndex[]
}

export interface Roster {
  people: Person[]
  shifts: Shift[]
  /** Franjas que el cuadrante no llega a cubrir: `[roleId][day][slot]` = personas que faltan. */
  uncovered: Record<string, number[][]>
  uncoveredHours: number
}

/** Los picos que quedan por encima de la línea de cobertura: el argumento de Shifty. */
export interface PeakAnalysis {
  /** Semanas del histórico por encima de la línea. */
  peakWeeks: number[]
  /** Horas-persona al año que quedan fuera de la plantilla fija. */
  peakHoursPerYear: number
  /** La peor semana del año y cuánta gente le falta. Es el titular. */
  worstWeek: { isoWeek: number; extraHours: number; extraPeople: number } | null
  /** Gente que falta de media en una semana punta. */
  avgExtraPeople: number
  /** Semanas de sueldo que pagarías por cada semana punta trabajada, si contratases fijo. */
  weeksPaidPerWeekWorked: number
  /** Cuántas de las 52 semanas cubre la plantilla fija. */
  weeksCovered: number
}
