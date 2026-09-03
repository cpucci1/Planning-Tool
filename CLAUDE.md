# Shifty Planning — Planificador de plantilla

Herramienta web **gratuita y sin registro** para que un restaurante calcule la plantilla
que necesita a partir de su demanda real de comensales. Es un **lead magnet** de Shifty:
al final del cálculo, los picos que la plantilla fija no cubre se proponen como extras
de Shifty.

> **Este proyecto es independiente del resto del monorepo.** No comparte build, ni
> dependencias, ni base de datos con `Web-Panel/`, `Website/`, `Worker-App/` o
> `Client-App/`. No toca Supabase. Vive solo aquí.

---

## Estado

**Solo front.** No hay backend, no hay login, no hay persistencia en servidor **ni en el
navegador**. Cerrar la pestaña borra todo lo que no se haya descargado como PDF.
La lectura del fichero con IA está **simulada**: se acepta cualquier archivo, se muestra
el proceso de análisis y se devuelven **datos simulados** deterministas. Cuando exista
backend, solo hay que sustituir `src/lib/fakeAI.ts` por una llamada real.

`src/lib/persistence.ts` existe pero **no está conectado a nada**: es un guardado
sin cuenta (autoguardado local + fichero `.json` descargable) que se construyó y se probó
entero, y se desconectó a petición expresa — "quitale el login, eso lo veremos luego" — para
revisar el front sin esa capa de por medio. El módulo es correcto y independiente; para
reactivarlo hay que devolver a `usePlanner.ts` el estado `savedMeta` y las funciones
`resumeSaved`/`discardSaved`/`importSnapshot`/`exportSnapshot`/`buildSnapshot` (ver el
historial), y su UI en `StepImport.tsx` (aviso de "sigues con...") y `StepResult.tsx`
(botón "Guardar planificación"). No hay que rediseñar nada, solo volver a enchufarlo.

---

## Arrancar

```bash
npm install
npm run dev     # → http://localhost:5174
```

Puerto **5174** a propósito, para poder tener Web-Panel (5173) levantado a la vez.

---

## El modelo, en una frase

**Comensales por franja de media hora → tramos definidos por el usuario → personas por
puesto y franja → horas → contratos → cuadrante.**

### 1. Demanda
El cliente sube un fichero con su histórico. De ahí salen **comensales por franja de 30
minutos**, por día y por semana, para 52 semanas. Es lo único que aporta el fichero:
el fichero **no dice cuánta gente hace falta**.

La semana tipo que sale del cálculo es **editable**: el usuario puede corregir cualquier
celda si sabe algo que el histórico no. Esas correcciones viven en `overrides` dentro de
`usePlanner` y se aplican justo encima del percentil, de modo que entran en la cadena
completa y mueven de verdad el número de personas. Una edición que no cambiara el
resultado engañaría más de lo que ayuda.

### 2. Tramos (input del usuario)
El usuario define su propia tabla: *"de 1 a 10 comensales necesito 1 camarero y 1 de
cocina; de 11 a 25, 2 camareros, 1 cocina y 1 office; de 26 a 40…"*. Los tramos y los
puestos son suyos. Se precarga una plantilla razonable para que vea resultados desde el
primer segundo, pero todo es editable.

- **Bloques** (áreas): vienen Sala y Cocina de inicio; se pueden renombrar, añadir y borrar.
- **Puestos**: dentro de cada bloque, libres, con plantilla inicial.

### 2 bis. Horario de cocina (opcional)
En el paso de horario hay un toggle: *"la cocina tiene un horario distinto"*. Desactivado
por defecto — cocina comparte el horario general, como hasta ahora. Al activarlo, arranca
copiando el horario general y se edita aparte con el mismo `HoursEditor`.

El id del bloque Cocina es fijo (`KITCHEN_BLOCK_ID` en `data/presets.ts`) y el toggle se
engancha a ese id, no al nombre — sobrevive a que el usuario lo renombre. Solo desaparece
si el bloque Cocina se borra del todo.

`clampNeedToBlockHours` (`lib/staffing.ts`) aplica el recorte **después** de `buildNeedGrid`:
cocina deja de pedir personal fuera de su horario propio aunque sala siga abierta y la
curva de comensales aún tenga gente. Importante — **solo recorta, nunca añade**: si el
horario de cocina se adelanta a que abra sala (para el personal que prepara antes del
servicio), ahí no hay comensales en la curva y por tanto tampoco tramo, así que ese hueco
sigue saliendo a cero. Cubrirlo de verdad pide un mínimo de apertura por bloque
(`applyOpeningMinimums`, ya escrito en `staffing.ts` pero sin enganchar a nada) — la
extensión natural el día que haga falta.

