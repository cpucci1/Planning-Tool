# planning-auth-email

> ## ⛔ LO ÚNICO QUE FALTA, Y NO SE PUEDE HACER DESDE AQUÍ
>
> **La cuenta de Brevo tiene encendida la restricción por IP y está rechazando
> nuestros envíos.** Probado de verdad el 2026-09-06: Supabase Auth llamó al
> hook, la firma se verificó, la función llamó a Brevo, y Brevo contestó 401 con
> este mensaje:
>
> > *We have detected you are using an unrecognised IP address 2a05:d014:61b:2708:…
> > If you performed this action make sure to add the new IP address in this link:
> > https://app.brevo.com/security/authorised_ips*
>
> O sea: **la clave es correcta y el código funciona**; lo que falla es un ajuste
> de seguridad de la cuenta de Brevo.
>
> **Añadir esa IP a la lista NO sirve.** Las funciones de Supabase salen a
> internet por direcciones de AWS que cambian en cada arranque, así que mañana
> sería otra. La única salida por ese camino es **apagar la restricción por IP**
> en https://app.brevo.com/security/authorised_ips, y eso es una decisión de
> seguridad de la cuenta de Shifty entera, no solo del planificador: hay que
> tomarla a sabiendas, no por inercia.
>
> Si no se quiere tocar esa restricción, la alternativa es mandar el correo por
> otro proveedor. En `Website/` ya hay una clave de Resend en uso, que no tiene
> esa limitación. Cambiar de proveedor aquí es reescribir una sola función de
> este mismo fichero, `mandarPorBrevo`, y nada más: el hook, la firma y el correo
> se quedan igual.
>
> **Hasta que eso se decida, entrar con el correo no funciona.** El resto del
> planificador sí: se calcula, se guarda el plan sin cuenta y el enlace corto
> funciona. Lo que no se puede es reclamar el plan para volver a él desde otro
> dispositivo.


El correo con el codigo de acceso. Lo llama **Supabase Auth**, no el front, cada vez que alguien
pide entrar en el planificador, y lo manda por la **API de Brevo** con la identidad de Shifty.

| Quien llama | Cuando | Que hace |
|---|---|---|
| Supabase Auth (Send Email Hook) | Cada `signInWithOtp` de `src/lib/backend.ts` | Manda el codigo de seis digitos por Brevo |

**Por que existe.** Con la configuracion de fabrica el correo sale por el servidor de cortesia de
Supabase, que tiene un limite de unos pocos envios por hora **para todo el proyecto** y sale desde un
dominio que no es el nuestro, asi que acaba en spam. Un codigo que no llega es exactamente lo mismo
que no poder entrar, y la persona llega a esa pantalla con su plan ya calculado: es el peor momento
para perderla.

**Que NO manda.** El enlace magico. Solo el codigo. El planificador entra con `verifyOtp` y el
codigo escrito a mano (`comprobarCodigo` en `src/lib/backend.ts`), asi que un boton de "entrar" en
el correo llevaria a una direccion que depende del Site URL del proyecto y que no controla nadie.

---

## Donde va

En el proyecto de Supabase **freetools**, el mismo que `planning-ai`, y **no** en el de produccion de
Shifty (`brgswggayexbvrnqtlhp`).

No toca la base de datos: ni lee, ni escribe, ni necesita la clave de servicio. Recibe el hook,
manda el correo y contesta.

---

## Los secretos que hay que configurar

Van en **Project Settings → Edge Functions → Secrets → Add new secret**, del proyecto freetools.
Los nombres van tal cual, en mayusculas y con guiones bajos.

| Nombre exacto | Obligatorio | Que es |
|---|---|---|
| `BREVO_API_KEY` | Si | La clave de la API de Brevo. **Ya esta puesta.** |
| `SEND_EMAIL_HOOK_SECRET` | Si | El secreto que genera Supabase al crear el hook. **Todavia NO existe**: lo da el panel en el paso 3 de "Activar el hook". Llega con el formato `v1,whsec_<base64>` y se pega entero, con el prefijo. |
| `PLANNING_EMAIL_FROM` | No | Cambia el remitente sin volver a desplegar. Si no esta, se usa `soporte@shifty.es`. |

