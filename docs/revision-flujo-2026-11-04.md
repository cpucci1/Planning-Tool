# Revisión del planificador de plantilla, 4 de noviembre de 2026

Revisión completa pedida por Crescente: que el resultado tenga sentido para alguien del sector, no
solo que se entienda. Se ha leído entero el cálculo (de comensales a personas, cuadrante, contratos y
avisos), se ha recorrido la herramienta pantalla a pantalla con un histórico de prueba de 52
semanas, se han probado casos a propósito sobre el cálculo real y se ha mirado cómo lo hacen otras
herramientas (Skello, Deputy, 7shifts, Combo) y qué dice la norma.

Cada punto dice qué pasa, por qué no tiene sentido y qué se propone. Van por orden de gravedad.
Ninguno está arreglado todavía: esto es para decidir.

---

## Decidido

Crescente, el mismo 4 de noviembre: *"arréglalo todo"*. Las cuatro decisiones que desbloquean el
resto se toman en el sentido propuesto:

1. **Los mandos se planifican por horario, no por comensales** (punto 2).
2. **Los tramos se preguntan en comensales sentados a la vez, no en cobros por media hora** (punto 4).
3. **Se cuentan vacaciones, festivos y bajas** (punto 5).
4. **El cuadrante sale de turnos tipo fijos, no de piezas a medida de cada media hora** (punto 9).

## La lista

Se marca cada punto al quedar arreglado y comprobado. La ronda dice en qué vuelta de revisión salió.

| # | Qué | Ronda | Estado |
|---|---|---|---|
| 1 | Tope de horas al día y relevos que no se juntan | 1 | [x] |
| 2 | Mandos por horario, con un mando siempre presente | 1 | [x] |
| 3 | Elegir qué puesto abre y cierra cada zona | 1 | [x] |
| 4 | Comensales sentados a la vez y tramos en su idioma | 1 | [x] |
| 5 | Vacaciones, festivos y bajas | 1 | [x] |
| 6 | Vacaciones en las semanas flojas y fijo discontinuo | 1 | [x] |
| 7 | Preparación y recogida por defecto, para todo el que abre o cierra | 1 | [x] |
| 8 | Horas sobrantes usadas y parciales de cualquier número de horas | 1 | [x] |
| 9 | Turnos tipo fijos y turno mínimo de 4 h | 1 | [x] |
| 10 | Preferir turnos continuos sobre la jornada partida | 1 | [x] |
| 11 | Los mandos libran en los días flojos | 1 | [x] |
| 12 | Cuadrante de cuatro semanas en rueda | 1 | [~] rota entre quienes comparten puesto y contrato; quien va solo en su contrato aún repite semana |
| 13 | Pausa en jornada continuada | 1 | [x] |
| 14 | Sueldo bruto más la parte de la empresa | 1 | [x] |
| 15 | Precio de Shifty | 1 | [x] |
| 16 | Dos porcentajes distintos en la línea del histórico | 1 | [x] |
| 17 | Poder ver la herramienta sin fichero propio | 1 | [x] |
| 18 | Decir en la portada que el plan se guarda | 1 | [x] |
| 19 | Pasar la lectura de columnas de Gemini a GPT Luna | 1 | [ ] espera a Crescente: hace falta poner la clave de OpenAI en el proyecto freetools, y el adaptador de Shifty depende del control de gasto de la base de producción; se porta cuando la clave esté |
| 20 | Coste por hora de turno real (vacaciones, festivos, pagas y Seguridad Social de empresa, unas 1,5 veces el sueldo por hora); alarma de coste sobre ventas al 35 % | 2 | [x] |
| 21 | Perfil de convenio: todas las reglas en una ficha, cada una obligatoria o solo aviso | 2 | [ ] |
| 22 | Avisos de turno de noche y de menores de 18 | 2 | [x] |
| 23 | Horas complementarias de los parciales como escalón antes de contratar | 2 | [x] |
| 24 | Cuadrante con fechas, códigos M/T/P/L, fila de ausencias, "publicar antes de" con 5 días e imagen para el grupo | 2 | [x] |
| 25 | Trabajo fijo por puesto y servicio (mise en place, limpieza) aparte del variable | 2 | [x] |
| 26 | Bajas sumadas dividiendo por el tiempo disponible, 6 % por defecto | 2 | [x] |
| 27 | Con nombres: disponibilidad por persona, contador de jornada anual, fines de semana seguidos | 2 | [ ] |

