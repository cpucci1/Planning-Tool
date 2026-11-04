# Cambios del motor, ronda 8 (2026-11-04)

Respuesta a `docs/revision-ronda8.md` en la parte del cálculo y el cuadrante. La lectura del fichero
(parseFichero, mapeo, StepImport y la pantalla de columnas) la lleva otro trabajo a la vez y aquí no
se ha tocado.

## Cifras, antes y después

Medidas con el banco de la revisión (los mismos ficheros generados, por el camino de la app).

| Caso | Antes | Después |
|---|---|---|
| Cafetería | 18 personas, 349,5 h de necesidad, 6.558 €/sem, un ayudante de 10 h que venía un día | 13 personas, 299,5 h, 5.417 €/sem, nadie de un día |
| tpv-prueba.csv | 46 personas, responsable de sala en 31, 30, 21, 20 y 10 h, un cocinero de 10 h solo el sábado | 45 personas, responsable en 40, 40, 40 y 20 h, nadie de un día; 22.319 €/sem (antes 21.907) |
| Horario seguido de 12 a 01 sin mandos | responsable en 40, 35, 21 y 18 h, 42 personas | responsable en 40, 40 y 40 h, 40 personas |
| Bar de tapas | 6.273 €/sem | 6.320 €/sem: el ayudante pedía 6 h a la semana y ahora las hace camarero, con aviso |
| Ejemplo, libranzas de los mandos | encargado martes y miércoles, jefe de cocina jueves y viernes | encargado lunes y martes, jefe de cocina miércoles y jueves |
| Ejemplo, plantilla | 19 personas, 7 de 40 h, 9.200 €/sem y 478.400 €/año | 19 personas, 8 de 40 h, 9.150 €/sem y 475.800 €/año (portada actualizada) |

El resto de casos del banco no cambia. Ninguno tiene fallos en la auditoría de la revisión.

## Lo que se ha hecho

**M1, la merienda.** Los cobros de 17:30 a 20:00 son ahora un servicio propio, la merienda, que dura
35 minutos por defecto y se edita en el paso de equipo junto a comida y cena. Solo aparece si el
local cobra por la tarde. Antes esos cafés contaban como cena de 90 minutos y la cafetería salía
con cinco personas de más. Un plan guardado sin merienda sigue contando la tarde como cena, igual
que antes. `src/lib/demand.ts`, `src/steps/StepTeam.tsx`.

**M2, nadie de equipo viene un solo día.** Tres capas:

- El reparto pasa un día de un compañero que trabaja tres o más a quien se queda con uno solo, sin
  bajar a nadie del contrato mínimo y respetando libranzas, descansos y noches.
- Un puesto que pide menos horas que el contrato más pequeño ya no se contrata: esas horas las hace
  el puesto grande de su misma zona, y la revisión lo dice ("Ayudante pide solo 6 h a la semana...").
- La revisión del cuadrante avisa si aun así alguien viene un día, y lo cuenta entre lo comprobado.

La comprobación (`scripts/comprobar-cuadrante.ts`, octava ronda) mira ahora también los nueve
locales del banco (`scripts/banco-casos.ts`), no solo los suyos.

**M3, los picos.** Si la peor semana no pide más gente a la vez, el bloque ya no dice en grande
"10 personas fijas más". Dice "No te hace falta más gente": son más horas de los mismos, y los
contratos fijos quedan como la opción descartada, con su coste en pequeño ("si lo metieras en
nómina"). Lo mismo en el punto "Contratar de más" y en el PDF. Cuando sí hace falta más gente a la
vez, todo sigue como estaba.

**M4, el responsable partido.** Un puesto de una o dos personas a la vez se reparte ahora en
jornadas largas (una abre, otra cierra) cuando eso ahorra personas sin pasar de un 30 % más de
horas. Y si aun así queda repartido entre más gente de la que hace falta, la revisión lo avisa.

**M5, las libranzas de los mandos.** Se deciden todas juntas: primero que no libren dos de la misma
zona el mismo día, luego que no quede la casa sin mando, y con eso los días más flojos. Antes elegía
primero el de sala y al jefe de cocina le quedaban los que sobraban, viernes incluido.

**m1, el anual.** El coste anual es el semanal redondeado por las semanas: 9.150 × 52 = 475.800.
La portada sigue la misma regla.

**m3, el colchón en el móvil.** Las opciones del margen de seguridad bajan de línea si no caben, en
vez de salirse de su caja. No se ha visto en un navegador a 375 px.

**m6, "Cuando falta alguien".** Si falta el precio de algún puesto, lo dice, como las demás
pantallas.

**m7, una sola banda sana.** 25 a 30 %, la de la pantalla. El comentario de `presets.ts` decía 32.

**Ventas sin IVA.** La pregunta de ventas, la frase del ratio y el PDF dicen "sin IVA".

## Lo que no se ha hecho

- **m4, la noche partida en dos.** La rejilla empieza a las 06:00, así que los cobros de 06:00 a
  07:30 caen en el día siguiente y salen como un servicio de mañana. Arreglarlo es mover el corte
  del día o la detección del horario, que vive en la lectura del fichero. Queda para ese trabajo.
- **copas sin comensales** del banco sigue dando 0 personas: el fichero no se lee (es de la lectura).
- `CLAUDE.md` todavía dice "sano entre 25% y 32%" en la sección 2 decies. No se ha tocado por
  indicación expresa; hay que cambiarlo en `Docs`.

## Comprobaciones

`npx tsc -b`, `npm run verificar`, `npm run comprobar-cuadrante`, `npm run comprobar-coste`,
comprobar-demanda y las pruebas de parseFichero, todas en verde. La octava ronda falla si vuelve
alguien de un día, la revisión deja de avisarlo, la cafetería pasa de 14 personas, el responsable
del horario seguido se parte en más de tres o baja de 20 h, un mando libra uno de los tres días
más fuertes (ejemplo y restaurante grande), o ningún caso avisa de un puesto plegado.
