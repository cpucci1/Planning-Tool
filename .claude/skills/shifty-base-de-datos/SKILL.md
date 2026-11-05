---
name: shifty-base-de-datos
description: >
  Todo lo que hay que saber antes de tocar la base de datos compartida de Shifty (Supabase
  brgswggayexbvrnqtlhp, cientos de tablas y miles de funciones, usada por las apps, el panel y el sales-tool): las
  trampas verificadas del esquema que ya han costado incidentes, las cuatro vistas de precio y por
  qué son zona crítica, qué se congela en el turno y por qué, los feature flags y cómo no
  saltárselos, la convención de nombres, las reglas de arquitectura para no duplicar lógica, y la
  verificación obligatoria de una función nueva. Úsala SIEMPRE antes de escribir una consulta, crear
  o modificar una función o una vista, proponer un cambio de esquema, interpretar una cifra de
  negocio, o cuando alguien diga "mira en la base", "cuántos hay", "por qué sale este número",
  "crea una función", "añade una columna" o "esta consulta no devuelve lo que debería".
---

# La base de datos de Shifty

**Proyecto `brgswggayexbvrnqtlhp` (producción).** La comparten las apps de producto (app única, Client-App, panel y web) **y** el
`sales-tool`. Cualquier cambio afecta a todo a la vez. `Planning/` es el único que no la toca.

**Antes de nada:** las reglas inquebrantables están en el `CLAUDE.md` maestro y aplican enteras.
Resumen operativo: crear y cambiar no pide permiso, **solo se pregunta antes de borrar** (decidido
por Crescente el 2026-09-24), y lo que se haga se cuenta después; nada de updates directos, se usan
las RPC; nada de datos operativos ni de pago fuera de `is_test`.

---

## 1. Una lógica, un sitio

Medido contra producción el 2026-10-09 (2.110 funciones, 524 tablas) con
`fn_logic_duplication_metrics()`, que lo vuelve a medir solo cada día y avisa a #alarmas si sube. **Cada cifra puede bajar y
nunca subir.** La lista completa de preguntas y la única función que contesta cada una está en
**`shared/FUENTES-UNICAS.md`**; el plan para deshacer las copias, y cómo se hace sin romper
producción, en **`shared/PLAN-UNA-LOGICA-UN-SITIO.md`**.

| Lógica | Copias a mano | Fuente única |
|---|---|---|
| La comisión | 27 leen columnas de comisión sin el helper | `fn_commission_pct` |
| La tarifa con recargo de noche o festivo | ✅ centralizada (2026-09-18) | `fn_effective_hourly_rate` |
| Quién es Gold | 1 (la cascada) | `fn_is_gold` / `fn_workers_gold` |
| Detectar si quien llama es interno | **416**, y **ocho** helpers para lo mismo | `is_internal_user` / `_require_active_internal_user` |
| Detectar si quien llama es de la empresa | **184**; 89 eligen empresa con `LIMIT 1` | `assert_is_company_member` / `check_company_user_can` |
| Estados con números a secas | **391** | Helpers de estado (plan 2.2) |
| La nota media | **40** | `get_workers_avg_rating` |
| Escribir en `activity_log` | **41** (eran 447 el 10-10-2026) | `fn_log_activity_core` (argumentos con nombre) o su canal corto `fn_log_activity`. Nunca un `INSERT` propio |
| La zona horaria de Madrid escrita | **127** | `fn_shift_timezone` |

⚠️ **Para "¿es interno?" se usan tres:** `is_internal_user()` (sí/no), `_require_active_internal_user()`
(corta) y `fn_internal_user_id(usuario)` (el id o nulo, también con el usuario por parámetro). Los otros
seis que existen son alias desde el 10-10-2026 y lo dicen en su comentario. Para "¿es de esta empresa?":
`assert_is_company_member`, `get_my_company_ids()` y `fn_company_user_id_for(empresa, usuario)`.

Si se cambia una copia y no las otras, **el sistema contesta cosas distintas según por dónde entres,
sin dar ningún error**. Ya ha pasado: ver el punto 6.

### Las reglas

1. **Antes de escribir una comprobación, busca el helper** (`fn_find_similar`, §7 paso 0, y
   `shared/FUENTES-UNICAS.md`). Existen y casi nadie los usa:
   `assert_company_user_can` (22 usos), `check_company_user_can` (12), `_require_active_internal_user`,
   `assert_can_edit_job_day` (12), `assert_is_company_member` (2), `_chat_resolve_caller` (25, por hilo o empresa),
   `feature_flag_enabled_for_worker`, `feature_flag_enabled_for_company`.
   **Para el dinero y las reglas ya centralizadas:** `fn_commission_pct` y `fn_commission_source`
   (la cascada de la comisión y de dónde sale), **`fn_effective_hourly_rate`** (la tarifa de una hora
   con recargo de noche o festivo: el plus sube el piso del convenio, no se suma a la tarifa),
   `fn_payer_for_worker` y `fn_shifty_tramita_alta` (quién paga y quién da el alta),
   `fn_cancellation_penalty_points` (los puntos por cancelar), `fn_worker_offer_block` (si alguien
   está bloqueado para un anuncio), **`fn_hours_breakdown_on_date`** y `get_night_rate_for_job_day`
   (horas y tarifa de noche; `calcular_horas_casuisticas` ya no se llama directa, ver §6 "Horas").
   **Para lo que una empresa ve de un trabajador (25-09-2026):** `fn_company_related_worker_ids` y
   `fn_company_can_see_worker(trabajador, nivel)` (¿tiene la empresa de quien llama relación con
   esta persona? Con el nivel `'team'`, ¿está hoy en su equipo, plantilla o extra propio? Ese nivel
   es el que abre el teléfono),
   `fn_company_registered_worker_ids` y `fn_company_registers_worker` (¿la gestiona directamente, y
   por tanto puede ver su NIF, fecha de nacimiento e IBAN?), y `fn_assert_internal_or_system` (solo
   interno activo o servidor).
   **Ninguna de estas se vuelve a escribir a mano, ni en la base ni en una pantalla.**
2. **A la tercera, se extrae.** Escribir la misma comprobación por tercera vez significa que es un
   helper. Se crea sin pedir permiso, pasando la verificación del §7 y contándolo después.
3. **Añadir un parámetro NO es crear una función nueva.** Hay **28 familias con varias firmas, 57
   funciones**, casi todas por ese patrón. `upsert_subscription_plan` tiene **tres** versiones vivas.
   Con dos firmas vivas PostgREST elige, y esa ambigüedad puede tumbar el chat de las cuatro apps.
4. **Una acción, una función, y la fuente como parámetro.** El panel y la app no tienen funciones
   distintas para lo mismo. Hoy sí: la dirección de un trabajador se cambia con **tres** funciones
   (`update_worker_address`, `_v2` y `admin_update_worker_address`), el teléfono con dos, y los casos
   ETT con dos. Lo que cambia entre canales son los permisos, y eso se resuelve dentro.
5. **Nada de `_v2` conviviendo con la vieja.** Hay 11 funciones con sufijo de versión y seis parejas
   con las dos vivas, más `get_shifty_scores_v3` junto a `get_shifty_scores_v8_legacy`.