---

## A. Rompe la lógica o la ley. Arreglar ya

### 1. Da por buenas jornadas de 15 horas

**Qué pasa.** Con un local abierto de 9:00 a 24:00 seguido, el cálculo parte el día en dos relevos
de 7,5 h, como debe, pero luego los vuelve a juntar en una sola persona como si fuera una jornada
partida sin hueco en medio. Resultado de la prueba: **los 21 turnos de la semana duran 15 horas**, y
la pantalla de revisión dice "el cuadrante cumple". Con el mínimo por local y 60 minutos de
preparación, el restaurante del ejemplo también saca jornadas de 12 horas.

**Por qué no tiene sentido.** La ley pone 9 horas ordinarias al día salvo que el convenio diga otra
cosa. El ajuste "turno más largo" se aplica a cada bloque por separado, así que una partida de dos
bloques de 9 horas es válida para la herramienta. Y la revisión final no mira las horas del día.

**Propuesta.** Tope de horas al día (9 por defecto, editable para quien tenga otro convenio). Un
relevo nunca se junta con el turno del que sale. Y la revisión avisa de cualquier día que pase del
tope.

### 2. Los mandos se calculan como si fueran camareros

**Qué pasa.** Encargado, jefe de cocina o responsable de turno se ponen en la tabla de tramos igual
que un camarero: cuantos más comensales, más gente. Dos pruebas:

- Encargado solo en los tramos altos: sale **un encargado con contrato de 40 h y 12 h de turnos**,
  que solo va viernes, sábado y domingo en los picos. Es exactamente el caso de "un encargado de 4
  horas y un camarero de 40".
- Encargado en todos los tramos: salen dos encargados que hacen **exactamente los mismos turnos que
  los dos responsables de sala**, minuto a minuto. Cuatro personas de mando duplicadas.

La herramienta lo sabe y lo da por normal: el catálogo dice "les pagas la jornada entera", y la
revisión lo deja en un aviso amarillo.

**Por qué no tiene sentido.** Un mando no se pide por volumen. Tiene su horario: cinco días, su
jornada entera, normalmente abriendo o cerrando, y trabajando los días fuertes. La regla real del
sector no es "con 90 comensales, un encargado", es **"mientras el local esté abierto, siempre hay
alguien al mando"**, y cuando el encargado libra lo cubre el responsable de turno.

**Propuesta.** Dos clases de puesto:

- **De estructura** (encargado, jefe de cocina, responsable): se pide cuántos hay y su jornada. El
  cuadrante les da turnos enteros y comprueba que todas las horas de apertura tienen un mando.
- **De volumen** (camarero, ayudante, cocinero, office): siguen saliendo de los tramos.

Y una pregunta que hoy no existe: *"¿Quién manda en el local cuando libra el encargado?"*.

### 3. El mínimo de cocina lo cubre un jefe de partida que el local no tiene

**Qué pasa.** El mínimo por zona ("siempre 1 en cocina") se asigna al primer puesto de la zona que no
sea solo de jornada completa. En el catálogo de partida ese puesto es **jefe de partida**, que
arranca a cero porque casi ningún local de menú lo tiene. Prueba: con mínimo 1 en cocina salen **tres
jefes de partida** en un restaurante sin partidas.

**Propuesta.** Que el usuario elija qué puesto abre y cierra cada zona. Por defecto, el puesto más
básico que tenga gente en los tramos (cocinero).

### 4. Los tramos no miden lo que el hostelero cree que está contestando

