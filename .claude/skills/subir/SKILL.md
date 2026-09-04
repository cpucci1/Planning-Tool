---
name: subir
description: >
  Coge el trabajo terminado de quien la ejecuta y lo lleva a GitHub como una PR para que el
  responsable lo revise y mergee — sin que la persona toque git ni main. Pensada para gente que
  NO usa git a mano: Claude crea la rama, commitea, sube y abre la PR por dentro, y solo le
  devuelve el enlace. NUNCA empuja a main directo. Úsala cuando alguien diga "súbeme esto",
  "manda mi trabajo", "abre una PR", "esto ya está listo para revisar", "sube lo que hice".
---

# Subir — llevar tu trabajo a GitHub como PR (sin tocar git)

Esta skill es para **todo el equipo**. La persona puede no saber nada de git: tú (Claude) haces
TODO por dentro y le hablas en lenguaje natural. **Regla de oro: nada va directo a `main`.**
Todo entra por una rama + PR que revisa el responsable. Así su trabajo deja de morir en su
ordenador y llega ordenado, sin riesgo de pisar lo de otros.

## Qué hace
Toma los cambios que la persona tiene hechos, los empaqueta en una rama propia, los sube a
GitHub y abre una PR lista para revisar. Le devuelve el enlace y le dice que ya está en manos
del responsable.

## Pasos
1. **Mirar qué hay para subir** (`git status`, `git diff --stat`). Si no hay cambios, decirlo y
   parar. Si la persona está sobre `main`, NO commitear ahí: se crea rama igualmente (paso 3).
2. **Verificar que está listo (no subir roto).** Según el repo:
   - Panel/Web (TypeScript): `npx tsc --noEmit` y `npm run lint`. Para apps Expo, además
     comprobar que empaqueta si tocó pantallas (`npx expo export` si aplica) — un OTA/merge roto
     llega a todos. Si algo falla, **NO subir**: explicar en lenguaje normal qué está roto y
     ofrecer arreglarlo primero. Nunca `--no-verify` ni `biome --unsafe`.
3. **Crear una rama propia** con nombre claro a partir de lo que se hizo: `feature/<algo>` para
   cosas nuevas, `fix/<algo>` para arreglos. Nunca trabajar sobre main.
4. **Commitear con mensaje claro.** Preguntar a la persona en una frase qué hizo (o deducirlo de
   los cambios) y escribir un mensaje descriptivo en formato `tipo(alcance): descripción`. Si el
   commit arregla una incidencia con ticket, añadir el trailer `Ticket: <id>`.
5. **Subir la rama** a GitHub (`git push -u origin <rama>`). Si el pre-push (tsc) falla, LEER el
   error y arreglarlo — nunca saltárselo.
6. **Abrir la PR** con `gh pr create`: título claro (lo que hace, en cristiano), cuerpo con un
   resumen de 2-3 líneas de qué cambia y por qué, y poner como revisor al responsable del repo.
   Si no hay `gh` disponible o no está logueado, avisar y dar las instrucciones para abrir la PR
   desde la web, con el enlace.
7. **Devolver el enlace de la PR** y decir en lenguaje natural: "Listo, está subido y esperando
   revisión de [responsable]. Cuando la apruebe, entra en producción." Recordar que su trabajo
   local sigue intacto.

## Importante para apps móviles (worker / cliente)
Mergear la PR a main **NO** pone la app en producción: hace falta un OTA o una build nueva, que
hace el responsable. Dejar claro a la persona que "subir" aquí = "mandar a revisar", no "ya está
en la app". No dar por desplegado lo que solo está en una PR.

## Cómo contarlo (lenguaje natural, sin tecnicismos)
Nada de nombres de rama, hashes ni comandos. Solo: "Lo he subido, aquí está el enlace para
seguirlo, lo revisa [responsable] y cuando dé el OK entra." Si algo estaba roto y no se subió,
explicarlo claro y ofrecer arreglarlo.

## Guardarraíles (no negociables)
1. **NUNCA push directo a main.** Siempre rama + PR.
2. **No subir roto.** Verificar (tsc/lint/build según repo) antes de subir; si falla, arreglar
   primero, nunca saltarse los hooks.
3. **No perder el trabajo local** de la persona: solo se empaqueta y sube, no se borra nada.
4. **No marcar como desplegado** lo que solo está en PR; las apps necesitan OTA/build aparte.
5. Hablar siempre en lenguaje natural — quien la usa puede no saber git.
