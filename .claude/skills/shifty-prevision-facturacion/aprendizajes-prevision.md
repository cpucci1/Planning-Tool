# Aprendizajes de la previsión de facturación

Se lee entero al empezar cada ejecución y se aplica. Cada entrada con fecha y el caso que la prueba.
Si algo nuevo contradice algo de aquí, se corrige lo de aquí (no se dejan las dos versiones).

## Clientes de temporada y sorpresas conocidas

Medido en la base el 07-11-2026 (GMV de turnos terminados).

- **Autocine** (AUTOCINE): **cliente perdido** (Crescente, 07-11-2026) y además no recurrente: fuera
  de todos los cálculos. Facturó 28.119 € en
  diciembre de 2025 y 14.830 € en enero de 2026, último turno el 21-03-2026. No se cuenta como vuelta
  de temporada, ni con probabilidad: 0. Solo vuelve a la previsión si hay turnos o un contacto nuevo
  que lo diga.
- **Twister Rock**: marginal (Crescente, 07-11-2026: "no nos facturará" casi nada, solo urgencias).
  No se suma; se nombra solo si empieza a pedir de verdad.
- **Grupo Lew Brand**: 9.780 € en diciembre de 2025 y **17.942 € en enero de 2026**, frente a unos
  1.800 €/mes en otoño de 2026. El modelo lo recoge en parte por el mismo mes del año pasado.
- Diciembre de 2025 tuvo además El Olivar (6.846 €, no ha vuelto), Coolinaria (6.167 €, último turno
  en mayo de 2026) y Grupo Pulcinella (4.850 €, último en junio): clientes de Navidad. Si vuelven,
  es sorpresa al alza que el modelo ve solo a medias.
- Tucán (septiembre de 2025, 32.000 € sin nada pedido a primeros), Ucalsa (mayo de 2026, 13.000 €) y
  Grupo Nazabal (octubre de 2026, 16.500 € con ritmo previo de 1.000): saltos de un solo cliente
  imposibles de ver con la base. Por eso se mira el correo y el CRM de los grandes.
- Agosto cae en general (2025 y 2026).

## Correcciones que se han aplicado y cómo salieron

| Fecha | Mes | Corrección | Resultado al cerrar |
|---|---|---|---|
| 07-11-2026 | nov, dic, ene | Puesto temporal de Pistola (mercado de Navidad) a mano; ese mismo día pasó al modelo como temporales previstos | sustituida |
| 07-11-2026 | dic, ene | Santa Cruz del 6,31 % al 15 % de comisión en diciembre (memoria "Comisión sube al 15 %"), sin aplicar aún en la base | pendiente |

## Solo lo recurrente

Instrucción de Crescente, 07-11-2026: *"considerando lo recurrente! lo no recurrente no lo metas en
los cálculos"*. Lo no recurrente (festivales, ferias, eventos) se dejó de atender por decisión propia;
el último fue en junio de 2026.

- **El corte está en la base**: `job_offers.is_non_recurring_service`. Cuadra al euro con la
  presentación "Shifty Work en números" (febrero 14.808, marzo 19.665, abril 7.613, mayo 11.848,
  junio 1.500 de no recurrente) y es el que usa la pantalla de Facturación (`no_recurrente`).
  Empresas: Autocine, Tucán, Zamna, Coolinaria, GOA Catering y Festivales, AGA Catering, Bravas
  Fest, The Burger Cup y parte de Ucalsa.
- `prevision.py` lo quita de toda la historia: ni ritmo, ni mismo mes del año pasado, ni lo de hoy.
- **CORRECTO:** diciembre de 2025 recurrente 64.548 de GMV (96.286 con Autocine y Zamna); enero de
  2026 recurrente 45.768 (60.598 con Autocine): de diciembre a enero, un 29 % menos.
- **INCORRECTO:** prever diciembre con el diciembre de 2025 entero o con Autocine como cliente de
  temporada: mete 31.738 de eventos que ya no se hacen.

## Facturación es lo que factura Shifty, no el GMV

Corrección de Crescente, 07-11-2026: *"cuando te hablo de facturación, hablo de facturación para
Shifty, no de GMV. Y lo de Estación del Asador y Con Fuego son para facturación Shifty."*

- **CORRECTO:** "Diciembre, unos 17.600 de ingresos para Shifty (entre 9.700 y 26.300; GMV unos
  122.000)". Con Fuego "7K a pleno" = 7.000 €/mes de comisión, unos 46.000 de GMV con su 18 %.
- **INCORRECTO:** dar como cifra principal el GMV (98.800 en diciembre) y meter los 7.000 de Con
  Fuego como GMV, que los deja en 1.070 de ingresos: seis veces menos de lo que él dijo.

La cifra principal es la de "Ingresos Shifty" de la pantalla (comisión + extras + suscripciones +
equipo propio). Cualquier cifra de un cliente que dé él se lee en ingresos salvo que diga GMV.

## Sobre las fuentes

- **Decide la skill** (Crescente, 07-11-2026): el modelo es el respaldo; la cifra la pone la skill con todo el contexto (CRM, su correo, conversaciones, contratos, pilotos, tamaño de los potenciales, internet).
- **La lectura de Crescente de cada piloto manda sobre la probabilidad de partida** (07-11-2026). Se
  le pregunta en cada ejecución por los nuevos y se traduce a probabilidad, mes de arranque y rampa.
  Ese día: Con Fuego "se activará en una o dos semanas" y a pleno en tres meses con 7.000 €/mes (la
  CRM decía 2.000 y la prensa 25 restaurantes, que se había traducido en 10.000); Estación del Asador
  2.000 en diciembre; Twister solo de urgencias; Familia Lonja nada; Foodbox tarde; NH lento. Al
  cerrar cada mes se mira si su lectura acertó más que la tabla de probabilidades.

