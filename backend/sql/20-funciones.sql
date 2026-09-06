-- ============================================================================
-- freetools · funciones de acceso del planificador
-- ============================================================================
--
-- Las tablas no tienen ni un permiso para anon ni para authenticated. Todo pasa
-- por aqui. Cada funcion es SECURITY DEFINER, fija su search_path, e IMPONE el
-- alcance por dentro en vez de aceptarlo por parametro. Esa ultima frase es la
-- que separa un backend seguro de uno que parece seguro.
--
-- Se aplica DESPUES de 10-esquema.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. updated_at que no miente
-- ----------------------------------------------------------------------------
-- En la base de produccion de Shifty, 115 de las 172 tablas con updated_at NO
-- tienen trigger que la toque: esa fecha miente en dos de cada tres tablas. Aqui
-- se pone desde el principio, que es cuando cuesta cero.
create or replace function public.planning_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists planning_plans_updated_at on public.planning_plans;
create trigger planning_plans_updated_at
  before update on public.planning_plans
  for each row execute function public.planning_set_updated_at();

-- ----------------------------------------------------------------------------
-- 1. Piezas internas
-- ----------------------------------------------------------------------------

-- Token del enlace: 12 caracteres de un alfabeto sin parecidos (ni O ni 0, ni
-- l ni 1). La gente lo va a dictar por telefono y lo va a leer de un WhatsApp.
-- Son 32^12 combinaciones, o sea que no se adivina probando.
create or replace function public.planning_new_share_token()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_token text;
  v_intentos int := 0;
begin
  loop
    v_token := '';
    for i in 1..12 loop
      v_token := v_token || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;

    exit when not exists (select 1 from public.planning_plans p where p.share_token = v_token);

    v_intentos := v_intentos + 1;
    if v_intentos > 20 then
      -- 20 choques seguidos con 32^12 posibilidades es imposible por azar: si
      -- pasa, algo va mal de verdad y es mejor fallar ruidosamente.
      raise exception 'No se ha podido generar un token unico';
    end if;
  end loop;
  return v_token;
end;
$$;

comment on function public.planning_new_share_token() is
  'Token corto y unico para el enlace de un plan. Alfabeto sin caracteres que se confundan al dictarlos o al leerlos de una pantalla.';

-- La cuenta de quien llama, o null si es anonimo. Nunca se acepta por parametro:
-- ese es el fallo mas comun y el mas caro.
create or replace function public.planning_current_account()
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select a.id
    from public.tool_accounts a
   where a.auth_user_id = auth.uid()
$$;

comment on function public.planning_current_account() is
  'La cuenta de quien llama, deducida de auth.uid(). Null si es anonimo. El alcance se impone aqui, no se acepta por parametro.';

-- ----------------------------------------------------------------------------
-- 2. Cortacircuitos de volumen
-- ----------------------------------------------------------------------------
--
-- SE HONESTO CON LO QUE ESTO ES. No es un limite por IP y no impide el abuso:
-- desde el navegador no llega una IP fiable a Postgres, y cualquier huella que
-- mande el cliente la puede falsificar el cliente. Lo que hace es acotar el
-- DESTROZO: si alguien escribe un bucle, deja de poder llenar los 500 MB del
-- plan gratis y tumbar la herramienta para todos.
--
-- El limite es global y por dia. Cuando salta, deja de crear planes nuevos pero
-- los que ya existen se siguen leyendo y editando.
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

alter table public.planning_daily_counters enable row level security;
revoke all on public.planning_daily_counters from anon, authenticated;

