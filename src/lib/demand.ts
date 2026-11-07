/**
 * De 52 semanas de histórico a una semana tipo.
 *
 * Dos decisiones de método que condicionan todo el resultado:
 *
 * 1. EL DESFASE ES UNA CORRECCIÓN DE LA HORA DEL DATO. El fichero que sale del
 *    TPV marca la hora del COBRO, y se cobra al terminar — unos 30 minutos
 *    después de que el trabajo haya ocurrido. Así que la curva del fichero va
 *    sistemáticamente tarde: los 60 comensales que aparecen a las 15:00 se
 *    atendieron en realidad sobre las 14:30.
 *    La corrección es adelantar la curva ese desfase. No es una estimación ni
 *    un colchón de seguridad: es enderezar un sesgo conocido del dato. Por eso
 *    es un desplazamiento limpio y no un máximo móvil, que ensancharía los
 *    picos y sobredimensionaría la plantilla.
 *
 * 2. EL PERCENTIL SE CALIBRA. Aplicar el percentil 80 franja a franja y sumar
 *    NO da el percentil 80 de la semana: da bastante más, porque los máximos de
 *    cada franja no ocurren todos en la misma semana (es el factor de
 *    diversidad de toda la vida). Si el usuario ha dicho "quiero cubrir 42 de
 *    52 semanas", la plantilla tiene que salir para 42 de 52 — no para 50.
 *    Por eso se busca el percentil por franja cuyo total semanal coincide con
 *    el percentil pedido del total. Quien quiera el cálculo conservador lo tiene
 *    en ajustes avanzados.
 */

import { SLOTS_PER_DAY, SLOT_MINUTES, GRID_START_MIN } from './time'
import type { DemandDataset, OpeningHours, PeriodoDelFichero, SpecialWeek, WeekDemand } from './types'

/**
 * Percentil por interpolación lineal, el mismo método que PERCENTILE de Excel.
 * `p` va de 0 a 1.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** Semanas que entran en el cálculo: las que el usuario no ha excluido. */
export function usableWeeks(dataset: DemandDataset, specials: SpecialWeek[]): WeekDemand[] {
  const excluded = new Set(specials.filter((s) => s.excluded).map((s) => s.isoWeek))
  const weeks = dataset.weeks.filter((w) => !excluded.has(w.isoWeek))
  if (weeks.length >= 8) return weeks
  // Si el usuario excluye tanto que no queda casi nada, mejor calcular sobre
  // todas las semanas que el local ABRE que sobre tres sueltas. Nunca sobre
  // las cerradas (ronda 6, G3): un pop up de 6 semanas con el resto del año a
  // cero salía con una semana tipo de 0 cobros y cuatro mandos sin equipo.
  const cierre = new Set(specials.filter((s) => s.kind === 'cierre').map((s) => s.isoWeek))
  const abiertas = dataset.weeks.filter((w) => !cierre.has(w.isoWeek) && w.total > 0)
  if (abiertas.length >= weeks.length && abiertas.length > 0) return abiertas
  return weeks.length > 0 ? weeks : dataset.weeks
}

/** Semanas que se cuentan en un año: las de pago (`WEEKS_PER_YEAR` en contracts). */
const SEMANAS_DEL_ANO = 52
/** Un fichero de menos semanas no es una temporada: es una muestra. */
const TEMPORADA_MIN_SEMANAS = 4
/** De aquí para arriba, lo que falta son vacaciones, no temporada. */
const TEMPORADA_MAX_SEMANAS = 44
/** Si el fichero acaba a menos de esto de hoy, es un export de los últimos meses. */
const EXPORT_RECIENTE_DIAS = 28

