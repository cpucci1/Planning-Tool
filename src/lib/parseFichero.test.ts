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
  detectarSeparador,
  leerFichero,
  leerYConstruir,
  parsearCSV,
  parsearHora,
  parsearNumero,
  type Advertencia,
  type Descarte,
  type MotivoDescarte,
} from './parseFichero'

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

  // Y si el fichero no trae ni comensales ni tickets, no se inventa un comensal
  // por fila: se para y se cuenta.
  const sinNada = construirDatasetConDiagnostico(
    f.filas,
    f.columnas.map((c) => (c.destino === 'tickets' ? { ...c, destino: 'ignorada' as const } : c)),
    { fileName: f.nombre },
  )
  igual('sin comensales y sin tickets no entra ninguna fila', sinNada.filasUsadas, 0)
  igual('y las 4 se cuentan como descartadas', descarte(sinNada.descartes, 'comensales-ilegibles'), 4)
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
    'el rango de fechas es esa semana, no un año entero',
    r.dataset.source.dateRange,
    '2025-06-09 → 2025-06-09',
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
