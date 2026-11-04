# Revisión de pantallas, ronda 6 (4 de noviembre de 2026)

Revisor escéptico, solo lectura de `src/`. Recorrido entero en navegador (servidor local en el puerto
5198) con tres ficheros: el restaurante de ejemplo, `node_modules/.tmp/tpv-prueba.csv` (96.936 filas)
y uno raro hecho a propósito (`ventas marzo.csv`: 19 días del 3 al 21 de marzo, de lunes a viernes de
la tercera semana, separador coma, decimal con punto, fecha y hora en una sola columna "Momento",
columnas "Mesa", "Pax (nº)", "Total €" y "Atendido por" con nombres de pila). A 1280 y 375 px, yendo y
volviendo por la cabecera, y exportando y abriendo los cinco ficheros: CSV del cuadrante, PDF para
colgar, resumen en una página, informe completo y CSV de todo. Mirado como la dueña de una cafetería
de 6, el gerente de un restaurante de 25 que quiere colgar el cuadrante el lunes y el director de
operaciones de 10 locales que busca el fallo para descartarla.

Las revisiones anteriores (`revision-flujo-2026-11-04.md` y `revision-ronda5-pantallas.md`) se
leyeron al final. Lo que ya consta allí y sigue igual no se repite: la portada con 9.250 € frente a
9.231 € (redondeo a 50, como se pidió), los 2.198 frente a 2.193 comensales, las horas
complementarias al 30 % de partida, las cifras fijas de "Con Shifty", la tabla de tramos estrecha en
móvil y la rejilla del día que empieza a las 06:00.

**Resumen: 2 graves, 7 medios, 14 menores.** Los dos graves están en los PDF, que es lo que sale de
la herramienta y llega a un socio o a una gestoría: el informe completo se sale del papel en la
página de criterios, y todos los PDF prometen en el pie que no se guarda ningún dato cuando la
portada dice que sí se guarda el plan.

Lo que está bien y se comprobó: ninguna frase dice ni insinúa que Shifty sea una ETT (pantalla y PDF
dicen siempre "la ETT colaboradora" o "las altas las gestiona una ETT colaboradora"); el precio es
"Desde 18,81 €/hora" y no aparece otro; no hay guiones largos en texto visible (el único fuera de
comentarios es el valor de reserva de `src/lib/parseFichero.ts:1706`, que solo saldría con cero
semanas); cero errores en consola en todo el recorrido; a 375 px ninguna pantalla tiene
desplazamiento lateral; ninguna pantalla sin salida. Los arreglos de la ronda 5 se ven en pantalla:
"5 personas fijas más" para las 187 h, "uno al frente mientras su jornada lo permita", "a las 14:00 y
a las 21:00", "Otra provincia". Las cuentas del ejemplo cuadran a mano: 587 h contratadas, 572 h en
turnos y 488,5 h de servicio; coste por puesto (16 € x 40 h x 1,32 = 845 €); 57,5 h de apertura;
ausencias 2.451 + 1.602 + 1.541. El CSV lleva marca de UTF-8 y punto y coma, y abre bien en un Excel
español.

---

## Graves

### G1. El informe completo se sale del papel en la página de criterios

- **Pantalla:** Llévatelo, "Informe completo" (PDF de 6 páginas), página 5.
- **Qué se ve:** la tabla "Con qué se ha calculado" sigue por debajo del pie: "Jornada partida",
  "Dos libranzas seguidas", "Puestos" y "Semanas excluidas" se pintan encima de la línea "Generado
  con el planificador..." y la última fila queda fuera de la hoja. Los valores largos salen cortados a
  la primera línea: "75 min la comida y 90 la", "Encargado (1), Jefe de", "Encargado, Responsable
  de". Y la página 6 lleva de cabecera "Los criterios" y está en blanco salvo la banda de Shifty al
  pie.
- **Qué debería:** que la sección reserve el alto real de la tabla (9 filas de 7 mm más el título) y
  salte de página si no cabe; los valores, en dos líneas o más cortos; la banda final pegada a lo
  último, sin una página casi vacía con el nombre de otra sección.
- **Dónde:** `src/lib/informe-pdf.ts:941` (reserva 60 mm), `:949-963` (filas sin control de pie y
  `split(...)[0]`, que corta), `:1025-1027` (página nueva solo para la banda).