### 3. Desfase del dato
El fichero del TPV marca la hora del **cobro**, y se cobra al terminar — unos 30 minutos
después de que el trabajo haya ocurrido. La curva del fichero va por tanto sistemáticamente
tarde: los 60 comensales que aparecen a las 15:00 se atendieron sobre las 14:30.

La corrección es **adelantar la curva** ese desfase. Se fija **un único valor global**
(por defecto 30 min) aplicado **igual a todos los puestos y bloques**.

No es un colchón de seguridad ni una estimación: es enderezar un sesgo conocido del dato.
Por eso es un desplazamiento limpio y no un máximo móvil, que ensancharía los picos y
sobredimensionaría la plantilla.

El orden importa: **primero se corrige el desfase, después se recorta al horario.**
Corregir arregla el dato; recortar aplica una regla de negocio, y no tiene sentido
aplicarla sobre el dato torcido.

### 4. Nivel de cobertura
Gráfico de las **52 semanas en orden de calendario** con una **línea horizontal
arrastrable**. Donde la suelte, decide qué porcentaje de semanas cubre con plantilla fija.
Las semanas por encima de la línea son **picos**: no se contrata para ellos, se cubren
con extras.

### 5. Semanas especiales
Se detectan automáticamente las semanas anómalas del histórico y se etiquetan con el
festivo que les toca (Semana Santa, Navidad, agosto, fiestas locales). El usuario
**confirma o corrige**. Los festivos móviles se **realinean** al año siguiente: si Semana
Santa cayó en la semana 15, el año que viene se coloca en la 16.

### 6. Contratos
Se optimiza **primero con jornadas de 40h**, y lo que queda se rellena con parciales de
**30h, 20h y 15h**. El máximo de horas semanales lo marca el tipo de contrato.

Toggles del usuario:
- **Jornada partida** sí/no
- **Dos días de libranza consecutivos** sí/no
- **Duración máxima de cada turno** (o de cada bloque, si hay jornada partida)
- **12h de descanso entre turnos** sí/no (activado por defecto — ver 6 bis)

### 6 bis. Descanso mínimo entre turnos (Art. 34.3 ET)

España exige 12h entre el fin de un turno y el inicio del siguiente de la misma persona;
es un mínimo legal, no una preferencia, y hay jurisprudencia reciente (STS 274/2026)
confirmando que ese descanso diario no se solapa con el semanal. `buildRoster` en
`lib/roster.ts` lo aplica como restricción dura en `fits()` — nadie cierra una noche y
abre la mañana siguiente — y también en el paso de consolidación, para que redistribuir
turnos entre personas no lo rompa por el camino.

La semana se repite, así que la comprobación también mira **domingo contra lunes**: si el
sábado cierra a las 02:00, esa persona no puede abrir el domingo antes de las 14:00.

No hay una cifra nacional única para la duración del descanso de la jornada partida (varía
por convenio provincial, de 1h a 1h30), así que ahí se mantiene el mínimo genérico de 60
min en vez de intentar acertar los ~50 convenios de hostelería a la vez.

### 7. Cuadrante
Se genera el cuadrante semanal sobre la curva de necesidad, descomponiéndola en
**capas**: si en una franja hacen falta 3 camareros, la capa 1 está presente siempre que
haga falta al menos 1, la capa 2 siempre que hagan falta al menos 2, y así. Cada capa
dibuja el turno de una persona — la capa 1 abre y cierra, las de arriba entran solo en el
pico. Es lo que hace a mano un jefe de sala, y por eso el cuadrante sale creíble.

Después las capas se empaquetan en personas por mejor ajuste, se consolida (se vacía a
los más flojos repartiendo sus turnos, y quien se queda sin nada desaparece) y cada
persona baja al contrato más pequeño que cubra sus horas.

Las etiquetas ("Camarero 1", "Camarero 2"...) se pueden sustituir por nombres reales —
doble clic o el lápiz en `RosterGrid`. El nombre se guarda aparte (`personNames` en
`usePlanner`, `personId → nombre`) y se decora encima del cuadrante recién calculado,
igual que `overrides` decora la semana tipo: el cuadrante entero se recalcula con cada
cambio, así que el nombre no puede vivir dentro de `Person`. Si la plantilla cambia mucho
(se añade o quita gente de ese puesto), el id puede pasar a referirse a otra persona —
aproximación razonable, no perfecta, coherente con el resto del cálculo derivado.

