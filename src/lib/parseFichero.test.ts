/**
 * Pruebas del lector de ficheros.
 *
 * En este proyecto no hay corredor de tests, así que esto es un guion que se
 * ejecuta igual que `npm run verificar`:
 *
 *   npx esbuild src/lib/parseFichero.test.ts --bundle --platform=node \
 *     --format=esm --alias:@=./src --external:xlsx --log-level=error \
 *     --outfile=node_modules/.tmp/parseFichero.test.mjs \
 *     && node node_modules/.tmp/parseFichero.test.mjs
 *
 * Sale con código 1 si algo falla, así que sirve tal cual en un hook o en CI.
 *
 * Los ficheros de prueba se escriben aquí, byte a byte, y son los cinco casos
 * que de verdad llegan de un TPV español:
 *
 *   1. Punto y coma, acentos en latin1 y coma decimal.
 *   2. Fechas americanas (mm/dd) mezcladas con la coma como separador.
 *   3. Sin columna de comensales: solo tickets.
 *   4. Filas rotas mezcladas con filas buenas.
 *   5. Una sola semana de histórico.
 *
 * Y cuatro más que cubren lo que más caro sale si se rompe: los números con
 * separadores españoles, la madrugada que pertenece al día anterior, Excel con
 * sus fechas serie, y las fechas que no se pueden desambiguar.
 */

import {
  construirDatasetConDiagnostico,
  decodificarTexto,
  detectarFormatoFecha,
  detectarPasoHorario,
  detectarSeparador,
  franjasPorFila,
  leerFichero,
  leerYConstruir,
  parsearCSV,
  parsearHora,
  parsearNumero,
  redondearConservandoTotal,
  aplicarHueco,
  zonaDeLaHora,
  type Advertencia,
  type Descarte,
  type MotivoDescarte,
} from './parseFichero'
import { mapeoConCantidad, mapeoSuficiente } from './mapeo'
import { describeMapping, detectSpecialWeeks } from './holidays'
import { temporadaDelLocal } from './contracts'
import { typicalWeek, usableWeeks } from './demand'

// ─────────────────────────────────────────────────────────────
// Arnés
// ─────────────────────────────────────────────────────────────

let pasadas = 0
const fallos: string[] = []
let bloque = ''

function titulo(t: string) {
  bloque = t
  console.log(`\n\x1b[1m${t}\x1b[0m`)
}

function comprobar(que: string, condicion: boolean, detalle = '') {
  if (condicion) {
    pasadas++
    console.log(`  \x1b[32mok\x1b[0m   ${que}`)
  } else {
    fallos.push(`${bloque} → ${que}${detalle ? ` (${detalle})` : ''}`)
    console.log(`  \x1b[31mFALLA\x1b[0m ${que}${detalle ? `  ${detalle}` : ''}`)
  }
}

function igual(que: string, obtenido: unknown, esperado: unknown) {
  comprobar(que, Object.is(obtenido, esperado), `esperaba ${String(esperado)}, salió ${String(obtenido)}`)
}

/**
 * Texto a bytes windows-1252.
 *
 * Los acentos españoles caen todos por debajo del 256, así que el byte es el
 * propio punto de código. Es exactamente el fichero que suelta un TPV viejo.
 */
function aLatin1(texto: string): Uint8Array {
  const bytes = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) {
    const c = texto.codePointAt(i) ?? 63
    bytes[i] = c <= 0xff ? c : 63 // '?'
  }
  return bytes
}

function aUtf8(texto: string): Uint8Array {
  return new TextEncoder().encode(texto)
}

function ficheroDe(bytes: Uint8Array, nombre: string): File {
  return new File([bytes as unknown as BlobPart], nombre)
}

/** Total de comensales de todo el dataset. */
function totalDe(weeks: { total: number }[]): number {
  return weeks.reduce((a, w) => a + w.total, 0)
}

function descarte(descartes: Descarte[], motivo: MotivoDescarte): number {
  return descartes.find((d) => d.motivo === motivo)?.filas ?? 0
}

function tieneAviso(avisos: Advertencia[], codigo: string): boolean {
  return avisos.some((a) => a.codigo === codigo)
}

// ─────────────────────────────────────────────────────────────
// 0. Piezas sueltas
// ─────────────────────────────────────────────────────────────

function pruebaNumeros() {
  titulo('0 · Números con separadores españoles')

  igual('"1.234,5" son mil doscientos treinta y cuatro con cinco', parsearNumero('1.234,5'), 1234.5)
  igual('"1.234" es mil doscientos treinta y cuatro', parsearNumero('1.234'), 1234)
  igual('"12,5" son doce y medio', parsearNumero('12,5'), 12.5)
  igual('"12.5" también son doce y medio', parsearNumero('12.5'), 12.5)
  igual('"1,234.56" (formato inglés) son mil doscientos treinta y cuatro', parsearNumero('1,234.56'), 1234.56)
  igual('"1.234.567" son un millón y pico', parsearNumero('1.234.567'), 1234567)
  igual('"48,50 €" son cuarenta y ocho con cincuenta', parsearNumero('48,50 €'), 48.5)
  igual('"-3,5" es negativo', parsearNumero('-3,5'), -3.5)
  igual('un número ya es un número', parsearNumero(4), 4)
  igual('"mesa 4" no es un número', parsearNumero('mesa 4'), null)
  igual('la celda vacía no es un cero', parsearNumero(''), null)

  titulo('0 bis · Horas')
  igual('"14:30" son 870 minutos', parsearHora('14:30'), 870)
  igual('"14:30:11" también', parsearHora('14:30:11'), 870)
  igual('"09:05" son 545', parsearHora('09:05'), 545)
  igual('la fracción de día de Excel', parsearHora(0.604166666), 870)
  igual('una serie de Excel completa usa su parte decimal', parsearHora(45822.604166666), 870)
  igual('"1430" de un TPV viejo', parsearHora('1430'), 870)
  igual('"930" también', parsearHora('930'), 570)
  igual('"14/06/2025 14:30" trae la hora dentro', parsearHora('14/06/2025 14:30'), 870)
  igual('un texto cualquiera no es una hora', parsearHora('mañana'), null)

  titulo('0 ter · Separador y comillas')
  const conComas = 'Fecha;Concepto;Importe\n14/06/2025;"Solomillo, salsa de vino";48,50\n'
  igual('gana el punto y coma aunque haya comas dentro', detectarSeparador(conComas), ';')
  const filas = parsearCSV(conComas, ';')
  igual('la descripción entrecomillada no parte la fila', filas[1].length, 3)
  igual('y llega entera', filas[1][1], 'Solomillo, salsa de vino')
  igual('el CSV de comas se detecta igual', detectarSeparador('a,b,c\n1,2,3\n'), ',')
  igual('y el de tabuladores', detectarSeparador('a\tb\tc\n1\t2\t3\n'), '\t')

  titulo('0 quater · Formato de fecha')
  igual(
    'con un día mayor que 12, el fichero entero es día/mes',
    detectarFormatoFecha(['06/14/2025', '14/06/2025']).formato,
    'dd/mm',
  )
  comprobar(
    'sin ninguna pista se asume día/mes Y SE AVISA',
    detectarFormatoFecha(['01/02/2025', '03/04/2025']).advertencia?.codigo === 'fecha-ambigua',
  )
}

// ─────────────────────────────────────────────────────────────
// 1. Punto y coma, latin1 y acentos
// ─────────────────────────────────────────────────────────────

/** Tres semanas de junio de 2025. Sábado 14, domingo 15, lunes 16… */
const CSV_LATIN1 = [
  'Fecha;Hora;Nº Comensales;Descripción;Importe',
  '14/06/2025;14:05:12;4;Menú del día;48,50',
  '14/06/2025;14:35:00;2;Carta;31,75',
  '14/06/2025;21:40:33;6;Cena de cumpleaños;112,00',
  '15/06/2025;13:50:10;2;Menú del día;24,00',
  '15/06/2025;15:10:44;4;Carta;66,20',
  '16/06/2025;13:20:00;2;Menú del día;24,00',
  '21/06/2025;14:15:00;8;Comunión;180,50',
  '22/06/2025;14:45:00;3;Carta;41,00',
  '23/06/2025;13:40:00;2;Menú del día;24,00',
  '',
].join('\r\n')

