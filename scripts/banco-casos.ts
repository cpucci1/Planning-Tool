/**
 * El banco de la revisión ronda 8, dentro de las comprobaciones.
 *
 * La ronda 2 dio por arreglado que nadie viniera un solo día, pero solo lo
 * comprobaba con sus propios casos (`comprobar-cuadrante.ts`). Con ficheros
 * reales volvió: un cocinero de 10 h que venía el sábado y un ayudante de una
 * cafetería que venía un día a hacer 4 h. Aquí están los locales con los que
 * la revisión lo encontró, generados igual que ella (un año de cobros con
 * ruido), y pasados por el MISMO camino que la app: el fichero se lee, se
 * deduce el horario, la semana tipo, la necesidad y el cuadrante.
 *
 * Es determinista: la semilla es fija, así que cada vez salen los mismos
 * cobros y el mismo cuadrante.
 */

import { leerFichero, construirDatasetConDiagnostico } from '../src/lib/parseFichero'
import { usableWeeks, coherentCoveragePct, coverageThreshold, typicalWeek } from '../src/lib/demand'
import { detectSpecialWeeks } from '../src/lib/holidays'
import {
  cobrosDeLaSemana,
  conColchon,
  contextoDelCuadrante,
  curvaDeTrabajo,
  necesidadCompleta,
  necesidadDeServicio,
  preparacionRecortada,
} from '../src/lib/necesidad'
import { summarize } from '../src/lib/staffing'
import { buildRoster } from '../src/lib/roster'
import { summarizePlan } from '../src/lib/contracts'
import { revisarCuadrante } from '../src/lib/avisos'
import { DEFAULT_BLOCKS, DEFAULT_ROLES, DEFAULT_SETTINGS, DEFAULT_TIERS, KITCHEN_BLOCK_ID } from '../src/data/presets'
import type { Role, Settings, StaffingModel } from '../src/lib/types'

interface Servicio {
  /** Horas de cobro, en horas (24+ para la madrugada). */
  desde: number
  hasta: number
  /** Mesas que pagan cada día, de lunes a domingo. */
  mesas: number[]
  comensales: [number, number]
  ticket: number
}

export interface CasoBanco {
  nombre: string
  servicios: Servicio[]
  estacional?: (semana: number) => number
  cerradas?: number[]
  ruido?: { devoluciones?: number; madrugada?: number; diasCero?: number; banquete?: boolean }
  /** El TPV no trae comensales: se estiman desde los tickets, como en la mayoría de España. */
  sinComensales?: boolean
  roles?: (r: Role[]) => Role[]
  settings?: Partial<Settings>
}

let seed = 1
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pois = (l: number) => {
  const L = Math.exp(-l)
  let k = 0
  let p = 1
  do {
    k++
    p *= rnd()
  } while (p > L)
  return k - 1
}
const gauss = () => {
  let u = 0
  let v = 0
  while (!u) u = rnd()
  while (!v) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const fmtFecha = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
function semanaIso(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dia = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dia)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
}

