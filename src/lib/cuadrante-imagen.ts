/**
 * Dos formas de sacar el cuadrante de la pantalla tal y como viaja de verdad
 * en un restaurante español: una imagen vertical para mandar el turno de una
 * persona por WhatsApp, y un papel de cocina con la semana entera para
 * colgar en la pared.
 *
 * Comparten estilo con `report.ts`: el mismo morado de marca "a fuego" (aquí
 * son un canvas y un PDF, no una página con clases de Tailwind), jsPDF
 * cargado de forma perezosa —no hace falta hasta que alguien pulsa el
 * botón— y el mismo patrón de descarga que usa `RosterGrid.downloadCsv`:
 * crear el enlace, meterlo en el documento, pulsarlo y quitarlo.
 */

import type { DayIndex, Person, Roster, Shift, StaffingModel } from '@/lib/types'
import { DAYS, formatMin } from '@/lib/time'
import { LEYENDA_CODIGOS, codigoTurno, tramoCorto, diaLargo, publicarAntesDe, rangoSemana, sumarDias } from '@/lib/semana'

// Mismos colores que `report.ts` (no se exportan desde allí, así que se
// repiten aquí: es la única forma de no tocar ese fichero).
const BRAND = '#3C1663'
const BRAND_DARK = '#4A0A94'
const INK = '#111118'
const MUTED = '#71717A'
const LIGHT = '#F1ECF7'
const LINE = '#E4E4E7'

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const hoursFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

/** "Ana García" → "ana-garcia": sin acentos, sin espacios, sin mayúsculas,
 *  para que el nombre del fichero no reviente en ningún sistema operativo. */
function slugify(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return slug || 'persona'
}

/** El patrón de descarga de la casa (ver `RosterGrid.downloadCsv`): crear el
 *  enlace, meterlo en el documento, pulsarlo y quitarlo. */
function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** base64 → Blob, sin pasar por `canvas.toBlob`, que es asíncrono. Ver el
 *  aviso de `compartirODescargar`: aquí el que sea síncrono es el requisito. */
function dataUrlABlob(dataUrl: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}

/**
 * Compartir de verdad, y si no se puede, descargar.
 *
 * El cuadrante de una persona viaja por WhatsApp: ese es el caso real, no
 * guardar un PNG en la carpeta de descargas. En el móvil, que es donde esto
 * pasa, `navigator.share` abre el menú del sistema y la imagen sale a WhatsApp
 * en dos toques.
 *
 * Se pregunta con `canShare` y con el fichero DELANTE, no solo si existe
 * `share`: hay navegadores que comparten texto y no ficheros, y ahí preguntar
 * en general diría que sí y luego fallaría.
 */
async function compartirODescargar(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  /*
   * ⚠️ EL BLOB SE HACE SIN NI UN `await`, Y ESO ES LO QUE HACE QUE FUNCIONE.
   *
   * `navigator.share` exige "activación transitoria": solo vale si se llama
   * dentro del gesto de la persona. Safari la da por gastada en cuanto hay un
   * `await` por medio, así que la versión obvia —esperar a `canvas.toBlob`, que
   * es asíncrono, y luego compartir— falla con NotAllowedError justo en el
   * iPhone, que es el sitio donde esto tiene sentido. Y falla en silencio,
   * porque cae a la descarga y parece que no se ha cambiado nada.
   *
   * `toDataURL` es síncrono y pasar de base64 a Blob también, así que la
   * llamada a `share` sigue dentro del mismo turno que la pulsación.
   */
  const file = new File([dataUrlABlob(canvas.toDataURL('image/png'))], filename, {
    type: 'image/png',
  })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      // Cancelar el menú de compartir NO es un fallo: es una respuesta. Si se
      // descargara igual, quien se arrepiente se encuentra el fichero puesto.
      // Se mira solo el nombre: no todos los navegadores rechazan con un
      // DOMException, y exigir el tipo dejaba la cancelación cayendo a la
      // descarga, que es justo lo que se quería evitar.
      if (err instanceof Error && err.name === 'AbortError') return
      // Cualquier otro fallo sí cae a la descarga: mejor el fichero que nada.
    }
  }

  const url = URL.createObjectURL(file)
  triggerDownload(url, filename)
  // Se suelta DESPUÉS, no en la línea de al lado: revocar en el mismo turno
  // puede cortarle la descarga al navegador antes de que la haya empezado.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ─────────────────────────────────────────────────────────────
