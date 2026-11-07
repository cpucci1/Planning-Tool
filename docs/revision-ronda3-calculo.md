# Revisión ronda 3: el cálculo, mirado por un director de operaciones y por un laboralista

Fecha: 2026-11-04. Rama revisada: `.worktrees/Planning-Tool-revision-flujo`. Solo lectura del código.

**Cómo se ha verificado.** Además de `npm run verificar` (demo: 22 personas, 596,5 h necesarias, 666,5 h en turnos, 684 h contratadas), se ha montado un banco propio en `node_modules/.tmp/r3/` (`h.ts` y casos `c1` a `c9`) que pasa el motor real (`necesidad`, `staffing`, `roster`, `contracts`, `avisos`, `ausencias`, `metricas`) y comprueba por su cuenta, sin fiarse de los avisos de la herramienta: jornadas de más de 9 h, jornadas de menos de 4 h, hueco y arco de la partida, descanso de 12 h entre jornadas, descanso semanal de 36 h, cobertura por puesto y uso de contrato. Cada hallazgo de abajo se ha reproducido con ese banco. Lo que ya está en `docs/revision-flujo-2026-11-04.md` no se repite salvo que esté mal resuelto, y se dice.

Casos usados (comensales simultáneos en hora punta, por día de la semana):

| Caso | Horario | Forma |
|---|---|---|
| Pequeño | 13:00 a 16:30 y 20:30 a 24:00, L a D | 20 a 45 comensales, 5 a 6 personas |
| Mediano con mandos | igual, encargado 1 y jefe de cocina 1 | comida 90 a 150, cena 60 a 130 |
| Solo comidas | L a V 13:00 a 16:30 | 60 a 110 |
| Solo cenas | 20:30 a 00:30 | 40 a 90, pico V y S |
| Continuo | 08:00 a 02:00 los 7 días | curva de cafetería, comida, merienda, cena y copa |
| Cierra lunes y martes | X a D, comida y cena | 70 a 140 |
| Cafetería de desayunos | 07:30 a 12:00 | pico 9:00 |
| Bar de copas | J a S 23:00 a 05:30 | pico 01:30 |
| Estacional | verano x2,2 sobre invierno | |
| Enorme | pico 488 sentados | |
| Dato raro | un sábado x10 en una semana | |

---

## Graves

### G1. Los mandos se multiplican: tres a cinco jefes de cocina para una sola cocina
Punto 2 de la revisión anterior: **mal resuelto**.
- **Entrada.** Mediano con mandos: comida 13:00 a 16:30 y cena 20:30 a 24:00, encargado 1 y jefe de cocina 1 en el equipo.
- **Qué sale.** La herramienta añade 1 responsable de turno y 2 jefes de cocina más: 3 jefes de cocina, los tres a 40 h, 17 personas frente a 11 sin mandos, 9.041 €/semana. Con el continuo de 08:00 a 02:00 añade 4 responsables de turno y 4 jefes de cocina: 5 jefes de cocina y 39 personas frente a 29. Los turnos de mando son de 8 h seguidas cruzando la tarde muerta: "Jefe de cocina 1" de 16:30 a 00:30 con la cocina cerrada de 17:00 a 19:30; un refuerzo de 14:00 a 22:00. Los dos encargados de 30 h libran los dos martes, miércoles y jueves, y por eso se añaden dos responsables de turno de 40 h.
- **Qué debería salir.** Un jefe de cocina con partida que cubra los dos servicios, y en los días que libra lo cubre el segundo de cocina (un cocinero), no un segundo jefe. Un encargado más un responsable de sala que se reparten las libranzas. Ningún mando debería estar 3 h en el local sin servicio.
- **Dónde.** `src/lib/roster.ts`, `planificarMandos` (aprox. l.1590 a 1680): añade mandos del último rol de la lista hasta que todos los días tienen relevo; `repartirMandos` calcula relevos como el techo del arco del día entre el diario mínimo y solo parte la jornada si el abierto cabe en `Math.min(tope, corto)`.

