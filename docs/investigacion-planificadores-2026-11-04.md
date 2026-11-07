# Cómo lo hacen los mejores planificadores, y qué le falta al nuestro

Investigación del 4 de noviembre de 2026, encima de la revisión de 19 puntos del mismo día
(`revision-flujo-2026-11-04.md`). No repite lo que ya está allí: lo confirma, lo matiza o lo amplía, y
añade lo nuevo.

**Cómo se ha hecho.** Centros de ayuda y documentación de Quinyx, Fourth (HotSchedules), Deputy,
7shifts, Planday, Skello, Combo, Sesame, MAPAL OS (antes GIR), Legion, UniFocus, When I Work y
Agendrix; textos legales del Estatuto de los Trabajadores y del Real Decreto 1561/1995; guías de
cotización 2026; guías y plantillas españolas de cuadrante (Combo, Qamarero, Turnozo, Skello); y
reseñas. **Límites:** Capterra, G2, varios artículos de 7shifts y Deputy y Reddit bloquean la lectura
automática (error 403 o acceso denegado), así que de las quejas de usuarios solo hay lo que recogen
los buscadores y los resúmenes de terceros. Nada de esto sale de haber usado los productos.

Lo que pone **NO VERIFICADO** no se ha podido confirmar en una fuente. Lo que se atribuye a un
producto es lo que dice su propia documentación o su web; si solo lo dice un tercero, se indica.

Al final de cada punto: **[R n]** si ya está en la revisión de 19 puntos (con el número), **[NUEVO]**
si no, y **[AMPLÍA R n]** si la revisión lo apunta pero se queda corta.

---

## 1. Lo que debería cambiar o añadir, por prioridad

### Prioridad alta: lo que un hostelero con experiencia ve en el primer minuto

**1. El coste por hora de turno, no el sueldo por hora de contrato.** [AMPLÍA R 14]
- *Qué.* Pedir el sueldo bruto anual (o mensual y número de pagas) y calcular el coste de empresa
  por hora **efectivamente trabajada**: sueldo más Seguridad Social de empresa, repartido entre las
  horas de jornada anual del convenio, no entre 40 h por 52 semanas.
- *Por qué.* La revisión solo suma la Seguridad Social. Falta la otra mitad: las vacaciones, los
  festivos y las pagas extra se pagan y no se trabajan. Con una jornada anual de convenio de unas
  1.783 h (Cataluña, 2026) frente a las 2.080 h de 40 h por 52 semanas, cada hora de turno cuesta un
  17 % más que el sueldo dividido entre las horas de contrato, **antes** de la Seguridad Social. La
  cotización de empresa de 2026 en contrato indefinido es 23,60 % + 5,50 % + 0,20 % + 0,60 % + 0,75 %
  = 30,65 %, más accidentes de trabajo (en torno a 1,50 % para restaurantes según una fuente de
  terceros), es decir, alrededor de un 32 %. En temporal el desempleo sube al 6,70 % (alrededor de
  un 33 %), y los contratos de menos de 30 días pagan además 33,62 € al terminar. Juntando las dos
  cosas, el coste real por hora de turno ronda **1,5 veces** el sueldo bruto por hora de contrato
  (cálculo propio con esas cifras).
- *Quién.* Planday deja sumar un porcentaje de "costes de nómina adicionales" encima del sueldo, y
  ese coste sale en el cuadrante y en el informe de ventas. Skello, 7shifts y Combo enseñan la masa
  salarial y los ratios mientras se monta el cuadrante.
- *Además.* El umbral de alarma de la herramienta (sano 25 a 32 %, alarma por encima del 40 %) está
  pensado sin cargas: las guías que incluyen cargas sociales ponen lo sano en 25 a 30 % y la
  alarma en 35 %. Si se pasa a coste de empresa, la alarma debe bajar a 35 %.

**2. Un "perfil de convenio" con todas las reglas en un sitio, y avisos que se pueden forzar.** [NUEVO, recoge R 1, R 13]
- *Qué.* Una sola ficha de reglas, con valores legales por defecto y editables según el convenio:
  horas máximas al día (9) y a la semana, descanso entre jornadas (12 h), descanso semanal (día y
  medio, acumulable en 14 días), duración mínima y máxima de un turno, cuántas fracciones puede
  tener una partida (dos) y el descanso mínimo y máximo entre ellas, pausa según horas seguidas, y
  jornada anual. Cada regla puede ser obligatoria (no deja cerrar el cuadrante) o solo aviso.
  Saliendo de la base por territorio, no escritas en el código (regla de agnóstica de territorio).
- *Por qué.* Hoy las reglas están repartidas entre ajustes sueltos (descanso de 12 h sí o no,
  libranzas seguidas, turno más largo) y la revisión añade más sueltas. Un hostelero piensa en "mi
  convenio", no en interruptores. Y si una regla dura no se puede saltar, quien tenga un convenio
  que permita 10 h se va.
- *Quién.* MAPAL OS lo hace exactamente así: un convenio agrupa descanso semanal, máximo diario y
  semanal, descanso entre jornadas, duración mínima y máxima de turno y condiciones de la partida, y
  cada alerta puede ser obligatoria ("no se permitirá imprimir o finalizar un turno"). Deputy usa
  "perfiles de estrés" (máximo por turno, por día, por semana, días por semana y horas entre turnos)
  que avisan y dejan programar igualmente. Combo avisa en tiempo real contra el convenio HCR y deja
  corregir antes de publicar; Skello dice integrar las reglas del convenio HCR y del código de
  trabajo francés.

