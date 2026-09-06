-- Migracion 01 - planning_guard_link_auth_user_allowlist
--
-- QUE ARREGLA
-- La funcion link_auth_user_to_worker_and_company_user es un trigger AFTER INSERT
-- sobre auth.users. Engancha la cuenta nueva a la ficha (worker, company_user,
-- internal_user o partner_user) que tenga ese mismo telefono y todavia no tenga
-- cuenta. Tiene cuatro ramas por tipo de usuario y un ELSE final que intenta las
-- cuatro a la vez.
--
-- Ese ELSE se come CUALQUIER tipo desconocido. Es decir: cada tipo de usuario
-- nuevo que alguien invente queda, por defecto, enganchando fichas ajenas en
-- silencio. Con el planificador a punto de crear cuentas propias, un duenno de
-- restaurante ya precreado en Shifty perderia su cuenta de empresa por el simple
-- hecho de usar el planificador con su telefono.
--
-- COMO LO ARREGLA
-- Se anade UNA guarda con la lista explicita de los tipos que de verdad usan el
-- enganche. No se toca ninguna de las cuatro ramas ni el ELSE. Lo que no esta en
-- la lista sale pronto y no escribe absolutamente nada.
--
-- POR QUE ESTA LISTA
-- Sale de contar produccion el 2026-09-06, no de memoria:
--   worker        14.724
--   company          229   <- tipo antiguo, ultimo alta el 2026-02-16
--   company_user     223
--   (sin user_type)   48   <- cadena vacia, el caso para el que se escribio el ELSE
--   partner_user      10
--   internal_user      3
-- Los seis estan en la lista, asi que HOY no cambia el comportamiento de nadie.
--
-- POR QUE ES ESCALABLE
-- Invierte el defecto. Antes lo desconocido enganchaba; ahora lo desconocido no
-- hace nada. Un tipo nuevo nace seguro sin volver a tocar esta funcion: para que
-- enganche hay que anadirlo aqui a proposito.
--
-- COMO SE APLICA SIN RIESGO
-- El cuerpo NO se retranscribe (son 3.637 caracteres y ahi es donde se cuelan las
-- erratas). Se lee el de produccion, se le hace UNA sustitucion exacta y se
-- comprueba antes que el ancla aparece exactamente una vez. Si no encaja, la
-- migracion falla y no se aplica nada. Es idempotente: si ya esta puesta, aborta.

DO $mig$
DECLARE
  v_src   text;
  v_nuevo text;
  v_veces int;
  v_ancla text := $ancla$  v_user_type := COALESCE(new.raw_user_meta_data->>'user_type', '');

  -- WORKERS$ancla$;
  v_puesto text := $puesto$  v_user_type := COALESCE(new.raw_user_meta_data->>'user_type', '');

  -- Enganche automatico por telefono: SOLO para los tipos que de verdad lo usan.
  -- Antes, cualquier tipo desconocido caia en el ELSE del final y se enganchaba
  -- a un worker, company_user, internal_user o partner_user con ese telefono.
  -- Eso convertia cada tipo de usuario nuevo en un secuestro silencioso de
  -- fichas ajenas. Ahora la lista es explicita y lo que no esta no toca nada.
  --
  -- La lista sale de produccion el 2026-09-06: worker 14.724, company 229,
  -- company_user 223, sin tipo 48, partner_user 10, internal_user 3. La cadena
  -- vacia es el caso "sin metadata", para el que se escribio este respaldo.
  --
  -- Un tipo nuevo (por ejemplo el del planificador) nace seguro sin volver a
  -- tocar esta funcion: para que enganche hay que anadirlo aqui a proposito.
  IF NOT (v_user_type = ANY (ARRAY[
            'worker', 'company_user', 'internal_user', 'partner_user',
            'company', ''
          ])) THEN
    RETURN new;
  END IF;

  -- WORKERS$puesto$;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'link_auth_user_to_worker_and_company_user';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'No existe public.link_auth_user_to_worker_and_company_user';
  END IF;

  IF position('Enganche automatico por telefono' IN v_src) > 0 THEN
    RAISE EXCEPTION 'La guarda ya esta aplicada. No se toca nada.';
  END IF;

  -- Se cuenta sin expresiones regulares, para no pelearse con el escapado.
  v_veces := (length(v_src) - length(replace(v_src, v_ancla, ''))) / length(v_ancla);
  IF v_veces <> 1 THEN
    RAISE EXCEPTION 'El ancla aparece % veces y esperaba exactamente 1. Aborto.', v_veces;
  END IF;

  v_nuevo := replace(v_src, v_ancla, v_puesto);
  IF v_nuevo = v_src THEN
    RAISE EXCEPTION 'La sustitucion no ha cambiado nada. Aborto.';
  END IF;

  -- Firma, seguridad, search_path y volatilidad reproducidos tal cual estan hoy
  -- en produccion (comprobado en pg_proc el 2026-09-06).
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.link_auth_user_to_worker_and_company_user() '
    'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path TO public, extensions, pg_temp AS %L',
    v_nuevo
  );
END
$mig$;

-- COMPROBACION DESPUES DE APLICAR (tiene que dar una fila con guarda = true)
--
--   select position('Enganche automatico por telefono' in prosrc) > 0 as guarda,
--          prosecdef, proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'link_auth_user_to_worker_and_company_user';
--
-- Y ademas plpgsql_check sobre la funcion, que tiene que salir limpio.
