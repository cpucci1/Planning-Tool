---
name: shifty-soporte-trabajador
description: >
  Qué se le contesta a un trabajador y qué le bloquea de verdad: los requisitos reales para
  apuntarse a un turno, cómo funcionan las invitaciones y en qué se saltan las puertas del anuncio,
  los documentos de identidad y su caducidad, el rechazo en la entrevista, cuándo se puede cuadrar
  unas horas por nuestra cuenta y cuándo va a Federico, la reconfirmación y los no-shows. Úsala
  SIEMPRE antes de redactar una respuesta a un trabajador, al revisar incidencias, al explicar por
  qué alguien no puede apuntarse o aceptar, y cuando alguien diga "no me deja aplicar", "por qué no
  le sale el anuncio", "revisa esta incidencia", "cuadra estas horas" o "qué le contesto".
---

# Soporte y elegibilidad del trabajador

Estas reglas son decisiones de Crescente del **2026-06-22**, escritas porque la resolución de
incidencias venía fallando por no leer la documentación. **No son criterio de nadie más: se aplican
tal cual.**

Antes de redactar cualquier respuesta de selección, documentos o elegibilidad, leer también
`Docs/docs/shared/governance.md`, `shared/business-rules.md`, `shared/status-ids.md` y los
`features/onboarding*.md`.

---

## 1. Qué bloquea de verdad para apuntarse

Verificado en `get_job_offer_details`, `apply_to_job_days` y `can_worker_see_offer`. Puede aplicar si:

- **no está baneado**,
- tiene los **cinco datos de perfil**: NIF, fecha de nacimiento, nacionalidad, número de la Seguridad
  Social e IBAN,
- tiene **al menos una categoría aprobada**, y esa categoría vale para ese anuncio,
  (con el flag `eligibility_by_subcategory` encendido para esa empresa, la que vale es la **subposición**
  del puesto, p. ej. Cocinero y no Cocina: lo decide `fn_job_offer_required_category_id`, que usan la
  ficha y la puerta a la vez; ver `features/calidad-candidatos-motivos-encaje-subposiciones.md`),
- y su **documento de identidad no caduca antes de la fecha del turno**.

**Lo que no esté en esa lista no bloquea.** Un documento en `pending_review` o `rejected` no impide
apuntarse mientras `identity_document_status` sea `approved` y no esté caducado. Ojo:
`identity_document_status` es **pegajoso**, se queda en `approved` aunque luego se rechace una subida.

---

## 2. Las invitaciones: qué se salta a propósito y qué no

**Si una empresa invita a alguien, esa persona debe poder aceptar.** Regla de Crescente. Por eso el
camino de invitación **no comprueba la categoría aprobada**, ni al enseñar la ficha ni al aceptar.
Está escrito a propósito en el código. Hoy hay 299 días-jornada invitados a gente sin esa categoría y
22 acabaron en el turno. **Esto es correcto: invita una persona, no el algoritmo.**

**Lo que NO debe saltarse:** un trabajador **baneado o suspendido no puede aceptar una invitación.**
Decisión de Crescente del 2026-09-02. Hoy el camino de invitación **no mira el estado del
trabajador** en ningún punto: ni `get_invitation_detail`, ni `accept_invitation`, ni
`select_job_day_candidates_for_worker`. Son 481 baneados y 39 suspendidos, y el estado suspendido
(el que pone el flujo de no-show) **no lo comprueba ninguna de las ocho funciones del camino**.
**Pendiente de arreglar.**

**Tampoco tienen ventana de cancelación libre.** Las 4 horas solo se ponen a quien se apuntó él.
Es a propósito.

---

## 3. Documentos

- **Un documento de identidad CADUCADO sí impide trabajar** turnos con fecha posterior a la
  caducidad, y **basta un solo día posterior para bloquear el anuncio entero**, aunque el trabajador
  quisiera apuntarse solo a los días anteriores.
- ⚠️ **Hay un fallo abierto**: la ficha del anuncio solo mira la caducidad **si el trabajador terminó
  el onboarding**; la función que le apunta la mira **siempre**. Hay **635 trabajadores** con
  caducidad puesta y el onboarding a medias que ven el botón Solicitar encendido, pulsan, y reciben
  "todo bien, 0 días apuntados". Ni error ni aviso. El flag `document_expiration_notifications` está
  encendido, así que **está pasando ahora**.
- ⚠️ `apply_to_job_days` **no revalida la caducidad**, solo mira si está rechazado. El camino normal
  de la app está cubierto, pero un enlace directo o una navegación cacheada podrían colarla.
