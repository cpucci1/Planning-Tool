#!/usr/bin/env bash
# Vigilante de funciones y tablas de Shifty: lo que piden las reglas, en el momento de desplegar.
#
# Se ejecuta como hook PostToolUse sobre las herramientas de Supabase que ejecutan SQL
# (`apply_migration` y `execute_sql`). Si lo que se acaba de lanzar crea o cambia una función, una
# tabla, una vista o una columna, le dice al agente, en ese mismo momento, la consulta EXACTA que
# tiene que pasar, con los nombres ya puestos:
#
#   select * from fn_review_function('nombre');   -- una sola firma, comentario, search_path, anon,
#                                                 -- quién llama, copias a mano, plpgsql_check,
#                                                 -- historial y funciones parecidas
#   select * from fn_review_table('nombre');      -- comentario y las cuatro preguntas, RLS, política,
#                                                 -- índices, anon, columnas, tipos, nombres, parecidas
#
# POR QUE EXISTE
# El candado de commit vigila el código de las apps, pero **la base no pasa por ningún commit**: se
# aplica por MCP. Y es donde más crece: 403 funciones nuevas en septiembre de 2026 y 190 en los diez
# primeros días de octubre. Una regla que depende de que alguien se acuerde no es una regla.
#
# POR QUE NO LLEVA LOS PATRONES DENTRO (cambiado el 2026-10-10)
# Hasta el 10-10 este fichero buscaba con sus propias expresiones las copias a mano (quién llama, la
# comisión, el Gold...). Eran OTRA lista distinta de la del trinquete: no miraba la zona horaria ni
# el INSERT a activity_log, y en un día subieron 3 + 9 cifras del trinquete sin que dijera nada.
# Ahora los patrones viven en un solo sitio, la base (fn_logic_duplication_flags), y este vigilante
# solo dice qué comprobar. Una lógica, un sitio, también para los guardias.
#
# POR QUE AVISA DESPUES Y NO FRENA ANTES
# A propósito. Mucho de lo que se despliega es modificar una función vieja que ya traía su copia a
# mano; frenar ahí obligaría a reescribirla entera en cada retoque, que es lo que más rompe. No
# frena ni le pregunta a Crescente: le habla al agente, que es quien tiene que corregirlo.
#
# Nunca frena por no saber: si algo falla, sale callado.

entrada=$(cat)
sql=$(printf '%s' "$entrada" | jq -r '.tool_input.query // empty' 2>/dev/null)
[ -z "$sql" ] && exit 0

# Solo la base de Shifty tiene las funciones de revisión. freetools (Planning-Tool) no.
proyecto=$(printf '%s' "$entrada" | jq -r '.tool_input.project_id // .tool_input.project_ref // empty' 2>/dev/null)
[ "$proyecto" = "wabnolojhxlqhevehybw" ] && exit 0

# Si la llamada falló, no hay nada desplegado de lo que avisar.
printf '%s' "$entrada" | jq -e '.tool_response | tostring | test("ERROR:")' >/dev/null 2>&1 && exit 0

# Se quitan los comentarios de línea: un "-- create table x" no es una tabla.
limpio=$(printf '%s' "$sql" | sed -e 's/--.*$//')

# Los nombres, sin esquema ni comillas, sin repetir. $1 = expresión hasta justo antes del nombre.
nombres_de() {
  printf '%s' "$limpio" | grep -oiE "$1"'("?public"?\.)?"?[a-zA-Z0-9_]+' \
    | sed -E 's/.*[ ."]([a-zA-Z0-9_]+)$/\1/' | tr 'A-Z' 'a-z' | sort -u
}
ws='[[:space:]]+'
funciones=$(nombres_de "create${ws}(or${ws}replace${ws})?(function|procedure)${ws}")
tablas=$( { nombres_de "create${ws}(unlogged${ws})?table${ws}(if${ws}not${ws}exists${ws})?"
            nombres_de "create${ws}(or${ws}replace${ws})?(materialized${ws})?view${ws}(if${ws}not${ws}exists${ws})?"
            nombres_de "alter${ws}table${ws}(if${ws}exists${ws})?(only${ws})?" ; } | sort -u)

# Nada que revisar: sale sin coste.
[ -z "$funciones" ] && [ -z "$tablas" ] && exit 0

consulta=""
une() { [ -n "$consulta" ] && consulta="$consulta
union all "; consulta="${consulta}$1"; }
for f in $funciones; do une "select '$f' as que, * from fn_review_function('$f')"; done
for t in $tablas;    do une "select '$t' as que, * from fn_review_table('$t')"; done

que=""
[ -n "$funciones" ] && que="las funciones $(printf '%s' "$funciones" | paste -sd ',' - | sed 's/,/, /g')"
[ -n "$tablas" ] && que="${que:+$que y }las tablas o vistas $(printf '%s' "$tablas" | paste -sd ',' - | sed 's/,/, /g')"

mensaje="Acabas de crear o cambiar $que.

Antes de seguir, pasa esta revisión (una sola llamada, solo lee) y arregla lo que salga en fail:

$consulta;

Comprueba también el consumidor WhatsApp empresarial: select public.whatsapp_company_contract_status();
Si una capacidad queda pendiente de revisión, aplica mapa-de-impacto y regresion con sus pruebas antes de aprobar una nueva huella. No copies reglas al prompt ni actualices la huella solo para quitar el bloqueo. Ver features/bot-empresas-whatsapp.md.

fail = se arregla ahora. look = se lee y se decide (funciones o tablas parecidas: si ya existía una que hace lo mismo, se extiende esa y no se deja un gemelo). Si es una función vieja que ya traía una copia a mano y solo la estás retocando, no la reescribas entera: apúntalo en shared/PENDIENTE.md. Al cerrar, cuenta qué salió."

jq -nc --arg m "$mensaje" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}'
exit 0
