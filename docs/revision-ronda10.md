# Ronda 10 de revisión del planificador (2026-11-04)

Dos revisores: uno de pantallas (recorriendo el ejemplo a varios anchos) y otro del motor (los nueve
locales del banco con cinco variantes y ocho casos límite). Además, dos cosas nuevas pedidas por
Crescente: "seguir en el ordenador" desde el móvil y la marca nueva (morado oscuro y logo Shifty Work).

## Nuevo

- **Seguir en el ordenador.** En el móvil sale una franja bajo la cabecera, que se cierra con la X y
  no vuelve en esa visita. Abre una ventana para dejar el correo y recibir el enlace (al plan
  guardado, si lo hay) con un resumen de lo que hace la herramienta. El correo no se guarda.
  - Función `planning-seguir-luego` en freetools, desplegada **apagada** (regla 10). Se enciende
    poniendo el secreto `PLANNING_SEGUIR_LUEGO_ACTIVO=1`, solo con el OK de Crescente al texto.
  - Mientras está apagada, o si falla, la ventana ofrece copiar el enlace.
  - Vistas previas: `docs/correo-seguir-luego-vista-previa.html` y `docs/correo-seguir-luego-con-plan.html`.
- **Marca nueva**: morado `#3C1663` (oscuro `#2B1048`, claro `#6B4A93`) en la web, el PDF, la imagen
  del turno y el correo; logos y favicon de Shifty Work copiados de la web.
- **Pantallas para marketing**: `docs/pantallas-shifty-marketing.html`, autocontenido.

## Arreglado

### Pantallas
1. Poner nombres en el móvil: el texto ya no dice "doble clic" y el lápiz se ve siempre en pantallas táctiles.
2. "Si cubres solo lo que falta" ya no cobra las horas de contrato que ya pagas, y dice "al año".
3. "Nadie viene menos de 4 h al día", no "seguidas".
4. Quedaban "bloque" y "área": ahora "zona" en todas partes.
5. La tarjeta de horas pagadas sin servicio usa los mismos nombres que el resto.
6. "Catálogo" fuera de los textos: "tus puestos".
7. El precio de un puesto se puede volver a dejar en blanco.
8. Turno de noche: entra desde las 18:00 o cierra a las 23:00 o más tarde.
9. Fichero con solo la fila de títulos: lo dice y pide volver a subirlo.
10. Descargas con nombre claro ("Cuadrante para Excel", "Todo el plan para Excel", "Guardar el plan
    para seguir otro día"), y en el Excel los mandos salen "por horario" en la tabla de tramos.

### Cálculo
1. **Un fichero por franjas ("13:00-14:00") se leía como hora con zona horaria** y movía los cobros
   a la madrugada. La zona solo se lee en horas ISO.
2. **Descanso semanal de la rueda**: un descanso que cruza de domingo a lunes ya no vale para dos
   semanas, salvo que dure el doble. El vigilante comprueba lo mismo y con los mismos puestos.
3. Las horas de contrato sin turno solo cubren picos si dan para un turno mínimo, y después de tapar
   lo que la semana tipo deja sin cubrir.
4. El coste de los picos solo valora las complementarias y el refuerzo.
5. La frase de horas de más: ninguna parte puede ser mayor que el total, y el motivo depende de si
   los contratos van a medida o por lista.
6. Las semanas flojas para vacaciones se miden con la misma vara que los picos ("Con más margen").
   El margen de seguridad no se usa para vacaciones.
7. La rueda no rota parciales cuando nadie tiene jornada completa, ni grupos con filas idénticas.
8. Una semana punta con 0 h ya no cuenta.
9. Con un solo turno en la vuelta, la rueda ya no dice que rompe las 12 h.
10. Un día que sale cerrado con cobros lo dice así, sin "el 100 %".

## Pendiente, no se toca sin decidir
- Encender el envío del correo (OK de Crescente al texto).
- La captura del producto en "Con Shifty" y la imagen de compartir (`og.png`) siguen con el morado antiguo.
- Las horas sin turno se cuadran en total, no puesto a puesto.
- De rondas anteriores: festivos por convenio y horas de corte de comida y cena en el código.
- Pendiente de la revisión de código: la vara de semanas flojas se repite en la pantalla en vez de salir del análisis de picos, y no hay prueba de la jornada completa de la rueda.
