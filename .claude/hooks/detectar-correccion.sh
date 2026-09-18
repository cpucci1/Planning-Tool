#!/usr/bin/env bash
# Detector de correcciones de Shifty.
#
# Se ejecuta como hook UserPromptSubmit (.claude/settings.json). Lee el mensaje y, si contiene
# una frase de correccion, inyecta un recordatorio para que el agente aplique la skill `aprender`
# ANTES de seguir.
#
# Existe porque las reglas comunes dicen "cuando te corrija, persiste el aprendizaje en el
# momento" — y eso, sin esto, depende de que el modelo se acuerde justo cuando esta ocupado
# arreglando lo que hizo mal. Lo dispara el sistema, no la buena voluntad.
#
# Alta precision a proposito: solo frases inequivocas, para no hacer ruido. Nunca bloquea el
# turno (exit 0 siempre); como mucho anade contexto.

entrada=$(cat)
prompt=$(printf '%s' "$entrada" | jq -r '.prompt // empty' 2>/dev/null)
[ -z "$prompt" ] && exit 0

# Frases de correccion, con y sin acentos, y con las que usa Crescente dictando por voz.
patrones='está mal|esta mal|no funciona así|no funciona asi|así no funciona|asi no funciona|te equivocaste|te equivocas|te has equivocado|confundiste|has confundido|ya te lo dije|te lo dije|no es así|no es asi|eso no es|no era así|no era asi|estaba mal|apunta esto|apuntalo|apúntalo|aprende de esto|que no se te olvide|no vuelvas a|te lo he dicho|eso es mentira|no me inventes|te lo estas inventando|te lo estás inventando'

if printf '%s' "$prompt" | grep -iqE "$patrones"; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[Detector de correcciones] Puede que Crescente te este corrigiendo. Si lo es (regla de negocio, dato, flujo, calculo o comportamiento tuyo), aplica la skill aprender para dejarlo escrito en su sitio ANTES de continuar, y confirma donde lo dejaste. Recuerda que agent_docs/ y .claude/skills/ de los repos son copias: lo que escribas alli lo borra el siguiente sync. Todo va en el repo Docs. Si releyendo ves que NO es una correccion, ignora este aviso sin mencionarlo."}}'
fi
exit 0
