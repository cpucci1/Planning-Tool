---
name: shifty-seguridad
description: >
  Cómo se crea una tabla, una vista o una función en Shifty sin abrir un agujero: la RLS obligatoria
  y sus políticas, los permisos de los roles anon y authenticated, qué significa SECURITY DEFINER y
  cuándo se usa, el search_path fijo, y el estado real de seguridad de la base con sus errores
  abiertos. Úsala SIEMPRE antes de crear o modificar una tabla, una vista, una función o una
  política, antes de dar permisos a un rol, al revisar quién puede ver qué, y cuando alguien diga
  "crea una tabla", "añade esto a la base", "por qué no puedo leer esta tabla", "quién puede ver
  esto", "es seguro" o "revisa la seguridad". Es también la que dirige la revisión de seguridad por
  rondas ("haz una ronda de seguridad", "revisión de seguridad", "que no nos puedan atacar"), y
  cada ronda la mejora con lo que encuentra.
---

# Seguridad de la base de datos de Shifty

**La clave anónima de Supabase va dentro de las apps. Es pública por diseño.** Cualquiera puede
sacarla del bundle. Lo único que separa a un desconocido de los datos es la **RLS** y los permisos
de rol. Si una tabla no tiene RLS y el rol `anon` tiene permisos, esa tabla está en internet.

---

## 1. Al crear una tabla: el orden, que no se salta

**Crearla no necesita permiso** (regla 1 del maestro: desde el 2026-09-24 solo se pregunta antes de
borrar), pero se hace en este orden, todo en la misma migración, y después se cuenta qué se ha
creado. La plantilla con todo puesto es `shared/_plantilla-migracion.sql`.

0. **¿Ya existe?** `select * from fn_find_similar('palabras de lo que guarda');` y
   `shared/FUENTES-UNICAS.md`. Si existe, las filas van ahí con su `origen` (regla 7: nada de tablas
   transitorias).
1. **Las cuatro preguntas de datos personales (§7)**, contestadas en la propuesta y escritas en el
   comentario de la tabla: qué dato lleva, quién lo ve, cuánto se guarda, qué pasa en la baja. Si no
   lleva ninguno, el comentario lo dice ("Sin datos personales").