async function pruebaLatin1() {
  titulo('1 · CSV con punto y coma, acentos en latin1 y coma decimal')

  const bytes = aLatin1(CSV_LATIN1)
  comprobar('el fichero NO es UTF-8 válido', decodificarTexto(bytes).codificacion === 'windows-1252')

  const f = await leerFichero(ficheroDe(bytes, 'ventas junio.csv'))

  igual('se detecta el punto y coma', f.separador, ';')
  igual('se detecta latin1', f.codificacion, 'windows-1252')
  comprobar('avisa de la codificación antigua', tieneAviso(f.advertencias, 'codificacion-latin1'))
  igual('la cabecera con "Nº" llega entera', f.cabeceras[2], 'Nº Comensales')
  igual('y la de "Descripción" también', f.cabeceras[3], 'Descripción')
  igual('9 filas de datos', f.numeroDeFilas, 9)

  const destinos = f.columnas.map((c) => c.destino).join(',')
  igual('las cinco columnas se entienden bien', destinos, 'fecha,hora,comensales,ignorada,importe')
  igual('la muestra son 3 valores tal cual vienen', f.muestras[0].length, 3)
  igual('y el primero es la fecha del fichero', f.muestras[0][0], '14/06/2025')
  comprobar(
    'la columna de comensales va por encima del 85% de confianza',
    (f.columnas[2].confianza ?? 0) >= 0.85,
    `confianza ${f.columnas[2].confianza}`,
  )

  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })

  igual('no se descarta ni una fila', r.filasUsadas, 9)
  igual('los comensales suman lo que pone el fichero', totalDe(r.dataset.weeks), 33)
  igual('salen 3 semanas', r.semanas, 3)
  igual('la primera es la 24', r.dataset.weeks[0].isoWeek, 24)
  igual('que empieza el lunes 9 de junio', r.dataset.weeks[0].startDate, '2025-06-09')
  igual('el año es 2025', r.dataset.year, 2025)
  igual('NO son datos de ejemplo', r.dataset.source.isDemo, false)
  igual('los comensales NO son una estima', r.dataset.source.estimadoDesdeTickets, false)
  igual('rowsDetected son las filas del fichero', r.dataset.source.rowsDetected, 9)

  // El sábado 14 a las 14:05 y a las 14:35 son dos franjas distintas.
  const sem24 = r.dataset.weeks[0]
  igual('el sábado 14 a las 14:00 hay 4 comensales', sem24.days[5][16], 4)
  igual('y a las 14:30 hay 2', sem24.days[5][17], 2)
  igual('a las 21:30 hay 6', sem24.days[5][31], 6)
  igual('el domingo 15 suma 6', sem24.days[6].reduce((a, b) => a + b, 0), 6)

  comprobar(
    'el horario deducido abre algún día',
    r.dataset.source.detectedHours.some((d) => d.length > 0),
  )
  comprobar(
    'y avisa de que con tan pocos datos hay que repasarlo',
    tieneAviso(r.advertencias, 'horario-poco-poblado'),
  )
  // El desfase se corrige ANTES de deducir el horario: el fichero marca la
  // hora del cobro, así que sin corregirlo el sábado abriría a las 14:00 en
  // vez de a las 13:30, y al recortar la demanda por ese horario se perdería
  // justo la media hora de trabajo recuperada.
  igual(
    'el sábado abre a las 13:30, no a las 14:00 que es cuando se cobró',
    r.dataset.source.detectedHours[5][0]?.startMin,
    13 * 60 + 30,
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Fechas americanas
// ─────────────────────────────────────────────────────────────

const CSV_USA = [
  'Date,Time,Covers',
  '06/14/2025,2:05 PM,4',
  '06/14/2025,14:35,2',
  '06/15/2025,13:50,2',
  '06/21/2025,14:15,8',
  '06/22/2025,14:45,3',
].join('\n')

async function pruebaFechasAmericanas() {
  titulo('2 · CSV con fechas americanas (mm/dd)')

  const f = await leerFichero(ficheroDe(aUtf8(CSV_USA), 'sales.csv'))
  igual('separador coma', f.separador, ',')
  igual('UTF-8', f.codificacion, 'utf-8')
  igual('columnas', f.columnas.map((c) => c.destino).join(','), 'fecha,hora,comensales')

  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })

  igual('se detecta el formato mes/día', r.formatoFecha, 'mm/dd')
  igual('sin avisar de ambigüedad, porque el 14 lo aclara', tieneAviso(r.advertencias, 'fecha-ambigua'), false)
  igual('06/14/2025 cae en la semana 24', r.dataset.weeks[0].isoWeek, 24)
  igual('y es sábado, no día 6 de un mes cualquiera', r.dataset.weeks[0].days[5][16], 4)
  igual('las 5 filas entran', r.filasUsadas, 5)

  // La misma fecha leída como día/mes sería el 6 de febrero: otro mes, otra
  // semana y otro día de la semana. Es justo el error que hay que evitar.
  const alReves = construirDatasetConDiagnostico(f.filas, f.columnas, {
    fileName: f.nombre,
    formatoFecha: 'dd/mm',
  })
  igual('leída como día/mes no se salvaría ni una fila', alReves.filasUsadas, 0)
  igual('las 5 saldrían como fecha ilegible', descarte(alReves.descartes, 'fecha-ilegible'), 5)
}

// ─────────────────────────────────────────────────────────────
// 3. Sin columna de comensales
// ─────────────────────────────────────────────────────────────

const CSV_TICKETS = [
  'FECHA;HORA;TICKETS;IMPORTE',
  '14/06/2025;14:00;10;240,00',
  '14/06/2025;14:30;6;144,00',
  '14/06/2025;21:30;8;220,00',
  '15/06/2025;14:00;4;96,00',
].join('\n')

async function pruebaSinComensales() {
  titulo('3 · CSV sin columna de comensales (lo normal en un TPV español)')

  const f = await leerFichero(ficheroDe(aUtf8(CSV_TICKETS), 'tickets.csv'))
  igual('columnas', f.columnas.map((c) => c.destino).join(','), 'fecha,hora,tickets,importe')

  const r = construirDatasetConDiagnostico(f.filas, f.columnas, {
    fileName: f.nombre,
    comensalesPorTicket: 2.5,
  })

  comprobar('el dataset queda MARCADO como estima', r.dataset.source.estimadoDesdeTickets)
  igual('y guarda con qué multiplicador', r.dataset.source.comensalesPorTicket, 2.5)
  comprobar('y lo dice en una advertencia', tieneAviso(r.advertencias, 'comensales-estimados'))
  igual('28 tickets × 2,5 son 70 comensales', totalDe(r.dataset.weeks), 70)
  igual('el sábado a las 14:00 salen 25', r.dataset.weeks[0].days[5][16], 25)

  // Con el multiplicador por defecto, el mismo fichero da otra cifra: la
  // estimación depende del número que ponga el usuario, y eso es el motivo de
  // que tenga que ir marcada.
  const porDefecto = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })
  igual('con el 2 por defecto salen 56', totalDe(porDefecto.dataset.weeks), 56)

  // Y si el fichero no trae ni comensales ni tickets, cada fila es un cobro, es
  // decir, un ticket (ronda 8, G1). Hasta entonces se descartaban todas con "los
  // comensales no eran un número" y el usuario se quedaba sin salida.
  const sinNada = construirDatasetConDiagnostico(
    f.filas,
    f.columnas.map((c) => (c.destino === 'tickets' ? { ...c, destino: 'ignorada' as const } : c)),
    { fileName: f.nombre },
  )
  igual('sin comensales ni tickets entran las 4 filas', sinNada.filasUsadas, 4)
  igual('una fila, un ticket: 4 × 2 son 8 comensales', totalDe(sinNada.dataset.weeks), 8)
  igual('y ninguna se tira con un motivo falso', descarte(sinNada.descartes, 'comensales-ilegibles'), 0)
}

// ─────────────────────────────────────────────────────────────
// 4. Filas rotas mezcladas
// ─────────────────────────────────────────────────────────────

const CSV_ROTO = [
  'Fecha;Hora;Comensales;Ticket',
  '14/06/2025;14:00;4;A-1',
  'no es una fecha;14:00;2;A-2',
  '14/06/2025;a la hora de comer;2;A-3',
  '14/06/2025;14:30;dos personas;A-4',
  '14/06/2025;05:15;2;A-5',
  '31/02/2025;14:00;2;A-6',
  '15/06/2025;14:00;3;A-7',
  ';;;',
  '14/06/2023;14:00;99;A-8',
  '15/06/2025;21:00;5;A-9',
].join('\n')

