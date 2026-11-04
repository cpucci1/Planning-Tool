# Revisión del cálculo, ronda 6 (4 de noviembre de 2026)

Mirada de director de operaciones: lo que no firmaría, lo ilegal que se da por bueno y las cifras que
no cuadran entre pantalla, CSV y PDF. Solo lectura de `src/` y `scripts/`.

**Resumen.** 3 graves, 4 medios y 8 menores. Los graves: el arreglo de temporada de la ronda 5 no
salta con un fichero real, los menores pueden quedarse sin sus dos días de descanso sin que nadie lo
diga, y un local de temporada corta (pop up) sale dimensionado sobre semanas a cero.

**Cómo se ha comprobado.** `npm run verificar`, y un banco propio con esbuild en
`node_modules/.tmp/r6/` que repite la cadena de `src/hooks/usePlanner.ts:765` a `975` (necesidad,
cuadrante, resumen, coste, picos, ausencias y revisión). Casos: asador de fin de semana, hotel con
desayuno y cena, local 24 h, menú del día con pico de 14 a 15, local de copas, cocina con horario
propio, menores, nocturnidad al 25 %, contratos a medida apagados, cobertura al 50 % y al 95 %. Y un
barrido de 2.160 combinaciones: 5 locales por partida, jornada, libranzas seguidas, 12 h y contratos
a medida encendidos y apagados, y tres valores de tope diario, turno máximo y turno mínimo. Lo que ya
estaba en `revision-flujo-2026-11-04.md` y `revision-ronda5-calculo.md` no se repite; donde un
hallazgo amplía uno de allí, se dice.

---

## Graves

### G1. El coste de temporada sigue saliendo a 52 semanas con un fichero de verdad

Amplía el G1 de la ronda 5: el arreglo existe, pero no salta con lo que sube un restaurante.

- **Entrada.** Chiringuito que abre 23 semanas. Su TPV solo tiene ventas esas 23 semanas, así que el
  fichero solo trae esas fechas.
- **Qué sale.** La lectura crea solo las semanas que aparecen en el fichero; no rellena las que
  faltan con ceros. Sin semanas a cero no se detecta ningún "cierre", y la temporada se queda en 52
  semanas de pago: **444.306 € al año**. Si el mismo local se carga con las semanas cerradas a cero,
  salen **196.520 €**. Un pop up de 6 semanas sale con **538.687 € al año**.
- **Qué debería.** Un hueco en el calendario del fichero es una semana cerrada. Rellenar las semanas
  ausentes con ceros (o preguntar "¿estuviste cerrado de tal a tal?") y pagar las semanas que de
  verdad abre.
- **Dónde.** `src/lib/parseFichero.ts:1661` a `1683` (solo crea las semanas presentes) y
  `src/lib/contracts.ts:350` a `361` (`temporadaDelLocal` solo cuenta semanas marcadas de cierre).

### G2. Menores: sus dos días de descanso no se miran, y el cuadrante les pone noche y 9 h

Amplía el M2 de la ronda 5 (el motor monta lo que su revisión marca como ilegal) con un caso que
además no se avisa.

- **Entrada.** Office y Ayudante marcados como "menores de 18" en el catálogo, local de cenas.
- **Qué sale.**
  - El cuadrante les pone turnos hasta la 01:30 y días de 9 h. Salen como aviso legal, pero el
    reparto no los tiene en cuenta: los genera igual.
  - Con "dos libranzas seguidas" apagado, un menor trabaja 6 días con 42 h de descanso semanal como
    mucho. La revisión mide 36 h para todos, así que **no sale ningún aviso**. Un menor necesita dos
    días ininterrumpidos (art. 37.1 ET).
  - La pausa de 30 minutos por encima de 4 h 30 es solo un aviso, no un cambio en el turno.
  - La lista de "lo que está en regla" dice "menores sin noche y sin pasar de 8 h" como comprobación
    hecha, y no hay ninguna sobre su descanso semanal.
- **Qué debería.** Que el reparto trate el puesto de menores como restricción dura (nada pasadas las
  22:00, tope de 8 h, pausa dentro del turno) y que la revisión les pida 48 h seguidas de descanso.
- **Dónde.** `src/lib/avisos.ts:62` y `167` (36 h para todos), `src/lib/avisos.ts:615` a `675`
  (menores solo como aviso), `src/lib/avisos.ts:707` (la comprobación que se da por hecha).

