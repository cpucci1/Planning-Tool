# Revisión del cálculo, ronda 5 (4 de noviembre de 2026)

Revisor: mirada de director de operaciones de hostelería, con el Estatuto en la mano. Solo lectura de
`src/` y `scripts/`.

**Resumen.** Hay 2 graves, 8 medios y 6 menores. Los dos graves no son de código roto, son de oficio:
un local de temporada sale con el coste de un año entero abierto, y una cafetería de desayunos se
dimensiona como si cada cliente comiera 75 minutos. Lo demás se lee bien: no he encontrado jornadas de
más de 9 h, ni descansos de menos de 12 h con el ajuste encendido, ni franjas sin cubrir, ni mandos
duplicados.

**Cómo se ha comprobado.** `npm run verificar` (demo: 21 personas, 488,5 h necesarias, 568,5 h en
turnos, 581 h contratadas). Y un banco propio en `node_modules/.tmp/r5/` (`banco.ts` y casos `c1` a
`c8`) que pasa la cadena real tal y como la monta `usePlanner` (con el contexto del cuadrante:
horario por zona y comensales por día), con curvas sintéticas para: bistró pequeño, solo comidas,
solo cenas, abierto de 8 a 2 los siete días, cierra lunes y martes, cafetería de desayunos, bar de
copas, playa de temporada, grupo grande y datos raros (abre a las 06:00, sin libranzas seguidas, sin
partida). Para rehacerlo:
`npx esbuild node_modules/.tmp/r5/c2.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=node_modules/.tmp/r5/c2.mjs && node node_modules/.tmp/r5/c2.mjs playa`.

Lo que ya consta como pendiente en `docs/revision-flujo-2026-11-04.md` (punto 12, rueda de cuatro
semanas; 21, perfil de convenio; 27, disponibilidad por persona) no se repite. Dos hallazgos de abajo
tocan puntos que allí constan como hechos (6 y 9) y se dice en cada uno.

---

## Graves

### G1. Un local de temporada sale con el coste de 52 semanas abierto

- **Entrada.** Chiringuito de playa: cerrado de la semana 1 a la 17 y de la 41 a la 52, flojo de la
  18 a la 22 y de la 38 a la 40, lleno de la 23 a la 37. Comida y cena. Un encargado. Costes de
  ejemplo. Las 29 semanas cerradas se excluyen solas (`detectSpecialWeeks`, "Cierre o vacaciones").
- **Qué sale.** 20 personas, 8.699 €/semana y **452.338 € al año**. La cobertura dice 18 de 23
  semanas. No sale ninguna propuesta de fijo discontinuo: `temporadaAlta` da nulo porque las semanas
  punta (28, 29, 30, 32 y 34) no son seguidas.
- **Qué debería salir.** El local paga 23 semanas, no 52: unos **200.000 €**, menos de la mitad. Y
  la plantilla entera es de temporada: lo que corresponde es fijo discontinuo (art. 16 ET) para toda
  ella, no solo para lo que queda por encima de la línea. Ningún hostelero de costa firma un
  presupuesto que le dice que su personal le cuesta 450.000 € al año. Relacionado con el punto 6 de
  la revisión de flujo, que consta como hecho: allí el fijo discontinuo solo mira las semanas punta,
  y aquí el problema es la plantilla base.
- **Dónde.** `src/lib/contracts.ts:319` a `323` (comentario "un año de nómina son 52 semanas,
  siempre") y `src/lib/contracts.ts:471`; `src/steps/StepResult.tsx:331` (temporada solo sobre los
  picos); `src/lib/ausencias.ts:211`.

### G2. Los desayunos se cuentan como comidas de 75 minutos

- **Entrada.** Cafetería de lunes a sábado de 07:30 a 13:00, pico a las 08:30 y otro a las 11:00.
  Ajustes de partida.
- **Qué sale.** Todo cobro antes de las 18:00 cuenta 75 minutos sentado. Pico de 59 sentados a la
  vez, **12 personas y 265 h contratadas**.
