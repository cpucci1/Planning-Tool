---
name: shifty-prevision-facturacion
description: >-
  Estima cuánto va a facturar Shifty (sus ingresos: comisión, extras, suscripciones y equipo
  propio, como "Ingresos Shifty" en la pantalla de Facturación; el GMV va de apoyo) en el mes en
  curso y en los dos siguientes, con una cifra central, el rango del 80 % y el del 95 %, separando
  clientes actuales, pilotos y nuevos. Parte del modelo estadístico validado (pickup por cliente,
  con los temporales previstos y un suelo de lo ya hecho y agendado) y lo corrige con el contexto
  que la base no ve: comisiones, temporada, CRM, contratos, correo, memorias y la lectura de
  Crescente, diciendo qué corrige y por qué. Solo lee; no envía nada. Lleva un registro de cada previsión con su error al cerrar el
  mes y un fichero de aprendizajes que lee al empezar, y prueba una variable nueva en cada
  ejecución. Úsala cuando pregunten cuánto vamos a facturar este mes, en diciembre o en los
  próximos meses, previsión de facturación, forecast, qué GMV esperamos o si llegamos a una cifra.
---

# Previsión de facturación

**Qué contesta:** cuando Crescente dice "facturación" habla de **lo que factura Shifty**, no del GMV
(lo corrigió el 07-11-2026). La cifra principal son los **ingresos de Shifty** del mes: comisión +
extras + suscripciones + equipo propio, lo mismo que "Ingresos Shifty" en la pantalla Facturación y
GMV (`shifty_revenue` de `get_revenue_analytics_attributed`, lectura por día de turno). El **GMV**
(importe total a la empresa, con personal, ETT y comisión) va al lado como dato de apoyo: el modelo
lo prevé y de ahí sale la comisión.

- Comisión de los actuales: GMV previsto × comisión entre GMV de los últimos meses
  (`v_shifts_closed`, `cost_commission_shifty` o `_best` entre el importe; 13,25 % en septiembre a
  noviembre de 2026), más lo que cambie por subidas de comisión ya decididas.
- Comisión de cada nuevo: su GMV × pct / (1 + pct), con el pct de su ficha
  (`companies.shifty_commission_pct`).
- Extras (`cc_pending_extra_charges`), suscripciones pagadas (`shifty_subscription_charges`) y
  equipo propio (`shifty_team_member_charges`): se suman fijos con lo de los últimos meses (en
  otoño de 2026, unos 415 de suscripciones y alguna vez 99 de extras).
- **Si Crescente da una cifra de un cliente, es de ingresos de Shifty** salvo que diga GMV: se pasa
  a GMV con la comisión del cliente (`por_mes_ingresos` en `combinar.py`).

**Lo que se sabe del problema, medido el 07-11-2026** (informe completo en
`~/Desktop/Shifty/Github/prevision-facturacion/PREVISION-FACTURACION.md`):

- Casi todo se pide dentro del propio mes. El día 1 está en el sistema un **20 %** de lo que se
  acaba facturando, el día 7 un 45 %, el 14 un 62 %, el 21 un 85 %. Por eso el rango es ancho al
  principio y se estrecha solo.
- Las sorpresas vienen de **pocos clientes grandes o de temporada**: Tucán (septiembre 2025),
  Autocine (diciembre 2025), Ucalsa (mayo 2026), Nazabal (octubre 2026) y los agostos. Cinco
  clientes suelen hacer el 70 % del mes. Ahí es donde el contexto vale más que la fórmula.
- El modelo falla un **23 %** de media (WAPE): 21 % a día 7, 14 % a día 21. El 80 % se cumple de
  verdad en ~8 de cada 10 meses porque sale de sus errores reales.

**Reglas que no se saltan:**

1. **Solo lectura.** Ni la base, ni el CRM, ni HubSpot, ni el correo se tocan. Nada se envía a nadie
   (memoria "Claude no envía correos"). Si algo necesita una tabla o una función nueva, se propone en
   la respuesta como siguiente paso, no se crea.
2. **Ningún dato inventado.** Cada corrección cita su fuente (consulta, correo, memoria, trato). Si
   un potencial no consta en ningún sitio, se usa la curva real de arranque y se dice.
