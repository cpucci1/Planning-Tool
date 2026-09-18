---
name: shifty-seguridad
description: >
  Cómo se crea una tabla, una vista o una función en Shifty sin abrir un agujero: la RLS obligatoria
  y sus políticas, los permisos de los roles anon y authenticated, qué significa SECURITY DEFINER y
  cuándo se usa, el search_path fijo, y el estado real de seguridad de la base con sus errores
  abiertos. Úsala SIEMPRE antes de crear o modificar una tabla, una vista, una función o una
  política, antes de dar permisos a un rol, al revisar quién puede ver qué, y cuando alguien diga
  "crea una tabla", "añade esto a la base", "por qué no puedo leer esta tabla", "quién puede ver
  esto", "es seguro" o "revisa la seguridad".
---

# Seguridad de la base de datos de Shifty

**La clave anónima de Supabase va dentro de las apps. Es pública por diseño.** Cualquiera puede
sacarla del bundle. Lo único que separa a un desconocido de los datos es la **RLS** y los permisos
de rol. Si una tabla no tiene RLS y el rol `anon` tiene permisos, esa tabla está en internet.

---

## 1. Al crear una tabla: la lista que no se salta

Una tabla nueva no está terminada hasta que tiene las cinco cosas. **Y crear una tabla necesita
permiso escrito de Crescente** (regla 1 del maestro), así que se propone todo junto:

1. **`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.** Siempre. Sin excepción, ni siquiera "es interna",
   ni "solo la escribe un cron", ni "es temporal".
2. **Al menos una política.** RLS encendida sin políticas significa que **nadie puede leer**, que es
   seguro pero deja la tabla inservible desde el cliente. Si de verdad no la lee ningún cliente,
   déjalo así **a propósito** y escríbelo en el comentario de la tabla.
3. **Permisos mínimos por rol.** La pregunta es *¿quién necesita esto de verdad?*
   - Si solo la escribe un proceso de servidor (cron, edge function): **no dar nada a `anon` ni a
     `authenticated`**. El `service_role` se salta la RLS y no necesita permisos explícitos.
   - Si la lee el panel: política para internos.
   - Si la lee una empresa: política que filtre por su `company_id`.
   - Si la lee un trabajador: política que filtre por su propio `worker_id`.
   - **`anon` casi nunca.** Solo para datos verdaderamente públicos.
4. **Comentario en la tabla y en cada columna** (ver `shifty-base-de-datos`).
5. **Índices** para las columnas por las que se filtra, empezando por las que usa la política: una
   política mal indexada convierte cada consulta en un barrido.

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
   `check_company_user_can`, `_require_internal_user`, `assert_can_edit_job_day`,
   `assert_is_company_member`, `resolve_ett_payer_for_caller`.
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

Hoy hay **1.106 funciones `SECURITY DEFINER` ejecutables por usuarios autenticados** y **189 por
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

La plantilla con todo esto puesto es `shared/_plantilla-migracion.sql`.

⚠️ **Y al quitar un permiso, comprobar antes si se usa.** Buscar la forma de llamarla envuelta no
vale: hay llamadas construidas de otra manera. Se busca el nombre pelado y **se vigilan los logs
después**, que es donde aparece lo que se rompió.

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
3. **Después de quitarlo, mira los logs**: `permission denied for function` en `postgres_logs`. Es
   la única comprobación que no se puede engañar, porque la hace el tráfico de verdad. Si aparece
   algo, se devuelve el permiso en el momento y se mira por qué se escapó.

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
- **Si la tarea toca algo que decide sobre alguien**, se comprueban los tres puntos de §8.4.
- **Si la tarea manda datos a un tercero nuevo**, se para y se pregunta qué contrato hay.
- **Si algo de esto no se puede contestar**, se dice, y se decide con Crescente. No se construye
  encima de una pregunta sin responder: eso es exactamente como se acumulan los frentes abiertos.
