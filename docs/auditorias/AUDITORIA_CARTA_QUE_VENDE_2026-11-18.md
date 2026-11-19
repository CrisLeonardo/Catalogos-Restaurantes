# Auditoría del menú digital · «La carta que vende» · 18 de noviembre de 2026

Auditoría hecha por Claude sobre la carta del comensal (la que se abre con el QR o el enlace del restaurante): estructura, diseños, funcionamiento, UI/UX, capacidad, rendimiento y su papel como **publicidad del restaurante**. Al final se compara con la [auditoría que hizo ChatGPT el mismo día](#9--comparación-con-la-auditoría-de-chatgpt) (rama `audit/menu-digital-venta`) y se toma lo que sirve.

**Maqueta interactiva de la propuesta:** [`docs/diseno/MAQUETA_CARTA_QUE_VENDE_2026-11-18.html`](../diseno/MAQUETA_CARTA_QUE_VENDE_2026-11-18.html). Ábrela desde la raíz del repo con un servidor (`python -m http.server` en la raíz y luego `/docs/diseno/...`) para que carguen las fotos de la demo. Antes y propuesta lado a lado, teléfono y PC, con tres paletas.

---

## 1 · Veredicto en seis líneas

1. **La base técnica es buena**: carga rápida, carta en caché, 8 estructuras × 26 paletas que de verdad se ven distintas, reglas de opciones compartidas con el mesero, ficha accesible y JSON-LD para Google. No hace falta rehacer el motor.
2. **La carta no trabaja como vendedora.** Recibe con una portada de pantalla completa que no enseña comida, interrumpe con un aviso de Google en la primera visita y apila tres capas flotantes abajo. Todo eso pasa antes o encima del producto.
3. **Hay tres fallos que cuestan dinero hoy**: la página **se recarga sola** en la primera visita (descarga doble), una lectura fallida de la base se guarda en caché como **carta vacía** durante un minuto, y quien no tiene logo comparte un enlace **sin imagen de vista previa**.
4. **No hay manera de anunciar un plato**: no existe enlace a una ficha ni imagen para compartir; quien vio la hamburguesa en un estado de WhatsApp tiene que buscarla.
5. **La propuesta** («La carta que vende») cambia la piel de las piezas comunes y deja intactas las 8 estructuras: cabecera breve en lugar de portada, *estados del día*, lo más pedido con datos reales, ficha que se abre desde la foto, una sola barra abajo, enlace por plato y PC de tres columnas.
6. **Lo que la hace distinta a todo lo que hay en Guatemala**: el pedido de **toda la mesa** desde varios teléfonos y los **estados del restaurante** al estilo WhatsApp. Las dos se apoyan en lo que Leogin ya tiene (mesas, tiempo real, momentos).

---

## 2 · Cómo se auditó

| Qué | Cómo |
|---|---|
| Código | `main` en `d517a4fb` (Ola 2 y línea N fusionadas). Lectura de `components/menu/*`, `menu-client.tsx`, `menu-shell.tsx`, `checkout-form.tsx`, `lib/theme/*`, `lib/db/menu.ts`, `offline-support.tsx`, `app/page.tsx`. |
| Pantalla real | **Compilación de producción** (`next build` + `next start`) y desarrollo. Playwright/Chromium con emulación móvil a **320, 390 y 1280 px**. Las ocho estructuras en su paleta de firma más Lino & Coral (`/preview/muestra?estilo=…`) y el restaurante local `rincon502` con base de datos (QR de mesa y enlace general). |
| Recorridos | Entrada por enlace general y por QR de mesa → abrir platillo con opciones → platillo simple → agregar → carrito → checkout. |
| Rendimiento | Producción, caché fría, sin limitar y con **red 4G lenta (1.6 Mb/s, 150 ms) + CPU ×4**. LCP, FCP, CLS, tareas largas, bytes por tipo y número de documentos descargados. |
| Método | [`GUIA_DISENO_NADA_SATURADO.md`](../guias/GUIA_DISENO_NADA_SATURADO.md) y la skill `leogin-diseno` (decisiones vigentes del dueño), con los criterios de movimiento de `emil-design-eng`. |

No cubierto: iPhone/Safari y Android físicos, VoiceOver/TalkBack, cartas reales de más de 100 platos con fotos propias, y el seguimiento del pedido después de confirmarlo (sólo revisado en código).

---

## 3 · Lo que ya está bien (no romperlo)

- **Velocidad**: en producción el primer contenido sale a 0.2–0.3 s y el LCP a ~2.1 s en 4G lenta con CPU ×4; CLS 0. Las fotos pasan por `/_next/image` (3–10 KB cada una), con descarga anticipada antes de entrar en pantalla y `content-visibility` en tarjetas.
- **Carta en caché** con etiqueta `menu:<id>` y revalidación al editar (`lib/db/menu.ts`).
- **QR de mesa** salta la portada, valida la mesa y avisa si no existe (`menu-shell.tsx`).
- **Ficha**: lo obligatorio empieza vacío y el botón dice qué falta («Elige término»); mismas reglas que el mesero (`lib/menu/opciones.ts`); grupos anunciados como radios/casillas; foco atrapado y devuelto.
- **Estructuras con personalidad real**: Carta de autor parece un ticket impreso, Vitrina un cartel, Compacto deja ver una carta de 100 platos de un vistazo.
- **Checkout en mesa** con nombre y teléfono opcionales: se puede pedir con un toque.
- **SEO**: JSON-LD de restaurante y carta con precios (`app/page.tsx`).

---

## 4 · Hallazgos

Severidad: **P1** cuesta ventas o datos hoy; **P2** fricción clara con arreglo conocido; **P3** pulido. «Confirmado» = reproducido en pantalla o con medición; «código» = leído en el código.

### 4.1 · Errores que hay que arreglar ya

| ID | Sev. | Hallazgo y evidencia | Arreglo |
|---|---|---|---|
| CV-01 | **P1** | **La carta se recarga sola en la primera visita.** Al registrar el modo sin conexión, `clients.claim()` dispara `controllerchange` y el código hace `window.location.reload()` aunque antes no hubiera ningún service worker. Confirmado: el documento (211 KB sin comprimir) se descarga **dos veces** con y sin `?mesa=`, junto con fuentes y fotos. Quien escanea el QR por primera vez ve parpadear la carta y se le cierra lo que haya abierto en ese segundo. [`offline-support.tsx:41-45`](../../plataforma/src/components/offline-support.tsx#L41) | Recargar sólo si ya había un controlador antes de registrar (`const habia = !!navigator.serviceWorker.controller`). Prueba: primera visita = 1 documento. |
| CV-02 | **P1** | **Una lectura fallida se guarda como carta vacía.** `getMenuDataCached` ignora `error` de categorías y productos; el resultado vacío entra en `unstable_cache` 60 s. Para el comensal el restaurante «no tiene nada». Código (coincide con M02 de ChatGPT). [`lib/db/menu.ts:134-152`](../../plataforma/src/lib/db/menu.ts#L134) | Lanzar si hay `error` (no se cachea) y enseñar «No pudimos cargar la carta · Reintentar». Usar `lib/db/lectura.ts` cuando llegue a la cadena. |
| CV-03 | **P1** | **Aviso de Google al llegar.** En la primera visita a un restaurante con lealtad, un aviso «Gana puntos con cada pedido» tapa la carta ~1 s después de entrar, antes de ver un plato. Confirmado en `rincon502?mesa=4`. Además dispara una acción de servidor en cada primera visita. [`menu-client.tsx:179-192`](../../plataforma/src/components/menu-client.tsx#L179) | Mover la invitación al momento en que tiene sentido: después de confirmar el pedido («Sumaste 35 puntos si inicias sesión») o en «Cuenta». Nunca al entrar. |
| CV-04 | **P1** | **Enlace sin vista previa.** La metadata usa el logo como `og:image`; sin logo no hay imagen. Un enlace a la carta compartido en WhatsApp/Facebook sale como texto pelado. [`app/page.tsx:72-90`](../../plataforma/src/app/page.tsx#L72) | Imagen de vista previa generada (`opengraph-image`) con el nombre, la paleta y el plato estrella. Ver CV-30. |
| CV-05 | P2 | **Teclado: «Agregar» abre la ficha.** La tarjeta es un `div role="button"` que contiene otro botón y escucha Enter/Espacio de sus hijos: con teclado, «+» abre la ficha en vez de agregar. Además es un control dentro de otro control y el nombre accesible «Ver X» oculta el precio. Código (M01 de ChatGPT). [`menu/ui.tsx:41-60`](../../plataforma/src/components/menu/ui.tsx#L41) | Tarjeta como `<article>` con el nombre como botón que se extiende a toda la tarjeta (patrón de «enlace estirado») y «Agregar» hermano, no hijo. |
| CV-06 | P2 | **Estantes desborda a lo ancho** con emulación móvil: documento de 376 px a 320 y 446 px a 390. Confirmado (M04 de ChatGPT). Sin emulación táctil no aparece; falta localizar la pieza en un teléfono físico. | Repisas con `overflow-x:auto` contenidas y sin márgenes negativos fuera de la columna; prueba `scrollWidth === clientWidth` a 320/390/768. |
| CV-07 | P2 | **La búsqueda ignora el inglés.** Filtra por `name` y `description` aunque la carta muestre `name_en`. Código (M03 de ChatGPT). [`catalog.tsx:278`](../../plataforma/src/components/menu/catalog.tsx#L278) | Buscar en ambos idiomas siempre (también ayuda a quien escribe «burger»). |
| CV-08 | P2 | **«EST · 2024» inventado.** Carta de autor y Pizarra imprimen el año de muestra en restaurantes que nunca lo escribieron. [`lib/theme/defaults.ts:668`](../../plataforma/src/lib/theme/defaults.ts#L668) (M05 de ChatGPT) | Vacío por defecto; el rótulo sólo aparece si el dueño escribe su año. |
| CV-09 | P2 | **Más de 1,000 productos se cortan en silencio** (límite de filas de PostgREST, consulta sin paginar). Código (M06 de ChatGPT). | Paginar por bloques ordenados o fijar un tope visible en el editor. Ningún restaurante real llega hoy, pero el corte sería invisible. |
| CV-10 | P3 | **Lo agotado no se puede abrir.** La tarjeta agotada deja de ser tocable; el comensal no puede leer qué era ni cuándo vuelve. [`menu/ui.tsx:41`](../../plataforma/src/components/menu/ui.tsx#L41) | Abrir la ficha en modo lectura con «Vuelve mañana» y alternativas de la misma categoría. |

### 4.2 · Nada saturado en la carta (lo que estorba antes de la comida)

Medido a 390 px: el **primer precio** aparece a **1,066 px** en Clásico (1.3 pantallas), 1,115 en Revista, 967 en Carta de autor, 920 en Pizarra, 528 en Estantes y 388 en Compacto. La guía pide que lo principal empiece en el primer tercio (~280 px).

| ID | Sev. | Hallazgo | Propuesta |
|---|---|---|---|
| CV-11 | **P1** | **Portada de pantalla completa en el enlace general.** Logo (o una «R» gigante si no hay logo), nombre, lema, «Abierto ahora» y «Ver el menú». No enseña ni un plato y obliga a un toque o a deslizar. Es la primera impresión de quien llega desde redes: justo el que hay que convencer. | **Cabecera breve** (≈70 px): logo, nombre y lema; la comida hace de portada (estados del día y lo más pedido). Vitrina conserva su cartel de lanzamiento, que sí vende el producto. Maqueta §1. |
| CV-12 | P2 | **«EL MENÚ» repite lo que ya dijo la portada** («Ver el menú») y ocupa 60–80 px antes de la búsqueda. | Quitar el título; la fila de categorías es el encabezado. |
| CV-13 | P2 | **«Abierto ahora» en la portada.** Anuncia lo normal; la regla dice que el estado toma sitio sólo cuando hay algo que atender. | Mostrar sólo «Cierra en 40 min», «Cerrado · abre a las 7:00» o «Sin pedidos en línea hoy». |
| CV-14 | **P1** | **Tres capas flotantes abajo** con algo en el carrito: «Llamar al mesero» (que además tapa media tarjeta), el resumen del carrito y la navegación. Medido: ≈200 px de 844 (24 % de la pantalla) cubiertos. | **Una sola barra** que se transforma: sin carrito, secciones; con carrito, las secciones se encogen a iconos y aparece «Ver pedido · 2 · Q80». «Mesero» es una sección más y sólo existe con mesa escaneada. Maqueta §3. |
| CV-15 | P2 | **Ficha con el recuadro de alérgenos «no indicados»** en cada platillo (borde punteado, dos líneas). Es honesto, pero ocupa el sitio de lo que vende. | Una línea discreta bajo la descripción: «Alérgenos: pregunta al mesero». El recuadro sólo cuando el dueño sí los indicó. |
| CV-16 | P2 | **Acompañantes como píldoras de texto** («+ Malteada varios sabores +Q28»). Se leen como etiquetas, no como comida. | «Va bien con» con foto pequeña, nombre y precio; se suma con el mismo «Agregar». Maqueta §2. |
| CV-17 | P2 | **Checkout en mesa con campos que no tocan**: «A domicilio» y «Para llevar» visibles con la mesa ya escaneada, cupón en mayúsculas en primer plano y cuatro preferencias de servicio para un solo plato. El botón «Aplicar» toca el borde de su tarjeta. | Con QR de mesa: pedido, mesa y «Enviar a cocina»; nombre, notas, cupón y preferencias detrás de «Agregar una nota o cupón». El tipo de pedido sólo sin mesa. |
| CV-18 | P3 | **Precio en letra de máquina de escribir** (`--ui-font-mono`) y con «.00» en todos los precios enteros («Q52.00»). Se ve técnico, no de restaurante. | Cifras tabulares de la letra de la carta y «Q52» cuando no hay centavos (decisión del dueño; mantener «Q52.50» cuando sí). |

### 4.3 · Diseño y las ocho estructuras

| Estructura | Funciona | Falla | Recomendación |
|---|---|---|---|
| **Clásico** | Recorrido conocido; destacados grandes. | Portada sin comida; en destacados el **texto va encima de la foto** y tapa el plato; destacados de ~200 px de alto: tres platos llenan la pantalla. | Texto debajo de la foto también en destacados; destacados en tira horizontal («Lo más pedido»). |
| **Carta de autor** | Identidad fuerte sin fotos; precios en línea de puntos. | En la primera pantalla de PC la fila de categorías asoma **detrás de la barra inferior**; precio muy pequeño y gris; «EST · 2024». | Precio en tinta completa; en PC navegación arriba. |
| **Revista** | Mosaico editorial con buen ritmo. | La portada en PC es un fondo degradado sin comida (1,273 px hasta el primer precio a 1280). | Portada con la foto del plato estrella o sin portada. |
| **Kiosco** | Elegir sección en grandes portadas, como app de comida. | Un toque extra antes de ver precios. | Mantener; añadir «Lo más pedido» encima de las portadas. |
| **Estantes** | El primer precio más arriba (528 px) entre las fotográficas. | Desborde horizontal (CV-06); dos direcciones de desplazamiento. | Arreglar el desborde; flecha o pista de que la repisa sigue. |
| **Pizarra** | Personalidad de cantina; acordeón. | Portada cartel de 920 px; sólo una sección abierta. | Cabecera breve; permitir varias secciones abiertas. |
| **Compacto** | Lo más rápido: primer precio a 388 px, carta entera en 934 px. | Visualmente la más plana. | Es la base ideal para cartas grandes: no tocar su densidad. |
| **Vitrina** | Vende con la pura imagen; navegación superior propia. | Un plato por pantalla: 13 platos = **10,577 px**. Sólo sirve para colecciones cortas. | Advertir en el editor cuando la carta pase de ~15 platos. |

**Para todas**:

- **PC** (CV-19, P2): la columna del teléfono en medio de un fondo vacío con la barra del teléfono flotando abajo (captura en la maqueta §6). Propuesta: tres columnas (categorías, carta, «Tu pedido» fijo). La regla vigente dice «no ensanchar sin rediseñar las piezas»: la maqueta es ese rediseño, para aprobación.
- **Fuentes** (CV-20, P3): cada carta baja 11–12 archivos de letra (163–191 KB), más que todas sus fotos juntas (50–80 KB) y más de la mitad del JavaScript. Precargar sólo la letra de títulos y la del cuerpo; el resto con `font-display: swap` sin precarga.
- **Ilustraciones de la demo** (CV-21, P2): Rincón 502 usa dibujos, no fotos. Para vender Leogin a un restaurante, la demo debe parecer un restaurante real: fotos reales libres de derechos o hechas para la demo.

### 4.4 · Venta y publicidad (la carta como rostro del restaurante)

| ID | Sev. | Qué falta | Por qué vende |
|---|---|---|---|
| CV-30 | **P1** | **Enlace e imagen por plato** (`/p/doble-bacon`): ficha abierta encima de la carta, con su imagen de vista previa 1200 × 630 (foto, nombre, precio, marca). Agotado → lo dice y ofrece su categoría; retirado → abre la carta. Ya existe «Compartir plato» en Momentos (`admin/momentos/compartir-plato.tsx`); hoy comparte el enlace general. | Convierte cada estado de WhatsApp, historia de Instagram o publicación de Facebook en un anuncio que lleva directo a «Agregar». Es lo más barato y con más efecto de esta auditoría. |
| CV-31 | P2 | **Lo más pedido con datos reales** («#1 · 41 pedidos esta semana»). Leogin ya cuenta ventas por plato (`getVendidosDesdeCached` en Vitrina). | Prueba social honesta: ningún menú en PDF puede decirlo. Ayuda al indeciso y empuja el plato que más margen deja si el dueño lo fija. |
| CV-32 | P2 | **Estados del día** (24 h): el dueño sube una foto desde el teléfono («Salió la lasaña», «Malteadas 2 × Q45 de 3 a 6») y aparecen como círculos arriba de la carta; tocar abre la foto a pantalla completa con «Ver y pedir». | En Guatemala todo el mundo ve estados de WhatsApp: el gesto ya se conoce. La carta deja de ser estática y da una razón para volver a abrirla. Reusa Momentos del panel. |
| CV-33 | P2 | **«Lo de siempre»**: quien ya pidió ve arriba «Pedir lo de la última vez · Q87» (carrito guardado en el aparato o en su cuenta). | El cliente que repite pide en un toque. Es la función que más pedidos recurrentes da en apps de comida. |
| CV-34 | P3 | **Búsqueda por antojo**: al abrir la lupa, atajos «Para compartir», «Menos de Q50», «Sin carne», «Picante», sacados de etiquetas, dietas y precio. | Responde a «¿qué pido?» además de «¿dónde está la limonada?». |
| CV-35 | P3 | **Descripción que vende, asistida**: en el editor, botón «Mejorar descripción» que propone una línea con qué lleva, porción y acompañamiento a partir de lo que escribió el dueño (IA), y él la confirma. Nunca inventa ingredientes. | «Carne de 150 g, con papas» responde más que «deliciosa». La mayoría de dueños no sabe escribirlo. |
| CV-36 | P3 | **Foto guiada**: al subir una foto desde el panel, marco de encuadre (plato centrado, 45°), recorte automático 4:5 y aviso si está oscura o borrosa. | La foto es lo que más vende una carta y lo que peor hacen los restaurantes pequeños. |
| CV-37 | P2 | **Medir para saber**: embudo por canal (QR de mesa / enlace general / enlace de plato): apertura → ficha → agregar → checkout → pedido. Sin nombres, teléfonos ni texto de búsqueda. | Sin línea base, cualquier mejora es una opinión. Tomado de ChatGPT. |

### 4.5 · Rendimiento y capacidad (producción, 390 px)

| Caso | FCP | LCP | TBT | CLS | Transferido |
|---|---:|---:|---:|---:|---|
| `rincon502` enlace general, sin límite | 0.19 s | 0.48 s | 0 | 0 | JS 316 KB · fuentes 191 KB · fotos 70 KB · HTML 33 KB |
| `rincon502?mesa=4`, 4G lenta + CPU ×4 | 0.32 s | 2.11 s | 260 ms | 0.011 | igual, **dos veces el documento** (CV-01) |
| Revista, 4G lenta + CPU ×4 | 0.30 s | 0.30 s | 383 ms | 0 | JS 315 KB · fuentes 176 KB |
| Compacto, 4G lenta + CPU ×4 | 0.20 s | 0.20 s | 315 ms | 0 | JS 315 KB · fotos 3 KB |

Conclusión: **la velocidad no es el problema**; lo son la recarga (CV-01), el peso de las fuentes (CV-20) y ~315 KB de JavaScript iguales para una carta de 5 platos que para una de 100. Con cartas grandes, ChatGPT midió que el HTML crece casi lineal (92 KB → 1.6 MB de 13 a 500 platos en desarrollo): para Compacto y Estantes conviene dibujar por secciones a medida que se acercan, con la búsqueda sobre la carta completa (CV-38, P3).

---

## 5 · La propuesta: «La carta que vende»

Seis piezas comunes a todas las estructuras. Las estructuras siguen decidiendo **cómo se recorre la carta** (rejilla, filas, mosaico, repisas, acordeón); lo que cambia es lo que la rodea. Todo con la paleta del restaurante y superficies sólidas.

| # | Pieza | Qué cambia | Toques / medida |
|---|---|---|---|
| 1 | **Cabecera breve + comida de portada** | Logo, nombre y lema en ≈70 px; mesa y avisos sólo cuando cuentan; debajo, estados del día y «Lo más pedido». | Primera comida a ~120 px, primer precio a 471 px (antes 1,066 px y un toque). |
| 2 | **Ficha que nace de la foto** | La foto tocada crece hasta la cabecera de la ficha (transición compartida, 380 ms, curva de la casa); «lo que lleva» en piezas cortas; total que cuenta al cambiar; deslizar hacia abajo para cerrar; vibración de 12 ms al agregar (ya existe). | Mismo número de toques; se siente continuo en vez de «otra hoja». Con movimiento reducido, cambio inmediato. |
| 3 | **Una sola barra** | Navegación + carrito + mesero en una pieza que se transforma. | De ≈200 px tapados a 66 px. |
| 4 | **El plato como anuncio** | Enlace e imagen por plato (CV-30) y estados del día (CV-32). | De «buscar el plato que vi» a 1 toque para agregarlo. |
| 5 | **El pedido de la mesa** | Quien escanea el QR de la Mesa 4 entra al pedido de esa mesa: cada teléfono agrega lo suyo, todos ven la lista en vivo, uno lo manda a cocina; cuenta por persona antes de pedir. | Un envío a cocina, sin duplicados; el mesero ve la mesa entera en Servicio como hoy. |
| 6 | **PC de tres columnas** | Categorías, carta y «Tu pedido» siempre visible. | Usa el ancho sin estirar las tarjetas del teléfono. |

**Por qué es «nunca antes visto» y a la vez práctico:** las apps de reparto tienen tiras de recomendados y las redes tienen estados, pero ninguna carta de restaurante en la región junta (a) estados efímeros publicados desde el teléfono del dueño, (b) prueba social con sus ventas reales, (c) un enlace por plato que es su propio anuncio y (d) el pedido colectivo de la mesa enlazado a su KDS y su caja. Cada pieza resuelve algo que hoy pasa en la mesa o en WhatsApp; ninguna es adorno.

**Lo que se descartó a propósito:** realidad aumentada del plato (cara de producir, la usa casi nadie), carta conversacional con IA en primer plano (lenta y menos clara que ver fotos), videos automáticos en la carta (gastan datos móviles del comensal), y fondos de vidrio o translúcidos (decisión vigente del dueño).

---

## 6 · Más ideas para el banco (después de la propuesta)

- **La próxima hornada** (de ChatGPT): para panaderías y pizza por porción, cocina publica «sale a las 4:30» con caducidad. Encaja como tipo de estado (CV-32).
- **Entre estos dos** (de ChatGPT): comparar dos platos parecidos lado a lado (Q52 frente a Q68, qué cambia). Útil en cartas de hamburguesas o cafés con muchas variantes.
- **Modo noche/día automático por paleta**: cartas claras que pasan a su versión oscura de noche en terrazas.
- **Pedir de nuevo desde el seguimiento**: al terminar, «¿Otra ronda?» con lo mismo de bebidas.
- **Carta en voz** (accesibilidad): botón que lee la sección abierta para personas con baja visión.

---

## 7 · Plan por fases

| Fase | Qué entra | Esfuerzo | Cómo se comprueba |
|---|---|---|---|
| **0 · Arreglos** (sin diseño nuevo) | CV-01, CV-02, CV-03, CV-05, CV-06, CV-07, CV-08, CV-10; imagen de vista previa general con la paleta (parte de CV-04). | 2–3 días | 1 documento por primera visita; lectura fallida ≠ carta vacía; Tab/Enter en las 6 formas de tarjeta; `scrollWidth` a 320/390/768; «lemonade» encuentra la limonada. |
| **1 · Nada saturado** | CV-11 a CV-17 (cabecera breve, una sola barra, ficha, checkout de mesa) en las 8 estructuras × claro/oscuro. | 1–1.5 semanas | Primer precio < 500 px en las fotográficas; zona tapada abajo ≤ 80 px; capturas 320/390/1280 de las 8 estructuras. |
| **2 · Vender** | CV-30 enlace e imagen por plato, CV-31 lo más pedido, CV-33 lo de siempre, CV-18 precio, CV-37 embudo por canal, CV-20 fuentes. | 1.5–2 semanas | Vista previa correcta en WhatsApp y Facebook; embudo con línea base de dos semanas antes y después. |
| **3 · Otro nivel** | CV-32 estados del día, transición compartida de la ficha, PC de tres columnas (CV-19), pedido de la mesa (piloto en un restaurante), CV-34/35/36. | 3–5 semanas | Piloto con un restaurante: pedidos por mesa, ticket promedio, duplicados, quejas del mesero. |

Cada fase en su rama y su PR; maqueta aprobada antes de tocar lo visual (la de este documento cubre las fases 1–3).

**Estado (2026-11-18):** la **fase 0 está hecha** en la rama `fix/carta-fase-0`, apilada sobre esta auditoría. Lo que quedó:

- **CV-01:** solo recarga si ya había un service worker al mando. Medido: 1 documento en la primera visita.
- **CV-02:** la lectura fallida lanza (no se guarda en caché) y la carta dice «No pudimos cargar la carta · Volver a cargar». El checkout sigue sin sugerencias.
- **CV-03:** se quitó el aviso de Google al llegar. La invitación ya vivía en la confirmación del pedido y en «Cuenta».
- **CV-04 (parte general):** `/api/og/<slug>` dibuja una tarjeta de 1200 × 630 con nombre, frase y paleta cuando no hay logo.
- **CV-05:** la tarjeta ya no es un botón con otro botón dentro. Lleva un «Ver …» propio para teclado, hermano de «Agregar», y el foco se dibuja en la tarjeta.
- **CV-06:** la animación de Estantes movía la repisa entera 56 px a la derecha. Ahora mueve las piezas dentro de la repisa. `scrollWidth` es igual al ancho a 320, 390 y 768 en las 8 estructuras.
- **CV-07:** la búsqueda mira los dos idiomas.
- **CV-08:** el rótulo queda vacío por defecto, y un «EST · 2024» guardado no se imprime.
- **CV-10:** lo agotado o fuera de horario abre la ficha en modo lectura con el motivo («Agotado · vuelve mañana»), sin «Agregar» ni acompañantes.

Falta el plato estrella en la imagen de vista previa, que va con CV-30 en la fase 2.

**Estado (2026-11-18, más tarde):** la **fase 1 está hecha** en la rama `feat/carta-fase-1`, apilada sobre la fase 0. El dueño delegó las decisiones («haz todo tú»), y se tomó lo recomendado: la cabecera breve sustituye a la portada en todas las estructuras menos Vitrina, y la portada completa queda como interruptor del editor.

- **CV-11:** la carta abre con la cabecera breve (logo, nombre y lema). El interruptor «Portada a pantalla completa» devuelve la portada de la plantilla en el enlace general. Primer precio a 390 px: Clásico 406, Carta de autor 277, Revista 424, Estantes 438, Pizarra 230 y Compacto 298 (antes 920–1,115).
- **CV-12:** «El menú» solo se pinta si el dueño escribió otro titular.
- **CV-13:** «Abierto ahora» ya no se anuncia; «Cierra en N min» aparece en la última hora (`minutosParaCerrar` en `lib/hours.ts`, con prueba).
- **CV-14:** una sola barra abajo. Con carrito, las secciones quedan en iconos y el pedido ocupa el centro (bolsa, cantidad y total). «Mesero» es una sección que solo existe con mesa escaneada. Ya no flota nada encima de la barra.
- **CV-15:** los alérgenos sin indicar son una línea discreta, no un recuadro.
- **CV-16:** «Va bien con» en piezas con foto, nombre y precio.
- **CV-17:** con QR de mesa, el checkout muestra el pedido, la mesa y «Confirmar pedido». El nombre, la nota y las preferencias van tras «Agregar nombre, nota o preferencia», y el tipo de pedido tras «¿No estás en el local?». El cupón es un enlace que abre la casilla, en todos los tipos de pedido.

Comprobado a 390 y 1280 px en las 8 estructuras, sin desborde. Falta probar en iPhone y Android físicos.

---

## 8 · Lo que decide el dueño

1. ¿La **cabecera breve** sustituye a la portada de pantalla completa en todas las estructuras (Vitrina conserva su cartel)?
2. ¿**Lo más pedido** con números reales («41 pedidos esta semana») o sólo el orden?
3. ¿Precio **«Q52»** sin «.00» cuando no hay centavos y sin letra de máquina?
4. ¿**Estados del día** desde el panel, con caducidad de 24 h?
5. ¿El **aviso de puntos** pasa a después del pedido?
6. ¿La **PC de tres columnas** ahora (fase 3) o antes?
7. ¿Qué restaurante sirve de **piloto** para el pedido de la mesa?

---

## 9 · Comparación con la auditoría de ChatGPT

La de ChatGPT ([`AUDITORIA_MENU_DIGITAL_2026-11-18.md`](https://github.com/CrisLeonardo/Catalogos-Restaurantes/blob/audit/menu-digital-venta/docs/auditorias/AUDITORIA_MENU_DIGITAL_2026-11-18.md), rama `audit/menu-digital-venta`) es cuidadosa con la evidencia, pero casi todo termina en «probar», «medir» o «evaluar», con pocas decisiones de diseño concretas y una sola maqueta.

| Tema | ChatGPT | Esta auditoría | Qué se toma |
|---|---|---|---|
| Teclado en «Agregar» (M01) | Lo encontró | Confirmado en código (CV-05) y se propone el patrón concreto | **Sí**, tal cual |
| Lectura fallida cacheada (M02) | Lo encontró | Confirmado (CV-02) | **Sí** |
| Búsqueda en inglés (M03) | Lo encontró | Confirmado (CV-07) | **Sí** |
| Desborde de Estantes (M04) | Lo encontró y midió | Reproducido con las mismas cifras (CV-06) | **Sí** |
| «EST · 2024» (M05) | Lo encontró | Confirmado (CV-08) | **Sí** |
| Tope de 1,000 filas (M06) | Lo encontró | Confirmado en código (CV-09) | **Sí** |
| Prueba de volumen 13/100/500 platos | La hizo (en desarrollo) | Se cita en §4.5 | **Sí**, como dato |
| Embudo por canal | Lo propuso | CV-37 | **Sí** |
| Enlace directo al plato anunciado | Lo propuso | CV-30 con imagen generada y estados agotado/retirado | **Sí**, ampliado |
| «Al centro» (mesa para compartir con precio por persona) | Maqueta principal | Se integra en el **pedido de la mesa**, que usa mesas y tiempo real reales en vez de una combinación armada por el dueño | **La idea sí**, la forma no |
| «La próxima hornada», «Entre estos dos» | Propuestas | Banco de ideas (§6) | **Sí**, para después |
| «Una ronda para la mesa» | La descartó por esfuerzo alto | Es la apuesta fuerte (fase 3, con piloto) | Se discrepa |
| Recarga en la primera visita | **No la vio** | CV-01 (P1, medido) | — |
| Aviso de Google al entrar | **No lo vio** | CV-03 (P1, en pantalla) | — |
| Tres capas flotantes abajo | **No lo vio** | CV-14 (P1, medido) | — |
| Sin vista previa sin logo | **No lo vio** | CV-04 | — |
| Portada de pantalla completa | La midió y propuso «probar» | Se propone quitarla (CV-11) con maqueta | Se discrepa: es una decisión, no un experimento |
| Checkout de mesa, alérgenos, acompañantes, precio, fuentes, PC | No los trató | CV-15 a CV-20 | — |
| Mediciones de rendimiento | En desarrollo; dice que no sirven para producción | En **producción** con 4G lenta y CPU ×4 | — |

---

## 10 · Cobertura pendiente

Safari en iPhone y Android físico (sobre todo CV-06 y la transición de la ficha), VoiceOver/TalkBack, cartas reales de 60–150 platos con fotos propias, zoom de texto al 200 %, seguimiento del pedido en pantalla y la prueba con comensales reales de la fase 1 antes de dar por buena la cabecera breve.