// Imagen para WhatsApp
// ─────────────────────────────────────────────────────────────

const IMG_W = 1080
const IMG_H = 1920
const IMG_PAD = 72
const IMG_HEADER_H = 300
const IMG_FOOTER_H = 230
// El proyecto usa Onest en toda la web (`src/index.css`); a estas alturas del
// flujo ya está cargada por el navegador, así que el canvas la puede pintar
// directamente sin esperar a ningún evento de carga de fuente.
const FONT_STACK = "'Onest', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"

/** Reduce el tamaño de letra hasta que el texto quepa en el ancho dado, sin
 *  bajar del mínimo: un nombre larguísimo no puede salirse del lienzo, pero
 *  tampoco puede acabar en letra de recibo. */
function fitFontPx(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number): number {
  let size = startPx
  while (size > minPx) {
    ctx.font = `bold ${size}px ${FONT_STACK}`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 2
  }
  return size
}

/**
 * Recorta con puntos suspensivos lo que no quepa.
 *
 * Encoger la letra tiene un suelo (por debajo de cierto tamaño no se lee en un
 * móvil), así que hace falta la segunda red: los nombres los escribe el
 * usuario a mano y no tienen límite, y un nombre con dos apellidos largos se
 * salía del lienzo por la derecha.
 */
function recortarAlAncho(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let corto = text
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > maxWidth) {
    corto = corto.slice(0, -1)
  }
  return `${corto}…`
}

/** Envuelve texto por palabras al ancho dado. Con los dos bloques de una
 *  jornada partida el texto cabe casi siempre en una línea (ver el análisis
 *  en la respuesta); esto es solo la red de seguridad para cuando no cabe. */
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawRoundedBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/**
 * PNG vertical (1080x1920, proporción 9:16) con el turno de UNA persona, para
 * mandarlo por WhatsApp o dejarlo como estado. Letra grande de verdad —nada
 * por debajo de ~32px— porque esto se mira en un móvil o en la cocina con
 * las manos ocupadas. Los días libres se pintan tan claro como los que se
 * trabaja: saber cuándo se libra importa igual que saber cuándo se entra.
 *
 * `shifts` no hace falta que venga ya filtrado a esta persona: la función
 * filtra por `person.id` por su cuenta, así que se le puede pasar
 * `roster.shifts` entero sin pensarlo dos veces.
 */