/** Una semana a cero, para un hueco del fichero o una semana fuera de su periodo. */
export function semanaVacia(year: number, isoWeek: number, relleno: 'hueco' | 'fuera'): WeekDemand {
  const jan4 = Date.UTC(year, 0, 4)
  const lunes1 = jan4 - (((new Date(jan4).getUTCDay() || 7) - 1) * 86_400_000)
  return {
    isoWeek,
    year,
    startDate: new Date(lunes1 + (isoWeek - 1) * 7 * 86_400_000).toISOString().slice(0, 10),
    days: Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0)),
    total: 0,
    relleno,
  }
}

/**
 * Qué cubre el fichero y qué se propone hacer con el resto del año (ronda 6).
 *
 * Fuera del fichero puede haber una temporada cerrada o, simplemente, meses
 * que no se exportaron. El fichero no lo sabe, así que se propone y la
 * pantalla lo pregunta. Se propone temporada si el fichero trae entre 4 y 44
 * semanas y no acaba en las últimas cuatro semanas: un export de "los últimos
 * seis meses" llega hasta casi hoy; el de un chiringuito del año pasado, no.
 */
export function periodoDelFichero(p: {
  year: number
  desde: string
  hasta: string
  primeraSemana: number
  ultimaSemana: number
  /** Semanas que traen datos de verdad, sin los huecos rellenados. */
  semanasConDatos: number
  hoy: Date
}): PeriodoDelFichero {
  const ultima = Math.min(SEMANAS_DEL_ANO, p.ultimaSemana)
  const semanasFuera = Math.max(0, p.primeraSemana - 1) + Math.max(0, SEMANAS_DEL_ANO - ultima)
  const largo = ultima - p.primeraSemana + 1
  const diasDesdeElFinal = (p.hoy.getTime() - Date.parse(p.hasta)) / 86_400_000
  const propuesto =
    semanasFuera > 0 &&
    largo >= TEMPORADA_MIN_SEMANAS &&
    largo <= TEMPORADA_MAX_SEMANAS &&
    // Un fichero de tres filas sueltas no es una temporada: hace falta que
    // las semanas del periodo traigan datos (dos de cada tres, al menos).
    p.semanasConDatos >= TEMPORADA_MIN_SEMANAS &&
    p.semanasConDatos * 3 >= largo * 2 &&
    diasDesdeElFinal > EXPORT_RECIENTE_DIAS
  return {
    desde: p.desde,
    hasta: p.hasta,
    primeraSemana: p.primeraSemana,
    ultimaSemana: p.ultimaSemana,
    semanasFuera,
    soloEstePeriodo: propuesto,
    propuesto,
  }
}

/**
 * Las semanas con el resto del año cerrado (`solo`) o sin él. Cerrado = una
 * semana a cero por cada semana del año fuera del fichero, que la lectura de
 * semanas raras marca como cierre y `temporadaDelLocal` deja sin pagar.
 */
export function conPeriodoAbierto(
  weeks: WeekDemand[],
  year: number,
  periodo: Pick<PeriodoDelFichero, 'primeraSemana' | 'ultimaSemana'>,
  solo: boolean,
): WeekDemand[] {
  const propias = weeks.filter((w) => w.relleno !== 'fuera')
  if (!solo) return propias
  const presentes = new Set(propias.map((w) => w.isoWeek))
  const out = [...propias]
  // Un periodo que cruza el cambio de año (de la semana 40 a la 12) va de la
  // primera al final del año y del principio a la última (ronda 7).
  const cruza = periodo.primeraSemana > periodo.ultimaSemana
  for (let n = 1; n <= SEMANAS_DEL_ANO; n++) {
    const dentro = cruza
      ? n >= periodo.primeraSemana || n <= periodo.ultimaSemana
      : n >= periodo.primeraSemana && n <= periodo.ultimaSemana
    if (dentro) continue
    if (!presentes.has(n)) out.push(semanaVacia(year, n, 'fuera'))
  }
  return out.sort((a, b) => a.isoWeek - b.isoWeek)
}

