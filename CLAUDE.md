<!-- ─────────────────────────────────────────────────────────────────────────
     LA PRIMERA MITAD DE ESTE FICHERO SE GENERA SOLA. NO LA EDITES AQUI.

     Las reglas comunes se escriben en el repo Docs (cpucci1/Docs), en
     docs/shared/REGLAS-COMUNES.md, y se copian a todos los proyectos.
     Lo propio de este repo se escribe en ese mismo repo, en repos/<repo>.md.
     Lo que edites aqui se pierde en la siguiente copia.

     AGENTS.md es un cargador pequeno que manda a Codex a leer este fichero.
     Las reglas viven solo aqui; no las dupliques en AGENTS.md.
     ───────────────────────────────────────────────────────────────────── -->

# Reglas comunes de Shifty

<!--
  ESTE FICHERO ES LA FUENTE. Se escribe AQUI, en el repo Docs, y de aqui se copia solo a la
  cabecera del CLAUDE.md y del AGENTS.md de cada repo. Editarlo en un repo destino no sirve:
  la siguiente copia lo pisa.

  Se carga ENTERO en cada sesion, asi que va corto. Aqui solo lo que hace falta SIEMPRE; el
  detalle vive en las skills de .claude/skills/, que solo cargan su cuerpo cuando se usan.
  Antes de anadir nada, lee la skill shifty-mantener-las-reglas.
-->

Shifty es un marketplace de talento verificado para hosteleria en Espana. Son **ocho proyectos**,
y **seis comparten una sola base de datos Supabase** (`brgswggayexbvrnqtlhp`, produccion). Por eso
estas reglas son las mismas en todos: **un cambio de base afecta a los seis a la vez**.

| Repo | Que es | Arranca |
|---|---|---|
| `Web-Panel` | Panel de administracion y de empresa. Vite + React + TS | `npm run dev` → :5173 |
| `Website` | Web publica, `shifty.es`. Next.js 16 | `npm run dev` → :3000 |
| `Worker-App` | App de trabajadores. Expo, **JavaScript** | `npx expo start` |
| `Client-App` | App de empresas cliente. Expo + TS | `npx expo start` |
| `Docs` | **Fuente unica de documentacion, reglas y skills** | |
| `Sales` | Marca, marketing y ventas | |
| `Sales/sales-tool` | Scrapper, Enricher, Navigator (CRM comercial) | |
| `Planning-Tool` | Planificador de plantilla. El unico que NO toca Supabase | `npm run dev` → :5174 |

Los ocho viven en una misma carpeta en el ordenador, `~/Desktop/Shifty/Github/`, que **no es un
repositorio**: solo los contiene.

**Debajo de estas reglas comunes va lo especifico de cada proyecto**, y eso manda sobre su propio
terreno. Si algo de aqui y algo de abajo se contradicen, gana lo de abajo, salvo en las reglas
inquebrantables, que no las pisa nadie. Claude carga las reglas al entrar en cada proyecto; el
`AGENTS.md` del contenedor obliga a Codex a leer el `CLAUDE.md` correspondiente antes de trabajar.

---

## Cómo trabajar con Crescente

Cofundador **no técnico**. Entiende el negocio a fondo; no lee código. Dicta por voz, así que sus
mensajes traen erratas: interpreta la intención.

1. **JAMÁS explicar con código.** Ni bloques, ni snippets, ni nombres de función dentro de una
   explicación. Citar `archivo:línea` como referencia está bien; el qué pasa y el cómo se arregla van
   en castellano de persona.
2. **Conclusión primero.** Sí, no o depende de. Luego el porqué.
3. **Cortas, 2 o 3 líneas.** Nada de respuestas con "## Qué pasó / ## La causa / ## Recomendación".
4. **Sin guiones largos.** Le suenan a texto de IA.
5. **NUNCA inventar un dato.** Empresa, trabajador, turno, factura: se consulta y se da el valor de
   ahora. Ni de memoria de la conversación ni de sesiones anteriores.
6. **NUNCA adivinar cómo funciona el código.** Se localiza el fichero o la función, se lee **entero**
   y, si llama a otra cosa, esa también. Si no lo has leído, la frase es *"no lo he verificado"*.
   Afirmar algo falso sobre cómo funciona el sistema es peor que decir "no lo sé".
7. **Ante la duda, preguntar.** Él lo ha pedido expresamente: *"no quiero romper todo"*.
8. **Si le ves equivocado, díselo.** No dar la razón por defecto.
9. **Entrega completa y lista para pegar.** El output es el material, sin preámbulos ni despedidas.

Cuando te corrija, **persiste el aprendizaje en el momento**, en su sitio (ver
`shifty-mantener-las-reglas`), y confirma dónde lo has escrito.

---

## ⛔ Reglas inquebrantables

Aplican **en todos los proyectos**, porque la base de datos es una sola.

**Base de datos**
1. **NUNCA crear columnas, tablas, vistas ni funciones sin permiso POR ESCRITO.** Incluye las `crm_*`.
2. **NUNCA renombrar ni eliminar columnas o tablas críticas.** Las 4 apps dependen de esos nombres.
   Lo que se deja de usar **se marca en su comentario, no se borra**.
3. **NUNCA updates directos a tablas operativas.** Se usan las RPC, que dejan rastro en `activity_log`.
4. **NUNCA calcular precios en el frontend.** Se piden a las vistas.
5. **Antes de crear algo, buscar si ya existe.** 461 tablas y 1.363 funciones: lo normal es que exista.
6. **NUNCA tocar `auth.users` ni el flujo de OTP sin permiso escrito.**
7. **Nada de tablas transitorias.** Las filas van a la tabla donde de verdad viven, marcadas con su
   `origen`, o no se guardan.
