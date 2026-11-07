# Cambios en pantallas, ronda 3 (4 de noviembre de 2026)

Arreglos de `docs/revision-ronda3-pantallas.md` en la zona de pantallas, textos, coste, ejemplo,
CSV, informe y lectura del fichero. El motor del cuadrante lo ha tocado otro agente a la vez y no
entra aquí. Sin commit.

## El ejemplo, antes y después

| | Antes | Después |
|---|---|---|
| Personas | 22 | 46 |
| Horas en la cabecera | 597 h (las que pide el local) | 1.546 h de contrato |
| Pico a la vez | 17 | 35 |
| Mandos | ninguno | encargado 1 y jefe de cocina 1 |
| Ventas de la semana | 26.000 € (4,75 € por comensal) | 109.500 € (20 € por comensal) |
| Personal sobre ventas | sin sentido | 22 % solo plantilla; con quien cubre ausencias, algo más |
| Horas que faltan en las semanas punta | 870, 322 o 870 según la pantalla | 1.473 en las tres: 922 con complementarias y 551 de refuerzo |
| Coste a la semana | | 24.619 € |
| Hora trabajada | dos precios distintos (17,88 € y 16,81 €) | uno: 18,44 € |

**Por qué crece tanto.** Los tramos de partida estaban hechos para tickets y la escala ya es de
gente sentada a la vez. Se han rehecho con las proporciones del sector: un camarero por cada 20 a 25
sentados, un cocinero por cada 30 a 40 y un office por cada 100 a 120. Fuentes: ComboHR, "¿Cuántos
camareros se necesitan en un restaurante?" y "Cómo calcular el personal para un restaurante"; y
Qamarero, "Número de comensales en un restaurante". La curva del ejemplo llega a 366 sentados el
sábado, que es un local muy grande: 46 personas es coherente con ese tamaño. **Si se quiere un
ejemplo de 20 a 25 personas, hay que bajar la curva, no los tramos.** Eso lo decide Crescente.

Parte de las 46 sale del motor: añade 2 responsables de turno y 2 jefes de cocina más porque "hay
días sin nadie al frente". Eso es del otro agente.

## Lo que se ha arreglado

**Graves**
- 3: las horas que faltan en los picos son la misma cifra en Los picos, en las horas
  complementarias y en Con Shifty, y Con Shifty vende solo lo que queda tras las complementarias.
- 4: el ejemplo trae encargado y jefe de cocina. Al subir un fichero propio vuelven a cero, igual
  que los costes.
- 5: tramos nuevos (arriba). Si el pico pasa del último tramo, sale un aviso en Equipo.
- 6: volver a Histórico ya no deja sin salida. Los pasos ya visitados siguen marcados y se pueden
  pulsar, y hay una tarjeta "Seguir con mi plan".
- 7: la cabecera enseña las horas de contrato de la plantilla, no las que pide el local.

**Medios**
- 8: las ventas de la semana salen de la columna de importe: la mediana de las semanas con ventas.
  Se pueden cambiar, y se avisa de quitar el 10 % si el TPV da el importe con IVA.
- 9: un solo precio de la hora trabajada en todo el plan. El coste de cubrir ausencias se calcula
  por horas a ese precio. La frase de las pagas extra dice lo que de verdad pasa: el bruto del
  catálogo ya las lleva prorrateadas. Si el sueldo se pone como coste de empresa, no se suma otra
  vez la Seguridad Social.
- El porcentaje sobre ventas incluye a quien cubre vacaciones, festivos y bajas, y entre paréntesis
  da el de la plantilla sola.
- La nocturnidad sale como aviso con las horas entre las 22:00 y las 06:00, y con un campo para
  poner el plus del convenio. Hasta que se pone, no se suma.
- 10: "Horas de más" pasa a "En turno sin servicio", con la resta a la vista.
- 11: "Dónde sobra gente" avisa cuando la franja cae fuera del horario al público.
- 13: el ejemplo de la portada dice que es un ejemplo, y sus cifras son las que salen al abrirlo.
  `npm run verificar` falla si dejan de coincidir.
