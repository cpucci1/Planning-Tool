# Revisión de pantallas, ronda 5 (4 de noviembre de 2026)

Revisor escéptico, solo lectura. Recorrido entero en navegador (servidor local en el puerto 5195):
con el restaurante de ejemplo y con `node_modules/.tmp/tpv-prueba.csv` (96.936 filas), a 1280 y a
375 px, tocando margen, horario, preparación, provincia, nombres del cuadrante, volviendo atrás y
empezando de nuevo. Mirado como dueño de un restaurante de 20 personas que llega desde LinkedIn y
como director de operaciones de un grupo de 10 locales. La revisión anterior
(`revision-flujo-2026-11-04.md`) se leyó al final; lo que ya consta allí como pendiente (rueda de
fines de semana, Gemini, perfil de convenio, disponibilidad por persona) no se repite.

**Resumen: 2 graves, 10 medios, 16 menores.** Los dos graves son cifras de la misma pantalla que no
cuadran entre sí, justo lo que un director de operaciones comprueba con la calculadora.

Lo que está bien y se comprobó: ninguna frase dice ni insinúa que Shifty sea una ETT (siempre
"la ETT colaboradora hace el contrato, el alta y la nómina"); el precio es 18,81 €/hora en pantalla y
no aparece otro en el código; no hay guiones largos en texto visible (los que hay están en
comentarios); cero errores en consola en todo el recorrido; ninguna pantalla sin salida; a 375 px no
hay desplazamiento lateral de la página en ningún paso; "Empezar de nuevo" pide confirmación y
explica qué se borra; poner nombre a una persona del cuadrante funciona a la primera.

---

## Graves

### G1. Las horas pagadas sin servicio no salen de restar las cifras que tienen al lado

- **Pantalla:** Tu plan, "Por qué" (bloque "De dónde sale") y "El cuadrante" (tarjetas de arriba y
  métrica "En turno sin servicio"). Con el restaurante de ejemplo.
- **Qué se ve:** "Horas contratadas 582 h · El servicio necesita 488,5 h" y al lado "Horas pagadas
  sin servicio 100 h: 88,5 h en el local de más y 11,5 h de contrato sin turno". Debajo: "Pagas
  100 h más de las que pide el servicio, un 20 %". Pero 582 menos 488,5 son 93,5, no 100. En el
  cuadrante pasa lo mismo: "En turnos 570,5 h · el servicio pide 488,5 h" (82 h de diferencia) y la
  métrica de abajo dice "En turno sin servicio 88,5 h". Con el fichero de prueba sí cuadra
  (1.316 menos 1.029 son 287), así que el descuadre aparece cuando hay mandos: sus horas cubren
  necesidad de otro puesto y la cuenta por puesto las da por sobrantes.
- **Qué debería:** que las tres cifras de la tarjeta sumen. O las horas sobrantes se cuentan contra
  la necesidad total (93,5 y 82), o la línea de "el servicio necesita" dice qué incluye. El
  `CLAUDE.md` del proyecto ya avisa de este error exacto (las 76 h de 2026-09-05).
- **Dónde:** `src/lib/contracts.ts:94-108` (`horasPagadasSinServicio`, por puesto),
  `src/steps/StepResult.tsx:950-971`, `src/components/RosterGrid.tsx:476-492`,
  `src/lib/metricas.ts:255`.

### G2. "2 personas fijas más" para una semana a la que le faltan 187 horas

- **Pantalla:** Tu plan, "Los picos", y se repite en "Con Shifty" ("Contratar de más").
- **Qué se ve:** "Si contratas para el pico: 2 personas fijas más. Para cubrir la semana más
  exigente" y, en el párrafo de debajo, "la semana 22, la más exigente: le faltan 187 horas". Dos
  jornadas de 40 h son 80 h. Con el fichero de prueba es peor: "1 persona fija más" y "le faltan
  375 horas". El coste de "contratar para el pico" (65.692 €/año en el ejemplo) sale de esas 2
  personas, así que también se queda corto.
