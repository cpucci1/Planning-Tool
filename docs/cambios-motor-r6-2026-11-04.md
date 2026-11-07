# Cambios del motor, ronda 6 (2026-11-04)

Arreglos de `revision-ronda6-calculo.md` y de la parte de cifras de `revision-ronda6-pantallas.md`.
Las cifras de "antes" y "después" salen del banco de los revisores (`node_modules/.tmp/r6/`), con el
mismo contexto que la app, y de los guiones de comprobación. Fecha de "hoy" en las pruebas: 04-11-2026.

## Resumen en cifras

| Caso | Antes | Después |
|---|---|---|
| Playa: fichero con solo sus 23 semanas abiertas, coste al año | 444.306 € (52 semanas pagadas) | 196.520 € (23 semanas, se propone "abro solo esas semanas") |
| Pop up de 6 semanas, coste al año | 538.687 € | 62.156 € |
| Pop up con el resto del año a cero | semana tipo vacía, 4 mandos y un responsable y un jefe de cocina añadidos solos | semana tipo de las 6 semanas abiertas, 21 personas, ningún mando añadido |
| Ventas de marzo (del 3 al 21) | la semana 12, de 5 días, contaba como una semana floja | se quita con aviso; rango 03/03 a 16/03 |
| Menores (ayudante y office) | avisos legales: turnos hasta la 01:30 y días de 9 h | ningún aviso legal; terminan antes de las 22:00; las 19 h de noche de office salen como sin cubrir, explicado |
| Barrido de 2.160 combinaciones de ajustes: descanso semanal por debajo de 36 h | 910 casos | 0 |
| Mismo barrido: tramos de mando más largos que el turno máximo | 5.280 casos | 0 |
| Mismo barrido: desglose de la plantilla en negativo | 156 casos | 0 |
| Margen de seguridad 0 / 10 / 20 %: horas de pico al año | 761 / 819 / 873 (subían) | 761 / 436 / 247 |
| Mismo caso: personas de más en la peor semana | 2 / 9 / 7 | 2 / 2 / 1 |
| Asador de fin de semana: días del jefe de cocina | solo el sábado | viernes 19 a 24, sábado partida, domingo 12:30 a 17:30 |
| Local de 24 h: mandos | los dos de 22 a 06, y aviso falso de preparación perdida | los dos de 14 a 22, sin aviso falso |
| Zona con equipo y sin ningún mando | sin aviso | un aviso por zona |
| Ejemplo de la portada | 19 personas, 587 h, 9.250 € | igual: `ejemploPortada.ts` no cambia |
| Puesto grande (70 personas) | 70 ms | 77 ms, por debajo de 300 |

## Lectura del fichero y semanas

### G1 y G3. Locales de temporada y pop ups

`periodoDelFichero` (`src/lib/demand.ts`) mira las fechas del fichero. Propone "el local abre solo
estas semanas" cuando se cumplen todas: quedan semanas del año fuera del fichero, el fichero cubre
entre 4 y 44 semanas, tiene al menos 4 semanas con datos y dos tercios de su tramo con datos, y
terminó hace más de 28 días. Esta última condición separa una temporada ya cerrada de un export de
los últimos meses, que no se toma por temporada.

- Si se acepta, las semanas de fuera entran como semanas vacías marcadas `relleno: 'fuera'`, y
  `especialesConRellenos` (`src/lib/holidays.ts`) las pone como cierre fuera del cálculo. Así
  `temporadaDelLocal` paga solo las semanas abiertas.
- La pantalla de demanda pregunta con dos botones, "Abro solo esas semanas" y "Abro todo el año"
  (`elegirPeriodo` en `usePlanner`). La elección se guarda si se cambia el mapeo de columnas.
- `usableWeeks`: si quedan menos de 8 semanas, se vuelve a las semanas abiertas con datos, nunca a
  las cerradas. Antes un pop up con el resto del año a cero salía con semana tipo vacía.
- Los huecos dentro del fichero se rellenan como `relleno: 'hueco'`.

### M3 de pantallas. Medias semanas en los bordes

Una semana del principio o del final se quita, con aviso `semana-incompleta`, si le faltan días que
las demás semanas abren y su total está por debajo del 90 % de la mediana. Hacen falta al menos
otras 2 semanas con 4 días o más para saber qué días abre el local: un local que cierra los lunes
no pierde ninguna semana. El rango que se enseña es el del fichero (`periodo.desde` a
`periodo.hasta`), y `semanas` cuenta solo las semanas con datos.

### M4 de pantallas. Festivos que el fichero no trae

`describeMapping` recibe las semanas con datos y solo explica cómo se mueven los festivos que caen
dentro. La lista de semanas especiales esconde las semanas de fuera y pone una línea en su lugar.

## Cuadrante

### G2. Menores