8. **Ninguna tabla nueva sin RLS encendida y sin decidir quién puede leerla.** La clave anónima va
   dentro de las apps y es pública: sin RLS, la tabla está en internet. Y una función que recibe un
   `company_id` o un `worker_id` por parámetro **comprueba que quien llama tiene derecho a él**.

**Datos y dinero**

9. **NUNCA crear registros operativos** (turnos, candidaturas, invitaciones, jornadas, ofertas) para
   empresas o trabajadores que no sean `is_test = true`. Sin excepciones.
10. **NUNCA seleccionar candidatos ni enviar invitaciones** fuera de test. Verificar **las dos partes**.
11. **NUNCA tocar nada de pagos** para empresas que no sean de test sin aprobación explícita **en esa
    misma conversación**, describiendo qué tabla, qué registro y qué pasa de qué a qué.
12. **NUNCA editar un plan que ya tenga empresas asignadas.** Se crea uno nuevo específico.
13. **Gasto de marketing por encima de 500 €/mes:** aprobación explícita.

**Marca y confidencialidad**

14. **La palabra "ETT" se puede usar; lo que no se puede decir es que Shifty sea una.** Shifty
    **gestiona las altas a través de una ETT colaboradora**. Prohibido "Shifty es una ETT" o
    "nuestra ETT": no tiene licencia ni aval, y decirlo es error grave.
15. **Nada externo se publica ni se envía sin el OK de Crescente.** Ni pricing interno, ni datos
    societarios, ni nombres de clientes fuera de la lista aprobada.

**Legal**

16. **12 horas de descanso mínimo entre turnos de la misma persona** (Art. 34.3 ET). Es un mínimo
    legal. La comprobación cruza también el fin de semana.

Se puede sin preguntar: `SELECT` y lectura de catálogos. Necesita permiso: cualquier DDL, cualquier
mutación de producción, RLS, triggers y crons.

---

## El encargo: orden, limpieza y que funcione

Ampliado por Crescente el 2026-09-02. No es solo poner orden en las reglas: es **dejar la casa
ordenada, limpia y funcionando**. Los tres a la vez, y en este orden de prioridad:

1. **Que funcione.** Si al ordenar aparece algo roto, se arregla.
2. **Que esté limpio.** Lo duplicado se unifica, lo muerto se marca, lo indocumentado se documenta.
3. **Que esté ordenado.** Cada regla en su sitio, sin contradicciones.

**Y la condición que manda sobre las tres: no dejar la cagada.** Nada de arreglos que rompan otra
cosa. Cada cambio se verifica contra producción antes de darlo por hecho.

### Antes de dar algo por roto, comprueba si pasa igualmente

Un analizador diciendo que algo tiene un error **no significa que la funcionalidad no ocurra**. Casi
siempre hay más de un camino, y lo roto es uno de ellos. Mira si el resultado existe en los datos y
de cuándo es el último, busca los demás caminos, y delimita a cuánta gente afecta de verdad. **Solo
entonces** decide si se arregla y con qué urgencia.

Decir que algo está roto cuando funciona quema credibilidad, y hace que la siguiente alarma, la de
verdad, se lea con desconfianza. El detalle y los casos están en la skill `shifty-base-de-datos`.

---

## Al desplegar una función: comprobar que no se ha duplicado

Regla de Crescente, 2026-09-03. **Nunca se crea una sobrecarga de una función que ya existe.**
Si hace falta un parámetro nuevo, se le pone un valor por defecto y se modifica la función
existente. Dejar dos versiones vivas con los mismos argumentos obligatorios hace que **toda
llamada con la lista corta falle**, y el front se traga ese error, así que la pantalla parece
funcionar y no funciona.

Había 19 familias así. Una tenía rota la comprobación de disponibilidad al invitar: la lista de
candidatos salía sin avisos y se ofrecía gente ya invitada o con turno ese día.

**Después de crear o desplegar cualquier función, hay que pasar la comprobación de ambigüedad**
(la consulta está en la skill `shifty-base-de-datos`, §7 regla 1 bis) y `plpgsql_check`. Cero
filas en las dos. Y al retirar una versión duplicada, mirar antes qué hará la que se queda con
sus valores por defecto: hay casos donde desambiguar activaría un borrado de datos.

⚠️ **Copia la consulta de la skill, no la escribas de memoria.** El 2026-09-03 se escribió mal
y dio 7 familias cuando había 10: comparaba los tipos en el número de argumentos más grande de
los dos, y la ambigüedad salta en el más pequeño. Se escapaban tres, entre ellas las de crear y
editar ofertas del portal de empleo. Una consulta de comprobación que falla en silencio es peor
que no tenerla, porque da permiso para desplegar.

---

## Una lógica, un sitio

La misma regla vive hoy en muchos sitios a la vez: la comisión en 46 funciones, la detección del
actor en 158, la guarda `is_test` en 145. **Si se cambia una copia y no las otras, el sistema
contesta cosas distintas según por dónde entres, sin dar ningún error.**

- **Antes de escribir una comprobación, busca el helper.** Existen y casi nadie los usa.
- **A la tercera vez que escribas lo mismo, se extrae.**
- **Añadir un parámetro no es crear una función nueva.** Se reemplaza; no se deja la vieja viva.
- **Una acción, una función**, con la fuente como parámetro. El panel y la app no tienen funciones
  distintas para lo mismo.
