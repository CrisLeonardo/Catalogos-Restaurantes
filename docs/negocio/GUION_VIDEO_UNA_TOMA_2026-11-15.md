# Serie «Una sola toma» — guion y decisiones (2026-11-15)

Video promocional pensado para que Leogin se venda solo. Debe enganchar desde el segundo 0 y salir en **dos formatos**: horizontal para enseñarlo en persona en los restaurantes (PC o tableta) y vertical para TikTok y Reels. No reutiliza nada del estilo de «Bajo control» (papel stop-motion, capturas con zoom, marimba), que el dueño rechazó.

El mismo día el dueño aprobó el primero y pidió **una serie de tres**, una por tipo de negocio, porque un solo video le habla mejor a uno que a todos. También **quitó la prueba gratis** de todo Leogin (PR de la migración 182), así que el cierre ya no ofrece «30 días gratis». Tampoco dice precios, para poder cambiarlos sin rehacer los videos: cierra con lo que gana el dueño, `distleogin.com` y el QR.

Código: [`promo-video/src/una-toma/`](../../promo-video/src/una-toma/). Cómo se exporta: [`promo-video/README.md`](../../promo-video/README.md#una-sola-toma).

## La idea

**Un pedido cruza todo el restaurante sin un solo corte.**

Cada video es un único plano continuo. Una chispa de luz (el pedido) sale del aparato donde nace el pedido y la cámara la persigue volando entre los aparatos del restaurante. Al final la cámara se aleja y deja ver el camino completo, con Leogin al centro conectando todo.

- **Nunca hay corte**: el ojo no encuentra un punto para irse.
- **La chispa explica el producto sin palabras**: lo que pasa en un aparato llega solo a los demás.
- **El gancho es un dolor que el dueño reconoce y da risa.** Esa «forma vieja» se rompe en dos y de ahí nace la chispa.
- **Se entiende sin sonido**: una palabra grande cambia al ritmo de cada toque.
- **Muestra la app real**: las pantallas reproducen el panel y la carta de Leogin con los datos de Rincón 502.
- **Cierra sin precio**, con el beneficio, la dirección web y un QR.

## Los tres videos

| | 1 · Con meseros | 2 · Comedor | 3 · A domicilio |
|---|---|---|---|
| **Para quién** | Restaurante con meseros | Comedor, cafetería, sin meseros | Vende por WhatsApp o solo en línea |
| **Plan que encaja** | Premium | Estándar | En línea |
| **Gancho (0–3 s)** | Comanda a mano ilegible: «2 polo sin sebolla», «Mesa ~~4~~ 7 ??». **¿Tu cocina también adivina?** | Globos de gritos encimados: «¡DOS POLLOS!», «¿Ya pagó la 5?». **¿Todavía se gritan los pedidos?** | Notificaciones sin parar: «¿Hay pollo hoy?», «¿Ya viene mi pedido?», 40+ sin leer. **¿Tu WhatsApp ya no da abasto?** |
| **Se rompe y dice** | Se acabaron los papelitos. | Que tus clientes pidan solos. | Que pidan solos, desde tu link. |
| **Recorrido de la chispa** | Mesero → cocina → caja (cobra, «Cuadra») → dueño | Cliente pide desde el QR de la mesa → mostrador («Enviar a cocina», «Marcar listo») → el cliente ve «Listo» → dueño | Cliente pide desde el link y marca su casa en el mapa → tu cocina («Enviar a cocina», «Salió a entregar») → el cliente ve «En camino» → dueño |
| **Remate** | Nadie adivina. Todo cuadra. | Nadie grita. Todo cuadra. | Menos chats. Más pedidos. |
| **Cierre** | Todo tu restaurante **en un solo sistema.** Sin contrato y sin comisión por pedido. | Que tus clientes **pidan solos desde hoy.** Tu menú digital con QR, gratis para siempre. | Tu propio link **para vender en línea.** Sin comisión por pedido. Lo que vendes es tuyo. |
| **QR lleva a** | distleogin.com/planes | distleogin.com/planes | distleogin.com/vende-en-linea |

Los tres duran 34 s y usan la misma estructura: gancho (0–4 s), toma (4–24 s), revelación (24–29 s) y cierre (29–34 s).

## Lo que promete y dónde existe en la app

Ningún texto promete algo que Leogin no haga (regla de la ficha 0.1):

| Promesa | Dónde está |
|---|---|
| El mesero toma el pedido con fotos, término, nota y cantidad | Servicio → Tomar pedidos (`components/admin/servicio/`); Premium |
| El cliente pide solo desde el QR de la mesa o desde el link | Carta del comensal y checkout |
| Marca su casa en el mapa, envío por zona | Checkout con mapa y zonas de reparto (plan En línea) |
| Llega al instante, «Enviar a cocina» | Pedidos → En vivo |
| Cocina marca listo; «Salió a entregar» | `lib/actions/cocina.ts` (READY), `pedidos-en-vivo.ts` (TRANSIT) |
| El cliente ve el estado en vivo (Recibido → Listo / En camino) | Seguimiento del pedido |
| Cobrar con vuelto; corte de caja que «Cuadra» | `hoja-cobro.tsx`; caja por turnos (Estándar y Premium) |
| Ventas del día y «vs. un sábado normal» | Panel Hoy |
| Sin contrato, sin comisión por pedido, menú digital gratis para siempre | `PRECIOS_VIGENTES.md`, `/planes` |

Los videos no dicen precios a propósito (decisión del dueño, 2026-11-15): el precio, la alta y el plan se hablan en la visita o en `/planes`. Los textos del cierre se cambian en `cierre` de `src/una-toma/guiones/*.tsx`.

## Formatos y uso

| Archivo (`promo-video/out/una-toma/`) | Para qué |
|---|---|
| `leogin-<video>-vertical.mp4` (1080×1920) | TikTok, Reels, Shorts, estados de WhatsApp. Lo importante queda fuera de las franjas de botones de TikTok. |
| `leogin-<video>-horizontal.mp4` (1920×1080) | La visita en persona (laptop o tableta) y YouTube. El QR se puede escanear desde la pantalla. |

**En la visita:** al entrar, sin explicar nada, se pone el video que corresponde al lugar: meseros, comedor o domicilio. Luego viene la demostración en vivo en el teléfono ([`GUION_DEMO_90S.md`](GUION_DEMO_90S.md)) y al final el QR.

**En redes:** se publican los tres y se mide cuánta gente pasa de los primeros 3 s. Si se van rápido, lo que falla es el gancho.

## Decisiones

- **Pantallas reconstruidas, no capturas**: así cada botón se anima y el texto sale nítido a cualquier zoom. Copian la app real: el panel claro y la carta oscura de Rincón 502.
- **Música propia**: latin house a 120 BPM sintetizado con código (`scripts/banda-una-toma.mjs <video>`), sin derechos de terceros. Los efectos de cada video están en `eventos` de su `tiempos-<video>.json`: si se mueve un toque, el sonido lo sigue.
- **Sin voz**: se entiende en silencio y en la visita habla el vendedor.
- **Chat genérico** en el gancho de domicilio: se nombra WhatsApp en el texto, pero no se usa su logo, sus colores ni su sonido.

## Pendientes

- Publicar y medir los primeros 3 s en TikTok.
- Si se hacen demos en vivo con la app, confirmar que la migración 181 ya corre en producción («Enviar a cocina» en pedidos recién creados).
- Aplicar la migración 182 (sin prueba gratis) después de desplegar su PR, para que la web no siga ofreciendo 30 días.
