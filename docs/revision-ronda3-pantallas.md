# Revisión de pantallas, ronda 3 (4 de noviembre de 2026)

Recorrido completo en el navegador a 1280 px y a 375 px, con el restaurante de ejemplo (botón de la
portada) y con `node_modules/.tmp/tpv-prueba.csv` (96.936 tickets, 52 semanas). Con costes apagados y
con costes encendidos (11 €/h brutos en todos los puestos). Sin errores en consola. Solo lectura: no
se ha tocado código.

Mirado con dos personas en la cabeza: el dueño de un restaurante de 20 empleados que llega desde
LinkedIn, normalmente con el móvil, y el director de operaciones de un grupo de 10 locales.

No se repite nada de lo que ya está en `docs/revision-flujo-2026-11-04.md`. Cuando un punto de esa
lista está marcado como hecho y en pantalla sigue pasando, se dice aquí.

Gravedad: **grave** = da un número que no cuadra o hace desconfiar del resultado entero; **medio** =
confunde o deja al usuario sin saber qué hacer; **menor** = pulido.

---

## Graves

### 1. Las personas no suman: "17 por el pico + 4 por el calendario" son 21, y salen 22

- **Pantalla:** Tu plan, sub-paso "Por qué", nota de debajo de las cifras. Pasa igual con el ejemplo y
  con el fichero de prueba.
- **Qué se ve:** "La plantilla real es de 22 personas… Y el calendario pone 4 más. Por el pico
  bastarían 17… **22 es el mínimo con tus reglas**." 17 + 4 = 21. Y el informe PDF dice "cubrir
  todos los turnos pide 21 personas" en la misma frase que dice 22.
- **Qué debería verse:** que las cuentas cierren. O se explica la persona 22 (de dónde sale: un
  parcial que no cabe, una regla de contrato) o no se dice que 22 sea el mínimo.
- **Dónde:** `src/steps/StepResult.tsx:948-962` (la resta es entre `peopleFromDays` y `peopleFromPeak`,
  pero el titular usa `totalPeople`); `src/lib/informe-pdf.ts:490`; el cálculo, `src/lib/contracts.ts:62-77`.

### 2. "63 jornadas partidas, solo donde ahorran a alguien", y casi toda la plantilla parte cada día

- **Pantalla:** Tu plan, "Por qué" (cifra "Jornadas partidas") y el cuadrante.
- **Qué se ve:** 63 partidas a la semana con el ejemplo (64 con el fichero) para 22 personas: en el
  cuadrante casi todos los camareros, ayudantes y cocineros hacen comida y cena los cinco días
  (código P). Y la nota de abajo aconseja, para bajar la plantilla, "permitir jornada partida",
  que ya está permitida.
- **Qué debería verse:** el punto 10 de la revisión anterior está marcado como hecho, pero el
  resultado no lo refleja. Si de verdad cada partida ahorra a alguien, decir cuántas personas más
  harían falta sin ellas; si no, que salgan turnos seguidos. Y el consejo de "permitir jornada
  partida" solo si está apagada.
- **Dónde:** `src/steps/StepResult.tsx:910-921` (texto fijo "solo donde ahorran a alguien") y
  `:960-961` (el consejo sin mirar el ajuste).

### 3. Las horas de refuerzo cambian de una pantalla a la siguiente: 870, luego 322, luego 870

- **Pantalla:** "Los picos" y "Con Shifty".
- **Qué se ve:** en Los picos, "870 horas de refuerzo"; justo debajo, "las horas complementarias de
  tus parciales cubren 549 de las 870; quedan 322 para refuerzos". En la pantalla siguiente, la de
  venta: "Tu plan ya ha localizado 11 semanas y 870 horas de refuerzo".
- **Qué debería verse:** la pantalla de Shifty con la cifra que de verdad queda (322), o diciendo
  las dos. Vender 870 horas después de haber dicho que 549 las cubre su propia gente es lo que un
  director de operaciones caza en el primer minuto, y le quita crédito a todo lo demás.
- **Dónde:** `src/steps/StepResult.tsx:1621`.

### 4. El restaurante de ejemplo no tiene encargado ni jefe de cocina