### G2. El responsable de sala libra viernes y sábado, y manda un parcial de 10 h
- **Entrada.** Pequeño, solo cenas, cafetería, cierra lunes y martes, estacional: catálogo por defecto.
- **Qué sale.** Pequeño: "Responsable 1" trabaja L a J y D; los viernes y sábados lleva la sala "Responsable 2", de 16 h. Solo cenas: "Responsable 2" de 10 h y 8 h es quien está V y S. Cafetería: "Responsable 1" libra S y D, sus días fuertes. En la demo, "Responsable de sala 1" solo hace la cena del viernes y del sábado y la comida la lleva el de 27 h.
- **Qué debería salir.** El responsable de jornada completa trabaja los días fuertes y libra los flojos; el parcial cubre su libranza. Es lo primero que mira un director de operaciones al ver un cuadrante.
- **Dónde.** `src/lib/roster.ts`, `repartirPorLibranzas` y `semanasParciales`: al parcial de dos días se le dan los días de más fuerza, y por tanto la jornada completa libra justo esos. El responsable de sala es un rol de volumen en `src/data/presets.ts`, así que no pasa por `planificarMandos` y nada lo protege.

### G3. Refuerzos de 4 h que entran antes de abrir y se van en pleno servicio
- **Entrada.** Solo comidas L a V 13:00 a 16:30. Cafetería 07:30 a 12:00. Continuo 08:00 a 02:00.
- **Qué sale.** Solo comidas: "Ayudante" de 10:30 a 14:30, "Office" de 11:30 a 15:30, "Cocinero 2" de 12:00 a 16:00: se marchan entre 14:30 y 16:00 con la sala llena. Cafetería: "Office" de 05:30 a 09:30, dos horas antes de abrir y se va en el pico de las 9:00 a 10:00. Continuo: "Office" de 06:00 a 10:00.
- **Qué debería salir.** Si el turno corto hay que alargarlo hasta las 4 h mínimas, se alarga hacia el final del servicio (cierre de cocina, recogida, friegue), no hacia antes de abrir. Un refuerzo que se va en el pico no refuerza.
- **Dónde.** `src/lib/roster.ts`, `rellenar` (aprox. l.150 a 165): cuando la ventana es el propio pico, lo que falta para llegar al mínimo se resta siempre del inicio (`start -= snapUp(falta)`).

### G4. Local continuo de 08:00 a 02:00: 29 personas, 24 parciales y 5 responsables de sala
- **Entrada.** Continuo 08:00 a 02:00 los 7 días.
- **Qué sale.** Los relevos parten la ventana en trozos iguales de 6,5 h: 29 personas, 5 a jornada completa y 24 parciales de 26 a 34 h. Para un único puesto de responsable de sala salen 5 personas (33, 33, 33, 26 y 13 h). Horarios que cambian cada día para la misma persona: "Cocinero 3" lunes de 20:00 a 02:30, jueves de 07:00 a 13:30, viernes de 13:30 a 20:00.
- **Qué debería salir.** Dos turnos tipo estables (mañana y tarde noche) de 8 a 9 h, mayoría de jornadas completas, y la persona fija en su turno. Contradice la tesis de la propia herramienta, "pocos de muchas horas".
- **Dónde.** `src/lib/roster.ts`, `relevos` (reparto en piezas iguales del arco) y `empaquetar` (greedy sin preferencia de mismo turno).

### G5. El propio generador rompe las 12 h de descanso entre jornadas
- **Entrada.** Mediano con mandos.
- **Qué sale.** "Jefe de cocina 2": miércoles de 16:30 a 00:30 y jueves de 12:00 a 20:00, 11,5 h de descanso. El cuadrante lo ha hecho la herramienta, no el usuario. Con el descanso de 12 h activado, el aviso sale, pero la herramienta presenta como propuesta suya algo que incumple el art. 34.3 ET.
- **Qué debería salir.** Una restricción dura al construir, no un castigo. Si de verdad no cabe, decir qué falta.
- **Dónde.** `src/lib/roster.ts`, `descansoRoto` entra solo como penalización (castigo 1000) en la elección, y `planificarMandos` coloca los turnos de mando sin mirarlo.

