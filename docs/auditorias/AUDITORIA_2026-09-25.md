# Auditoría general — 2026-09-25

> **Encargo:** auditoría lo más completa posible del **panel de administración** y
> del **catálogo digital**: funcionalidad, practicidad, **velocidad** («tiene que
> responder al instante, es un sistema para restaurantes»), optimización y visual.
> Más un encargo concreto: **que las imágenes carguen más rápido** en los dos lados.
>
> **Cómo se midió.** Producción real (`rincon502.distleogin.com`) con `curl` y el
> navegador, a 390 px y en escritorio. Los arreglos, contra un build de producción
> local (`next build` + `next start`) con Supabase local y fotos de prueba. Nada de
> lo que dice este informe es una estimación salvo donde se indica.
>
> La parte **visual** se barrió entera hace tres días (auditoría QA del 2026-09-22,
> 74 pantallas, commit `d0ff36a`). Aquí no se repite: esta pasada se centró en lo
> que aquella no miraba — tiempos, cargas, trabajo repetido y practicidad.

---

## 1. Resumen ejecutivo

**La causa número uno de la lentitud no está en el código: está en el mapa.** El
servidor (Render) está en **Oregón** y la base de datos (Supabase) en **Virginia**:
cada consulta cruza Estados Unidos de costa a costa, unos **65–75 ms de ida y
vuelta**. Una pantalla que hace 5 consultas en fila paga ~350 ms solo en viajes.
«Enviar a cocina» hacía **16 en fila**. Mover Render a Virginia es el cambio que
más velocidad da en toda la auditoría, no toca una línea de código y lo tienes que
hacer tú (sección 2).

**Las imágenes tardaban por tres causas encadenadas**, las tres medidas en
producción y las tres arregladas en código (sección 3).

**El panel hacía trabajo de más en cada toque**: consultas que podían ir juntas
iban en fila, y después de cada acción la pantalla se volvía a pintar **dos
veces** completas. Arreglado en los caminos que se usan todo el turno (sección 4).

**El menú bajaba 228 KB de JavaScript que casi nadie usa**, las fotos llegaban
grises al deslizar y la ficha del platillo abría con un hueco vacío. Arreglado
(sección 5).

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| I-1 | Servidor en Oregón, base en Virginia: ~70 ms por consulta | **Crítico** | ⏳ **Acción tuya** |
| I-2 | Plan de Render | — | ✅ Resuelto (Starter, 2026-10-10) |
| IMG-1 | Cloudflare no guardaba ninguna foto (`DYNAMIC`) | **Alto** | ✅ Corregido |
| IMG-2 | Cada despliegue borraba todas las fotos ya preparadas | **Alto** | ✅ Corregido |
| IMG-3 | El navegador solo guardaba las fotos 4 h; Supabase, 1 h | **Medio** | ✅ Corregido |
| IMG-4 | Al deslizar la carta, las fotos llegaban tarde (tarjetas grises) | **Alto** | ✅ Corregido |
| IMG-5 | La ficha del platillo abría con la foto en blanco | **Medio** | ✅ Corregido |
| IMG-6 | El logo de la portada (lo primero que se ve) cargaba «para después» | **Medio** | ✅ Corregido |
| IMG-7 | La tarjeta destacada pedía media foto y salía blanda | Bajo | ✅ Corregido |
| P-1 | Cada pantalla del panel: ~9 consultas en fila antes de pintar | **Alto** | ✅ Corregido (→ ~4) |
| P-2 | «Enviar a cocina»: 16 consultas en fila | **Alto** | ✅ Corregido (→ 5) |
| P-3 | Cada acción repintaba la pantalla dos veces | **Alto** | ✅ Corregido en Tomar pedidos, Mesas y Caja |
| P-4 | Mesas / Tomar pedidos se refrescaban doble con cada pedido | **Medio** | ✅ Corregido |
| P-5 | Tras cada acción se re-precargan ~10 pantallas del menú | Medio | ⏳ Recomendado |
| M-1 | 228 KB de Supabase en el arranque del menú | **Alto** | ✅ Corregido |
| M-2 | «Mi cuenta», «Mis pedidos» e intro de lealtad en el arranque | Bajo | ✅ Corregido |
| M-3 | Lealtad: 2 consultas en vivo por cada visita al menú | Medio | ✅ Corregido |
| M-4 | El menú carga 169 KB de CSS que incluyen todo el panel | Medio | ✅ Corregido (2ª pasada) |
| M-5 | «Pedir» del comensal: ~10 consultas en fila | Medio | ✅ Corregido (2ª pasada) |
| M-6 | Tipografías de Google bloquean el primer pintado | Bajo | ⏳ Opción |
| F-1 | `waiter-panel.tsx`: 1.750 líneas que ya no usa nadie | Bajo | ⏳ Limpieza |
| F-2 | Primer ingreso en el teléfono: tres avisos a la vez | Bajo | ⏳ Recomendado |
| F-3 | Trampa: `next.config.ts` no puede importar de `src/` | **Alto** (evitado) | ✅ Prueba añadida |
| F-4 | «Enviar a cocina» hacía esperar al mesero | Medio | ✅ Corregido (2ª pasada) |
| F-5 | Tomar pedidos podía pintar la Mesa 1 bajo el rótulo de la 2 | Bajo | ✅ Corregido (2ª pasada) |

