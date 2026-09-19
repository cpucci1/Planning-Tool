#!/usr/bin/env bash
# Candado de commit de Shifty.
#
# Se ejecuta como hook PreToolUse sobre Bash. Si el comando es un `git commit`, mira lo que hay
# preparado para entrar y frena lo que no debe entrar nunca. Si no es un commit, sale callado.
#
# POR QUE EXISTE: las reglas ya decian "nunca commitear un .env", "nada de notas.md ni de _v2",
# "cada ficha empieza con su estado". Eso dependia de que alguien se acordara **justo** en el
# momento de commitear, que es cuando menos se mira.
#
# DOS NIVELES, a proposito:
#   · FRENA (exit 2) lo que no tiene ninguna lectura buena: un secreto, un .env, un nombre de
#     fichero que delata basura. Son pocos y son inequivocos.
#   · PREGUNTA lo que huele mal pero puede tener explicacion: una ficha sin cabecera de estado,
#     una regla ya centralizada que se vuelve a escribir a mano. Ahi decide una persona.
#
# Nunca frena por no saber: si algo falla, deja pasar.

entrada=$(cat)
comando=$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$comando" ] && exit 0

# ¿Es un commit? Se mira asi de tonto a proposito: cualquier otra cosa sale sin coste.
printf '%s' "$comando" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit' || exit 0

# ¿En que repositorio? Si el comando trae `-C <ruta>`, esa manda; si no, el directorio de la sesion.
repo=$(printf '%s' "$comando" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+([^[:space:]]+).*/\1/p' | head -1)
[ -z "$repo" ] && repo=$(printf '%s' "$entrada" | jq -r '.cwd // empty' 2>/dev/null)
[ -z "$repo" ] && exit 0
[ -d "$repo" ] || exit 0
git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

preparados=$(git -C "$repo" diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
[ -z "$preparados" ] && exit 0

frenos=""
dudas=""
apunta_freno() { frenos="${frenos}  · $1"$'\n'; }
apunta_duda()  { dudas="${dudas}  · $1"$'\n'; }

# ── 1. FICHEROS DE ENTORNO ───────────────────────────────────────────────────────────────────
# Estan en .gitignore, pero un `git add -f` o un .gitignore mal puesto los cuela. Un secreto
# commiteado no se retira: se rota.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$(basename "$f")" in
    # Las plantillas SIN secretos si se commitean: son las que documentan que variables hacen falta.
    .env.example|.env.sample|.env.template|.env.dist) : ;;
    .env|.env.*|*.env) apunta_freno "$f es un fichero de entorno y no se commitea nunca." ;;
  esac
done <<< "$preparados"