- ⚠️ El **feed tampoco filtra** los anuncios bloqueados por caducidad: se siguen viendo y el botón no
  se deshabilita. El corte salta al pulsarlo. Por eso llegan a soporte como "no me deja apuntarme".
- **Para un trabajador español el documento obligatorio es el DNI en vigor.** El pasaporte no sirve
  para el alta. Se le pide el DNI; no se acepta el pasaporte ni se escala a producto.
- **Sin número de afiliación a la Seguridad Social no se puede trabajar en Shifty**: hace falta para
  el alta y el contrato. Es un requisito, no hay nada que elevar.
- **Al subir un documento que NO es de identidad, `identity_set_type` se deja SIN PONER.** Un
  certificado de formación no es un documento de identidad. Etiquetarlo como tal hizo que el
  validador juzgara **392 carnets** como si fueran un DNI y que la caducidad del certificado
  **sobrescribiera la del DNI real de 10 personas**.

---

## 4. Selección

- **Tras un rechazo en la entrevista, los 2 meses son cuándo puede volver a aplicar**, no cuándo
  revisaremos su caso. Correcto: *"de momento no continuamos porque no cuentas con la experiencia
  suficiente; dentro de 2 meses podrás volver a aplicar"*. Incorrecto: *"en 2 meses lo miraremos"*.
- **No existe notificación de no-selección.** La candidatura caduca o se marca `rejected` sin aviso.
  Lo que sí hace el sistema es cancelar automáticamente las otras candidaturas del trabajador que
  **se solapan ese mismo día**. Nunca decir que "la plaza se reasigna": no es lo que pasa.

---

## 5. Respuestas y escalado

- **Las incidencias se contestan por CORREO, nunca por el chat de la app.** Correcto: *"se lo elevo
  al equipo, te responden por correo en cuanto tengan respuesta, revisa también el spam"*. Incorrecto:
  *"te escriben por aquí"* (error real del bot, 2026-07-02).
- **En pagos solo se resuelven solas las dudas informativas**: cómo y cuándo se paga, bruto y neto,
  plazos vigentes, empresa que paga directo dentro de plazo. Un **problema** de pago, una
  **discrepancia de importe** o un pago con el **plazo ya vencido** no se automatizan nunca: borrador
  asignado a **Federico**.
- **Las propuestas de mejora de la app se asignan a Crescente** (producto), no a operaciones.

---

## 6. Rectificación de horas

**Cuadrar por nuestra cuenta (`square_shift` y resolver) exige las tres condiciones a la vez:**

1. la empresa **no ha cuadrado** (sin `company_reported_time_*` ni `billing_time_*`),
2. **hay fichaje GPS** que lo corrobora,
3. la corrección que pide el trabajador es coherente con ese fichaje **o lo ajusta a la baja**.

Antes de proponer nada, revisar **todos** los turnos de esa persona en esas fechas, y si es **jornada
partida**, los dos tramos: a veces lo que reclama ya está cobrado en el segundo.

**No se fijan las horas** cuando no hay fichaje que lo corrobore, cuando reclama **más** horas de las
registradas, cuando hay dos turnos o una jornada partida mezclados, o cuando **la empresa ya cuadró**
y hay discrepancia. Los cuatro van a **Federico**.

Y ojo con el estado: **`hours_reconciliation_status_id = 2` con la facturación a medias es normal**,
no un agujero. Pendientes son solo los de estado `1`.

---

## 7. Reconfirmación y no-shows

- **Con menos de 24 h de margen la reconfirmación es más necesaria, no menos**: es lo único que
  confirma que la persona se va a presentar, y con poco margen no da tiempo a buscar sustituto. El
  fallo real no es pedirla tarde, es que la escalada necesita 10 horas para completarse (4 + 4 + 2) y
  que el aviso puede no llegar a salir sin que nadie se entere. **Nunca proponer no pedirla,
  retrasarla o marcarla no exigible.**
- **Un fallo de entrega de notificación no es culpa de la empresa cliente.** Si un aviso no sale, se
  arregla la entrega: reintentos, registro de entrega real y alerta cuando un aviso crítico no sale,
  y se perdona caso por caso cuando se demuestre. No se le quita a la empresa la opción de marcar la
  falta: ella solo ve que la persona no apareció.
- **Un motivo de rechazo nuevo en el backend hay que cablearlo en la app del trabajador.** Si cae en
  el caso por defecto, el trabajador lee "inténtalo de nuevo", que es lo peor que se le puede decir a
  quien le falta un papel.