**Sin `SEND_EMAIL_HOOK_SECRET` la funcion no manda ni un correo.** Contesta 500 y lo dice en su log.
Es a proposito: sin comprobar la firma, esto es un formulario abierto en internet para mandar
correos con la marca de Shifty.

### El remitente tiene que estar validado en Brevo

Brevo solo deja mandar desde una direccion validada o desde un dominio autenticado. Si no lo esta, o
rechaza el envio o reescribe el dominio, que es peor: el correo sale desde un dominio que no es el
nuestro y va derecho a spam.

En la cuenta de Brevo de Shifty hay estos remitentes validados y activos (consultado el 2026-09-06):
`cpucci@shifty.es`, `facturacion@shifty.es`, `pmerino@shifty.es`, `valeria@shifty.es`,
`seleccion@shifty.es`, `mvier@shifty.es`, `soporte@shifty.es` y `valeria@getshifty.es`.

⚠️ **No esta comprobado que la `BREVO_API_KEY` que hay en freetools sea de esa misma cuenta.** Se ve
en un segundo: si al probar contesta `unauthorized`, la clave es de otro sitio; si contesta que el
remitente no es valido, la cuenta es otra y hay que validar ahi `soporte@shifty.es`.

---

## Desplegar, paso a paso

Es **un solo fichero** y no importa nada de `_shared/`, asi que se pega y ya.

1. Entra en **supabase.com**, elige el proyecto **freetools**.
2. Menu de la izquierda: **Edge Functions**.
3. **Deploy a new function** → **Via Editor**.
4. En el nombre escribe **`planning-auth-email`**, exactamente asi, en minusculas y con los guiones.
5. **Quita la marca de "Verify JWT"**. Quien llama es el servidor de Auth y no trae sesion de nadie:
   si se queda puesta, todos los envios fallan con 401 y nadie recibe su codigo.
6. Borra el ejemplo del editor y pega entero el contenido de `index.ts` de esta carpeta.
7. **Deploy function**.

Con terminal: `supabase functions deploy planning-auth-email --no-verify-jwt`.

---

## Activar el hook en el panel, paso a paso

Esto es lo que hace que Auth deje de mandar los correos por su cuenta y llame aqui. Hasta que se
haga, la funcion esta desplegada y no la llama nadie.

1. En el proyecto **freetools**, menu **Authentication** → **Hooks**.
2. En **Send Email hook**, pulsa **Enable hook** y elige el tipo **HTTPS** (no "Postgres function").
3. En la URL pon:
   `https://<REF>.supabase.co/functions/v1/planning-auth-email`, con `<REF>` la referencia del
   proyecto freetools (la que sale en la direccion del panel).
4. El panel **genera un secreto** con el formato `v1,whsec_...`. **Copialo antes de cerrar la
   pantalla.**
5. Guarda el hook.
6. Vuelve a **Project Settings → Edge Functions → Secrets** y crea `SEND_EMAIL_HOOK_SECRET` con ese
   valor pegado **entero, con el `v1,whsec_` delante**. Un secreto nuevo lo cogen las llamadas
   siguientes; no hace falta volver a desplegar.
7. Comprueba en **Authentication → Sign In / Providers → Email** que el proveedor de email sigue
   **encendido**. Si se apaga, no se manda nada: el registro por correo queda desactivado entero.

**Orden importante.** Entre el paso 5 y el 6 hay una ventana en la que el hook esta activo y la
funcion todavia no tiene el secreto: durante ese rato nadie puede entrar, porque la funcion rechaza
todo con 500. Son dos minutos, pero conviene hacerlo con la herramienta sin gente dentro.

### Y de paso, mirar la caducidad del codigo

El correo dice que el codigo **caduca en una hora**, que es lo que trae Supabase de fabrica
(3.600 segundos). Ese numero **no viaja en el hook**: esta escrito a mano en la constante
`CADUCIDAD_TEXTO` del `index.ts`. Si alguien cambia
**Authentication → Sign In / Providers → Email → Email OTP expiration**, hay que cambiar tambien esa
linea o el correo estara mintiendo.

---