3. **Decide la skill, no la fórmula.** Lo dijo Crescente el 07-11-2026: el modelo estadístico es el
   respaldo que se mira, pero la cifra la pone la skill, porque es la que tiene el contexto (CRM,
   su correo y las conversaciones con clientes, contratos enviados, pilotos, tamaño de los
   potenciales, internet). Se enseña siempre el número del modelo sin tocar y, al lado, el de la
   skill, con cada diferencia explicada en una línea: qué cliente, cuánto, por qué y de dónde sale.
   Si la skill se aparta mucho del modelo, lo dice y lo justifica; el registro dirá quién acertó.
4. **No contar dos veces.** Antes de sumar algo por contexto, mira cuánto de eso ya está en lo
   agendado o en el ritmo del modelo (la tabla `top_clientes` del resultado). Solo se suma lo que
   falta.
5. **Respuesta a Crescente en 2 o 3 líneas** (ingresos de Shifty: central y rango del 80 % por mes,
   el GMV al lado, y lo que más lo mueve). El detalle va a un fichero, nunca a la respuesta.

---

## 0. Al empezar: leer la memoria de la skill

La memoria vive **en el repo `Docs`, nunca en la copia de un repo**: la sincronización pisa las
copias. Carpeta: `~/Desktop/Shifty/Github/Docs/skills/shared/shifty-prevision-facturacion/`. Se
escribe en una rama de `Docs` (skill `rama`) y se sube con `subir`.

1. **`aprendizajes-prevision.md`**: léelo entero y aplica lo que diga (clientes de temporada,
   correcciones que funcionaron y que no, probabilidades calibradas). No se llama `aprendizajes.md`
   a propósito: el sync conserva los ficheros con ese nombre en cada repo y se quedarían congelados
   en su primera versión.
2. **`registro-previsiones.md`**: mira las entradas de meses que **ya han cerrado** y no tienen el
   real apuntado. Para cada una, apunta lo facturado de verdad (sale en `cerrados` del resultado del
   modelo) y el error de la cifra del modelo y de la corregida. Si la corrección empeoró, eso es un
   aprendizaje: escríbelo.

---

## 1. El modelo de los clientes actuales

`scripts/prevision.py` reproduce, en un solo fichero, el modelo validado (los siete scripts de
`prevision-facturacion/scripts/`), con dos arreglos: solo aprende de meses que ya estaban cerrados en
el momento de cada foto (antes, para los meses siguientes, se colaba un mes a medias), y llega hasta
70 días antes del mes, para poder prever el mes siguiente y el otro.

```bash
S=<tu carpeta scratchpad>
python3 -m venv $S/venv && $S/venv/bin/pip -q install pandas scipy      # solo la primera vez
$S/venv/bin/python -I <carpeta de esta skill>/scripts/prevision.py $S/datos --meses 3
```

- Lee la base en solo lectura por la API, con la clave de servicio de `Web-Panel/.env.local`. No la
  imprime. Tarda unos minutos (descarga más la foto de cada día de 25 meses).
- `--hoy AAAA-MM-DD` reconstruye lo que se habría previsto otro día (para comprobar entradas viejas).
- Deja `resultado_<fecha>.json` en la carpeta de datos. Lo que importa de cada mes:
  - `hecho`, `agendado`, `vacantes`: lo que hay hoy en el sistema.
  - `temporales_previstos`: días de puestos temporales que el cliente ya ha pedido y cuya semana aún
    no está montada (`tp_revenue_forecast_days`, el mismo "Temporales previstos" de la pestaña Nuevo
    de Facturación y GMV, al precio que tendrá el día montado). Lo ya montado sigue en `agendado`, así
    que no se cuentan dos veces. **Ya van dentro** de `modelo` y de los cuantiles: no se suman a mano.
  - `modelo` (la fórmula, con los temporales previstos) y `modelo_sin_previsto`.
  - `p025`, `p10`, `p50`, `p90`, `p975`: los rangos. `p50` es la fórmula
    corregida con su sesgo histórico a ese día del mes: a semanas vista sale muy por encima de
    `modelo` porque Shifty ha crecido casi todos los meses del examen. **Es el punto de partida de
    la skill, no su respuesta**: si el contexto dice que ese crecimiento no va a seguir (o que va a
    ser mayor), la skill mueve la central y lo explica.
  - `suelo`: el mínimo de cada cuantil (abajo).
  - `pesos`: cuánto vale hoy cada euro agendado, el ritmo de 3 meses y el mismo mes del año pasado.
  - `top_clientes`: por cliente, hecho, agendado, ritmo, mismo mes del año pasado y su previsión.
    **Es la base de las correcciones.**
  - `nuevos_en_sistema`: clientes sin facturación previa que ya tienen algo este mes (van al bloque
    de nuevos, no aquí).
  - `examen`: error y cobertura del rango en los meses cerrados, por tramos de días. Si la cobertura
    del 80 % baja de 0,7 en el tramo de hoy, el rango no es fiable: dilo.
  - `arranque_nuevos`: la curva real de un cliente nuevo en su mes 1, 2 y 3.

