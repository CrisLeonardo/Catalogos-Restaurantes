# Plan: portada fluida en el teléfono y Leogin para quien vende en línea · 2026-10-27

**De dónde sale:** el dueño pidió el 2026-10-27 (1) un enfoque de Leogin para quien **solo vende en línea** —su modalidad o porque está empezando— y que no necesita mesas, meseros ni cocina con pantalla; (2) decidir si eso va en la intro o en otro video; y (3) una web que **fluya**: «se laguea», en el móvil no está bien adaptada, la intro tampoco, y la vitrina de diseños en vivo debería ir «mitad y mitad» en la pantalla del teléfono. Con la regla de siempre: profundizar en psicología y marketing para atrapar al cliente en el primer vistazo y que se siga enamorando al bajar.

**Rama:** `feat/portada-fluida-y-vende-en-linea`.

**Reglas que no se rompen:** superficies sólidas, nada translúcido · solo se anima `transform` y `opacity`, con «reducir movimiento» respetado · nada de datos inventados (lo que se promete a quien vende en línea es lo que trae **Estándar** con «para llevar» y «a domicilio»; lealtad, cupones e inventario son de Premium y no se prometen ahí) · Leo nunca dentro del menú de un restaurante.

---

## 1. Lo que se midió antes de tocar nada (teléfono de 375 × 812)

| Hallazgo | Efecto en quien visita |
|---|---|
| La página medía **399 px de ancho** en una pantalla de 375: las tarjetas que entran de lado (`data-fx="izq/der"`) empiezan 44 px afuera, y `overflow-x: clip` en `<html>` no lo evita en el móvil | Se podía arrastrar la página de lado; la ventana de la intro salía **corrida y cortada** a la derecha. Esto era el «no está bien adaptado» |
| El primer pantallazo era **solo texto**: el video quedaba debajo de los botones y de cuatro filas de píldoras | El gancho («¿Sabes cuánto dinero se te fue hoy?») no se veía sin bajar |
| La cabecera fija llevaba `backdrop-filter: blur(18px)` | Se vuelve a pintar en cada cuadro del deslizar: el tirón al bajar en un Android de gama media |
| `<main className="anim-fade-up">` animaba la página entera (17 000 px) como una sola capa al cargar | Primer segundo pesado |
| El titular tardaba **1.3 s** en terminar de aparecer palabra por palabra | El primer vistazo era un hueco |
| Vitrina de diseños: el teléfono fijo, el nombre y los botones ocupaban **dos tercios** de la pantalla; además, dos «R» encimadas mientras cargaba | Un renglón para leer las estructuras |
| «Del caos al control» pedía **tres pantallas** de recorrido con la escena fija | El pulgar la sentía «atorada» |
| Cifras en una columna (media pantalla para cuatro números) y ocho tarjetas «Para tus clientes / Para ti» en columna (1 900 px) | La portada medía ~20 pantallas |

## 2. Qué se hizo

### Portada (distleogin.com)

| # | Qué | Psicología / por qué | Estado |
|---|---|---|---|
| F1 | **El video sube al primer pantallazo** en el teléfono: titular → video → botones (la rejilla del héroe pasa a tres piezas; en la computadora no cambia) | Efecto de superioridad de la imagen: el gancho visual se procesa antes que el texto. Movimiento en el primer segundo | ✅ Hecho |
| F2 | **Sin desborde horizontal:** `.lp-main { overflow-x: clip }` | Una página que «baila» de lado se siente rota (fluidez percibida = confianza) | ✅ Hecho |
| F3 | **Cabecera sólida**, sin `backdrop-filter` | Fluidez real al deslizar; y la regla de marca de superficies sólidas | ✅ Hecho |
| F4 | Fuera la animación de toda la página; **titular en 0.5 s**; parallax del héroe solo en computadora | El primer vistazo completo cuanto antes | ✅ Hecho |
| F5 | Botones **a lo ancho** en el teléfono y píldoras en **una fila que se desliza** | El pulgar cae ahí; la tira de cifras sube una pantalla | ✅ Hecho |
| F6 | **Vitrina de diseños «mitad y mitad»:** teléfono chico a la izquierda, nombre del estilo y botones («Tócalo tú», «Lo quiero») a la derecha; la franja fija pasa de ~65 % a ~45 % de la pantalla. «Cargando» con fondo opaco | Lo que pidió el dueño. Ver y leer a la vez: cada estructura se lee mientras el teléfono cambia (causa → efecto inmediato) | ✅ Hecho |
| F7 | «Del caos al control» en el teléfono: **2.5 pantallas** en vez de 3 y sin hueco entre el título y el panel | Menos «cárcel de scroll» | ✅ Hecho |
| F8 | Cifras en **2 × 2** y «Para tus clientes / Para ti» como **carruseles** que se deslizan con el dedo | Página más corta: menos fatiga antes de los planes | ✅ Hecho |
| F9 | Secciones lejanas con **`content-visibility: auto`** (`.lp-diferido`) | El navegador no trabaja lo que todavía no se ve | ✅ Hecho |
| F10 | **Puerta «¿No tienes local? ¿Vendes por WhatsApp o Instagram?»** en la segunda pantalla, más «Vende en línea» en la cabecera, el menú del teléfono y el pie | Autoselección: quien no tiene local lee «tu restaurante» y se va pensando que no es para él; una pregunta en la que se reconoce lo retiene | ✅ Hecho |

