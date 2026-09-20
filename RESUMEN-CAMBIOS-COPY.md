# Revisión del copy del Planificador de plantilla

## Criterio general

La herramienta ya tiene una buena base, pero mezcla frases muy claras con otras demasiado técnicas, largas o poco exactas. La revisión mantendrá intactos todos los números y cálculos. Cambiará solo la manera de explicarlos y, en las pantallas de picos y Shifty, el orden visual del argumento.

La regla para todos los cambios es esta: primero se dice qué significa el dato para el negocio y después, solo si hace falta, cómo se ha calculado.

## Portada y carga del fichero

- **Actual:** «Súbenos el histórico de comensales de tu TPV».
  **Problema:** suena a que el fichero se envía a Shifty, aunque se procesa en el navegador.
  **Propuesta:** «Carga el histórico de comensales de tu TPV».
- **Actual:** «Da igual el formato: el export de tu TPV, un Excel, un CSV, un PDF de listados».
  **Problema:** promete leer PDF, pero la herramienta admite Excel y CSV.
  **Propuesta:** «Puedes usar el Excel o CSV que exporta tu TPV. No hace falta ordenar las columnas antes.»
- **Actual:** «De ahí sacamos cuánta gente entró por tu puerta cada media hora, día a día, durante un año entero».
  **Problema:** da por hecho que el fichero contiene un año completo.
  **Propuesta:** «De ahí leemos cuántos comensales tuviste en cada franja durante el periodo que hayas exportado.»
- **Actual:** «No hay servidor detrás. El cálculo entero ocurre en esta pestaña, así que si la cierras se pierde».
  **Problema:** ya no es cierto: el fichero no sale del navegador, pero el plan calculado puede guardarse.
  **Propuesta:** «El fichero se lee solo en este navegador. El plan calculado se guarda para que puedas retomarlo y compartirlo.»
- **Actual:** «Shifty es el marketplace de personal de hostelería...».
  **Problema:** «marketplace» es jerga y no explica el valor para varios centros.
  **Propuesta:** «Shifty ayuda a restaurantes, cadenas y hoteles a cubrir turnos con profesionales verificados, sin sobredimensionar la plantilla fija.»

## Lectura del fichero

- **Actual:** «Qué es la confianza» y «94%, échale un ojo».
  **Problema:** «confianza» suena técnico cuando la decisión real es confirmar una columna.
  **Propuesta:** «Por qué te pedimos revisar una columna» y «Revísala: no estamos del todo seguros».
- **Actual:** «A partir de aquí, toda cifra de comensales que veas es una estima».
  **Problema:** «estima» resulta poco natural.
  **Propuesta:** «A partir de aquí, los comensales son una estimación calculada desde tus tickets.»

## Tu histórico

- **Actual:** «Tu año» y «Comensales al año».
  **Problema:** es incorrecto cuando el fichero contiene menos de 52 semanas.
  **Propuesta:** «Tu histórico» y «Comensales del histórico».
- **Actual:** «Se ve el verano, se ve diciembre y se ven los picos».
  **Problema:** es genérico y no explica qué tiene que hacer el usuario.
  **Propuesta:** «Cada barra es una semana. Mueve la línea para decidir qué semanas cubrirá tu plantilla fija.»
- **Actual:** «Sobrecobertura».
  **Problema:** es jerga técnica.
  **Propuesta:** «Holgura en semanas flojas», explicado como la diferencia entre la plantilla fija y la gente que esas semanas necesitan.
- **Actual:** «Aquí solo te sitúas: dónde la dejas del todo se decide al final, cuando ya se vea lo que cuesta cada centímetro».
  **Problema:** «cada centímetro» no corresponde a ninguna medida del negocio.
  **Propuesta:** «Puedes ajustar la línea ahora y volver a cambiarla al final, cuando veas el coste de la plantilla.»

## Horario y preparación

- **Actual:** explicación de más de cincuenta palabras bajo «Mínimo y preparación».
  **Problema:** mezcla el mínimo, la apertura y el cierre antes de que el usuario vea los controles.
  **Propuesta:** «Indica cuántas personas deben estar siempre en cada zona, incluso con la sala vacía.» La preparación y el cierre se explican en su bloque propio.
- **Actual:** «Es el mismo mínimo de arriba, solo que más ancho».
  **Problema:** «más ancho» obliga a imaginar el funcionamiento interno.
  **Propuesta:** «Añade el tiempo que ese equipo necesita antes de abrir y después de cerrar.»

## Semanas especiales y semana tipo

- **Actual:** «He encontrado X semanas raras comparando cada semana con la mediana del año».
  **Problema:** «mediana» es correcta, pero innecesariamente técnica en el primer mensaje.
  **Propuesta:** «He encontrado X semanas que se alejan bastante de una semana normal. Revísalas antes de seguir.»
- **Actual:** «Tu año es de los tranquilos».
  **Problema:** puede sonar condescendiente y vuelve a asumir un año completo.
  **Propuesta:** «No hay semanas que necesiten una revisión especial.»
- **Actual:** «Las 1 semanas» en el resumen de la semana tipo.
  **Problema:** error de concordancia.
  **Propuesta:** singular y plural correctos según el número mostrado.

## Equipo y reglas de los turnos

