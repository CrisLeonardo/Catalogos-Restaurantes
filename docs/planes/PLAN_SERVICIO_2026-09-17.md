# Plan — Módulo de Servicio (rediseño «Tomar pedidos y Mesas»)

**Fecha:** 17 de septiembre de 2026
**Origen:** `design_handoff_servicio/` (Servicio.dc.html + README), hecho con Claude Design.
**Alcance acordado con el dueño:**

- Se implementa en **Tomar pedidos (`/admin/mesero`)** y en **Mesas (`/admin/mesas`)**.
- Se añade una **vista de plano rediseñada** (parecida a la actual pero bien hecha y apta
  para toda pantalla). Queda a revisión si se conserva.
- Se conservan, **integrados y no pegados**: artículo libre (M-09) y anular plato con
  motivo + PIN (mig. 079).
- **La propina se queda** (el handoff la eliminaba; el dueño decidió que no).
- Se construyen: los más pedidos + atajos 1-9, paleta ⌘K + modo aprendiz, dictado por voz.
  **No** se construye «lo de siempre» (historial de clientes para llevar).
- Se corrigen los errores del propio diseño (ver más abajo).

---

## 1 · Errores y huecos del diseño entregado

Encontrados leyendo `Servicio.dc.html` línea a línea y contrastándolos con la base.

### Errores de código del prototipo

| # | Qué | Dónde | Corrección |
|---|---|---|---|
| E-01 | `color:var(--brand-bg-2)fff` — CSS inválido, el color **no se aplica** | 5 botones primarios (enviar a cocina, agregar, para llevar, voz) | `color: var(--brand-on-accent)` |
| E-02 | `hasTotal` declarado dos veces en el mismo objeto; la primera (`&& !tight`) es código muerto | `sala.map()` | Una sola regla |
| E-03 | El CTA de cobro dice «Cobrar {total} y cerrar» aunque estés en **partes iguales** | `cobrarCta` | El CTA dice lo que de verdad se va a cobrar |
| E-04 | `Math.ceil(cobrarBase/100)*100 + 0` — el `+0` es basura | `cashOpts` | Fuera |
| E-05 | Al escribir «2 pep», la rejilla se filtra por el **nombre completo** del plato encontrado y colapsa a un resultado | `dishes` filter | Se filtra por lo tecleado; el chip ⏎ dice lo interpretado |
| E-06 | `liberar()` en dos toques **no caduca**: queda armado para siempre | `mesaAction` | Se desarma solo a los 4 s |
| E-07 | «Para llevar» numera L1, L2… contando los vivos; al cobrar uno, el siguiente **reusa el número** | `crearLlevar` | La numeración la lleva el pedido real (`order_number`) |
| E-08 | `Alt+1-9` salta al orden del array, no al de las pestañas visibles | `onKey` | Salta a la pestaña N que se está viendo |
| E-09 | El dictado está simulado con `setTimeout` y dos platos quemados | `openVoz`/`vozAdd` | Web Speech API real, con caída elegante |

### Problemas de sistema (el diseño choca con lo que ya existe)

| # | Qué | Decisión |
|---|---|---|
| S-01 | **Tema oscuro.** El prototipo es solo claro y usa `var(--brand-bg-2)` como «texto sobre tinta». En oscuro eso es `#141416` sobre texto claro: invisible. | Todo pasa por tokens de contraste (`--brand-on-accent`, `--c-on-solid`, `--adm-card`). Se verifica en los dos temas. |
| S-02 | **«Servido» por línea no existe en la base.** `order_items` no tiene estado; el estado es del PEDIDO. | Migración **133**: `order_items.served_at`. Con guarda de migración ausente (`faltaLaColumna`) para degradar a servir el pedido entero. |
| S-03 | **Cobrar una parte «quita esas líneas y deja la mesa abierta».** En nuestra base borrar líneas cobradas sería anular (motivo + PIN) y falsearía la venta. | Acción nueva `cobrarParteDeMesa`: escribe el movimiento en `order_payments` (mig. 129 ya lo contempla: «un cobro parcial es una fila y ya») y marca las líneas pagadas en `table_splits` (mig. 125). La mesa sigue abierta y las líneas pagadas se ven saldadas, no desaparecidas. |
| S-04 | **Falta el estado «sentada sin pedir»** (mig. 128). El diseño la pintaría *libre*. | Quinto estado `sentada`. Perderlo era la mitad del hallazgo M-02: dos meseros yendo a la misma mesa. |
| S-05 | **Falta la llamada del comensal.** El diseño solo contempla el pedido por QR; hoy existen «te llaman» y «pidió la cuenta», que son alarma real. | Se superponen al color de estado como **insignia de atención**, sin romper la regla «el color dice qué le falta». |
| S-06 | La propina no está en la hoja de cobro. | Se añade, respetando `tipAppliesToType` (mesa / para llevar) igual que hoy. |
| S-07 | El diseño no dibuja el plano del salón, que el dueño sí dibujó en Ajustes › Salón. | Vista «Plano» rediseñada (fase 3). |