---

## 2. Infraestructura — lo que tienes que hacer tú

### I-1 — El servidor y la base están en costas opuestas · **Crítico**

**Prueba.** `db.jsvlxfkwbcgdyutyvnut.supabase.co` resuelve a `2600:1f18:…`, el
bloque de AWS **us-east-1 (Virginia)**. `render.yaml` declara `region: oregon`, y
los tiempos lo confirman: una foto ya preparada tarda ~250 ms desde Render contra
~170–200 ms de un archivo que Cloudflare sirve desde Miami.

**Por qué importa tanto.** Next.js pinta una pantalla en el servidor y cada
consulta a Supabase es un viaje Oregón → Virginia → Oregón. Lo arreglado en este
informe reduce el NÚMERO de viajes en fila (de 16 a 5 al enviar a cocina, de ~9 a
~4 por pantalla), pero cada viaje sigue costando ~70 ms. Con los dos en Virginia
cuesta **1–3 ms**. Estimación con los números medidos:

| Acción | Antes | Con este informe | + Render en Virginia |
|---|---|---|---|
| «Enviar a cocina» (espera del mesero) | ~2,3 s | ~0,7 s | ~0,15 s |
| Cambiar de pantalla en el panel | ~0,9 s | ~0,5 s | ~0,1 s |

(Estimación: viajes en fila × 70 ms + pintado. Lo medido en local, sin distancia,
fue de 250–430 ms por acción completa.)

De paso, desde Guatemala Virginia queda **más cerca** que Oregón (~50 ms contra
~100 ms), así que el comensal también lo nota.

**Cómo.** Render no deja cambiar la región de un servicio que ya existe:
1. Render → **New → Web Service**, mismo repositorio, región **Virginia (US East)**.
2. Copiar todas las variables de entorno del servicio actual (las de `render.yaml`).
3. Desplegar y probar con la URL `*.onrender.com` nueva.
4. Cloudflare → DNS: apuntar `@`, `www` y `*` al servicio nuevo. Añadir los dominios
   personalizados en el servicio nuevo de Render.
5. Cuando todo responda, borrar el servicio de Oregón.
6. Cambiar `region: oregon` → `region: virginia` en `render.yaml`.

### I-2 — Plan de Render · ✅ Resuelto

Producción está en Starter y `render.yaml` ya lo dice (2026-10-10). Cerrado; no
se vuelve a proponer.

### I-3 — Después del despliegue, comprobar Cloudflare

```bash
curl -sI "https://rincon502.distleogin.com/img/640/<ruta-de-una-foto>.webp" | grep -i cf-cache-status
```