6. **Cada columna nueva nace con su comentario.** Hoy solo el **19,5 %** lo tienen (1.134 de 5.829)
   y **313 de 461 tablas no tienen ni una columna documentada**. El comentario dice qué significa y
   quién lo escribe, no repite el nombre.
7. **Los ids de estado no se escriben a fuego a secas.** Si comparas contra un número, deja el
   nombre al lado. Dos funciones que definen "turno vivo" distinto son dos pantallas que no cuadran.

### Lo que se deja de usar se MARCA, no se borra

Decisión de Crescente, 2026-09-02: **las columnas muertas no se borran.** Se marcan, para que si algo
se cae se sepa cuál era. El estándar que ya usa la base es ponerlo en el comentario:

> `LEGACY - Not populated. Frontend uses v_shifts_closed.payment_billing_total instead.`

Hoy hay **348 columnas sin información** (213 completamente vacías) y **solo 16 marcadas**. Y ojo:
las columnas legacy de `shifts` **no están vacías del todo**, tienen entre 3 y 10 filas con importes
viejos sobre 13.816. Eso es peor que vacías, porque no fallan: mienten.

⚠️ **Renombrar una columna para marcarla es un cambio destructivo**: todas las apps dependen de los
nombres. Primero se marca en el comentario; renombrar solo cuando esté verificado que no la lee nadie.

---

## 2. Las cuatro vistas de precio: zona crítica

**De aquí nace casi todo el dinero. Estas cuatro se tocan con cuidado y se verifica el resultado:
antes y después del cambio, los mismos importes en una muestra de turnos reales.**

`v_shifts_pending` · `v_shifts_closed` · `v_job_days_pending` · `v_job_days_closed`

- **Nunca calcular precios en el frontend.** Se piden a la vista y se pinta lo que devuelve.
- **Nunca sumar una vista de turnos con una de jornadas**: se solapan y se duplica el importe. Las de
  turnos son para turnos individuales; las de jornadas, solo para la parte de vacantes.
- **Tras cada `CREATE OR REPLACE VIEW` hay que re-aplicar `security_invoker = true` y el
  `grant select` a `authenticated`.** Postgres los pierde al recrear y **no avisa**: la vista queda
  viva devolviendo cero filas al usuario normal, sin error. El 2026-06-12 dejó una bandeja en blanco.

### Diferencias reales entre ellas, verificadas

| | `v_shifts_*` | `v_job_days_*` |
|---|---|---|
| Equipo propio | **exime** la comisión | **no lo contempla** |
| Coeficiente | el **congelado en el turno** | el **activo de la empresa ahora** |

La primera diferencia **no es un fallo**: la vista de jornadas es una previsión que incluye vacantes
sin cubrir, y a una vacante no se le puede saber si la cubrirá alguien de equipo propio. Lo que sí
hace es **sobreestimar** sobre la parte ya asignada si esos turnos son de equipo propio.

La segunda **sí es una divergencia**: si a una empresa le cambias el coeficiente, las dos vistas
dejan de contar lo mismo sobre turnos ya asignados.

**Desde el 2026-09-25 el coeficiente no se redondea** (D-004). Las cuatro lo pasan por
`fn_pricing_coefficient`, que lo deja exacto salvo en lo ya facturado, y el de la empresa sale de
`fn_company_base_coefficient`. Ni el 1,505 ni el redondeo se vuelven a escribir a mano en una vista.

Las dos aplican el **mínimo del convenio como suelo** al calcular el pago, así que una tarifa baja
guardada no baja el importe facturado. Lo que queda mal es la tarifa guardada, que es la que se ve.

---

## 3. Lo que se congela en el turno

Principio de Crescente: *"hay muchas cosas que se congelan en el turno para no liarla"*. Si algo
afecta al dinero de un turno concreto, **se guarda en el turno el valor que se usó**, no se vuelve a
resolver después.

**Hoy se congela:** el coeficiente (`company_coefficient_id`), el pagador (`payer_id`), las horas a
facturar (`billing_time_*`) y si es de equipo propio (`is_own_team_shift`, al completarse).

**Hoy NO se congela: el porcentaje de comisión.** Se resuelve en vivo desde la jornada, la oferta o
la empresa, y al emitir el cargo se guarda el importe pero no el porcentaje. Consecuencia: cambiar la
comisión de una empresa **cambia el precio de sus turnos aún no facturados**, y de los ya facturados
no se puede saber con qué porcentaje se calcularon.

> **Decidido por Crescente el 2026-09-02: hay que congelarlo.** Pendiente de aplicar.

**Regla para lo que venga:** cualquier concepto nuevo que afecte al precio de un turno se congela en
el turno el día que se crea, no después.

---

## 4. Los feature flags

**33 flags: 26 encendidos y 7 apagados** (tabla `feature_flags`). 28 funciones los consultan.

- **Una función sin llamadas NO está muerta.** Puede estar detrás de un flag apagado. El portal de
  empleo está apagado, así que `create_job_posting` y `update_job_posting` parecen abandonadas y no
  lo están. Igual con `hiring_service_enabled` (apagado en producción, encendido para test) y
  `category_required_documents_gate` (apagado el 2026-09-01, encendido el 2026-10-07).
- **Antes de proponer borrar o unificar algo, comprueba su flag.**
- **Siempre encendidas (`is_always_on`, desde el 30-09-2026).** Una bandera cuya funcionalidad ya es
  permanente se marca así: queda encendida para todos, la base no deja apagarla (CHECK
  `feature_flags_always_on_enabled` y `set_feature_flag_enabled`) y el panel no la enseña. **La fila no
  se borra**: las apps ya instaladas la siguen preguntando y, si faltara, la tomarían por apagada. Son
  16 (fichaje por ubicación, QR, chat, preguntas filtro, verificación por familia, equipo propio,
  fichaje manual, etc.). Quitar su comprobación del código se puede hacer poco a poco; no es urgente.
  No se marcan así los interruptores de emergencia (bots, Clara, cobros, avisos, captación).
- **Si tocas una feature con flag, usa el helper** y **prueba con el flag en las dos posiciones**.
  Un flag tiene además `enabled_for_test`, `target_company_ids` y `target_territory_ids`: encendido
  no significa encendido para todos.
- Flags que gobiernan comportamiento crítico: `document_expiration_notifications`,
  `eligibility_by_family`, `eligibility_by_subcategory` (apagado, solo por empresa piloto),
  `ad_fit_auto_reject_low_fit` (apagado, solo por empresa piloto), `own_team_enabled`, `own_team_billing_enabled`,
  `credit_verification_gate`, `qr_checkin`, `geo_clockin_proximity_check`.

---

## 5. Convención de nombres

Medida contra producción: de las 396 tablas de producto, **340 en plural y cero con mayúsculas o
guiones**.

| Elemento | Regla | Cuántos |
|---|---|---|
| Tablas | inglés, `snake_case`, **plural** | 340 de 396 |
| Claves ajenas | **singular** + `_id` | 1.062 columnas |
| Booleanos | prefijo `is_` | 147 |
| Fechas y sellos | sufijo `_at` | 879 |
| Vistas | prefijo `v_` | 31 de 69 |
| Claves primarias | `uuid`, salvo catálogos | |
| Borrado | suave, `is_active = false` | |