- **Nada de `_v2` conviviendo con la vieja.**
- **Cada columna nueva nace con su comentario.** Hoy solo el 19,5 % lo tiene.

Nombres: inglés, `snake_case`, tablas en plural, claves ajenas en singular + `_id`, booleanos con
`is_`, fechas con `_at`, vistas con `v_`. **Excepción: las 66 tablas `crm_*` van en castellano.**

**Stack, acotado a donde de verdad aplica** (`governance.md` §8 lo declara para todo y no puede ser):
**TanStack Query** para leer datos de Supabase en Web-Panel, Client-App y las dos apps del
sales-tool, que ya lo usan. No aplica a Worker-App (JavaScript, con sus propios contextos), a Website
(Next.js, servidor) ni a Planning (no toca Supabase). **Shadcn/ui + Tailwind** solo en Web-Panel y
Website: en React Native no existe.

---

## Flujo de trabajo

1. **Rama antes de tocar código.** `feature/nombre` o `fix/nombre`. Nunca sobre `main`.
2. **Si te pide otra cosa distinta a la de la rama**, para y avísale antes de editar.
3. **Antes de cada commit, `/code-review`** sobre lo modificado. Este paso no se salta.
4. **Commits** `tipo(alcance): descripción`, entre 10 y 72 caracteres. **Nunca `--no-verify`.**
5. **Al terminar, proponer cerrar el tema**: revisión, y a `main` con la skill `subir`. Nunca push
   directo.
6. **Cambios de base de datos**: describir en castellano → esperar el OK → aplicar por MCP.
   **No se crean ficheros de migración locales.**
7. **Antes de desplegar una Edge Function**, comparar con producción: un deploy reemplaza el bundle
   entero y el 2026-07-06 se perdió una semana de arreglos.

**Verificación:** `tsc --noEmit` y `npm run lint` a cero. En móviles, iOS **y** Android. En Website,
`npm run build`. Y ojo: **Client-App, Website, sales-tool y Planning no tienen ningún candado de
push**, aunque sus ficheros digan lo contrario. Hay que ejecutarlo a mano o se sube roto.

---

## Si vas a tocar X, lee antes Y

| Si vas a… | Lee antes |
|---|---|
| Escribir una consulta, crear una función o una vista, cambiar el esquema | skill **`shifty-base-de-datos`** |
| **Crear una tabla, dar permisos, tocar RLS o revisar quién puede ver qué** | skill **`shifty-seguridad`** |
| Tocar un importe, comisión, tarifa, factura o plazo de pago | skill **`shifty-dinero`** |
| Responder a un trabajador, revisar incidencias, cuadrar horas | skill **`shifty-soporte-trabajador`** |
| Escribir copy, un post, un correo, una landing o una propuesta | skill **`shifty-marca-y-copy`** |
| Añadir, mover o borrar una regla, o crear una skill | skill **`shifty-mantener-las-reglas`** |
| Trabajar dentro de un repo concreto | su `CLAUDE.md`; el cargador del agente obliga a leerlo |
| Cualquier cosa que afecte a más de una app | `shared/SOURCE_OF_TRUTH.md` **primero** |
| Crear una RPC | `shared/rpc-functions.md`, para no duplicar una que ya existe |
| Entender una feature | su fichero en `features/` |
| Resolver una incidencia | `incidencias-tecnico/`, y dejar ficha al cerrarla |
| Saber qué está pendiente de arreglar y de decidir | `shared/PENDIENTE.md` |

Esas rutas son relativas a la documentación, que **está en dos sitios según desde dónde trabajes**:
dentro de un repo es `agent_docs/`; desde la carpeta que contiene los ocho proyectos es `Docs/docs/`;
y dentro del propio repo `Docs`, es `docs/`. El contenido es el mismo.

---

## Documentación: `Docs/` manda

`Docs/` es el contrato compartido entre las 4 apps. **Cualquier cambio que toque a más de una app se
documenta ahí primero**, se deja propagar, y solo después se implementa.

- **`agent_docs/` y `.claude/skills/` de los repos son COPIAS de solo lectura.** Editarlas no sirve:
  la siguiente sincronización las borra. Todo cambio va en `Docs/`.
- **El sync llega a los 6 repositorios**, incluidos Sales, el sales-tool y Planning-Tool. Los cuatro
  de producto reciben además los ~324 documentos en `agent_docs/`; los otros dos solo las reglas y
  las skills, que es lo que usan.
- **La cabecera de este `CLAUDE.md` y el cargador `AGENTS.md` se generan solos.** Editarlos en el repo
  destino no sirve: lo común se escribe en `Docs/docs/shared/REGLAS-COMUNES.md` y lo propio de cada
  proyecto en `Docs/repos/<proyecto>.md`. `AGENTS.md` manda a Codex a leer ese mismo `CLAUDE.md` sin
  duplicar ni truncar las reglas.
- **El `SYNC_TOKEN` caduca y falla en silencio.** Tras tocar documentación importante:
  `gh run list --repo cpucci1/Docs --limit 5`.
- **Los volcados de esquema se regeneran desde Supabase, no se editan a mano**, y llevan fecha: si
  está lejos, no reflejan producción.

---

## Entorno

Los `.env` están puestos y en `.gitignore`. **Nunca commitearlos ni mostrarlos.** `Web-Panel/.env.local`
tiene secretos de servidor: no añadir secretos con prefijo `VITE_`.

GitHub: todo en **cpucci1**. No confundir con `crescentepucci94-hub` (copias viejas) ni con la org
`Shifty-App` (legacy de 2025). `~/Desktop/WorkLevel/` es un proyecto **distinto**.


