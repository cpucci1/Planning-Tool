# Cuadrante, ronda 3 (2026-11-04)

Arreglos del motor del cuadrante a partir de `revision-ronda3-calculo.md` y
`revision-ronda3-pantallas.md`. Solo el motor: `roster.ts`, `staffing.ts`,
`necesidad.ts`, `avisos.ts`, `metricas.ts`, `semana.ts` y `contracts.ts`, más
cambios mínimos y aditivos en `types.ts`, `presets.ts`, `StepResult.tsx`,
`informe-pdf.ts`, `export.ts`, `CuadranteConFechas.tsx` y `usePlanner.ts`.

Las cifras salen del banco de la revisión (casos c1 a c9). "Antes" es el
estado al empezar esta ronda, con las rondas 1 y 2 ya puestas.

## Lo que se ha arreglado

### 1. Los mandos ya no se multiplican (G1)

**Antes.** `planificarMandos` contaba relevos por día (el arco del día entre
la jornada) y añadía mandos hasta que todos los días tenían uno. Con encargado
1 y jefe de cocina 1 salían 3 jefes de cocina y un responsable de turno de
más; con 8:00 a 2:00, 5 jefes y 4 responsables de turno.

**Ahora.** Como lo monta un director de operaciones:
- el mando libra los días flojos, y si hay varios, en días distintos;
- cada día hace su jornada donde más falta hace, pesando más las franjas con
  más gente; si la zona tiene comida y cena, una partida que coge los dos
  servicios, no ocho horas seguidas cruzando la tarde con la cocina cerrada;
- cuando libra, o en las horas que su jornada no alcanza, se queda al frente
  el segundo de la zona: el primer puesto de esa zona con gente en el
  cuadrante (en el catálogo de ejemplo, responsable de sala y cocinero). El
  cuadrante lo dice en un aviso nuevo (`mando-relevo`) con los días y las horas;
- solo se añade otro mando si quedan ratos con la zona abierta sin NADIE de
  ella, y solo si ese mando cubre al menos una jornada suya entera de esos
  ratos. Media hora al abrir no justifica un contrato: se dice en el aviso.

| Caso | Antes | Ahora |
|---|---|---|
| c4 mediano, encargado 1 y jefe 1 | 17 personas, 3 jefes, +1 resp. turno, 9.041 €/sem | 14 personas, 1 jefe, ningún mando añadido, 6.663 €/sem |
| c4 encargado, resp. turno y jefe | 17 personas | 15 personas |
| c8 continuo 8 a 2, encargado y jefe | 39 personas, 5 jefes, 4 resp. turno | 31 personas, 1 jefe, 1 encargado |
| c8 dos encargados de 30 h | +2 resp. turno de 40 h | ninguno añadido; libran en días distintos |

Jefe de cocina del c4: Lu, Ju, Vi, Sá, Do de 12:30 a 15:30 y de 19:30 a 00:30.

### 2. Las 12 h entre jornadas son límite duro para los mandos (G5)

Antes era un castigo en la puntuación y el jefe de cocina 2 del c4 tenía
11,5 h de miércoles a jueves. Ahora un turno de mando que rompe las 12 h con
su día de antes o el de después no se coloca, domingo y lunes incluidos. El
resto del cuadrante ya lo cumplía; `comprobar-cuadrante` lo mira en todos
los casos, también al cambiar de semana en la rueda.

### 3. El responsable de jornada completa está los días fuertes (G2)

En un puesto que hace una sola persona cada día, el parcial va a los días
flojos y el de jornada completa se queda los fuertes. c1 pequeño: antes el
Responsable 1 (40 h) libraba viernes y sábado y el Responsable 2 (16 h) se
quedaba a cargo; ahora el de 40 h trabaja de miércoles a domingo y el de 16 h
lunes y martes. En la demo (c9) el responsable de 40 h ya estaba viernes y
sábado: hace la cena, que es lo más largo, y el parcial la comida, porque
comida y cena juntas pasan del tope de 9 h.

