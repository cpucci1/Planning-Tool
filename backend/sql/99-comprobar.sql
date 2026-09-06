-- ============================================================================
-- Comprobacion de que el backend quedo bien instalado
-- ============================================================================
--
-- Se pega en el editor SQL de freetools DESPUES del 10 y del 20. No escribe
-- nada: solo mira. Devuelve una tabla con una fila por cosa comprobada y un
-- veredicto en la ultima columna.
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
permisos as (
  select 'Permisos de tabla para anon y authenticated' as comprobacion,
         count(*)::text || ' (tiene que ser 0)' as valor,
         case when count(*) = 0 then 'BIEN'
              else 'PELIGRO: las tablas estan expuestas' end as veredicto
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and table_name in ('tool_accounts', 'planning_plans', 'planning_plan_datasets',
                        'planning_ai_calls', 'planning_daily_counters')
),
funciones as (
  select 'Funciones creadas' as comprobacion,
         count(*)::text || ' de 11' as valor,
         case when count(*) = 11 then 'BIEN' else 'FALTA ALGUNA' end as veredicto
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'planning\_%'
),
search_path as (
  select 'Funciones sin search_path fijo' as comprobacion,
         count(*)::text || ' (tiene que ser 0)' as valor,
         case when count(*) = 0 then 'BIEN' else 'REVISAR' end as veredicto
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'planning\_%'
     and p.prosecdef
     and p.proconfig is null
),
-- Ninguna de las que puede llamar un anonimo debe poder tocar nada que no sea
-- suyo. Aqui solo se comprueba QUE puede llamar; el como se defienden esta
-- escrito en cada una.
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
-- Un plan de prueba no deberia existir todavia.
datos as (
  select 'Planes guardados' as comprobacion,
         (select count(*)::text from public.planning_plans) as valor,
         'informativo' as veredicto
)
select * from tablas
union all select * from rls
union all select * from permisos
union all select * from funciones
union all select * from search_path
union all select * from ejecutables
union all select * from datos;