---

# Shifty Planning — Planificador de plantilla

Herramienta web **gratuita y sin registro** para que un restaurante calcule la plantilla
que necesita a partir de su demanda real de comensales. Es un **lead magnet** de Shifty:
al final del cálculo, los picos que la plantilla fija no cubre se proponen como extras
de Shifty.

> **Este proyecto es independiente del resto del monorepo.** No comparte build, ni
> dependencias, ni base de datos con `Web-Panel/`, `Website/`, `Worker-App/` o
> `Client-App/`. No toca Supabase. Vive solo aquí.

---

## Estado

**Solo front.** No hay backend, no hay login, no hay persistencia en servidor **ni en el
navegador**. Cerrar la pestaña borra todo lo que no se haya descargado como PDF.
La lectura del fichero con IA está **simulada**: se acepta cualquier archivo, se muestra
el proceso de análisis y se devuelven **datos simulados** deterministas. Cuando exista
backend, solo hay que sustituir `src/lib/fakeAI.ts` por una llamada real.

`src/lib/persistence.ts` existe pero **no está conectado a nada**: es un guardado
sin cuenta (autoguardado local + fichero `.json` descargable) que se construyó y se probó
entero, y se desconectó a petición expresa — "quitale el login, eso lo veremos luego" — para
revisar el front sin esa capa de por medio. El módulo es correcto y independiente; para
reactivarlo hay que devolver a `usePlanner.ts` el estado `savedMeta` y las funciones
`resumeSaved`/`discardSaved`/`importSnapshot`/`exportSnapshot`/`buildSnapshot` (ver el
historial), y su UI en `StepImport.tsx` (aviso de "sigues con...") y `StepResult.tsx`
(botón "Guardar planificación"). No hay que rediseñar nada, solo volver a enchufarlo.

---

## Arrancar

```bash
npm install
npm run dev     # → http://localhost:5174
```

Puerto **5174** a propósito, para poder tener Web-Panel (5173) levantado a la vez.

---

## El modelo, en una frase

**Comensales por franja de media hora → tramos definidos por el usuario → personas por
puesto y franja → horas → contratos → cuadrante.**

### 1. Demanda
El cliente sube un fichero con su histórico. De ahí salen **comensales por franja de 30
minutos**, por día y por semana, para 52 semanas. Es lo único que aporta el fichero:
el fichero **no dice cuánta gente hace falta**.

La semana tipo que sale del cálculo es **editable**: el usuario puede corregir cualquier
celda si sabe algo que el histórico no. Esas correcciones viven en `overrides` dentro de
`usePlanner` y se aplican justo encima del percentil, de modo que entran en la cadena
completa y mueven de verdad el número de personas. Una edición que no cambiara el
resultado engañaría más de lo que ayuda.

### 2. Tramos (input del usuario)
El usuario define su propia tabla: *"de 1 a 10 comensales necesito 1 camarero y 1 de
cocina; de 11 a 25, 2 camareros, 1 cocina y 1 office; de 26 a 40…"*. Los tramos y los
puestos son suyos. Se precarga una plantilla razonable para que vea resultados desde el
primer segundo, pero todo es editable.

- **Bloques** (áreas): vienen Sala y Cocina de inicio; se pueden renombrar, añadir y borrar.
- **Puestos**: dentro de cada bloque, libres, con plantilla inicial.

### 2 bis. Horario de cocina (opcional)
En el paso de horario hay un toggle: *"la cocina tiene un horario distinto"*. Desactivado
por defecto — cocina comparte el horario general, como hasta ahora. Al activarlo, arranca
copiando el horario general y se edita aparte con el mismo `HoursEditor`.

El id del bloque Cocina es fijo (`KITCHEN_BLOCK_ID` en `data/presets.ts`) y el toggle se
engancha a ese id, no al nombre — sobrevive a que el usuario lo renombre. Solo desaparece
si el bloque Cocina se borra del todo.

`clampNeedToBlockHours` (`lib/staffing.ts`) aplica el recorte **después** de `buildNeedGrid`:
cocina deja de pedir personal fuera de su horario propio aunque sala siga abierta y la
curva de comensales aún tenga gente. Importante — **solo recorta, nunca añade**: si el
horario de cocina se adelanta a que abra sala (para el personal que prepara antes del
servicio), ahí no hay comensales en la curva y por tanto tampoco tramo, así que ese hueco
sigue saliendo a cero. Eso lo cubre el mínimo de apertura por bloque de la sección 2 ter.

### 2 ter. Mínimo por local (apertura y cierre)

Corrección de Fernando, 2026-09-04: el mínimo no es por puesto, es **por local completo**
(Sala, Cocina...) y se garantiza en **todo su horario**, tenga o no comensales la curva en
ese momento — quien abre, prepara, cierra o limpia. Vive en la pantalla de Horario, justo
debajo del horario de cocina: un número por cada bloque de `model.blocks`, en
`Settings.minStaffByBlock` (`blockId → personas`, vacío por defecto).

`applyOpeningMinimums` (`lib/staffing.ts`) lo aplica en `usePlanner.ts` **después** de
`clampNeedToBlockHours`, para que respete el horario propio de cada bloque (cocina, si lo
tiene) y no el general. Por franja y bloque, si la gente que ya pide la curva no llega al
mínimo, sube hasta él; si ya lo supera, no toca nada — este número nunca resta gente.

El mínimo lo asume siempre **el primer puesto declarado del bloque** (el responsable de
abrirlo), para que el cuadrante se lo asigne a alguien concreto en vez de repartirlo entre
puestos. No hay forma de elegir otro puesto todavía; si hace falta, es la extensión
natural del día que se pida.