La primera vez dice `MISS`; la segunda debe decir **`HIT`**. Si dijera `DYNAMIC`,
hay una regla de Cloudflare que lo impide (no debería: `.webp` se guarda por
defecto, y `/_next/static/*.js` ya sale `HIT` en tu zona).

### I-4 — Una ida y vuelta menos en cada petición (para más adelante)

El `proxy.ts` llama a `supabase.auth.getUser()` en cada petición del panel: es
un viaje a Supabase Auth solo para validar la sesión. Si el proyecto usa **JWT
Signing Keys** asimétricas (Supabase → Settings → JWT Keys), `auth.getClaims()`
valida el token en el propio servidor sin viajar. No lo cambié: el refresco de
sesión de este proxy ya tuvo varios incidentes (cookies fantasma, PKCE) y merece
su propia sesión con pruebas.

---

## 3. Imágenes — lo que pediste

### Por qué tardaban (medido en producción)

Todas las fotos pasaban por el optimizador de Next (`/_next/image?url=…&w=…`):

| Medición | Resultado |
|---|---|
| Cloudflare | `cf-cache-status: DYNAMIC` — **nunca** guardó una foto (la URL no termina en `.webp`) |
| Foto ya preparada, servida por Render | 250–310 ms cada una |
| Foto por primera vez (reducir con sharp) | **330 ms – 1,26 s** cada una, y en ráfaga se hacen cola |
| Caché del navegador | `max-age=14400` (4 h) + `must-revalidate` |
| Original en Supabase | `max-age=3600` (1 h); primera vez 1,24 s |
| Despliegue | el disco de Render se vacía: **todas** las fotos vuelven a ser «primera vez» |

Y dos causas más en el propio menú:

- **Tarjetas grises al deslizar (IMG-4).** Las tarjetas llevan
  `content-visibility: auto` (bien: no se pintan las 100 de golpe), pero una foto
  con `loading="lazy"` dentro de una tarjeta sin pintar **no tiene caja**, así que
  el navegador no la pide hasta que la tarjeta entra en su margen corto (~media
  pantalla). Al deslizar con el dedo, llegaban las tarjetas grises y la foto
  después. Se vio en `rincon502` a 390 px.
- **La ficha del platillo pedía otra foto más grande** y dejaba el hueco vacío
  mientras llegaba, aunque la de la tarjeta ya estaba descargada.

### Qué se hizo

1. **Ruta propia `/img/<ancho>/<ruta>.webp`** (`src/app/img/[w]/[...path]/route.ts`).
   Como termina en `.webp`, **Cloudflare la guarda sola** en su nodo más cercano
   (Guatemala/Miami) sin configurar nada, y la guarda aunque Render se despliegue o
   se reinicie. Siempre responde WebP con `max-age` de **un año, `immutable`**
   (cada subida tiene nombre único, así que una URL nunca cambia de contenido).
   - Sin SSRF: solo lee del bucket del proyecto, cada segmento validado.
   - Anchos cerrados (13 valores); cualquier otro da 404.
   - Si la foto ya es WebP y cabe, se sirve tal cual (sin recomprimir).
   - Memoria de 32 MB en el proceso + una sola tarea de sharp por foto aunque
     lleguen diez pedidos a la vez.
   - No pasa por `proxy.ts` (el matcher excluye `.webp`): cero consultas de sesión.
2. **`<AssetImage>`** (`src/components/asset-image.tsx`) en el lugar de `next/image`
   para todo lo del bucket: tarjetas, ficha, recompensas, portada, logo del panel,
   miniaturas del catálogo del panel. Fuentes ajenas siguen por `/_next/image`.
3. **Fondos y marca de agua** (`theme-background`, `overlay-background`), logos
   sueltos del panel (Tomar pedidos, lealtad, selector de sucursal): por `/img`.
4. **Fotos anticipadas en la carta** (`useFotosAnticipadas` en `catalog.tsx`): se
   observa la tarjeta (que sí tiene caja) con 1.600 px de margen y su foto pasa a
   `eager` ~2 pantallas antes de hacer falta. No cambia nada visible.
