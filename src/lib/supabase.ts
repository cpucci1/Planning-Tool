/**
 * El cliente de Supabase del planificador.
 *
 * Apunta al proyecto "freetools", que NO es el de produccion de Shifty. Es una
 * decision deliberada del 2026-09-06 y conviene saber por que, porque si algun
 * dia alguien "unifica" esto vuelve a abrir el agujero:
 *
 * En el proyecto de produccion, una sesion sale con el rol `authenticated`, y
 * ese rol puede hoy ejecutar 904 funciones, de las cuales 37 escriben aceptando
 * un company_id o un worker_id por parametro sin comprobar quien llama. Ninguna
 * politica sobre tablas nuevas arregla eso. Ademas `auth.users` tiene UNIQUE
 * sobre el telefono, asi que un duenno de restaurante que ya sea trabajador de
 * Shifty no podria tener aqui una cuenta separada.
 *
 * En un proyecto aparte las dos cosas dejan de existir.
 *
 * LA HERRAMIENTA TIENE QUE FUNCIONAR SIN ESTO. Si no hay configuracion, el
 * cliente es null y todo lo de guardar en servidor se apaga solo: el calculo, el
 * autoguardado en el navegador y el enlace compartido siguen funcionando igual.
 * Es un lead magnet: que se caiga el backend no puede significar que la gente no
 * pueda calcular su plantilla.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_FREETOOLS_URL as string | undefined
const CLAVE = import.meta.env.VITE_FREETOOLS_ANON_KEY as string | undefined

/**
 * Null si no hay configuracion. Todo el que lo use tiene que comprobarlo, y por
 * eso el tipo lo obliga en vez de dejar que reviente en tiempo de ejecucion.
 */
export const supabase: SupabaseClient | null =
  URL && CLAVE
    ? createClient(URL, CLAVE, {
        auth: {
          // La sesion se guarda y se refresca sola: quien entro con su email
          // sigue dentro al volver mañana, que es justo el punto de tener cuenta.
          persistSession: true,
          autoRefreshToken: true,
          // El OTP por email de Supabase vuelve por un enlace con el token en el
          // `#` de la direccion. Con esto activado, el cliente lo lee al cargar y
          // limpia la direccion solo.
          detectSessionInUrl: true,
          storageKey: 'shifty-planning:auth',
        },
      })
    : null

/** ¿Hay backend configurado? Para poder enseñar u ocultar lo que depende de el. */
export function hayBackend(): boolean {
  return supabase !== null
}
