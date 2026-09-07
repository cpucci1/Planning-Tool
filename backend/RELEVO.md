# Estado del backend

> Este fichero era el prompt de relevo para el chat que tenía acceso a `freetools`.
> **Ya se hizo, el 2026-09-06.** Se queda como resumen de en qué estado quedó todo y de qué
> falta, para no tener que releer cuatro README.

## Lo que está hecho y probado contra la base

| Pieza | Dónde | Estado |
|---|---|---|
| Tablas, permisos y funciones | `sql/10-esquema.sql`, `sql/20-funciones.sql` | Aplicado en `freetools` |
| Comprobación de instalación | `sql/99-comprobar.sql` | Once comprobaciones, todas BIEN |
| Prueba de que se defiende | `sql/98-probar-seguridad.sql` | 22 pruebas, 22 OK |
| Función de Gemini | `functions/planning-ai/` | Desplegada, `verify_jwt` apagado, contestando |
| Correo del código por Brevo | `functions/planning-auth-email/` | Desplegada y el hook activado. **No manda: ver abajo** |

Cinco tablas (`tool_accounts`, `planning_plans`, `planning_plan_datasets`, `planning_ai_calls`,
`planning_daily_counters`), dieciséis funciones `planning_*`, RLS encendida en todas y **cero
permisos de tabla** para `anon` y `authenticated`.

Los secretos puestos en `freetools`: `GEMINI_API_KEY`, `BREVO_API_KEY`, `PLANNING_AI_HASH_SALT`
y `SEND_EMAIL_HOOK_SECRET`.

## Lo único que falta, y no es código

**La cuenta de Brevo rechaza los envíos por su restricción de IP.** Devuelve 401 diciendo que la
IP no está autorizada. Las funciones de Supabase salen por IPs de AWS que cambian en cada
arranque, así que añadirlas a la lista no vale: hay que **apagar la restricción** en
https://app.brevo.com/security/authorised_ips, o mandar el correo por otro proveedor.

Está explicado entero, con el mensaje literal de Brevo, en
`functions/planning-auth-email/README.md`.

Mientras tanto: se calcula, se guarda el plan sin cuenta y el enlace corto funciona. Lo que no
se puede es entrar con el correo para reclamarlo.

## ⛔ Lo que sigue prohibido

**No tocar el proyecto Supabase de producción de Shifty, `brgswggayexbvrnqtlhp`.** Todo esto vive
en `freetools` (`wabnolojhxlqhevehybw`) y solo ahí.

**No aplicar `sql/01-guarda-link-auth-user.sql`.** Es una migración escrita para producción que
dejó de hacer falta al irse el planificador a otro proyecto. Está ahí como documentación de un
agujero que **sigue abierto en producción**, no como algo que ejecutar.

## Dos cosas sin decidir, y no las decide quien lea esto

1. **Tres celdas de muestra de cada columna salen hacia el modelo.** En una columna tipo
   `CAMARERO` eso son nombres de empleados. La portada promete que el FICHERO no se sube y eso
   se cumple, pero esas tres celdas sí salen.
2. **La librería `xlsx` tiene dos avisos de seguridad de gravedad alta** (`GHSA-4r6h-8v6p-xvw6`
   y `GHSA-5pgg-2g8v-p4x9`) y npm dice que no hay arreglo por ahí.

El resto de lo abierto está en la sección 10 del `CLAUDE.md` del repo.