async function pruebaFilasRotas() {
  titulo('4 · Filas rotas mezcladas con filas buenas')

  const f = await leerFichero(ficheroDe(aUtf8(CSV_ROTO), 'export sucio.csv'))
  igual('las columnas se entienden a pesar del ruido', f.columnas[0].destino, 'fecha')

  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })

  igual('el fichero traía 9 filas de datos', r.filasLeidas, 9)
  // El 05:15 ENTRA desde el 2026-09-07: la rejilla cubre las 24 horas. Antes se
  // descartaba, y con ello se perdían las dos mejores horas de un local de copas.
  igual('entran las 4 buenas, incluida la de las 05:15', r.filasUsadas, 4)
  igual('y suman 14 comensales', totalDe(r.dataset.weeks), 14)

  igual('2 fechas ilegibles (el texto y el 31 de febrero)', descarte(r.descartes, 'fecha-ilegible'), 2)
  igual('1 hora ilegible', descarte(r.descartes, 'hora-ilegible'), 1)
  igual('1 comensal no numérico', descarte(r.descartes, 'comensales-ilegibles'), 1)
  igual('ya no se cae nada por la rejilla', descarte(r.descartes, 'hora-fuera-de-rejilla'), 0)
  igual('1 fila de otro año', descarte(r.descartes, 'fuera-del-ano'), 1)

  const contadas = r.descartes.reduce((a, d) => a + d.filas, 0)
  igual('nada se cae en silencio: usadas + descartadas = leídas', r.filasUsadas + contadas, r.filasLeidas)
  comprobar(
    'cada descarte señala filas concretas',
    r.descartes.every((d) => d.ejemplos.length > 0 && d.mensaje.length > 0),
  )
  comprobar('avisa de que el fichero abarca dos años', tieneAviso(r.advertencias, 'varios-anos'))
  igual('se queda con 2025, que es el que más filas tiene', r.dataset.year, 2025)
}

// ─────────────────────────────────────────────────────────────
// 5. Una sola semana
// ─────────────────────────────────────────────────────────────

const CSV_UNA_SEMANA = [
  'Fecha;Hora;Comensales',
  '09/06/2025;13:30;12',
  '10/06/2025;13:30;10',
  '11/06/2025;13:30;11',
  '12/06/2025;13:30;14',
  '13/06/2025;13:30;22',
  '13/06/2025;21:30;30',
  '14/06/2025;13:30;28',
  '14/06/2025;21:30;40',
  '15/06/2025;13:30;26',
].join('\n')

async function pruebaUnaSemana() {
  titulo('5 · Una sola semana de histórico')

  const f = await leerFichero(ficheroDe(aUtf8(CSV_UNA_SEMANA), 'una-semana.csv'))
  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })

  igual('sale 1 semana, no 52 rellenas de nada', r.semanas, 1)
  igual('y es la 24', r.dataset.weeks[0].isoWeek, 24)
  comprobar('avisa de que el histórico es corto', tieneAviso(r.advertencias, 'historico-corto'))
  igual(
    'el rango de fechas es del primer al último día con datos, no un año entero',
    r.dataset.source.dateRange,
    '2025-06-09 → 2025-06-15',
  )
  igual('las 9 filas entran', r.filasUsadas, 9)
  igual('y suman 193 comensales', totalDe(r.dataset.weeks), 193)
}

// ─────────────────────────────────────────────────────────────
// 6. La madrugada es del día anterior
// ─────────────────────────────────────────────────────────────

const CSV_MADRUGADA = [
  'Fecha;Hora;Comensales',
  '14/06/2025;22:00;10',
  '15/06/2025;00:30;6',
  '15/06/2025;01:30;4',
  '15/06/2025;14:00;8',
].join('\n')

async function pruebaMadrugada() {
  titulo('6 · La copa de la 01:30 del domingo es del sábado noche')

  const f = await leerFichero(ficheroDe(aUtf8(CSV_MADRUGADA), 'noche.csv'))
  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })
  const sem = r.dataset.weeks[0]

  const sabado = sem.days[5].reduce((a, b) => a + b, 0)
  const domingo = sem.days[6].reduce((a, b) => a + b, 0)

  igual('el sábado se queda con los 20 de la noche', sabado, 20)
  igual('y el domingo solo con sus 8 de la comida', domingo, 8)
  igual('la 01:30 cae en la franja 39, no en la de la madrugada del domingo', sem.days[5][39], 4)
  igual('las 4 filas entran', r.filasUsadas, 4)
}

// ─────────────────────────────────────────────────────────────
// 7. Excel
// ─────────────────────────────────────────────────────────────

async function pruebaExcel() {
  titulo('7 · Excel (.xlsx) con fechas serie y horas en fracción de día')

  const modulo = await import('xlsx')
  const XLSX = (modulo as unknown as { default?: typeof modulo }).default ?? modulo

  // 45822 es el 14/06/2025 en serie de Excel; 0,5833… son las 14:00.
  const hoja = XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Hora', 'Comensales'],
    [45822, 14 / 24, 4],
    [45822, 14.5 / 24, 2],
    [45823, 14 / 24, 6],
  ])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Ventas')
  const buffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  const f = await leerFichero(ficheroDe(new Uint8Array(buffer), 'ventas.xlsx'))

  igual('se reconoce como Excel por los bytes, no por el nombre', f.formato, 'excel')
  igual('columnas', f.columnas.map((c) => c.destino).join(','), 'fecha,hora,comensales')
  igual('la muestra de la fecha se enseña legible, no como 45822', f.muestras[0][0], '14/06/2025')
  igual('y la de la hora también', f.muestras[1][0], '14:00')

  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })
  igual('la serie 45822 es el sábado 14 de junio de 2025', r.dataset.weeks[0].days[5][16], 4)
  igual('la fracción 14,5/24 es la franja de las 14:30', r.dataset.weeks[0].days[5][17], 2)
  igual('45823 es el domingo', r.dataset.weeks[0].days[6][16], 6)
  igual('las 3 filas entran', r.filasUsadas, 3)
}

// ─────────────────────────────────────────────────────────────
// 8. Fechas que no se pueden desambiguar
// ─────────────────────────────────────────────────────────────

const CSV_AMBIGUO = [
  'Fecha;Hora;Comensales',
  '02/06/2025;13:30;10',
  '03/06/2025;13:30;12',
  '04/06/2025;13:30;11',
  '05/06/2025;13:30;9',
].join('\n')

async function pruebaAmbigua() {
  titulo('8 · Fechas donde ningún número pasa de 12')

  const f = await leerFichero(ficheroDe(aUtf8(CSV_AMBIGUO), 'ambiguo.csv'))
  comprobar('la lectura avisa de que no se puede saber', tieneAviso(f.advertencias, 'fecha-ambigua'))

  // Y el aviso NO se pierde al reconstruir con el mapeo ya corregido, que es
  // lo que hace la pantalla cada vez que el usuario toca un desplegable.
  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })
  comprobar('y la construcción también', tieneAviso(r.advertencias, 'fecha-ambigua'))
  igual('se asume día/mes, que es lo español', r.formatoFecha, 'dd/mm')
  igual('con lo que 02/06 es el 2 de junio, semana 23', r.dataset.weeks[0].isoWeek, 23)

  // Si el usuario dice el formato, ya no hay nada de lo que avisar.
  const dicho = construirDatasetConDiagnostico(f.filas, f.columnas, {
    fileName: f.nombre,
    formatoFecha: 'mm/dd',
  })
  igual('si el usuario lo dice, no se avisa', tieneAviso(dicho.advertencias, 'fecha-ambigua'), false)
  igual('y 02/06 pasa a ser el 6 de febrero, semana 6', dicho.dataset.weeks[0].isoWeek, 6)

  const entero = await leerYConstruir(ficheroDe(aUtf8(CSV_AMBIGUO), 'ambiguo.csv'))
  igual('el camino entero no repite el aviso', entero.advertencias.filter((a) => a.codigo === 'fecha-ambigua').length, 1)
  igual('y devuelve el mismo dataset', totalDe(entero.dataset.weeks), 42)
}

// ─────────────────────────────────────────────────────────────
// 10. La columna de tickets es un CODIGO, no una cantidad
// ─────────────────────────────────────────────────────────────
//
// Es el caso normal del TPV espanol: una fila por ticket y una columna con su
// numero de documento. Hasta el 2026-09-07 se multiplicaba ese codigo por los
// comensales por ticket, parsearNumero devolvia null y se descartaban TODAS las
// filas: al usuario le salia que su fichero no valia.

const CSV_TICKET_CODIGO = [
  'F_SERV;HORA;N_TICKET;IMPORTE',
  '14/06/2025;13:30;T-0001;42,50',
  '14/06/2025;14:00;T-0002;18,00',
  '14/06/2025;21:15;T-0003;66,20',
  '15/06/2025;13:45;T-0004;31,10',
].join('\n')

