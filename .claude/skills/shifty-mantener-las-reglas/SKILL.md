---
name: shifty-mantener-las-reglas
description: >
  Cómo se edita la estructura de reglas y documentación de Shifty sin desordenarla: qué va en el
  fichero de reglas comunes, qué va en una skill, qué va en el trozo propio de un repo y qué va
  Docs. Incluye el criterio para decidir dónde va cada cosa, cómo se escribe una regla para que se
  cumpla, cómo se poda cuando crece, y las trampas del mecanismo (los imports no ahorran contexto,
  dos ficheros que se contradicen no tienen jerarquía). Úsala SIEMPRE que vayas a añadir, mover o
  borrar una regla, a escribir un aprendizaje nuevo, a crear una skill, o cuando alguien diga
  "apunta esto", "que no se te olvide", "añádelo al claude.md", "documenta esto", "crea una skill"
  o "esto se está desordenando".
paths:
  - "**/CLAUDE.md"
  - "**/SKILL.md"
  - "Docs/docs/**/*.md"
---

# Cómo se mantiene la maquinaria de reglas de Shifty

Este documento existe porque el 2026-09-02 el `CLAUDE.md` maestro llegó a 1.200 líneas acumulando
todo lo que se iba aprendiendo. Crescente lo paró con la frase que resume el problema: *"la idea es
que diga dónde está la documentación correcta para que sea inteligente"*.

**La regla de oro: el maestro es un mapa, no un almacén.**

> En el resto de este documento, **"el maestro" es `Docs/docs/shared/REGLAS-COMUNES.md`**, el
> fichero de reglas comunes. Hasta el 4 de septiembre de 2026 era el `CLAUDE.md` de la carpeta
> contenedora, que hoy es un enlace a ese mismo fichero. Todo lo que se dice del maestro sigue
> valiendo; lo que cambia es dónde se escribe.

---

## 1. Dónde va cada cosa

Cuatro sitios, y el criterio para elegir es **cuándo hace falta ese conocimiento**.

> ⚠️ **Esto cambió el 4 de septiembre de 2026.** Antes cada regla se escribía en el sitio donde
> se lee. Ahora **todo se escribe en el repo `Docs`** y de ahí se copia. Escribir en el sitio
> donde se lee ya no sirve: la siguiente copia lo pisa. La columna de la derecha dice **dónde se
> escribe de verdad**.

| Se lee en | Cuándo se carga | Qué va aquí | Se ESCRIBE en |
|---|---|---|---|
| **`CLAUDE.md` y `AGENTS.md`**, cabecera | En **todas** las sesiones, entero | Solo lo que se necesita saber **siempre**, porque equivocarse es caro e irreversible (< 200 líneas) | `Docs/docs/shared/REGLAS-COMUNES.md` |
| **`CLAUDE.md` y `AGENTS.md`**, segunda mitad | Con el resto del fichero | Lo que solo tiene sentido en ese proyecto: carpetas, componentes, colores, su stack (200-400 líneas) | `Docs/repos/<proyecto>.md` |
| **`.claude/skills/*/SKILL.md`** | Solo el nombre y la descripción al arrancar. El cuerpo, **cuando hace falta** | El detalle por área: la base, el dinero, el soporte, la marca. Sin límite práctico | `Docs/skills/shared/` o `Docs/skills/<repo>/` |
| **`agent_docs/`** | Nunca solo. Se lee cuando las reglas o una skill te mandan | El contrato entre las 4 apps, los volcados de esquema, las fichas de feature, los incidentes | `Docs/docs/` |

**`AGENTS.md` es el mismo texto que `CLAUDE.md`**, generado a la vez para que Codex lea lo mismo
que Claude. Nunca se editan por separado, ni se edita ninguno de los dos a mano.

### El criterio, en una pregunta

> **¿Se necesita esto en todas las sesiones, o solo cuando se hace una cosa concreta?**

- **En todas** → `Docs/docs/shared/REGLAS-COMUNES.md`. Ejemplo: "nunca crear tablas sin permiso escrito".
- **Solo al tocar la base** → skill `shifty-base-de-datos`.
- **Solo al hablar de dinero** → skill `shifty-dinero`.
- **Solo dentro del panel** → `Docs/repos/Web-Panel.md`.
- **Es una referencia larga que se consulta** → `Docs/docs/`, y se apunta desde donde toque.

