// planning-auth-email
//
// El correo con el codigo de acceso del planificador. Lo llama Supabase Auth
// por su "Send Email Hook" cada vez que alguien pide entrar, y lo manda por la
// API de Brevo con la identidad de Shifty.
//
// POR QUE EXISTE
// Sin esta funcion el correo sale por el servidor de cortesia de Supabase, que
// tiene un limite de unos pocos envios por hora para TODO el proyecto y sale
// desde un dominio que no es el nuestro. Un codigo que no llega, o que llega
// tarde y a la carpeta de spam, es lo mismo que no poder entrar: la persona ya
// tiene su plan calculado en pantalla y lo que quiere es no perderlo.
//
// QUE NO HACE
// No manda el enlace magico, solo el codigo. El planificador entra con
// verifyOtp (src/lib/backend.ts, comprobarCodigo) y con el codigo escrito a
// mano, asi que un boton de "entrar" en el correo llevaria a una URL que
// depende del Site URL del proyecto y que aqui no controla nadie. Menos piezas,
// menos formas de que falle.
//
// QUIEN LA LLAMA, Y POR QUE SE COMPRUEBA LA FIRMA
// Es un endpoint PUBLICO: va con verify_jwt apagado porque quien llama es el
// servidor de Auth, que no trae sesion de nadie. Sin comprobar la firma,
// cualquiera que descubra la direccion puede mandar correos con la marca de
// Shifty y el texto que quiera. Por eso, si la firma no cuadra, aqui no se
// manda nada: 401 y a otra cosa. Falla cerrado tambien cuando falta el secreto,
// que es el error facil de cometer al desplegar.
//
// EL CONTRATO DEL HOOK
// Entrada y salida son las de Supabase, no nuestras:
//   https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
// Un 200 con `{}` significa "enviado". Cualquier otra cosa es un fallo y Auth
// se lo cuenta al cliente. Solo reintenta con 429 y 503 (hasta 3 veces, con 2
// segundos de espera), asi que abajo se devuelve uno u otro a proposito segun
// tenga sentido volver a intentarlo o no.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// ─── Constantes ───────────────────────────────────────────────────────────

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

/**
 * El remitente TIENE que estar validado en Brevo, o como direccion suelta o por
 * dominio autenticado. Si no lo esta, Brevo rechaza el envio o reescribe el
 * dominio, que es peor: el correo sale pero desde un dominio que no es el
 * nuestro y va derecho a spam.
 *
 * Se puede cambiar sin tocar el codigo con el secreto PLANNING_EMAIL_FROM, para
 * que mover el remitente no obligue a volver a desplegar.
 */
const REMITENTE_EMAIL = Deno.env.get('PLANNING_EMAIL_FROM') || 'soporte@shifty.es'
const REMITENTE_NOMBRE = 'Shifty'

/** Morado de marca. Es el mismo `--color-brand` de src/index.css. */
const MARCA = '#6C0FD8'
const MARCA_SUAVE = '#F4ECFC'

/**
 * Lo que dura el codigo, solo para escribirlo en el correo. NO lo decide esta
 * funcion: lo decide Auth → Sign In / Providers → Email → "Email OTP
 * expiration", que por defecto son 3.600 segundos. El hook no recibe ese dato,
 * asi que esto es una copia a mano: si alguien cambia el ajuste del panel, hay
 * que cambiar tambien esta linea o el correo estara mintiendo.
 */
const CADUCIDAD_TEXTO = 'una hora'

/**
 * El cuerpo del hook son unos 2 KB. 64 KB es un techo generoso que solo corta
 * lo que no puede ser una peticion de verdad, y se mira ANTES de parsear.
 */
const MAX_BYTES_CUERPO = 64 * 1024

/** Ventana de la marca de tiempo, la misma que usan las librerias de Standard Webhooks. */
const TOLERANCIA_SEG = 5 * 60

/**
 * El hook entero tiene 5 segundos antes de que Auth se canse. Si Brevo tarda
 * mas que esto, preferimos cortar nosotros y devolver 503, que Auth reintenta,
 * antes de que nos corte Auth y no quede ni rastro de por que.
 */
const TIMEOUT_BREVO_MS = 4000

