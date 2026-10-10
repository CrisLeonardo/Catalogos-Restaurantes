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

## Fase 2 · Cierre real, apertura, archivo y próximo drop (migración 141) ✅

Rama `feat/vitrina-fase2` (sobre `feat/estructura-vitrina`).

- [x] **Cierre y apertura reales**: `launchOpensAt` / `launchEndsAt` (instantes ISO; el editor los traduce desde la hora del aparato). `lib/vitrina/edicion.ts` da UN estado (`sin`, `proxima`, `abierta`, `cerrada`) que usan el menú y el servidor. `createOrder` rechaza el pedido del cliente fuera de la edición; mesero, caja y hub no se tocan. Probado: pedido rechazado con «Esta edición abre el …» y ninguna fila en `orders`.
- [x] **Menú según el estado** (`useEdicion`, que solo se recalcula al cruzar apertura o cierre): en «próxima» muestra «Muy pronto · abre el …», cuenta hacia la apertura y botones «Abre …»; en «cerrada» muestra el aviso y «Edición cerrada»; la ficha del producto tampoco deja agregar.
- [x] **Archivo**: `drop_editions` + `drop_edition_items` (migración 141, RLS sin políticas, solo servidor). `vitrina_archivar_edicion` guarda la foto de las piezas (idempotente por restaurante + nombre + cierre). pg_cron `leogin-vitrina-archivo` cada 10 min. En el editor: «Cerrar y archivar ahora» y «Quitar». En el menú: «Archivo» en gris con «Agotado en 3 h 12 min» o «Cerró el …».
- [x] **Próximo drop** (`content.vitrina.nextTitle` / `nextDate`) con «Avísame por WhatsApp»: enlace `wa.me` con el mensaje escrito. No se guardan teléfonos de clientes.
- [x] **«Quedan 9 de 30»** con barra: total = quedan + vendidas desde la apertura (`getVendidosDesdeCached`); solo en los productos que el aviso «Quedan pocas» ya enseña.

Pendiente, si se pide: avisar automáticamente a una lista de interesados (necesitaría guardar teléfonos y una API de WhatsApp).
