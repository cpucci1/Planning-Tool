# Cambios en la demanda del planificador (2026-11-04)

Rama `feature/planificador-demanda`. Toca cómo se pasa de la demanda a la necesidad de
personal. No toca el cuadrante (`roster.ts`), los avisos, los contratos ni los mandos.

## Las cifras, antes y después (datos de ejemplo, `npm run verificar`)

| | Antes | Después |
|---|---|---|
| Personas | 19 | 22 (13 de 40 h, 5 de 30 h, 4 de 15 h) |
| Horas pedidas por semana | 501 h | 596,5 h (522,5 de servicio + 74 de preparar y recoger) |
| Horas contratadas | 665 h | 730 h |
| Pico de personas a la vez | 17 (sábado 14:00) | 17 (sábado 14:00) |
| Turnos | 88 | 91 |
| Máximo de la curva | 148 cobros en una media hora | 366 sentados a la vez (sábado 21:00) |
| Cobertura | 41 de 52 semanas | 41 de 52 semanas, y ahora pone 79 % en los dos sitios |

Con el fichero de prueba `tpv-prueba.csv`: 22 personas (12 de 40 h, 5 de 30 h, 3 de 20 h,
2 de 15 h), 595 h pedidas, 720 h contratadas, pico 17, máximo 366 sentados.

**De dónde salen las 3 personas de más.** Con los tramos nuevos y sin preparación salen
500,5 h y pico 17: el cambio de escala, por sí solo, mantiene el criterio. Lo que sube son
las 74 h de preparación y recogida, que antes no pedía nadie, y una curva un poco más
ancha (la gente sigue sentada un rato después del último cobro de cada franja).

## Punto 4. Sentados a la vez

El fichero marca la hora del cobro, que es el FINAL de la comida. Ahora cada cobro se
reparte hacia atrás durante lo que dura una comida (75 min a mediodía, 90 por la noche;
el corte está a las 18:00 y los dos se cambian en el paso de Equipo). La curva pasa a ser
"personas sentadas a la vez". Los comensales se conservan: sentados por media hora suman
exactamente comensales por duración.

- **Sustituye al desfase de 30 min, no se suma.** El desfase adelantaba la curva para
  corregir lo mismo (que se cobra al terminar). Aplicar los dos corregiría dos veces. Por
  eso el desfase por defecto pasa a 0 y su control se esconde en los planes nuevos.
- **Los tramos se recalibran** a la nueva escala (cada límite por 2,5: 1-25, 26-60, 61-100,
  101-150, 151-225, 226-300, 301 o más), con la misma gente en cada tramo. Los de antes se
  quedan como `DEFAULT_TIERS_COBROS` para el botón de restaurar de los planes viejos.
- **La pregunta del paso de Equipo** es ahora "Con la sala con 40 personas sentadas,
  ¿cuánta gente necesitas?", y encima va una tarjeta con el máximo del propio usuario
  ("Tu sábado llega a 366 personas sentadas, a las 21:00").
- **Etiquetas**: la cabecera de la tabla dice "Sentados a la vez"; la curva del día enseña
  los cobros y, en discontinuo, los sentados; el mapa de calor sigue en cobros y lo dice;
  el PDF y el Excel nombran la duración de la comida en vez del desfase.
- **El pico de personas sigue teniendo sentido**: sigue siendo el sábado a las 14:00 con 17
  personas, porque el tramo más alto se alcanza igual a mediodía y por la noche.
- **Los planes guardados antes de hoy no cambian.** No traen `mealMinutes`, y siguen el
  camino de entonces (desfase y tramos sobre cobros). Sus tramos están escritos en esa
  escala y cambiarles el cálculo por debajo les daría otra plantilla sin tocar nada.
  Comprobado en `scripts/comprobar-demanda.ts`: dan exactamente lo mismo que la cadena vieja.

**Sobre la estancia media de 1 h 37 min.** La investigación habla de una estancia media
española de ~1 h 37 min en mesa. Me quedo con 75/90 que pedía el encargo: 97 min es la
media de toda la estancia de una mesa de carta, y a mediodía en un local de menú es bastante
menos. Está en un desplegable (45 a 150 min) para que cada uno ponga la suya. Si se quiere
otro valor por defecto, es una línea en `DEFAULT_SETTINGS.mealMinutes` (`src/data/presets.ts`).

## Punto 3. Quién abre y cierra