/**
 * Los unicos tipos que sabe mandar el planificador. `signup` es la primera vez,
 * `magiclink` es entrar con una cuenta que ya existe y `email` es la variante
 * de OTP por correo. Los tres salen del mismo signInWithOtp de
 * src/lib/backend.ts y a la persona le da igual cual sea: recibe su codigo.
 *
 * Todo lo demas (recovery, invite, email_change, reauthentication, los avisos)
 * son flujos que esta herramienta no tiene. Si aparece uno es que alguien ha
 * encendido algo en el panel, y mandar un correo de "tu codigo" en su lugar
 * seria un correo raro con la marca de Shifty. Se responde con error y se grita
 * en el log.
 */
const TIPOS_SOPORTADOS = new Set(['signup', 'magiclink', 'email'])

/** Tipografia de sistema: en un correo no hay webfont que valga. */
const FUENTE =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

// ─── Respuestas ───────────────────────────────────────────────────────────

/** Lo que Supabase entiende por "enviado": 200 y un objeto vacio. */
function ok(): Response {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * La forma del error la fija Supabase: `{ error: { http_code, message } }`.
 * El `message` puede acabar delante del usuario, asi que va en castellano y sin
 * detalle interno. El detalle va al log con la misma traza.
 */
function fallo(status: number, mensaje: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message: mensaje } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Firma del webhook ────────────────────────────────────────────────────

class FirmaInvalida extends Error {}

/**
 * Se comprueba a mano con Web Crypto en vez de importar la libreria de Standard
 * Webhooks que sale en la documentacion.
 *
 * Motivo: son veinte lineas, se despliega pegando UN fichero en el panel y no
 * depende de que un CDN de terceros conteste el dia que haya que desplegar. A
 * cambio, la responsabilidad de que este bien es nuestra, asi que se ha cruzado
 * contra la libreria de referencia firmando con ella y verificando con esto
 * (esta contado en el README, apartado "Lo que si esta comprobado").
 *
 * El algoritmo es el de la especificacion: se firma `id.timestamp.cuerpo` con
 * HMAC-SHA256 y la clave en binario, y el resultado en base64 tiene que estar
 * entre las firmas que trae la cabecera.
 */
async function verificarFirma(cuerpo: string, req: Request, secretoBruto: string): Promise<void> {
  const id = req.headers.get('webhook-id')
  const ts = req.headers.get('webhook-timestamp')
  const firmas = req.headers.get('webhook-signature')
  if (!id || !ts || !firmas) throw new FirmaInvalida('faltan cabeceras de firma')

  // La marca de tiempo acota los reenvios: sin esto, alguien que capture una
  // peticion valida puede repetirla para siempre.
  const segundos = Number(ts)
  if (!Number.isFinite(segundos)) throw new FirmaInvalida('marca de tiempo ilegible')
  const ahora = Math.floor(Date.now() / 1000)
  if (Math.abs(ahora - segundos) > TOLERANCIA_SEG) throw new FirmaInvalida('marca de tiempo fuera de ventana')

  // El secreto llega como `v1,whsec_<base64>`. La documentacion habla de poder
  // tener varios separados por barra vertical para poder rotarlos, y no fija el
  // sitio exacto del prefijo en ese caso, asi que cada trozo se limpia por su
  // cuenta: asi vale tanto si el prefijo esta una vez como si esta en cada uno.
  const secretos = secretoBruto
    .split('|')
    .map((s) => s.trim().replace(/^v1,/, '').replace(/^whsec_/, ''))
    .filter((s) => s.length > 0)
  if (secretos.length === 0) throw new FirmaInvalida('el secreto del hook esta vacio')

  const firmado = new TextEncoder().encode(`${id}.${segundos}.${cuerpo}`)
  const traidas = firmas.split(' ')

  for (const secreto of secretos) {
    let clave: CryptoKey
    try {
      clave = await crypto.subtle.importKey(
        'raw',
        base64ABuffer(secreto),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
    } catch {
      // Un secreto mal copiado del panel (base64 roto) no puede saltarse la
      // comprobacion: se ignora ese y, si no queda ninguno bueno, se cae abajo.
      continue
    }
    const esperada = bytesABase64(new Uint8Array(await crypto.subtle.sign('HMAC', clave, firmado)))

    for (const entrada of traidas) {
      const coma = entrada.indexOf(',')
      if (coma < 0) continue
      // Solo v1. Una version que no conocemos no se acepta "por si acaso".
      if (entrada.slice(0, coma) !== 'v1') continue
      if (igualEnTiempoConstante(entrada.slice(coma + 1), esperada)) return
    }
  }

  throw new FirmaInvalida('ninguna firma cuadra')
}

/**
 * Devuelve un ArrayBuffer y no un Uint8Array a proposito: importKey pide un
 * BufferSource, y segun la version de TypeScript un Uint8Array puede venir con
 * un buffer generico que ahi no encaja. Con el ArrayBuffer pelado no depende de
 * la version.
 */
function base64ABuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buffer = new ArrayBuffer(bin.length)
  const vista = new Uint8Array(buffer)
  for (let i = 0; i < bin.length; i++) vista[i] = bin.charCodeAt(i)
  return buffer
}

function bytesABase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * Comparar firmas con `===` filtra informacion por el tiempo que tarda en
 * fallar, y con eso se puede ir adivinando la firma buena caracter a caracter.
 * La especificacion lo pide expresamente, asi que se recorre siempre entero.
 */
function igualEnTiempoConstante(a: string, b: string): boolean {
  const largo = Math.max(a.length, b.length)
  let acumulado = a.length ^ b.length
  for (let i = 0; i < largo; i++) {
    acumulado |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return acumulado === 0
}

// ─── El correo ────────────────────────────────────────────────────────────

/**
 * HTML a proposito simple: tablas, estilos en linea y ni una imagen.
 *
 * Gmail se come las hojas de estilo en algunos casos y Apple Mail y Outlook
 * tratan los margenes a su manera, asi que todo lo que tiene que verse va
 * escrito en el propio elemento. Sin imagenes externas, ademas, el correo se ve
 * entero aunque el cliente bloquee la carga remota, que es lo normal, y no hay
 * ningun pixel que cuente quien lo abre.
 */
function cuerpoHtml(codigo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- El correo esta pintado en claro. Sin esto, el modo oscuro de Apple Mail
     invierte los colores por su cuenta y el morado sobre morado no se lee. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Tu codigo</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;">
<!-- Lo primero que se ve en la vista previa de la bandeja, debajo del asunto. -->
<div style="display:none;font-size:1px;color:#F4F4F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Caduca en ${CADUCIDAD_TEXTO}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F4F5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;">
<tr><td style="height:4px;background:${MARCA};border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 0;font-family:${FUENTE};">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MARCA};">Shifty</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#111118;">Tu c&oacute;digo para entrar</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151;">Escr&iacute;belo en el planificador y tu plantilla queda guardada. Vuelves a ella cuando quieras.</p>
</td></tr>
<tr><td style="padding:0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:${MARCA_SUAVE};border-radius:10px;padding:18px 12px;font-family:${FUENTE};font-size:34px;font-weight:700;color:${MARCA};letter-spacing:0.2em;text-indent:0.2em;">${codigo}</td></tr>
</table>
</td></tr>
<tr><td style="padding:18px 28px 24px;font-family:${FUENTE};">
<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#374151;">Caduca en ${CADUCIDAD_TEXTO} y solo sirve una vez. Si se te pasa, pide otro desde la misma pantalla.</p>
<p style="margin:0;font-size:13px;line-height:1.55;color:#71717A;">Si no has pedido ning&uacute;n c&oacute;digo, ignora este correo. Sin &eacute;l no se entra.</p>
</td></tr>
<tr><td style="border-top:1px solid #E4E4E7;padding:16px 28px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#8E8E96;">Shifty &middot; Planificador de plantilla</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/**
 * La version en texto plano no es un adorno: hay clientes que la prefieren, y un
 * correo con las dos partes se lee menos como spam que uno solo en HTML.
 */
function cuerpoTexto(codigo: string): string {
  return [
    'Tu código para entrar en el planificador de Shifty:',
    '',
    codigo,
    '',
    'Escríbelo en el planificador y tu plantilla queda guardada.',
    `Caduca en ${CADUCIDAD_TEXTO} y solo sirve una vez.`,
    '',
    'Si no has pedido ningún código, ignora este correo. Sin él no se entra.',
    '',
    'Shifty · Planificador de plantilla',
  ].join('\n')
}

interface ResultadoBrevo {
  ok: boolean
  /** Status HTTP de Brevo, o 0 si la llamada ni llego a contestar. */
  status: number
  /** Id del envio cuando sale bien. Es lo que se busca luego en los logs de Brevo. */
  messageId?: string
  /** Para el log, nunca para el usuario. */
  detalle?: string
}

async function mandarPorBrevo(
  destino: string,
  asunto: string,
  codigo: string,
  clave: string,
): Promise<ResultadoBrevo> {
  let r: Response
  try {
    r = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': clave,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: REMITENTE_EMAIL, name: REMITENTE_NOMBRE },
        to: [{ email: destino }],
        // Contestar a un codigo de acceso no tiene sentido, pero si alguien lo
        // hace tiene que llegar a una persona y no rebotar.
        replyTo: { email: REMITENTE_EMAIL, name: REMITENTE_NOMBRE },
        subject: asunto,
        htmlContent: cuerpoHtml(codigo),
        textContent: cuerpoTexto(codigo),
        // Para poder separar estos envios del resto del correo de Shifty en el
        // panel de Brevo sin tener que mirar el asunto.
        tags: ['planning-codigo'],
      }),
      signal: AbortSignal.timeout(TIMEOUT_BREVO_MS),
    })
  } catch (e) {
    return { ok: false, status: 0, detalle: (e as Error).message }
  }

  if (r.ok) {
    let messageId: string | undefined
    try {
      const cuerpo = (await r.json()) as { messageId?: string }
      messageId = cuerpo?.messageId
    } catch {
      // Brevo devuelve 201 con un messageId. Que no se pueda leer no invalida el
      // envio: se ha aceptado, y lo unico que perdemos es el identificador.
    }
    return { ok: true, status: r.status, messageId }
  }

  // El cuerpo del error de Brevo es `{ code, message }` y ahi esta lo util:
  // remitente sin validar, clave mala, sin credito. Va al log entero.
  let detalle = ''
  try {
    detalle = (await r.text()).slice(0, 500)
  } catch {
    detalle = '(sin cuerpo)'
  }
  return { ok: false, status: r.status, detalle }
}

