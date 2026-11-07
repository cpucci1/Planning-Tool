# Cambios del motor, ronda 5 (2026-11-04)

Arreglos de `revision-ronda5-calculo.md` y de la parte de cifras de `revision-ronda5-pantallas.md`.
Las cifras de "antes" y "después" salen del banco de los revisores (`node_modules/.tmp/r5/`), con el
mismo contexto que la app, y de los guiones de comprobación.

## Resumen en cifras

| Caso | Antes | Después |
|---|---|---|
| Ejemplo como lo abre la app | 21 personas, 582 h contratadas, 9.191 €/semana | 19 personas, 587 h, 9.231 €/semana |
| Responsables de sala de 10 h en el ejemplo | 2 | 0 |
| Días con encargado y jefe de cocina libres a la vez | martes y miércoles | ninguno (sala libra martes y miércoles, cocina jueves y viernes) |
| Nocturnos de más de 8 h marcados ilegales por la propia revisión | 6 avisos en el banco (Office 1, 2, 3) | 0 |
| Cafetería de desayunos | 12 personas, 265 h | 9 personas, 181 h |
| Bar de copas | 11 personas | 10 |
| Local de 8 a 2, siete días | 30 personas; 3 entran de mañana, tarde y noche | 27; 1 |
| Bar de polígono que abre a las 06:00 | 11 personas, la preparación perdida sin aviso | 8 personas, y aviso de la preparación que no cabe |
| Playa, 23 semanas abiertas, coste al año | 452.338 € (52 semanas) | unos 200.000 € (23 semanas, fijo discontinuo) |
| Horas pagadas sin servicio del ejemplo | 100 h, que no salían restando | 98,5 h = 587 contratadas menos 488,5 de necesidad |
| Peor semana: 187 h que faltan | "2 personas fijas más" | 5 jornadas completas (2 más a la vez), y su coste con esas 5 |
| `npm run verificar` frente a la app | 9.150 € y 581 h frente a 9.191 € y 582 h | lo mismo en los dos: 9.250 € (redondeado a 50) y 587 h |
| Puesto grande (70 personas) | 53 ms | 70 ms, por debajo de 300 |

## Cálculo

### G1. Local de temporada

`temporadaDelLocal` (`src/lib/contracts.ts`) cuenta las semanas que la lectura marcó como cierre y
siguen fuera del cálculo. Con 10 o más el local es de temporada: se pagan las semanas abiertas, no
52, y la pantalla propone fijo discontinuo (art. 16 ET) para toda la plantilla base. Con menos son
vacaciones y se pagan las 52. Si el usuario vuelve a meter una semana cerrada, cuenta como abierta.

- `summarizeCost` recibe esas semanas. La hora trabajada se sigue calculando sobre el año entero,
  porque un fijo discontinuo genera vacaciones y festivos en proporción a lo que trabaja.
- `coberturaAusencias` y `jornadasParaCubrir` escalan las ausencias en la misma proporción. Las
  jornadas para cubrirlas durante la temporada no cambian.
- StepResult y el PDF dicen "las N semanas que abres, con la plantilla en fijo discontinuo".
- De paso (m2): `temporadaAlta` se llama con las semanas del calendario, no con las que quedan en el
  análisis. Con 48 semanas usables, la racha 46 a 49 no se reconocía como temporada.

### G2. Duración de cada estancia

Cada servicio tiene su duración, editable en el paso del equipo: desayuno 25 min (antes de las
12:30), comida 75, cena 90 y copas 60 (de la 01:00 en adelante). Los planes sin desayuno ni copas
se quedan como estaban: el desayuno usa la duración de la comida y las copas la de la cena. El
suelo de 30 min por mesa pasa a 5 min, porque redondeaba un café de 25 a 30. El selector de
desayuno y el de copas solo salen si el fichero tiene cobros a esas horas.

### Mandos

- **Libranzas cruzadas.** Las de cada zona se deciden sabiendo qué días trabajan los mandos de las
  zonas anteriores. Librar un día en que no queda ningún mando en la casa pesa más que librar un día
  fuerte. Si aun así pasa (un solo mando, pocos días), la revisión lo dice.
- **El cierre de los días fuertes.** En los tres días de más comensales, la última hora de la zona
  pesa 3 en la elección del turno del mando (el centro del servicio pesa de 1 a 2). En el ejemplo, el
  encargado cierra los 3 y el jefe de cocina 2 de 3.
- **El relevo sin puesto aparte.** Si el segundo de la zona es de una persona a la vez (el
  responsable de sala) y con el mando puesto solo le quedan 20 h o menos, esas horas pasan al
  siguiente puesto de la zona (el camarero) y no se crea el contrato. El cuadrante elige quién queda
  al frente cada día que libra el mando: el que más rato está y, si cumple todos esos días, el mismo.
  El aviso lo nombra: "queda al frente Camarero 4 los días que libra el mando. Ponle el plus o la
  categoría que diga tu convenio por esas horas."

**La frase del catálogo** (`RoleCatalog.tsx:173`, del otro agente) dice "el cuadrante deja siempre
uno al frente mientras su zona esté abierta". Ahora es cierta si "uno" es una persona al frente, no
un mando. Texto propuesto: "Dime cuántos tienes y su jornada. El cuadrante los pone en los días
fuertes y al cierre, y cuando libran deja al frente a una persona del equipo, con nombre."

### M2. Nocturnos

