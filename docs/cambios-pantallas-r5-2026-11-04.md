# Cambios de pantallas, ronda 5 (4 de noviembre de 2026)

Sale de `revision-ronda5-pantallas.md` y `revision-ronda5-calculo.md`. Esta ronda toca textos,
pantallas y el CSV; el cálculo y sus cifras los lleva otro agente a la vez y aquí no se han tocado
(horas pagadas sin servicio, personas de la peor semana, "Lo que tendrías que contratar", mandos,
temporada, desayunos). Sin commit.

## Para Crescente, en corto

- **Los nombres de la plantilla se guardan en nuestro servidor y ahora se dice.** Detalle abajo.
- **La captura de "Con Shifty" llevaba tres fotos y nombres de la pantalla real del panel.** Está
  sustituida por la misma pantalla con avatares genéricos, "Profesional 1, 2, 3" y "turnos" y
  "profesionales" en vez de "Shifts" y "Shifters".
- **El CSV ya no enseña euros con los costes apagados** y se abre bien en un Excel en castellano.
- **Las cifras de Shifty (9 min, 81 %, 4,89, junio a agosto) siguen igual**, a la espera de tu
  decisión.

## Los nombres de los empleados: qué se guarda, quién lo ve y cuándo se borra

Lo he leído en `src/lib/backend.ts` (líneas 197 a 280) y en `backend/sql/20-funciones.sql`.

- **Qué se guarda.** El nombre que el usuario escribe encima de "Camarero 1" en el cuadrante, tal
  cual, dentro del plan (el campo de nombres por persona). Nada más de esa persona: ni apellidos
  aparte, ni teléfono, ni turnos con su nombre fuera del plan.
- **Cuándo se sube.** Al entrar en "Tu plan" (cada vez que se entra), al volver a intentar un
  guardado fallido y, desde hoy, también al entrar con el correo. Lo que se escribe después de
  llegar a "Tu plan" no se sube hasta la siguiente vez que se entra; en el navegador sí se queda.
- **Quién lo puede leer.** Nadie lee las tablas directamente: ni anónimos ni usuarios con cuenta
  tienen permiso sobre ellas. Se lee solo por la función de leer un plan, y esa función se la da a
  **cualquiera que tenga el enlace corto** del plan (`?plan=...`), con cuenta o sin ella. El enlace
  largo (el plan dentro de la dirección) también lleva los nombres, pero ese no pasa por el servidor.
  Y nosotros, como dueños de la base `freetools`, claro.
- **Borrado.** Un plan sin dueño que nadie toca en 180 días se borra solo, cada noche (tarea
  programada). Un plan con dueño (alguien que entró con su correo) **no se borra nunca solo**. Existe
  la función para borrar un plan, pero **ninguna pantalla la llama**: hoy el usuario no puede borrar
  su plan ni sus nombres desde la herramienta. "Empezar de nuevo" limpia el navegador, no el
  servidor.

Qué he cambiado (sin cambiar qué se guarda):

- En el cuadrante, debajo de "Ponle los nombres de tu gente": que es opcional, que puede dejar
  "Camarero 1" o poner solo un nombre de pila, y que los nombres se guardan con el plan y los ve
  quien tenga su enlace (o, sin servidor, que se quedan en el navegador y en el enlace largo).
  `src/steps/StepResult.tsx`, tarjeta de nombres.
- En la invitación a crear cuenta: lo mismo en una línea. Y el "ya es tuyo, con los nombres que le
  hayas puesto" era falso si se habían puesto después de llegar a "Tu plan"; ahora al entrar con el
  correo se vuelve a guardar el plan, así que es cierto. `src/components/CuentaModal.tsx`,
  `src/hooks/usePlanner.ts` (reclamar el plan).
- En la portada, "Tu fichero no se sube": añade que se guardan los nombres que pongas en el
  cuadrante. En "Llévatelo": que lo guardado lleva los nombres.

Lo que queda para que decidas (regla 17): **un botón para borrar el plan** desde "Llévatelo" (la
función ya existe y está protegida), y si los planes con dueño deben borrarse también tras un
tiempo sin uso. Sin eso, a la pregunta "qué pasa cuando la persona se da de baja" la respuesta hoy
es "nada".

## La captura de "Con Shifty"

