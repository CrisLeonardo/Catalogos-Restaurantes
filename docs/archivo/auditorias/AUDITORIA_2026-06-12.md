# Auditoría técnica — Catálogos / Leogin

**Fecha:** 2026-06-12
**Alcance:** toda la plataforma (`plataforma/` — Next.js 16.2.7 + React 19 + Supabase, multi-tenant por subdominio)
**Perfiles aplicados:** Ingeniería principal / DevSecOps + UX/UI & Frontend
**Método:** revisión estática del código (auth, RLS, server actions, API routes, migraciones, componentes) + inspección en vivo del DOM renderizado (medidas de layout, tap-targets y contraste WCAG reales).

> **Nota sobre capturas:** no fue posible generar screenshots porque el websocket de HMR de `next dev` mantiene la red “ocupada” y la captura nunca llega a “red inactiva”. La auditoría visual se hizo midiendo el DOM real en vivo (estilos computados, dimensiones, contraste), que es más preciso que una foto para espaciado/contraste. Para tener screenshots: `next build && next start` (sin HMR) o probar en producción.

---

## 0. Resumen ejecutivo

La base es **sólida y bien pensada**: RLS multi-tenant consistente, precios resueltos siempre en servidor (no falsificables), validación con Zod, `React.cache()` para deduplicar queries por request, y un sistema de diseño coherente. La mayoría de las server actions verifican `getUser()` + rol + `restaurant_id`.

Se encontraron **2 vulnerabilidades altas**, **2 medias**, varios riesgos de concurrencia/escala y un **bug funcional** en tus cambios sin commitear. Se aplicaron **6 correcciones** de alto impacto y bajo riesgo (ver §6). El resto queda documentado y priorizado (§7) porque requiere decisiones tuyas o infraestructura.

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| S1 | 🔴 Alta | XSS almacenado vía `custom_css` (`dangerouslySetInnerHTML`) | ✅ Corregido |
| S2 | 🔴 Alta | RLS de `push_subscriptions` abierta a `public` (anon key) | ✅ Corregido (mig. 015) |
| S3 | 🟠 Media | SSRF en `/api/icon/[slug]` (fetch de `logo_url` sin validar host) | ✅ Corregido |
| S4 | 🟠 Media | Sin rate-limit en endpoints públicos (`createOrder`, `trackVisit`) | ✅ Corregido (in-memory) |
| B1 | 🟠 Media | Bug: combos se guardan como `single` (`parseOptions`) | ✅ Corregido |
| C1 | 🟠 Media | `order_number` con `count(*)+1` → colisión por concurrencia | ✅ Corregido (mig. 016) |
| C2 | 🟡 Baja | `orders` + `order_items` insertados sin transacción | ✅ Corregido (mig. 016) |
| P1 | 🟠 Media | `getVisitStats` agrega hasta 50 000 filas en JS por carga | ✅ Corregido (mig. 017) |
| S5 | 🟡 Baja | `X-XSS-Protection: 1; mode=block` deprecado; falta CSP | ✅ Parcial / 📋 CSP |
| U1 | 🟠 Media | `--u-text-4` (op. 0.32) = 2.65:1 → reprueba WCAG AA | ✅ Corregido (0.48 → 4.61:1) |

---

## 1. Seguridad

### 🔴 S1 — XSS almacenado vía `custom_css` *(OWASP A03: Injection)*

**Dónde:** [`src/app/layout.tsx:117`](../../../plataforma/src/app/layout.tsx:117) y [`src/components/super/preview-client.tsx:173`](../../../plataforma/src/components/super/preview-client.tsx:173)
**Escritura del campo:** un **RESTAURANT_OWNER** puede setear `custom_css` en [`src/lib/actions/restaurant.ts:331`](../../../plataforma/src/lib/actions/restaurant.ts:331) (`saveAdminRestaurantTheme`).

El tema resuelto inyecta el CSS del restaurante crudo:

```tsx
<style id="tenant-custom-css" dangerouslySetInnerHTML={{ __html: resolved.customCss }} />
```