- **Pantalla:** Demanda > Lectura ("Tus puestos") y Tu plan.
- **Qué se ve:** el ejemplo arranca con encargado, responsable de turno y jefe de cocina a 0, y sale
  una plantilla de 22 personas sin ningún mando. Mientras tanto, la portada enseña "Encargado" en el
  coste y el texto de puestos promete "el cuadrante deja siempre uno al frente".
- **Qué debería verse:** en el ejemplo, al menos un encargado y un jefe de cocina, para que se vea
  justo lo que se arregló en el punto 2 (el mando siempre presente). Un local de 22 personas sin
  nadie al mando es lo primero que un hostelero ve raro.
- **Dónde:** `src/data/presets.ts:65-70` (los tres a 0), y el relleno del ejemplo en
  `src/hooks/usePlanner.ts:332` (pone ventas y costes, no mandos).

### 5. Los tramos del ejemplo no casan con la nueva escala de "sentados a la vez"

- **Pantalla:** Equipo.
- **Qué se ve:** "Tu sábado llega a 366 personas sentadas" y, en la tabla, de 301 sentados en adelante
  bastan 7 camareros y 4 cocineros: unos 50 comensales por camarero. Con 26 a 60 sentados, 2
  camareros (unos 25 cada uno). La escala de abajo es la de antes y la de arriba la nueva.
- **Qué debería verse:** valores de ejemplo coherentes en toda la tabla (en sala se suele hablar de
  15 a 25 comensales por camarero), o recalibrados con la conversión a sentados. Tal como está, el
  hostelero o se ríe o deja de fiarse del resto.
- **Dónde:** los tramos de partida en `src/data/presets.ts`; la cifra de sentados en
  `src/steps/StepTeam.tsx:640`.

### 6. Volver a "Histórico" deja al usuario sin salida

- **Pantalla:** cualquier paso, pulsando "Histórico" en la cabecera o "← Tu histórico".
- **Qué se ve:** vuelve a la portada de subida, sin el aviso de "Sigues con…" y con Demanda, Equipo
  y Tu plan en gris, sin poder pulsarse. La única forma de recuperar el trabajo es subir otra vez el
  fichero o recargar la página.
- **Qué debería verse:** un botón "Seguir con mi plan" en esa pantalla, o los pasos de la cabecera
  que ya se han recorrido pulsables hacia delante.
- **Dónde:** `src/App.tsx:41` (solo deja ir a pasos anteriores); `src/steps/StepImport.tsx:395` (el
  aviso solo sale con lo guardado al abrir la página, no con lo de esta sesión).

### 7. La cabecera dice "22 personas · 597 h/semana", y esas 22 personas tienen 684 h

- **Pantalla:** cabecera fija de escritorio y barra fija de abajo en el móvil, en todos los pasos.
- **Qué se ve:** "22 personas / 597 h/semana". En Tu plan las mismas 22 personas suman 684 h de
  contrato y 666,5 h en turnos. En Equipo, en el móvil, salen dos barras a la vez: "17 en el pico ·
  595 h" y "22 personas · 595 h".
- **Qué debería verse:** al lado de las personas, sus horas de contrato, o la etiqueta "horas que
  pide tu local". Tres cifras de horas distintas para la misma plantilla, sin nombre, se leen como un
  error.
- **Dónde:** `src/App.tsx:185` y `:215` (pasa las horas que pide la curva).

---

## Medios

### 8. Pide las ventas a mano cuando el fichero ya trae el importe

- **Pantalla:** Tu plan > Por qué, con costes encendidos: "¿Cuánto factura una semana normal?".
- **Qué se ve:** la lectura reconoce la columna "importe" (en el fichero de prueba sale marcada como
  Importe) pero no se usa para nada, y luego se pide la facturación semanal a mano.
- **Qué debería verse:** la facturación de la semana tipo sacada del propio fichero, editable. Es el
  dato que convierte el resultado en "el personal se lleva el X % de lo que facturas".
- **Dónde:** `src/lib/parseFichero.ts:943-954` (se detecta) y `src/steps/StepResult.tsx:971` (se
  pide).

