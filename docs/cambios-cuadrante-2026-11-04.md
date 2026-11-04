# Cambios en el cuadrante, 2026-11-04

Rama `feature/planificador-cuadrante`. Esto es lo que cambia en cómo se monta el cuadrante y por qué.
La demanda (cobros a comensales, tramos), la preparación por defecto y quién abre cada zona son de
otra tanda y no se tocan aquí.

## Lo que se ha hecho

**1. Máximo de horas al día.** Nuevo ajuste, 9 h por defecto ("según tu convenio": 8, 9, 10 o 12).
Ningún día de nadie lo pasa: los relevos ya no se vuelven a juntar en un turno largo, y una jornada
partida lleva un hueco real (al menos 60 min). Si algo lo pasa, sale un aviso legal. Antes un local
abierto de 9 a 24 seguido daba turnos de 15 h.

**2. Mandos por horario.** Los puestos ahora son de dos clases: "por comensales" (los de siempre) o
"mando, siempre presente". Un mando no sale de los tramos: se dice cuántos hay y de cuántas horas, y
el cuadrante les da jornadas completas cubriendo todo el horario de su zona. Si con los que se
piden no se llega a tener siempre uno, se añade el que falta y se avisa. Así ya no sale un
encargado con contrato de 40 h y 12 h de turnos. En el catálogo de puestos se elige la clase, y la
tabla de tramos esconde las columnas de mando y dice cuáles tienes.

**8. Contratos a medida.** Cada persona lleva un contrato con las horas que trabaja (desde un
mínimo que se puede cambiar, 10 h por defecto), en vez de redondear a 15, 20, 30 o 40. Lo que sobra
entre contrato y turnos se llama "horas pagadas sin servicio" y se cuenta como coste, no como margen.
Apagando el interruptor se vuelve a la lista de contratos de antes.

**9. Turnos tipo.** Turno más corto de 4 h por defecto. Por eso las horas en turnos de los datos de
ejemplo suben de 577 a 657: antes había turnos de 2 h que nadie hace.

**10. Seguidos primero.** El cuadrante se prueba con turnos seguidos y con partidas, y la partida solo
gana si ahorra una persona. El resultado dice cuántas jornadas partidas hay a la semana.

**11. Libranzas de los mandos en los días flojos**, según los comensales de cada día.

**13. Pausa.** Si alguien trabaja más de 6 h seguidas sale un aviso agrupado para darle la pausa.

**Precio.** "Desde 18,81 €/hora" en vez de 18,80.

## Lo que NO se ha hecho

**12. Rotación de 4 semanas.** No está. El cuadrante sigue siendo una semana que se repite.

## Cifras, antes y después

| Caso | Antes | Después |
|---|---|---|
| Datos de ejemplo | 19 personas, 665 h contratadas, turno más largo 9 h | 19 personas, 658 h, 9 h, 88 turnos |
| Con encargado | encargados 40 h de contrato y 24 a 34 h de turnos | 23 personas, todos los mandos 40/40 |
| Abierto 9 a 24 seguido | 12 personas, turnos de 15 h | 15 personas, turno más largo 8 h, mandos 40/40 |
| Mínimo 1 por zona con 60 min de preparación | turnos de 11 h | 22 personas, turno más largo 9 h |
| Puesto grande (unas 70 personas) | 935 ms | 68 personas, unos 110 a 190 ms |

`npm run comprobar-cuadrante` repite estos casos y falla si alguien pasa del máximo diario, si una
partida no tiene hueco, si un mando tiene menos del 90 % de su contrato, si una zona con mandos se
queda una franja sin ninguno, si los turnos se disparan o si el puesto grande tarda más de 300 ms.

## Cosas a tener en cuenta

- `src/lib/staffing.ts`: una sola línea, los puestos de mando se saltan al leer los tramos.
- `src/lib/types.ts`: campos nuevos, todos opcionales. Un plan guardado antes no los trae y sus
  mandos se siguen tratando por comensales, como hasta ahora.
- Si una zona solo tiene puestos de mando, el mínimo por zona cae en el primero de ellos (eso lo
  decide la parte de "quién abre", que no es de esta tanda).
