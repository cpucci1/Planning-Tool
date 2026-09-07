-- ============================================================================
-- Comprobacion de que el backend quedo bien instalado
-- ============================================================================
--
-- Se pega en el editor SQL de freetools DESPUES del 10 y del 20. No escribe
-- nada: solo mira. Devuelve una tabla con una fila por cosa comprobada y un
-- veredicto en la ultima columna.
--
-- Esto comprueba que las piezas ESTAN. Que se defiendan bien es otra cosa y
-- tiene su propio fichero: 98-probar-seguridad.sql, que ataca de verdad.
--
-- Copia el resultado entero y pegalo en el chat.
-- ============================================================================

with tablas as (
  select 'Tablas creadas' as comprobacion,
         count(*)::text || ' de 5' as valor,
         case when count(*) = 5 then 'BIEN' else 'FALTA ALGUNA' end as veredicto
    from pg_tables
   where schemaname = 'public'
     and tablename in ('tool_accounts', 'planning_plans', 'planning_plan_datasets',
                       'planning_ai_calls', 'planning_daily_counters')
),
rls as (
  select 'RLS encendida en todas' as comprobacion,
         count(*) filter (where c.relrowsecurity)::text || ' de ' || count(*)::text as valor,
         case when count(*) = count(*) filter (where c.relrowsecurity)
              then 'BIEN' else 'PELIGRO: alguna tabla sin RLS' end as veredicto
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('tool_accounts', 'planning_plans', 'planning_plan_datasets',
                       'planning_ai_calls', 'planning_daily_counters')
),
-- Esta es LA comprobacion importante. En el esquema public de Supabase hay
-- permisos por defecto que conceden todo a anon y a authenticated en cualquier
-- tabla nueva. Si el REVOKE no entro, estas tablas estan en internet con la
-- clave que va dentro del bundle de la web.
--
-- Se pregunta con has_table_privilege y NO con information_schema.role_table_grants:
-- esa vista solo ensena los permisos que el usuario que consulta tiene derecho a
-- ver, asi que segun con quien te conectes puede devolver 0 filas estando las
-- tablas abiertas de par en par. Una comprobacion que dice BIEN cuando no lo
-- esta es peor que no tenerla, porque da permiso para desplegar.
permisos as (
  select 'Permisos de tabla para anon y authenticated' as comprobacion,
         count(*)::text || ' (tiene que ser 0)' as valor,
         case when count(*) = 0 then 'BIEN'
              else 'PELIGRO: las tablas estan expuestas' end as veredicto
    from (
      select t.tabla, r.rol, p.priv
        from (values ('tool_accounts'), ('planning_plans'), ('planning_plan_datasets'),
                     ('planning_ai_calls'), ('planning_daily_counters')) as t(tabla)
        cross join (values ('anon'), ('authenticated')) as r(rol)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                           ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
       where has_table_privilege(r.rol, ('public.' || t.tabla)::regclass, p.priv)
    ) abiertas
),
-- Sin este REVOKE, un anonimo puede CREAR sus propias tablas y funciones en el
-- mismo esquema por el que pasan las nuestras. Es la puerta clasica para
-- envenenar un search_path.
crear as (
  select 'Pueden anon o authenticated crear cosas en public' as comprobacion,
         (has_schema_privilege('anon', 'public', 'CREATE')::text || ' / ' ||
          has_schema_privilege('authenticated', 'public', 'CREATE')::text) as valor,
         case when not has_schema_privilege('anon', 'public', 'CREATE')
               and not has_schema_privilege('authenticated', 'public', 'CREATE')
              then 'BIEN' else 'PELIGRO: pueden crear en public' end as veredicto
),
funciones as (
  select 'Funciones creadas' as comprobacion,
         count(*)::text || ' de 17' as valor,
         case when count(*) = 17 then 'BIEN' else 'FALTA ALGUNA O SOBRA' end as veredicto
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'planning\_%'
),
-- Ojo: prosecdef filtra a las SECURITY DEFINER, y el disparador de updated_at no
-- lo es. Se mira TODA funcion planning_ sin search_path fijo, no solo las
-- definer, porque el linter de Supabase avisa de las dos.
search_path as (
  select 'Funciones sin search_path fijo' as comprobacion,
         count(*)::text || ' (tiene que ser 0)' as valor,
         case when count(*) = 0 then 'BIEN' else 'REVISAR' end as veredicto
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'planning\_%'
     and p.proconfig is null
),
-- Ninguna de las que puede llamar un anonimo debe poder tocar nada que no sea
-- suyo. Aqui solo se comprueba QUE puede llamar; que se defiendan bien lo prueba
-- 98-probar-seguridad.sql.
ejecutables as (
  select 'Funciones que puede llamar un anonimo' as comprobacion,
         string_agg(p.proname, ', ' order by p.proname) as valor,
         case when count(*) = 4 then 'BIEN (crear, leer, actualizar y borrar con secreto)'
              else 'REVISAR: esperaba exactamente 4' end as veredicto
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'planning\_%'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
),
con_sesion as (
  select 'Funciones que anade tener sesion' as comprobacion,
         string_agg(p.proname, ', ' order by p.proname) as valor,
         case when count(*) = 3 then 'BIEN (reclamar, listar los mios y refrescar la cuenta)'
              else 'REVISAR: esperaba exactamente 3' end as veredicto
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'planning\_%'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not has_function_privilege('anon', p.oid, 'EXECUTE')
),
-- pgcrypto tiene que estar en el esquema `extensions`, porque todas las
-- funciones la llaman como extensions.crypt. Si esta en otro sitio, el backend
-- se instala perfecto y revienta al guardar el primer plan.
pgcrypto as (
  select 'pgcrypto en el esquema extensions' as comprobacion,
         coalesce((select n.nspname from pg_extension e
                     join pg_namespace n on n.oid = e.extnamespace
                    where e.extname = 'pgcrypto'), 'NO INSTALADA') as valor,
         case when exists (select 1 from pg_extension e
                             join pg_namespace n on n.oid = e.extnamespace
                            where e.extname = 'pgcrypto' and n.nspname = 'extensions')
              then 'BIEN' else 'MAL: las funciones llaman a extensions.crypt' end as veredicto
),
-- El trigger de updated_at. Sin el, esa fecha miente, que es lo que pasa en dos
-- de cada tres tablas de la base de produccion de Shifty.
disparador as (
  select 'Disparador de updated_at' as comprobacion,
         count(*)::text || ' de 1' as valor,
         case when count(*) = 1 then 'BIEN' else 'FALTA' end as veredicto
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'planning_plans'
     and t.tgname = 'planning_plans_updated_at'
     and not t.tgisinternal
),
-- Sin esto, cualquiera puede quedarse con la cuenta de otro registrando su
-- correo antes que el. Ver 30-nada-de-contrasenas.sql.
sin_contrasenas as (
  select 'Nadie puede guardar una contrasena' as comprobacion,
         count(*)::text || ' de 1' as valor,
         case when count(*) = 1 then 'BIEN' else 'PELIGRO: falta el disparador' end as veredicto
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and c.relname = 'users'
     and t.tgname = 'planning_sin_contrasenas' and not t.tgisinternal
),
contrasenas_guardadas as (
  select 'Contrasenas guardadas (tiene que ser 0)' as comprobacion,
         (select count(*)::text from auth.users where encrypted_password is not null) as valor,
         case when (select count(*) from auth.users where encrypted_password is not null) = 0
              then 'BIEN' else 'PELIGRO: alguna cuenta tiene contrasena' end as veredicto
),
datos as (
  select 'Planes guardados' as comprobacion,
         (select count(*)::text from public.planning_plans) as valor,
         'informativo' as veredicto
)
select * from tablas
union all select * from rls
union all select * from permisos
union all select * from crear
union all select * from funciones
union all select * from search_path
union all select * from ejecutables
union all select * from con_sesion
union all select * from pgcrypto
union all select * from disparador
union all select * from sin_contrasenas
union all select * from contrasenas_guardadas
union all select * from datos;
