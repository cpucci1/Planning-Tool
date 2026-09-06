-- ============================================================================
-- Prueba de que el backend SE DEFIENDE, no solo de que este instalado
-- ============================================================================
--
-- ⛔ SOLO EN freetools. Nunca en la base de produccion de Shifty
--    (brgswggayexbvrnqtlhp). Este fichero ESCRIBE: crea dos cuentas de auth de
--    mentira y un plan de prueba, ataca, y lo borra todo al terminar.
--
-- POR QUE EXISTE
-- 99-comprobar.sql mira que las piezas esten. No mira que sirvan. El 2026-09-06,
-- con el 99 dando BIEN en todo, tres funciones tenian el mismo agujero: con una
-- cuenta propia y solo el ENLACE de otro se podia sobrescribir y borrar su plan.
-- La causa era que en SQL una comparacion con NULL no da falso, da desconocido, y
-- un IF con desconocido dentro no entra: la excepcion no saltaba.
--
-- Eso no lo ve ninguna consulta al catalogo. Solo se ve atacando. Este fichero
-- es esa prueba, y se pasa DESPUES de cualquier cambio en 20-funciones.sql.
--
-- COMO SE LEE
-- Todas las filas tienen que decir OK. Una sola que diga AGUJERO o ROTO para el
-- despliegue. Copia el resultado entero y pegalo en el chat.
-- ============================================================================

create temp table if not exists planning_pruebas (n serial, paso text, resultado text);
truncate planning_pruebas;
-- El DO de abajo cambia de rol a anon y a authenticated para atacar de verdad, y
-- desde esos roles tiene que poder escribir aqui sus resultados.
grant all on planning_pruebas to anon, authenticated;
grant usage, select on sequence planning_pruebas_n_seq to anon, authenticated;

-- Dos personas de mentira: la que ataca y la que acaba siendo duena. El correo
-- lleva .test a proposito, que es un dominio reservado y no existe.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'prueba-atacante@ejemplo.test', '', now(), now(), now(),
        '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'prueba-duenno@ejemplo.test', '', now(), now(), now(),
        '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

do $$
declare
  v         jsonb;
  v_id      uuid;
  v_token   text;
  v_secreto text;
  v_n       int;
  v_dummy   int;
