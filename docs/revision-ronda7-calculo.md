# Revisión ronda 7: el cálculo, mirado por un director de operaciones

Fecha: 2026-11-04. Rama `revision-flujo`. Solo lectura de `src/` y `scripts/`.

## Resumen

**Sí hay cosas graves: dos.** Ninguna es ilegal en sí, pero las dos inflan el coste que se le enseña
al restaurante y, con ellas, no firmaría el plan.

| Gravedad | Cuántos |
|---|---|
| Grave | 2 |
| Medio | 4 |
| Menor | 7 |

1. **Un local que cierra en agosto paga dos veces las vacaciones.** Se le cuentan 30 días de
   vacaciones por persona como horas a cubrir aunque las semanas de cierre ya son esas vacaciones.
   En un menú del día de 10 personas son unas 1.000 h y unos 17.000 € al año de más.
2. **"N jornadas completas más" para el pico no son jornadas, son personas a la vez.** Un bar de
   tapas cuya peor semana pide 10 h más sale con "3 jornadas completas" y 3 × 40 h × 52 semanas
   de coste.

## Cómo lo he comprobado

- `npm run verificar`: pasa, sin ningún FALLA. Demo: 19 personas, 84 turnos, 9.250 €/semana.
- Banco propio en `node_modules/.tmp/r7/` (compilado con esbuild igual que
  `scripts/verificar-calculo.ts`), que repite la cadena de `src/hooks/usePlanner.ts` desde un CSV
  sintético de TPV: lectura, semana tipo, sentados a la vez, tramos, necesidad, cuadrante,
  contratos, picos, ausencias y coste.
- Perfiles: menú del día de 10 que cierra domingo noche y lunes; bar de tapas de 6; restaurante
  de 25 con comidas y cenas; cafetería de desayunos y comidas; grupo con un local grande. Después,
  los extremos: ajustes al límite, ficheros con huecos, semana de festivo fuerte, dos picos
  pegados, chiringuito, bar de copas hasta las 05:30, dos turnos de sala, menores.
- Al final he leído `docs/revision-flujo-2026-11-04.md` y `docs/revision-ronda6-calculo.md` (y he
  buscado en las rondas 3 y 5) para no repetir. Donde un hallazgo amplía uno anterior, lo digo.

---

## Graves

### G1. Las vacaciones de un local que cierra en agosto se cuentan otra vez como horas a cubrir

Nuevo.

- **Entrada:** menú del día de 10 personas, mismo fichero con 0, 2, 4 y 5 semanas de agosto
  cerradas (ventas a cero).
- **Qué sale:** las horas de vacaciones a cubrir no se mueven, unas 1.091 h al año en los cuatro
  casos. Ausencias totales 2.489 h; tras moverlas a semanas flojas, entre 2.187 y 2.245 h, unos
  38.400 a 39.400 € al año. "Jornadas para cubrirlas" 1,47 en los cuatro.
- **Qué debería:** con 4 semanas cerradas ya se han disfrutado 28 de los 30 días naturales de
  vacaciones. Quedan unos 2 días por persona, unas 70 h en total, no 1.091. El sobrecoste es de
  unas 1.000 h y unos 17.000 € al año, un 8 % de una plantilla de 205.000 €, y además infla el
  ratio sobre ventas. Ningún director firma pagar sustitutos para cubrir unas vacaciones que la
  gente disfruta con el local cerrado.
- **Dónde:** `src/lib/ausencias.ts:113-140` (`coberturaAusencias` no descuenta las semanas
  cerradas); se arrastra a `src/steps/StepResult.tsx:335-347`, `src/lib/export.ts:156-161` y
  `src/lib/informe-pdf.ts:569-570`. `vacacionesEnSemanasFlojas` (`ausencias.ts:160-190`) solo usa
  semanas abiertas, así que no lo arregla.

### G2. El pico se vende como "N jornadas completas más" cuando N es gente a la vez

Amplía ronda 6 m8 y ronda 5 G2, con cifras nuevas.