### G2. Todos los PDF prometen "sin guardar ningún dato"

- **Pantalla:** pie de cada página del resumen y del informe completo.
- **Qué se ve:** "Generado con el planificador gratuito de Shifty · shifty.es · el cálculo se hace en
  tu navegador, sin guardar ningún dato". La portada dice lo contrario: "Guardamos el plan calculado,
  con tu curva de comensales y los nombres que pongas en el cuadrante", y el `CLAUDE.md` del proyecto
  confirma que el plan se guarda en el servidor al llegar al resultado.
- **Qué debería:** el pie no puede prometer algo falso sobre datos en un documento que se reenvía.
  "El cálculo se hace en tu navegador; tu fichero no se sube" es cierto y basta.
- **Dónde:** `src/lib/informe-pdf.ts:1055`.
- **No verificado:** el guardado en servidor no corre en local (sin variables del backend); el
  contraste es con el texto de la portada y la documentación, no con una fila guardada.

---

## Medios

### M1. La frase del dinero de "Los picos" se corta por la derecha en los dos PDF

- **Pantalla:** resumen e informe completo, página 1, recuadro morado "Los picos".
- **Qué se ve:** "En coste de empresa: tenerlas fijas todo el año son 163.543 €; pagar solo las horas
  que te faltan, a lo que te cues" y la línea se sale del recuadro y del margen. Es justo la frase que
  compara contratar con reforzar.
- **Qué debería:** medir la línea con la misma letra con la que se pinta.
- **Dónde:** `src/lib/informe-pdf.ts:518-524` (se mide en normal) y `:541` (se pinta en negrita).

### M2. "Resumen en una página" sale en dos

- **Pantalla:** Llévatelo, "Resumen en una página".
- **Qué se ve:** un PDF de 2 páginas; la segunda es la cabecera morada, un folio en blanco y la banda
  "Nunca te quedes sin personal" abajo del todo.
- **Qué debería:** o cabe en una, o el botón no lo promete. La banda puede ir más pequeña en la
  primera página.
- **Dónde:** `src/lib/informe-pdf.ts:1025-1027`.

### M3. La semana a medias se cuenta como semana entera

- **Pantalla:** Demanda, "Semanas raras", "Tu año" y la semana tipo. Con `ventas marzo.csv`.
- **Qué se ve:** el fichero acaba un viernes. La tercera semana tiene 5 días de datos y la herramienta
  la presenta como "S12 Semana floja, −28 %, 17 – 23 mar, por debajo de una semana normal", entra en
  la línea de cobertura y en el resultado se recomienda "pon las vacaciones en las semanas 11 y 12".
  Un 28 % es casi exactamente lo que faltan 2 días de 7. Cualquier exportación de TPV que empiece o
  acabe a mitad de semana (lo normal: "del 1 de enero al 31 de diciembre") mete dos semanas falsas.
- **Qué debería:** descartar o escalar la primera y la última semana si no están completas, y
  decirlo ("la última semana solo trae 5 días y no la cuento").
- **Dónde:** `src/lib/parseFichero.ts:1662-1672` (agrupa por semana sin mirar cuántos días tiene).
  No he encontrado tratamiento de semanas incompletas en `src/lib/`.

### M4. Con pocas semanas dice "uso todas" y usa dos de tres

- **Pantalla:** Demanda, "Semanas raras" y "Semana tipo". Con `ventas marzo.csv`.
- **Qué se ve:** aviso "Hay menos de 8 semanas útiles ... Mientras tanto, uso todas las semanas
  cargadas". La pantalla siguiente: "La semana tipo recoge la actividad del 67 % de las semanas", y en
  Tu año "Cubres 2 de 3 semanas, la otra 1 es un pico". Y debajo "Cómo se colocan en 2026: Carnaval
  pasa de la semana 9 a la 7, Semana Santa de la 16 a la 14", con un fichero de tres semanas de marzo
  que no tiene ni Carnaval ni Semana Santa.
- **Qué debería:** que el aviso diga lo que de verdad pasa (o que de verdad use todas), y enseñar el
  traslado de festivos solo si esas semanas están en el fichero.