**Clientes actuales** = los que ya habían facturado algún mes antes del mes en curso.

**Solo lo recurrente** (Crescente, 07-11-2026): los anuncios de servicio no recurrente
(`job_offers.is_non_recurring_service`: festivales, ferias, eventos) no entran en ningún cálculo, ni
en la historia ni en lo de hoy. Shifty dejó de hacerlos en junio de 2026. Si un cliente nuevo es de
eventos, se dice aparte y no se suma.

**Temporales previstos y suelo** (pedido por Crescente el 07-11-2026: vio un mínimo de 40.000 con
44.170 ya en pantalla y le pareció absurdo):

- Los temporales previstos son demanda casi segura. No pasan por los pesos del modelo (lejos del mes
  dan poco peso a lo agendado y se perderían): se suman multiplicados por la parte de lo agendado que
  de verdad acabó facturada.
- **Esa parte se mide en la base**: en cada mes cerrado de los que aprende el modelo, a ese mismo día
  del mes (±3), de lo agendado, cuánto se facturó. Por jornada y hasta lo agendado, así que una
  sustitución cuenta como facturada. Medido el 07-11-2026: de mediana se factura el 88-90 %, en uno
  de cada diez meses el 75 % o menos, y en los peores (diciembre de 2025, septiembre de 2025,
  febrero de 2026) la mitad. Antes de empezar el mes casi nunca hay agendado que medir: se usa lo de
  la primera semana (supuesto).
- **Suelo**: ningún cuantil queda por debajo de hecho + (agendado + temporales previstos) × esa
  parte, en su mismo cuantil. `combinar.py` lo aplica también en cada escenario. Las vacantes no
  entran en el suelo: no son seguras.
- Con `--hoy` de otro día los temporales previstos no se usan (la función solo sabe lo que falta por
  montar hoy). Si el script avisa de "previsto sin cliente actual", ese cliente es nuevo: su previsto
  va en el bloque de nuevos como `fijo` (§4).
- Si un cliente con temporales previstos tiene además ritmo de 3 meses o año pasado, parte de lo
  previsto ya está en su ritmo: mira `top_clientes` y resta el solape (§3, regla 4 de arriba).

**Sin Python** (solo para una idea rápida, no es la previsión): lo que suma la pantalla del mes es
hecho (`v_shifts_closed`, importe `cost_total_company` si `is_officially_squared`, si no
`cost_total_company_best`) más agendado (`v_shifts_pending.cost_total_company`) más vacantes
(`v_job_days_pending.payment_estimated_from_vacancies` por su factor) más temporales previstos
(`tp_revenue_forecast_days()`, columna `gmv`). **Nunca se suman vistas de
turnos con las de jornadas enteras** (skill `shifty-base-de-datos` §2). Al principio de mes eso es
un 20 a 45 % del final: no se da como previsión.

### 1.1 Contraste por tramos de diez días (el mes en curso)

Crescente, 07-11-2026: *"pudimos estimar con bastante certeza el 1 a 10, y luego con eso, viendo las
fluctuaciones del año pasado, sacar un estimado"*. Es una segunda cifra, sencilla y explicable, que se
pone **al lado** del modelo, no en su lugar. A partir del día 5 o 6 del mes ya se puede hacer.