- **Qué debería salir.** Un café con tostada dura 20 o 25 minutos. Con 25 minutos salen 27 sentados,
  **9 personas y 181 h**: la herramienta le pone a la cafetería un 46 % más de horas. Y un local que
  da desayunos y comidas no tiene forma de decirlo: hay una sola duración para todo lo que pasa antes
  de las 18:00. Hace falta al menos un tercer servicio (desayuno o barra) con su duración, o que la
  duración vaya por tramo del horario.
- **Dónde.** `src/lib/demand.ts:272` (`MEAL_CUT_MIN`, solo mediodía y noche) y `src/lib/demand.ts:312`.

---

## Medios

### M1. El encargado y el jefe de cocina libran los mismos días

- **Entrada.** Los datos de ejemplo, con su encargado y su jefe de cocina, tal y como los monta la
  app.
- **Qué sale.** Los dos libran martes y miércoles. Esos dos días el restaurante no tiene ningún
  mando: la sala la llevan dos responsables de 10 h y la cocina un cocinero. En el abierto de 8 a 2
  pasa igual: el jefe de cocina y el encargado de tarde libran los dos miércoles y jueves.
- **Qué debería salir.** Libranzas cruzadas entre zonas, para que todos los días haya alguien con
  mando en la casa. Las libranzas se eligen zona a zona sin mirar a la otra.
- **Dónde.** `src/lib/roster.ts:1945` (`repartirMandos` por zona) y `src/lib/roster.ts:2239`
  (`libranEseDia` empieza vacío en cada zona).

### M2. El motor monta jornadas que su propia revisión marca como ilegales

- **Entrada.** El chiringuito de G1 con todas las semanas.
- **Qué sale.** "Office 1": lunes, martes, miércoles y domingo de 13:00 a 16:00 y de 19:00 a 01:00,
  9 h al día. La revisión dice, con gravedad legal: "trabaja de noche casi todos sus días y hace 9 h
  de media: la ley le pone un máximo de 8 h". Igual "Office 2" y, en el grupo grande, "Office 3".
- **Qué debería salir.** Si el cuadrante ya sabe que es nocturno (3 h o más de noche, art. 36.1 ET),
  tiene que aplicarle el tope de 8 h de media al montar, no avisar después de un cuadrante que él
  mismo ha hecho. Hoy el tope diario es el mismo para todos.
- **Dónde.** `src/lib/roster.ts:71` (tope único) y `src/lib/avisos.ts:469`.

### M3. El CSV enseña euros con los costes apagados

- **Entrada.** Precios puestos en el catálogo y después "calcular costes" apagado.
- **Qué sale.** "Exportar todo (CSV)" trae la columna de sueldo por hora y la de coste de empresa
  por puesto (Camarero: 11.5 y 3.582 €), y dos bloques más abajo dice "Sin costes: rellena el coste
  por hora en el catálogo de puestos". La pantalla, en cambio, no enseña ni un euro.
- **Qué debería salir.** El mismo corte que la pantalla: sin costes, el CSV no lleva columnas de
  dinero.
- **Dónde.** `src/lib/export.ts:81` y `82` (miran el precio del puesto, no si `cost` es nulo).

### M4. El CSV completo lleva los decimales con punto, para un Excel español

- **Entrada.** Cualquier plan con medias horas o precios con céntimos.
- **Qué sale.** "Horas asignadas" 37.5, "Sueldo bruto/hora" 11.5, "Coste por hora" con dos
  decimales y punto. En un Excel en castellano, que es el que espera el separador de punto y coma,
  11.5 se convierte en fecha (11 de mayo) y 37.5 queda como texto o se lee como 375.
- **Qué debería salir.** Coma decimal, como ya hace el CSV del cuadrante (`fmtNum` en
  `RosterGrid.tsx:88`). Hoy los dos CSV de la misma herramienta escriben los números distinto.
- **Dónde.** `src/lib/export.ts:81`, `96`, `113` y `114`.

### M5. Un local que abre a las 06:00 se queda sin preparación