## Probar que funciona

### La prueba de verdad

Abrir el planificador, pedir el codigo y ver si llega. Es la unica que prueba la cadena entera.
Ojo: Supabase deja pedir **un codigo cada 60 segundos** por persona.

### La prueba sin tocar la app

Como el endpoint exige firma, un `curl` a pelo siempre da 401. Este script la calcula. Cambia las
tres primeras lineas y ejecuta `deno run --allow-net prueba-correo.ts`:

```ts
const FUNCION = 'https://REF.supabase.co/functions/v1/planning-auth-email'
const SECRETO = 'v1,whsec_PEGA_AQUI_EL_SECRETO_DEL_HOOK'
const DESTINO = 'tu@correo.es'

const cuerpo = JSON.stringify({
  user: { email: DESTINO },
  email_data: { token: '123456', email_action_type: 'magiclink' },
})

const base64 = SECRETO.replace(/^v1,/, '').replace(/^whsec_/, '')
const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
const clave = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

const id = 'msg_prueba'
const ts = String(Math.floor(Date.now() / 1000))
const firmado = new TextEncoder().encode(`${id}.${ts}.${cuerpo}`)
const firma = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', clave, firmado))))

const r = await fetch(FUNCION, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${firma}`,
  },
  body: cuerpo,
})
console.log(r.status, await r.text())
```

Tiene que contestar `200 {}` y **mandar un correo de verdad** al destino que pongas, con el codigo
123456. Si contesta 401, el secreto de la funcion y el del hook no son el mismo.

Un `curl` sin firma sirve para comprobar que la puerta esta cerrada: tiene que dar **401**.

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://REF.supabase.co/functions/v1/planning-auth-email" \
  -H "Content-Type: application/json" -d '{"user":{"email":"x@y.es"}}'
```

---

## Que pasa si falla

La funcion **nunca contesta 200 si el correo no ha salido**. Un 200 falso le diria a Auth que todo
fue bien, y la persona se quedaria esperando un codigo que no existe sin que quede ni un error que
mirar.

El codigo que devuelve decide si Auth lo reintenta: **solo reintenta con 429 y 503** (hasta tres
veces, con dos segundos de espera). Por eso se reintenta lo que puede salir bien a la segunda y no
lo que hay que ir a arreglar al panel.

| Devuelve | Cuando | Reintenta Auth | Que hay que hacer |
|---|---|---|---|
| `200 {}` | Brevo acepto el envio | — | Nada |
| `401` | La firma no cuadra o faltan cabeceras | No | Que `SEND_EMAIL_HOOK_SECRET` sea el mismo que el del hook |
| `405` | No era POST | No | No deberia pasar |
| `413` | Cuerpo de mas de 64 KB | No | No deberia pasar |
| `422` | Tipo de correo que el planificador no manda, sin destinatario, o codigo con forma rara | No | Mirar que se ha encendido en Auth |
| `429` | Brevo dice que son demasiados | **Si** | Mirar el limite de la cuenta de Brevo |
| `500` | Falta un secreto, o Brevo rechaza por clave mala, remitente sin validar o sin credito | No | Se arregla en el panel de Brevo o en los secretos |
| `503` | Brevo caido, o tardo mas de 4 segundos | **Si** | Suele arreglarse solo |

**Los cuatro segundos no son un numero al azar.** El hook entero tiene cinco antes de que Auth se
canse, asi que se corta a los cuatro para poder devolver un 503 nuestro, que Auth reintenta, en vez
de que nos corte Auth y no quede rastro de por que.

### Donde se mira

**Edge Functions → planning-auth-email → Logs.** Cada linea lleva una traza de ocho caracteres:

```
[8b679425] planning-auth-email magiclink ok 2ms dominio=correo.es brevo=<...@relay.brevo.com>
[6f34b25a] planning-auth-email magiclink: Brevo fallo status=401 12ms dominio=gmail.com detalle={"code":"unauthorized",...}
[43932239] planning-auth-email: firma rechazada (faltan cabeceras de firma)
```