Para los puestos marcados como menores (`ajustesDelPuesto` en `src/lib/roster.ts`): dos libranzas
seguidas, ningún turno ni día de más de 8 h, 48 h de descanso semanal, y nada pasadas las 22:00
(`sinNocheParaMenores`). La necesidad de noche de esos puestos se quita de su rejilla y se cuenta
como sin cubrir, con un aviso que dice cuántas horas son y qué hacer (art. 6 ET).

### M3. 36 h de descanso semanal

Con las libranzas sueltas, ninguna colocación deja a nadie sin 36 h seguidas de descanso
(`semanalOk`, art. 37.1 ET). Se mira al colocar, al vaciar, al poner parciales en fin de semana y al
estabilizar las familias de turnos. `avisos.ts` usa la misma función (`mayorDescansoSemanalMin`) y
las mismas constantes, para que el motor y la revisión no cuenten distinto.

### M2. El asador de fin de semana

`candidatosMando` prueba también tramos recortados (entrar hasta 2 h más tarde o salir hasta 2 h
antes) y partidas, y ningún tramo pasa del turno máximo (m4). Con eso el jefe de cocina puede venir
los tres días que abre el local en vez de concentrar sus horas en el sábado.

### m5 y m6. Local de 24 h

- `preparacionRecortada` no avisa de los días abiertos las 24 h: no hay antes ni después.
- En una zona que no cierra, el peso de cerrar no cuenta, y las franjas de noche pesan 0,6 al
  repartir mandos. Los mandos pasan a la tarde, que es donde hay más gente.

### M6 de pantallas. Zona sin mando

Si una zona tiene equipo y ningún mando, sale un aviso: "En {zona} no has puesto ningún mando:
nadie queda al frente".

## Plantilla y coste

### M1. El margen de seguridad

`analyzePeaks` recibe el margen: una semana solo es pico si supera la capacidad que ya da el margen,
y las horas por comensal se calculan con el margen puesto. Antes el margen subía la plantilla y
además subía las horas de pico, así que contaba dos veces. `personasPico` ya no aplica el colchón
por su cuenta.

### m1 y M5. El desglose de la plantilla

El desglose nunca sale en negativo: lo que va al pico se limita a la plantilla. Si en una zona con
mando el pico lo cubre en parte el propio mando, se cuenta aparte (`picoQueCubreElMando`) y la
pantalla lo explica: "N personas a la vez, una de ellas la hace tu mando mientras está".

### m7. Horas complementarias

Las pactadas y las voluntarias solo cuentan en contratos de 10 h o más a la semana (art. 12.5 ET).

### m3, m5, m6 y m8. Cifras de la pantalla de resultado

- "las N semanas" cuando el local es de temporada.
- Los fines de semana libres se dicen como "de X a Y días".
- Las jornadas con un decimal (12,2, no 13).
- Las dos comparaciones que sonaban a venta ("Contratar de más" y el párrafo de comparación) son
  neutras, y nombran el fijo discontinuo como alternativa.

## Lo que no se ha hecho

- **M4 de cálculo, un horario por zona.** El horario de cocina (`kitchenHours`) se usa en 11
  ficheros, entre ellos el guardado del plan, el enlace para compartir, los CSV y el PDF. Separarlo
  por zona cambia el formato de los planes guardados y toca ficheros del otro frente. Hoy cocina
  puede tener su horario y el resto de zonas usan el del local; la preparación sí va por zona.
- **Suavizar el salto entre tramos t7 y t8.** Con el arreglo del margen ya no se nota en el banco.
- **PDF.** La frase de "2 y 1" fines de semana (`informe-pdf.ts`, línea 906 más o menos) y la frase
  del desglose podrían añadir `picoQueCubreElMando`. No se tocan porque son del otro frente.

## Comprobaciones que fallan si vuelve un fallo

- `npm run comprobar-cuadrante`, sexta ronda: menores de noche, de más de 8 h o sin 48 h; nadie sin
  36 h con libranzas sueltas en los casos del barrido que fallaban; tramos de mando más largos que
  el turno máximo; desglose en negativo; jefe de cocina del asador con menos de 3 días; local de
  24 h con aviso de preparación o con todos los mandos de noche; zona sin mando sin aviso.
- `npm run comprobar-coste`, ronda 6: complementarias con contratos de 6 y 8 h; horas de pico que
  suben con el margen; desglose en negativo.
- `parseFichero.test.ts`, prueba 15: la playa pagada a 52 semanas; el pop up con semana tipo de
  semanas cerradas; un export reciente o un año entero tomado por temporada; la media semana de
  marzo contada; un local que cierra los lunes perdiendo semanas; Semana Santa en un fichero de
  verano.

Verificación final: `npx tsc -b` limpio; `npm run verificar` con el ejemplo igual; `comprobar-cuadrante`
y `comprobar-coste` en regla; `comprobar-demanda` 23 de 23; `parseFichero.test` 167 de 167.
