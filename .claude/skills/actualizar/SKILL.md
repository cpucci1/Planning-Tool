---
name: actualizar
description: >
  Pone el repo actual al día con lo último de GitHub (la fuente de la verdad), sin perder
  nunca el trabajo a medias de quien la ejecuta. Pensada para gente que NO usa git a mano:
  Claude hace todo el git por dentro (guarda lo que tengas sin commitear, se baja main,
  y te lo devuelve encima) y solo te cuenta en lenguaje normal qué ha cambiado. Úsala cada
  mañana antes de ponerte a trabajar, o cuando alguien diga "actualízame", "bájame lo último",
  "ponme al día", "tráete los cambios", "sincroniza".
---

# Actualizar — traer lo último de GitHub sin perder nada

Esta skill es para **todo el equipo**, no solo para el dueño del repo. La persona que la usa
puede no saber nada de git: tú (Claude) haces TODO el git por dentro y le hablas en lenguaje
natural. **Regla de oro: jamás se pierde trabajo.** Si algo es dudoso, PARAS y lo explicas;
nunca descartas, nunca fuerzas, nunca `reset --hard`.

## Qué hace
Deja el repo donde está la persona con lo último de `main` de GitHub, conservando intacto
cualquier trabajo a medias que tuviera sin guardar.

## Pasos
1. **Mirar el estado actual** (solo lectura): en qué rama está, si tiene cambios sin commitear
   (`git status --porcelain`), y si está en main o en otra rama.
2. **Proteger lo que tenga a medias.** Si hay cambios sin commitear, guardarlos en un stash
   con nombre y fecha (`git stash push -u -m "actualizar-auto <descripción corta>"`). Así nada
   se pierde, ni siquiera archivos nuevos sin trackear (`-u`).
3. **Ir a main y bajar lo último:**
   - `git checkout main` (si no estaba ya).
   - `git pull --ff-only origin main`. Si el `--ff-only` falla porque la persona tenía commits
     propios en su main local sin subir, NO forzar: parar y avisar en lenguaje natural de que
     tiene trabajo en su main que habría que subir antes (sugerir la skill `subir`).
4. **Devolverle su trabajo encima.** Si se guardó algo en el paso 2, recuperarlo
   (`git stash pop`). Si vuelve sin conflicto, perfecto. **Si hay conflicto al recuperar:**
   PARAR. Explicar en lenguaje normal que sus cambios chocan con algo nuevo que se bajó, decir
   qué archivos, y que su trabajo está a salvo en el stash. No intentar resolver el conflicto a
   ciegas; ofrecer ayudar a resolverlo archivo por archivo.
5. **Si la persona estaba en una rama de feature** (no en main): bajar main como arriba, volver
   a su rama, y ofrecerle traer lo nuevo de main a su rama. No hacerlo automático si su rama
   tiene trabajo a medias sin commitear — preguntar primero.

## Cómo contarlo (lenguaje natural, sin tecnicismos)
Al terminar, resumir en 2-3 líneas:
- "Ya tienes lo último." / "Se han bajado X cambios."
- Si cambió la documentación, decirlo ("hay doc nueva/actualizada de tal cosa").
- Si tenía trabajo a medias, confirmar que sigue ahí, intacto.
Nada de nombres de comandos, hashes ni rutas raras. La persona solo quiere saber que está al día
y que no ha perdido nada.

## Guardarraíles (no negociables)
1. **Nunca perder trabajo.** Siempre stash antes de tocar nada; si algo choca, parar y avisar.
2. **Nunca `reset --hard`, nunca `--force`, nunca descartar cambios** sin OK explícito.
3. **`pull --ff-only`**: si no puede avanzar limpio, parar y explicar, no fusionar a ciegas.
4. **Si hay conflicto, no adivinar.** Dejar el trabajo a salvo y ofrecer resolverlo juntos.
5. Hablar siempre en lenguaje natural — quien la usa puede no saber git.