1. **Turnos del 1 al 10 de este mes.** Lo hecho más lo agendado de esos días (`v_shifts_closed` con
   `shift_status = 'over'` y `v_shifts_pending`, por `date`), más lo que aún suele entrar a última
   hora para esos días. Solo recurrentes y sin empresas de prueba. A día 7 de noviembre de 2026 había
   249 en el sistema y se estimaron 285.
2. **Cómo se repartió el mismo mes del año pasado**, en turnos recurrentes terminados por tramos
   (1 al 10, 11 al 20, 21 al final): cuánto pesó el segundo y el tercer tramo frente al primero.
   Noviembre de 2025: 77, 73 y 105. El segundo tramo, 0,95 veces el primero; el tercero, 1,36 veces.
3. **Turnos del mes** = turnos del 1 al 10 × (1 + peso del segundo + peso del tercero). Noviembre de
   2026: 285 × 3,31 ≈ 945.
4. **GMV e ingresos de Shifty** = turnos × importe medio por turno recurrente de este mes (hecho y
   agendado), contrastado con el del mes anterior. Noviembre de 2026: unos 107 € de GMV y 13,9 € de
   comisión por turno (octubre, 109 € y 14,4 €). Se suman suscripciones y extras como en §1.

La consulta del reparto, sin no recurrentes:

```sql
select case when extract(day from v.date) <= 10 then '1-10'
            when extract(day from v.date) <= 20 then '11-20' else '21-fin' end tramo,
       count(*) turnos,
       round(sum(case when v.is_officially_squared then v.cost_total_company
                      else v.cost_total_company_best end)) gmv
from v_shifts_closed v
join job_days jd on jd.id = v.job_day_id
join job_offers jo on jo.id = jd.job_offer_id
join companies c on c.id = jo.company_id
where not coalesce(c.is_test, false) and v.shift_status = 'over'
  and not coalesce(jo.is_non_recurring_service, false)
  and v.date >= '2025-11-01' and v.date < '2025-12-01'
group by 1 order by 1;
```

Cómo se lee:
- **Si coincide con el modelo**, la cifra gana confianza y se dice. El 07-11-2026 dio unos 101.000 de
  GMV de actuales, frente a 103.700 de la skill para los mismos actuales (los 14.700 de
  ingresos de la skill llevan además nuevos y suscripciones).
- **Si se separa más de un 15 %**, se busca por qué antes de elegir: suele ser un cliente grande que
  el año pasado no estaba (o que ya no está) y cambia el reparto entre tramos.
- **Ojo con la base pequeña:** noviembre de 2025 fueron 255 turnos de 18 o 19 empresas. Un solo
  cliente nuevo mueve el reparto. Por eso no sustituye al modelo, y en meses con un cliente de
  temporada fuerte (diciembre y enero con Autocine o Lew Brand) se mira el reparto sin ese cliente.
- **No incluye a los nuevos ni a los pilotos**: van aparte (§4) y se suman encima.
- **Para el mes siguiente** se encadena: la última decena de este mes da la primera del siguiente, y
  de ahí el resto. Pero antes se separan los turnos del año pasado en tres grupos: **clientes que
  siguen pidiendo hoy**, clientes que ya no piden y los de temporada que se esperan. **El reparto y el
  salto entre meses se sacan de los que siguen**, no del total. El 07-11-2026, el diciembre de 2025
  tal cual daba 2.350 turnos (6 veces la última decena de noviembre); los que siguen hicieron
  diciembre igual que noviembre y el pico era de 26 clientes que ya no están. Detalle en
  `prevision-facturacion/2026-11-07-diciembre-por-tramos.md`.

---

## 2. El contexto que la base no ve: dónde está y cómo se lee

Recorre todas, en este orden. Para cada una apunta lo encontrado en el fichero de detalle, aunque
sea "nada".

### 2.1 Base de producción, más allá del modelo

Por el MCP de Supabase (`execute_sql`, proyecto `brgswggayexbvrnqtlhp`), solo `select`. Empresa del
turno siempre por `job_days → job_offers.company_id` (`shifts.company_id` está vacío en algunos).
Fuera las empresas con `companies.is_test`.

