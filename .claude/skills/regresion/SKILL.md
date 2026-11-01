---
name: regresion
description: >-
  Antes de dar por bueno un cambio que puede cambiar un resultado, ejecuta la versión de antes y la
  de después sobre casos reales, en solo lectura, y explica cada diferencia: o es el fallo que se
  arregla, o es una regresión y se para. Úsala SIEMPRE que cambies una regla, un cálculo de dinero,
  a quién se avisa o quién ve qué, una nota, un orden, un estado, o el modelo o las instrucciones de
  una IA, y cuando alguien diga "comprueba que no cambie nada", "compara antes y después", "a cuánta
  gente afecta" o "pruébalo con casos reales". Va después de mapa-de-impacto, que dice dónde mirar.
---

# Regresión: lo de antes contra lo de después, con casos reales

Nace el 13-10-2026 junto a `mapa-de-impacto`. El mapa dice **dónde** puede romperse algo; esta skill
dice **si se ha roto**, con números.

No se inventa aquí: es la "comparación en sombra" del plan de una lógica, un sitio (sus reglas de
producción, punto 2), que funcionó en todas sus tandas de septiembre y octubre de 2026. Ejemplos
reales: en la cascada de avisos, de 14.680 parejas reales el conjunto avisado cambiaba en 1 anuncio
y 1 persona; en la cuota mensual, 0 diferencias al céntimo en 12 meses; al
cambiar de modelo de IA, 20 resúmenes reales comparados uno a uno antes de publicar. Esta skill lo
saca del plan para que valga en **cualquier** cambio, no solo en esas tandas.

## Cuándo hace falta y cuándo no

**Hace falta** si el cambio puede cambiar lo que sale: un importe, una hora, un estado, quién
recibe un aviso, quién ve un anuncio, una nota, un orden de candidatos, un texto que decide la IA.

**No hace falta** si el cambio no puede alterar ningún resultado: un comentario, un permiso que no
usaba nadie, un renombrado interno sin efecto fuera. Dilo en una línea y sigue.

Si dudas, hazla: es barata comparada con descubrirlo en una incidencia.

## Paso 1. La foto de antes

Una consulta de solo lectura que diga qué contesta hoy la regla para casos reales. Se apunta con su
fecha. Y antes de comparar, decide **qué casos**:

- **Todos los casos reales** cuando caben (todas las parejas persona-anuncio de 60 días, todos los
  turnos de 90). Una muestra esconde justo el caso raro que se rompe.
- **Los que de verdad pasan por ahí**: si la regla solo se ejecuta para anuncios abiertos, los
  anuncios que estuvieron abiertos, no todos los de la base.
- **Fuera los de prueba** (`is_test`) en el recuento, pero úsalos para probar lo que escribe.

## Paso 2. La versión nueva, sin que nadie la llame

**En la base:** la versión nueva se crea como función **temporal** (`pg_temp`), que solo existe en
esa llamada y desaparece sola: no queda nada que borrar después, y la caja negra
(`function_versions`) no la apunta. Se parte del cuerpo real de producción, nunca retranscrito
(`shifty-base-de-datos` §6 bis), cambiando solo lo que cambia.

```sql
create function pg_temp.mi_regla_nueva(...) returns ... language plpgsql as $$ ... $$;

with casos as ( /* los casos reales del paso 1 */ )
select c.*, public.mi_regla(c.a, c.b) as antes, pg_temp.mi_regla_nueva(c.a, c.b) as despues
  from casos c
 where public.mi_regla(c.a, c.b) is distinct from pg_temp.mi_regla_nueva(c.a, c.b);
```

Todo en **una sola llamada**: la función temporal no sobrevive a la siguiente. Si la función mira
quién llama (sesión de empresa, de trabajador o del equipo), por SQL se llama sin sesión y las dos
versiones pueden contestar distinto por eso, no por el cambio: compara la parte que **calcula**
(la función interna que decide), no la puerta de entrada. Si lo que cambia
escribe en tablas, no se ejecuta sobre casos reales: se prueba con datos de prueba dentro de una
transacción que se deshace, y la comparación se hace sobre lo que **calcula**, no sobre lo que
escribe.

**En una función del servidor o una IA:** los mismos N casos reales con la versión de producción y
con la nueva (20 es el mínimo que se ha usado), comparando lo que importa uno a uno: el resultado,
el orden, las alertas, el coste y el tiempo. Sin mandar datos de personas a un proveedor sin
contrato (reglas comunes, seguridad).

**En el código de las apps:** no hay sombra. La regresión es: los tests (`npm test` en `Web-Panel` y
en `Worker-App`), el tipado y la compilación, y abrir las pantallas del mapa con los mismos datos
antes y después.

## Paso 3. Explicar cada diferencia

Cada diferencia tiene que caer en uno de dos sitios:

1. **Es el fallo que se arregla.** Entonces se dice a quién afecta: cuántas personas, empresas o
   turnos, y de qué a qué.
2. **Es una regresión.** Se para, no se aplica, y se cuenta.

Una diferencia que no sabes explicar **es una regresión hasta que la expliques**. "Seguramente es
ruido" no vale: el azar se comprueba repitiendo, como se hizo con los desempates de la cascada.

## Paso 4. Quién decide

- **Cero diferencias: se aplica** y se cuenta.
- **Dinero:** regla de Crescente del 09-10-2026: si las únicas diferencias son exactamente el fallo
  confirmado y no tocan facturas ya emitidas, se aplica y se apuntan las cifras. Si cambia algo fuera
  de eso, no se aplica y se le cuenta.
- **Una decisión sobre una persona** (si se le avisa, si puede apuntarse, si se le sanciona): se le
  enseña la diferencia a Crescente con cifras y se espera su OK.
- **Cualquier otra diferencia que no sea el arreglo:** se le cuenta antes de aplicar.

## Paso 5. Aplicar y dejar la vuelta atrás

Si el mapa incluye WhatsApp empresarial, ejecuta en Web-Panel las pruebas de
`supabase/functions/_shared/empresa-whatsapp_test.ts` y las del handler real de
`supabase/functions/clara-respond/regression_test.ts`, sin red ni envíos. Si cambia la extracción de
pedidos, pasa además `scripts/banco-empresas-whatsapp.ts` con la clave de pruebas y el gasto registrado.
Las escrituras de publicación se verifican con cuenta y empresa test y reversión transaccional.
La huella de `app_config.whatsapp_bot_empresa_contracts` se actualiza únicamente después de explicar
las diferencias y dejar la evidencia; nunca para quitar un bloqueo sin haber revisado el cambio.

- Se aplica partiendo del cuerpo real de producción, con una sustitución exacta.
- **La vuelta atrás es la versión anterior en `function_versions`**: se apunta su identificador en la
  ficha del cambio, como se hizo en todas las tandas del plan.
- Tras aplicar, se repite la comparación una vez contra la versión ya publicada: tiene que dar lo
  mismo que la sombra.

## Cómo se le cuenta a Crescente

Una o dos líneas, con cifras. Por ejemplo: *"He comparado la regla nueva con la de ahora sobre los 1.240 turnos
reales de 90 días: cambian 3, los tres son el fallo que arreglamos (pasaban a cobrar 2 h que no les
tocaban). No cambia nada más."* Si hay que decidir, las opciones con una recomendación.
