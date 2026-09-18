---
name: auditar-orden
description: >
  Pasa revista al orden de Shifty y dice, en castellano, qué se ha desordenado: la misma lógica
  escrita en muchos sitios, funciones duplicadas o ambiguas, pantallas y flujos gemelos entre las
  cuatro apps, tablas sin RLS, columnas sin comentario, claves ajenas sin índice, dinero en coma
  flotante, nombres fuera de convención, fichas sin cabecera de estado, catálogos desfasados y
  documentos huérfanos. Propone los arreglos; no aplica ninguno sola. Úsala cuando Crescente diga
  "auditar el orden", "está esto ordenado", "qué hay duplicado", "qué falta por documentar", "qué
  se nos está ensuciando", antes de cerrar una feature grande, o cada semana o dos.
---

# Auditar orden — que el desorden no se acumule en silencio

El desorden no llega de golpe: llega una función casi gemela un martes y una columna sin
comentario el jueves. Esta skill lo hace visible antes de que sea irreversible.

**Solo lee y propone. Nunca aplica nada sola.** Lo mecánico, una vez aprobado, lo hace la skill
`cleanup` de cada repo, en pasadas ordenadas.

Y **un único informe corto al final**. Crescente no quiere ver cientos de filas: quiere saber
cuánto hay, qué es lo grave, y qué hacemos.

---

## ⚠️ Antes de empezar: dos avisos que ya han costado caro

**1. Copia las consultas de su sitio, no las escribas de memoria.** El 3 de septiembre de 2026 se
escribió de memoria la consulta que caza funciones ambiguas y dio 7 familias cuando había 10:
comparaba los tipos en el número de argumentos más grande de los dos, y la ambigüedad salta en el
más pequeño. Se escaparon tres, entre ellas las de crear y editar ofertas del portal de empleo.
**Una consulta de comprobación que falla en silencio es peor que no tenerla**, porque da permiso
para desplegar.

**2. Que un analizador diga que algo está roto no significa que la funcionalidad no ocurra.** Casi
siempre hay más de un camino, y lo roto es uno de ellos. Antes de marcar nada como roto: mira si
el resultado existe en los datos y de cuándo es el último, busca los demás caminos, y delimita a
cuánta gente afecta. Decir que algo está roto cuando funciona quema credibilidad, y hace que la
siguiente alarma, la de verdad, se lea con desconfianza.

---

## Pasada 1 — La misma lógica en muchos sitios

Es la prioridad. **Si se cambia una copia y no las otras, el sistema contesta cosas distintas
según por dónde entres, sin dar ningún error.**

Los tres casos conocidos, y su tamaño cuando se midieron: la comisión en 46 funciones, la
detección del actor en 158, la guarda `is_test` en 145. Hay helpers para las tres y casi nadie
los usa.

Qué se busca:

- **Una regla de negocio escrita a mano en más de tres funciones.** Se propone extraer a un
  helper y sustituir; nunca las 46 de golpe: las que se tocan ese mes, y se sigue.
- **Funciones que hacen casi lo mismo** con nombres parecidos, o con sufijo `_v2`, `_new`, `_old`,
  `_bak`, `_tmp`. La regla es que no conviva ninguna versión vieja.
- **Dos funciones para la misma acción según de dónde venga** (una para el panel y otra para la
  app). Se unifican en una con la fuente como parámetro.
- **Pantallas o componentes gemelos entre las cuatro apps.** Mismo objetivo resuelto dos veces con
  diferencias menores.
- **La misma cosa llamada de dos maneras.** El vocabulario está en `shared/glossary.md`.

**La comprobación de funciones ambiguas es obligatoria y su consulta está escrita en la skill
`shifty-base-de-datos`, §7 regla 1 bis. Cópiala de allí.** Cero filas. Si salen familias, cada una
es una llamada que hoy falla en silencio y el front se traga. Y al retirar una versión duplicada,
mirar antes qué hará la que se queda con sus valores por defecto: hay casos donde desambiguar
activaría un borrado de datos.

Pasar también `plpgsql_check`. Cero filas en las dos.

---

