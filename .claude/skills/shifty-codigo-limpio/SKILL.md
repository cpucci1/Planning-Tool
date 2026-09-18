---
name: shifty-codigo-limpio
description: >
  Cómo se escribe código en Shifty para que el sistema siga creciendo sin ensuciarse: el front no
  decide ni calcula nada, cómo se piden los datos sin ahogar una pantalla, qué se hace ANTES de
  editar algo que ya existe, cómo se busca si ya hay una función que hace eso, y la obligación de
  avisar de los casos límite en el momento en que se ven. Úsala SIEMPRE antes de escribir o
  modificar código en cualquiera de las cuatro apps, antes de crear una pantalla, un hook, un
  componente o una consulta, y cuando alguien diga "conéctalo a la base", "haz que esta pantalla
  muestre X", "añade este campo", "esto va lento", "refactoriza esto" o "por qué sale distinto
  según por dónde entres".
paths:
  - "**/*.tsx"
  - "**/*.ts"
  - "**/*.jsx"
  - "**/*.js"
---

# Escribir código en Shifty sin ensuciarlo

Shifty ya es grande: **472 tablas y 1.440 funciones** (medido contra producción el 2026-09-18) y
cuatro aplicaciones contra la misma base. A este
tamaño, **el coste de escribir algo por segunda vez no es el rato que tardas: es que a partir de ese
día el sistema contesta cosas distintas según por dónde entres, y no da ningún error**.

Todo lo de aquí existe porque ya pasó.

---

## 1. Antes de escribir nada nuevo, busca si ya está

**Lo normal es que exista.** Con 1.440 funciones, la probabilidad de que tu idea sea nueva es baja.

- **Busca por lo que hace, no por cómo lo llamarías tú.** El nombre que le pondrías es el que no
  tiene. Busca las palabras del dominio: la tabla que tocaría, la columna que devolvería.
- **Mira la base, no el catálogo.** `shared/rpc-functions.md` puede ir por detrás; la base no. Dar
  por hecho que una función no existe porque no está en el documento es exactamente como nacieron
  las 19 familias de funciones duplicadas del 3 de septiembre de 2026.
- **Si existe algo parecido, se extiende; no se crea un gemelo.** Añadir un parámetro con valor por
  defecto no es crear una función nueva.
- **Una acción, una función**, con la fuente como parámetro. El panel y la app no tienen funciones
  distintas para lo mismo.
- **A la tercera vez que escribas lo mismo, se extrae a un sitio único.** Hay helpers para la
  comisión, para la detección del actor y para la guarda `is_test`, y casi nadie los usa: la misma
  regla vive hoy en 46, 158 y 145 funciones.

---

## 2. El front es tonto

Regla de arquitectura, y no admite excepción: **el front no decide nada, no calcula nada y no
deduce nada. Pregunta, y pinta lo que le contestan.** Quien decide es el backend, siempre, y por eso
las decisiones se escriben una vez en un sitio en lugar de tres veces en tres pantallas.

- **No calcula.** Ni un importe, ni unas horas, ni un porcentaje, ni un total, ni un redondeo. Si
  una pantalla necesita una cifra que no existe, **no se calcula ahí**: se pide a una vista o a una
  función, y mientras tanto la pantalla no la enseña. Esto ya está en las reglas inquebrantables
  para los precios; vale igual para todo lo demás.
- **No decide si se puede.** Si alguien puede apuntarse, cancelar, cobrar o ver algo lo dice el
  servidor. El front **pregunta y enseña el motivo**. Replicar la regla "para ahorrar una llamada"
  significa que el día que cambie habrá dos verdades, y una dejará pasar lo que la otra prohíbe.
  Ya pasa: el estado de cuenta que consulta el bot de soporte dice "puede solicitar" a 11.291
  personas que no pueden, porque mira los bloqueos y no mira ni la categoría ni los datos de cobro.
- **No traduce los errores.** Los mensajes del servidor vienen escritos para quien los lee y se
  enseñan tal cual. Sustituirlos por uno genérico es tirar la única pista de qué pasó.
- **No filtra por seguridad.** Si hay que ocultar algo, lo oculta el backend con RLS o dentro de la
  función. Un filtro en el front es maquillaje: quien mire por debajo lo ve igual, y la clave
  anónima va dentro de las apps.
- **Sí formatea.** Fechas, monedas, mayúsculas, orden de lectura y todo lo visual. Eso sí es suyo.

⚠️ **La prueba:** si el backend cambiara una regla, ¿habría que tocar esta pantalla? Si la respuesta
es sí para algo que no sea el texto o el aspecto, la pantalla está decidiendo y hay que quitárselo.

---

## 3. Pedir datos: pocas llamadas y bien hechas

Una pantalla lenta casi nunca lo es por el diseño: lo es porque pide mal.

- **Una pantalla, una consulta** siempre que se pueda. Lo que cuelga de algo se trae anidado en la
  misma consulta, no con una llamada por fila. Diez filas que piden cada una lo suyo son once viajes
  donde cabía uno, y no se nota hasta que hay mil.
