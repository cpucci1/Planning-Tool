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
  según por dónde entres". Antes de dar por hecho un cambio de pantalla, pasa la guía de front de
  su app (§8): animaciones suaves, nada de golpe, ninguna pantalla sin salida.
paths:
  - "**/*.tsx"
  - "**/*.ts"
  - "**/*.jsx"
  - "**/*.js"
---

# Escribir código en Shifty sin ensuciarlo

Shifty ya es grande: **casi 600 tablas y más de 2.300 funciones** (medido contra producción el
2026-10-22; en septiembre nacieron 403) y varias aplicaciones contra la misma base. A este
tamaño, **el coste de escribir algo por segunda vez no es el rato que tardas: es que a partir de ese
día el sistema contesta cosas distintas según por dónde entres, y no da ningún error**.

Todo lo de aquí existe porque ya pasó.

---

## 1. Antes de escribir nada nuevo, busca si ya está

**Lo normal es que exista.** Con más de dos mil funciones, la probabilidad de que tu idea sea nueva es baja.
Empieza por `shared/FUENTES-UNICAS.md`: cada pregunta del negocio y la única función que la contesta.

- **Busca por lo que hace, no por cómo lo llamarías tú.** El nombre que le pondrías es el que no
  tiene. Busca las palabras del dominio: la tabla que tocaría, la columna que devolvería.
- **Mira la base, no el catálogo.** `select * from fn_find_similar('lo que hace', array['tablas'])`
  te da las 15 funciones, tablas y vistas más parecidas, con el porqué (skill `shifty-base-de-datos`
  §7). `shared/rpc-functions.md` puede ir por detrás; la base no. Dar
  por hecho que una función no existe porque no está en el documento es exactamente como nacieron
  las 19 familias de funciones duplicadas del 3 de septiembre de 2026.
- **Si existe algo parecido, se extiende; no se crea un gemelo.** Añadir un parámetro con valor por
  defecto no es crear una función nueva.
- **Una acción, una función**, con la fuente como parámetro. El panel y la app no tienen funciones
  distintas para lo mismo.
- **A la tercera vez que escribas lo mismo, se extrae a un sitio único.** Hay helpers para casi
  todo y casi nadie los usa: decidir quién llama se escribe a mano en 416 funciones, y la nota
  media se calcula en 12 pantallas con reglas distintas (09-10-2026).
- **Lo que la pantalla manda como parámetro no puede ser una decisión.** Si un cierre de horas
  queda en revisión, o qué es cancelar tarde, lo decide la base: hubo cuatro pantallas decidiendo
  cuatro cosas distintas. El candado de commit pregunta si ve `p_is_disputed` o el umbral de 24 h.

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
- **Si una pantalla enseña una cifra derivada que la base no da** (un importe por línea, un precio por
  hora con coeficiente), no se multiplica en la pantalla: se pintan los componentes que sí da la base
  y se pide la cifra a la base en el mismo trabajo. Pasar 1,505 a "+50,5 %" es formato; multiplicar
  tarifa por coeficiente, no.
- **Un reintento automático ante "permiso denegado" solo es seguro si la llamada no llegó a hacer nada
  o es idempotente** (`rpcWithCredentialRetry` en la app de empresas reintenta una vez ante 42501).

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
   escapan. Dónde buscar y cómo comprobarlo después: skill `mapa-de-impacto`.
3. **Marcar las zonas frágiles** con un comentario que empiece por ⚠️ y diga qué se rompe si se
   tocan sin entenderlas. Y leerlo antes de tocarlas.
4. **Lo que se deja de usar se marca, no se borra.** Cuatro apps dependen de esos nombres.
5. **"Ya existe una función" no es "ya funciona".** Antes de reutilizar una RPC para un caso nuevo,
   ejecútala con ese caso en una transacción que se deshace. El 09-10-2026 el plan daba por resuelta
   la marca de prueba con `admin_update_worker_field('is_test')`, y esa función falla siempre con
   cualquier campo que no sea texto.
6. **Mira qué hace la pantalla con el error.** Una ventana que se cierra en `onError` sin enseñar
   nada esconde una función rota durante semanas: así se estuvo sin poder cambiar la marca de prueba
   desde Editar trabajador, sin que nadie lo supiera.