Si dudas, **no va en las comunes**. Ese sitio se gana, no se hereda: lo pagas en todas las sesiones
de los siete proyectos.

---

## 2. Cómo funciona el mecanismo de verdad

Esto está verificado contra la documentación oficial de Claude Code el 2026-09-02. Importa porque
hay dos malentendidos que hacen perder el tiempo.

### Lo que se carga solo, y cuándo

1. **El `CLAUDE.md` de la carpeta desde la que se trabaja se carga entero, en cada sesión.** Si
   trabajas desde la carpeta que contiene los ocho proyectos, es su `CLAUDE.md`, que hoy es un
   **enlace** al fichero de reglas comunes. Si abres un proyecto suelto, es el suyo, que lleva esas
   mismas reglas en su cabecera. **En los dos casos cargas lo mismo**, y lo pagas siempre.
2. **El `CLAUDE.md` de un repo que no es el tuyo NO se carga al arrancar.** Se carga **cuando Claude
   lee o edita un fichero de esa carpeta**. Eso es automático: nadie tiene que acordarse de abrirlo.
3. **De una skill solo entran el nombre y la descripción al arrancar.** El cuerpo entra cuando la
   skill se invoca. **Este es el único mecanismo que de verdad ahorra contexto.**

### ⚠️ Los dos malentendidos

- **Trocear el maestro con `@imports` NO ahorra nada.** Los ficheros importados se cargan enteros al
  arrancar, exactamente igual que si pegaras el texto. Sirven para organizar al editar, no para
  aligerar. **Si quieres aligerar de verdad, el contenido tiene que irse a una skill.**
- **Entre dos `CLAUDE.md` no hay jerarquía.** Se concatenan sin más, y ante una contradicción no
  gana el más específico: se elige de forma arbitraria. **Por eso mover una regla obliga a borrarla
  del sitio viejo**, no solo a copiarla al nuevo. Una regla en dos sitios es una bomba.
  Dentro de UN fichero generado sí hay orden, porque lo pone escrito: lo común arriba, lo del
  proyecto abajo, y ante una contradicción manda lo de abajo salvo en las inquebrantables. Eso
  funciona porque está dicho en el texto, no porque el orden lo decida.

### El campo `paths` de una skill

Una skill puede declarar `paths` en su cabecera. Entonces se carga **de forma determinista** cuando
Claude lee o edita un fichero que coincide con el patrón. Es más fiable que confiar en que el modelo
la elija por la descripción.

**Pero no se dispara con las herramientas de Supabase.** Tocar la base por el MCP no lee ningún
fichero local, así que `paths` no salta. Para garantizar algo *cada vez que se toque la base* hace
falta un hook, no una skill.

---

## 3. Cómo se escribe una regla

Una regla mal escrita es peor que no tenerla, porque ocupa sitio y no se cumple.

**Una regla buena tiene tres partes:**

1. **Qué hacer o qué no hacer**, en imperativo y sin rodeos. *"Nunca hacer updates directos a
   tablas"*, no *"conviene valorar el uso de RPCs"*.
2. **El motivo, en la misma frase o justo debajo.** Sin el motivo, la primera vez que estorbe se la
   salta alguien.
3. **El número, la fecha o el incidente que la justifica**, si lo hay. *"El 2026-07-17 un barrido
   encontró 8 funciones vivas rotas desde su despliegue"* convence; *"es importante revisar las
   funciones"* no.

**Y no debe tener:**

- Código, snippets ni nombres de función como parte de la explicación. Crescente no lee código.
- Guiones largos. Le suenan a texto de IA.
- Consejos genéricos de manual. Si la regla valdría igual para cualquier empresa del mundo, sobra.
- Duplicados de algo que ya dice el código, el esquema o el historial de git.

---

## 4. Cuando se aprende algo nuevo

Este es el momento de riesgo: la tentación es añadirlo al maestro porque es lo que está delante.

**El procedimiento:**

1. **Clasifica el aprendizaje** con la tabla del punto 1.
2. **Escríbelo en su sitio**, no en el maestro por comodidad.
3. **Comprueba que no está ya escrito en otro sitio.** Si está, actualiza el que hay; no añadas uno
   nuevo con otras palabras.