- **Dónde:** `src/steps/StepDemand.tsx:1243-1250` y `:1253-1262`.

### M5. "16 a la vez más tus mandos" y luego "15 por el pico"

- **Pantalla:** Equipo (tarjeta naranja) frente a Tu plan, "Por qué", y los dos PDF.
- **Qué se ve:** Equipo: "necesitas 16 personas a la vez más tus mandos". Por qué: "el sábado a las
  14:00 necesitas 16 a la vez" y, dos líneas más abajo, "19 personas: 15 por el pico, 2 por el
  calendario y 2 de mando". Quien suma espera 16 + 2 mandos = 18 como mínimo. La persona que falta es
  el responsable de sala: los tramos piden uno siempre, el encargado lo cubre y en "Tu plantilla" ya
  no sale ningún responsable de sala, sin una línea que lo diga.
- **Qué debería:** decirlo donde se suma: "16 a la vez, uno de ellos el responsable de sala, que
  cubre tu encargado" o contar el pico ya descontado el mando.
- **Dónde:** `src/lib/contracts.ts:77-90` (el pico solo suma puestos con gente en plantilla),
  `src/steps/StepResult.tsx:1040-1070`.

### M6. Con un fichero propio la plantilla sale sin un solo mando

- **Pantalla:** Tu plan con `tpv-prueba.csv` (y con el fichero raro).
- **Qué se ve:** "40 personas en plantilla fija": 3 responsables de sala, 17 camareros, 5 ayudantes,
  11 cocineros y 4 de office. Ni encargado ni jefe de cocina, y la revisión ya no menciona quién está
  al frente. La portada vende el ejemplo "con encargado y jefe de cocina", y al subir el fichero
  propio los mandos vuelven a 0 sin avisar. Para el gerente de 25 una cocina de 11 sin jefe es un
  plan que no se cree.
