/**
 * planning-seguir-luego · "Mándamelo para abrirlo en el ordenador"
 *
 * Quien abre el planificador en el móvil puede pedir que le llegue por correo
 * el enlace, con un resumen de lo que hace, para seguir en el ordenador
 * (2026-11-04, petición de Crescente).
 *
 * QUÉ RECIBE: { email, planToken? }. Nada más. El texto del correo es fijo y el
 * enlace lo monta esta función con la dirección del planificador: desde fuera
 * no se puede meter ni una palabra ni una dirección distinta, así que no sirve
 * para mandar correos de otro a nadie.
 *
 * DATOS PERSONALES (regla 17):
 *   - Qué lleva: el correo de quien lo pide.
 *   - Quién lo ve: nadie de Shifty. Esta función no lo guarda en ninguna tabla
 *     ni lo escribe en el log; solo lo pasa a Brevo para el envío.
 *   - Cuánto se guarda: aquí, nada. Brevo guarda su registro de envíos según su
 *     contrato, igual que con el código de acceso (planning-auth-email).
 *   - Baja: no hay nada nuestro que borrar.
 *
 * ENCENDIDO: nace APAGADA (regla 10: una función que avisa nace con el envío
 * apagado hasta el OK de Crescente con el texto delante). Solo manda si el
 * secreto PLANNING_SEGUIR_LUEGO_ACTIVO vale "1". Apagada, contesta
 * { ok: false, codigo: 'apagado' } y el front ofrece copiar el enlace.
 *
 * VOLUMEN: un tope diario global con planning_bump_counter, el mismo
 * cortacircuitos que crear planes. No es un límite por persona (no guardamos
 * nada con que contar por persona): acota el destrozo de un bucle.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.58.0'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const REMITENTE_EMAIL = Deno.env.get('PLANNING_EMAIL_FROM') || 'soporte@shifty.es'
const REMITENTE_NOMBRE = 'Shifty'
const BASE_URL = 'https://planificador.shifty.es'
const TOPE_DIARIO = 150
const TIMEOUT_BREVO_MS = 6000
const MAX_BYTES_CUERPO = 2 * 1024

/** Morado de los correos de Shifty y el logo Shifty Work en morado (siempre desde shifty.es: Gmail no pinta el de Supabase). */
const MORADO = '#3C1663'
const MORADO_SUAVE = '#F1ECF7'
const LOGO = 'https://shifty.es/logos/shifty-principal.png'
const FUENTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const ORIGENES = (Deno.env.get('PLANNING_AI_ORIGENES') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function cors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? ''
  const permitido = ORIGENES.length === 0 ? '*' : ORIGENES.includes(origen) ? origen : ORIGENES[0]
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function responder(CORS: Record<string, string>, status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** Un correo con forma de correo. No es una validación perfecta, ni hace falta: Brevo rechaza el resto. */
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/
const TOKEN_RE = /^[a-z0-9]{12}$/i

function enlace(planToken: string | null): string {
  return planToken ? `${BASE_URL}/?plan=${planToken}` : `${BASE_URL}/`
}

function cuerpoHtml(url: string, conPlan: boolean): string {
  const punto = (titulo: string, texto: string) => `
<tr><td style="padding:0 0 12px;font-family:${FUENTE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" style="padding:3px 10px 0 0;"><div style="width:8px;height:8px;border-radius:4px;background:${MORADO};font-size:0;line-height:0;">&nbsp;</div></td>
<td style="font-size:14px;line-height:1.5;color:#374151;"><strong style="color:#111118;">${titulo}</strong> ${texto}</td>
</tr></table>
</td></tr>`
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Tu planificador de plantilla</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;">
<div style="display:none;font-size:1px;color:#F4F4F5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${conPlan ? 'Tu plan te espera donde lo dejaste.' : 'Para abrirlo en el ordenador cuando te venga bien.'}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F4F5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:14px;">
<tr><td style="padding:28px 28px 8px;"><img src="${LOGO}" alt="Shifty Work" width="110" style="display:block;width:110px;height:auto;border:0;"></td></tr>
<tr><td style="padding:12px 28px 0;font-family:${FUENTE};">
<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:#111118;">${conPlan ? 'Tu plan, listo para seguir en el ordenador' : 'Tu planificador, para abrirlo en el ordenador'}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151;">${
    conPlan
      ? 'Lo guardamos tal como lo dejaste. Ábrelo en el ordenador y sigue desde ahí: con la pantalla grande se ve el cuadrante entero.'
      : 'Lo has abierto en el móvil. En el ordenador se trabaja mejor: subes el fichero de tu caja y ves el cuadrante entero.'
  }</p>
</td></tr>
<tr><td align="center" style="padding:0 28px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="border-radius:10px;background:${MORADO};"><a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${conPlan ? 'Abrir mi plan' : 'Abrir el planificador'}</a></td>
</tr></table>
</td></tr>
<tr><td style="padding:0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MORADO_SUAVE};border-radius:12px;">
<tr><td style="padding:20px 20px 8px;font-family:${FUENTE};">
<p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MORADO};">Qué te da, gratis y sin registrarte</p>
</td></tr>
<tr><td style="padding:0 20px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${punto('Cuánta gente necesitas.', 'Sale de tu caja, franja a franja, no de una media.')}
${punto('Qué contratos firmar.', 'Jornadas completas y parciales, con las horas justas para cubrir el servicio.')}
${punto('Tu cuadrante semanal.', 'Turnos de cada persona, con sus descansos y libranzas.')}
${punto('Lo que cuesta.', 'Coste de empresa a la semana y al año, puesto a puesto.')}
${punto('Tus semanas punta.', 'Cuáles son y cuánto te sale cubrirlas con refuerzos en vez de contratar de más.')}
</table>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 28px 24px;font-family:${FUENTE};">
<p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#71717A;">Tu fichero se lee en tu navegador y no se sube.</p>
<p style="margin:0;font-size:13px;line-height:1.55;color:#71717A;">Si no lo has pedido tú, ignora este correo: no te escribiremos más.</p>
</td></tr>
<tr><td style="border-top:1px solid #E4E4E7;padding:16px 28px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#8E8E96;">Shifty &middot; Planificador de plantilla &middot; <a href="${BASE_URL}/" style="color:#8E8E96;">planificador.shifty.es</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function cuerpoTexto(url: string, conPlan: boolean): string {
  return [
    conPlan ? 'Tu plan, listo para seguir en el ordenador.' : 'Tu planificador de plantilla, para abrirlo en el ordenador.',
    '',
    conPlan ? 'Lo guardamos tal como lo dejaste:' : 'En el ordenador se trabaja mejor: subes el fichero de tu caja y ves el cuadrante entero.',
    url,
    '',
    'Qué te da, gratis y sin registrarte:',
    '- Cuánta gente necesitas, sacado de tu caja.',
    '- Qué contratos firmar.',
    '- Tu cuadrante semanal, con descansos y libranzas.',
    '- Lo que cuesta, a la semana y al año.',
    '- Tus semanas punta y cómo cubrirlas.',
    '',
    'Tu fichero se lee en tu navegador y no se sube.',
    'Si no lo has pedido tú, ignora este correo: no te escribiremos más.',
    '',
    'Shifty · Planificador de plantilla',
  ].join('\n')
}

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = cors(req)
  const traza = crypto.randomUUID().slice(0, 8)
  try {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (req.method !== 'POST') return responder(CORS, 405, { ok: false, codigo: 'metodo' })

    const crudo = await req.text()
    if (crudo.length > MAX_BYTES_CUERPO) return responder(CORS, 413, { ok: false, codigo: 'datos' })
    let datos: { email?: unknown; planToken?: unknown }
    try {
      datos = JSON.parse(crudo)
    } catch {
      return responder(CORS, 400, { ok: false, codigo: 'datos' })
    }
    const email = typeof datos.email === 'string' ? datos.email.trim() : ''
    const planToken = typeof datos.planToken === 'string' && TOKEN_RE.test(datos.planToken) ? datos.planToken : null
    if (email.length > 254 || !EMAIL_RE.test(email)) return responder(CORS, 400, { ok: false, codigo: 'email' })

    if (Deno.env.get('PLANNING_SEGUIR_LUEGO_ACTIVO') !== '1') {
      return responder(CORS, 503, { ok: false, codigo: 'apagado' })
    }

    const clave = Deno.env.get('BREVO_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!clave || !url || !servicio) {
      console.error(`[${traza}] planning-seguir-luego: faltan secretos`)
      return responder(CORS, 503, { ok: false, codigo: 'no_disponible' })
    }

    const db = createClient(url, servicio, { auth: { persistSession: false } })
    const { error: tope } = await db.rpc('planning_bump_counter', { p_kind: 'seguir_luego', p_limit: TOPE_DIARIO })
    if (tope) {
      console.warn(`[${traza}] planning-seguir-luego: tope diario`, tope.message)
      return responder(CORS, 429, { ok: false, codigo: 'tope' })
    }

    const destino = enlace(planToken)
    const conPlan = planToken !== null
    let r: Response
    try {
      r = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: { 'api-key': clave, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: REMITENTE_EMAIL, name: REMITENTE_NOMBRE },
          to: [{ email }],
          replyTo: { email: REMITENTE_EMAIL, name: REMITENTE_NOMBRE },
          subject: conPlan ? 'Tu plan de plantilla, para seguir en el ordenador' : 'Tu planificador de plantilla, para abrirlo en el ordenador',
          htmlContent: cuerpoHtml(destino, conPlan),
          textContent: cuerpoTexto(destino, conPlan),
          tags: ['planning-seguir-luego'],
        }),
        signal: AbortSignal.timeout(TIMEOUT_BREVO_MS),
      })
    } catch (e) {
      console.error(`[${traza}] planning-seguir-luego: Brevo no contesta`, (e as Error).message)
      return responder(CORS, 502, { ok: false, codigo: 'no_disponible' })
    }
    if (!r.ok) {
      // Sin el correo en el log: un dato de una persona no va a un registro (regla 20).
      console.error(`[${traza}] planning-seguir-luego: Brevo ${r.status}`, (await r.text()).slice(0, 300))
      return responder(CORS, 502, { ok: false, codigo: 'no_disponible' })
    }
    return responder(CORS, 200, { ok: true })
  } catch (e) {
    console.error(`[${traza}] planning-seguir-luego: fallo no previsto`, (e as Error)?.stack ?? String(e))
    return responder(CORS, 503, { ok: false, codigo: 'no_disponible' })
  }
})