- **Entrada.** Bar de polígono, lunes a viernes de 06:00 a 16:00.
- **Qué sale.** Todos, cocina incluida, entran a las 06:00 en punto. La hora de mise en place de
  cocina y la media hora de montaje de sala desaparecen sin decir nada.
- **Qué debería salir.** Cocina a las 05:00 y sala a las 05:30, o como mínimo un aviso de que la
  preparación no cabe. La rejilla empieza a las 06:00 y la preparación se recorta contra ella.
- **Dónde.** `src/lib/staffing.ts:257` y `src/lib/time.ts:17` (`GRID_START_MIN`).

### M6. El descanso semanal se da por bueno con 37 h

- **Entrada.** Datos de ejemplo con "dos libranzas seguidas" apagado.
- **Qué sale.** 10 personas trabajan 6 días con entre 37,5 y 45 h de descanso semanal seguido. La
  revisión no dice nada, porque mira 36 h.
- **Qué debería salir.** El propio `CLAUDE.md` del proyecto cita la STS 274/2026: el descanso diario
  no se solapa con el semanal, así que el hueco tiene que ser de 36 + 12 = 48 h. Hay un matiz de
  hostelería (el RD 1561/1995, art. 6, deja acumular el medio día en periodos de hasta cuatro
  semanas), pero con una semana que se repite siempre igual ese medio día acumulado no se da nunca.
  A confirmar con un laboralista antes de cambiarlo; hoy la pantalla dice "en regla" a un cuadrante
  discutible.
- **Dónde.** `src/lib/avisos.ts:150` (`DESCANSO_SEMANAL_MIN`, 36 h, línea 45).

### M7. Gente que hace mañana, tarde y noche en la misma semana

- **Entrada.** Abierto de 8 a 2 los siete días, dos encargados y un jefe de cocina.
- **Qué sale.** 4 de 30 personas entran a tres horas distintas en la semana. "Camarero 5": martes y
  miércoles de 07:30 a 14:00, jueves y viernes de 13:30 a 20:00 y sábado de 20:00 a 02:30. "Office 3":
  martes de 07:00, viernes de 19:30 a 03:00, sábado de 00:00 a 04:00.
- **Qué debería salir.** Cada persona en un turno tipo (mañana, tarde o cierre) toda la semana, y la
  rotación entre semanas. Es legal, pero ese cuadrante no lo sigue nadie. Toca el punto 9 de la
  revisión de flujo, que consta como hecho: con dos servicios funciona, con un horario continuo largo
  no.
- **Dónde.** El reparto voraz de `src/lib/roster.ts` (`empaquetar`, desde la línea 1167), que prefiere
  a quien ya repite el turno solo a igualdad de hueco.

### M8. El mando nunca cierra

- **Entrada.** Datos de ejemplo; también "cierra lunes y martes".
- **Qué sale.** El encargado sale a las 23:00 (ejemplo) o a las 23:30 ("cierra lunes y martes") y la
  sala recoge hasta las 00:00. El jefe de cocina igual. El cierre de caja y de sala lo hace siempre
  un camarero sin responsable. Se avisa ("mando-relevo"), pero el turno del mando se coloca en el
  pico y no en el cierre.
- **Qué debería salir.** En el sector, quien cierra la caja es el encargado o el responsable. El
  mando debería cubrir el cierre antes que el centro del servicio, o el responsable debería quedarse
  esa última hora.
- **Dónde.** `src/lib/roster.ts:2309` (la ganancia pesa la gente en sala, no el cierre) y
  `src/lib/roster.ts:2005` a `2030` (los ratos sueltos tras el mando se dan al equipo).

---

## Menores

### m1. El guion de verificación no calcula lo mismo que la app

- **Entrada.** `npm run verificar` frente a la misma demo con el contexto que pasa `usePlanner`.
- **Qué sale.** El guion da 9.150 €/semana y 476.850 €/año, y con eso valida la portada. La app da
  9.191 € y 477.906 € (9.200 y 477.900 redondeados a 50). Los mandos libran lunes y martes en el
  guion y martes y miércoles en la app.