Un turno con 3 h o más entre las 22:00 y las 06:00 no pasa de 8 h (art. 36.1 ET), con la misma cuenta
que la revisión (`topeDeJornada` en `roster.ts`). Vale para los relevos, los emparejamientos, las
partidas y los turnos de los mandos. Si un tramo largo sale con un relevo ilegal, se vuelve a partir
con el tope de 8 h.

### Preparación a las 06:00

El día del cuadrante va de 06:00 a 06:00. Moverlo cambiaría todos los planes guardados, así que se
avisa: `preparacionRecortada` (`necesidad.ts`) calcula lo que se pierde y `revisarCuadrante` lo
cuenta en un aviso de tipo `preparacion`, con los minutos y los días.

### M7. Turnos estables

`estabilizarFamilias` ya no cambia solo un día suelto. Cambia tramos de 1 a 3 días seguidos entre
dos personas, porque un día suelto casi nunca pasa de noche a mañana sin romper las 12 h con el día
de al lado. Admite hasta 2 h de diferencia en el tramo, siempre que no suban los contratos de los
dos. En el local de 8 a 2, quien entra en tres franjas distintas pasa de 3 personas a 1.

### M6. Descanso semanal

No se cambia. La STS 274/2026 solo aparece nombrada en una frase del `CLAUDE.md`, sin texto ni
enlace, y no se ha podido leer. En hostelería el RD 1561/1995 (art. 6) deja acumular el medio día.
Se queda en 36 h, **a confirmar con un laboralista**, y está escrito así junto a la cifra
(`DESCANSO_SEMANAL_MIN` en `avisos.ts`).

## Pantallas (las cifras)

### G1. Horas pagadas sin servicio

Una sola definición, en neto. "En el local de más" son las horas en turnos menos la necesidad.
"Sin turno" son las contratadas menos las horas en turnos. El total son las contratadas menos la
necesidad. Antes se sumaban solo las franjas con gente de sobra, sin restar las que tenían de menos.

- Lo usan el resumen, el cuadrante y la tarjeta "En turno sin servicio" (`horasDeMasEnElLocal`).
- La lista de dónde sobra gente sigue siendo franja a franja.
- El porcentaje es el mismo en todas partes: sobre lo que pide el servicio.

### G2. La peor semana

`analyzePeaks` da por separado la gente de más a la vez, las jornadas que piden las horas (horas
entre 40) y la mayor de las dos (`personasParaContratar`). Lo que se contrata es la mayor. Su coste
es esa cifra × 40 h × las semanas de pago × el coste medio por hora. Cambiado en StepResult (la
tarjeta, el pie y "Contratar de más") y en el PDF.

### El titular de la plantilla

La tabla "Lo que tendrías que contratar" es la semana tipo con todos presentes. Su subtítulo dice
ahora cuántas jornadas completas hacen falta además para vacaciones, festivos y bajas. Es la misma
cifra de la tarjeta de ausencias.

### `npm run verificar`

`contextoDelCuadrante` y `cobrosDeLaSemana` (`necesidad.ts`) son ahora la única fuente del contexto
del cuadrante. Las usan `usePlanner` y el guion. El guion usa también las semanas que cuentan
(`usableWeeks` con las especiales detectadas) y los cobros para los picos, como la app.

Cifras nuevas de la portada, ya puestas en `src/data/ejemploPortada.ts`:

- 7 de 40 h, 7 de 25 a 39, 1 de 20 a 24 y 4 de menos de 20.
- 9.250 € a la semana y 480.000 € al año.
- 11 semanas punta.
- Puestos: camarero 100, cocinero 54, office 27, jefe de cocina 23.

## Comprobaciones nuevas

- `comprobar-cuadrante`, quinta ronda. Falla si vuelve cualquiera de estos:
  - la casa sin mando algún día;
  - el mando sin cerrar los días fuertes;
  - un responsable de 12 h o menos;
  - un aviso de relevo sin nombre;
  - un turno de más de 8 h con 3 h de noche, o un nocturno ilegal en la revisión;
  - más de una persona en tres franjas en el local de 8 a 2;
  - la preparación de las 06:00 sin aviso.
- `comprobar-cuadrante`: el caso del ejemplo usa el contexto de la app, y su rango pasa a 17 a 23
  personas.
- `comprobar-coste`, ronda 5:
  - semanas de pago de un local de temporada y de unas vacaciones;
  - el coste anual sobre 23 semanas, con la hora trabajada sin cambiar;
  - las ausencias en proporción;
  - la racha 46 a 49;
  - 200 h que faltan dan 5 jornadas y no 2 personas;
  - las horas sin servicio salen restando.
- `comprobar-demanda`:
  - las duraciones por defecto;
  - 20 cafés y 12 copas dan 20 × 25 + 12 × 60;
  - un plan sin desayuno ni copas no cambia.

## Lo que queda

- `export.ts` (CSV, del otro agente) llama a `coberturaAusencias` sin las semanas de pago: en un
  local de temporada, sus horas de ausencia salen sobre 52 semanas. Hay que pasarle
  `temporadaDelLocal(specials).semanasDePago`.
- La frase del catálogo de puestos, propuesta arriba.
- El coste del ejemplo sube 40 € a la semana con dos personas menos: las horas del relevo las hacen
  camareros, y algún contrato redondea hacia arriba.
- En el local de 8 a 2 sigue un camarero con partida, noche y mañana: su partida no tiene con quién
  cambiarse.