### 2 quater. Catálogo de puestos, coste y límites

Mejoras pedidas por Fernando el 2026-09-04 (ficha `shifty_planificador_mejoras_1`).

**Catálogo de puestos** (`components/RoleCatalog.tsx`, en la pantalla de lectura del
fichero): cada puesto lleva su **coste por hora** y si es de **solo jornada completa**.
Vienen nueve categorías de partida — encargado, responsable de turno, responsable de
sala, camarero, ayudante, jefe de cocina, jefe de partida, cocinero y office — pero
**las de mando arrancan a cero en todos los tramos**: un local de menú no tiene jefe de
partida, y meterlos con gente por defecto inflaría la plantilla de quien ni los tiene.
Por eso los datos de ejemplo siguen dando las mismas 19 personas de siempre.

El coste ya **no** es un campo global en ajustes avanzados: era un único "coste medio"
para un jefe de cocina y un office, que no cuestan igual. `summarizeCost`
(`lib/contracts.ts`) lo suma por categoría y **devuelve `null` si no hay ni un precio**;
si solo faltan algunos, da lo que sabe y la lista de los que faltan, para poder decirlo
en pantalla en vez de presentar un total incompleto como si fuera el total.

**Solo jornada completa** (`Role.fullTimeOnly`): `buildRoster` no baja a esas personas al
contrato parcial que les cabría por horas. Se quedan con el contrato más grande activo.

**Mínimos y máximos por tramo y puesto** (`Tier.staffMin` / `Tier.staffMax`): el suelo se
aplica dentro de `buildNeedGrid` (solo DENTRO del tramo: con cero comensales no hay
tramo) y el techo en `clampToTierMax`, que corre **el último de la cadena** — un tope que
se pudiera saltar por el mínimo por local no sería un tope. En la tabla van escondidos
tras un botón: con ellos siempre visibles la tabla triplica y cuesta seguirla.

### 2 quinquies. Horario al público y horario de preparación

El horario que edita el usuario es el horario **al público**. `Settings.prepBeforeMin` y
`prepAfterMin` son los minutos de mise en place y de cierre, y `expandHours` estira con
ellos **solo la ventana del mínimo por local**: durante la preparación no hay comensales,
así que no hay tramo ni plantilla de servicio, pero sí está la gente que abre y cierra.

### 2 sexies. Margen de seguridad y sobrecobertura

`Settings.safetyMarginPct` es un colchón deliberado **sobre la curva de comensales**,
antes de traducirla a personas. Es una decisión distinta de la cobertura: la cobertura
elige QUÉ semanas se cubren, y esto añade holgura DENTRO de la semana elegida.

`overcoverage` (`lib/demand.ts`) es su contrapeso honesto: cuánto queda la plantilla por
encima de lo que pide cada semana que sí cubre. Se mide contra cada semana concreta, no
contra la media del año, porque promediar primero escondería justo lo que se enseña.

### 2 septies. Lo que se lleva puesto y lo que se guarda

**Guardado sin cuenta, ya enchufado.** `lib/persistence.ts` volvió a conectarse en
`usePlanner`: autoguardado en IndexedDB con 600 ms de respiro (sin él se escribiría en
cada tecla de la tabla de tramos) y un fichero `.json` descargable, que es el guardado de
verdad, el que cruza de ordenador. Lo guardado **se ofrece, no se restaura solo**: la
pantalla de import pregunta "¿sigues con...?", porque esa pantalla es la que vende el
producto y a un visitante nuevo no le puede saltar encima el plan de otro día.

La foto va por la **versión 2**: la 1 es de antes del catálogo de puestos con coste, del
horario de cocina y de los ajustes de margen y preparación, y sin esos campos el cálculo
sale mal en silencio. Se rechaza en vez de adivinar.

**Compartir por enlace** (`lib/compartir.ts`): el plan entero comprimido dentro del `#` de
la dirección, que el navegador **no manda a ningún servidor**. Así el socio o la gestoría
ven el mismo plan sin cuentas y sin que las ventas del restaurante pasen por ningún sitio.
Dos detalles que costaron: el infinito del último tramo no lo sabe serializar JSON (viaja
como centinela y se restaura al leer), y al abrir un enlace la dirección se limpia después,
para que un refresco no vuelva a imponer el plan por encima de lo que se haya tocado. Un
plan típico son unos 14.000 caracteres: se puede pegar y mandar, pero no es un enlace corto.

**Los dos entregables nuevos** (`lib/cuadrante-imagen.ts`): una imagen vertical de 1080x1920
con el turno de UNA persona, que es como de verdad viaja un cuadrante en España (por
WhatsApp, no por una app), y un PDF A4 del cuadrante entero **sin una sola cifra de coste**,
para colgarlo en cocina donde lo ve todo el turno.

### 2 octies. La revisión del cuadrante y las tres métricas

`lib/avisos.ts` recorre el cuadrante ya montado y saca lo que incumple: descanso de 12 h
entre turnos (Art. 34.3 ET, con el cruce domingo→lunes porque la semana se repite),
libranzas sueltas cuando se pidieron seguidas, horas por encima del contrato y franjas sin
cubrir. Hasta ahora esas reglas eran parámetros con los que se dimensionaba; no había nadie
mirando el resultado final. Es el error caro y silencioso de quien hace el cuadrante a mano.

