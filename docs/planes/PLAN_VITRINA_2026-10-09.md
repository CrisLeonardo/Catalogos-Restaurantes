# Plan · Estructura «Vitrina» y lanzamientos (2026-10-09)

**Para quién:** comercios que venden con la pura vista: postres de autor, ediciones limitadas, «drops», tiendas que solo venden en línea. La foto del producto es el argumento de venta.

**Decisión del dueño (2026-10-09):** el diseño no tiene que ser «drop» a la fuerza. Vitrina es una estructura de menú más; el **modo lanzamiento** es un interruptor que se enciende solo si el comercio vende por ediciones. La cinta de anuncios y «quedan pocas» son opcionales y sirven en cualquier estructura.

Maqueta aprobada: [`docs/diseno/vitrina/maqueta.html`](../diseno/vitrina/maqueta.html). Para verla: `preview_start` con `maquetas-diseno` y abrir `/vitrina/maqueta.html`.

## Fase 1 · Estructura, cinta, lanzamiento y existencias, sin migración ✅

Rama `feat/estructura-vitrina`.

- [x] 8.ª estructura **Vitrina** (`templates.ts`): portada `vitrina`, platillo `pieza`, navegación por secciones, nombre del producto en letra de cartel.
- [x] Tres paletas nuevas, **Cereza**, **Cacao** y **Pistache** (25 en total; 8 × 25 = 200 plantillas).
- [x] Forma de platillo **«Pieza grande»** (`PiezaTile` en `components/menu/catalog.tsx`): foto 4:5, sello de AGOTADO sobre la foto en gris y botón grande.
- [x] Portada **Vitrina** (`portada.tsx`): foto a sangre (si no hay imagen de fondo, usa la de un producto favorito) y titular de cartel con la última palabra en el acento.
- [x] **Cinta de anuncios** (`components/menu/cinta.tsx`, `content.vitrina.ticker`): se pinta en cualquier estructura si tiene texto.
- [x] **Modo lanzamiento** (`launchMode`, `launchEndsAt`, `content.vitrina.*`): título de la edición, cuenta regresiva y piezas numeradas Nº 01 / NN sobre toda la carta.
- [x] **«Quedan pocas»** (`showStockLeft`, `stockLeftBelow`): el servidor solo manda el número de los productos con inventario bajo el umbral (`withStockLeft` en `lib/db/menu.ts`); con el aviso apagado, el inventario no sale del servidor.
- [x] **Fiel a la maqueta** (pedido del dueño el mismo día): en la Vitrina la barra de navegación de abajo se reemplaza por una **barra fija arriba** (marca + menú «···» con pedidos/puntos/cuenta/idioma + «Bolsa · N») y una **bolsa oscura** abajo (`components/menu/vitrina-bar.tsx`); la carta va sin «El menú», buscador ni píldoras, con rótulos «CATEGORÍA · N productos» o una sola alineación en lanzamiento; precio «Q45» con la moneda volada, botón de tinta y «− n +»; portada a 82 svh con botón en píldora; pie de página.
- [x] Controles en el editor del dueño (pestaña Menú → «Cinta y lanzamientos») y en el del Super Admin.

## Fase 2 · Lo que necesita datos nuevos (migración 141) ⏳

- [ ] **Cierre real del lanzamiento**: hoy la cuenta regresiva solo anuncia el cierre; al llegar a cero no apaga los pedidos. Habría que cerrar los pedidos de la edición en el servidor (`place_order`) y no solo en la pantalla.
- [ ] **Apertura programada**: que el drop se publique solo a una hora, con «Abre en…» antes.
- [ ] **Archivo de ediciones anteriores** (agotadas, en gris, «Agotado en 3 h 12 min»): requiere guardar las ediciones y su hora de agotado.
- [ ] **Próximo drop** con «Avísame por WhatsApp»: requiere lista de avisos por comercio.
- [ ] «Quedan 21 de 30» con barra: requiere guardar las existencias iniciales de la edición.