5. **Ficha del platillo:** debajo, la misma foto de la tarjeta (sale de la caché al
   instante); encima, la nítida con un fundido de 180 ms. Además pide 1080 px en
   vez de 1600 en el teléfono.
6. **Logo de la portada** con `loading="eager"` + `fetchPriority="high"`.
7. **Tarjeta destacada** con `sizes` de fila entera (pedía media foto).
8. **Subidas** con `cacheControl` de un año en Supabase, y **precalentado**: al
   subir una foto, el propio navegador del dueño pide sus medidas más usadas
   (96/384/640/1080), así que el primer cliente ya la encuentra lista en Cloudflare.
9. **Service worker:** `/img/` va primero a la caché (máx. 300 fotos) → la carta
   vuelve a abrir con fotos aunque no haya señal.
10. `next.config.ts`: sin los anchos 2048/3840 (las fotos se suben a 1600 como
    máximo) y `minimumCacheTTL` de 31 días para lo que siga por `/_next/image`.

**Medido en local** (build de producción): primera generación 90–260 ms, repetida
**4 ms** desde memoria; URLs inválidas → 404. El HTML del menú también adelgaza:
el `srcset` era el **30 %** del HTML de `rincon502` (70 KB de 231 KB) por las URL
largas de Supabase; ahora son ~75 caracteres por entrada en vez de ~200.

**Fotos ya subidas:** funcionan igual, no hay que volver a subirlas. Su original en
Supabase conserva el `max-age` de 1 h, pero eso ya no importa: el cliente las
recibe por `/img` con un año.

---

## 4. Panel de administración

### P-1 — Cada pantalla esperaba ~9 viajes en fila · **Alto** · ✅

Un pintado del panel preguntaba «¿quién es el usuario?» a Supabase Auth hasta
**cuatro veces**, en cadena (layout, `getAdminContext`, `getMyMemberships`,
`myOrganizationId`), y después pedía perfil → restaurante → tema → membresías →
agente de impresión, uno tras otro.

- `getStaffUser()` (`lib/supabase/server.ts`): la sesión se valida **una vez por
  petición** (`React.cache`), mismo nivel de verificación. Aplicado en layouts del
  panel, cocina, mesero, super admin, Mi cuenta y en las guardas.
- `getAdminContext`: perfil, restaurante del subdominio y membresías **a la vez**.
- `getRestaurantBySlug`: restaurante + tema en **una** consulta (antes dos).
- Layout: el estado de la PC principal y los precios, a la vez.

Resultado: de ~9 a ~4 viajes en fila por pintado completo.

### P-2 — «Enviar a cocina» · **Alto** · ✅

`createWaiterOrder` hacía perfil → reintento → restaurante → precios → tema →
crear pedido → personas → estado → y luego **seis** consultas más para encolar la
comanda, todo en fila. Ahora:

- las cinco lecturas salen **juntas** y se comprueban en el mismo orden de siempre
  (nada se devuelve antes de validar al mesero);
- «personas» y «estado» se escriben a la vez;
- la comanda **arranca en el acto** pero el mesero no la espera (`after()`, el
  mismo patrón que ya usaban la factura FEL y el aviso por WhatsApp).

De 16 viajes a 5 para la respuesta al mesero. Probado de punta a punta en local:
Mesa 1 → Negra Brava → «Enviar a cocina» → «1 a cocina · Mesa 1».

### P-3 — Cada acción repintaba todo dos veces · **Alto** · ✅ (caminos calientes)

Cuando una acción llama a `revalidatePath`, Next **ya** manda la pantalla nueva en
la propia respuesta (`action-handler.js`, `skipPageRendering`). El
`router.refresh()` que venía justo después pedía una **segunda** pintura completa,
layout con todas sus consultas incluido. Se quitaron (verificando acción por acción
que revalida) en:

- **Tomar pedidos** (`servicio-panel.tsx`): enviar, servir, deshacer, aceptar QR,
  cobrar, cobrar parte, liberar, mover/juntar mesas, nombre de mesa, atender
  llamada — 13 sitios.