/** Un año de cobros (2025) en el formato más corriente: fecha, hora, total y comensales. */
export function csvDelCaso(c: CasoBanco): string {
  seed = 7
  const conCm = !c.sinComensales
  const filas: string[] = [conCm ? 'Fecha;Hora;Total;Comensales' : 'Fecha;Hora;Total']
  const inicio = new Date(Date.UTC(2024, 11, 30))
  for (let i = 0; i < 364; i++) {
    const d = new Date(inicio.getTime() + i * 86400000)
    const dow = (d.getUTCDay() + 6) % 7
    const sem = semanaIso(d)
    if (c.cerradas?.includes(sem)) continue
    if (c.ruido?.diasCero && rnd() < c.ruido.diasCero) continue
    const f = c.estacional ? c.estacional(sem) : 1
    for (const s of c.servicios) {
      const n = pois(s.mesas[dow] * f)
      for (let k = 0; k < n; k++) {
        const min = Math.round((s.desde + rnd() * (s.hasta - s.desde)) * 60)
        const fecha = min >= 1440 ? new Date(d.getTime() + 86400000) : d
        const m = min % 1440
        const cm = s.comensales[0] + Math.floor(rnd() * (s.comensales[1] - s.comensales[0] + 1))
        const imp = Math.max(1, cm * s.ticket * (1 + 0.2 * gauss()))
        const hh = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        filas.push(`${fmtFecha(fecha)};${hh};${imp.toFixed(2).replace('.', ',')}${conCm ? ';' + cm : ''}`)
        if (c.ruido?.devoluciones && rnd() < c.ruido.devoluciones) filas.push(`${fmtFecha(fecha)};${hh};-${imp.toFixed(2).replace('.', ',')}${conCm ? ';-' + cm : ''}`)
      }
    }
    if (c.ruido?.madrugada && rnd() < c.ruido.madrugada) {
      filas.push(`${fmtFecha(new Date(d.getTime() + 86400000))};04:${String(Math.floor(rnd() * 59)).padStart(2, '0')};12,50${conCm ? ';1' : ''}`)
    }
    if (c.ruido?.banquete && sem === 20 && dow === 5) {
      for (let k = 0; k < 40; k++) filas.push(`${fmtFecha(d)};16:${String(k).padStart(2, '0')};450,00${conCm ? ';10' : ''}`)
    }
  }
  return filas.join('\n')
}

/** El camino de la app, del fichero al cuadrante y su revisión. */
export async function cuadranteDelCaso(c: CasoBanco) {
  const file = new File([csvDelCaso(c)], `${c.nombre}.csv`, { type: 'text/csv' })
  const fichero = await leerFichero(file)
  const res = construirDatasetConDiagnostico(fichero.filas, fichero.columnas, {
    fileName: file.name,
    comensalesPorTicket: 2,
    hoy: new Date(Date.UTC(2026, 10, 4)),
  })
  const d = res.dataset
  const weeks = usableWeeks(d, detectSpecialWeeks(d.weeks, d.year))
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(c.settings ?? {}) }
  settings.coveragePct = coherentCoveragePct(weeks, settings.coveragePct)
  let roles = DEFAULT_ROLES.map((r) => ({ ...r, hourlyCostEur: 12 }))
  if (c.roles) roles = c.roles(roles)
  const model: StaffingModel = { blocks: DEFAULT_BLOCKS, roles, tiers: DEFAULT_TIERS }
  const hours = d.source.detectedHours
  coverageThreshold(weeks, settings.coveragePct)
  const typical = typicalWeek(weeks, settings.coveragePct, settings.sizingMode)
  const curva = curvaDeTrabajo(typical, hours, settings)
  const cobros = cobrosDeLaSemana(typical, curva, hours, settings)
  const st = conColchon(curva, settings)
  const grid = necesidadCompleta(necesidadDeServicio(st, model, null, KITCHEN_BLOCK_ID), st, model, hours, null, KITCHEN_BLOCK_ID, settings)
  const ctx = contextoDelCuadrante(hours, null, KITCHEN_BLOCK_ID, settings, cobros)
  const roster = buildRoster(grid, model, settings, ctx)
  const plan = summarizePlan(roster, settings, summarize(grid, model), grid, model)
  const avisos = revisarCuadrante(roster, model, settings, {
    preparacionRecortada: preparacionRecortada(hours, null, KITCHEN_BLOCK_ID, settings, model),
  })
  return { roster, model, settings, plan, avisos, grid, hours, fuerza: ctx.comensalesPorDia ?? [] }
}

const verano = (s: number) => (s >= 26 && s <= 35 ? 1.5 : s >= 1 && s <= 8 ? 0.8 : 1)