/**
 * Los valores de cada franja, ya ordenados, para las 52 semanas.
 * `[dia][franja]` → array ordenado de comensales.
 *
 * Ordenar es todo el coste de sacar un percentil, y al arrastrar la línea eso
 * se repite cientos de veces con las mismas semanas. Se ordena una vez y a
 * partir de ahí cada percentil es una lectura por índice.
 */
export type SortedDemand = number[][][]

export function sortDemand(weeks: WeekDemand[]): SortedDemand {
  const out: SortedDemand = []
  for (let d = 0; d < 7; d++) {
    const row: number[][] = []
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const values = new Array<number>(weeks.length)
      for (let w = 0; w < weeks.length; w++) values[w] = weeks[w].days[d][s]
      values.sort((a, b) => a - b)
      row.push(values)
    }
    out.push(row)
  }
  return out
}

/** Semana tipo cruda: percentil `p` aplicado a cada franja por separado. */
export function typicalWeekRaw(sorted: SortedDemand, p: number): number[][] {
  const out: number[][] = []
  for (let d = 0; d < 7; d++) {
    const row = new Array<number>(SLOTS_PER_DAY)
    for (let s = 0; s < SLOTS_PER_DAY; s++) row[s] = Math.round(percentile(sorted[d][s], p))
    out.push(row)
  }
  return out
}

/** Solo el total, sin construir la semana. Es lo único que necesita la calibración. */
function totalAtPercentile(sorted: SortedDemand, p: number): number {
  let t = 0
  for (let d = 0; d < 7; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) t += Math.round(percentile(sorted[d][s], p))
  }
  return t
}

function totalOf(week: number[][]): number {
  let t = 0
  for (const d of week) for (const v of d) t += v
  return t
}

/**
 * Percentil por franja que reproduce el total semanal pedido.
 *
 * Búsqueda binaria sobre p. Converge en ~14 iteraciones sobre 52×7×44 valores,
 * que en un portátil son milisegundos, y el resultado se cachea aguas arriba.
 */
export function calibratedSlotPercentile(sorted: SortedDemand, targetTotal: number): number {
  let lo = 0
  let hi = 1
  let best = 0.5
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    const total = totalAtPercentile(sorted, mid)
    best = mid
    if (total > targetTotal) hi = mid
    else lo = mid
    if (Math.abs(total - targetTotal) / Math.max(1, targetTotal) < 0.002) break
  }
  return best
}

export type SizingMode = 'calibrado' | 'conservador'

/**
 * Semana tipo definitiva.
 *
 * - `calibrado`: el total semanal coincide con el percentil pedido. Es lo que
 *   el usuario cree que está pidiendo cuando arrastra la línea.
 * - `conservador`: percentil aplicado a cada franja. Cada media hora queda
 *   cubierta el % pedido, a costa de una plantilla mayor.
 */
export function typicalWeek(
  weeks: WeekDemand[],
  coveragePct: number,
  mode: SizingMode = 'calibrado',
  sorted?: SortedDemand,
): number[][] {
  const p = coveragePct / 100
  const data = sorted ?? sortDemand(weeks)
  if (mode === 'conservador' || weeks.length === 0) return typicalWeekRaw(data, p)

  const totals = weeks.map((w) => w.total).sort((a, b) => a - b)
  const target = percentile(totals, p)
  return typicalWeekRaw(data, calibratedSlotPercentile(data, target))
}

/**
 * Cuánto se infla la semana tipo conservadora respecto a la semana real que
 * está en ese percentil. Se enseña al usuario para justificar la calibración.
 */
export function typicalWeekInflation(
  weeks: WeekDemand[],
  coveragePct: number,
  sorted?: SortedDemand,
): {
  conservativeTotal: number
  referenceTotal: number
  inflationPct: number
} {
  const p = coveragePct / 100
  const conservativeTotal = totalOf(typicalWeekRaw(sorted ?? sortDemand(weeks), p))
  const totals = weeks.map((w) => w.total).sort((a, b) => a - b)
  const referenceTotal = percentile(totals, p)
  return {
    conservativeTotal,
    referenceTotal: Math.round(referenceTotal),
    inflationPct: referenceTotal > 0 ? ((conservativeTotal - referenceTotal) / referenceTotal) * 100 : 0,
  }
}