**Excepción reconocida:** las 66 tablas `crm_*` del sales-tool están en castellano. Es anterior y no
se migra. Si tocas ese mundo, castellano; si tocas producto, inglés. Nunca mezclar dentro de una tabla.

### Los tipos, que no son cosmética

Estas cinco no son estilo: cada una evita una clase de error que ya ha costado dinero en otros
sitios. Medido contra producción el 2026-09-18.

| Qué | Regla | Cómo está hoy |
|---|---|---|
| **Dinero** | `numeric`, **nunca `float`**. La coma flotante redondea mal por diseño, y el redondeo acaba en la nómina de alguien | ✅ 0 columnas de importe en coma flotante |
| **Fechas** | `timestamptz` siempre. España cambia de hora dos veces al año, y un instante sin zona desplaza los turnos de madrugada | ✅ 0 columnas sin zona |
| **Porcentajes** | Una sola escala en toda la base, y el nombre lo dice. Un coeficiente (el multiplicador de la ETT) **no es un porcentaje** y no lleva `_pct` | Mirar antes de crear uno: convivir dos escalas hace que el motor multiplique por 100 de más |
| **Claves ajenas** | Índice en **toda** clave ajena. Postgres no lo crea solo, y sin él cada borrado en la tabla padre recorre la hija entera | ⚠️ **402 de 880 no lo tienen** |
| **Comentarios** | Cada tabla, columna y función nace con su `COMMENT`. Es la única documentación que no se puede desfasar sin tocar el esquema | ⚠️ **344 tablas de 472, 4.536 columnas y 1.011 funciones de 1.440 sin comentario** |

Las tres primeras están bien y hay que mantenerlas así; comprobarlo cuesta una consulta. Las dos
últimas están mal y **no se arreglan de golpe**: se arregla la tabla que estés tocando, y cuando
esté, la siguiente. La consulta que mide las cinco es `shared/auditar-orden.sql`, y la pasa la
skill `auditar-orden`.

**Un apunte sobre las claves ajenas sin índice:** 402 suena a catástrofe y no lo es. Muchas son de
tablas del CRM y de experimentos que nadie borra en cascada. Lo que sí importa es que **ninguna
tabla operativa** (turnos, candidaturas, jornadas, facturas) se quede sin él, porque ahí sí hay
borrados y ahí sí hay volumen.

---

## 6. Trampas verificadas

Cada una ha costado un incidente real.

### Nombres

- **`job_days_candidates`**, plural en "days". **`job_day_candidates` NO EXISTE.** El estado no es
  `status_id` sino **`job_day_candidate_status_id`** (invitado = 1). Contar invitaciones se hace ahí,
  **no** en la tabla `invitations`. Escribirlo mal dejó **los 9 KPIs de la home a cero en silencio**
  desde el despliegue (2026-07-17). ⚠️ `governance.md` §14 todavía tiene este error escrito.
- **El nombre de la empresa es `companies.name`.** `commercial_name` no existe.
- **`interview_categories` usa `title`, no `name`.**
- **Bloqueos activos:** filtrar siempre `unblocked_at is null`, o los expirados salen activos.
- **No existen** `stripe_charges`, `payment_intents` ni `payments`, aunque `governance.md` las cite.

### Silencios

- **`supabase.rpc()` nunca lanza excepciones JS** por auth o permisos: devuelve `{data: [], error:
  null}` en silencio. La autenticación se maneja **dentro** de la RPC.
- **Nunca devolver `SQLERRM` al cliente** en un `EXCEPTION WHEN OTHERS`: enseña las tripas de
  Postgres y **esconde el bug**. El detalle va al log con `RAISE WARNING`. A 2026-07-17 quedaban ~55.
- **`jsonb_build_object` admite 100 argumentos** (50 pares). Para más, concatenar con `||`.

### Horas: el reloj miente dos noches al año

- **Unas horas nunca se cuentan restando horas de reloj.** España cambia de hora el último domingo
  de marzo y de octubre a las 02:00: esa noche un turno de 23:30 a 06:30 dura 8 h en octubre y 6 h
  en marzo, aunque el reloj diga 7. `calcular_horas_casuisticas` solo recibe horas sin fecha y no
  lo ve. Desde el 05-11-2026 las cuatro vistas de precio y las cinco funciones que reparten horas
  (`fn_pay_breakdown`, `fn_square_shift_quote`, `get_job_days_payment_breakdown`,
  `get_job_offer_draft_quote`, `get_worker_payments`) llaman a **`fn_hours_breakdown_on_date`**,
  que recibe el día y la zona y suma o resta esa hora en su tramo.
  - CORRECTO: para unas horas de un turno, `fn_hours_breakdown_on_date(día, zona, …)`; para una
    duración entre dos instantes, restar los `timestamptz`, nunca sus `::time`.
  - INCORRECTO: la noche del 24 al 25-10-2026 tres turnos de NUIT se pagaron con 1 h de menos
    (6,97 h de 7,97 reales), y el 28-03-2026 cuatro turnos se pagaron con 1 h de más. Nadie lo vio
    hasta que reclamaron.
- **La corrección solo vale desde el 01-11-2026.** Los 8 turnos anteriores afectados ya estaban
  pagados y facturados con la hora de reloj; moverlos es tocar pagos y lo decide Crescente (regla 11).
- **Antes de cada cambio de hora** (último domingo de marzo y de octubre), comprobar con una
  consulta que los turnos de esa noche salen con su duración real en `v_shifts_closed`.

### Estados que engañan

- **"Rechazado" (4) en `job_days_candidates` no dice quién dijo que no.** En una solicitud
  (`source` = `organic`) lo rechazó la empresa o el sistema; en una invitación (`source` =
  `invited`) lo rechazó **el trabajador**. Invitación y solicitud son cosas distintas y siempre se
  separan por `source`. El 2026-10-20 se recomendaron para reinvitar 6 "rechazados" de AGA y 5
  habían declinado ellos la invitación. El detalle y cómo reconocer cada una está en
  `status-ids.md`, "Invitación y solicitud no son lo mismo".
- **Una candidatura tiene como mucho UN turno, y la fila se reutiliza.** `shifts.job_day_candidate_id`
  es único, y al reinvitar o volver a seleccionar a alguien se usa su misma fila de
  `job_days_candidates`, que sigue enganchada al turno que canceló. Así que **"ya tiene turno" se
  pregunta siempre por un turno VIVO, nunca por que exista uno**; si está cancelado o en no-show, se
  reactiva ese mismo turno (no se inserta otro: el índice lo impide).
  - CORRECTO: lo que hace `select_job_day_candidates_bulk` (panel) y, desde el 03-11-2026,
    `select_job_day_candidates_for_worker` (aceptar invitación o plaza de lista de espera): mirar el
    estado del turno colgado y reactivarlo con `SHIFT_REACTIVATED`.
  - INCORRECTO: el 03-11-2026 Karen (La Musa) canceló su turno del 6-11, la reinvitaron y aceptó dos
    veces. La función de aceptar veía "ya hay turno" (el cancelado), se saltaba el día sin rastro y la
    app le decía que todo había ido bien. Abrió dos incidencias. Cualquier función nueva que cree
    turnos desde una candidatura tiene que pasar esta prueba: cancelar, reinvitar, aceptar.