/** Los ocho locales de la revisión ronda 8 y uno más: el de horario seguido de 12 a 01 con dos responsables en el pico. */
export const CASOS_BANCO: CasoBanco[] = [
  { nombre: 'menú del día de 10 mesas', servicios: [{ desde: 13.75, hasta: 16.5, mesas: [45, 45, 48, 50, 55, 0, 0], comensales: [1, 3], ticket: 10 }], cerradas: [32, 33, 34], ruido: { devoluciones: 0.01, diasCero: 0.01 } },
  {
    nombre: 'bar de tapas',
    servicios: [
      { desde: 12.5, hasta: 16.25, mesas: [30, 0, 30, 35, 45, 70, 65], comensales: [1, 4], ticket: 6 },
      { desde: 20, hasta: 24.5, mesas: [25, 0, 30, 40, 70, 80, 30], comensales: [1, 4], ticket: 6 },
    ],
    ruido: { devoluciones: 0.02, madrugada: 0.3 },
  },
  {
    nombre: 'restaurante de 25',
    servicios: [
      { desde: 14.5, hasta: 17, mesas: [0, 20, 22, 24, 28, 40, 45], comensales: [2, 6], ticket: 25 },
      { desde: 21.5, hasta: 24, mesas: [0, 0, 15, 20, 35, 40, 0], comensales: [2, 6], ticket: 25 },
    ],
    estacional: verano,
    ruido: { banquete: true, devoluciones: 0.005 },
  },
  {
    nombre: 'cafetería',
    servicios: [
      { desde: 7.5, hasta: 12, mesas: [120, 120, 120, 120, 130, 90, 0], comensales: [1, 2], ticket: 3 },
      { desde: 13, hasta: 16, mesas: [40, 40, 40, 40, 40, 30, 0], comensales: [1, 2], ticket: 11 },
      { desde: 17, hasta: 20, mesas: [50, 50, 50, 50, 60, 60, 0], comensales: [1, 3], ticket: 4 },
    ],
  },
  {
    nombre: 'hotel',
    servicios: [
      { desde: 7, hasta: 11, mesas: [60, 60, 60, 60, 70, 90, 90], comensales: [1, 3], ticket: 14 },
      { desde: 20.5, hasta: 23.5, mesas: [20, 20, 20, 25, 35, 40, 25], comensales: [2, 4], ticket: 35 },
    ],
    estacional: verano,
  },
  { nombre: 'copas sin comensales', sinComensales: true, servicios: [{ desde: 23, hasta: 29.5, mesas: [0, 0, 0, 60, 150, 200, 0], comensales: [1, 1], ticket: 9 }] },
  {
    nombre: 'playa de temporada',
    servicios: [
      { desde: 13.5, hasta: 17, mesas: [40, 40, 40, 45, 60, 90, 90], comensales: [2, 5], ticket: 22 },
      { desde: 20.5, hasta: 24, mesas: [30, 30, 30, 35, 50, 70, 50], comensales: [2, 5], ticket: 22 },
    ],
    cerradas: [...Array.from({ length: 21 }, (_, i) => i + 1), ...Array.from({ length: 14 }, (_, i) => i + 39)],
  },
  {
    nombre: 'restaurante grande con mandos',
    servicios: [
      { desde: 13.5, hasta: 17, mesas: [60, 60, 65, 70, 90, 140, 130], comensales: [2, 6], ticket: 30 },
      { desde: 20.5, hasta: 24.5, mesas: [40, 40, 45, 60, 110, 140, 50], comensales: [2, 6], ticket: 35 },
    ],
    roles: (r) => r.map((x) => (x.id === 'encargado' || x.id === 'jefe-cocina' ? { ...x, headcount: 1 } : x)),
    settings: { calcularCostes: true, plusNocturnidadPct: 25 } as Partial<Settings>,
  },
  {
    nombre: 'horario seguido de 12 a 01, sin mandos',
    servicios: [
      { desde: 12, hasta: 17.5, mesas: [80, 80, 75, 90, 120, 260, 220], comensales: [2, 5], ticket: 22 },
      { desde: 18, hasta: 24.5, mesas: [80, 80, 80, 100, 160, 280, 170], comensales: [2, 5], ticket: 25 },
    ],
  },
]
