---
name: shifty-avisos
description: >
  Cómo se crea o se cambia un aviso (notificación push, email, SMS o WhatsApp) en Shifty sin
  inundar a nadie: por dónde viaja un aviso, las reglas antes de crear un tipo nuevo (si ya hay
  otro sistema que avisa de lo mismo, nace apagado para quien ya tiene cuenta, el tope diario
  compartido, la deduplicación, el interruptor en Ajustes, sin datos personales en el texto), las
  pruebas de volumen antes de encenderlo, la vigilancia después y los incidentes que ya han
  pasado. Úsala SIEMPRE antes de crear un tipo de aviso nuevo, de cambiar a quién o cuántas veces
  avisa uno que existe, de crear una alerta, cascada, recordatorio o campaña que mande push, y
  cuando alguien diga "me llegan demasiadas notificaciones", "crea un aviso", "avisa al
  trabajador cuando", "manda una push" o "por qué le llegó esto".
---

# Cómo se crea un aviso sin inundar a nadie

**Por qué existe esto.** El 24-09-2026 salió la alerta "Para ti" de la app nueva: una alerta que
Shifty creaba a cada persona, sin filtros y sin tope. A la cuenta de prueba de Crescente le mandó
**17 avisos en un día**. La cascada, que ya avisaba de los anuncios nuevos a todo el mundo, tenía
desde hacía meses un tope de 2 al día y 1 por empresa, pero el sistema nuevo no lo miraba: contaba
por su cuenta. Crescente lo resumió así: *"nos van a quitar las notificaciones los trabajadores"*.
Una persona que apaga los avisos del sistema ya no se entera de nada, tampoco de lo importante:
su turno, un cambio de horario, la reconfirmación.

El inventario completo de tipos, con quién crea cada uno, su canal real y su volumen medido, está
en `docs/features/avisos-inventario.md`. El detalle técnico de cada tipo está en
`docs/features/notifications.md`.

---

## 1. Por dónde viaja un aviso hoy

1. Algo inserta una fila en `notifications` (una función de la base, un cron, una edge function).
   **Esa fila es la entrada en la bandeja de la app** y se crea siempre.
2. El trigger `on_notification_created` llama a la edge function `notify-orchestrator`.
3. El orquestador decide el canal (push FCM, email, SMS, WhatsApp) y **solo** mira el interruptor
   del trabajador si el tipo está en su mapa de tipos silenciables. **Un tipo que no está en ese
   mapa se manda siempre**, aunque la persona haya apagado todo en Ajustes.
4. Cada intento queda en `notification_deliveries` (proveedor, estado). **Para contar pushes de
   verdad se cuenta ahí**, no en `notifications`.

Consecuencia: el filtro de "a quién" y "cuántas veces" tiene que estar **antes de insertar la
fila**. Una vez insertada, la push sale.

---

## 2. Antes de crear un tipo nuevo: las reglas

### 2.1 Si otro sistema ya avisa de lo mismo, no se crea otro

Antes de nada, busca en el inventario quién avisa ya de ese hecho. "Para ti" avisaba de anuncios
nuevos y eso ya lo hacía la cascada: dos sistemas para lo mismo, cada uno con su contador, suman
avisos sin que ninguno lo vea. Se retiró el 25-09-2026. **Una pregunta, un sistema.** Si el nuevo
es mejor, sustituye al viejo; no conviven.

### 2.2 Un tipo nuevo nace APAGADO para quien ya tiene cuenta

Decidido por Crescente el 25-09-2026. Quien ya usa la app no ha pedido ese aviso: lo enciende él
si lo quiere. Las cuentas nuevas lo reciben como se decida en la propuesta.

- **Si el tipo nuevo tiene interruptor propio** en `worker_notification_settings`: la columna se
  crea con valor por defecto *falso*, que rellena apagadas todas las filas existentes, y **después**
  se cambia el valor por defecto al que tendrán las cuentas nuevas. Dos pasos, en la misma
  migración.
- **Si cuelga de un interruptor que ya existe** (por ejemplo, anuncios cercanos), no hereda el sí
  de nadie: para quien ya tiene cuenta, nace apagado igualmente, con una marca propia o una fecha
  de alta que el envío compruebe.
- **Las alertas que crea Shifty por la persona** también nacen apagadas para quien ya tenía
  cuenta: "Mis empresas favoritas" se dejó desactivada el 25-09-2026. **Las cuentas creadas desde el
  29-09-2026 sí la reciben encendida** (origen `shifty_favorites`, la crea
  `initialize_my_worker_notification_defaults`; comprobado en la base el 22-10-2026), junto con
  "Cuando no te eligen" apagado. Al contar alertas o avisos apagados, separar esas cuentas: no lo
  eligió la persona.

### 2.3 Los avisos de descubrimiento comparten un solo tope diario