- **Puestos temporales**: generan sus turnos una o dos semanas por delante. Desde el 07-11-2026 el
  modelo suma lo que falta por montar (`tp_revenue_forecast_days`, "Temporales previstos" en la
  pantalla); antes se corregía a mano y salía casi lo mismo (Pistola: 4.100 a mano frente a 5.681).
- **Lo agendado no es seguro** (medido el 07-11-2026, por jornada, contando las sustituciones): a una
  semana vista se factura de mediana el 88-90 %, en uno de cada diez meses el 75 % o menos, y en los
  peores la mitad (diciembre de 2025: 69 %; febrero de 2026: 48 %; septiembre de 2025: 52 %). Por
  turno suelto, sin contar sustituciones, sale un 72 %: no usar esa cifra. Es lo que pone el suelo
  del rango.
- **Un mínimo por debajo de lo que ya hay en pantalla quema la cifra** (Crescente, 07-11-2026: vio
  40.000 de mínimo con 44.170 ya en pantalla). El suelo nunca baja de lo hecho más lo agendado y
  previsto, salvo por la cancelación que de verdad ha habido, y se explica así.
- **Correo**: el 07-11-2026 el conector de Gmail era el buzón de Fernando, no el de Crescente. Sin
  el de Crescente no hay señal de clientes.
- **CRM**: `estimated_value` son etiquetas redondas, no facturación; los ganados con fecha 14-09 o
  07-10 son volcados. No hay fase piloto ni tamaño. HubSpot es espejo.

## Reparto del mes por tramos de diez días

Crescente, 07-11-2026, le gustó el ejercicio y pidió meterlo en la skill (§1.1 de SKILL.md).

- Noviembre de 2025 (recurrentes): los dos primeros tramos casi iguales (77 y 73 turnos) y el último
  tramo un 36 % por encima del primero (105), con las mismas empresas pidiendo más, no con clientes
  nuevos. La comisión del último tramo subió un 54 %.
- Hay que comprobar al cerrar noviembre de 2026 si el reparto se repite. Si no, apuntar aquí qué
  cliente lo cambió.

## Probabilidades de los nuevos (calibración)

Las de partida están en SKILL.md §4 y son supuestas. Aquí se apunta, cuando cierre cada mes, cuántos
de cada fase arrancaron de verdad y se ajustan.

Desde el 07-11-2026 la probabilidad la ajusta la lectura de Crescente; se apunta también aquí qué
dijo él de cada uno y si salió.

| Fase el día de la previsión | Previstos | Arrancaron en el horizonte | Probabilidad observada |
|---|---|---|---|
| Firmado sin turnos | 0 | | |
| Contrato enviado | 0 | | |
| Negociación con contacto reciente | 0 | | |

## Curva de arranque de un cliente nuevo

07-11-2026, 45 clientes con primer turno entre julio de 2025 y agosto de 2026: mes 1 mediana 344 €
(media 1.918 €, el 10 % pasa de 4.358 €); en el mes 2 solo sigue pidiendo el 36 % y en el mes 3 el
38 %. Es decir: **la mayoría de los clientes nuevos prueba poco y no sigue**; unos pocos tiran mucho.
Un nuevo sin potencial conocido vale poco en la central pero ensancha el rango alto.

## Variables por investigar

Se prueba **una** por ejecución (SKILL.md §6). Punto de partida: la lista ⏳ del informe del
07-11-2026. Marcado: ⏳ sin probar · 🧪 probada, no mejora · ✅ probada, mejora (candidata) · 🟢 dentro.

| Variable | Estado | Fecha | Resultado |
|---|---|---|---|
| Fines de semana que quedan en el mes (`findes_rem`) | 🧪 | 07-11-2026 | No mejora: WAPE 30,1 % frente a 30,3 % en los días 1 a 7, 14,8 % frente a 14,6 % en los días 15 a 21, igual en el resto; coberturas iguales |
| Ritmo de 6 meses (`run6rem`) | ⏳ | | |
| Mismo mes del año pasado como índice sobre el ritmo (`ly_seas`) | ⏳ | | |
| Horas de puestos temporales que quedan por montar en el mes | 🟢 | 07-11-2026 | Dentro como `temporales_previstos`, sin peso aprendido (no hay histórico): × parte facturada de lo agendado |
| Anuncios por aprobar | ⏳ | | hoy no hay ninguno vivo |
| Invitaciones pendientes de respuesta | ⏳ | | |
| Antelación con la que pide cada cliente (`job_days.hours_notice_at_creation`) | ⏳ | | |
| Si pide todo de golpe a primeros o semana a semana | ⏳ | | |
| Tendencia del cliente (sube o baja) y número de locales activos | ⏳ | | |
| Cuántas personas de la empresa publican | ⏳ | | |
| Festivos y puentes del mes | ⏳ | | |
| Cobertura y tiempo hasta la primera persona | ⏳ | | |
| Cancelaciones tardías y no vino | ⏳ | | |
| Valoraciones, incidencias y quejas del cliente | ⏳ | | |
| Comisión vigente frente a la del ritmo (cambios de comisión) | ⏳ | | |