- **Entrada:** los cinco perfiles y un Semana Santa a ×2,2.
- **Qué sale:**

  | Caso | La peor semana pide | Pantalla y PDF dicen | Con las horas salen |
  |---|---|---|---|
  | Bar de tapas | 10 h más | 3 jornadas completas | 0,25 jornadas |
  | Restaurante 25 | 85 h más | 7 jornadas completas | unas 2 |
  | Semana Santa ×2,2 | 372 h más | 17 jornadas completas | unas 9 a 10 |
  | Chiringuito | 5 h más | 3 jornadas completas | 0,1 |

  Y se cuesta como N × 40 h × semanas de pago: en el bar de tapas, 3 personas a 40 h todo el año
  para cubrir 10 h de una semana.
- **Además, la cifra está sesgada por ruido:** se compara el pico bruto de la peor semana con la
  semana tipo ya suavizada, y los tramos van a saltos. En el bar de tapas, 19 de las 41 semanas
  NORMALES (por debajo de la línea) ya dan +3 personas a la vez. O sea, el "+3" sale casi de
  cualquier semana.
- **Qué debería:** si se habla de jornadas, salir de las horas (`jornadasPorHoras`, que ya existe);
  si se habla de gente a la vez, decir "N personas más a la vez en el momento más fuerte" y no
  costarlo como contratos de 40 h todo el año. Y comparar pico con pico, no pico bruto con semana
  suavizada.
- **Dónde:** `src/lib/contracts.ts:198-247` (`analyzePeaks`, `personasParaContratar` toma el
  máximo); `src/steps/StepResult.tsx:268-269`, `318-322` y `1658`; `src/lib/informe-pdf.ts:521`
  y `527`.

---

## Medios

### M1. El horario deducido abre tarde y recorta a los clientes sentados

Nuevo.

- **Entrada:** cualquier fichero sin horario puesto a mano.
- **Qué sale:** el horario se deduce con 30 min de adelanto sobre el cobro, pero la curva de
  sentados usa estancias de 75 min a mediodía y 90 por la noche. La apertura sale entre 45 y 90 min
  tarde y la curva se corta. Menú del día: cena del jueves deducida a las 22:00 cuando abre a las
  20:30. Sentados perdidos por el recorte: menú 8,8 %, tapas 7,8 %, restaurante 25 5,4 %,
  cafetería 4 %. En el restaurante 25, viernes a las 21:00 hay 30 sentados que pasan a 0.
- **Qué debería:** con el horario real, el menú pide 145 h de servicio en vez de 118 (+23 %),
  186 h en total en vez de 175,5, y 4.156 €/semana en vez de 3.989. Hoy los camareros entran a
  las 21:00 o 21:30 a un servicio que abrió a las 20:30. El horario deducido tiene que usar la
  misma estancia que la curva.
- **Dónde:** `src/lib/parseFichero.ts:1891-1919` (`deducirHorario` con `applyLag(30)`), llamada
  en `1768`; recorte en `src/lib/necesidad.ts:58-68` y `src/lib/demand.ts:498`.

### M2. Los turnos cortos se alargan después del cierre y convierten a gente en nocturna

Amplía ronda 5 m3 y ronda 3 G3: ya se dijo que se rellena tras el cierre; lo nuevo es la
consecuencia legal y de coste.

- **Entrada:** menú del día, sala cierra a las 00:30.
- **Qué sale:** un camarero de 21:30 a 01:30 y un office hasta la 01:00, solo para llegar a las
  4 h mínimas. Con el horario deducido salen 4 personas clasificadas como trabajador nocturno; con
  el horario real, 1.
- **Qué debería:** rellenar antes de la apertura o antes del servicio, no después del cierre. Ser
  trabajador nocturno trae plus, prohíbe horas extra y limita la media a 8 h (art. 36 ET). Nadie
  pone a un camarero una hora en un local cerrado.
- **Dónde:** `src/lib/roster.ts:278-296` (`rellenar` alarga primero el final, y si falta suma
  después del cierre).