### 9. Dos precios de la hora de la plantilla en dos pantallas seguidas

- **Pantalla:** Tu plan (costes encendidos, 11 € brutos).
- **Qué se ve:** en "Tu plantilla", "3.649 h al año… o 65.250 € al año" (17,88 € la hora). En "Por
  qué", "cada hora trabajada te sale por 16,81 €". En "Con Shifty", "una hora trabajada… 16,81 €…
  el sueldo **con sus pagas extra**", aunque el cálculo no suma pagas extra: solo Seguridad Social y
  vacaciones y festivos.
- **Qué debería verse:** un solo precio por hora en todo el plan, y decir al pedir el sueldo si va con
  las pagas prorrateadas o sin ellas. Si el hostelero pone el bruto sin prorratear, la comparación con
  los 18,81 € de Shifty le sale torcida a favor de su plantilla.
- **Dónde:** `src/steps/StepResult.tsx:319` (el coste de cubrir ausencias va por jornadas × 52
  semanas, no por horas) y `:1823` (la frase de las pagas extra).

### 10. "Horas pagadas sin servicio" y "Horas de más": dos sobrantes distintos en la misma pantalla

- **Pantalla:** Tu plan > El cuadrante.
- **Qué se ve:** "Horas de más: 70 h" y, en la tarjeta de abajo, "Pagadas sin servicio: 87,5 h". Una
  mide turnos sobre lo que pide la curva y la otra contrato sobre lo que pide la curva.
- **Qué debería verse:** una sola cifra, o las dos con la resta a la vista (87,5 = 70 en turnos + 17,5
  de contrato sin turno, que ya está escrito en letra pequeña en una de ellas).
- **Dónde:** `src/steps/StepResult.tsx` (métrica "Horas de más") y `src/components/RosterGrid.tsx`
  (tarjeta "Pagadas sin servicio").

### 11. "Dónde sobra gente: el sábado de 12:00 a 14:00", que es justo el pico del día

- **Pantalla:** El cuadrante, lista "Dónde sobra gente".
- **Qué se ve:** el primer hueco que señala es el sábado de 12:00 a 14:00, y la herramienta dice en
  otro sitio que el sábado a las 14:00 es el momento que más gente pide (17 a la vez).
- **Qué debería verse:** si lo que sobra es la preparación antes de abrir (12:00 a 13:00), decirlo
  así. Tal cual, parece que se contradice.
- **Dónde:** la lista sale de `src/lib/metricas.ts` y se pinta en `src/steps/StepResult.tsx`.

### 12. "M · Mañana" para un turno de 13:00 a 17:30

- **Pantalla:** El cuadrante > Con fechas, y la leyenda.
- **Qué se ve:** los turnos de comida (13:00 a 17:30, 12:00 a 16:00) salen con M de Mañana, y los de
  cena con T de "Tarde y noche".
- **Qué debería verse:** en un restaurante de comidas y cenas eso es el turno de comida o de
  mediodía. "Mañana" para entrar a la una de la tarde es lo que delata que no lo ha hecho alguien del
  sector.
- **Dónde:** `src/lib/semana.ts:33`; `src/lib/roster.ts:178` (todo lo que acaba antes de las 15:00 de
  media es "Mañana").

### 13. El ejemplo de la portada se presenta como "resultado real" y la mitad es ilustrativa

- **Pantalla:** Portada, bloque "Antes de subir nada".
- **Qué se ve:** "Es el resultado real de un restaurante de menú y carta". El coste (7.650 € a la
  semana) y el cuadrante de Ana, Leo, Iván… son dibujos hechos a mano, y al abrir el ejemplo no sale
  ningún coste, porque los costes arrancan apagados. Debajo: "sale de tu propio histórico", justo
  después de decir que no son tus datos.
- **Qué debería verse:** "Así sale con un restaurante de ejemplo", y que lo que enseña la portada sea
  lo que enseña el ejemplo al abrirlo (con costes, si se enseñan costes).
- **Dónde:** `src/components/QueVasAObtener.tsx:112` y `:206-238`, y `:282`.

### 14. Pide decidir los mandos y los puestos antes de enseñar nada