**3. Turno de noche y menores de edad.** [NUEVO]
- *Qué.* Dos avisos que hoy no existen. **Nocturno**: quien hace al menos 3 h entre las 22:00 y las
  6:00 es trabajador nocturno, no puede pasar de 8 h de media en 15 días ni hacer horas extra, y el
  convenio le paga un plus. **Menor de 18**: máximo 8 h al día, nada de noche, sin horas extra, pausa
  de 30 minutos si pasa de 4 h y media seguidas y dos días seguidos de descanso semanal.
- *Por qué.* La rejilla ya llega a las 6:00 para los locales de copas, y ahí el turno de cierre es
  nocturno casi siempre. Y en verano entran ayudantes y office de 16 y 17 años.
- *Quién.* Skello dice integrar los recargos de noche, domingo y festivo. NO VERIFICADO que ningún
  planificador del mercado avise de menores.

**4. Del cobro a la mesa ocupada, en un solo paso.** [AMPLÍA R 4]
- *Qué.* Al pasar a comensales sentados a la vez, la hora del ticket es el **final** de la estancia:
  las personas sentadas a las 14:00 son las que pagan entre las 14:00 y las 14:00 más la duración
  media. Eso sustituye al desplazamiento fijo de 30 minutos de hoy; no se suman los dos.
- *Por qué.* Si se aplica la conversión encima del desfase actual se corrige dos veces y la curva
  sale adelantada. Para la duración por defecto hay un dato español: el barómetro de Unilever Food
  Solutions de 2018 da 1 h 37 min de media en el restaurante (de 1 h 32 a 1 h 40 según la región).
  Eso apunta a valores por defecto algo más largos que los 75 y 90 minutos de la revisión.
