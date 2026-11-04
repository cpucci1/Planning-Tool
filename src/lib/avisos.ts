/**
 * Traduce el cuadrante ya generado a avisos en lenguaje de persona.
 *
 * No calcula nada nuevo: relee `Roster` (y los `Settings` con los que se
 * construyó) y cuenta en castellano lo que ya está ahí. El criterio de
 * descanso es el MISMO que aplica `buildRoster` al montar el cuadrante
 * (`dayRestOk`/`restOk` en `roster.ts`): si aquí se inventara otro, un
 * cuadrante ya válido podría salir marcado como incumplidor, o al revés.
 */

import {
  DESCANSO_SEMANAL_MENOR_MIN,
  DESCANSO_SEMANAL_MIN,
  MENOR_MAX_MIN,
  NOCHE_DESDE_MIN,
  NOCTURNO_DESDE_MIN,
  TOPE_NOCTURNO_MIN,
  esMando,
  mayorDescansoSemanalMin,
  mediaNocturnaMin,
  minutosDeNocheBloques,
  topeDiarioMin,
} from './roster'
import type { PreparacionRecortada } from './necesidad'
import { DAYS, SLOT_MINUTES, slotStartMin } from './time'
import type { DayIndex, Roster, Settings, Shift, StaffingModel } from './types'

export type AvisoTipo =
  | 'descanso'
  | 'libranzas'
  | 'horas'
  | 'contrato-flojo'
  | 'sin-cubrir'
  | 'tope-diario'
  | 'pausa'
  | 'mando'
  | 'mando-relevo'
  | 'descanso-semanal'
  | 'ajustes-legales'
  | 'nocturno'
  | 'menores'
  | 'preparacion'
  | 'dia-suelto'
  | 'puesto-plegado'
  | 'puesto-partido'

export interface Aviso {
  tipo: AvisoTipo
  /** 'legal' = incumple una norma; 'aviso' = está mal pero no es ilegal. */
  gravedad: 'legal' | 'aviso'
  personId: string | null
  personLabel: string | null
  /** Frase corta en castellano, lista para enseñar tal cual. */
  mensaje: string
  /** Días implicados, para poder resaltar después. */
  days: DayIndex[]
}

/** Igual que en roster.ts: 12h entre el fin de un turno y el inicio del siguiente (Art. 34.3 ET). */
const MIN_REST_MIN = 12 * 60
// El descanso semanal (36 h, y 48 para un menor) vive en roster.ts, que es
// quien lo aplica al repartir: una sola cifra para el reparto y la revisión.
/** Jornada diaria máxima de la ley: 9 h de trabajo efectivo (art. 34.3 ET). */
const TOPE_DIARIO_LEY_MIN = 9 * 60

