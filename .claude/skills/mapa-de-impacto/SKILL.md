---
name: mapa-de-impacto
description: >-
  Antes de cambiar algo que otros usan, saca la lista de todo lo que depende de ello en la base, en
  las funciones del servidor, en la app única (lado trabajador y lado empresa) y en el panel web
  (web de empresas y web interna), y después del cambio comprueba esa lista punto por punto. Úsala
  SIEMPRE antes de cambiar, renombrar, marcar sin uso o cambiar lo que devuelve una función, una
  tabla, una columna, una vista, una función del servidor, un hook o un componente compartido, y
  cuando alguien diga "si toco esto qué se rompe", "quién usa esto", "a qué afecta" o "cambio esto
  sin romper nada". La comparación de resultados antes y después es la skill regresion.
---

# Mapa de impacto: quién depende de lo que vas a tocar

Nace el 13-10-2026 por una frase de Crescente: *"muevo una cosa en un sitio y se rompe otra cosa en
otro sitio"*. No es falta de documentación (hay más de 300 documentos y aun así pasa): es que nadie
mira, cada vez y de forma automática, quién depende de lo que se toca.

La regla de `shifty-codigo-limpio` §4 ya decía "busca todos los sitios que consumen lo que vas a
modificar". Esta skill es el **cómo**: dónde buscar, con qué, qué dejar escrito y qué comprobar
después. Sin el después, el mapa es papel.

## Qué se mira y qué no

Decidido por Crescente el 13-10-2026: **se mantiene la app única y las dos webs, no la app de
clientes vieja.**

| Sitio | Dónde está | Se mira |
|---|---|---|
| La base | Supabase de producción | Sí: funciones, vistas, disparadores, políticas, crons, valores por defecto, claves ajenas |
| Funciones del servidor (Edge Functions) | `Web-Panel/supabase/functions/` y lo desplegado en producción | Sí: bots (LucIA, soporte), crons que llaman a una función, IA, pagos |
| App única, lado trabajador | `Worker-App/` (todo menos `app-unused/`) | Sí |
| App única, lado empresa | `Worker-App/screens/empresa/` y `Worker-App/hooks/empresa/`, y lo que comparte con el lado trabajador | Sí |
| Web de empresas y web interna | `Web-Panel/src/` (son el mismo repo: la empresa entra por su acceso y el equipo por el interno o "ver como") | Sí |
| App de clientes vieja | `Client-App/` | **No.** Se deja fuera a propósito |
| Web pública y sales-tool | `Website/`, `Sales/sales-tool/` | Solo se avisa si aparecen en la búsqueda |

⚠️ Que la app vieja no se mire **no significa que se pueda romper la base que todavía lee**. Mientras
siga publicada, un cambio en lo que devuelve una función sigue siendo **compatible hacia atrás**
(paso 4). Lo que no se hace es adaptar sus pantallas.

## Paso 1. Nombrar exactamente lo que cambia

Antes de buscar, una línea: qué cambias y cómo. *"La función X deja de devolver la columna Y"*,
*"la tabla Z pasa a tener una fila por persona en vez de por turno"*, *"el componente W cambia la
forma en que recibe la fecha"*. Un cambio interno que no altera lo que se ve desde fuera tiene un
mapa mucho más corto que uno que cambia la forma de lo que se devuelve: dilo.

## Paso 2. La base, en una llamada

```sql
select * from fn_impact_map('nombre');
```

Devuelve, palabra entera, todo lo que en la base nombra eso: funciones que lo llaman o lo leen,
vistas, disparadores (los de esa tabla y los que ejecutan esa función), políticas de acceso, crons,
valores por defecto y claves ajenas que apuntan a esa tabla. Solo lee el catálogo.

- **Si cambias una columna**, pásale también el nombre de la columna: una función que lee
  `shifts.payer_id` aparece buscando `payer_id`, no buscando `shifts`.
- **Repite con cada función que salga** si lo que cambia es lo que devuelve: quien llama a quien te
  llama también puede depender de ello. Para en cuanto la forma de lo devuelto deje de propagarse.
- Lo que no ve: un nombre que se arma por partes (`'get_' || algo`) dentro de un `EXECUTE`. Si una
  función del mapa usa `EXECUTE`, léela.

## Paso 3. El código, en `main`

Se busca en `origin/main`, no en la rama donde estás: es lo último que se ha integrado. Busca el
**nombre pelado**, no la forma de llamarlo, porque hay llamadas construidas de otra manera.

```bash
cd ~/Desktop/Shifty/Github
git -C Worker-App fetch -q origin main && git -C Web-Panel fetch -q origin main
CODIGO=(-- '*.js' '*.jsx' '*.ts' '*.tsx' ':!app-unused' ':!agent_docs' ':!docs')
git -C Worker-App grep -n -w 'nombre' origin/main "${CODIGO[@]}"
git -C Web-Panel grep -n -w 'nombre' origin/main -- 'src/*.ts' 'src/*.tsx' 'supabase/functions/*'
# Solo para avisar, no para adaptar:
git -C Website grep -n -w 'nombre' origin/main -- 'src/*.ts' 'src/*.tsx' 2>/dev/null
```

Sin filtrar por extensión salen sobre todo los documentos copiados en `agent_docs/`, que no se
rompen. Pero dos de ellos sirven como índice de la app única y conviene mirarlos:
`agent_docs/features/app-unica-catalogo-funciones.md` (qué función de la base usa cada pantalla) y
`agent_docs/apps/worker/FUNCIONES-DE-LA-APP.md`.

