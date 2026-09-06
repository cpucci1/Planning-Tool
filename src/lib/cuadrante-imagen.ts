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
import { DAYS, formatMin, formatRange } from '@/lib/time'

// Mismos colores que `report.ts` (no se exportan desde allí, así que se
// repiten aquí: es la única forma de no tocar ese fichero).
const BRAND = '#6C0FD8'
const BRAND_DARK = '#4A0A94'
const INK = '#111118'
const MUTED = '#71717A'
const LIGHT = '#F4ECFC'
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
export function descargarTurnoPersona(person: Person, shifts: Shift[], roleName: string): void {
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

  triggerDownload(canvas.toDataURL('image/png'), `turno-${slugify(person.label)}.png`)
}

// ─────────────────────────────────────────────────────────────
// PDF de cocina
// ─────────────────────────────────────────────────────────────

const MM_PER_PT = 0.3528
const PAGE_MARGIN = 14
const CELL_PAD = 2.2
const NAME_COL_W = 40

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
  if (blocks.length === 0) return ['Libra']
  return blocks.map((b) => formatRange(b.startMin, b.endMin))
}

/**
 * PDF A4 con el cuadrante entero, para colgar en cocina: cero euros, cero
 * costes, cero holgura —esto lo ve todo el turno—, solo quién trabaja, qué
 * día y a qué hora.
 *
 * Prueba tamaños de letra de mayor a menor y se queda con el más grande que
 * quepa entero en una página; si ni el más pequeño de la lista cabe, sigue
 * en una segunda página con ese mismo tamaño en vez de seguir encogiendo
 * hasta la letra ilegible.
 */
export async function descargarCuadranteCocina(roster: Roster, model: StaffingModel): Promise<void> {
  // jsPDF pesa ~130 KB gzip: se carga solo cuando hace falta, igual que en
  // `report.ts`, para no penalizar el arranque de la herramienta por un
  // botón que solo se usa al final del flujo.
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const usableW = W - PAGE_MARGIN * 2
  const dayColW = (usableW - NAME_COL_W) / 7
  const dateLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  const people = orderedPeople(roster, model)
  const byPersonDay = shiftsByPersonDayKey(roster.shifts)
  const dayHeaders = DAYS.map((d) => d.slice(0, 3).toUpperCase())

  const dayColLeft = (d: number) => PAGE_MARGIN + NAME_COL_W + dayColW * d
  const colRight = dayColLeft(7)
  const vLines = [PAGE_MARGIN, PAGE_MARGIN + NAME_COL_W, ...Array.from({ length: 7 }, (_, d) => dayColLeft(d + 1))]

  /** Cabecera y pie: iguales en cada página. Devuelve la Y donde puede
   *  arrancar la tabla. */
  function drawChrome(): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.setTextColor(...hexToRgb(BRAND))
    doc.text('Cuadrante de cocina', PAGE_MARGIN, PAGE_MARGIN + 4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text(`Generado el ${dateLabel}`, W - PAGE_MARGIN, PAGE_MARGIN + 4, { align: 'right' })

    const lineY = PAGE_MARGIN + 9
    doc.setDrawColor(...hexToRgb(LINE))
    doc.line(PAGE_MARGIN, lineY, W - PAGE_MARGIN, lineY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text('Generado con el planificador gratuito de Shifty · shifty.es', PAGE_MARGIN, H - 8)

    return lineY + 6
  }

  const tableTop = drawChrome()
  const tableBottom = H - 14

  if (people.length === 0) {
    // Sin plantilla no hay tabla que dibujar, pero el PDF tiene que salir
    // igual y no reventar.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...hexToRgb(MUTED))
    doc.text('No hay personas en el cuadrante todavía.', PAGE_MARGIN, tableTop + 10)
    doc.save('cuadrante-cocina.pdf')
    return
  }

  // Las líneas de cada celda no cambian entre tamaños de letra candidatos:
  // se calculan una sola vez.
  const rows = people.map(({ person, roleName }) => ({
    person,
    roleName,
    days: Array.from({ length: 7 }, (_, d) => dayCellLines(byPersonDay, person.id, d)),
  }))

  // ── Elegir el tamaño de letra más grande que quepa en una sola página ──
  const CANDIDATES = [11, 9.5, 8, 7]
  let fontSize = CANDIDATES[CANDIDATES.length - 1]
  let headerRowH = 0
  let rowHeights: number[] = []

  for (const fs of CANDIDATES) {
    const roleFs = Math.max(6, fs - 1.5)
    headerRowH = lineHeightMm(fs) + CELL_PAD * 2 + 1.2

    rowHeights = rows.map((row) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(fs)
      const nameLines: string[] = doc.splitTextToSize(row.person.label, NAME_COL_W - CELL_PAD * 2)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(roleFs)
      const roleLines: string[] = doc.splitTextToSize(row.roleName, NAME_COL_W - CELL_PAD * 2)
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

    const total = headerRowH + rowHeights.reduce((a, b) => a + b, 0)
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
    const roleLines: string[] = doc.splitTextToSize(row.roleName, NAME_COL_W - CELL_PAD * 2)
    const roleTop = CELL_PAD + nameLines.length * lineHeightMm(fontSize)
    roleLines.forEach((line, li) => {
      doc.text(line, PAGE_MARGIN + CELL_PAD, y + roleTop + lineHeightMm(roleFs) * (li + 0.8))
    })

    row.days.forEach((cell, d) => {
      const isOff = cell.length === 1 && cell[0] === 'Libra'
      doc.setFont('helvetica', isOff ? 'normal' : 'bold')
      doc.setFontSize(fontSize)
      doc.setTextColor(...(isOff ? hexToRgb(MUTED) : hexToRgb(INK)))
      const cx = dayColLeft(d) + dayColW / 2
      let lineOffset = 0
      for (const line of cell) {
        const wrapped: string[] = doc.splitTextToSize(line, dayColW - CELL_PAD * 2)
        wrapped.forEach((wLine) => {
          doc.text(wLine, cx, y + CELL_PAD + lineHeightMm(fontSize) * (lineOffset + 0.8), { align: 'center' })
          lineOffset += 1
        })
      }
    })

    drawGridLines(y, h)
    y += h
  })

  doc.save('cuadrante-cocina.pdf')
}