### 4. Los refuerzos no entran antes de abrir (G3)

`rellenar` alargaba los turnos cortos hacia atrás. Ahora alarga hacia el
cierre, primero dentro de su servicio y después dentro de lo que abre su
zona; solo si no cabe, hacia antes, y nunca a horas sin servicio de su zona
mientras haya otra salida. c1 solo comidas: Ayudante de 10:30 a 14:30 pasa a
13:00 a 17:00; Cocinero 2 de 12:00 a 16:00 pasa a 13:30 a 17:30. Cafetería:
el office ya no entra a las 5:30.

### 5. El office se queda a recoger (G7)

Puesto nuevo opcional en el catálogo, `cierraServicio` (en el ejemplo, el
office). En el último tramo de cada día su necesidad se alarga hasta la
recogida de su zona más media hora. Cuesta horas: en la demo la necesidad pasa
de 596,5 a 601 h y los turnos de 666,5 a 670,5 h, con las mismas 22 personas.
En el mediano sin libranzas seguidas (c4 y c6) sale una persona más, 11 a 12 y
14 a 15, por esas horas del office.

### 6. Descanso semanal y ajustes por encima de la ley (G6)

- Aviso legal nuevo cuando alguien no tiene día y medio seguido (36 h) en la
  semana, que se repite (art. 37.1 ET). El comentario de `contracts.ts` que
  hablaba de un día está corregido. Mediano sin libranzas seguidas: Cocinero 2
  (35,5 h) y Office 2 (35 h) salen avisados; antes, ninguno.
- Si se apagan las 12 h entre jornadas, un aviso dice que la ley las pide
  salvo convenio y cuántas jornadas quedan por debajo (c4 sin 12 h: 6). Antes,
  cero avisos.
- Si el máximo diario pasa de 9 h, un aviso dice que la ley pone 9 h salvo
  convenio o acuerdo de empresa, y cuántas jornadas pasan de 9.

### 7. Jornadas partidas, con la cifra de verdad (G8)

El cuadrante guarda cuántas personas más harían falta con todo seguido
(`roster.partidas`), comparando con la mejor plantilla sin ninguna partida.
En la demo: 64 partidas, y sin ellas harían falta 14 personas más. La tarjeta
ya no dice "solo donde ahorran a alguien": dice "sin ellas harían falta 14
personas más". Siguen siendo mayoría porque en un local de comidas y cenas
con tres horas muertas en medio, una persona por servicio dobla la plantilla.
Las partidas de los mandos no cuentan: el mando parte para estar en los dos
servicios, no para ahorrar a nadie.

### 8. La plantilla se explica sumando exacto (G9)

`drivers.desglose` reparte cada persona en pico, calendario, turnos que no
encajan al minuto y mandos, y suma el total. Demo: antes "17 por el pico y 4
por el calendario" con 22 personas y "es el mínimo"; ahora "22 personas: 17
por el pico, 4 por el calendario y 1 porque los turnos no encajan al minuto".
La misma frase en el PDF (`informe-pdf.ts`). Se quita "es el mínimo"; el
consejo de permitir jornada partida solo sale si está apagada.

### 9. El titular de picos sale del pico real (M2 de la revisión)

`analyzePeaks` deja fuera los días con más de tres veces lo normal de su día
de la semana (lunes con lunes) y los cuenta como un día normal; los devuelve
en `diasRaros`. La gente de más sale de cuánta gente más coincide a la vez en
el peor momento de la peor semana frente a la semana tipo, con la misma cuenta
que la plantilla. c5 con un sábado x10: antes "semana 11, faltan 11 personas
(404 h)"; ahora semana 5, 7 h, 1 persona. Demo: antes 6 personas por 223 h
entre 40; ahora 1 persona más a la vez.

### 10. Códigos de semana claros (G11)

