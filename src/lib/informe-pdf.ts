/**
 * El dibujo del informe, con jsPDF. Se carga aparte y solo cuando alguien
 * pulsa descargar: son ~130 KB gzip que nadie necesita hasta el último paso, y
 * esta herramienta presume de abrir rápido en el primero.
 *
 * Aquí solo se PINTA. Lo que hay que pintar llega ya calculado en
 * `InformeInput` (ver `informe.ts`): este módulo no decide ni una cifra, así
 * que el PDF y la pantalla no pueden contar cosas distintas.
 *
 * ── LA TIPOGRAFÍA, QUE SIEMPRE SE PREGUNTA ───────────────────────────────
 * Es Helvetica y no Onest. Onest solo existe en el proyecto como fuente web
 * (`@font-face` en `index.css`), y jsPDF necesita el TTF incrustado en base64:
 * son ~300 KB por grosor, cuatro grosores, y habría que añadir los ficheros al
 * repo. No compensa para un PDF. Lo que sí se respeta del design system es
 * todo lo demás: color, radios de 22 px, píldoras, etiquetas de sección y la
 * jerarquía.
 *
 * ── CÓMO SE MIDE ─────────────────────────────────────────────────────────
 * En milímetros, y SIEMPRE antes de pintar. Cada bloque sabe lo que va a
 * ocupar, `asegurar()` abre página nueva si no cabe, y el pie se escribe al
 * final de todo, cuando ya se sabe cuántas páginas hay. Así no queda nada
 * pisando el pie ni ninguna tabla cortada a mitad de fila.
 */

import type { InformeInput, VersionInforme } from './informe'
import { WEEKS_PER_YEAR, describeMix, fteFrom } from './contracts'
import { DAYS, SLOTS_PER_DAY, formatMin, slotStartMin } from './time'
import type { DayIndex, OpeningHours } from './types'

/* ── Paleta, calcada de los tokens de `src/index.css` ───────────────────── */
const BRAND = '#6C0FD8'
const BRAND_DARK = '#5A0CB5'
const BRAND_SECONDARY = '#8244C7'
const BRAND_LIGHT = '#F4ECFC'
const INK = '#111118'
const BODY = '#374151'
const MUTED = '#71717A'
const SOFT = '#A1A1AA'
const LINE = '#E4E4E7'
const LINE_SOFT = '#F0F0F2'
const SURFACE = '#F9F9FB'
const WHITE = '#FFFFFF'
const WARNING = '#B45309'
const SUCCESS = '#047857'

/** 22 px de radio (la firma visual de Shifty) en milímetros. */
const R_CARD = 5.8

const nf = new Intl.NumberFormat('es-ES')
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
/* `useGrouping` explícito: en es-ES un número de cuatro cifras NO se agrupa
   por defecto, así que "9625 €" salía al lado de "500.500 €" y parecía un
   error de la herramienta. Y el espacio fino que mete Intl antes del € se
   cambia por uno normal, que en Helvetica queda pegado al número. */
const eurFmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: true,
})
const eur = { format: (n: number) => eurFmt.format(n).replace(/[\u00a0\u202f]/g, ' ') }
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mezcla dos colores. Para los grises sobre morado del pie y de las bandas. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const c = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * El logo oficial, rasterizado en el navegador.
 *
 * jsPDF no dibuja SVG, así que se pinta el fichero de marca en un canvas a 4x
 * y entra como PNG. Tres detalles que costaron:
 * - El SVG de marca solo trae `viewBox`, sin `width` ni `height`. Un `<img>`
 *   sin tamaño intrínseco puede salir en blanco, así que se le inyectan.
 * - Se pinta sobre el color de la banda, no sobre transparente: el antialias
 *   del borde se funde con el fondo en vez de dejar un halo gris.
 * - Con un tope de tiempo. Si el fichero no está o el canvas falla (y en Node,
 *   donde no hay ni fetch de `/` ni canvas, falla siempre), se devuelve null y
 *   el informe sale con la palabra "shifty" escrita. Un informe sin logo es un
 *   problema menor; un informe que no se descarga es el problema de verdad.
 */