---

## 2 · Traducción de vocabulario

El prototipo inventa un modelo de estado de mesa; el sistema ya tiene el suyo
(`lib/table-state.ts`). No se tiran ninguno de los dos: se **compone**.

| Diseño | Sistema | Nota |
|---|---|---|
| `libre` | `kind: 'libre'` | igual |
| — | `kind:'abierta'` sin pedido (mig. 128) | **nuevo**: `sentada` |
| `borrador` (sin enviar) | carrito local de esa mesa | solo vive en el aparato |
| `cocina` (falta servir) | pedidos `NEW/PREP/READY` con líneas sin servir | |
| `listo` (por cobrar) | todo servido | |
| — | `reason: 'cuenta' \| 'llamada'` | **insignia** encima del color |

`nuevo / cocina / servido` de la comanda:

- **nuevo** — línea del carrito local, aún sin pedido. Es lo único con ± y ✎.
- **cocina** — `order_items` de un pedido vivo sin `served_at`.
- **servido** — `served_at` puesto (o el pedido entero en `SERVED`/`DELIVERED`).

---

## 3 · Fases

### Fase 0 — Cimientos
- `src/lib/servicio/estado.ts` — los cinco estados, derivados por mesa, totales.
- `src/lib/servicio/comanda.ts` — líneas unificadas (carrito + base), agrupación, parser.
- Migración `133_servido_por_linea.sql`.
- Acciones nuevas: `servirLinea`, `cobrarParteDeMesa`.
- Bloque CSS `.sv-*` en `globals.css` + icono `mic`.

### Fase 1 — El módulo, tres ramas
- `servicio-panel.tsx` (orquestador), `salon-rail.tsx`, `carta.tsx`, `comanda-panel.tsx`.
- Móvil `<900`: Salón → Comanda → Pedido. Tablet `900–1100`: 232 + carta + 288.
  PC `≥1100`: 264 + carta + 344.
- Reglas duras del handoff: rejilla nunca por debajo de 2 columnas
  (`minmax(138px,1fr)`), todo control ≥ 44 px, filas «sin enviar» apiladas,
  filas horizontales con `nowrap` + `overflow-x:auto`.

### Fase 2 — Hojas y teclado
- Opciones (la del comensal, restilada), cobro, mesa, para llevar, voz, atajos, paleta ⌘K.
- Artículo libre dentro de la hoja de opciones/carta; anular con PIN desde la línea ya enviada.

### Fase 3 — Plano rediseñado
- Lienzo relativo (0..1) con niveles y referencias fijas, con la piel nueva y apto para
  teléfono (desplazable y con zoom de ajuste, no encogido hasta ser ilegible).

### Fase 4 — Cableado
- `/admin/mesero` → puesto `servicio`. `/admin/mesas` → puesto `mando`.
- Lo que separa los dos sigue siendo el VERBO (auditoría 2026-09-07), no el dibujo.

### Fase 5 — Pruebas y verificación
- Vitest de `lib/servicio/*` y del reparto parcial.
- Verificación en pantalla, en tema claro y oscuro, a 390 / 1024 / 1440 px.

---

## 4 · Qué quedó hecho (17 de septiembre de 2026)

### Archivos nuevos

| Archivo | Qué es |
|---|---|
| `supabase/migrations/133_servido_por_linea.sql` | `order_items.served_at` — servir plato a plato. **Pendiente en producción.** |
| `src/lib/servicio/estado.ts` | Los cinco estados de mesa, derivados, filtros, orden y resumen del salón. |
| `src/lib/servicio/comanda.ts` | Las tres fases de la comanda, totales y el parser «2 pepián». |
| `src/lib/servicio/voz.ts` | Interpretación del dictado + Web Speech API. |
| `src/lib/actions/servicio.ts` | `servirLineas`, `deshacerServirLineas`, `cobrarParteDeMesa`, `cobradoDeMesa`, `ponerNombreDeMesa`, `cobrarPedidoParaLlevar`. |
| `src/lib/db/servicio.ts` | «Los más pedidos», de las ventas reales de 14 días. |
| `src/components/admin/servicio/*` | El módulo: orquestador, salón (riel / fichas / plano), carta, comanda, hojas, paleta ⌘K. |
| `src/lib/servicio/*.test.ts` | 49 pruebas. |

### Archivos tocados

`app/admin/(waiter)/mesero/page.tsx` (monta el módulo), `globals.css` (bloque `.sv-*`),
`components/admin/salon-board.tsx` (Mesas usa el plano nuevo), `components/icons.tsx`
(`mic`, `keyboard`, `layout`, `undo`, `split`), `types/index.ts` (`served_at`).