7. **Un update que "no falla" puede no guardar nada.** Hay disparadores que devuelven columnas a su
   valor anterior sin dar error (`fn_protect_shift_billing_columns` en `shifts`). El 09-10-2026 la app
   de empresas decía "Las horas se han guardado" al editar en lote y no guardaba nada. Antes de dar
   por bueno un `.update()`, lee los disparadores `BEFORE UPDATE` de la tabla y comprueba en los datos
   que el valor quedó escrito (y mejor: usa la RPC).
8. **Antes de coger algo de un hook, de un objeto o de una respuesta, abre de dónde sale y comprueba
   que ese nombre existe.** En JavaScript, un nombre que no está vale `undefined` sin dar ningún error,
   y donde se use como función la app se cierra. El 03-11-2026 Ajustes cogió `recargar` de un hook
   que no lo devuelve, lo puso a escuchar el foco de la pantalla, y la 1.9.1 y la 1.9.2 se cerraban
   al entrar en Ajustes (27 personas en un día). En la app única lo vigila un test que corre en cada
   push (`scripts/comprobar-propiedades-de-hooks.js`): **si salta, se arregla el nombre, nunca se
   silencia el test**. Y lo que solo sirve para tapar el hueco (`?.()` sobre algo que debería existir)
   tampoco: esconde el fallo en vez de arreglarlo.

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

## 7. En la interfaz, nunca un emoji como icono

Regla de Crescente del 25-09-2026: **un emoji como icono es poco profesional. Siempre va un icono del
set de la app**, y si el que hace falta no está, se añade al set; no se tira de un emoji mientras
tanto. Vale para las cuatro apps. En la app de trabajadores el set es `components/nueva/Icono.js`,
el lint da error si se escribe un emoji en el código de la app única, y el detalle (qué cuenta como
emoji, qué pieza lleva cada icono y la lista de la app de siempre) está en su
`docs/rediseno-front-2026-09/GUIA-FRONT-UX.md` §14.

- **Cuenta como emoji** lo que el móvil pinta en color (📄, 💜, ✅) y lo que lleva el selector que lo
  convierte (⚠️).
- **Un signo tipográfico dentro de una frase es texto y se queda** ("★ 4,5 · 12 turnos",
  "Ajustes › Shifty"). Si va suelto haciendo de icono (un ✓ en una pastilla, un › al final de una
  fila), se cambia por el icono.
- **Lo que escribe una persona o manda el servidor es contenido** y no se toca.

---

## 8. Antes de dar por hecho un cambio de front: la guía de su app

Regla de Crescente del 13-10-2026: **cada vez que se toca o se crea algo que se ve (una pantalla,
una hoja, un aviso, un botón que cambia), se repasan las buenas prácticas ya escritas antes de darlo
por terminado**. No basta con que funcione: tiene que verse suave y seguir las reglas sin que él lo
tenga que preguntar.

Dónde están:

- **App de trabajadores y de empresas (Worker-App):** `docs/rediseno-front-2026-09/GUIA-FRONT-UX.md`
  del propio repo, entera; las piezas de movimiento son `MOVIMIENTO` (`constants/nueva/tema.js`),
  `constants/nueva/movimientoUI.js` y `useReducirMovimiento`.
- **Panel web y Website:** `design/ui-patterns.md` (transiciones de página, entrada de modales,
  movimiento reducido).

Lo mínimo que se mira siempre, aunque el cambio sea pequeño:

- **Nada aparece ni desaparece de golpe.** Lo que entra, sale o cambia dentro de una pantalla o de
  una hoja (un bloque, un aviso, los botones del pie) se anima: entre 200 y 300 ms, con la curva de
  la guía, que frena al final. Si una hoja crece porque le entra contenido, crece con su muelle y
  lo nuevo entra con un fundido.
- **Cerrar también es una transición.** Una hoja, un panel de filtros, un desplegable o una ventana
  se va igual de suave que entró: baja o se funde con su curva, y el fondo oscuro se va a la vez.
  Desaparecer de un frame al siguiente cuenta como "de golpe".
- **Con "reducir movimiento" activado**, la animación se cambia por un fundido; nunca se quita sin
  más.
- **Una hoja no se abre encima de otra que se está cerrando.** Si hay que pasar de una a otra,
  primero baja la que hay y luego sube la nueva; si es otro paso de lo mismo, se cambia el
  contenido dentro de la misma hoja.
- **Ninguna pantalla se queda sin salida.** Si algo no se puede hacer, se dice por qué y qué puede
  hacer la persona (reintentar, que le ayude alguien, escribir a Shifty).