| Qué | Dónde | Por qué importa |
|---|---|---|
| **Puestos temporales** | `temporal_positions`; lo que falta por montar, en `tp_revenue_forecast_days()` | Crean sus turnos solo una o dos semanas por delante. **Desde el 07-11-2026 el modelo ya los suma** (`temporales_previstos`, §1): no se corrigen a mano. Solo se mira aquí si un puesto tiene franjas sin hora (salen con importe vacío y no cuentan), si se va a alargar o acortar (`ends_on`), o si su cobertura va peor que la del resto. |
| **Anuncios por aprobar** | `job_offers.approval_status` en `pending` o `changes_requested`, con sus `job_days` futuros | Demanda que aún no es vacante. Ficha `features/anuncios-por-aprobar.md`. |
| **Invitaciones pendientes** | `job_days_candidates` con `job_day_candidate_status_id = 1` y `source = 'invited'` en días futuros | Señal de demanda que aún no es turno. Hoy pesan poco. |
| **Comisión por empresa** | `companies.shifty_commission_pct` (y la de anuncio y jornada, cadena de `fn_commission_pct`) | Una subida de comisión sube el GMV. Santa Cruz pasa del 6 % al 15 % en diciembre de 2026 y las de menos del 15 % suben al 15 % en 2027 (memoria "Comisión sube al 15 %"); Vega va al 20 % desde el 29-10 (memoria). Efecto: GMV del cliente × (1 + nueva) / (1 + vieja), solo sobre lo que va por comisión. **Comprueba si ya está en la base** antes de corregir: si ya está, el agendado ya lo lleva. |
| **Cuota de equipo propio** | trabajadores distintos con `shifts.is_own_team_shift` y estado 5 en el mes × `companies.own_team_price_per_worker` (5 € si vacío) | No es GMV de turnos, pero sí ingresos de Shifty: entra en `otros_ingresos`. A 07-11-2026, ninguna cobrada desde septiembre. |
| **Festivos** | `territory_holidays` (por territorio, `date`, `name`, `is_active`) | Puentes y Navidad. Úsalo para razonar, no como multiplicador: el mismo mes del año pasado ya los recoge por cliente. |
| **Semanal** | vista materializada `v_billing_commission_weekly` (la de `get_revenue_analytics()`): `gmv_cuadrado`, `gmv_over_sin_cuadrar`, `gmv_pendiente`, `gmv_vacante` por semana y centro | Cuadrar contra el panel. Las semanas cruzan meses: no se usa para el total del mes. |

### 2.2 CRM comercial (la fuente que manda)

Tablas `crm_*` del sales-tool, en la misma base. **HubSpot es un espejo** del CRM y casi no aporta
(comprobado el 07-11-2026: un solo trato creado en 90 días); se mira solo para contrastar fases.

- Tablero: vista `crm_navigator_tratos` (`etapa_tablero`, `empresa_nombre`, `centro`,
  `ultimo_contacto`, `podrido`), unida a `crm_oportunidades` por `id` y a `crm_empresas` por
  `empresa_id` (tamaño en `num_locales` o `enr_num_locales`, ciudad, y `company_id` si ya es cliente).
- Fases en orden: `en_prospeccion`, `interesado`, `llamada_agendada`, `reunion_agendada`,
  `negociacion` (propuesta aceptada), `verificacion_credito`, `ob_documental`, `ganado`. Salidas:
  `nurturing`, `perdido`.
- Consulta de tratos vivos:

```sql
select t.etapa_tablero, t.empresa_nombre, t.centro, t.tipo_id, t.comision_pct,
       o.estimated_value, t.next_step_date, t.closed_at::date cerrado,
       t.ultimo_contacto::date ult_contacto, e.num_locales, e.enr_num_locales, e.company_id, e.city
from crm_navigator_tratos t
join crm_oportunidades o on o.id = t.id
left join crm_empresas e on e.id = t.empresa_id
where not t.es_prueba
  and (t.etapa_tablero in ('negociacion','verificacion_credito','ob_documental','reunion_agendada')
       or (t.etapa_tablero = 'ganado' and t.closed_at > now() - interval '60 days'
           and t.closed_at::date not in ('2026-09-14','2026-10-07')))
order by t.etapa_tablero, t.ultimo_contacto desc nulls last;
```

