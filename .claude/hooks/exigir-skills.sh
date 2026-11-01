#!/usr/bin/env bash
# Guardia de skills de Shifty: no deja tocar nada sin haber cargado antes la skill que toca.
#
# Nace el 13-10-2026 por una frase de Crescente: "que la guardia asegure que siempre se llame a la
# skill necesaria para garantizar calidad y robustez y que no rompa nada". Hasta ese dia las skills
# se cargaban solo si el agente se acordaba, por su descripcion: casi siempre, pero no siempre. Y lo
# que se rompe sale justo de ese "no siempre".
#
# Como lo sabe: lee la conversacion de la sesion (transcript_path) y mira si la skill ya se cargo
# con la herramienta Skill, o si Crescente la lanzo con su barra. Si no esta, FRENA (exit 2) y dice
# cual cargar. Cargarla cuesta un paso; no cargarla es como se rompen cosas sin enterarse.
#
# Que pide y cuando (la tabla de "si vas a tocar X, lee antes Y" de las reglas comunes):
#   · Editar codigo que YA existe en la app unica (Worker-App) o en el panel (Web-Panel):
#       shifty-codigo-limpio y mapa-de-impacto. Un fichero nuevo, solo shifty-codigo-limpio.
#   · Editar el repo Docs: shifty-mantener-las-reglas.
#   · Cambiar la base (crear o cambiar funciones, vistas, tablas, politicas, disparadores):
#       shifty-base-de-datos; si cambia algo que ya existe, ademas mapa-de-impacto y regresion;
#       si toca tablas, politicas o permisos, ademas shifty-seguridad.
#   · Desplegar una funcion del servidor: mapa-de-impacto y regresion.
#   · Hacer un commit: code-review, y cargado DESPUES de la ultima edicion (las reglas: "antes de
#     cada commit, /code-review sobre lo modificado. Este paso no se salta").
#
# Lo que NO frena: leer, consultar la base, funciones temporales (pg_temp, las de la skill
# regresion), la memoria del agente, ficheros fuera de ~/Desktop/Shifty/Github.
#
# Si algo no se puede averiguar (no hay conversacion que leer, Codex, un error), DEJA PASAR. Un
# guardia que frena por no saber es un guardia que alguien acaba desactivando entero.

entrada=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

herramienta=$(printf '%s' "$entrada" | jq -r '.tool_name // empty' 2>/dev/null)
conversacion=$(printf '%s' "$entrada" | jq -r '.transcript_path // empty' 2>/dev/null)
[ -n "$herramienta" ] || exit 0
[ -n "$conversacion" ] && [ -r "$conversacion" ] || exit 0

RAIZ="$HOME/Desktop/Shifty/Github"

# --- 1. Que skills hacen falta para esta accion -------------------------------------------------
necesarias=()
motivo=""

repo_de() {  # nombre del repo de GitHub de una carpeta, o vacio
  local dir="$1"
  [ -d "$dir" ] || dir=$(dirname "$dir")
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
  git -C "$dir" remote get-url origin 2>/dev/null | sed -E 's#.*/##; s#\.git$##'
}