### G3. Pop up con semanas a cero: se dimensiona sobre una semana vacía

- **Entrada.** Local de 6 semanas, cargado con el resto del año a cero.
- **Qué sale.** Al quedar menos de 8 semanas útiles, el cálculo vuelve a usar las 52, ceros
  incluidos. La semana tipo sale con 0 cobros. Resultado: 4 mandos a 40 h que no tienen a quién
  dirigir; la herramienta añade sola un responsable de turno y un segundo jefe de cocina que el
  usuario no pidió, y la cobertura dice "46 de 52".
- **Qué debería.** Con menos de 8 semanas abiertas, calcular sobre las abiertas y avisar de que hay
  poca historia, nunca sobre semanas cerradas.
- **Dónde.** `src/lib/demand.ts:49` (si quedan menos de 8, devuelve todas).

---

## Medios

### M1. El margen de seguridad empuja al salto de tramo y empeora los picos

- **Entrada.** Datos de ejemplo con margen de seguridad al 0 %, 10 % y 20 %.
- **Qué sale.** El pico pasa de 195 a 215 sentados y cruza el salto entre el tramo de 161 a 200 (18
  personas) y el de 201 a 260 (25 personas). La peor semana dice "faltan 2 personas" con margen 0,
  **9** con margen 10 y 7 con margen 20. Las horas de pico al año suben (761, 819, 873) en vez de
  bajar, porque las horas por cobro llevan el margen y el umbral de la línea no.
- **Qué debería.** Un margen tiene que absorber picos, no generarlos. Medir los picos con la misma
  vara (con margen o sin él en los dos lados), y suavizar el escalón de 7 personas entre dos tramos
  seguidos de la plantilla de partida.
- **Dónde.** `src/lib/contracts.ts:226` a `242` y los tramos t7 y t8 de `src/data/presets.ts`.

### M2. Asador de fin de semana: el jefe de cocina solo va el sábado

- **Entrada.** Abre viernes noche (20 a 24), sábado comida y cena y domingo comida. Preparación de
  cocina por defecto (60 min antes, 30 después).
- **Qué sale.** El jefe de cocina sale del viernes a las 00:30 y el sábado entraría a las 12:00: 11 h
  30 de descanso. En vez de entrar media hora más tarde, el reparto le quita el día entero. Acaba con
  un solo día, el sábado, 9 h, en un contrato de 10 h, y el aviso es "no hay mando el viernes y el
  domingo". Con preparación de 30 minutos, o con las 12 h apagadas, va los tres días.
- **Qué debería.** Mover la entrada lo que haga falta (12:30) antes de tirar el día. Ningún asador
  firma un fin de semana con la cocina sin jefe dos de tres días.
- **Dónde.** `src/lib/roster.ts:1987` (`colocarMandos`) y `2048` (`nuevoMando`).

### M3. Sin libranzas seguidas, el motor genera descansos semanales por debajo de 36 h

Distinto del M6 de la ronda 5, que trataba descansos de 37 a 45 h: aquí se baja del mínimo legal.

- **Entrada.** Hotel (desayuno y cena) y local 24 h, con "dos libranzas seguidas" apagado.
- **Qué sale.** "Cocinero" con 6 días y 32 h de descanso seguido como mucho. Sale el aviso legal,
  pero el cuadrante se monta así. En el barrido, 910 de 2.160 casos. Mirado en periodos de 14 días
  (lo que permite acumular el art. 37.1 ET y el RD 1561/1995) la rueda sí da el descanso
  acumulado, así que el problema es la semana suelta que se entrega.
- **Qué debería.** Con libranzas sueltas, exigir igualmente 36 h seguidas en el reparto, o decir en
  la fila de la persona que lo acumula con la semana siguiente.
- **Dónde.** `src/lib/avisos.ts:167` (solo avisa); el reparto no tiene esa restricción en
  `src/lib/roster.ts`.

### M4. Solo la cocina puede tener horario propio

- **Entrada.** Restaurante con terraza o barra que abre a otra hora que el comedor.
- **Qué sale.** No se puede: la única zona con horario aparte es Cocina. Una terraza que abre a las
  12 y un comedor a las 13:30 comparten horario.