### 7 bis. El número lo marca el pico, no las horas

Este es el hallazgo que explica todo el producto, y hay que contarlo en la interfaz en
vez de esconderlo. Con los datos de ejemplo:

| | |
|---|---|
| Horas que pide la curva | 501 h/semana |
| Eso son, en jornadas completas | 12,5 |
| Personas que salen de verdad | **19** |

La diferencia no es un error de cálculo: es que el sábado a las 14:00 hacen falta **7
camareros a la vez**. Por pocas horas que sumen entre todos, tiene que haber 7 camareros
en nómina. El pico simultáneo de cada puesto marca un suelo de personas que las horas
totales no pueden bajar.

Por eso `StaffPlan.drivers` lleva `fteFromHours`, `peopleFromPeak` y el pico por puesto:
la interfaz tiene que poder decir *"por horas te bastarían 12 jornadas; son 19 personas
porque tu sábado pide 7 camareros a la vez"*. Y de ahí sale solo el argumento de Shifty.

### 8. Shifty
Las franjas por encima de la línea de cobertura se marcan en el gráfico y se cuantifican:
*"estas X horas al año son picos; cúbrelos con extras de Shifty en vez de contratando de
más"*. Ese es el único momento de venta, y sale del propio cálculo.

### 8 bis. Coste (opcional)
`Settings.hourlyCostEur` es un campo suelto en ajustes avanzados: coste medio por hora,
en euros. **Lo pone el usuario o se queda en blanco — nunca se inventa un precio**, ni de
mercado ni de Shifty. Si está relleno, el resultado y el PDF añaden un par de frases con
la cifra en euros (coste semanal de la plantilla, coste de contratar el pico fijo frente a
cubrir solo esas horas). Si no, todo se queda como antes: solo personas y horas.

### 9. Guardado sin cuenta — construido, desconectado por ahora
`src/lib/persistence.ts` implementa dos mecanismos, ninguno de los dos activo hoy:

- **Autoguardado silencioso en IndexedDB** (con `idb-keyval`, y localStorage de apoyo si
  IndexedDB falla) cada vez que cambia algo relevante del estado, con un pequeño respiro
  de 600ms para no escribir en cada tecla o cada frame de un arrastre. Se usa IndexedDB y
  no localStorage sin más porque en Safari en modo privado `localStorage.setItem` lanza
  `QuotaExceededError` en la primera escritura.
- **Fichero `.json` descargable** (`exportSnapshot`): el guardado de verdad, el que cruza
  de dispositivo o se manda a un compañero. Lleva `source`/`version` para poder rechazar
  con un mensaje claro un fichero de otra versión en vez de reventar.