- **Qué debería:** o los mandos se preguntan antes de dar el número ("¿tienes encargado? ¿jefe de
  cocina?"), o la revisión avisa "no has puesto ningún mando: nadie queda al frente de cocina".
- **Dónde:** `src/hooks/usePlanner.ts:368-377` (los pone a 0), `src/lib/avisos.ts` (no hay aviso de
  zona sin mando cuando el número es 0).

### M7. "Nunca te quedes sin personal" en el PDF

- **Pantalla:** banda final del resumen y del informe completo.
- **Qué se ve:** titular "Nunca te quedes sin personal". La propia herramienta dice en pantalla que
  el 81 % de los turnos pedidos con menos de 24 h se cubren, y que si no se cubre no se paga.
- **Qué debería:** un titular que no prometa el 100 %, por ejemplo "Cubre los picos sin inflar tu
  plantilla", que ya se usa en "Con Shifty".
- **Dónde:** `src/lib/informe-pdf.ts:1037`.

---

## Menores

| # | Pantalla | Qué se ve | Qué debería | Dónde |
|---|---|---|---|---|
| m1 | Lectura, "Rango de fechas" | Ejemplo: "30/12/2024 a 22/12/2025" (los datos llegan al 28/12). Fichero raro: "03/03/2025 a 17/03/2025" (llegan al 21/03). Enseña el lunes de la última semana, no el último día | El último día con datos | `src/lib/parseFichero.ts:1705-1706`, `src/lib/fakeAI.ts:181` |
| m2 | Horario, con datos irregulares | Barras de 2 a 2,5 h solo enseñan la hora de inicio ("19:30", "13:00", "20:00"); no se sabe a qué hora cierra ese día sin arrastrar | Hora de cierre visible, aunque sea al pasar por encima o debajo de la barra | `src/components/HoursEditor.tsx:595` |
| m3 | Exportar CSV | El del cuadrante empieza "Cuadrante semanal, Shifty Planning" (nombre interno). El completo dice "Modo de dimensionado; calibrado" (en pantalla es "Ajustado al histórico") y "Coste de empresa por hora trabajada (sin vacaciones ni festivos)", que se lee al revés de lo que es | "Planificador de plantilla", "Ajustado al histórico", "por hora trabajada (con vacaciones y festivos pagados)" | `src/components/RosterGrid.tsx:369`, `src/lib/export.ts:135`, `:164` |
| m4 | PDF para colgar | Las horas mezclan "19:30-24", "19:30-0:30" y "20-1". Exportado desde la vista por persona, que es la que se abre, el título es "Cuadrante de la semana" sin fechas; las fechas solo salen si antes se pasa a "Con fechas" | Una sola forma ("00:00", "00:30", "01:00") y proponer la semana que viene por defecto | `src/lib/cuadrante-imagen.ts:433` |
| m5 | Cuadrante y PDF | "Findes: el que más y el que menos · 2 y 1 · Días a la semana, de media en la rueda"; en el PDF "2 y 1 · Repartido de forma pareja". No se entiende qué son 2 y 1 | "Fines de semana trabajados al mes: entre 1 y 2 por persona" o lo que sea, en palabras | `src/steps/StepResult.tsx:1474-1484`, `src/lib/informe-pdf.ts:906` |
| m6 | Equipo frente a Por qué | "Jornadas de 40 h: 13" en Equipo; "saldrían 12,2 jornadas completas" en Por qué, con las mismas 488,5 h | La misma cifra (12,2) en los dos sitios | `src/steps/StepTeam.tsx:140` |
| m7 | Semanas raras | "S15 Pico sin identificar" con el desplegable ya puesto en "Fiesta local" | Desplegable en "Otra cosa" o vacío hasta que se elija | `src/lib/holidays.ts:235` |
| m8 | Los picos (fichero de prueba) | "aunque a la vez solo coincidan 1 más" | "solo coincide 1 más" en singular | `src/steps/StepResult.tsx:1649` |
| m9 | Cabecera | Al volver de Tu plan a Equipo, "Equipo" pierde el check y "Tu plan" lo conserva | Mantener el check de los pasos ya hechos | no localizado |
| m10 | Portada | "Tu fichero no se sube ... solo salen los nombres de las columnas y tres filas de muestra". Desde el 07-09 sale la forma de las celdas, no las filas; el texto asusta más de lo que pasa | "solo salen los nombres de las columnas y el formato de unas filas, nunca su contenido" | `src/steps/StepImport.tsx:74` |
| m11 | Cabecera | El logo "Shifty Planificador" lleva a shifty.es en la misma pestaña: un clic sin querer saca de la herramienta | Abrir en pestaña nueva o que el logo vuelva al inicio de la herramienta | `src/App.tsx:182` |
| m12 | Cuadrante, "Dónde sobra gente" (fichero de prueba) | "el domingo de 19:00 a 00:00 · empieza fuera del horario: es preparación o recogida · 24 h de más": cinco horas de servicio presentadas como preparación | Partir el tramo, o decir "empieza en la preparación" solo de la media hora que lo es | `src/steps/StepResult.tsx:1506` |
| m13 | Equipo | La cabecera fija dice "587 h de contrato a la semana" y la pantalla "pides 489 h de trabajo"; sin explicar por qué difieren en la misma vista | En Equipo, la cabecera con las horas de trabajo, o una frase que diga la diferencia | `src/App.tsx:112` |
| m14 | Portada, miniaturas | Las barras "40 h · 25-34 · 20-24 · < 20" no dicen que son horas de contrato; "Jefe de co..." cortado a 1280 px | "Horas de contrato a la semana" encima; nombre entero o abreviatura limpia | `src/components/QueVasAObtener.tsx:139-150`, `:215` |

---

## Para cada una de las tres personas

- **La dueña de la cafetería de 6.** La primera pantalla con su fichero le pide ya 9 puestos con
  "mando, siempre presente", "responsable de turno" y "responsable de sala", y la tabla de tramos
  empieza en 1 a 20 sentados y llega a 321 o más. No hay nada roto, pero todo está pensado para un
  restaurante de 25. Abandona en "Tus puestos".
- **El gerente de 25.** Consigue su cuadrante, pero el PDF para colgar sale sin fechas si no pasa
  antes por "Con fechas" (m4), y su plantilla sale sin jefe de cocina si no lo pone él (M6).
- **El director de 10 locales.** Abre el informe completo y la página 5 se sale del papel (G1), el pie
  dice que no se guarda nada y la portada dice que sí (G2), y la frase del dinero está cortada (M1).
  Con eso le basta para no enseñárselo a nadie.
