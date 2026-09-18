---
name: aprender
description: >
  Convierte una corrección de Crescente en documentación permanente, en el momento en que la
  hace. Se dispara sola (la lanza el detector de correcciones) cuando dice "eso está mal", "no
  funciona así", "confundiste X con Y", "ya te lo dije", "te lo estás inventando", y a mano con
  "apunta esto", "que no se te olvide", "aprende de esto". Decide DÓNDE va el aprendizaje entre
  el repo Docs, las skills y la memoria, lo escribe con el par CORRECTO/INCORRECTO, y confirma
  dónde lo dejó. Úsala también cuando descubras por tu cuenta que un documento mentía.
---

# Aprender — que el mismo error no pase dos veces

El agente olvida al cerrar el chat. La documentación no. Cada corrección que no se escribe es una
corrección que Crescente va a tener que repetir dentro de tres semanas, probablemente después de
que el error haya costado algo.

**Se ejecuta en el momento de la corrección, no al final de la conversación.** Si esperas al
final, el chat se cierra antes y el aprendizaje se pierde. Esto pasa siempre.

---

## ⛔ Lo primero: dónde NO se escribe

**`agent_docs/` y `.claude/skills/` de los seis repos son copias de solo lectura.** La siguiente
sincronización hace `rm -rf` del destino antes de copiar: lo que solo exista allí, desaparece.

Ya costó un documento entero. `features/gestoria-automatizacion.md`, 162 líneas con las reglas de
la automatización marcadas como decididas y no negociables, se escribió en el `agent_docs/` del
panel. El sync del 29 de agosto de 2026 lo borró y nadie se enteró hasta el 2 de septiembre,
cuando se rescató del historial de git.

**Todo aprendizaje va al repo `Docs`.** Sin excepción.

---

## Paso 1 — Aislar el aprendizaje

Separa tres cosas y no las mezcles:

- **Qué dije o hice mal** (el síntoma).
- **Cuál es la verdad** (lo que Crescente acaba de decir, o lo que acabas de verificar).
- **Por qué me equivoqué.** Asumí por el nombre de una función. Leí un documento desfasado.
  Extrapolé de otro proyecto. Di por hecho que algo no existía sin mirar la base. **Esto es lo
  más valioso y lo que casi siempre se omite**, porque es lo único que evita la siguiente
  variante del mismo error.

**Si la corrección es sobre un dato que cambiará solo** ("esa empresa ya no está activa"), no se
apunta. Solo se apuntan reglas, invariantes y trampas.

**Si la corrección revela que un documento mentía, se corrige también el documento.** Si no, el
siguiente que lo lea cometerá el mismo error, y esta vez con un papel que lo respalda.

---

## Paso 2 — Decidir dónde va

El criterio es **cuándo hace falta ese conocimiento**. La tabla completa está en la skill
`shifty-mantener-las-reglas`; esto es el resumen operativo.

| Tipo de aprendizaje | Dónde va |
|---|---|
| Regla de negocio o de lógica | `Docs/docs/shared/governance.md`, sección 14 |
| De una feature concreta | Su fichero en `Docs/docs/features/` |
| Trampa de la base de datos | Skill `shifty-base-de-datos` |
| Regla de dinero, comisión, tarifa o factura | Skill `shifty-dinero` |
| Permisos, RLS, quién puede ver qué | Skill `shifty-seguridad` |
| Qué se le contesta a un trabajador | Skill `shifty-soporte-trabajador` |
| Copy, marca, palabra prohibida | Skill `shifty-marca-y-copy` |
| De esquema o de datos | Se **regenera** el volcado desde Supabase, no se escribe a mano |
| De contenido o marketing | `Docs/docs/marketing/content-learnings.md` |
| Comportamiento tuyo que aplica siempre | `Docs/docs/shared/REGLAS-COMUNES.md` |
| Comportamiento tuyo solo en un repo | `Docs/repos/<proyecto>.md` |
| Al cerrar una incidencia | Ficha en `Docs/docs/incidencias-tecnico/` |
| Una decisión con alternativas descartadas | Una decisión nueva en `Docs/docs/decisiones/` |

Ante la duda entre dos sitios, va a `governance.md`: es el que se lee cuando toca.

### Y la memoria, que es otra cosa

La memoria automática (`~/.claude/projects/.../memory/`) **no es documentación**: es lo que tú
recuerdas entre sesiones, y no la ve nadie más ni llega a los repos.

- **Va a la memoria** lo que es contexto tuyo: una decisión de Crescente con su fecha, el estado
  de un frente abierto, cómo quiere trabajar.
- **Va a `Docs`** todo lo que otra persona —o Codex, o el siguiente chat— necesitaría para no
  equivocarse.
- **Nunca solo a la memoria** una regla que afecta al producto. Si mañana cambias de herramienta,
  la memoria no viaja y `Docs` sí.

Si el aprendizaje cabe en los dos sitios, se escribe en `Docs` y en la memoria se deja una línea
que apunte allí. Nunca la regla entera dos veces: dos copias divergen.

---

## Paso 3 — Escribirlo

Formato corto, con el par. Es el formato de la sección 14 de `governance.md`:

```
### [Título de tres o cuatro palabras] (AAAA-MM-DD)
[Una frase con el comportamiento correcto.]
- CORRECTO: [qué hacer]
- INCORRECTO: [qué hice yo, y por qué está mal]
```

Reglas de redacción:

- **Una frase, no un ensayo.** Si necesitas un párrafo, la regla todavía no está clara.
- **El INCORRECTO es el error real que ocurrió**, nunca uno hipotético. Un ejemplo inventado no
  convence a nadie y no se reconoce cuando vuelve a pasar.
- **Con el número, la fecha o el incidente que lo justifica.** "El 2026-09-03 había 19 familias de
  funciones duplicadas" convence; "conviene revisar las funciones" no.
- **Sin código.** Crescente no lo lee. Citar `archivo:línea` como referencia sí vale.
- **Sin guiones largos.** Le suenan a texto de IA.
- **Fecha la entrada** si describe un estado que puede caducar.

---

## Paso 4 — Comprobar que no lo estás duplicando

Antes de escribir, **busca si ya está escrito**. Si está, actualiza lo que hay; no añadas una
segunda versión con otras palabras.

Y si lo nuevo **contradice** algo existente, resuélvelo ahora: corrige o borra lo viejo en el
mismo cambio. Dejar las dos versiones conviviendo es exactamente como nació el desorden que todo
este sistema viene a evitar, y entre dos ficheros de reglas **no hay jerarquía**: ante una
contradicción no gana el más específico, se elige de forma arbitraria.

---

## Paso 5 — Confirmar

Una línea, y nada más: *"Lo he registrado en `<fichero>` para que no vuelva a pasar."*

Si el fichero está en `Docs` y todavía no se ha subido, dilo: hasta que no entre en `main` y pase
el sync, los repos siguen con la versión vieja.

---

## Guardarraíles

1. **Nunca borrar un aprendizaje anterior** para meter el nuevo. Si uno queda superado, se marca
   como superado y se dice por qué. La historia no se reescribe.
2. **No inflar.** Una regla que lleva meses sin activarse se archiva. Cada línea de las reglas
   comunes se paga en todas las sesiones de los ocho proyectos.
3. **No convertir en regla un caso único.** Una vez es una anécdota; a la segunda ya es un patrón.
4. **Si el aprendizaje toca a más de una app**, va a `Docs/docs/shared/` y se avisa de que hay que
   dejarlo propagar antes de implementar nada encima.