**Del destinatario solo se registra el dominio.** Con eso se ve si el problema es de un proveedor
concreto sin dejar direcciones de gente en un log que ve cualquiera con acceso al panel. Para seguir
un envio suelto esta el `messageId`, que es lo que se busca en el panel de Brevo; los envios de aqui
llevan ademas la etiqueta `planning-codigo`.

---

## El correo

En castellano, tuteando. Dice el codigo, que caduca y que si no lo ha pedido nadie que lo ignore.
El **asunto empieza por el codigo** porque en el movil la notificacion es lo unico que se ve, y con
eso muchas veces no hace falta ni abrir el correo:

> `305805 es tu código para entrar en el planificador`

HTML de tablas con los estilos en linea, morado de marca `#6C0FD8`, tipografia de sistema y **ni una
imagen externa**: se ve entero aunque el cliente bloquee la carga remota, que es lo normal, y no hay
ningun pixel que cuente quien lo abre. Lleva tambien version en texto plano, que se lee menos como
spam que un correo solo en HTML.

Solo maneja **tres tipos**: `signup`, `magiclink` y `email`, que son los tres que puede producir el
`signInWithOtp` del planificador. Cualquier otro (`recovery`, `invite`, `email_change`,
`reauthentication`, los avisos) se contesta con 422 y **no se manda nada**: si aparece uno es que
alguien ha encendido un flujo que esta herramienta no tiene, y mandar "tu codigo" en su lugar seria
un correo raro con la marca de Shifty encima.

---

## Como se defiende

Es un endpoint publico y sin cuenta, igual que `planning-ai`.

1. **La firma, primero.** Standard Webhooks: se firma `webhook-id.webhook-timestamp.cuerpo` con
   HMAC-SHA256 y el secreto, y tiene que cuadrar con la cabecera `webhook-signature`. Sin firma
   valida, 401 y no se llama a Brevo.
2. **La marca de tiempo, con ventana de cinco minutos.** Sin eso, quien capture una peticion valida
   puede repetirla para siempre.
3. **Comparacion en tiempo constante.** Comparar firmas con `===` filtra informacion por lo que
   tarda en fallar, y con eso se va adivinando la firma buena caracter a caracter.
4. **Falla cerrado.** Si falta el secreto no se sigue "por esta vez": 500 y nada de correos.
5. **Sin CORS.** Esto no lo llama ningun navegador. Contestar a un preflight seria invitar a
   llamarlo desde una pagina.
6. **El cuerpo se lee como texto y con tope de 64 KB**, antes de parsear nada. La firma se calcula
   sobre los bytes exactos que llegaron: parsear y volver a serializar cambiaria un espacio y ya no
   cuadraria.

**La firma se comprueba a mano con Web Crypto**, sin la libreria de terceros que sale en la
documentacion de Supabase. Son veinte lineas, se despliega pegando un solo fichero y no depende de
que un CDN conteste el dia que haya que desplegar. A cambio, la correccion es responsabilidad
nuestra, y por eso se ha cruzado contra la libreria de referencia (ver abajo).

---

## Lo que SI esta comprobado

Todo esto se ejecuto en local, con Deno 2.9.5 y **sin desplegar nada ni mandar ningun correo de
verdad** (la llamada a Brevo se sustituyo por una falsa):

- **`deno check` sin errores**, y `deno lint` da exactamente el mismo unico aviso que ya da
  `planning-ai` (el import de tipos de Supabase sin version).
- **La verificacion de firma, cruzada contra la libreria de referencia**
  (`standardwebhooks@1.0.0`, la que recomienda Supabase). Se firmo con la libreria y se verifico con
  este codigo, y al reves. Trece casos, todos correctos: acepta la firma buena; acepta con el
  secreto en formato `v1,whsec_...`; acepta si la firma buena es la segunda de la lista; acepta con
  dos secretos configurados para rotacion; y rechaza si cambia el cuerpo, si cambia el
  `webhook-id`, si el secreto es otro, si la peticion es de hace 20 minutos, si viene fechada 20
  minutos en el futuro, si falta la cabecera, si la version no es `v1` y si el secreto esta vacio.
