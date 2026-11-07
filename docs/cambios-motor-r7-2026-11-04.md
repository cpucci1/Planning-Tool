# Cambios del motor, ronda 7 (04-11-2026)

Responde a `docs/revision-ronda7-calculo.md` y a las cifras de `docs/revision-ronda7-pantallas.md`.
Cifras del banco `node_modules/.tmp/r7/` con semilla 7, salvo que se diga otra cosa.

## G1. Las vacaciones se toman con el local cerrado

Si el local cierra semanas enteras y paga nómina las 52 (no es de temporada), los días de vacaciones
que caben en el cierre (hasta los 30) ya no se cubren con nadie. Aplica en pantalla, CSV y PDF, que
leen la misma función (`src/lib/ausencias.ts`, parámetro nuevo `semanasCerradas`). El texto lo dice:
"sin los N días de vacaciones que se toman con el local cerrado". El CSV lleva una fila nueva.

Menú de 10 personas:

| Semanas cerradas | Horas de vacaciones a cubrir | Coste tras semanas flojas | Jornadas |
|---|---|---|---|
| 0 | 1.091 h | 38.394 € | 1,47 |
| 2 | 578 h | 28.733 € | 1,17 |
| 4 | 73 h (antes 1.091) | 24.549 € (antes 38.869) | 0,87 |
| 5 | 73 h | 24.549 € | 0,87 |

Un local de temporada no cambia: ya no pagaba esas semanas.

## G2. Personas a la vez y horas, por separado

- La semana punta ya no se compara con la semana típica suavizada. Se compara con lo normal en las
  semanas normales (percentil 90 de las personas a la vez). Antes el bar de tapas salía con "+3
  personas" en 19 de 41 semanas normales.
- La frase separa las dos cosas: "pide X h más (N jornadas completas) y hasta P personas más a la
  vez", o "sin más gente a la vez que una semana normal: son más horas, no más gente".
- El coste de contratar para el pico usa las horas reales de contrato (con el mínimo de contrato
  del local), no personas por 40 h.

| Local | Antes | Ahora |
|---|---|---|
| Bar de tapas | 1 persona × 40 h = 31.945 €/año | 1 persona, 11 h = 8.785 €/año |
| Restaurante 25 | 7 × 40 h = 220.146 €/año | 7 personas, 93 h = 73.120 €/año |
| Menú del día | 1 × 40 h = 31.636 €/año | 1 persona, 35 h = 27.681 €/año |
| Local grande | 0 a la vez | 4 personas, unas 137 a 159 h |

Revisadas todas las frases que dependen de esto: tarjeta "Si contratas para el pico", "Tres
formas", el PDF y la nota de semanas flojas.

## M1. La apertura deducida cuenta la estancia

Quien paga a las 23:00 llegó antes. Ahora la apertura se adelanta mientras haya gente sentada
(estancias por defecto: comida 75, cena 90, desayuno 25, copas 60 minutos), como mucho 150 minutos
y sin pisar el bloque anterior. El cierre no se toca.

| Local | Comensales perdidos por el corte de apertura, antes | Ahora |
|---|---|---|
| Menú | 8,8 % | 3,9 % |
| Tapas | 7,8 % | 2,7 % |
| Restaurante 25 | 5,4 % | 1,7 % |
| Cafetería | 4 % | 2,6 % |

Menú: de 118 a 136 h de servicio (el horario real da 145). La cena del jueves abre a las 21:00 en vez
de 22:00, la del viernes y sábado a las 20:30. Tapas abre la cena a las 19:30, igual que el real.

## M2. Turnos cortos rellenados hacia dentro

Un turno que no llega al mínimo se rellena primero hacia la apertura si alargarlo pasaría de las
22:00, y nunca más allá del cierre. Avisos de nocturno: menú de 4 a 1 (el que queda es el office,
dentro de su recogida), local grande 25 de 13 a 6, enorme de 13 a 5.

## M4. Media nocturna de 8 h siempre

El cuadrante ya no acepta una semana en la que un trabajador nocturno pase de 8 h de media
(empaquetar, estabilizar familias y llevar parciales al finde lo comprueban). El aviso usa la misma
cuenta. Barrido de 480 combinaciones: 0 casos (sin la comprobación salía 1, Cocinero 1 a 8,13 h).

## Menores del cálculo

- Menor en office: ya no empieza antes de que abra su zona (19:30 en vez de 19:00), y un tramo de
  menos de 1 h se descarta.
- IVA: "divídelo entre 1,10 (es quitarle un 9 %, no un 10 %)".
- Encargado solo a jornada completa: siempre 40 h, no 35.
- Media de personas extra: 0 si no hay picos.
- Coste por puesto en euros enteros que suman el total (antes 9.232 frente a 9.231).

## Cifras de pantalla

- "12.2" sale "12,2"; "unas 1 jornadas" sale "una jornada completa".
- CSV: horas que pide el servicio con un decimal (489 frente a 488,5).
- Ejemplo de portada: tramo "25-39" en vez de "25-34".
- Equipo: "Pico sin mandos" solo si ningún mando cubre puesto, para no contradecir "una de ellas la
  hace tu mando". Las personas equivalentes con un decimal.

## Ejemplo de portada

Siguen 19 personas y 84 turnos. Horas de contrato 587 a 585. Coste 9.250 a 9.200 €/semana y 480.000 a
478.400 €/año (actualizado en `src/data/ejemploPortada.ts`).

## Comprobaciones nuevas

- `comprobar-cuadrante`, séptima ronda: barrido de 4 locales × 0, 1 o 2 mandos × 4 ajustes. Falla
  si un nocturno pasa de 8 h de media, si sale aviso legal de nocturno, si un turno acaba después del
  cierre (más la recogida del office), si el encargado de solo jornada completa baja de 40 h, o si
  un tramo de menor empieza antes de la preparación de su zona.
- `comprobar-coste`, séptima ronda: descuento de vacaciones con cierre (4 semanas dejan 2 días, 5
  dejan 0, temporada sin cambio), ruido del bar de tapas (0 personas a la vez, contrato de al menos
  el mínimo), media extra 0 sin picos, texto de jornadas, costes por puesto que suman el total, y
  apertura con estancia que adelanta sin mover el cierre.

Todo en verde: `tsc -b`, `verificar`, `comprobar-cuadrante`, `comprobar-coste`, demanda y
`parseFichero.test` (167).

## Lo que no se ha hecho

- M3 (un hueco de datos tomado como local de temporada): es lectura del fichero, zona del otro
  agente.
- El cierre se sigue deduciendo de los cobros: queda entre un 2 y un 4 % de comensales en la cola.
- Un tramo de menor de menos de 1 h antes de las 22:00 se descarta sin contarse como hueco sin
  cubrir.
- m2, m5 y m6 de la revisión del cálculo (texto del aviso "solo 40 h", turnos de 1 h, tramos por
  defecto generosos).

## Posibles choques con el otro agente

- `src/lib/parseFichero.ts`: línea de import y final de `deducirHorario` (apertura con estancia).
- `src/lib/export.ts`: `semanasCerradas` en la entrada, fila nueva del CSV, `weeklyEurEntero`,
  redondeo a un decimal.
- `src/steps/StepTeam.tsx`: etiqueta del pico y formato de personas equivalentes.
- `src/data/presets.ts` importa ahora de `src/lib/demand.ts`.
- Tipos: `RoleCost.weeklyEurEntero` (obligatorio), `PeakAnalysis.worstWeek.horasContratoSemana`, y
  `coberturaAusencias` con un quinto parámetro.
