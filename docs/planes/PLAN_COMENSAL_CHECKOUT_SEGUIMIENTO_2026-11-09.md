# Plan · Comensal: entrada, checkout y seguimiento (ficha 1.12) · 2026-11-09

Ficha **1.12** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md), la última de la Ola 1. Hallazgos: **M01, M05, M06, X23**, más **PA-T26** (teclado abierto en el checkout) que dejó pendiente la 1.11. Rama `feat/checkout-seguimiento`, apilada sobre la 1.11 (`feat/comensal`, PR #107).

> **Estado:** diagnóstico hecho; propuesta y [maqueta](../diseno/MAQUETA_CHECKOUT_SEGUIMIENTO_2026-11-09.html) **pendientes de aprobación**.

## 1. Diagnóstico (comprobado en código y en pantalla a 390 px, Rincón 502)

| # | Problema | Dónde | Hallazgo |
|---|---|---|---|
| 1 | **La confirmación promete lo que no sabe.** Dice «Rincón 502 ya recibió tu pedido **y lo está preparando**» aunque nadie lo ha aceptado, y «Tiempo estimado: 20–30 min», un texto fijo e igual para todos. | `checkout-success.tsx`, `theme/defaults.ts` | M06, X23 |
| 2 | **Textos editables que suenan a promesa:** «Valor del tiempo» (20–30 min) y «El restaurante fue notificado al instante» se editan en el tema como si fueran datos. | editores de tema | X23 |
| 3 | **El seguimiento junta recibido y aceptado.** Sólo hay «Recibido → En preparación → Listo → Entregado»; no se distingue que el restaurante lo aceptó, ni cuándo, ni cuánto falta de cocina, aunque la base guarda `accepted_at`, `ready_at` y cada plato preparado (1.5). Bajo «Recibido» repite «Tiempo estimado: 20–30 min». | `order-tracker.tsx` | M06 |
| 4 | **Si tarda en aceptarse, no dice qué hacer.** No hay aviso ni forma real de contactar (el local tiene WhatsApp configurado). | `order-tracker.tsx` | M06 |
| 5 | **La mesa del QR no se confirma ni se valida.** Con `?mesa=999` (Rincón tiene 20 mesas) entra a la carta sin decir en qué mesa está, ofrece «Llamar al mesero» y dejaría pedir para una mesa inexistente; el servidor tampoco lo revisa. | `menu-client.tsx`, `lib/actions/orders.ts` | M01 |
| 6 | **Sin conexión dice «Sin conexión»** y luego «Tu pedido se guardó»; no dice con claridad que **aún no se envió** al restaurante. | `checkout/form-parts.tsx` | M06 |
| 7 | **Superficies de vidrio** en el seguimiento (tarjeta translúcida sobre el fondo). | `order-tracker.tsx` | F10 |

Lo que **sí** está bien y se conserva:

- En mesa el teléfono ya es opcional y no se pide dirección.
- Los errores salen junto al campo.
- La cola sin conexión reintenta sola con el mismo identificador, así que no duplica el pedido.
- Cancelar sólo se ofrece mientras está «Recibido».

## 2. Propuesta

### Entrada por QR (M01)

- **La carta dice la mesa:** «Mesa 4 · tu pedido llega a esta mesa», arriba de la carta y también en el checkout.
- **Mesa que no existe:** «La mesa 999 no existe en Rincón 502. Escanea el QR de tu mesa o pide ayuda al personal». No se guarda esa mesa y el servidor rechaza un pedido en mesa fuera del rango del local (ver decisión 3).

### Confirmación (M06, X23)

- «**Pedido enviado.** Rincón 502 lo recibió; te avisamos aquí cuando lo acepte.» Sin «lo está preparando».
- **Tiempo:** un rango **calculado con los pedidos recientes del local** («Suele tardar 15–25 min»), sólo si hay datos suficientes. Si no los hay, no se muestra ningún tiempo (ver decisión 1).
- Fuera de los editores de tema «Valor del tiempo» y «Notificado».

### Seguimiento (M06)

- Pasos con hora real:
  - **Recibido** (hora del pedido);
  - **Aceptado** (`accepted_at`);
  - **Preparando** («2 de 3 platos listos», con lo que cocina marca);
  - **Listo** (`ready_at`);
  - **Entregado** o **Servido**.
- **Si sigue en «Recibido» más de 5 minutos:** «El restaurante aún no lo acepta» con su WhatsApp o teléfono reales. En mesa: «Pregunta al personal». Ver decisión 2.
- Superficies sólidas del tema.

### Sin conexión

- «**Aún no se envía.** Tu pedido está guardado en este teléfono y se enviará solo cuando vuelva la señal.» Sigue reintentando con el mismo identificador.

### Teclado (PA-T26)

- A 390 px con el teclado abierto, el último campo y «Confirmar pedido» siguen alcanzables.

### Fuera de esta ficha

Programar pedidos según capacidad real (2.x) · revalidar precios cambiados antes de enviar (4.6) · medir el abandono por campo.

## 3. Migración

**No hace falta.** Las horas (`accepted_at`, `ready_at`, `cocina_preparada_at`) y el WhatsApp del local ya existen. El rango de tiempo se calcula al leer el pedido.

## 4. Decisiones del dueño (pendientes)

1. **Tiempo estimado:** un rango calculado con los pedidos recientes del local, sólo con datos suficientes (propuesta), o no mostrar ningún tiempo.
2. **Aviso si no lo aceptan:** a los 5 minutos (propuesta) o a los 10.
3. **Mesa que no existe:** avisar y no dejar pedir a esa mesa (propuesta), o avisar pero permitirlo.

## 5. Pruebas previstas

- Unitarias: rango de tiempo con pocos y muchos datos; pasos del seguimiento por estado y tipo; mesa válida o inválida.
- Navegador: 390 px con teclado abierto; seguimiento que pasa de recibido a aceptado, preparando y listo; QR con mesa inválida; sin conexión.