/**
 * Umbral de comensales semanales que corresponde a una cobertura dada, y las
 * semanas que quedan por encima. Es lo que alimenta la línea arrastrable.
 */
export function coverageThreshold(weeks: WeekDemand[], coveragePct: number): {
  threshold: number
  weeksCovered: number
  peakWeeks: number[]
} {
  const totals = weeks.map((w) => w.total).sort((a, b) => a - b)
  const threshold = percentile(totals, coveragePct / 100)
  const peakWeeks = weeks.filter((w) => w.total > threshold).map((w) => w.isoWeek)
  return {
    threshold: Math.round(threshold),
    weeksCovered: weeks.length - peakWeeks.length,
    peakWeeks,
  }
}

/**
 * Cobertura que corresponde a un umbral. Es la inversa de `coverageThreshold`,
 * y la que hace falta mientras el usuario arrastra la línea: él mueve un valor
 * en comensales, nosotros le devolvemos el porcentaje.
 */
export function coverageFromThreshold(weeks: WeekDemand[], threshold: number): number {
  if (weeks.length === 0) return 0
  return (weeks.filter((w) => w.total <= threshold).length / weeks.length) * 100
}

/**
 * El porcentaje de cobertura que de verdad corresponde a las semanas cubiertas.
 *
 * El 80 % de partida es un percentil: con 52 semanas cae entre la 41 y la 42, y
 * cubre 41, que son el 79 %. La línea del gráfico enseñaba "79 % · 41/52" y el
 * texto de al lado "80 % del histórico", que se lee como un error de cálculo.
 * Se ajusta el porcentaje a lo que cubre (79), y solo si con ese porcentaje se
 * siguen cubriendo exactamente las mismas semanas: así la línea no se mueve, y
 * llamar dos veces da lo mismo (nunca entra en bucle).
 */
export function coherentCoveragePct(weeks: WeekDemand[], coveragePct: number): number {
  if (weeks.length === 0) return coveragePct
  const covered = coverageThreshold(weeks, coveragePct).weeksCovered
  const pct = Math.min(99, Math.max(1, Math.round((covered / weeks.length) * 100)))
  if (pct === coveragePct) return coveragePct
  return coverageThreshold(weeks, pct).weeksCovered === covered ? pct : coveragePct
}

/**
 * "Quedarse corto es 4 veces más grave que sobrar" — la lectura en cristiano
 * del percentil elegido. Es el ratio crítico del modelo del vendedor de
 * periódicos, y ayuda al usuario a decidir mejor que un porcentaje pelado.
 */
export function riskRatio(coveragePct: number): number {
  const p = Math.min(0.98, Math.max(0.02, coveragePct / 100))
  return Math.round((p / (1 - p)) * 10) / 10
}

/**
 * Corrige el desfase del dato: adelanta la curva `lagMinutes`, porque el
 * fichero marca la hora del cobro y se cobra después de trabajar.
 *
 * Es un desplazamiento puro: `corregida[s] = fichero[s + desfase]`. Con
 * desfases que no son múltiplo de 30 se interpola entre las dos franjas
 * afectadas, para no dar saltos artificiales.
 *
 * Lo que se sale por el final se descarta y lo que queda al descubierto se
 * rellena con ceros, que es lo correcto: no hay dato de después del cierre.
 */
export function applyLag(week: number[][], lagMinutes: number): number[][] {
  const span = lagMinutes / SLOT_MINUTES
  if (span === 0) return week.map((d) => [...d])

  const whole = Math.floor(span)
  const frac = span - whole

  return week.map((day) => {
    const at = (i: number) => (i >= 0 && i < SLOTS_PER_DAY ? day[i] : 0)
    const out = new Array<number>(SLOTS_PER_DAY).fill(0)
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const a = at(s + whole)
      const b = at(s + whole + 1)
      out[s] = Math.round(a * (1 - frac) + b * frac)
    }
    return out
  })
}