- **Nunca pedir datos dentro del pintado de una lista**, ni en el render de una fila ni en un
  componente hijo por elemento. Si una fila necesita algo, se trae con la lista.
- **Pedir solo las columnas que se usan.** Además hay tablas donde pedirlas todas falla a propósito,
  porque las columnas de datos personales están cerradas aunque seas su dueño.
- **Los catálogos se cargan una vez y se comparten.** Provincias, categorías, convenios o vestimentas
  no se vuelven a pedir en cada pantalla: misma clave de caché. Al guardar se invalida lo que ha
  cambiado, no la caché entera.
- **Nada sin límite.** Toda lista que pueda crecer (trabajadores, turnos, facturas, registro de
  actividad) se pagina o se acota desde el primer día. "Cuando se note" significa que se notó en
  producción.
- **Contar no es traer.** Para enseñar "34 personas" se pide el recuento, no las 34 filas.
- **Buscar, no listar.** Un catálogo grande no se vuelca entero en un desplegable: se busca
  escribiendo.

Para leer de Supabase se usa **TanStack Query** en Web-Panel, Client-App y las dos apps del
sales-tool. No aplica a Worker-App, que tiene sus propios contextos, ni a Website, que es servidor.

---

## 4. Antes de editar algo que ya existe

1. **Leer entera la zona afectada**, no solo la línea que vas a cambiar. Y si llama a otra cosa, esa
   también. Si no lo has leído, la frase es "no lo he verificado".
2. **Buscar todos los sitios que consumen lo que vas a modificar**, antes de tocarlo. Buscar el
   nombre pelado, no envuelto en la forma de llamarlo: hay llamadas construidas de otra manera y se
   escapan.
3. **Marcar las zonas frágiles** con un comentario que empiece por ⚠️ y diga qué se rompe si se
   tocan sin entenderlas. Y leerlo antes de tocarlas.
4. **Lo que se deja de usar se marca, no se borra.** Cuatro apps dependen de esos nombres.

---

## 5. Avisar de lo que va a doler, sin que te lo pidan

Mientras construyes —y sobre todo al conectar una pantalla con la base, que es donde aparecen— hay
que **buscar activamente y avisar** de lo que el diseño da por hecho y los datos no garantizan. No
se espera a que pregunten ni a que reviente. Se dice en el momento en que se ve, aunque no sea el
tema de la tarea.

Qué cuenta como aviso:

- **Lo que la pantalla asume y los datos no garantizan:** listas vacías, valores nulos, un catálogo
  sin cargar, un texto que se sale, una cifra que puede no existir.
- **Sitios sin vuelta atrás:** acciones de un solo sentido, campos inmutables que la interfaz deja
  editar, un interruptor que al apagarse no se puede volver a encender.
- **Lo que no escala:** consultas que se leen enteras, listas sin paginar, cosas que van bien con
  cinco filas y mal con cinco mil.
- **Dos caminos para lo mismo** que estén naciendo, aunque todavía no molesten.
- **Lo que el diseño asumía y el negocio no confirma.** Si la maqueta daba algo por cierto y nadie
  lo ha dicho, es una suposición y se marca como tal.

**Cómo se avisa:** en el mismo mensaje del trabajo, corto, sin dramatizar y **con una
recomendación** (arreglarlo ahora, apuntarlo, o dejarlo). Si es barato y no cambia el alcance, se
arregla y se cuenta; si cambia el alcance o el negocio, se pregunta.

**Lo que no se arregle se anota en `shared/PENDIENTE.md`**, nunca solo en la conversación: lo que
solo vive en un chat, se pierde. Y si es de una feature concreta, va además a su ficha.

⚠️ **Avisar no es dar algo por roto.** Antes de decir que algo está roto, comprueba si pasa
igualmente: casi siempre hay más de un camino. Decirlo cuando funciona quema la credibilidad de la
siguiente alarma.

---

## 6. La librería, como es hoy

Antes de escribir código que use una librería, un framework o un SDK (Expo, React Native, Supabase,
TanStack Query, Next.js), **consulta su documentación oficial vigente**. Context7 está disponible en
las sesiones del panel. No te fíes de la memoria de entrenamiento: las versiones se mueven, y una
API que recuerdas puede llevar dos versiones retirada.

Vale también para configuración, migraciones de versión y depuración de un problema concreto de esa
librería.

---

## 7. Verificar antes de dar algo por terminado

`tsc --noEmit` y `npm run lint` a cero. En las apps móviles, iOS **y** Android. En Website,
`npm run build`.

⚠️ **Client-App, Website, sales-tool y Planning-Tool no tienen ningún candado de push**, aunque sus
ficheros digan lo contrario. Hay que ejecutarlo a mano o se sube roto.

Y antes de cada commit, `/code-review` sobre lo modificado. Ese paso no se salta. Nunca
`--no-verify`.