- **`unpublished` NO es inactivo.** Cerrado a solicitudes nuevas, pero sus turnos confirmados siguen
  activos. Incluirlo en el monitor en directo.
- **Desde el 2026-10-01, la empresa que acepta las horas sin disputa deja el turno cuadrado en el
  acto** con sus horas: `reconcile_shift_hours` llama a `square_shift`, sin pisar un cuadre ya hecho
  ni un turno en remesa. Antes, el estado `2` con `billing_time_out` a NULL lo terminaba
  `approve_shift_payments` al aprobar el pago, y eso **solo pasa en los turnos de pago directo**. Los
  de ETT se quedaban sin cuadrar para siempre y Cobros bloqueaba su factura como "Turnos sin
  cuadrar" (NH Hoteles, septiembre de 2026). Si aparece un estado `2` sin cuadrar, primero se mira
  **quién paga ese turno**. Si es de pago directo y aún no se ha aprobado el pago, es normal y no es
  dinero sin facturar: el 2026-07-28 se presentaron 99 turnos así (≈9.300 €) como un fallo del
  sistema. Si es de ETT, está bloqueando una factura.
- **El cuadre y la cobranza van juntos.** Regla de Crescente, 2026-10-01: cada vez que se toque el
  cuadre de horas (cerrar turnos, aceptar horas, `billing_time_*`, `square_shift`, remesas), se
  comprueba qué le pasa a Cobros. Hay que mirar tres cosas: si deja turnos sin cuadrar que bloqueen
  una factura, si cambia el importe de un cargo ya emitido, y si trata igual a los turnos de ETT y a
  los de pago directo. El cargo mensual suma los turnos sin cuadrar con las horas de la empresa
  (`cost_commission_shifty_best`), así que no se cobran de menos. Pero esas horas no recortan
  "llegar antes no se paga", y el cargo puede salir unos céntimos más alto.
- **Jornada partida: `started` se mantiene durante los DOS bloques.** Solo pasa a `over` tras el
  fichaje de salida del segundo. Y al revisar horas hay que mirar los dos tramos.
- **`cancel_shift` toca dos tablas**: el turno **y** el candidato (a estado 6). Si solo se actualiza
  el turno, los recuentos de invitados y cobertura salen inflados.
- **`companies.status_id` no se mantiene**: 1 empresa como `churned` y 0 como `paused` frente a 239
  atascadas en `onboarding`. La fuga se deduce del comportamiento.

### Permisos

- **Los cuatro niveles de `company_users`:** 1 superadmin, 2 por centro de coste, 3 por ubicaciones,
  4 solo asignado.
- **Antes de escribir una consulta, comprobar qué tipo de usuario la ejecuta.** Tres tablas cuelgan
  del mismo `auth.users`. Si no se comprueba, la consulta no falla: devuelve menos filas, sin error.
  En el panel se usa `isInternalUser` del hook `useUserType()`, no `realUserType`.
- **Para el onboarding se usa `onboarding_done`, nunca `can_request_workers`.**
- **`cost_centers.can_create_announcements` es LEGACY.** La verdad está en la vista
  `cost_center_onboarding_with_steps`.
- **Crear, editar y cancelar anuncios depende EXCLUSIVAMENTE de
  `company_users.can_create_announcements`.** El nivel por sí solo no otorga nada. Sí dependen del
  nivel: ver la empresa (≤2), crear usuarios (≤2), ubicaciones y puestos (≤2), cambiar tarifa (≤2),
  centros de coste (=1), listas de favoritos (≤2 crear, =1 borrar), onboarding (≤2), superadmin (=1).
- **El pagador activo se comprueba a nivel de centro de coste**, nunca con una bandera de empresa.
- **El nivel 3 tiene que estar en TODAS las RPC de permisos**, o el panel dice que sí y la RPC dice
  que no. (2026-05-06: cuatro usuarios de Grupo La Musa con el botón activo que no hacía nada.)
- **Un clic bloqueado nunca se queda mudo.** Si la pantalla no pasa su mensaje, el despachador tiene
  que enseñar uno por defecto.

### Medir sin engañarse

- **`from_company_review_rating` trae un valor por defecto** (4 hasta febrero de 2026; 5 desde
  entonces, comprobado el 24-09-2026: 6.398 de 9.599 turnos terminados no tienen
  `from_company_review_created_at`). Una valoración cuenta **solo si esa fecha no es nula**.
- **`worker_summary_view.rating` está vacía.** Viene de `company_ratings`, que no tiene filas.
- **Una oferta cancelada (`job_day_status_id = 5`) no es demanda sin atender**: son 245 plazas sobre
  1.805 en 90 días, un 14 % de ruido. Pero **no se tiran**: se analizan en dos montones. Las
  canceladas **sin haber recibido a nadie** son un fallo de supply disfrazado.
- **Hay varias filas de turno por plaza** cuando alguien cancela y se le reemplaza. Contar solo
  `over`, `started` o `confirmed`. Una plaza cubierta tras una cancelación es un **rescate**: 226 en
  90 días que no se contaban.
- **`activity_log` registra acciones, no visitas**, y **`company_users.last_login_at` está roto**
  desde el 30 de abril de 2026. Al medir uso, excluir `COMPANY_CREATED_VIA_PARTNER`,
  `SUBSCRIPTION_CREATED` y `sent`.
- **Estacionalidad: comparar contra el conjunto**, nunca contra el año pasado.
- **Las altas precreadas por partners no son clientes que fracasaron.** De 72 altas en 60 días, solo
  11 eran clientes reales.

### Frenos de producción

- **Las conexiones de la API engordan y no sueltan la memoria mientras viven.** Cada conexión de
  PostgREST guarda lo que ha ejecutado y llega a ~230 MB; con el grupo lleno tumba la máquina de
  16 GB. Por eso existe el reciclador `monitoring.recycle_idle_postgrest` (cron 288, cada minuto,
  conexiones con más de 4 minutos de vida). Caso completo en
  `docs/incidencias-tecnico/rendimiento-postgres.md`.

### Freno comprobado después del último cambio (2026-10-15)
Un freno se da por bueno solo si se ha medido DESPUÉS del último cambio que pueda reiniciar el servicio en el que se apoya.
- CORRECTO: tras cambiar algo que reinicia un servicio (ajustes de la API, pooler, tamaño de máquina, reiniciar el proyecto), volver a mirar a los 5 minutos que el freno sigue actuando con su propio registro (para el reciclador, `monitoring.pool_recycle_log` con cierres > 0), y filtrar siempre de forma tolerante lo que nombra otro (`application_name ilike 'postgrest%'`, nunca igual exacto). Y todo freno lleva su vigilante, que avisa a #alarmas si deja de actuar.
- INCORRECTO: el 2026-10-15 el reciclador se midió a las 18:06 y funcionaba. A las 18:12 se bajó el grupo de PostgREST de 60 a 30 por la API de gestión; PostgREST reinició y pasó a llamarse `PostgREST 14.5` en vez de `postgrest`. El reciclador filtraba por el nombre exacto, dejó de cerrar ninguna conexión y la memoria volvió a 9,2 GB en media hora. No avisó nada: lo vio Crescente en la gráfica. Faltaron las dos cosas, volver a comprobar tras el cambio y un vigilante del freno.