Un `<style>` es un *raw text element*: el navegador solo lo cierra al encontrar literalmente `</style`. Por tanto un dueño podía guardar:

```css
body{} </style><script>/* roba lo que el cliente escribe en el checkout */</script>
```

…y lograr **XSS almacenado que corre en el menú de TODOS sus comensales** (página donde el cliente teclea nombre, teléfono y dirección). Irónicamente, tu propio [`ERRORES.md:19`](../../registros/ERRORES.md:19) ya advierte *“evitar `dangerouslySetInnerHTML`”* — este es el único punto donde se saltó la regla.

**Corrección aplicada:** sanitizador centralizado en el resolver, `sanitizeCustomCss()` en [`src/lib/theme/resolve.ts`](../../../plataforma/src/lib/theme/resolve.ts), que elimina `</style`, `</script` y `<!--`. Verificado en vivo: el ataque queda como texto CSS inerte y el CSS legítimo (incl. combinador `>`) se preserva.

**Endurecimiento adicional aplicado:** `custom_css` ahora **solo lo define el Super Admin** — `saveAdminRestaurantTheme` ya no confía en el CSS que manda el cliente; para un dueño se conserva el valor existente (la UI ya ocultaba el campo con `showAdvanced={false}`, esto es el candado server-side). Alinea con el modelo "Leonardo diseña".

> ⚠️ **Residual:** aun sin “breakout” a JS, el CSS arbitrario puede exfiltrar datos (p. ej. selectores de atributo + `background:url(...)`). Como ya solo el Super Admin (de confianza) lo escribe, el riesgo es mínimo; un **CSP** (ver S5) lo cerraría del todo.

### 🔴 S2 — RLS de `push_subscriptions` abierta a todo el mundo *(A01: Broken Access Control)*

**Dónde:** [`supabase/migrations/014_push_subscriptions.sql:23`](../../../plataforma/supabase/migrations/014_push_subscriptions.sql:23)

```sql
create policy "service_role_only" on push_subscriptions
  using (true) with check (true);   -- sin cláusula `to` → aplica a public (anon+authenticated)
```

El comentario dice *“solo el service role”*, pero una política **sin `to`** aplica a `public`. Como la **anon key es pública** (viaja al navegador), cualquiera podía:
- **Leer** `endpoint`, `p256dh`, `auth` de **todos los restaurantes** (claves push sensibles, cross-tenant).
- **Insertar/borrar** suscripciones → spoofing de notificaciones o DoS de avisos de pedidos.

El acceso legítimo ya pasa siempre por service role ([`/api/push/subscribe`](../../../plataforma/src/app/api/push/subscribe/route.ts) y [`lib/push.ts`](../../../plataforma/src/lib/push.ts)), así que la política sobra.

**Corrección aplicada:** [`migrations/015_fix_push_subscriptions_rls.sql`](../../../plataforma/supabase/migrations/015_fix_push_subscriptions_rls.sql) elimina la política (deja RLS activada sin políticas = deny-by-default, idéntico al patrón correcto de `customers` y `page_visits`). **Acción requerida:** correr la migración 015 en Supabase.

### 🟠 S3 — SSRF en `/api/icon/[slug]` *(A10: SSRF)*

**Dónde:** [`src/app/api/icon/[slug]/route.ts:40`](../../../plataforma/src/app/api/icon/[slug]/route.ts:40)

El handler hace `fetch(iconUrl)` **server-side** y devuelve el body. `iconUrl` sale de `config.pwaIconUrl ?? config.logoUrl`, y `logo_url` se guarda **sin validar el host** ([`restaurant.ts:99`](../../../plataforma/src/lib/actions/restaurant.ts:99)). Un dueño autenticado podía apuntarlo a `http://169.254.169.254/latest/meta-data/…` (metadata de nube) o a servicios internos y leer la respuesta.

**Corrección aplicada:** `isAllowedIconUrl()` exige `https` y host = el de `NEXT_PUBLIC_SUPABASE_URL` o `*.supabase.co`; si no, cae al ícono estático sin hacer fetch.