- **Mesas** (`salon-board.tsx`): servir, atender y sus deshacer.
- **Caja** (`cash-close.tsx`): guardar borrador, cerrar, descartar, gastos.

Quedan ~60 en pantallas de poco tráfico (proveedores, cupones, reservaciones…).
Mismo arreglo, cuando se toquen.

### P-4 — Doble refresco con cada pedido nuevo · **Medio** · ✅

El aviso global de pedidos (`new-orders-alert.tsx`, montado en todo el panel)
refrescaba la pantalla con cada pedido nuevo, excepto en Pedidos. Pero **Mesas y
Tomar pedidos ya se refrescan solas** con su propio canal (`useSalonLive`), así
que ahí se repintaba dos veces. Ahora el aviso tampoco refresca en esas dos.

### P-5 — Re-precarga de ~10 pantallas tras cada acción · Medio · ⏳

Medido en local tras «Enviar a cocina»: después de revalidar, Next vacía su caché
de navegación y vuelve a precargar **cada enlace visible** del menú del panel (Hoy,
Pedidos, Menú, Clientes, Negocio, Ajustes, Cocina, Mesas, Ayuda…): ~10 peticiones
más al servidor por toque, por aparato. Cada una es barata (solo el esqueleto de
`loading.tsx`) pero pasa por el `proxy.ts` y su viaje a Supabase Auth.

No lo cambié porque la salida obvia —`prefetch={false}`— le quita al panel el
esqueleto instantáneo al navegar, que se añadió a propósito el 2026-07-29. Con
Render en Virginia (I-1) cada una cuesta unos pocos milisegundos y deja de
importar. Si no se mueve, la opción es apagar la precarga solo en los destinos que
casi no se tocan desde el servicio (Ayuda, Ajustes, Negocio).

---

## 5. Catálogo digital

### M-1 — 228 KB de JavaScript que casi nadie usa · **Alto** · ✅

El cliente completo de Supabase (auth + realtime + base + storage: **228 KB sin
comprimir, 58 KB comprimidos**) bajaba y se compilaba en cada visita al menú —en el
teléfono del comensal, con datos móviles— para usarse solo al entrar o salir con
Google. Ahora se carga **al tocar** (`google-signin`, `account-sheet`,
`rewards-section`). Verificado: el arranque del menú ya no contiene nada de
Supabase, y «Continuar con Google» sigue funcionando (llega a `/auth/v1/authorize`
con PKCE y la vuelta correcta).

### M-2 — Pantallas que solo existen si se abren · ✅

«Mi cuenta», «Mis pedidos» y la invitación a la lealtad se bajan al abrirlas
(`next/dynamic`), no con la carta.

### M-3 — Lealtad en caché · **Medio** · ✅

Con lealtad activa, cada visita al menú hacía dos consultas **en vivo** (ajustes y
recompensas). Ahora van en caché de 60 s como la carta (`getPublicLoyaltyCached`),
y se expiran al instante cuando el dueño toca la lealtad o edita la carta. El
`stock` de una recompensa puede ir hasta un minuto por detrás tras un canje; el
canje en sí lo valida la base.

### M-4 — El menú cargaba los estilos del panel · Medio · ✅ (2ª pasada)

`globals.css` pesaba **248 KB** de fuente y lo comparten menú, panel, landing y
super admin: el comensal descargaba —bloqueante— todo el CSS del panel. Ahora las
reglas que solo usa el área de personal viven en **`src/app/admin.css`**, que
importan `app/admin/layout.tsx` y `app/super/layout.tsx`.

| | Antes | Después |
|---|---|---|
| CSS que baja el menú | ~178 KB (169 + 8,5) | **96,6 KB** (18,5 KB gzip) |
| `globals.css` (fuente) | 248 KB | 114 KB |
| CSS del panel | — (dentro del anterior) | 96,6 + 72,7 KB |