"Descubrimiento" es todo lo que dice *hay algo que te puede interesar*: anuncios nuevos, sugerencias,
promociones, campañas. Todos comparten **un único presupuesto por persona y día**, que hoy es de
**2 al día y 1 por empresa** (hora de Madrid). Los números están en la tabla de configuración
(`avisos_turno_nuevo_topes`) y la cuenta la lleva una sola función, `fn_worker_new_offer_push_cap`,
que ya consultan la cascada y las alertas de la app nueva.

- **No se inventa otro contador.** Si el aviso nuevo es de descubrimiento, pregunta a esa función
  antes de insertar, y asegúrate de que su clave de deduplicación la cuenta (hoy cuenta las que
  empiezan por `cascade:` y `job_alert:`; si añades un prefijo, añádelo allí).
- **Si el tope corta, corta lo menos pedido primero**: lo que eligió Shifty antes que lo que pidió
  la persona.
- **Lo que no cabe no se deja para mañana.** Si no, al cambiar de día sale todo lo acumulado de
  golpe y de madrugada. Lo que no se avisó sigue estando en la app.

Los avisos **operativos** (tu turno, tu fichaje, tu incidencia, un mensaje de chat, una
cancelación) no llevan tope: si se cortan, se pierde información que la persona necesita. El
chat avisa de cada mensaje y las incidencias cerradas en tanda avisan una a una, y **Crescente
decidió el 25-09-2026 que así está bien**. No hace falta volver a proponerlo.

### 2.4 Si puede llegar en tanda, se agrupa

Si un mismo hecho puede generar varios avisos seguidos a la misma persona, se manda uno solo que
lo cuente todo. El modelo es la solicitud no seleccionada (16-09-2026): **un aviso por anuncio,
no uno por día**, con todas las fechas dentro.

### 2.5 Deduplicación obligatoria

Cada fila lleva `dedupe_key` con el formato `tipo:<a quién>:<de qué>` (y la fecha si puede
repetirse otro día), y el insert **no hace nada si ya existe**. Así un cron que corre cada 5
minutos o un reintento no repiten el aviso. Sin clave, un error de lógica se convierte en
avalancha.

### 2.6 Se puede apagar desde Ajustes, salvo lo imprescindible

Todo tipo nuevo se añade al mapa de tipos silenciables del orquestador, con el interruptor de
Ajustes que le corresponda. **Solo lo imprescindible se salta el interruptor**, y eso lo decide
Crescente: hoy son "te han elegido" y "confirma que vas" (23 y 24-09-2026). Tocar el orquestador
es desplegar una edge function: **antes se compara con lo que hay en producción**, que un deploy
reemplaza el paquete entero.

### 2.7 El texto no lleva datos personales

El título y el cuerpo de una push viajan por Google (FCM) y Apple, y se quedan en la pantalla de
bloqueo. **Ni NIF, ni IBAN, ni teléfono, ni dirección, ni motivos de salud.** Nombre de la
empresa, puesto, fecha y hora, sí. Y como todo texto general, **sin nombrar un sector ni una
ciudad fijos**: sale de los datos del turno.

### 2.8 Un registro no es un aviso

Toda fila de `notifications` sale hacia el orquestador, y lo que no tiene un texto propio sale
como push con el texto por defecto. Hasta el 25-09-2026, las filas que dejaban los envíos de
WhatsApp para no repetirlos salían como push: 618 al mes con el texto interno y **el teléfono de la
persona**, y otras 169 como "Tienes una nueva notificación", también cuando el WhatsApp había
fallado. Si necesitas dejar constancia de algo que no es un aviso, o va a otra tabla, o se añade su
tipo a la lista de `fn_notificacion_solo_registro`, que lo marca como registro, le quita el texto
y no lo manda.

### 2.9 Un aviso, un creador

Si un aviso lo crea un trigger, la función que hace el cambio no lo crea también. `ticket_resolved`
lo crean a la vez un trigger y dos funciones del panel: cada incidencia resuelta llega dos veces.
Antes de insertar, busca en `pg_proc` y en las edge functions quién más inserta ese tipo.

### 2.10 Si no es urgente, no sale de noche

La cascada no avisa antes de las 8, las invitaciones automáticas van de 8 a 22 y el engagement de
10 a 22. Un aviso nuevo que no sea urgente se ajusta a ese horario: **se difiere el aviso, no la
acción**. Ojo con lo que tiene plazo: si la invitación caduca en 12 horas y el aviso se difiere
por la noche, el plazo tiene que contar desde que se avisa. "Esta vez no pudo ser" salía de
madrugada (173 avisos entre las 22 y las 8 en nueve días) y está apuntado para arreglar.

### 2.11 Lo que se promete en el texto tiene que pasar

