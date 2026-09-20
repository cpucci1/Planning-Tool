# Encargo para quien abra este repo (ChatGPT u otro agente)

Crescente te va a dar acceso a este repositorio, `Planning-Tool`, y quiere que hagas exactamente
lo que dice este documento. Está escrito para que lo puedas ejecutar tú mismo, sin que él tenga
que traducirte nada de código.

## Qué es esto

El Planificador de plantilla de Shifty: una herramienta web gratuita, sin registro, para que un
encargado de restaurante suba el histórico de ventas de su TPV y saque cuánta gente necesita, qué
turnos hacer y cómo cubrir los picos. La usan personas que no son técnicas: dueños y encargados de
hostelería, no programadores. Todo el copy tiene que hablarles a ellos.

Está publicada en `https://planificador.shifty.es` (producción, en vivo) y el código de este repo
es exactamente lo que hay desplegado ahí.

## Prioridad número uno, antes que nada más

Dentro del último paso ("Tu plan"), las dos últimas pantallas — **"Los picos"** y **"Con
Shifty"** — no funcionan como argumento. No es un tema de pulir una frase: hoy no dicen nada y
venden mal. Viven en `src/steps/StepResult.tsx`:

- **"Los picos"**: bloque que empieza en el comentario `── 5. Los picos → Shifty ──`, renderizado
  cuando `sub === 3`. Tiene que dejar clarísimo, en dos segundos, cuántas semanas al año le faltan
  brazos y qué le cuesta eso.
- **"Con Shifty"**: bloque que empieza en el comentario `══ sub-paso 4: con Shifty ══`,
  renderizado cuando `sub === 4`. Tiene que vender de verdad por qué cubrir esas semanas con
  Shifty es mejor que contratar de más o que tirar de conocidos por WhatsApp. Además tiene un
  problema visual: la captura de pantalla de Shifty (`/shifty-turno.webp`) se ve enorme y
  desproporcionada con el resto de la página.

Para estas dos pantallas no te limites a corregir texto: si hace falta, cambia el titular, el
orden de los argumentos o la estructura entera. Trátalo como un rediseño de contenido, no como una
corrección de estilo.

## El resto del encargo

1. **Arranca la herramienta y navégala de verdad**, como si fueras un encargado de restaurante:
   `npm install` y `npm run dev` (o abre directamente `https://planificador.shifty.es`, que es la
   misma versión). Sube un fichero de ejemplo — créalo tú si no tienes uno a mano, tipo TPV con
   columnas de fecha, hora y comensales — y sigue todo el flujo hasta el final. No te quedes en
   leer el código: haz clic en cada tooltip (los iconos de información), cada botón y cada
   pestaña, y comprueba que cada cosa hace lo que promete.

   Mapa de dónde vive cada pantalla, para que no tengas que adivinar:
   - Lectura del fichero → `src/steps/StepImport.tsx`
   - Tu año / Horario / Semanas raras / Semana tipo → `src/steps/StepDemand.tsx` (son pestañas
     dentro del mismo fichero)
   - Equipo → `src/steps/StepTeam.tsx`
   - Tu plan (cuadrante, horario, demanda, revisión, métricas, criterios, los picos, con Shifty)
     → `src/steps/StepResult.tsx` (también por pestañas internas, variable `sub`)
   - Componentes que se repiten en varias pantallas → `src/components/`

2. **Para cada frase de la interfaz**, pregúntate si la entendería alguien que no sabe nada de
   software leyéndola una sola vez, rápido. Señala y corrige cualquier frase que sea: técnica o
   con jerga que un encargado de sala no usaría; vaga o genérica, que "suena a IA" en vez de a una
   persona explicando algo; demasiado básica o simplona, que no aporta nada aunque sea correcta;
   ambigua, que se pueda leer de dos formas; o repetida en dos sitios con palabras distintas
   diciendo lo mismo.

3. **No cambies ningún número ni ningún cálculo.** Todo lo que veas en pantalla (horas, personas,
   semanas, euros, porcentajes) sale de una cuenta real hecha en `src/lib/`: se puede tocar el
   texto que lo rodea, nunca la cifra ni de dónde sale. La única excepción visual es el tamaño de
   la imagen en "Con Shifty".

