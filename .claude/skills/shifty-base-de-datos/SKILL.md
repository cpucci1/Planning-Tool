---
name: shifty-base-de-datos
description: >
  Todo lo que hay que saber antes de tocar la base de datos compartida de Shifty (Supabase
  brgswggayexbvrnqtlhp, 461 tablas, 1.363 funciones, usada por las 4 apps y el sales-tool): las
  trampas verificadas del esquema que ya han costado incidentes, las cuatro vistas de precio y por
  qué son zona crítica, qué se congela en el turno y por qué, los feature flags y cómo no
  saltárselos, la convención de nombres, las reglas de arquitectura para no duplicar lógica, y la
  verificación obligatoria de una función nueva. Úsala SIEMPRE antes de escribir una consulta, crear
  o modificar una función o una vista, proponer un cambio de esquema, interpretar una cifra de
  negocio, o cuando alguien diga "mira en la base", "cuántos hay", "por qué sale este número",
  "crea una función", "añade una columna" o "esta consulta no devuelve lo que debería".
---

# La base de datos de Shifty

**Proyecto `brgswggayexbvrnqtlhp` (producción).** La comparten las 4 apps de producto **y** el
`sales-tool`. Cualquier cambio afecta a todo a la vez. `Planning/` es el único que no la toca.

**Antes de nada:** las reglas inquebrantables están en el `CLAUDE.md` maestro y aplican enteras.
Resumen operativo: nada de crear tablas, columnas, vistas ni funciones sin permiso **por escrito**;
nada de updates directos, se usan las RPC; nada de datos operativos ni de pago fuera de `is_test`.

---

## 1. Una lógica, un sitio

Medido contra producción el 2026-09-02. La misma regla de negocio vive hoy en muchos sitios:

| Lógica | En cuántas funciones está escrita |
|---|---|
| La comisión | **46** (y 26 usan el coeficiente) |
| Detectar quién actúa (interno o usuario de empresa) | **158** |
| La guarda `is_test` | **145** |
| Estados de jornada | **55** |
| Estados de trabajador | **53** |
| El documento de identidad del trabajador | **14** |

Si se cambia una copia y no las otras, **el sistema contesta cosas distintas según por dónde entres,
sin dar ningún error**. Ya ha pasado: ver el punto 6.

### Las reglas

1. **Antes de escribir una comprobación, busca el helper.** Existen y casi nadie los usa:
   `assert_company_user_can` (22 usos), `check_company_user_can` (12), `_require_internal_user` (8),
   `assert_can_edit_job_day` (12), `assert_is_company_member` (2), `_chat_identify_caller` (23),
   `feature_flag_enabled_for_worker`, `feature_flag_enabled_for_company`.
2. **A la tercera, se extrae.** Escribir la misma comprobación por tercera vez significa que es un
   helper. Y crear una función necesita permiso escrito.
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

⚠️ **Renombrar una columna para marcarla es un cambio destructivo**: las 4 apps dependen de los
nombres. Primero se marca en el comentario; renombrar solo cuando esté verificado que no la lee nadie.

---

## 2. Las cuatro vistas de precio: zona crítica

**De aquí nace casi todo el dinero. Antes de tocar una de estas cuatro, para y pregunta.**

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
  `category_required_documents_gate` (apagado el 2026-09-01).
- **Antes de proponer borrar o unificar algo, comprueba su flag.**
- **Si tocas una feature con flag, usa el helper** y **prueba con el flag en las dos posiciones**.
  Un flag tiene además `enabled_for_test`, `target_company_ids` y `target_territory_ids`: encendido
  no significa encendido para todos.
- Flags que gobiernan comportamiento crítico: `document_expiration_notifications`,
  `eligibility_by_family`, `own_team_enabled`, `own_team_billing_enabled`,
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

### Estados que engañan

- **`unpublished` NO es inactivo.** Cerrado a solicitudes nuevas, pero sus turnos confirmados siguen
  activos. Incluirlo en el monitor en directo.
- **`hours_reconciliation_status_id = 2` con `billing_time_out` a NULL es NORMAL**: la empresa aceptó
  las horas y las remesas lo terminan después. Pendientes son **solo** los de estado `1`. **Nunca
  llamar a `square_shift` sobre los de estado 2 ni presentarlos como dinero sin facturar**: el
  2026-07-28 se presentaron 99 turnos correctos (≈9.300 €) como un fallo del sistema.
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

- **`from_company_review_rating` trae un 4 por defecto.** Vale 4 en 7.786 turnos y solo 252 tienen
  `from_company_review_created_at`. Una valoración cuenta **solo si esa fecha no es nula**.
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

### Una variable que se queda sin uso es una trampa

Al quitar una condición, la variable que la gobernaba se queda asignada y sin leer. `plpgsql_check`
lo avisa, y hay que hacerle caso: **una variable muerta que antes gobernaba una comprobación invita a
que alguien la devuelva a la condición.** Se retira del `DECLARE` y del `SELECT INTO`, y se deja un
comentario explicando por qué ya no está.

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

1. **`plpgsql_check` siempre.** Es obligatorio. PL/pgSQL resuelve los nombres **en ejecución**: una
   tabla mal escrita se despliega y solo revienta cuando la usa alguien, y si hay un `EXCEPTION WHEN
   OTHERS` no se entera nadie. El 2026-07-17 un barrido encontró **8 funciones vivas rotas desde su
   despliegue**. Falsos positivos conocidos: `_inv_weeks`, `_liv_base`, `_corr_results`,
   `_pib_day_counts` y `get_worker_company_relationship`. Todos menos el último son tablas
   temporales que se crean en ejecución y el analizador no puede ver.

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

   **Comprobación obligatoria después de crear o desplegar cualquier función.** Cero filas = bien:

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