- 15: al volver desde Equipo se cae en el último sub-paso de Demanda.
- 18: en el móvil, los nombres de los puestos de la tabla de tramos no se cortan y la plantilla
  sale como lista con sus totales.
- 19: la cabecera del cuadrante en el móvil se apila y ya no sale una palabra por línea.
- 20: en el móvil pone "Elige tu fichero" y explica que el export suele estar en el ordenador.
- 21: la portada ya no promete "ni email".
- 22: frases reescritas: "Horas de ausencia que cubrir", el peso del 79 %, el enlace corto, "Lo que
  sobra se paga", el porcentaje de confianza de la lectura y "Presets" pasa a "Horarios tipo".
- 23: el texto de la línea de demanda ya no promete un coste que puede no salir.
- Sala entra 30 minutos antes de abrir para preparar (antes, 0).
- Una sola barra en vivo en Equipo en el móvil.
- El CSV trae los contratos reales del plan, el coste por puesto, la nocturnidad, las horas de
  ausencia y las horas necesarias, en turnos, contratadas y pagadas sin servicio.

**Menores**: 27 (guiones largos fuera de todo texto visible, también en las celdas vacías), 28
("1.600" y "16 mil" en vez de "1.6k"), 29 (decimales con coma), 30 (fechas en castellano), 31
(semanas bien unidas y "todas" cuando son todas), 32 (titular "Con tu sala llena"), 34 ("Volver a tu
plantilla" en vez de "Ya está" apagado), 36 (turno mínimo de 3 a 6 h), 38 (copy de cadenas
suavizado). Además, espacio antes del % y "parcial" en minúscula.

## Lo que no se ha hecho

- **Cifras de Con Shifty (9 min, 81 %, 4,89, 701 anuncios): no se han tocado.** En Docs, "9 min" y
  "701 anuncios" no aparecen en ningún sitio. El 81 % y el 4,89 sobre 2.806 solo salen en
  `Docs/docs/shared/PENDIENTE.md` (22-09-2026) como **no aprobadas**, del deck de hoteles v1. Las
  aprobadas para material comercial son 90 %, 80 % y 2 % de ausencia, y la web usa +20.000
  profesionales y absentismo menor del 5 %. La skill de marca (§7) dice que la valoración media es
  "falsa por construcción". **Necesitan el OK de Crescente o quitarse.**
- **24, provincias escritas en el código** (`src/lib/territorio.ts:28`): pendiente. Choca con la
  regla de que ningún catálogo va en el código; tiene que salir de una lista completa, no de nueve.
- **14, pedir mandos y puestos antes de enseñar nada**: es una decisión de flujo para Crescente.
- **16 y 17, margen y preparación pedidos dos veces**: no se han unificado.
- **33 ("L" de Libra), 35 ("Leyendo el fichero" en el ejemplo) y 39 (el botón de contacto sin datos
  del plan)**: no se han hecho.
- **Del motor, del otro agente**: 1, 2, 12, 26 y 37, la frase de "por qué N personas" y la de
  jornadas partidas.
- **IVA**: no se sabe si el importe del TPV viene con IVA. Solo se avisa.

## Comprobaciones

`tsc -b` a cero, `npm run verificar`, `comprobar-coste`, `comprobar-demanda` (20 de 20),
`parseFichero.test` (153 de 153) y `vite build` pasan. Recorrido en el navegador a 1280 y 375 px con
el ejemplo y con `tpv-prueba.csv`, costes encendidos, vuelta a Histórico: sin errores en consola y
sin scroll horizontal.

`comprobar-cuadrante` tiene **un fallo**: "Camarero 16 tiene un contrato de 18 h que no es de fin de
semana". Sale porque los tramos nuevos cambian el caso de `npm run verificar`, y la regla de los
contratos cortos es del motor. Los topes de ese caso (22 personas y 670 h) se han subido a la nueva
base (40 y 1.290 h) en `scripts/comprobar-cuadrante.ts`.