export async function compartirTurnoPersona(
  person: Person,
  shifts: Shift[],
  roleName: string,
): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = IMG_W
  canvas.height = IMG_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return // sin canvas 2D no hay nada que generar

  // Si la persona no tiene ningún turno, esto sigue siendo un array vacío:
  // todas las filas salen "Libras" y el total, 0 h. No revienta.
  const own = shifts.filter((s) => s.personId === person.id)
  const totalHours = own.reduce((acc, s) => acc + s.hours, 0)

  ctx.textBaseline = 'alphabetic'

  // Fondo claro, alto contraste con el texto oscuro de las filas.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, IMG_W, IMG_H)

  // ── Cabecera de marca: nombre y puesto ──
  ctx.fillStyle = BRAND
  ctx.fillRect(0, 0, IMG_W, IMG_HEADER_H)

  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = `bold 32px ${FONT_STACK}`
  ctx.fillText('TU TURNO DE LA SEMANA', IMG_PAD, 64)

  const anchoUtil = IMG_W - IMG_PAD * 2
  const nameSize = fitFontPx(ctx, person.label, anchoUtil, 80, 42)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${nameSize}px ${FONT_STACK}`
  ctx.fillText(recortarAlAncho(ctx, person.label, anchoUtil), IMG_PAD, 168)

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `40px ${FONT_STACK}`
  ctx.fillText(recortarAlAncho(ctx, roleName, anchoUtil), IMG_PAD, 224)

  // ── Los siete días, uno por fila ──
  const boxY = IMG_H - IMG_FOOTER_H
  const rowsTop = IMG_HEADER_H + 36
  const rowsBottom = boxY - 36
  const rowH = (rowsBottom - rowsTop) / 7
  const maxLineWidth = IMG_W - IMG_PAD * 2

  for (let d = 0; d < 7; d++) {
    const rowTop = rowsTop + d * rowH
    const dayBlocks = own
      .filter((s) => s.day === d)
      .flatMap((s) => s.blocks)
      .sort((a, b) => a.startMin - b.startMin)

    ctx.textAlign = 'left'
    ctx.fillStyle = BRAND
    ctx.font = `bold 44px ${FONT_STACK}`
    ctx.fillText(DAYS[d as DayIndex], IMG_PAD, rowTop + 50)

    if (dayBlocks.length === 0) {
      // Día libre: gris apagado y en cursiva, con la palabra entera —saber
      // que se libra importa tanto como saber a qué hora se entra.
      ctx.fillStyle = MUTED
      ctx.font = `italic 36px ${FONT_STACK}`
      ctx.fillText('Libras', IMG_PAD, rowTop + 108)
    } else {
      // "13:00 a 17:00 y 19:30 a 00:30": un bloque por turno normal, dos si
      // la jornada está partida.
      const text = dayBlocks.map((b) => `${formatMin(b.startMin)} a ${formatMin(b.endMin)}`).join(' y ')
      ctx.fillStyle = INK
      ctx.font = `bold 36px ${FONT_STACK}`
      const lines = wrapCanvasText(ctx, text, maxLineWidth)
      lines.forEach((line, i) => ctx.fillText(line, IMG_PAD, rowTop + 108 + i * 46))
    }

    if (d < 6) {
      ctx.strokeStyle = LINE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(IMG_PAD, rowTop + rowH - 14)
      ctx.lineTo(IMG_W - IMG_PAD, rowTop + rowH - 14)
      ctx.stroke()
    }
  }

  // ── Total de la semana ──
  const boxH = IMG_FOOTER_H - 74
  drawRoundedBox(ctx, IMG_PAD, boxY, IMG_W - IMG_PAD * 2, boxH, 28, LIGHT)

  ctx.textAlign = 'center'
  ctx.fillStyle = BRAND_DARK
  ctx.font = `bold 32px ${FONT_STACK}`
  ctx.fillText('TOTAL DE LA SEMANA', IMG_W / 2, boxY + 46)

  ctx.fillStyle = BRAND
  ctx.font = `bold 64px ${FONT_STACK}`
  ctx.fillText(`${hoursFmt.format(totalHours)} h`, IMG_W / 2, boxY + 110)

  // ── Pie discreto (discreto en tono, no en tamaño: nada baja de 32px) ──
  ctx.fillStyle = MUTED
  ctx.font = `32px ${FONT_STACK}`
  ctx.fillText('Calculado con Shifty', IMG_W / 2, IMG_H - 22)

  try {
    await compartirODescargar(canvas, `turno-${slugify(person.label)}.png`)
  } catch {
    // Que un fallo al compartir no deje el botón mudo Y ADEMÁS suelte un
    // rechazo que nadie escucha: si algo va mal, al menos queda el fichero.
    triggerDownload(canvas.toDataURL('image/png'), `turno-${slugify(person.label)}.png`)
  }
}

// ─────────────────────────────────────────────────────────────
// PDF de cocina
// ─────────────────────────────────────────────────────────────

const MM_PER_PT = 0.3528
const PAGE_MARGIN = 14
const CELL_PAD = 2.2
const NAME_COL_W = 34
/** Columna de horas de la semana, a la derecha. */
const HOURS_COL_W = 11

/** Altura aproximada de una línea de texto a un tamaño de letra dado, en mm
 *  (el documento trabaja en mm; el tamaño de letra, en puntos). No hace
 *  falta más precisión que esta: solo tiene que ser la misma fórmula en el
 *  cálculo de alturas y en el dibujado, para que no se desincronicen. */
function lineHeightMm(fontSizePt: number): number {
  return fontSizePt * 1.18 * MM_PER_PT
}

/**
 * Personas en el mismo orden que usa el resto de la herramienta: agrupadas
 * por bloque y, dentro, por puesto. No se importa `RosterGrid` para
 * reutilizar su agrupación porque `src/lib/` no importa nada de React
 * (ver CLAUDE.md): se recalcula aquí, igual de barato.
 */
function orderedPeople(roster: Roster, model: StaffingModel): { person: Person; roleName: string }[] {
  const out: { person: Person; roleName: string }[] = []
  const placed = new Set<string>()
  for (const block of model.blocks) {
    for (const role of model.roles.filter((r) => r.blockId === block.id)) {
      for (const p of roster.people) {
        if (p.roleId === role.id) {
          out.push({ person: p, roleName: role.name })
          placed.add(p.id)
        }
      }
    }
  }
  const roleById = new Map(model.roles.map((r) => [r.id, r]))
  for (const p of roster.people) {
    if (!placed.has(p.id)) out.push({ person: p, roleName: roleById.get(p.roleId)?.name ?? 'Sin puesto' })
  }
  return out
}

function shiftsByPersonDayKey(shifts: Shift[]): Map<string, Shift[]> {
  const m = new Map<string, Shift[]>()
  for (const s of shifts) {
    const key = `${s.personId}|${s.day}`
    const arr = m.get(key)
    if (arr) arr.push(s)
    else m.set(key, [s])
  }
  return m
}

/** Las líneas de una celda de día: una por bloque de turno, "Libra" si no
 *  trabaja ese día. Nunca se juntan los dos bloques en una sola frase con
 *  "y" —al contrario que en la imagen de WhatsApp— porque la columna del
 *  papel de cocina es estrecha: una línea por bloque es lo que de verdad
 *  cabe sin amontonar el texto. */
function dayCellLines(byPersonDay: Map<string, Shift[]>, personId: string, day: number): string[] {
  const list = byPersonDay.get(`${personId}|${day}`) ?? []
  const blocks = list.flatMap((s) => s.blocks).sort((a, b) => a.startMin - b.startMin)
  if (blocks.length === 0) return ['L']
  // El código va delante (M, T o P), como en los cuadrantes de pared de toda
  // la vida: se lee de lejos, y la hora debajo es para quien se acerca.
  // Código y primer tramo en la misma línea, con horas cortas ("P 13-17:30"
  // y debajo "19:30-24"): así una plantilla de veintitantas cabe en una hoja.
  const tramos = blocks.map((b) => tramoCorto(b.startMin, b.endMin))
  return [`${codigoTurno({ ...list[0], blocks })}  ${tramos[0]}`, ...tramos.slice(1)]
}

/**
 * PDF A4 con el cuadrante entero, para colgar en la pared o mandar al grupo:
 * cero euros, cero costes, cero holgura (esto lo ve toda la plantilla), solo
 * quién trabaja, qué día, a qué hora y cuántas horas suma cada uno.
 *
 * Con `opciones.lunes` sale con las fechas de esa semana y el día hasta el
 * que hay que publicarlo; con `opciones.turnos`, los de esa semana de la
 * rueda en vez de los del cuadrante tipo.
 *
 * Prueba tamaños de letra de mayor a menor y se queda con el más grande que
 * quepa entero en una página; si ni el más pequeño de la lista cabe, sigue
 * en una segunda página con ese mismo tamaño en vez de seguir encogiendo
 * hasta la letra ilegible.
 */
export async function descargarCuadranteCocina(
  roster: Roster,
  model: StaffingModel,
  opciones: { lunes?: Date; turnos?: Shift[]; nota?: string } = {},
): Promise<void> {
  // jsPDF pesa ~130 KB gzip: se carga solo cuando hace falta, igual que en
  // `report.ts`, para no penalizar el arranque de la herramienta por un
  // botón que solo se usa al final del flujo.
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const usableW = W - PAGE_MARGIN * 2
  const dayColW = (usableW - NAME_COL_W - HOURS_COL_W) / 7
  const dateLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const { lunes } = opciones
  const turnos = opciones.turnos ?? roster.shifts

  const people = orderedPeople(roster, model)
  const byPersonDay = shiftsByPersonDayKey(turnos)
  const dayHeaders = DAYS.map((d, i) =>
    lunes ? `${d.slice(0, 3).toUpperCase()} ${sumarDias(lunes, i).getDate()}` : d.slice(0, 3).toUpperCase(),
  )
  const horasDe = new Map<string, number>()
  for (const sh of turnos) horasDe.set(sh.personId, (horasDe.get(sh.personId) ?? 0) + sh.hours)
  const enElLocal = Array.from({ length: 7 }, (_, d) => new Set(turnos.filter((sh) => sh.day === d).map((sh) => sh.personId)).size)

  const dayColLeft = (d: number) => PAGE_MARGIN + NAME_COL_W + dayColW * d
  const hoursLeft = dayColLeft(7)
  const colRight = hoursLeft + HOURS_COL_W
  const vLines = [PAGE_MARGIN, PAGE_MARGIN + NAME_COL_W, ...Array.from({ length: 7 }, (_, d) => dayColLeft(d + 1)), colRight]
  const titulo = lunes ? `Cuadrante ${rangoSemana(lunes)}` : 'Cuadrante de la semana'
  const sub = lunes ? `Publicar como tarde el ${diaLargo(publicarAntesDe(lunes))}` : `Generado el ${dateLabel}`

  /** Cabecera y pie: iguales en cada página. Devuelve la Y donde puede
   *  arrancar la tabla. */
  function drawChrome(): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.setTextColor(...hexToRgb(BRAND))
    doc.text(titulo, PAGE_MARGIN, PAGE_MARGIN + 4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text(sub, W - PAGE_MARGIN, PAGE_MARGIN + 4, { align: 'right' })

    const lineY = PAGE_MARGIN + 9
    doc.setDrawColor(...hexToRgb(LINE))
    doc.line(PAGE_MARGIN, lineY, W - PAGE_MARGIN, lineY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...hexToRgb(MUTED))
    const leyenda = (Object.keys(LEYENDA_CODIGOS) as (keyof typeof LEYENDA_CODIGOS)[])
      .map((k) => `${k}: ${LEYENDA_CODIGOS[k].toLowerCase()}`)
      .join(' · ')
    doc.text(opciones.nota ? `${leyenda}. ${opciones.nota}` : leyenda, PAGE_MARGIN, H - 12, { maxWidth: usableW })
    doc.text('Generado con el planificador gratuito de Shifty · shifty.es', PAGE_MARGIN, H - 6)

    return lineY + 6
  }

  const tableTop = drawChrome()
  const tableBottom = H - 18

  if (people.length === 0) {
    // Sin plantilla no hay tabla que dibujar, pero el PDF tiene que salir
    // igual y no reventar.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text('No hay personas en el cuadrante todavía.', PAGE_MARGIN, tableTop + 10)
    doc.save('cuadrante.pdf')
    return
  }

  // Las líneas de cada celda no cambian entre tamaños de letra candidatos:
  // se calculan una sola vez.
  // Si la persona aún se llama como su puesto ("Camarero 3"), repetir el
  // puesto debajo solo gasta una línea por fila.
  const rows = people.map(({ person, roleName }) => ({
    person,
    roleName: person.label.startsWith(roleName) ? '' : roleName,
    days: Array.from({ length: 7 }, (_, d) => dayCellLines(byPersonDay, person.id, d)),
    horas: `${hoursFmt.format(horasDe.get(person.id) ?? 0)} h`,
  }))

  // ── Elegir el tamaño de letra más grande que quepa en una sola página ──
  const CANDIDATES = [11, 9.5, 8, 7, 6.5]
  let fontSize = CANDIDATES[CANDIDATES.length - 1]
  let headerRowH = 0
  let rowHeights: number[] = []
  let footRowH = 0

  for (const fs of CANDIDATES) {
    const roleFs = Math.max(6, fs - 1.5)
    headerRowH = lineHeightMm(fs) + CELL_PAD * 2 + 1.2
    footRowH = headerRowH

    rowHeights = rows.map((row) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(fs)
      const nameLines: string[] = doc.splitTextToSize(row.person.label, NAME_COL_W - CELL_PAD * 2)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(roleFs)
      const roleLines: string[] = row.roleName ? doc.splitTextToSize(row.roleName, NAME_COL_W - CELL_PAD * 2) : []
      const nameBlockH = nameLines.length * lineHeightMm(fs) + roleLines.length * lineHeightMm(roleFs)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(fs)
      let dayBlockH = 0
      for (const cell of row.days) {
        let cellLines = 0
        for (const line of cell) {
          const wrapped: string[] = doc.splitTextToSize(line, dayColW - CELL_PAD * 2)
          cellLines += wrapped.length
        }
        dayBlockH = Math.max(dayBlockH, cellLines * lineHeightMm(fs))
      }
      return Math.max(nameBlockH, dayBlockH) + CELL_PAD * 2
    })

    const total = headerRowH + footRowH + rowHeights.reduce((a, b) => a + b, 0)
    fontSize = fs
    if (total <= tableBottom - tableTop) break // cabe entera en una página: nos quedamos con esta letra
  }

  // ── Dibujar la tabla, paginando si hace falta ──
  function drawGridLines(y: number, h: number): void {
    doc.setDrawColor(...hexToRgb(LINE))
    doc.line(PAGE_MARGIN, y, colRight, y)
    doc.line(PAGE_MARGIN, y + h, colRight, y + h)
    for (const x of vLines) doc.line(x, y, x, y + h)
  }

  function drawTableHeader(y: number): void {
    doc.setFillColor(...hexToRgb(LIGHT))
    doc.rect(PAGE_MARGIN, y, usableW, headerRowH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    doc.setTextColor(...hexToRgb(BRAND_DARK))
    doc.text('PERSONA', PAGE_MARGIN + CELL_PAD, y + headerRowH - CELL_PAD - 1)
    dayHeaders.forEach((label, d) => {
      doc.text(label, dayColLeft(d) + dayColW / 2, y + headerRowH - CELL_PAD - 1, { align: 'center' })
    })
    doc.text('H', hoursLeft + HOURS_COL_W / 2, y + headerRowH - CELL_PAD - 1, { align: 'center' })
    drawGridLines(y, headerRowH)
  }

  let y = tableTop
  drawTableHeader(y)
  y += headerRowH

  const roleFs = Math.max(6, fontSize - 1.5)

  rows.forEach((row, i) => {
    const h = rowHeights[i]
    if (y + h > tableBottom) {
      doc.addPage()
      drawChrome()
      y = tableTop
      drawTableHeader(y)
      y += headerRowH
    }

    // Cebra suave para seguir la fila en una tabla ancha: no es coste ni
    // holgura, es solo lectura.
    if (i % 2 === 1) {
      doc.setFillColor(247, 247, 248)
      doc.rect(PAGE_MARGIN, y, usableW, h, 'F')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    doc.setTextColor(...hexToRgb(INK))
    const nameLines: string[] = doc.splitTextToSize(row.person.label, NAME_COL_W - CELL_PAD * 2)
    nameLines.forEach((line, li) => {
      doc.text(line, PAGE_MARGIN + CELL_PAD, y + CELL_PAD + lineHeightMm(fontSize) * (li + 0.8))
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(roleFs)
    doc.setTextColor(...hexToRgb(MUTED))
    const roleLines: string[] = row.roleName ? doc.splitTextToSize(row.roleName, NAME_COL_W - CELL_PAD * 2) : []
    const roleTop = CELL_PAD + nameLines.length * lineHeightMm(fontSize)
    roleLines.forEach((line, li) => {
      doc.text(line, PAGE_MARGIN + CELL_PAD, y + roleTop + lineHeightMm(roleFs) * (li + 0.8))
    })

    row.days.forEach((cell, d) => {
      const isOff = cell.length === 1 && cell[0] === 'L'
      const cx = dayColLeft(d) + dayColW / 2
      let lineOffset = 0
      cell.forEach((line, li) => {
        // El código, en negrita y de marca; las horas, normales debajo.
        doc.setFont('helvetica', li === 0 ? 'bold' : 'normal')
        doc.setFontSize(li === 0 ? fontSize : Math.max(6, fontSize - 1))
        doc.setTextColor(...(isOff ? hexToRgb(MUTED) : li === 0 ? hexToRgb(BRAND_DARK) : hexToRgb(INK)))
        const wrapped: string[] = doc.splitTextToSize(line, dayColW - CELL_PAD * 2)
        wrapped.forEach((wLine) => {
          doc.text(wLine, cx, y + CELL_PAD + lineHeightMm(fontSize) * (lineOffset + 0.8), { align: 'center' })
          lineOffset += 1
        })
      })
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(Math.max(6, fontSize - 1))
    doc.setTextColor(...hexToRgb(INK))
    doc.text(row.horas, hoursLeft + HOURS_COL_W / 2, y + CELL_PAD + lineHeightMm(fontSize) * 0.8, { align: 'center' })

    drawGridLines(y, h)
    y += h
  })

  // Última fila: cuánta gente hay cada día, que es lo primero que mira quien
  // cuadra un servicio.
  if (y + footRowH > tableBottom) {
    doc.addPage()
    drawChrome()
    y = tableTop
  }
  doc.setFillColor(...hexToRgb(LIGHT))
  doc.rect(PAGE_MARGIN, y, usableW, footRowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(Math.max(6, fontSize - 1))
  doc.setTextColor(...hexToRgb(BRAND_DARK))
  doc.text('Trabajan', PAGE_MARGIN + CELL_PAD, y + footRowH - CELL_PAD - 1)
  enElLocal.forEach((n, d) => {
    doc.text(String(n), dayColLeft(d) + dayColW / 2, y + footRowH - CELL_PAD - 1, { align: 'center' })
  })
  drawGridLines(y, footRowH)

  doc.save(lunes ? `cuadrante-${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, '0')}-${String(lunes.getDate()).padStart(2, '0')}.pdf` : 'cuadrante.pdf')
}