/** Minuto absoluto de rejilla en el que empieza la franja `s`. */
function slotMin(s: number): number {
  return GRID_START_MIN + s * SLOT_MINUTES
}

/**
 * Hora que separa la comida de la cena para saber cuánto dura la mesa: un
 * cobro antes de las 18:00 es de mediodía, uno de las 18:00 en adelante es de
 * noche. Las comidas se cobran como muy tarde a las 17:00 y las cenas empiezan
 * a cobrarse pasadas las 20:00, así que el corte cae en la hora muerta de casi
 * cualquier local.
 */
export const MEAL_CUT_MIN = 18 * 60

/**
 * Corte entre el desayuno y la comida (revisión ronda 5, G2): un cobro antes de
 * las 12:30 es de desayuno o almuerzo. Las comidas se empiezan a cobrar pasadas
 * las 13:30, y el café de media mañana se cobra antes de mediodía.
 */
export const DESAYUNO_CUT_MIN = 12 * 60 + 30

/**
 * Corte entre la cena y las copas: un cobro de la 01:00 en adelante es de
 * copas. Las cenas se cobran como muy tarde a la una; lo que se cobra después
 * es barra de noche.
 */
export const COPAS_CUT_MIN = 25 * 60

/**
 * El servicio de tarde (revisión ronda 8, M1): el café, la merienda o la caña
 * de media tarde. Un cobro de las 17:30 a las 20:00 no es una comida (las
 * comidas se cobran como muy tarde a las 17:30) ni una cena (las cenas se
 * empiezan a cobrar a partir de las 20:00). Antes una cafetería con mucho
 * movimiento de 16 a 19 h contaba cada café de la tarde como una comida de
 * 75 min o una cena de 90, y salían 53 personas sentadas a la vez a las 17:30
 * y 18 personas de plantilla en lugar de 14.
 *
 * Solo cuenta si el plan trae la duración de la merienda (`MealMinutes.merienda`):
 * un plan guardado antes no la trae y se calcula como entonces, con el corte
 * de las 18:00 entre comida y cena (`MEAL_CUT_MIN`).
 */
export const MERIENDA_DESDE_MIN = 17 * 60 + 30
export const MERIENDA_HASTA_MIN = 20 * 60

/**
 * Duraciones de partida de cada estancia, en minutos. Valores de sector, y
 * todos editables en la pantalla de Equipo: un café con tostada en barra o en
 * mesa ronda los 20 a 30 minutos; una comida de menú, la hora y cuarto; una
 * cena, la hora y media; una copa de noche, la hora.
 */
export const DURACION_DESAYUNO_DEFECTO = 25
export const DURACION_COPAS_DEFECTO = 60
/** Un café o una merienda de media tarde, en mesa o en barra: unos 35 minutos. */
export const DURACION_MERIENDA_DEFECTO = 35

/**
 * Lo que dura una estancia, de media, desde que se sienta hasta que paga.
 *
 * `breakfast` y `drinks` son opcionales a propósito: un plan guardado entre
 * el 2026-11-04 y la ronda 5 no los trae, y entonces sus desayunos cuentan como
 * comida y sus copas como cena, que es como se calcularon. Cambiárselos por
 * debajo le daría otra plantilla sin que nadie haya tocado nada.
 */
export interface MealMinutes {
  midday: number
  night: number
  /** Desayuno o almuerzo: cobros antes de `DESAYUNO_CUT_MIN`. */
  breakfast?: number
  /** Copas: cobros de `COPAS_CUT_MIN` en adelante. */
  drinks?: number
  /**
   * Merienda o café de la tarde: cobros de `MERIENDA_DESDE_MIN` a
   * `MERIENDA_HASTA_MIN` (ronda 8, M1). Sin ella, el corte entre comida y
   * cena vuelve a las 18:00, como en los planes de antes.
   */
  merienda?: number
}

