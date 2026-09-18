#!/usr/bin/env bash
# Guardia de base de datos de Shifty.
#
# Se ejecuta como hook PreToolUse sobre las herramientas de Supabase (.claude/settings.json).
# Hace dos cosas distintas, y conviene no confundirlas:
#
#   1. COMPRUEBA A QUE BASE VA la llamada. Si el proyecto no es uno de los nuestros, la corta.
#   2. Si la llamada ESCRIBE en produccion, pide confirmacion antes de lanzarla. Es la regla de
#      las comunes escrita en piedra: "se puede sin preguntar SELECT y lectura de catalogos;
#      necesita permiso cualquier DDL, cualquier mutacion de produccion, RLS, triggers y crons".
#      Hasta hoy esa regla dependia de que el agente se acordara.
#
# ⚠️ POR QUE HACE FALTA
# Hay mas de una base en juego y todas responden igual de bien a una consulta suelta:
#   · brgswggayexbvrnqtlhp — Shifty, PRODUCCION. La comparten los seis proyectos.
#   · wabnolojhxlqhevehybw — freetools, la del Planning-Tool. Otra cuenta, no sale ni al listar
#     los proyectos de la organizacion de Shifty.
#   · qloeameavowaoojyckum — Work Level. Es OTRA empresa: tiene `workers`, `shifts` y
#     `job_offers` con los mismos nombres, asi que una consulta parece funcionar y devuelve datos
#     con buena pinta. Leer de ahi ya son datos personales ajenos; escribir seria tocar su
#     produccion.
#
# ⚠️ ES LA ULTIMA RED, NO LA PRIMERA. No sustituye a comprobar a que base vas.
#
# Si algo falla o no se puede averiguar, DEJA PASAR (exit 0), salvo cuando el proyecto viene
# escrito y es uno ajeno: eso siempre se corta.

entrada=$(cat)
herramienta=$(printf '%s' "$entrada" | jq -r '.tool_name // empty' 2>/dev/null)

# Las bases nuestras. Si algun dia hay una mas, se anade AQUI y en ningun otro sitio.
PRODUCCION="brgswggayexbvrnqtlhp"   # Shifty, produccion. Seis proyectos contra ella.
FREETOOLS="wabnolojhxlqhevehybw"    # freetools, solo Planning-Tool. No toca produccion.

# El proyecto, se llame como se llame en cada herramienta.
proyecto=$(printf '%s' "$entrada" | jq -r '
  .tool_input.project_id // .tool_input.project_ref // .tool_input.projectId // empty
' 2>/dev/null)

# ── 1. ¿Es nuestra la base? ───────────────────────────────────────────────────────────────────
if [ -n "$proyecto" ]; then
  case "$proyecto" in
    "$PRODUCCION" | "$FREETOOLS") : ;;
    qloeameavowaoojyckum)
      cat >&2 <<AVISO
BLOQUEADO: '$proyecto' es la base de WORK LEVEL, que es otra empresa.

Tiene workers, shifts y job_offers con los mismos nombres que la nuestra, asi que la consulta
habria funcionado y habria devuelto datos con buena pinta. Leer de ahi ya son datos personales
de otra plataforma; escribir seria tocar su produccion.

La de Shifty es $PRODUCCION. La del planificador, $FREETOOLS.
AVISO
      exit 2 ;;
    *)
      cat >&2 <<AVISO
BLOQUEADO: '$proyecto' no es ninguna base de Shifty.

Las nuestras son dos y solo dos:
  · $PRODUCCION — produccion, la que comparten los seis proyectos
  · $FREETOOLS — freetools, la del Planning-Tool, que NO toca produccion

Comprueba a que proyecto apunta la conexion que estas usando antes de repetir la llamada.
Un .env o un documento solo prueban lo que alguien escribio aquel dia, no lo que existe hoy.
AVISO
      exit 2 ;;
  esac
fi

# ── 2. ¿Escribe en produccion? ────────────────────────────────────────────────────────────────
# Si el proyecto no viene escrito es porque viaja dentro de la conexion (asi esta configurada la
# de Worker-App, con el proyecto pegado en la URL). Ahi no se puede saber a cual va, asi que no
# se corta: cortar romperia todas las consultas de ese repo. Lo que si se hace es no dejar pasar
# una escritura sin que la vea una persona.
[ "$proyecto" = "$FREETOOLS" ] && exit 0   # freetools no es produccion: no molesta.

# El motivo se mete con jq y no pegando texto dentro de unas comillas: el dia que un motivo
# lleve una comilla o una barra, el JSON sale roto y el guardia deja de existir sin decirlo.
preguntar() {
  jq -nc --arg motivo "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$motivo}}'
  exit 0
}

case "$herramienta" in
  *apply_migration*)
    preguntar "Esto aplica una MIGRACION a la base compartida por los seis proyectos. Las reglas piden aprobacion por escrito describiendo el cambio exacto antes de cualquier DDL." ;;
  *deploy_edge_function*)
    preguntar "Un deploy reemplaza el bundle ENTERO de la funcion. El 2026-07-06 se perdio una semana de arreglos asi. Compara antes con lo que hay vivo en produccion." ;;
  *create_branch* | *delete_branch* | *merge_branch* | *reset_branch* | *rebase_branch* | *pause_project* | *restore_project*)
    preguntar "Esto opera sobre el PROYECTO de Supabase entero, no sobre una tabla. Confirma que es lo que quieres." ;;
  *execute_sql*)
    consulta=$(printf '%s' "$entrada" | jq -r '.tool_input.query // .tool_input.sql // empty' 2>/dev/null)
    [ -z "$consulta" ] && exit 0
    # Se quitan los comentarios antes de mirar: un `-- borrar esto` no es un DELETE.
    # ⚠️ `--` dentro de un texto entrecomillado se traga el resto de la linea. Es raro en el SQL
    # ⚠️ que escribimos, y el `[^\n]` que habia aqui antes era peor: no quitaba nada, asi que
    # ⚠️ cualquier comentario con la palabra "update" hacia preguntar por una consulta de lectura.
    limpia=$(printf '%s' "$consulta" | sed -e 's/--.*$//' -e 's|/\*[^*]*\*/||g')
    if printf '%s' "$limpia" | grep -qiE '(^|[^a-z_])(insert|update|delete|truncate|drop|alter|create|grant|revoke|comment[[:space:]]+on|refresh[[:space:]]+materialized)([^a-z_]|$)'; then
      preguntar "Esta consulta ESCRIBE o cambia el esquema, y va a la base compartida por los seis proyectos. Las reglas solo dan via libre a los SELECT. Lee la consulta antes de aprobarla."
    fi
    exit 0 ;;
esac

exit 0