**Qué pasa.** La pantalla pregunta *"Cuando entran 40 comensales, ¿con cuánta gente lo sacas?"*.
Pero esa cifra se aplica a **cada media hora**, y los comensales de cada media hora son **los que
pagan en esa media hora**, no los que están sentados. Que es por media hora solo se dice en un icono
de información.

**Por qué no tiene sentido.** Un jefe de sala piensa en sala llena o en cubiertos del servicio. Una
mesa está sentada una hora u hora y media, no media hora. 40 cobros en una media hora son, más o
menos, 80 a 120 personas sentadas a la vez. Quien contesta "con 40 comensales, 2 camareros"
pensando en su sala está diciendo una cosa y la herramienta calcula otra, y no hay forma de que se
dé cuenta.

**Propuesta.**
- Convertir los cobros en **comensales sentados a la vez**, con una duración media de comida
  editable (por ejemplo 75 minutos a mediodía y 90 por la noche).
- Preguntar en su idioma: *"Con la sala con 40 personas sentadas, ¿cuánta gente necesitas?"*.
- Enseñarle al lado su propio máximo ("tu sábado llega a 140 sentados") para que tenga una
  referencia.

Es el cambio más grande de la lista, y cambia los números de todo lo demás.

---

## B. Falta lo que cualquier jefe de sala da por hecho

### 5. Nadie se va nunca de vacaciones ni se pone malo

**Qué pasa.** La plantilla se calcula como si las 19 personas trabajaran las 52 semanas. No hay
vacaciones, ni festivos, ni bajas.

**Por qué no tiene sentido.** Cada persona tiene 30 días naturales de vacaciones y los festivos que
trabaja se le compensan con días libres. Solo eso son más de cinco semanas al año en las que alguien
falta, más las bajas. Con 19 personas, cada semana del año falta alguien. Cualquier hostelero lo ve
en cuanto lo lee. Además, la pantalla de Shifty vende "picos, bajas y vacaciones", y el plan no
cuenta ni bajas ni vacaciones.

**Propuesta.** Una línea más en el resultado: **las horas al año que hay que cubrir cuando falta
alguien**, con una tasa de ausencia editable. Se enseñan como más plantilla o como refuerzos. Es
honesto y además es el argumento de Shifty más fácil de creer.

### 6. La misma plantilla las 52 semanas

**Qué pasa.** La plantilla se hace para la semana del 80 % y se repite todo el año. En las semanas
flojas sobra de media un 25 % de gente, y en la semana 35 sobra el doble.

**Por qué no tiene sentido.** En hostelería eso se resuelve de tres maneras que la herramienta no
contempla: las vacaciones se ponen en temporada baja, existen los fijos discontinuos, y los
convenios cuentan la jornada al año (en torno a 1.800 horas) y permiten repartirla de forma irregular.

**Propuesta.** Colocar las vacaciones de cada persona en las semanas más flojas. Eso baja a la vez
el sobrante de las semanas flojas y el hueco del punto 5. Añadir el fijo discontinuo como tipo de
contrato.

### 7. Nadie prepara ni recoge

**Qué pasa.** Por defecto la preparación y la recogida están en "Nada". En el cuadrante, los
cocineros entran a las 13:00 justo cuando abre al público y los camareros salen al minuto de cerrar.
Además, aunque se active, la preparación solo alarga el turno del mínimo por zona, no el del resto.

**Propuesta.** Valores de partida realistas (por ejemplo, 60 minutos antes en cocina y 30 después en
las dos zonas) y que se apliquen a todo el que abre o cierra.

### 8. Se paga un 26 % de horas sin trabajo y se presenta como normal

**Qué pasa.** En el ejemplo se contratan 675 horas y el servicio pide 501. La herramienta lo llama
"holgura" y lo da como parte del cálculo. Hay un responsable con 40 h de contrato y 34 de turnos, y
camareros con 30 de contrato y 26 de turnos.

**Por qué no tiene sentido.** Ningún hostelero paga una cuarta parte de las horas para nada: esas
horas se usan en preparación, limpieza o formación, o se ajustan los contratos. Los parciales no
tienen por qué ser de 15, 20 o 30 horas: pueden ser de 22 o de 34.