`lib/metricas.ts` añade tres cosas que ya se podían calcular y no se daban, sin pedir un
dato nuevo: **comensales por hora trabajada** (como mide la industria si un cuadrante
rinde), **la holgura desglosada por franja** (un total semanal no se puede accionar; "el
lunes de 12:00 a 14:30 sobran 9 h" sí) y **el reparto de fines de semana**, que es lo que
hace que un cuadrante se perciba justo.

### 2 nonies. Lo que hoy está simulado, y por qué así

Dos pantallas son el front de una llamada futura a un modelo barato. No hay backend: cuando
se conecten, harán falta una función suelta en el mismo Vercel (la clave del modelo no puede
ir en la web, cualquiera la vería) sin base de datos ni nada que guardar.

- **Mapeo de columnas** (`components/MapeoColumnas.tsx`): el usuario ve qué se ha entendido
  de cada columna de su fichero, con valores de ejemplo de verdad, y lo corrige en dos clics.
  Nunca se adivina en silencio. Y si su TPV no trae comensales, que es lo normal en España,
  se estima desde los tickets **diciéndolo**, no colando una estimación con cara de dato.
- **Nombre de las semanas raras** (`lib/territorio.ts`): el reparto de papeles es lo que hace
  la idea segura. **El pico lo detectamos nosotros** con su histórico; el modelo solo pone el
  nombre ("esta semana se dispara un 59% en Sevilla" → "Feria de Abril"). Al revés, creerle
  qué festivos tiene una provincia, sería meter datos inventados en el cálculo sin que nadie
  los mire. Y solo se propone para semanas que SUBEN: una fiesta llena el local, no lo vacía,
  y colgarle una fiesta a un valle sería una explicación falsa con cara de dato.

### 2 decies. Coste sobre ventas, SMI y los datos de ejemplo

`Settings.weeklySalesEur` es el **único dato que la herramienta pide y no puede sacar del
histórico**, y desbloquea el ratio con el que de verdad piensa un hostelero: cuánto se lleva
el personal de lo que entra (sano entre 25% y 32%, alarma por encima del 40%).

Del convenio solo entra el **SMI** (`SMI_HORA_EUR` en `lib/contracts.ts`): una cifra
nacional que cambia una vez al año, en vez de cincuenta tablas provinciales que caducan a
distinto ritmo y que no mantiene nadie. Sirve para avisar de que un coste se queda corto.

Y una excepción acotada a "nunca se inventa un precio": **los datos de ejemplo sí arrancan
con costes y ventas de muestra** (`DEMO_COSTES_HORA`, `DEMO_VENTAS_SEMANA`). Con el catálogo
en blanco, el ejemplo escondía media pantalla de resultado y el usuario no llegaba a ver lo
que la herramienta hace. Se puede porque todo ese dataset es de mentira y está etiquetado
como tal; en el fichero de una persona **jamás** se rellena un precio, y por eso el relleno
va detrás de `dataset.source.isDemo`.

### 3. Desfase del dato
El fichero del TPV marca la hora del **cobro**, y se cobra al terminar — unos 30 minutos
después de que el trabajo haya ocurrido. La curva del fichero va por tanto sistemáticamente
tarde: los 60 comensales que aparecen a las 15:00 se atendieron sobre las 14:30.

La corrección es **adelantar la curva** ese desfase. Se fija **un único valor global**
(por defecto 30 min) aplicado **igual a todos los puestos y bloques**.

No es un colchón de seguridad ni una estimación: es enderezar un sesgo conocido del dato.
Por eso es un desplazamiento limpio y no un máximo móvil, que ensancharía los picos y
sobredimensionaría la plantilla.

El orden importa: **primero se corrige el desfase, después se recorta al horario.**
Corregir arregla el dato; recortar aplica una regla de negocio, y no tiene sentido
aplicarla sobre el dato torcido.

### 4. Nivel de cobertura
Gráfico de las **52 semanas en orden de calendario** con una **línea horizontal
arrastrable**. Donde la suelte, decide qué porcentaje de semanas cubre con plantilla fija.
Las semanas por encima de la línea son **picos**: no se contrata para ellos, se cubren
con extras.

### 5. Semanas especiales
Se detectan automáticamente las semanas anómalas del histórico y se etiquetan con el
festivo que les toca (Semana Santa, Navidad, agosto, fiestas locales). El usuario
**confirma o corrige**. Los festivos móviles se **realinean** al año siguiente: si Semana
Santa cayó en la semana 15, el año que viene se coloca en la 16.

### 6. Contratos
Se optimiza **primero con jornadas de 40h**, y lo que queda se rellena con parciales de
**30h, 20h y 15h**. El máximo de horas semanales lo marca el tipo de contrato.

Toggles del usuario:
- **Jornada partida** sí/no
- **Dos días de libranza consecutivos** sí/no
- **Duración máxima de cada turno** (o de cada bloque, si hay jornada partida)
- **12h de descanso entre turnos** sí/no (activado por defecto — ver 6 bis)

### 6 bis. Descanso mínimo entre turnos (Art. 34.3 ET)

España exige 12h entre el fin de un turno y el inicio del siguiente de la misma persona;
es un mínimo legal, no una preferencia, y hay jurisprudencia reciente (STS 274/2026)
confirmando que ese descanso diario no se solapa con el semanal. `buildRoster` en
`lib/roster.ts` lo aplica como restricción dura en `fits()` — nadie cierra una noche y
abre la mañana siguiente — y también en el paso de consolidación, para que redistribuir
turnos entre personas no lo rompa por el camino.

La semana se repite, así que la comprobación también mira **domingo contra lunes**: si el
sábado cierra a las 02:00, esa persona no puede abrir el domingo antes de las 14:00.

No hay una cifra nacional única para la duración del descanso de la jornada partida (varía
por convenio provincial, de 1h a 1h30), así que ahí se mantiene el mínimo genérico de 60
min en vez de intentar acertar los ~50 convenios de hostelería a la vez.

### 7. Cuadrante
Se genera el cuadrante semanal sobre la curva de necesidad, descomponiéndola en
**capas**: si en una franja hacen falta 3 camareros, la capa 1 está presente siempre que
haga falta al menos 1, la capa 2 siempre que hagan falta al menos 2, y así. Cada capa
dibuja el turno de una persona — la capa 1 abre y cierra, las de arriba entran solo en el
pico. Es lo que hace a mano un jefe de sala, y por eso el cuadrante sale creíble.

Después las capas se empaquetan en personas por mejor ajuste, se consolida (se vacía a
los más flojos repartiendo sus turnos, y quien se queda sin nada desaparece) y cada
persona baja al contrato más pequeño que cubra sus horas.

Las etiquetas ("Camarero 1", "Camarero 2"...) se pueden sustituir por nombres reales —
doble clic o el lápiz en `RosterGrid`. El nombre se guarda aparte (`personNames` en
`usePlanner`, `personId → nombre`) y se decora encima del cuadrante recién calculado,
igual que `overrides` decora la semana tipo: el cuadrante entero se recalcula con cada
cambio, así que el nombre no puede vivir dentro de `Person`. Si la plantilla cambia mucho
(se añade o quita gente de ese puesto), el id puede pasar a referirse a otra persona —
aproximación razonable, no perfecta, coherente con el resto del cálculo derivado.

### 7 bis. El número lo marca el pico, no las horas

Este es el hallazgo que explica todo el producto, y hay que contarlo en la interfaz en
vez de esconderlo. Con los datos de ejemplo:

| | |
|---|---|
| Horas que pide la curva | 501 h/semana |
| Eso son, en jornadas completas | 12,5 |
| Personas que salen de verdad | **19** |

La diferencia no es un error de cálculo: es que el sábado a las 14:00 hacen falta **7
camareros a la vez**. Por pocas horas que sumen entre todos, tiene que haber 7 camareros
en nómina. El pico simultáneo de cada puesto marca un suelo de personas que las horas
totales no pueden bajar.

Por eso `StaffPlan.drivers` lleva `fteFromHours`, `peopleFromPeak` y el pico por puesto:
la interfaz tiene que poder decir *"por horas te bastarían 12 jornadas; son 19 personas
porque tu sábado pide 7 camareros a la vez"*. Y de ahí sale solo el argumento de Shifty.

### 8. Shifty
Las franjas por encima de la línea de cobertura se marcan en el gráfico y se cuantifican:
*"estas X horas al año son picos; cúbrelos con extras de Shifty en vez de contratando de
más"*. Ese es el único momento de venta, y sale del propio cálculo.

### 8 bis. Coste (opcional)
El coste vive **por categoría** en el catálogo de puestos (`Role.hourlyCostEur`), no como
un campo global. **Lo pone el usuario o se queda en blanco — nunca se inventa un precio**,
ni de mercado ni de Shifty. Si hay precios, el resultado y el PDF dan el coste semanal y
anual de la plantilla; si no, todo se queda en personas y horas.

Para valorar los picos se usa el **coste medio por hora de su propia plantilla**: un extra
no es de un puesto concreto, así que ponerle el precio del jefe de cocina o el del office
sería igual de arbitrario.

### 9. Guardado sin cuenta — construido, desconectado por ahora
`src/lib/persistence.ts` implementa dos mecanismos, ninguno de los dos activo hoy:

- **Autoguardado silencioso en IndexedDB** (con `idb-keyval`, y localStorage de apoyo si
  IndexedDB falla) cada vez que cambia algo relevante del estado, con un pequeño respiro
  de 600ms para no escribir en cada tecla o cada frame de un arrastre. Se usa IndexedDB y
  no localStorage sin más porque en Safari en modo privado `localStorage.setItem` lanza
  `QuotaExceededError` en la primera escritura.
- **Fichero `.json` descargable** (`exportSnapshot`): el guardado de verdad, el que cruza
  de dispositivo o se manda a un compañero. Lleva `source`/`version` para poder rechazar
  con un mensaje claro un fichero de otra versión en vez de reventar.

La idea era que la pantalla de import comprobara al montar si hay algo guardado y, si lo
hay, **preguntara** ("Sigues con..." / Continuar / Empezar de nuevo") en vez de
restaurarlo solo — esta es la pantalla de venta del producto, así que un visitante nuevo
tiene que poder verla entera antes de que nada le salte encima. Se retiró de
`usePlanner.ts`, `StepImport.tsx` y `StepResult.tsx` a petición expresa antes de que
nadie lo viera en marcha; el módulo en sí quedó intacto y probado, listo para reenchufar
cuando toque decidir cómo encaja con una cuenta de verdad.

### 9 bis. Teaser de cuenta — maqueta, sin enviar nada de verdad
`components/AccountTeaserModal.tsx` es la otra cara de lo mismo: un modal "créate una
cuenta gratis para no perderlo" que pide email y móvil. Sale **una vez**, cuando el
usuario lleva visto (no solo pasado de largo) la sección "de dónde sale el número" en
`StepResult` — un `IntersectionObserver` con `threshold: 0.6` sobre esa sección, no un
timer ni el scroll a secas. Se puede cerrar en cualquier momento ("Seguir sin cuenta"):
el "Sin registro" de la portada sigue siendo cierto, esto es el hueco para el día que
deje de serlo.

Es **explícitamente una maqueta**, a petición expresa: el formulario no manda el email ni
el móvil a ningún sitio — `handleSubmit` solo enseña la pantalla de "¡Ya casi!" para
probar el copy y el momento en que aparece. Antes de conectarlo de verdad hace falta
decidir a dónde va ese dato: guardado local (reengancha `lib/persistence.ts`, pero
"entrar desde otro dispositivo" no funciona sin servidor) o un servicio externo de
verdad (necesita elegir cuál y sus credenciales). Ninguna de las dos cosas está decidida
todavía — no lo asumas al tocar este componente.

---

## Principios de producto

Estos mandan sobre cualquier preferencia técnica:

1. **Valor antes que datos.** Nunca pedir un input sin haber enseñado algo antes. Hay
   datos de ejemplo cargables de un clic.
2. **Nada en blanco.** Todo arranca con defaults sensatos y editables. Cero pantallas
   vacías que haya que rellenar para ver algo.
3. **Cada número se explica.** Si la herramienta dice "necesitas 7 personas", tiene que
   poder decir de dónde sale. Modales e info contextual, siempre a demanda, nunca encima.
4. **El progreso se ve.** El usuario sabe en todo momento por dónde va y qué le queda.
5. **Se entiende sin manual.** Si un jefe de sala no lo pilla solo, está mal hecho.
6. **Un paso por pantalla, no pantallas interminables.** Si un paso del flujo tiene varias
   preguntas distintas, se parte en sub-pasos con su propio progreso — como `StepDemand`,
   que enseña lectura, año, horario, semanas especiales y semana tipo de una en una en vez
   de todo en un solo scroll. Ver `DEMAND_SUBSTEPS` ahí mismo para el patrón a reutilizar
   si otro paso crece demasiado.

## Reglas de UI

- Design system de Shifty, replicado en `src/index.css` (tokens `@theme` de Tailwind v4).
- **Clases semánticas siempre**: `bg-brand`, `text-content-primary`, `border-border`.
  Nunca `bg-[#6C0FD8]` ni `bg-purple-600`.
- **Cards a 22px** (`rounded-card`), **botones pill** (`rounded-pill`), fuente **Onest**.
- Todo el copy **en castellano**, tuteando, con el vocabulario del sector: turnos,
  plantilla, cobertura, comensales, franja, cuadrante, extras.
- `prefers-reduced-motion` respetado en `index.css`; no añadir animaciones que lo salten.

## El nombre viejo sigue dentro del código, y se queda

La carpeta y el repositorio se llamaban `shifty-planning` y el 2026-09-04 pasaron a
`Planning-Tool`. **Dentro del código el nombre viejo NO se cambia**, en tres sitios:

- `src/lib/persistence.ts` — la clave con la que se guarda el plan en el navegador del usuario
  (`shifty-planning:autosave`) y la marca de origen de los guardados. Cambiarlas dejaría huérfano
  el trabajo guardado de todo el que ya haya usado la herramienta: al abrirla vería la pantalla
  en blanco y su plan no aparecería por ningún lado.
- `package.json` — el nombre del paquete. No lo ve nadie y cambiarlo no aporta nada.

Si algún día hay que cambiarlas, hace falta antes un paso que lea la clave vieja y la copie a la
nueva. No es un renombrado, es una migración.

## Estructura

```
src/
  components/   Componentes de UI reutilizables (botones, cards, modales, gráficos)
  steps/        Cada paso del flujo, uno por fichero
  lib/          Lógica pura: cálculo, contratos, cuadrante, festivos, IA simulada
  data/         Datos de ejemplo y plantillas iniciales de tramos y puestos
  hooks/        Estado compartido del flujo
```

**`src/lib/` no importa nada de React.** Es lógica pura y testeable: si un cálculo
necesita el DOM, está en el sitio equivocado.

---

## Origen

El modelo viene de un Excel real de planificación
(`PLANIFICADOR MENENDEZ PELAYO`) con las hojas `Semanatipo` (comensales por franja),
`Modelos` (tramos → personal), `Necservicio` (necesidad por franja y puesto),
`Contratos` (tipologías), `PERSONAS` (cuadrante real, persona a persona, con el tipo de
tarea de cada media hora: montaje, servicio, cierre...), `4 SEMANAS` (seguimiento semanal
de ausencias y refuerzos) y `RESUMEN` (necesidades vs presencias vs diferencia).
La herramienta reimplementa esa cadena, pero con los tramos **definidos por el usuario**
en vez de fijos.

**Lo que el Excel tiene y la herramienta deliberadamente no copia:**
- El desglose de cada turno por tipo de tarea (montaje/servicio/cierre/apertura...) de
  `PERSONAS`. Añade una capa de detalle real, pero no cambia el número de gente ni de
  horas — es "cómo se llena el turno" más que "cuánta gente hace falta", y meterlo aquí
  complicaría el cuadrante sin mover el resultado.
- El seguimiento semana a semana de `4 SEMANAS` (quién falta, quién refuerza). Es gestión
  del día a día de una plantilla ya contratada, no dimensionado a partir de demanda: es
  otra herramienta, no una pantalla más de esta.
- Coste/salario: las columnas `SALARIO BRUTO`/`NETO` de `Contratos` existen pero están
  vacías en el fichero de origen — nunca se llegó a usar. Por eso el coste en esta
  herramienta es **opcional y lo pone el usuario** (ver 8 bis), nunca una cifra que se
  invente el propio cálculo.