2. **RLS encendida y al menos una política.** En `public` la base la enciende sola al crear la tabla
   (disparador `ensure_rls`), pero se escribe igual en la migración. Sin política **nadie puede
   leer**, que es seguro pero deja la tabla inservible desde el cliente; si de verdad no la lee
   ningún cliente, se deja así **a propósito** y se escribe en el comentario ("Sin políticas: solo
   la lee el servidor"). Ni siquiera "es interna", "solo la escribe un cron" o "es temporal" la
   libran de la RLS.
3. **Comentario en la tabla y en cada columna** (ver `shifty-base-de-datos`), e **índice en cada
   clave ajena** y en las columnas que usa la política: una política mal indexada convierte cada
   consulta en un barrido.
4. **Permisos mínimos por rol.** La pregunta es *¿quién necesita esto de verdad?*
   - Si solo la escribe un proceso de servidor (cron, edge function): **no dar nada a `anon` ni a
     `authenticated`**. El `service_role` se salta la RLS y no necesita permisos explícitos.
   - Si la lee el panel: política para internos (`is_internal_user()`).
   - Si la lee una empresa: política con `company_id in (select get_my_company_ids())`.
   - Si la lee un trabajador: política que filtre por su propio `worker_id` (`get_my_worker_id()`).
   - **`anon` casi nunca.** Solo para datos verdaderamente públicos, y con el motivo en el comentario.
5. **Comprobar:** `select * from fn_review_table('nombre');` (todo lo anterior en una llamada; el
   vigilante te la deja escrita al desplegar) y `shared/auditar-seguridad.sql`.

Medido el 10-10-2026 sobre las 27 tablas nacidas desde el 1 de octubre: todas con RLS y comentario,
cero en coma flotante o sin zona horaria, pero **91 de 278 columnas sin comentario** y 4 sin
política (las cuatro a propósito; una no lo decía en el comentario y se ha añadido).

**La pregunta de control antes de dar por buena una tabla nueva:**
*si alguien saca la clave anónima del bundle de la app, ¿qué puede hacer con esta tabla?*
La respuesta tiene que ser "nada".

---

## 2. Funciones: `SECURITY DEFINER` y el patrón de Shifty

Una función `SECURITY DEFINER` se ejecuta **con los privilegios de quien la creó**, no de quien la
llama. Se salta la RLS. Es la forma normal de trabajar aquí, y es correcta **si la función se
defiende por dentro**.

**El patrón que hay que seguir, y que la base ya usa bien:**

1. **Averiguar quién llama**, con `auth.uid()`. Si es nulo, es un anónimo: cortar.
2. **Comprobar que tiene derecho**, con los helpers que ya existen: `assert_company_user_can`,
   `check_company_user_can`, `_require_active_internal_user`, `assert_can_edit_job_day`,
   `assert_is_company_member`, `resolve_ett_payer_for_caller`. La lista completa, con la pregunta
   que contesta cada uno, está en `shared/FUENTES-UNICAS.md`.
3. **Imponer el alcance, no aceptarlo por parámetro.** Este es el punto que más se falla.
   `resolve_ett_payer_for_caller` lo hace bien: a un usuario de la ETT le devuelve **siempre su
   propio pagador**, ignorando el que pida por parámetro. Si una función acepta un `company_id` por
   parámetro y no comprueba que quien llama pertenece a esa empresa, cualquiera puede leer los datos
   de cualquier empresa.
3 bis. **"De alguna empresa" no es "de esta empresa", y "es de la empresa" no es "sigue dentro".**
   Este es el error más repetido de la casa, escrito tres veces en sitios distintos: el registro de
   actividad, la agenda del trabajador y siete funciones más que no miraban `is_active`. La pregunta
   correcta tiene **dos mitades**: ¿es tuya *esta* empresa, y sigues activo en ella? Escribirla a mano
   invita a dejarse una. Hay 95 usuarios de empresa desactivados y 8 conservan cuenta viva.

   **Los tres ayudantes ya existen y casi nadie los usa**: `is_internal_user()`,
   `get_my_company_ids()` y `assert_is_company_member(company_id)`. Los tres traen el filtro de
   activo puesto. De 247 funciones que miran `company_users`, solo 2 llaman al segundo. **Antes de
   escribir la comprobación, usa el ayudante.**

4. **Fijar el `search_path`** (`SET search_path = public, pg_temp`). Sin eso, alguien que pueda crear
   objetos en un esquema anterior en el camino puede secuestrar lo que la función llama. Hoy hay
   **124 funciones sin fijarlo**.
5. **Dejar rastro en `activity_log`** si muta algo.

**Nunca devolver `SQLERRM` al cliente**: enseña las tripas de Postgres y esconde el bug.

### Los permisos de ejecución

El 30-09-2026 había **1.106 funciones `SECURITY DEFINER` ejecutables por usuarios autenticados** y **189 por
anónimos**. En la muestra revisada, todas se defendían por dentro correctamente. **No son 189
agujeros**, pero sí es un valor por defecto peligroso: significa que una función nueva escrita por
alguien que se olvide de la comprobación queda expuesta desde el primer día.

**Regla:** una función nueva **no se otorga a `anon`** salvo que haya un motivo escrito. Si solo la
usa el panel, se otorga a `authenticated` y se comprueba internamente que es interno.

---

## 2 bis. Al crear una función: las cuatro que no se saltan

Una función `SECURITY DEFINER` corre con los permisos de su dueño y **se salta la RLS de las tablas
que toca**: ese es su propósito. Eso la convierte en la puerta más ancha de la base, y por eso estas
cuatro van juntas, en la misma migración que la crea:

1. **`SET search_path` fijado.** Sin él, alguien crea un esquema que secuestra las llamadas de dentro
   de la función, que corre con permisos del dueño. Una línea.
2. **`SECURITY DEFINER` solo si de verdad hace falta saltarse la RLS.** Si no hace falta, INVOKER,
   que es el lado seguro del error. La pregunta es: ¿esta función tiene que ver más de lo que ve
   quien la llama? Si la respuesta es no, no es DEFINER.
3. **Si es DEFINER, comprueba por dentro quién llama.** Una función que recibe un `company_id` o un
   `worker_id` por parámetro **comprueba que quien llama tiene derecho a ese identificador**. Si no,
   el parámetro *es* la puerta: cambias el identificador y ves lo de otro. Esto ya pasó con el
   detalle de turno, que repartía el NIF, el teléfono y la fecha de nacimiento de 3.167 personas a
   cualquiera con una cuenta.
4. **Se le quita el permiso a quien no deba llamarla.** Por defecto, `anon` no. Se le da solo con una
   razón, y la razón se escribe en el comentario de la función.

La plantilla con todo esto puesto es `shared/_plantilla-migracion.sql`, y
`select * from fn_review_function('nombre');` comprueba las cuatro en una llamada.

⚠️ **Y al quitar un permiso, comprobar antes si se usa.** Buscar la forma de llamarla envuelta no
vale: hay llamadas construidas de otra manera. Se busca el nombre pelado y **se vigilan los logs
después**, que es donde aparece lo que se rompió.

### Las Edge Functions con `verify_jwt` apagado son la misma puerta

Aprendido el 09-10-2026: `lanak-notifications` estaba publicada sin `verify_jwt` y sin mirar quién
llamaba, y un modo de depuración olvidado devolvía la columna entera de DNI de la hoja de Lanak a
cualquiera. Otras cuatro mandaban correos y WhatsApp a personas reales igual de abiertas. **La
clave anónima no protege nada**: va dentro de las apps. Y un cron apagado no cierra la función: la
dirección sigue respondiendo.

- **Toda función sin `verify_jwt` comprueba por dentro quién llama**: el secreto del cron con
  `verify_cron_secret` (patrón de `geocode-workers`), una llave de servidor con
  `_shared/quien-llama.ts`, o la firma del proveedor si es un webhook.
- **Nada de modos de depuración en producción** que devuelvan datos. Si hace falta mirar algo, se
  mira con una consulta, no con un `case` que se queda olvidado.
- **Cerrarla sin cortar el servicio va en dos pasos**: primero los crons empiezan a mandar el
  secreto (la función todavía lo ignora), y después la función empieza a exigirlo. Se comprueba
  con la siguiente ejecución del cron (`net._http_response`) y con una llamada sin secreto, que
  tiene que dar 401.
- **La prueba del 401 se hace con la clave anónima de verdad (`.env`) y un secreto falso**, para que
  llegue a la función y conteste ella. Con el marcador de `.env.example` sale `Invalid JWT` de la
  plataforma y parece que la comprobación funciona cuando no se ha probado.
- **Para saber si un cron sigue entrando tras cerrarla**: que no aparezca ningún 401 en
  `net._http_response` desde el despliegue (un 401 es instantáneo), reconocer cada función por la
  forma de su respuesta, y un efecto en la base. Los registros de funciones (`function_edge_logs`)
  llegan tarde e incompletos para las llamadas desde la base.
- **Antes de atribuir un envío a una función, mira de dónde sale de verdad**: el 09-10-2026 lo que
  parecían correos de una función abierta eran clics apuntados por `brevo-webhook`, y la captación,
  una carga de Excel del panel.
- **Un secreto que estuvo escrito en el código está quemado**: queda en el historial de git. Se
  rota en el almacén y en el entorno de funciones a la vez. `supabase secrets list` da la huella de
  cada valor para comparar sin sacarlo.
- **Antes de rotar, busca dónde más está escrito**: el 09-10-2026 el de Slack aparecía además en los
  argumentos de cuatro disparadores (`pg_trigger.tgargs`, que cualquiera con acceso al catálogo lee),
  en el código de otra función y en migraciones viejas. Se busca sin sacarlo: `position(secreto in
  ...)` en `pg_trigger`, `pg_proc` y `cron.job`, y huellas sha256 en el código descargado. Se genera en
  una variable de shell, se ensaya el bloque con un valor de mentira que se deshace, y se cambian
  entorno y almacén con un segundo de diferencia. Y ojo: `supabase secrets set` sube la versión de
  todas las funciones sin cambiar su código; no es otra sesión desplegando.
- **Cerrar una Edge Function no basta si una función de la base la llama por dentro con la llave de
  servidor**: esa función de la base es la puerta trasera. El 09-10-2026, tras cerrar 11 funciones,
  tres de la base que las llamaban seguían ejecutables por cualquiera con sesión (también un
  trabajador). Al cerrar una Edge Function, busca quién la llama desde la base (`invoke_edge_function`,
  `net.http_post`) y comprueba que esas funciones no las pueda ejecutar `authenticated` ni `anon`.
- **Nunca `select *` de `net.http_request_queue`**: trae las cabeceras de la petición, con la llave
  dentro. El 09-10-2026 así quedó escrita la llave de servidor en el registro de una sesión. Para mirar
  la cola, solo `id`; para la respuesta (`net._http_response`), `status_code` y `left(content, …)`.
- **Leer el rol del token sin comprobar la firma no protege nada**: con `verify_jwt` apagado,
  `JSON.parse(atob(token.split('.')[1])).role === 'service_role'` deja pasar un token inventado (siete
  funciones lo hacían). Se compara la llave entera con `llamaElSistema(req)`. Y con `verify_jwt`
  encendido, la clave anónima es un JWT válido: un id en el cuerpo sigue sin probar nada.
- **Para buscar funciones que no miran quién llama, no exijas que lean el cuerpo**: las que no lo leen
  (`Deno.serve(async (_req) => …)`) se escapan de esa búsqueda.
- **Probar con la credencial buena sin efectos**: usar `dry_run` si lo tiene, o llamar cuando lo
  pendiente es cero (comprobado en la misma sentencia).
- **Los secretos viven en dos sitios**: el entorno de las Edge Functions (`supabase secrets list`) y
  el almacén de la base (`vault.secrets`, solo nombres). El 09-10-2026 se dio por "no configurado"
  Twilio porque no estaba en el entorno, y sí estaba en el almacén, usado por las funciones de la base.
  Antes de decir que algo no está, mira los dos.
- **Al buscar en código que lleva secretos, el `grep` los imprime**: filtra la salida desde el
  principio (`sed -E 's/[a-f0-9]{64}/<<SECRETO>>/g'`).
- **Un id de usuario que llega en el cuerpo de la petición no prueba nada**: `generate-shifty-breakdown`
  se fiaba de él, y cualquiera que supiera el id de un interno podía generar el desglose de una
  factura. La identidad sale de la sesión validada contra Auth (`_shared/quien-llama.ts`).

---

## 3. Vistas

- **Una vista hereda la RLS de las tablas que lee solo si es `security_invoker`.** Por defecto no lo
  es: una vista normal se ejecuta con los permisos de quien la creó y **se salta la RLS**.
- **Tras cada `CREATE OR REPLACE VIEW` hay que re-aplicar `security_invoker = true` y el
  `grant select`.** Postgres los pierde al recrear y **no avisa**: la vista queda viva devolviendo
  cero filas al usuario normal, sin error. El 2026-06-12 dejó una bandeja en blanco.
- Hoy hay **6 vistas marcadas como `SECURITY DEFINER`** por el analizador, entre ellas
  `cost_center_onboarding_with_steps`, que es la que decide quién puede publicar anuncios. Revisar si
  cada una lo necesita de verdad.

---

## 4. El estado real, medido el 2026-09-18

Se mide con `shared/auditar-seguridad.sql`, que son siete consultas de solo lectura.

| Cuántos | Qué es | Cómo de grave |
|---|---|---|
| **128** | Funciones `SECURITY DEFINER` llamables **sin haber iniciado sesión** | Ver abajo: la mayoría comprueban por dentro |
| **15** | Vistas que enseñan con los permisos de quien las creó, y las lee alguien de fuera. **9 sin necesidad de cuenta** | Ahí la RLS de las tablas de debajo no se aplica |
| 5 | Funciones sin `search_path` fijado: la de la comisión, la del Gold, la de la tarifa, la del origen de la comisión y la del castigo por cancelar | Son INVOKER, así que es menor. Se arregla en una línea cada una |
| 188 | Funciones de trigger publicadas como si se pudieran llamar | Superficie que no pinta ahí; no suele hacer daño |
| 84 | Tablas con RLS y sin ninguna política | No es un agujero: no entra nadie. Es una pantalla rota esperando |
| 4 | Extensiones instaladas en `public` | Menor |
| 1 | Protección de contraseñas filtradas **desactivada** | Se enciende en el panel de Supabase |
| 0 | Tablas sin RLS, columnas de dinero en coma flotante, fechas sin zona | ✅ Esto está bien y hay que mantenerlo |

### ⚠️ Cómo se leen esas 128, porque el número asusta y engaña

El 2026-09-18, de las 128 llamables sin cuenta: 28 eran funciones de trigger (no se pueden llamar de
verdad), y de las 127 restantes **86 comprobaban por dentro quién llamaba**. De las 41 que parecían
abiertas, al leerlas, **la familia entera del portal de la ETT sí comprobaba**, con un helper que el
patrón de búsqueda no conocía. Quedaron 26, y de esas la mayoría son públicas a propósito: el alta de
una empresa desde la web, la versión mínima de la app, el contador de visitas, el CV público.

**Ese es el orden y no se salta: medir, leer la función, y solo entonces decidir.** El primer número
era 128; el de verdad son un puñado. Decir "hay 128 puertas abiertas" habría sido falso, y habría
hecho que la siguiente alarma —la de verdad— se leyera con desconfianza.

**Lo que sí quedó señalado para mirar una a una**, porque escriben o leen sin comprobar quién llama y
no parecen públicas a propósito: la familia que publica y edita el onboarding de un local, la que fija
las imágenes de vestimenta, la que registra un acuerdo ETT firmado, y una función de mantenimiento de
la RLS. No están confirmadas como agujeros: están sin confirmar, que es distinto.

Las vistas con `SECURITY DEFINER` que había el 2026-09-02 ya no salen. **Pero el analizador no
mira lo que de verdad se escapa hoy**: los almacenes de ficheros marcados como públicos y los
permisos que comprueban que eres *alguien* en vez de comprobar que eres *el dueño de esa fila*. Eso
está en `security/PRIVACIDAD-DATOS-PERSONALES.md`.

### ✅ El agujero que había, y cómo se cerró (2026-09-02)

**Cerrado.** Las 13 tablas que estaban abiertas ya tienen RLS; ninguna es accesible sin cuenta, diez
están cerradas también a los usuarios con cuenta, y tres solo las lee un interno activo. Se hizo en
cuatro migraciones con verificación entre cada una y ningún cron falló. El detalle y las lecciones
están en `Docs/docs/shared/PENDIENTE.md`.

**Las tres lecciones que valen para la próxima vez:**

1. **Antes de encender la RLS, mira quién es el dueño de la tabla.** Si es `postgres` y
   `relforcerowsecurity` es falso, los crons que corren como `postgres` se la saltan y no se rompen.
   Eso convirtió un cambio que parecía arriesgado en uno seguro.
2. **Cerrar la tabla no basta si una vista la expone.** `v8_wcp_pending` es `SECURITY DEFINER`,
   leía los datos de skills y la podía leer un anónimo: cerrar solo la tabla no habría tapado nada.
3. **Un trigger corre como quien dispara la escritura.** El de la cola de skills salta cuando un
   trabajador edita su CV desde la app, así que encender la RLS sin más le habría roto el CV. La
   solución fue pasar la función del trigger a `SECURITY DEFINER`, no abrir la tabla.

<details>
<summary>Cómo estaba antes</summary>

**13 tablas tenían la RLS apagada Y el rol `anon` podía leer, insertar, modificar y borrar.**
Son unas 8.800 filas, y entre ellas:

- `v8_worker_competency_profile` (**5.899 filas**): perfil de competencias de trabajadores, con nivel,
  años de experiencia, prestigio y empleadores.
- `v8_worker_skills_extracted` (1.072): las skills sacadas de sus CV.
- `rescue_decisions` (1.691), `rescue_supply_outreach` (55, **con teléfono y el mensaje enviado**).
- `rescue_opt_outs` (10): **quién pidió no ser contactado.** Cualquiera puede borrar esas filas, y
  entonces se les volvería a escribir. Eso es un problema de protección de datos, no solo técnico.
- `tarifa_recommendations` (46): tarifas de mercado con suelo, techo y el mensaje al cliente.
- Más `rescue_config`, `rescue_health_log`, `tarifa_supply_cache`, `v8_skill_catalog`,
  `v8_skill_extract_queue`, `v8_position_skills_extracted` y `_sara_backlog_cutoff_20260629`.

</details>

**Sigue pendiente** de la misma familia: activar la protección de contraseñas filtradas, revisar las
6 vistas `SECURITY DEFINER`, fijar el `search_path` en las 124 funciones que no lo tienen, y repasar
las 72 tablas con RLS pero sin ninguna política. Ver `Docs/docs/shared/PENDIENTE.md`.

---

## 5. Al revisar si algo es seguro

**Una revisión entera del sistema** (no de una tabla) se hace con `security/PLAN-REVISION-SEGURIDAD.md`:
bloques, método y estado de cada punto. La prueba de ataque de verdad, con sesión de empresa y de
trabajador de prueba contra identificadores ajenos, es `security/probar-como-atacante.sql`.
Desde el 30-10-2026 una función nueva **nace sin permiso para `anon`** (privilegios por defecto): si
tiene que ser pública, el `grant` se escribe a propósito.

Cuatro comprobaciones, en este orden:

1. **¿La tabla tiene RLS encendida?** Si no, todo lo demás da igual.
2. **¿Qué puede hacer `anon` y qué puede hacer `authenticated`?** No mirar solo el SELECT: el
   INSERT, UPDATE y DELETE también.
3. **¿La política filtra de verdad?** Una política que dice `true` no filtra nada.
4. **¿La función impone el alcance o lo acepta por parámetro?** Aceptarlo por parámetro sin
   comprobarlo es el fallo más común y el más caro.

Para el estado global, el analizador de Supabase da los avisos de seguridad ordenados por nivel.
Los ERROR se miran siempre; los WARN se leen con criterio, porque muchos son el permiso amplio de
un patrón que se defiende por dentro.

---

## 6. Lo que no se hace nunca

- **Crear una tabla sin RLS**, ni siquiera temporal. Las tablas temporales son las que se quedan.
- **Dar permisos a `anon`** sin un motivo escrito.
- **Aceptar el alcance por parámetro** (un `company_id`, un `worker_id`, un `payer_id`) sin
  comprobar que quien llama tiene derecho a él.
- **Poner una clave o un secreto en una tabla con RLS floja.** `bot_shared_secrets` tiene RLS con
  cero políticas, que es lo correcto: nadie la lee desde el cliente.
- **Commitear un `.env`** ni enseñarlo por pantalla.
- **Desactivar RLS "un momento para probar".** Se prueba con `service_role`, que ya la salta.

---

## 7. Datos personales: lo que se decide antes de crear nada

Escrito el 2026-09-17, después de la revisión de privacidad que encontró la residencia probable de
15.212 trabajadores legible sin tener cuenta y los partes médicos de bajas colgados en abierto.
El informe entero está en `security/PRIVACIDAD-DATOS-PERSONALES.md`.

**Un dato personal no es solo el nombre.** En Shifty lo son el NIF, el IBAN, el número de la
Seguridad Social, la fecha de nacimiento, el sexo, el teléfono, el correo, la dirección y sus
coordenadas, la foto, el vídeo de entrevista, el CV, las ubicaciones, los comentarios que escribe una
persona, y **cualquier cosa calculada a partir de eso**: dónde vive probablemente, dónde suele
trabajar, su puntuación de fiabilidad. Lo calculado es dato personal igual que lo declarado, y se
protege igual. Del lado del cliente lo son el correo y el teléfono del contacto, y su IBAN.

**Y hay uno que juega en otra liga: los justificantes médicos.** Son datos de salud. La ley los
protege más que a los demás y nuestra propia política dice que se tratan solo con consentimiento
explícito. Nunca van a un sitio donde los vea alguien que no sea interno.

### Las cuatro preguntas

Se responden **en la propuesta, antes de crear**, y se escriben en el comentario de lo que se crea.
No hay quinta pregunta y no se salta ninguna:

1. **¿Qué dato de una persona lleva esto, y hace falta de verdad?** Si una pantalla necesita saber si
   el trabajador tiene IBAN, la columna que se guarda es *tiene IBAN*, no el IBAN. Si lo que hace
   falta es la distancia a un centro, se guarda la distancia, no las coordenadas de su casa.
2. **¿Quién tiene que verlo?** Y se escribe la lista corta: el propio trabajador, la empresa con la
   que tiene relación, un interno activo, nadie. **"Cualquiera con cuenta" no es una respuesta.**
   Es lo que dicen hoy los permisos que dejan a un trabajador bajarse los contratos de los clientes.
3. **¿Cuánto tiempo se guarda?** Con un número. Si la respuesta es "para siempre", hay que poder
   decir por qué, y casi nunca se puede. Lo que no caduca solo, no caduca.
4. **¿Qué pasa con esto cuando la persona se da de baja?** Se borra, se anonimiza o se queda por una
   obligación legal concreta. Si se queda, se dice cuál.

**Todo cambio de datos personales apunta su entrada en `security/POLITICA-PRIVACIDAD-PENDIENTE.md`**,
en el mismo trabajo: qué cambia, desde cuándo y qué frase de la política habría que tocar. La
política no se reescribe a cada cambio: se actualiza por tandas cuando Crescente dice "actualicemos"
(decisión del 30-09-2026).

### Las seis trampas de esta base, que ya han mordido

1. **Los permisos son por fila, no por columna.** Dejar que una empresa vea a un trabajador es
   dejarle ver **la fila entera**, con su IBAN dentro. Cuando el que mira no es el dueño del dato,
   **no se le da la tabla: se le da una vista con las columnas que le tocan**, con
   `security_invoker` y su `grant` reaplicados.
2. **Las vistas materializadas se saltan la RLS.** Son una foto guardada: quien puede leerlas las lee
   enteras. **Una vista materializada con datos de personas no se otorga nunca a `anon` ni a
   `authenticated`.** Si la necesita una app, se sirve por una función que filtre.
3. **Un almacén de ficheros marcado como público no tiene ningún permiso: es internet.** El enlace no
   caduca, no pide cuenta y no se puede retirar. **Los ficheros de personas van en almacén privado y
   se sirven con enlace firmado.** Y al crear un almacén se mira también quién puede **subir**: un
   permiso de subida que solo comprueba el nombre del almacén deja a cualquiera dejar ficheros ahí.
4. **Comprobar que eres alguien no es comprobar que eres el dueño.** Una condición que dice "existe
   alguna empresa tuya" deja leer las filas de las otras 447 empresas. La condición tiene que
   **comparar la empresa de la fila con la del que pregunta**. Es el fallo del registro de actividad
   y el más caro, porque la pantalla funciona igual y no se nota.
6. **Una función `SECURITY DEFINER` otorgada a `authenticated` es una puerta del mismo tamaño que
   una tabla sin RLS.** Hay 1.106 así. Cerrar la tabla no sirve de nada si una función la lee por ti
   y contesta a cualquiera: `get_shift_detail_view` devolvía NIF, teléfono y fecha de nacimiento del
   equipo de **cualquier** turno a **cualquiera con sesión**, incluidos los trabajadores, y los
   identificadores de turno los puede listar todo el mundo. La pregunta no es qué tabla lee la
   función, es **qué pasa si la llama alguien que no debería con un identificador que sí puede ver**.
   Y ojo al patrón de las dos gemelas: cuando existen `x` y `x_for_company_user`, la buena suele ser
   la segunda y casi nadie la usa.

5. **Borrar la fila no borra el fichero.** El borrado de cuenta anonimiza bien la base y deja 332
   documentos de identidad en el almacén. Lo que se guarde en un almacén se apunta en la lista de lo
   que hay que borrar al darse de baja, el mismo día que se crea.

### Antes de quitarle un permiso a una función: comprobar bien si se usa

Escrito el 2026-09-17, el mismo día que costó una pantalla caída en producción. Se cerraron 22
funciones a las apps dando por buena una búsqueda de `rpc('nombre'` en el código. **Cuatro sí se
usaban**, escritas envolviendo el cliente para saltarse los tipos, que ese patrón no ve, y una más
la llamaba el sales-tool aunque en el código solo apareciera en un documento de plan. La ficha del
candidato dejó de cargar y nadie se enteró hasta que lo vio Crescente.

1. **Busca el nombre pelado entrecomillado**, no `rpc(` delante. En los cuatro repos de producto, en
   el sales-tool y en las funciones edge.
2. **Mira con qué clave llama cada función edge.** Con la de servicio, los permisos no le afectan.
3. **Mira si la usa una tabla por dentro**: un índice, un valor por defecto, una comprobación
   (`CHECK`) o una política. Ahí la función se ejecuta con el rol de quien escribe en la tabla, y si
   ese rol (a menudo `anon`, desde un formulario) pierde el permiso, **falla el alta entera**, no la
   función. El 09-10-2026 se le quitó a `anon` el permiso de `_canonical_es_phone`, que usa un índice
   de `recruitment_leads`: 7 altas de leads de formularios fallaron hasta el 10-10 y no se pudieron
   recuperar. Se ve con `pg_depend` (`refclassid = 'pg_proc'` contra índices, `pg_attrdef`,
   `pg_constraint` y `pg_policy`). Las funciones de las políticas de `storage.objects` las ejecuta
   además el gestor de ficheros.
4. **Después de quitarlo, mira los logs**: `permission denied for function` en `postgres_logs`. Es
   la única comprobación que no se puede engañar, porque la hace el tráfico de verdad. Si aparece
   algo, se devuelve el permiso en el momento y se mira por qué se escapó. **Y vuelve a mirar al
   día siguiente**: un formulario que se usa poco tarda horas en dar la señal.

### Corregir un dato de una persona sin que el valor viaje

Aprendido el 09-10-2026 al corregir 8 NIF leyendo su documento. El valor nuevo no debe pasar por la
conversación, por un registro de actividad ni por un mensaje de error (regla 20):
- Se escribe en un fichero temporal (sin imprimirlo) y se ejecuta con
  `supabase db query --linked -f <fichero>` desde una carpeta enlazada al proyecto, con la salida
  pasada por un filtro que tape el dato (`sed -E 's/[0-9XYZ][0-9]{7}[A-Z]/<<NIF>>/g'`): si algo falla,
  el error lleva la consulta entera dentro.
- El rastro en `activity_log` dice qué se hizo, por qué y de dónde salió, **nunca el valor**.
- Las imágenes de documentos se descargan a una carpeta temporal y se borran en cuanto se han leído;
  los ficheros con los valores, igual al terminar.
- Si una función del equipo exige sesión de una persona, no se suplanta a nadie: o se hace con un
  rastro honesto (`actor_type = 'system'` y el motivo), o lo hace una persona desde el panel.

### Cómo se comprueba que ha quedado bien

No vale mirar el código: **se pregunta desde fuera con la clave pública que va dentro de las apps**,
que es exactamente lo que haría cualquiera. Tres preguntas, y las tres tienen que dar vacío o error:

1. Pedir la tabla o la vista nueva **sin cuenta**.
2. Pedirla con la cuenta de un trabajador cualquiera, buscando filas que no sean suyas.
3. Pedirla con la cuenta de un usuario de empresa, buscando filas de otra empresa.

Y si hay ficheros, pedir uno **sin ninguna credencial**. Si contesta, el almacén es público, diga lo
que diga el código.

---

## 8. RGPD: las preguntas que se hacen mientras se construye

> ⚠️ **Esto no es asesoramiento legal.** Es la lista de lo que hay que tener pensado y escrito, para
> que cuando lo mire un abogado no se encuentre con que hay que rehacer la mitad. Lo que Shifty tenga
> firmado o registrado no consta aquí: **eso se pregunta, no se supone.**

La ley europea de protección de datos no se cumple al final, revisando. Se cumple decidiendo bien en
el momento de crear la tabla, la pantalla o el envío. Estas son las seis preguntas, en el orden en
que aparecen al construir.

### 1. ¿Con qué derecho guardamos esto?

Todo dato de una persona se guarda por **una** razón de las que la ley admite, y hay que saber cuál
es antes de guardarlo:

| En Shifty | La razón suele ser |
|---|---|
| NIF, número de la Seguridad Social, IBAN de un trabajador | Hace falta para el contrato y para el alta. No se pide permiso: se informa |
| Teléfono y correo del trabajador | Hace falta para el servicio |
| Justificante médico de una baja | **Dato de salud.** Categoría especial: hace falta consentimiento explícito |
| Vídeo de entrevista, foto | Consentimiento, y revocable |
| Contactos raspados del CRM | Interés legítimo, y es la más frágil de todas |
| Envío comercial a alguien que no es cliente | Consentimiento, salvo excepción muy acotada |

**La frágil es la del CRM.** Hay 26.000 contactos raspados y solo cuatro en la lista de "no
escribir". Interés legítimo obliga a **avisar a la persona en el primer contacto**, a ofrecerle
oponerse, y a respetarlo para siempre. Si eso no está montado, el riesgo no es técnico, es una
sanción.

### 2. ¿Se lo hemos dicho a la persona?

Lo que la política de privacidad promete **manda sobre lo que permita la base**. Está publicada y
firmada. Si un permiso deja ver más de lo que el documento dice, **el permiso está mal, no el
documento**. Ya pasó: prometemos "el perfil profesional" y las empresas leían el IBAN y el NIF de
sus candidatos.

Al crear algo que guarda un dato nuevo, la pregunta es: **¿está este dato descrito en la política?**
Si no lo está, o se cambia la política antes, o no se guarda. Y al publicar una versión nueva, se guarda
su foto fechada en `legal/` y se conserva la huella de la versión anterior: sin esa cadena no se
puede probar qué texto aceptó cada persona el día que lo aceptó.

### 3. ¿Quién más lo toca, y hay papel con ellos?

Todo tercero que trate datos nuestros es un **encargado del tratamiento** y necesita un contrato
específico. En Shifty pasan por aquí, al menos: el proveedor de la base, el de los correos, el de los
SMS, el CRM, los enriquecedores de contactos, la pasarela de pago, la ETT colaboradora y **cualquier
modelo de lenguaje al que se le manden datos de personas**.

Tres cosas que hay que mirar y casi nunca se miran:

- **Si el dato sale de la Unión Europea**, hace falta un mecanismo que lo ampare.
- **La ETT no es un encargado cualquiera**: ella es responsable de lo suyo. Lo que se le manda y para
  qué tiene que estar acotado.
- **Meter el CV o los datos de un trabajador en un modelo** es una cesión. Antes de hacerlo hay que
  saber qué contrato hay con ese proveedor y si entrena con lo que le mandamos.

### 4. ¿Esto decide algo sobre la persona, sin que lo mire nadie?

Es la más importante de Shifty y la que más se pasa por alto. Cuando un cálculo decide **por sí solo**
algo que afecta a una persona —si se la selecciona, si se la bloquea, si se la avisa de un turno— la
ley le da derecho a saber que existe esa decisión, a entender la lógica, y a **pedir que lo mire un
humano**.

En Shifty eso incluye la puntuación del trabajador, el filtro que decide a quién se avisa de cada
anuncio, el orden en que se reparten las invitaciones, la suspensión automática por cancelar y el
puntuador de candidatos.

Al construir o cambiar cualquiera de esos, se comprueban tres cosas:

1. **Que el motivo se pueda explicar en una frase**, en castellano de persona. Si no se puede
   explicar, no se puede defender.
2. **Que quede registrado** por qué se decidió eso, no solo el resultado.
3. **Que exista una vía para que un humano lo revise**, y que la persona sepa que existe.

### 5. ¿Cuánto vive y qué pasa cuando se va?

Son las preguntas 3 y 4 de la sección anterior, y aquí está el agujero conocido: **casi nada caduca**.
Lo que no caduca solo, no caduca. Un dato que ya no hace falta y sigue guardado no es un descuido: es
un incumplimiento que además aumenta lo que se pierde el día que haya un incidente.

Al crear una tabla con datos de personas se decide **el número de meses o años**, y quién lo borra.
Si la respuesta es "para siempre", hay que poder decir por qué, y casi nunca se puede.

### 6. ¿Y si se escapa algo?

Una brecha de datos personales se comunica a la autoridad **en 72 horas** desde que se conoce, y a
las personas afectadas si el riesgo para ellas es alto. Eso significa que hace falta poder contestar,
deprisa, a tres preguntas: **qué datos, de cuánta gente, y desde cuándo estaba abierto.**

Por eso importa que cada tabla con datos personales tenga escrito quién la ve: sin eso, el día del
incidente no se puede ni acotar el daño.

---

### Lo que se hace, en la práctica, al abrir una tarea

- **Si la tarea crea o mueve un dato de una persona**, las cuatro preguntas de §7 se contestan en la
  propuesta, antes de escribir nada.
  Y se apunta su entrada en `security/POLITICA-PRIVACIDAD-PENDIENTE.md`.
- **Si la tarea toca algo que decide sobre alguien**, se comprueban los tres puntos de §8.4.
- **Si la tarea manda datos a un tercero nuevo**, se para y se pregunta qué contrato hay.
- **Si algo de esto no se puede contestar**, se dice, y se decide con Crescente. No se construye
  encima de una pregunta sin responder: eso es exactamente como se acumulan los frentes abiertos.

---

## 9. La revisión por rondas: un bucle que se mejora solo

Pedido por Crescente el 30-10-2026: *"que cada ronda apunte lo que hace falta para que la
siguiente sea más completa, y que no se vuelvan a crear estas inseguridades"*. Una ronda no termina
cuando se arregla lo encontrado: termina cuando **lo encontrado ya no se puede volver a colar sin
que salte un aviso**.

### Cómo se hace una ronda

1. **Medir, todo de golpe** (solo lectura):
   - `select * from fn_security_round();`: funciones `SECURITY DEFINER` que pueden llamar las apps,
     políticas y vistas con algo mal y que nadie ha revisado (o que han cambiado desde entonces,
     porque se compara la huella del código). **La ronda está limpia con cero filas.**
   - `shared/auditar-seguridad.sql`, entero.
   - `security/probar-como-atacante.sql`: llama de verdad, con sesión de empresa y de trabajador de
     prueba, a las funciones de lectura con identificadores de la empresa real con más turnos.
   - Funciones del servidor: `list_edge_functions` contra `security/funciones-servidor-revisadas.tsv`.
     Se lee entera cada una cuya huella (`ezbr_sha256`) no coincida o que no esté en la lista, **con
     `verify_jwt` encendido o apagado** (ver la trampa 3 de abajo).
   - Ficheros: qué ve un trabajador puro, una empresa y alguien sin cuenta en cada almacén privado.
2. **Leer, una a una**, lo que haya salido. Un aviso no es un agujero hasta que se ha leído entero
   con sus funciones auxiliares (§5 del plan).
3. **Arreglar sin romper**: mapa de impacto (código de `main`, crons, políticas, índices, funciones
   INVOKER que la llamen, registros de 24 h con el rol de quien llama), y la puerta más estrecha.
4. **Atacar otra vez**: como trabajador puro, como empresa de prueba y sin cuenta (bloqueado), y
   como el dueño legítimo (pasa). `fn_trigger_calls_without_grant()` a cero y los crons afectados en
   verde en su siguiente ejecución.
4 bis. **Que las apps sigan funcionando** (pedido por Crescente el 30-10-2026: *"fundamental que a
   los trabajadores les siga funcionando la app"*). Una ronda no se cierra sin esto:
   - Comparar, en `edge_logs`, los 401, 403 y 5xx que reciben las apps reales (agente `ShiftyWork`
     en iOS y `okhttp` en Android) en las horas de después del cambio contra las de antes, por ruta.
     Cualquier ruta nueva con errores se mira en el momento; si es nuestra, se deshace (la caja negra
     `function_versions` tiene la versión anterior de cada función).
   - **Entre ronda y ronda, la lista de permisos denegados** (pedido por Crescente el 30-10-2026:
     *"que no hayamos tapado una función por error"*). En la herramienta de registros, `source =
     'postgres_logs'` con `permission denied`, agrupado por mensaje, con cuántas veces y la última.
     Cada objeto que salga se mira: si la última vez es anterior a la ronda y el rol que lo pide no
     tenía permiso ya antes, es ruido (una app sin sesión). Si es nuevo o va a más, se cruza con
     `edge_logs` para ver quién lo pide y, si lo hemos tapado nosotros, se deshace en el momento.
     Cuidado con las tablas con permiso por columnas (`feature_flags`): `has_table_privilege` dice
     que no y la app lee bien; se mira en `information_schema.column_privileges`.
   - La herramienta de registros lee una tabla única, `logs`, filtrando por `source`; si responde
     "no existe", es la consulta mal escrita, **no** "cero denegados". El 30-10-2026 se dio por cero
     sin haberlo leído.
   - Las funciones del servidor que usan las apps, por ruta y estado en `function_edge_logs`.
   - Nada se cierra a `authenticated` sin buscar antes su nombre en Worker-App (los dos lados) y en
     los registros de 24 h con el agente de la app: la versión instalada en los móviles puede ser
     más vieja que `main`.
   - Medido el 30-10-2026 tras cinco rondas: unas 56.000 peticiones de las apps, 7 rechazos (sesiones
     caducadas y códigos mal puestos, igual que antes) y 2 lecturas fallidas en un mismo segundo que
     no se repitieron.
   - Las consultas pesadas de una ronda (el ataque en bloque) se lanzan de una en una: pueden coincidir
     con un pico de las apps.
5. **Apuntar lo revisado** en `security_function_reviews` (firma, huella, veredicto, motivo, ronda).
   Lo que se apunta no vuelve a salir mientras no cambie; si alguien lo cambia, vuelve solo.
6. **Mejorar la red** (lo que hace que esto sea un bucle y no una auditoría):
   - **Si encontraste algo que el medidor no marcó, el medidor estaba ciego.** Antes de cerrar la
     ronda se añade el patrón a `fn_security_function_flags`, `fn_security_policy_flags`,
     `fn_security_view_flags`, a `auditar-seguridad.sql` o a `probar-como-atacante.sql`, y se
     comprueba que ahora sí lo marca. `fn_review_function` usa la misma definición, así que lo
     nuevo también salta al crear una función.
   - **Si el medidor marcó algo que estaba bien**, se afina para que no lo vuelva a marcar (un
     medidor que siempre da avisos enseña a ignorarlo).
   - Se apunta en "Lo aprendido, ronda a ronda" (abajo) y en `security/REVISION-SEGURIDAD-<fecha>.md`.
7. **Otra ronda**, hasta que el medidor dé cero, el ataque no saque nada y no quede ningún ángulo
   del plan (`security/PLAN-REVISION-SEGURIDAD.md`) en 🔎 sin mirar.

### Las reglas que dejaron las rondas, para no volver a crear el agujero

1. **Una función que solo lanza un cron o el servidor nace sin permiso para las apps**:
   `revoke execute ... from public, anon, authenticated`. Los nombres `auto_`, `expire_`,
   `process_`, `claim_`, `invoke_`, `run_`, `renew_`, `timeout_`, `refund_` o terminados en
   `_cron`/`_batch` lo marcan solos. Ronda 1: once crons, entre ellos marcar facturas como pagadas,
   y `send_bot_message`, con la que cualquiera escribía como el bot de Shifty.
2. **Quien hace la acción sale de la sesión, nunca de un parámetro.** Si la firma lleva
   `p_updated_by`, `p_changed_by`, `p_author_id`…, dentro se compara con `auth.uid()` o se pisa
   con ella. Ronda 2: un trabajador cambiaba su IBAN dejando en el historial que lo había hecho un
   interno, justo el rastro que se mira en una disputa de pago.
3. **Que la pantalla sea interna no protege la función.** Una función que usa una pantalla del
   panel exige `_require_active_internal_user()` por dentro: cualquiera con la clave pública la llama
   sin pasar por la pantalla. Ronda 1: notas y estados de la red de vendedores, proveedores de
   gastos, llamadas de activación.
4. **Una política nunca es `true` en una tabla con datos de una empresa o una persona**, y "es de la
   empresa" se pregunta con `get_my_company_ids()`, que mira que el acceso siga activo. Ronda 2:
   respuestas NPS de empresas legibles por cualquier trabajador; enlaces de alta de equipo que seguía
   viendo y cambiando un usuario desactivado.
5. **`verify_jwt` encendido no protege nada por sí solo**: la clave pública es un JWT válido. La
   identidad sale de `auth.getUser()` o de `_shared/quien-llama.ts`.
6. **Funciones nuevas nacen cerradas a `anon`** (privilegios por defecto desde el 30-10-2026).
7. **Toda función del servidor arranca con su puerta**, aunque tenga `verify_jwt`: `sistemaOInterno` si
   la lanzan crons o el panel interno, la sesión y el dueño del dato si la usa una app, la firma del
   proveedor si es un webhook. Un secreto se compara entero y en tiempo constante, nunca un trozo de
   la llave (ronda 4: el código de firma de contratos se podía fabricar con la cabecera pública de un
   token). Y antes de desplegar, `scripts/comprobar-puertas-funciones.sh` en Web-Panel.
8. **Lo que no se usa, se retira.** Una función del servidor sin llamadas en apps, crons ni base es
   superficie sin dueño: se cambia por una que conteste 410 (su código queda en git) y se apunta en el
   registro. Borrarla del todo es decisión de Crescente.

9. **Una tabla que la app escribe directamente necesita una guarda de columnas.** La RLS dice qué
   filas, no qué columnas: una empresa que puede editar su jornada podía cambiarse la comisión o el
   estado. El patrón es un disparador que deja pasar todo lo que no viene de una sesión de app y,
   si viene de una, rechaza los cambios en columnas de dinero o estado salvo a internos
   (`fn_guard_job_day_internal_columns`, `fn_guard_cost_center_internal_columns`).
10. **Todo lo que manda un SMS, un correo o gasta IA lleva tope.** Por número o persona, por IP y en
    total, con ventanas de una hora como mucho (`check_rate_limit` limpia lo de más de 2 h). La IP
    buena es `cf-connecting-ip` (`_shared/ip-de-quien-llama.ts`; en la base, `fn_request_client_ip`):
    la primera de `x-forwarded-for` la pone quien llama. El tope falla abierto: si se cae, no corta
    el servicio.
11. **Una redirección pública solo va a destinos que ya estaban escritos**, y lo que cambia algo de
    una persona (una baja) va por POST, nunca por un GET que abren escáneres y vistas previas.

12. **Si una tabla la escriben las apps solo por funciones, su regla directa se cierra.** Una regla de
    alta o de cambio que nadie usa (comprobado en `edge_logs`: ningún POST o PATCH de las apps a esa
    tabla en 24 h) es una puerta que salta la función y sus comprobaciones. Se pone a `false` y queda
    la función, que es `SECURITY DEFINER`. Rondas 25 a 27: altas de la Seguridad Social, favoritos e
    historial.

13. **Quitar el acceso a alguien del equipo corta también su cuenta.** Hay funciones del servidor que
    miran "es interno" sin mirar `is_active`; por eso `admin_set_internal_user_active` cierra sus
    sesiones y bloquea la cuenta (si no es además trabajador, empresa o socio). No se desactiva a nadie
    con un UPDATE a mano.
14. **Lo que vive en `public` y no es nuestro también sale por la API.** Las extensiones de Supabase
    (`plpgsql_check`) no se pueden cerrar con permisos; la API tiene una comprobación previa,
    `fn_api_pre_request` (`pgrst.db_pre_request`), que corta `/rpc/plpgsql_*`. Si algún día da guerra:
    `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config'`.
15. **"Es de esta empresa" en una regla se escribe con el ayudante, nunca con una subconsulta suelta.**
    `company_user_id = (select cu.id from company_users cu where cu.auth_user_id = auth.uid())` falla
    dos veces: no mira `is_active` (un usuario dado de baja seguía viendo sus chats) y revienta con
    quien tiene varias empresas ("more than one row"). Se usa `IN (select get_my_company_user_ids())`
    o `get_my_company_ids()`. Lo mismo para "es interno": `(select is_internal_user())`.
16. **Un tercero con llave (un partner, una integración) solo abre sesión en lo que es SUYO.** Que
    la llamada esté firmada prueba quién es el partner, no que la cuenta le pertenezca. Antes de
    generar un enlace de acceso se compara la empresa de esa cuenta con el partner, y nunca se abre
    sesión de un interno. 31-10-2026: `partner_create_or_login_company` devolvía "existing" para
    cualquier usuario de empresa activo con ese correo, y `partner-sso-handoff` le daba el enlace:
    los dos partners activos podían entrar como cualquiera de 474 clientes.
17. **Un formulario público que no prueba la identidad no ata a nadie que ya exista.** Si quien
    escribe un teléfono no ha demostrado que es suyo (código, sesión), el formulario solo crea fichas
    nuevas; a una persona que ya está en Shifty no se la mete en nada, ni se le manda nada. 31-10-2026:
    el enlace de alta de equipo metía en el equipo de esa empresa a cualquier trabajador cuyo teléfono
    se escribiera, y le llegaba el correo.
18. **La RLS "edita tu propia fila" deja editar TODAS las columnas de la fila.** Lo que la persona no
    debe cambiar (lo verificado, lo que mueve dinero, lo que decide el sistema) necesita un disparador
    que lo guarde, columna a columna. 31-10-2026: con el documento aprobado, el trabajador reescribía
    su DNI (que viaja a la hoja de Lanak) y su fecha de nacimiento (que salta la edad) con una
    escritura directa; la guarda existía solo para el nombre. Para encontrarlas: escribir cada
    columna sensible como el propio usuario, en una transacción que se deshace, y leer el valor después.
19. **Todo lo que manda un correo, SMS o WhatsApp a una dirección que escribe quien llama lleva tope
    por persona**, aunque exija sesión: una empresa se crea sola desde la web. 31-10-2026:
    `send-signature-otp` mandaba desde soporte@ a cualquier dirección sin límite.
20. **Una lista de claves "ocultas" en una política envejece mal.** `app_config` se abre a cualquier
    sesión salvo una lista de claves prohibidas, y cada clave interna nueva queda a la vista hasta
    que alguien la añade (31-10-2026: el contrato del bot de empresas, 900 KB, y los remitentes de
    WhatsApp). Al crear una clave interna se añade a la lista en el mismo cambio; lo limpio sería
    pasar a una lista de las que sí se pueden leer.
21. **Un servicio fuera de Supabase que escribe con la llave de servidor es una puerta como una
    función del servidor**, y no sale en ninguna lista de la base. Se busca en el código de las apps
    toda dirección que no sea de Supabase (Railway, Vercel…) y se lee su código: qué pide, dónde
    escribe. 31-10-2026: el compresor de vídeo guardaba en el almacén y la carpeta que dijera quien
    llamara, sin credencial.
22. **"La persona puede editar su fila" deja editar el contenido de sus avisos**, y si un disparador
    reenvía al cambiar el contenido, eso es mandar mensajes en nuestro nombre. En tablas que las apps
    solo marcan (leído, pulsado), el permiso va por columna.
24. **Enganchar una cuenta a una ficha por teléfono se hace con el número completo, nunca con "acaba
    en".** `LIKE '%' || telefono` deja que una ficha con el teléfono corto o guardado sin prefijo se la
    quede un móvil de otro país acabado igual. Se usa `fn_mismo_telefono(a, fn_telefono_completo(prefijo,
    numero))` (01-11-2026: alta, portal de la ETT y partners).
23. **Al cambiar la condición de una política PERMISIVA de `storage.objects`, la condición tiene que
    seguir nombrando su almacén con un Y**, nunca con un O. "No es este almacén O eres interno" abre la
    subida a todos los demás almacenes. Tras cambiarla, se repite la prueba de subida en los 40.


### Trampas de las propias rondas

1. **La cuenta de prueba 666 555 444 es doble**: trabajador y usuario de una empresa de prueba. Ve
   lo de esa empresa, y eso parece un agujero sin serlo (ronda 3: "un trabajador ve contratos y
   facturas"). Para probar como trabajador se usa un trabajador de prueba **puro**, sin fila en
   `company_users` ni en `internal_users`; `probar-como-atacante.sql` ya lo elige así.
2. **Los nombres de parámetro engañan**: `p_cancelled_by_type` o `p_created_by_type_filter` no son
   un autor. El medidor solo marca los que son `uuid`.
3. **Las revisiones antiguas de funciones del servidor solo miraron las de `verify_jwt` apagado.**
   Las 128 con `verify_jwt` encendido se revisaron por primera vez en la ronda 3.
4. **Una guarda que no se puede poner dentro** (la función la usan 17 funciones con la sesión de
   cualquiera): `current_setting('request.path')` dice si la llamada vino directa de la API.
   Es el último recurso; lo limpio es quitarle el permiso a las apps. Se pregunta con el ayudante
   `fn_api_direct_call('nombre')`, y la prueba de ataque tiene que poner esa ruta o no la prueba.
5. **El ataque solo es tan bueno como los identificadores que usa.** En la ronda 1 el cálculo de
   pago de una jornada ajena no salió porque la jornada elegida no tenía horas y la respuesta venía
   vacía; en la ronda 3, con otra jornada, devolvió el coeficiente del cliente. Se eligen
   identificadores "llenos" (turnos con horas, jornadas con horario) y, si una función devuelve
   vacío con todos, se mira con qué identificador sí devolvería algo.
6. **Lo que el ataque no cubre**: funciones con parámetros que no son identificadores (texto,
   fechas, listas) y las que escriben. Esas solo las cubre el medidor y la lectura.
7. **Lo que la protección automática de esta sesión no deja hacer** (borrar del todo, escribir
   secretos): no se intenta por otro camino; se hace lo reversible y se deja el paso a Crescente.

8. **Contar filas tocadas no prueba nada**: muchos vigilantes devuelven el valor viejo sin dar error,
   así que el UPDATE "toca" la fila y no cambia nada. El ataque lee el valor después (ronda 21).
9. **Una política `true` en un catálogo no es inocua si el catálogo lleva un precio.** Puestos y vestimentas parecían nombres; el puesto lleva `fixed_hourly_rate`. Y una política que solo mira el almacén (`bucket_id = ...`) en uno público deja colgar cualquier fichero con nuestra dirección: la subida se ata a la carpeta del dueño (hilo, persona, local).
10. **Las tablas sin `company_id` ni `worker_id` se escapan del ataque por columna.** Los fichajes (`clock_events`) solo llevan `shift_id`; hay que atacarlas por la relación (turno, hilo, anuncio).
11. **Una vista de recuento siempre devuelve una fila**: con todo a cero cuando no ves nada. Se leen los valores, no el número de filas.
12. **Si una sola columna está protegida, se rechaza la modificación entera** y las demás parecen protegidas sin estarlo. Se prueba columna a columna (así salieron el método de pago a la ETT y la estimación de facturación del centro).
13. **Probar llamando a las funciones con la conexión del MCP engaña con `session_user`.** Esa
    conexión entra como `postgres`, así que una guarda que mira `session_user` (como
    `_voice_is_service`) deja pasar la prueba aunque por la API frene. Lo que salga así se repite por
    HTTP con la clave pública o se lee la guarda antes de darlo por agujero (31-10-2026,
    `voice_calls_review_list`).
14. **Contar filas no es leer columnas.** Una tabla con permisos por columna (`job_days`) deja contar
    todas las filas y aun así no dejar leer la comisión. Antes de apuntar "se ve X", se pide la
    columna concreta o se mira `has_column_privilege`.
15. **Probar con identificadores vacíos engaña**: casi todas las funciones salen pronto con un nulo
    y parecen seguras. La prueba buena llama a cada una con los identificadores reales de **otra**
    empresa y otro trabajador de prueba, y filtra las que solo repiten el id dentro de un "no
    autorizado" (falsos positivos: `delete_worker_preferences`, `get_my_offer_apply_state`).
16. **Llamar muchas funciones seguidas en la misma transacción contamina la prueba.** Una que escribe
    (meter en el equipo, cambiar el pagador) cambia lo que devuelven las siguientes, y aparecen
    "fugas" que no lo son. Cada positivo se repite con la función sola antes de darlo por bueno.

### Lo aprendido, ronda a ronda

| Ronda | Fecha | Encontrado | Qué se añadió a la red |
|---|---|---|---|
| 1 | 30-10-2026 | 14 agujeros con sesión y ~35 funciones de servidor abiertas; 187 triggers y 453 tablas con permisos que la API no usa | Privilegios por defecto sin `anon`; `security_function_reviews`; `fn_security_function_flags` (servidor por nombre, escribe sin guarda, lee por id sin guarda, sin cuenta sin guarda) dentro de `fn_review_function`; `probar-como-atacante.sql` |
| 2 | 30-10-2026 | Autor por parámetro en el IBAN y 6 cambios de ficha; NPS de empresas, borradores de marketing y análisis de locales legibles por cualquiera; enlaces de equipo para desactivados | `actor_por_parametro`; `fn_security_policy_flags` (política abierta con datos, empresa sin activo) |
| 3 | 30-10-2026 | Vistas: bien. Ataque ampliado (161 funciones, trabajador puro): el cálculo de pago de cualquier jornada daba el coeficiente del cliente. Ficheros: bien. Hueco del plan: funciones del servidor con `verify_jwt` | `fn_security_view_flags`; `fn_api_direct_call`; el ataque simula la ruta de la API, usa trabajador puro y varios identificadores; `funciones-servidor-revisadas.tsv` con la huella de cada una |
| 4 | 30-10-2026 | Las 128 funciones del servidor con `verify_jwt` nunca revisadas: 19 agujeros (código de firma de contratos fabricable, avisos falsos a personas, DNI en la respuesta, correos a cualquiera, gasto de IA) | Puerta común en 32; `funciones-servidor-revisadas.tsv` con las 287; `scripts/comprobar-puertas-funciones.sh` en Web-Panel; regla 7 |
| 5 | 30-10-2026 | 12 funciones del servidor sin uso, retiradas (410); siete más con la puerta corta o sin tope de texto; el número de documento en el historial | Regla 8; trampa 7 |
| 6 | 30-10-2026 | Topes: SMS de código, correo de verificación, altas sin cuenta, formularios de la web, invitar al equipo, CV; columnas de dinero y estado escribibles desde la app; vídeos de entrevista de cualquier tipo; redirección y baja por GET en el rastreador de correos | Reglas 9, 10 y 11 |
| 21 | 30-10-2026 | Mover filas a otra empresa con un UPDATE: nada (los disparadores devuelven la empresa sin error). Trampa: contar filas tocadas no basta, hay que leer el valor después | Trampa 8 |
| 22 | 30-10-2026 | Funciones con ids dentro de texto o JSON: las 14 se defienden con ayudantes que el patrón no conocía | — |
| 23 | 30-10-2026 | Un trabajador subía su documento con el número, el nombre y la fecha "leídos" escritos por él; una aprobación a mano sin releer los pasaba a la ficha. El vigilante los vacía al subir. El medidor aprende `tp_my_member` | Regla 12 |
| 24 | 30-10-2026 | Tiempo real: tablas con RLS y canales privados cerrados; el "está escribiendo" va por un canal público con nombre de pila (leve, pide build) | — |
| 25 | 30-10-2026 | Una empresa cambiaba a mano el estado de sus altas y bajas de la Seguridad Social; ahora solo por su función. La nota de competencias la calcula la app (leve) | Regla 12 |
| 26 | 30-10-2026 | Una empresa podía meter en favoritos a cualquier trabajador por la tabla, saltándose la función que exige relación (y eso abría su ficha); solo lo frenaba por casualidad un aviso que fallaba | Regla 12 |
| 27 | 30-10-2026 | Un trabajador podía escribir historial falso a su nombre; cerrado. Solicitudes, candidaturas, entrevistas, contratos y usuarios directos: bien frenados | Regla 12 |
| 28 | 30-10-2026 | Datos personales en cualquier tabla o vista: cada uno ve solo lo suyo | — |
| 29 | 30-10-2026 | Guion de ataque completo repetido: 161 funciones, las mismas 9 respuestas benignas. **Ronda limpia de punta a punta** | — |
| 30 | 30-10-2026 | 35 funciones del servidor miran "es interno" sin `is_active`; desactivar no cortaba la cuenta | Regla 13; Stripe x2 con interno activo |
| 31 | 30-10-2026 | Enlaces firmados a ficheros privados: la ruta sale de la base con la sesión de quien pide | — |
| 32 | 30-10-2026 | `plpgsql_check` en `public` dejaba leer sin cuenta el código de las funciones por la API | Regla 14 |
| 33 | 30-10-2026 | Rutas de servidor de la web y del panel: con tope | — |
| 34 | 30-10-2026 | Embudo comercial (`crm_dash_canal`) legible por cualquiera con cuenta | Pasada a `security_invoker` |
| 35 | 30-10-2026 | Avisos de terceros: todos con firma o secreto (Brevo, a mano) | — |
| 36 | 30-10-2026 | Bots: las herramientas atan turno e incidencia a quien escribe, aunque el modelo pida otro | — |
| 37 | 30-10-2026 | Enumeración de teléfonos, correos y CIF: con tope | — |
| 38 | 30-10-2026 | Ataque completo repetido. **Ronda limpia de punta a punta** | — |
| 39 | 30-10-2026 | Catálogos de puestos (con tarifa fija) y vestimentas de todas las empresas legibles por cualquiera con cuenta; subida libre a cualquier ruta del almacén público del chat (alojar un PDF de phishing) | `fn_my_worker_company_ids`; `fn_chat_image_path_allowed` y política restrictiva `chat_images_subida_por_hilo`; trampa 9 |
| 40 | 30-10-2026 | Ronda completa de punta a punta (funciones, tablas, ficheros, altas, medidor, servidor, denegados, apps). **Limpia** | — |
| 41 | 30-10-2026 | Ronda completa con otra empresa real y otras cuentas de prueba, y llamadas sin cuenta. **Limpia: segunda seguida** | — |
| T | 30-10-2026 | **Rondas por temas** (14 temas, cada uno hasta dos vueltas limpias seguidas; 4 vueltas en total). Hallazgos: chat y avisos sin mirar si el usuario de empresa sigue activo (y error con varias empresas); la empresa cambiaba a mano su método de pago a la ETT y su estimación de facturación; correos completos de destinatarios de facturas en el historial. Todos arreglados. Apuntado: correos y teléfonos en la URL de consultas de funciones del servidor | Regla 15; trampas 10, 11 y 12 |