const CSV_TICKET_CANTIDAD = [
  'F_SERV;HORA;TICKETS;IMPORTE',
  '14/06/2025;13:30;3;42,50',
  '14/06/2025;14:00;2;18,00',
  '14/06/2025;21:15;5;66,20',
].join('\n')

async function pruebaTicketsPorCodigo() {
  titulo('10 · La columna de tickets es un codigo y no una cantidad')

  const r = await leerYConstruir(ficheroDe(aUtf8(CSV_TICKET_CODIGO), 'tickets-codigo.csv'))
  igual('no se cae ni una fila', r.filasUsadas, 4)
  // Cuatro filas, un ticket cada una, dos comensales por ticket.
  igual('cuenta una fila = un ticket', totalDe(r.dataset.weeks), 8)
  comprobar('y lo dice', tieneAviso(r.advertencias, 'tickets-son-codigo'))
  comprobar('sin dejar de avisar de que son una estima', tieneAviso(r.advertencias, 'comensales-estimados'))

  // Y lo que ya funcionaba tiene que seguir igual: una columna con cantidades
  // de verdad se sigue sumando, no se cuenta por filas.
  const n = await leerYConstruir(ficheroDe(aUtf8(CSV_TICKET_CANTIDAD), 'tickets-numero.csv'))
  igual('una columna con cantidades sigue sumandose', totalDe(n.dataset.weeks), 20)
  comprobar('y ahi no salta el aviso nuevo', !tieneAviso(n.advertencias, 'tickets-son-codigo'))
}


// ─────────────────────────────────────────────────────────────
// 11. Ficheros que vienen AGRUPADOS
// ─────────────────────────────────────────────────────────────
// El error mas caro posible: un export por horas metia las 80 comidas de la
// una en la franja de las 13:00 y dejaba la de las 13:30 a cero. El pico
// simultaneo, que es lo que marca cuanta gente hace falta, salia al doble.

/** Un ano entero de un fichero agrupado cada `paso` minutos, 20 comensales por bloque. */
function csvAgrupado(paso: number, comensalesPorBloque = 20): string {
  const filas = ['FECHA;HORA;COMENSALES']
  const inicio = Date.UTC(2025, 0, 6) // lunes
  for (let d = 0; d < 350; d++) {
    const t = new Date(inicio + d * 86400000)
    const f = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`
    // De 13:00 a 16:00 y de 20:00 a 23:00, en bloques de `paso` minutos.
    for (const desde of [13 * 60, 20 * 60]) {
      for (let m = desde; m < desde + 180; m += paso) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        filas.push(`${f};${hh}:${mm};${comensalesPorBloque}`)
      }
    }
  }
  return filas.join('\n')
}

/** El máximo de comensales de una sola franja en todo el dataset. */
function picoDe(weeks: { days: number[][] }[]): number {
  let max = 0
  for (const w of weeks) for (const d of w.days) for (const v of d) if (v > max) max = v
  return max
}

function pruebaPasoHorario() {
  titulo('11 · Detectar cada cuanto trae horas el fichero')

  igual('tickets a la hora y al minuto → 1 minuto', detectarPasoHorario([780, 781, 795, 802]).paso, 1)
  igual('cuartos de hora → 15', detectarPasoHorario([780, 795, 810, 1260, 1275]).paso, 15)
  igual('medias horas → 30', detectarPasoHorario([780, 810, 840, 1260]).paso, 30)
  igual('horas en punto → 60', detectarPasoHorario([780, 840, 900, 1260, 1320]).paso, 60)
  igual('bloques de dos horas → 120', detectarPasoHorario([780, 900, 1020, 1260]).paso, 120)
  igual('una sola hora en todo el fichero → 1.440', detectarPasoHorario([0, 0, 0, 0]).paso, 1440)
  igual('un total por servicio → 480', detectarPasoHorario([780, 1260]).paso, 480)

  // Una fila sucia no convierte un fichero por horas en uno de tickets: por eso
  // se tiran las horas que no llegan al 0,5% de las filas.
  const porHoras = [...Array(300)].map((_, i) => 780 + (i % 5) * 60)
  igual('una fila a las 13:37 entre 300 no cambia el paso', detectarPasoHorario([...porHoras, 817]).paso, 60)

  // La proteccion de verdad: un fichero de tickets con mucho volumen cuyas
  // puntas caen en las horas en punto. Al tirar las horas flojas quedarian solo
  // esas puntas y saldria un paso de 60 que el fichero no tiene; repartir ahi
  // partiria los picos y sacaria MENOS gente de la que hace falta.
  const conPuntas: number[] = []
  for (let i = 0; i < 40; i++) for (const h of [780, 840, 1260, 1320]) conPuntas.push(h) // puntas
  for (let m = 781; m < 900; m++) conPuntas.push(m) // y la cola de tickets sueltos
  igual('tickets con puntas en hora en punto NO se toman por agrupados', detectarPasoHorario(conPuntas).paso, 1)

  igual('media hora no se reparte', franjasPorFila(30), 1)
  igual('una hora se reparte en dos', franjasPorFila(60), 2)
  igual('dos horas, en cuatro', franjasPorFila(120), 4)
  igual('un total diario no se reparte: se rechaza', franjasPorFila(1440), 1)

  // El redondeo no puede inventar comensales.
  const dia = [2.5, 2.5, 1.5, 1.5, 0]
  igual('repartir y redondear conserva el total', redondearConservandoTotal(dia).reduce((a, b) => a + b, 0), 8)
  comprobar('y no deja decimales', redondearConservandoTotal(dia).every((v) => Number.isInteger(v)))
  const enteros = [4, 0, 7]
  comprobar(
    'un dia que ya venia en enteros sale identico',
    redondearConservandoTotal(enteros).join(',') === '4,0,7',
  )
}

async function pruebaFicheroPorHoras() {
  titulo('12 · Un fichero agrupado por horas no dispara el pico')

  const r = await leerYConstruir(ficheroDe(aUtf8(csvAgrupado(60)), 'por-horas.csv'))
  igual('el paso detectado es una hora', r.paso, 60)
  comprobar('se dice que viene agrupado', tieneAviso(r.advertencias, 'fichero-agrupado'))
  comprobar('y no se rechaza', !r.sinDetalleHorario)
  // 6 bloques de 20 al dia, 350 dias: el total es intocable.
  igual('el total de comensales es exactamente el del fichero', totalDe(r.dataset.weeks), 350 * 6 * 20)
  igual('el pico de una franja es la mitad del bloque', picoDe(r.dataset.weeks), 10)

  // Y el control: el mismo fichero en medias horas no se reparte ni avisa.
  const m = await leerYConstruir(ficheroDe(aUtf8(csvAgrupado(30, 10)), 'por-medias.csv'))
  igual('en medias horas el paso es 30', m.paso, 30)
  comprobar('no hace falta avisar de nada', !tieneAviso(m.advertencias, 'fichero-agrupado'))
  igual('y cada franja se queda con lo suyo', picoDe(m.dataset.weeks), 10)
}

async function pruebaFicheroPorDia() {
  titulo('13 · Un fichero con un total por dia se rechaza')

  const filas = ['FECHA;COMENSALES']
  const inicio = Date.UTC(2025, 0, 6)
  for (let d = 0; d < 300; d++) {
    const t = new Date(inicio + d * 86400000)
    const f = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()} 00:00`
    filas.push(`${f};120`)
  }
  const r = await leerYConstruir(ficheroDe(aUtf8(filas.join('\n')), 'por-dia.csv'))

  comprobar('se marca como sin detalle horario', r.sinDetalleHorario)
  comprobar('y se explica por que', tieneAviso(r.advertencias, 'sin-detalle-horario'))
  comprobar('no se reparte a ojo por las 48 franjas', !tieneAviso(r.advertencias, 'fichero-agrupado'))

  // Con cuatro filas no se rechaza ni se reparte nada: dos horas separadas no
  // prueban que el fichero venga agrupado.
  const pocas = ['FECHA;HORA;COMENSALES', '14/06/2025;13:00;30', '14/06/2025;21:00;40'].join('\n')
  const p2 = await leerYConstruir(ficheroDe(aUtf8(pocas), 'dos-filas.csv'))
  comprobar('con dos filas se avisa pero no se rechaza', !p2.sinDetalleHorario)
}

