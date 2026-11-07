# Revisión de pantallas, ronda 7 (4 de noviembre de 2026)

Revisor escéptico, solo lectura de `src/`. Recorrido entero en navegador (servidor local en el puerto
5202, ya cerrado) con cuatro ficheros: el restaurante de ejemplo, `node_modules/.tmp/tpv-prueba.csv`
(96.936 filas) y dos de un bar de tapas pequeño hechos a propósito: `ventas-bar.csv` (enero a
diciembre de 2025, cerrado los lunes, sin columna de comensales, número de documento "F-000001",
columna "Camarero" con nombres de pila) y `ventas-bar-12m.csv` (el mismo bar, exportado como "los
últimos 12 meses": del 4 de noviembre de 2025 al 1 de noviembre de 2026). A 1280 y 375 px, yendo y
volviendo por la cabecera y los sub-pasos, retomando el plan guardado, poniendo nombres (uno largo,
"María José Fernández-Villalobos", y uno corto), cambiando costes, jornada partida y el descanso de
12 h, y exportando y abriendo como imagen los cinco ficheros: CSV del cuadrante, CSV "de todo", PDF
para colgar, resumen en una página e informe completo.

Mirado como el dueño de un bar de tapas de 6 que entra desde el móvil, la gerente de un restaurante
de 25 que quiere colgar el cuadrante el lunes y enseñar un PDF a su socio, y un director de
operaciones que busca un motivo para descartarla.

Las revisiones anteriores (`revision-flujo-2026-11-04.md` y `revision-ronda6-pantallas.md`) se
leyeron al final. Lo que ya consta y sigue igual no se repite: la tabla de tramos estrecha en móvil,
"Dónde sobra gente" con preparación dentro (m12 de la ronda 6), la cabecera con horas de contrato
frente a horas de trabajo en Equipo (m13), las cifras fijas de "Con Shifty", la semana incompleta del
principio o del final (M3) y la plantilla pensada para un restaurante de 25 que ve la dueña de una
cafetería.

**Resumen: 1 grave, 4 medios, 11 menores.** El grave está en la lectura del fichero: quien exporta
"los últimos 12 meses", que es lo más normal, pierde en silencio los meses del otro año natural, y
con ellos la Navidad.

Lo que está bien y se comprobó: los arreglos de la ronda 6 se ven (el informe completo ya cabe en
el papel y la página de criterios está entera; el resumen sale en una sola página; la frase del
dinero de "Los picos" ya no se corta; el pie de los PDF ya dice que se guarda el plan; la banda final
dice "Cubre los picos sin inflar tu plantilla"; con un fichero propio sin mandos la revisión avisa
"no has puesto ningún mando"; el PDF para colgar sale con fechas de la próxima semana publicable).
Ninguna frase dice ni insinúa que Shifty sea una ETT: pantalla y PDF dicen siempre "la ETT
colaboradora" o "una ETT colaboradora". El precio es "Desde 18,81 €/hora" y no aparece otro. No hay
guiones largos en texto visible. Cero errores en consola en todo el recorrido. A 375 px ninguna
pantalla tiene desplazamiento lateral, y ninguna pantalla se queda sin salida. Las cuentas del
ejemplo cuadran a mano entre pantalla, PDF y CSV: 19 personas, 587 h contratadas, 572 h en turnos,
488,5 h de servicio, 9.231 € a la semana (6.993 € x 1,32), 18,21 € la hora trabajada (11,91 x 1,32 x
52 / 44,9), 2.451 + 1.602 + 1.541 h de ausencias, 761 h de picos (487 + 274). El cuadrante del CSV,
el de pantalla, el del PDF para colgar y el del informe completo son el mismo turno a turno, y los
nombres puestos viajan a los cuatro y sobreviven a recargar la página. Apagar la jornada partida da
72 personas, exactamente las 40 + 32 que anunciaba "Por qué". Quitar el descanso de 12 h lo avisa la
revisión con el número de jornadas afectadas.

---

## Grave

### G1. Un export de "los últimos 12 meses" pierde los meses del otro año, Navidad incluida

- **Pantalla:** Demanda, Lectura, y todo lo que viene detrás. Con `ventas-bar-12m.csv` (19.618
  filas, del 04/11/2025 al 01/11/2026).
- **Qué se ve:** "Hemos usado 16.188 de las 19.618 filas de tu fichero. Se han quedado fuera 3430:
  La fecha es de otro año". "Rango de fechas: 30/12/2025 a 01/11/2026 · 44 semanas". Se queda con el
  año natural (ISO) que más filas tiene y tira el resto: noviembre y diciembre de 2025, un 17 % del
  fichero y justo la temporada de Navidad, que en muchos locales es el pico del año. Debajo dice
  "Calculo como si abrieras todo el año", y el plan sale con 44 semanas, "Cubres 35 de 44", sin los
  picos de diciembre. No hay forma de pedirle que use las 52 semanas: no existe ningún control para
  elegir el periodo. Exportar "último año" o "últimos 12 meses" es lo que ofrece por defecto casi
  cualquier TPV, y hoy, 4 de noviembre, es lo que haría quien llegue desde LinkedIn.
- **Qué debería:** si el fichero cubre 12 meses seguidos que cruzan dos años, usar esas 52 semanas
  (colocando cada semana por su número, como ya se hace con los festivos móviles) en vez de partir
  por año natural. Y si de verdad hay que elegir, preguntarlo y decir qué meses se pierden ("quedan
  fuera noviembre y diciembre de 2025"), no solo cuántas filas.
- **Dónde:** `src/lib/parseFichero.ts:1588-1597` (elige el año con más filas) y `:1599-1619` (el
  aviso cuenta filas, no dice qué meses). Ni `StepImport.tsx` ni `StepDemand.tsx` ofrecen elegir.
  Con un fichero de enero a diciembre pasa lo mismo en pequeño: los días 29 a 31 de diciembre caen
  en la semana 1 del año siguiente y se tiran (395 filas en `ventas-bar.csv`).

---

## Medios

### M1. Aviso falso de "no sé si tus fechas son día/mes o mes/día"

- **Pantalla:** Demanda, Lectura. Con `ventas-bar-12m.csv`, que empieza el 04/11/2025.
- **Qué se ve:** "En tus fechas ningún número pasa de 12, así que no se puede saber si son día/mes o
  mes/día ... Si tu fichero viene en formato americano, cámbialo en el botón de abajo", y un selector
  "¿Cómo se leen tus fechas?". Es falso: el fichero tiene días del 13 al 30 en todos los meses. Solo
  se miran las primeras 400 filas, y en un local con movimiento eso son los primeros 3 o 4 días; si
  el export empieza entre el día 1 y el 12 de un mes (lo normal es el día 1), el aviso sale siempre.
  Para el director que busca un motivo, una herramienta que dice que no sabe leer una fecha española
  es ese motivo.
- **Qué debería:** decidir con toda la columna de fechas, como dice el propio comentario de la
  función ("decidido con TODO el fichero"), o al menos con filas repartidas por todo el fichero.
- **Dónde:** `src/lib/parseFichero.ts:240` (`FILAS_A_OLFATEAR = 400`), `:1206-1217` y `:1457-1461`
  (solo miran esas filas); el comentario que promete otra cosa en `:657-664`.

### M2. "Exportar todo (CSV)" no lleva el cuadrante

- **Pantalla:** Tu plan, "Llévatelo".
- **Qué se ve:** el fichero `plantilla-completa-shifty.csv` trae plantilla por puesto, personas con
  sus días de libranza, coste, ausencias, criterios, horario y tramos, pero ni un solo turno: no dice
  quién entra a qué hora ningún día. El cuadrante en CSV solo se descarga desde el sub-paso "El
  cuadrante", y "Llévatelo" tampoco ofrece el "PDF para colgar". La gerente que va directa a
  "Llévatelo" para colgar el cuadrante el lunes no lo encuentra ahí, y el director que quiere
  meterlo en su herramienta se lleva "todo" sin lo principal.
- **Qué debería:** que "todo" incluya el cuadrante (una sección más, como las otras), y que
  "Llévatelo" tenga también el PDF para colgar y el CSV del cuadrante.
- **Dónde:** `src/lib/export.ts` (sin sección de turnos), botón en `src/steps/StepResult.tsx:2251`.

### M3. "Pico de tu equipo, sin mandos: 16" y, debajo, "una de ellas la hace tu mando"

- **Pantalla:** Equipo, tarjeta "En vivo". Con el ejemplo.
- **Qué se ve:** la etiqueta dice "PICO DE TU EQUIPO, SIN MANDOS · 16" y la nota naranja de debajo
  "necesitas 16 personas a la vez, una de ellas la hace tu mando mientras está". Si es sin mandos, no
  puede hacerla un mando. Es la misma suma que la ronda 6 arregló en "Por qué" (M5), ahora con la
  etiqueta contradiciendo a la frase en la pantalla anterior.
- **Qué debería:** quitar "sin mandos" cuando una de las plazas la cubre un mando, o decir "16 a la
  vez; tu encargado cubre una mientras está".
- **Dónde:** `src/steps/StepTeam.tsx:152` (etiqueta) frente a `:192-197` (nota).

### M4. "Tu plantilla" no explica por qué desaparece el responsable de sala

- **Pantalla:** Tu plan, "Tu plantilla", tabla por puesto y PDF. Con el ejemplo.
- **Qué se ve:** el catálogo tiene "Responsable de sala" a 13 €/h y los tramos piden uno en todos,
  pero la tabla "Lo que tendrías que contratar" no lo lista: sale Encargado, Camarero, Ayudante, Jefe
  de cocina, Cocinero y Office. La explicación existe, pero dos sub-pasos después, en "Por qué" ("el
  encargado lleva la sala") y en la revisión del cuadrante ("queda al frente Iván los días que libra
  el mando"). Quien ha puesto el puesto y su precio y no lo ve en la tabla del coste piensa que se ha
  perdido. La ronda 6 lo pidió en "donde se suma"; en "Por qué" está, en la tabla de plantilla no.
- **Qué debería:** una línea bajo la tabla: "Responsable de sala: no sale como puesto aparte; lo
  hace tu encargado mientras está y, cuando libra, un camarero".
- **Dónde:** `src/components/StaffTable.tsx` (tabla y lista móvil sin esa nota).

---

## Menores

| # | Pantalla | Qué se ve | Qué debería | Dónde |
|---|---|---|---|---|
| m1 | Equipo, "Jornadas de 40 h" | "12.2" y "25.7", con punto decimal; en el resto de la herramienta, "12,2" | Formatear con coma, como el resto | `src/steps/StepTeam.tsx:181` (pinta el número a pelo) |
| m2 | Tu plantilla, "Cuando falta alguien" (bar de tapas) | "Lo que queda por cubrir baja a 1754 h al año, unas 1 jornadas completas" | Singular: "una jornada completa" | `src/steps/StepResult.tsx:853` |
| m3 | Tu plantilla en móvil | "Responsable de sala 2 · 1 de 35h, 1 de parcial"; "4 de parcial" | "1 de 35 h y 1 parcial"; "4 parciales" | `src/components/StaffTable.tsx:152` |
| m4 | Varias pantallas frente al PDF | En pantalla "5594 h", "2451", "1942", "3211", "2198 comensales", "1313 h"; en el PDF y en otras cifras de la misma pantalla "5.594 h", "100.973", "12.632 h". El formato de España no agrupa números de cuatro cifras y el del PDF sí | Un solo criterio, con punto de miles siempre, igual que el PDF | `src/steps/StepResult.tsx:66`, `src/steps/StepDemand.tsx:75` frente a `src/lib/informe-pdf.ts:53` |
| m5 | CSV "de todo" frente a pantalla y PDF | "Horas que pide el servicio/semana;489"; en pantalla y PDF "488,5 h" | El mismo decimal que en pantalla | `src/lib/export.ts:199` (redondea) |
| m6 | Tu plantilla, tabla por puesto | Los costes por puesto suman 9.232 € y el total dice 9.231 € (redondeo fila a fila) | Que el total sea la suma de lo que se enseña, o redondear igual | `src/components/StaffTable.tsx` |
| m7 | Informe completo, página 3 | El nombre largo sale cortado: "María José" (la página 2 lo da entero). Con dos "María José" no se sabría quién es quién | Partir el nombre en dos líneas en vez de quedarse con la primera | `src/lib/informe-pdf.ts:677` (`split(...)[0]`) |
| m8 | Revisión del cuadrante | Un aviso amarillo "En Sala no hay mando el martes y miércoles" y, en el recuadro verde de debajo, "siempre alguien de la zona al frente". Se lee como una contradicción | "siempre alguien al frente (un mando o quien le cubre)" | `src/lib/avisos.ts` (texto de la comprobación cumplida) |
| m9 | Portada, ejemplo | La miniatura dice "25-34" y cuenta contratos de 25 a 39 h | La etiqueta del rango real, "25-39 h" | `src/data/ejemploPortada.ts:19` |
| m10 | Portada, abrir el ejemplo | Para los datos de ejemplo enseña unos 5 s de "Leyendo el fichero ... Localizando los comensales ... Paso 5 de 6", sin fichero que leer | Abrirlo directamente o decir "preparando el ejemplo" | `src/steps/StepImport.tsx:185` |
| m11 | Tus puestos, texto del coste | "el bruto del año entre sus horas": quien divide entre las horas que trabaja al año (unas 1.800 con su convenio) pone un precio un 15 % más alto, y luego la herramienta suma otra vez vacaciones y festivos al pasar a hora trabajada. El tooltip sí lo aclara ("entre 2.080") pero el texto visible no | En el texto visible: "el bruto del año entre 52 semanas de su jornada (40 h son 2.080 h)" | `src/components/RoleCatalog.tsx:133` |

---

## Para cada una de las tres personas

- **El dueño del bar de tapas de 6, en el móvil.** Si exporta "el último año" desde su TPV, pierde
  sin darse cuenta noviembre y diciembre (G1) y además le sale un aviso de que no se sabe leer sus
  fechas (M1). Con los valores de ejemplo le salen 11 personas para un bar de 6, cosa ya conocida.
- **La gerente de 25.** Consigue su cuadrante con nombres y su PDF para colgar, y los dos cuadran con
  la pantalla. Pero lo busca en "Llévatelo" y ahí no está (M2), y en la tabla de su plantilla no
  encuentra el responsable de sala que había puesto (M4).
- **El director de operaciones.** Encuentra el aviso falso de las fechas (M1), el "sin mandos" que
  incluye a un mando (M3), el "12.2" con punto (m1) y los 9.232 que no suman 9.231 (m6). Ninguno
  rompe el cálculo, pero el G1 sí: con un export de 12 meses el plan está hecho con 44 semanas y sin
  la Navidad.

## Cómo se comprobó

- Cada hallazgo se vio en pantalla o en el fichero exportado, y se localizó en el código.
- Los PDF se abrieron como imagen con `pdftoppm` y se leyeron con `pdftotext`.
- G1 y M1, además, leyendo `src/lib/parseFichero.ts` entero en esas funciones.
- No verificado: el guardado en servidor y el enlace corto (en local no hay variables del backend,
  así que la pantalla dice "aún no está guardado en nuestro servidor").