⚠️ Trampas medidas el 07-11-2026:
- **`estimated_value` no es facturación esperada**: son etiquetas redondas (100, 500, 1.000, 2.000)
  heredadas de HubSpot. No se usa como potencial.
- **El 14-09 y el 07-10 hubo volcados masivos**: 76 de 83 "ganados recientes" llevan esas fechas.
  Para saber si un cliente es nuevo de verdad, se mira su **primer turno terminado**.
- **No existe fase "piloto"** ni campo de facturación esperada. El tamaño casi nunca está relleno.
  Proponer guardarlo es el siguiente paso más útil (§6).

### 2.3 Contratos

Ficha `features/firma-de-contratos.md`. Enviados y firmados por el cliente: `crm_contratos` (`tipo`
cliente / ett / sepa, `estado` preparado, enviado, abierto, firmado, caducado, anulado, `enviado_at`,
`firmado_at`, `comision_pct`, `empresa_id`). Lo que de verdad le deja pedir personal, por centro:
`cost_center_contracts` (`signed_at`).

```sql
select c.tipo, c.estado, coalesce(e.name, c.destinatario_empresa) empresa, e.company_id,
       c.enviado_at::date, c.firmado_at::date, c.comision_pct
from crm_contratos c left join crm_empresas e on e.id = c.empresa_id
where coalesce(c.enviado_at, c.firmado_at, c.created_at) > now() - interval '90 days'
  and not coalesce(c.es_prueba, false)
order by coalesce(c.firmado_at, c.enviado_at, c.created_at) desc;
```

Firmado y sin ningún turno es la señal más fuerte de un arranque próximo; enviado sin firmar, de uno
posible.

### 2.4 Correo

MCP de Gmail, **solo** `search_threads`, `get_thread` y `get_message`. Nunca responder, reenviar,
crear borradores ni etiquetar.

⚠️ **El 07-11-2026 el conector de Gmail era el buzón de Fernando (fhernandez@), no el de Crescente**,
y solo tenía hilos desde el 25-10. Comprueba de quién es el buzón (las direcciones de los hilos) y,
si no es el de Crescente, dilo en la respuesta: sin su correo, la parte de "lo que dicen los
clientes" está ciega.

Búsquedas:
- Clientes grandes por nombre: `newer_than:60d (musa OR nazabal OR martinuca OR "santa cruz" OR vega OR pistola OR nuit OR bebola) -from:lanak.es -to:lanak.es` (la lista sale de `top_clientes`).
- Pipeline: `newer_than:60d (piloto OR presupuesto OR propuesta OR acuerdo) -category:promotions -category:social` y `in:sent newer_than:60d (presupuesto OR propuesta)`.
- Temporada y volumen: `newer_than:60d (Navidad OR diciembre OR eventos OR temporada OR arrancar OR empezar OR locales OR previsión OR cerramos OR dejamos OR "otra empresa")`.
- Ruido que se excluye siempre: `-from:(slack.com OR github.com OR vercel.com OR supabase.com OR google.com) -from:soporte@shifty.es -from:seleccion@shifty.es`. "ETT" a secas coincide con la firma de Lanak: usar `ETT -from:lanak.es`. Los hilos de Lanak son pagos, no volumen.

### 2.5 Memorias y Docs

- Memoria: `~/.claude/projects/-Users-clara-Desktop-Shifty-Github/memory/`. Busca por el nombre de
  cada cliente de `top_clientes` y de cada trato vivo (`grep -ril`), y lee siempre "Comisión sube al
  15 %", "Vega: 20 %", "Puestos temporales", "Previsión de facturación del mes" y las de decisiones de
  producto más recientes.
- Docs: `docs/features/` del cliente o del producto que afecte (puestos temporales, equipo de
  emergencia, anuncios por aprobar) y `skills/web-panel/salud-de-clientes` si hay que saber qué
  cliente está en riesgo.

### 2.6 Internet: el tamaño de los potenciales