> Recomendación adicional (no aplicada): validar también el host **al guardar** `logo_url`/`pwaIconUrl` en las actions, para rechazar el dato malicioso en origen.

### ✅ S4 — Rate-limiting en endpoints públicos *(corregido)*

`createOrder` y `trackVisit` son invocables anónimamente y escriben con service role. Sin límite, `createOrder` permitía inundar de pedidos (spam de push/sonido + crecimiento de tabla) y `trackVisit` inflar métricas / llenar `page_visits`.

**Corrección aplicada:** limitador en memoria [`lib/rate-limit.ts`](../../../plataforma/src/lib/rate-limit.ts) (ventana fija por IP), aplicado en [`createOrder`](../../../plataforma/src/lib/actions/orders.ts) (**6/min** por IP+restaurante) y [`trackVisit`](../../../plataforma/src/lib/actions/metrics.ts) (**40/min**). La IP sale de `x-forwarded-for`.

> ⚠️ **Limitación:** el contador vive en el proceso → con escalado horizontal (varias instancias) cada una cuenta por separado. Para tu deploy actual de 1 instancia en Render es suficiente; si escalas, migrar a **Redis/Upstash** con la misma interfaz `rateLimit()`. Un `captcha`/honeypot en el checkout sigue siendo recomendable contra bots dedicados.

### 🟡 S5 — Headers de seguridad

**Dónde:** [`next.config.ts`](../../../plataforma/next.config.ts)
- ✅ **Aplicado:** `X-XSS-Protection` cambiado de `1; mode=block` (deprecado, con vectores conocidos) a `0` (recomendación OWASP).
- 📋 **Pendiente:** no hay **Content-Security-Policy**. Dado el `custom_css`, las fuentes de Google, Supabase y los tiles de Leaflet, un CSP bien armado es la mejor defensa en profundidad contra S1. No se aplicó automáticamente porque un CSP mal calibrado rompe la app; sugiero empezar en `Content-Security-Policy-Report-Only` y ajustar.

### ✔️ Lo que está bien (no tocar)
- **Precios siempre en servidor** ([`orders.ts:161`](../../../plataforma/src/lib/actions/orders.ts:161)): se ignora el precio del cliente, se relee de BD por `restaurant_id`, opciones validadas contra los grupos reales, snapshots congelados. Excelente.
- **RLS multi-tenant** consistente con helpers `get_my_restaurant_id()` / `get_my_role()` (SECURITY DEFINER, evita recursión).
- **service_role** correctamente aislado a servidor ([`supabase/service.ts`](../../../plataforma/src/lib/supabase/service.ts)); cliente navegador solo con anon key.
- `updateOrderStatus` no filtra por `restaurant_id` pero se apoya en la RLS de `orders` (un dueño solo actualiza los suyos). Correcto como defensa en profundidad. *Detalle menor:* la policy de UPDATE usa `with check (true)`, que permitiría reasignar `restaurant_id` en un update; hoy solo se actualiza `status`, así que el riesgo es nulo, pero conviene endurecerlo.

---

## 2. Rendimiento

### ✅ P1 — `getVisitStats` agregaba en JS hasta 50 000 filas por carga *(corregido, mig. 017)*
**Antes:** traía hasta `limit(50000)` filas de `page_visits` y calculaba today/7d/30d + únicos + serie de 14 días **en memoria** en cada carga del panel.

**Corrección aplicada:** [`migrations/017_visit_stats_rpc.sql`](../../../plataforma/supabase/migrations/017_visit_stats_rpc.sql) añade el RPC `visit_stats` (`security definer`, `stable`) que agrega en SQL con `count(distinct visitor_id)` y `generate_series` para la franja de 14 días, usando la zona horaria del restaurante. [`getVisitStats`](../../../plataforma/src/lib/actions/metrics.ts) ahora solo recibe el resumen (≈decenas de filas).