- *Quién.* Una guía de planificación usa una aproximación parecida ("llegadas de esta hora más la
  mitad de las de la hora anterior"). Quinyx traduce la previsión en cabezas por puesto con reglas
  por tramos de volumen, que es lo que ya hace nuestra tabla. NO VERIFICADO que ningún producto de los
  revisados modele la ocupación con duración de estancia.

**5. Trabajo fijo por puesto y servicio, además del variable.** [AMPLÍA R 2, R 7]
- *Qué.* Además de los minutos de preparación y recogida, poder decir "cocina necesita 2 h de mise en
  place antes de cada servicio" u "office 1 h de limpieza tras el cierre", por puesto y por servicio
  (comida, cena), sin depender de los comensales.
- *Por qué.* Es la división clásica de la industria y explica por qué un martes flojo no baja a cero.
  Además, es donde se colocan las horas sobrantes del punto 8 de la revisión sin llamarlas holgura.
- *Quién.* Fourth separa estándares fijos (horas por puesto, por servicio y por día, que siempre se
  pintan como demanda) de variables (ligados a un indicador como cubiertos). UniFocus lo explica igual
  ("el trabajo fijo es el mismo pase lo que pase con el volumen") y pone de ejemplo la preparación de
  cocina antes del servicio. Legion configura tareas fijas y variables y dice que apertura y cierre van
  pegadas. Quinyx tiene "reglas estáticas": una cantidad fija que se repite, como un mando siempre en
  horario de apertura, o alguien que entra 15 minutos antes de abrir y sale 15 después de cerrar
  (este último ejemplo, según el extracto del buscador de su artículo de casos de uso).

**6. Las horas complementarias de los parciales, antes que contratar o pedir extras.** [NUEVO, toca R 8]
- *Qué.* Al cuadrar picos, usar primero las horas complementarias de los parciales: pactadas hasta
  el 30 % de su jornada (el convenio puede subirlo hasta el 60 %), más voluntarias hasta el 15 %
  (30 % por convenio), con 3 días de preaviso. Y avisar de que a un parcial no se le ponen horas
  extra.
- *Por qué.* Es la herramienta real del sector para los picos medianos. Un parcial de 20 h puede hacer
  26 sin cambiar de contrato. Hoy la herramienta salta de "plantilla" a "extras de Shifty" sin ese
  escalón, y un gestor lo nota.
- *Quién.* NO VERIFICADO que algún planificador lo trate de forma explícita.

**7. Un cuadrante con fechas, códigos y fecha de publicación.** [NUEVO, toca R 9]
- *Qué.* Que el cuadrante salga para semanas concretas ("del 10 al 16 de noviembre"), con la leyenda
  de turnos en el idioma del sector (M mañana, T tarde, P partido, C cierre, R refuerzo, L libra),
  una fila de ausencias (vacaciones, baja, festivo compensado), la suma de horas de cada persona en la
  semana y una fecha "publicar antes de", con un mínimo de 5 días de antelación.
- *Por qué.* Un cuadrante sin fechas es un ejercicio, no un cuadrante. La ley pide 5 días de
  preaviso para la distribución irregular de la jornada y el Supremo anuló en 2025 un preaviso de
  24 h para cambios de turno por irrazonable. Las guías españolas recomiendan publicarlo al menos con
  una semana.
- *Quién.* La plantilla gratuita de Combo trae nombre corto, puesto, desplegable por día, suma de
  horas semanales y una hoja de ausencias con abreviaturas. Turnozo dice que el cuadrante se publica
  de forma básica por WhatsApp, foto en el tablón o PDF por correo.

**8. La ausencia se calcula dividiendo, no multiplicando, y con un valor por defecto creíble.** [AMPLÍA R 5]
- *Qué.* Para la tasa de ausencia del punto 5, separar lo planificado (vacaciones, festivos) de lo
  imprevisto (bajas) y repartir la necesidad entre el tiempo disponible: necesidad / (1 − tasa), no
  necesidad × (1 + tasa). Por defecto, en torno a un 6 % de bajas.
- *Por qué.* Multiplicar se queda corto: con un 10 % de ausencia, multiplicar da 1,10 y dividir da
  1,11, y la diferencia crece con la tasa. El 6,3 % de absentismo en hostelería se atribuye a un
  informe de Randstad de marzo de 2025 (citado por un tercero; la media nacional de Adecco para 2025
  es del 7,6 %).
- *Quién.* Es el "shrinkage" de la planificación de centros de llamadas, que avisa del mismo error de
  multiplicar. NO VERIFICADO cómo lo tratan los planificadores de hostelería revisados.

### Prioridad media: lo que hace que se use más de una vez

**9. Turnos tipo con nombre, y rueda de varias semanas con objetivos de fines de semana.** [AMPLÍA R 9, R 12]
- *Qué.* Además de la rueda de cuatro semanas, dos objetivos editables: como mucho N fines de semana
  seguidos trabajados, y al menos un fin de semana libre cada M semanas. Y enseñar el reparto.
- *Por qué.* La rueda sola no garantiza que sea justa, y "justo" hay que definirlo.
- *Quién.* Skello guarda semanas tipo, las duplica hasta 5 semanas y admite ciclos de semanas pares e
  impares. Combo anuncia en 2026 crear turnos desde semanas tipo o rotaciones. Sesame tiene
  "patrones", combinaciones de turnos que se repiten igual. MAPAL OS guarda plantillas semanales con
  trabajadores genéricos que luego se asignan, como hace hoy nuestra herramienta con "Camarero 1".
  Quinyx dice repartir de forma equilibrada los turnos menos deseados, como noches y fines de semana,
  como objetivo blando por debajo de la cobertura. La documentación de Timefold enumera las variantes
  que se pueden medir: fines de semana por periodo, en ventana móvil y seguidos.

**10. Disponibilidad y restricciones por persona, una vez puestos los nombres.** [NUEVO]
- *Qué.* Al poner nombre a una persona, poder marcar lo que no puede (domingos, mañanas, estudia por
  la tarde) y que el cuadrante lo respete o avise.
- *Por qué.* La herramienta quiere que se use semana a semana. En cuanto hay nombres, la primera
  pregunta del encargado es "Lucía no puede los martes".
- *Quién.* Es lo básico de todos: Skello asigna turnos según disponibilidad, competencias y
  preferencias; MAPAL OS avisa de restricciones personales, contractuales, de preferencias y de
  puesto autorizado; 7shifts, Deputy y Connecteam usan la disponibilidad al autoprogramar.

**11. Jornada anual y contador de horas por persona.** [AMPLÍA R 6]
- *Qué.* Llevar por persona las horas del año contra la jornada anual de su convenio, para que la
  distribución irregular (más horas en temporada alta y menos en baja) se vea y no se pase.
- *Por qué.* Es como se resuelve en España la estacionalidad dentro de la ley: sin pacto, la empresa
  puede repartir de forma irregular el 10 % de la jornada anual, con 5 días de preaviso; con
  convenio, lo que este diga. Las jornadas anuales varían: 1.783 h en Cataluña en 2026, 1.776 h en
  Zaragoza o Baleares (según guías divulgativas; ver detalle).
- *Quién.* Combo configura periodos de modulación de 4 semanas a 3 años. Skello tiene anualización:
  marca al empleado como "anualizado" y enseña la diferencia acumulada entre lo planificado y su base.

**12. Fijo discontinuo con calendario de llamamiento.** [AMPLÍA R 6]
- *Qué.* Si se añade el fijo discontinuo, que el resultado dé el calendario de llamamiento (qué
  semanas entra cada uno), sacado de la propia curva del año.
- *Por qué.* Los convenios piden avisar al inicio de cada campaña y en el orden que fijen, que suele
  ser por antigüedad (Baleares, Murcia, Ciudad Real). Una fuente indica que se presenta al principio
  del año un calendario con las previsiones de llamamiento.

**13. Una imagen del cuadrante del equipo para el grupo de WhatsApp.** [NUEVO]
- *Qué.* Además de la imagen de una persona y el PDF de cocina, una imagen del equipo entero
  pensada para leerse en el móvil (un día por fila o un puesto por imagen).
- *Por qué.* Donde no hay app, el cuadrante del equipo viaja por el grupo de WhatsApp o en foto del
  tablón. La imagen individual está muy bien, pero el encargado manda uno, no diecinueve.

**14. Ventas por hora trabajada y objetivo de coste, con semáforo.** [NUEVO, toca R 14]
- *Qué.* Si el usuario da ventas, enseñar las ventas por hora trabajada al lado de los comensales
  por hora trabajada, y dejar fijar el objetivo (porcentaje de coste o ventas por hora).
- *Quién.* 7shifts deja fijar como objetivo el porcentaje de coste, las ventas por hora trabajada, un
  número de horas o los productos por hora trabajada, por departamento. Quinyx deriva las ventas por
  hora de los estándares y los afina con el uso.

### Prioridad baja: pulido

**15. Las partidas, con su límite.** [AMPLÍA R 10]
  Además de preferir el turno continuo: máximo dos fracciones y un descanso entre fracciones con
  mínimo y máximo de convenio. Hoy solo hay un mínimo genérico de 60 minutos. NO VERIFICADO el
  máximo habitual en los convenios; una guía de Baleares cita un descanso mínimo de 2 h en la
  partida.

**16. Los festivos del territorio y cómo se compensan.** [AMPLÍA R 5]
  14 al año como máximo, dos de ellos locales, leídos del calendario del territorio. Si se trabajan,
  se compensan con descanso o se pagan con al menos un 75 % más (salvo convenio). En el cálculo de
  ausencias del punto 5, un festivo trabajado y compensado es un día libre más que cubrir.

**17. Decir que el cuadrante no es el registro de jornada.** [NUEVO]
  El registro diario de jornada es obligatorio desde 2019 y se guarda cuatro años. El registro
  digital sigue sin aprobarse a 4 de noviembre de 2026 según las fuentes encontradas. Una línea en la
  descarga evita que alguien crea que el PDF sirve de registro.

**18. Horas extra con su tope.** [NUEVO]
  Si alguna vez el cuadrante pasa horas por encima del contrato de un completo, avisar del tope de
  80 horas extra al año.

### Lo que la investigación confirma de la revisión

- **R 1** (tope diario): Deputy y MAPAL OS tienen máximo de horas al día; la ley pone 9 ordinarias
  salvo convenio.
- **R 2** (mandos por horario): Quinyx con reglas estáticas ("un mando en horario de apertura") y
  Fourth con estándares fijos por puesto y servicio. Ya hay fuente para lo que la revisión no
  encontró.
- **R 4** (sentados a la vez): coherente con la aproximación de llegadas acumuladas; ver punto 4.
- **R 9** (turnos tipo): todos los productos revisados trabajan con plantillas o turnos tipo.
- **R 12** (rueda): Skello, Combo y Sesame tienen ciclos o patrones.
- **R 13** (pausa): MAPAL OS fija descansos en minutos según horas trabajadas. La ley pone 15 minutos
  por encima de 6 h seguidas. NO VERIFICADO el "20 minutos" de muchos convenios que cita la revisión.
- **R 14** (coste de empresa): Planday suma un porcentaje sobre el sueldo; ver punto 1.

---

## 2. Detalle por tema

### 2.1. De la demanda a la necesidad de personal

- **Estándares lineales y por tramos.** Quinyx convierte la previsión de un indicador (afluencia,
  ventas) en una curva de cabezas por puesto. Reglas lineales ("un cajero atiende 12 transacciones
  por hora") o por tramos de volumen que no se pueden solapar; si la previsión pasa del último tramo,
  devuelve cero, así que el último tramo debe cubrir todo. Sobre eso, mínimos y máximos por hora,
  día o respecto al horario de apertura; si se pisan, gana el más estricto. Redondea solo en la
  granularidad más fina.
  [Quinyx, Optimal Headcount and Labor Standards](https://quinyx.helpdocs.io/l/en/article/w5c7snhtda-optimal-headcount-and-labor-standards-new) ·
  [Labor Standard Calculation](https://quinyx.helpdocs.io/l/en/article/9zuqipt6zs-labour-standard-calculation-configuration)
  - *Para nosotros:* nuestra tabla de tramos es su "regla dinámica"; el aviso de "el último tramo
    debe ser infinito" ya está bien resuelto con el centinela.
- **Fijo frente a variable.** Fourth: estándares fijos por puesto, por servicio y por día, que no
  dependen de ningún indicador y se pintan siempre como demanda; los variables se ligan a un
  indicador (cubiertos, habitaciones). Los configuran sus consultores en la implantación.
  [Fourth Help Center](https://help.hotschedules.com/hc/en-us/articles/4422289713933) (lectura
  bloqueada, contenido según el extracto del buscador). UniFocus da la definición y un ejemplo de
  tramos: "de 1 a 25 cubiertos, 8 h de cocina; de 26 a 50, 4 más".
  [UniFocus, Understanding labor standards](https://help.unifocus.com/help/Content/Understanding-labor-standards.htm).
  Legion modela tareas fijas y variables.
  [Legion, Labor Optimization](https://legion.co/products/labor-optimization/)
- **Deputy.** Primero se elige el indicador (ventas o uno propio), después reglas de modelo de
  trabajo que lo convierten en personal requerido por área, y luego "construir la estructura de
  turnos" y "rellenar". El personal requerido se puede corregir a mano; existen métricas de personal
  requerido y de cobertura mínima en su API.
  [Deputy API, auto build](https://developer.deputy.com/docs/using-the-api-to-auto-buildfill-deputy-shifts) ·
  [Deputy Labor Model](https://developer.deputy.com/docs/using-the-deputy-labor-model-overview).
  Los artículos de ayuda de Deputy devuelven 403; lo demás es del extracto del buscador.
- **Skello.** Las necesidades se meten por puesto y por cuarto de hora (a mano, por plantilla Excel
  de hasta dos semanas o duplicando un día), y salen en un gráfico encima del cuadrante del día.
  Solo en sus planes superiores.
  [Skello, renseigner les besoins en personnel](https://intercom.help/skello/fr/articles/8271833-renseigner-les-besoins-en-personnel-sur-le-planning)
- **Ocupación frente a llegadas.** Ninguno de los productos revisados documenta un modelo de
  estancia. Una guía usa "llegadas de la hora más la mitad de las de la anterior" como aproximación
  a la gente en sala.
  [Restaurant staff rota with AI forecasts](https://sagnikbhattacharya.com/blog/restaurant-staff-rota-ai-forecasts).
  Duración media en el restaurante en España: 1 h 37 min (Unilever Food Solutions, 2018).
  [Barómetro de Tendencias en Restauración 2018](https://www.unileverfoodsolutions.es/dam/ufs-es/es/brochure/Barómetro%20de%20Tendencias%20en%20Restauración_2018.pdf)
- **Ratios de personas por cubierto.** Las cifras públicas varían el doble según la fuente (de 15 a
  45 cubiertos por camarero según el tipo de local) y todas son de blogs de proveedores. Conclusión
  común: calibrar con el propio histórico. Es lo que ya hace la herramienta al no imponer un baremo.
  [Nine Guides, staffing ratios](https://nineguides.pages.dev/staff/restaurant-staffing-ratios)

### 2.2. Mandos y puestos fijos

- **Quinyx, reglas estáticas:** una cantidad fija que se repite por hora, día o horario de apertura,
  aunque no haya previsión; un tipo de turno por regla. Casos de uso citados: alguien que empieza 15
  minutos antes de abrir y acaba 15 después de cerrar, y un número fijo de puestos clave (un mando y
  dos cajeros) siempre presentes.
  [Quinyx, Static rules](https://quinyx.helpdocs.io/l/en/article/7lrb5pwsb7-static-rules) ·
  [Quinyx, casos de uso](https://quinyx.helpdocs.io/l/en/article/8bbiy3lpiq-optimal-headcount-and-labor-standards-use-cases)
  (este segundo, truncado al leerlo; el ejemplo sale del extracto del buscador).
- **Planday, asalariados:** por defecto el sueldo fijo no entra en el total de coste del cuadrante,
  y hay un artículo aparte para enseñarlo. Señal de que tratan al mando con sueldo fijo distinto del
  personal por horas.
  [Planday, payroll costs of salaried staff](https://help.planday.com/en/articles/30526-how-to-view-the-payroll-costs-of-salaried-staff-in-the-schedule)
- **"Key holder" o responsable de llaves:** se define como el empleado de confianza que asume el
  mando cuando no está el encargado. NO VERIFICADO que 7shifts o Deputy tengan un ajuste propio para
  ello; otro producto (Schedgeup) marca puestos como "cualificados" para que solo aparezca gente
  formada.
  [Key holder](https://www.4cornerresources.com/job-descriptions/key-holder/) ·
  [Schedgeup, Secondary Roles](https://schedgeup.zendesk.com/hc/en-us/articles/360027624451-Secondary-Roles)

### 2.3. Turnos tipo, rotaciones, reparto justo, preferencias y partida

- **Skello:** semanas tipo que se guardan y aplican (duplicables hasta 5 semanas), sin borrar lo que
  ya hay y avisando de conflictos; ciclos de semanas pares e impares; el asistente crea turnos según
  necesidades, convenio, disponibilidad, competencias y preferencias.
  [Skello, templates de planning](https://www.skello.io/blog/gagnez-du-temps-comment-enregistrer-ses-templates-de-planning) ·
  [Skello, planning intelligent](https://www.skello.io/fonctionnalites/planification/planning-intelligent)
- **Planday:** plantillas que guardan un patrón para empleados, grupos o puestos y se aplican a
  varios periodos; no se copian entre departamentos. NO VERIFICADO que tenga rotación de varias
  semanas como tal.
  [Planday, schedule templates](https://help.planday.com/en/articles/30423-create-and-use-schedule-templates)
- **Sesame:** patrones (combinaciones de turnos que se repiten), restricciones aplicadas al cuadrante
  y turnos de noche como un solo turno.
  [Sesame, conoce turnos](https://help.sesamehr.com/en_US/conoce-turnos)
- **MAPAL OS (GIR), herramienta española de hostelería:** plantillas semanales con trabajadores
  genéricos que luego se asignan; nueve alertas del planificador, entre ellas trabajo durante una
  ausencia, restricciones personales y contractuales, libranzas mínimas, preferencias de turno,
  puesto y centro autorizados y fecha de salida prevista.
  [MAPAL, alertas](https://help.mapal-os.com/es/?p=11227) ·
  [MAPAL, plantillas semanales](https://help.mapal-os.com/es/?p=13477)
- **Combo:** novedades de 2026 con generación asistida, corrección automática de alertas y turnos
  desde semanas tipo o rotaciones (según su propia página).
  [Combo, nouveautés 2026](https://combohr.com/fr/blog/combo-2026-nouveautes)
- **Agendrix y When I Work:** plantillas semanales (Agendrix, solo en vista semanal) y turnos tipo al
  hacer clic en una celda (When I Work). NO VERIFICADO que tengan rotaciones de varias semanas.
  [Agendrix, weekly schedule templates](https://agendrix.com/blog/weekly-schedule-templates) ·
  [When I Work, scheduler guide](https://help.wheniwork.com/articles/scheduler-reference-guide-computer)
- **Reparto justo:** Quinyx lo ofrece dentro de su asignación automática, configurado por su equipo,
  como objetivo blando.
  [Quinyx, AI-driven fair scheduling](https://www.quinyx.com/product-hub/ai-driven-fair-scheduling) ·
  [Quinyx, Auto Assign](https://quinyx.helpdocs.io/l/en/article/gk6wqrx0y8-auto-assign-faq) ·
  [Timefold, fairness](https://docs.timefold.ai/employee-shift-scheduling/latest/employee-resource-constraints/fairness/balance-time-worked).
  Rotageek avisa del choque: un fin de semana muy fuerte no deja cumplir la regla de reparto.
  [Rotageek, preferences](https://www.rotageek.com/blog/catering-to-employee-preferences-through-automatic-scheduling)

### 2.4. Ausencias, festivos, jornada anual y fijo discontinuo

- **Vacaciones:** 30 días naturales (ya en la revisión).
- **Descanso semanal:** día y medio ininterrumpido, acumulable en periodos de hasta 14 días; menores,
  dos días seguidos. En hostelería, el medio día se puede acumular en periodos de hasta cuatro
  semanas o separarse del día completo (RD 1561/1995, art. 6).
  [ET art. 37](https://www.cuestioneslaborales.es/estatuto-trabajadores/articulo-37/) ·
  [RD 1561/1995 consolidado](https://boe.gob.es/buscar/pdf/1995/BOE-A-1995-21346-consolidado.pdf)
- **Festivos:** máximo 14 al año, dos locales. Trabajado, se compensa con descanso o con un recargo
  mínimo del 75 % (art. 47 del RD 2001/1983, vigente solo para festivos), salvo mejora de convenio.
  [Laboral Social, recargo 75 %](https://www.laboral-social.com/descanso-semanal-festivos-retribucion-recargo-75-por-ciento-empresas-seguridad) ·
  [Skello, festivos en hostelería](https://www.skello.es/blog/festivos-hosteleria-gestion-legal)
- **Distribución irregular:** sin pacto, el 10 % de la jornada anual con 5 días de preaviso; con
  convenio, lo que fije, pero el preaviso no baja de 5 días (Supremo, 14 de marzo de 2024). Para
  cambios de turno, el Supremo anuló en noviembre de 2025 un preaviso de 24 h por irrazonable.
  [ET art. 34](https://www.cuestioneslaborales.es/estatuto-trabajadores/articulo-34/) ·
  [STS 13-11-2025](https://www.cuestioneslaborales.es/jurisprudencia/sts-2025-11-13-preaviso-turnos-irregular-previsibilidad/)
- **Jornada anual de convenio:** 1.783 h en Cataluña desde 2026 (convenio 2025 a 2028) y 1.776 h en
  Zaragoza y Baleares, según guías divulgativas, no el texto oficial. Skello cita 1.826 h como tope
  del Estatuto sin convenio. NO VERIFICADO contra los boletines oficiales.
  [Turnozo, convenio Barcelona 2026](https://turnozo.com/es/blog/convenio-hosteleria-barcelona-2026) ·
  [PayFit, convenio Cataluña](https://payfit.com/es/contenido-practico/convenio-colectivo-hosteleria-turismo-cataluna/)
- **Bolsa de horas en las herramientas:** Combo, periodos de modulación de 4 semanas a 3 años; Skello,
  anualización con diferencia acumulada (documentación francesa; NO VERIFICADO para España).
  [Combo, modulation period](https://guide.combohr.com/en/articles/8732672-how-to-configure-a-modulation-period) ·
  [Skello, annualization](https://help.skello.io/en/articles/8498915-how-to-activate-the-annualization-of-working-hours-on-skello)
- **Bajas:** absentismo en hostelería del 6,3 % (Randstad, marzo de 2025, citado por un tercero) y
  media nacional del 7,6 % en 2025 (Adecco). El modo correcto de sumarlo es dividir por el tiempo
  disponible.
  [10minhotel, absentismo](https://es.10minhotel.com/2025/04/16/el-absentismo-esta-generando-un-estres-anadido-en-las-plantillas) ·
  [Adecco, XV informe](https://www.adeccogroup.com/-/media/project/adecco-group/adeccogroup/spain-content/2026-press-releases/2026-07-14-ndp-xv-informe-anual-adecco-empresa-saludable-gestion-absentismo.pdf) ·
  [Call Centre Helper, shrinkage](https://www.callcentrehelper.com/include-shrinkage-planning-process-143070.htm)
- **Fijo discontinuo:** el llamamiento lo fija el convenio, normalmente por antigüedad, al inicio de
  cada campaña; los periodos sin actividad cuentan para la antigüedad.
  [Periódico de Ibiza, fijos discontinuos](https://www.periodicodeibiza.es/noticias/economico/2021/05/21/1267123/balears-tierra-fijos-discontinuos.html) ·
  [PayFit, fijo discontinuo](https://payfit.com/es/contenido-practico/contrato-fijo-discontinuo/)
- **Madrid:** el convenio vigente es el publicado en el BOCM en abril de 2024. Una guía cita como
  reglas que la jornada no se divide en más de dos periodos y que median 12 h entre jornadas. NO
  VERIFICADO contra el texto del BOCM: ni el descanso semanal, ni la pausa, ni la jornada anual.
  [BOCM 06-04-2024](https://www.bocm.es/boletin/CM_Orden_BOCM/2024/04/06/BOCM-20240406-2.PDF) ·
  [Combo, convenio Madrid](https://combohr.com/es/blog/convenio-hosteleria-madrid)

### 2.5. Coste

- **Cotización de empresa 2026 (régimen general):** contingencias comunes 23,60 %; desempleo 5,50 %
  indefinido o 6,70 % temporal; FOGASA 0,20 %; formación 0,60 %; MEI 0,75 %. Más accidentes de
  trabajo según actividad: 1,50 % para el epígrafe de restaurantes según un sitio de terceros (con
  la tarifa ligada ya a la CNAE 2025; NO VERIFICADO en la tarifa oficial). Contratos de menos de 30
  días: 33,62 € más al terminar.
  [Cuatrecasas, Orden de cotización 2026](https://www.cuatrecasas.com/es/spain/laboral/art/claves-orden-cotizacion-2026) ·
  [Asepeyo, bases y tipos 2026](https://www.asepeyo.es/wp-content/uploads/Bases-tipos-cotizacion-2026-ES.pdf) ·
  [Conversoria CNAE](https://www.conversoriaecnae.es/tarifas-cotizacion)
- **Cómo lo enseñan:** Planday suma un porcentaje de costes adicionales sobre el sueldo por hora, por
  turno o fijo, y lo lleva al cuadrante y al informe de ventas.
  [Planday, additional payroll costs](https://help.planday.com/en/articles/30491-how-to-show-additional-payroll-costs-on-the-schedule).
  7shifts compara ventas y coste y deja fijar objetivos de porcentaje, ventas por hora trabajada,
  horas o productos por hora, por departamento; si hay TPV integrado, la previsión sale del
  histórico. [7shifts, Labor Budget Tool](https://kb.7shifts.com/hc/en-us/articles/4417514442771) ·
  [7shifts, Optimal Labor Tool](https://kb.7shifts.com/hc/en-us/articles/4417514452115)
  (los dos bloquean la lectura; contenido según el extracto del buscador). Skello habla de seguir
  en tiempo real la masa salarial, las horas extra y los ratios de productividad.
- **Porcentaje sobre ventas:** con cargas sociales incluidas, 25 a 30 % sano y 35 % alarma (guía
  de plan de negocio); 30 % como referencia en Estados Unidos (Toast). No hay referencia española
  oficial encontrada.
  [Modelos de plan de negocio, indicadores](https://modelosdeplandenegocios.com/blogs/news/restaurante-indicadores-financierios) ·
  [Toast, labor cost](https://pos.toasttab.com/es-us/blog/on-the-line/restaurant-labor-cost-percentage)
- **Coste por hora de turno:** cálculo propio con las cifras anteriores; ver el punto 1 de la lista.

### 2.6. Alertas legales y de convenio

| Regla | Qué dice | Fuente | ¿La mira hoy la herramienta? |
|---|---|---|---|
| Horas al día | 9 ordinarias, salvo convenio o acuerdo | [ET 34.3](https://www.cuestioneslaborales.es/estatuto-trabajadores/articulo-34/) | No (R 1) |
| Entre jornadas | 12 h | ET 34.3 | Sí |
| Pausa | 15 min si la jornada continuada pasa de 6 h | ET 34.4 | No (R 13) |
| Descanso semanal | Día y medio, acumulable en 14 días; en hostelería el medio día hasta 4 semanas | [ET 37.1](https://www.cuestioneslaborales.es/estatuto-trabajadores/articulo-37/), RD 1561/1995 | Solo "libranzas seguidas", si se activa |
| Nocturno | 3 h entre 22 y 6; máximo 8 h de media en 15 días; sin extras | [ET 36](https://iberley.es/legislacion/articulo-36-estatuto-trabajadores) | No (nuevo) |
| Menores | 8 h al día, sin noche, sin extras, pausa de 30 min si pasan de 4 h y media, dos días de descanso | ET 6, 34.3, 34.4, 37.1 | No (nuevo) |
| Parciales | Complementarias pactadas hasta 30 % (60 % por convenio), voluntarias 15 % (30 %), preaviso 3 días; sin horas extra | [Coverflex](https://www.coverflex.com/es/blog/contrato-jornada-parcial) · [Cuestiones Laborales](https://www.cuestioneslaborales.es/que-son-las-horas-complementarias/) | No (nuevo) |
| Horas extra | Máximo 80 al año | [ET 35](https://www.cuestioneslaborales.es/estatuto-trabajadores/articulo-35/) | No (nuevo) |
| Preaviso | 5 días para la distribución irregular | ET 34.2 | No (nuevo) |
| Registro | Diario, se guarda 4 años; el digital, pendiente | ET 34.9 · [Copilot Gestoría](https://copilotgestoria.com/blog/consejo-estado-rechaza-registro-horario-digital-2026-que-significa-empresas-gestorias) | No aplica |
| Jornada de 37,5 h | No aprobada: el Congreso la tumbó en septiembre de 2025; sigue 40 h | [Moncloa.com, julio 2026](https://www.moncloa.com/2026/07/29/jornada-laboral-yolanda-diaz-3407201/) | No aplica |

Sobre los textos legales: se han leído en una web que reproduce el Estatuto, no en el BOE. Las
cifras coinciden entre varias fuentes.

### 2.7. Lo que chirría a los usuarios

Con Capterra, G2 y Reddit cerrados a la lectura, esto es lo que llega por buscadores y resúmenes:

- **Disponibilidad desfasada o que no llega al cuadrante** (7shifts): turnos cruzados por datos de
  disponibilidad viejos, ausencias que no se ven hasta aprobarlas, no poder poner dos tramos de
  disponibilidad el mismo día. [Capterra, 7shifts](https://www.capterra.com/p/123038/7shifts-Restaurant-Scheduling/reviews/)
  (según el resumen del buscador).
- **Rigidez de las reglas automáticas** cuando hay excepciones, fallos y avisos que llegan tarde
  (7shifts, según un comparador). [RFP.wiki, 7shifts](https://www.rfp.wiki/vendors/7shifts)
- **Interfaz recargada y curva de aprendizaje** (HotSchedules, según comparadores).
- **Precio y funciones solo en planes caros** (Skello, Deputy, 7shifts). La previsión por demanda de
  Deputy no está en su plan básico; las necesidades de Skello, tampoco.
- **Quien vigila lo automático es el encargado:** Skello deja en manos del responsable comprobar los
  casos personales no metidos en el programa. [Tool Advisor, Skello](https://tool-advisor.fr/logiciel-rh/skello/)
- **Lo que piden los encargados (228 comentarios de Reddit, resumen de un proveedor):** plantillas
  calculadas tan justas que una sola baja lo rompe; demasiado tiempo en cambios y ausencias; y lo que
  funciona es publicar pronto, facilitar los cambios y dejar que la gente marque su disponibilidad.
  [Turnozo, 228 managers](https://turnozo.com/blog/what-228-managers-said-about-scheduling)
- **Lo que critica la prensa del sector a la programación automática:** horarios inestables cada
  semana, cerrar de noche y abrir por la mañana, y publicar con poca antelación.
  [Nation's Restaurant News](https://www.nrn.com/restaurant-labor/restaurant-operations-watch-the-dark-side-of-automated-scheduling)

**Lo que sacamos para nuestra herramienta:** las quejas no son de cálculo, son de que el plan no
encaja con la gente real (disponibilidad, ausencias, cambios) y de que las reglas no se pueden saltar
cuando hace falta. Eso refuerza los puntos 2, 7, 8 y 10 de la lista, y avisa en contra de calcular la
plantilla "al milímetro" sin colchón.

### 2.8. Lo que espera un jefe de sala o un director de operaciones español

- **Formato:** tabla semanal por persona, agrupada por puesto (sala, cocina, barra), con leyenda de
  códigos (M, T, C) y la suma de horas de la semana; una hoja aparte para ausencias.
  [Combo, plantilla de cuadrante](https://combohr.com/es/blog/plantilla-cuadrante-hosteleria) ·
  [PayFit, cuadrante](https://payfit.com/es/contenido-practico/cuadrante-trabajo/)
- **Cómo se cuelga y se comunica:** WhatsApp, foto en el tablón o PDF por correo, publicado al menos
  con una semana; los cambios entre compañeros los aprueba el encargado y se avisa a todos. Combo
  recomienda un solo canal para pedir ausencias y no mezclar WhatsApp con correo.
  [Turnozo, cómo hacer un cuadrante](https://turnozo.com/es/blog/como-hacer-cuadrante-de-trabajo)
- **Vocabulario:** turno de mañana, de tarde, partido, cierre, libranza, refuerzo, extra, días
  libres, descanso compensatorio, festivo no compensado, montaje y recogida (la terraza en verano
  alarga las dos). Las guías y plantillas lo usan así; la herramienta ya dice "libra" y "libranza".
- **Errores típicos que señalan las guías:** poca gente en hora punta y demasiada en hora floja, no
  respetar dos días libres y 12 h entre jornadas, aprobar vacaciones sin apuntarlas, dos personas del
  mismo puesto ausentes a la vez, turnos a gente de baja, festivos y extras sin compensar.
  [Qamarero, cuadrante de hostelería](https://qamarero.com/blog/cuadrante-horario-de-hosteleria-como-realizarlo/)

---

## 3. Lo que queda sin verificar

- Cómo trata 7shifts a los mandos, la disponibilidad al autoprogramar y sus plantillas: su centro de
  ayuda bloquea la lectura.
- Cualquier queja de primera mano en Reddit (r/restaurateur, r/KitchenConfidential): no se ha podido
  leer Reddit.
- Harri, Shiftbase, Personio, Kenjo, Woffu, Factorial y Cuadrante.app: no se ha encontrado
  documentación pública sobre cómo calculan la necesidad, las alertas o el coste. De Woffu, solo que
  planifica rotaciones y excepciones y pasa horas a la nómina; de Factorial, solo plantillas de
  Excel y su blog; de Shiftbase, que tiene informes de coste, sin decir cómo los calcula.
- Que algún planificador avise de menores o use las horas complementarias de los parciales.
- La pausa de 20 minutos de muchos convenios, el descanso máximo entre fracciones de la partida y el
  descanso semanal de dos días: hay que leerlos en cada convenio provincial.
- La jornada anual de los convenios citada desde guías divulgativas, y el tipo de accidentes de
  trabajo de los restaurantes en la tarifa oficial de 2026.
