# Auditoría de navegación y experiencia de uso — 2026-10-14

> **Estado:** abierta. 0 de 20 hallazgos hechos. Es un diagnóstico: no se ha tocado código.
> Las decisiones que necesito de ti están en [Decisiones](#decisiones-que-necesito-de-ti).

## La pregunta

¿La forma de moverse por Leogin —barra inferior en el teléfono, barra lateral en la
computadora, dónde vive cada cosa y cómo se llega a cada función— es la más adecuada,
cómoda y práctica para este tipo de sistema? Tanto en el **panel** (dueño, cajero,
mesero, cocina) como en la **carta** que ve el comensal.

## Cómo se revisó

- **Código:** `components/admin/shell.tsx`, `lib/admin-nav.ts`, `section-tabs.tsx`,
  `admin-more-menu.tsx`, `command-search.tsx`, los tres layouts del panel
  (`(protected)`, `(waiter)`, `(kitchen)`), `app/admin.css`; y en la carta
  `menu-shell.tsx`, `menu-client.tsx`, `menu/bottom-nav.tsx`, `menu/catalog.tsx`,
  `menu/cart.tsx`, `waiter-call-button.tsx`, `active-order-chip.tsx`.
- **En vivo**, con la app corriendo en local (Supabase local con todas las migraciones
  hasta la 145), restaurante de prueba **Bistró La Plaza** (plan Pro, plantilla con
  píldoras y tarjetas), a **375 × 812** (teléfono), **768 × 1024** (tablet vertical) y
  **1366 × 800** (computadora). Medidas tomadas del DOM, no a ojo.
- Contra las pautas de plataforma que el propio código ya cita (Apple HIG, Material) y
  contra lo que hacen las apps de pedidos y los POS de restaurante.

## Veredicto en corto

**Panel: la arquitectura es la correcta y no recomiendo rehacerla.** Seis destinos
agrupados por la pregunta del dueño (Hoy · Pedidos · Menú · Clientes · Negocio ·
Ajustes), pestañas dentro de cada uno, Ajustes como índice con «volver», un buscador con
sinónimos y un botón de acción central para tomar pedidos es exactamente el modelo de
los mejores paneles del sector (Shopify, Square, Toast) y está mejor pensado que el de la
competencia que ya analizamos. Lo que falla son **los bordes**: la barra del teléfono va
al límite (7 huecos), en la computadora falta la acción principal, el menú se arma
distinto según la pantalla y en el primer ingreso se apilan avisos.

**Carta: el esqueleto (portada → carta → ficha → carrito) es el estándar correcto, pero
tiene tres problemas de fondo que sí afectan al comensal todos los días:**

1. **El gesto «atrás» del teléfono saca al comensal del menú** en vez de cerrar la ficha
   o el carrito que tiene abierto (NC-01).
2. **«Cuenta»** en la barra inferior, dentro de un restaurante, se lee como «pedir la
   cuenta»; abre un formulario de datos personales (NC-02).
3. **La vista «Todo» de la plantilla clásica mezcla categorías** sin encabezados: un
   postre, una limonada, un filete, un ceviche… (NC-03).

Y en la computadora la carta se sigue viendo como una app de teléfono estirada (NC-07).

---

## Lo que está bien y no hay que tocar

Para que una próxima ronda no lo «arregle» por accidente:

**Panel**
- **Seis destinos por pregunta, no por módulo** (`lib/admin-nav.ts`). Las rutas no se
  movieron: la agrupación es solo navegación. Es la decisión de fondo correcta.
- **Pestañas dentro del grupo** (`section-tabs.tsx`) con la activa centrada sola en el
  teléfono, y **candados dentro de la sección** en vez de en el menú: se vende donde el
  dueño está buscando la función, no en medio del trabajo.
- **Ajustes como índice** con «‹ Ajustes» en las hijas: es el patrón de Ajustes de iOS y
  Android, y doce pantallas no caben en una fila de pestañas.
- **Buscador con sinónimos** («impresora» → La PC del local, «factura» → Facturación) y
  filtrado por permisos. Con ~30 pantallas, es lo que hace que seis destinos no cuesten.
- **«Tomar pedido» como acción central con su nombre** (no un «+» mudo), marcado como
  «aquí estás» cuando estás en esa pantalla, y que se aparta cuando hay una barra de
  guardar o de carrito pegada abajo.
- **Un solo sitio marcado** en la barra, barra de título y de pestañas pegajosas, el
  puntito de «ya te oí» en el destino tocado, y el «Modo servicio» para cocina y mesero.
- La barra lateral se apaga con `display: contents` y el «⋯» recoge lo de escritorio:
  en el teléfono quedan **dos bandas** de armazón (54 px arriba, 56 px abajo), no cuatro.

**Carta**
- **QR de mesa → directo a la carta**, sin portada (D-7 de la auditoría del 10-02).
- Máximo **cuatro pestañas** en la barra del comensal, con `aria-current`.
- Buscador a 16 px (Safari no hace zoom), estado vacío de búsqueda con salida
  («Ver todo el menú»).
- Ficha del platillo con **cerrar arriba y «Agregar · Q120.00» abajo**, al pulgar.
- Kiosko: oculta cuenta, puntos y mis pedidos en un aparato compartido.
- Cuatro maneras de recorrer la carta (`catalogNav`) según la plantilla: es una
  diferencia real de producto, no un capricho.

---

## Hallazgos

Formato como en las auditorías anteriores: **ID · prioridad · tamaño** (S = horas,
M = un día, L = varios). P0 rompe algo, P1 molesta todos los días, P2 se nota,
P3 es pulido. `NC` = carta del comensal, `NA` = panel, `NT` = transversal.

### Tablero

| Área | Hallazgos | P1 | P2 | P3 | Hechos |
|---|---|---|---|---|---|
| Carta del comensal (NC) | 10 | 3 | 4 | 3 | 0 |
| Panel (NA) | 8 | 0 | 5 | 3 | 0 |
| Transversal (NT) | 2 | 0 | 1 | 1 | 0 |
| **Total** | **20** | **3** | **10** | **7** | **0** |

### 1 · Carta del comensal

- [ ] **NC-01** · **P1** · M — **El gesto «atrás» saca al comensal del menú.**
  La ficha del platillo, el carrito, «Mis pedidos», «Cuenta», «Mis puntos», la categoría
  elegida en la plantilla de portadas y el menú de «Llamar al mesero» son estado de
  React sin entrada en el historial del navegador. **Verificado:** con la ficha abierta,
  `history.length` sigue igual (2 → 2), y en `src/` no hay un solo `pushState` ni
  `popstate`. En Android el gesto «atrás» es el reflejo número uno para cerrar algo;
  aquí el comensal sale de la carta (a la cámara, a WhatsApp, a Google) y tiene que volver
  a escanear o buscar el enlace. En iPhone pasa lo mismo con el deslizamiento desde el
  borde.
  **Propuesta:** un hook único, p. ej. `useCerrarConAtras(abierto, cerrar)`, que al
  abrir haga `history.pushState({ hoja: … })` y al recibir `popstate` cierre; y que al
  cerrar con la X haga `history.back()` para no dejar entradas sueltas. Se aplica en
  `ProductSheet`, `CartPanel`, `AccountSheet`, el panel de `MyOrders`,
  `RewardsSection`, el modo `portadas` y `WaiterCallButton`. Es el arreglo con más
  impacto de toda la auditoría.

- [ ] **NC-02** · **P1** · S — **«Cuenta» quiere decir «la cuenta».** En un restaurante,
  quien está sentado y toca «Cuenta» espera ver lo que debe o pedir la cuenta. La
  pestaña abre «Mi cuenta»: un formulario de nombre, teléfono y dirección. Y la función
  real de «pedir la cuenta» existe, pero escondida dentro de «Llamar al mesero»
  (`reason: 'bill'`).
  **Propuesta:** renombrar la pestaña a **«Mis datos»** (o «Perfil») y, cuando hay
  sesión de mesa (QR de mesa escaneado), ofrecer **«Pedir la cuenta»** como acción visible
  —p. ej. en el propio botón de mesa—, no como segunda opción de otro botón. Ver D-2.

- [ ] **NC-03** · **P1** · S — **«Todo» mezcla categorías sin encabezados.**
  En la estructura por píldoras (la de la plantilla clásica y del valor por defecto,
  `catalogNav: 'chips'`), la vista «Todo» es una sola tanda ordenada por
  `sort_order` del producto. Como ese orden es **por categoría**, al juntarlas salen
  intercaladas. **Visto en Bistró La Plaza:** Lava Cake (postre), Limonada (bebida),
  Filete (plato fuerte), Ceviche (entrada)… sin un solo rótulo que diga qué es qué. La
  misma mezcla se ve en el panel, en Menú › Platillos › «Todas».
  La agrupación ya existe en el código (`groupByCategory`) pero solo se enciende para
  secciones, acordeón y la forma «carrusel» (`catalog.tsx:272`).
  **Propuesta:** en «Todo», agrupar siempre por categoría con su encabezado (encender
  `groupByCategory` también para `chips`), o como mínimo ordenar por
  (orden de la categoría, orden del producto). Lo mismo en la lista del panel.

- [ ] **NC-04** · P2 · S — **Las píldoras de categoría no se quedan arriba.** Solo el
  modo «secciones» tiene índice pegajoso. En «píldoras», al bajar por una categoría
  larga, para cambiar de categoría hay que volver a subir hasta el principio.
  **Propuesta:** hacer pegajosa la fila de píldoras igual que el índice de secciones
  (ya existe el estilo: `position: sticky` con velo). El buscador puede quedarse arriba
  o colapsarse a una lupa dentro de la misma fila.

- [ ] **NC-05** · P2 · M — **Pila de barras abajo.** Con algo en el carrito, la barra de
  pestañas (68 px) más la del carrito ocupan **155 px de 812 (19 %)**, medido. Sentado
  en una mesa y con un pedido en curso se suman el chip del pedido (a 156 px del suelo)
  y «Llamar al mesero» (a 160 px, 46 de alto): **más de 200 px, una cuarta parte de la
  pantalla**, de cosas flotando sobre la carta.
  **Propuesta:** meter el carrito **dentro** de la barra inferior —un botón central
  con el total («Q120 · Ver pedido»), igual que «Tomar pedido» en el panel— en vez de
  una segunda barra encima. Alternativa más barata: esconder la barra de pestañas al
  bajar y mostrarla al subir (patrón de Safari y de las apps de delivery). Ver D-3.

- [ ] **NC-06** · P2 · S — **Contraste de las barras flotantes.** Las pestañas
  inactivas son crema al 72 % sobre vidrio; sobre el degradado claro de la portada de
  Bistró La Plaza «Pedidos», «Mis puntos» y «Cuenta» casi desaparecen, y en la barra
  del carrito el «1 platillo · Q120.00» no se lee (sí se lee «Ver carrito»). El vidrio
  toma el color de lo que tiene detrás, así que el contraste depende de la foto o el
  degradado del dueño.
  **Propuesta:** darle a las dos barras una base opaca mínima (`--surface-strong` o el
  `colorBg` al 85-90 %) en vez de vidrio puro, y comprobar ≥ 4,5:1 de las etiquetas
  contra ese fondo en la prueba de plantillas.

- [ ] **NC-07** · P2 · M — **En computadora y tablet la carta sigue siendo un teléfono.**
  La barra de pestañas flota abajo al centro y el carrito es una barra inferior, en
  cualquier ancho. Con las plantillas de lienzo `movil` queda una columna estrecha con
  una barra de app debajo. En escritorio la gente espera arriba la marca, las
  categorías y, a la derecha, «Mis pedidos» y el carrito (y el carrito como panel
  lateral, no como hoja que tapa la carta).
  **Propuesta:** a partir de ~1024 px, la barra inferior pasa a ser una **barra superior**
  (marca · categorías · Mis pedidos · Mis datos · carrito con total) y el carrito se abre
  como **panel lateral derecho**. Las hojas ya se convierten en diálogo centrado de tablet
  para arriba (`.menu-sheet`), así que el resto está hecho. Ver D-4: conviene mirar antes
  cuántas visitas llegan desde computadora.

- [ ] **NC-08** · P3 · S — **Kiosko: la barra del carrito se queda flotando.** En kiosko
  la barra de pestañas se oculta, pero `CartBar` sigue anclada a `bottom: 68`
  (`cart.tsx`), así que queda un hueco debajo.

- [ ] **NC-09** · P3 · S — **Alturas escritas a mano.** La carta repite la lección que
  el panel ya aprendió: 68 (`bottom-nav`), 68 (`CartBar`), 84/156 (`active-order-chip`),
  92/160 (`waiter-call-button`), 80/64/24 (`menu-shell`). Subir la barra un píxel obliga
  a acordarse de cinco archivos. **Propuesta:** una variable `--menu-nav-h` como
  `--adm-nav-h` del panel (`globals.css`), y que todos sumen sobre ella. Hacerlo antes o
  junto con NC-05.

- [ ] **NC-10** · P3 · S — **Por verificar en un iPhone real: zonas seguras.** El código
  usa `env(safe-area-inset-*)` en todas las barras y la app instalada pide
  `statusBarStyle: 'black-translucent'`, pero el viewport no declara
  `viewportFit: 'cover'` (`app/layout.tsx`, `generateViewport`). Sin eso los `env()`
  valen 0. Hay que comprobar en un iPhone con la carta **instalada en inicio** que la
  insignia «Abierto ahora» no quede bajo la hora y la barra no quede sobre el indicador
  de inicio. No lo pude comprobar en el emulador.

### 2 · Panel

- [ ] **NA-01** · P2 · M — **La barra del teléfono va al límite: 7 huecos.** Hoy ·
  Pedidos · Menú · **Tomar pedido** · Clientes · Negocio · Ajustes. Medido a 375 px:
  destinos de **47 × 43 px** y etiquetas de **10 px**. Caben enteras (eso ya se cuidó),
  pero Apple y Google recomiendan **de 3 a 5** destinos abajo y 44-48 px de alto, y
  cualquier cosa que agrande el texto (`--admin-panel-scale`, la letra grande del
  sistema) lo rompe primero aquí. Además Clientes y Negocio son de dueño, no de servicio:
  en hora pico nadie los toca desde el teléfono.
  El intento anterior (llevar Clientes y Negocio al «⋯», 2026-09-07) se revirtió por
  dos razones buenas: desaparecían sin rastro y, estando en ellos, la barra no marcaba
  nada. **Propuesta que resuelve las dos:** una pestaña **«Más»** en la barra, como en
  iOS y Android:
  ```
  [ Hoy ] [ Pedidos ] [ ⊕ Tomar pedido ] [ Menú ] [ Más ]
  ```
  «Más» abre una hoja con Clientes, Negocio y Ajustes (y lo que hoy vive en el «⋯»:
  buscar, ayuda, tema, plan, cambiar de restaurante, sesión) y **se marca activa** cuando
  estás en cualquiera de ellos. Es visible (está en la barra) y dice «aquí estás». De paso
  desaparece el «⋯» de arriba y queda un solo sitio para «lo demás». Destinos de ~70 px
  de ancho en vez de 47. Ver D-1.

- [ ] **NA-02** · P2 · S — **En computadora no hay acción principal.** El botón de
  «Tomar pedido» es solo del teléfono; en escritorio es la cuarta pestaña dentro de
  Pedidos (dos clics y saber dónde está). Pero muchos locales cobran en una PC junto a la
  impresora, y para ese cajero tomar un pedido es **la** tarea.
  **Propuesta:** un botón primario **«＋ Tomar pedido»** fijo en la barra lateral, entre
  la marca y «Buscar» (patrón «Nuevo» de Gmail, Shopify o Notion), con atajo de teclado
  (p. ej. `N`). Solo si el plan tiene la pantalla, igual que en el teléfono.

- [ ] **NA-03** · P2 · S — **El menú se arma distinto según la pantalla.** Los tres
  layouts del panel le pasan a `AdminShell` datos diferentes:
  `(protected)` le pasa plan y todos los módulos; `(waiter)` (Tomar pedidos) solo
  pedidos y llamada al mesero —ni plan ni módulos—; `(kitchen)` (Cocina) el plan pero no
  los módulos. **Verificado:** en Tomar pedidos desaparece de la barra lateral la
  insignia «Plan Pro» y el «Cambiar de restaurante». **Por código:** como `buildNav` y el
  buscador salen de esos datos, en Tomar pedidos el plan cae a Básico y Analítica,
  Finanzas, Caja o Inventario salen con candado en el buscador; en Cocina, en cambio,
  no salen.
  **Propuesta:** una sola función de servidor (p. ej. `getShellProps()`) que usen los
  tres layouts, para que el armazón sea idéntico en todo el panel.

- [ ] **NA-04** · P2 · S — **Tres buscadores y un atajo con dos dueños.** En Tomar
  pedidos conviven el «Buscar · Ctrl K» de la barra lateral (pantallas del panel), el
  «Buscar plato, mesa o acción · Ctrl K» de la barra del mesero y el campo «Teclea
  2 pepián…» de la carta. **Verificado:** `Ctrl K` abre la paleta del mesero, así que en
  esa pantalla la barra lateral promete algo que no hace.
  **Propuesta:** una sola paleta: en Tomar pedidos se abre con lo del mesero primero
  (platos, mesas, acciones) y debajo «Ir a…» con las pantallas del panel. La barra
  lateral, en esa pantalla, abre la misma.

- [ ] **NA-05** · P2 · S — **Avisos apilados al entrar.** En el primer ingreso salen a la
  vez el tour de bienvenida (modal), «Añade Leogin al inicio» **tapando la barra
  inferior** (verificado: hasta cerrarlo no se ve la navegación) y el aviso de «Tu local
  no tiene PC principal». Ese último se repite arriba de **todas** las pantallas (unos
  150 px en el teléfono, verificado en Hoy, Pedidos, Ajustes y Menú) hasta que se toca
  «Ahora no».
  **Propuesta:** una cola de avisos —uno a la vez, primero el tour, el de instalar
  después de unos días de uso—; el de instalar anclado **encima** de la barra
  (`bottom: var(--adm-nav-h)`); y el de la PC completo solo en Hoy y en Ajustes › La PC
  del local, y en las demás pantallas un punto en la campana o en «Ajustes».

- [ ] **NA-06** · P3 · M — **Tablet vertical con la barra de teléfono estirada.** A
  768 px la barra inferior reparte siete destinos en todo el ancho (iconos a ~110 px uno
  de otro) y la barra lateral no aparece hasta 821 px. Las tablets son justo el aparato
  del mesero y de la cocina.
  **Propuesta:** entre ~600 y 1024 px, un **riel lateral** de 72-80 px (icono + etiqueta
  debajo, como el NavigationRail de Android o la barra lateral compacta del iPad), con
  «Tomar pedido» arriba. Deja el ancho para el salón y las comandas.

- [ ] **NA-07** · P3 · S — **Una pantalla, tres nombres.** El grupo se llama «Menú», la
  pestaña «Platillos», la pestaña del navegador «Catálogo – Panel admin» y la ayuda
  `catalogo`. **Propuesta:** que el `<title>` de cada pantalla sea el nombre de su
  pestaña («Platillos – Bistró La Plaza»), y de paso llevar el nombre del restaurante en
  vez de «Panel admin» (con varias pestañas abiertas se distinguen).

- [ ] **NA-08** · P3 · S — **La ayuda de la pantalla no está en todas.** El botón «?»
  (y «Ayuda de esta pantalla» en el «⋯») sale solo donde hay entrada en `HELP_SECTIONS`
  de `shell.tsx`. No la tienen Hoy, Mesas, Caja, Lista de espera, la portada de Ajustes
  y casi todas sus hijas (Horarios, Salón, Zona de entrega, Pedidos y cobro,
  Repartidores, WhatsApp, La PC del local, Mi suscripción, Funciones, Copia de tus
  datos). **Propuesta:** que la sección de ayuda salga del mismo `lib/admin-nav.ts`
  (una clave por pestaña) y que la prueba de N-01 de la auditoría del 10-02 falle si una
  pestaña no tiene ayuda.

### 3 · Transversal

- [ ] **NT-01** · P2 · S — **Dos lenguajes de barra inferior.** Panel: barra a todo lo
  ancho, activa = color de acento. Carta: píldora flotante de vidrio, activa = fondo
  relleno. Cada una tiene sentido en su mundo (la carta lleva la marca del restaurante),
  pero quien usa las dos —el dueño que revisa su carta desde el panel— nota que son dos
  programas. No es urgente; si se rehace la barra de la carta (NC-05), conviene que
  comparta la geometría (alto, ancho de destino, cómo se marca la activa) aunque
  conserve los colores del restaurante.

- [ ] **NT-02** · P3 · S — **Medir antes de la siguiente ronda.** No hay datos de qué
  pestañas se usan. Con la analítica que ya existe (`trackVisit`) se puede contar, sin
  datos personales, qué destino de la barra toca cada rol y desde qué tipo de aparato
  llega el comensal. Eso decide D-1 y D-4 con números en vez de opiniones.

---

## Cómo quedaría

**Teléfono — panel** (NA-01, NA-05):
```
┌──────────────────────────────┐
│ Pedidos                  🔔 │  ← título + campana (el «⋯» se va a «Más»)
│ [En vivo][Cocina][Mesas]     │  ← pestañas del grupo, igual que hoy
│                              │
│   …contenido…                │
│                              │
│ Hoy  Pedidos  (＋)  Menú  Más│  ← 5 huecos de ~70 px; «Más» se marca en
└──────────────────────────────┘     Clientes, Negocio y Ajustes
```

**Teléfono — carta** (NC-02, NC-04, NC-05):
```
┌──────────────────────────────┐
│ [Todo][Entradas][Fuertes]…   │  ← píldoras pegajosas
│ ENTRADAS                     │  ← «Todo» agrupado por categoría
│  Ceviche · Bruschetta        │
│ PLATOS FUERTES               │
│  Filete · Pasta              │
│                              │
│ Menú  Pedidos (Q120 ›) Puntos Mis datos │ ← carrito dentro de la barra
└──────────────────────────────┘
```

**Computadora — panel** (NA-02): barra lateral igual que hoy, con
`[ ＋ Tomar pedido ]` arriba de «Buscar».

**Computadora — carta** (NC-07): barra superior con marca, categorías, «Mis pedidos»,
«Mis datos» y carrito a la derecha; el carrito abre un panel lateral.

## Lo que consideré y descarté

- **Volver al menú lateral con submenús desplegables.** Era el modelo anterior (35
  entradas en tres grupos plegables). Las pestañas dan un solo modelo mental en teléfono
  y computadora; no hay razón para volver.
- **Una barra distinta por rol** (cajero, mesero, dueño). Los permisos ya filtran los
  destinos, y el mesero puro ya va directo a su pantalla. Con «Más» (NA-01) no hace falta
  un tercer sistema.
- **Hamburguesa (☰) en el teléfono.** Esconde los destinos principales; las pruebas de
  uso la ponen sistemáticamente por debajo de una barra inferior visible.
- **Quitar la portada de la carta.** Con el QR de mesa ya se salta; con el enlace general
  vende la marca, que es para lo que el dueño paga.

## Plan de trabajo propuesto

1. **Fase 1 — lo que el comensal sufre hoy (≈ 1-2 días).** NC-01, NC-02, NC-03, NC-04,
   NC-08. Más NA-03 y NA-05 (el de instalar sobre la barra), que son de horas.
2. **Fase 2 — las barras (≈ 2-3 días).** NC-09 primero (la variable de alto), luego
   NC-05 y NC-06; en el panel NA-01, NA-02 y NA-04. Requiere D-1 y D-3.
3. **Fase 3 — pantallas grandes (≈ 2-3 días).** NC-07, NA-06, NA-07, NA-08, NT-01.
   Requiere D-4 (y ayuda tener NT-02 midiendo un par de semanas antes).

Antes de cerrar cada fase: recorrido en vivo a 375, 768 y 1366 px, en tema claro y
oscuro, con al menos dos plantillas de carta (una de fondo claro).

## Decisiones que necesito de ti

- **D-1 · Barra del panel en el teléfono.** ¿Seguimos con 7 huecos o pasamos a 5 con
  «Más» (NA-01)? *Recomiendo 5 con «Más».*
- **D-2 · Nombre de la pestaña «Cuenta» del comensal.** «Mis datos», «Perfil» o «Yo».
  *Recomiendo «Mis datos»*: dice lo que hay dentro y no choca con «la cuenta».
- **D-3 · El carrito del comensal.** ¿Barra aparte (como hoy) o dentro de la barra de
  pestañas (NC-05)? *Recomiendo dentro.*
- **D-4 · ¿Invertimos en la carta de escritorio (NC-07)?** Depende de cuánta gente la
  abre desde una computadora. *Recomiendo medirlo primero (NT-02).*

## Fuera de alcance, pero lo encontré al revisar en esta PC

- Los hooks de git no estaban activados en este clon: ya corrí
  `git config core.hooksPath .githooks` y `git config commit.template .gitmessage`
  (paso 7 de `docs/guias/FLUJO_GIT.md`).
- La base de Supabase **local** estaba en la migración 065; la llevé a la 145 con
  `npx supabase migration up --local`. Producción no se tocó.
- `CLAUDE.md` dice que la última migración es la 141 y `FLUJO_GIT.md` la 140; ya va en
  la 145.
- `.claude/launch.json` apunta a `C:\Users\minec\Documents\Catalogos-Restaurantes`
  (con guion, la ruta de la otra PC); en esta PC la carpeta lleva espacio.
- En esta PC no está instalado `gh` (la CLI de GitHub).

## Bitácora

- **2026-10-14** — Auditoría abierta. Revisión de código y recorrido en vivo en local.