**Propuesta.** Primero usar las horas sobrantes para preparación y cierre (punto 7). Después,
permitir parciales de cualquier número de horas, con un mínimo. Y lo que siga sobrando, decirlo como
coste, no como margen.

### 9. Turnos de tres horas y horarios distintos cada día

**Qué pasa.** El cuadrante se monta pegando trozos de la curva, así que cada persona tiene un horario
distinto cada día. Ejemplo real: un camarero entra el lunes de 12:00 a 15:00 y de 19:00 a 22:00, el
martes de 13:00 a 17:00 y de 19:30 a 23:30. Otro solo va el viernes de 19:00 a 22:00, tres horas.

**Por qué no tiene sentido.** Nadie viene a hacer tres horas, y un cuadrante que cambia de hora cada
día no lo sigue nadie. En la práctica hay tres o cuatro turnos tipo (partido, mañana, tarde, cierre)
y cada persona rota entre ellos.

**Propuesta.** Que el local defina sus turnos tipo, o que se propongan a partir de su horario, y que
el cuadrante elija entre ellos. Subir el turno mínimo por defecto a 4 horas.

### 10. Todo el mundo hace jornada partida todos los días

**Qué pasa.** Con la partida activada (está por defecto), casi toda la plantilla parte los cinco días.

**Por qué no tiene sentido.** Es el horario que menos quiere la gente y el que más rota. Muchos
convenios lo pagan aparte o lo limitan.

**Propuesta.** Preferir turnos continuos y usar la partida solo donde ahorra una persona. Decir en el
resultado cuántas partidas salen a la semana.

### 11. La persona clave libra justo los días fuertes

**Qué pasa.** En el ejemplo, el responsable de sala principal (40 h) libra miércoles, sábado y
domingo. Los dos días de más comensales los lleva el responsable de 30 h.

**Propuesta.** Los mandos libran por defecto en los días de menos comensales.

### 12. Los fines de semana no rotan

**Qué pasa.** Se monta una sola semana y se repite siempre. La propia herramienta enseña "findes: el
que más 2 y el que menos 0": hay quien trabaja todos los fines de semana del año y quien no trabaja
ninguno, siempre los mismos.

**Propuesta.** Cuadrante de cuatro semanas en rueda, para que libranzas y fines de semana roten.

### 13. Falta la pausa

**Qué pasa.** Con jornada continuada de más de 6 horas la ley pide una pausa de 15 minutos, y muchos
convenios de hostelería la suben a 20. No se cuenta ni se avisa.

**Propuesta.** Avisarlo en la revisión y, si cuenta como trabajo en el convenio, sumarlo.

---

## C. Números y textos que restan credibilidad

### 14. No se sabe si el coste por hora es sueldo o coste de empresa

El catálogo pide "coste por hora" sin decir si incluye la Seguridad Social de la empresa, que es
cerca de un tercio más. Si el hostelero pone el sueldo, el coste total y el porcentaje sobre ventas
salen bajos. En el ejemplo el personal se lleva un 29 % de las ventas; con la Seguridad Social estaría
cerca del 39 %, que ya es zona de alarma. **Propuesta:** pedir el sueldo bruto, que es lo que se sabe,
y sumar la parte de empresa diciéndolo.

### 15. El precio de Shifty no coincide

La pantalla de Shifty dice "desde 18,80 €/hora". Según lo decidido el 30 de octubre, el precio público
es 18,81 €. No se ha comprobado aquí cuál es el bueno hoy.

### 16. Dos porcentajes distintos en la misma línea

La línea del histórico enseña "79 % · 41/52" y al lado "80 % del histórico". Es lo mismo dicho de dos
maneras que no cuadran.

### 17. Ya no se puede ver la herramienta sin un fichero propio

La documentación dice que subir un fichero vacío llamado `datos-de-ejemplo.csv` enseña el ejemplo.
Ya no funciona: da "no ha entrado ni una fila". Quien no tenga a mano el fichero de su TPV se va sin
ver nada más que la portada.

### 18. La portada promete algo más estrecho de lo que parece

