-- ============================================================================
-- freetools · esquema del planificador de plantilla
-- ============================================================================
--
-- DONDE VA ESTO
-- En el proyecto Supabase "freetools", NO en la base de produccion de Shifty
-- (brgswggayexbvrnqtlhp). Se decidio asi el 2026-09-06 despues de medirlo:
-- una cuenta en el proyecto de produccion sale con el rol `authenticated`, y
-- ese rol puede hoy ejecutar 904 funciones SECURITY DEFINER, de las cuales 37
-- escriben y aceptan un company_id o un worker_id por parametro sin comprobar
-- que quien llama tenga derecho. Ninguna politica RLS sobre tablas nuevas
-- arregla eso. Ademas auth.users tiene UNIQUE (phone) global, asi que un duenno
-- de restaurante que ya sea trabajador de Shifty no podria tener una cuenta
-- separada con su mismo telefono.
--
-- En un proyecto aparte los dos problemas desaparecen de raiz, y ademas no hay
-- ningun trigger sobre auth.users que enganche la cuenta nueva a nada.
--
-- CONVENCION DE NOMBRES
-- La casa usa ingles, snake_case, tablas en plural, claves ajenas en singular
-- mas _id, booleanos con is_, fechas con _at y vistas con v_. Se respeta.
--
-- Sobre el prefijo: Crescente pidio que todo lo del planificador empiece por
-- "planning_". Se cumple. La excepcion razonada es `tool_accounts`: este
-- proyecto va a alojar VARIAS herramientas gratuitas, y la cuenta de la persona
-- es de todas, no del planificador. Llamarla planning_users obligaria a la
-- segunda herramienta a inventarse otra tabla de usuarios o a heredar un nombre
-- que ya no significa lo que dice.
--
-- EL PRINCIPIO DE SEGURIDAD DE ESTE FICHERO
-- Cero permisos de tabla para anon y authenticated. Ni SELECT. Todo el acceso
-- pasa por funciones SECURITY DEFINER que imponen el alcance por dentro en vez
-- de aceptarlo por parametro. Es lo que la casa ya hace bien y es lo que aguanta
-- que la clave anonima vaya dentro del bundle, que es publica por diseno.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Extensiones
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- El `with schema extensions` NO mueve una pgcrypto que ya estuviera instalada en
-- otro sitio: el `if not exists` sale por la puerta sin tocar nada. Y como todas
-- las funciones de abajo llaman a `extensions.crypt`, eso se veria como un
-- backend que se instala perfecto y revienta al guardar el primer plan. Se
-- comprueba aqui, que es donde cuesta cero.
do $$
begin
  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto no esta en el esquema extensions; las funciones del planificador la llaman como extensions.crypt';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. tool_accounts · la persona, compartida por todas las herramientas