- **La funcion entera, contra un Brevo falso.** 30 comprobaciones: el camino bueno devuelve
  `200 {}` y llama a Brevo con la clave, el remitente y el destinatario correctos; el asunto empieza
  por el codigo; el codigo esta en el HTML y en el texto plano; el HTML no trae imagenes externas y
  si el morado de marca; en ningun sitio aparece la palabra ETT; `signup`, `magiclink` y `email`
  pasan; `recovery`, `invite`, `email_change`, `reauthentication` y un tipo vacio dan 422 **sin
  llamar a Brevo**; sin firma, con firma falsa o con el cuerpo cambiado despues de firmar dan 401
  sin llamar a Brevo; un token vacio, con letras o de dos digitos da 422; un GET da 405; y los
  fallos de Brevo se traducen en 503 (502 y caida de red), 429 (429) y 500 (401 de clave mala),
  ninguno en 200.
- **El correo, visto renderizado** a 375 px y en escritorio. Se lee, el codigo se ve grande y
  centrado, y la tarjeta no se desborda.
- **El script de prueba de este README**, ejecutado tal cual esta escrito contra una copia local de
  la funcion: contesto `200 {}`.

## Lo que NO esta comprobado

- **Nada de esto ha corrido en Supabase.** Ni desplegado, ni con el hook activado, ni con una firma
  generada por el servidor de Auth de verdad. Las firmas de las pruebas las genero la libreria de
  referencia, que es la misma especificacion, pero no es lo mismo que la cosa real.
- **No se ha mandado ni un correo por Brevo.** La API se sustituyo por una falsa en todas las
  pruebas. Que la clave valga, que el remitente este validado en esa cuenta y que el correo entre en
  bandeja de entrada y no en spam **esta sin ver**. Se ve en el primer envio.
- **Como se ve el correo en Gmail y en Apple Mail de verdad**, incluido el modo oscuro. Se ha
  escrito para eso (tablas, estilos en linea, `color-scheme: light`) y se ha visto en un navegador,
  que no es lo mismo. La primera vez que se mande, mirarlo en los dos.
- **El nombre exacto de los botones del panel de Supabase** en los pasos de "Activar el hook". Salen
  de la documentacion, no de haber entrado a hacerlo.
- **El limite de envios de la cuenta de Brevo.** Se dice por ahi que el plan gratuito son 300
  correos al dia, pero no aparece en la pagina de limites de su documentacion, asi que no se da por
  bueno. Se mira en el panel de Brevo antes de abrir la herramienta a mucha gente.

---

## De donde sale el contrato

- **Send Email Hook de Supabase**, consultado el 2026-09-06:
  https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
  De ahi salen la forma del cuerpo (`user` + `email_data`), la lista de `email_action_type`, que un
  200 vacio significa "enviado" y que el error va como `{ error: { http_code, message } }`.
- **Auth Hooks**, misma fecha: https://supabase.com/docs/guides/auth/auth-hooks
  De ahi salen las tres cabeceras de firma, el formato `v1,whsec_<base64>`, los cinco segundos de
  tiempo maximo, los reintentos solo con 429 y 503, y la tabla de planes: el Send Email Hook esta
  disponible en **Free y Pro**, asi que en el plan gratuito de freetools funciona.
- **Standard Webhooks**, la especificacion de la firma:
  https://github.com/standard-webhooks/standard-webhooks
  De ahi sale que se firma `id.timestamp.cuerpo` con HMAC-SHA256 sobre el secreto descodificado de
  base64, que la cabecera es una lista separada por espacios de `v1,<firma en base64>`, y que la
  comparacion tiene que ser en tiempo constante. La ventana de cinco minutos sale de la libreria de
  referencia, no de la especificacion, que deja el numero al implementador.
- **API transaccional de Brevo**, misma fecha:
  https://developers.brevo.com/reference/sendtransacemail y
  https://developers.brevo.com/docs/send-a-transactional-email
  `POST https://api.brevo.com/v3/smtp/email`, autenticacion con la cabecera `api-key`, cuerpo con
  `sender`, `to`, `subject`, `htmlContent` y `textContent`, y respuesta `201` con `messageId`. Los
  errores llegan como `{ code, message }`. El remitente tiene que estar registrado y verificado, o
  el dominio autenticado.