- **Qué debería salir.** El guion tiene que pasar el mismo `ContextoCuadrante` que la app, o la
  portada se comprueba contra una cuenta que nadie ve.
- **Dónde.** `scripts/verificar-calculo.ts:126` (`buildRoster` sin contexto).

### m2. La temporada se pierde si hay semanas excluidas

- **Entrada.** 48 semanas usables (cuatro de cierre excluidas) y semanas punta 46, 47, 48 y 49.
- **Qué sale.** `temporadaAlta` da nulo: toma el número de semanas usables (48) como si fuera la
  semana 52 y corta la racha en la 48. Con 52 da bien "de la 46 a la 49".
- **Qué debería salir.** Las semanas son de calendario: el total para la vuelta del año es 52 (o 53),
  no las que quedan tras excluir.
- **Dónde.** `src/steps/StepResult.tsx:331` y `src/lib/ausencias.ts:217` a `223`.

### m3. Office pagado con la cocina cerrada

- **Entrada.** Abierto de 8 a 2.
- **Qué sale.** "Office 3" el martes de 00:00 a 04:00, cuando la recogida de cocina acaba a las
  03:00. Una hora solo en la cocina cerrada para llegar al turno mínimo de 4 h.
- **Qué debería salir.** Adelantar la entrada a las 23:00, que además cubre la media hora de 23:30 a
  00:00 en la que no hay ningún office.
- **Dónde.** `src/lib/roster.ts:179` (lo que falta se añade después del cierre).

### m4. Contratos de 40 h con 36 h de turnos

- **Entrada.** Bistró de 6 a 7 personas.
- **Qué sale.** "Cocinero 1": 4 días de 9 h, 36 h en turnos, contrato de 40 h. Está escrito a
  propósito (de 36 h para arriba se redondea a completa), pero el cuadrante no pone esas 4 h en
  ningún sitio.
- **Qué debería salir.** O se le pone un quinto día corto, o se dice en su fila que debe 4 h a la
  semana. Si no, al trabajador se le deben horas o la empresa paga 4 h sin saberlo.
- **Dónde.** `src/lib/roster.ts:1810`.

### m5. Dos responsables de 10 h para cubrir las libranzas del encargado

- **Entrada.** Datos de ejemplo.
- **Qué sale.** "Responsable de sala 1" hace la cena del martes y del miércoles, y "Responsable de
  sala 2" la comida de esos mismos días: dos contratos de 10 h para un solo hueco. Pasa porque comida
  y cena juntas son 10 h al día y el tope es 9.
- **Qué debería salir.** En una sala de este tamaño ese hueco lo cubre un camarero veterano con un
  plus, no dos responsables de 10 h que no se conocen el resto de la semana. Al menos proponerlo.
- **Dónde.** `src/lib/roster.ts:1982` (`descontarMandos` deja al responsable solo los días sin mando).

### m6. Un local más grande que la tabla de tramos no se entera en el resultado

- **Entrada.** Grupo grande, 555 sentados a la vez en el pico.
- **Qué sale.** El último tramo (15 camareros, pensado para unos 375) se aplica a 555: un camarero
  por cada 37. El aviso solo sale en la pantalla de Equipo; el resultado y el PDF no lo dicen.
- **Qué debería salir.** El mismo aviso en la revisión del cuadrante y en el PDF.
- **Dónde.** `src/steps/StepTeam.tsx:637` (único sitio que llama a `tramoSuperado`).

---

## Lo que he buscado y está bien

- Ninguna jornada de más de 9 h ni de menos de 4 h, en ningún caso del banco.
- Descanso de 12 h entre jornadas respetado con el ajuste encendido, domingo contra lunes incluido.
- Cero horas sin cubrir en todos los casos; el grupo grande se calcula en 84 ms.
- Ningún mando duplicado: con cuatro mandos de sala no coinciden más de tres, y solo en fin de semana.
- El coste de pantalla y el del PDF salen del mismo resumen; la suma de los puestos del CSV cuadra
  con el total.
- Pausa de más de 6 h y nocturnidad se avisan bien.
