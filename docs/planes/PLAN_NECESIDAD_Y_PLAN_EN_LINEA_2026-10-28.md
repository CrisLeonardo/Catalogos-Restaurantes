# Plan: funciones que crean una necesidad y plan «En línea» · 2026-10-28

**De dónde sale:** el dueño preguntó el 2026-10-28 si se puede agregar algo al sistema que haga **necesario** adquirirlo —atractivo en utilidad, visual y comodidad, tanto para el restaurante como para sus clientes— y si conviene tocar los planes para cubrir mejor los distintos tipos de cliente, incluidos los que **solo venden en línea**.

**Estado:** propuesta. Nada de esto está aprobado ni construido. Cada fase se aprueba por separado y, al empezar, se le crea su rama y su PR.

**Tesis:** Leogin ya vende «control» y «se ve bonito». Falta lo que se siente en la cartera: que el dueño vea que **recupera o ahorra dinero**. Hoy nadie compra por eso porque ninguna función lo dice. Y mientras no haya clientes, el cuello de botella sigue siendo vender (ver [`ANALISIS_NEGOCIO_2026-08-17.md`](../negocio/ANALISIS_NEGOCIO_2026-08-17.md)), así que se priorizó lo que **se puede enseñar en una visita de 90 segundos**.

**Reglas que no se rompen:** superficies sólidas, nada translúcido · solo se anima `transform` y `opacity` · nada de datos inventados (los números salen de pedidos reales; si hay poca historia, no se muestra) · Leo nunca dentro del menú de un restaurante · pocas decisiones para el dueño (la auditoría de experiencia dijo que sobran).

---

## 1. Funciones que crean la necesidad

| # | Función | Necesidad que crea | Para el comensal | Esfuerzo |
|---|---|---|---|---|
| N1 | **Contador «tu canal propio vs. las apps»**: «este mes cobraste Q X directo; en una app al 25–30 % habrías pagado Q Y» (porcentaje editable) | Justifica la mensualidad cada mes. Sirve también de calculadora en `/vende-en-linea` | — | Bajo |
| N2 | **«Hazlo por mí»**: foto de la carta → menú listo (EV-07 de la auditoría de experiencia) | El menú ya está subido antes de que digan «no tengo tiempo». En la visita se arma en vivo | Menú completo desde el día 1 | Medio (visión con IA, centavos por uso) |
| N3 | **«Tus clientes que se fueron»**: lista de quienes no vuelven en 30 días + mensaje de WhatsApp listo con cupón, un toque. Después, «te trajo Q X» | Recuperar dinero que hoy se pierde sin saberlo | Recibe un cupón en el momento justo | Medio |
| N4 | **Pago por transferencia con comprobante**: el cliente sube la foto, el dueño confirma con un toque (pasarela de pago, más adelante) | Es el hueco mayor de quien solo vende en línea: hoy no hay forma de cobrar dentro del sistema | Pide y paga sin coordinar por chat | Medio |
| N5 | **Resumen nocturno del dueño**: ventas, anulaciones, diferencia de caja y stock bajo, por push o correo | Es la promesa «bajo control» llevada al bolsillo, sobre todo para quien no está en el local | — | Medio (hoy el resumen solo sale al cerrar caja; no hay cron) |

Comodidades baratas para el comensal, que pueden ir sueltas:

- «Repetir mi último pedido» en un toque, apoyado en la billetera.
- Pedir reseña de Google cuando la encuesta sale de 5 estrellas.
- Tiempo estimado en el seguimiento del pedido.

**Fuera de esta tanda, pero anotada:** FEL (factura electrónica). Es la única necesidad **obligatoria por ley** y donde Vendty gana hoy; está apagado a propósito hasta elegir certificador. Es un trabajo grande y merece su propio plan.

**A confirmar antes de prometer N3:** si ya se guardan los teléfonos de los clientes de «para llevar» y «a domicilio». De eso depende cuánto cuesta.

