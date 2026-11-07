# Ronda 7: lectura del fichero, exportaciones y textos (04-11-2026)

Rama `feature/planificador-r7-lectura`, sin commit. Responde a `docs/revision-ronda7-pantallas.md` y a la parte de lectura de `docs/revision-ronda7-calculo.md`.

## Arreglado

**G1. Un fichero de 12 meses que cruza el año perdía noviembre y diciembre.**
Antes se quedaba con el año natural que más filas tenía y tiraba el resto. Ahora:
- si el fichero cabe en 52 semanas, se usa entero;
- si es más largo, se usan las últimas 52 semanas;
- en los dos casos se ofrecen además los años naturales que tengan al menos 4 semanas.

La pantalla de demanda dice qué periodo se usa, con fechas, y deja cambiarlo con un botón. Si se eligen menos semanas de las que trae el fichero, el aviso dice cuántas filas quedan fuera y de qué fechas. La elección se guarda con el plan.
`src/lib/parseFichero.ts` (`periodosDelFichero`), `src/hooks/usePlanner.ts` (`elegirPeriodoDelFichero`), `src/steps/StepDemand.tsx`.

**M3. Un hueco en los datos se trataba siempre como cierre.**
- Un hueco de menos de 7 semanas sigue siendo cierre, sin preguntar.
- Si es de 7 semanas o más, se pregunta "¿Faltan datos o estuvo cerrado?", con una propuesta:
  - propone cierre si cae entero en verano (semanas 26 a 37) o si a uno de sus lados se vende claramente menos;
  - si no, propone "faltan datos", que es lo que pasa en un cambio de TPV.

La respuesta cambia el cálculo al momento: con "faltan datos" esas semanas no cuentan como cerradas y el local no pasa a ser de temporada por error.
`aplicarHueco` en `parseFichero.ts`, `elegirHueco` en `usePlanner.ts`.

**M1. Falso aviso de orden de fecha dudoso.**
El orden día/mes y la columna de fecha se deciden con una muestra repartida por todo el fichero, de hasta 20.000 filas. Antes solo se miraban las primeras.

**M2. Exportaciones.**
- "Exportar todo (CSV)" incluye ahora el cuadrante de la semana tipo.
- En "Llévatelo" hay dos botones nuevos:
  - "PDF para colgar": el mismo PDF de cocina que en El cuadrante, con la fecha del próximo lunes.
  - "Cuadrante (CSV)".

El CSV del cuadrante y las franjas sin cubrir salen de un solo sitio, `src/lib/export.ts`, que comparten RosterGrid y StepResult.

**M4. Falta "Responsable de sala" en la tabla de personas.**
Debajo de la tabla, una línea explica qué puesto no sale aparte, quién lo cubre mientras está y quién queda al frente cuando libra. `src/components/StaffTable.tsx`.

**Menores:**
- Nombres largos en el PDF: pasan a dos líneas en lugar de cortarse (`src/lib/informe-pdf.ts`).
- Miles con punto en pantalla ("5.594 h"). Los CSV siguen sin punto para que Excel los lea bien.
- Etiqueta "Pico de tu equipo, sin mandos": solo sale cuando de verdad hay mandos y ninguno cubre.
- Jornadas con coma decimal.
- Contratos en texto: "1 de 40 h y 1 parcial".
- El ejemplo tarda 1,5 s en lugar de varios, y el texto de carga dice el rango de fechas leído.
- Tramo de edad del ejemplo de portada: de "25-34" a "25-39".

## Pruebas nuevas

Bloque 16 de `src/lib/parseFichero.test.ts`, que falla si vuelve cualquiera de estos fallos:
- 12 meses cruzando el año: sin descartes y con 52 semanas pagadas;
- elegir solo 2026: avisa de noviembre y diciembre;
- dos años: se usan las últimas 52 semanas;
- año natural: sin selector;
- hueco de 13 semanas: pregunta y propone "faltan datos"; al marcarlo como cerrado pasa de 52 a 39 semanas, y vuelve a 52;
- hueco de verano: propone cierre;
- hueco de 3 semanas: cierre sin preguntar;
- fichero denso que empieza en día 1: sin aviso de fecha dudosa.

## Verificación

Todo pasa:
- `npx tsc -b`;
- `npm run verificar`, `npm run comprobar-cuadrante` y `npm run comprobar-coste`;
- `comprobar-demanda`: 23 pasadas;
- prueba de lectura: 198 pasadas;
- `npx vite build`.

Probado en el navegador:
- fichero de 12 meses (04-11-2025 a 01-11-2026);
- fichero con hueco de primavera;
- el ejemplo.

## Sin arreglar

- "unas 1 jornadas", el total 9.232 frente a 9.231 y los avisos (m8): son cifras y avisos del cálculo, zona del otro agente.
- G1, G2, M1, M2 y M4 de cálculo: zona del otro agente.
- Al recuperar un plan guardado, el selector de periodo no aparece hasta que se recalcula. La elección sí se conserva.
- El informe PDF sigue diciendo "semanas de {año}" aunque el periodo cruce el año.

## Posibles choques con el otro agente

- `src/lib/demand.ts`: un cambio pequeño en `conPeriodoAbierto` para periodos que cruzan el año.
- `src/steps/StepResult.tsx`: imports, botones de "Llévatelo" y formato de miles. No toqué ninguna cifra.
- `src/lib/informe-pdf.ts`: el nombre en dos líneas en la tabla del cuadrante.
- `src/components/RosterGrid.tsx`: el CSV y los huecos pasan a `export.ts`.
- Tipos del dataset: `source.huecos`, y `periodos` y `periodoUsado` en el resultado de la lectura.