`components/admin/waiter-panel.tsx` y sus piezas exclusivas se quedan en el árbol **sin
usar**, a propósito: si el rediseño se rechaza, volver es cambiar un `import`.

### Fallos encontrados y arreglados MIRANDO LA PANTALLA

1. **La rama responsive se decidía midiendo `window.innerWidth`**, y en un contenedor
   todavía sin medir eso vale 0: el módulo entero caía a la rama del teléfono en una PC
   de 1440. Ahora se pregunta con `matchMedia`, con los mismos cortes que la hoja de
   estilos.
2. **Faltaba `min-height: 0` en las tres columnas**: en el teléfono el cuerpo es una
   columna y la carta medía 1.764 px dentro de una pantalla de 844, con la barra de
   «Enviar a cocina» fuera de la vista.
3. **El plano no cabía en un riel de 264 px.** Pasó a ser una capa a pantalla completa.
4. **El total de la comanda sumaba líneas y el cobro cobraba `orders.total`**: el botón
   prometía Q174 y el sistema cobraba Q186. Ahora los dos dicen lo mismo, con la propina
   a la vista.
5. **Una parte cobrada no llevaba su trozo de propina**, así que quien pagara el último
   cargaba con toda. Ahora se reparte en proporción, en el cliente y en el servidor.
6. **El dictado inventaba un plato con «sin hielo»** a secas. Lo encontró una prueba.

### Lo que queda pendiente

- **Migración 133 en producción** (y las 123-132, que ya venían pendientes). En el
  Supabase LOCAL ya está corrida.
- **Decidir si el plano se queda** (el dueño lo pidió a prueba).
- Las FICHAS y la LISTA de Mesas siguen siendo las de mando (una mesa = una acción, con
  la métrica que el encargado elige). Solo el PLANO es común. Cambiarlas por las del
  módulo de servicio quitaría el botón de acción por ficha, el selector de métrica y la
  barra de etapa, que es lo que la auditoría del 7 de septiembre estableció como la
  diferencia entre los dos puestos.


---

## 5 · Segunda pasada: contra la base de verdad

Con Docker arriba y el Supabase local, recorrido completo en `azucar-negra`
(`/panel/azucar-negra/mesero`): abrir mesa → apuntar → enviar a cocina → servir plato a
plato → cobrar una parte → cerrar. Cinco fallos que **ninguna prueba unitaria ni la
pantalla con datos de mentira podían encontrar**:

| # | Qué pasaba | Por qué |
|---|---|---|
| R-01 | **«Invalid uuid» en cada envío.** El módulo no podía mandar una sola comanda. | El `clientId` era `srv-<mesero>-<hora>-<azar>`; `orders.client_id` es una columna `uuid` y el esquema la valida con `z.string().uuid()`. Ahora es `crypto.randomUUID()`. |
| R-02 | **La rejilla de platos caía a UNA columna** a 1.150 px de ventana. | Los cortes medían la VENTANA y dentro del panel el módulo no es la ventana: la barra lateral se lleva 244 px. El módulo medía 906 px y se pintaba con los anchos de PC, dejando la carta en 298. Ahora el CSS usa `@container` y el JavaScript un `ResizeObserver` sobre la raíz. |
| R-03 | Un `ResizeObserver` sobre el propio elemento con `container-type` **no reporta nada**. | Comprobado: el ancho pasó de 906 a 700 px sin un solo evento. Se observa el padre, que mide lo mismo. Y se añadió un respaldo por `resize` de ventana, porque en una pestaña que no pinta el observador se retrasa. |
| R-04 | **Se cobraba de más.** Una mesa de Q114 con Q24 ya pagados se cerró con un movimiento de Q114 más: **Q138 en el arqueo**. | Sin `amount` explícito, `freeTable` entiende «lo que quede» y aplica el total del pedido, que no sabe de cobros parciales. Ahora el importe viaja siempre, y lo que falta se calcula del DINERO de `order_payments`, no de la suma de las líneas (que es consumo y no lleva propina). |
| R-05 | Recargar la tablet a media comanda **perdía la mesa**. | El panel anterior la guardaba en `?mesa=N` y el módulo nuevo no. Restaurado, con `?ir=cobrar` para que el salón del encargado pueda aterrizar en el cobro. |

Y un detalle de aspecto: la ficha de una mesa libre decía «Libre» dos veces (el chip y el
subtítulo).

**Comprobado en la base tras el arreglo**: pedido `ORD-2026-00057`, total Q69,
`order_payments` = Q45 + Q24 = **Q69 exactos**. `order_items.served_at` se escribe plato a
plato y el pedido salta a `SERVED` solo cuando no le queda ninguna línea sin servir.
«Los más pedidos» sale del historial real de ventas.