## 2. Plan «En línea»

### Por qué

- Quien solo vende en línea cae hoy en **Estándar** (Q199), que no trae cupones, lealtad ni impresión; o en **Premium** (Q349), donde paga panel de mesero y salón que no usa.
- El salto de gratis a Q199 más Q300 de alta es grande para un emprendedor pequeño (queda por decidir si el alta se rebaja; ver §4).

### Propuesta

Un **solo plan nuevo, «En línea», a Q249/mes**, entre Estándar y Premium.

| | Estándar | **En línea (nuevo)** | Premium |
|---|---|---|---|
| Precio | Q199 | **Q249** | Q349 |
| Canales | 2 de 3 a elegir | **Para llevar + a domicilio** | Los 3 |
| Cupones y lealtad | No | **Sí** | Sí |
| «Tus clientes que se fueron» (N3) | No | **Sí** | Sí |
| Pago por transferencia (N4) | Sí | **Sí** | Sí |
| Impresión de comandas | No | **Sí** | Sí |
| Finanzas | Sí | **Sí** | Sí |
| Usuarios | 2 | **3** (repartidor y cocina) | Ilimitados |
| Salón, mesero, reservas, lista de espera, llamar al mesero | No | **No** | Sí |

Mensaje: «no pagas lo que no usas». No canibaliza Premium porque quien tiene salón sigue necesitándolo. Estándar queda como la entrada barata para quien solo quiere recibir pedidos.

### Lo que NO se hace

- No se agregan más planes ni se vuelve a los módulos a la carta (decisión de 2026-08-21: planes fijos).
- No se publica el plan hasta validar el precio con los primeros 3 prospectos y construir al menos N3 y N4, que son lo que lo justifica.

## 3. Fases

| Fase | Contenido | Rama sugerida | Casilla |
|---|---|---|---|
| 0 | Dejar `PRECIOS_VIGENTES.md`, `Cotizador.xlsx` y el `.docx` de planes al día (siguen hablando de módulos a la carta y «Plan a tu medida», que el código quitó el 2026-08-21) y decidir el Panel de grupo (Q299) | `docs/precios-al-dia` | [ ] |
| 1 | N1 contador de ahorro en Hoy + calculadora en `/vende-en-linea` | `feat/ahorro-canal-propio` | [ ] |
| 2 | N2 «Hazlo por mí» | `feat/hazlo-por-mi-menu` | [ ] |
| 3 | N3 «Tus clientes que se fueron» (primero confirmar los datos de teléfono) | `feat/clientes-que-se-fueron` | [ ] |
| 4 | N4 transferencia con comprobante | `feat/pago-transferencia` | [ ] |
| 5 | N5 resumen nocturno | `feat/resumen-nocturno` | [ ] |
| 6 | Plan «En línea»: `plans.ts` + migración que reconcilia `platform_settings` y las funciones de cobro (`leogin_compute_monthly_fee`, `leogin_fee_breakdown`) + `/planes`, registro y `/vende-en-linea` | `feat/plan-en-linea` | [ ] |

Cada fase con migración dice en su PR el orden respecto al despliegue. La fase 6 es la última a propósito.

## 4. Decisiones que le tocan al dueño

- [ ] ¿Q249 es el precio correcto para «En línea»? Validarlo con prospectos reales antes de la fase 6.
- [ ] ¿Se rebaja o se omite el alta de Q300 para «En línea», dado que son negocios más pequeños?
- [ ] ¿Qué se hace con el Panel de grupo a Q299, que cuesta más que Estándar completo?
- [ ] ¿FEL entra en el siguiente plan grande?

## 5. Cierre

Al terminar cada fase: casilla marcada y commit de cierre anotado en este mismo archivo. Al completar todo, mover con `git mv` a `docs/archivo/planes-cerrados/` y pasar lo pendiente a `docs/registros/CHECKLIST_CORRECCIONES.md`.