**Verificado en la BD local:** con +3 visitas de hoy (2 de un visitante, 1 de otro) → `today=3`, `uniqueToday=2`, y la última celda de la serie `{day, visits:3, is_today:true}`. La serie siempre trae 14 entradas.

> **Acción requerida:** correr la **migración 017** en producción.

### 🟡 P2 — `getRestaurantBySlug`: 2 queries secuenciales
**Dónde:** [`src/lib/db/restaurants.ts:29`](../../../plataforma/src/lib/db/restaurants.ts) — restaurante y luego tema. Es secuencial por necesidad (el tema depende del `id`). Menor; opcional unir con un `select` embebido `restaurants(*, restaurant_themes(*))`.

### 🟡 P3 — N+1 al duplicar restaurante
**Dónde:** [`src/lib/actions/super-admin.ts:380`](../../../plataforma/src/lib/actions/super-admin.ts:380) — inserta categorías una por una en un loop `await`. Es una operación puntual de Super Admin, impacto bajo; se podría batch-insertar y luego remapear.

### ✔️ Bien
- `React.cache()` en `getRestaurantBySlug`, `getMenuData`, `getAdminContext`, `getAdminMenu` deduplica las queries que el layout y la page piden por separado en el mismo request.
- Índices correctos en migraciones (`orders(restaurant_id, created_at)`, `page_visits(restaurant_id, created_at)`, etc.).
- Imágenes con `next/image` + `remotePatterns`; mapa Leaflet cargado con `dynamic(ssr:false)` y skeleton.

---

## 3. Escalabilidad, concurrencia y deuda técnica

### ✅ C1 + C2 — Numeración atómica y escritura transaccional *(corregidos, mig. 016)*
**Antes:** `generate_order_number` ([`005_orders.sql:42`](../../../plataforma/supabase/migrations/005_orders.sql:42)) usaba `count(*)+1` → dos pedidos simultáneos obtenían el **mismo número** (sin índice único que lo delatara). Y `createOrder` insertaba `orders` y `order_items` en dos llamadas separadas → si la segunda fallaba quedaba un **pedido huérfano** (con el push ya disparado).

**Corrección aplicada:** [`migrations/016_atomic_order_placement.sql`](../../../plataforma/supabase/migrations/016_atomic_order_placement.sql) introduce:
- Tabla `order_counters (restaurant_id, year, last_number)` con backfill desde los pedidos existentes (continúa la numeración sin colisionar).
- RPC `place_order` (`security definer`) que numera con `INSERT … ON CONFLICT DO UPDATE … RETURNING` (serializa incrementos concurrentes) e inserta pedido + ítems **en una sola función = una transacción**.

El server action ([`actions/orders.ts`](../../../plataforma/src/lib/actions/orders.ts)) ahora llama a `place_order` en vez de los 3 pasos sueltos; **toda la validación y resolución de precios en TS quedó intacta**.

**Verificado en la BD local:**
- Ítem inválido (`quantity 0`) → la función aborta, el contador **NO se incrementa** (siguió en 2) y **no queda pedido huérfano** → atomicidad real.
- Dos pedidos válidos → `ORD-2026-00003`, `ORD-2026-00004` (secuenciales, continuando desde los existentes), cada uno con sus ítems.

> **Acción requerida:** correr la **migración 016** en producción. Opcional tras deduplicar históricos: `create unique index orders_restaurant_number_idx on orders(restaurant_id, order_number)` como red de seguridad.

### 🟡 C3 — IDs de opciones con `Math.random()`
**Dónde:** [`actions/products.ts:60`](../../../plataforma/src/lib/actions/products.ts:60), [`options-editor.tsx:16`](../../../plataforma/src/components/admin/options-editor.tsx:16) — `Math.random().toString(36).slice(2,9)` (7 chars). Colisión improbable pero posible dentro de un mismo producto; preferible `crypto.randomUUID()`.

---

## 4. Bug funcional en tus cambios sin commitear

### 🟠 B1 — Los combos se guardaban como “elegir uno”
**Dónde:** [`src/lib/actions/products.ts:59`](../../../plataforma/src/lib/actions/products.ts:59)