## Pasada 2 — El orden del esquema

Ejecutar `scripts/auditar-orden.sql` contra producción. Son todo `SELECT`: no escribe nada. Cada
consulta debe devolver cero filas, y hoy ninguna lo hace. **El objetivo no es llegar a cero este
mes**, es que la cifra baje y no suba.

Agrupar los resultados por gravedad, no por consulta:

- **Rompe la seguridad, hoy:** tablas sin RLS, tablas con RLS y sin ninguna política, funciones
  `SECURITY DEFINER` sin `search_path` fijado, funciones que reciben un identificador de empresa o
  de trabajador por parámetro y no comprueban que quien llama tiene derecho a él.
- **Rompe los datos, esta semana:** dinero en coma flotante, fechas sin zona horaria, claves ajenas
  sin índice.
- **Rompe el entendimiento, poco a poco:** columnas y tablas sin comentario (solo el 19,5 % lo
  tiene), nombres fuera de convención, tablas operativas sin `is_test`.

Para lo tercero **no propongas arreglarlo todo de golpe.** Una tabla, la que más se toque, y
cuando esté aprobada, la siguiente.

---

## Pasada 3 — La documentación

- **Documentos que mienten.** Afirmaciones de estado que ya no son verdad: "en producción",
  "pendiente", "flag encendido", "v2". No repitas este trabajo: lo hace la skill
  `sincronizar-doc`, invócala.
- **Los dos catálogos generados**, que son los que más silenciosamente se desfasan y los que más
  caro salen: si una función existe y no está en el catálogo, el siguiente que lo lea escribirá
  una segunda versión de lo mismo. Comprobar la línea "Fecha del volcado" de
  `shared/database-schema.md` y `shared/rpc-functions.md`, y contrastar el número de funciones y
  de tablas contra la base. Si no coinciden, **decirlo en el informe** aunque no se regeneren en
  ese momento.
- **Fichas sin cabecera de estado y fecha de verificación.** Sin eso no se sabe si una ficha es
  verdad o arqueología. La referencia es `features/_PLANTILLA.md`; **los ficheros que empiezan por
  guion bajo son plantillas y no cuentan** como hallazgo.
- **Documentos huérfanos:** la ficha de un flujo que ya no existe, el plan de algo descartado, una
  auditoría de hace seis meses que nadie ha cerrado. Se proponen para `_archivo/`, no se borran.
- **Ficheros con nombre de basura:** `notas.md`, `temp.md`, `borrador.md`, cualquier cosa acabada
  en `-v2`, `-final` o `-copia`.
- **Documentación escrita en el sitio equivocado:** cualquier cambio dentro de `agent_docs/` o
  `.claude/skills/` de un repo que no sea `Docs`. Está condenado; el siguiente sync lo borra.

---

## Pasada 4 — El código

- Componentes que no importa nadie, y ficheros que no alcanza ninguna ruta.
- Tipos `any` y `console.log` de depuración (los lista el linter; no dupliques a `cleanup`).
- **Cualquier importe calculado en el frontend.** Esto no es desorden, es un error: va a la parte
  grave del informe, con el fichero y la línea.
- **Cualquier regla de quién puede hacer qué resuelta en el frontend.** Si una pantalla decide en
  vez de preguntar, el día que la regla cambie habrá dos verdades.
- Consultas dentro del pintado de una lista, y listas sin límite ni paginación.

---

## El informe

Cuatro o cinco frases, en castellano, sin volcados. La forma:

> *"Está razonablemente ordenado. Lo más gordo: hay tres funciones de crear oferta y dos de ellas
> se pisan, así que las llamadas cortas fallan sin avisar desde agosto. Después, 40 tablas no
> tienen comentario en ninguna columna. Y el catálogo de funciones lleva desde el 4 de septiembre
> sin regenerar, con 23 funciones nuevas fuera. Empezaría por lo primero, que es lo único que está
> rompiendo algo hoy."*

Y al final, **una propuesta de por dónde empezar**, no una lista de todo. Si hay algo que está
rompiendo dinero, seguridad o datos personales, va primero y se dice que va primero.