La idea era que la pantalla de import comprobara al montar si hay algo guardado y, si lo
hay, **preguntara** ("Sigues con..." / Continuar / Empezar de nuevo") en vez de
restaurarlo solo — esta es la pantalla de venta del producto, así que un visitante nuevo
tiene que poder verla entera antes de que nada le salte encima. Se retiró de
`usePlanner.ts`, `StepImport.tsx` y `StepResult.tsx` a petición expresa antes de que
nadie lo viera en marcha; el módulo en sí quedó intacto y probado, listo para reenchufar
cuando toque decidir cómo encaja con una cuenta de verdad.

### 9 bis. Teaser de cuenta — maqueta, sin enviar nada de verdad
`components/AccountTeaserModal.tsx` es la otra cara de lo mismo: un modal "créate una
cuenta gratis para no perderlo" que pide email y móvil. Sale **una vez**, cuando el
usuario lleva visto (no solo pasado de largo) la sección "de dónde sale el número" en
`StepResult` — un `IntersectionObserver` con `threshold: 0.6` sobre esa sección, no un
timer ni el scroll a secas. Se puede cerrar en cualquier momento ("Seguir sin cuenta"):
el "Sin registro" de la portada sigue siendo cierto, esto es el hueco para el día que
deje de serlo.

Es **explícitamente una maqueta**, a petición expresa: el formulario no manda el email ni
el móvil a ningún sitio — `handleSubmit` solo enseña la pantalla de "¡Ya casi!" para
probar el copy y el momento en que aparece. Antes de conectarlo de verdad hace falta
decidir a dónde va ese dato: guardado local (reengancha `lib/persistence.ts`, pero
"entrar desde otro dispositivo" no funciona sin servidor) o un servicio externo de
verdad (necesita elegir cuál y sus credenciales). Ninguna de las dos cosas está decidida
todavía — no lo asumas al tocar este componente.

---

## Principios de producto

Estos mandan sobre cualquier preferencia técnica:

1. **Valor antes que datos.** Nunca pedir un input sin haber enseñado algo antes. Hay
   datos de ejemplo cargables de un clic.
2. **Nada en blanco.** Todo arranca con defaults sensatos y editables. Cero pantallas
   vacías que haya que rellenar para ver algo.
3. **Cada número se explica.** Si la herramienta dice "necesitas 7 personas", tiene que
   poder decir de dónde sale. Modales e info contextual, siempre a demanda, nunca encima.
4. **El progreso se ve.** El usuario sabe en todo momento por dónde va y qué le queda.
5. **Se entiende sin manual.** Si un jefe de sala no lo pilla solo, está mal hecho.
6. **Un paso por pantalla, no pantallas interminables.** Si un paso del flujo tiene varias
   preguntas distintas, se parte en sub-pasos con su propio progreso — como `StepDemand`,
   que enseña lectura, año, horario, semanas especiales y semana tipo de una en una en vez
   de todo en un solo scroll. Ver `DEMAND_SUBSTEPS` ahí mismo para el patrón a reutilizar
   si otro paso crece demasiado.

## Reglas de UI

- Design system de Shifty, replicado en `src/index.css` (tokens `@theme` de Tailwind v4).
- **Clases semánticas siempre**: `bg-brand`, `text-content-primary`, `border-border`.
  Nunca `bg-[#6C0FD8]` ni `bg-purple-600`.
- **Cards a 22px** (`rounded-card`), **botones pill** (`rounded-pill`), fuente **Onest**.
- Todo el copy **en castellano**, tuteando, con el vocabulario del sector: turnos,
  plantilla, cobertura, comensales, franja, cuadrante, extras.
- `prefers-reduced-motion` respetado en `index.css`; no añadir animaciones que lo salten.

## Estructura

```
src/
  components/   Componentes de UI reutilizables (botones, cards, modales, gráficos)
  steps/        Cada paso del flujo, uno por fichero
  lib/          Lógica pura: cálculo, contratos, cuadrante, festivos, IA simulada
  data/         Datos de ejemplo y plantillas iniciales de tramos y puestos
  hooks/        Estado compartido del flujo
```

**`src/lib/` no importa nada de React.** Es lógica pura y testeable: si un cálculo
necesita el DOM, está en el sitio equivocado.

---

## Origen

El modelo viene de un Excel real de planificación
(`PLANIFICADOR MENENDEZ PELAYO`) con las hojas `Semanatipo` (comensales por franja),
`Modelos` (tramos → personal), `Necservicio` (necesidad por franja y puesto),
`Contratos` (tipologías), `PERSONAS` (cuadrante real, persona a persona, con el tipo de
tarea de cada media hora: montaje, servicio, cierre...), `4 SEMANAS` (seguimiento semanal
de ausencias y refuerzos) y `RESUMEN` (necesidades vs presencias vs diferencia).
La herramienta reimplementa esa cadena, pero con los tramos **definidos por el usuario**
en vez de fijos.

**Lo que el Excel tiene y la herramienta deliberadamente no copia:**
- El desglose de cada turno por tipo de tarea (montaje/servicio/cierre/apertura...) de
  `PERSONAS`. Añade una capa de detalle real, pero no cambia el número de gente ni de
  horas — es "cómo se llena el turno" más que "cuánta gente hace falta", y meterlo aquí
  complicaría el cuadrante sin mover el resultado.
- El seguimiento semana a semana de `4 SEMANAS` (quién falta, quién refuerza). Es gestión
  del día a día de una plantilla ya contratada, no dimensionado a partir de demanda: es
  otra herramienta, no una pantalla más de esta.
- Coste/salario: las columnas `SALARIO BRUTO`/`NETO` de `Contratos` existen pero están
  vacías en el fichero de origen — nunca se llegó a usar. Por eso el coste en esta
  herramienta es **opcional y lo pone el usuario** (ver 8 bis), nunca una cifra que se
  invente el propio cálculo.
