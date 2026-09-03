# Shifty Planning

Herramienta web gratuita para dimensionar la plantilla de un restaurante a partir de su
demanda real de comensales. Sin registro, sin backend, sin base de datos.

```bash
npm install
npm run dev     # → http://localhost:5174
```

## Qué hace

1. **Lee tu histórico.** Subes el fichero de tu TPV y salen los comensales por franja de
   media hora, semana a semana.
2. **Confirmas lo detectado.** El horario de apertura y las semanas raras del año
   (Semana Santa, agosto, comidas de empresa) vienen ya propuestos.
3. **Dices cuánta gente necesitas por tramo.** *"De 26 a 40 comensales: 2 camareros, 1 de
   cocina y 1 office."* Es el único input de verdad.
4. **Eliges dónde situarte.** Arrastras una línea sobre las 52 semanas del año y decides
   cuántas cubres con plantilla fija.

Y devuelve la plantilla, el mix de contratos, el cuadrante semanal y las semanas punta que
no compensa cubrir contratando — descargable como PDF de una página.

## Cómo está montado

- **Vite 7 + React 19 + TypeScript + Tailwind v4.** Sin router: el flujo son cuatro pasos
  sobre un único estado.
- `src/lib/` es lógica pura sin React — percentiles de cobertura, festivos móviles,
  descomposición en turnos, empaquetado en contratos. Se puede probar sin montar nada.
- `src/lib/fakeAI.ts` **simula** la lectura del fichero. Es el único punto que finge, y
  está aislado para que sustituirlo por una llamada real no toque nada más.

Los detalles del modelo, las decisiones de producto y las reglas de interfaz están en
[CLAUDE.md](CLAUDE.md).