4. **Si contradice algo existente, resuélvelo.** No dejes las dos versiones conviviendo: eso es
   exactamente como nació el desorden que este documento viene a evitar.
5. **Confirma dónde lo has escrito**: *"lo he registrado en tal fichero"*.

**Y la tabla de destinos, que ya estaba acordada:**

| Tipo de aprendizaje | Dónde va |
|---|---|
| Regla de negocio o de lógica | `Docs/docs/shared/governance.md`, sección 14 |
| De una feature concreta | Su fichero en `Docs/docs/features/` |
| De esquema o de datos | Se **regenera** el volcado desde Supabase, no se escribe a mano |
| De contenido o marketing | `Docs/docs/marketing/content-learnings.md` |
| De marca o de voz | `Docs/docs/brand/voice-and-tone.md` |
| Trampa de la base | Skill `shifty-base-de-datos` |
| Regla de dinero | Skill `shifty-dinero` |
| Respuesta a un trabajador | Skill `shifty-soporte-trabajador` |
| Copy y marca | Skill `shifty-marca-y-copy` |
| De comportamiento tuyo, y aplica siempre | Maestro |
| De comportamiento tuyo, solo en un repo | El `CLAUDE.md` de ese repo |
| Al cerrar una incidencia | Ficha obligatoria en `Docs/docs/incidencias-tecnico/` |

---

## 5. La poda

El maestro crece solo. Si nadie lo poda, en tres meses vuelve a estar donde estaba.

**Cada vez que el maestro pase de 200 líneas, se poda antes de añadir nada más.** No es negociable:
es el número que marca la documentación oficial.

**Qué se saca, por orden:**

1. **Lo que ya no es cierto.** Una regla sobre algo que se cambió hace meses ocupa sitio y engaña.
2. **Lo que solo aplica a un repo.** Se va a su `CLAUDE.md`, que se carga solo cuando toca.
3. **El detalle de un área.** Se va a su skill. En el maestro queda una línea en la tabla de rutas.
4. **Lo que está duplicado.** Se queda la versión más completa, normalmente la que trae el incidente
   que la originó, y se borra la otra.
5. **Los consejos genéricos.** Si valdría para cualquier empresa, fuera.

**Qué NO se saca nunca del maestro:**

- Las reglas inquebrantables, aunque sea en una línea cada una.
- Cómo hablar con Crescente.
- La tabla de rutas.

**Existe una herramienta oficial de Anthropic para esto**, la skill `consolidate-memory`, que hace
una pasada fusionando duplicados, corrigiendo datos caducados y podando el índice. Se puede usar
sobre la memoria y sobre este sistema.

---

## 6. Notas para quien mantiene, sin gastar contexto

En un `CLAUDE.md`, los comentarios de HTML (`<!-- ... -->`) **se descartan antes de que el contenido
llegue a Claude**, pero siguen visibles al abrir el fichero para editarlo.

Sirven para dejar constancia sin pagarla en cada sesión: por qué existe una regla, quién la puso,
cuándo hay que revisarla, o qué se probó antes y no funcionó.

---

## 7. Las cuatro preguntas antes de tocar la estructura

1. **¿Esto hace falta en todas las sesiones?** Si no, no va en el maestro.
2. **¿Ya está escrito en algún sitio?** Búscalo antes. Duplicar es el error que más caro sale.
3. **¿Contradice algo?** Resuélvelo ahora, no lo dejes conviviendo.
4. **¿El maestro sigue por debajo de 200 líneas?** Si no, poda antes de añadir.

---

## 8. Qué NO se hace nunca

- **Añadir al maestro "por si acaso".** El maestro se paga en cada sesión de cada día.
- **Copiar una regla a un segundo sitio** en vez de moverla. Sin jerarquía entre ficheros, dos
  copias que divergen dan comportamientos distintos según por dónde entres.
- **Escribir en `agent_docs/` o en `.claude/skills/` de los cuatro repos de app.** Son copias de
  solo lectura: la siguiente sincronización desde `Docs/` las borra sin avisar.
- **Editar a mano los volcados de esquema** de `Docs/docs/shared/`. Se regeneran desde Supabase.
- **Dejar que la memoria automática crezca sin revisarla.** Acumula contradicciones en silencio.
