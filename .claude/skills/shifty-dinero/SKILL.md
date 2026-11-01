---
name: shifty-dinero
description: >
  Cómo se calcula y se protege el dinero en Shifty: la base de la comisión según el pagador sea
  directo o ETT, el 25 % de base, el equipo propio y su cuota mensual, la tarifa por hora y las
  cuatro puertas por las que se puede cambiar (dos sin guardas), la tarifa fija por posición, el
  mínimo del convenio y sus grupos, cuándo hace falta tarjeta, cuándo y cómo cobra el trabajador, y
  el precio público de la web. Úsala SIEMPRE que aparezca un importe, una comisión, un coeficiente,
  una tarifa, una factura, un cobro o un plazo de pago, y antes de responder a "cuánto le cobramos a
  X", "cuánto factura Y", "por qué sale este importe", "cambia la tarifa" o "cuándo cobra este
  trabajador".
---

# El dinero de Shifty

**Regla que gobierna todo lo demás: el dinero se calcula en la base, nunca en una pantalla.** Si
hace falta un total, un coeficiente o una comisión, se pide a la vista y se pinta lo que devuelve.
Las cuatro vistas de precio son zona crítica: ver la skill `shifty-base-de-datos`.

---

## 1. La comisión

**Decidido por Crescente el 2026-09-02.** La base depende del pagador:

| Pagador | Sobre qué se calcula |
|---|---|
| **Directo** (la empresa paga al trabajador) | el **bruto del trabajador** |
| **ETT** (Lanak) | el **coste ETT total**: bruto × coeficiente |

Las dos salen con la misma cuenta, `cost_personnel × coefficient`, porque en directo el coeficiente
es 1,0 y el coste total coincide con el bruto.

**El porcentaje de base es el 25 %.** Los clientes con condiciones negociadas tienen el suyo, que se
busca primero en la jornada, luego en la oferta y luego en la empresa.

### Esa cadena vive en un solo sitio: `fn_commission_pct`

Desde el 2026-09-18, el orden **jornada → anuncio → empresa → 25 de reserva** está escrito una sola
vez, en `fn_commission_pct(jornada, anuncio, empresa)`. **El 25 tampoco vive en ningún otro sitio.**
La llaman las cuatro vistas de precio, los dos disparadores que congelan la comisión al crear el
anuncio y la jornada, el incentivo de primer turno, la pantalla del anuncio y
`get_offer_commission_pct`, que es por donde pregunta la app.

- **Para cambiar el orden o el 25, se cambia ahí y en ningún otro sitio.** Y se cambia también su
  hermana `fn_commission_source`, que dice de dónde salió el número (jornada, anuncio, empresa o
  reserva) y tiene que seguir el mismo orden.
- **Nunca volver a escribir el `coalesce` a mano**, ni en la base ni en una pantalla. Antes estaba
  copiado en seis sitios y ya discrepaban: la pantalla del anuncio se saltaba la jornada y enseñaba
  8 % en nueve anuncios de Restaurante Bebola que se facturaron al 10 %.
- La función **no tiene `search_path` fijo a propósito**: no referencia ningún objeto, y ponérselo
  impediría que Postgres la incruste en las vistas. El analizador la marca; es un falso positivo
  conocido.

- **Ejemplo ETT:** 10 €/h × 8 h = 80 € de bruto. Coeficiente 1,505 → coste ETT 120,40 €. Comisión
  del 25 % = 30,10 €. Total empresa = 150,50 €.
- **Ejemplo directo:** 80 € de bruto. Comisión del 25 % = 20 €. Total empresa = 100 €.
- **INCORRECTO en ETT:** aplicar el 25 % solo al bruto. Se deja fuera el coste de la ETT.

### Coeficiente de Lanak al conciliar (2026-10-19)