async function pruebaFormatoALaFuerza() {
  titulo('14 · El usuario dice como se leen sus fechas')

  // Fechas donde ningun numero pasa de 12: dd/mm y mm/dd son las dos posibles.
  const csv = [
    'FECHA;HORA;COMENSALES',
    '03/02/2025;13:30;10',
    '03/02/2025;14:00;12',
    '04/02/2025;13:30;8',
  ].join('\n')
  const f = await leerFichero(ficheroDe(aUtf8(csv), 'ambigua.csv'))

  const auto = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: 'a.csv' })
  igual('sin decir nada se lee dia/mes', auto.formatoFecha, 'dd/mm')
  comprobar('y se avisa de que no se sabe', tieneAviso(auto.advertencias, 'fecha-ambigua'))
  igual('3 de febrero cae en la semana 6', auto.dataset.weeks[0].isoWeek, 6)

  const forzado = construirDatasetConDiagnostico(f.filas, f.columnas, {
    fileName: 'a.csv',
    formatoFecha: 'mm/dd',
  })
  igual('diciendolo se lee mes/dia', forzado.formatoFecha, 'mm/dd')
  comprobar('y ya no se avisa de nada', !tieneAviso(forzado.advertencias, 'fecha-ambigua'))
  igual('2 de marzo cae en la semana 9', forzado.dataset.weeks[0].isoWeek, 9)
  igual('y no se pierde ni un comensal', totalDe(forzado.dataset.weeks), 30)
}

// ─────────────────────────────────────────────────────────────

/** Un CSV con comidas y cenas cada día entre dos fechas (incluidas), menos los días de `sinDias` (0 = lunes). */
function csvEntre(desde: string, hasta: string, sinDias: number[] = []): string {
  const filas = ['FECHA;HORA;COMENSALES']
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  for (let t = a; t <= b; t += 86400000) {
    const f = new Date(t)
    if (sinDias.includes((f.getUTCDay() + 6) % 7)) continue
    const fecha = `${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}/${f.getUTCFullYear()}`
    for (const [h, n] of [['13:00', 8], ['13:30', 14], ['14:00', 12], ['20:30', 10], ['21:00', 16], ['21:30', 9]] as const) filas.push(`${fecha};${h};${n}`)
  }
  return filas.join('\n')
}

async function pruebaPeriodoDelFichero() {
  titulo('15 · Temporadas, pop ups, medias semanas y festivos que no están en el fichero')
  const hoy = new Date('2026-11-04T12:00:00Z')
  const leer = (csv: string, nombre: string) => leerYConstruir(ficheroDe(aUtf8(csv), nombre), { hoy })
  const pago = (r: Awaited<ReturnType<typeof leer>>) => temporadaDelLocal(detectSpecialWeeks(r.dataset.weeks, r.dataset.year)).semanasDePago

  // G1. Un local de playa que manda solo sus 22 semanas, ya cerradas.
  const playa = await leer(csvEntre('2025-06-02', '2025-11-02'), 'playa.csv')
  comprobar('se propone que el local abre solo esas semanas', !!playa.dataset.source.periodo?.propuesto && !!playa.dataset.source.periodo?.soloEstePeriodo)
  comprobar('y se avisa de ello', tieneAviso(playa.advertencias, 'periodo-del-fichero'))
  igual('se pagan las 22 semanas que abre, no 52', pago(playa), 22)
  igual('las semanas con datos son 22', playa.semanas, 22)
  const sinSemanaSanta = describeMapping(
    playa.dataset.year,
    playa.dataset.year + 1,
    new Set(playa.dataset.weeks.filter((w) => !w.relleno && w.total > 0).map((w) => w.isoWeek)),
  )
  comprobar('no se habla de festivos que el fichero no trae', !sinSemanaSanta.some((l) => l.includes('Semana Santa')), sinSemanaSanta.join(' | '))

  // G1 y G3. Un pop up de seis semanas: la semana tipo sale de esas seis, no de los ceros.
  const popup = await leer(csvEntre('2025-11-17', '2025-12-28'), 'popup.csv')
  igual('el pop up paga sus 6 semanas', pago(popup), 6)
  const sp = detectSpecialWeeks(popup.dataset.weeks, popup.dataset.year)
  const utiles = usableWeeks(popup.dataset, sp)
  comprobar('la semana tipo no sale de semanas cerradas', utiles.length === 6 && utiles.every((w) => w.total > 0), `${utiles.length} semanas, ${utiles.filter((w) => w.total === 0).length} vacías`)
  const tipo = typicalWeek(utiles, 80)
  comprobar('y no sale vacía', tipo.flat().reduce((x, y) => x + y, 0) > 0)

  // Un fichero que sí es de los últimos meses no se toma por temporada.
  const reciente = await leer(csvEntre('2026-06-01', '2026-11-01'), 'reciente.csv')
  comprobar('un export reciente no se toma por temporada', !reciente.dataset.source.periodo?.propuesto)
  comprobar('el año entero tampoco', !(await leer(csvEntre('2025-01-01', '2025-12-31'), 'ano.csv')).dataset.source.periodo?.propuesto)

  // M3 de pantallas. Media semana en el borde: del lunes 3 al viernes 21 de marzo.
  const marzo = await leer(csvEntre('2025-03-03', '2025-03-21'), 'marzo.csv')
  comprobar('la media semana del final se quita y se avisa', tieneAviso(marzo.advertencias, 'semana-incompleta'))
  igual('quedan las dos semanas enteras', marzo.semanas, 2)
  comprobar('el rango dice las fechas del fichero', (marzo.dataset.source.dateRange ?? '').includes('2025-03-03'), marzo.dataset.source.dateRange)
  // Y un local que cierra los lunes no pierde ninguna semana por eso.
  const lunes = await leer(csvEntre('2025-03-04', '2025-03-30', [0]), 'sin-lunes.csv')
  comprobar('cerrar los lunes no es media semana', !tieneAviso(lunes.advertencias, 'semana-incompleta'))
}

// ─────────────────────────────────────────────────────────────
// 16. Ronda 7: los últimos 12 meses, los huecos de datos y las fechas
// ─────────────────────────────────────────────────────────────

/** Como `csvEntre`, pero con muchas filas por día, como un local con movimiento. */
function csvConMovimiento(desde: string, hasta: string, porDia: number): string {
  const filas = ['FECHA;HORA;COMENSALES']
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  for (let t = a; t <= b; t += 86400000) {
    const f = new Date(t)
    const fecha = `${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}/${f.getUTCFullYear()}`
    for (let i = 0; i < porDia; i++) {
      const min = 13 * 60 + (i * 7) % 180 + (i % 2 === 0 ? 0 : 7 * 60)
      filas.push(`${fecha};${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')};2`)
    }
  }
  return filas.join('\n')
}

/** Varios trozos de `csvEntre` en un solo fichero, con una sola cabecera. */
function csvATrozos(trozos: [string, string][]): string {
  return ['FECHA;HORA;COMENSALES', ...trozos.flatMap(([d, h]) => csvEntre(d, h).split('\n').slice(1))].join('\n')
}