`types/index.ts`, `options-editor.tsx` y `product-sheet.tsx` soportan el tipo `'combo'`, pero `parseOptions` hacía:

```ts
const type = g.type === 'multi' ? 'multi' : 'single';  // 'combo' → 'single'  ❌
```

Resultado: un combo creado en el editor se **persistía como `single` (required)** → al pedirlo forzaba elegir un solo componente, rompiendo la feature al guardar.

**Corrección aplicada:**
```ts
const type = g.type === 'multi' ? 'multi' : g.type === 'combo' ? 'combo' : 'single';
```
`resolveItemOptions` ya trataba bien el caso (sin `required`/`max`, todos los componentes suman su delta), así que el combo queda funcional de punta a punta. *(typecheck en verde.)*

---

## 5. Auditoría visual / UX-UI + Frontend percibido

Medido en vivo sobre el menú real del cliente (`demo`) y la landing.

### Lo que está muy bien
- **Sistema de diseño coherente:** tokens de color/espacio/radio (`--u-*`, `--radius-*`), estética “glass” consistente, jerarquía tipográfica clara (H1 56px → H2 36px → H3 16–22px en landing).
- **Responsive sin overflow:** en 375px **no hay scroll horizontal** (`scrollWidth == innerWidth`). Buen trabajo.
- **Tap-targets:** CTAs de 50px de alto; tabs de categoría 40px (aceptable, ver abajo).
- **Checkout excelente** ([`checkout-form.tsx`](../../../plataforma/src/components/checkout-form.tsx)): toggle de tipo de pedido, selector de mesa, pills de zona, mapa con feedback de distancia en vivo, autocompletado “¡Hola de nuevo!”, validación inline con “Número válido ✓”, fallback “mi zona no aparece → cambiar a pickup”, y handoff a WhatsApp con resumen. Flujo muy intuitivo.

### ✅ U1 — Contraste de texto atenuado *(corregido)*
Medido sobre el fondo oscuro `#0b0b0c` (valores reales del DOM):

| Token | Opacidad | Contraste | WCAG AA (4.5:1 texto / 3:1 UI) |
|-------|----------|-----------|-------------------------------|
| `--u-text` | sólido | ~17:1 | ✅ |
| `--u-text-2` | 0.74 | **9.79:1** | ✅ AAA |
| `--u-text-3` | 0.50 | **4.92:1** | ✅ |
| `--u-text-4` | ~~0.32 → 2.65:1~~ → **0.48** | **4.61:1** | ✅ (antes ❌) |

`--u-text-4` se usa en placeholders, hints (“(0 = sin límite)”), microcopy y la pill “Mi zona no aparece”; a 2.65:1 era ilegible para mucha gente.
**Corrección aplicada:** opacidad subida `0.32 → 0.48` en [`resolve.ts buildThemeVars`](../../../plataforma/src/lib/theme/resolve.ts) (temas tenant) y [`globals.css :root`](../../../plataforma/src/app/globals.css) (superficies de plataforma). No se tocó `--u-text-3` (ya pasaba y lo usan `.t-mute`/`.t-kicker`). **Verificado en vivo: 4.61:1.** Tier-3 y tier-4 quedan visualmente cercanos; es el precio de que el tono más tenue sea legible.

### Otras observaciones UX (menores)
- **Header móvil:** los links “Planes” (32px) y “Acceder” (35px) quedan algo por debajo del mínimo cómodo de 44px en móvil; subir el padding vertical.
- **Jerarquía de CTAs:** en el hero, “Ver demo en vivo” y “Solicita tu demo” tienen casi el mismo peso visual. Si la conversión que importa es la demo guiada, dale el botón sólido a esa y deja la otra como secundaria.
- **Skeleton de mapa:** ya hay placeholder “Cargando mapa…”; bien. Para LCP, considera `loading="lazy"` explícito en imágenes de producto fuera del primer viewport (hoy van `unoptimized`).
- **Rendimiento percibido:** todo se renderiza en servidor (RSC) y el menú no depende de JS para mostrarse → arranque rápido por QR. El mayor costo cliente es Leaflet (solo en checkout delivery), ya diferido. Bien.