Crescente confirma que Lanak utiliza siempre **1,505**. Un 1,51 guardado en Shifty no acredita que Lanak haya aplicado otro coeficiente.
- **CORRECTO:** contrastar la liquidación de Lanak con 1,505 y separar las diferencias del cálculo de Shifty, sin modificar facturas emitidas.
- **INCORRECTO:** presentar 1,505 como hipótesis por confirmar con Lanak al conciliar Vega, por confundir el valor guardado en Shifty con el criterio del proveedor.

⚠️ **Hay un texto que dice lo contrario y está mal**, en la parte propia de la app de empresas. Manda esta tabla. Si lo ves, se corrige en `Docs/repos/Client-App.md`, nunca en el fichero del repo: ese lo genera el sync y el arreglo se pierde.

### El coeficiente va exacto: 1,505 es 1,505

**Decidido por Crescente el 2026-09-25: "No redondeemos el 1,505 a 1,51".** Hasta ese día las
cuatro vistas de precio redondeaban el coeficiente a dos decimales y cobraban medio punto de más.

- **El de la empresa vive en un solo sitio:** `fn_company_base_coefficient`. Exacto, y 1,505 si no
  tiene. El del turno es el congelado (`shifts.company_coefficient_id`), también exacto.
- **El de cada día lo decide `fn_pricing_coefficient`:** exacto, salvo que ese día ya esté
  facturado (factura de la ETT, cargo o factura de comisión que lo cubra) o sea anterior al
  01-02-2026. Entonces devuelve el redondeado, que es con el que se facturó: **una factura emitida
  no se mueve ni un céntimo**.
- Lo usan las cuatro vistas, la cotización del creador y el detalle del anuncio. **Nunca volver a
  escribir el coeficiente ni su redondeo a mano.** En pantalla se enseña con sus tres decimales.
- El porqué y lo que se descartó, en `decisiones/D-004-el-coeficiente-de-la-ett-no-se-redondea.md`.

### Los puestos temporales tienen su propia comisión (2026-10-28)

Vive en el anuncio del puesto, dentro de la misma cadena. Nace con la de la empresa salvo que el
equipo ponga otra al crearlo, y se cambia solo con `tp_admin_set_commission` (motivo y rastro).
**Cambiar la comisión de la empresa no la toca**, y cambiar la del temporal no toca la de la
empresa. Detalle en `features/puestos-temporales.md`.

### El porcentaje no está congelado

Se resuelve en vivo, y al emitir el cargo se guarda el importe pero no el porcentaje usado. Cambiar
la comisión de una empresa **cambia el precio de sus turnos aún no facturados**. Crescente decidió el
2026-09-02 que **hay que congelarlo en el turno**, como ya se hace con el coeficiente. Pendiente.

---

## 2. Equipo propio

Los trabajadores del equipo propio de una empresa (`worker_company_exclusivity`) se facturan con una
**cuota mensual fija por trabajador activo** en lugar de comisión por turno.

**La regla exacta, según Crescente:**

- **Solo se libran de comisión los turnos de GESTIÓN DIRECTA.** Un turno por ETT **paga comisión
  igual**, aunque el trabajador sea de la plantilla.
- **La cuota mensual solo se cobra si ese mes hizo al menos un turno de gestión directa.** Los turnos
  ETT no cuentan para la cuota. Así no hay doble cobro.
- **Cuánto:** los trabajadores distintos con al menos un turno de equipo propio completado
  (`is_own_team_shift` y estado 5) dentro del mes natural, por **5 € por trabajador y mes** por
  defecto (`companies.own_team_price_per_worker`; si está vacío, 5). Si ese mes no hace ningún turno,
  cero: solo se paga por trabajador que se usa.
- **El precio se congela en el cargo**, así que cambiar la tarifa mañana no toca facturas emitidas.
- **Nunca sumar la cuota mensual y la comisión por turno del mismo turno.**