**Qué se mudó lo decidió un script, no el ojo.** Se armó el grafo de imports de
todas las rutas que NO son del personal (252 archivos) y una regla se mudó solo si
TODOS sus selectores exigen una clase que ninguno de esos archivos usa (con los
prefijos armados por plantilla, `m-badge-${x}`, contados como públicos). 636
reglas mudadas; los tokens de `html[data-admin-area]` se quedaron en globals.

**Verificación, en dos pasos:**
1. En cada una de **224 capturas** (13 públicas + 41 del panel + 8 del Super Admin;
   390 y 1280 px; claro y oscuro) y para cada elemento y cada propiedad, se calculó
   qué declaración gana con el `globals.css` original y cuál con los dos archivos
   nuevos. En páginas públicas ninguna regla mudada aplica (**0 estilos perdidos**).
2. Salió **un** choque de cascada, en cuatro variantes: los enlaces del menú del
   panel llevan `admin-navlink press` (y `admin-tab`, `admin-search`,
   `admin-back`); con la misma especificidad antes ganaba la `transition` de
   `.press` por venir después, y con el archivo aparte habría ganado la del panel.
   Se dejó una **copia de `.press` en `admin.css`, en su posición de siempre** →
   **0 diferencias**. Control negativo: quitando la copia, el comparador vuelve a
   marcar exactamente esos tres choques.

**Regla para el futuro** (escrita en el encabezado de `admin.css`): si una pantalla
pública empieza a usar una clase del panel, su regla vuelve a `globals.css`.

### M-5 — «Pedir» del comensal · Medio · ✅ (2ª pasada)

`createOrder` hacía en fila reintento → límite → sesión → lealtad → restaurante →
agente → zonas → cobertura → precios → tema, y luego cliente → pedido → cupón. Ahora
**todas las lecturas salen a la vez** y se comprueban en el mismo orden de siempre;
el límite por IP sigue DESPUÉS del chequeo de reintento (un reintento de la cola
offline no debe gastarlo). Además las zonas ya no se leen dos veces (`zoneFeeFrom`
reutiliza la lista), y las dos escrituras del cupón van juntas. De ~10 viajes en
fila a **4** en un pedido normal.

**Comparado con pedidos de verdad:** la versión anterior y la nueva corrieron lado
a lado contra la base local con los mismos 9 escenarios —para llevar con propina y
nota de plato, combo con variante que suma precio, mesa con preferencia de servicio,
cupón válido e inexistente, domicilio con tarifa plana, con zona (y zona mal
escrita, y ajena), cobertura por mapa (dentro, fuera, sin pin), agotado, pausado,
restaurante inexistente, canje sin sesión y reintento con el mismo `clientId`—.
**Mismo resultado, mismos importes, mismos ítems y mismos errores en los 9.** Los
datos de prueba (pedidos, clientes, cupón, zona, stock, kardex) se borraron al
terminar.

### M-6 — Tipografías de Google bloquean el primer pintado · Bajo · ⏳ opción

La hoja de `fonts.googleapis.com` de cada restaurante bloquea el pintado hasta
llegar (DNS + TLS a otro dominio). Se puede cargar sin bloquear, a cambio de un
instante con la tipografía de sistema. Es una decisión estética tuya.

---

## 6. Funcionalidad y practicidad

### F-1 — Código muerto: `waiter-panel.tsx` · Bajo

1.750 líneas y 17 `router.refresh()` que **nadie importa** desde que el módulo de
Servicio lo sustituyó. No se envía al navegador, pero confunde (comentarios de
otros archivos todavía lo citan como vigente). Borrarlo junto con esas referencias.

### F-2 — Primer ingreso en el teléfono: tres avisos a la vez · Bajo

Al entrar por primera vez al panel desde un celular salen **a la vez** el tutorial
(«Paso 1 de 5»), el banner «Añade Leogin al inicio» y el aviso de notificaciones.
El tutorial queda tapado a medias por el banner. Sugerencia: el banner de
instalación, solo después de cerrar o terminar el tutorial.

### F-3 — Trampa evitada: `next.config.ts` no puede importar de `src/` · ✅

