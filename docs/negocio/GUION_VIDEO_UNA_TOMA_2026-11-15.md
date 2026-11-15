# Video «Una sola toma» — guion y decisiones (2026-11-15)

Segundo intento de video promocional. El dueño pidió algo que **enganche desde el segundo 0**, que **se venda solo**, único y nunca visto, en **dos formatos**: horizontal para enseñarlo en persona en los restaurantes (PC o tableta) y vertical para TikTok y Reels. Pidió ignorar los videos anteriores, así que este no reutiliza nada del estilo de «Bajo control» (papel stop-motion, capturas con zoom, marimba).

Código: [`promo-video/src/una-toma/`](../../promo-video/src/una-toma/). Cómo se exporta: [`promo-video/README.md`](../../promo-video/README.md#una-sola-toma).

## La idea

**Un pedido cruza todo el restaurante sin un solo corte.**

Todo el video es un único plano continuo. Una chispa de luz (el pedido) sale del teléfono del mesero y la cámara la persigue volando entre los aparatos del restaurante: cocina, caja y el teléfono del dueño. Al final la cámara se aleja y deja ver el camino completo que recorrió el pedido, con Leogin al centro conectando todo.

Por qué funciona:

- **Nunca hay corte**: el ojo no encuentra un punto para irse. Es lo que mantiene a la gente mirando en TikTok.
- **La chispa explica el producto sin palabras**: «lo que toca el mesero llega solo a cocina, a caja y a ti».
- **El gancho es un dolor que todo dueño reconoce y da risa**: la comanda escrita a mano que nadie entiende («2 polo sin sebolla», «Mesa 4… ¿o 7?»).
- **Se entiende sin sonido**: cada paso tiene una palabra grande que cambia al ritmo de los toques.
- **Muestra la app real**: las pantallas reproducen el panel de Leogin con los datos de Rincón 502 y las ilustraciones de sus platos.
- **Cierra el círculo**: abre con un papelito y termina con un QR que lleva directo al registro.

## Guion (34 s, 30 fps, 120 BPM)

| Segundo | Imagen | Texto en pantalla | Sonido |
|---|---|---|---|
| 0–3 | Comanda a mano, temblando. El «4» se tacha y se corrige a «7 ??». Un marcador rojo encierra la mesa y «(o pollo?)». | **¿Tu cocina también adivina?** | Golpe seco, reloj, lápiz, marcador |
| 3–4 | La comanda se rompe en dos. Detrás, fondo brasa. Nace la chispa. | **Se acabaron los papelitos.** | Papel que se rompe, subida |
| 4–8.5 | La cámara cae sobre el teléfono del mesero: toca la Rincón Clásica, elige término medio, escribe «Sin cebolla», sube a 2 y envía. | El mesero **toca. / elige. / anota. / envía.** | Entra el ritmo (latin house). Cada toque suena. |
| 8.5–10 | La chispa sale disparada; la cámara vuela tras ella. | — | Barrido |
| 10–14 | Aterriza en la tableta de cocina: aparece la tarjeta «Mesa 4 · 2× Rincón Clásica · Medio · Nota: Sin cebolla». La cocina marca «Listo». | Llega a cocina **al instante.** / Y se lee **clarito.** | Campana de cocina |
| 14–19 | Vuela a caja: cobra Q104.00 con vuelto, pasa al corte de caja, cuenta y sale el sello **Cuadra**. | En caja **cobras.** / Y al cerrar **cuenta… cuadra.** | Caja registradora, monedas, sello |
| 19–24 | Vuela al teléfono del dueño: en «Hoy» las ventas suben exactamente Q104.00 (el pedido que seguimos) y los pedidos de 22 a 23. | Y tú **lo ves todo.** desde donde estés. | Arpegio de subida |
| 24–29 | La cámara se aleja: los cuatro aparatos unidos por el camino de luz, el logo al centro, etiquetas Mesero · Cocina · Caja · Tú. | **Nadie adivina. Todo cuadra.** | Corte, subida y golpe |
| 29–34 | La cámara entra al logo. Oferta y QR. | Leogin · Pruébalo **30 días gratis** · Sin tarjeta. Tu restaurante listo en minutos. · **distleogin.com** · QR «Escanea y empieza» | Acorde final |

## Lo que promete y dónde existe en la app

Ningún texto promete algo que Leogin no haga (regla de la ficha 0.1):

| Promesa en el video | Dónde está |
|---|---|
| El mesero toma el pedido con fotos, término, nota y cantidad | Servicio → Tomar pedidos (`components/admin/servicio/carta.tsx`, `hoja-opciones.tsx`); plan Premium |
| Llega a cocina al instante | Cocina en tiempo real (`/admin/pedidos` pestaña Cocina) |
| Cocina marca listo | `lib/actions/cocina.ts` (estado READY) |
| Cobrar con vuelto | `components/admin/servicio/hoja-cobro.tsx` («Vuelto») |
| Corte de caja que dice «Cuadra» | Caja por turnos (`components/admin/caja/`) |
| Ventas del día y «vs. un sábado normal» | Panel Hoy |
| 30 días gratis, sin tarjeta | Registro (`/registro`, `pricing.trialDays`) |

## Formatos y uso

| Archivo | Para qué |
|---|---|
| `leogin-una-toma-vertical.mp4` (1080×1920) | TikTok, Reels, Shorts, estados de WhatsApp. Lo importante queda fuera de las franjas de botones de TikTok (arriba los textos, al centro el aparato). |
| `leogin-una-toma-horizontal.mp4` (1920×1080) | La visita en persona (laptop o tableta) y YouTube. Textos a la izquierda, aparatos a la derecha; el QR se puede escanear desde la pantalla. |

En la visita: ponerlo al llegar, sin explicar antes. Al terminar, el dueño tiene el QR enfrente.

## Decisiones

- **Pantallas reconstruidas, no capturas**: así cada botón se puede animar y el texto sale nítido a cualquier zoom. Copian el panel real (tema claro, Geist, coral `#C2542F`, tarjetas sólidas) y los datos de Rincón 502.
- **Música propia**: latin house a 120 BPM sintetizado con código (`scripts/banda-una-toma.mjs`): bombo, palmas, shaker, congas, bajo y cuerdas pulsadas. Sin derechos de terceros. Cada efecto lee la línea de tiempo de `tiempos.json`, así que si se mueve un toque, el sonido lo sigue.
- **Sin voz**: el video se entiende en silencio (así se ve la mayoría de TikTok) y en la visita habla el vendedor.
- **Un solo llamado a la acción**: probar gratis. Precios no, para no frenar la decisión.

## Pendientes

- Que el dueño lo vea y apruebe (o diga qué cambiar) antes de publicar.
- Si se publica con la app abierta para probar en vivo, confirmar que la migración 181 ya corre en producción (arregla «Enviar a cocina» en pedidos recién creados).
- Opcional: versión de 15 s (gancho + toma + cierre) para anuncios pagados.