begin
  -- ── El plan nace anonimo, que es como nacen todos ────────────────────────
  set role anon;
  v := public.planning_create_plan(
         '{"de":"la victima"}'::jsonb, 1,
         encode('1,2,3'::bytea, 'base64'),
         '[{"isoWeek":1,"year":2026,"startDate":"2026-01-01","total":10}]'::jsonb,
         2026);
  reset role;
  v_id := (v->>'plan_id')::uuid;
  v_token := v->>'share_token';
  v_secreto := v->>'edit_secret';

  insert into planning_pruebas(paso, resultado)
  values ('crear un plan sin cuenta', 'OK, token de ' || length(v_token) || ' caracteres');

  insert into planning_pruebas(paso, resultado)
  values ('el secreto se guarda hasheado, no en claro',
    (select case when edit_secret_hash = v_secreto
                 then '*** AGUJERO: esta en claro ***'
                 else 'OK (' || left(edit_secret_hash, 7) || '...)' end
       from public.planning_plans where id = v_id));

  -- ── Un desconocido SIN cuenta, con el enlace en la mano ──────────────────
  set role anon;

  insert into planning_pruebas(paso, resultado)
  values ('con el enlace se puede MIRAR',
    (select case when plan_id = v_id then 'OK' else 'ROTO' end
       from public.planning_get_plan(v_token)));

  begin
    select 1 into v_dummy from public.planning_plans limit 1;
    insert into planning_pruebas(paso, resultado) values ('leer la tabla por PostgREST', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('leer la tabla por PostgREST', 'OK rechazado');
  end;

  begin
    perform public.planning_update_plan(v_id, null, '{"pisado":true}'::jsonb, 1,
            encode('0'::bytea, 'base64'), '[]'::jsonb);
    insert into planning_pruebas(paso, resultado) values ('sin cuenta, editar SIN secreto', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('sin cuenta, editar SIN secreto', 'OK rechazado: ' || sqlerrm);
  end;

  begin
    perform public.planning_delete_plan(v_id, null);
    insert into planning_pruebas(paso, resultado) values ('sin cuenta, borrar SIN secreto', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('sin cuenta, borrar SIN secreto', 'OK rechazado: ' || sqlerrm);
  end;

  reset role;

  -- ── El mismo desconocido, pero ahora con SU PROPIA cuenta ────────────────
  --
  -- Este es el caso que se escapo el 2026-09-06 y por el que existe este
  -- fichero. Crearse una cuenta es gratis: se pone un correo y se recibe un
  -- codigo. Si la guarda del dueno se resuelve a "desconocido" en vez de a
  -- "no", identificarse ABRE el plan de los demas en vez de proteger el tuyo.
  set role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  perform public.planning_touch_account();

  begin
    perform public.planning_update_plan(v_id, null, '{"pisado":true}'::jsonb, 1,
            encode('0'::bytea, 'base64'), '[]'::jsonb);
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, editar SIN secreto', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, editar SIN secreto', 'OK rechazado: ' || sqlerrm);
  end;

  begin
    perform public.planning_update_plan(v_id, 'secreto-inventado', '{"pisado":true}'::jsonb, 1,
            encode('0'::bytea, 'base64'), '[]'::jsonb);
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, editar con secreto MALO', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, editar con secreto MALO', 'OK rechazado: ' || sqlerrm);
  end;

  begin
    perform public.planning_delete_plan(v_id, null);
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, borrar SIN secreto', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, borrar SIN secreto', 'OK rechazado: ' || sqlerrm);
  end;

  begin
    perform public.planning_claim_plan(v_id, null);
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, quedarse el plan SIN secreto', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, quedarse el plan SIN secreto', 'OK rechazado: ' || sqlerrm);
  end;

  begin
    perform public.planning_claim_plan(v_id, '');
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, quedarselo con secreto VACIO', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('CON cuenta ajena, quedarselo con secreto VACIO', 'OK rechazado: ' || sqlerrm);
  end;

  insert into planning_pruebas(paso, resultado)
  values ('is_mine para quien no es el dueno',
    (select case when is_mine is null then '*** REVISAR: devuelve nulo ***'
                 when is_mine then '*** AGUJERO ***' else 'OK, false' end
       from public.planning_get_plan(v_token)));

  perform set_config('request.jwt.claims', '', true);
  reset role;

  insert into planning_pruebas(paso, resultado)
  values ('despues de todos los ataques, el plan sigue intacto y sin dueno',
    (select case when config::text = '{"de": "la victima"}' and account_id is null
                 then 'OK' else '*** TOCADO: ' || config::text || ' ***' end
       from public.planning_plans where id = v_id));

  -- ── Y ahora los caminos que SI tienen que funcionar ──────────────────────
  set role anon;
  begin
    perform public.planning_update_plan(v_id, v_secreto, '{"de":"la victima","v":2}'::jsonb, 1,
            encode('4,5,6'::bytea, 'base64'), '[]'::jsonb);
    insert into planning_pruebas(paso, resultado) values ('quien lo creo edita CON su secreto', 'OK');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('quien lo creo edita CON su secreto', '*** ROTO: ' || sqlerrm || ' ***');
  end;
  reset role;

  set role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

  begin
    perform public.planning_claim_plan(v_id, v_secreto);
    insert into planning_pruebas(paso, resultado) values ('se identifica y el plan pasa a ser suyo', 'OK');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('se identifica y el plan pasa a ser suyo', '*** ROTO: ' || sqlerrm || ' ***');
  end;

  begin
    perform public.planning_claim_plan(v_id, v_secreto);
    insert into planning_pruebas(paso, resultado) values ('reclamarlo dos veces no protesta', 'OK');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('reclamarlo dos veces no protesta', '*** ROTO: ' || sqlerrm || ' ***');
  end;

  begin
    perform public.planning_update_plan(v_id, null, '{"de":"la victima","v":3}'::jsonb, 1,
            encode('7,8,9'::bytea, 'base64'), '[]'::jsonb);
    insert into planning_pruebas(paso, resultado) values ('ya siendo suyo, edita sin secreto', 'OK');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('ya siendo suyo, edita sin secreto', '*** ROTO: ' || sqlerrm || ' ***');
  end;

  select count(*) into v_n from public.planning_my_plans();
  insert into planning_pruebas(paso, resultado)
  values ('sus planes salen en su lista', case when v_n = 1 then 'OK, 1' else '*** ROTO: ' || v_n || ' ***' end);

  insert into planning_pruebas(paso, resultado)
  values ('is_mine para el dueno',
    (select case when is_mine then 'OK, true' else '*** ROTO ***' end
       from public.planning_get_plan(v_token)));

  perform set_config('request.jwt.claims', '', true);
  reset role;

  -- El atacante contra un plan que YA tiene dueno
  set role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  begin
    perform public.planning_delete_plan(v_id, null);
    insert into planning_pruebas(paso, resultado) values ('borrar el plan YA reclamado por otro', '*** AGUJERO ***');
  exception when others then
    insert into planning_pruebas(paso, resultado) values ('borrar el plan YA reclamado por otro', 'OK rechazado: ' || sqlerrm);
  end;
  select count(*) into v_n from public.planning_my_plans();
  insert into planning_pruebas(paso, resultado)
  values ('la lista del atacante sigue vacia', case when v_n = 0 then 'OK, 0' else '*** AGUJERO: ' || v_n || ' ***' end);
  perform set_config('request.jwt.claims', '', true);
  reset role;

  -- ── Limpieza. Si esto no corre, quedan cuentas de mentira en la base ─────
  delete from public.planning_plans where id = v_id;
  delete from auth.users where id in ('11111111-1111-1111-1111-111111111111',
                                      '22222222-2222-2222-2222-222222222222');

  insert into planning_pruebas(paso, resultado)
  values ('limpieza: no queda nada de la prueba',
    case when not exists (select 1 from public.planning_plans where id = v_id)
          and not exists (select 1 from auth.users where email like 'prueba-%@ejemplo.test')
         then 'OK' else '*** HA QUEDADO BASURA, borrala a mano ***' end);
end $$;

select paso, resultado from planning_pruebas order by n;
