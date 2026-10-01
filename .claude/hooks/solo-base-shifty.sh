#!/usr/bin/env bash
# Guardia de base de datos de Shifty.
#
# Se ejecuta como hook PreToolUse sobre las herramientas de Supabase (.claude/settings.json).
# Hace dos cosas distintas, y conviene no confundirlas:
#
#   1. COMPRUEBA A QUE BASE VA la llamada. Si el proyecto no es uno de los nuestros, la corta.
#   2. Si la llamada BORRA algo en produccion, pide confirmacion antes de lanzarla. Solo borrar:
#      decision de Crescente del 2026-09-24, "solo pidelo si algo es eliminar, nada mas". Crear,
#      cambiar, desplegar y escribir pasan sin preguntar. Antes preguntaba por cualquier
#      escritura o DDL, y pedir aprobacion para todo le hacia aprobar sin leer.
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

# Se quitan los comentarios antes de mirar: un `-- borrar esto` no es un DELETE.
# ⚠️ `--` dentro de un texto entrecomillado se traga el resto de la linea. Es raro en el SQL que
# ⚠️ escribimos, y quitar de mas solo puede hacer que NO pregunte, nunca que pregunte de mas.
borra() {
  printf '%s' "$1" | sed -e 's/--.*$//' -e 's|/\*[^*]*\*/||g' \
    | grep -qiE '(^|[^a-z_])(delete|truncate|drop)([^a-z_]|$)'
}

case "$herramienta" in
  *apply_migration* | *execute_sql*)
    consulta=$(printf '%s' "$entrada" | jq -r '.tool_input.query // .tool_input.sql // empty' 2>/dev/null)
    [ -z "$consulta" ] && exit 0
    # ⚠️ Una funcion que se redefine y lleva un DELETE dentro de su cuerpo tambien pregunta: no se
    # ⚠️ distingue un borrado de ahora de uno que la funcion hara despues. Es raro y se prefiere
    # ⚠️ preguntar de mas en un borrado que de menos.
    if borra "$consulta"; then
      preguntar "Esto BORRA algo en la base compartida por los seis proyectos (DELETE, TRUNCATE o DROP). Lo que se borra no vuelve: lee que se borra antes de aprobarlo."
    fi
    exit 0 ;;
  *delete_branch* | *reset_branch*)
    preguntar "Esto BORRA una rama de Supabase o la devuelve a cero, con sus datos. Confirma que es lo que quieres." ;;
esac

exit 0