El estado se **congela al completar el turno** en `shifts.is_own_team_shift`, según si el trabajador
estaba en el equipo en la fecha de la jornada. Nunca clasificar por el estado actual de exclusividad
ni por `workers.has_exclusivity`: reclasificaría turnos pasados y cambiaría facturas ya emitidas.

Detalle completo en `Docs/docs/features/equipo-propio-billing.md`.

---

## 3. La tarifa por hora

### Respuestas generales a trabajadores

Clara puede comunicar el rango general autorizado por Crescente, sin consultar un anuncio. Regla, ejemplo y límites en `docs/features/clara-quality-reviews/TARIFAS-GENERALES-2026-10-08.md` (en repos destino, `agent_docs/features/`). Es información al trabajador: no cambia tarifas guardadas, cálculo, mínimos de convenio ni precios a empresas. Para un anuncio concreto sigue mandando su tarifa actual comprobada.

### La regla

La tarifa **solo se puede subir. La única forma de bajarla es sin candidatos, sin invitados y sin
nadie elegido** en el anuncio, y nunca por debajo del suelo (decidido por Crescente el 17-10-2026).
Quien ya se ha apuntado, está invitado o en el banquillo ha visto un pago concreto: bajárselo sin
avisar le cambia lo que se le ofreció. Y si la empresa tiene **pago fijo por posición** activado
(`companies.fixed_position_pay_enabled`, hoy **6 empresas reales**), la fija el puesto
(`position_types.fixed_hourly_rate`, puesta en 38 posiciones de 8 empresas) y se copia al crear el
anuncio: **ni la empresa ni el panel la pueden editar, ni subir ni bajar**.

**La regla vive en un solo sitio: `fn_job_offer_rate_change_check(anuncio)`.** Dice si se puede subir
(`can_increase`: sin pago fijo, anuncio en borrador/publicado/oculto, nadie elegido, ningún turno vivo y
días por delante), si se puede bajar (`can_decrease`: además sin candidatos ni invitaciones vivas, con
el mínimo del convenio conocido y por encima del suelo) y hasta dónde (`min_hourly_rate`: el mínimo
del convenio del anuncio y el suelo del creador de `fn_resolve_min_hourly_rate`, redondeado a 0,50),
con el porqué en `blocked_reason` y `decrease_blocked_reason`. La usan `update_job_offer_hourly_rate`
para imponer y `get_job_offer_details_for_company` para enseñar (`hourly_rate_stats.rate_change`): la
pantalla no decide nada, enseña lo que dice la base. **Nunca volver a escribir esa comprobación a
mano** en otra función ni en una pantalla.

**La única excepción, desde el 2026-09-22: un interno puede subirla en una jornada suelta.** Se pide
con `p_override_fixed_pay` y **exige un motivo escrito** de al menos 10 caracteres, que queda en el
rastro. No la puede usar un usuario de empresa, y **no levanta ninguna otra guarda**: sigue sin poder
bajar la tarifa, saltarse el convenio, ni tocar una jornada con alguien seleccionado o con turnos
vivos. Se creó para cubrir dos turnos de La Martinuca el mismo día subiendo a 12 €/h, con el cliente
avisado. **Sube lo que se le factura al cliente**, así que no se usa sin que él lo haya aceptado.

⚠️ **No tiene botón en el panel, y es a propósito: decisión de Crescente el 2026-09-22.** Es una
puerta para el agente, no para la pantalla. No añadirla al panel ni a la app de empresas.

### Las cuatro puertas, y las dos que no comprueban nada

| Camino | Solo subir | Tarifa fija | Convenio | Permisos | Candidatos | Rastro |
|---|---|---|---|---|---|---|
| `update_job_day_hourly_rate` | sí | sí | sí | sí | sí | sí |
| `update_job_offer_hourly_rate` | sí (bajar solo sin candidatos, invitados ni elegidos) | sí | sí | sí | sí | sí |
| `update_multiple_job_days_hourly_rate` | **no** | **no** | **no** | sí | **no** | **no** |
| El modal escribiendo directo | **no** | **no** | **no** | **no** | **no** | **no** |