---

## 6 bis. Cómo se modifica una función que ya está en producción

Aprendido el 2026-09-02 arreglando funciones de 400 líneas. Estas cuatro reglas evitan los cuatro
fallos que estuvieron a punto de colarse.

### No retranscribas el cuerpo: pártelo del real

Para cambiar tres líneas de una función de 16.000 caracteres hay que reescribirla entera, y ahí es
donde se cuelan las erratas. **La forma segura es leer el cuerpo de producción, aplicarle
sustituciones exactas y abortar si alguna no encuentra su sitio.** Se hace con un bloque anónimo que
lee `pg_proc.prosrc`, hace los `replace`, comprueba con `regexp_matches` que cada patrón aparecía
**exactamente una vez**, y solo entonces ejecuta el `CREATE OR REPLACE`.

Si algo no encaja, la migración falla y **no se aplica nada**. Ya salvó un cambio: una comprobación
saltó porque el patrón aparecía también dentro de un comentario.

### Un campo nuevo en la respuesta es seguro; cambiar uno existente no

Si la función devuelve `jsonb`, **añadir claves nuevas es aditivo**: las pantallas que no las conocen
las ignoran. Cambiar el significado de un valor que ya existe, o meter un valor nuevo en un campo
sobre el que la app hace un `switch`, sí puede dejar una rama sin cubrir.

⚠️ **Si la función devuelve una tabla con columnas fijas, no se pueden añadir campos** sin cambiar la
firma y romper a todos los que la llaman. Ahí solo se puede cambiar el valor de lo que ya devuelve.

### Comprueba la firma antes de escribir el `CREATE OR REPLACE`

El tipo de retorno, la volatilidad, si es `SECURITY DEFINER`, el `search_path` y los permisos hay que
sacarlos de `pg_proc` y **reproducirlos tal cual**. Escribir mal el tipo de retorno rompe la función.
Después de aplicar, verificar que siguen igual.

### Añadir un parámetro cambia la firma, y eso exige retirar la vieja

En Postgres, `CREATE OR REPLACE` no puede cambiar la lista de parámetros: un parámetro nuevo, aunque
tenga valor por defecto, es **otra función**. Dejar la vieja viva es la sobrecarga que rompe las
llamadas cortas; quitarla es un `DROP`, y borrar se pregunta antes. Así que **un cambio que pida un
parámetro nuevo se pregunta antes** (y la vieja se retira en la misma migración), o se busca otra
función que ya reciba ese dato. Aprendido el 09-10-2026 con la nota del cierre rápido.

A veces basta con **no mandar el valor**: si la función hace `COALESCE(nuevo, previo)` y la columna
nace con el valor bueno, que la pantalla deje de mandarlo hace que decida la base sin tocar la firma.
Así se resolvió el "aceptar en lote = 5".

### El comentario se pisa sin avisar

`COMMENT ON FUNCTION` pisa el anterior. Desde el 09-10-2026 la caja negra también lo guarda (columna
`comment` de `function_versions`, filas `COMMENT`), así que se puede recuperar; aun así, antes de
reescribirlo lee `obj_description(oid, 'pg_proc')` y conserva lo útil.

### Un helper que mira la sesión no sirve para quien llama sin sesión

`assert_is_company_member` y compañía preguntan a `auth.uid()`. Muchas funciones reciben el usuario
por parámetro (`p_auth_user_id`) y las llama también el servidor, sin sesión: meterles el helper las
rompe. En ese caso se usan los que aceptan el usuario por parámetro: `fn_internal_user_id(p_auth_user_id)` y
`fn_company_user_id_for(empresa, p_auth_user_id)` (cuenta activa incluida; solo los llaman otras funciones). Leer antes la guarda de sesión de la función y
quién la llama sin sesión.

### La comparación en sombra, dentro de la misma transacción

Para una función de lectura: calcular las respuestas con la versión viva, ejecutar en el mismo bloque
el `CREATE OR REPLACE` nuevo, volver a calcular, comparar y terminar con `RAISE` para que no quede
nada aplicado. Sin ruido de datos que cambian entre minutos. Y la sombra se hace contra **todo** lo
que hace la fuente de referencia, no solo contra las diferencias que ya se conocían: el 09-10-2026 el
plan esperaba 91 turnos distintos en el coste del cuadre y salieron 9.835, por una segunda causa (el
redondeo del coeficiente en periodos ya facturados) que nadie había visto. Cada diferencia se
desglosa por causa antes de aplicar.

### Un dato que se pide en un paso del alta se queda vacío: derívalo en la base

Aprendido el 09-10-2026 con MAPA Bakery: el centro se creó sin territorio porque ese paso del alta se
lo saltaron, aunque su local sí lo tenía. Una regla nueva que leía el territorio del centro la frenó
por error. Si un dato se puede deducir de otro que ya existe (el territorio del centro, del de sus
locales), la base lo rellena sola con un disparador, con rastro y sin impedir guardar. Y antes de
poner una regla que lea un dato, cuenta cuántas filas lo tienen vacío y por qué.

### Las llamadas de la base a funciones (`pg_net`): cómo leerlas sin engañarse

Aprendido el 09-10-2026 investigando "un 20 % de llamadas fallan":
- **`pg_net` procesa por tandas y cada tanda espera a la petición más lenta.** Una llamada lenta con
  espera larga retrasa todo lo que encola la base (ese día, los push pasaron de 3 s a 11-25 s por un
  barrido de Clara que tardaba 30 s). **Subir el tiempo de espera "para que no falle" empeora la cola
  de todas las demás.**
- **"Timeout of 5000 ms" no quiere decir que la función no corriera**: es la espera por defecto de
  `net.http_post`; la función sigue y termina. Para saber si una llamada llegó se mira su efecto en la
  base o la forma de su respuesta, no `function_edge_logs` (pierde muchas llamadas que vienen de la base).
- **La cola de `pg_net` no sobrevive a un reinicio de la base**: lo que esperaba se pierde sin rastro.
- El "DNS time" del mensaje de error es un reparto falso de curl; no hay problema de DNS.

### Un cambio de estructura bloquea la tabla entera mientras dura

Aprendido el 09-10-2026: borrar una restricción de `workers` (una línea) esperó a que acabaran las
consultas en curso y, mientras tanto, bloqueó la tabla **56 segundos**: 255 errores en la app de
trabajadores en iPhone y Android, y a 4 trabajadores reales les falló la pantalla de fichar. Ningún
fichaje se perdió porque en ese minuto no había entradas ni salidas previstas; la próxima vez puede
haberlas.