- **Pantalla:** Demanda > Lectura, nada más subir el fichero.
- **Qué se ve:** debajo del mapeo de columnas, la lista de nueve puestos con "Se calcula: por
  comensales / mando, siempre presente", contrato, "Menores de 18", papelera y costes. Es la primera
  pantalla tras subir el fichero. El texto dice "Todos los de la lista son puestos que tienes", y
  trae jefe de partida, que la mayoría no tiene.
- **Qué debería verse:** primero lo que dice su histórico; los puestos, cuando se piden los tramos
  (que es donde se usan). La nota final ("según la gente que tengas en sala") es confusa: quiere
  decir según los comensales.
- **Dónde:** `src/components/RoleCatalog.tsx:137-139` y `:557`. Ojo: el sitio de esta lista lo
  decidió Crescente el 06-09 (ver `CLAUDE.md`, 2 undecies). Se apunta para que lo decida él, no para
  moverlo sin más.

### 15. Al volver atrás desde Equipo se cae en el primer sub-paso, no en el último

- **Pantalla:** Equipo, enlace "← Lo que hemos leído".
- **Qué se ve:** lleva a Lectura (1 de 5), así que para volver a Equipo hay que pasar otra vez por
  histórico, horario, semanas raras y semana tipo. Y el mismo paso se llama de tres maneras: "Demanda"
  en la cabecera, "Lo que hemos leído" en el enlace, "Tu histórico" en el sub-paso.
- **Qué debería verse:** volver a la semana tipo, y un solo nombre por paso.
- **Dónde:** `src/App.tsx:197`.

### 16. El margen se elige en dos sitios distintos

- **Pantalla:** Demanda > Tu histórico ("Margen de seguridad: sin colchón, +5 %…") y Equipo > Ajustes
  avanzados ("Cómo dimensionamos la semana tipo: ajustado al histórico / con más margen").
- **Qué debería verse:** uno solo. Con dos, nadie sabe cuál manda ni si se suman.
- **Dónde:** `src/steps/StepDemand.tsx` (margen) y `src/steps/StepTeam.tsx` (dimensionado).

### 17. La preparación también se pide dos veces

- **Pantalla:** Demanda > Horario.
- **Qué se ve:** "Cocina: entra antes 60 min" y, justo debajo, "Trabajo fijo: + Mise en place (1 h)".
  Para un cocinero las dos cosas son la misma.
- **Qué debería verse:** explicar en una línea en qué se diferencian, o quitar la sugerencia de mise
  en place si ya hay preparación puesta.
- **Dónde:** `src/components/TrabajoFijoEditor.tsx:22`.

### 18. En el móvil la tabla de tramos y la de plantilla esconden lo que importa

- **Pantalla:** Equipo y Tu plan a 375 px.
- **Qué se ve:** en tramos caben dos columnas de puestos, con los nombres cortados a "Re…" y "Ca…"
  (en escritorio a 1280 px también se cortan: "Resp…", "Coci…"). En "Lo que tendrías que contratar",
  el total, las horas y el coste semanal quedan fuera, a la derecha.
- **Qué debería verse:** el nombre del puesto entero (en vertical o en la cabecera de cada fila) y, en
  el móvil, la plantilla como lista y no como tabla.
- **Dónde:** `src/components/TiersTable.tsx:743` (el recorte); la tabla de plantilla en
  `src/components/StaffTable.tsx`.

### 19. En el móvil, el texto del cuadrante sale una palabra por línea

- **Pantalla:** El cuadrante a 375 px, cabecera "Tu plantilla al detalle".
- **Qué se ve:** "Quién / trabaja, / qué / día…" en una columna de una palabra, porque los botones de
  PDF y CSV se comen el ancho.
- **Qué debería verse:** los botones debajo del texto en pantallas estrechas.
- **Dónde:** `src/components/ui.tsx:205` y `:220` (la cabecera de tarjeta no se apila), usada en
  `src/components/RosterGrid.tsx:443`.

### 20. En el móvil se le pide arrastrar un fichero que está en el ordenador