case "$herramienta" in
  Edit|MultiEdit|Write|NotebookEdit)
    archivo=$(printf '%s' "$entrada" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
    [ -n "$archivo" ] || exit 0
    case "$archivo" in "$RAIZ"/*) ;; *) exit 0 ;; esac
    repo=$(repo_de "$archivo")
    case "$repo" in
      Worker-App|Web-Panel)
        case "$archivo" in
          *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.sql)
            case "$archivo" in */agent_docs/*|*/.claude/*|*/node_modules/*) exit 0 ;; esac
            necesarias=(shifty-codigo-limpio)
            if [ -e "$archivo" ]; then necesarias+=(mapa-de-impacto); fi
            motivo="vas a tocar codigo de $repo" ;;
          *) exit 0 ;;
        esac ;;
      Docs)
        necesarias=(shifty-mantener-las-reglas)
        motivo="vas a tocar las reglas o la documentacion compartida" ;;
      *) exit 0 ;;
    esac ;;

  mcp__*__apply_migration|mcp__*__execute_sql)
    sql=$(printf '%s' "$entrada" | jq -r '.tool_input.query // empty' | tr '[:upper:]' '[:lower:]')
    [ -n "$sql" ] || exit 0
    # Lo temporal de la skill regresion no cuenta: desaparece solo y no lo usa nadie.
    sql_limpio=$(printf '%s' "$sql" | sed -E 's/create (or replace )?function pg_temp\.[a-z0-9_]+//g')
    if printf '%s' "$sql_limpio" | grep -Eq '(^|[^a-z_])(create (or replace )?(function|procedure|view|materialized view|trigger)|alter (function|table|view|policy)|create (unique )?(table|policy|index)|drop|rename|grant|revoke)[[:space:]]'; then
      necesarias=(shifty-base-de-datos)
      motivo="vas a cambiar la estructura de la base"
      if printf '%s' "$sql_limpio" | grep -Eq '(^|[^a-z_])(create or replace|alter|drop|rename)[[:space:]]'; then
        necesarias+=(mapa-de-impacto regresion)
        motivo="vas a cambiar algo de la base que ya existe y que otros pueden estar usando"
      fi
      if printf '%s' "$sql_limpio" | grep -Eq '(^|[^a-z_])(create table|alter table|create policy|alter policy|grant|revoke|row level security)[[:space:]]'; then
        necesarias+=(shifty-seguridad)
      fi
    else
      exit 0
    fi ;;

  mcp__*__deploy_edge_function)
    necesarias=(mapa-de-impacto regresion)
    motivo="vas a desplegar una funcion del servidor, que reemplaza entera la que hay en produccion" ;;

  Bash)
    comando=$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty')
    printf '%s' "$comando" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]]|$)' || exit 0
    necesarias=(code-review)
    motivo="vas a hacer un commit, y antes de cada commit va la revision de lo modificado" ;;

  *) exit 0 ;;
esac

[ ${#necesarias[@]} -gt 0 ] || exit 0

# --- 2. Cuales ya se han cargado en esta sesion ---------------------------------------------------
faltan=$(python3 - "$conversacion" "$RAIZ" "${necesarias[@]}" <<'PY' 2>/dev/null
import json, re, sys
ruta, raiz, necesarias = sys.argv[1], sys.argv[2], sys.argv[3:]
ultima_carga = {}      # skill -> numero de linea de la ultima vez que se cargo
ultima_edicion = -1    # ultima edicion de un fichero de Shifty
with open(ruta, encoding="utf-8", errors="replace") as f:
    for n, linea in enumerate(f):
        if '"Skill"' not in linea and 'command-name' not in linea and '"Edit"' not in linea \
           and '"Write"' not in linea and '"MultiEdit"' not in linea:
            continue
        try:
            d = json.loads(linea)
        except Exception:
            continue
        msg = d.get("message") or {}
        cont = msg.get("content")
        if isinstance(cont, str):
            for m in re.finditer(r"<command-name>/?([\w:.-]+)</command-name>", cont):
                ultima_carga[m.group(1).split(":")[-1]] = n
            continue
        if not isinstance(cont, list):
            continue
        for b in cont:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "text":
                for m in re.finditer(r"<command-name>/?([\w:.-]+)</command-name>", b.get("text", "")):
                    ultima_carga[m.group(1).split(":")[-1]] = n
            if b.get("type") != "tool_use":
                continue
            entrada = b.get("input") or {}
            if b.get("name") == "Skill" and entrada.get("skill"):
                ultima_carga[str(entrada["skill"]).split(":")[-1]] = n
            elif b.get("name") in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
                p = entrada.get("file_path") or entrada.get("notebook_path") or ""
                if p.startswith(raiz):
                    ultima_edicion = n
faltan = []
for s in necesarias:
    if s not in ultima_carga:
        faltan.append(s)
    elif s == "code-review" and ultima_carga[s] < ultima_edicion:
        faltan.append(s + " (otra vez: has editado despues de la ultima revision)")
print("\n".join(faltan))
PY
) || exit 0

[ -n "$faltan" ] || exit 0

cat >&2 <<AVISO
Guardia de skills: antes de esto falta cargar, con la herramienta Skill:

$(printf '%s\n' "$faltan" | sed 's/^/  · /')

Motivo: $motivo. Las skills son las que dicen como hacerlo sin romper nada (la tabla "si vas a
tocar X, lee antes Y" de las reglas comunes). Cargalas, sigue lo que dicen, y vuelve a intentarlo.
AVISO
exit 2
