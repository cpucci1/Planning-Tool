/**
 * Comprobaciones de la cadena de demanda (cambios del 2026-11-04).
 *
 *   npx esbuild scripts/comprobar-demanda.ts --bundle --platform=node --format=esm \
 *     --alias:@=./src --external:xlsx --log-level=error --outfile=/tmp/comprobar-demanda.mjs \
 *     && node /tmp/comprobar-demanda.mjs
 *
 * A diferencia de `verificar-calculo.ts`, que imprime la cadena para mirarla,
 * esto FALLA (sale con código 1) si alguna regla no se cumple:
 *
 *   1. Pasar a sentados conserva los comensales: sentados × media hora es
 *      exactamente comensales × lo que dura la comida.
 *   2. Quien abre y cierra cocina por defecto es un puesto con gente en los
 *      tramos (no el jefe de partida, que arranca a cero).
 *   3. La preparación aparece en la necesidad antes de abrir.
 *   4. Un plan de antes (sin `mealMinutes` ni `prepByBlock`) da exactamente lo
 *      mismo que la cadena de entonces.
 *   5. El ajuste de la cobertura no mueve la línea y no entra en bucle.
 *
 * Y mide cuánto tarda la cadena, que corre en cada tecla y en cada píxel del
 * arrastre de la línea de cobertura.
 */

import { analyzeFile } from '../src/lib/fakeAI'
import {
  MEAL_CUT_MIN,
  applyLag,
  clampToHours,
  coherentCoveragePct,
  coverageThreshold,
  seatedAtOnce,
  typicalWeek,
} from '../src/lib/demand'
import {
  applyOpeningMinimums,
  blockPeopleGrid,
  buildNeedGrid,
  clampToTierMax,
  openingRoleFor,
} from '../src/lib/staffing'
import { conColchon, curvaDeTrabajo, necesidadCompleta, necesidadDeServicio } from '../src/lib/necesidad'
import { DEFAULT_BLOCKS, DEFAULT_ROLES, DEFAULT_SETTINGS, DEFAULT_TIERS, DEFAULT_TIERS_COBROS, KITCHEN_BLOCK_ID } from '../src/data/presets'
import { GRID_START_MIN, SLOTS_PER_DAY, SLOT_MINUTES, slotStartMin } from '../src/lib/time'
import type { NeedGrid, Settings } from '../src/lib/types'

let fallos = 0
let pasadas = 0
function check(ok: boolean, que: string) {
  if (ok) {
    pasadas++
    console.log(`  bien  ${que}`)
  } else {
    fallos++
    console.log(`  MAL   ${que}`)
  }
}
const sum = (m: number[][]) => m.reduce((a, d) => a + d.reduce((x, y) => x + y, 0), 0)
const iguales = (a: NeedGrid, b: NeedGrid) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => a[k].every((d, i) => d.every((v, s) => v === b[k]?.[i]?.[s])))