### G6. Las ventas de la demo no casan con los comensales: 4,25 € por comensal
- **Entrada.** Demo (`npm run verificar`).
- **Qué sale.** 26.000 €/semana para unos 6.112 comensales de la curva: 4,25 € de ticket medio en un restaurante de comida y cena. La propia demo enseña el ratio de personal en rojo, 39 %.
- **Qué debería salir.** Un ticket creíble de restaurante (de 20 a 35 €) o ventas coherentes con la curva. Quien abre la demo ve una alarma roja nada más entrar, y la primera impresión es que la herramienta se equivoca.
- **Dónde.** `src/data/presets.ts:264` (`DEMO_VENTAS_SEMANA = 26000`) frente a la curva de la demo en `src/lib/fakeAI`.

---

## Medios

### M1. El ratio sobre ventas no incluye la cobertura de ausencias
- **Entrada.** Demo.
- **Qué sale.** 10.224 €/semana sobre 26.000 = 39 %. La cobertura de vacaciones, festivos y bajas que la herramienta calcula aparte (2,17 jornadas, 67.424 €/año, 1.297 €/semana después de las semanas flojas) no entra: con ella el ratio es 44 %.
- **Qué debería salir.** El ratio que se compara con el umbral sano (30 %) y de alarma (35 %) tiene que ser el coste completo, o decir explícitamente que no incluye ausencias.
- **Dónde.** `src/steps/StepResult.tsx:346 a 350` (ratio con `weeklyCostEur`) frente a `costeAusenciasEur` en l.319.

### M2. Titular de picos en horas entre 40, y un día anómalo genera "faltan 11 personas"
- **Entrada.** Mediano con un sábado x10 en una semana.
- **Qué sale.** El sábado no se excluye (solo se excluyen cierres por debajo del 15 % de la mediana) y sale como "Pico sin identificar". El titular dice "peor semana 11: faltan 11 personas (404 h)", calculado como horas entre 40.
- **Qué debería salir.** Un día así se marca como dato raro y se pregunta, no se planifica. Y si la tesis es que "el número lo marca el pico", las personas que faltan salen del pico, no de dividir horas por 40.
- **Dónde.** `src/lib/contracts.ts:187` (`peopleInWorstWeek = Math.ceil(worstWeekHours / fullTimeHours)`); `src/lib/holidays.ts`, `detectSpecialWeeks`, que no descarta picos anómalos.

### M3. Descanso semanal: seis días seguidos con menos de 36 h, sin aviso
- **Entrada.** Mediano con "libranzas seguidas" desactivado.
- **Qué sale.** 4 personas trabajan 6 días; 2 cocineros tienen como máximo 35,5 h de descanso semanal seguido. Cero avisos. El comentario del código justifica un solo día con "el descanso semanal de un día no se negocia (Art. 37.1 ET)", cuando el 37.1 ET dice día y medio (acumulable por periodos de hasta 14 días).
- **Qué debería salir.** Comprobación de 36 h semanales (o su acumulación en 14 días) y aviso si no se cumple. Hoy `avisos` no lo mira.
- **Dónde.** `src/lib/contracts.ts:58 a 61` (`diasPorPersona = consecutiveDaysOff ? 5 : 6`); `src/lib/avisos.ts`, sin comprobación de descanso semanal.

### M4. Si se apaga el descanso o se sube el tope, la herramienta certifica que está bien
- **Entrada.** Mediano con el descanso de 12 h desactivado; o tope diario a 10 o 12 h.
- **Qué sale.** Con el descanso apagado, cocineros a 11,5 h entre jornadas y cero avisos: la comprobación se salta entera. El selector deja tope diario de 10 y 12 h y turno máximo de hasta 12 h, y la revisión dice "nadie pasa de 12 h" como comprobación hecha.
- **Qué debería salir.** El límite legal (9 h ordinarias salvo convenio, 12 h entre jornadas) se avisa siempre, aunque el usuario quite la preferencia; la preferencia puede ser más estricta, nunca más laxa sin avisar.
- **Dónde.** `src/lib/avisos.ts` (descanso solo si `minRestBetweenShifts`; tope comparado con el del usuario y `comprobacionesHechas`); `src/steps/StepTeam.tsx:52` y `:55` (`MAX_SHIFT_HOURS` hasta 12, `MAX_DAILY_HOURS = [8, 9, 10, 12]`).