### M3. Un hueco de datos dentro del fichero convierte el local en uno de temporada

Amplía ronda 6 G1 con un caso que no estaba.

- **Entrada:** restaurante de 25 con 13 semanas sin datos a mitad de año (cambio de TPV).
- **Qué sale:** el hueco se marca como cierre, el local pasa a "de temporada" (fijo discontinuo):
  40 semanas de pago, 336.758 € al año en lugar de unos 437.800 (un 23 % menos). Sin aviso y sin
  preguntar.
- **Qué debería:** un hueco sin ventas en medio del año, con ventas normales a los dos lados, es
  un fallo de datos hasta que el usuario diga lo contrario. Hay que preguntarlo.
- **Dónde:** `src/lib/parseFichero.ts:1779-1791`, `src/lib/holidays.ts:253-268`
  (`especialesConRellenos` lo marca cierre y excluido), `src/lib/contracts.ts:350-361`
  (`temporadaDelLocal`, 10 semanas o más).

### M4. Con dos mandos, el motor saca un nocturno por encima de 8 h de media y lo da por bueno

Nuevo. Lo pongo en medio por ser legal, aunque solo lo he reproducido con una semilla.

- **Entrada:** grupo con local grande, 2 mandos, semilla 7.
- **Qué sale:** Office 1 nocturno con 8,3 h de media (entre otros, 13:30-17:30 + 22:00-02:00), sin
  aviso. Con las semillas 1 a 4 no sale.
- **Qué debería:** un trabajador nocturno no pasa de 8 h de media (art. 36.1 ET). El motor no debe
  generarlo y, si sale, el aviso tiene que saltar.
- **Dónde:** `src/lib/roster.ts` (la comprobación de relevos mira turnos sueltos, no la media del
  nocturno) y `src/lib/avisos.ts` (clasificación de nocturno).

---

## Menores

- **m1. El menor en office sale de 19:00 a 22:00** ante un servicio que abre a las 21:30: se va
  cuando empieza el trabajo. `src/lib/avisos.ts:304` y el reparto de `roster.ts`.
- **m2. Solo contratos de 40 h:** 14 personas a 40 h con 242 a 256 h asignadas, y el aviso "no se
  han podido juntar" engaña, porque no es que no se puedan juntar sino que sobra contrato.
- **m3. La pista del IVA dice "quítale el 10 %"**: es dividir entre 1,10, que es quitar un 9,1 %.
  `src/steps/StepResult.tsx:1130`.
- **m4. Encargado a 35 h con "solo jornada completa" encendido.** `src/lib/roster.ts:2047-2049`
  (`asignarContrato`: un mando por debajo del 90 % sale a medida).
- **m5. Turnos de 1 h** si se ponen turno mínimo y máximo a 1 h. Nadie cruza la ciudad para una
  hora; el mínimo debería tener suelo.
- **m6. Los tramos por defecto son generosos para un menú del día:** 73 sentados dan 10 personas,
  6 en sala. `src/data/presets.ts` (`DEFAULT_TIERS`).
- **m7. `avgExtraPeople` vale como mínimo 1** aunque no haya picos (`contracts.ts`,
  `Math.max(1, ...)`). La pantalla lo tapa, pero el dato está mal.

---

## Lo que he buscado y está bien

- El CSV por puesto suma lo mismo que el total semanal (9.689 frente a 9.688, redondeo).
- El coste por hora trabajada cuadra entre pantalla y CSV (19,54 €).
- Con las 12 h de descanso apagadas, el descanso real entre turnos queda en 11 a 11,5 h, por
  encima de las 10 h del RD 1561/1995.
- Una exportación parcial reciente (junio a octubre) no se toma por temporada.
- Chiringuito: 21 semanas de pago, correcto.
- Dos turnos de sala (dos picos pegados el mismo día): bien repartidos.
- Bar de copas hasta las 05:30: horario y nocturnidad correctos.
- Todos los cálculos por debajo de 200 ms.
- Sin picos, la pantalla no enseña la tarjeta de pico.