- **Pantalla:** Portada a 375 px.
- **Qué se ve:** "Arrastra aquí tu fichero o haz clic para buscarlo en tu ordenador". Quien viene de
  LinkedIn está casi siempre en el móvil, y el export del TPV está en el ordenador del local.
- **Qué debería verse:** en el móvil, "elige el fichero" y una salida para quien no lo tiene ahí:
  ver el ejemplo (ya existe) o mandarse el enlace para hacerlo en el ordenador.
- **Dónde:** `src/steps/StepImport.tsx:459-462`.

### 21. La portada promete "ni email" y a mitad del plan sale un cuadro pidiendo el correo

- **Pantalla:** Portada ("Sin registro: ni email, ni tarjeta…") y Tu plan > El cuadrante (cuadro
  "Guarda este plan para no perderlo", que sale solo al llegar al cuadrante).
- **Qué debería verse:** o la portada dice "sin registro; si quieres, guárdalo con tu correo", o el
  cuadro no sale solo y se ofrece en "Llévatelo". El título "para no perderlo" además asusta: el plan
  ya está guardado.
- **Dónde:** `src/steps/StepImport.tsx:57`; `src/steps/StepResult.tsx:186-205`;
  `src/components/CuentaModal.tsx:126`.

### 22. Frases que un hostelero no entiende

- "Al 79 %, el cálculo da 3,8 veces más peso a quedarte corto que a tener gente de más."
  (`src/steps/StepResult.tsx:828`)
- "Contratar esa capacidad fija supone pagar 5 semanas de sueldo por cada semana punta cubierta."
  (`src/steps/StepResult.tsx:1463`)
- "Horas al año sin nadie: 6.519 h". No hay horas sin nadie: son horas de ausencia que hay que cubrir.
  (`src/steps/StepResult.tsx:729`)
- "Lo que sobra se paga sin servicio." (`src/steps/StepTeam.tsx:505`)
- "60 % · Revísala" junto a una columna: un porcentaje de confianza no le dice nada.
  (`src/components/MapeoColumnas.tsx:126`)
- "Cada fila es una columna de tu fichero." (`src/components/MapeoColumnas.tsx:93`)
- "Mientras el plan no tenga un enlace corto…" (`src/steps/StepResult.tsx:1937`)
- "Presets" en el horario.

### 23. El cuadrante promete coste que no va a ver

- **Pantalla:** Demanda > Tu histórico.
- **Qué se ve:** "Puedes ajustar la línea ahora y volver a cambiarla al final, cuando veas el coste de
  la plantilla", y los costes están apagados de partida: al final no hay coste.
- **Dónde:** `src/steps/StepDemand.tsx:562`.

### 24. Provincias: nueve, escritas en el código

- **Pantalla:** Semanas raras, "¿Dónde está el local?".
- **Qué se ve:** solo Madrid, Barcelona, Valencia, Sevilla, Málaga, Bizkaia, Zaragoza, Baleares y
  Canarias. Un local de Asturias o de Cádiz no puede elegir la suya.
- **Qué debería verse:** las 52 provincias, o "otra". Además choca con la regla de que ningún catálogo
  de territorios va escrito en el código.
- **Dónde:** `src/lib/territorio.ts:28-38`.

### 25. Las cifras de Shifty en la pantalla de venta no se han podido contrastar

- **Pantalla:** Con Shifty: "9 min hasta el primer candidato", "81 % de los turnos pedidos con menos
  de 24 h se cubren", "4,89 sobre 5", "701 anuncios", "2.806 valoraciones".
- **Por qué se apunta:** son cifras internas publicadas fuera (regla 15) y no aparecen en la lista de
  cifras públicas aprobadas, que habla de +20.000 profesionales y absentismo menor del 5 %. No se ha
  verificado si Crescente las aprobó ni si siguen siendo ciertas hoy.
- **Dónde:** `src/steps/StepResult.tsx:1780-1798`.

### 26. El que más manda en sala no está en la comida del sábado