Cualquier `ALTER TABLE`, `DROP CONSTRAINT`, `CREATE INDEX` sin `CONCURRENTLY` o disparador nuevo sobre
una tabla que las apps leen a todas horas (`workers`, `shifts`, `job_days`, `job_days_candidates`,
`company_users`, `notifications`, `activity_log`) lleva **al principio de la migración**
`SET LOCAL lock_timeout = '3s';`: si no consigue la tabla enseguida, falla y no bloquea a nadie, y
se reintenta. Y se lanza fuera de horas punta, mirando antes en `shifts` que no haya entradas ni
salidas previstas en los minutos siguientes.

### Lo que parece de una línea y en Postgres exige borrar

- **Añadir una etiqueta a un event trigger** es DROP + CREATE (`ALTER EVENT TRIGGER` no cambia
  etiquetas): se crea otro que llame a la misma función. **Cambiar la condición de una política** sí
  se puede sin borrar: `ALTER POLICY ... USING (...)`.
- **Una regla que depende de la fecha de hoy no va en un `CHECK`**: el `CHECK` se evalúa en cualquier
  cambio de la fila, y bloquearía cualquier escritura en las fichas que ya no lo cumplen (puntos,
  bajas, crons). Va en un disparador sobre la columna.
- **Un disparador corre con el rol de quien escribe**: si llama a un helper, ese helper necesita
  `EXECUTE` para `authenticated`, o la app deja de poder guardar. Probado como empresa o trabajador
  de prueba antes de aplicar. Desde el 28-10-2026 lo mira solo `fn_review_function` (y
  `fn_review_table`) con la comprobación `disparador_permisos`, en las dos direcciones: el
  disparador que revisas, y la función a la que le quitas el permiso. La lista entera de la base:
  `select * from fn_trigger_calls_without_grant();`.
  - CORRECTO: al poner un disparador o al cerrar el permiso de una función, pasar la revisión y
    escribir en la tabla con `set local role authenticated` y la sesión de una empresa o un trabajador
    de prueba, en una transacción que se deshace. Arreglo según el caso: `EXECUTE` a `authenticated` si
    la función es inofensiva, `SECURITY DEFINER` en el disparador si no decide por `current_user`, o un
    helper `SECURITY DEFINER`.
  - INCORRECTO: el 11-10-2026 (ronda 4 del plan una lógica) el nivel del puesto se puso con un
    disparador en `position_types` que llamaba a `v8_position_level`, cerrada a `authenticated`. La
    sombra comparó los niveles como `postgres` (0 diferencias) y nadie escribió como empresa: crear una
    posición desde el anuncio del panel falló 17 días con un "Error al crear la posicion" sin motivo,
    hasta que lo reportó Chispa Bistró el 28-10.
  - Ojo con los guardas que deciden por `current_user` (`fn_guard_location_direct_update`): hacerlos
    `SECURITY DEFINER` los deja sin efecto, porque dentro `current_user` siempre es la base.

### Leer la función entera, aunque el encargo sea "solo falta X"

El 09-10-2026 la lista era "funciones que no miran si el acceso de empresa está activo", y al leerlas
tres no miraban **quién llamaba en absoluto**: cualquiera con sesión quitaba los anuncios a otro
trabajador, o subía y firmaba el contrato de cualquier centro. Una búsqueda por patrón no distingue
"guarda floja" de "sin guarda". Y para saber si una RPC se usa de verdad: `query_logs` sobre
`edge_logs` buscando `rpc/<nombre>` (en `pg_stat_statements` no aparecen).

### Antes de tocar una función que se usa en un índice, o que "solo convierte nulos"

- Una función `IMMUTABLE` puede estar dentro de un índice (`pg_index`), un valor por defecto, una
  restricción o una política: cambiar lo que devuelve obliga a reindexar o el índice miente. Mide el
  cambio sobre la entrada exacta que le llega.
- "Solo convierte nulos en el valor bueno" puede ser **una decisión sobre personas**: el 09-10-2026
  arreglar la normalización de teléfonos no cambiaba ningún resultado válido, pero 217 personas con
  campañas programadas habrían empezado a recibir WhatsApp. Sigue cada llamada hasta su efecto
  (enviar, saltar, contar topes) y cuenta personas antes de aplicar.
- **Antes de decir cuándo saldrá un envío, lee la función que envía.** El 09-10-2026 se le dijo a
  Crescente que 18 envíos atrasados saldrían "en la siguiente vuelta", y la recuperación solo manda
  lo programado para ese día exacto: lo atrasado no sale nunca si no se le da fecha nueva.
- Saca cada llamada con su argumento, no solo la lista de funciones: unas limpian la entrada antes y
  otras pasan el valor guardado tal cual.
- **No bajes una métrica sin arreglar nada**: añadir una llamada suelta al helper hace que la función
  deje de contar como copia aunque siga consultando a mano. Lo que cuenta es que la consulta a mano
  desaparezca y la sombra diga que nada cambia.
- **Repasa `function_versions` también al terminar**, no solo al empezar: otra sesión puede estar
  tocando la misma familia mientras trabajas.

### Antes de añadir rastro o una comprobación, mira la tabla, no solo la función

- **El rastro puede vivir ya en un disparador de la tabla** (el auditor genérico `fn_config_audit`
  lo usan diez). Si existe, se le pone a la tabla que falta en vez de escribir otro `INSERT`.
- **Si una pantalla escribe directo en la tabla, arreglar la función no basta**: el sitio es un
  disparador. Busca el nombre de la tabla en el código (`from('tabla')`), no solo el de la función.
- **Una comprobación de "ya existe" mira exactamente lo que mira el índice único**: la misma
  expresión (normalizada si hay disparador que normaliza) y el mismo conjunto de filas (también las
  borradas). Si no, revienta con un error técnico justo en el hueco entre las dos.
- En una sombra, `now()` es la hora de toda la transacción: para separar fases, guarda los ids de antes.

### Un parche reutilizable: lo probado es lo aplicado

Una función temporal `pg_temp.patch(regprocedure, text[] pares)` que parte de `pg_get_functiondef`,
aplica los pares de sustitución y aborta si un trozo no aparece exactamente una vez. La misma
llamada sirve para la sombra (dentro de un bloque que acaba en `RAISE`, con `SET LOCAL ROLE
authenticated` y `request.jwt.claims` para probar como cada usuario, y `RESET ROLE` antes de cada
`CREATE OR REPLACE`) y para la migración.

### Una variable que se queda sin uso es una trampa

Al quitar una condición, la variable que la gobernaba se queda asignada y sin leer. `plpgsql_check`
lo avisa, y hay que hacerle caso: **una variable muerta que antes gobernaba una comprobación invita a
que alguien la devuelva a la condición.** Se retira del `DECLARE` y del `SELECT INTO`, y se deja un
comentario explicando por qué ya no está.

---

### Volver atrás: la caja negra

Desde el 2026-10-09, cada vez que se crea o cambia una función de `public` su definición entera
se guarda sola en `function_versions` (también si el cambio se hizo con `execute_sql` o con un
bloque `DO`, que no dejan rastro en `supabase_migrations`). **Antes de aplicar, apunta el `id` de la
última fila de esa función. Si algo se rompe, volver atrás es ejecutar la `definition` de esa
fila.** Para ver qué cambió una semana: las filas con `changed_at` de esos días.