Para cada piloto, trato avanzado o cliente con contrato enviado sin tamaño en el CRM: WebSearch (y
WebFetch de su web) para saber **cuántos locales tiene, de qué tipo, en qué ciudades, si abre
alguno pronto** y si tiene temporada (terrazas, Navidad, eventos). Con eso se estima el potencial al
mes por comparación con clientes actuales de tamaño parecido (su GMV real en la base), nunca con un
número redondo. Cada cifra con su fuente (enlace) en el fichero de detalle. Lo mismo para un
cliente actual del que se sepa que abre o cierra locales. Es lectura de páginas públicas: no se
rellena ningún formulario ni se escribe a nadie.

### 2.7 Calendario

Festivos de `territory_holidays`; puentes; Navidad (24, 25, 31 y 1 cierran o cambian mucho);
agosto; Semana Santa. El mismo mes del año pasado ya los lleva por cliente: el calendario sirve
para explicar y para clientes sin año anterior, no para multiplicar otra vez.

---

## 3. Corregir a los clientes actuales

Para cada cliente de `top_clientes`, y para cualquier otro del que el contexto diga algo:

1. **¿Hay un hecho concreto que el modelo no puede ver?** Un cambio de
   comisión, un evento anunciado, un cliente que avisa de que lo deja, un local nuevo que aún no
   pide, una temporada que el año pasado no existía (cliente sin año anterior). Si no lo hay, **no se
   toca**: la intuición sin dato no corrige.
2. **Cuantifícalo** con datos de la base (horas, €/h reales del cliente, semanas que quedan) o con
   la cifra literal de la fuente.
3. **Resta lo que el modelo ya cuenta** de eso (su agendado y la parte de su ritmo que lo cubre).
4. **Corrige los cinco cuantiles a la vez** sumando la corrección; si la corrección es incierta, da
   la cifra con su propio mínimo y máximo y súmalos a `p10` y `p90`.
5. Una línea por corrección: *cliente, + o − euros, por qué, fuente*.

Señales de subida o bajada de un cliente actual (ramp-up), a mirar siempre:
- Locales o centros nuevos (`cost_centers`, `locations` de la empresa creados en los últimos 60 días)
  que aún no han pedido.
- Clientes que pedían y han dejado de pedir: ritmo de 3 meses alto y nada agendado ni hecho a
  estas alturas del mes. El modelo lo baja solo en parte: mira la fecha de su último turno y si hay
  queja o incidencia abierta.
- Clientes en subida: el mes pasado muy por encima de su ritmo de 3 meses (el ritmo lo infravalora).

---

## 4. Pilotos y clientes nuevos (aparte, nunca mezclado con los actuales)

Entran: los de `nuevos_en_sistema` (ya tienen algo este mes y no habían facturado nunca), los
firmados sin turnos y los tratos vivos del CRM. Para cada uno:

| Campo | De dónde sale |
|---|---|
| **Potencial al mes** (con el arranque hecho) | Lo que diga el correo, el CRM o la reunión con cifras; si no, el tamaño que se saque de internet (§2.6) comparado con el GMV real de clientes actuales parecidos. Si no hay nada, **no se inventa**: se usa la curva real de arranque (`arranque_nuevos`) |
| **Probabilidad de que salga** | Tabla de abajo, ajustada por `aprendizajes-prevision.md` |
| **Mes de arranque** | Fecha de firma o fecha que diga el cliente; si no, el mes siguiente al de la firma |
| **Curva de arranque** | `arranque_nuevos` del modelo: mes 1, 2 y 3 reales de los clientes nuevos desde julio de 2025 |

**Pregunta a Crescente por los pilotos** antes de cerrar: su lectura (cuándo arranca, cuánto, cómo
crece) **manda sobre la tabla de abajo**, porque sabe de conversaciones que no están en ningún sitio.
Se traduce a probabilidad, mes de arranque y GMV mes a mes (`por_mes` en `combinar.py`), y se apunta
en el registro con sus palabras. Si no contesta, se usa la tabla.

Probabilidades de partida (07-11-2026, **supuestas**, sin histórico fiable porque el CRM no guarda
bien las fechas de fase; se calibran con el registro):

| Situación | Probabilidad de facturar algo en el horizonte |
|---|---|
| Ya tiene turnos este mes | 100 % (lo hecho y agendado va como fijo) |
| Contratos firmados, sin turnos | 50 % |
| Contrato enviado o abierto, sin firmar | 25 % |
| Negociación con contacto en los últimos 30 días | 10 % |
| Lo demás | 0 % (se nombra si es grande, no se suma) |