create or replace function public.planning_bump_counter(p_kind text, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.planning_daily_counters (day, kind, hits)
  values (current_date, p_kind, 1)
  on conflict (day, kind) do update set hits = planning_daily_counters.hits + 1
  returning hits into v_count;

  if v_count > p_limit then
    raise exception 'planning_limite_diario'
      using hint = 'Se ha alcanzado el limite diario de ' || p_kind;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. La cuenta
-- ----------------------------------------------------------------------------

-- Se llama nada mas entrar. Crea la fila si no existe y actualiza la ultima vez
-- que se le vio. Es idempotente a proposito: el front la puede llamar siempre
-- sin comprobar nada antes.
create or replace function public.planning_touch_account()
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'planning_no_autenticado';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  insert into public.tool_accounts (auth_user_id, email)
  values (v_uid, coalesce(v_email, ''))
  on conflict (auth_user_id) do update
    set last_seen_at = now(),
        -- El email puede cambiar en auth; aqui se refresca. No se toca ni el
        -- nombre ni el consentimiento de marketing, que son del usuario.
        email = coalesce(excluded.email, tool_accounts.email)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.planning_touch_account() is
  'Crea o refresca la cuenta de quien acaba de entrar. Idempotente: el front la llama siempre, sin comprobar nada antes.';

-- ----------------------------------------------------------------------------
-- 4. Crear un plan
-- ----------------------------------------------------------------------------
--
-- Se llama al llegar a la pantalla de resultado, con o sin cuenta. Si quien
-- llama esta identificado, el plan nace ya suyo y el secreto de edicion no le
-- hace falta para nada (pero se devuelve igual, por simetria y por si luego
-- cierra la sesion en ese navegador).
create or replace function public.planning_create_plan(
  p_config         jsonb,
  p_config_version integer,
  -- La curva llega y sale en base64, NO como bytea crudo. Es a proposito: como
  -- PostgREST serializa un bytea depende de su version y de su configuracion, y
  -- eso es una suposicion que no se puede comprobar desde el front. Fijando el
  -- formato en la propia funcion, los dos lados saben que se estan mandando.
  p_covers_b64     text,
  p_weeks_meta     jsonb,
  p_year           integer,
  p_source_name    text default null,
  p_is_demo        boolean default false,
  p_people_count   integer default null,
  p_weekly_hours   numeric default null,
  p_coverage_pct   integer default null,
  p_peak_weeks     integer default null,
  p_peak_hours     numeric default null
)
-- Devuelve jsonb y no una tabla a proposito: los nombres que querria devolver
-- (plan_id, share_token) son tambien nombres de columna de las tablas que toca,
-- y en plpgsql eso es una ambiguedad que revienta en ejecucion, no al crearla.
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account uuid := public.planning_current_account();
  v_secret  text := encode(extensions.gen_random_bytes(24), 'hex');
  v_token   text := public.planning_new_share_token();
  v_id      uuid;
  v_covers  bytea;
begin
  if p_config is null or p_covers_b64 is null or p_weeks_meta is null then
    raise exception 'planning_faltan_datos';
  end if;

  v_covers := decode(p_covers_b64, 'base64');

  -- 2 MB comprimidos es unas 250 veces lo que ocupa un plan normal (8 KB). Si
  -- llega algo mas grande, no es un plan.
  if length(v_covers) > 2 * 1024 * 1024 then
    raise exception 'planning_demasiado_grande';
  end if;

  perform public.planning_bump_counter('create_plan', 5000);

  insert into public.planning_plans (
    share_token, edit_secret_hash, account_id, claimed_at,
    config, config_version,
    people_count, weekly_hours, coverage_pct, peak_weeks_count, peak_hours_year
  )
  values (
    v_token,
    extensions.crypt(v_secret, extensions.gen_salt('bf')),
    v_account,
    case when v_account is null then null else now() end,
    p_config, p_config_version,
    p_people_count, p_weekly_hours, p_coverage_pct, p_peak_weeks, p_peak_hours
  )
  returning id into v_id;

  insert into public.planning_plan_datasets (plan_id, covers, weeks_meta, year, source_name, is_demo, byte_size)
  values (v_id, v_covers, p_weeks_meta, p_year, p_source_name, coalesce(p_is_demo, false), length(v_covers));

  return jsonb_build_object(
    'plan_id',     v_id,
    'share_token', v_token,
    'edit_secret', v_secret
  );
end;
$$;

comment on function public.planning_create_plan is
  'Crea un plan. Anonimo si quien llama no tiene sesion, y ya con dueno si la tiene. Devuelve el secreto de edicion UNA sola vez: no se puede recuperar despues.';

-- ----------------------------------------------------------------------------
-- 5. Actualizar un plan
-- ----------------------------------------------------------------------------
--
-- Autoriza por DOS caminos y en este orden: si quien llama es el dueno, entra;
-- si no, tiene que traer el secreto de edicion. El secreto se compara con crypt
-- contra el hash, nunca en claro.
create or replace function public.planning_update_plan(
  p_plan_id        uuid,
  p_edit_secret    text,
  p_config         jsonb,
  p_config_version integer,
  -- Base64, por el mismo motivo que en planning_create_plan.
  p_covers_b64     text,
  p_weeks_meta     jsonb,
  p_people_count   integer default null,
  p_weekly_hours   numeric default null,
  p_coverage_pct   integer default null,
  p_peak_weeks     integer default null,
  p_peak_hours     numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account uuid := public.planning_current_account();
  v_plan    public.planning_plans%rowtype;
  v_covers  bytea := decode(p_covers_b64, 'base64');
begin
  select * into v_plan from public.planning_plans where id = p_plan_id;
  if not found then
    raise exception 'planning_no_existe';
  end if;

  -- El mensaje de error es el MISMO tanto si el plan no existe como si el
  -- secreto no vale, para no convertir esto en un oraculo que diga que planes
  -- existen. Por eso el "no existe" de arriba y este dicen cosas distintas solo
  -- para el dueno legitimo... y por eso aqui abajo no se distingue.
  if not (
    (v_account is not null and v_plan.account_id = v_account)
    or (p_edit_secret is not null
        and v_plan.edit_secret_hash = extensions.crypt(p_edit_secret, v_plan.edit_secret_hash))
  ) then
    raise exception 'planning_sin_permiso';
  end if;

  if length(v_covers) > 2 * 1024 * 1024 then
    raise exception 'planning_demasiado_grande';
  end if;

  update public.planning_plans
     set config           = p_config,
         config_version   = p_config_version,
         people_count     = p_people_count,
         weekly_hours     = p_weekly_hours,
         coverage_pct     = p_coverage_pct,
         peak_weeks_count = p_peak_weeks,
         peak_hours_year  = p_peak_hours,
         save_count       = save_count + 1
   where id = p_plan_id;

  update public.planning_plan_datasets
     set covers     = v_covers,
         weeks_meta = p_weeks_meta,
         byte_size  = length(v_covers)
   where plan_id = p_plan_id;
end;
$$;

comment on function public.planning_update_plan is
  'Guarda encima de un plan existente. Autoriza por dueno o por secreto de edicion, en ese orden. El secreto se compara contra el hash, nunca en claro.';

-- ----------------------------------------------------------------------------
-- 6. Leer un plan por su enlace
-- ----------------------------------------------------------------------------
--
-- Devuelve todo lo necesario para pintarlo, y NO devuelve el hash del secreto.
-- Quien tiene el enlace puede mirar; para escribir hace falta el secreto o ser
-- el dueno, y eso se comprueba en planning_update_plan.
create or replace function public.planning_get_plan(p_share_token text)
returns table (
  plan_id        uuid,
  config         jsonb,
  config_version integer,
  covers_b64     text,
  weeks_meta     jsonb,
  year           integer,
  is_demo        boolean,
  is_mine        boolean,
  created_at     timestamptz,
  updated_at     timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account uuid := public.planning_current_account();
begin
  return query
    select p.id, p.config, p.config_version,
           encode(d.covers, 'base64'), d.weeks_meta, d.year, d.is_demo,
           (v_account is not null and p.account_id = v_account) as is_mine,
           p.created_at, p.updated_at
      from public.planning_plans p
      join public.planning_plan_datasets d on d.plan_id = p.id
     where p.share_token = p_share_token;
end;
$$;

comment on function public.planning_get_plan is
  'Lee un plan por el token de su enlace. Da para MIRAR, no para escribir. Nunca devuelve el hash del secreto de edicion.';

-- ----------------------------------------------------------------------------
-- 7. Reclamar un plan anonimo
-- ----------------------------------------------------------------------------
--
-- Es el momento del OTP: la persona ya tiene sesion y dice "ese plan de ahi es
-- mio". Hace falta el secreto de edicion, que solo esta en el navegador donde lo
-- creo. Sin eso, cualquiera con un enlace se apropiaria del plan de otro.
create or replace function public.planning_claim_plan(p_plan_id uuid, p_edit_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account uuid := public.planning_touch_account();
  v_plan    public.planning_plans%rowtype;
begin
  select * into v_plan from public.planning_plans where id = p_plan_id;
  if not found then
    raise exception 'planning_no_existe';
  end if;

  -- Ya es suyo: no es un error, es que le ha dado dos veces o ha recargado.
  -- Salir en silencio hace que el front pueda reintentar sin pensar.
  if v_plan.account_id = v_account then
    return;
  end if;

  if v_plan.account_id is not null then
    raise exception 'planning_ya_tiene_dueno';
  end if;

  if v_plan.edit_secret_hash <> extensions.crypt(p_edit_secret, v_plan.edit_secret_hash) then
    raise exception 'planning_sin_permiso';
  end if;

  update public.planning_plans
     set account_id = v_account,
         claimed_at = now()
   where id = p_plan_id;
end;
$$;

comment on function public.planning_claim_plan is
  'Convierte un plan anonimo en propiedad de quien acaba de identificarse. Exige el secreto de edicion, que solo vive en el navegador que lo creo. Es idempotente si ya era suyo.';

-- ----------------------------------------------------------------------------
-- 8. Mis planes
-- ----------------------------------------------------------------------------
-- No devuelve la curva: la lista no la necesita y son 8 KB por fila.
create or replace function public.planning_my_plans()
returns table (
  plan_id      uuid,
  share_token  text,
  people_count integer,
  weekly_hours numeric,
  coverage_pct integer,
  source_name  text,
  year         integer,
  updated_at   timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account uuid := public.planning_current_account();
begin
  if v_account is null then
    raise exception 'planning_no_autenticado';
  end if;

  return query
    select p.id, p.share_token, p.people_count, p.weekly_hours, p.coverage_pct,
           d.source_name, d.year, p.updated_at
      from public.planning_plans p
      left join public.planning_plan_datasets d on d.plan_id = p.id
     where p.account_id = v_account
     order by p.updated_at desc
     limit 100;
end;
$$;

comment on function public.planning_my_plans() is
  'Los planes de quien llama, sin la curva de comensales. El alcance sale de auth.uid(), nunca de un parametro.';

-- ----------------------------------------------------------------------------
-- 9. Borrar
-- ----------------------------------------------------------------------------
--
-- OJO CON LA CLAVE. Se borra por plan_id, NUNCA por share_token. El share_token
-- es la cadena que la persona pega en un WhatsApp para ensenarle el plan a su
-- jefe: si fuera la clave del borrado, ensenarlo seria darle permiso para
-- destruirlo.
create or replace function public.planning_delete_plan(p_plan_id uuid, p_edit_secret text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account uuid := public.planning_current_account();
  v_plan    public.planning_plans%rowtype;
begin
  select * into v_plan from public.planning_plans where id = p_plan_id;
  if not found then
    return; -- borrar algo que no existe ya deja el mundo como se queria
  end if;

  if not (
    (v_account is not null and v_plan.account_id = v_account)
    or (p_edit_secret is not null
        and v_plan.edit_secret_hash = extensions.crypt(p_edit_secret, v_plan.edit_secret_hash))
  ) then
    raise exception 'planning_sin_permiso';
  end if;

  delete from public.planning_plans where id = p_plan_id;
end;
$$;

comment on function public.planning_delete_plan is
  'Borra un plan. Se identifica por id, NUNCA por el token del enlace: el token se comparte y no puede dar permiso para destruir.';

-- ----------------------------------------------------------------------------
-- 10. Limpieza de anonimos abandonados
-- ----------------------------------------------------------------------------
--
-- Un plan anonimo que nadie ha reclamado ni tocado en 180 dias es alguien que
-- probo la herramienta y se fue. Se borra ENTERO, no a medias: dejar la fila sin
-- su curva produce planes rotos que fallan al abrirlos, que es peor que no
-- estar. Los planes con dueno NO se tocan nunca.
create or replace function public.planning_purge_abandoned(p_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_borrados integer;
begin
  delete from public.planning_plans
   where account_id is null
     and updated_at < now() - make_interval(days => p_days);
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

comment on function public.planning_purge_abandoned is
  'Borra planes anonimos sin tocar desde hace N dias. Los que tienen dueno no se tocan jamas. Pensada para un cron; no se concede a anon ni a authenticated.';

-- ----------------------------------------------------------------------------
-- 11. Permisos de ejecucion
-- ----------------------------------------------------------------------------
--
-- Por defecto Postgres concede EXECUTE a PUBLIC en toda funcion nueva. Se revoca
-- y se concede a mano, una por una. Lo que no aparezca aqui no lo puede llamar
-- nadie desde el cliente.
revoke all on function public.planning_new_share_token()          from public, anon, authenticated;
revoke all on function public.planning_current_account()          from public, anon, authenticated;
revoke all on function public.planning_bump_counter(text, integer) from public, anon, authenticated;
revoke all on function public.planning_purge_abandoned(integer)   from public, anon, authenticated;
revoke all on function public.planning_set_updated_at()           from public, anon, authenticated;

revoke all on function public.planning_create_plan(jsonb, integer, text, jsonb, integer, text, boolean, integer, numeric, integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.planning_update_plan(uuid, text, jsonb, integer, text, jsonb, integer, numeric, integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.planning_get_plan(text)          from public, anon, authenticated;
revoke all on function public.planning_delete_plan(uuid, text) from public, anon, authenticated;
revoke all on function public.planning_claim_plan(uuid, text)  from public, anon, authenticated;
revoke all on function public.planning_my_plans()              from public, anon, authenticated;
revoke all on function public.planning_touch_account()         from public, anon, authenticated;

-- Anonimo: puede crear un plan, leerlo por su enlace, y editarlo o borrarlo si
-- trae el secreto. Nada mas.
grant execute on function public.planning_create_plan(jsonb, integer, text, jsonb, integer, text, boolean, integer, numeric, integer, integer, numeric) to anon, authenticated;
grant execute on function public.planning_update_plan(uuid, text, jsonb, integer, text, jsonb, integer, numeric, integer, integer, numeric) to anon, authenticated;
grant execute on function public.planning_get_plan(text)          to anon, authenticated;
grant execute on function public.planning_delete_plan(uuid, text) to anon, authenticated;

-- Con sesion: ademas, reclamar, listar lo suyo y refrescar su cuenta.
grant execute on function public.planning_claim_plan(uuid, text)  to authenticated;
grant execute on function public.planning_my_plans()              to authenticated;
grant execute on function public.planning_touch_account()         to authenticated;

commit;