El mínimo por zona lo hacía siempre el primer puesto de la lista, que en sala es el
Encargado y en cocina el Jefe de cocina: puestos que arrancan a cero en todos los tramos.
Ahora, por defecto, lo hace el puesto más básico con gente en los tramos (el que aparece en
el tramo más bajo, y a igualdad el que más gente tiene): Camarero en sala, Cocinero en
cocina. Al lado del número de mínimo hay un desplegable "Abre y cierra" para elegir otro.

## Punto 7. Preparación y recogida

Por zona, en el paso de Horario: cocina entra 60 min antes y las dos zonas salen 30 min
después del cierre al público. El equipo que abre (el de la primera franja con servicio)
entra antes, y el que cierra (el de la última) sale después, puesto por puesto. Antes la
preparación solo estiraba la ventana del mínimo por zona y, sin mínimo, no pedía nadie.
Una zona nueva que añada el usuario nace sin preparación (0 y 0).

## Punto 16. "79 % · 41/52" y "80 % del histórico"

Eran la misma línea redondeada de dos maneras. El porcentaje se ajusta al de las semanas
que de verdad cubre (41 de 52 = 79 %) y el gráfico enseña ese mismo número. El ajuste no
mueve la línea ni entra en bucle (comprobado).

## Punto 17. El ejemplo

Debajo de la zona de subir el fichero: "¿No tienes el fichero a mano? Míralo con un
restaurante de ejemplo", que carga el dataset de ejemplo.

## Punto 18. El texto de privacidad de la portada

Decía "No se sube a ningún servidor", y no era del todo cierto: el plan calculado (con la
curva de comensales) se guarda en el servidor para el enlace corto, y a la IA salen los
nombres de las columnas y tres filas de muestra. Ahora dice: "Tu fichero no se sube. Se lee
en tu navegador: solo salen los nombres de las columnas y tres filas de muestra. Guardamos
el plan calculado, con tu curva de comensales, para que puedas volver a él."

## De paso

- **La portada enseñaba 19 personas** en la miniatura "Cuántas personas necesitas". Esa
  cifra tiene que ser la del ejemplo; ahora es 22 con el desglose de hoy, y el total se suma
  del desglose en vez de ir escrito aparte. Cuando se junte la rama del cuadrante, volver a
  copiarlo de `npm run verificar`.
- La cadena de demanda a necesidad estaba escrita en `usePlanner` y repetida (con
  diferencias) en el guion de verificación. Ahora vive en un solo sitio, `src/lib/necesidad.ts`.

## Lo que queda para la ronda 2

- **Trabajo fijo por puesto y servicio** (mise en place, limpieza) separado del variable,
  como Fourth y Quinyx. La preparación de hoy es un primer paso (gente antes y después), pero
  no es un bloque de horas por puesto que no dependa del volumen.
- **"Ayudante 4" con contrato de 15 h y 3 h asignadas.** Es la consolidación del cuadrante,
  fuera de mi alcance.
- **Las horas de apertura que se detectan** salen de los cobros (con el desfase viejo), así
  que un poco de ocupación muy temprana puede quedar recortada.
- **`CuentaModal` y la tarjeta "Sigues con..."** dicen que el plan "vive solo en este
  navegador"; con backend no es del todo así. No lo he tocado.
- **El `CLAUDE.md` del proyecto** sigue citando la promesa vieja de privacidad y describe el
  desfase de 30 min como la corrección vigente. Se genera desde Docs: hay que cambiarlo allí.
- **Posible solape** de la etiqueta del día con la marca más alta del eje en la curva del
  día. No lo he verificado; probablemente ya pasaba.

## Cómo se comprueba

    npm run verificar
    npx tsc -b
    npx esbuild scripts/comprobar-demanda.ts --bundle --platform=node --format=esm \
      --alias:@=./src --external:xlsx --log-level=error --outfile=/tmp/comprobar-demanda.mjs \
      && node /tmp/comprobar-demanda.mjs

El último falla (código 1) si algo no se cumple: conservación de comensales, un caso hecho a
mano, enteros, quién abre, mínimo, preparación antes y después, equivalencia de los planes
viejos, coherencia de la cobertura, y tiempo de la cadena (entre 1,5 y 2,8 ms según la carga
de la máquina; la de antes, entre 0,8 y 1,3 ms; el reparto
de turnos sigue en ~22 ms).