La tabla no la lee nadie con sesión: solo el servidor y el rol `postgres`.

---

### Corregir datos en bloque en `shifts`: mira antes qué se dispara

Aprendido el 09-10-2026 al pasar 4.369 valoraciones antiguas de 4 a 5. `shifts` tiene **33
disparadores**, y siete saltan con **cualquier** cambio, no solo el de estado. Dos podían hacer daño
con un cambio que no tenía nada que ver: `trigger_set_payment_pending` pone estado de pago a un turno
terminado con horas aceptadas que no lo tenga, y `fn_queue_nortempo_sync` puede encolar el turno
para la hoja de Nortempo. Esa vez daban cero, pero se supo porque se midió antes.

Antes de un `UPDATE` en bloque sobre `shifts` (o cualquier tabla con muchos disparadores): listar
los que saltan sin filtro de columna (`pg_get_triggerdef`), leerlos, y **contar cuántas filas del
objetivo cumplen la condición de cada uno**. Si alguno no da cero, no se hace así. Y cada fila
cambiada deja su rastro en `activity_log` con el valor anterior: es la vuelta atrás.

---

## 6 bis 2. Antes de decir que algo está roto, comprueba si pasa igualmente

**Regla de Crescente, 2026-09-02.** Un analizador diciendo que una función tiene un error **no
significa que la funcionalidad no ocurra**. Casi siempre hay más de un camino, y lo que está roto es
uno de ellos.

**El caso que la originó.** El verificador dijo que la función de crear facturas en bloque unía una
vista por una columna inexistente. La conclusión precipitada habría sido "las facturas por ubicación
están rotas". Y no: hay **50 facturas por ubicación**, la última de hace un mes, porque se crean
**una a una desde otro botón** que funciona perfectamente. Lo único roto era hacerlas en bloque, y
por eso nadie se había quejado.

**El procedimiento, en este orden:**

1. **Mira si el resultado existe en los datos.** ¿Hay filas de eso? ¿De cuándo es la última? Si el
   sistema lleva produciendo ese resultado hasta ayer, no está roto: está roto **un camino**.
2. **Busca los demás caminos.** Otra función que haga lo mismo, otro botón de la pantalla, una
   edge function, un cron. Casi siempre aparece.
3. **Delimita el alcance real**: a cuántos afecta, y desde cuándo. Dos centros de coste no es lo
   mismo que toda la cartera.
4. **Solo entonces**, decide si se arregla y con qué urgencia.

Decir que algo está roto cuando funciona quema credibilidad y hace que la siguiente alarma, la de
verdad, se lea con desconfianza.

---

## 6 ter. El patrón del botón mudo

**La misma regla escrita en la pantalla que enseña el botón y en la acción que se ejecuta al
pulsarlo.** Se cambia una y no la otra, y el resultado es un botón encendido que no hace nada: ni
error, ni aviso, ni pista. Es el fallo más difícil de detectar porque **no falla**.

Apareció **dos veces el mismo día**, en los dos caminos por los que un trabajador llega a un turno:

- La ficha del anuncio solo miraba la caducidad del documento si el trabajador tenía además el sello
  de onboarding. La función que le apunta la miraba siempre. **635 personas afectadas.**
- La ficha de la invitación tenía la misma condición de más. **498 personas.**

**La regla, para lo que venga:** si una pantalla decide si se puede hacer algo, y una función decide
si se deja hacer, **las dos condiciones tienen que ser la misma**. Lo ideal es que las dos llamen al
mismo sitio. Y si no puede ser, se escribe en las dos que van juntas.

---

## 7. Verificación de una función nueva

**Dos llamadas, una antes y otra después. Las dos solo leen y van por el MCP.**

0. **Antes de escribirla: ¿ya existe algo parecido?**
   `select * from fn_find_similar('palabras de lo que va a hacer', array['tablas','que','toca']);`
   Admite castellano o inglés (traduce las del negocio: comisión, turno, jornada...) y devuelve las
   15 funciones, tablas y vistas que más se le parecen, con el porqué. Se mira junto con
   `shared/FUENTES-UNICAS.md`. **Si sale una que hace lo mismo, se extiende esa**: parámetro con
   DEFAULT, nunca una gemela. Con más de dos mil funciones lo normal es que exista; así nacieron las 19
   familias del 3 de septiembre.

   **Después de crearla o cambiarla:** `select * from fn_review_function('nombre');` (y
   `fn_review_table('nombre')` para una tabla o vista). Hace en una llamada todo lo de abajo para
   esa función: una sola firma y sin ambigüedad, comentario, `search_path`, `anon`, quién llama si
   es DEFINER y recibe un id, copias a mano de reglas centralizadas (con los mismos patrones que el
   trinquete), `plpgsql_check`, volatilidad, acciones de `activity_log` sin etiqueta, disparadores
   que fallarían por permisos (`disparador_permisos`) y funciones parecidas. `fail` se arregla, `look` se lee. El vigilante de funciones te la deja escrita con los
   nombres puestos en cuanto despliegas. Lo que sigue explica el porqué de cada comprobación.