El cálculo lo hace `scripts/combinar.py`: le pasas un JSON con los cuantiles de los actuales **ya
corregidos** y la lista de nuevos (formato en la cabecera del script) y devuelve, por mes, central y
rangos del 80 y del 95 % de los bloques de GMV y de los **ingresos de Shifty**, que salen de
`ratio_comision_actuales`, `otros_ingresos` (extras y cuotas) y la `comision_pct` de cada nuevo. Simula cada nuevo como "sale o no sale" y, si sale, su
facturación de la curva real; el total no es la suma de los centrales. Un nuevo que sale, sale en
todos los meses del mismo escenario. Aplica el suelo de §1 a los actuales con el mismo sorteo (un
mes malo es malo en todo). Las colas por fuera del 95 % de los actuales se alargan un 15 %
abajo y un 10 % arriba: es un supuesto, y se revisa si el 95 % falla en el registro.

---

## 5. Resultado

**Fichero de detalle** (siempre): `~/Desktop/Shifty/Github/prevision-facturacion/AAAA-MM-DD.md`,
fuera de los repos, con:

1. Por mes, una tabla: primero **ingresos de Shifty**, después el GMV de actuales, pilotos y nuevos
   y total, con columnas central, 80 % y 95 %. Al lado, el GMV del modelo sin tocar y, en el mes
   en curso, el contraste por tramos de diez días (§1.1).
2. Hecho, agendado, temporales previstos y vacantes de hoy, y el suelo.
3. Las correcciones, una línea cada una, con fuente.
4. Los nuevos con su potencial, probabilidad, mes de arranque y de dónde sale cada cosa.
5. **Los supuestos que más mueven el número**, ordenados por euros.
6. Fuentes revisadas y qué dio cada una (también "nada"), y lo que no se pudo mirar.

**Respuesta a Crescente:** 2 o 3 líneas, sin código ni guiones largos. Por ejemplo: "Noviembre, unos
X de ingresos para Shifty (8 de cada 10 veces entre A y B; GMV unos G); diciembre, Y (C a D). Lo que más lo mueve es Z. Detalle en el
fichero". Si preguntó por un solo mes, solo ese.

---

## 6. Registro, aprendizajes y una variable nueva por ejecución

Todo en la carpeta de la skill **dentro de `Docs`** (§0), en una rama, y se sube con `subir`.

1. **`registro-previsiones.md`**: una entrada por ejecución y mes previsto, con fecha, día del mes,
   modelo, central corregida, rangos de los tres bloques, correcciones y supuestos clave. Las columnas
   "real" y "error" se rellenan cuando el mes cierra (§0).
2. **`aprendizajes-prevision.md`**: lo que se descubra. Qué cliente es de temporada y cuándo, qué
   piloto se sobreestimó, qué corrección acertó o falló, cómo se calibran las probabilidades. Con
   fecha y el caso que lo prueba. Si contradice algo de antes, se corrige lo de antes.
3. **Variables por investigar**: en cada ejecución se prueba **una** de la lista de
   `aprendizajes-prevision.md` contra el histórico, sin cambiar el modelo de la previsión del día:
   `prevision.py ... --fe booked,vac,runrem,ly_rem,<candidata>` y se compara `examen` (WAPE total y
   del tramo de días de hoy, y coberturas) con el modelo base. Si mejora el WAPE en más de un punto
   sin bajar la cobertura del 80 %, se apunta como candidata a entrar; entra en el modelo cuando haya
   mejorado en dos ejecuciones seguidas, cambiando `FE_BASE` y el `--fe` por defecto en el script y
   contándolo en aprendizajes. Las candidatas que necesitan un dato nuevo se programan en el script
   igual que `findes_rem`.

**Siguiente paso que se propone, no se hace:** guardar cada día la foto de lo que hay en el sistema
y la previsión (hoy se reconstruye a partir de fechas de creación y cancelación, que es aproximado),
y guardar en el CRM, por trato, número de locales, facturación mensual esperada y probabilidad. Las
dos piden crear algo en la base: se le proponen a Crescente con las cuatro preguntas de datos
personales (no llevan datos de personas) y no se crean desde esta skill.