/** El servicio al que pertenece un cobro, por la hora a la que se paga. */
export type Estancia = 'desayuno' | 'comida' | 'merienda' | 'cena' | 'copas'

/**
 * Con `conMerienda` (el plan trae su duración) la tarde es su propio servicio;
 * sin ella, comida hasta las 18:00 y cena desde ahí, como en los planes de antes.
 */
export function estanciaDelCobro(payMin: number, conMerienda = true): Estancia {
  if (payMin < DESAYUNO_CUT_MIN) return 'desayuno'
  if (!conMerienda) {
    if (payMin < MEAL_CUT_MIN) return 'comida'
  } else {
    if (payMin < MERIENDA_DESDE_MIN) return 'comida'
    if (payMin < MERIENDA_HASTA_MIN) return 'merienda'
  }
  if (payMin < COPAS_CUT_MIN) return 'cena'
  return 'copas'
}

/**
 * Minutos que dura sentada la mesa que paga a `payMin`. LA cuenta: la usan la
 * conversión a sentados y la comprobación que la vigila, para que no haya dos.
 */
export function duracionDeEstancia(payMin: number, meal: MealMinutes): number {
  switch (estanciaDelCobro(payMin, meal.merienda !== undefined)) {
    case 'desayuno':
      return meal.breakfast ?? meal.midday
    case 'comida':
      return meal.midday
    case 'merienda':
      return meal.merienda ?? meal.midday
    case 'cena':
      return meal.night
    case 'copas':
      return meal.drinks ?? meal.night
  }
}

/**
 * De cobros por media hora a PERSONAS SENTADAS A LA VEZ.
 *
 * El fichero dice cuántos comensales pagan en cada media hora. Pero un jefe de
 * sala no piensa en cobros: piensa en la sala llena. Quien paga a las 15:00 se
 * sentó a las 13:45 si la comida dura 75 minutos, y durante esa hora y cuarto
 * ocupó una silla y le dio trabajo a la sala y a la cocina.
 *
 * Así que cada cobro se reparte hacia atrás a lo largo de la duración de la
 * comida: el comensal está en el local desde (hora del cobro − duración) hasta
 * la hora del cobro. Se toma la mitad de la franja como hora del cobro, porque
 * dentro de la media hora no sabemos el minuto. Con 75 minutos, un cobro de la
 * franja de las 15:00 cuenta media franja a las 15:00, la franja entera a las
 * 14:30 y la entera a las 14:00.
 *
 * Sustituye al desfase de 30 minutos: aquel era la aproximación de esto mismo
 * con una sola franja. Aplicar los dos movería la curva dos veces.
 *
 * CONSERVA LOS COMENSALES: la suma de sentados × media hora es exactamente
 * comensales × duración (antes de redondear). Es lo que comprueba
 * `scripts/comprobar-demanda.ts`. La única pérdida es la de un cobro tan
 * temprano que su comida empezaría antes de las 06:00, el inicio de la rejilla.
 *
 * `round = false` devuelve los valores sin redondear, para poder comprobarlo.
 */
export function seatedAtOnce(week: number[][], meal: MealMinutes, round = true): number[][] {
  return week.map((day) => {
    const out = new Array<number>(SLOTS_PER_DAY).fill(0)
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const covers = day[s] ?? 0
      if (covers <= 0) continue
      const pay = slotMin(s) + SLOT_MINUTES / 2
      // Sin suelo de media hora: un café de 25 minutos dura 25, no 30.
      const duration = Math.max(5, duracionDeEstancia(pay, meal))
      const seatedFrom = pay - duration
      // Solo las franjas que se solapan con la estancia: de la del cobro hacia atrás.
      for (let k = s; k >= 0; k--) {
        const a = slotMin(k)
        const b = a + SLOT_MINUTES
        if (b <= seatedFrom) break
        const overlap = Math.min(b, pay) - Math.max(a, seatedFrom)
        if (overlap > 0) out[k] += (covers * overlap) / SLOT_MINUTES
      }
    }
    return round ? out.map((v) => Math.round(v)) : out
  })
}