/** "lunes y martes" — la lista de días como la diría un encargado, no una coma suelta. */
function listarDias(days: DayIndex[]): string {
  const nombres = days.map((d) => DAYS[d].toLowerCase())
  if (nombres.length === 0) return ''
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** Coma española y sin decimales de más: "10" o "10,5", nunca "10.5". */
function fmtNumero(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/** El turno de una persona en un día concreto. Como mucho hay uno por persona y día. */
function turnoDe(shifts: Shift[], personId: string, day: DayIndex): Shift | undefined {
  return shifts.find((s) => s.personId === personId && s.day === day)
}

// ─────────────────────────────────────────────────────────────
// 1. Descanso de 12h entre turnos (Art. 34.3 ET)
// ─────────────────────────────────────────────────────────────

/**
 * Recorre los 7 pares de días consecutivos (domingo-lunes incluido, porque la
 * semana se repite) y mide el hueco real entre el cierre de uno y la apertura
 * del siguiente. Los minutos de los bloques son "minutos desde la medianoche
 * del día que abre" y pueden pasar de 1440 si el turno cierra de madrugada, así
 * que el hueco siempre es `1440 + inicio del día siguiente - fin de este día`:
 * la misma cuenta funciona cierre normal o de madrugada, sin arrastrar un reloj
 * absoluto de la semana.
 */
function avisosDescanso(roster: Roster, settings: Settings): Aviso[] {
  // Con el descanso apagado no se avisa jornada a jornada: lo cuenta, junto,
  // `avisosAjustesLegales`, que recuerda que la ley lo pide salvo convenio.
  if (!settings.minRestBetweenShifts) return []
  return descansosCortos(roster)
}

/** Todas las jornadas seguidas de una misma persona con menos de 12 h entre ellas. */
function descansosCortos(roster: Roster): Aviso[] {
  const avisos: Aviso[] = []

  for (const person of roster.people) {
    for (let d = 0; d < 7; d++) {
      const dia = d as DayIndex
      const diaSiguiente = ((d + 1) % 7) as DayIndex
      const hoy = turnoDe(roster.shifts, person.id, dia)
      const manana = turnoDe(roster.shifts, person.id, diaSiguiente)
      if (!hoy || !manana) continue

      const fin = Math.max(...hoy.blocks.map((b) => b.endMin))
      const inicio = Math.min(...manana.blocks.map((b) => b.startMin))
      const descansoMin = 1440 + inicio - fin
      if (descansoMin >= MIN_REST_MIN) continue

      avisos.push({
        tipo: 'descanso',
        gravedad: 'legal',
        personId: person.id,
        personLabel: person.label,
        mensaje: `${person.label} cierra el ${DAYS[dia].toLowerCase()} y abre el ${DAYS[diaSiguiente].toLowerCase()}: solo ${fmtNumero(descansoMin / 60)} h de descanso, la ley pide 12.`,
        days: [dia, diaSiguiente],
      })
    }
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 1 bis. Descanso semanal de día y medio (art. 37.1 ET)
// ─────────────────────────────────────────────────────────────

/**
 * El hueco más largo sin trabajar de cada persona en la semana, que se repite:
 * del fin de una jornada al inicio de la siguiente que haga, domingo a lunes
 * incluido. La ley pide día y medio seguido cada semana (se puede acumular en
 * periodos de hasta catorce días, pero el cuadrante es una semana que se
 * repite, así que aquí se mira semana a semana).
 */
export function descansoSemanalMasLargoMin(shifts: Shift[], personId: string): number | null {
  const dias: Shift['blocks'][] = Array.from({ length: 7 }, () => [])
  for (const s of shifts) if (s.personId === personId) dias[s.day] = [...dias[s.day], ...s.blocks]
  return mayorDescansoSemanalMin(dias)
}

function avisosDescansoSemanal(roster: Roster): Aviso[] {
  const avisos: Aviso[] = []
  for (const person of roster.people) {
    const mayor = descansoSemanalMasLargoMin(roster.shifts, person.id)
    if (mayor === null || mayor >= DESCANSO_SEMANAL_MIN) continue
    avisos.push({
      tipo: 'descanso-semanal',
      gravedad: 'legal',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label} descansa como mucho ${fmtNumero(mayor / 60)} h seguidas en la semana: la ley pide día y medio (36 h), o acumularlo en periodos de hasta 14 días.`,
      days: person.daysOff,
    })
  }
  return avisos
}

/**
 * Si el usuario ha quitado las 12 h entre jornadas o ha subido el máximo
 * diario por encima de 9 h, se le recuerda que eso lo pide la ley y que solo
 * su convenio (o un acuerdo de empresa) puede cambiarlo. No es un error del
 * cuadrante, es un ajuste suyo, y por eso va una sola vez y con lo que pasa.
 */
function avisosAjustesLegales(roster: Roster, settings: Settings): Aviso[] {
  const avisos: Aviso[] = []
  if (!settings.minRestBetweenShifts) {
    const cortos = descansosCortos(roster).length
    avisos.push({
      tipo: 'ajustes-legales',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje:
        `Has quitado las 12 h de descanso entre jornadas: la ley las pide salvo que tu convenio diga otra cosa.` +
        (cortos > 0 ? ` En este cuadrante hay ${cortos} ${cortos === 1 ? 'jornada' : 'jornadas'} con menos de 12 h desde la anterior.` : ''),
      days: [],
    })
  }
  const tope = topeDiarioMin(settings)
  if (tope > TOPE_DIARIO_LEY_MIN) {
    const largos = roster.shifts.filter(
      (sh) => sh.blocks.reduce((a, b) => a + (b.endMin - b.startMin), 0) > TOPE_DIARIO_LEY_MIN,
    ).length
    avisos.push({
      tipo: 'ajustes-legales',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje:
        `Has subido el máximo a ${fmtNumero(tope / 60)} h al día: la ley pone 9 h salvo que tu convenio o un acuerdo de empresa repartan la jornada de otra forma.` +
        (largos > 0 ? ` En este cuadrante hay ${largos} ${largos === 1 ? 'jornada' : 'jornadas'} de más de 9 h.` : ''),
      days: [],
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 2. Libranzas no consecutivas
// ─────────────────────────────────────────────────────────────

/**
 * True si en algún sitio de la semana hay DOS días libres seguidos.
 *
 * Es exactamente el criterio con el que monta el cuadrante `roster.ts`
 * (`DAY_OFF_PAIRS`): lo que se pidió fue "que tenga dos libranzas seguidas",
 * no "que todos sus días libres formen un único bloque". La diferencia no es
 * teórica: un contrato de 20 h libra cuatro días, y exigirle que los cuatro
 * vayan pegados haría saltar el aviso en casi todas las plantillas con
 * parciales. Una pantalla que se llama "lo que hay que mirar antes de
 * firmarlo" no se puede permitir avisos falsos: a la segunda, nadie la mira.
 */
function libranzasSeguidas(daysOff: DayIndex[]): boolean {
  if (daysOff.length <= 1) return true
  const libra = new Array(7).fill(false)
  for (const d of daysOff) libra[d] = true
  // Domingo y lunes también cuentan como seguidos: la semana se repite.
  for (let d = 0; d < 7; d++) {
    if (libra[d] && libra[(d + 1) % 7]) return true
  }
  return false
}

function avisosLibranzas(roster: Roster, settings: Settings): Aviso[] {
  if (!settings.consecutiveDaysOff) return []
  const avisos: Aviso[] = []

  for (const person of roster.people) {
    if (libranzasSeguidas(person.daysOff)) continue

    avisos.push({
      tipo: 'libranzas',
      gravedad: 'aviso',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label} libra ${listarDias(person.daysOff)}: son días sueltos, no seguidos.`,
      days: person.daysOff,
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 3. Horas por encima del contrato
// ─────────────────────────────────────────────────────────────

/**
 * El puesto se cuela en el mensaje porque `person.label` puede ser ya un
 * nombre real (el usuario lo ha editado) y entonces el puesto es la única
 * pista de quién es quién en la lista de avisos.
 */
function avisosHoras(roster: Roster, model: StaffingModel): Aviso[] {
  const avisos: Aviso[] = []

  for (const person of roster.people) {
    if (person.assignedHours <= person.contractHours) continue

    const role = model.roles.find((r) => r.id === person.roleId)
    const puesto = role ? ` (${role.name})` : ''

    avisos.push({
      tipo: 'horas',
      gravedad: 'legal',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label}${puesto} tiene ${fmtNumero(person.assignedHours)} h asignadas: su contrato es de ${fmtNumero(person.contractHours)} h.`,
      days: [],
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 3 bis. Contrato mucho más grande que los turnos
// ─────────────────────────────────────────────────────────────

/** Por debajo de esto, un contrato se está pagando medio vacío. */
const OCUPACION_MINIMA = 0.6

/**
 * El caso que parece un error de la herramienta y no lo es: un encargado con
 * contrato de 40 h y 9 h de turnos.
 *
 * Sale de `fullTimeOnly` (`roster.ts`): los puestos de mando no bajan a un
 * contrato parcial aunque sus horas quepan, porque un encargado se contrata a
 * jornada completa o no se contrata. El cálculo es correcto, pero la pantalla
 * certificaba que todo estaba en regla — `avisosHoras` solo mira a quien se
 * PASA de su contrato, nunca a quien le falta la mitad — y entonces la única
 * lectura posible era "esto está mal calculado".
 *
 * Es un aviso, no un incumplimiento: no hay nada ilegal en pagar una jornada
 * completa a quien trabaja nueve horas. Solo cuesta dinero, y hay que decirlo.
 */
function avisosContratoFlojo(roster: Roster, model: StaffingModel, settings: Settings): Aviso[] {
  const avisos: Aviso[] = []
  const menorActivo = settings.contracts
    .filter((c) => c.enabled)
    .reduce<number | null>((min, c) => (min === null || c.hours < min ? c.hours : min), null)

  for (const person of roster.people) {
    if (person.contractHours <= 0) continue
    if (person.assignedHours >= person.contractHours * OCUPACION_MINIMA) continue

    const role = model.roles.find((r) => r.id === person.roleId)
    const puesto = role ? ` (${role.name})` : ''
    const cifras = `tiene un contrato de ${fmtNumero(person.contractHours)} h y solo ${fmtNumero(person.assignedHours)} h de turnos`

    const porQue = esMando(role)
      ? `es un mando y su zona abre menos horas de las que da su jornada. Baja su jornada en el catálogo de puestos, o activa los contratos a medida en el paso de equipo.`
      : role?.fullTimeOnly
      ? `su puesto está marcado como solo jornada completa, así que no baja a un contrato parcial aunque le quepa. Si quieres que baje, apaga ese interruptor en el catálogo de puestos.`
      : menorActivo !== null && person.contractHours <= menorActivo
        ? `es el contrato más pequeño que tienes activo. Activa uno menor en los ajustes del paso de equipo si quieres ajustarlo.`
        : `sus turnos no se han podido juntar con los de nadie más sin romper el descanso o las libranzas.`

    avisos.push({
      tipo: 'contrato-flojo',
      gravedad: 'aviso',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label}${puesto} ${cifras}: ${porQue}`,
      days: [],
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 3 ter. Un solo día, puestos plegados y puestos partidos (ronda 8)
// ─────────────────────────────────────────────────────────────

/**
 * Nadie (salvo un mando) viene un solo día a la semana (revisión ronda 8,
 * M2). Antes la revisión solo miraba si las horas llenaban el contrato, y un
 * cocinero de 10 h que venía el sábado 8 h salía como "contrato aprovechado".
 * Nadie firma un contrato para venir un día a un puesto: o esas horas las
 * hace quien ya está, o es un refuerzo, no un contrato.
 */
function avisosDiaSuelto(roster: Roster, model: StaffingModel): Aviso[] {
  const avisos: Aviso[] = []
  for (const person of roster.people) {
    const role = model.roles.find((r) => r.id === person.roleId)
    if (esMando(role)) continue
    const suyos = roster.shifts.filter((s) => s.personId === person.id)
    if (suyos.length !== 1) continue
    const dia = suyos[0].day
    avisos.push({
      tipo: 'dia-suelto',
      gravedad: 'aviso',
      personId: person.id,
      personLabel: person.label,
      mensaje: `${person.label} viene un solo día, el ${DAYS[dia].toLowerCase()} (${fmtNumero(person.assignedHours)} h), con un contrato de ${fmtNumero(person.contractHours)} h: ese contrato no lo firma nadie. Amplía un poco el de quien ya trabaja ese día o cúbrelo con un refuerzo.`,
      days: [dia],
    })
  }
  return avisos
}

/** Los puestos que pedían menos horas que un contrato y las hace otro puesto (`plegarPuestosPequenos`). */
function avisosPuestoPlegado(roster: Roster, model: StaffingModel): Aviso[] {
  return (roster.plegados ?? []).map((p) => {
    const de = model.roles.find((r) => r.id === p.roleId)?.name ?? 'Un puesto'
    const a = model.roles.find((r) => r.id === p.haciaRoleId)?.name ?? 'otro puesto'
    return {
      tipo: 'puesto-plegado' as const,
      gravedad: 'aviso' as const,
      personId: null,
      personLabel: null,
      mensaje: `${de} pide solo ${fmtNumero(p.horas)} h a la semana, menos que el contrato más pequeño: no se contrata a nadie para eso y esas horas las hace tu equipo de ${a.toLowerCase()}.`,
      days: [],
    }
  })
}

/**
 * Un puesto de una o dos personas a la vez repartido entre demasiada gente
 * (revisión ronda 8, M4): el responsable de sala en cinco personas de 31, 30,
 * 21, 20 y 10 h. Quien abre, cierra y manda en el servicio no se reparte así.
 * El reparto ya lo junta en jornadas largas cuando puede (`jornadasLargas` en
 * `roster.ts`); si aun así sale partido, se dice.
 */
function avisosPuestoPartido(roster: Roster, model: StaffingModel, settings: Settings): Aviso[] {
  const avisos: Aviso[] = []
  const completa = settings.contracts.filter((c) => c.enabled).reduce((m, c) => Math.max(m, c.hours), 0) || 40
  for (const role of model.roles) {
    if (esMando(role)) continue
    const gente = roster.people.filter((p) => p.roleId === role.id)
    if (gente.length < 3) continue
    const turnos = roster.shifts.filter((s) => s.roleId === role.id)
    // A la vez como mucho dos: es un puesto "al frente", no de volumen.
    let maxALaVez = 0
    for (let d = 0; d < 7; d++) {
      const delDia = turnos.filter((s) => s.day === d)
      for (const t of delDia.flatMap((s) => s.blocks.map((b) => b.startMin))) {
        const n = delDia.filter((s) => s.blocks.some((b) => t >= b.startMin && t < b.endMin)).length
        if (n > maxALaVez) maxALaVez = n
      }
    }
    if (maxALaVez > 2) continue
    const horas = gente.reduce((a, p) => a + p.assignedHours, 0)
    const bastarian = Math.ceil(horas / completa - 1e-9)
    if (gente.length < bastarian + 2) continue
    const lista = [...gente].sort((a, b) => b.contractHours - a.contractHours).map((p) => fmtNumero(p.contractHours))
    avisos.push({
      tipo: 'puesto-partido',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje: `${role.name} queda repartido entre ${gente.length} personas (${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]} h) y nunca hace falta más de ${maxALaVez === 1 ? 'una' : 'dos'} a la vez. Quien abre, cierra y lleva el servicio no se reparte así: con ${bastarian} de jornada larga, una que abre y otra que cierra, lo cubrirías, y las horas sueltas que quedan las puede llevar un veterano del equipo.`,
      days: [],
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 4. Franjas sin cubrir
// ─────────────────────────────────────────────────────────────

function avisoSinCubrir(roster: Roster): Aviso[] {
  if (roster.uncoveredHours <= 0) return []

  return [
    {
      tipo: 'sin-cubrir',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje: `Quedan ${fmtNumero(roster.uncoveredHours)} h a la semana sin nadie que las cubra: no caben en ninguna jornada de las que tienes activadas.`,
      days: [],
    },
  ]
}

// ─────────────────────────────────────────────────────────────
// 5. Máximo de horas al día (Art. 34.3 ET, o lo que diga el convenio)
// ─────────────────────────────────────────────────────────────

function avisosTopeDiario(roster: Roster, settings: Settings): Aviso[] {
  const tope = topeDiarioMin(settings)
  const avisos: Aviso[] = []
  for (const sh of roster.shifts) {
    const minutos = sh.blocks.reduce((a, b) => a + (b.endMin - b.startMin), 0)
    if (minutos <= tope) continue
    const person = roster.people.find((p) => p.id === sh.personId)
    avisos.push({
      tipo: 'tope-diario',
      gravedad: 'legal',
      personId: sh.personId,
      personLabel: person?.label ?? null,
      mensaje: `${person?.label ?? 'Alguien'} trabaja ${fmtNumero(minutos / 60)} h el ${DAYS[sh.day].toLowerCase()}: tu máximo es de ${fmtNumero(tope / 60)} h al día.`,
      days: [sh.day],
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────
// 6. Pausa en los turnos de más de 6 horas (Art. 34.4 ET)
// ─────────────────────────────────────────────────────────────

/** Más de esto seguido y la ley pide una pausa. */
const PAUSA_DESDE_MIN = 6 * 60

/**
 * Un solo aviso para todo el cuadrante, no uno por turno: con 40 turnos de 7 h
 * serían 40 líneas iguales y taparían lo demás. No es un incumplimiento del
 * cuadrante, es algo que hay que organizar dentro del turno.
 */
function avisoPausa(roster: Roster): Aviso[] {
  let turnos = 0
  const dias = new Set<DayIndex>()
  for (const sh of roster.shifts) {
    if (sh.blocks.some((b) => b.endMin - b.startMin > PAUSA_DESDE_MIN)) {
      turnos++
      dias.add(sh.day)
    }
  }
  if (turnos === 0) return []
  return [
    {
      tipo: 'pausa',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje: `${turnos} ${turnos === 1 ? 'turno pasa' : 'turnos pasan'} de 6 h seguidas: dales una pausa de al menos 15 minutos, o la que diga tu convenio (en muchos son 20).`,
      days: [...dias].sort(),
    },
  ]
}

// ─────────────────────────────────────────────────────────────
// 7. Siempre un mando al frente
// ─────────────────────────────────────────────────────────────

function avisosMandos(roster: Roster, model: StaffingModel): Aviso[] {
  const avisos: Aviso[] = []
  for (const m of roster.mandos ?? []) {
    const zona = model.blocks.find((b) => b.id === m.blockId)?.name ?? 'la zona'
    if (m.roleIdAnadido) {
      const puesto = model.roles.find((r) => r.id === m.roleIdAnadido)?.name ?? 'mando'
      const extra = m.necesarios - m.pedidos
      avisos.push({
        tipo: 'mando',
        gravedad: 'aviso',
        personId: null,
        personLabel: null,
        mensaje: `Con ${m.pedidos} ${m.pedidos === 1 ? 'mando' : 'mandos'} en ${zona} quedaban ratos abiertos sin nadie de la zona en el local, ni mando ni equipo. He añadido ${extra} de ${puesto.toLowerCase()}.`,
        days: [],
      })
    }
    // Sin la cifra nueva (cuadrantes guardados antes), se usa la de antes.
    const sinNadie = m.minutosSinNadie ?? m.minutosSinMando
    if (sinNadie > 0) {
      avisos.push({
        tipo: 'mando',
        gravedad: 'aviso',
        personId: null,
        personLabel: null,
        mensaje: `En ${zona} quedan ${fmtNumero(sinNadie / 60)} h a la semana abiertas sin nadie de la zona al frente.`,
        days: [],
      })
    } else if (m.minutosSinMando > 0) {
      const segundo = model.roles.find((r) => r.id === m.segundoRoleId)?.name
      const dias = m.diasSinMando ?? []
      const libra = dias.length > 0 ? `no hay mando el ${listarDias(dias)} y ` : ''
      // Quién queda al frente los días que el mando libra (ronda 5): con
      // nombre, para que el equipo sepa a quién mirar y a quién va el plus.
      const alFrente = quienesAlFrente(roster, m.alFrente ?? [])
      const quien = alFrente
        ? `${alFrente}${dias.length > 0 && !/ el /.test(alFrente) ? ' los días que libra el mando' : ''} y, en los ratos sueltos de abrir y cerrar, alguien del equipo`
        : segundo && !m.relevoEnEquipo
          ? `quien esté de ${segundo.toLowerCase()} y, en los ratos sueltos de abrir y cerrar, alguien del equipo`
          : 'alguien del equipo de la zona'
      const plus = alFrente ? ' Ponle el plus o la categoría que diga tu convenio por esas horas.' : ''
      avisos.push({
        tipo: 'mando-relevo',
        gravedad: 'aviso',
        personId: null,
        personLabel: null,
        mensaje:
          `En ${zona} ${libra}la jornada del mando no llega a todas las horas de apertura: en esas ${fmtNumero(m.minutosSinMando / 60)} h a la semana queda al frente ` +
          `${quien}.${plus} Si quieres un mando siempre, sube los mandos de la zona en el catálogo de puestos.`,
        days: dias,
      })
    }
  }
  // La casa entera sin mando (ronda 5, M1): un día abierto en el que no
  // trabaja ningún mando de ninguna zona. Las libranzas se cruzan para que no
  // pase; si aun así pasa (un solo mando para todo, o pocos días de mando),
  // se dice.
  const mandos = roster.mandos ?? []
  if (mandos.length > 1) {
    const idsMando = new Set(roster.people.filter((p) => esMando(model.roles.find((r) => r.id === p.roleId))).map((p) => p.id))
    const abiertos = new Set<DayIndex>()
    for (const sh of roster.shifts) abiertos.add(sh.day)
    const sinNinguno = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).filter(
      (d) => abiertos.has(d) && !roster.shifts.some((sh) => sh.day === d && idsMando.has(sh.personId)),
    )
    if (sinNinguno.length > 0) {
      avisos.push({
        tipo: 'mando',
        gravedad: 'aviso',
        personId: null,
        personLabel: null,
        mensaje: `El ${listarDias(sinNinguno)} no trabaja ningún mando en todo el local: con los días que piden los mandos no da para que libren en días distintos.`,
        days: sinNinguno,
      })
    }
  }
  // Una zona con equipo y sin ningún mando (ronda 6, M6 de pantallas). Con
  // un fichero propio los mandos empiezan en 0, y la plantilla salía sin
  // encargado ni jefe sin que la revisión dijera quién queda al frente.
  for (const block of model.blocks) {
    if ((roster.mandos ?? []).some((m) => m.blockId === block.id)) continue
    const tieneEquipo = roster.people.some((p) => model.roles.find((r) => r.id === p.roleId)?.blockId === block.id)
    if (!tieneEquipo) continue
    const puestosDeMando = model.roles.filter((r) => r.blockId === block.id && esMando(r)).map((r) => r.name.toLowerCase())
    avisos.push({
      tipo: 'mando',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje:
        `En ${block.name} no has puesto ningún mando: nadie queda al frente.` +
        (puestosDeMando.length > 0
          ? ` Si tienes ${puestosDeMando.length === 1 ? puestosDeMando[0] : `${puestosDeMando.slice(0, -1).join(', ')} o ${puestosDeMando[puestosDeMando.length - 1]}`}, ponlo en tus puestos con cuántos son;`
          : ' Si tienes a alguien al frente, añádelo en tus puestos;') +
        ' si no, decide quién manda cada día y ponle el plus que diga tu convenio.',
      days: [],
    })
  }
  return avisos
}

/** "Camarero 2" o "Camarero 2 el martes y Camarero 3 el miércoles". */
function quienesAlFrente(roster: Roster, alFrente: { day: DayIndex; personId: string }[]): string | null {
  if (alFrente.length === 0) return null
  const nombre = (id: string) => roster.people.find((p) => p.id === id)?.label ?? null
  const porPersona = new Map<string, DayIndex[]>()
  for (const a of alFrente) porPersona.set(a.personId, [...(porPersona.get(a.personId) ?? []), a.day])
  const partes: string[] = []
  for (const [id, dias] of porPersona) {
    const n = nombre(id)
    if (!n) return null
    partes.push(porPersona.size === 1 ? n : `${n} el ${listarDias(dias)}`)
  }
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * La preparación que se pierde por el borde del día (ronda 5): el cuadrante
 * va de 06:00 a 06:00, así que un local que abre a las 06:00 con una hora de
 * preparación no tiene a nadie a las 05:00. Antes se perdía en silencio.
 */
function avisosPreparacion(recortes: PreparacionRecortada[], model: StaffingModel): Aviso[] {
  return recortes.map((r) => {
    const zona = model.blocks.find((b) => b.id === r.blockId)?.name ?? 'una zona'
    const partes: string[] = []
    if (r.antesMin > 0) partes.push(`${fmtNumero(r.antesMin)} min de preparación antes de las 06:00`)
    if (r.despuesMin > 0) partes.push(`${fmtNumero(r.despuesMin)} min de recogida después de las 06:00`)
    return {
      tipo: 'preparacion' as const,
      gravedad: 'aviso' as const,
      personId: null,
      personLabel: null,
      mensaje: `En ${zona} el cuadrante no tiene ${partes.join(' ni ')} (el ${listarDias(r.days)}): el día del cuadrante empieza a las 06:00. Alarga a mano la entrada de quien abra o cuéntalo en sus horas.`,
      days: r.days,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 8. Trabajo nocturno (Art. 36 ET)
// ─────────────────────────────────────────────────────────────

/** Los nocturnos no pasan de 8 h al día de media (en quince días). El mismo tope que aplica el cuadrante. */
const NOCTURNO_MEDIA_MAX_MIN = TOPE_NOCTURNO_MIN

/** Minutos de un turno entre las 22:00 y las 06:00. La cuenta es la del cuadrante (`roster.ts`). */
export function minutosDeNoche(sh: Shift): number {
  return minutosDeNocheBloques(sh.blocks)
}

/**
 * Quien cierra a la una casi todos los días es trabajador nocturno, y eso
 * trae tres cosas que un encargado tiene que saber: la nocturnidad se paga
 * (cuánto, lo dice el convenio), no puede hacer horas extra, y su jornada no
 * pasa de 8 h al día de media. Lo primero es un aviso; lo último, si se pasa,
 * es un incumplimiento.
 *
 * Se cuenta como nocturno a quien hace 3 h o más de noche en al menos la mitad
 * de sus días: es lo que el Estatuto llama "normalmente". Un cierre suelto a
 * la semana no le convierte en nocturno, aunque esas horas se paguen igual.
 */
function avisosNocturno(roster: Roster): Aviso[] {
  const nocturnos: { label: string; mediaMin: number; dias: DayIndex[] }[] = []
  for (const person of roster.people) {
    const suyos = roster.shifts.filter((s) => s.personId === person.id)
    if (suyos.length === 0) continue
    const deNoche = suyos.filter((s) => minutosDeNoche(s) >= NOCTURNO_DESDE_MIN)
    // La misma cuenta que el reparto (ronda 7, M4): un día, sus bloques juntos.
    const dias = Array.from({ length: 7 }, (_, d) => suyos.filter((s) => s.day === d).flatMap((s) => s.blocks))
    const mediaMin = mediaNocturnaMin(dias)
    if (mediaMin === null) continue
    nocturnos.push({ label: person.label, mediaMin, dias: deNoche.map((s) => s.day) })
  }
  if (nocturnos.length === 0) return []

  const avisos: Aviso[] = []
  for (const n of nocturnos) {
    if (n.mediaMin <= NOCTURNO_MEDIA_MAX_MIN) continue
    avisos.push({
      tipo: 'nocturno',
      gravedad: 'legal',
      personId: null,
      personLabel: n.label,
      mensaje: `${n.label} trabaja de noche casi todos sus días y hace ${fmtNumero(n.mediaMin / 60)} h de media al día: a un trabajador nocturno la ley le pone un máximo de 8 h de media.`,
      days: n.dias,
    })
  }
  const nombres = nocturnos.map((n) => n.label)
  const lista = nombres.length <= 4 ? listarNombres(nombres) : `${nombres.length} personas`
  avisos.push({
    tipo: 'nocturno',
    gravedad: 'aviso',
    personId: null,
    personLabel: null,
    mensaje: `${lista} ${nocturnos.length === 1 ? 'hace' : 'hacen'} 3 h o más entre las 22:00 y las 06:00 en la mayoría de sus días: ${nocturnos.length === 1 ? 'es trabajador nocturno' : 'son trabajadores nocturnos'}. Esas horas llevan el plus de nocturnidad que diga tu convenio, y no pueden hacer horas extra.`,
    days: [],
  })
  return avisos
}

/** "Camarero 1, Camarero 2 y Office 3". */
function listarNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

// ─────────────────────────────────────────────────────────────
// 9. Menores de 18 años (Art. 6 ET)
// ─────────────────────────────────────────────────────────────

/** Más de 4 h 30 seguidas, y un menor necesita 30 minutos de pausa. */
const MENOR_PAUSA_DESDE_MIN = 4 * 60 + 30

/**
 * Solo para los puestos marcados como "menores de 18" en el catálogo. El
 * cuadrante no los planifica aparte: los monta como a los demás y aquí se
 * dice, turno a turno, cuál no puede hacer un menor, para que se cambie a
 * mano o se quite la marca.
 */
function avisosMenores(roster: Roster, model: StaffingModel): Aviso[] {
  const avisos: Aviso[] = []
  const pausa = new Set<DayIndex>()
  // Un aviso por persona y motivo, con los días juntos: siete líneas iguales
  // por persona taparían el resto de la revisión.
  for (const person of roster.people) {
    const role = model.roles.find((r) => r.id === person.roleId)
    if (!role?.menores) continue
    const noche: DayIndex[] = []
    const largos: { day: DayIndex; minutos: number }[] = []
    for (const sh of roster.shifts) {
      if (sh.personId !== person.id) continue
      const minutos = sh.blocks.reduce((a, b) => a + (b.endMin - b.startMin), 0)
      if (minutosDeNoche(sh) > 0) noche.push(sh.day)
      if (minutos > MENOR_MAX_MIN) largos.push({ day: sh.day, minutos })
      if (sh.blocks.some((b) => b.endMin - b.startMin > MENOR_PAUSA_DESDE_MIN)) pausa.add(sh.day)
    }
    noche.sort()
    largos.sort((a, b) => a.day - b.day)
    // Sus dos días de descanso seguidos (art. 37.1 ET, ronda 6, G2). Antes se
    // medían las 36 h de todos, y un menor de seis días con 42 h no avisaba.
    const descanso = descansoSemanalMasLargoMin(roster.shifts, person.id)
    if (descanso !== null && descanso < DESCANSO_SEMANAL_MENOR_MIN) {
      avisos.push({
        tipo: 'menores',
        gravedad: 'legal',
        personId: person.id,
        personLabel: person.label,
        mensaje: `${person.label} (${role.name}, puesto de menores) descansa como mucho ${fmtNumero(descanso / 60)} h seguidas en la semana: un menor de 18 necesita dos días seguidos de descanso.`,
        days: person.daysOff,
      })
    }
    if (noche.length > 0) {
      avisos.push({
        tipo: 'menores',
        gravedad: 'legal',
        personId: person.id,
        personLabel: person.label,
        mensaje: `${person.label} (${role.name}, puesto de menores) sigue trabajando pasadas las 22:00 el ${listarDias(noche)}: un menor de 18 no puede trabajar de noche.`,
        days: noche,
      })
    }
    if (largos.length > 0) {
      const max = Math.max(...largos.map((l) => l.minutos))
      avisos.push({
        tipo: 'menores',
        gravedad: 'legal',
        personId: person.id,
        personLabel: person.label,
        mensaje: `${person.label} (${role.name}, puesto de menores) pasa de 8 h el ${listarDias(largos.map((l) => l.day))}, hasta ${fmtNumero(max / 60)} h: un menor de 18 no puede pasar de 8 h al día.`,
        days: largos.map((l) => l.day),
      })
    }
  }
  // Lo que su puesto pide de noche no se le reparte (`buildRoster`): queda sin
  // cubrir, y hay que decir por qué y qué hacer.
  for (const role of model.roles) {
    if (!role.menores) continue
    const grid = roster.uncovered[role.id]
    if (!grid) continue
    const dias: DayIndex[] = []
    let horas = 0
    for (let d = 0; d < 7; d++) {
      let enDia = 0
      for (let sl = 0; sl < grid[d].length; sl++) {
        if (slotStartMin(sl) >= NOCHE_DESDE_MIN) enDia += (grid[d][sl] * SLOT_MINUTES) / 60
      }
      if (enDia > 0) dias.push(d as DayIndex)
      horas += enDia
    }
    if (horas <= 0) continue
    avisos.push({
      tipo: 'menores',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje: `${role.name} es un puesto de menores y tu local lo pide pasadas las 22:00 el ${listarDias(dias)}: esas ${fmtNumero(horas)} h a la semana no se las pongo a un menor y quedan sin cubrir. Ponlas en un puesto de mayores de edad o quita la marca.`,
      days: dias,
    })
  }
  if (pausa.size > 0) {
    avisos.push({
      tipo: 'menores',
      gravedad: 'aviso',
      personId: null,
      personLabel: null,
      mensaje: `Los menores con turnos de más de 4 h 30 seguidas (${listarDias([...pausa].sort())}) necesitan una pausa de 30 minutos dentro del turno.`,
      days: [...pausa].sort(),
    })
  }
  return avisos
}

// ─────────────────────────────────────────────────────────────

/**
 * Qué comprobaciones se han llegado a hacer, con su nombre en castellano.
 *
 * Hace falta para poder decir en pantalla lo que SÍ cumple, no solo lo que
 * falla: una lista con dos avisos y nada más deja sin saber si lo demás se ha
 * mirado. Y no se puede dar por buena una comprobación que el usuario ha
 * apagado — si no ha pedido libranzas seguidas, decirle que las cumple sería
 * apuntarse un tanto que no existe.
 */
export function comprobacionesHechas(
  settings: Settings,
  mandos?: Roster['mandos'],
  roles?: StaffingModel['roles'],
): { tipo: AvisoTipo; nombre: string }[] {
  const hechas: { tipo: AvisoTipo; nombre: string }[] = []
  if (settings.minRestBetweenShifts) hechas.push({ tipo: 'descanso', nombre: 'descanso de 12 h entre turnos' })
  if (settings.consecutiveDaysOff) hechas.push({ tipo: 'libranzas', nombre: 'libranzas seguidas' })
  hechas.push({ tipo: 'horas', nombre: 'horas dentro del contrato' })
  hechas.push({ tipo: 'contrato-flojo', nombre: 'contratos aprovechados' })
  hechas.push({ tipo: 'dia-suelto', nombre: 'nadie viene un solo día' })
  hechas.push({ tipo: 'sin-cubrir', nombre: 'todas las franjas cubiertas' })
  hechas.push({ tipo: 'tope-diario', nombre: `nadie pasa de ${fmtNumero(topeDiarioMin(settings) / 60)} h al día` })
  hechas.push({ tipo: 'pausa', nombre: 'pausa en los turnos de más de 6 h' })
  hechas.push({ tipo: 'descanso-semanal', nombre: 'día y medio de descanso a la semana' })
  if (mandos && mandos.length > 0) hechas.push({ tipo: 'mando', nombre: 'siempre alguien de la zona al frente' })
  hechas.push({ tipo: 'nocturno', nombre: 'nocturnos sin pasar de 8 h de media' })
  if (roles?.some((r) => r.menores)) {
    hechas.push({ tipo: 'menores', nombre: 'menores sin noche, sin pasar de 8 h y con dos días seguidos de descanso' })
  }
  return hechas
}

/** Lo que la revisión necesita saber y no está en el cuadrante (ronda 5). */
export interface ExtrasRevision {
  /** La preparación que no cabe en el día del cuadrante (`preparacionRecortada`). */
  preparacionRecortada?: PreparacionRecortada[]
}

export function revisarCuadrante(
  roster: Roster,
  model: StaffingModel,
  settings: Settings,
  extras: ExtrasRevision = {},
): Aviso[] {
  const avisos = [
    ...avisosPreparacion(extras.preparacionRecortada ?? [], model),
    ...avisosDescanso(roster, settings),
    ...avisosDescansoSemanal(roster),
    ...avisosAjustesLegales(roster, settings),
    ...avisosTopeDiario(roster, settings),
    ...avisosHoras(roster, model),
    ...avisosContratoFlojo(roster, model, settings),
    ...avisosDiaSuelto(roster, model),
    ...avisosPuestoPlegado(roster, model),
    ...avisosPuestoPartido(roster, model, settings),
    ...avisosLibranzas(roster, settings),
    ...avisoSinCubrir(roster),
    ...avisosMandos(roster, model),
    ...avisoPausa(roster),
    ...avisosNocturno(roster),
    ...avisosMenores(roster, model),
  ]

  // Primero lo legal, después lo que es solo mejorable. Dentro de cada grupo
  // se respeta el orden en que se generó, así que el sort es estable a propósito.
  return avisos.sort((a, b) => {
    if (a.gravedad === b.gravedad) return 0
    return a.gravedad === 'legal' ? -1 : 1
  })
}