async function cargarLogoPng(
  bgHex: string,
): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    if (typeof document === 'undefined' || typeof fetch !== 'function') return null
    const svg = await Promise.race([
      fetch('/shifty-logo-white.svg').then((r) => (r.ok ? r.text() : null)),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ])
    if (!svg) return null

    const vb = /viewBox="([\d.\s-]+)"/.exec(svg)
    const [, , vw, vh] = vb ? vb[1].trim().split(/\s+/).map(Number) : [0, 0, 0, 0]
    if (!vw || !vh) return null
    const conTamano = svg.replace('<svg', `<svg width="${vw}" height="${vh}"`)

    const img = new Image()
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(conTamano)}`
    await Promise.race([
      new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('logo'))
        img.src = url
      }),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('lento')), 4000)),
    ])

    /* 480 px de ancho, y no "4x el viewBox".
       El SVG de marca mide 1080 px, así que a 4x salía un PNG de 4320x1957, y
       jsPDF mete el mapa de bits SIN COMPRIMIR: 25 MB de PDF para un logo que
       en el papel mide 24 mm. Con 480 px sobra resolución (son ~500 ppp a ese
       tamaño) y el fichero se queda en KB. */
    const anchoPx = 480
    const escala = anchoPx / vw
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vw * escala)
    canvas.height = Math.round(vh * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = bgHex
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), ratio: vw / vh }
  } catch {
    return null
  }
}

/** El horario de un día, dicho como lo diría una persona. */
function horarioDelDia(hours: OpeningHours | null, d: DayIndex): string {
  const bloques = hours?.[d] ?? []
  if (bloques.length === 0) return 'cerrado'
  return bloques.map((b) => `${formatMin(b.startMin)} - ${formatMin(b.endMin)}`).join('  +  ')
}

function horasDeLaSemana(hours: OpeningHours | null): number {
  if (!hours) return 0
  return hours.reduce(
    (t, dia) => t + dia.reduce((s, b) => s + (b.endMin - b.startMin) / 60, 0),
    0,
  )
}

export async function construirInforme(
  input: InformeInput,
  version: VersionInforme,
): Promise<void> {
  const mod = (await import('jspdf')) as unknown as Record<string, unknown>
  /* Interop a mano: según cómo se empaquete, `jspdf` expone la clase en
     `default`, en `jsPDF` o en `default.jsPDF`. Cogerla de un solo sitio
     funciona en el navegador y revienta con "jsPDF is not a constructor" en
     cuanto se prueba en Node, que es justo donde se mide el cuadre. */
  const Ctor = (mod.jsPDF ??
    (mod.default as Record<string, unknown> | undefined)?.jsPDF ??
    mod.default) as new (o: Record<string, unknown>) => import('jspdf').jsPDF
  const doc = new Ctor({ unit: 'mm', format: 'a4' })

  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 16
  const CW = W - M * 2
  const completo = version === 'completo'

  doc.setProperties({
    title: `Plan de plantilla · ${input.plan.totalPeople} ${plural(input.plan.totalPeople, 'persona', 'personas')}`,
    subject: 'Informe del planificador de plantilla de Shifty',
    author: 'Shifty',
    creator: 'shifty.es',
  })

  /* ── Utilidades de dibujo ─────────────────────────────────────────────── */

  const fill = (hex: string) => doc.setFillColor(...hexToRgb(hex))
  const ink = (hex: string) => doc.setTextColor(...hexToRgb(hex))
  const stroke = (hex: string) => doc.setDrawColor(...hexToRgb(hex))
  const font = (style: 'normal' | 'bold', size: number) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
  }
  const split = (text: string, width: number): string[] => doc.splitTextToSize(text, width)
  const write = (ls: string[], x: number, y: number, lh: number) =>
    ls.forEach((l, i) => doc.text(l, x, y + i * lh))
  /** Centra una línea en una caja de alto `h`. El 0,123 es media altura de caja. */
  const midline = (y: number, h: number, size: number) => y + h / 2 + size * 0.123

  /** La etiqueta de la casa: barrita, versalitas y tracking abierto. */
  const eyebrow = (text: string, x: number, y: number, bar: string, tint: string) => {
    fill(bar)
    doc.roundedRect(x, y - 3.15, 0.9, 4.1, 0.45, 0.45, 'F')
    font('bold', 7.2)
    ink(tint)
    doc.setCharSpace(0.32)
    doc.text(text.toUpperCase(), x + 2.9, y)
    doc.setCharSpace(0)
  }

  const pillWidth = (text: string, h: number, size: number): number => {
    font('bold', size)
    return doc.getTextWidth(text) + h * 1.15
  }

  const pill = (
    text: string,
    x: number,
    y: number,
    h: number,
    bg: string,
    tint: string,
    size: number,
  ) => {
    const w = pillWidth(text, h, size)
    fill(bg)
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F')
    ink(tint)
    doc.text(text, x + h * 0.575, midline(y, h, size))
  }

  /** Tarjeta de cifra: alto fijo y las tres líneas a la misma altura en todas. */
  const statCard = (
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
    hint: string,
  ) => {
    const h = 25
    fill(SURFACE)
    stroke(LINE_SOFT)
    doc.roundedRect(x, y, w, h, 3.2, 3.2, 'FD')
    font('bold', 6.6)
    ink(MUTED)
    doc.setCharSpace(0.26)
    doc.text(label.toUpperCase(), x + 4, y + 6.4)
    doc.setCharSpace(0)
    font('bold', 17)
    ink(BRAND)
    doc.text(value, x + 4, y + 15.4)
    font('normal', 6.9)
    ink(MUTED)
    write(split(hint, w - 8).slice(0, 2), x + 4, y + 20, 3.1)
    return h
  }

  const logo = await cargarLogoPng(BRAND)

  /** El logo, o la palabra, según haya salido la rasterización. */
  const marca = (x: number, y: number, alto: number) => {
    if (logo) {
      /* Con alias y compresión: el alias hace que las cabeceras de las siete
         páginas del informe largo compartan UNA sola copia del logo, y la
         compresión deflata el mapa de bits, que jsPDF guardaría en crudo. */
      doc.addImage(logo.dataUrl, 'PNG', x, y, alto * logo.ratio, alto, 'shifty-logo', 'FAST')
      return alto * logo.ratio
    }
    font('bold', alto * 2.35)
    ink(WHITE)
    doc.text('shifty', x, y + alto * 0.82)
    return doc.getTextWidth('shifty')
  }

  const fecha = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  /* ── Cabeceras ────────────────────────────────────────────────────────── */

  /** La banda de portada: logo grande, de qué va esto, y la fecha. */
  const cabeceraPortada = (): number => {
    const h = 34
    fill(BRAND)
    doc.rect(0, 0, W, h, 'F')
    marca(M, 10, 8)
    font('normal', 8.6)
    ink(mix(BRAND, WHITE, 0.78))
    doc.text('Planificador de plantilla · informe gratuito', M, 26.4)
    font('bold', 8.6)
    ink(WHITE)
    doc.text('shifty.es', W - M, 19.4, { align: 'right' })
    font('normal', 8.6)
    ink(mix(BRAND, WHITE, 0.78))
    doc.text(fecha, W - M, 26.4, { align: 'right' })
    fill(BRAND_SECONDARY)
    doc.rect(0, h, W, 1.2, 'F')
    return h + 1.2
  }

  /** La de las páginas de dentro: fina, con la marca y la sección. */
  const cabeceraPagina = (seccion: string): number => {
    const h = 16
    fill(BRAND)
    doc.rect(0, 0, W, h, 'F')
    marca(M, 5, 5.4)
    font('bold', 8)
    ink(WHITE)
    doc.text(seccion, W - M, 10.6, { align: 'right' })
    return h + 5
  }

  /* ── Páginas ──────────────────────────────────────────────────────────── */

  let seccionActual = 'Tu plan de plantilla'
  let y = cabeceraPortada() + 12

  /** Abre página nueva con su cabecera y devuelve la `y` de arranque. */
  const nuevaPagina = (seccion = seccionActual): number => {
    doc.addPage()
    seccionActual = seccion
    return cabeceraPagina(seccion) + 4
  }

  /** Alto útil: por debajo de esto ya es el pie. */
  const fondo = () => H - 16

  /** Si no caben `h` milímetros, página nueva. */
  const asegurar = (h: number) => {
    if (y + h > fondo()) y = nuevaPagina()
  }

  /**
   * Arranca una sección. Solo abre página nueva si de verdad no cabe un trozo
   * útil de ella: forzar una página por sección dejaba el horario solo en una
   * hoja con dos tercios en blanco.
   */
  const seccion = (nombre: string, altoMinimo: number) => {
    if (y + altoMinimo > fondo()) y = nuevaPagina(nombre)
    else seccionActual = nombre
  }

  /** Título de sección dentro de una página. */
  const titulo = (eye: string, texto: string, pista?: string) => {
    asegurar(pista ? 22 : 17)
    eyebrow(eye, M, y, BRAND, BRAND)
    font('bold', 14)
    ink(INK)
    doc.setCharSpace(-0.2)
    doc.text(texto, M, y + 9)
    doc.setCharSpace(0)
    y += 12
    if (pista) {
      font('normal', 8.6)
      ink(MUTED)
      const ls = split(pista, CW)
      write(ls, M, y + 2.2, 4)
      y += ls.length * 4 + 1.5
    }
    y += 3
  }

  /* ── Tablas ───────────────────────────────────────────────────────────── */

  type Col = { ancho: number; titulo: string; derecha?: boolean }

  /**
   * Tabla con cabecera que se repite al pasar de página y filas que no se
   * parten nunca por la mitad. Es lo que hace que el informe largo no salga
   * descuadrado: la fila se mide antes de escribirla y, si no cabe, se lleva
   * entera a la página siguiente con su cabecera.
   */
  const tabla = (cols: Col[], filas: string[][], opciones?: { size?: number }) => {
    const size = opciones?.size ?? 7.6
    const filaH = size * 0.48 + 3.6
    const cabH = 7

    const pintarCabecera = () => {
      fill(BRAND_LIGHT)
      doc.roundedRect(M, y, CW, cabH, 1.6, 1.6, 'F')
      font('bold', size - 1.1)
      ink(BRAND_DARK)
      let x = M + 3
      cols.forEach((c) => {
        doc.text(c.titulo.toUpperCase(), c.derecha ? x + c.ancho - 3 : x, y + 4.8, {
          align: c.derecha ? 'right' : 'left',
        })
        x += c.ancho
      })
      y += cabH + 1.2
    }

    asegurar(cabH + filaH * 2)
    pintarCabecera()

    filas.forEach((fila, i) => {
      if (y + filaH > fondo()) {
        y = nuevaPagina()
        pintarCabecera()
      }
      if (i % 2 === 1) {
        fill(SURFACE)
        doc.rect(M, y - 0.4, CW, filaH, 'F')
      }
      font('normal', size)
      let x = M + 3
      cols.forEach((c, j) => {
        const valor = fila[j] ?? ''
        ink(j === 0 ? INK : BODY)
        if (j === 0) font('bold', size)
        else font('normal', size)
        doc.text(
          split(valor, c.ancho - 4)[0] ?? '',
          c.derecha ? x + c.ancho - 3 : x,
          y + filaH * 0.66,
          { align: c.derecha ? 'right' : 'left' },
        )
        x += c.ancho
      })
      y += filaH
    })
    stroke(LINE_SOFT)
    doc.line(M, y + 0.6, W - M, y + 0.6)
    y += 5
  }

  /* ── Bloques de la portada ────────────────────────────────────────────── */

  const { plan, roster, model, settings, peaks, cost, metricas } = input
  const roleName = new Map(model.roles.map((r) => [r.id, r.name]))
  const nombreDe = (id: string, label: string) =>
    (input.personNames[id] ?? '').trim() || label
  /* El reparto de contratos y las jornadas equivalentes salen de los MISMOS
     helpers que la pantalla (`describeMix` y `fteFrom`). Calcularlos aquí otra
     vez es como el PDF y la pantalla acaban diciendo cifras distintas de lo
     mismo sin que nadie lo note. */
  const mix40 = describeMix(plan.allocations, settings.contracts)
  const fte = fteFrom(plan)
  const totalWeeks = input.weeks.length
  const picoRol = [...plan.drivers.peakByRole].sort((a, b) => b.peak - a.peak)[0]

  // Titular. OJO: `eyebrow` cambia fuente y tamaño por dentro, así que el
  // titular se configura DESPUÉS de pintarla o sale con 7,2 pt y el tracking
  // del titular, que es lo que lo dejaba ilegible.
  eyebrow('Tu plan de plantilla', M, y, BRAND, BRAND)
  y += 11
  font('bold', 27)
  ink(INK)
  doc.setCharSpace(-0.55)
  doc.text(
    `${plan.totalPeople} ${plural(plan.totalPeople, 'persona', 'personas')} en plantilla fija`,
    M,
    y,
  )
  doc.setCharSpace(0)
  y += 8
  font('normal', 10.5)
  ink(MUTED)
  const linea =
    peaks.peakWeeks.length > 0
      ? `Cubre ${input.weeksCovered} de ${totalWeeks} ${plural(totalWeeks, 'semana', 'semanas')} del histórico. Quedan ${peaks.peakWeeks.length} ${plural(peaks.peakWeeks.length, 'semana que necesita', 'semanas que necesitan')} refuerzo puntual.`
      : `Cubre las ${totalWeeks} ${plural(totalWeeks, 'semana', 'semanas')} del histórico sin refuerzos.`
  write(split(linea, CW), M, y, 5)
  y += split(linea, CW).length * 5 + 7

  // Las cuatro cifras
  const anchoStat = (CW - 3 * 3.5) / 4
  const stats: [string, string, string][] = [
    ['Personas', String(plan.totalPeople), mix40 || 'En plantilla fija'],
    ['Jornadas equiv.', nf1.format(fte), 'Sobre jornada de 40 h'],
    [
      'Horas contratadas',
      `${nf1.format(plan.contractedHours)} h`,
      `El servicio necesita ${nf1.format(plan.neededHours)} h`,
    ],
    [
      'Cobertura',
      `${input.coveragePct}%`,
      `${input.weeksCovered} de ${totalWeeks} semanas`,
    ],
  ]
  stats.forEach(([l, v, h], i) => statCard(M + i * (anchoStat + 3.5), y, anchoStat, l, v, h))
  y += 25 + 8

  // De dónde sale el número
  const explic = `Por horas bastarían ${nf1.format(plan.drivers.fteFromHours)} ${plural(plan.drivers.fteFromHours, 'jornada completa', 'jornadas completas')}. Son ${plan.totalPeople} ${plural(plan.totalPeople, 'persona', 'personas')} porque manda el pico: el ${DAYS[input.needSummary.peak.day].toLowerCase()} a las ${formatMin(slotStartMin(input.needSummary.peak.slot))} necesitas ${input.needSummary.peak.people} a la vez${picoRol && picoRol.peak > 0 ? `, ${picoRol.peak} de ${roleName.get(picoRol.roleId) ?? ''}` : ''}. Y el calendario pone el resto: nadie trabaja los siete días, así que cubrir todos los turnos pide ${plan.drivers.peopleFromDays} ${plural(plan.drivers.peopleFromDays, 'persona', 'personas')}.`
  font('normal', 9)
  const explicLs = split(explic, CW - 12)
  const explicH = explicLs.length * 4.5 + 12
  asegurar(explicH + 4)
  fill(BRAND_LIGHT)
  doc.roundedRect(M, y, CW, explicH, R_CARD, R_CARD, 'F')
  eyebrow('De dónde sale el número', M + 6, y + 7.5, BRAND, BRAND_DARK)
  font('normal', 9)
  ink(BRAND_DARK)
  write(explicLs, M + 6, y + 14, 4.5)
  y += explicH + 8

  // Los picos, en morado
  const picoTitulo =
    peaks.peakWeeks.length > 0
      ? `${peaks.peakWeeks.length} ${plural(peaks.peakWeeks.length, 'semana necesita', 'semanas necesitan')} refuerzo`
      : 'Tu plantilla cubre incluso la semana más exigente'
  const picoCuerpo =
    peaks.peakWeeks.length > 0
      ? `${nf.format(peaks.peakHoursPerYear)} horas de refuerzo que tu plantilla fija no llega a cubrir. Contratar para el pico exige ${input.extraPeopleIfHired} ${plural(input.extraPeopleIfHired, 'persona más', 'personas más')} en nómina las ${WEEKS_PER_YEAR} semanas del año para cubrir solo ${peaks.peakWeeks.length} ${plural(peaks.peakWeeks.length, 'semana punta', 'semanas punta')}: pagas ${nf1.format(peaks.weeksPaidPerWeekWorked)} semanas de sueldo por cada semana en la que de verdad hacen falta.`
      : `Al ${input.coveragePct}% has dimensionado la plantilla para la semana más exigente y la mantienes durante las ${WEEKS_PER_YEAR} semanas del año. Bajar la línea permite comparar esa opción con cubrir los picos mediante refuerzos.`
  font('normal', 9)
  const picoLs = split(picoCuerpo, CW - 14)
  const dineroPico =
    cost && peaks.peakWeeks.length > 0
      ? `A tu coste medio de ${eur.format(cost.avgHourlyEur)} la hora: tenerlas fijas todo el año son ${eur.format(input.extraPeopleIfHired * 40 * WEEKS_PER_YEAR * cost.avgHourlyEur)}; pagar solo las horas que te faltan son ${eur.format(peaks.peakHoursPerYear * cost.avgHourlyEur)}.`
      : null
  const dineroLs = dineroPico ? split(dineroPico, CW - 14) : []
  const picoH = 16 + picoLs.length * 4.5 + (dineroLs.length ? dineroLs.length * 4.5 + 3 : 0) + 9
  asegurar(picoH + 4)
  fill(BRAND)
  doc.roundedRect(M, y, CW, picoH, R_CARD, R_CARD, 'F')
  eyebrow('Los picos', M + 7, y + 8.5, BRAND_SECONDARY, mix(BRAND, WHITE, 0.72))
  font('bold', 13)
  ink(WHITE)
  doc.setCharSpace(-0.2)
  write(split(picoTitulo, CW - 14), M + 7, y + 16.5, 6)
  doc.setCharSpace(0)
  let yy = y + 16.5 + split(picoTitulo, CW - 14).length * 6 + 1
  font('normal', 9)
  ink(mix(BRAND, WHITE, 0.88))
  write(picoLs, M + 7, yy, 4.5)
  yy += picoLs.length * 4.5
  if (dineroLs.length) {
    font('bold', 9)
    ink(WHITE)
    write(dineroLs, M + 7, yy + 3.5, 4.5)
    yy += dineroLs.length * 4.5 + 3.5
  }
  y = Math.max(y + picoH, yy) + 8

  // El dinero, solo si hay precios en el catálogo
  if (cost) {
    const ratio =
      input.ratioPersonal !== null
        ? ` Eso es el ${input.ratioPersonal}% de lo que facturas${input.weeklySalesEur ? ` (${eur.format(input.weeklySalesEur)} a la semana)` : ''}.`
        : ''
    const dineroTexto = `Esta plantilla cuesta ${eur.format(cost.weeklyEur)} a la semana y ${eur.format(cost.annualEur)} al año, con los precios por hora que has puesto en tu catálogo de puestos.${ratio}${cost.complete ? '' : ` Faltan los de ${cost.missing.join(', ')}, así que la cifra se queda corta.`}`
    font('normal', 9)
    const dl = split(dineroTexto, CW - 12)
    const dh = dl.length * 4.5 + 12
    asegurar(dh + 4)
    fill(SURFACE)
    stroke(LINE)
    doc.roundedRect(M, y, CW, dh, R_CARD, R_CARD, 'FD')
    eyebrow('Lo que cuesta', M + 6, y + 7.5, BRAND, MUTED)
    font('normal', 9)
    ink(BODY)
    write(dl, M + 6, y + 14, 4.5)
    y += dh + 8
  }

  /* ── El informe completo: el detalle ──────────────────────────────────── */

  if (completo) {
    // 1. Contratos, persona a persona
    y = nuevaPagina('Tu plantilla')
    titulo(
      'Tu plantilla',
      'Quién entra en nómina',
      'Cada persona con su contrato, las horas que le pone el cuadrante y sus días de libranza. Los puestos de solo jornada completa no bajan a un contrato parcial aunque les sobren horas.',
    )
    const gentePorZona = model.blocks
      .map((b) => ({
        zona: b.name,
        gente: roster.people.filter(
          (per) => model.roles.find((r) => r.id === per.roleId)?.blockId === b.id,
        ),
      }))
      .filter((z) => z.gente.length > 0)

    gentePorZona.forEach((z) => {
      asegurar(14)
      eyebrow(z.zona, M, y + 3, BRAND_SECONDARY, MUTED)
      y += 7
      tabla(
        [
          { ancho: 52, titulo: 'Persona' },
          { ancho: 44, titulo: 'Puesto' },
          { ancho: 26, titulo: 'Contrato', derecha: true },
          { ancho: 26, titulo: 'En turnos', derecha: true },
          { ancho: CW - 148, titulo: 'Libra' },
        ],
        z.gente.map((per) => {
          const rol = model.roles.find((r) => r.id === per.roleId)
          return [
            nombreDe(per.id, per.label),
            rol?.name ?? '—',
            `${per.contractHours} h${rol?.fullTimeOnly ? ' (fija)' : ''}`,
            `${nf1.format(per.assignedHours)} h`,
            /* Con cuatro días o más la lista no cabe en la columna y salía
               cortada con la coma colgando ("Lun, Mar, Mié, Vie,"). Ahí se
               cuenta, que es lo que se quiere saber. */
            per.daysOff.length === 7
              ? 'todos'
              : per.daysOff.length >= 4
                ? `${per.daysOff.length} días`
                : per.daysOff.map((d) => DAYS[d].slice(0, 3)).join(', ') || 'ningún día',
          ]
        }),
      )
    })

    // 2. El cuadrante de la semana
    y = nuevaPagina('El cuadrante')
    titulo(
      'El cuadrante',
      'La semana, persona a persona',
      'El turno de cada uno, día a día. Es el cuadrante que sale del cálculo: si cambias un nombre o una franja en la herramienta, vuelve a bajarte el informe.',
    )
    const anchoNombre = 40
    const anchoDia = (CW - anchoNombre) / 7
    const cuadranteCabecera = () => {
      fill(BRAND_LIGHT)
      doc.roundedRect(M, y, CW, 7, 1.6, 1.6, 'F')
      font('bold', 6.5)
      ink(BRAND_DARK)
      doc.text('PERSONA', M + 3, y + 4.7)
      DAYS.forEach((d, i) => {
        doc.text(
          d.toUpperCase(),
          M + anchoNombre + i * anchoDia + anchoDia / 2,
          y + 4.7,
          { align: 'center' },
        )
      })
      y += 8.2
    }
    asegurar(30)
    cuadranteCabecera()
    roster.people.forEach((per, i) => {
      const turnos = roster.shifts.filter((s) => s.personId === per.id)
      const maxBloques = Math.max(1, ...turnos.map((s) => s.blocks.length))
      const filaH = 4.6 + (maxBloques - 1) * 3.2
      if (y + filaH > fondo()) {
        y = nuevaPagina('El cuadrante')
        cuadranteCabecera()
      }
      if (i % 2 === 1) {
        fill(SURFACE)
        doc.rect(M, y - 0.6, CW, filaH + 0.6, 'F')
      }
      font('bold', 6.8)
      ink(INK)
      doc.text(split(nombreDe(per.id, per.label), anchoNombre - 5)[0], M + 3, y + 3)
      font('normal', 5.6)
      ink(MUTED)
      doc.text(
        `${model.roles.find((r) => r.id === per.roleId)?.name ?? ''} · ${per.contractHours} h`,
        M + 3,
        y + 3 + 2.9,
      )
      DAYS.forEach((_, d) => {
        const t = turnos.find((s) => s.day === d)
        const cx = M + anchoNombre + d * anchoDia + anchoDia / 2
        if (!t) {
          font('normal', 6)
          ink(SOFT)
          doc.text('libra', cx, y + 3, { align: 'center' })
          return
        }
        font('bold', 5.9)
        ink(BRAND_DARK)
        t.blocks.forEach((b, k) => {
          doc.text(
            `${formatMin(b.startMin)}-${formatMin(b.endMin)}`,
            cx,
            y + 3 + k * 3.2,
            { align: 'center' },
          )
        })
      })
      y += filaH + 1.2
    })
    y += 3
    if (roster.uncoveredHours > 0) {
      font('bold', 8.2)
      ink(WARNING)
      const av = split(
        `Quedan ${nf1.format(roster.uncoveredHours)} h a la semana sin nadie que las cubra: no caben en ninguna de las jornadas que tienes activadas.`,
        CW,
      )
      asegurar(av.length * 4 + 4)
      write(av, M, y, 4)
      y += av.length * 4 + 4
    }

    // 3. El horario del local
    seccion('El horario', 78)
    titulo(
      'El horario',
      'Cuándo está en marcha el local',
      'El horario de apertura con el que se ha calculado. Fuera de él no se pide plantilla.',
    )
    tabla(
      [
        { ancho: 34, titulo: 'Día' },
        { ancho: CW - 34 - 26, titulo: 'Abierto' },
        { ancho: 26, titulo: 'Horas', derecha: true },
      ],
      DAYS.map((d, i) => {
        const bloques = input.hours?.[i as DayIndex] ?? []
        const horas = bloques.reduce((s, b) => s + (b.endMin - b.startMin) / 60, 0)
        return [d, horarioDelDia(input.hours, i as DayIndex), horas > 0 ? `${nf1.format(horas)} h` : '—']
      }),
    )
    font('bold', 8.6)
    ink(INK)
    doc.text(`Apertura semanal: ${nf1.format(horasDeLaSemana(input.hours))} h`, M, y)
    y += 7
    if (input.kitchenHours) {
      titulo('Cocina', 'La cocina tiene su propio horario', undefined)
      tabla(
        [
          { ancho: 34, titulo: 'Día' },
          { ancho: CW - 34, titulo: 'Cocina en marcha' },
        ],
        DAYS.map((d, i) => [d, horarioDelDia(input.kitchenHours, i as DayIndex)]),
      )
    }
    if ((settings.prepBeforeMin ?? 0) > 0 || (settings.prepAfterMin ?? 0) > 0) {
      font('normal', 8.6)
      ink(MUTED)
      const prep = split(
        `Además se cuentan ${settings.prepBeforeMin ?? 0} min de montaje antes de abrir y ${settings.prepAfterMin ?? 0} min de cierre después, para el mínimo de personal de apertura.`,
        CW,
      )
      asegurar(prep.length * 4 + 4)
      write(prep, M, y, 4)
      y += prep.length * 4 + 4
    }

    // 4. La demanda de la semana tipo
    seccion('La demanda', 95)
    titulo(
      'La demanda',
      'Tu semana tipo, hora a hora',
      `Comensales de la semana con la que se dimensiona la plantilla, que recoge la actividad del ${input.coveragePct}% de las semanas del histórico. Cada casilla es el máximo de las dos medias horas, ya corregido el desfase del cobro.`,
    )
    /* Solo las horas en las que pasa algo: las 24 no caben y, en un
       restaurante de menú, veinte de ellas están siempre a cero. */
    const porHora: number[][] = DAYS.map((_, d) => {
      const fila: number[] = []
      for (let h = 0; h < SLOTS_PER_DAY / 2; h++) {
        const a = input.typical[d]?.[h * 2] ?? 0
        const b = input.typical[d]?.[h * 2 + 1] ?? 0
        fila.push(Math.max(a, b))
      }
      return fila
    })
    const horasConAlgo = porHora[0]
      .map((_, h) => h)
      .filter((h) => DAYS.some((_, d) => (porHora[d][h] ?? 0) > 0))
    const desde = horasConAlgo.length ? horasConAlgo[0] : 0
    const hasta = horasConAlgo.length ? horasConAlgo[horasConAlgo.length - 1] : 0
    const columnas = hasta - desde + 1
    const anchoHora = Math.min(11, (CW - 24) / Math.max(1, columnas))
    const anchoDiaCol = CW - anchoHora * columnas
    asegurar(10 + 7 * 5.2)
    font('bold', 6.2)
    ink(MUTED)
    for (let h = desde; h <= hasta; h++) {
      doc.text(
        formatMin(slotStartMin(h * 2)).slice(0, 2),
        M + anchoDiaCol + (h - desde) * anchoHora + anchoHora / 2,
        y,
        { align: 'center' },
      )
    }
    y += 2.5
    const maxComensales = Math.max(1, ...porHora.flat())
    DAYS.forEach((d, i) => {
      const filaH = 5.2
      font('bold', 6.8)
      ink(INK)
      doc.text(d, M + 2, y + 3.6)
      for (let h = desde; h <= hasta; h++) {
        const v = porHora[i][h] ?? 0
        const x = M + anchoDiaCol + (h - desde) * anchoHora
        if (v > 0) {
          fill(mix(WHITE, BRAND, Math.max(0.12, Math.min(1, v / maxComensales))))
          doc.rect(x + 0.3, y + 0.3, anchoHora - 0.6, filaH - 0.6, 'F')
          font('bold', 5.8)
          ink(v / maxComensales > 0.55 ? WHITE : BRAND_DARK)
          doc.text(String(v), x + anchoHora / 2, y + 3.6, { align: 'center' })
        } else {
          fill(LINE_SOFT)
          doc.rect(x + 0.3, y + 0.3, anchoHora - 0.6, filaH - 0.6, 'F')
        }
      }
      y += filaH
    })
    y += 6
    font('normal', 8.2)
    ink(MUTED)
    const totalAno = input.weeks.reduce((s, w) => s + w.total, 0)
    const resumenDemanda = split(
      `El histórico son ${totalWeeks} ${plural(totalWeeks, 'semana', 'semanas')} de ${input.year} con ${nf.format(totalAno)} comensales${input.fileName ? `, leídos de ${input.fileName}` : ''}. La semana más fuerte pide ${nf.format(Math.max(...input.weeks.map((w) => w.total)))} y la más floja ${nf.format(Math.min(...input.weeks.map((w) => w.total)))}.`,
      CW,
    )
    write(resumenDemanda, M, y, 4)
    y += resumenDemanda.length * 4 + 4

    // 5. La revisión del cuadrante
    seccion('La revisión', 70)
    titulo(
      'La revisión',
      'Lo que hay que mirar antes de firmarlo',
      'Descansos, libranzas y horas de contrato, revisados uno a uno sobre el cuadrante ya montado.',
    )
    if (input.avisos.length === 0) {
      font('bold', 9)
      ink(SUCCESS)
      const ok = split(
        `El cuadrante cumple: ${input.comprobaciones.map((c) => c.nombre).join(', ')}.`,
        CW,
      )
      write(ok, M, y, 4.4)
      y += ok.length * 4.4 + 5
    } else {
      input.avisos.forEach((a) => {
        font('normal', 8.4)
        const ls = split(a.mensaje, CW - 10)
        const h = ls.length * 4.2 + 6
        asegurar(h + 2)
        fill(a.gravedad === 'legal' ? '#FEF2F2' : '#FFFBEB')
        doc.roundedRect(M, y, CW, h, 2.4, 2.4, 'F')
        font('bold', 6.4)
        ink(a.gravedad === 'legal' ? '#B91C1C' : WARNING)
        doc.text(a.gravedad === 'legal' ? 'INCUMPLE' : 'AVISO', M + 4, y + 4.6)
        font('normal', 8.4)
        ink(BODY)
        write(ls, M + 22, y + 4.6, 4.2)
        y += h + 2.2
      })
      const fallan = new Set(input.avisos.map((a) => a.tipo))
      const cumplen = input.comprobaciones.filter((c) => !fallan.has(c.tipo))
      if (cumplen.length > 0) {
        font('normal', 8.4)
        ink(SUCCESS)
        const ls = split(`Lo demás está en regla: ${cumplen.map((c) => c.nombre).join(', ')}.`, CW)
        asegurar(ls.length * 4.2 + 4)
        write(ls, M, y + 3, 4.2)
        y += ls.length * 4.2 + 6
      }
    }

    // 6. Las métricas. Con su hueco mínimo: el título solo, al final de una
    // página y con las tarjetas en la siguiente, es un encabezado huérfano.
    seccion('Las métricas', 48)
    titulo('Las métricas', 'Cómo rinde este cuadrante')
    const anchoM = (CW - 2 * 3.5) / 3
    const metricasCards: [string, string, string][] = [
      [
        'Comensales por hora',
        metricas.comensalesPorHora !== null ? nf1.format(metricas.comensalesPorHora) : '—',
        'Por cada hora de trabajo que pagas',
      ],
      [
        'Horas de más',
        `${nf1.format(metricas.horasSobrantesTotal)} h`,
        `Sobre las ${nf1.format(metricas.horasEnTurnos)} h que la gente está en el local`,
      ],
      [
        'Findes',
        metricas.findes.length > 0
          ? `${metricas.findes[0].findesTrabajados} y ${metricas.findes[metricas.findes.length - 1].findesTrabajados}`
          : '—',
        metricas.desequilibrioFindes <= 1
          ? 'Repartido de forma pareja'
          : `${metricas.desequilibrioFindes} días de diferencia`,
      ],
    ]
    asegurar(29)
    metricasCards.forEach(([l, v, h], i) =>
      statCard(M + i * (anchoM + 3.5), y, anchoM, l, v, h),
    )
    y += 25 + 7
    if (metricas.peoresHolguras.length > 0) {
      font('bold', 8.6)
      ink(INK)
      asegurar(12 + metricas.peoresHolguras.length * 4.4)
      doc.text('Dónde sobra gente', M, y)
      y += 5
      font('normal', 8.2)
      metricas.peoresHolguras.forEach((h) => {
        ink(MUTED)
        doc.text(h.cuando, M, y + 3)
        ink(INK)
        doc.text(`${nf1.format(h.horasSobrantes)} h de más`, W - M, y + 3, { align: 'right' })
        y += 4.4
      })
      y += 4
      font('normal', 8)
      ink(MUTED)
      const aux = split(
        'Esas horas no son tiempo perdido: son las que puedes destinar a montaje, limpieza, pedidos, inventario o formar a alguien nuevo.',
        CW,
      )
      write(aux, M, y, 4)
      y += aux.length * 4 + 4
    }

    // 7. Con qué se ha calculado
    seccion('Los criterios', 60)
    titulo(
      'Los criterios',
      'Con qué se ha calculado',
      'Todo lo que ha entrado en el cálculo. Si algo no es como en tu casa, cámbialo en la herramienta y vuelve a bajarte el informe.',
    )
    const mitad = Math.ceil(input.criterios.length / 2)
    const colAncho = (CW - 8) / 2
    const arranque = y
    let bajo = y
    input.criterios.forEach((c, i) => {
      const col = i < mitad ? 0 : 1
      const yy = (i < mitad ? arranque + i * 7 : arranque + (i - mitad) * 7)
      const x = M + col * (colAncho + 8)
      font('normal', 8)
      ink(MUTED)
      doc.text(split(c.label, colAncho * 0.55)[0], x, yy + 4)
      font('bold', 8)
      ink(INK)
      doc.text(split(c.value, colAncho * 0.45)[0], x + colAncho, yy + 4, { align: 'right' })
      stroke(LINE_SOFT)
      doc.line(x, yy + 5.8, x + colAncho, yy + 5.8)
      bajo = Math.max(bajo, yy + 7)
    })
    y = bajo + 8
  }

  /* ── La banda de cierre, medida antes de pintar nada más ───────────────
     Copy de la skill `shifty-marca-y-copy`: el titular es el claim que la
     tabla de claims reserva para cobertura y cierres. Frases cortas, tuteando,
     con un verbo concreto en cada una, y cierre con acción. Y las dos rojas:
     Shifty NO es una ETT (las altas las gestiona una ETT colaboradora, que es
     la forma correcta de contarlo) y aquí no se promete ningún pago rápido.
     Nada de cifras de marketing: este informe lo lee alguien que acaba de ver
     sus propios números.

     Se mide aquí arriba porque de su alto depende si cabe el bloque de pasos. */

  const promoTexto =
    'Publicas el turno, recibes candidatos verificados con reseñas y eliges tú. Las altas las gestiona una ETT colaboradora. Sin cuota fija: pagas solo las horas que cubres.'
  const ctaTexto = 'Publica tu turno en shifty.es'
  const ctaAncho = pillWidth(ctaTexto, 10.5, 9.5)
  font('normal', 8.6)
  /* 24 mm de respiro contra la píldora: con 10 la tercera línea se metía
     debajo del botón, y un texto que pasa por detrás de un botón es lo
     primero que se ve mal en un PDF. */
  const promoLineas = split(promoTexto, CW - ctaAncho - 24)
  const bandaH = Math.max(34, 21 + promoLineas.length * 4.2 + 5)

  /* ── Cómo se cubre una semana punta ────────────────────────────────────
     Rellena el hueco que quedaba en la página del resumen cuando el plan es
     corto (sin picos, sin precios) y, de paso, contesta lo que un hostelero
     que no nos conoce se pregunta al llegar aquí: qué tiene que hacer él.
     Solo se pinta si cabe entera: media lista de pasos no explica nada. */

  const pasos: [string, string][] = [
    ['Publicas el turno', 'Día, horas y puesto. Dos minutos, y publicar no cuesta nada.'],
    ['Te llegan profesionales', 'Con sus turnos hechos y las reseñas de otras empresas.'],
    ['Eliges tú', 'Ves quién es cada uno antes de decir que sí, y repites con los que funcionan.'],
    ['El papeleo no lo tocas', 'El contrato y el alta los hace una ETT colaboradora. Tú recibes una factura.'],
  ]
  const pasoH = 21
  const pasosH = 9 + pasoH + 5
  if (y + pasosH + bandaH + 8 <= H - 12) {
    eyebrow('Cómo se cubre una semana punta', M, y + 3, BRAND, MUTED)
    y += 9
    const anchoPaso = (CW - 3 * 3.5) / 4
    pasos.forEach(([t, d], i) => {
      const x = M + i * (anchoPaso + 3.5)
      fill(BRAND_LIGHT)
      doc.roundedRect(x, y, anchoPaso, pasoH, 3.2, 3.2, 'F')
      font('bold', 7.4)
      ink(BRAND)
      doc.text(`${i + 1}`, x + 4, y + 6.2)
      font('bold', 7.4)
      ink(INK)
      doc.text(split(t, anchoPaso - 12)[0], x + 8.5, y + 6.2)
      font('normal', 6.2)
      ink(MUTED)
      write(split(d, anchoPaso - 8).slice(0, 3), x + 4, y + 11.4, 2.8)
    })
    y += pasoH + 5
  }

  /* Si en la última página no cabe la banda, se abre una más: una banda
     medio cortada por el borde del papel es peor que una página extra. */
  if (y + bandaH + 6 > H - 12) y = nuevaPagina()
  const bandaY = Math.max(y + 4, H - 12 - bandaH)

  fill(BRAND_DARK)
  doc.roundedRect(M, bandaY, CW, bandaH, R_CARD, R_CARD, 'F')
  pill(ctaTexto, W - M - ctaAncho - 8, bandaY + bandaH / 2 - 5.25, 10.5, WHITE, BRAND_DARK, 9.5)
  eyebrow('Los picos, cubiertos', M + 7, bandaY + 8, BRAND_SECONDARY, mix(BRAND_DARK, WHITE, 0.72))
  font('bold', 12.5)
  ink(WHITE)
  doc.setCharSpace(-0.18)
  doc.text('Nunca te quedes sin personal', M + 7, bandaY + 16)
  doc.setCharSpace(0)
  font('normal', 8.6)
  ink(mix(BRAND_DARK, WHITE, 0.86))
  write(promoLineas, M + 7, bandaY + 21.5, 4.2)

  /* ── El pie de todas las páginas, al final ─────────────────────────────
     Se escribe ahora porque hasta ahora no se sabía cuántas páginas hay, y un
     "Página 2 de 5" que diga otra cosa es peor que no ponerlo. */

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    stroke(LINE_SOFT)
    doc.line(M, H - 10, W - M, H - 10)
    font('normal', 6.8)
    ink(SOFT)
    doc.text(
      'Generado con el planificador gratuito de Shifty · shifty.es · el cálculo se hace en tu navegador, sin guardar ningún dato',
      M,
      H - 6,
    )
    if (paginas > 1) {
      font('bold', 6.8)
      ink(MUTED)
      doc.text(`Página ${i} de ${paginas}`, W - M, H - 6, { align: 'right' })
    }
  }

  doc.save(completo ? 'shifty-plantilla-informe-completo.pdf' : 'shifty-plantilla-resumen.pdf')
}
