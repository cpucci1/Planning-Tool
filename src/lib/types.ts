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
  /**
   * La semana no viene en el fichero y se ha puesto a cero (ronda 6): un hueco
   * dentro del fichero ('hueco', el local estaba cerrado) o una semana fuera
   * del periodo que trae, cuando el usuario dice que solo abre ese periodo
   * ('fuera'). Sin dato, es una semana del fichero.
   */
  relleno?: 'hueco' | 'fuera'
}

/**
 * Lo que cubre el fichero (ronda 6, G1 y G3 de cálculo). Un TPV solo escribe
 * las semanas que abre: un chiringuito de 23 semanas trae 23 semanas, y sin
 * esto se pagaban 52.
 */
export interface PeriodoDelFichero {
  /** Primer y último día que cuentan, 'YYYY-MM-DD'. */
  desde: string
  hasta: string
  primeraSemana: number
  ultimaSemana: number
  /** Semanas del año (de 52) antes de la primera y después de la última. */
  semanasFuera: number
  /** Lo que se usa: el local solo abre este periodo y el resto del año está cerrado. */
  soloEstePeriodo: boolean
  /** Lo que propuso la lectura, antes de que el usuario dijera nada. */
  propuesto: boolean
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
    /** Lo que cubre el fichero. Solo en ficheros leídos; el ejemplo trae el año entero. */
    periodo?: PeriodoDelFichero
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
  /**
   * Cómo se planifica el puesto.
   *
   * - `'volumen'` (o sin dato, que es lo de los planes guardados antes de que
   *   existiera): sale de la tabla de tramos, más gente cuantos más comensales.
   * - `'estructura'`: un mando (encargado, responsable de turno, jefe de
   *   cocina). No sale de los tramos: el usuario dice cuántos hay y su jornada,
   *   y el cuadrante les da turnos enteros y garantiza que mientras su zona
   *   esté abierta siempre haya uno al frente. Ver `planificarMandos` en
   *   `roster.ts`.
   */
  kind?: 'volumen' | 'estructura'
  /** Solo mandos: cuántas personas de este puesto tiene el local. */
  headcount?: number
  /** Solo mandos: horas semanales de su jornada. Sin dato, la jornada completa. */
  weeklyHours?: number
  /**
   * Lo cubren menores de 18 años (un ayudante en prácticas, un extra de
   * verano). La ley les prohíbe el trabajo de noche, de 22:00 a 06:00, y más
   * de 8 h al día (Art. 6 ET), y la revisión del cuadrante avisa si algún
   * turno de este puesto lo incumple. Sin dato, no.
   */
  menores?: boolean
  /**
   * Se queda a recoger después del último servicio del día (el office que
   * friega la vajilla de la cena). Ronda 3, M6: sin esto, el office se iba
   * cuando bajaba la sala y la vajilla de la cena se quedaba sin nadie.
   * Opcional: un plan de antes no lo trae y sigue igual.
   */
  cierraServicio?: boolean
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
   *
   * ⚠️ Solo cuenta en los planes de antes del 2026-11-04, que no traen
   * `mealMinutes`. Con `mealMinutes` la curva ya se convierte a sentados a la
   * vez, que es lo mismo bien hecho, y aplicar las dos la movería dos veces.
   */
  lagMinutes: number
  /**
   * Cuánto dura sentada una mesa, de media, en minutos: a mediodía y por la
   * noche (el corte, a las 18:00 de la hora del cobro, está en `MEAL_CUT_MIN`;
   * con la merienda, la tarde de 17:30 a 20:00 va aparte).
   * Con esto la curva de cobros se convierte en PERSONAS SENTADAS A LA VEZ
   * (`seatedAtOnce`), y los tramos se leen en esa escala.
   *
   * Opcional a propósito: un plan guardado o compartido antes del 2026-11-04 no
   * lo trae, y entonces se calcula como entonces (desfase y cobros por media
   * hora), porque sus tramos están escritos en la escala vieja.
   *
   * Desde la ronda 5 lleva también el desayuno (cobros antes de las 12:30) y
   * las copas (de la 01:00 en adelante). Sin ellos, el desayuno cuenta como
   * comida y las copas como cena, como en los planes de antes (ver
   * `duracionDeEstancia` en `demand.ts`).
   *
   * Desde la ronda 8 lleva la merienda o el café de la tarde (cobros de 17:30
   * a 20:00, `MERIENDA_DESDE_MIN`). Sin ella, el corte entre comida y cena
   * sigue a las 18:00, como en los planes de antes.
   */
  mealMinutes?: { midday: number; night: number; breakfast?: number; drinks?: number; merienda?: number }
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
   * Preparación y recogida por zona (`blockId → minutos antes y después`). A
   * diferencia de los dos campos de arriba, que solo estiran la ventana del
   * mínimo por local, esto alarga el turno del equipo que abre y del que
   * cierra (`applyPrep`). Si está, manda sobre los dos de arriba, que se quedan
   * a 0 y solo los leen los planes guardados antes del 2026-11-04.
   */
  prepByBlock?: Record<string, { beforeMin: number; afterMin: number }>
  /**
   * Puesto que abre y cierra cada zona (`blockId → roleId`), el que cubre el
   * mínimo por local. Sin entrada, `openingRoleFor` toma el más básico con
   * gente en los tramos.
   */
  openingRoleByBlock?: Record<string, string>
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
  /**
   * Máximo de horas de trabajo de una persona en un día, sumando los dos
   * bloques si la jornada es partida (minutos). La ley pone 9 h ordinarias
   * salvo que el convenio diga otra cosa. Sin dato (plan guardado antes), 9 h.
   */
  maxDailyMinutes?: number
  /**
   * Contratos parciales de cualquier número de horas (22 h, 34 h...) en vez de
   * solo los de la lista `contracts`. Sin dato, encendido: es lo que pidió la
   * revisión del 2026-11-04 (punto 8).
   */
  contratosAMedida?: boolean
  /** Horas mínimas de un contrato parcial cuando van a medida. Sin dato, 10. */
  minContractHours?: number
  contracts: ContractType[]
  /**
   * Qué es la cifra por hora del catálogo de puestos (ronda 2, 2026-11-04).
   *
   * - `'bruto'`: el sueldo bruto por hora de contrato, pagas extra incluidas
   *   (el bruto del año entre las horas del contrato). Encima se suma la
   *   Seguridad Social de la empresa (`cotizacionEmpresaPct`).
   * - `'empresa'` o sin dato: ya es coste de empresa y se usa tal cual. Es lo
   *   que hacían los planes guardados antes de esta fecha, y por eso es lo que
   *   se lee cuando falta: sumarles la Seguridad Social por debajo les subiría
   *   el coste sin que nadie haya tocado nada.
   */
  costeBase?: 'bruto' | 'empresa'
  /** Seguridad Social a cargo de la empresa, en % sobre el bruto. Sin dato, 32. */
  cotizacionEmpresaPct?: number
  /**
   * Plus de nocturnidad, en % sobre el bruto de cada hora trabajada entre las
   * 22:00 y las 06:00 (art. 36.2 ET; el porcentaje lo fija el convenio, y hay
   * convenios que no lo pagan si el trabajo es nocturno por naturaleza). Sin
   * dato, 0: no se inventa, pero la pantalla dice cuántas horas nocturnas hay
   * para que quien lo pague lo ponga (ronda 3, 2026-11-04).
   */
  plusNocturnidadPct?: number
  /** Días naturales de vacaciones al año (art. 38.1 ET: 30). Sin dato, 30. */
  vacacionesDias?: number
  /** Festivos al año que se libran o se compensan con un día libre (art. 37.2 ET: 14). Sin dato, 14. */
  festivosDias?: number
  /** Bajas: % del tiempo disponible que se pierde por enfermedad o accidente. Sin dato, 6. */
  bajasPct?: number
  /** Horas complementarias pactadas de los parciales, en % de su jornada (art. 12.5 ET: hasta 30, o 60 por convenio). Sin dato, 30. */
  complementariasPct?: number
  /**
   * Trabajo fijo por puesto y servicio: lo que no depende de los comensales
   * (la mise en place de cocina, la limpieza de office). Ver `TrabajoFijo` y
   * `applyTrabajoFijo` en `staffing.ts`. Sin dato, ninguno.
   */
  trabajoFijo?: TrabajoFijo[]
}

