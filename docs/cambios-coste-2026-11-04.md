# Coste, ausencias y trabajo fijo (ronda 2, 2026-11-04)

Objetivo: que las cifras de plantilla y de coste aguanten la mirada de un director de operaciones.
Puntos de la revisión: 5, 6, 14, 20, 23, 25 y 26, más tres restos de la ronda 1.

## Qué ha cambiado

### 1. Coste de empresa, no sueldo (puntos 14 y 20)

- El catálogo de puestos pregunta qué es la cifra por hora: **sueldo bruto** (por defecto en planes
  nuevos) o **coste de empresa**. Si es bruto, se le suma la Seguridad Social de la empresa, un 32 %
  editable.
- Un plan guardado antes de este cambio no tiene ese dato y se sigue leyendo como antes (la cifra es
  coste de empresa, sin sumar nada). No cambia ningún número de un plan viejo.
- Coste semanal, anual, por puesto, el CSV y el PDF pasan a coste de empresa. El bruto sigue a la
  vista aparte.
- Nueva cifra: **coste por hora trabajada**. El año se paga entero, pero vacaciones y festivos no se
  trabajan: con los valores de partida sale 1,53 veces el bruto por hora de contrato.
- Ratio de personal sobre ventas con las bandas de "con Seguridad Social": sano entre 25 % y 30 %,
  alarma por encima del 35 %. Antes eran 32 % y 40 %, que son bandas sin cargas sociales. Por debajo
  del 25 % ahora dice que repase los datos, en vez de llamarlo "banda sana".
- Picos y Shifty: las horas de refuerzo se valoran al coste por hora trabajada, y junto al precio de
  18,81 €/h hay una nota "para compararlo con lo mismo": un refuerzo solo cobra la hora que trabaja;
  la plantilla, también la que no.

Ficheros: `src/lib/contracts.ts` (baseDeCoste, summarizeCost), `src/components/RoleCatalog.tsx`,
`src/steps/StepResult.tsx`, `src/components/StaffTable.tsx`, `src/lib/export.ts`,
`src/lib/informe-pdf.ts`.

### 2. Cuando falta alguien: vacaciones, festivos y bajas (puntos 5 y 26)

- Tarjeta nueva al final de "Tu plantilla", con tres datos editables: 30 días naturales de vacaciones,
  14 festivos y 6 % de bajas.
- Tiempo disponible por persona: 52 semanas menos 4,3 de vacaciones y 2,8 de festivos son 44,9
  semanas; con un 6 % de bajas, una persona está el 81,2 % del año.
- Horas al año sin nadie = horas en turnos × (semanas de vacaciones + semanas de festivos) + horas en
  turnos × semanas trabajadas × bajas.
- Personas de más para cubrirlas **dividiendo** por el tiempo disponible: horas a cubrir entre
  (2.080 h × 0,812). Multiplicar por (1 + porcentaje) se queda corto, porque quien sustituye también
  falta.
- Cada cifra lleva su frase de explicación.

Fichero nuevo: `src/lib/ausencias.ts`.

### 3. Vacaciones en las semanas flojas y fijo discontinuo (punto 6)

- La tarjeta de ausencias dice qué semanas del histórico piden menos que la plantilla, y cuántas
  horas de vacaciones caben ahí sin sustituir a nadie. Recuerda que el calendario de vacaciones se
  conoce con dos meses de antelación (art. 38 ET).
- En "Los picos", si hay 4 o más semanas punta seguidas (contando la vuelta del año), se explica el
  contrato fijo discontinuo (art. 16 ET) para esa temporada; los picos sueltos siguen siendo para
  refuerzos.

### 4. Horas complementarias antes de contratar (punto 23)

- Bloque "Antes de contratar" en "Los picos": cuántas horas a la semana pueden hacer los parciales
  con las complementarias pactadas (30 % por ley, se puede elegir 45 % o 60 % si el convenio lo sube,
  art. 12.5 ET), y cuántas horas de pico cubren semana a semana.
- Nadie llega a la jornada completa con ellas: cada persona se queda al menos 1 h por debajo.
- Las voluntarias (15 % más, solo indefinidos) se mencionan pero no entran en la cuenta, porque no se
  pueden dar por hechas.

### 5. Trabajo fijo por puesto y servicio (punto 25)

- En el paso de horario, debajo de la preparación por zona: una lista de tareas "N personas de este
  puesto, tantos minutos antes o después de cada servicio" (mise en place, limpieza de office...).
- Se aplica justo después de la preparación y se queda con el **máximo** de las dos, así que no se
  cuenta dos veces: si la preparación ya trae un cocinero una hora antes, una tarea de "1 cocinero,
  60 min antes" no añade a nadie.
- Nunca carga nada a un mando (van por horario y el cuadrante no les reparte este trabajo).
- La lista arranca vacía: ningún plan cambia hasta que alguien añade una tarea.
- La necesidad se enseña separada: horas que suben y bajan con los comensales y horas fijas.

Ficheros: `src/lib/staffing.ts` (applyTrabajoFijo), `src/lib/necesidad.ts`,
`src/components/TrabajoFijoEditor.tsx`, `src/steps/StepDemand.tsx`.

### 6. Restos de la ronda 1