## Cómo lo entregas

1. Antes de tocar nada, escribe un documento nuevo, `RESUMEN-CAMBIOS-COPY.md`, en la raíz del
   repo: una lista pantalla por pantalla con el texto actual, qué está mal en una frase, y tu
   propuesta de texto nuevo. Para "Los picos" y "Con Shifty" explica también el porqué del cambio
   de enfoque, no solo el texto. Este documento es lo primero que va a leer Crescente — que no lee
   código — así que tiene que quedar claro solo con eso.
2. Crea una rama nueva a partir de `main`, con un nombre del tipo `feature/revision-copy`. **Nunca
   trabajes ni hagas commit directo sobre `main`.**
3. Aplica los cambios de texto directamente en los ficheros de `src/steps/` y `src/components/`
   que toque, y el ajuste de tamaño de imagen en "Con Shifty".
4. **Esto no es una pasada, es un bucle.** Con los cambios ya aplicados, vuelve a navegar la
   herramienta entera desde cero, como si fueras un encargado que la ve por primera vez, y
   pregúntate otra vez frase por frase si de verdad se entiende. Si algo sigue sin quedar claro
   —aunque ya lo hayas tocado una vez— reescríbelo y vuelve a repasar. Repite este ciclo (aplicar
   → releer como usuario nuevo → corregir) al menos dos o tres veces antes de darlo por terminado.
   El objetivo no es haber pasado una revisión: es poder decir con honestidad que, leyéndolo ahora,
   se entiende mejor que la vez anterior.
5. Antes de terminar, comprueba que no has roto nada: `npx tsc --noEmit` y `npm run build` tienen
   que salir sin errores.
6. Deja todo commiteado en esa rama (commits pequeños y con mensaje claro) y **no hagas merge ni
   push a `main` por tu cuenta**. Crescente lo revisa y decide si se sube.

## Tarea aparte: el crédito a Fernando del Valle Herrera

Fernando del Valle Herrera colaboró en el diseño de esta herramienta y hoy se le menciona solo una
vez, como texto suelto al final de la primera pantalla (el pie de `src/steps/StepImport.tsx`,
justo antes de `</footer>`, con su enlace a LinkedIn). Crescente quiere que aparezca **al final de
cada pantalla**, pequeño, con su foto al lado.

Hazlo en un solo sitio, no en cada paso: las cuatro pantallas (`StepImport`, `StepDemand`,
`StepTeam`, `StepResult`) se renderizan todas dentro del mismo `<main>` en `src/App.tsx`, justo
donde está `{view}` (línea 173). Añade el bloque de crédito ahí, justo después de `{view}` y
dentro del propio `<main>` — así hereda el `pb-24` que ya reserva hueco para la barra fija de
móvil, y no hace falta tocarlo. Después quita el bloque duplicado que hoy vive en el pie de
`StepImport.tsx`, para que en esa pantalla no salga dos veces.

Que sea discreto: una línea pequeña tipo "Hecho con la colaboración de", el nombre con enlace a su
LinkedIn (`https://www.linkedin.com/in/fernando-del-valle-herrera-a0250917/`), y al lado un avatar
circular pequeño (28-32px).

**Sobre la foto: todavía no existe el fichero.** Crescente la va a pegar él mismo más tarde.
Déjalo preparado así, para que no se rompa mientras tanto:

- Referencia la imagen en `public/fernando-del-valle.jpg` (esa ruta exacta, para que cuando él
  suba el fichero con ese nombre funcione sin tocar más código).
- Como ese fichero no existe todavía, el `<img>` tiene que tener un `onError` que oculte la imagen
  y muestre en su lugar un círculo con las iniciales "FV" sobre un fondo suave del design system
  (`bg-brand-light`, texto `text-brand`), del mismo tamaño. **Nunca dejes un icono de imagen rota
  a la vista**: ya pasó una vez en este mismo proyecto con otra imagen (`shifty-turno.webp`) y es
  justo lo que hay que evitar.