L libra; P dos tramos; N sale a las 23:00 o más tarde; M entra antes de las
12:00 y su mitad cae antes de las 14:00; T todo lo demás (mediodía y tarde).
13:00 a 17:30 ya no sale "M · Mañana": es T.

### 11. Una sola cifra de horas de más (G12)

"Horas pagadas sin servicio" es ahora la suma de dos partes con fuente única:
las horas en el local de más (la misma cifra que la tarjeta "Horas de más",
de `horasDeMasEnElLocal` en `metricas.ts`) y las de contrato sin turno. Demo:
antes 88 y 70 sin explicar; ahora 86 = 69,5 en el local de más + 16,5 de
contrato sin turno, y la tarjeta lo dice. El CSV trae las dos partes y el
total, y "Contratos del cuadrante" con las jornadas que de verdad lleva, no la
lista de ajustes.

### 12. Turnos más estables (G4, a medias)

Al final, dentro de cada puesto, se intercambian jornadas del mismo día y de
las mismas horas entre dos personas si así cada una repite más su familia de
turno. No cambia la plantilla, las libranzas, las horas ni los contratos.

## Lo que no se ha resuelto del todo

- **Continuo de 8:00 a 2:00 (G4).** Siguen 29 personas y 5 responsables de
  sala. Con la zona abierta 18,5 h al día y 9 h de tope, hacen falta tres
  relevos diarios: 21 jornadas a la semana entre cinco días por persona dan 5
  responsables, que es el mínimo con cobertura completa. Los responsables 2 y
  3 ya son estables (siempre de tarde, siempre de mañana), pero el 1 y el 4
  mezclan noche y tarde: quien cierra a las 2:30 no puede entrar al día
  siguiente ni a las 8 ni a las 14 sin romper las 12 h, y el intercambio entre
  dos no llega a recolocarlo sin rehacer las libranzas. "Pocas personas con
  muchas horas" tampoco cambia: lo marcan los tramos y el turno más corto, no
  el reparto.
- **Día raro.** Se deja fuera del cálculo de picos y se devuelve en
  `diasRaros`, pero preguntarle al usuario es de pantalla y no está hecho.
- **RosterGrid.tsx** sigue calculando su propia holgura (contratadas menos
  necesarias) para la cabecera del cuadrante editable. Sin franjas sin cubrir
  da lo mismo que la nueva; es de pantallas y no se ha tocado.
- **El descanso semanal** solo avisa: el generador no lo fuerza con las
  libranzas seguidas apagadas.

## Comprobaciones

Todo en verde: `npx tsc -b`, `npm run verificar`, `npm run comprobar-cuadrante`,
`npm run comprobar-coste`, comprobar-demanda (20 de 20) y la lectura de
ficheros (153 de 153).

`comprobar-cuadrante` cambia en tres cosas:
- "siempre un mando" pasa a "siempre alguien de la zona, y lo que quede sin
  nadie lo dice el cuadrante";
- el tope de horas en turnos de la demo sube de 670 a 671 por el office que
  se queda a recoger (666,5 a 670,5 h, mismas 22 personas);
- sección nueva de la ronda 3, con casos que siguen el mismo camino que la
  app. Falla si vuelven: más de un jefe de cocina con uno pedido (mediano y
  continuo de 8 a 2), mandos de sala añadidos, más de 15 personas en el
  mediano con mandos, un mando más de media hora en el local con su zona
  cerrada, un mando librando un día fuerte, sin aviso de quién queda al
  frente, el responsable de 40 h librando viernes o sábado, alguien entrando
  antes de que abra su zona, el office yéndose antes de la recogida de cocina,
  descanso semanal por debajo de 36 h sin aviso, ningún aviso con las 12 h
  apagadas o el tope a 10 h, un desglose que no suma, horas de más con dos
  cifras, y un sábado x10 que no sale como raro o da más de 3 personas.

El caso grande (68 personas) queda entre 80 y 175 ms, por debajo del tope de
300. La prueba del responsable se ha comprobado a la inversa: con el orden de
antes, falla.