- **Quien abre y cierra ya no puede ser un mando**, ni aunque estuviera elegido de antes: el mínimo
  por local cargado a un mando se perdía sin error, porque el cuadrante no reparte trabajo por
  volumen a los mandos. El desplegable tampoco los ofrece. Si una zona solo tiene mandos, lo dice.
- **Textos de privacidad**: la ventana de cuenta dice que el plan ya está en nuestro servidor (si
  hay servidor), que sin cuenta solo se abre desde este navegador o con su enlace, y que el fichero de
  ventas nunca se sube. El aviso "Sigues con…" dice si la copia está solo en el navegador o también
  en el servidor.

## Fuentes

| Dato | Valor | Fuente |
|---|---|---|
| Vacaciones | 30 días naturales | Estatuto de los Trabajadores, art. 38.1 |
| Calendario de vacaciones | Se conoce con 2 meses de antelación | ET, art. 38.3 |
| Festivos | 14 al año | ET, art. 37.2 |
| Complementarias pactadas | Hasta 30 %, convenio hasta 60 %; voluntarias hasta 15 % (30 % por convenio), solo indefinidos | ET, art. 12.5 |
| Fijo discontinuo | Trabajos de temporada o intermitentes | ET, art. 16 |
| Seguridad Social de la empresa | 23,60 contingencias comunes + 5,50 desempleo (indefinido) + 0,20 FOGASA + 0,60 formación + 0,75 MEI = 30,65 %; con accidentes de trabajo (~1,50 %) unos 32 %. Contrato temporal: 6,70 de desempleo, unos 33 % | Orden de cotización 2026, resúmenes de Cuatrecasas y Asepeyo, citados en la investigación del 2026-11-04 |
| Bajas | 6 % por defecto | Absentismo en hostelería 2025 de Randstad (6,3 %, citado por un tercero); Adecco da 7,6 % |
| Bandas de coste sobre ventas | Sano 25 a 30 %, alarma por encima de 35 %, con cargas sociales | Guías de plan de negocio de restauración citadas en la investigación |

La investigación es `docs/investigacion-planificadores-2026-11-04.md` de la rama de revisión del
flujo.

## Antes y después, con los datos de ejemplo

Precios de muestra del ejemplo, leídos ahora como sueldo bruto, 26.000 € de ventas a la semana.

| | Antes | Después |
|---|---|---|
| Personas / turnos | 26 / 111 | 26 / 111 (sin cambios) |
| Coste semanal | 8.395 € | 11.081 € (8.395 de bruto + 32 %) |
| Coste anual | 436.540 € | 576.233 € |
| Coste sobre ventas | 32 %, "sano" (banda de 32) | 43 %, por encima de la alarma del 35 % |
| Coste por hora | 11,28 € (bruto por hora de contrato) | 14,89 € de empresa por hora de contrato, 17,24 € por hora trabajada |
| Ausencias | no se contaban | 7.115 h al año sin nadie, 4,2 jornadas completas más |

Con el fichero de prueba `tpv-prueba.csv` y unos precios de 9,20 a 12 €/h: 25 personas, 10.209 €
a la semana de coste de empresa (7.734 de bruto), 7.130 h al año de ausencias (4,2 jornadas), 3.120
h de vacaciones que caben enteras en las semanas flojas, hora trabajada a 15,97 €, temporada en las
semanas 49 a 52, y las complementarias al 30 % cubren 572 de las 865 h de pico.

Trabajo fijo en el ejemplo: "1 cocinero 60 min antes" no cambia nada (la preparación ya lo traía);
"2 cocineros 90 min antes" sube a 27 personas y 795,5 h en turnos; "1 office 30 min después" suma
1 h.

## Comprobación

- `npx tsc -b`: cero errores.
- `npm run verificar`: 26 personas, 111 turnos, 11 semanas de pico, 870 h, como antes.
- `npm run comprobar-cuadrante`: "Todo en regla".
- Comprobación de demanda: 20 pasadas, 0 fallidas.
- `npm run comprobar-coste` (nuevo, `scripts/comprobar-coste.ts`): factor 1,32 y plan viejo a 1;
  hora trabajada entre 1,4 y 1,6 veces el bruto; ausencias por división; sumas; complementarias sin
  llegar a jornada completa; temporada con vuelta del año; vacaciones en flojas sin pasarse; quien
  abre nunca es un mando; trabajo fijo con máximo y sin mandos; lista vacía sin cambios. Sale con
  código 1 si algo falla.
- Probado en el navegador con `tpv-prueba.csv`, en ordenador y a 375 px: sin scroll lateral y sin
  errores en consola.

## Lo que queda abierto

- El 1,50 % de accidentes de trabajo es de un sitio de terceros y no está comprobado contra la
  tarifa oficial (depende del CNAE). Por eso el 32 % es editable.
- Las vacaciones en semanas flojas son una aproximación: no reparten persona a persona ni miran que
  dos del mismo puesto no coincidan.
- Las complementarias voluntarias no entran en la cuenta.
- Quitar una tarea de trabajo fijo la hace desaparecer sin transición de salida (entra con una).
- El `CLAUDE.md` del proyecto aún habla de bandas de 25 a 32 % y 40 %, y de coste por hora sin
  Seguridad Social: hay que actualizarlo en `Docs/repos/Planning-Tool.md`, no aquí.