**`update_job_day_hourly_rate` es la implementación de referencia** para un día suelto (solo deja
bajar a un interno con su excepción; para el anuncio entero manda `fn_job_offer_rate_change_check`). Comprueba la sesión, los
permisos, bloquea si la empresa tiene pago fijo, exige que la tarifa suba, respeta el mínimo del
convenio, se niega si ya hay alguien seleccionado o turnos vivos, y deja rastro con quién, cuándo y
de qué a qué. **Cualquier camino nuevo debe hacer las siete cosas.** Es también la única que sabe
levantar el pago fijo, y solo a un interno con motivo escrito.

Por las dos puertas sin guardas se puede bajar la tarifa por debajo de lo pactado con esas 6
empresas, sin que quede registro. **Pendiente de arreglar.**

### El mínimo del convenio

**La búsqueda puede tener dos dimensiones o tres.** Antes de buscar la tarifa mínima, comprobar si
ese convenio tiene grupos:

- Sin grupos: convenio + categoría.
- Con grupos: convenio + **grupo** + categoría.

Si tiene grupos y se ignoran, sale la tarifa de otro grupo, y con el bruto mal salen mal el
coeficiente, la comisión y la factura.

Las vistas aplican el mínimo del convenio **como suelo** al calcular el pago, así que una tarifa baja
guardada no baja el importe facturado. Lo que queda mal es la tarifa guardada, que es la que se ve.

### La nocturnidad y el festivo SUBEN EL PISO, no se suman

**Regla de Crescente, 2026-09-18.** El plus se calcula **sobre el salario del convenio**, nunca sobre
la tarifa que paga el cliente. Lo que hace es levantar el suelo de esa hora:

- Convenio a 9,81 €/h y plus del 25 % → el suelo de la hora nocturna es 12,26 €/h.
- Si el cliente paga **11**, esa hora sube a **12,26**.
- Si el cliente paga **13**, no sube nada: se queda en **13**.

Vale igual para el recargo de festivo, y cuando coinciden noche y festivo los dos porcentajes se
suman **sobre el convenio**, no sobre la tarifa.

**La regla vive en un solo sitio: `fn_effective_hourly_rate`.** Se le pasa la tarifa, el mínimo del
convenio y el porcentaje de recargo, y devuelve lo que se cobra esa hora. La llaman las cuatro vistas
de precio, las dos funciones de pago, la que cuadra el turno, la tarifa nocturna que ve el
trabajador, el desglose de la jornada, la previsualización y el disparador que guarda la tarifa de
noche: **doce sitios, ninguna copia**.

Para cambiar la regla se cambia ahí y en ningún otro lado. **Nunca volver a escribir ese `greatest` a
mano.**

⚠️ **El importe se multiplica por la tarifa SIN redondear**; solo se redondea al mostrarla.
Redondear antes de multiplicar desviaba dos céntimos por turno.

Hasta ese día las dos funciones de pago sumaban el plus sobre la tarifa del cliente, así que **el
anuncio prometía más de lo que se paga**: 21 jornadas vivas, hasta 10,30 € por persona en Vega
Members Club. Se corrigieron las funciones y se recalcularon esas jornadas. Ninguna factura ni ningún
pago se movió, porque eso sale de las vistas, que ya aplicaban la regla buena.

---

## 4. Cuándo hace falta tarjeta

| Pagador | Método | Sin tarjeta |
|---|---|---|
| ETT | Stripe | bloquea **crear y seleccionar** |
| Directo | Stripe | bloquea **solo seleccionar**, permite crear |
| Cualquiera | Transferencia | no hace falta |

**Los usuarios internos NO están exentos de la puerta de selección.** Aplica a todos, para no dejar
turnos sin forma de cobrarlos.

---

