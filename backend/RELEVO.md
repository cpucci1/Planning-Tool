# Prompt para el chat que sí tiene acceso a `freetools`

Copia todo lo que hay debajo de la línea y pégalo en el chat nuevo.

---

Trabajas en `/Users/clara/Desktop/Shifty/Github/Planning-Tool`. **Lee su `CLAUDE.md` entero antes
de nada**, y en especial la sección 10, que explica el backend y por qué está donde está.

## Qué hay que hacer

Instalar y dejar funcionando el backend del planificador en el proyecto Supabase **`freetools`**.
El código ya está escrito y revisado; falta ejecutarlo contra la base y probarlo de verdad.

La rama es `feature/backend-freetools` y está abierta como PR #6 en `cpucci1/Planning-Tool`.
Empieza por ahí: `git checkout feature/backend-freetools`.

## ⛔ Lo que NO puedes hacer, bajo ningún concepto

**No toques el proyecto Supabase de producción de Shifty, `brgswggayexbvrnqtlhp`.** Todo esto va
en `freetools` y solo en `freetools`. Si el conector te ofrece los dos, comprueba en cuál estás
antes de cada escritura. Producción la comparten seis proyectos y 14.724 usuarios.

**No apliques `backend/sql/01-guarda-link-auth-user.sql`.** Es una migración para producción que
se escribió y luego dejó de hacer falta. Está ahí como documentación de un agujero que sigue
abierto, no como algo que ejecutar hoy.

## Los pasos, en orden

### 1. El esquema

Aplica en `freetools`, por este orden: `backend/sql/10-esquema.sql` y luego `20-funciones.sql`.

Después ejecuta `backend/sql/99-comprobar.sql` y **comprueba que todas las filas dicen BIEN**. La
que más importa es la de permisos: tiene que dar 0. Si da cualquier otra cosa, las tablas están
expuestas a la clave anónima, que es pública y va dentro del bundle de la web.

Nada de este SQL se ha ejecutado nunca contra una base. Si algo peta, arréglalo y **dilo**.

### 2. La comprobación obligatoria de funciones

Es una regla de la casa que no se salta, y está en la skill `shifty-base-de-datos`, §7:

- Pasa `plpgsql_check` a las once funciones `planning_*`. Cero avisos.
- Pasa la consulta de ambigüedad de sobrecargas. Cero filas. **Copia esa consulta de la skill, no
  la escribas de memoria**: escrita mal da menos familias de las que hay y da permiso para
  desplegar algo roto.

### 3. La clave de Gemini y el modelo

⚠️ **Antes de desplegar nada, comprueba que el modelo existe.** El identificador
`gemini-3.8-flash` sale del encargo y de una búsqueda, **nunca se ha llamado a la API**. El
comando para comprobarlo está en `backend/functions/planning-ai/README.md`. Si no existe, para y
pregunta cuál usar; no lo sustituyas por tu cuenta.

Luego configura los dos secretos en `freetools`, con los nombres exactos que dice ese README, y
despliega `backend/functions/planning-ai/`. **Con "Verify JWT" desactivado**: esa función la llama
gente sin cuenta, porque leer el fichero pasa en la primera pantalla. Se defiende sola por dentro.

### 4. Enchufar el front

Necesitas la Project URL y la anon key de `freetools` (Project Settings, API). Van en
`Planning-Tool/.env.local` como `VITE_FREETOOLS_URL` y `VITE_FREETOOLS_ANON_KEY`. Los nombres y
sus tipos están declarados en `src/vite-env.d.ts`.

**Nunca commitees el `.env.local` ni lo enseñes por pantalla.** Y en Vercel hay que meter esas dos
mismas variables para que funcione en producción.

Si no hay configuración, el cliente es `null` y el guardado en servidor se apaga solo. Eso es a
propósito: la herramienta tiene que seguir calculando aunque el backend se caiga.

### 5. Probarlo de verdad

Levanta el servidor con el navegador integrado (hay `.claude/launch.json`, configuración
`planning`, puerto 5174) y recorre el flujo entero como lo haría una persona. No des nada por
bueno sin verlo:

1. Sube un fichero CSV que te inventes, con formato español: punto y coma de separador, fechas
   dd/mm/aaaa, coma decimal, y **sin columna de comensales**, que es lo normal en España. Que
   tenga al menos tres meses y alguna fila rota a propósito.
2. Comprueba que el mapeo de columnas detecta bien cada una y que el aviso de filas descartadas
   dice cuántas y por qué.
3. Llega al resultado y comprueba **en la base** que se ha creado la fila en `planning_plans` y
   su curva en `planning_plan_datasets`, y que `byte_size` ronda los 8 KB y no los 190.
4. Entra con un correo, mete el código, y comprueba que el plan pasa a tener `account_id` y
   `claimed_at`.
5. Copia el enlace corto, ábrelo **en otra pestaña sin sesión**, y comprueba que se ve el plan
   entero y que la curva se descomprime bien (que el gráfico del año no salga plano ni a cero).
6. **La prueba de seguridad, que es la que de verdad importa.** Con la clave anónima en la mano,
   intenta leer `planning_plans` directamente por PostgREST. Tiene que fallar. Intenta borrar un
   plan pasando solo el token del enlace. Tiene que fallar.
7. Y los tres fallos que ya se arreglaron, para que no vuelvan: sube un fichero nuevo sin pulsar
   "empezar de nuevo" y comprueba que **no** sobrescribe el plan anterior; abre el enlace de otro
   plan y comprueba que **no** se sube como tuyo; y pon nombres en el cuadrante, fuerza un fallo
   de red y dale a reintentar, comprobando que **sí** se guardan los nombres.

### 6. Antes de dar nada por terminado

- `npx tsc --noEmit -p tsconfig.app.json` a cero.
- `npm run build` a cero.
- `npm run verificar` tiene que seguir dando **19 personas y 88 turnos**. Si eso cambia, has roto
  el cálculo.
- Las pruebas del lector: `npx esbuild src/lib/parseFichero.test.ts --bundle --platform=node
  --format=esm --alias:@=./src --external:xlsx --log-level=error --outfile=node_modules/.tmp/pf.mjs
  && node node_modules/.tmp/pf.mjs`. 112 pasando.
- `/code-review` antes de commitear. No se salta.

## Dos cosas que están sin decidir y NO decidas tú

**La librería `xlsx` tiene dos avisos de seguridad de gravedad alta** (`GHSA-4r6h-8v6p-xvw6` y
`GHSA-5pgg-2g8v-p4x9`) y npm dice que no hay arreglo por ahí. La versión corregida, la 0.20, solo
está en el CDN propio de SheetJS. Las opciones son instalarla desde ahí, quitar Excel y aceptar
solo CSV, o dejarlo. **Es de Crescente.**

**La rejilla del cálculo va de 06:00 a 04:00.** Un ticket de las 05:15 no tiene franja y se
descarta. Afecta a locales de copas. Cambiarlo mueve el cálculo entero, así que tampoco es tuyo.

## Cómo hablarle a Crescente

Está en el `CLAUDE.md`, pero lo importante: es cofundador **no técnico**, no lee código. Nada de
bloques de código en las explicaciones, conclusión primero, respuestas cortas, sin guiones largos,
y **nunca afirmes cómo funciona algo que no hayas leído entero**. Si no lo has comprobado, la
frase es "no lo he verificado".
