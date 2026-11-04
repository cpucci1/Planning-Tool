# Cuadrante, segunda ronda (2026-11-04)

Objetivo: que un encargado con quince años de hostelería mire el cuadrante y no vea nada que delate a alguien sin oficio. Sigue a `cambios-cuadrante-2026-11-04.md` (primera ronda) y a los puntos 12, 22 y 24 de `revision-flujo-2026-11-04.md`.

## 1. Menos gente suelta y menos horas de más

### Antes y después (`npm run verificar`, datos de ejemplo)

| | Antes | Después |
|---|---|---|
| Personas | 26 | 22 |
| Horas que pide el servicio | 596,5 | 596,5 |
| Horas en turnos | 727,5 | 666,5 |
| Horas contratadas | 744 | 684 |
| Turnos a la semana | 111 | 100 |
| Contratos de 10 h sueltos | una cola de varios | 2, y los dos son de fin de semana entero (sábado y domingo) |
| Pico simultáneo | 17 | 17 |

### Por qué salían 26

Medido variante a variante con el código de antes:

- **El tope de 9 h al día no deja juntar comida y cena.** La comida con su preparación son unas 5,5 h y la cena otras 5,5 (hasta la 01:00 el viernes y el sábado). Juntas pasan de 9 h, así que el reparto voraz ponía a una persona por servicio. Con tope de 12 h salían 23.
- **Las 12 h de descanso.** Cerrar a las 00:30 o a la 01:00 y abrir a las 12:00 deja 11 a 11,5 h, así que quien cierra no puede abrir al día siguiente. Sin esa regla salían 23.
- **El reparto voraz dejaba cola.** Iba llenando a la primera persona, luego a la segunda, y lo que sobraba al final eran contratos de 10 h con un día suelto.
- **Dos libranzas seguidas con sábado y domingo en pico.** Si los dos días del fin de semana piden 7 camareros, con libranzas seguidas no basta con 7. Con libranzas sueltas salían 23.
- **La preparación y la recogida** suman 74 h a la semana. Sin ellas saldrían 21.

### Qué se ha cambiado (`src/lib/roster.ts`)

1. **Jornadas por día antes que personas.** Cada servicio se corta en piezas de varias longitudes y las piezas de comida y de cena se emparejan por un emparejamiento máximo: cada pareja tiene que caber en el tope diario, dejar al menos una hora de hueco y no estirarse tanto que impida volver al día siguiente con 12 h de descanso. Así una persona hace comida y cena siempre que se puede, en vez de una por servicio.
2. **Reparto semanal por patrones de libranza.** Se eligen cuántas personas libran cada par de días seguidos para que cada día haya tantas como jornadas pide, y se prueba también con **un parcial de fin de semana** (días seguidos que caen en sábado y domingo). Luego se asignan las jornadas día a día con el descanso de 12 h comprobado contra el día anterior y el siguiente.
3. **Se elige el mejor reparto por este orden:** menos personas, nada sin cubrir, ninguna persona de cola (menos de dos días o por debajo del contrato mínimo), menos partidas, y lo más concentrado posible.
4. **Contratos casi completos se redondean a 40 h.** Si a alguien le salen 36 h o más (a 4 h o menos de la jornada completa), se le da la completa: nadie contrata a un camarero a 37 h. Constante `CASI_COMPLETA_H`.
5. **La preparación por zona llega también a los mandos.** `contextoCuadrante` en `src/hooks/usePlanner.ts` usaba la preparación general para el horario de los mandos y no la de su zona (cocina abre una hora antes, sala no).

### Por qué no salen menos de 22

Se puede explicar puesto a puesto:

- **Camareros, 8.** El sábado y el domingo piden 7 cada uno. Con dos libranzas seguidas, 7 a jornada completa no llegan: hace falta uno más, y es un parcial de fin de semana de 11 h.
- **Ayudantes, 4.** Hay 16 jornadas a la semana, más de las que dan 3 personas a cinco días.
- **Responsables de sala, 2.** La cena del viernes y del sábado acaba a la 01:00: la partida pasa de 9 h y hace falta otro para cubrirla.
- **Cocineros, 5, y office, 3.** Salen de los días y de las jornadas, sin cola.

Por horas bastarían 14,9 jornadas completas, pero el pico simultáneo de 17 y el calendario (descansos, libranzas y tope diario) mandan.

## 2. La rueda de semanas (punto 12)

Nuevo `src/lib/semana.ts`. El cuadrante tipo es una semana que se repite, y así siempre libran los mismos. Ahora:

- Se agrupa a quien puede cambiarse la semana: **mismo puesto y mismo contrato a jornada completa**. Cada semana, cada uno hace la fila de otro compañero del grupo, y al cabo de tantas semanas como personas tiene el grupo vuelve a la suya.
- El orden en que se pasa de una fila a la siguiente se elige para que **el domingo de una semana y el lunes de la siguiente respeten las 12 h** y salgan los menos días seguidos posibles. Si no hay ningún orden que respete las 12 h, ese grupo no rota y la pantalla lo dice.
- **Los parciales no rotan:** su contrato es de unos días concretos (un fin de semana, unas tardes entre semana), y cambiárselos sería cambiarles el contrato. La pantalla lo dice.
- La tarjeta "Findes: el que más y el que menos" cuenta ahora la media de la vuelta. Si alguien que no rota se queda sin ningún finde, la tarjeta lo dice con el número de personas en vez de enseñar solo "2 y 0".