### M5. La nocturnidad no entra en el coste
- **Entrada.** Bar de copas J a S de 23:00 a 05:30.
- **Qué sale.** 11 personas en horario nocturno, aviso de nocturnidad, y 2.542 €/semana de coste sin ningún plus.
- **Qué debería salir.** El plus de nocturnidad (art. 36.2 ET, el porcentaje lo fija el convenio, típico 25 %) sumado al coste de las horas entre 22:00 y 06:00, o un aviso de que el coste lo deja fuera.
- **Dónde.** `src/lib/avisos.ts` (avisa) frente a `src/lib/contracts.ts`, `summarizeCost` (no lo suma).

### M6. El office se va antes de terminar el servicio
- **Entrada.** Cierra lunes y martes, comida y cena.
- **Qué sale.** "Office" de 12:00 a 15:30 y de 19:30 a 22:30, con servicio hasta 00:00 a 00:30. En la demo, "Office 1" sale a las 17:30 casi todos los días y el friegue de la cena queda a otro. Nunca se queda nadie del office para la vajilla después del último servicio.
- **Qué debería salir.** El office cierra: su "después" del servicio es más largo que el de sala.
- **Dónde.** `src/data/presets.ts`, preparación por rol (el office no tiene margen posterior propio), y `src/lib/roster.ts`, `rellenar` (G3).

---

## Menores

### m1. Local enorme: el último tramo tapa la necesidad sin decirlo
- **Entrada.** Pico de 488 sentados.
- **Qué sale.** El último tramo por defecto (301 o más) aplica 17 personas en silencio. El comentario dice "mejor pasarse que quedarse corto", pero aquí es quedarse corto.
- **Qué debería salir.** Escalar por encima del último tramo o avisar de que el dato está fuera del catálogo.
- **Dónde.** `src/lib/staffing.ts:23`, `tierFor`.

### m2. Dos cifras distintas para "las horas que sobran", y el CSV enseña contratos que no son
- **Entrada.** Demo.
- **Qué sale.** "Horas pagadas sin servicio" y la columna "Holgura/semana" del CSV dicen 88 h (contratadas menos necesarias); las métricas dicen "Horas de más" 70 h. El CSV pone "Contratos activos: 40h, 30h, 20h, 15h" cuando los contratos son a medida (34, 33, 31...).
- **Qué debería salir.** Una sola cifra con un solo nombre en pantalla, CSV y PDF; y la lista de contratos reales.
- **Dónde.** `src/steps/StepResult.tsx:906` (`plan.slackHours`) frente a `:1258` (`horasSobrantesTotal`); `src/lib/export.ts` (contratos activos y holgura).

### m3. Sala sin preparación: los camareros entran a la hora de abrir
- **Entrada.** Cualquiera.
- **Qué sale.** Camareros de 13:00 a la apertura de las 13:00, sin montar sala. Punto 7 de la revisión anterior, resuelto a medias.
- **Qué debería salir.** De 15 a 30 minutos antes para montar.
- **Dónde.** `src/data/presets.ts:213` (`beforeMin: 0` en sala).

### m4. El multiplicador del coste por hora trabajada suma Seguridad Social aunque el coste ya sea de empresa
- **Entrada.** Coste base "empresa".
- **Qué sale.** El multiplicador aplica la cotización igual.
- **Dónde.** `src/steps/StepResult.tsx:322`, `multiplicadorHoraTrabajada`.

---

## Lo que se ha comprobado y está bien

- La suma del coste por puesto del CSV coincide con el total (10.224 €).
- Sin huecos de cobertura en ningún caso con los valores por defecto.
- Ninguna jornada pasa de 9 h con los valores por defecto.
- Coste por hora trabajada 1,53 veces el de contrato, coherente con vacaciones, festivos y bajas.
- Complementarias con tope conservador.
- Las semanas de cierre se excluyen de la semana tipo.
- La rueda de libranzas es parcial y está documentado.