- **Actual:** «Desgaste del dato».
  **Problema:** no es una expresión que use un encargado de sala, un director de hotel o un responsable de operaciones.
  **Propuesta:** «Adelantar la necesidad respecto al cobro», con una explicación breve: el TPV registra el cobro después de atender la mesa.
- **Actual:** «Horas-persona que pide la curva».
  **Problema:** junta dos términos técnicos.
  **Propuesta:** «Horas de trabajo necesarias en total».
- **Actual:** «Esas jornadas son la cuenta de la servilleta».
  **Problema:** es coloquial, pero resta credibilidad ante cadenas y hoteles.
  **Propuesta:** «Dividir las horas entre 40 es solo una referencia. La plantilla real también depende de cuántas personas coinciden en el pico.»
- **Actual:** «Calibrado» y «Conservador».
  **Problema:** no permiten anticipar la consecuencia de elegir cada opción.
  **Propuesta:** «Ajustado al histórico» y «Con más margen», conservando exactamente el mismo funcionamiento.

## Tu plan: plantilla, explicación y revisión

- **Actual:** «Plantilla equivalente» y «Por horas te bastarían X jornadas completas».
  **Problema:** la comparación es útil, pero el concepto se presenta antes de explicar que varias personas deben coincidir.
  **Propuesta:** «Si solo dividieras las horas entre jornadas de 40 h» y, justo después, «La plantilla real es mayor porque en el pico necesitas X personas a la vez».
- **Actual:** «La demanda y la gente, hora a hora» y «los escalones, las personas que piden tus tramos».
  **Problema:** «piden tus tramos» obliga a recordar una pantalla anterior.
  **Propuesta:** «La curva morada muestra los comensales; los escalones, cuántas personas hacen falta en cada franja.»
- **Actual:** explicaciones largas en «Horas de más» y «Comensales por hora».
  **Problema:** esconden el dato importante dentro de varios matices.
  **Propuesta:** empezar por la lectura del negocio y dejar el detalle como segunda frase.

## Los picos: cambio de enfoque

### Qué falla ahora

El titular actual, «X semanas al año necesitas más gente de la que tienes en plantilla», no distingue entre el histórico cargado y un año completo. Después aparecen varios párrafos seguidos y la comparación económica queda escondida. Para entender el argumento hay que leer demasiado.

### Propuesta

La pantalla se ordenará como una decisión de negocio:

1. Titular directo: «Tu plantilla fija se queda corta X semanas».
2. Dos cifras grandes: semanas afectadas y horas de refuerzo.
3. Comparación inmediata entre «contratar para todo el año» y «cubrir solo las horas del pico», mostrando los mismos euros que ya calcula la herramienta.
4. Una conclusión corta: el problema no es de plantilla fija, sino de refuerzos puntuales.

Si no hay semanas por encima de la línea, se explicará que la plantilla se ha dimensionado para la semana más exigente y se invitará a comprobar cuánta holgura genera en las semanas normales.

## Con Shifty: cambio de enfoque

### Qué falla ahora

La pantalla actual explica el proceso, pero no responde con fuerza a las dos alternativas reales: contratar de más o resolver cada falta por WhatsApp. La captura ocupa todo el ancho y compite con el mensaje. El argumento tampoco habla a un director de operaciones que gestiona varios restaurantes u hoteles.

### Propuesta

- **Nuevo titular:** «Cubre los picos sin inflar la plantilla de cada centro».
- **Nuevo arranque:** conectar las semanas y horas ya calculadas con una decisión operativa: publicar solo los turnos que faltan, elegir profesionales verificados y dejar el contrato y el alta en manos de la ETT colaboradora.
- **Nueva comparación:** tres opciones fáciles de escanear: contratar de más, tirar de llamadas y WhatsApp, o cubrir con Shifty. La tercera destacará que cada centro conserva historial, favoritos y valoraciones para repetir con quien funciona.
- **Foco en cadenas y hoteles:** añadir un mensaje específico sobre control por centro: cada responsable cubre su turno y operaciones mantiene un criterio común, con la información guardada.
- **Captura:** pasará a una columna secundaria, con ancho limitado y posibilidad de abrirla a tamaño completo.
- **Prueba y precio:** conservar exactamente las cifras y el precio actuales, pero presentarlos después de explicar el valor.

## Llevátelo y mensajes compartidos

- **Actual:** si falla el guardado, «Nada de esto se guarda en ningún servidor».
  **Problema:** contradice el guardado del plan y mezcla el fichero original con el resultado.
  **Propuesta:** «Tu fichero sigue solo en este navegador. Si el guardado del plan falla, descarga una copia para no perder el trabajo.»
- **Actual:** el crédito a Fernando del Valle Herrera solo aparece al final de la portada.
  **Problema:** no cumple el reconocimiento acordado en el resto de pantallas.
  **Propuesta:** moverlo a un único bloque compartido, al final de todas las pantallas, con avatar de 30 px. Mientras no exista la foto, se mostrará un círculo con «FV» y nunca un icono roto.

## Límites de esta revisión

- No se cambia ningún número, porcentaje, hora, persona, semana, precio ni cálculo.
- No se cambia el funcionamiento de los controles.
- Shifty aparece donde ayuda a decidir cómo cubrir picos; el resto del recorrido sigue centrado en obtener un plan útil.
