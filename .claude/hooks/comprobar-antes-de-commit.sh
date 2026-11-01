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

# ¿En que repositorio? Manda el `-C <ruta>` del commit; si no hay, un `cd <ruta>` del comando; si
# no, el directorio de la sesion.
sin_comillas() { sed -E "s/^[\"']//; s/[\"']$//"; }
repo=$(printf '%s' "$comando" | grep -oE 'git[[:space:]]+-C[[:space:]]+[^[:space:]]+([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit' \
  | sed -nE 's/^git[[:space:]]+-C[[:space:]]+([^[:space:]]+).*/\1/p' | head -1 | sin_comillas)
[ -z "$repo" ] && repo=$(printf '%s' "$comando" | sed -nE 's/(^|.*[;&|[:space:]])cd[[:space:]]+([^;&|[:space:]]+).*/\2/p' | head -1 | sin_comillas)
cwd_sesion=$(printf '%s' "$entrada" | jq -r '.cwd // empty' 2>/dev/null)
if [ -n "$repo" ] && [[ "$repo" != /* ]] && [ -n "$cwd_sesion" ]; then repo="$cwd_sesion/$repo"; fi
[ -z "$repo" ] && repo="$cwd_sesion"
[ -z "$repo" ] && exit 0
[ -d "$repo" ] || exit 0
git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# ⚠️ EL HUECO QUE TENIA HASTA EL 2026-10-10: el hook salta ANTES de que corra el comando, asi que
# ⚠️ en `git add x && git commit` (la forma normal de commitear de un agente) o en `commit -a`, lo
# ⚠️ preparado todavia no incluye x, y el candado miraba un indice vacio: dejaba pasar hasta una
# ⚠️ clave de servicio. Ahora se ensaya el `git add` del propio comando sobre una COPIA del indice
# ⚠️ (no toca el de verdad) y se mira eso. Solo se ensaya un `git add` sin `$`, comillas
# ⚠️ invertidas, redirecciones ni subcomandos: lo demas no se ejecuta nunca desde aqui.
indice_real=$(git -C "$repo" rev-parse --path-format=absolute --git-path index 2>/dev/null)
ensayo=$(mktemp 2>/dev/null) || ensayo=""
trap '[ -n "$ensayo" ] && rm -f "$ensayo"' EXIT
if [ -n "$ensayo" ] && [ -n "$indice_real" ]; then
  if [ -f "$indice_real" ]; then cp "$indice_real" "$ensayo"; else rm -f "$ensayo"; fi
  ensayado=0
  while IFS= read -r trozo; do
    trozo=$(printf '%s' "$trozo" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    if printf '%s' "$trozo" | grep -qE '^git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+add([[:space:]]|$)' &&
       ! printf '%s' "$trozo" | grep -q '[`$<>()]'; then
      argumentos=$(printf '%s' "$trozo" | sed -E 's/^git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+add//')
      ( cd "$repo" && eval "set -- $argumentos" && GIT_INDEX_FILE="$ensayo" git add "$@" ) >/dev/null 2>&1 && ensayado=1
    elif printf '%s' "$trozo" | grep -qE '^git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]].*)?[[:space:]](-[a-zA-Z]*a[a-zA-Z]*|--all)([[:space:]]|$)'; then
      GIT_INDEX_FILE="$ensayo" git -C "$repo" add -u >/dev/null 2>&1 && ensayado=1
    fi
  done < <(printf '%s\n' "$comando" | awk '{ gsub(/&&|\|\||;/, "\n"); print }')
  if [ "$ensayado" = 1 ]; then export GIT_INDEX_FILE="$ensayo"; fi
fi

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

  # Lo que encontro la auditoria del 2026-10-09 (shared/PLAN-UNA-LOGICA-UN-SITIO.md): sitios donde
  # una pantalla decide o escribe lo que deberia decidir la base.
  # ⚠️ Escrituras directas a tablas operativas (regla 3): sin RPC no queda rastro, y ya habia dos
  # ⚠️ caminos para cambiar la comision, uno sin motivo ni rastro.
  printf '%s' "$anadido" | grep -qE "\.from\([[:space:]]*['\"](shifts|job_days|job_days_candidates|job_offers|companies|cost_centers|workers|worker_documents|company_worker_blocks|cost_center_contracts|payers)['\"][[:space:]]*\)[[:space:]]*\.(update|insert|delete|upsert)\(" &&
    apunta_duda "Escribes directamente en una tabla operativa desde el codigo. Se usa la RPC, que deja rastro en activity_log (regla 3). Mira shared/FUENTES-UNICAS.md por si ya existe."
  # ⚠️ Decisiones que viajan como parametro: la pantalla decide si un cierre queda en revision o
  # ⚠️ que es "cancelar tarde", y cada pantalla decidia distinto.
  printf '%s' "$anadido" | grep -qE "p_is_disputed[[:space:]]*:|p_min_hours(_for_compensation)?[[:space:]]*:" &&
    apunta_duda "Mandas desde la pantalla una decision que es de la base (si un cierre queda en revision, o el umbral de cancelacion tardia). Lo decide fn_shift_close_disputes / fn_late_cancel_compensation."
  # ⚠️ El coeficiente escrito a mano: el dia que se negocie otro, el contrato y los simuladores mienten.
  printf '%s' "$anadido" | grep -qE "1[.,]505|COEF_ETT|MADRID_COEFFICIENT" &&
    apunta_duda "Escribes el coeficiente a mano (1,505). Se lee el de la empresa (company_coefficients / fn_company_base_coefficient)."
fi

# ── 6. DUPLICADOS DEL FINDER ─────────────────────────────────────────────────────────────────
# "Fichero 2.tsx": macOS los crea al copiar. El 2026-10-09 habia 12 dentro de main, uno de ellos
# distinto del original, y nadie sabia cual era el bueno.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  printf '%s' "$(basename "$f")" | grep -qE ' [0-9]+\.[A-Za-z]+$' &&
    apunta_duda "$f es una copia del Finder (nombre acabado en ' 2'). Si es lo bueno, ponle su nombre; si no, no la commitees."
done <<< "$preparados"

# ── 7. LLAMADAS A UNA IA SIN FRENO DE GASTO ──────────────────────────────────────────────────
# El 2026-10-09 un barrido reintento sin limite y llamo a Gemini 8.863 veces en un dia, sin que
# nada lo parara ni avisara. Desde entonces toda llamada a un proveedor de IA pasa por los helpers
# compartidos, que consultan el presupuesto antes y apuntan el gasto despues: callLlm/embedTexts
# (_shared/llm.ts), fetchIa o conPresupuestoIa (_shared/ia-gasto.ts). Una llamada con fetch a pelo
# se salta los dos.
#   · FRENA: una linea nueva que hace fetch( directamente contra un proveedor de IA.
#   · PREGUNTA: un fichero que nombra un proveedor o su SDK y no usa ningun helper (puede ser una
#     consulta que no cuesta, como listar modelos; o puede ser una llamada por una constante).
ia_hosts='generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.x\.ai|api\.groq\.com|api\.mistral\.ai|openrouter\.ai|api\.deepseek\.com|api\.cohere\.'
ia_sdk='new (GoogleGenAI|GoogleGenerativeAI|OpenAI|Anthropic)\(|(npm:|esm\.sh/|jsr:)(@google/genai|@google/generative-ai|openai|@anthropic-ai/sdk)'
ia_helpers='fetchIa\(|conPresupuestoIa\(|callLlm\(|embedTexts\('
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *_test.ts|*_test.js|*.test.ts|*.test.tsx|*/_shared/llm.ts|*/_shared/ia-gasto.ts) continue ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs) : ;;
    *) continue ;;
  esac
  nuevas=$(git -C "$repo" diff --cached -U0 -- "$f" 2>/dev/null | grep '^+' | grep -v '^+++')
  [ -z "$nuevas" ] && continue
  if printf '%s' "$nuevas" | grep -E "$ia_hosts" | grep -E '(^|[^A-Za-z_])fetch\(' | grep -vqE 'fetchIa\('; then
    apunta_freno "$f llama a un proveedor de IA con fetch directo. Usa fetchIa (mismo uso que fetch) de _shared/ia-gasto.ts, o callLlm de _shared/llm.ts: sin eso no hay tope de gasto ni registro, que es como se escapo el gasto del 09-10-2026."
  elif printf '%s' "$nuevas" | grep -qE "$ia_hosts|$ia_sdk"; then
    git -C "$repo" show ":$f" 2>/dev/null | grep -qE "$ia_helpers" ||
      apunta_duda "$f nombra un proveedor de IA (o su SDK) y no usa ningun helper con freno de gasto. Si llama al modelo, que sea con fetchIa, conPresupuestoIa o callLlm (skill shifty-codigo-limpio, 'Llamar a una IA'). Si solo lista modelos, sigue."
  fi
done <<< "$preparados"

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