## 5. Cuándo cobra el trabajador

- **ETT / Lanak o marketplace normal:** el **jueves de la semana siguiente a la trabajada**, más
  24-48 horas **hábiles** en llegar. Nunca dar una fecha exacta ni decir "entre el jueves y el fin de
  semana": el dinero no llega en fin de semana, y "hábiles" cubre los festivos.
- **Gestión directa** (pagador `company`): la fecha está en el campo libre `payment_conditions` del
  centro de coste, con el de la empresa de reserva. **Si está vacío, no inventar una fecha:**
  preguntar o escalar.
- **`cost_centers.payment_terms_days` NO es cuándo cobra el trabajador.** Es un campo B2B: los días
  que tiene la empresa para pagar a Shifty o a Lanak. **El trabajador no debe verlo nunca.**
- **El importe de la app es BRUTO.** Al banco llega el neto: el bruto menos **su parte de la
  Seguridad Social y el IRPF**. **Decisión de Crescente (30-10-2026): al trabajador se le estima un
  8,5 % ±1 %** cuando paga la ETT colaboradora; lo exacto está en su nómina. Hasta el 30-10 se decía
  que solo se le descontaba el IRPF, y era falso. El porcentaje vive en el pagador
  (`payers.worker_net_deduction_pct` y `worker_net_deduction_margin_pct`) y la cuenta la hace la base
  (`fn_worker_net_estimate`): ni la app ni un bot la calculan. Con pago directo no se estima: lo dice
  la nómina de la empresa. La parte de la Seguridad Social de la empresa va aparte, por encima del
  salario. Ficha: `features/pago-del-turno-en-la-app.md`.
- **"Pagado" con la ETT, desde que sale la remesa (30-10-2026).** El trabajador ve "Pagado" desde el
  día en que la ETT manda al banco la remesa de ese turno (`fn_shift_ett_payout_sent_on`), sin esperar
  a la confirmación, que llegaba de 4 a 14 días tarde. No cambia `payment_status_id`.
- **En pago directo, `payment_status_id = 8` ("Pagado") lo marca la propia empresa** desde su panel.
  Es autodeclarado, no una transferencia verificada: no sirve para afirmarle a nadie que ya cobró.
  Lo marca al mandar el resumen a su gestoría, normalmente días antes de pagar.
- **Desde el 14-10-2026 la fecha límite del pago directo la calcula la base** (`fn_shift_direct_payout_due_date`).
  Sale del texto de `payment_conditions` traducido por la IA a reglas (`payment_schedule`). Mientras no
  pase esa fecha, el trabajador ve "Procesando pago, como tarde el X" aunque la empresa lo haya marcado.
  Lo que ve lo decide `fn_worker_payment_status`, y **nunca se vuelve a escribir a mano**. Si la condición
  no está entendida, se enseña lo de siempre (decisión A de Crescente). Ficha: `features/fecha-pago-directo.md`.
- **El estado de Shifty no acredita la recepción de un pago de Lanak.**
  `payment_status_id = 8` existe también en turnos ETT; es falso que todos
  permanezcan en `7`. Antes de afirmar
  qué pasó en un servicio, consultar su estado actual y el correo o justificante
  de Lanak; una remesa, un estado 8 y un ingreso recibido no son equivalentes.
  Una reclamación de impago se toma en serio si el trabajador reporta que no
  recibió el dinero y consta que trabajó el servicio.

---

## 6. Cancelaciones y puntos

Dependen del tiempo **antes del turno**, no del momento de cancelar:

| Antelación | Consecuencia |
|---|---|
| ≥ 72 h | 0 puntos, cancelación libre |
| < 72 h y ≥ 48 h | −1 punto |
| < 48 h y ≥ 24 h | −2 puntos |
| < 24 h | 0 puntos, **pero** exige baja médica. Sin ella: **suspensión de 3 meses desde la primera vez** |