### Leogin para quien vende en línea (`/vende-en-linea`)

Una página propia, no una sección más de la portada: la portada le habla al restaurante con local y meterle otro público la volvería genérica para los dos.

| Bloque | Qué dice | Psicología |
|---|---|---|
| Portada | «**Tu menú en un link. Tus pedidos, en orden.**» + escena animada: el chat de «Dulce Antojo» se llena de «¿Precio de la docena?», «¿Hacen envíos a zona 10?», «¿Ya viene mi pedido?»… se barre y entra **un** pedido completo (quién, qué, a dónde, cómo paga, total, «Aceptar») | Espejo (ese soy yo) y alivio en una sola imagen, en el primer pantallazo |
| ¿Te suena? | «Vender por chat funciona… hasta que funciona demasiado»: contestar lo mismo todo el día · el pedido que se pierde · no saber cuánto ganaste | Halaga (te va bien) y nombra el dolor sin culpar; aversión a la pérdida («ese cliente no vuelve») |
| Así cambia | Link en tu bio → tus clientes piden solos (a las 11 de la noche también) → te suena y despachas | Tres pasos: la tarea se ve chica (efecto de facilidad) |
| Solo lo que necesitas | Lo que sí (menú en un link, recoger y domicilio con zonas y tarifa, avisos, horario, seguimiento, cuánto vendiste) y **lo que no te va a estorbar, tachado** (mesas y meseros, pantalla de cocina, impresoras, caja por turnos, inventario con recetas). «¿Y si un día abres local? Todo eso ya está aquí» | Quitar opciones baja la ansiedad (ley de Hick); el «yo futuro» con local no tiene que cambiar de sistema |
| Por temporadas | La estructura **Vitrina**: abre pedidos el lunes, ciérralos cuando se agote; cuenta regresiva y «quedan 4 de 30» | Escasez y urgencia, con lo que ya existe (PR #7/#8) |
| Precio | «**Menos de Q7 al día**» (sale del precio vigente de Estándar ÷ 30) y sin comisión; el Básico gratis como red | Contabilidad mental: un precio diario se compara con un refresco, no con una mensualidad |
| Dudas | ¿Necesito local? · ¿Dejo de usar WhatsApp? (no: el cliente puede mandarte el pedido ya escrito) · ¿Descargar algo? · ¿Cómo me pagan? (efectivo o tarjeta al recibir; Leogin no toca el dinero) · ¿Solo algunos días? · ¿Cuánto cuesta? | Quitar los «sí, pero…» que frenan |
| Cierre | Leo: «¡Tu próximo pedido, ordenado!» · «Deja de armar pedidos a mano» | Pico y final: lo último es lo que se recuerda |

**El alta llega armada:** los botones de esta página dejan dicho el perfil (`lib/perfil-negocio.ts`, `localStorage` una semana). `/mi-cuenta/nuevo` lo lee y marca **Estándar con «para llevar» + «a domicilio»** (en vez de Premium con un salón que no tiene), con el aviso «Lo dejamos listo para vender en línea… Puedes cambiarlo». Se borra al crear el restaurante. El panel ya se adapta solo: sin «comer en local» no aparecen Salón ni mesero (`lib/admin-nav.ts`).

## 3. ¿En la intro o en otro video? → **Otro video**

Recomendación: **no** meterlo en la intro de 54 s. Hacer un video aparte, corto y vertical.

1. **Un mensaje por pieza.** La intro cuenta «Las tres fugas» de un restaurante con local (Mesa 4, la cocina, la caja). Meter a quien vende por chat la alarga y la parte en dos historias; ninguna de las dos pega.
2. **El gancho decide en 2 segundos quién se queda.** «¿Sabes cuánto dinero se te fue hoy?» con comandas y mesas le dice a quien vende desde su casa «esto no es para mí». Su gancho tiene que ser **su** chat.
3. **Otro canal, otro formato.** Quien vende en línea vive en Instagram, TikTok y los estados de WhatsApp: vertical 9:16, 15–30 s, con letreros para verse **sin sonido**. La intro está pensada para la web y el seguimiento.
4. **Se puede medir.** Dos videos dicen qué público responde.

Se reutiliza todo lo de la intro (`docs/diseno/intro-animada/`): GSAP, Leo, la paleta, `CUTS`, `grabar-video.mjs` y `publicar-en-web.mjs`. Archivo nuevo: `docs/diseno/intro-animada/en-linea.html`.

### Guion · «Del chat al pedido» (30 s, 9:16; corte de 15 s) — ✅ hecho 2026-10-27

El dueño aprobó el guion («Sí, hazlo»). Está en `docs/diseno/intro-animada/en-linea.html` (mismo reproductor y API `__intro` que la intro) y se ve en `/vende-en-linea` («Míralo en 30 segundos», ruta `/intro-en-linea`).

- **Cómo quedó:** el antes va cuadro por cuadro sobre kraft: el chat de «Dulce Antojo» se llena de «¿precio?», el contador sube a 99+, la dirección de Andrea queda enterrada, el dedo la busca y Andrea se va («Ya no, gracias. Le pedí a otro lado.»). Se congela, cae Leo y el mundo pasa al carbón: perfil con el link → el menú (estructura Vitrina) → el cliente pide solo (2 cajas + 1 pastel, mapa, efectivo con Q200) → «¡Pedido enviado!» → en el celular del dueño suena el aviso y el pedido llega con «Qué quiere · A dónde va · Cómo paga» → el domingo, Q3,480 y 41 pedidos (marcado **Ejemplo**) → firma con Leo, la promesa y `distleogin.com/vende-en-linea`.
- **Grabarlo:** `node docs/diseno/intro-animada/grabar-video.mjs --archivo en-linea.html` (y `--corte 15`) deja WebM 9:16 + WAV de la marimba en la carpeta que se pida; el MP4 con sonido se arma en Clipchamp (no hay ffmpeg completo). Los videos van en `docs/diseno/intro-animada/videos/`, fuera de git.
- **Publicarlo en la web:** `node docs/diseno/intro-animada/publicar-en-web.mjs --archivo en-linea.html`.
- **Trampa:** `gsap.set(..., { clearProps })` sobre un `<svg>` lo saca del DOM para medirlo y lo regresa AL FINAL de su padre: los íconos quedaban después del texto. Al reconstruir solo se limpian elementos que no son SVG.

Guion original:

| Tiempo | Imagen | Letrero / voz |
|---|---|---|
| 0–2 s | Celular en la mano; el chat suena y el contador sube 12 → 47 → 99+ | **«¿Cuántas veces te preguntaron "¿precio?" hoy?»** |
| 2–6 s | Burbujas que se amontonan: «¿hay de fresa?», «¿envían a zona 10?», «mándame el menú», «¿ya viene?» | «Vender por chat funciona… hasta que funciona demasiado.» |
| 6–9 s | Se pierde uno: el dedo sube y sube buscando una dirección | «Y un pedido perdido es un cliente que no vuelve.» |
| 9–13 s | Leo toca la bio de Instagram: aparece el link y se abre el menú (estructura Vitrina) | **«Pon tu menú en un link.»** |
| 13–19 s | El cliente elige, marca su casa en el mapa y «efectivo, pago con Q200» | «Tus clientes piden solos. A las 11 de la noche también.» |
| 19–23 s | ¡Ding! Llega la tarjeta completa del pedido; Leo con la campanita | **«Y a ti te llega completo.»** |
| 23–26 s | Domingo: «Esta semana: Q3,480 · 41 pedidos» (con la marca «ejemplo») | «Y sabes cuánto vendiste.» |
| 26–30 s | Logo + Leo | **«Tu menú en un link. Tus pedidos, en orden.»** · «Sin comisión · distleogin.com/vende-en-linea» |

Corte de 15 s: 0–2 · 9–13 · 19–23 · 26–30. Sin logos ni colores de WhatsApp/Instagram (son marcas ajenas): el chat se dibuja genérico con la Albahaca de la paleta.

## 4. Pendiente

- [x] **Video «Del chat al pedido»** con el guion de §3 (hecho 2026-10-27; ver §3).
- [ ] Póster y bucle **verticales** para la tarjeta de la intro en el teléfono: hoy la imagen 16:9 deja chico el texto del gancho. Se graban con `grabar-video.mjs` en formato `v`.
- [ ] Panel en modo «solo en línea»: además de lo que ya oculta `admin-nav.ts`, no enseñar como candado (venta de Premium) lo que es de salón.
- [ ] Medir la portada en un teléfono real en producción (Lighthouse móvil) antes y después.
