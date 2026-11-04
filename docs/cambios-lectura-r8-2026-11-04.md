# Ronda 8: la entrada del fichero (04-11-2026)

Arreglos de la revisión de la ronda 8 (`docs/revision-ronda8.md`) en la lectura del fichero: G1, G2, m2 y m5. Sin commit.

## Qué cambia para quien sube su fichero

| Fichero | Antes | Ahora |
|---|---|---|
| Solo fecha, hora e importe, una fila por ticket (`sin-ticket.csv` del banco) | "No ha entrado ni una fila" y se quedaba en la portada | Entra: 604 comensales a la semana y 11 personas |
| Una línea por producto con número de ticket (`por-producto.csv`) | 1.828 comensales a la semana y 19 personas | 604 comensales y 11 personas, igual que el de un ticket por fila |
| El mismo, con el ticket marcado como "No la uses" | "Siguiente" bloqueado | Entra igual: 604 comensales |
| Devoluciones | Se tiraban con el motivo "los comensales no eran un número" y la venta seguía contando | Se tiran como devolución y se quita la venta que anulan |
| Ventas leídas del importe | Con IVA, y el ratio de coste salía un 9 % más bajo | Sin IVA, dividiendo entre 1,10, y se dice |

Los 604 y no 609: son las 73 devoluciones del banco más las 73 ventas que anulan.

## G1. Ningún callejón sin salida

- **Cada fila es un ticket** cuando no hay columna de comensales ni de tickets. Se estima con los comensales por ticket (2 de partida), que se cambian en la pantalla de columnas, y se avisa de que es una estima. `src/lib/parseFichero.ts`, bloque "Qué cuenta cada fila".
- **Excepción:** si el fichero viene agrupado por horas y solo trae el importe, sus filas no son tickets. No se inventa nada: se descartan con su motivo ("sin cantidad") y se pide marcar la columna que cuente.
- **Para seguir basta con la fecha** (`mapeoSuficiente` en `src/lib/mapeo.ts`). La regla vieja (fecha y además comensales o tickets) sigue como `mapeoConCantidad`, y solo la usa la segunda opinión del modelo para no aceptar un mapeo que pierda la columna de cantidad.
- **Cualquier fallo de lectura lleva a la pantalla de columnas.** Si el fichero se abre y tiene columnas, se carga aunque no entre ni una fila o aunque solo traiga un total por día (`src/steps/StepImport.tsx`).
  - Arriba sale en rojo el motivo principal y un enlace para subir otro fichero.
  - El "Siguiente" y los saltos del sub-progreso se paran hasta que entre algo (`lecturaParada` en `src/steps/StepDemand.tsx`).
  - Solo se queda en la portada un fichero vacío o que no se puede abrir.

## G2. Una línea por producto

- **Con número de ticket:** cada número distinto, dentro del mismo día de servicio, es un ticket.
  - Su hora es la de la última línea, que es la del cobro.
  - Sus comensales, si los hay, se cuentan una vez.
  - Si una columna marcada como ticket se repite con más de tres horas entre líneas en muchos casos, no es un ticket (será la mesa o el camarero) y no se junta. Se avisa.
- **Un número de ticket que es un número** (10234, o el 1, 2, 3 del día) ya no se multiplica como si fuera una cantidad (`columnaEsCodigo`).
- **Sin número de ticket:** se juntan las líneas con la misma fecha y hora exactas, pero solo si salen muchas menos horas distintas de las que darían cobros al azar (`lineasJuntasPorHora`).
  - Probado sin falsos positivos con hasta 300 cobros cada dos horas.
  - Si el total viene repetido en cada línea, el total separa dos tickets del mismo minuto. Sin eso, dos mesas que pagan en el mismo minuto cuentan como una: sale algo por debajo (un 4 % en la prueba), nunca el doble.
- **El importe del ticket:** se suma línea a línea, o se cuenta una vez si el fichero repite el total en cada línea (se decide mirando todo el fichero).
- **El aviso viejo** ("márcala como No la uses y dinos cuál cuenta") se ha quitado, porque llevaba al bloqueo. Ahora el aviso nuevo (`lineas-por-ticket`) dice cuántas líneas y cuántos tickets hay.

## m2. Devoluciones con su motivo de verdad

- Es una devolución el ticket con comensales o tickets en negativo, o con el importe en negativo cuando cada fila es un ticket.
- Se descarta como "devolución", y se quita también la venta del mismo día y el mismo importe (o, sin importe, los mismos comensales), la más cercana antes de ella.
- Un número de tickets ilegible o una fila sin número de ticket ya tampoco dicen "los comensales no eran un número": tienen su propio motivo.

## m5. Ventas sin IVA

- `ventasSemanaNormal` sale ya **sin IVA**. La fórmula del ratio no se ha tocado: el ratio coge esa cifra y por eso sale sin IVA.
- Campos nuevos en el `source` del dataset:
  - `ventasSemanaNormalConIva`: lo que traía la columna;
  - `ivaDescontado`: 0,10 si se ha quitado, `null` si la columna ya venía sin IVA;
  - `cadaFilaEsUnTicket`;
  - `lineasPorTicket`.
- Se da por hecho que el importe lleva IVA, salvo que la cabecera diga base, neto, imponible o "sin IVA".
- **Una frase de `src/steps/StepResult.tsx`.** Decía "si tu TPV da el importe con IVA, divídelo entre 1,10", y ahora dice que ya va sin IVA. Para un plan guardado antes de esta ronda sigue diciendo lo de antes.

## Pruebas

- `src/lib/parseFichero.test.ts`, bloque 17, 39 comprobaciones nuevas. Fallan si vuelve cualquiera de los cuatro fallos:
  - el fichero solo con importe;
  - el agrupado por horas;
  - el fichero por producto con número, sin número y con número numérico;
  - el "No la uses" que bloqueaba;
  - las devoluciones con y sin comensales;
  - el IVA.
- La prueba vieja que decía "sin comensales ni tickets no entra ninguna fila" ahora comprueba lo contrario.
- **Resultados:**
  - Lector: 237 de 237.
  - `tsc -b` a cero, y `npm run verificar`, `comprobar-cuadrante`, `comprobar-coste`, `comprobar-demanda` y `vite build` en verde.
  - `tpv-prueba.csv` da la misma demanda que antes. Solo cambian sus ventas, que pasan sin IVA de 122.963 a 111.785.
- **En el navegador**, con los dos ficheros del revisor:
  - los dos entran con 11 personas;
  - marcar el ticket como "No la uses" deja el "Siguiente" activo;
  - un resumen diario sin hora llega a la pantalla de columnas con el motivo y el "Siguiente" parado;
  - sin errores en consola y sin scroll lateral a 375 px.

## Lo que queda

- **El 1,10 está escrito en el código** (`IVA_DEL_IMPORTE`). Vale para restauración. Si la herramienta abre otro sector, tiene que salir de su configuración (regla de agnóstica de sector).
- **Juntar por fecha y hora sin número de ticket** puede juntar dos mesas que pagan en el mismo minuto, si el fichero suma las líneas en vez de repetir el total. Se queda algo corto, nunca doble.
- **No hay interruptor para deshacer el juntado.** Si algún TPV raro lo dispara sin ser por producto, no hay forma de desactivarlo desde la pantalla. No se ha visto en ningún fichero de prueba.
- **Quitar la venta que anula una devolución** es la lectura que pidió la revisión. Si la mesa sí se sirvió (una queja), esa demanda se pierde.