- **Qué debería.** Horario propio por zona, como ya se hace con la cocina.
- **Dónde.** `src/hooks/usePlanner.ts:169` y `src/steps/StepDemand.tsx:701`.

---

## Menores

### m1. "Menos 1 persona porque los turnos no encajan al minuto"

- **Entrada.** Local de copas (144 de 432 combinaciones del barrido) y el asador con preparación
  30/30.
- **Qué sale.** El desglose de "de dónde salen tus personas" tiene una parte negativa, y la pantalla
  y el PDF la enseñan tal cual: "−1 porque los turnos no encajan al minuto".
- **Qué debería.** Una parte de un desglose de personas no puede ser negativa. Repartir el sobrante
  en la partida que corresponda o no enseñar la línea.
- **Dónde.** `src/lib/contracts.ts:90`, `src/steps/StepResult.tsx:2351`, `src/lib/informe-pdf.ts:1086`.

### m2. El CSV dice "anual (52 semanas)" con el importe de 23

- **Entrada.** Chiringuito con las semanas de cierre presentes.
- **Qué sale.** "Coste de empresa anual (52 semanas)" con 196.520 €, que son 23 semanas de pago.
- **Qué debería.** La etiqueta con las semanas de verdad.
- **Dónde.** `src/lib/export.ts:133`.

### m3. La pantalla dice "las 52 semanas" a mano

- **Entrada.** Cualquier local de temporada.
- **Qué sale.** "que acabas pagando en plantilla las 52 semanas", aunque el coste sea de 23.
- **Dónde.** `src/steps/StepResult.tsx:940`.

### m4. Los mandos no respetan el turno máximo

- **Entrada.** Turno máximo de 6 h.
- **Qué sale.** El encargado y el jefe de cocina con bloques de 8 h. En el barrido, 5.280 turnos.
- **Qué debería.** O se aplica también a los mandos, o el ajuste dice que es solo para el equipo.
- **Dónde.** `src/lib/roster.ts:2048` (`nuevoMando` no lee `maxShiftMinutes`).

### m5. Aviso falso de "preparación antes de las 06:00" en un local 24 h

- **Entrada.** Abierto de 06:00 a 06:00.
- **Qué sale.** El aviso de que la preparación no cabe en el día, cuando un local que no cierra no
  tiene preparación de apertura.
- **Dónde.** `src/lib/necesidad.ts:201` (`preparacionRecortada`).

### m6. En el local 24 h los dos mandos van de noche

- **Entrada.** Abierto 24 h, encargado y jefe de cocina.
- **Qué sale.** Los dos de 22:00 a 06:00. El día (con proveedores, clientes y más gente) queda sin
  mando.
- **Dónde.** `src/lib/roster.ts:1987`.

### m7. Las horas complementarias pactadas se cuentan en contratos de menos de 10 h

- **Entrada.** Contrato mínimo de 6 u 8 h, que la pantalla permite.
- **Qué sale.** La bolsa de pactadas incluye a esas personas. El art. 12.5 ET solo permite pactarlas
  con jornadas de 10 h o más; las voluntarias sí se filtran.
- **Dónde.** `src/lib/ausencias.ts:274` (sin el filtro que sí lleva la línea 279).

### m8. Dos comparaciones que un gerente lee como de vendedor

- "Contratar fijo" para los picos se valora como 5 personas las 52 semanas para cubrir 761 h al año.
  Nadie lo haría así; la alternativa real es ampliar parciales o un fijo discontinuo.
- "Sin partida" convierte 19 personas en 34, 32 de ellas parciales. El número es correcto, pero sin
  decir por qué cuesta creerlo.

---

## Lo que he buscado y está bien

- Horas contratadas = horas que pide el servicio + horas de más en el local + contrato sin turno, en
  todos los casos del barrido.
- Tope diario, 12 h entre jornadas con el ajuste encendido, horas asignadas por debajo del contrato y
  libranzas seguidas: sin un fallo en las 2.160 combinaciones.
- Media de 8 h para quien trabaja de noche: se respeta.
- Rueda de semanas: peor racha de 6 días seguidos en el ejemplo y 9 en el 24 h, con al menos 76 h de
  descanso en bloques de 36 h o más en cualquier periodo de 14 días. Aceptable.
- Mandos del hotel de 15:30 a 23:30: razonable para un hotel con desayuno y cena.