// ─── Servidor ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Sin CORS a proposito: esto no lo llama ningun navegador, lo llama el
  // servidor de Auth. Contestar a un preflight seria invitar a llamarlo desde
  // una pagina.
  const traza = crypto.randomUUID().slice(0, 8)

  if (req.method !== 'POST') {
    return fallo(405, 'Solo POST.')
  }

  const claveBrevo = Deno.env.get('BREVO_API_KEY') ?? ''
  const secretoHook = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? ''
  // Si falta el secreto NO se sigue sin comprobar la firma. Es el error facil al
  // desplegar, y dejarlo pasar convierte esto en un formulario de contacto
  // abierto con la marca de Shifty encima.
  if (!claveBrevo || !secretoHook) {
    console.error(`[${traza}] planning-auth-email: faltan secretos`, {
      brevo: !!claveBrevo,
      hook: !!secretoHook,
    })
    return fallo(500, 'No se ha podido mandar el correo.')
  }

  // Texto, no req.json(): la firma se calcula sobre los bytes EXACTOS que
  // llegaron. Parsear y volver a serializar cambiaria un espacio y ya no cuadra.
  let bruto: string
  try {
    bruto = await req.text()
  } catch {
    return fallo(400, 'No se ha podido leer la peticion.')
  }
  // Bytes y no caracteres: la constante dice bytes y en UTF-8 una eñe ocupa dos.
  const bytes = new TextEncoder().encode(bruto).length
  if (bytes > MAX_BYTES_CUERPO) {
    console.warn(`[${traza}] planning-auth-email: cuerpo de ${bytes} bytes, rechazado`)
    return fallo(413, 'La peticion es demasiado grande.')
  }

  try {
    await verificarFirma(bruto, req, secretoHook)
  } catch (e) {
    // Se registra el motivo porque distingue "el secreto del panel y el de la
    // funcion no son el mismo" de "alguien esta llamando por su cuenta", que se
    // arreglan de formas muy distintas. No se registra ni la firma esperada ni
    // el cuerpo.
    const motivo = e instanceof FirmaInvalida ? e.message : 'error al verificar'
    console.warn(`[${traza}] planning-auth-email: firma rechazada (${motivo})`)
    return fallo(401, 'Firma no valida.')
  }

  let carga: { user?: Record<string, unknown>; email_data?: Record<string, unknown> }
  try {
    carga = JSON.parse(bruto)
  } catch {
    console.error(`[${traza}] planning-auth-email: el cuerpo firmado no es un JSON`)
    return fallo(400, 'El cuerpo tiene que ser un JSON.')
  }

  const destino = typeof carga.user?.email === 'string' ? carga.user.email.trim() : ''
  const datos = carga.email_data ?? {}
  const tipo = typeof datos.email_action_type === 'string' ? datos.email_action_type : ''
  const codigo = typeof datos.token === 'string' ? datos.token.trim() : ''

  // Solo se registra el dominio del destinatario. Con eso se ve si el problema
  // es de un proveedor concreto (gmail, hotmail) sin dejar direcciones de gente
  // en un log que mira cualquiera con acceso al panel.
  const dominio = destino.includes('@') ? destino.split('@').pop() : '(sin dominio)'

  if (!TIPOS_SOPORTADOS.has(tipo)) {
    // No se manda un correo de "tu codigo" para un flujo que no es ese. Es un
    // 422 y no un 503 a proposito: reintentarlo daria exactamente lo mismo.
    console.error(
      `[${traza}] planning-auth-email: tipo "${tipo || '(vacio)'}" no soportado, no se manda nada`,
    )
    return fallo(422, 'Este tipo de correo no esta disponible en el planificador.')
  }

  if (!destino.includes('@')) {
    console.error(`[${traza}] planning-auth-email: el hook no trae correo de destino`)
    return fallo(422, 'No hay a quien mandar el correo.')
  }

  // El largo del codigo lo decide el ajuste de Auth, no nosotros: hoy son seis
  // digitos y por eso el modal habla de seis, pero se acepta lo que venga
  // mientras sean digitos. Lo que no se hace nunca es mandar un correo con el
  // hueco del codigo vacio, que es un correo inutil y alarmante.
  if (!/^\d{4,10}$/.test(codigo)) {
    console.error(`[${traza}] planning-auth-email: codigo con forma inesperada (${codigo.length} caracteres)`)
    return fallo(422, 'El codigo no tiene la forma esperada.')
  }

  // El codigo va el primero porque en el movil el asunto es lo unico que se ve
  // en la notificacion, y con eso muchas veces no hace falta ni abrir el correo.
  const asunto = `${codigo} es tu código para entrar en el planificador`

  const t0 = Date.now()
  const envio = await mandarPorBrevo(destino, asunto, codigo, claveBrevo)
  const ms = Date.now() - t0

  if (!envio.ok) {
    console.error(
      `[${traza}] planning-auth-email ${tipo}: Brevo fallo status=${envio.status} ${ms}ms ` +
        `dominio=${dominio} detalle=${envio.detalle}`,
    )
    // Se devuelve error SIEMPRE, nunca un 200. Un 200 aqui le diria a Auth que
    // el correo salio: la persona se quedaria esperando un codigo que no existe
    // y en el panel no habria ni un error que mirar.
    //
    // El codigo que se elige decide si Auth reintenta: solo lo hace con 429 y
    // 503. Se reintenta lo que puede salir bien a la segunda (Brevo saturado o
    // caido, o nuestro propio corte por tiempo) y no lo que no (clave mala,
    // remitente sin validar, sin credito), que se arregla en el panel de Brevo.
    if (envio.status === 429) return fallo(429, 'Demasiados correos seguidos. Prueba dentro de un momento.')
    if (envio.status === 0 || envio.status >= 500) {
      return fallo(503, 'No hemos podido mandar el correo. Prueba dentro de un momento.')
    }
    return fallo(500, 'No hemos podido mandar el correo.')
  }

  console.log(
    `[${traza}] planning-auth-email ${tipo} ok ${ms}ms dominio=${dominio} brevo=${envio.messageId ?? '(sin id)'}`,
  )

  return ok()
})
