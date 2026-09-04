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

**El porcentaje de base es el 25 %.** Está puesto como valor por defecto en las vistas. Los clientes
con condiciones negociadas tienen el suyo, que se busca primero en la jornada, luego en la oferta y
luego en la empresa.

- **Ejemplo ETT:** 10 €/h × 8 h = 80 € de bruto. Coeficiente 1,505 → coste ETT 120,40 €. Comisión
  del 25 % = 30,10 €. Total empresa = 150,50 €.
- **Ejemplo directo:** 80 € de bruto. Comisión del 25 % = 20 €. Total empresa = 100 €.
- **INCORRECTO en ETT:** aplicar el 25 % solo al bruto. Se deja fuera el coste de la ETT.

⚠️ **`Client-App/CLAUDE.md` línea 368 dice lo contrario y está mal.** Manda esta tabla.

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

### La regla

La tarifa **solo se puede subir, nunca bajar**. Y si la empresa tiene **pago fijo por posición**
activado (`companies.fixed_position_pay_enabled`, hoy **6 empresas reales**), la tarifa **no se
puede editar en absoluto**: la fija el puesto (`position_types.fixed_hourly_rate`, puesta en 38
posiciones de 8 empresas) y se copia al crear el anuncio.

### Las cuatro puertas, y las dos que no comprueban nada

| Camino | Solo subir | Tarifa fija | Convenio | Permisos | Candidatos | Rastro |
|---|---|---|---|---|---|---|
| `update_job_day_hourly_rate` | sí | sí | sí | sí | sí | sí |
| `update_job_offer_hourly_rate` | sí | sí | sí | sí | sí | sí |
| `update_multiple_job_days_hourly_rate` | **no** | **no** | **no** | sí | **no** | **no** |
| El modal escribiendo directo | **no** | **no** | **no** | **no** | **no** | **no** |

**`update_job_day_hourly_rate` es la implementación de referencia.** Comprueba la sesión, los
permisos, bloquea si la empresa tiene pago fijo, exige que la tarifa suba, respeta el mínimo del
convenio, se niega si ya hay alguien seleccionado o turnos vivos, y deja rastro con quién, cuándo y
de qué a qué. **Cualquier camino nuevo debe hacer las siete cosas.**

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
- **El importe de la app es BRUTO.** El neto es el bruto menos **IRPF solamente**. La Seguridad
  Social la paga la empresa **por encima** del salario, nunca se le descuenta al trabajador. Sí
  cotiza y le cuenta para su vida laboral y el paro.
- **En pago directo, `payment_status_id = 8` ("Pagado") lo marca la propia empresa** desde su panel.
  Es autodeclarado, no una transferencia verificada: no sirve para afirmarle a nadie que ya cobró.
- **Los pagos de Lanak NO se registran.** `payment_status_id` nunca pasa de `7` ("Solicitado") para
  turnos ETT, porque nunca recibimos justificante. Decir "figura como solicitado sin justificante" es
  cierto para **todos** los pagos de Lanak de la historia: **no prueba nada**. Una reclamación de
  impago se basa en el reporte del trabajador y en que trabajó ese turno.

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