Con los datos de ejemplo rotan 7 personas (4 camareros y 3 cocineros de 40 h) y sus findes salen iguales para todos. **Lo que no se resuelve:** quien va solo con su contrato (por ejemplo el único responsable de sala a 40 h) repite siempre su semana. Con el CSV de prueba eso deja a un responsable de 40 h sin ningún finde y a 3 parciales de entre semana igual. No es ilegal y la pantalla lo cuenta, pero un encargado lo cambiaría a mano. Arreglarlo de verdad pide que el cuadrante reparta los findes al montar la semana, no después; queda pendiente.

## 3. Noche y menores (punto 22)

En `src/lib/avisos.ts`:

- **Trabajo nocturno (Art. 36 ET).** Quien hace 3 h o más entre las 22:00 y las 06:00 en la mitad o más de sus días es trabajador nocturno. Se avisa de que esas horas llevan el plus que diga el convenio y de que no puede hacer horas extra. Si además pasa de 8 h al día de media, es un incumplimiento.
- **Menores de 18 (Art. 6 ET).** Nuevo dato opcional `Role.menores` (en `types.ts`, aditivo) con una casilla "Menores de 18" en el catálogo de puestos. Si está marcada, se avisa como incumplimiento de cualquier turno pasadas las 22:00 o de más de 8 h, agrupado por persona, y de la pausa de 30 minutos en los tramos de más de 4 h 30.

**Lo que no se hace:** el cuadrante no planifica a los menores aparte, solo avisa. Y la marca es por puesto, no por persona: si un puesto tiene un menor y varios adultos, hay que crear un puesto para el menor.

## 4. El cuadrante con fechas (punto 24)

Nueva vista "Con fechas" en el cuadrante (`src/components/CuadranteConFechas.tsx`):

- Se elige el lunes de la semana; por defecto, la primera que todavía se puede publicar con **cinco días de preaviso** (Art. 34.2 ET). Arriba sale "Publícalo como tarde el miércoles 4 de noviembre", o un aviso si ya no llega.
- Cada día lleva su código, **M** (mañana), **T** (tarde y noche), **P** (partido) o **L** (libra), con las horas cortas debajo ("13-17:30", "19:30-24"), las horas de la semana de cada persona y una fila final con cuánta gente trabaja cada día.
- Con rueda, cada semana enseña la fila que le toca a cada uno, y el texto dice qué semana de la rueda es.
- **"PDF para colgar":** el PDF de antes ("Cuadrante de cocina") ahora lleva fechas, códigos, horas por persona, la fila de cuánta gente trabaja y la leyenda. Con los datos de prueba (22 personas) cabe en **una sola hoja A4**, a letra 6,5. El botón de la cabecera hace el mismo PDF sin fechas.
- **Imagen para WhatsApp de la semana entera:** no se ha hecho. Ya existe la imagen del turno de cada persona ("Su turno"), y el PDF de una hoja se manda bien por WhatsApp.

## 5. Textos revisados

- "Pagadas sin servicio" explica de dónde salen esas horas, y dice cuántas son de contrato sin turno. "Contratadas" enseña también las horas en turnos, así cuadran con "Horas de más" de la revisión: horas de más (en turno sin servicio) más horas sin turno igual a pagadas sin servicio.
- "Para la cocina (PDF)" pasa a "PDF para colgar": también lo cuelga la sala.
- En la tabla de plantilla, "Horas/sem" pasa a "Horas de contrato".
- En la miniatura de portada (`QueVasAObtener.tsx`), el reparto de contratos se copia de `npm run verificar`: 8 de 40 h, 10 de 25 a 34 h, 2 de 20 a 24 h y 2 de fin de semana, 22 en total.

## Comprobaciones

- `npx tsc -b`: cero errores.
- `npm run verificar`: 22 personas, 596,5 h que pide el servicio, 666,5 h en turnos, 684 h contratadas, 0 h sin cubrir.
- `npm run comprobar-cuadrante`: "Todo en regla". Casos nuevos:
  - 12 h de descanso dentro de la semana y en cada cambio de semana de la rueda.
  - Libranzas seguidas.
  - Nadie que no sea mando viene un solo día.
  - El caso de verificar no puede volver a pasar de 22 personas ni de 670 h en turnos.
  - Los contratos de menos de 20 h son de fin de semana.
  - La rueda reparte los findes por igual y nadie repite fila.
  - Los códigos M/T/P/L están bien.
  - Primera semana publicable y plazo, del miércoles 4 al lunes 9, y del jueves 5 al lunes 16.
  - Saltan los avisos de menores y de nocturnos.
- Comprobación de demanda: 20 comprobaciones pasadas, 0 fallidas.
- Navegador, con `node_modules/.tmp/tpv-prueba.csv`:
  - La vista con fechas, la rueda, el aviso de nocturno y las cifras de la cabecera cuadran entre sí.
  - El PDF sale en una página.

El caso grande (68 personas) tarda entre 90 y 260 ms según la carga de la máquina, por debajo del tope de 300 ms pero más cerca que en la primera ronda.