-- ----------------------------------------------------------------------------
create table if not exists public.tool_accounts (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  email         text not null,
  display_name  text,
  locale        text not null default 'es',
  -- Consentimiento explicito y separado del alta. Crear la cuenta para guardar
  -- un plan NO es aceptar que le escribamos: son dos cosas y se guardan aparte.
  is_marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

comment on table  public.tool_accounts is
  'Una fila por persona que se ha identificado en cualquiera de las herramientas gratuitas. Es la identidad compartida del proyecto: el planificador es la primera herramienta, no la unica.';
comment on column public.tool_accounts.auth_user_id is
  'La cuenta de auth. Es UNIQUE: una persona, una fila. Al borrarse la cuenta de auth se borra esta fila y en cascada sus planes.';
comment on column public.tool_accounts.email is
  'Copia del email con el que entro. Se guarda aqui para no tener que leer auth.users desde las funciones de producto.';
comment on column public.tool_accounts.is_marketing_opt_in is
  'Si acepto expresamente que le escribamos. Nace en false: identificarse para guardar un plan no es consentir marketing.';
comment on column public.tool_accounts.last_seen_at is
  'Ultima vez que se le vio. Sirve para medir quien vuelve, que es la metrica que dice si la herramienta engancha.';

comment on column public.tool_accounts.id is
  'Identificador de la cuenta dentro de las herramientas. Es distinto del de auth a proposito: si algun dia se cambia de proveedor de identidad, los planes siguen colgando de aqui.';
comment on column public.tool_accounts.display_name is
  'Como quiere que le llamemos. Lo pone la persona; nunca se rellena solo desde el correo.';
comment on column public.tool_accounts.locale is
  'Idioma de la persona. Hoy siempre es es; existe porque el dia que haya otro idioma no se puede deducir del correo.';
comment on column public.tool_accounts.created_at is
  'Cuando se identifico por primera vez en cualquiera de las herramientas.';

create index if not exists tool_accounts_email_idx on public.tool_accounts (lower(email));

-- ----------------------------------------------------------------------------
-- 2. planning_plans · un plan de plantilla
-- ----------------------------------------------------------------------------
--
-- Un plan nace ANONIMO cuando la persona llega a la pantalla de resultado, que
-- es el primer instante en que tiene algo que perder. Si luego se identifica,
-- ese mismo plan pasa a ser suyo con una escritura de 200 bytes, reintentable y
-- sin duplicar nada. Guardar solo despues del login perderia el trabajo de todo
-- el que cierre la pestana antes, que son la mayoria.
create table if not exists public.planning_plans (
  id                uuid primary key default gen_random_uuid(),

  -- El enlace corto que se pega en un WhatsApp. Sustituye a la direccion de
  -- 14.121 caracteres de hoy, que los clientes de correo parten por la mitad.
  share_token       text not null unique,

  -- Quien puede EDITAR mientras el plan es anonimo. Se guarda el hash, nunca el
  -- secreto: si alguien lee esta tabla no puede editar nada. El secreto vive en
  -- el navegador de quien lo creo.
  --
  -- Es deliberadamente distinto de share_token: el token se comparte y solo deja
  -- mirar; el secreto no se comparte y deja escribir. Con una sola cadena para
  -- las dos cosas, ensenarle el plan a tu jefe le daria permiso para borrarlo.
  edit_secret_hash  text not null,

  -- Null mientras nadie lo ha reclamado.
  account_id        uuid references public.tool_accounts (id) on delete cascade,
  claimed_at        timestamptz,

  -- Todo lo que el usuario ha decidido: horario, tramos, puestos, contratos,
  -- ajustes y correcciones. Es la foto del front menos la curva de comensales.
  -- Va en jsonb a proposito: la base no entiende la forma del plan, asi que el
  -- dia que el front anada un ajuste no hay que migrar nada ni se pudre en
  -- silencio. Lo que se quiera consultar se sube a columna propia, y esas estan
  -- justo debajo.
  config            jsonb not null,

  -- La version del formato del front que escribio esta fila. Sin esto, una
  -- pestana vieja cacheada por el CDN puede mandar una foto de ayer y no hay
  -- forma de saberlo al leerla.
  config_version    integer not null,

  -- ── Columnas derivadas del calculo, para poder consultar sin abrir el jsonb ──
  -- Son las cinco cifras que el producto va a querer agrupar (cuanta gente sale,
  -- cuanto trabajo hay, cuanto se cubre y cuanto pico queda fuera). Las escribe
  -- la RPC desde lo que le manda el front, y por eso son solo lectura para todo
  -- el mundo: no se calculan aqui, se registran.
  people_count      integer,
  weekly_hours      numeric(8,1),
  coverage_pct      integer,
  peak_weeks_count  integer,
  peak_hours_year   numeric(10,1),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Cuantas veces se ha guardado. Distingue "entro, miro y se fue" de "estuvo
  -- una hora afinando", que es la senal de que la herramienta le sirvio.
  save_count        integer not null default 1,

  constraint planning_plans_share_token_len_chk check (length(share_token) between 8 and 24),
  -- Un plan reclamado tiene dueno y fecha, o no tiene ninguna de las dos. Sin
  -- este CHECK se puede llegar a una fila con dueno y sin fecha, o al reves, y
  -- entonces "cuantos planes se reclaman" deja de poder contarse.
  constraint planning_plans_claim_chk check (
    (account_id is null and claimed_at is null) or
    (account_id is not null and claimed_at is not null)
  ),
  constraint planning_plans_coverage_chk check (coverage_pct is null or coverage_pct between 0 and 100)
);

comment on table  public.planning_plans is
  'Un plan de plantilla del planificador. Nace anonimo al llegar la persona a la pantalla de resultado y pasa a tener dueno si se identifica. La curva de comensales NO esta aqui: vive comprimida en planning_plan_datasets.';
comment on column public.planning_plans.share_token is
  'El identificador publico del enlace. Solo da permiso para MIRAR. Se genera en la base, nunca lo elige el cliente.';
comment on column public.planning_plans.edit_secret_hash is
  'Hash del secreto de edicion del plan anonimo. El secreto en claro solo existe en el navegador que lo creo y se devuelve una unica vez, al crear el plan.';
comment on column public.planning_plans.config is
  'La foto del plan sin la curva de comensales: horario, tramos, puestos, contratos, ajustes, semanas especiales y nombres. Forma libre a proposito.';
comment on column public.planning_plans.config_version is
  'SNAPSHOT_VERSION del front que escribio la fila. Permite rechazar o migrar una foto de una version que ya no se entiende, en vez de calcular mal en silencio.';
comment on column public.planning_plans.people_count is
  'Personas que salieron en la plantilla. Lo registra el front; la base NO lo recalcula. Esta fuera del jsonb solo para poder agrupar por el.';
comment on column public.planning_plans.save_count is
  'Cuantas veces se ha guardado este plan. Separa la visita de paso del uso de verdad.';
comment on column public.planning_plans.id is
  'Identificador interno del plan. Es la clave para EDITAR y BORRAR, nunca el share_token: el token se comparte y no puede dar permiso para destruir.';
comment on column public.planning_plans.account_id is
  'Dueno del plan, o null mientras nadie lo ha reclamado. Todos los planes nacen null.';
comment on column public.planning_plans.claimed_at is
  'Cuando paso a tener dueno. Va siempre junto a account_id: un CHECK impide que exista uno sin el otro, porque si no "cuantos planes se reclaman" deja de poder contarse.';
comment on column public.planning_plans.weekly_hours is
  'Horas de plantilla a la semana que salieron del calculo. Lo registra el front; la base NO lo recalcula.';
comment on column public.planning_plans.coverage_pct is
  'Porcentaje de semanas del ano que la plantilla fija cubre. Lo elige el usuario arrastrando la linea del grafico.';
comment on column public.planning_plans.peak_weeks_count is
  'Cuantas semanas quedan por encima de la linea de cobertura. Son las que se cubren con extras, no contratando.';
comment on column public.planning_plans.peak_hours_year is
  'Horas de pico al ano que la plantilla fija no cubre. Es la cifra con la que se explica para que sirve Shifty.';
comment on column public.planning_plans.created_at is
  'Cuando se guardo el plan por primera vez, que es al llegar la persona a la pantalla de resultado.';
comment on column public.planning_plans.updated_at is
  'Ultima vez que se guardo. La mantiene un disparador, no el codigo que escribe: en produccion, 115 de las 172 tablas con updated_at no lo tienen y esa fecha miente.';

create index if not exists planning_plans_account_idx
  on public.planning_plans (account_id, updated_at desc)
  where account_id is not null;

create index if not exists planning_plans_created_idx
  on public.planning_plans (created_at desc);

-- Para la purga de anonimos abandonados: solo mira las filas sin dueno.
create index if not exists planning_plans_huerfanos_idx
  on public.planning_plans (updated_at)
  where account_id is null;

-- ----------------------------------------------------------------------------
-- 3. planning_plan_datasets · la curva de comensales, comprimida
-- ----------------------------------------------------------------------------
--
-- POR QUE UNA TABLA APARTE Y POR QUE bytea
-- La curva son 52 semanas x 7 dias x 48 franjas de media hora = 17.472 enteros,
-- el 86,6% del peso del plan. Medido sobre la base: como jsonb ocuparia 192.198
-- bytes por plan, casi cuatro veces su propio texto, porque jsonb guarda cada
-- numero con su cabecera. Comprimida con el mismo deflate-raw que ya usa
-- compartir.ts en el front son 8.041 bytes. Con 500 MB de plan gratis, eso es la
-- diferencia entre 2.600 planes y unos 60.000.
--
-- Y va aparte de planning_plans porque la lista de "mis planes" y el grafico del
-- ano no necesitan la curva. Si estuviera en la misma fila, Postgres tendria que
-- traerla igualmente en cada consulta.
create table if not exists public.planning_plan_datasets (
  plan_id      uuid primary key references public.planning_plans (id) on delete cascade,

  -- La curva comprimida con deflate-raw, exactamente el mismo formato que ya usa
  -- el enlace compartido. El front la descomprime con DecompressionStream, que
  -- es nativa del navegador: no hay libreria que mantener a los dos lados.
  covers       bytea not null,

  -- El total de cada semana, ya sumado. Es lo unico que necesita el grafico del
  -- ano y la linea de cobertura, asi que se guarda fuera del bulto para poder
  -- pintar la primera pantalla sin descomprimir 8 KB.
  weeks_meta   jsonb not null,

  year         integer not null,
  source_name  text,
  -- Si el histórico salio de los datos de ejemplo. Sin esto, las metricas de uso
  -- mezclan planes de verdad con gente probando.
  is_demo      boolean not null default false,
  byte_size    integer not null,
  created_at   timestamptz not null default now(),

  constraint planning_plan_datasets_size_chk check (byte_size > 0 and byte_size <= 2 * 1024 * 1024)
);

comment on table  public.planning_plan_datasets is
  'La curva de comensales de un plan, comprimida con deflate-raw. Aparte de planning_plans porque es el 86% del peso y casi ninguna consulta la necesita.';
comment on column public.planning_plan_datasets.covers is
  'Los 17.472 enteros de la curva (52 semanas x 7 dias x 48 franjas), comprimidos. El numero de franjas por dia viaja dentro de config, asi que un plan guardado con una rejilla mas corta se sigue leyendo. Mismo formato que el enlace compartido del front.';
comment on column public.planning_plan_datasets.weeks_meta is
  'Total de comensales por semana ISO, ya sumado. Permite pintar el grafico del ano sin descomprimir la curva.';
comment on column public.planning_plan_datasets.byte_size is
  'Tamano del bulto comprimido. Se guarda para poder medir el consumo sin leer la columna, que es justo lo que se quiere evitar.';
comment on column public.planning_plan_datasets.plan_id is
  'El plan al que pertenece la curva. Es tambien la clave primaria: un plan tiene una curva y solo una.';
comment on column public.planning_plan_datasets.year is
  'Ano del historico que subio el usuario. Fuera del bulto comprimido porque se usa para etiquetar sin descomprimir.';
comment on column public.planning_plan_datasets.source_name is
  'Nombre del fichero que subio, para poder reconocer el plan en su lista. El fichero en si NUNCA se sube: se lee entero en el navegador.';
comment on column public.planning_plan_datasets.is_demo is
  'Si el historico salio de los datos de ejemplo. Sin esto, las metricas de uso mezclan planes de verdad con gente probando.';
comment on column public.planning_plan_datasets.created_at is
  'Cuando se guardo la curva. No se toca al actualizar: lo que cambia entonces es el contenido, no el origen.';

-- ----------------------------------------------------------------------------
-- 4. planning_ai_calls · rastro y coste de cada llamada al modelo
-- ----------------------------------------------------------------------------
--
-- Existe por tres motivos, y ninguno es curiosidad: saber lo que cuesta Gemini
-- antes de que llegue la factura, poder limitar a quien abusa, y poder mirar que
-- se le mando al modelo el dia que devuelva algo raro.
create table if not exists public.planning_ai_calls (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  account_id    uuid references public.tool_accounts (id) on delete set null,
  -- Huella del cliente cuando no hay cuenta. NO es la IP: es un hash con sal, y
  -- la sal vive en los secretos de la edge function. Sirve para contar y limitar
  -- sin guardar de quien es.
  client_hash   text,
  model         text not null,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  is_ok         boolean not null,
  error_code    text,
  created_at    timestamptz not null default now(),

  constraint planning_ai_calls_kind_chk check (kind in ('map_columns', 'name_weeks'))
);

comment on table  public.planning_ai_calls is
  'Una fila por llamada a Gemini desde el planificador. Para saber lo que cuesta, para limitar el abuso y para poder mirar que paso cuando el modelo devuelva algo raro.';
comment on column public.planning_ai_calls.client_hash is
  'Hash con sal del cliente anonimo. No es la IP y no permite volver a la IP: la sal esta en los secretos de la edge function.';
comment on column public.planning_ai_calls.kind is
  'Que se le pidio: map_columns (que es cada columna del fichero) o name_weeks (como se llama esta semana rara).';
comment on column public.planning_ai_calls.id is
  'Identificador de la llamada. Solo sirve para poder referirse a una fila concreta al mirar un caso raro.';
comment on column public.planning_ai_calls.account_id is
  'Cuenta que la provoco, si la habia. Hoy va siempre null: la funcion corre sin sesion y un id de cuenta que manda el cliente no es un id de cuenta, es una peticion.';
comment on column public.planning_ai_calls.model is
  'Id exacto del modelo al que se llamo. Se guarda para poder cruzar el gasto cuando se cambie de modelo.';
comment on column public.planning_ai_calls.input_tokens is
  'Tokens de entrada que factura Google.';
comment on column public.planning_ai_calls.output_tokens is
  'Tokens de salida MAS los de razonamiento. Google factura los de pensar como salida, y mirar solo los de texto infravalora la factura entre dos y tres veces.';
comment on column public.planning_ai_calls.latency_ms is
  'Lo que tardo la llamada al modelo. Es lo que dice si la pantalla se le esta quedando colgada a la gente.';
comment on column public.planning_ai_calls.is_ok is
  'Si el modelo contesto algo utilizable. Las llamadas que fallan tambien dejan fila, porque tambien se pagan.';
comment on column public.planning_ai_calls.error_code is
  'Que fallo, en corto. Null cuando salio bien.';
comment on column public.planning_ai_calls.created_at is
  'Cuando se llamo. Es la columna sobre la que se cuentan los limites por hora y por dia.';

create index if not exists planning_ai_calls_created_idx on public.planning_ai_calls (created_at desc);
create index if not exists planning_ai_calls_client_idx
  on public.planning_ai_calls (client_hash, created_at desc)
  where client_hash is not null;

-- ----------------------------------------------------------------------------
-- 5. planning_daily_counters · cortacircuitos de volumen
-- ----------------------------------------------------------------------------
--
-- SE HONESTO CON LO QUE ESTO ES. No es un limite por IP y no impide el abuso:
-- desde el navegador no llega una IP fiable a Postgres, y cualquier huella que
-- mande el cliente la puede falsificar el cliente. Lo que hace es acotar el
-- DESTROZO: si alguien escribe un bucle, deja de poder llenar los 500 MB del
-- plan gratis y tumbar la herramienta para todos.
--
-- Vive aqui y no en 20-funciones.sql aunque solo la use una funcion: este es el
-- fichero de las tablas, y una tabla escondida en el de funciones es una tabla
-- que se queda sin RLS el dia que alguien reinstale solo el esquema.
create table if not exists public.planning_daily_counters (
  day        date not null,
  kind       text not null,
  -- Se llama `hits` y no `count` a proposito: `count` es tambien el nombre de
  -- una funcion de Postgres, y sin cualificar dentro de un RETURNING eso es una
  -- ambiguedad que no falla al crear la funcion, falla al llamarla.
  hits       integer not null default 0,
  primary key (day, kind)
);

comment on table public.planning_daily_counters is
  'Contador diario por tipo de accion. Es un cortacircuitos de volumen, no un limite por usuario: acota el destrozo de un bucle, no lo impide.';
comment on column public.planning_daily_counters.day is
  'El dia que se cuenta. La cuenta se reinicia sola cada medianoche porque la clave lleva la fecha.';
comment on column public.planning_daily_counters.kind is
  'Que accion se cuenta: create_plan o update_plan.';
comment on column public.planning_daily_counters.hits is
  'Veces que se ha hecho esa accion hoy. Se llama hits y no count porque count es una funcion de Postgres y dentro de un RETURNING sin cualificar eso es una ambiguedad que falla al llamar, no al crear.';

-- ----------------------------------------------------------------------------
-- 6. RLS y permisos
-- ----------------------------------------------------------------------------
--
-- ⚠️ ESTO NO ES OPCIONAL Y ES LA PARTE QUE MAS SE FALLA.
--
-- La clave anonima va dentro del bundle de la web y es publica por diseno:
-- cualquiera puede sacarla. Lo unico que separa a un desconocido de estos datos
-- es lo que hay debajo.
--
-- La postura elegida es la mas cerrada posible: RLS encendida, CERO politicas y
-- CERO permisos de tabla para anon y para authenticated. Ni un SELECT. Todo el
-- acceso pasa por funciones SECURITY DEFINER que imponen el alcance por dentro.
-- Asi no hay ninguna forma de llegar a la tabla por PostgREST saltandose las
-- comprobaciones, que es como se cuelan la mayoria de los agujeros.
--
-- El REVOKE va en el MISMO bloque que el CREATE a proposito: en el esquema
-- public de Supabase hay ALTER DEFAULT PRIVILEGES que conceden permisos a anon y
-- a authenticated en toda tabla nueva sin escribir un GRANT. Una tabla que se
-- cree y no revoque queda expuesta desde el primer segundo.
alter table public.tool_accounts          enable row level security;
alter table public.planning_plans         enable row level security;
alter table public.planning_plan_datasets enable row level security;
alter table public.planning_ai_calls      enable row level security;
alter table public.planning_daily_counters enable row level security;

revoke all on public.tool_accounts          from anon, authenticated;
revoke all on public.planning_plans         from anon, authenticated;
revoke all on public.planning_plan_datasets from anon, authenticated;
revoke all on public.planning_ai_calls      from anon, authenticated;
revoke all on public.planning_daily_counters from anon, authenticated;

-- Y que no puedan CREAR nada en public. Postgres concede CREATE sobre public a
-- todo el mundo por herencia historica, y con eso un anonimo puede plantar una
-- tabla o una funcion suya en el mismo esquema por el que pasan las nuestras.
-- No es teorico: es la puerta clasica para envenenar un search_path.
revoke create on schema public from anon, authenticated;

-- Sin politicas a proposito. Si algun dia hace falta que el cliente lea una de
-- estas tablas directamente, se anade la politica Y se documenta por que la
-- funcion no bastaba.

commit;
