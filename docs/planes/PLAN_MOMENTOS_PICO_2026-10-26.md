# Plan: momentos pico, Leo y ganchos (fases C, D y E) · 2026-10-26

**De dónde sale:** [`ESTRATEGIA_ATRACCION_2026-10-25.md`](../negocio/ESTRATEGIA_ATRACCION_2026-10-25.md) §2, §3, §5.2, §6 y §9. El dueño lo aprobó el 2026-10-26: «implementa todo, incluso lo de la web, el admin y el catálogo digital».

**Rama:** `feat/momentos-pico`, apilada sobre `feat/experiencia-viva-menu-panel` (PR #40), que a su vez va sobre #39 y #38. Se fusiona después de esos tres.

**Reglas que no se rompen:**
- Leo vive en Leogin (web, panel, billetera) y **nunca** dentro del menú de un restaurante.
- Solo se anima `transform` y `opacity`, con «reducir movimiento» respetado. En Tomar pedidos nada pasa de 150 ms.
- Nada de datos inventados: un récord es un récord de verdad y el confeti solo sale ahí.
- Superficies sólidas, nada translúcido.

---

## Web (distleogin.com)

| # | Qué | Por qué | Estado |
|---|---|---|---|
| W1 | **«Míralo en tu celular»:** en computadora, el botón secundario del inicio abre un QR grande hacia la demo en vivo. En el celular sigue siendo un enlace | El «ajá» pasa en su mano, no en la pantalla de otro (§2.2) | ✅ Hecho |
| W2 | Botón principal **«Crear mi menú gratis»** | El sí chico primero (§2.14, §4) | ✅ Hecho |
| W3 | **La tarjeta de la intro se mueve:** bucle de 7 s sin sonido; la imagen fija queda de póster. Sin bucle con «reducir movimiento» o ahorro de datos | Movimiento desde el primer segundo (§6.1) | ✅ Hecho |
| W4 | **«Ver todo lo que incluye»:** la lista completa de herramientas se abre aparte | Ley de Hick (§2.6) | ✅ Hecho |
| G1 | **Registro: «Así se ve TU restaurante»** al terminar de crear el restaurante con su estilo | Efecto IKEA y dotación (§2.3) | ✅ Hecho |

## Panel del restaurante

| # | Qué | Por qué | Estado |
|---|---|---|---|
| P1 | **«Termina de armar tu restaurante»:** arranca en 20 % («Ya creaste tu cuenta»), Leo señala el paso que sigue y al 100 % hay fiesta | Progreso dotado (§2.8) | ✅ Hecho |
| P2 | **Leo en las pantallas vacías** y en la bienvenida | §6.2, fase D | ✅ Hecho |
| P3 | **El primer pedido es una fiesta:** pantalla especial cuando entra el pedido número 1 del restaurante | Pico (§2.7), fase C | ✅ Hecho |
| P4 | **Tu día:** en Hoy, plato estrella, hora pico y récord («tu mejor martes del mes»). En Básico, las visitas | Recompensa variable (§2.10), R3 | ✅ Hecho (las visitas de Básico ya las daba «Tu menú en línea») |
| P5 | **Cierre de caja:** los números suben solos; si es récord de verdad, confeti y el mensaje. Al cerrar el turno le llega al dueño el resumen del día como aviso | Pico y final (§2.7), firma «la caja cuadra» | ✅ Hecho |
| P6 | **Hitos:** 100 pedidos (y 500, 1,000…), primer mes con Leogin, mejor día. Una tarjeta en Hoy que se va al cerrarla | §6.2 | ✅ Hecho |
| P7 | **«Comparte tu plato del día»:** imagen vertical para el estado de WhatsApp o Instagram, con la marca del restaurante y una L chiquita | R4: reciprocidad y publicidad gratis | ✅ Hecho |
| P8 | **«Tu año con Leogin»:** resumen del año en curso (pedidos, ventas, plato estrella, mejor día) con imagen para compartir | R7: orgullo y viralidad | ✅ Hecho |

«El ding» ya existe (do-mi-sol que sube, `lib/sounds.ts`) y no se cambia: el personal ya lo tiene aprendido.

## Catálogo digital (el menú del comensal)

| # | Qué | Por qué | Estado |
|---|---|---|---|
| M1 | **Pedido enviado:** el pedido vuela, un «pop» suave y una vibración corta; la palomita se dibuja sola en verde | Pico del comensal (§2.7), firmas 1 y 5 | ✅ Hecho |
| M2 | **El final:** los puntos que suma con un sello y «te faltan N para…»; sin cuenta, lo que se pierde («con tu cuenta sumabas N puntos»); «te avisamos cuando esté listo» | Gradiente de la meta y aversión a la pérdida (§2.1, §2.9) | ✅ Hecho |
| M3 | **Premio por pedir desde el celular (C8):** doble de puntos en el primer pedido con cuenta. Encendido por defecto; se apaga en Lealtad | Lo que viene puesto (§2.15) | ✅ Hecho |
| M4 | **Sorpresa de la casa:** el restaurante escribe la sorpresa («Hoy el postre va por la casa») y cada cuántos pedidos sale; aparece en la confirmación y en la tarjeta del pedido. Apagada por defecto | Recompensa variable (§2.10) | ✅ Hecho |

## Billetera

| # | Qué | Estado |
|---|---|---|
| B1 | **Leo en la billetera:** bienvenida y lista vacía | ✅ Hecho |

## Cómo quedó

- **Leo** (`components/leo.tsx`) tiene cuatro expresiones: saluda, señala, feliz y duerme. Señala en la guía de primeros pasos y en las pantallas vacías del panel (`ui/empty-state.tsx`, todas a la vez), celebra en el primer pedido, los hitos, el récord y «Tu año», y saluda en la billetera.
- **Lo que se celebra** sale de reglas puras con pruebas (`lib/momentos.ts`): sin historia suficiente no hay récord (7 días con venta para «el mejor del mes», 2 días iguales para «el mejor martes») y sin 3 pedidos no hay hora pico. Las cifras vienen del mismo reporte SQL que Métricas (`leogin_sales_report`), con la hora de corte del restaurante.
- **El primer pedido** se pregunta al servidor cuando entra un pedido y al abrir el panel; cada aparato recuerda que ya lo vio. Se celebra hasta el tercer pedido y dos semanas después, por si el dueño no estaba mirando.
- **Las imágenes para compartir** (plato del día y Tu año) se dibujan en el navegador, en 1080 × 1920: `next/og` no lee las fotos WebP y ahí ya están las letras de Leogin. Sin foto del platillo sale un plato dibujado.
- **Los puntos** que se le anuncian al comensal salen de la misma regla que los acredita (`puntosDelPedido` en `lib/db/loyalty.ts`).
- **La sorpresa** se sortea una sola vez por pedido en el servidor y queda escrita: recargar no vuelve a tirar los dados.
- **El bucle de la tarjeta** (`public/intro/bucle.webm`, 327 KB) lo genera `docs/diseno/intro-animada/publicar-en-web.mjs` junto con la portada; ese script ahora normaliza los saltos de línea de `intro.html` (con `core.autocrlf` en Windows fallaba).
- De paso: la ventana de la intro de la portada salía pegada arriba a la izquierda (el `* { margin: 0 }` de la app le quitaba el centrado); ahora va al centro.

## Base de datos

Migración **147** (`147_lealtad_primer_pedido_y_sorpresa.sql`): en `loyalty_settings`, `primer_pedido_doble` (encendido por defecto), `sorpresa_texto` y `sorpresa_cada`; en `orders`, `sorpresa`. **Se aplica antes del despliegue del código.** Si falta, el código sigue funcionando: el premio usa su valor por defecto y la sorpresa no sale.

## Fuera de este plan, y por qué

- **Voz (V5) y prueba social (V6):** necesitan la voz del dueño y restaurantes reales con permiso.
- **Analítica de la web:** está apagada por decisión (2026-10-02).
- **Aviso nocturno programado:** no hay tarea programada en el servidor. El resumen llega al cerrar el turno de caja (P5).
- **«Plato más visto» en Básico:** hoy no se mide qué platillo se abre.
- **«Tómale foto a tu carta» y tarjetas NFC:** son ideas a evaluar, con su propio plan.
