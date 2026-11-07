# Cambios en los PDF y los CSV, ronda 6 (4 de noviembre de 2026)

Arreglos de lo que `revision-ronda6-pantallas.md` y `revision-ronda6-calculo.md` encontraron en lo
que sale de la herramienta: los dos PDF del plan, el PDF para colgar y los dos CSV. No se ha tocado
ninguna cifra del cálculo (eso lo lleva otra tanda a la vez).

## Lo que se ha arreglado

- **G1. El informe completo ya no se sale del papel.** La tabla de criterios mide cada fila antes de
  pintarla, con los valores largos en dos líneas en vez de cortados ("75 min la comida y 90 la
  cena", "Encargado (1), Jefe de cocina (1)"), reserva su alto real y, si no cabe, empieza en
  página nueva. Ninguna fila pasa por debajo del pie. `src/lib/informe-pdf.ts`, sección 7.
- **G1 y M2. Ni página en blanco ni resumen en dos hojas.** Antes, si la banda de Shifty no cabía, se
  abría una página solo para ella. Ahora: si cabe, abajo de la última página como siempre; en el
  resumen, si no cabe entera va compacta (titular y botón, sin el párrafo) y, si tampoco, en una
  línea encima del pie; en el informe completo, los pasos y la banda van juntos en una página
  "Con Shifty", sin hueco entre ellos. El resumen va con algo menos de aire entre bloques.
- **G2. El pie dice la verdad.** Decía "sin guardar ningún dato". Ahora: "Tu fichero se lee en tu
  navegador y no se sube. Guardamos el plan calculado, con los nombres que pongas en el cuadrante,
  para que puedas volver a él", lo mismo que la portada. En dos líneas si hace falta.
- **M1. La frase del dinero ya no se corta.** Se mide en negrita, que es como se pinta. Repasados los
  demás textos de los dos PDF: el titular de los picos ahora cuenta en el alto de la caja si ocupa
  dos líneas, y los avisos de la revisión se medían con 16 mm de más y se salían de su caja por la
  derecha (visto con el fichero de prueba); arreglado.
- **M7. Fuera "Nunca te quedes sin personal".** El titular de la banda es el de la pantalla "Con
  Shifty": "Cubre los picos sin inflar tu plantilla", y la etiqueta "Para las semanas punta". El
  titular se encoge solo si no cabe al lado del botón.
- **m2 del cálculo. El CSV completo dice las semanas de pago de verdad**: "Coste de empresa anual
  (23 semanas de pago)" en un local de temporada, con el dato que ya llegaba.
- **m3. CSV sin nombres internos.** El del cuadrante empieza "Cuadrante semanal, planificador de
  plantilla de Shifty"; el completo dice "Dimensionado: Ajustado al histórico" y "por hora
  trabajada (con vacaciones y festivos pagados dentro)".
- **m4. PDF para colgar.** Las horas pasada la medianoche van siempre enteras ("00:00", "00:30",
  "01:00"); las de día siguen cortas ("13-17:30"). Desde la vista por persona sale ya con las fechas
  de la primera semana que aún se puede publicar a tiempo (la misma que propone "Con fechas") y con
  "Semana 1 de la rueda" si hay rueda. `src/lib/semana.ts` y `src/components/RosterGrid.tsx`.
- **m5, en el PDF.** La tarjeta "Findes" pasa a "Findes por persona: entre 1 y 2", con la pista
  "Días de sábado o domingo que trabaja cada uno a la semana", y con un decimal si hay rueda.
- **m2 de pantallas. Horario:** una barra corta enseña el tramo en horas cortas ("13-17") si cabe y,
  si no, el horario completo al pasar por encima. `src/components/HoursEditor.tsx`.
- **m10. Portada:** "solo salen los nombres de las columnas y la forma de tres filas, con fechas y
  cifras pero nunca un texto como un nombre", que es lo que hace `formaDeCelda`.
- **m11. El logo de la cabecera abre shifty.es en otra pestaña.** `src/App.tsx`.
- **De paso:** las cifras de cuatro dígitos del PDF salían sin punto ("5594 h" al lado de
  "39.000 €"), y la cabecera decía "1316 h de contrato". Ahora "5.594" y "1.316".

## Cómo se ha comprobado

Servidor local en el puerto 5200, recorrido entero en el navegador con el restaurante de ejemplo y
con `node_modules/.tmp/tpv-prueba.csv`, descargando cada fichero y pasando los PDF a imagen con
`pdftoppm` para mirarlos página a página.

- Resumen: 1 página con el ejemplo (con costes, banda compacta) y 1 con el fichero de prueba (banda
  entera y pasos). Antes, 2.
- Informe completo: 6 páginas con el ejemplo y 7 con el fichero de prueba; criterios enteros en su
  página con los pasos y la banda debajo, ninguna en blanco, nada bajo el pie.
- PDF para colgar: "Cuadrante del 9 al 15 de noviembre", horas en una sola forma.
- CSV completo y del cuadrante: con marca UTF-8, y con los textos nuevos.
- `npx tsc -b` a cero, `npm run verificar`, `comprobar-cuadrante`, `comprobar-coste`, el de demanda
  (23 de 23), el de lectura (153 de 153) y `npx vite build`: todo en verde.

## Lo que no se ha hecho

- **m5 en pantalla** (`StepResult.tsx`, tarjeta "Findes: el que más y el que menos") y **m8** ("solo
  coincidan 1 más"): son textos de `StepResult`, que está tocando la otra tanda a la vez. El PDF ya
  dice "entre 1 y 2"; conviene que la pantalla diga lo mismo.
- **m1 del cálculo**, el "−1 porque los turnos no encajan al minuto" en la frase de "De dónde sale el
  número" del PDF: sale del desglose del cálculo. Si el desglose deja de tener partes negativas, el
  PDF lo enseñará bien sin tocarlo.
- **La cabecera de algunas páginas del informe** dice la sección con la que se abrió la página ("El
  horario" en una hoja que también trae la demanda). No es nuevo y no se ha tocado.
- **Una barra de horario muy estrecha en el móvil** sigue sin texto; el horario está al pasar por
  encima, y en un móvil eso no existe. Se ve al pulsarla, en el panel de edición.
- **El caso de temporada del CSV** (23 semanas) no se ha generado de verdad en el navegador: no hay
  fichero de temporada a mano. El cambio solo pone en la etiqueta el número que ya se usaba para el
  importe.