async function pruebaRonda7() {
  titulo('16 · Ronda 7: últimos 12 meses, huecos de TPV y fechas que empiezan el día 1')
  const hoy = new Date('2026-11-04T12:00:00Z')
  const leer = (csv: string, nombre: string, extra: { periodo?: string } = {}) =>
    leerYConstruir(ficheroDe(aUtf8(csv), nombre), { hoy, ...extra })
  const pago = (weeks: Awaited<ReturnType<typeof leer>>['dataset']['weeks'], year: number) =>
    temporadaDelLocal(detectSpecialWeeks(weeks, year)).semanasDePago

  // G1 de pantallas. "Los últimos 12 meses": del martes 4 de noviembre de 2025
  // al domingo 1 de noviembre de 2026. Antes se quedaba con 2026 y tiraba
  // noviembre y diciembre de 2025, la Navidad incluida.
  const doce = await leer(csvEntre('2025-11-04', '2026-11-01'), '12-meses.csv')
  igual('no se tira ni una fila por ser de otro año', descarte(doce.descartes, 'fuera-del-ano'), 0)
  comprobar('salen las 52 semanas (51 si se quita la media del principio)', doce.semanas >= 51, `${doce.semanas}`)
  const navidad = doce.dataset.weeks.find((w) => w.isoWeek === 52)
  comprobar('la Navidad de 2025 está, en su semana 52', !!navidad && navidad.year === 2025 && navidad.total > 0)
  comprobar('noviembre de 2025 también', doce.dataset.weeks.some((w) => w.year === 2025 && w.isoWeek === 46 && w.total > 0))
  igual('el año de referencia es 2026, el que más semanas pone', doce.dataset.year, 2026)
  igual('se usa el fichero entero', doce.periodoUsado, 'todo')
  comprobar('y se puede elegir otro periodo', doce.periodos.length > 1, doce.periodos.map((o) => o.clave).join(', '))
  igual('no se toma por temporada', !!doce.dataset.source.periodo?.soloEstePeriodo, false)
  igual('ni sobra ninguna semana del año', doce.dataset.source.periodo?.semanasFuera, 0)
  comprobar('el rango empieza en 2025', (doce.dataset.source.dateRange ?? '').startsWith('2025-11'), doce.dataset.source.dateRange)
  igual('se pagan las 52 semanas', pago(doce.dataset.weeks, doce.dataset.year), 52)

  // Y si el usuario elige solo 2026, se dice qué se queda fuera, con fechas.
  const solo2026 = await leer(csvEntre('2025-11-04', '2026-11-01'), '12-meses.csv', { periodo: 'ano-2026' })
  comprobar('eligiendo 2026, noviembre y diciembre de 2025 se quedan fuera', descarte(solo2026.descartes, 'fuera-del-ano') > 0)
  const aviso = solo2026.advertencias.find((a) => a.codigo === 'varios-anos')?.mensaje ?? ''
  comprobar('y el aviso dice los meses, no solo las filas', aviso.includes('noviembre') && aviso.includes('diciembre'), aviso)

  // Dos años enteros: por defecto, las últimas 52 semanas.
  const dos = await leer(csvEntre('2024-01-01', '2025-12-28'), 'dos-anos.csv')
  igual('con dos años se usan las últimas 52 semanas', dos.periodoUsado, 'ultimas-52')
  comprobar('se ofrecen los dos años sueltos', dos.periodos.some((o) => o.clave === 'ano-2024') && dos.periodos.some((o) => o.clave === 'ano-2025'))
  comprobar('y se avisa de lo que queda fuera', tieneAviso(dos.advertencias, 'varios-anos'))

  // Un año natural justo no tiene nada que elegir ni que avisar.
  const natural = await leer(csvEntre('2025-01-01', '2025-12-31'), 'ano.csv')
  igual('un año natural no ofrece periodos', natural.periodos.length, 1)
  igual('ni avisa de varios años', tieneAviso(natural.advertencias, 'varios-anos'), false)

  // M3 de cálculo. 13 semanas sin datos en primavera (cambio de TPV), con
  // semanas normales a los dos lados: son datos que faltan, no un cierre.
  const tpv = await leer(csvATrozos([['2025-01-06', '2025-03-30'], ['2025-06-30', '2025-12-28']]), 'cambio-tpv.csv')
  const huecosTpv = (tpv.dataset.source as { huecos?: { cerrado: boolean; semanas: unknown[] }[] }).huecos ?? []
  igual('se ve un hueco largo', huecosTpv.length, 1)
  igual('de 13 semanas', huecosTpv[0]?.semanas.length, 13)
  igual('y se propone como datos que faltan', huecosTpv[0]?.cerrado, false)
  comprobar('se pregunta', tieneAviso(tpv.advertencias, 'hueco-en-el-fichero'))
  igual('el local no pasa a ser de temporada: 52 semanas de pago', pago(tpv.dataset.weeks, tpv.dataset.year), 52)
  const cerrado = aplicarHueco(tpv.dataset, 0, true)
  igual('si dice que estuvo cerrado, se pagan 39', pago(cerrado.weeks, cerrado.year), 39)
  const deVuelta = aplicarHueco(cerrado, 0, false)
  igual('y si se arrepiente, vuelven las 52', pago(deVuelta.weeks, deVuelta.year), 52)

  // Un cierre de verano de 9 semanas sí se propone como cierre.
  const verano = await leer(csvATrozos([['2025-01-06', '2025-06-29'], ['2025-09-01', '2025-12-28']]), 'verano.csv')
  const huecosVerano = (verano.dataset.source as { huecos?: { cerrado: boolean }[] }).huecos ?? []
  igual('el hueco de verano se propone como cierre', huecosVerano[0]?.cerrado, true)

  // Y unas vacaciones de tres semanas siguen siendo un cierre, sin preguntar.
  const vacaciones = await leer(csvATrozos([['2025-01-06', '2025-04-06'], ['2025-04-28', '2025-12-28']]), 'vacaciones.csv')
  igual('tres semanas cerradas no se preguntan', ((vacaciones.dataset.source as { huecos?: unknown[] }).huecos ?? []).length, 0)
  igual('y siguen siendo cierre', vacaciones.dataset.weeks.filter((w) => w.relleno === 'hueco').length, 3)

  // M1 de pantallas. Un local con movimiento que empieza el día 1: en las 400
  // primeras filas no hay ningún día mayor que 12, pero en el fichero sí.
  const movido = await leerYConstruir(
    ficheroDe(aUtf8(csvConMovimiento('2025-11-01', '2026-10-31', 60)), 'movimiento.csv'),
    { hoy },
  )
  igual('no avisa de que no sabe leer las fechas', tieneAviso(movido.advertencias, 'fecha-ambigua'), false)
  igual('y las lee como día/mes', movido.formatoFecha, 'dd/mm')
  const soloLeido = await leerFichero(ficheroDe(aUtf8(csvConMovimiento('2025-11-01', '2025-12-31', 60)), 'movimiento.csv'))
  igual('tampoco en la lectura', tieneAviso(soloLeido.advertencias, 'fecha-ambigua'), false)
}

// ─────────────────────────────────────────────────────────────
// 17. Ronda 8: los ficheros que más clientes van a subir
// ─────────────────────────────────────────────────────────────
//
// G1: un fichero con solo fecha, hora e importe no entraba ("los comensales no
// eran un número") y no había pantalla de columnas para arreglarlo.
// G2: un detalle de ventas con una línea por producto contaba cada línea como
// un ticket (609 comensales a la semana salían 1.828), y el consejo de marcar
// la columna como "No la uses" bloqueaba el "Siguiente".
// m2: las devoluciones se tiraban con un motivo falso y la venta seguía contando.
// m5: las ventas iban con IVA y el ratio de coste salía más bajo de lo real.