"Tu fichero no sale de aquí, no se sube a ningún servidor" es cierto del fichero. Pero el plan, con la
curva de comensales del local, sí se guarda en el servidor, y la forma de las columnas se manda a un
modelo de Google. **Propuesta:** decir también que el plan se guarda para que se pueda volver a él.

### 19. El modelo de lectura sigue siendo Gemini

La lectura de columnas y el nombre de las semanas raras usan Gemini. Desde el 1 de noviembre lo
decidido es hacerlo todo con GPT Luna. Hay que moverlo.

---

## Lo que está bien y conviene no tocar

- Explicar que el número lo marca el pico simultáneo y no las horas totales. Es la mejor idea de la
  herramienta y es exactamente el argumento de Shifty.
- La línea arrastrable de cobertura y el cálculo de los picos con semanas reales del histórico.
- Corregir el retraso entre el servicio y el cobro.
- Detectar Semana Santa y Carnaval y moverlas al año siguiente.
- Las 12 horas de descanso entre jornadas. Aquí sí aplican: es la plantilla propia del local, no los
  extras de Shifty.
- La revisión que dice lo que cumple, no solo lo que falla. Solo le faltan las comprobaciones de los
  puntos 1, 2 y 13.

---

## Cómo lo hacen otros

Skello, Deputy y 7shifts parten de la previsión de ventas por hora, como esta herramienta, pero
además trabajan con la disponibilidad de cada persona, su contrato y lo que sabe hacer, y enseñan el
coste mientras se monta el cuadrante. Todos traen alertas de normativa. En el sector se da por sano
que el personal se lleve entre el 25 y el 35 % de las ventas. No se ha encontrado ninguna fuente
fiable sobre cómo tratan a los mandos frente al resto de la plantilla.

Esta parte sale de las webs de los propios proveedores, no de haber usado sus productos.

## Cómo se ha comprobado

- Lectura completa del cálculo en `src/lib/` (demanda, tramos, cuadrante, contratos y avisos).
- Recorrido de las once pantallas con un histórico generado a partir del ejemplo (96.936 tickets, 52
  semanas).
- Cuatro escenarios forzados sobre el cálculo real: los de partida, el encargado en todos los tramos,
  el encargado solo en los altos, el mínimo de 1 por zona con preparación, y un local abierto de 9:00
  a 24:00 seguido. Los resultados que se citan arriba salen de ahí.

## Rondas de revisión y arreglo (04-11-2026)

| Ronda | Revisión | Graves que encontró | Notas de cambios |
|---|---|---|---|
| 1 y 2 | Lista inicial e investigación de otras herramientas | 19 puntos + 8 de la investigación | cambios-cuadrante, cambios-demanda, cambios-cuadrante-r2, cambios-coste |
| 3 | revision-ronda3-calculo, revision-ronda3-pantallas | 6 + 7 | cambios-cuadrante-r3, cambios-pantallas-r3 |
| 4 | Ejemplo a tamaño real y holgura | | cambios-r4 |
| 5 | revision-ronda5-calculo, revision-ronda5-pantallas | 2 + 2 | cambios-motor-r5, cambios-pantallas-r5 |
| 6 | revision-ronda6-calculo, revision-ronda6-pantallas | 3 + 2 | cambios-motor-r6, cambios-pdf-r6 |
| 7 | revision-ronda7-calculo, revision-ronda7-pantallas | 2 + 1 | cambios-motor-r7, cambios-lectura-r7 |

## Lo que decide Crescente

- Cifras de "Con Shifty" (9 min, 81 %, 4,89, 701 anuncios): no constan aprobadas; quitarlas o aprobarlas.
- Nombres de los empleados: se guardan con el plan y los lee quien tenga el enlace corto; los planes con dueño no caducan y no hay botón de borrar (regla 17). Decidir caducidad y borrado.
- Punto 19, Gemini a Luna: necesita la clave de OpenAI en el proyecto freetools.
- Descanso semanal: queda en 36 h; la STS 274/2026 está por confirmar con un laboralista.
