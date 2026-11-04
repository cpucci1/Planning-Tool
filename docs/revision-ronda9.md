# Ronda 9 de revisión del planificador (2026-11-04)

Dos revisores, uno de pantallas (como lo vería un encargado, recorriendo el ejemplo en el navegador a
1024, 1280, 768 y 375 px) y otro del motor de cálculo (ejecutando los nueve locales del banco con
tres variantes y ocho casos límite). Sin errores de reglas laborales dentro de la semana tipo ni
NaN en ninguna cifra.

## Arreglado

### Pantallas
1. **Las horas del mando no se podían escribir**: cada tecla corregía al mínimo o al máximo (borrar
   ponía 10, escribir 25 dejaba 40). Ahora se corrige al salir del campo, para todos los campos
   numéricos, y el mando admite desde 4 h (`ui.tsx`, `RoleCatalog.tsx`).
2. **A 1024 px el nombre del puesto quedaba tapado** por el precio: el nombre ocupa su línea hasta
   pantallas grandes.
3. **"Los picos" decía "no van seguidas"** aunque hubiera una temporada: solo lo dice si es verdad.
4. **La misma cifra con tres nombres**: "En turno sin servicio" en pantalla, PDF y Excel.
5. **Zona, bloque y categoría** eran lo mismo: ahora "zona" en todas partes, y "Tus puestos" en vez
   de "catálogo de puestos".
6. **Equipo redondeaba a la hora** (489 h) y "Por qué" daba 488,5 h: un decimal en las dos.
7. **La columna del cuadrante** daba dos números sin decir qué eran: "Contrato · en turnos".
8. **La portada** daba los grupos de contrato sin unidad y el coste redondeado a 50 €: ahora con h y
   al euro, las mismas cifras que dentro (lo comprueba `npm run verificar`).
9. **El hueco de 17:30 a 20:00** sin explicar cuando la merienda no se pregunta: la pista de la cena
   dice dónde cuenta.
10. **Extras y refuerzos**: "refuerzos" en todas partes.

### Cálculo
1. **Horario deducido de un local pequeño** (lector de ficheros): el umbral se elige día a día.
2. **Horas con zona horaria** (Z, +00:00): se convierten a la hora local y se avisa.
3. **"Con más margen"**: los picos se miden contra la semana tipo que la plantilla ya cubre. Antes
   un menú del día vendía 10 semanas de refuerzo que su plantilla cubría.
4. **La rueda de semanas** mira ya el descanso semanal (36 h, 48 h menores) en cada semana real, no
   solo las 12 h del cambio; y quita el "Es legal" que no comprobaba. Lo vigila
   `comprobar-cuadrante`.
5. **Horas de contrato sin turno** cubren los picos antes que las complementarias y el refuerzo.
6. **Con horas sin cubrir**, "pagas X h más de las que pide el servicio" ya no cuenta como de más
   las horas de contrato sin turno.
8. **"N semanas de sueldo por cada semana punta"** usa las semanas que se pagan, no las que traen
   datos.

## Pendiente, no se toca sin decidir
- **Festivos (hallazgo 7)**: se cuentan como si todos trabajaran 5 días (horas semanales × 14 / 5).
  Si se compensan los 14 o solo los que caen en día de trabajo depende del convenio.
- **Las horas de corte de comida, merienda y cena** (17:30, 20:00) están en el código: deberían
  salir de la configuración, por la regla de que nada dependa de un sector.
