#!/usr/bin/env bash
# Candado de rama de Shifty — impide editar estando en `main`.
#
# Se ejecuta como hook PreToolUse de edicion (.claude/settings.json de cada repo y de la carpeta
# contenedora). La regla que protege es la del flujo de trabajo: **rama antes de tocar codigo,
# nunca sobre main**.
#
# ╔══════════════════════════════════════════════════════════════════════════════════════════╗
# ║ ⚠️ MIRA EL ARCHIVO, NO LA CARPETA DE LA SESION                                            ║
# ║                                                                                           ║
# ║ El candado que habia en Web-Panel preguntaba `git branch --show-current` en el directorio ║
# ║ de la sesion. Con nueve carpetas aisladas vivas en `.worktrees/`, eso falla de dos formas: ║
# ║                                                                                           ║
# ║   1. La sesion abre la carpeta contenedora (que no es un repositorio) o un repo que esta   ║
# ║      en main, y frena ediciones de archivos que estan en OTRA carpeta, ya en su rama.      ║
# ║   2. Al reves: la sesion esta en una carpeta aislada con su rama, edita un archivo de un   ║
# ║      repo que si esta en main, y el candado lo deja pasar.                                 ║
# ║                                                                                           ║
# ║ Ademas frenaba el unico trabajo legitimo que se hace sobre main: resolver un conflicto al  ║
# ║ integrar. Y saltaba al escribir en la memoria del agente (`~/.claude/`), que no esta en    ║
# ║ ningun repositorio.                                                                        ║
# ╚══════════════════════════════════════════════════════════════════════════════════════════╝
#
# Lo que hace, en orden:
#   · Mira el ARCHIVO que se va a tocar, no donde este la sesion.
#   · Si el archivo no esta en un repositorio de git, lo deja pasar. La carpeta contenedora
#     `~/Desktop/Shifty/Github/` no es un repositorio: lo que este suelto ahi no es asunto suyo.
#   · Si en esa copia hay una integracion a medias (merge, rebase o cherry-pick), lo deja pasar:
#     resolver un conflicto es trabajo legitimo sobre main.
#   · Si esa copia no esta en `main`, lo deja pasar.
#   · Si esta en `main` y es la copia PRINCIPAL del repo, bloquea y NO le cambia la rama.
#     Cambiarsela seria arrastrar a main el trabajo de cualquier otro chat que la comparta.
#   · Si esta en `main` y es una carpeta aislada, ahi si le crea rama y la cambia: esa carpeta
#     es de un solo tema y de usar y tirar, asi que no se pisa nada de nadie.
#
# Si algo falla o no se puede averiguar, DEJA PASAR (exit 0). Un candado que bloquea por no
# saber es un candado que alguien acaba desactivando entero.

entrada=$(cat)

