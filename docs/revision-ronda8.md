# Revisión ronda 8 del planificador (04-11-2026)

Mirada de directora de operaciones de hostelería: qué no firmaría, qué no cuadra y qué se queda sin salida.

**Hay dos hallazgos graves.** Los dos están en la entrada del fichero del TPV y son de formatos muy corrientes. Uno deja el fichero sin poder entrar. El otro casi duplica la plantilla sin avisar de forma útil.

| Gravedad | Cuántos |
|---|---|
| Grave | 2 |
| Medio | 5 |
| Menor | 7 |

## Cómo se ha comprobado

- `npm run verificar`, comprobar-cuadrante y comprobar-coste pasan en verde. El ejemplo da 19 personas, 84 turnos, 9.200 € a la semana y 478.400 € al año.
- Banco propio con esbuild en `node_modules/.tmp/r8/`, con ocho casos:
  - menú del día de 10 mesas;
  - bar de tapas de 6;
  - restaurante de 25;
  - cafetería;
  - hotel;
  - fichero con devoluciones;
  - cobros a las 4 de la madrugada;
  - días a cero.

  Los ocho cumplen las 9 h al día, las 12 h de descanso y el descanso semanal de 36 h, y sus sumas cuadran.
- Recorrido de las pantallas a 1280 y a 375 px con el ejemplo y con `tpv-prueba.csv`.
  - La consola no da errores.
  - El ancho de página se queda en 375 en todos los pasos.
  - Se exportaron el CSV y los PDF y se miraron renderizados.
- Se cruzaron las cifras del ejemplo entre pantalla, CSV y PDF, y coinciden todas:
  - 585 h;
  - 5.594 h de ausencias;
  - 57.230 €;
  - 96,5 h pagadas sin servicio;
  - picos de 761 h, de las que 486 son complementarias y 275 son de refuerzo;
  - 152.931 € y 13.857 €;
  - 75,5 h complementarias.
- Lo que está bien:
  - el precio es 18,81 €/h;
  - se habla de "la ETT colaboradora", nunca de que Shifty sea una ETT;
  - no hay guiones largos visibles;
  - las fechas americanas mm/dd se detectan;
  - los PDF no tienen cortes: el resumen ocupa 1 página, el informe completo 6 o 7 y el cuadrante de pared 1 o 2.

## Graves

### G1. Un fichero con solo fecha, hora e importe no puede entrar

- **Entrada.** Un CSV con las columnas `Fecha;Hora;Importe`, una fila por ticket, sin número de ticket ni comensales. Es el formato más simple que saca un TPV.
- **Qué sale.** "No ha entrado ni una fila", con el motivo "los comensales no eran un número" y el consejo "comprueba que es el histórico de ventas, con una fila por ticket". Pero el fichero ya es eso. No aparece la pantalla de columnas, así que no hay nada que tocar: es un callejón sin salida.
- **Qué debería salir.** Contar cada fila como un ticket, o al menos abrir la pantalla de columnas para que el usuario diga qué es cada una.
- **Dónde.** `src/lib/parseFichero.ts:1743-1751` descarta la fila. `src/lib/mapeo.ts:47-51` exige comensales o tickets. El mensaje está en `src/steps/StepImport.tsx:316`.

### G2. Un fichero con una línea por producto cuenta cada línea como un ticket

- **Entrada.** El mismo ticket repetido en varias líneas, una por producto, con su código de ticket. Es el detalle de ventas de muchos TPV.
- **Qué sale.** Con el mismo negocio:

  | | Lo que debería ser | Lo que sale |
  |---|---|---|
  | Comensales a la semana | 609 | 1.828 |
  | Personas | 11 | 19 |
  | Horas | 188 | 382,5 |

  Sale un aviso que dice que se marque la columna como "No la uses y dinos cuál cuenta". Si se hace, "Siguiente" se bloquea con "Marca una columna como comensales o como tickets". El consejo lleva a otra pared.
- **Qué debería salir.** Contar códigos de ticket distintos y no líneas. Y si se avisa, que la salida que se propone funcione.
- **Dónde.** `src/lib/parseFichero.ts:1620-1650` (la detección y el aviso) y `src/lib/parseFichero.ts:1728-1737` (una línea es un ticket).

## Medios

### M1. En una cafetería, el café de la tarde se trata como una comida o una cena

- **Entrada.** Una cafetería con mucho movimiento de 16 a 19 h.
- **Qué sale.**
  - Los cobros de 12:30 a 18:00 se tratan como comida, con 75 min sentados.
  - Desde las 18:00 se tratan como cena, con 90 min.
  - Con unos 17 cobros por media hora, salen 53 personas sentadas a la vez a las 17:30. Eso pide 3 camareros y 2 cocineros.
  - En total salen 18 personas en lugar de 14 (que es lo que sale con una estancia de 30 min), y un ratio de coste del 70 %.
  - En el paso de equipo solo se pueden cambiar las duraciones de comida y cena. No hay hueco para una merienda o un servicio de tarde.
  - Al bar de tapas le pasa lo mismo: recibe las estancias de un restaurante.
- **Qué debería salir.** Un servicio de tarde con su propia duración, o que la estancia dependa del tipo de local.
- **Dónde.** `src/lib/demand.ts:372` y `src/lib/demand.ts:417-430` (los cortes de hora). `src/steps/StepTeam.tsx:762-790` (solo se ofrecen comida y cena).

### M2. Vuelve gente que va un solo día con un contrato de 10 h

