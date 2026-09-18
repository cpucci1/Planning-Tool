---
name: rama
description: >
  Prepara un chat para trabajar UN tema aislado del resto, para poder tener varios chats en
  paralelo sin que se pisen. Cada chat trabaja en su propia carpeta aislada salida de main al
  día; la carpeta del repo se queda como base común. Dos momentos - al EMPEZAR ("ponme una rama
  para X", "empecemos con X", "quiero trabajar Y en paralelo sin que se pise") abre la carpeta y
  entra en ella; al CERRAR ("ciérralo", "ya está listo", "retira la carpeta") comprueba que no
  queda nada sin subir y la retira. Subir el trabajo a GitHub no lo hace esta skill - lo hace
  `subir`.
---

# Rama — un tema, una carpeta, un chat

Esta skill es para trabajar sin saber git. **Tú (Claude) haces todo el git por dentro** y le
hablas en castellano normal.

**El lío nunca lo causaron las ramas: lo causa que dos chats compartan la misma carpeta.** Una
rama es solo una etiqueta; los archivos de verdad son UNA copia por carpeta. Dos chats en la
misma carpeta se pisan, y al cambiar de rama uno se lleva por delante el trabajo del otro sin que
nadie se entere hasta mucho después. Por eso: **una carpeta por tema**.

---

## Modo EMPEZAR

Se dispara con "ponme una rama para X", "empecemos con X", o cuando Crescente
pide algo nuevo y la carpeta donde estás no es la suya.

### 1. Averiguar en qué proyecto se trabaja

`~/Desktop/Shifty/Github/` **no es un repositorio**: solo contiene los ocho proyectos. Así que lo
primero es saber cuál toca. Si por lo que pide no está claro, **pregúntalo antes de crear nada**:
abrir la carpeta en el repo equivocado se nota tres pasos después.

### 2. Comprobar que no hay ya una carpeta para ese tema

Mira `git worktree list` del repo. Si ya existe una del mismo tema, **entra en ella en vez de
crear otra**. Dos carpetas para lo mismo es el problema que esto viene a evitar.

### 3. Traer lo último y crear la carpeta

Se saca de `origin/main` recién bajado, no del main local, que casi siempre está por detrás:

```bash
git -C <repo> fetch origin main
git -C <repo> worktree add ~/Desktop/Shifty/Github/.worktrees/<repo>-<tema> -b <tipo>/<nombre> origin/main
```

`<tipo>` es `feature` para algo nuevo, `fix` para un arreglo, `docs` para documentación. El nombre
de la carpeta lleva delante el repo, como las que ya hay (`docs-cv-worker`, `sales-hoy-agenda`):
así se sabe de quién es cada una sin abrirla.

### 4. Trabajar ahí, y decirlo

A partir de aquí **todos los comandos van en esa carpeta**. Dilo en una línea: *"Te he abierto
una carpeta aparte para esto. Lo que hagamos aquí no toca nada de lo demás."*

### 5. Si pide otra cosa distinta

**Parar y avisar**, antes de editar nada: *"Esto es un tema aparte del de esta carpeta. ¿Lo
hacemos en otro chat para no mezclarlo?"*. Mezclar dos temas en una rama es lo que convierte una
revisión de diez minutos en una tarde.

---

## Modo CERRAR

Se dispara con "ciérralo", "ya está listo", "retira la carpeta".

### 1. Subirlo primero

**Esta skill no sube nada.** El trabajo va a GitHub con la skill `subir`, que verifica, commitea,
abre la PR y deja el enlace. Si aún no se ha hecho, se hace antes.

### 2. Comprobar que no queda nada dentro

Antes de retirar una carpeta, mirar las tres cosas, en este orden:

- Que no hay cambios sin guardar (`git status`).
- Que no hay commits que no estén subidos (`git log origin/<rama>..<rama>`).
- Que la PR está mergeada, o que Crescente sabe que aún no lo está.

**Si algo de eso falla, NO se retira la carpeta y se dice qué queda dentro.** Retirar una carpeta
con trabajo sin subir es la única forma de perder trabajo de verdad en este montaje.

### 3. Retirarla

```bash
git -C <repo> worktree remove ~/Desktop/Shifty/Github/.worktrees/<repo>-<tema>
git -C <repo> branch -d <tipo>/<nombre>
```

Y confirmar en una línea: *"Cerrado y carpeta retirada. No quedaba nada dentro."*

---

## Higiene: las carpetas no se acumulan

Cada carpeta viva es una copia entera del repo y una oportunidad de trabajar en el sitio
equivocado. A 18 de septiembre de 2026 había **nueve** abiertas.

Cuando te lo pidan, o al cerrar un tema, repasa las que hay: para cada una, si su rama ya está
mergeada en `origin/main` y no tiene nada sin guardar, **propón retirarla** diciendo de qué era.
Nunca retires una sin decir cuál y por qué.

---

## Lo que no hace esta skill

- **No sube nada a GitHub.** Eso es `subir`.
- **No pone al día una carpeta ya abierta.** Eso es `actualizar`.
- **No decide si el trabajo está bien.** Antes de cada commit va `/code-review` sobre lo
  modificado, y ese paso no se salta.