- **Qué debería:** el número de personas de esa tarjeta es cuánta gente MÁS coincide a la vez en el
  peor momento, no cuántas hacen falta para cubrir las horas de esa semana. O se dice así ("2 más a
  la vez en el peor momento") o se calcula con las horas (187 h son 5 jornadas). Tal como está, el
  dueño lee una contradicción en dos líneas y el argumento de Shifty pierde fuerza (contratar fijo
  parece más barato de lo que es).
- **Dónde:** `src/lib/contracts.ts:232-240`, `src/steps/StepResult.tsx:257`, `:1578-1581`,
  `:1622`, `:1853`.

---

## Medios

### M1. La portada promete "lo mismo que verás" y el coste no coincide

- **Pantalla:** portada ("Así sale con un restaurante de ejemplo") frente a Tu plan.
- **Qué se ve:** portada 9.150 € a la semana y 476.850 € al año. Abriendo el ejemplo en limpio (con
  el almacenamiento del navegador borrado): 9.191 € a la semana y 477.906 € al año. El texto de la
  portada dice "es lo mismo que verás si abres el ejemplo". El guion `npm run verificar` dice que
  cuadra (9150), porque su cálculo da 581 h y "parciales de 10 a 34h", mientras la herramienta da
  582 h y "de 10 a 33h": el guion y la pantalla ya no calculan lo mismo.
- **Qué debería:** que el guion reproduzca exactamente lo que hace la pantalla, y la portada con la
  cifra que sale (redondeada a 50, 9.200 €).
- **Dónde:** `src/data/ejemploPortada.ts:27-28`, `src/components/QueVasAObtener.tsx:115`,
  `scripts/verificar-calculo.ts`.

### M2. El catálogo promete un mando siempre presente y el resultado dice que no lo hay

- **Pantalla:** Demanda, Lectura ("Tus puestos") frente a Tu plan, "El cuadrante".
- **Qué se ve:** "Dime cuántos tienes y su jornada, y el cuadrante deja siempre uno al frente
  mientras su zona esté abierta." Con el ejemplo (1 encargado y 1 jefe de cocina de 40 h) la
  revisión dice "En Sala no hay mando el martes y miércoles ... en esas 31,5 h a la semana" y lo
  mismo en cocina con 38,5 h. Y debajo, en verde: "Lo demás está en regla: ... siempre alguien de la
  zona al frente".
- **Qué debería:** el catálogo no puede prometerlo con una sola persona de 40 h para 57,5 h de
  apertura. Decir "uno al frente mientras su jornada lo permita; los huecos te los marcamos".
- **Dónde:** `src/components/RoleCatalog.tsx:172-175`.

### M3. "Lo que tendrías que contratar: 21" y debajo hacen falta 3,3 jornadas más

- **Pantalla:** Tu plan, "Tu plantilla".
- **Qué se ve:** titular "21 personas en plantilla fija", tabla "Lo que tendrías que contratar ...
  Es la lista que necesitas para contratar", y justo debajo "Vacaciones, festivos y bajas: 5580 h ...
  con plantilla propia 3,3 jornadas completas más" (1,9 si las vacaciones van a semanas flojas).
- **Qué debería:** o el titular dice "21 para la semana tipo, más unas 2 para cubrir ausencias", o la
  tabla no se presenta como la lista para contratar. Un director de operaciones contrata 21 y se
  queda corto en agosto.
- **Dónde:** `src/steps/StepResult.tsx:655-662`.

### M4. Dos responsables de sala de 10 horas que solo van martes y miércoles

- **Pantalla:** Tu plan, "Tu plantilla" y "El cuadrante" (ejemplo).
- **Qué se ve:** "Responsable de sala: 2 parciales, 20 h". En el cuadrante, uno hace martes y
  miércoles de 19:00 a 00:00 y el otro martes y miércoles de 12:30 a 17:30; libran el resto de la
  semana. Sale de que el encargado libra esos dos días.
- **Qué debería:** un hostelero lo lee como un error: nadie contrata a un responsable para 10 h. Que
  la plantilla lo explique ("cubren los dos días que libra el encargado") o que proponga una sola
  persona de 20 h, o un responsable de turno.
- **Dónde:** `src/lib/roster.ts` (reparto de mandos, ver comentario de la línea 16).

### M5. Nueve "provincias", dos que no lo son, y elegirla no hace nada visible

- **Pantalla:** Demanda, "Semanas raras".
- **Qué se ve:** desplegable con Madrid, Barcelona, Valencia, Sevilla, Málaga, Bizkaia, Zaragoza,
  Baleares y Canarias. Ni Asturias, ni Cádiz, ni "otra". Canarias son dos provincias. Al elegir
  Madrid no cambia nada en las 15 semanas ("y te digo qué fiesta cae en cada semana rara"): ni una
  sugerencia ni un "no conocemos fiestas en esas semanas".
- **Qué debería:** catálogo de territorios completo (sale de la base, regla de territorio y sector),
  opción "otra provincia", y una frase cuando no hay nada que sugerir.
- **Dónde:** `src/lib/territorio.ts:28-38`, `src/steps/StepDemand.tsx:980-1000`.

### M6. Los nombres de la plantilla se suben al servidor y no se dice

- **Pantalla:** portada ("Tu fichero no se sube") y Tu plan, "El cuadrante" ("Ponle los nombres de
  tu gente").
- **Qué se ve:** la portada dice que se guarda "el plan calculado, con tu curva de comensales". Pero
  lo que se guarda incluye los nombres que el usuario escribe en el cuadrante: cada vez que se vuelve
  a entrar al resultado se guarda de nuevo, y el enlace corto deja leerlo a quien lo tenga. La
  invitación a poner nombres no avisa de nada.
- **Qué debería:** decirlo en la invitación ("los nombres se guardan con tu plan; quien tenga el
  enlace los ve") y en la portada, o no subir los nombres. Es dato de terceros (sus empleados): toca
  las cuatro preguntas de la regla 17.
- **Dónde:** `src/hooks/usePlanner.ts:1040-1056`, `src/lib/backend.ts:217`,
  `src/steps/StepImport.tsx:74`, `src/steps/StepResult.tsx:1479`.
- **No verificado:** el guardado en servidor no corre en local (no hay variables del backend); se ha
  leído el código, no se ha visto una fila guardada.

### M7. Horas complementarias pactadas al 30 % de partida

- **Pantalla:** Tu plan, "Los picos" ("Antes de contratar").
- **Qué se ve:** "Pactadas en tu convenio" con 30 % marcado de partida, y con eso "529 de las 761 h
  las pueden hacer tus parciales; quedan 232 de refuerzo". El pacto de horas complementarias se firma
  por escrito con cada persona; el convenio solo sube el tope.
- **Qué debería:** arrancar en "No pacto" o preguntar, y decir "pactadas con tus parciales". Con el
  30 % por defecto la herramienta da por firmado algo que la mayoría no tiene, y de paso rebaja a un
  tercio las horas que cubriría Shifty.
- **Dónde:** `src/lib/types.ts:371`, `src/lib/ausencias.ts:36`, `src/steps/StepResult.tsx:1710`.

### M8. Equipo: el momento más lleno es a las 21:00 y el pico de gente a las 14:00

- **Pantalla:** Equipo.
- **Qué se ve:** "Tu sábado llega a 134 personas sentadas. Es tu momento más lleno, a las 21:00" y a
  la derecha "Pico de personas 16, a la vez, el sábado a las 14:00". Las dos franjas caen en el mismo
  tramo; sale 14:00 porque es la primera vez que se llega a 16. Además "personas" vale para
  comensales y para plantilla en la misma pantalla, y el 16 no cuenta al encargado ni al jefe de
  cocina, que también están.
- **Qué debería:** "comensales sentados" para unos y "personas de tu equipo" para otros; si dos
  momentos empatan, decir "a las 14:00 y a las 21:00"; y que el pico diga "sin contar mandos".
- **Dónde:** `src/steps/StepTeam.tsx:143-152`, `:655-660`.

### M9. La captura del producto enseña caras y nombres, y jerga en inglés

- **Pantalla:** Tu plan, "Con Shifty".
- **Qué se ve:** la imagen de muestra pone "Próximos Shifts", "Detalle del Shift", "3/4 Shifters", y
  tres personas con foto, nombre e inicial ("Andrea C.", "Lucia V.", "Tommaso C."), en "Madrid".
- **Qué debería:** comprobar que no son trabajadores reales (si lo son, es dato personal en una pieza
  pública sin su permiso); y en una herramienta para hosteleros, "turnos" y "profesionales".
- **Dónde:** `public/shifty-turno.webp`, `src/steps/StepResult.tsx:1811-1817`.
- **No verificado:** si las fotos y nombres son de personas reales.

### M10. Cifras de Shifty escritas a mano en la pantalla

- **Pantalla:** Tu plan, "Con Shifty".
- **Qué se ve:** "9 min hasta el primer candidato", "81 % de los turnos pedidos con menos de 24 h se
  cubren", "4,89 de valoración media", "701 anuncios ... de junio a agosto de 2026", "2.806
  valoraciones desde marzo de 2026". Están fijas en el código.
- **Qué debería:** o se leen de una fuente que se actualice, o llevan fecha de revisión y alguien
  las repasa. En marzo de 2027 "junio a agosto de 2026" ya delata una herramienta abandonada.
- **Dónde:** `src/steps/StepResult.tsx:1940-1960`.
- **No verificado:** que las cifras sean las de hoy en la base.

---

## Menores

| # | Pantalla | Qué se ve | Qué debería | Dónde |
|---|---|---|---|---|
| m1 | Tu plan, Por qué y Cuadrante | Las mismas 100 h son "un 20 %" en un sitio y "17 % de lo contratado" en otro | Un solo porcentaje, con la misma base | `src/lib/metricas.ts:255`, `src/components/RosterGrid.tsx:492` |
| m2 | Demanda, Tu año y Semana tipo | La línea "llega hasta 2198 comensales"; la semana tipo suma "2.193". Una con punto de miles y otra sin él | Misma cifra o decir por qué difieren; mismo formato | `src/components/charts/YearChart.tsx:594`, `src/steps/StepDemand.tsx` |
| m3 | Demanda, Tu año | Con margen +10 % la plantilla sube (582 a 610 h) pero el texto sigue "llega hasta 2198 comensales" | Decir "2198, más un 10 % de colchón" | `src/components/charts/YearChart.tsx:594` |
| m4 | Varias | Se mezcla "lo he deducido", "He encontrado", "Dime cuántos tienes" con "hemos entendido", "Dinos" | Una sola voz | `src/steps/StepDemand.tsx:661`, `:948`, `src/components/RoleCatalog.tsx:174` |
| m5 | Semanas raras | La semana del 30 dic al 5 ene se llama "Cuesta de enero" y se etiqueta "Temporada baja"; tiene Nochevieja y Reyes | "Nochevieja y Reyes" para la semana 1 | `src/lib/holidays.ts:102` |
| m6 | Equipo, Ajustes avanzados | "Contratos a medida ... Si lo apagas, solo se usan los de la lista": no hay lista a la vista | Enseñar la lista o nombrarla (40, 30, 20, 15 h) | `src/steps/StepTeam.tsx:508` |
| m7 | Llévatelo, "Revisar algún criterio" | "Cobertura: La línea del gráfico de arriba", y en esa pantalla no hay gráfico | "La línea del gráfico del histórico (Por qué)" | `src/steps/StepResult.tsx:407` |
| m8 | Llévatelo | "Tu fichero de ventas sigue solo en este navegador" con el ejemplo (no hay fichero) y con un fichero de comensales | "Tu fichero" a secas, y nada si es el ejemplo | `src/steps/StepResult.tsx:2096-2102` |
| m9 | Cuadrante | "L" en gris significa "libra"; en la portada y en Semana tipo "L" es lunes | Un guion o "Libra" en pequeño | `src/components/RosterGrid.tsx:632` |
| m10 | Lectura, Tus puestos | "Media del catálogo 12,89 € ... sin contar cuánta gente hay de cada": una media que la propia pantalla dice que no sirve | Quitarla o ponderarla en el resultado | `src/components/RoleCatalog.tsx:150-156` |
| m11 | Lectura, Tus puestos | Casilla "Menores de 18" sin decir qué cambia | Una línea de ayuda (horario y tareas limitadas) | `src/components/RoleCatalog.tsx:358` |
| m12 | Portada | "En dos minutos. Cuatro pasos": son 4 pasos con 5 y 6 sub pantallas cada uno | "En unos minutos" o "cuatro pasos" sin tiempo | `src/steps/StepImport.tsx:63` |
| m13 | Tu año y Por qué | Puntos morados bajo algunas barras del histograma, sin leyenda | Leyenda ("semana rara") o quitarlos | `src/components/charts/YearChart.tsx` |
| m14 | Equipo, 375 px | La tabla de tramos enseña 2 de 6 puestos, "Camarer" cortado, sin pista de que se desliza; el botón queda en "Ejemplo" | Sombra o flecha de desplazamiento; "Valores de ejemplo" | `src/components/TiersTable.tsx:660` |
| m15 | Equipo, 375 px | Barra fija de abajo: "· 40 personas" en línea suelta y "toca..." cortado | Dos líneas limpias sin el "toca" | `src/steps/StepTeam.tsx:257` |
| m16 | Semana tipo | La rejilla empieza a las 06:00 con siete horas cerradas; en móvil hay que deslizar mucho para ver un dato; cabecera "06:00" cortada, un recuadro de foco en una celda vacía al cargar; "mayús + clic" en móvil | Empezar una hora antes de la apertura; sin foco inicial; no hablar de teclado en móvil | `src/components/charts/WeekHeatmap.tsx` |

---

## Para el director de operaciones de 10 locales

No es un fallo de pantalla, pero se nota en el primer minuto: la herramienta es de un local. No hay
forma de llevar los diez ni de compararlos, y la pantalla de Shifty le habla de "cada centro". Si
ese perfil importa, el siguiente paso es un "añadir otro local" que guarde varios planes bajo el
mismo correo (el backend ya tiene la lista de planes por cuenta).
