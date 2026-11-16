# Guion: video general «Un solo lugar» (2026-11-15)

El video que responde «¿qué es Leogin?» en menos de un minuto. Acompaña a la serie [«Otra vez»](GUION_VIDEO_OTRA_VEZ_2026-11-15.md) (un video por tipo de negocio, aprobada el mismo día) y reemplaza en la portada a la intro «Las tres fugas». Código y forma de reproducirlo: [`promo-video/README.md`](../../promo-video/README.md).

## La idea

**Hoy tu restaurante vive en 8 lugares. Leogin es uno solo.** El video abre contando, al ritmo de la música, dónde está repartido un restaurante sin sistema: la libreta de comandas, los chats de pedidos, la calculadora, el cuaderno de caja, el menú impreso, la hoja de cálculo, la agenda de reservas y la memoria del dueño. «Y ninguno se habla con otro.» Luego la pregunta —«¿Y si viviera en uno solo?»— y los ocho se meten en un teléfono con el logo.

Por qué esta idea:

- **Engancha desde el segundo 0** sin necesitar contexto: el número grande que sube y los objetos que el dueño tiene hoy sobre el mostrador.
- **Define el producto con una frase** que cualquiera repite: «todo tu restaurante, en un solo lugar».
- **Le habla a los tres públicos sin elegir uno**: cada quien se reconoce en su tramo y ve que el resto del sistema es el mismo.
- **No compite con «Otra vez»**: aquella muestra un día concreto de un tipo de negocio; esta explica el sistema completo.

## Estructura (53,4 s)

| Tiempo | Qué pasa |
|---|---|
| 0,0 s | «Hoy tu restaurante vive en 1… 8 lugares»: entra un lugar por pulso. «Y ninguno se habla con otro.» |
| 5,4 s | «¿Y si viviera en uno solo?»: los ocho se meten en un teléfono |
| 7,8 s | Leogin: «Todo tu restaurante, en un solo lugar.» |
| 10,2 s | **Si vendes en línea** — «Tus clientes piden solos.» (carta, mapa de entrega, seguimiento) |
| 17,4 s | **Si atiendes sin meseros** — «El QR de la mesa toma la orden.» |
| 24,6 s | **Si tienes meseros** — «Tus meseros tocan. No escriben.» (plano, carta, cuenta dividida) |
| 31,8 s | **Y todo llega a cocina** — «Cocina lo ve al instante.» |
| 35,4 s | **A tu caja** — «La caja cuadra al centavo.» |
| 39,0 s | **Y a tu teléfono** — «Ves tu día completo.» |
| 42,6 s | «Y en el mismo sistema, todo esto»: las doce funciones restantes |
| 47,4 s | Cierre: «8 lugares → 1 solo», Leo, «Todo tu restaurante, en un solo lugar.», distleogin.com y QR |

Sale en vertical (1080×1920) y horizontal (1920×1080).

## Decisiones

- **Sin precios y sin prueba gratis**, igual que «Otra vez».
- **Sin voz**: se entiende sin sonido, que es como se reproduce en la portada y en redes.
- **Mismas pantallas reales** de Rincón 502 que «Otra vez»; no se grabó nada nuevo.
- **Sin marcas de terceros**: «los chats de pedidos» y «la hoja de cálculo», sin nombrar aplicaciones.
- **Sin acercamientos**: lo que se señala en una pantalla queda nítido dentro de un anillo y el resto se desenfoca y se apaga un poco; la pantalla siempre se ve entera (pedido del dueño, vale también para «Otra vez»).

## Estado

**Aprobado por el dueño el 2026-11-15 y puesto en la portada** en lugar de la intro «Las tres fugas»: la tarjeta de `plataforma/src/components/landing-intro.tsx` (prop `pelicula`) abre `horizontal.mp4` en pantallas anchas y `vertical.mp4` en las verticales, desde `plataforma/public/un-lugar/`. Esos archivos (unos 3 MB por video, más portadas y bucles) salen de `npm run un-lugar:web`. La ruta `/intro` sigue existiendo, sin enlace desde la portada.

## Pendiente

- No se ha escuchado la banda sonora en un teléfono real.