- **Entrada.** `tpv-prueba.csv` y la cafetería del banco.
- **Qué sale.**
  - En `tpv-prueba.csv`, el Cocinero 13 tiene un contrato de 10 h y solo trabaja el sábado, 8 h.
  - En la cafetería, el Ayudante 1 tiene un contrato de 10 h y va un día, 4 h. Su puesto solo necesita 1,5 h a la semana.
  - En la cafetería, el Responsable de sala 5 tiene un contrato de 10 h con 8 h asignadas, el sábado y el domingo.
  - La revisión del cuadrante lo da por bueno, como "contratos aprovechados".
  - Nadie firma un contrato para venir un día a la semana a un puesto que casi no hace falta.
- **Qué debería salir.** Repartir esas horas entre quien ya está, o avisar con claridad de que ese contrato sobra.
- **Por qué es una regresión.** La ronda 2 dio por arreglado lo de "un solo día", pero `scripts/comprobar-cuadrante.ts:184` solo lo comprueba con sus casos de prueba. Con ficheros reales vuelve.
- **Dónde.** `src/lib/avisos.ts:324` y `src/lib/avisos.ts:746`. El aviso solo salta si las horas asignadas bajan del umbral de ocupación, y 8 de 10 no baja.

### M3. La pantalla de picos se contradice

- **Entrada.** `tpv-prueba.csv`, pantalla de resultado, bloque de picos.
- **Qué sale.** En el mismo bloque se leen dos cosas a la vez:
  - "sin más gente a la vez que una semana normal: son más horas, no más gente";
  - "10 personas fijas más", con 316.283 € al año.

  Un director lee las dos y no sabe cuál creerse.
- **Qué debería salir.** Una sola lectura. Si el pico se cubre con más horas de los mismos, que la alternativa de personas fijas se presente como opción descartada, no como cifra principal.
- **Dónde.** `src/steps/StepResult.tsx:270-290`, `src/steps/StepResult.tsx:1673` y `src/steps/StepResult.tsx:1976`. La misma frase está en el PDF, en `src/lib/informe-pdf.ts:523`.

### M4. Sin mandos, el responsable de sala se parte en cinco medias jornadas

- **Entrada.** Un restaurante sin mandos definidos.
- **Qué sale.** Cinco responsables de sala con 31, 30, 21, 20 y 10 h. El de 10 h va dos noches. Un responsable de sala es quien abre, cierra y manda en el servicio: no se reparte entre cinco.
- **Qué debería salir.** Dos responsables a jornada completa que cubran la apertura, o al menos un aviso de que ese puesto queda partido.
- **Dónde.** `src/data/presets.ts:61`. El puesto no está marcado como solo jornada completa, y los tramos lo tratan como uno más.

### M5. El jefe de cocina del ejemplo libra jueves y viernes

- **Entrada.** El ejemplo.
- **Qué sale.** El jefe de cocina libra el jueves y el viernes. El viernes es el tercer día con más comensales (304) y la segunda noche más fuerte.
- **Por qué pasa.** La penalización por dejar "la casa sola" (60) pesa mucho más que la fuerza del día (como mucho 10).
- **Qué debería salir.** Que el mando libre en sus días flojos.
- **Dónde.** `src/lib/roster.ts:2718-2722`. Está emparentado con el punto 11 ya conocido de la revisión del flujo, pero aquí sale en el propio ejemplo que ve todo el mundo.

## Menores

### m1. El coste semanal por 52 no da el anual

- **Qué sale.** "9.200 € a la semana y 478.421 € al año". Pero 9.200 por 52 son 478.400. La diferencia es pequeña, pero es la primera cuenta que hace quien lee, y sale igual en la pantalla, el CSV y el PDF.
- **Dónde.** `src/lib/export.ts:262` y el texto en `src/lib/informe-pdf.ts:572`.

### m2. Las devoluciones se descartan con un motivo falso

- **Qué sale.** Una fila con comensales negativos se descarta con el motivo "Los comensales no eran un número", que no es verdad. Además, la venta original se sigue contando.
- **Dónde.** `src/lib/parseFichero.ts:366` y `src/lib/parseFichero.ts:1720-1724`.

### m3. A 375 px se cortan las opciones del colchón

- **Qué sale.** La fila de opciones de margen de seguridad, de "Sin colchón" a "+20%", mide 396 px. Se sale de su caja, obliga a deslizar de lado y corta opciones.
- **Dónde.** `src/steps/StepDemand.tsx:776`.

### m4. Un local de madrugada parte la noche en dos

- **Entrada.** Un fichero de 18:00 a 07:30.
- **Qué sale.** El final de cada noche aparece como un servicio de mañana del día siguiente ("Vi 06:00-07:00").

### m5. El ratio de coste se calcula sobre el importe con IVA

- **Qué sale.** El ratio usa por defecto el importe con IVA, y el usuario tiene que dividir a mano para compararlo con su cuenta de resultados.
- **Dónde.** `src/steps/StepResult.tsx:1149`.

### m6. "Cuando falta alguien" no avisa de que faltan precios

- **Qué sale.** Si falta el precio de algún puesto (Office, por ejemplo), ese bloque valora todo a la media de los puestos con precio y no lo dice. Otras pantallas sí avisan de que la cifra se queda corta.

### m7. Dos bandas de ratio sano distintas

- **Qué sale.** El comentario de `src/data/presets.ts:317` habla de un 25 a 32 %, y la pantalla dice 25 a 30 % (`src/steps/StepResult.tsx:110-111`). Es interno, pero el próximo que lo toque no sabrá cuál vale.

## Lo que no se repite de rondas anteriores

- Las partidas en todas partes (punto 10 de la revisión del flujo) y la persona clave libre en días fuertes (punto 11) ya estaban apuntadas. M5 es un caso más del 11, visible en el ejemplo.
- M2 es una regresión de lo que la ronda 2 dio por arreglado.
- M3 nace de la frase que se añadió en la ronda 7.