/** El momento con más gente sentada de la semana. Es la referencia que se le enseña al rellenar los tramos. */
export function peakOf(week: number[][]): { value: number; day: number; slot: number } {
  let best = { value: 0, day: 0, slot: 0 }
  week.forEach((day, d) =>
    day.forEach((v, s) => {
      if (v > best.value) best = { value: v, day: d, slot: s }
    }),
  )
  return best
}

/**
 * Recorta la demanda al horario de apertura. Si el local está cerrado no hay
 * comensales, por mucho ruido que traiga el histórico a esa hora.
 */
export function clampToHours(week: number[][], hours: OpeningHours): number[][] {
  return week.map((day, d) => {
    const blocks = hours[d] ?? []
    if (blocks.length === 0) return new Array<number>(SLOTS_PER_DAY).fill(0)
    return day.map((v, s) => {
      const min = slotMin(s)
      return blocks.some((b) => min >= b.startMin && min < b.endMin) ? v : 0
    })
  })
}

/** Las estancias de partida (`DEFAULT_SETTINGS.mealMinutes`): una sola cifra para la curva y el horario deducido. */
export const ESTANCIAS_DEFECTO: MealMinutes = { midday: 75, night: 90, breakfast: 25, drinks: 60, merienda: DURACION_MERIENDA_DEFECTO }

/** Lo más que se adelanta una apertura por la estancia: la cena más larga y media hora. */
const ADELANTO_MAX_MIN = 150

/**
 * Adelanta la apertura del horario deducido a cuando se sientan los primeros
 * clientes (ronda 7, M1 de cálculo).
 *
 * El horario se deduce de los cobros, y se cobra al terminar: la cena que paga
 * a las 22:00 se sentó a las 20:30. Con solo el desfase de media hora la
 * apertura salía entre 45 y 90 minutos tarde, y al recortar la curva de
 * sentados a ese horario se perdían entre un 4 y un 9 % de los clientes (un
 * viernes a las 21:00 de un restaurante de 25, de 30 sentados a 0). Aquí cada
 * tramo empieza en la primera franja en la que hay al menos `liston` sentados
 * a la vez, contados con la misma estancia que la curva, sin pisar el tramo
 * anterior. Solo adelanta: nunca retrasa una apertura ni toca el cierre.
 */
export function aperturaConEstancia(
  horario: OpeningHours,
  cobros: number[][],
  meal: MealMinutes = ESTANCIAS_DEFECTO,
  liston = 1,
): OpeningHours {
  const sentados = seatedAtOnce(cobros, meal, false)
  return horario.map((bloques, d) =>
    bloques.map((b, i) => {
      const suelo = Math.max(GRID_START_MIN, i > 0 ? bloques[i - 1].endMin : GRID_START_MIN, b.startMin - ADELANTO_MAX_MIN)
      let inicio = b.startMin
      for (;;) {
        const t = inicio - SLOT_MINUTES
        if (t < suelo) break
        const s = Math.round((t - GRID_START_MIN) / SLOT_MINUTES)
        if ((sentados[d]?.[s] ?? 0) < liston) break
        inicio = t
      }
      return { ...b, startMin: inicio }
    }),
  )
}

