# Registro de previsiones

Una entrada por ejecución. La cifra que manda son los **ingresos de Shifty** ("Ingresos Shifty" de la
pantalla de Facturación); el GMV va de apoyo. Cuando un mes cierra, se rellenan los reales y los
errores en todas las entradas que lo previeron (SKILL.md §0). Error = (previsto − real) / real.
"¿En el 80 %?" = si los ingresos reales cayeron en su rango del 80 %.

Detalle de cada ejecución en `~/Desktop/Shifty/Github/prevision-facturacion/AAAA-MM-DD.md`.

## Tabla

| Fecha | Mes | Día | Ingresos Shifty central | Ingresos 80 % | Ingresos 95 % | GMV modelo | GMV central (actuales + nuevos) | GMV 80 % | Ingresos reales | GMV real | Error ingresos | ¿En el 80 %? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 07-11-2026 | 2026-11 | 7 | 14.700 | 6.900 a 18.800 | 6.000 a 20.600 | 84.082 | 106.900 (103.700 + 3.600) | 48.100 a 137.800 | | | | |
| 07-11-2026 | 2026-12 | −24 | 20.300 | 9.100 a 30.700 | 5.900 a 42.000 | 68.097 | 139.700 (113.100 + 27.500) | 58.600 a 213.800 | | | | |
| 07-11-2026 | 2027-01 | −55 | 19.900 | 9.000 a 38.500 | 5.600 a 43.200 | 57.383 | 134.100 (89.000 + 40.500) | 57.000 a 269.700 | | | | |

## Supuestos y correcciones de cada entrada

### 07-11-2026

- Modelo base (agendado, vacantes, ritmo de 3 meses, mismo mes del año pasado; 9 meses), examen en
  16 meses: error 30 % en los días 1 a 7, 43 % antes de empezar el mes y 53 % a más de un mes; el 80 %
  se cumplió en el 85 % de los casos.
- Central = p50 del modelo (corrige que a semanas vista se quedó corto un 50-80 % de mediana, por el
  crecimiento). Sin esa corrección, diciembre ≈ 61.000.
- Rehecha el mismo día con los temporales previstos dentro del modelo y el suelo (§1 de SKILL.md). La
  primera versión ponía Pistola a mano (+4.100 nov, +11.000 dic, +1.800 ene) y daba 26.200 de mínimo
  en noviembre con 44.170 en pantalla; ahora Pistola sale de `tp_revenue_forecast_days` (5.681,
  11.368 y 1.555) y el suelo de noviembre es 32.300 (19.926 hecho + 23.583 agendado y previsto, de lo
  que en el peor 2,5 % de los meses se facturó la mitad).
- Correcciones: Santa Cruz al 15 % de comisión en diciembre (+500 dic, +400 ene).
- Nuevos, con la lectura de Crescente del mismo día (manda sobre las probabilidades de partida):
  Con Fuego 85 %, arranca en noviembre con una marca en un local, tres locales a las dos semanas,
  otra marca después y a pleno hacia febrero con **7.000 €/mes de ingresos para Shifty** (rampa
  supuesta en ingresos: 600 nov, 2.800 dic, 4.900 ene; con su 18 % son 3.900, 18.400 y 32.100 de
  GMV, y unos 46.000 de GMV a pleno); Estación del Asador (Asador La Estación de los Porches) 80 %,
  **2.000 de ingresos** en diciembre y enero (12.000 de GMV con su 20 %); Twister marginal, 0; Autocine cliente perdido, 0; Familia Lonja 0; Foodbox fuera del horizonte;
  NH sin crecimiento (ya en el modelo). Sin cambios: Bauna y Chispa 25 %, Bellaciao,
  Rubaiyat, Enrique Tomás y Barbillon 10 % en enero.
- Ingresos de Shifty: actuales al 13,25 % del GMV (lo de septiembre a noviembre) y 13,8 % en
  diciembre y enero por Santa Cruz; nuevos con la comisión de su ficha (GMV × pct / (1 + pct));
  más 465 al mes de suscripciones y extras (415 de suscripciones pagadas en septiembre y octubre,
  y 99 de extras algún mes).
- **Solo lo recurrente** (Crescente): fuera de toda la historia los anuncios no recurrentes
  (`job_offers.is_non_recurring_service`). El examen mejora: error 34,7 % en vez de 36,9 % y el 80 %
  se cumple en el 91 % de los casos. Con eso el modelo sube (el diciembre de 2025 recurrente fue
  2,1 veces su octubre) y la central de los actuales queda en 103.700, 113.100 y 89.000. Noviembre
  va por encima de octubre a día 6 (37.800 hecho y agendado frente a 34.100). Sin la corrección por
  crecimiento, la fórmula da 84.082, 68.097 y 57.383.
- Versiones del mismo día: la primera en GMV y con Pistola a mano; la segunda con temporales
  previstos y suelo; la tercera con la lectura de Crescente leída como GMV (Con Fuego 7.000 de GMV);
  la cuarta, con sus cifras como ingresos de Shifty; la quinta, sin Autocine ni Twister; esta, la
  sexta, solo con lo recurrente.
- La central es la del modelo con su sesgo corregido; la skill no la movió porque nada en el contexto dice que el crecimiento se pare.
- Fuera: correo de Crescente (el conector de Gmail leía el buzón de Fernando, no el suyo).
- Variable probada: fines de semana que quedan; no mejora.

### 07-11-2026, contraste por tramos de diez días (§1.1 de SKILL.md)

- Del 1 al 10 de noviembre, 249 turnos recurrentes en el sistema (160 hechos y 89 agendados) y unos
  285 estimados al cerrar ese tramo.
- Noviembre de 2025, recurrentes terminados: 77, 73 y 105 turnos por tramo (1 a 10, 11 a 20, 21 a
  30). Factor del mes: 3,31.
- Resultado: unos 945 turnos (285, 270 y 390). A 107 € de GMV y 13,9 € de comisión por turno
  (media de noviembre hasta hoy), unos 101.000 de GMV y 13.200 de comisión, 13.700 con suscripciones.
  Coincide con la skill (103.700 de GMV de actuales y 14.700 de ingresos con nuevos). Al cerrar el
  mes, apuntar también los turnos reales por tramo para medir este método.