**La ventana de cancelación libre es de 4 horas** desde la selección, y tiene **prioridad** sobre
todo. Verificado: la base pone 4 horas en los tres sitios que la fijan (al seleccionar candidato, al
cambiarle el horario y al cambiarle la vestimenta).

⚠️ **Esa ventana solo se pone si la persona se apuntó ella.** Si viene de una invitación de la
empresa, el campo se queda vacío y no tiene ventana. **Es a propósito.**

Al explicárselo a un trabajador, separar siempre las dos consecuencias: perder puntos no es lo mismo
que la suspensión de cuenta. Nunca meterlas bajo un genérico "penalización".

---

## 7. El precio público de la web

**No se ofrecen planes nuevos.** Precisado por Crescente el 2026-09-02, y el matiz importa:

- **De cara al público no se ofrece ningún plan.** Ni Gratis, ni Pro 59 €, ni +ETT 99 €. La web y
  cualquier copy hablan del modelo único. Si una página sigue ofreciendo planes, está desactualizada.
- **Pero los planes NO están muertos.** Hay clientes que tienen el suyo y **lo mantienen tal cual**.
  Las 21 filas de `subscription_plans` son reales y están en uso.
- **El sistema sigue vivo y se configura por detrás**, como está montado hoy. **No se toca.** Nada
  de limpiar planes, unificarlos ni retirar los que parezcan viejos: si alguien los tiene asignados,
  se quedan. Y editar un plan con empresas asignadas cambia las condiciones económicas de todas
  ellas, así que sigue haciendo falta el OK explícito (regla 12 del maestro).

Modelo único, a demanda, sin cuotas ni permanencia: **desde 18,80 €/hora todo incluido**
(10,00 € de salario × 1,505 de coeficiente × 1,25 de comisión). Es un **suelo publicado**: donde el
convenio paga más, sube. Barcelona sale sobre 21,85 €/h.

**El coeficiente es un multiplicador sobre el salario, no un precio por hora.** Nunca escribir
"1,60 €/h de coeficiente".

**Una sola base en toda la web: el precio todo incluido.** Nunca mezclar en la misma página el
coeficiente pelado con el precio todo incluido. **El precio vive en doce ficheros de la web**: al
cambiarlo hay que barrerlos todos.

Dos promesas que sostienen el precio y no se matizan nunca: **si el turno no se cubre, no se cobra**,
y **el trabajador no paga nada, nunca**. Y "prueba y contrata": se puede probar a alguien hasta 3
meses y quedárselo sin fee de contratación.

---

## 8. Partners y líneas de ingreso

Shifty ingresa por tres vías: la comisión por turno del plan estándar, los planes negociados a medida
con empresas de volumen, y los clientes que llegan por partner.

**Lanak** es el partner ETT: firma el contrato y paga la nómina cuando el turno va por ETT.
**SomosCocina** y **Mahou** son partners de distribución: sus clientes entran por SSO y la comisión
se liquida por **transferencia mensual al partner**, sin tarjeta del hostelero.

---

## 9. Al responder sobre dinero

- **Nunca inventar una cifra.** Se consulta la base y se responde con el valor de ahora.
- **Facturas canceladas o anuladas no cuentan como facturación.** Al responder "cuánto facturó X",
  excluir siempre `status IN ('cancelled','void')` e `is_deleted = true`.
- **Stripe son dos sistemas independientes:** el de suscripciones y el de comisiones por turno. Que
  exista uno no implica que exista el otro.
- **Un turno de pagador directo NUNCA entra en el flujo de pagos ETT.** Se gestiona en `/gestoria`.
  Al aceptar horas salta directo a `payment_status_id = 5`. (2026-05-06: 31 turnos directos colados
  en remesas ETT por un filtro que faltaba.)
- **Nada de crear, modificar ni eliminar registros de pago** para empresas que no sean de test sin
  aprobación explícita en esa misma conversación.