- **Cargando, vacío, error y sin conexión** tienen su estado, y ninguno parece roto.
- Lo demás de la guía (iconos, textos, toques, accesibilidad), según lo que toques.

- CORRECTO: al terminar el cambio, abrir la guía de su app, repasar lo de arriba sobre lo que se ha
  tocado, arreglar lo que no cumpla y decir en el cierre que se ha repasado.
- INCORRECTO: la hoja "Afinando tu ubicación" (13-10-2026) metía el bloque del encargado de golpe
  y, al pasar de una hoja a otra, se abría una mientras la otra se cerraba. Se dio por terminada sin
  mirar la guía y Crescente tuvo que preguntar si la transición era suave (Worker-App #465).
- INCORRECTO: en la app de empresas, la hoja de filtros se cierra de golpe (lo vio Crescente el
  23-10-2026, *"es brusco"*). Lo mismo al construir algo nuevo: él ve que a veces nace sin
  transiciones. Toda pantalla nueva sale ya con sus entradas y salidas suaves, no en una segunda
  vuelta.

---

## 9. Verificar antes de dar algo por terminado

`tsc --noEmit` y `npm run lint` a cero. En las apps móviles, iOS **y** Android. En Website,
`npm run build`.

⚠️ **Client-App, Website, sales-tool y Planning-Tool no tienen ningún candado de push**, aunque sus
ficheros digan lo contrario. Hay que ejecutarlo a mano o se sube roto.

Y antes de cada commit, `/code-review` sobre lo modificado. Ese paso no se salta. Nunca
`--no-verify`.

---

## 9. Llamar a una IA: siempre con freno de gasto

**Ninguna llamada a Gemini, OpenAI o Anthropic sale sin pasar por los helpers compartidos.** El
09-10-2026 un barrido de Clara reintentó sin límite los mismos 7-10 WhatsApp de 10:00 a 19:03:
8.863 llamadas a la IA en un día que suele tener 20-500. Cada reintento llamaba al modelo y luego
fallaba. Nadie se enteró, porque no había ni tope ni registro común: solo Clara apuntaba su gasto,
y lo apuntaba con un precio cinco veces más bajo que el real (39 $ anotados; a la tarifa publicada,
cerca de 200 $).

Desde ese día hay tres capas, y el código solo tiene que usar la primera:

1. **Los helpers** (Web-Panel, `supabase/functions/_shared/`):
   - `callLlm` y `embedTexts` de `llm.ts`, para todo lo que va a Gemini por el adaptador.
   - `fetchIa` de `ia-gasto.ts`, con la misma forma que `fetch`, para una llamada directa a
     cualquier proveedor.
   - `conPresupuestoIa`, para una llamada con el SDK de un proveedor (`new GoogleGenAI(...)`).

   Antes de llamar preguntan a la base si queda presupuesto; si no queda, **no llaman** y lanzan
   `IaPresupuestoError` (es un `LlmError`: el plan B que ya tuviera la función sigue funcionando).
   Después apuntan la llamada en `ai_usage_events`: función, modelo y tokens, **nunca texto ni nada
   de una persona**.
2. **Los topes** viven en `app_config`, clave `ai_budget`: por función (llamadas y dólares en la
   última hora, dólares en el día) y global del día. Se suben ahí, sin desplegar. **Los precios**
   viven en `ai_model_prices`, y en ningún sitio más: no se escribe un precio en una función.
3. **El vigilante** (`fn_ai_spend_watch`, cada 10 min) avisa a Slack #alarmas una vez por
   incidente, y si una función sigue chocando con su tope, **pausa el cron que la alimenta** y lo
   deja escrito en `ai_spend_incidents`. No lo reactiva nunca: eso lo hace una persona tras mirar
   la causa.

**Lo que no se hace:**

- Un `fetch` a pelo contra un proveedor de IA. El candado de commit lo frena.
- Un precio por token escrito en la función para calcular un coste. El coste lo pone la base.
- Un bucle o un cron que reintenta una llamada a la IA sin límite de intentos por mensaje. El tope
  corta el gasto, pero el bucle sigue ahí: el reintento tiene que tener su propio techo.

**Al desplegar, el nombre de la función** sale solo de la ruta del módulo desplegado. Si una función
sale como `desconocida` en `ai_usage_events`, se le pasa `funcion` a `callLlm` o se llama a
`fijarFuncionIa('su-nombre')` al arrancar.