/**
 * "Cocina necesita 1 cocinero 60 min antes de cada servicio", "office, 1
 * persona 30 min de limpieza después de cada servicio". Es el estándar fijo de
 * Fourth o UniFocus: se pinta siempre, haya los comensales que haya, porque un
 * martes flojo también hay que montar y limpiar.
 *
 * Servicio = cada tramo del horario de la zona de ese puesto (comida y cena).
 * Se suma por máximo con lo que ya pide la curva y la preparación, no encima:
 * si ya entra un cocinero a preparar, ese cuenta.
 */
export interface TrabajoFijo {
  id: string
  roleId: string
  momento: 'antes' | 'despues'
  minutos: number
  personas: number
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
   * De qué salen las horas pagadas sin servicio, sumando exacto `slackHours`:
   * las que la gente está en el local de más (la misma cifra que "Horas de
   * más" de las métricas) y las de contrato sin turno. Ronda 3.
   */
  slackDesglose?: { enElLocal: number; sinTurno: number }
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
    /**
     * De dónde sale cada persona, sumando EXACTO `totalPeople`: el pico de cada
     * puesto, lo que añade el calendario, lo que añaden los contratos y
     * horarios (turnos que no encajan al minuto) y los mandos. Ronda 3.
     */
    desglose?: {
      pico: number
      calendario: number
      contratosYHorarios: number
      mandos: number
      /**
       * Plazas del pico que no son personas del equipo porque las hace un
       * mando mientras está (ronda 6, M5): el responsable de sala que cubre
       * el encargado. No suman en el total; se dicen aparte.
       */
      picoQueCubreElMando?: number
    }
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
  /** Turno tipo del que sale: "Mañana", "Tarde", "Cierre", "Partido"... */
  tipo?: string
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
  /**
   * Lo que pasó con los mandos de cada zona que los tiene: cuántos dijo el
   * usuario, cuántos hacen falta para que siempre haya uno al frente, y los
   * minutos a la semana que se quedan sin mando aun así. Vacío si no hay mandos.
   */
  /**
   * Lo que ahorran las jornadas partidas de los puestos de volumen: cuántas
   * personas más harían falta con todo seguido, y en cuántos puestos se ha
   * elegido partir. Las partidas de los mandos no cuentan aquí: el mando parte
   * para estar en los dos servicios, no para ahorrar a nadie. Ronda 3.
   */
  partidas?: { personasAhorradas: number; roles: number }
  /**
   * Puestos que pedían tan pocas horas a la semana que no daban para un
   * contrato (revisión ronda 8, M2): sus horas las hace otro puesto de la
   * misma zona. El ayudante de una cafetería pedía 1,5 h y salía una persona
   * de 10 h que venía un día. La revisión lo dice (`avisos.ts`).
   */
  plegados?: { roleId: string; haciaRoleId: string; horas: number }[]
  mandos?: {
    blockId: string
    pedidos: number
    necesarios: number
    /** Puesto con el que se ha completado lo que faltaba. */
    roleIdAnadido: string | null
    minutosSinMando: number
    /** Días con la zona abierta y ningún mando (sus libranzas). Ronda 3. */
    diasSinMando?: DayIndex[]
    /** Puesto que se queda al frente cuando no hay mando: el primero de la zona con gente. */
    segundoRoleId?: string | null
    /** Minutos con la zona abierta sin nadie de ella, ni mando ni equipo. */
    minutosSinNadie?: number
    /**
     * Quién queda al frente cada día que libra el mando (ronda 5): la persona
     * del equipo de la zona que más rato está ese día. Si el puesto de
     * responsable solo salía para esos días, su trabajo lo hace un veterano
     * del equipo en vez de crear un contrato pequeño (`relevoEnEquipo`).
     */
    alFrente?: { day: DayIndex; personId: string }[]
    /** El trabajo del responsable de los días sin mando lo hace el equipo, no un puesto aparte. */
    relevoEnEquipo?: boolean
  }[]
}

/** Los picos que quedan por encima de la línea de cobertura: el argumento de Shifty. */
export interface PeakAnalysis {
  /** Semanas del histórico por encima de la línea. */
  peakWeeks: number[]
  /** Horas-persona al año que quedan fuera de la plantilla fija. */
  peakHoursPerYear: number
  /** La peor semana del año y cuánta gente le falta. Es el titular. */
  /**
   * La peor semana punta (ronda 7, G2). `extraPeople` es cuánta gente más
   * coincide A LA VEZ en su peor momento que en el de una semana normal
   * (puede ser 0: más horas, no más gente); `jornadasPorHoras`, sus horas de
   * más entre la jornada completa, con un decimal; `personasParaContratar`,
   * las personas que habría que meter en nómina (las de más a la vez, o las
   * que pidan las horas si no caben); y `horasContratoSemana`, las horas de
   * contrato que sumarían, que es lo que se paga todo el año.
   */
  worstWeek: {
    isoWeek: number
    extraHours: number
    extraPeople: number
    jornadasPorHoras?: number
    personasParaContratar?: number
    horasContratoSemana?: number
  } | null
  /** Gente que falta de media en una semana punta. */
  avgExtraPeople: number
  /** Semanas de sueldo que pagarías por cada semana punta trabajada, si contratases fijo. */
  weeksPaidPerWeekWorked: number
  /** Cuántas de las 52 semanas cubre la plantilla fija. */
  weeksCovered: number
  /** Horas que faltan en cada semana punta, para repartir las horas complementarias semana a semana. */
  extraHoursByWeek?: { isoWeek: number; extraHours: number }[]
  /**
   * Días que se han dejado fuera por raros (más de tres veces lo normal de su
   * día de la semana): se cuentan como un día normal. Ronda 3.
   */
  diasRaros?: { isoWeek: number; day: number; veces: number }[]
}
