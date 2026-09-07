-- ============================================================================
-- Aqui se entra con un CODIGO. Nunca con contrasena.
-- ============================================================================
--
-- ⚠️ ESTE FICHERO PONE UN DISPARADOR SOBRE `auth.users`, Y ESO NO SE HACE A LA
-- LIGERA. Va aparte de los otros dos a proposito, para que se vea.
--
-- Se aplica DESPUES de 10-esquema.sql y 20-funciones.sql. Solo en `freetools`.
--
-- ----------------------------------------------------------------------------
-- QUE PROBLEMA RESUELVE
-- ----------------------------------------------------------------------------
--
-- El planificador entra solo con el codigo de seis digitos del correo: el front
-- no pide una contrasena en ninguna pantalla. Pero Supabase deja la puerta de la
-- contrasena abierta igual, y por ahi entraba esto, comprobado paso a paso
-- contra esta misma base el 2026-09-07:
--
--   1. Alguien manda un alta a /auth/v1/signup con el correo de un restaurante y
--      una contrasena que se inventa. La cuenta se crea. Antes ademas devolvia
--      SESION EN EL ACTO, con el correo marcado como verificado sin que nadie
--      hubiera probado nada.
--   2. Solo puede haber UNA cuenta por direccion. Asi que cuando el dueno de
--      verdad entra con su codigo, entra en ESA cuenta.
--   3. Desde entonces el que la registro vuelve a entrar con su contrasena, ve
--      la lista de planes de esa persona (nombre de su fichero, cuanta gente le
--      sale, cuantas horas) y se los puede borrar.
--
-- Es el patron que se llama "quedarse la cuenta por adelantado": no roba nada
-- hoy, se pone hoy y funciona el dia que la victima aparezca. Y esta herramienta
-- se le ensena a restaurantes concretos, por su nombre.
--
-- ----------------------------------------------------------------------------
-- POR QUE NO SE ARREGLA DE OTRA FORMA. Se probaron las tres alternativas.
-- ----------------------------------------------------------------------------
--
-- · ENCENDER LA CONFIRMACION DE CORREO. Ayuda y se ha dejado encendida: el alta
--   con contrasena ya no entrega sesion en el acto. Pero NO cierra el agujero, y
--   esto esta medido, no supuesto: en cuanto la victima entra con su codigo su
--   correo queda confirmado, y la contrasena que dejo puesta el otro vuelve a
--   valer.
--
-- · EL ENGANCHE "before user created", que era lo limpio. NO SIRVE. Se desplego
--   una funcion espia que registraba lo que recibe, y el aviso de un alta con
--   contrasena y el de una con codigo salen IDENTICOS: mismo `provider: email`,
--   mismas identidades vacias, mismos campos. No hay nada por lo que
--   distinguirlos, asi que no se puede rechazar una sin rechazar la otra.
--
-- · APAGAR EL REGISTRO. No vale: apagaria tambien el alta por codigo, que es
--   justo como entra la gente por primera vez.
--
-- Supabase no tiene un interruptor para quitar la via de contrasena: no esta en
-- su `config.toml` (comprobado listando todas las opciones que conoce la CLI).
-- Asi que se quita aqui.
--
-- ----------------------------------------------------------------------------
-- COMO
-- ----------------------------------------------------------------------------
--
-- Ninguna fila de `auth.users` llega a guardar una contrasena. Sin contrasena
-- guardada, la comparacion que hace GoTrue al entrar no puede cuadrar nunca, y
-- `/auth/v1/token?grant_type=password` responde "Invalid login credentials"
-- pase lo que pase.
--
-- La funcion vive en `public` y no en `auth` porque en `auth` no se puede crear
-- nada con los permisos que da Supabase; el disparador si se puede colgar de la
-- tabla.
--
-- ⚠️ SI ALGUN DIA ESTA HERRAMIENTA QUIERE CONTRASENAS, hay que quitar esto
-- primero. Se vera enseguida, porque nadie podra poner ninguna.
-- ============================================================================

begin;

create or replace function public.planning_sin_contrasenas()
returns trigger
language plpgsql
security definer
set search_path = auth, public, pg_temp
as $$
begin
  -- A null y no a cadena vacia: null es lo que ya tiene una cuenta creada por
  -- codigo, asi que todas las filas quedan iguales y no hay dos formas
  -- distintas de decir "sin clave".
  new.encrypted_password := null;
  return new;
end;
$$;

comment on function public.planning_sin_contrasenas() is
  'Deja sin contrasena toda cuenta de auth. En este proyecto se entra SOLO con el codigo del correo; permitir que se guarde una contrasena deja quedarse con la cuenta de otro registrando su direccion antes que el. Ver 30-nada-de-contrasenas.sql.';

drop trigger if exists planning_sin_contrasenas on auth.users;
create trigger planning_sin_contrasenas
  before insert or update of encrypted_password on auth.users
  for each row execute function public.planning_sin_contrasenas();

-- GoTrue se conecta como supabase_auth_admin: es quien tiene que poder ejecutar
-- la funcion del disparador.
grant execute on function public.planning_sin_contrasenas() to supabase_auth_admin;

-- Y nadie mas: es fontaneria, no parte de la API de la herramienta.
revoke all on function public.planning_sin_contrasenas() from public, anon, authenticated;

-- Las contrasenas que ya estuvieran guardadas antes de esto, fuera.
update auth.users set encrypted_password = null where encrypted_password is not null;

commit;