Al probar el build, `next start` **no arrancaba**: `next.config.ts` importaba los
anchos de imagen de `src/lib/asset-image.ts` y el cargador de configuración de
`next start` no resuelve imports de `.ts` (el `next build` sí pasaba). En Render
habría tumbado el servicio en el despliegue. Los anchos quedan escritos a mano en
`next.config.ts` y la prueba `asset-image.test.ts` comprueba que coinciden.

### F-4 — «Enviar a cocina» sin espera · Medio · ✅ (2ª pasada)

Al tocar «Enviar a cocina» el carrito se vacía **en el acto**; sus líneas pasan a
«Falta servir» con un «Enviando…» y el mesero puede seguir con otra mesa mientras
la nube contesta. Es seguro por lo mismo que ya lo era el modo sin conexión: el
pedido se guarda en la cola del aparato ANTES de salir y el `clientId` impide
duplicarlo.

- **Si la nube lo rechaza** (un plato que se agotó, un permiso), las líneas
  **vuelven al carrito de su mesa** con el motivo — nada se pierde en silencio.
- **Mientras una mesa tiene un envío en vuelo no se puede cobrar, liberar ni
  mover**: cerrarla antes de que llegue el pedido lo dejaría colgando.
- Cuando la mesa se relee y trae el pedido con ese `client_id`, las líneas del
  vuelo desaparecen sin fotograma duplicado (`comandaDeMesa`, con prueba).
- Sin señal: igual que antes (hub local o cola, con su aviso).

Medido en local: **10 ms** hasta ver el carrito vacío y «Enviando…», 234 ms a la
confirmación, 902 ms a la línea real con su «Servido». Camino de error probado
marcando el plato agotado en la base justo antes de enviar: a los 118 ms los dos
platos volvieron al carrito con «"Brownie Negro" ya no está disponible. La comanda
volvió al carrito · Mesa 2.».

### F-5 — Lecturas de mesa desordenadas · Bajo · ✅ (2ª pasada)

`cargarMesa` pintaba la respuesta que llegara, fuera de la mesa que fuera: abrir la
Mesa 1 y saltar enseguida a la 2 podía dejar los platos de la 1 bajo el rótulo de
la 2. Ahora solo pinta la última lectura pedida.

---

## 7. Qué se tocó y cómo se verificó

**Nuevos:** `src/app/img/[w]/[...path]/route.ts`, `src/lib/asset-image.ts` (+ test),
`src/components/asset-image.tsx`.
**Dependencia:** `sharp` pasa de opcional (de Next) a directa.

**Verificación:**
- `tsc --noEmit` limpio; ESLint limpio en todo lo tocado.
- Pruebas: **749 pasan** (736 que ya había + 11 de `/img` + 2 de la comanda en vuelo), 1 omitida.
- `next build` + `next start` locales, con Supabase local y 6 fotos de prueba:
  carta, ficha, Mi cuenta (carga diferida), Google (inicio del OAuth), catálogo del
  panel, Tomar pedidos → enviar a cocina. Consola sin errores.
- `/img`: anchos válidos → WebP con caché de un año; inválidos, rutas raras y GIF → 404.

**Lo que no se pudo verificar aquí:** el `HIT` de Cloudflare sobre `/img` (solo
existe en producción, ver I-3) y el efecto real de la distancia Oregón–Virginia
(en local no hay distancia).

---

## 8. Pendientes, en orden

1. **Mover Render a Virginia** (I-1). Lo que más velocidad da de todo.
2. ~~Confirmar el plan de Render (I-2)~~ — resuelto: Starter.
3. Tras el despliegue: comprobar `cf-cache-status: HIT` en `/img` (I-3).
4. Precarga de enlaces tras cada acción (P-5) — solo si I-1 no se hace.
5. `getClaims()` en el proxy (I-4) — revisar primero las JWT Signing Keys.
6. Borrar `waiter-panel.tsx` (F-1); ordenar los avisos del primer ingreso (F-2).
7. Quitar los `router.refresh()` redundantes que quedan en pantallas de poco
   tráfico (P-3).