- **Pantalla:** El cuadrante.
- **Qué se ve:** el Responsable de sala 1 (40 h) libra lunes y domingo y el viernes y el sábado solo
  hace la cena. La comida del sábado, que es el pico del local (17 personas), la lleva el responsable
  de 27 h. El punto 11 de la revisión anterior está marcado como hecho, pero solo vale para los mandos
  "de estructura", y aquí el responsable de sala va por comensales.
- **Dónde:** el reparto en `src/lib/roster.ts`; el puesto, `src/data/presets.ts`.

---

## Menores

27. **Guiones largos en textos que se ven:** "ajústalo — fuera del horario" (`src/steps/StepDemand.tsx:652`),
    "otro momento que el resto del local — por ejemplo" (`:669`), "Carnaval pasa de la semana 9 a la
    7 — 2 semanas antes" (`src/lib/holidays.ts:154`), "es lo normal, casi ningún TPV — " 
    (`src/components/MapeoColumnas.tsx:230-231`), "de 1 comensal en adelante" entre guiones
    (`src/components/TiersTable.tsx:886-887`), "Cuadrante semanal — Shifty Planning" en el CSV
    (`src/components/RosterGrid.tsx:365`).
28. **"1.6k", "1.2k", "6.1k"** en el total de la semana tipo: abreviatura inglesa y punto decimal
    inglés. (`src/components/charts/WeekHeatmap.tsx:123-124`)
29. **Decimales con punto en una tabla y con coma en la de al lado:** "72.5 h" en la plantilla franja a
    franja y "596,5 h" en el total.
30. **Fechas en formato ISO:** "2024-12-30 → 2025-12-22" en la cabecera de la lectura.
    (`src/steps/StepDemand.tsx:392`)
31. **Lista de semanas mal unida:** "45 y 47, 48" en "Pon las vacaciones en tus semanas flojas". Dos
    semanas seguidas salen con coma y sin "y". (`src/steps/StepResult.tsx:111`) Y "te ahorras cubrir
    unas 2856 de las 2856 h": dicho así parece un fallo; mejor "todas".
32. **Titular fijo "Con la sala con 40 personas sentadas"** en Equipo, cuando 40 no es ningún tramo ni
    sale de sus datos. (`src/steps/StepTeam.tsx:710`)
33. **"L" de Libra en la columna del lunes** de la vista por persona: se confunde con la L de Lunes.
34. **Botón "Ya está" apagado** al final de "Llévatelo": parece que algo ha fallado.
    (`src/steps/StepResult.tsx:2031-2037`)
35. **"Leyendo el fichero… abriendo y detectando el formato"** al abrir el ejemplo, que no tiene
    fichero. (`src/steps/StepImport.tsx:519`)
36. **Turno más corto de 1 o 2 horas** sigue en las opciones, cuando se subió a 4 h por defecto porque
    nadie viene a hacer menos.
37. **"Respetar las 12 h de descanso… desactívalo solo si sabes lo que haces"**: ofrecer apagar un
    mínimo legal a un hostelero no aporta. (`src/steps/StepTeam.tsx:415`)
38. **Mensajes de venta para cadenas en una herramienta de un local:** "sin inflar la plantilla de
    cada centro", "en tus restaurantes u hoteles", "en cualquiera de tus centros". Al dueño de un solo
    restaurante le suena a que no es para él. Separar el mensaje según tenga uno o varios locales.
39. **El botón "Quiero probar Shifty"** lleva a la página de contacto general sin nada del plan: el
    comercial no sabe que vienen 322 horas en 11 semanas. (`src/steps/StepResult.tsx:1855`)

---

## Lo que se ha comprobado y está bien

- Precio de Shifty: "Desde 18,81 €/hora", correcto.
- Nada dice que Shifty sea una ETT: siempre "la ETT colaboradora hace el contrato, el alta y la
  nómina".
- La portada dice lo que de verdad sale del navegador (nombres de columnas y tres filas) y que se
  guarda el plan.
- Sin errores en consola en todo el recorrido. Sin desplazamiento lateral de la página a 375 px.
- El cuadrante cumple lo que dice la revisión: nadie pasa de 9 h al día y el descanso de 12 h se
  respeta en los cruces que se han mirado a mano.
- El aviso de "Sigues con…" funciona al abrir la herramienta en una pestaña nueva.