---

## 6. Correcciones aplicadas en esta sesión

| Archivo | Cambio |
|---------|--------|
| [`lib/theme/resolve.ts`](../../../plataforma/src/lib/theme/resolve.ts) | + `sanitizeCustomCss()` y se aplica al `customCss` resuelto (fix S1) |
| [`components/super/preview-client.tsx`](../../../plataforma/src/components/super/preview-client.tsx) | Sanitiza el CSS en vivo antes de inyectarlo (defensa en profundidad S1) |
| [`supabase/migrations/015_fix_push_subscriptions_rls.sql`](../../../plataforma/supabase/migrations/015_fix_push_subscriptions_rls.sql) | **Nueva** — elimina la policy abierta de `push_subscriptions` (fix S2) |
| [`app/api/icon/[slug]/route.ts`](../../../plataforma/src/app/api/icon/[slug]/route.ts) | + `isAllowedIconUrl()` (allowlist de host) antes del fetch (fix S3) |
| [`lib/actions/products.ts`](../../../plataforma/src/lib/actions/products.ts) | `parseOptions` preserva el tipo `'combo'` (fix B1) |
| [`next.config.ts`](../../../plataforma/next.config.ts) | `X-XSS-Protection: 0` (fix S5 parcial) |
| [`supabase/migrations/016_atomic_order_placement.sql`](../../../plataforma/supabase/migrations/016_atomic_order_placement.sql) | **Nueva** — `order_counters` + RPC `place_order` (fix C1+C2) |
| [`lib/actions/orders.ts`](../../../plataforma/src/lib/actions/orders.ts) | `createOrder` usa el RPC transaccional `place_order` (fix C1+C2) |
| [`app/globals.css`](../../../plataforma/src/app/globals.css) · [`lib/theme/resolve.ts`](../../../plataforma/src/lib/theme/resolve.ts) | `--u-text-4` 0.32 → 0.48 (fix U1) |
| [`lib/rate-limit.ts`](../../../plataforma/src/lib/rate-limit.ts) (nuevo) · [`actions/orders.ts`](../../../plataforma/src/lib/actions/orders.ts) · [`actions/metrics.ts`](../../../plataforma/src/lib/actions/metrics.ts) | Rate-limit in-memory en `createOrder`/`trackVisit` (fix S4) |
| [`supabase/migrations/017_visit_stats_rpc.sql`](../../../plataforma/supabase/migrations/017_visit_stats_rpc.sql) (nuevo) · [`actions/metrics.ts`](../../../plataforma/src/lib/actions/metrics.ts) | RPC `visit_stats`; `getVisitStats` agrega en SQL (fix P1) |

**Verificación:** `tsc --noEmit` y `eslint` (de los archivos tocados) en verde; demo del cliente y panel de métricas renderizan sin errores de consola; sanitizador probado con casos de ataque; RPC `place_order` probado contra la BD local (atomicidad + numeración secuencial); RPC `visit_stats` probado (conteos + serie + `is_today`); contraste de `--u-text-4` medido en vivo en 4.61:1. Commit en rama `auditoria-fixes-2026-06-12`.

> **Acción manual requerida:** correr las **migraciones 015, 016 y 017** en Supabase de producción.

---

## 7. Pendientes priorizados (requieren tu decisión / infraestructura)

1. **(Alta)** Correr migraciones **015, 016 y 017** en prod.
2. **(Alta)** Añadir **CSP** (empezar en `Report-Only`) — único control de alto valor que queda pendiente para S1/S5.
3. **(Media)** Si se escala a varias instancias, migrar el rate-limit (S4) a Redis/Upstash; considerar captcha/honeypot en el checkout.
4. **(Baja)** Validar host de `logo_url` al guardar; `crypto.randomUUID()` para IDs de opciones; endurecer `with check` de la policy de UPDATE de `orders`; índice único opcional en `orders(restaurant_id, order_number)` tras deduplicar.