- **De dónde sale.** `public/shifty-turno.webp`, subida por ti el 18-09-2026 (commit "La pantalla
  de picos: lenguaje claro..."). Es una captura del panel de empresas real: "Próximos Shifts",
  "Detalle del Shift", "3/4 Shifters" y tres personas confirmadas con foto, nombre e inicial
  (Andrea C., Lucia V., Tommaso C.) con su nota. **No he podido comprobar si son trabajadores
  reales**; las fotos parecen de personas de verdad, así que la he tratado como si lo fueran.
- **Qué he hecho.** La misma imagen, mismo tamaño, editada: las tres fotos pasan a un avatar
  genérico morado, los nombres a "Profesional 1, 2, 3" (las notas y horas se quedan), y "Shifts" y
  "Shifters" a "turnos" y "profesionales", que es lo que usa la marca (`Docs/docs/brand/voice-and-tone.md`
  habla siempre de turnos y profesionales; "Shifter" no aparece en ningún documento de marca). El
  pie dice ahora "Imagen de ejemplo, con los nombres y las fotos ocultos". La original sigue en el
  historial de git. La referencia lleva `?v=2` para que nadie vea la vieja desde la caché.
- **Lo que no he tocado.** La imagen sigue diciendo "Madrid" bajo "Tu restaurante" (regla de no
  nombrar ciudades). Si quieres, se cambia igual.

## CSV completo (`src/lib/export.ts`)

- **Sin costes, sin euros.** Con "calcular costes" apagado, la tabla por puesto ya no lleva las
  columnas de sueldo ni de coste. Mismo corte que la pantalla.
- **Decimales con coma y sin punto de millar** en todas las celdas numéricas y en textos como
  "37,5 h". Probado: "11,5", "37,5 h", "3582". Separador de columnas punto y coma y BOM, como ya
  estaba.

## Lo demás que se ha arreglado

| Hallazgo | Qué se ha hecho | Dónde |
|---|---|---|
| M2, el catálogo promete un mando siempre | "uno al frente de su zona mientras su jornada lo permita, y los huecos te los marcamos en la revisión" | `RoleCatalog.tsx` |
| M5, provincias | No he tocado la lista. Añadida "Otra provincia" (no consulta al modelo) y una frase que dice qué ha pasado: cuántas semanas tienen propuesta, que ya tienen nombre, o que no tenemos fiestas de esa provincia en esas semanas | `StepDemand.tsx` |
| M7, horas complementarias | "Pactadas en tu convenio" pasa a "Pactadas con tus parciales"; el globo explica que el pacto se firma con cada persona y el convenio solo sube el tope; y una línea dice que de partida contamos el 30 % como si estuviera firmado, y que si no, se elija "No pacto". El 30 % de partida se queda | `StepResult.tsx` |
| M8, Equipo | "comensales sentados" para la gente en mesa; "Pico de tu equipo, sin mandos" para la plantilla; si el pico se alcanza en dos momentos se dicen los dos ("a las 14:00 y a las 21:00"); la nota del pico dice "más tus mandos" | `StepTeam.tsx` |
| m2 y m3, Tu año | Punto de millar también en cuatro cifras (2.198); la frase dice "más un N % de colchón" si hay margen | `YearChart.tsx` |
| m4, una sola voz | "lo he deducido", "He encontrado", "Dime", "Ahora dime tu equipo" pasan a plural | `StepDemand.tsx`, `RoleCatalog.tsx` |
| m5, semana 1 | Se llama "Nochevieja y Reyes"; "Cuesta de enero" pasa a las semanas 2 y 3. Antes Nochevieja apuntaba a la semana 53, que casi nunca existe. Mismas semanas marcadas: el cálculo no cambia | `lib/holidays.ts` |
| m6, contratos a medida | El texto nombra la lista: "40h, 30h, 20h o 15h" | `StepTeam.tsx` |
| m7, criterio de cobertura | "Tu plan, Por qué: la línea del gráfico del año. También en Demanda, Tu año" | `StepResult.tsx` |
| m8, "Tu fichero de ventas" | Con el ejemplo no se habla de fichero; con fichero dice "Tu fichero" a secas | `StepResult.tsx` |
| m9, "L" de libra | Pone "Libra" entero | `RosterGrid.tsx` (solo esa pastilla) |
| m10, media del catálogo | Quitada; queda "Con precio: N de M" | `RoleCatalog.tsx` |
| m11, menores de 18 | Globo de ayuda visible en móvil, fuera de la casilla para que pulsarlo no la marque | `RoleCatalog.tsx` |
| m12, "En dos minutos" | "En unos minutos" | `StepImport.tsx` |
| m13, puntos morados | Leyenda bajo el gráfico: "Semana rara (festivo, cierre o pico)" | `YearChart.tsx` |
| m14, tramos a 375 px | Aviso "Desliza la tabla..." solo en móvil y solo si queda tabla; el botón dice "Valores de ejemplo" | `TiersTable.tsx` |
| m15, barra de abajo en Equipo | Dos líneas: "16 a la vez en el pico" y "489 h a la semana · 21 personas en plantilla"; fuera el "toca..." | `StepTeam.tsx` |
| m16, semana tipo | Arranca desplazada a una hora antes de la primera franja con actividad; sin recuadro de foco al cargar; en móvil "Toca una franja para corregirla" | `WeekHeatmap.tsx` |
| Cálculo m6, local más grande que la tabla | El mismo aviso de Equipo sale ahora en "La revisión" del cuadrante. En el PDF no (es del otro agente) | `StepResult.tsx` |

## Lo que no se ha hecho, y por qué

- **G1, G2, M1, M3, M4, m1 de pantallas y todo el informe de cálculo salvo M3, M4 y m6**: son del
  otro agente (cifras y cálculo).
- **M10, cifras de Shifty**: pendientes de Crescente, por encargo.
- **M5, catálogo de provincias completo y que salga de la base**: no se reescribe la lista. Anotado:
  Canarias son dos provincias, faltan Asturias, Cádiz y el resto, y la regla de territorio pide que
  salga de datos. Hoy, elegir provincia solo sirve para proponer el nombre de una fiesta en las
  semanas raras sin nombre; ahora la pantalla lo dice.
- **m2, por qué 2.198 y 2.193 difieren**: la línea es una semana del histórico y la semana tipo se
  compone franja a franja; explicarlo bien toca el cálculo. Solo se ha igualado el formato.
- **El PDF dice "pueden hacer tus parciales con horas complementarias"** sin decir "si las tienes
  pactadas" (`informe-pdf.ts:510`). Es del otro agente; conviene añadirlo cuando se junte.
- **m16, la cabecera "06:00" cortada**: con la rejilla desplazada a la primera franja ya no se ve al
  cargar; no he cambiado la cabecera.

## Verificación

- `npx tsc -b` a cero; `npm run verificar`, `comprobar-cuadrante` y `comprobar-coste` en regla;
  demanda 20 de 20; lectura 153 de 153; `npx vite build` bien.
- Recorrido en el navegador a 1280 y 375 px con el ejemplo y con `tpv-prueba.csv`: sin errores de
  consola y sin desplazamiento lateral de la página en ningún sub paso de "Tu plan", Equipo y
  Demanda. Visto en pantalla: la frase de provincia (Madrid y "Otra provincia"), el pico con dos
  horas, "Libra", el texto de nombres, el de complementarias, la captura nueva, el aviso de la tabla
  de tramos, la barra de abajo en móvil y la semana tipo desplazada sin recuadro de foco. El CSV,
  probado con costes encendidos (en pantalla) y apagados (con un guion).
- **No verificado**: el guardado en servidor y el modal de cuenta (no hay variables del backend en
  local), y la captura editada a tamaño grande en la pantalla real, más allá de la imagen.

## Posibles choques con el otro agente

- `StepResult.tsx`: he tocado la tarjeta de nombres, la de complementarias (texto y etiqueta), la
  figura de la captura, "Llévatelo", el criterio de cobertura, el aviso de tramo superado en "La
  revisión" y dos imports. No he tocado ninguna cifra.
- `RosterGrid.tsx`: solo la pastilla de "Libra" (función `DayOff`).
- `lib/holidays.ts`: solo los nombres de las semanas 1 a 3.
- `lib/export.ts`: el formato y el corte de costes; las líneas de horas pagadas sin servicio siguen
  igual.
- `usePlanner.ts`: solo que al entrar con el correo se vuelve a guardar el plan.