0 bis. **Después de cualquier cambio que toque un disparador, una tabla o el permiso de una
   función: `select * from fn_trigger_calls_without_grant();` tiene que dar cero filas.** Es obligatorio,
   y va además de la revisión de la función. Una fila es una tabla en la que una empresa o un
   trabajador ya no puede guardar: el disparador corre con su rol y llama a una función que no puede
   ejecutar. Y se prueba escribiendo en esa tabla como empresa o trabajador de prueba (`set local role
   authenticated` con su sesión, en una transacción que se deshace), no solo como la base. Así se coló
   el fallo de crear posiciones del 11 al 28-10-2026 (§6 bis, "Un disparador corre con el rol de quien
   escribe"). Esta consulta no ve las llamadas indirectas (disparador, helper, función cerrada) ni los
   nombres armados con `EXECUTE`: la prueba escribiendo como empresa o trabajador sí.

1. **`plpgsql_check` siempre.** Es obligatorio. PL/pgSQL resuelve los nombres **en ejecución**: una
   tabla mal escrita se despliega y solo revienta cuando la usa alguien, y si hay un `EXCEPTION WHEN
   OTHERS` no se entera nadie. El 2026-07-17 un barrido encontró **8 funciones vivas rotas desde su
   despliegue**. Falsos positivos conocidos: `_inv_weeks`, `_liv_base`, `_corr_results`,
   `_pib_day_counts` y `get_worker_company_relationship`. Todos menos el último son tablas
   temporales que se crean en ejecución y el analizador no puede ver.

   Para una función, lo pasa `fn_review_function`. Para barrer la base entera (funciones de
   disparador aparte), esta; el 10-10-2026 daba 4 filas, las tres tablas temporales de arriba y
   `update_shifts_schedule_bulk`, rota, sin uso y marcada en su comentario:

   ```sql
   select p.oid::regprocedure as funcion, c as error
     from pg_proc p
     join pg_language l on l.oid = p.prolang
     left join pg_depend d on d.objid = p.oid and d.deptype = 'e',
     lateral public.plpgsql_check_function(p.oid, format := 'text') c
    where p.pronamespace = 'public'::regnamespace and d.objid is null and l.lanname = 'plpgsql'
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and c ~* '^error';
   ```

   **Pero ojo, que una tabla temporal salga en la lista no la absuelve.** El 2026-09-02
   `preview_invite_bulk` daba ese mismo error de tabla temporal inexistente y **además** estaba
   marcada `STABLE`, y Postgres no permite DDL en una función no volátil: reventaba en cada
   llamada. El modal del panel se tragaba el error, así que invitar en bloque seguía funcionando y
   lo único que se perdía era el resumen previo. Si una función usa tabla temporal, **comprueba
   también su volatilidad**: tiene que ser `VOLATILE`.
1 bis. **NUNCA crees una sobrecarga. Modifica la función que ya existe.**

   Esta es la regla que más daño ha hecho en silencio. El patrón malo es: hace falta un parámetro
   nuevo, y en vez de cambiar la función se crea otra con un argumento más, dejando viva la vieja.

   **Por qué rompe:** si las dos versiones comparten los mismos argumentos obligatorios, cualquier
   llamada con la lista corta se vuelve **ambigua** y Postgres devuelve el error 42725,
   `function is not unique`. No elige la vieja: falla. Y como el front suele envolver estas
   llamadas en un `catch` que no mira el resultado, **la pantalla no protesta y el usuario cree que
   ha funcionado**.

   El 2026-09-03 había **19 familias así**. Una de ellas, la comprobación de disponibilidad al
   invitar, llevaba tiempo fallando: la lista de candidatos salía sin ningún aviso, así que
   aparecían como libres personas ya invitadas, ya apuntadas, en lista de espera o que ya tenían
   turno ese día, y el tope de invitaciones por jornada no se aplicaba.

   **Cómo hacerlo bien:** al parámetro nuevo se le pone un DEFAULT y se modifica la función
   existente con `CREATE OR REPLACE`. Si el cambio obliga a cambiar la firma, se retira la anterior
   en la misma migración, nunca se deja conviviendo.

   **La revisión de la función ya mira su familia.** Para barrer la base entera (una auditoría, o
   antes de retirar una versión), esta es la consulta global. Cero filas = bien:

   ```sql
   with f as (
     select p.proname, p.oid, p.pronargs as n, p.pronargs - p.pronargdefaults as minimo,
            string_to_array(p.proargtypes::text, ' ') as tipos
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
      where ns.nspname = 'public' and p.prokind = 'f' and d.objid is null
   )
   select a.proname,
          a.oid::regprocedure as una, b.oid::regprocedure as otra,
          greatest(a.minimo, b.minimo) as falla_con_n_argumentos
     from f a join f b on a.proname = b.proname and a.n < b.n
    where greatest(a.minimo, b.minimo) <= least(a.n, b.n)
      and (a.tipos)[1:greatest(a.minimo, b.minimo)]
        = (b.tipos)[1:greatest(a.minimo, b.minimo)];
   ```

   **Tres trampas al escribir esa consulta.** Las dos primeras hacen que marques como rotas
   familias que conviven sin problema; la tercera, mucho peor, hace que **se te escapen roturas
   reales**:

   1. `proargtypes` es un vector que **empieza en cero**, por eso se convierte a texto antes de
      trocear. Sin esto la consulta devuelve casi nada.
   2. No basta con que una firma sea prefijo de la otra: tienen que **solaparse los números de
      argumentos admitidos**.
   3. La comparación de tipos va en `greatest(minimo_a, minimo_b)`, **el número de argumentos más
      PEQUEÑO que las dos versiones aceptan**, no en `least(n_a, n_b)`, que es el más grande.
      La ambigüedad salta en la llamada más corta posible: si los tipos coinciden ahí, esa llamada
      encaja en las dos y falla, **aunque las firmas se separen más adelante**. El 2026-09-03 esta
      consulta estaba escrita con `least` y daba 7 familias cuando había 10. Las tres que se
      escapaban eran `create_job_posting`, `update_job_posting` y
      `update_cost_center_company_data_from_form`, precisamente porque divergen en una posición
      posterior mientras comparten los obligatorios del principio.

   Y una cosa que la consulta no dice: una familia puede tener **más de dos** versiones vivas.
   `upsert_subscription_plan` tiene tres (18, 19 y 20 argumentos). Al contar familias, contar
   `distinct proname`, no filas.

   **Que la consulta dé una fila no significa que algo esté roto AHORA.** PostgREST no resuelve por
   número de argumentos, resuelve por los **nombres de las claves** del JSON que le manda la app.
   Si la versión nueva añadió parámetros y la pantalla los envía, esa llamada acierta sola y no hay
   ambigüedad ninguna. Lo que hay es una mina: cualquier llamada futura que mande solo los campos
   comunes fallará. Así que al encontrar una familia, mirar **los sitios que la llaman de verdad**
   y qué claves mandan antes de decidir la urgencia. Ejemplo real: en `create_job_posting` el
   asistente vivo manda dos campos que solo tiene la versión nueva y funciona, mientras la ruta
   antigua `/portal-empleo/nuevo-legacy` manda solo los comunes y no puede funcionar.

   **Y cuidado al desambiguar:** al retirar la versión corta, las llamadas que hoy fallan
   **empiezan a ejecutarse**. Antes de retirarla hay que mirar qué hará la versión larga con sus
   valores por defecto. Hay dos casos reales donde arreglar la ambigüedad activaría un borrado:
   `set_ett_credit_limit` (la pantalla manda la nota vacía y la versión larga la pisa, con 219
   límites que tienen nota) y `upsert_subscription_plan` (pondría planes en autoservicio solos).

2. **Probarla con datos de test** (`is_test = true`).
3. **Ejecutar la consulta y comprobar que devuelve lo esperado**, no que compile. Que no dé error no
   significa que traiga datos.
4. **Patrón obligatorio de una RPC:** detectar quién actúa → ejecutar → **escribir en
   `activity_log`**. Una RPC que no deja rastro anula el motivo de exigir RPC.
5. **Un cambio de esquema no termina en la columna**: toca su comentario, el volcado de
   `Docs/docs/shared/` (que se **regenera**, no se escribe a mano) y la ficha de la feature.

---

## 8. Migraciones

**No se crean ficheros de migración locales.** Se aplican por MCP. Decidido por Crescente el
2026-09-02: manda el panel web, que es el criterio más antiguo.

Ningún repo refleja producción: **3.002 migraciones en producción** frente a 85 en Web-Panel (junio
2026) y 6 en Client-App (mayo 2026).

⚠️ **NUNCA ejecutar `supabase db push` desde `Client-App/`.** Crearía un segundo overload de
`get_chat_threads` → error `PGRST203` de función ambigua → **rompe el chat en las cuatro apps a la
vez**.

**Antes de tocar el esquema, consultar el estado real de producción** (`pg_proc`,
`information_schema.columns`), nunca fiarse del repo.
