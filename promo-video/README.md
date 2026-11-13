# ¿Cobraste la limonada?

Anuncio de Leogin para quien administra un restaurante y necesita que lo servido figure en la cuenta. La mesa 04 es un ejemplo de venta con dos artículos y precios de la carta de demostración de Rincón 502.

## Reproducir y editar

Desde esta carpeta, con Node.js 22 o superior y npm:

```sh
npm install
npm run studio
```

Studio muestra `LeoginPromoMobile` (1080 × 1920) y `LeoginPromoWeb` (1920 × 1080). Ambas duran 1800 fotogramas a 60 fps. Para exportarlas, ejecuta:

```sh
npm run render:all
```

Con `npm run render:mobile` o `npm run render:web` puedes exportar una sola versión. Los MP4 H.264 con audio AAC quedan en `out/`. La primera instalación y la descarga inicial de Chromium necesitan internet. Las fuentes, las imágenes, el QR y el sonido se sirven desde el proyecto durante el render. Las dependencias de Remotion están fijadas en el archivo de bloqueo.

## Recorrido y fundamento comercial

| Tiempo | Lo que ve el dueño | Evidencia del producto |
| --- | --- | --- |
| 0–3 s | Una limonada de Q18 y la pregunta «¿Cobraste la limonada?» | La [carta de demostración](../plataforma/src/lib/demo-menu.ts) fija la limonada en Q18 y la Rincón Clásica en Q52. |
| 3–9 s | La barra sirvió la bebida. La cuenta en papel solo suma Q52. | Dramatización del problema del registro por separado. |
| 9–13,2 s | El mesero agrega la bebida y envía la comanda de Q70. | [Comanda de Servicio](../plataforma/src/components/admin/servicio/comanda.tsx) y [envío a cocina](../plataforma/src/components/admin/servicio/servicio-panel.tsx). |
| 13,2–17,2 s | Cocina ve ambas unidades y marca el pedido listo. | [Estados y acciones del pedido](../plataforma/src/lib/order-status.ts). |
| 17,2–22 s | Caja recibe Q100, calcula Q30 de vuelto y cobra Q70. | [Hoja de cobro](../plataforma/src/components/admin/servicio/hoja-cobro.tsx). |
| 22–26 s | El comprobante de la venta incluye la bebida. | Q52 + Q18 = Q70 en la venta ilustrada. |
| 26–30 s | «Crear mi menú gratis» y QR de registro. | La [portada](../plataforma/src/components/landing.tsx) usa esta llamada para el alta del menú básico. Las funciones de pedidos dependen del plan. El QR codifica [el registro oficial](https://distleogin.com/registro). |

## Dirección visual y audio

Las escenas en `src/scenes/` comparten línea de tiempo y componentes. `Root.tsx` selecciona el encuadre por orientación. La versión móvil reserva espacio para los controles de las redes. La web sitúa la acción y la comanda lado a lado.

El [sistema visual](../docs/diseno/SISTEMA_VISUAL_2026-11-05.md) aporta el coral #C2542F, el fondo #F2F1EE, la tinta #17161A y las tarjetas sólidas. Geist compone la interfaz, Anton los titulares y Unbounded la firma. Las ilustraciones y la marca proceden de `plataforma/public/`. La foto de la limonada se generó para el anuncio.

`public/mezcla.wav` contiene la locución española sintetizada con Kokoro, voz ef_dora, y una base instrumental original de bajo, teclas y percusión, con acentos sincronizados a las acciones. Para sustituir la mezcla, conserva su duración de 30 segundos y la entrada de cada escena.