/** Generador con semilla: el mismo fichero en cada vuelta. */
function azar(semilla: number) {
  let s = semilla
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

interface TicketDePrueba {
  fecha: string
  hora: string
  importe: number
}

/** Tickets de comida y cena al azar, de lunes a domingo, durante `semanas`. */
function ticketsAlAzar(semanas: number, porServicio: number, semilla = 3): TicketDePrueba[] {
  const rnd = azar(semilla)
  const fuera: TicketDePrueba[] = []
  const inicio = Date.UTC(2025, 0, 6)
  for (let d = 0; d < semanas * 7; d++) {
    const t = new Date(inicio + d * 86_400_000)
    const fecha = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`
    for (const [desde, hasta] of [[13 * 60 + 30, 16 * 60], [21 * 60, 23 * 60 + 30]]) {
      for (let k = 0; k < porServicio; k++) {
        const m = Math.floor(desde + rnd() * (hasta - desde))
        const hora = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        fuera.push({ fecha, hora, importe: Math.round((20 + rnd() * 80) * 100) / 100 })
      }
    }
  }
  return fuera
}

const eur = (v: number) => v.toFixed(2).replace('.', ',')

async function pruebaRonda8() {
  titulo('17 · Ronda 8: fichero con solo fecha, hora e importe (G1)')

  const tickets = ticketsAlAzar(8, 12)
  const csvImporte = ['Fecha;Hora;Importe', ...tickets.map((t) => `${t.fecha};${t.hora};${eur(t.importe)}`)].join('\n')
  const g1 = await leerYConstruir(ficheroDe(aUtf8(csvImporte), 'solo-importe.csv'))
  igual('las columnas: fecha, hora e importe', g1.fichero.columnas.map((c) => c.destino).join(','), 'fecha,hora,importe')
  comprobar('ese mapeo deja seguir', mapeoSuficiente(g1.fichero.columnas))
  igual('entran todas las filas', g1.filasUsadas, tickets.length)
  igual('una fila, un ticket, a 2 comensales', totalDe(g1.dataset.weeks), tickets.length * 2)
  comprobar('lo marca como estima y lo dice', g1.dataset.source.estimadoDesdeTickets && tieneAviso(g1.advertencias, 'comensales-estimados'))
  comprobar('y sabe que cada fila es un ticket', g1.dataset.source.cadaFilaEsUnTicket === true)
  comprobar('no se tira ninguna fila', g1.descartes.length === 0, JSON.stringify(g1.descartes))
  comprobar('no confunde cobros sueltos con líneas de producto', !tieneAviso(g1.advertencias, 'lineas-por-ticket'))
  const g1a3 = construirDatasetConDiagnostico(g1.fichero.filas, g1.fichero.columnas, { fileName: 'x', comensalesPorTicket: 3 })
  igual('los comensales por ticket se pueden cambiar', totalDe(g1a3.dataset.weeks), tickets.length * 3)

  // Agrupado por horas y con solo el importe: no son tickets, y se dice.
  const porHoras = ['Fecha;Hora;Importe']
  for (let d = 0; d < 60; d++) {
    const t = new Date(Date.UTC(2025, 0, 6) + d * 86_400_000)
    const fecha = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`
    for (const h of [13, 14, 15, 20, 21, 22]) porHoras.push(`${fecha};${h}:00;${eur(400 + d)}`)
  }
  const agrupado = await leerYConstruir(ficheroDe(aUtf8(porHoras.join('\n')), 'por-horas.csv'))
  igual('un fichero por horas con solo importe no inventa tickets', agrupado.filasUsadas, 0)
  igual('y dice por qué', descarte(agrupado.descartes, 'sin-cantidad'), porHoras.length - 1)

  titulo('17 bis · Una línea por producto (G2)')

  // Tres líneas por ticket, el total repetido en cada una (como el banco del revisor).
  const porProducto = [
    'Fecha;Hora;Ticket;Articulo;Importe',
    ...tickets.flatMap((t, i) =>
      ['Menu', 'Cerveza', 'Cafe'].map((a) => `${t.fecha};${t.hora};T${String(i + 1).padStart(7, '0')};${a};${eur(t.importe)}`),
    ),
  ].join('\n')
  const g2 = await leerYConstruir(ficheroDe(aUtf8(porProducto), 'por-producto.csv'))
  igual('cuenta tickets, no líneas', totalDe(g2.dataset.weeks), tickets.length * 2)
  igual('el mismo resultado que el fichero de un ticket por fila', totalDe(g2.dataset.weeks), totalDe(g1.dataset.weeks))
  comprobar('y lo dice', tieneAviso(g2.advertencias, 'lineas-por-ticket'))
  igual('el total repetido en cada línea se cuenta una vez', g2.dataset.source.ventasSemanaNormal, g1.dataset.source.ventasSemanaNormal)
  igual('ninguna línea se cae: entran las tres de cada ticket', g2.filasUsadas, tickets.length * 3)

  // El consejo de antes, "márcala como No la uses", ya no es una pared.
  const sinTicket = g2.fichero.columnas.map((c) => (c.destino === 'tickets' ? { ...c, destino: 'ignorada' as const } : c))
  comprobar('marcar el ticket como "No la uses" no bloquea el Siguiente', mapeoSuficiente(sinTicket))
  const g2b = construirDatasetConDiagnostico(g2.fichero.filas, sinTicket, { fileName: 'x' })
  igual('y sin número de ticket junta las líneas por fecha, hora y total', totalDe(g2b.dataset.weeks), tickets.length * 2)
  comprobar('diciéndolo', tieneAviso(g2b.advertencias, 'lineas-por-ticket'))

  // Cada línea con su propio importe, y el ticket con número de documento numérico.
  const lineasPropias = [
    'Fecha;Hora;Num_ticket;Producto;Importe',
    ...tickets.flatMap((t, i) => [
      `${t.fecha};${t.hora};${100000 + i};Menu;${eur(12)}`,
      `${t.fecha};${t.hora};${100000 + i};Vino;${eur(4.5)}`,
    ]),
  ].join('\n')
  const g2c = await leerYConstruir(ficheroDe(aUtf8(lineasPropias), 'lineas.csv'))
  igual('un número de ticket numérico no se multiplica', totalDe(g2c.dataset.weeks), tickets.length * 2)
  const semanasConVentas = g2c.dataset.source.semanasConVentas ?? 0
  comprobar('el importe de cada ticket es la suma de sus líneas', semanasConVentas > 0)
  igual(
    'una semana normal: 168 tickets × 16,50 €, sin IVA',
    g2c.dataset.source.ventasSemanaNormal,
    Math.round((7 * 24 * 16.5) / 1.1),
  )

  const sinNumero = g2c.fichero.columnas.map((c) => (c.destino === 'tickets' ? { ...c, destino: 'ignorada' as const } : c))
  const g2d = construirDatasetConDiagnostico(g2c.fichero.filas, sinNumero, { fileName: 'x' })
  // Sin número ni total repetido, dos mesas que pagan en el mismo minuto se
  // juntan en una: sale algo por debajo, nunca el doble que salía antes.
  const juntas = totalDe(g2d.dataset.weeks)
  const buenas = totalDe(g2c.dataset.weeks)
  comprobar(
    'sin número y con cada línea a su precio, junta por fecha y hora (a menos de un 10 %)',
    juntas <= buenas && juntas >= buenas * 0.9,
    `salen ${juntas} de ${buenas}`,
  )

  // Una columna de tickets que CUENTA sigue sumándose.
  comprobar('la regla de cantidad de la segunda opinión sigue en pie', !mapeoConCantidad(sinTicket) && mapeoConCantidad(g2.fichero.columnas))

  titulo('17 ter · Devoluciones (m2)')

  const conDevolucion = [
    'Fecha;Hora;Importe;Comensales',
    '14/06/2025;14:00;80,00;4',
    '14/06/2025;14:05;-80,00;-4',
    '14/06/2025;14:30;50,00;2',
    '14/06/2025;21:00;30,00;3',
    '14/06/2025;21:40;-12,00;-1',
  ].join('\n')
  const dv = await leerYConstruir(ficheroDe(aUtf8(conDevolucion), 'devoluciones.csv'))
  igual('la devolución no se tira como "no era un número"', descarte(dv.descartes, 'comensales-ilegibles'), 0)
  igual('se cuentan las 2 devoluciones como tales', descarte(dv.descartes, 'devolucion'), 2)
  igual('y se quita la venta que anula (la de 80 €)', descarte(dv.descartes, 'venta-devuelta'), 1)
  igual('quedan 5 comensales: los de 14:30 y 21:00', totalDe(dv.dataset.weeks), 5)
  const contadas = dv.descartes.reduce((a, d) => a + d.filas, 0)
  igual('nada se cae en silencio', dv.filasUsadas + contadas, dv.filasLeidas)
  comprobar('el motivo dice lo que pasa', (dv.descartes.find((d) => d.motivo === 'devolucion')?.mensaje ?? '').includes('devolución'))

  const csvDevSinComensales = [
    'Fecha;Hora;Importe',
    ...tickets.map((t) => `${t.fecha};${t.hora};${eur(t.importe)}`),
    `${tickets[5].fecha};${tickets[5].hora};-${eur(tickets[5].importe)}`,
  ].join('\n')
  const dv2 = await leerYConstruir(ficheroDe(aUtf8(csvDevSinComensales), 'dev-importe.csv'))
  igual('sin comensales, el importe en negativo es la devolución', descarte(dv2.descartes, 'devolucion'), 1)
  igual('y quita su venta', totalDe(dv2.dataset.weeks), (tickets.length - 1) * 2)

  titulo('17 quater · Ventas sin IVA (m5)')

  const iva = g1.dataset.source
  comprobar('las ventas del fichero salen sin IVA', iva.ventasSemanaNormal !== null && iva.ventasSemanaNormalConIva !== null)
  igual('dividiendo entre 1,10', iva.ventasSemanaNormal, Math.round((iva.ventasSemanaNormalConIva ?? 0) / 1.1))
  igual('y guarda qué IVA se ha quitado', iva.ivaDescontado, 0.1)
  comprobar('y lo dice', tieneAviso(g1.advertencias, 'importe-con-iva'))
  const base = await leerYConstruir(ficheroDe(aUtf8(csvImporte.replace('Fecha;Hora;Importe', 'Fecha;Hora;Base imponible')), 'base.csv'))
  igual('una columna de base imponible no se toca', base.dataset.source.ivaDescontado, null)
  igual('y se usa tal cual', base.dataset.source.ventasSemanaNormal, iva.ventasSemanaNormalConIva)
}

// ─────────────────────────────────────────────────────────────
// 18. Ronda 9: el horario se deduce día a día, y la hora con zona
// ─────────────────────────────────────────────────────────────

/** Fila de un ticket por comensal: `n` filas a la misma hora. */
function filasDeCobros(fecha: string, hora: string, n: number): string[] {
  return Array.from({ length: n }, () => `${fecha};${hora};1`)
}

function fechaES(t: Date): string {
  return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`
}

function horaDeFranja(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

async function pruebaHorarioPorDia() {
  titulo('18 · Ronda 9: el listón del horario se elige día a día')

  // Cafetería de lunes a sábado de 8 a 16, unos 28 cobros al día. El viernes
  // de 10:00 a 11:00 pasa de 3 por franja, y con el listón para toda la semana
  // eso dejaba abierto solo el viernes y cerrados los otros cinco días.
  const patron = [2, 2, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2]
  const lineas = ['Fecha;Hora;Comensales']
  for (let w = 0; w < 12; w++) {
    for (let d = 0; d < 6; d++) {
      const t = new Date(Date.UTC(2025, 5, 2 + w * 7 + d))
      patron.forEach((v, i) => {
        const min = 8 * 60 + i * 30
        const n = d === 4 && (min === 10 * 60 || min === 10 * 60 + 30) ? 4 : v
        lineas.push(...filasDeCobros(fechaES(t), horaDeFranja(min + 5), n))
      })
    }
  }
  const f = await leerFichero(ficheroDe(aUtf8(lineas.join('\n')), 'cafeteria.csv'))
  const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })
  const h = r.dataset.source.detectedHours

  igual('abren los seis días, de lunes a sábado', h.slice(0, 6).filter((d) => d.length > 0).length, 6)
  igual('y el domingo sigue cerrado', h[6].length, 0)
  comprobar(
    'cada día abre a las 8:00 o antes y cierra a las 15:00 o después',
    h.slice(0, 6).every((d) => d.length > 0 && d[0].startMin <= 8 * 60 && d[d.length - 1].endMin >= 15 * 60),
    JSON.stringify(h.slice(0, 6).map((d) => d.map((b) => [b.startMin, b.endMin]))),
  )
  comprobar(
    'el lunes no se queda con el horario corto del viernes',
    (h[0][0]?.endMin ?? 0) - (h[0][0]?.startMin ?? 0) >= 6 * 60,
  )
  comprobar('no avisa de cobros fuera: el horario los recoge', !tieneAviso(r.advertencias, 'horario-deja-fuera'))

  // Un sábado con cobros sueltos lejos del servicio: ni con el listón más bajo
  // entran en el horario, y eso se dice con el día y cuánto se queda fuera.
  const sab = ['Fecha;Hora;Comensales']
  for (let w = 0; w < 6; w++) {
    const t = fechaES(new Date(Date.UTC(2025, 5, 7 + w * 7)))
    for (let i = 0; i < 8; i++) sab.push(...filasDeCobros(t, horaDeFranja(12 * 60 + i * 30 + 5), 3))
    for (const hora of ['09:05', '18:05', '21:05']) sab.push(...filasDeCobros(t, hora, 2))
  }
  const f2 = await leerFichero(ficheroDe(aUtf8(sab.join('\n')), 'sabados.csv'))
  const r2 = construirDatasetConDiagnostico(f2.filas, f2.columnas, { fileName: f2.nombre })
  const aviso = r2.advertencias.find((a) => a.codigo === 'horario-deja-fuera')
  comprobar('avisa de que el horario deja fuera cobros', aviso !== undefined)
  comprobar('nombra el sábado y el porcentaje', /sábado \(20 %\)/.test(aviso?.mensaje ?? ''), aviso?.mensaje ?? '')
  comprobar('y el sábado sigue abierto con su servicio', r2.dataset.source.detectedHours[5].length > 0)
}

async function pruebaZonaHoraria() {
  titulo('19 · Ronda 9: la hora con zona se pasa a la hora local')

  const tzAntes = process.env.TZ
  process.env.TZ = 'Europe/Madrid'
  try {
    igual('19:30Z es UTC', zonaDeLaHora('19:30Z'), 0)
    igual('ISO con +00:00 es UTC', zonaDeLaHora('2025-06-14T19:30:00.000+00:00'), 0)
    igual('+02:00 son 120 minutos', zonaDeLaHora('19:30+02:00'), 120)
    igual('-0300 son -180', zonaDeLaHora('21:40-0300'), -180)
    igual('sin zona no hay zona', zonaDeLaHora('19:30'), null)
    igual('la fecha española con hora no trae zona', zonaDeLaHora('14/06/2025 21:40'), null)
    igual('el reloj de 12 horas tampoco', zonaDeLaHora('2:05 PM'), null)
    igual('ni un número de Excel', zonaDeLaHora(0.5), null)

    // Verano (UTC+2) e invierno (UTC+1): la cena de las 21:30 sale bien en los dos.
    const csv = ['Fecha;Hora;Comensales', '14/06/2025;19:30Z;6', '13/12/2025;20:30:00+00:00;4', '14/06/2025;14:00;3'].join('\n')
    const f = await leerFichero(ficheroDe(aUtf8(csv), 'utc.csv'))
    const r = construirDatasetConDiagnostico(f.filas, f.columnas, { fileName: f.nombre })
    const junio = r.dataset.weeks.find((w) => w.startDate === '2025-06-09')
    const diciembre = r.dataset.weeks.find((w) => w.startDate === '2025-12-08')
    igual('las 19:30Z de junio son las 21:30 del sábado', junio?.days[5][31], 6)
    igual('y no se quedan a las 19:30', junio?.days[5][27], 0)
    igual('las 20:30Z de diciembre son también las 21:30', diciembre?.days[5][31], 4)
    igual('la hora sin zona se queda como viene', junio?.days[5][16], 3)
    comprobar('avisa de que se han convertido', tieneAviso(r.advertencias, 'hora-con-zona'))
    comprobar(
      'y dice cuántas',
      /^2 horas venían con zona horaria/.test(r.advertencias.find((a) => a.codigo === 'hora-con-zona')?.mensaje ?? ''),
    )

    // La fecha ISO con la hora dentro: las 23:30Z de un sábado de verano son la
    // 01:30 del domingo, que es del sábado noche.
    const iso = ['Fecha;Comensales', '2025-06-14T23:30:00Z;2', '2025-06-14T12:00:00.000Z;5'].join('\n')
    const f2 = await leerFichero(ficheroDe(aUtf8(iso), 'iso.csv'))
    const r2 = construirDatasetConDiagnostico(f2.filas, f2.columnas, { fileName: f2.nombre })
    const sem = r2.dataset.weeks[0]
    igual('la 01:30 local cae en la noche del sábado', sem.days[5][39], 2)
    igual('las 12:00Z son las 14:00', sem.days[5][16], 5)

    // Sin zona, nada cambia y no hay aviso.
    const f3 = await leerFichero(ficheroDe(aUtf8(CSV_MADRUGADA), 'noche.csv'))
    const r3 = construirDatasetConDiagnostico(f3.filas, f3.columnas, { fileName: f3.nombre })
    comprobar('un fichero sin zona no avisa', !tieneAviso(r3.advertencias, 'hora-con-zona'))

    // En Canarias el navegador está una hora por detrás.
    process.env.TZ = 'Atlantic/Canary'
    const f4 = await leerFichero(ficheroDe(aUtf8(csv), 'utc.csv'))
    const r4 = construirDatasetConDiagnostico(f4.filas, f4.columnas, { fileName: f4.nombre })
    const junio4 = r4.dataset.weeks.find((w) => w.startDate === '2025-06-09')
    igual('en Canarias las 19:30Z de junio son las 20:30', junio4?.days[5][29], 6)
  } finally {
    if (tzAntes === undefined) delete process.env.TZ
    else process.env.TZ = tzAntes
  }
}

async function main() {
  pruebaNumeros()
  await pruebaLatin1()
  await pruebaFechasAmericanas()
  await pruebaSinComensales()
  await pruebaFilasRotas()
  await pruebaUnaSemana()
  await pruebaMadrugada()
  await pruebaExcel()
  await pruebaAmbigua()
  await pruebaTicketsPorCodigo()
  pruebaPasoHorario()
  await pruebaFicheroPorHoras()
  await pruebaFicheroPorDia()
  await pruebaFormatoALaFuerza()
  await pruebaPeriodoDelFichero()
  await pruebaRonda7()
  await pruebaRonda8()
  await pruebaHorarioPorDia()
  await pruebaZonaHoraria()

  console.log(`\n\x1b[1m${pasadas} comprobaciones pasadas, ${fallos.length} fallidas\x1b[0m`)
  if (fallos.length > 0) {
    console.log('')
    for (const f of fallos) console.log(`  \x1b[31m·\x1b[0m ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