Lo que hay que reconocer en lo que salga:

- **Llamadas a la base**: `.rpc('nombre')`, `.from('tabla')`, `.select('…columna…')`, y los tipos
  generados en `src/types/supabase.ts` (si cambias la forma, hay que regenerarlos).
- **Llamadas a funciones del servidor**: `functions.invoke('nombre')`, y los crons de la base que
  las llaman (salen en el paso 2).
- **Componentes y hooks compartidos**: si lo que cambias es uno de ellos, busca su nombre de
  importación en todo el repo, no solo en la pantalla que te han pedido.

⚠️ **Los móviles no llevan `main`: llevan la última versión publicada**, que puede ser bastante más
vieja (mergear no pone nada en el móvil de nadie). Que algo ya no salga en `main` no significa que
nadie lo llame. Antes de quitar algo o cambiar lo que devuelve, mira las llamadas reales de las
últimas 24 h en los registros de la API, que incluyen las apps instaladas con versiones viejas:

```sql
-- con la herramienta de registros de Supabase (query_logs), no con execute_sql
select count(*) from logs
 where source = 'edge_logs'
   and positionCaseInsensitive(event_message, '/rest/v1/rpc/nombre') > 0
```

Para una tabla leída directamente, se busca `/rest/v1/tabla`. Si hay llamadas, hay alguien que
depende de ello aunque el código de `main` ya no lo use.

⚠️ **Las funciones del servidor desplegadas pueden no ser las del repo.** El 2026-07-06 un despliegue
pisó una semana de arreglos que solo estaban en producción. Si el mapa incluye una, compárala con
la desplegada antes de dar por bueno lo que dice el repo.

## Paso 4. Escribir el mapa y decidir qué hace cada punto

**Consumidor WhatsApp empresarial (22-10-2026):** al cambiar una función, auxiliar, disparador,
permiso o tabla compartidos, consulta `whatsapp_company_contract_status()` y el registro de
capacidades de `Web-Panel/supabase/functions/_shared/empresa-whatsapp.ts`. El estado detecta cambios
respecto a la huella revisada de cada capacidad. Si resulta afectada, añade el bot al mapa y pasa sus
pruebas de conversación y permisos antes de aprobar una nueva huella. No copies la regla al prompt
ni habilites una acción nueva por haberla encontrado en la base. El procedimiento y sus límites están
en `features/bot-empresas-whatsapp.md`, sección de revisión automática. Una skill avisa; el control
de la pasarela es el que impide operar con un contrato pendiente de revisar.

Una tabla, antes de tocar nada. Cada fila es un sitio y lo que hace con lo que vas a cambiar:

| Sitio | Qué usa | Qué le pasa con el cambio | Qué hay que hacer |
|---|---|---|---|
| función `x` | lee la columna `y` | deja de encontrarla | cambiarla en la misma tanda |
| app única, pantalla `z` | espera `y` en la respuesta | se quedaría vacía | mantener `y` hasta la siguiente build |
| cron `w` | llama a la función | igual | nada, comprobar después |

Tres reglas para la última columna:

1. **Las apps publicadas no cambian hasta su siguiente build** (y las actualizaciones por aire las
   pide Crescente, nunca el agente). Si una pantalla de la app espera algo, se sigue devolviendo
   hasta que la versión nueva esté en los móviles. Compatible hacia atrás o no se hace.
2. **Lo que se cambia en la base y lo que cambia en el código va en la misma tanda**, o en el
   orden que no rompe: primero lo que añade, después lo que deja de usar.
3. **Si el mapa sale enorme, se para y se cuenta.** Tocar algo de lo que dependen 40 sitios es una
   decisión de Crescente, no un detalle de implementación.

## Paso 5. Después del cambio, comprobar cada fila

El mapa se vuelve una lista de comprobación. Cada fila se marca con cómo se ha comprobado, no con
"debería ir":

- **Funciones de la base**: `fn_review_function('nombre')` a cero `fail` en cada una que hayas
  tocado, y una llamada real (en solo lectura, o con datos de prueba `is_test`) a cada una del
  mapa que no hayas tocado, para ver que sigue respondiendo lo mismo. Si el resultado puede cambiar,
  eso es la skill `regresion`.
- **Panel web**: `npm run build` (tipado incluido), `npm run lint` y `npm test` en `Web-Panel`, a
  cero errores nuevos.
- **App única**: `npm run lint:biome` y `npm test` en `Worker-App`, y abrir en el simulador las
  pantallas del mapa, de los dos lados si salen en los dos.
- **Funciones del servidor**: llamarlas tras desplegar y mirar sus registros.
- **Lo que no se pueda comprobar se dice**: *"no lo he verificado"*, con el porqué.

## Cómo se le cuenta a Crescente

Corto y sin código: *"Esto lo usan 6 sitios: 4 funciones de la base, una pantalla de la app de
empresas y un cron. He cambiado las 4 funciones, la pantalla sigue recibiendo lo mismo y el cron
lo he comprobado después. No he podido probar X porque Y."* Si el mapa obliga a decidir algo, se
le presentan las opciones con una recomendación.

## Si te cruzas con algo roto mientras haces el mapa

Lo dicen las reglas comunes: si se escapa algo ahora, se para y se dice; si es barato, se arregla
y se cuenta; si es caro, a `shared/PENDIENTE.md`. Y antes de nada, comprobar si de verdad pasa.
