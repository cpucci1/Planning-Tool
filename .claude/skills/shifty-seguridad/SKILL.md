---
name: shifty-seguridad
description: >
  Cómo se crea una tabla, una vista o una función en Shifty sin abrir un agujero: la RLS obligatoria
  y sus políticas, los permisos de los roles anon y authenticated, qué significa SECURITY DEFINER y
  cuándo se usa, el search_path fijo, y el estado real de seguridad de la base con sus errores
  abiertos. Úsala SIEMPRE antes de crear o modificar una tabla, una vista, una función o una
  política, antes de dar permisos a un rol, al revisar quién puede ver qué, y cuando alguien diga
  "crea una tabla", "añade esto a la base", "por qué no puedo leer esta tabla", "quién puede ver
  esto", "es seguro" o "revisa la seguridad".
---

# Seguridad de la base de datos de Shifty

**La clave anónima de Supabase va dentro de las apps. Es pública por diseño.** Cualquiera puede
sacarla del bundle. Lo único que separa a un desconocido de los datos es la **RLS** y los permisos
de rol. Si una tabla no tiene RLS y el rol `anon` tiene permisos, esa tabla está en internet.

---

## 1. Al crear una tabla: la lista que no se salta

Una tabla nueva no está terminada hasta que tiene las cinco cosas. **Y crear una tabla necesita
permiso escrito de Crescente** (regla 1 del maestro), así que se propone todo junto:

1. **`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.** Siempre. Sin excepción, ni siquiera "es interna",
   ni "solo la escribe un cron", ni "es temporal".
2. **Al menos una política.** RLS encendida sin políticas significa que **nadie puede leer**, que es
   seguro pero deja la tabla inservible desde el cliente. Si de verdad no la lee ningún cliente,
   déjalo así **a propósito** y escríbelo en el comentario de la tabla.
3. **Permisos mínimos por rol.** La pregunta es *¿quién necesita esto de verdad?*
   - Si solo la escribe un proceso de servidor (cron, edge function): **no dar nada a `anon` ni a
     `authenticated`**. El `service_role` se salta la RLS y no necesita permisos explícitos.
   - Si la lee el panel: política para internos.
   - Si la lee una empresa: política que filtre por su `company_id`.
   - Si la lee un trabajador: política que filtre por su propio `worker_id`.
   - **`anon` casi nunca.** Solo para datos verdaderamente públicos.
4. **Comentario en la tabla y en cada columna** (ver `shifty-base-de-datos`).
5. **Índices** para las columnas por las que se filtra, empezando por las que usa la política: una
   política mal indexada convierte cada consulta en un barrido.

**La pregunta de control antes de dar por buena una tabla nueva:**
*si alguien saca la clave anónima del bundle de la app, ¿qué puede hacer con esta tabla?*
La respuesta tiene que ser "nada".

---

## 2. Funciones: `SECURITY DEFINER` y el patrón de Shifty

Una función `SECURITY DEFINER` se ejecuta **con los privilegios de quien la creó**, no de quien la
llama. Se salta la RLS. Es la forma normal de trabajar aquí, y es correcta **si la función se
defiende por dentro**.

**El patrón que hay que seguir, y que la base ya usa bien:**

1. **Averiguar quién llama**, con `auth.uid()`. Si es nulo, es un anónimo: cortar.
2. **Comprobar que tiene derecho**, con los helpers que ya existen: `assert_company_user_can`,
   `check_company_user_can`, `_require_internal_user`, `assert_can_edit_job_day`,
   `assert_is_company_member`, `resolve_ett_payer_for_caller`.
3. **Imponer el alcance, no aceptarlo por parámetro.** Este es el punto que más se falla.
   `resolve_ett_payer_for_caller` lo hace bien: a un usuario de la ETT le devuelve **siempre su
   propio pagador**, ignorando el que pida por parámetro. Si una función acepta un `company_id` por
   parámetro y no comprueba que quien llama pertenece a esa empresa, cualquiera puede leer los datos
   de cualquier empresa.
4. **Fijar el `search_path`** (`SET search_path = public, pg_temp`). Sin eso, alguien que pueda crear
   objetos en un esquema anterior en el camino puede secuestrar lo que la función llama. Hoy hay
   **124 funciones sin fijarlo**.
5. **Dejar rastro en `activity_log`** si muta algo.

**Nunca devolver `SQLERRM` al cliente**: enseña las tripas de Postgres y esconde el bug.

### Los permisos de ejecución

Hoy hay **1.106 funciones `SECURITY DEFINER` ejecutables por usuarios autenticados** y **189 por
anónimos**. En la muestra revisada, todas se defendían por dentro correctamente. **No son 189
agujeros**, pero sí es un valor por defecto peligroso: significa que una función nueva escrita por
alguien que se olvide de la comprobación queda expuesta desde el primer día.

**Regla:** una función nueva **no se otorga a `anon`** salvo que haya un motivo escrito. Si solo la
usa el panel, se otorga a `authenticated` y se comprueba internamente que es interno.

---

## 3. Vistas

- **Una vista hereda la RLS de las tablas que lee solo si es `security_invoker`.** Por defecto no lo
  es: una vista normal se ejecuta con los permisos de quien la creó y **se salta la RLS**.
- **Tras cada `CREATE OR REPLACE VIEW` hay que re-aplicar `security_invoker = true` y el
  `grant select`.** Postgres los pierde al recrear y **no avisa**: la vista queda viva devolviendo
  cero filas al usuario normal, sin error. El 2026-06-12 dejó una bandeja en blanco.
- Hoy hay **6 vistas marcadas como `SECURITY DEFINER`** por el analizador, entre ellas
  `cost_center_onboarding_with_steps`, que es la que decide quién puede publicar anuncios. Revisar si
  cada una lo necesita de verdad.

---

## 4. El estado real, medido el 2026-09-02

El analizador de Supabase da **1.519 avisos de seguridad**:

| Nivel | Cuántos | Qué es |
|---|---|---|
| **ERROR** | **14** | Tablas en `public` **sin RLS** |
| **ERROR** | **6** | Vistas con `SECURITY DEFINER` |
| WARN | 1.106 | Funciones `SECURITY DEFINER` ejecutables por autenticados |
| WARN | 189 | Funciones `SECURITY DEFINER` ejecutables por **anónimos** |
| WARN | 124 | Funciones sin `search_path` fijo |
| WARN | 1 | Protección de contraseñas filtradas **desactivada** |
| INFO | 72 | Tablas con RLS pero sin ninguna política |

### ✅ El agujero que había, y cómo se cerró (2026-09-02)

**Cerrado.** Las 13 tablas que estaban abiertas ya tienen RLS; ninguna es accesible sin cuenta, diez
están cerradas también a los usuarios con cuenta, y tres solo las lee un interno activo. Se hizo en
cuatro migraciones con verificación entre cada una y ningún cron falló. El detalle y las lecciones
están en `Docs/docs/shared/PENDIENTE.md`.

**Las tres lecciones que valen para la próxima vez:**

1. **Antes de encender la RLS, mira quién es el dueño de la tabla.** Si es `postgres` y
   `relforcerowsecurity` es falso, los crons que corren como `postgres` se la saltan y no se rompen.
   Eso convirtió un cambio que parecía arriesgado en uno seguro.
2. **Cerrar la tabla no basta si una vista la expone.** `v8_wcp_pending` es `SECURITY DEFINER`,
   leía los datos de skills y la podía leer un anónimo: cerrar solo la tabla no habría tapado nada.
3. **Un trigger corre como quien dispara la escritura.** El de la cola de skills salta cuando un
   trabajador edita su CV desde la app, así que encender la RLS sin más le habría roto el CV. La
   solución fue pasar la función del trigger a `SECURITY DEFINER`, no abrir la tabla.

<details>
<summary>Cómo estaba antes</summary>

**13 tablas tenían la RLS apagada Y el rol `anon` podía leer, insertar, modificar y borrar.**
Son unas 8.800 filas, y entre ellas:

- `v8_worker_competency_profile` (**5.899 filas**): perfil de competencias de trabajadores, con nivel,
  años de experiencia, prestigio y empleadores.
- `v8_worker_skills_extracted` (1.072): las skills sacadas de sus CV.
- `rescue_decisions` (1.691), `rescue_supply_outreach` (55, **con teléfono y el mensaje enviado**).
- `rescue_opt_outs` (10): **quién pidió no ser contactado.** Cualquiera puede borrar esas filas, y
  entonces se les volvería a escribir. Eso es un problema de protección de datos, no solo técnico.
- `tarifa_recommendations` (46): tarifas de mercado con suelo, techo y el mensaje al cliente.
- Más `rescue_config`, `rescue_health_log`, `tarifa_supply_cache`, `v8_skill_catalog`,
  `v8_skill_extract_queue`, `v8_position_skills_extracted` y `_sara_backlog_cutoff_20260629`.

</details>

**Sigue pendiente** de la misma familia: activar la protección de contraseñas filtradas, revisar las
6 vistas `SECURITY DEFINER`, fijar el `search_path` en las 124 funciones que no lo tienen, y repasar
las 72 tablas con RLS pero sin ninguna política. Ver `Docs/docs/shared/PENDIENTE.md`.

---

## 5. Al revisar si algo es seguro

Cuatro comprobaciones, en este orden:

1. **¿La tabla tiene RLS encendida?** Si no, todo lo demás da igual.
2. **¿Qué puede hacer `anon` y qué puede hacer `authenticated`?** No mirar solo el SELECT: el
   INSERT, UPDATE y DELETE también.
3. **¿La política filtra de verdad?** Una política que dice `true` no filtra nada.
4. **¿La función impone el alcance o lo acepta por parámetro?** Aceptarlo por parámetro sin
   comprobarlo es el fallo más común y el más caro.

Para el estado global, el analizador de Supabase da los avisos de seguridad ordenados por nivel.
Los ERROR se miran siempre; los WARN se leen con criterio, porque muchos son el permiso amplio de
un patrón que se defiende por dentro.

---

## 6. Lo que no se hace nunca

- **Crear una tabla sin RLS**, ni siquiera temporal. Las tablas temporales son las que se quedan.
- **Dar permisos a `anon`** sin un motivo escrito.
- **Aceptar el alcance por parámetro** (un `company_id`, un `worker_id`, un `payer_id`) sin
  comprobar que quien llama tiene derecho a él.
- **Poner una clave o un secreto en una tabla con RLS floja.** `bot_shared_secrets` tiene RLS con
  cero políticas, que es lo correcto: nadie la lee desde el cliente.
- **Commitear un `.env`** ni enseñarlo por pantalla.
- **Desactivar RLS "un momento para probar".** Se prueba con `service_role`, que ya la salta.