# Codex entrega todos los cambios de apply_patch dentro de tool_input.command, no en file_path.
# Se revisa CADA ruta del parche reutilizando este mismo candado, sin duplicar la regla.
herramienta=$(printf '%s' "$entrada" | jq -r '.tool_name // empty' 2>/dev/null)
if [ "$herramienta" = "apply_patch" ]; then
  parche=$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty' 2>/dev/null)
  cwd_hook=$(printf '%s' "$entrada" | jq -r '.cwd // empty' 2>/dev/null)
  while IFS= read -r ruta; do
    [ -z "$ruta" ] && continue
    if [[ "$ruta" != /* ]] && [ -n "$cwd_hook" ]; then
      ruta="$cwd_hook/$ruta"
    fi
    printf '%s' "$ruta" | jq -Rs '{tool_input:{file_path:.}}' | bash "$0" || exit $?
  done < <(printf '%s\n' "$parche" | awk '/^\*\*\* (Update File|Add File|Delete File|Move to): / { sub(/^\*\*\* (Update File|Add File|Delete File|Move to): /, ""); print }')
  exit 0
fi

# La ruta del archivo, segun la herramienta. NotebookEdit usa otro nombre para lo mismo.
archivo=$(printf '%s' "$entrada" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)

# En Codex y en algunas herramientas la ruta puede venir relativa al cwd de la llamada.
cwd_hook=$(printf '%s' "$entrada" | jq -r '.cwd // empty' 2>/dev/null)
if [[ "$archivo" != /* ]] && [ -n "$archivo" ] && [ -n "$cwd_hook" ]; then
  archivo="$cwd_hook/$archivo"
fi

[ -z "$archivo" ] && exit 0

# La carpeta desde la que preguntarle a git: la del archivo si existe, y si no la primera carpeta
# existente hacia arriba (al crear un archivo nuevo, su carpeta puede no existir todavia).
dir=$(dirname "$archivo")
while [ ! -d "$dir" ] && [ "$dir" != "/" ] && [ "$dir" != "." ]; do
  dir=$(dirname "$dir")
done
[ -d "$dir" ] || exit 0

# ¿Esta el archivo dentro de un repositorio? Si no, no es asunto de este candado.
git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

git_dir=$(git -C "$dir" rev-parse --absolute-git-dir 2>/dev/null) || exit 0
comun=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0

# Integracion a medias: merge, rebase o cherry-pick. Se deja pasar.
if [ -e "$comun/MERGE_HEAD" ] || [ -e "$comun/CHERRY_PICK_HEAD" ] ||
  [ -d "$comun/rebase-merge" ] || [ -d "$comun/rebase-apply" ] ||
  [ -e "$git_dir/MERGE_HEAD" ] || [ -e "$git_dir/CHERRY_PICK_HEAD" ] ||
  [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
  exit 0
fi

rama=$(git -C "$dir" branch --show-current 2>/dev/null)
[ "$rama" = "main" ] || exit 0

raiz=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)
proyecto=$(basename "$raiz")

# ¿Es la copia PRINCIPAL del repo? En la principal, el directorio de git y el comun son el mismo;
# en una carpeta aislada, el suyo cuelga de `.git/worktrees/<nombre>`.
if [ "$git_dir" = "$comun" ]; then
  cat >&2 <<AVISO
BLOQUEADO: '$proyecto' esta en main y nunca se edita codigo sobre main.
Archivo: $archivo

No te he cambiado la rama a proposito: esa carpeta la puede estar compartiendo otro chat, y
moverla de rama por debajo se lleva por delante su trabajo.

Dos salidas, por orden de preferencia:

  1. Abrir una carpeta aparte para este tema (lo hace la skill 'rama'):
     git -C "$raiz" worktree add ../.worktrees/<tema> -b <tipo>/<nombre> main

  2. Si esta carpeta es tuya y no la comparte nadie, crear la rama aqui:
     git -C "$raiz" switch -c <tipo>/<nombre>

...con <tipo> = feature, fix o docs. Despues repite la edicion.

Si lo que hacias era RESOLVER UN CONFLICTO de una integracion, no te habria frenado: eso si es
trabajo de main y el candado lo deja pasar.
AVISO
  exit 2
fi

# Carpeta aislada que, por lo que sea, esta en main. Ahi si conviene sacarla de main sola: esa
# carpeta es de un solo tema y de usar y tirar.
nueva="wip/$(date +%Y%m%d-%H%M%S)-$RANDOM"
if git -C "$dir" switch -c "$nueva" >/dev/null 2>&1; then
  cat >&2 <<AVISO
Esta carpeta aislada estaba en main (ahi nunca se edita). Le he creado la rama '$nueva' y la he
cambiado a ella. Repite la edicion: ahora ira a esa rama.

Ponle un nombre con sentido en cuanto sepas el tema:  git branch -m <tipo>/<nombre-real>
AVISO
  exit 2
fi

cat >&2 <<AVISO
Esta carpeta aislada esta en main y no he podido crearle una rama sola. Creala a mano antes de
editar:  git switch -c <tipo>/<nombre-real>
AVISO
exit 2