async function main() {
  const d = await analyzeFile(null, undefined, 1000)
  const hours = d.source.detectedHours
  const model = { blocks: DEFAULT_BLOCKS, roles: DEFAULT_ROLES, tiers: DEFAULT_TIERS }
  const settings: Settings = { ...DEFAULT_SETTINGS, coveragePct: coherentCoveragePct(d.weeks, DEFAULT_SETTINGS.coveragePct) }
  const typical = typicalWeek(d.weeks, settings.coveragePct, settings.sizingMode)
  const meal = settings.mealMinutes!

  console.log('\n1. Sentados a la vez conserva los comensales')
  {
    // Lo que tendría que salir: cada cobro × lo que dura su comida.
    const esperado = typical.reduce(
      (acc, day) =>
        acc +
        day.reduce((a, c, s) => {
          const pay = slotStartMin(s) + SLOT_MINUTES / 2
          // Escrita aquí a mano, no con la función de la herramienta, para que
          // la comprobación no se dé la razón a sí misma.
          // Con merienda (ronda 8, M1): comida hasta las 17:30, merienda
          // hasta las 20:00 y cena desde ahí.
          const corteComida = meal.merienda !== undefined ? 17 * 60 + 30 : MEAL_CUT_MIN
          const dur =
            pay < 12 * 60 + 30
              ? (meal.breakfast ?? meal.midday)
              : pay < corteComida
                ? meal.midday
                : meal.merienda !== undefined && pay < 20 * 60
                  ? meal.merienda
                  : pay < 25 * 60
                    ? meal.night
                    : (meal.drinks ?? meal.night)
          return a + c * dur
        }, 0),
      0,
    )
    const obtenido = sum(seatedAtOnce(typical, meal, false)) * SLOT_MINUTES
    check(Math.abs(obtenido - esperado) < 1e-6, `ejemplo: ${obtenido.toFixed(1)} = ${esperado.toFixed(1)} minutos-persona`)

    // Un caso a mano: 10 cobros a las 15:00 (mediodía, 75 min) y 6 a las 23:00 (noche, 90 min).
    const dia = new Array<number>(SLOTS_PER_DAY).fill(0)
    const s15 = (15 * 60 - GRID_START_MIN) / SLOT_MINUTES
    const s23 = (23 * 60 - GRID_START_MIN) / SLOT_MINUTES
    dia[s15] = 10
    dia[s23] = 6
    const semana = [dia, ...Array.from({ length: 6 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))]
    const r = seatedAtOnce(semana, meal, false)[0]
    check(Math.abs(sum([r]) * SLOT_MINUTES - (10 * 75 + 6 * 90)) < 1e-6, 'caso a mano: 10 × 75 + 6 × 90 minutos-persona')
    // Quien paga a las 15:15 (mitad de la franja) se sentó a las 14:00.
    check(r[s15] === 5 && r[s15 - 1] === 10 && r[s15 - 2] === 10 && r[s15 - 3] === 0, 'el cobro de las 15:00 ocupa 14:00-15:15')
    check(r[s23] === 3 && r[s23 - 1] === 6 && r[s23 - 2] === 6 && r[s23 - 3] === 3, 'el de las 23:00 ocupa 21:45-23:15')

    // Ronda 5, G2: un desayuno no es una comida de 75 minutos. 20 cafés que se
    // pagan a las 08:30 ocupan 25 minutos cada uno, y una copa a las 02:00, 60.
    const s0830 = (8 * 60 + 30 - GRID_START_MIN) / SLOT_MINUTES
    const s0200 = (26 * 60 - GRID_START_MIN) / SLOT_MINUTES
    const cafe = new Array<number>(SLOTS_PER_DAY).fill(0)
    cafe[s0830] = 20
    cafe[s0200] = 12
    const semCafe = [cafe, ...Array.from({ length: 6 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))]
    const rc = seatedAtOnce(semCafe, meal, false)[0]
    check(meal.breakfast === 25 && meal.drinks === 60, 'de partida: desayuno 25 min y copas 60')
    check(Math.abs(sum([rc]) * SLOT_MINUTES - (20 * 25 + 12 * 60)) < 1e-6, 'desayuno y copas: 20 × 25 + 12 × 60 minutos-persona')
    // Un plan de entre el 2026-11-04 y la ronda 5 (sin desayuno ni copas) se calcula como entonces.
    const viejoMeal = { midday: meal.midday, night: meal.night }
    const rv = seatedAtOnce(semCafe, viejoMeal, false)[0]
    check(Math.abs(sum([rv]) * SLOT_MINUTES - (20 * meal.midday + 12 * meal.night)) < 1e-6, 'un plan sin desayuno ni copas no cambia')

    // Ronda 8, M1: el café de la tarde no es una comida ni una cena. 30
    // cobros a las 18:00 ocupan 35 min cada uno (de partida), no 90; con un
    // plan de antes (sin merienda) siguen siendo cena, como se calcularon.
    const s1800 = (18 * 60 - GRID_START_MIN) / SLOT_MINUTES
    const tarde = new Array<number>(SLOTS_PER_DAY).fill(0)
    tarde[s1800] = 30
    const semTarde = [tarde, ...Array.from({ length: 6 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))]
    check(meal.merienda === 35, 'de partida: merienda 35 min')
    check(Math.abs(sum(seatedAtOnce(semTarde, meal, false)) * SLOT_MINUTES - 30 * 35) < 1e-6, 'merienda: 30 cafés a las 18:00 son 30 × 35 minutos-persona')
    const sinMerienda = { midday: meal.midday, night: meal.night, breakfast: meal.breakfast, drinks: meal.drinks }
    check(Math.abs(sum(seatedAtOnce(semTarde, sinMerienda, false)) * SLOT_MINUTES - 30 * meal.night) < 1e-6, 'un plan sin merienda sigue contando la tarde como cena')
    // Y los bordes: 17:00 es comida, 20:00 es cena.
    const s1700 = (17 * 60 - GRID_START_MIN) / SLOT_MINUTES
    const s2000 = (20 * 60 - GRID_START_MIN) / SLOT_MINUTES
    const bordes = new Array<number>(SLOTS_PER_DAY).fill(0)
    bordes[s1700] = 4
    bordes[s2000] = 4
    const semBordes = [bordes, ...Array.from({ length: 6 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))]
    check(Math.abs(sum(seatedAtOnce(semBordes, meal, false)) * SLOT_MINUTES - (4 * meal.midday + 4 * meal.night)) < 1e-6, 'a las 17:00 es comida y a las 20:00 es cena')

    // Redondeado, para los tramos: enteros siempre (un 40,5 caería en el último tramo).
    check(seatedAtOnce(typical, meal).every((day) => day.every((v) => Number.isInteger(v))), 'los sentados redondeados son enteros')
  }

  console.log('\n2. Quién abre y cierra por defecto')
  {
    const cocina = openingRoleFor(model, KITCHEN_BLOCK_ID)
    const conGente = !!cocina && model.tiers.some((t) => (t.staff[cocina.id] ?? 0) > 0)
    check(conGente, `cocina: ${cocina?.name} tiene gente en los tramos`)
    check(cocina?.id !== 'jefe-partida', 'cocina: no es el jefe de partida')
    const sala = openingRoleFor(model, 'sala')
    check(!!sala && !sala.fullTimeOnly && model.tiers.some((t) => (t.staff[sala.id] ?? 0) > 0), `sala: ${sala?.name}, con gente y sin solo jornada completa`)
    // Elegido a mano: manda la elección.
    check(openingRoleFor(model, KITCHEN_BLOCK_ID, 'office')?.id === 'office', 'si eliges office, abre office')
    // Y el mínimo se lo lleva ese puesto.
    const vacia: NeedGrid = Object.fromEntries(model.roles.map((r) => [r.id, Array.from({ length: 7 }, () => new Array<number>(SLOTS_PER_DAY).fill(0))]))
    const conMin = applyOpeningMinimums(vacia, model, { [KITCHEN_BLOCK_ID]: 1 }, () => hours)
    check(sum(conMin['jefe-partida']) === 0 && sum(conMin[cocina!.id]) > 0, 'el mínimo de cocina cae en ese puesto, no en el jefe de partida')
  }

  console.log('\n3. La preparación aparece antes de abrir')
  {
    const curve = curvaDeTrabajo(typical, hours, settings)
    const staffing = conColchon(curve, settings)
    const demand = necesidadDeServicio(staffing, model, null, KITCHEN_BLOCK_ID)
    const full = necesidadCompleta(demand, staffing, model, hours, null, KITCHEN_BLOCK_ID, settings)
    const cocinaFull = blockPeopleGrid(full, model, KITCHEN_BLOCK_ID)
    const salaFull = blockPeopleGrid(full, model, 'sala')
    let antes = 0
    let despues = 0
    let tramos = 0
    let sinCurva = true
    for (let day = 0; day < 7; day++) {
      for (const b of hours[day] ?? []) {
        tramos++
        const sAbre = (b.startMin - GRID_START_MIN) / SLOT_MINUTES
        const sCierra = (b.endMin - GRID_START_MIN) / SLOT_MINUTES
        // Las dos medias horas antes de abrir (60 min de cocina) tienen gente,
        // y a esa hora no hay nadie sentado: es preparación, no servicio.
        if (cocinaFull[day][sAbre - 1] > 0 && cocinaFull[day][sAbre - 2] > 0) antes++
        if (curve[day][sAbre - 1] !== 0 || curve[day][sAbre - 2] !== 0) sinCurva = false
        if (salaFull[day][sCierra] > 0 && cocinaFull[day][sCierra] > 0) despues++
      }
    }
    check(antes === tramos, `cocina entra 60 min antes en ${antes} de ${tramos} servicios`)
    check(sinCurva, 'antes de abrir no hay nadie sentado: esa gente sale de la preparación')
    check(despues === tramos, `sala y cocina se quedan después de cerrar en ${despues} de ${tramos} servicios`)
    const h = (g: NeedGrid) => (Object.values(g).reduce((a, m) => a + sum(m), 0) * SLOT_MINUTES) / 60
    console.log(`        servicio ${h(demand).toFixed(1)} h + preparación y recogida ${(h(full) - h(demand)).toFixed(1)} h`)
    check(h(full) > h(demand), 'la preparación suma horas')
  }

  console.log('\n4. Un plan de antes da lo mismo que entonces')
  {
    const viejo: Settings = { ...DEFAULT_SETTINGS, lagMinutes: 30, coveragePct: 80, minStaffByBlock: { sala: 1, cocina: 1 }, prepBeforeMin: 30, prepAfterMin: 30 }
    delete viejo.mealMinutes
    delete viejo.prepByBlock
    delete viejo.openingRoleByBlock
    const oldModel = { ...model, tiers: DEFAULT_TIERS_COBROS }
    const typ = typicalWeek(d.weeks, 80, viejo.sizingMode)
    // La cadena de entonces, escrita aquí a mano tal y como estaba en usePlanner.
    const lagged = clampToHours(applyLag(typ, 30), hours)
    const demandaAntes = clampToTierMax(buildNeedGrid(lagged, oldModel), lagged, oldModel)
    const curve = curvaDeTrabajo(typ, hours, viejo)
    const demandaAhora = necesidadDeServicio(conColchon(curve, viejo), oldModel, null, KITCHEN_BLOCK_ID)
    check(iguales(demandaAntes, demandaAhora), 'misma necesidad de servicio, franja a franja')
    // Con mínimo y preparación global: igual salvo el puesto que abre, que es el arreglo.
    const ahora = necesidadCompleta(demandaAhora, curve, oldModel, hours, null, KITCHEN_BLOCK_ID, viejo)
    check(sum(ahora['jefe-partida']) === 0, 'y el mínimo ya no cae en el jefe de partida')
  }

  console.log('\n5. La cobertura coherente')
  {
    const pct = coherentCoveragePct(d.weeks, 80)
    const a = coverageThreshold(d.weeks, 80).weeksCovered
    const b = coverageThreshold(d.weeks, pct).weeksCovered
    check(a === b, `80 % pasa a ${pct} % y sigue cubriendo ${b} de ${d.weeks.length} semanas`)
    check(pct === Math.round((b / d.weeks.length) * 100), 'el porcentaje es el de las semanas cubiertas')
    let estable = true
    for (let p = 1; p <= 99; p++) {
      const q = coherentCoveragePct(d.weeks, p)
      if (coherentCoveragePct(d.weeks, q) !== q) estable = false
      if (coverageThreshold(d.weeks, q).weeksCovered !== coverageThreshold(d.weeks, p).weeksCovered) estable = false
    }
    check(estable, 'de 1 a 99: nunca mueve la línea y aplicarlo dos veces da lo mismo')
  }

  console.log('\n6. Lo que tarda (media de 200 vueltas)')
  {
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) {
      const curve = curvaDeTrabajo(typical, hours, settings)
      const st = conColchon(curve, settings)
      const dem = necesidadDeServicio(st, model, null, KITCHEN_BLOCK_ID)
      necesidadCompleta(dem, st, model, hours, null, KITCHEN_BLOCK_ID, { ...settings, minStaffByBlock: { sala: 1, cocina: 1 } })
    }
    const nuevo = (performance.now() - t0) / 200
    const t1 = performance.now()
    for (let i = 0; i < 200; i++) {
      const lagged = clampToHours(applyLag(typical, 30), hours)
      const g = clampToTierMax(buildNeedGrid(lagged, model), lagged, model)
      applyOpeningMinimums(g, model, { sala: 1, cocina: 1 }, () => hours)
    }
    const viejo = (performance.now() - t1) / 200
    console.log(`        cadena de antes ${viejo.toFixed(3)} ms · cadena nueva ${nuevo.toFixed(3)} ms`)
    check(nuevo < 5, 'la cadena nueva tarda menos de 5 ms')
  }

  console.log(`\n${pasadas} comprobaciones pasadas, ${fallos} fallidas\n`)
  if (fallos > 0) process.exit(1)
}

main()