# ── 2. SECRETOS DENTRO DEL CONTENIDO ─────────────────────────────────────────────────────────
# Patrones inequivocos, no heuristicas: una clave de servicio de Supabase, un token de GitHub,
# una clave de OpenAI o de Anthropic, una de AWS. Se mira lo que se ANADE, no el fichero entero.
anadido=$(git -C "$repo" diff --cached -U0 --diff-filter=ACMR 2>/dev/null | grep '^+' | grep -v '^+++')
if [ -n "$anadido" ]; then
  # service_role de Supabase: un JWT cuyo cuerpo dice service_role
  if printf '%s' "$anadido" | grep -qE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}'; then
    if printf '%s' "$anadido" | grep -oE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+' | while read -r t; do
         cuerpo=$(printf '%s' "$t" | cut -d. -f2)
         # base64url a base64, y se rellena
         cuerpo=$(printf '%s' "$cuerpo" | tr '_-' '/+')
         while [ $(( ${#cuerpo} % 4 )) -ne 0 ]; do cuerpo="${cuerpo}="; done
         printf '%s' "$cuerpo" | base64 -d 2>/dev/null | grep -q 'service_role' && echo ENCONTRADO
       done | grep -q ENCONTRADO; then
      apunta_freno "Hay una clave de SERVICIO de Supabase en lo que vas a commitear. Esa clave se salta toda la seguridad de la base."
    fi
  fi
  printf '%s' "$anadido" | grep -qE 'gh[pousr]_[A-Za-z0-9]{36}' && apunta_freno "Hay un token de GitHub en lo que vas a commitear."
  printf '%s' "$anadido" | grep -qE 'sk-(proj-)?[A-Za-z0-9_-]{32,}' && apunta_freno "Hay una clave de OpenAI en lo que vas a commitear."
  printf '%s' "$anadido" | grep -qE 'sk-ant-[A-Za-z0-9_-]{20,}' && apunta_freno "Hay una clave de Anthropic en lo que vas a commitear."
  printf '%s' "$anadido" | grep -qE 'AKIA[0-9A-Z]{16}' && apunta_freno "Hay una clave de AWS en lo que vas a commitear."
  printf '%s' "$anadido" | grep -qE 'xkeysib-[A-Za-z0-9]{32,}' && apunta_freno "Hay una clave de Brevo en lo que vas a commitear."
fi

# ── 3. NOMBRES QUE DELATAN BASURA ────────────────────────────────────────────────────────────
# "Nada de notas.md, temp.md, v2-final.md". Un fichero asi nunca se limpia solo.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  base=$(basename "$f")
  if printf '%s' "$base" | grep -qiE '^(notas|temp|tmp|borrador|untitled|prueba|copia|sin-titulo)\.(md|txt|sql|ts|tsx|js|jsx|json)$' ||
     printf '%s' "$base" | grep -qiE '[-_](final|v[0-9]+|copy|copia|old|new|bak|backup)\.(md|txt|sql|ts|tsx|js|jsx)$'; then
    apunta_freno "$f tiene nombre de fichero temporal o de version. Ponle el nombre de lo que es, o no lo commitees."
  fi
done <<< "$preparados"

# ── 4. FICHAS SIN CABECERA DE ESTADO ─────────────────────────────────────────────────────────
# Solo en el repo de documentacion. Una ficha sin estado ni fecha no se sabe si es verdad o
# arqueologia, y la que miente es peor que ninguna.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    docs/features/*.md)
      case "$(basename "$f")" in _*|README.md) continue ;; esac
      [ -f "$repo/$f" ] || continue
      if ! head -12 "$repo/$f" | grep -qiE 'estado'; then
        apunta_duda "$f no dice en que estado esta. Toda ficha empieza con su estado y la fecha en que se comprobo (ver features/_PLANTILLA.md)."
      fi ;;
  esac
done <<< "$preparados"

# ── 5. LOGICA YA CENTRALIZADA, ESCRITA OTRA VEZ A MANO ───────────────────────────────────────
# El error numero uno del proyecto. Estas reglas viven en UNA funcion cada una; si aparecen
# escritas a pelo en lo que entra, es que se esta creando la segunda copia.
if [ -n "$anadido" ]; then
  # ⚠️ Estos patrones piden que la LINEA nombre la cosa, no solo que haya un numero. Un
  # ⚠️ `opacity * 0.25` o un `expect(rating >= 4.3)` de un test no son la comision ni el Gold, y
  # ⚠️ preguntar en falso es lo que hace que alguien acabe desactivando el candado entero.
  printf '%s' "$anadido" | grep -qiE '(commission|comision)[a-z_]*[[:space:]]*[*/]|[*/][[:space:]]*[a-z_]*(commission|comision)' &&
    apunta_duda "Parece que estas calculando la comision a mano. La comision vive en fn_commission_pct y en ningun sitio mas."
  printf '%s' "$anadido" | grep -qiE 'gold' && printf '%s' "$anadido" | grep -qiE '(points_balance|rating)[[:space:]]*>=?[[:space:]]*[0-9]' &&
    apunta_duda "Parece que estas decidiendo quien es Gold a mano. Eso lo decide fn_is_gold, que redondea por dentro: doce copias daban resultados distintos."
  printf '%s' "$anadido" | grep -qiE 'night[_ ]?rate|nocturnidad' && printf '%s' "$anadido" | grep -qE '[*+][[:space:]]*1\.[0-9]' &&
    apunta_duda "Parece que estas calculando la tarifa de noche a mano. Eso lo hace fn_effective_hourly_rate."
fi

# ── El veredicto ─────────────────────────────────────────────────────────────────────────────
if [ -n "$frenos" ]; then
  { echo "BLOQUEADO: esto no puede entrar en un commit."
    echo ""
    printf '%s' "$frenos"
    echo ""
    echo "Quitalo de lo preparado (git restore --staged <fichero>) y vuelve a intentarlo."
    echo "Si es un secreto y YA estaba commiteado antes, no basta con borrarlo: hay que rotarlo."
  } >&2
  exit 2
fi

if [ -n "$dudas" ]; then
  jq -nc --arg m "Antes de commitear, mira esto:
$dudas
Si tiene explicacion, sigue. Si no, arreglalo primero." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$m}}'
fi
exit 0