/** Deduce el horario a partir de dónde hay comensales de verdad. */
export function inferHours(week: number[][], minCovers = 1): OpeningHours {
  return week.map((day) => {
    const blocks: { startMin: number; endMin: number }[] = []
    let start: number | null = null
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const active = day[s] >= minCovers
      if (active && start === null) start = slotMin(s)
      if (!active && start !== null) {
        blocks.push({ startMin: start, endMin: slotMin(s) })
        start = null
      }
    }
    if (start !== null) blocks.push({ startMin: start, endMin: slotMin(SLOTS_PER_DAY) })

    // Une tramos separados por menos de hora y media: un hueco corto a media
    // tarde es una bajada de servicio, no un cierre.
    const merged: { startMin: number; endMin: number }[] = []
    for (const b of blocks) {
      const last = merged[merged.length - 1]
      if (last && b.startMin - last.endMin <= 90) last.endMin = b.endMin
      else merged.push({ ...b })
    }
    return merged.filter((b) => b.endMin - b.startMin >= 60)
  })
}

/** Total de comensales de una semana. */
export function weekTotal(days: number[][]): number {
  return totalOf(days)
}

/** Comensales por día de una semana, para el gráfico de barras por día. */
export function dayTotals(days: number[][]): number[] {
  return days.map((d) => d.reduce((a, b) => a + b, 0))
}

/**
 * Sobrecobertura: cuánto se pasa la plantilla fija en las semanas que sí cubre.
 *
 * La plantilla se dimensiona para la línea de cobertura, así que en una semana
 * floja sobra gente. Esto lo pone en número: de media, cuánto por encima de la
 * demanda real de cada semana cubierta queda esa plantilla. Es la cara b del
 * porcentaje de cobertura — subir la línea cubre más semanas, y a cambio sube
 * esto.
 *
 * Se mide contra la demanda de cada semana concreta, no contra la media del
 * año: promediar primero escondería justo lo que se quiere enseñar.
 */
export function overcoverage(
  weeks: WeekDemand[],
  threshold: number,
): { avgPct: number; worstPct: number; worstWeek: number | null } | null {
  const covered = weeks.filter((w) => w.total <= threshold && w.total > 0)
  if (covered.length === 0) return null

  let sum = 0
  let worstPct = 0
  let worstWeek: number | null = null

  for (const w of covered) {
    const pct = ((threshold - w.total) / w.total) * 100
    sum += pct
    if (pct > worstPct) {
      worstPct = pct
      worstWeek = w.isoWeek
    }
  }

  return { avgPct: sum / covered.length, worstPct, worstWeek }
}

/**
 * A qué servicios cobra el local, mirando la semana tipo: cuántos cobros caen
 * en cada uno. La pantalla de Equipo solo pregunta la duración del desayuno o
 * de las copas si el local cobra a esas horas.
 */
export function serviciosDelCobro(week: number[][], conMerienda = true): Record<Estancia, number> {
  const out: Record<Estancia, number> = { desayuno: 0, comida: 0, merienda: 0, cena: 0, copas: 0 }
  for (const day of week) {
    for (let s = 0; s < day.length; s++) {
      const v = day[s] ?? 0
      if (v > 0) out[estanciaDelCobro(slotMin(s) + SLOT_MINUTES / 2, conMerienda)] += v
    }
  }
  return out
}

/** "25 min el desayuno, 75 la comida y 90 la cena", para los criterios y el PDF. */
export function describirDuraciones(meal: MealMinutes, servicios?: Record<Estancia, number> | null): string {
  const partes: string[] = []
  if (meal.breakfast !== undefined && (!servicios || servicios.desayuno > 0)) partes.push(`${meal.breakfast} min el desayuno`)
  partes.push(`${meal.midday} min la comida`)
  if (meal.merienda !== undefined && (!servicios || servicios.merienda > 0)) partes.push(`${meal.merienda} min la merienda`)
  partes.push(`${meal.night} min la cena`)
  if (meal.drinks !== undefined && (!servicios || servicios.copas > 0)) partes.push(`${meal.drinks} min las copas`)
  const [primera, ...resto] = partes
  const rest = resto.map((x) => x.replace(' min ', ' '))
  const todas = [primera, ...rest]
  return todas.length === 1 ? todas[0] : `${todas.slice(0, -1).join(', ')} y ${todas[todas.length - 1]}`
}