Si una push dice "te hemos mandado el brief", el correo tiene que salir. El 25-09-2026 se vio que
75 de 97 correos de primer turno no salieron porque una función de la base creaba la fila sin el
contenido y le quitaba la clave a la que sí lo llevaba, mientras la push lo prometía (arreglado ese
día). Y otro correo con asunto y texto de primer turno salía tras el segundo turno y todos los
siguientes. **Dos sitios que crean el mismo aviso con la misma clave: gana el primero, aunque esté
vacío.** Y el SMS de reconfirmación dice "o lo perderás", que no es verdad.

---

## 3. Pruebas antes de encenderlo

1. **Prueba de volumen con el pasado.** Antes de encender, calcula cuántos avisos habría recibido
   cada persona en los últimos 30 días con la regla nueva: **el máximo por persona y día**, no la
   media. La media de "Para ti" parecía razonable; el máximo era 17.
2. **Suma, no por separado.** Ese máximo se suma a lo que ya recibe esa persona de los demás
   tipos. La pregunta es "cuántas pushes le llegan hoy en total", no "cuántas de las mías".
3. **Con cuenta de prueba primero** (`is_test = true`, como la 666 555 444). Mira que la fila
   aparece en la bandeja, que la push llega (en `notification_deliveries`) y a dónde lleva al
   pulsarla.
4. **Detrás de un interruptor**, encendido primero solo para test.
5. **Revisión a las 24 horas de encenderlo**, con la consulta de vigilancia de abajo.
6. Si el aviso lo crea una función, pasa además las comprobaciones de la skill
   `shifty-base-de-datos` (duplicados de firma y `plpgsql_check`).

---

## 4. Vigilancia

Esta consulta dice qué tipos están mandando demasiadas pushes a la misma persona. Se pasa a las 24
horas de encender algo y cuando alguien diga que le llegan demasiadas.

```sql
-- Pushes de verdad (FCM enviadas) por persona y dia, ultimos 7 dias, trabajadores reales
with p as (
  select n.recipient_worker_id w, n.type,
         (coalesce(nd.sent_at, nd.queued_at) at time zone 'Europe/Madrid')::date dia
  from notification_deliveries nd
  join notifications n on n.id = nd.notification_id
  join workers wk on wk.id = n.recipient_worker_id and not coalesce(wk.is_test, false)
  where nd.provider = 'FCM' and nd.status in ('sent', 'delivered')
    and coalesce(nd.sent_at, nd.queued_at) > now() - interval '7 days')
select type, count(distinct w) personas,
       max(c) max_persona_dia,
       count(*) filter (where c >= 3) dias_persona_3_o_mas
from (select w, type, dia, count(*) c from p group by 1, 2, 3) x
group by 1 order by max_persona_dia desc;
```

Referencia medida el 25-09-2026 sobre 30 días: la mediana es **1 push por persona y día** y el
percentil 95 es **5**. Un tipo de descubrimiento que pase de 2 por persona y día está mal.

---

## 5. Lo que ya ha pasado

| Fecha | Qué pasó | Qué se aprendió |
|---|---|---|
| 24/25-09-2026 | "Para ti": alerta de Shifty sin filtros ni tope, 17 avisos en un día a una cuenta de prueba | Dos sistemas para lo mismo suman sin verse. Se retiró y se unificó el tope (2.1, 2.3) |
| 25-09-2026 | Crescente pide que lo nuevo nazca apagado para quien ya tiene cuenta | Regla 2.2 |
| 16-09-2026 | La solicitud no seleccionada no avisaba; al crearla, se agrupó por anuncio | Regla 2.4 |
| 04-08-2026 | Todo aviso de oferta acababa en "este anuncio ya no está disponible" por una columna mal escrita | Llevar siempre al sitio y que el sitio explique (ver `notifications.md`) |
| 25-09-2026 | Los registros de WhatsApp salían como push con el teléfono de la persona (618 al mes) | Regla 2.8; arreglado con `fn_notificacion_solo_registro` |
| 25-09-2026 | El interruptor "candidatos por caducar" de la app de empresas apagaba otro aviso | El interruptor que se enseña tiene que ser el que se mira. Arreglado |
| 25-09-2026 | A las empresas en iOS no les llega casi ninguna push (23 de 1.457 en 30 días) | El día que se arregle, les llegará una por anuncio: agrupar antes (ver `PENDIENTE.md`) |
| 25-09-2026 | Pausar una campaña push en el panel no la paraba: la función de la base no miraba el interruptor | Si un aviso tiene interruptor en el panel, el código que lo crea lo consulta. Pausado "16 turnos disponibles" |
| 06-07-2026 | Un deploy de edge function reemplazó el paquete y se perdió una semana de arreglos | Comparar con producción antes de desplegar el orquestador |

Cuando pase algo nuevo con los avisos, se añade aquí una fila.
