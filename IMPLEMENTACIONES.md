# BITÁCORA DE IMPLEMENTACIONES

> Registro de todo lo que se construye en el proyecto, por sesión.
> Se actualiza **automáticamente al finalizar cada sesión**.
> Acompaña a `PLAN_MAESTRO.md` (estrategia) y `ERRORES.md` (lecciones).

---

## Estado global del proyecto

| Fase | Descripción | Estado |
|------|-------------|--------|
| **Fase 0** | Fundaciones (setup Next.js + Supabase + Render + diseño) | ✅ Completada (deploy pendiente del usuario) |
| **Fase 1** | Vista Cliente + Multi-tenant (Plan 1 núcleo) | ✅ Completada |
| **Fase 2** | Auth + Panel Admin del Restaurante (Plan 1 completo) | ✅ Completada |
| **Fase 3** | Super Admin (panel maestro) | ✅ Completada |
| **Fase 4** | Pedidos en línea (Plan 2 Premium) | ✅ Completada |
| **Fase 5** | Pulido, seguridad y lanzamiento | ✅ Completada |

Leyenda: ⬜ Pendiente · 🟨 En progreso · ✅ Completada

---

## Stack definido

- **Frontend/Fullstack:** Next.js 16.2 (App Router, TypeScript, Turbopack) + Tailwind CSS v4
- **Backend/Datos:** Supabase (PostgreSQL 15 + RLS + Auth + Realtime + Storage)
- **Hosting:** Render (Web Service, Node 22) · **DNS:** Cloudflare (wildcard)
- **Multi-tenant:** subdominios `restaurante.tudominio.com`
- **WhatsApp:** enlace `wa.me` (MVP) → Cloud API (futuro)
- **Diseño:** sistema *liquid glass* portado del prototipo (portada Spotlight, catálogo cuadrícula, glass translúcido)

---

## Sesión 1 — 2026-06-08 — Planificación y arquitectura

**Objetivo:** definir la idea, la arquitectura y el plan por fases.

**Realizado:**

- Análisis de la carpeta `Apoyo Estructura/` (documentación del proyecto DistLEOGIN): arquitectura, estructura de archivos, flujo de datos, componentes reutilizables, despliegue, base de datos y seguridad. Identificados patrones reutilizables (RBAC, aislamiento de tenant, precios congelados, máquina de estados de pedidos, disciplina de seguridad).
- Análisis del prototipo `catalgos Restaurantes base de diseño/` (Azúcar Negra): sistema de tokens, *liquid glass* (3 intensidades), portada Spotlight, catálogo en cuadrícula, panel admin con pedidos en tiempo real (sonido + toast), y el `tweaks-panel` como semilla del theming multi-tenant.
- Decisiones de arquitectura confirmadas con el usuario:
  - Backend/datos: **Supabase nativo + Next.js**.
  - Frontend: **Next.js (React)**.
  - URLs multi-tenant: **subdominios**.
  - WhatsApp: **enlace wa.me para el MVP**.
- Verificación de versiones actuales (junio 2026): Next.js 16.2, Render soporta wildcard con SSL, patrón multi-tenant DNS→middleware→RLS.
- Creados los documentos base del proyecto:
  - `PLAN_MAESTRO.md` — visión, roles, planes, arquitectura, modelo de datos, theming, roadmap por fases, costos y riesgos.
  - `IMPLEMENTACIONES.md` — este archivo.
  - `ERRORES.md` — registro de errores y anti-patrones heredados.

**Decisiones clave:**

- `plan_actual` (`CATALOGO` | `PREMIUM`) + `modules` (jsonb) para gating flexible.
- Theming por restaurante guardado en `restaurant_themes` y aplicado vía variables CSS desde el servidor.
- RLS en todas las tablas desde el día 1.
- Valores de diseño por defecto: portada `spotlight`, catálogo `grid`, glass `translucido`.

**Pendiente / decisiones para el usuario antes de Fase 0:**

- Nombre definitivo de la plataforma (provisional: *MenúVivo*).
- Dominio a usar (o trabajar en local con subdominios simulados primero).

**Próximo paso:** arrancar **Fase 0 — Fundaciones**.

---

## Sesión 2 — 2026-06-08 — Fase 0: Fundaciones (arranque)

**Objetivo:** montar el proyecto Next.js, portar el sistema de diseño y cablear Supabase en local.

**Realizado:**

- Decisión confirmada con el usuario: arrancar **Fase 0 en local** (sin dominio aún).
- Generado el scaffold con `create-next-app`: **Next.js 16.2.7 + React 19.2.4 + TypeScript + Tailwind v4** (App Router, `src/`, alias `@/*`). Carpeta: `plataforma/`.
- Añadidas dependencias **@supabase/ssr 0.10.3** y **@supabase/supabase-js 2.107.0**; script `typecheck` y `engines.node >=20`; `.node-version` = 22.
- **Sistema de diseño portado** del prototipo a `src/app/globals.css`: tokens, *liquid glass* (3 intensidades vía `data-glass`), fondo *asphalt* animado, helpers tipográficos y animaciones. Variables themeable por restaurante: `--brand-bg`, `--brand-text`, `--brand-accent`.
- Componente cliente `src/components/glass.tsx`: `<Glass>` con *sheen* que sigue el puntero, `<Price>`, `<Tag>`.
- `src/app/layout.tsx`: fuentes (Geist + display de marca), idioma `es`, fondo asphalt, glass translúcido por defecto.
- `src/app/page.tsx`: **página demo** que prueba el sistema → portada **Spotlight** + catálogo **cuadrícula** + glass translúcido (datos de muestra).
- **Supabase cableado:** `src/lib/supabase/client.ts` (navegador) y `server.ts` (servidor, cookies async), patrón oficial `@supabase/ssr` para Next 16.
- **Multi-tenant:** `src/lib/tenant.ts` (subdominio → slug) + `src/middleware.ts` (Edge: resuelve tenant en header `x-tenant-slug` + refresca sesión Supabase si hay credenciales).
- `.env.local.example` (claves Supabase + `NEXT_PUBLIC_ROOT_DOMAIN`), `.gitignore` corregido para no ignorar el `.example`, `README.md` con instrucciones de arranque.

**Decisiones clave:**

- Theming por restaurante = variables CSS sobre `<html>` (`--brand-*` + `data-glass`). En Fase 1 vendrán de `restaurant_themes`.
- Middleware corre en Edge y solo refresca sesión si hay credenciales (la demo funciona sin Supabase configurado).

**Verificación:**

- `package.json` validado como JSON correcto (herramienta de archivo).
- Estructura de `src/` y resolución de imports `@/*` verificadas.
- ⚠️ No se pudo compilar dentro del sandbox por la limitación del mount (ver `ERRORES.md`). **La compilación/ejecución se hace en la máquina del usuario** con `npm install && npm run dev`.

**Pendiente (cierre de Fase 0):**

- Usuario: nombre definitivo + dominio (para DNS wildcard en Render).
- Ejecutar en local y confirmar que la demo se ve bien.
- Crear proyecto Supabase real y poblar `.env.local`.
- Deploy inicial en Render.

**Próximo paso:** que el usuario corra la demo en local; luego **Fase 1** (esquema BD + RLS + vista cliente con datos reales por subdominio).

---

---

## Sesión 3 — 2026-06-08 — Fase 0: cierre (configuración de deploy)

**Objetivo:** completar todo lo que se puede hacer en código para cerrar la Fase 0 y dejar el proyecto listo para hacer deploy en Render.

**Realizado:**

- Creado `render.yaml`: tipo `web`, runtime `node`, plan `free`, región `oregon`, build `npm install && npm run build`, start `npm run start`. Define las 4 variables de entorno que Render necesita (`NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), todas marcadas `sync: false` para que el usuario las rellene en el dashboard de Render.
- Actualizado `next.config.ts`: añadido `images.remotePatterns` para `**.supabase.co` (permite servir imágenes de Supabase Storage — logos y fotos de platillos — en Fase 1+).
- Actualizado `README.md`: instrucciones paso a paso para el deploy en Render (conectar repo, variables de entorno, URL del servicio) y para configurar el DNS wildcard en Cloudflare (CNAME `*` → servicio Render + dominio custom en Render). Eliminada la nota confusa sobre borrar `.git/`.

**Decisiones clave:**

- `render.yaml` en la raíz de `plataforma/` (el repo que se sube a GitHub). Render lo detecta automáticamente.
- No se usa `output: "standalone"` en Next.js config: el Web Service de Render corre `next start` directamente, sin necesidad de imagen Docker.
- Next.js 16 lee `PORT` automáticamente; no se necesita `-p $PORT` explícito en el start command.

**Pendiente (acciones del usuario para cerrar el deploy):**

1. Subir `plataforma/` a GitHub (repositorio nuevo, público o privado).
2. Crear proyecto Supabase real y copiar las credenciales a `.env.local` (local) y a Render (producción).
3. Crear Web Service en Render → conectar el repo GitHub → Render detecta `render.yaml`.
4. Agregar las 4 variables de entorno en Render → lanzar el primer deploy.
5. Configurar dominio en Cloudflare (CNAME `*` → URL de Render) + custom domain en Render.
6. Verificar que `*.tudominio.com` sirve la demo con el estilo glass.

**Próximo paso:** **Fase 1** — esquema de base de datos (`restaurants`, `categories`, `products`, `restaurant_themes` + RLS) y vista cliente con datos reales filtrados por subdominio.

---

## Sesión 4 — 2026-06-08 — Fase 1: Vista Cliente + Multi-tenant

**Objetivo:** esquema BD, queries de datos reales, theming dinámico por subdominio, vista cliente navegable.

**Realizado:**

- **SQL migrations** (`supabase/migrations/`):
  - `001_initial_schema.sql`: tablas `restaurants`, `restaurant_themes`, `categories`, `products`, `profiles` + RLS (lectura pública para clientes anónimos, cada tabla con `enable row level security`).
  - `002_seed_demo.sql`: datos de Azúcar Negra (restaurante + tema + 4 categorías + 6 productos) — listos para pegar en el SQL Editor de Supabase.
- **TypeScript types** (`src/types/index.ts`): interfaces `Restaurant`, `RestaurantTheme`, `Category`, `Product`.
- **Data layer**:
  - `src/lib/db/restaurants.ts`: `getRestaurantBySlug(slug)` — cached con `React.cache()` para evitar doble query entre layout y page.
  - `src/lib/db/menu.ts`: `getMenuData(restaurantId)` — cached, fetches categorías y productos en paralelo.
- **Layout dinámico** (`src/app/layout.tsx`): lee `x-tenant-slug` del header, llama a `getRestaurantBySlug`, inyecta `--brand-bg`, `--brand-text`, `--brand-accent` y `data-glass` en el `<html>`. Fallback a defaults del CSS si Supabase no está configurado.
- **Página principal** (`src/app/page.tsx`):
  - Modo tenant (slug en header): carga datos reales de Supabase; llama `notFound()` si el slug no existe.
  - Modo demo (dominio raíz, sin slug): muestra datos de Azúcar Negra hardcodeados.
  - `generateMetadata()`: título dinámico con el nombre del restaurante.
  - `MenuPage` component: Portada Spotlight (glass, nombre, tagline, botón anchor scroll) + `<MenuClient>`.
- **MenuClient** (`src/components/menu-client.tsx`): componente cliente con:
  - Tabs de categoría (filtrado en cliente, "Todos" siempre visible).
  - Cuadrícula 2 columnas de `ProductCard` (imagen real con `next/image` o placeholder con tag).
  - `ProductModal` (bottom sheet animado con `anim-slide-up`, bloquea scroll del body, cierra con backdrop o botón ×).
- **Not found** (`src/app/not-found.tsx`): página glass para slugs que no existen en BD.
- **globals.css**: añadida animación `anim-slide-up` (bottom sheet), clase `.line-clamp-2` (truncado de descripción a 2 líneas).

**Decisiones clave:**

- `React.cache()` deduplica la query `getRestaurantBySlug` entre layout y page en el mismo request.
- El modal es un bottom sheet (no fullscreen) con max-height 85dvh — cómodo en móvil, no invasivo en escritorio.
- Demo data hardcodeada en `page.tsx` para que el dominio raíz siga funcionando sin Supabase configurado.
- `notFound()` desde Next.js (retorna `never`) dispara el `not-found.tsx` con estilo glass consistente.

**Pasos para activar en producción:**

1. Abrir el SQL Editor en el dashboard de Supabase.
2. Ejecutar `001_initial_schema.sql` (crea tablas + RLS).
3. Ejecutar `002_seed_demo.sql` (inserta Azúcar Negra como primer restaurante de prueba).
4. Configurar `.env.local` con las claves de Supabase (ver `.env.local.example`).
5. Probar en local: `azucar-negra.localhost:3000` debe mostrar el menú real con datos de Supabase.
6. Hacer deploy en Render y verificar `azucar-negra.tudominio.com`.

**Próximo paso:** **Fase 2** — Supabase Auth + Panel Admin del restaurante (CRUD de categorías y productos, subida de fotos, toggle de disponibilidad).

---

## Sesión 5 — 2026-06-08 — Fase 2: Auth + Panel Admin del Restaurante

**Objetivo:** Implementar login/logout, protección de rutas, y panel admin completo para que el dueño gestione su menú sin intervención del desarrollador.

**Realizado:**

- **SQL Migration `003_auth_admin_rls.sql`:**
  - Funciones helper `get_my_restaurant_id()` / `get_my_role()` (security definer, no recursión RLS).
  - Políticas RLS de escritura en `categories`, `products`, `restaurants`, `restaurant_themes` para OWNER / STAFF / SUPER_ADMIN.
  - Bucket `restaurant-assets` en Supabase Storage (5 MB, JPEG/PNG/WebP/GIF).
  - Storage policies: lectura pública + escritura restringida al `restaurant_id` del usuario.

- **`src/lib/supabase/service.ts`:** Cliente con `service_role` para operaciones SUPER_ADMIN que bypasan RLS.

- **`src/types/index.ts`:** Añadido tipo `Profile`.

- **Server Actions:**
  - `auth.ts`: `login()` (email + password → redirect `/admin/menu`), `logout()`.
  - `categories.ts`: `createCategory`, `updateCategory`, `deleteCategory`, `toggleCategoryActive`, `moveCategoryUp/Down`.
  - `products.ts`: `createProduct`, `updateProduct`, `deleteProduct`, `toggleProductAvailability`, `moveProductUp/Down`.
  - `restaurant.ts`: `updateRestaurantInfo`, `updateRestaurantTheme`.
  - Todas usan `resolveContext()`: detectan si el usuario es SUPER_ADMIN → usa `createServiceClient()`, si no → usa la sesión del usuario (con RLS).

- **`src/lib/db/admin.ts`:** `getAdminContext()` (cacheado, user + profile + restaurant + theme) y `getAdminMenu(restaurantId)` (todas las categorías + productos sin filtrar is_active/is_available).

- **Componentes (`src/components/admin/`):**
  - `nav.tsx` (Client Component, `usePathname()` para nav activa, sticky header glass-solid).
  - `logout-button.tsx` (form con Server Action).
  - `category-manager.tsx`: lista de categorías con edición inline, toggle activo/inactivo, reordenar, + lista de productos por categoría con toggle de disponibilidad, reordenar, eliminar.
  - `product-form.tsx`: formulario completo (nombre, precio, categoría, descripción, tags, disponibilidad toggle, subida de foto); usa `useActionState`.
  - `profile-form.tsx`: info del restaurante + apariencia (colores con `input[type=color]`, controles segmentados para glass/portada/catálogo, logo upload).
  - `image-upload.tsx`: subida directa al bucket desde el browser (usa `createClient()`), con preview inmediato y validación de tamaño.
  - `delete-button.tsx`: confirma antes de eliminar vía `window.confirm()`.

- **Rutas del panel admin:**
  - `src/app/login/page.tsx`: Login glass, `useActionState`.
  - `src/app/admin/layout.tsx`: Auth guard — verifica sesión activa, obtiene profile, valida que OWNER/STAFF pertenezca al tenant del subdominio actual; SUPER_ADMIN accede a cualquier tenant.
  - `src/app/admin/page.tsx`: Redirect a `/admin/menu`.
  - `src/app/admin/menu/page.tsx`: Lista de categorías + productos, botón "Nuevo producto".
  - `src/app/admin/menu/productos/new/page.tsx`: Crear producto (hereda categoría del param `?cat=`).
  - `src/app/admin/menu/productos/[id]/page.tsx`: Editar producto + eliminar.
  - `src/app/admin/perfil/page.tsx`: Info + apariencia del restaurante.

**Decisiones clave:**

- SUPER_ADMIN sin `restaurant_id` en su perfil usa el tenant del subdominio + `createServiceClient()` para bypassing RLS.
- La subida de imágenes es client-side (evita límite de tamaño de Server Actions); el path en Storage sigue el patrón `{restaurant_id}/{folder}/{timestamp}.{ext}`.
- `revalidatePath('/admin/menu')` + `redirect()` en cada Server Action para mantener datos frescos sin cliente de estado global.
- La edición inline de categorías y el toggle de disponibilidad usan `<form action={serverAction}>` (progressive enhancement, sin JS client-side para las acciones de escritura básicas).

**Para activar Fase 2 en producción:**
1. Ejecutar `003_auth_admin_rls.sql` en el SQL Editor de Supabase.
2. Crear un usuario en Supabase Auth (dashboard → Authentication → Users → Invite user).
3. Insertar el perfil del usuario:
   ```sql
   insert into profiles (id, restaurant_id, role, full_name)
   values ('<auth_user_id>', '<restaurant_id>', 'RESTAURANT_OWNER', 'Tu Nombre');
   ```
4. Visitar `azucar-negra.tudominio.com/login` → ingresar credenciales → ya puedes gestionar el menú.

**Próximo paso:** **Fase 3** — Super Admin (panel maestro: crear/editar restaurantes, gestionar planes y módulos, theming global).

---

## Sesión 6 — 2026-06-08 — Fase 3: Super Admin (panel maestro)

**Objetivo:** construir el panel `/super` que permite al SUPER_ADMIN crear y gestionar todos los restaurantes de la plataforma.

**Realizado:**

- **SQL Migration `004_super_admin.sql`:**
  - Políticas RLS INSERT/DELETE para `restaurants` y `restaurant_themes` (SUPER_ADMIN).
  - Políticas INSERT/UPDATE/SELECT para `profiles` (SUPER_ADMIN puede crear cuentas de owners).
  - Índices globales `restaurants_created_idx` y `restaurants_status_plan_idx` para queries sin filtro de tenant.

- **`src/lib/db/super-admin.ts`:** Data layer con `createServiceClient()` (bypasa RLS):
  - `getAllRestaurants()` — todos los restaurantes con su tema (cacheado).
  - `getRestaurantFullById(id)` — restaurante + tema por ID.
  - `getGlobalMetrics()` — conteos totales: active, suspended, premium, catálogo.

- **`src/lib/actions/super-admin.ts`:** Server Actions (todas verifican rol SUPER_ADMIN):
  - `createRestaurant` — crea restaurante + tema por defecto; auto-genera slug del nombre.
  - `updateRestaurantBasic` — edita nombre, slug, tagline, email, whatsapp, status.
  - `updateRestaurantPlan` — cambia `plan_actual` y los módulos `orders`/`whatsapp_notify`.
  - `updateRestaurantThemeSuper` — edita todos los campos de `restaurant_themes`.
  - `deleteRestaurant` — elimina en cascada (categorías, productos, tema).

- **`src/components/super/nav.tsx`:** Navbar del Super Admin (glass-solid, sticky, links: Restaurantes / Métricas, botón cerrar sesión).

- **`src/components/super/restaurant-form.tsx`:** Formulario de creación (client component). Auto-genera slug al tipear el nombre; el usuario puede editarlo. Vista previa de URL.

- **`src/components/super/restaurant-edit-form.tsx`:** Formulario de edición de info básica. Selector visual de estado (Activo / Suspendido) con toggle animado.

- **`src/components/super/plan-editor.tsx`:** Selector de plan (CATALOGO / PREMIUM) con efecto visual de selección + toggles de módulos (Catálogo fijo, Pedidos, WhatsApp). Al seleccionar PREMIUM los módulos se habilitan automáticamente; al volver a CATÁLOGO se desactivan.

- **`src/components/super/theme-editor.tsx`:** Editor de apariencia completo (logo upload, nombre de marca, 3 color pickers, selectors glass/portada/catálogo). Reutiliza `ImageUpload` de admin.

- **Rutas del Super Admin:**
  - `/super` → redirect a `/super/restaurantes`
  - `/super/restaurantes` — lista de todos los restaurantes con badges de plan y estado.
  - `/super/restaurantes/new` — onboarding de nuevo restaurante.
  - `/super/restaurantes/[id]` — editor completo (Info + Plan + Apariencia + Zona peligrosa).
  - `/super/metricas` — métricas globales (cards) + tabla completa de restaurantes.

- **`src/app/super/layout.tsx`:** Guard que verifica role = SUPER_ADMIN; redirige a `/login` si no autenticado, a `/admin/menu` si autenticado pero sin el rol.

- **Actualizado `src/lib/actions/auth.ts`:** Tras login, redirige SUPER_ADMIN a `/super/restaurantes` y OWNER/STAFF a `/admin/menu`.

- **Actualizado `src/types/index.ts`:** Añadido campo `created_at: string` a la interfaz `Restaurant`.

**Decisiones clave:**

- Todas las operaciones del super admin usan `createServiceClient()` (service_role) para bypasear RLS sin depender de las políticas — más explícito y seguro.
- La verificación de rol se hace en cada Server Action (no solo en el layout) para defensa en profundidad.
- El slug se auto-genera en el cliente (JS) al tipear el nombre, eliminando fricción en el onboarding.
- El plan editor auto-activa/desactiva módulos al cambiar el plan — coherencia sin esfuerzo para el admin.

**Para activar Fase 3:**
1. Ejecutar `004_super_admin.sql` en el SQL Editor de Supabase.
2. Crear un usuario en Supabase Auth con el email del super admin.
3. Insertar su perfil:
   ```sql
   insert into profiles (id, restaurant_id, role, full_name)
   values ('<uid>', null, 'SUPER_ADMIN', 'Tu Nombre');
   ```
4. Visitar `tudominio.com/login` → entrar → aterriza en `/super/restaurantes`.

**Próximo paso:** **Fase 4** — Pedidos en línea (carrito, checkout, realtime, WhatsApp).

---

## Sesión 7 — 2026-06-08 — Fase 4: Pedidos en línea (Plan 2 Premium)

**Objetivo:** implementar carrito de compras, checkout, gestión de pedidos en tiempo real y notificación WhatsApp.

**Realizado:**

- **SQL Migration `005_orders.sql`:**
  - Tablas `orders` y `order_items` con CHECK constraints, FK cascades y precios CONGELADOS en `order_items`.
  - Función SQL `generate_order_number(restaurant_id)` → formato `ORD-YYYY-NNNNN`.
  - Índices compuestos para queries por restaurante + fecha y por estado.
  - RLS: INSERT anónimo (clientes), SELECT/UPDATE restringido a OWNER/STAFF/SUPER_ADMIN.
  - Nota embebida: activar Realtime en tabla `orders` desde el dashboard de Supabase.

- **`src/types/index.ts`:** Añadidos `OrderStatus`, `Order`, `OrderItem`, `CartItem`.

- **`src/lib/cart-context.tsx`:** React Context + localStorage para el carrito.
  - Clave de storage por restaurante: `cart-{restaurantId}` (aislamiento multi-tenant).
  - Funciones: `addItem`, `removeItem`, `updateQuantity`, `clearCart`, derivados `total` y `count`.
  - Rehidratación desde localStorage en el primer montado.

- **`src/lib/db/orders.ts`:** `getRestaurantOrders(restaurantId)` con join a `order_items` — carga los últimos 100 pedidos.

- **`src/lib/actions/orders.ts`:** Server Actions:
  - `createOrder` — valida restaurant, verifica `modules.orders = true`, llama a `generate_order_number`, inserta `orders` + `order_items`.
  - `updateOrderStatus` — verifica rol del usuario, actualiza status, revalida `/admin/pedidos`.

- **`src/components/menu-shell.tsx`:** Wrapper cliente que envuelve `CartProvider` + `MenuClient`. Recibe `restaurantId` y `ordersEnabled`.

- **`src/components/menu-client.tsx`** (actualizado):
  - Nueva prop `ordersEnabled`. Integra `useCart()`.
  - `ProductModal`: botón "Agregar al carrito" (solo si `ordersEnabled`).
  - `CartBar`: barra sticky al fondo, aparece cuando hay ítems en el carrito.
  - `CartPanel`: bottom sheet con controles +/−/× por ítem, total y botón "Hacer pedido →" que navega a `/checkout`.

- **`src/app/page.tsx`** (actualizado): usa `MenuShell` en lugar de `MenuClient`. Pasa `restaurantId` y `ordersEnabled` (derivado de `restaurant.modules.orders`).

- **`src/app/checkout/page.tsx`:** Página del checkout (server). Resuelve el tenant desde el subdominio, verifica `modules.orders`, renderiza `<CartProvider><CheckoutForm /></CartProvider>`.

- **`src/components/checkout-form.tsx`:** Formulario completo de checkout (client component):
  - Muestra resumen del carrito (del context).
  - Campos: tipo (PICKUP/DELIVERY), nombre, teléfono, dirección (condicional), notas.
  - Estado: `form` → `submitting` → `success`.
  - En success: muestra confirmación + botón WhatsApp (`wa.me`) con mensaje pre-llenado (número, ítems, total, notas).

- **`src/components/admin/order-card.tsx`:** Tarjeta de pedido para el panel admin:
  - Muestra número, cliente, teléfono, tipo, dirección, ítems con precios congelados, total, hora.
  - Badge de estado con color por estado.
  - Botones de avance de estado (flujo adaptado a PICKUP vs DELIVERY) y cancelar.
  - Usa `useTransition` + `updateOrderStatus` server action.

- **`src/components/admin/orders-panel.tsx`:** Panel en tiempo real (client component):
  - Se suscribe a `postgres_changes` INSERT/UPDATE en `orders` vía Supabase Realtime.
  - Chime de 3 notas (Web Audio API) al recibir nuevo pedido.
  - Toast flotante con el número y nombre del cliente.
  - Separa pedidos activos y historial del día.

- **`src/app/admin/pedidos/page.tsx`:** Página del panel de pedidos. Carga pedidos iniciales con `getRestaurantOrders`, pasa a `OrdersPanel`.

- **`src/components/admin/nav.tsx`** (actualizado): acepta `ordersEnabled` — muestra link "Pedidos" en el nav solo si el módulo está activo.

- **`src/app/admin/layout.tsx`** (actualizado): extrae `currentRestaurant` (sea OWNER o SUPER_ADMIN con subdominio), deriva `ordersEnabled` y lo pasa al nav.

**Decisiones clave:**

- El carrito vive en localStorage con clave `cart-{restaurantId}`: aislamiento multi-tenant sin estado global.
- Precios congelados en `order_items` al momento del INSERT — el precio mostrado en el carrito se preserva aunque el owner lo cambie después.
- `createOrder` usa `createServiceClient()` (service_role) para la inserción — evita dependencia de sesión del cliente anónimo.
- El checkout es una página del mismo subdominio (`/checkout`), por lo que el tenant se resuelve del middleware igual que el menú.
- El botón WhatsApp en la confirmación abre `wa.me` con mensaje pre-llenado — MVP sin costo de API.
- Realtime funciona con el cliente browser autenticado (OWNER logueado); requiere activar Realtime en la tabla `orders` en el dashboard de Supabase.

**Para activar Fase 4:**
1. Ejecutar `005_orders.sql` en el SQL Editor de Supabase.
2. En Supabase dashboard: **Database → Replication** → activar Realtime en la tabla `orders`.
3. Desde el Super Admin: cambiar el plan de un restaurante a PREMIUM y activar el módulo "Pedidos".
4. Visitar el menú del restaurante → aparece "Agregar al carrito" en los productos.
5. Panel admin → nav muestra "Pedidos" → actualizar estados en tiempo real.

**Próximo paso:** **Fase 5** — Pulido, QR generator, seguridad, PWA y lanzamiento.

---

## Sesión 8 — 2026-06-08 — Fase 5: Pulido, seguridad y lanzamiento

**Objetivo:** hardening de seguridad, generador de QR, PWA/SEO, error boundaries y validaciones estrictas.

**Realizado:**

- **`src/lib/schemas.ts`:** Esquemas Zod para `orderItemSchema`, `customerSchema` y `createOrderSchema` (con refine para delivery + dirección). Tipado `CreateOrderInput` inferido de Zod.

- **`src/lib/actions/orders.ts`** (actualizado): `createOrder` ahora acepta `unknown` y valida con `createOrderSchema.safeParse()` antes de ejecutar cualquier lógica. `updateOrderStatus` agrega validación del status contra la lista de valores válidos.

- **`supabase/migrations/006_rls_hardening.sql`:** Defensa en profundidad a nivel de BD:
  - `anon insert orders`: reemplaza política permisiva → ahora requiere `status='NEW'`, `payment_method='CASH'` y que el restaurante exista con `modules->>'orders' = 'true'`.
  - `anon insert order_items`: requiere `quantity > 0`, `price_snapshot > 0` y que el pedido padre exista.
  - Columna `updated_at` + trigger `orders_set_updated_at` para auditoría y Realtime.

- **`next.config.ts`** (actualizado): headers HTTP de seguridad en todas las rutas: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

- **`src/app/manifest.ts`:** PWA manifest (nombre, short_name, display standalone, colores del tema, iconos 192/512).

- **`src/app/layout.tsx`** (actualizado): `export const viewport: Viewport` con `themeColor`, `initialScale` y `maximumScale`. Meta `apple-touch-icon`. Mantiene theming dinámico por restaurante.

- **`src/app/page.tsx`** (actualizado): `generateMetadata` enriquecido con OpenGraph (`og:title`, `og:description`, `og:url`, `og:type`) y Twitter card. `robots: { index: true, follow: false }` para evitar indexación cruzada entre restaurantes.

- **Error boundaries:**
  - `src/app/error.tsx` — error global con botón "Intentar de nuevo".
  - `src/app/admin/error.tsx` — error para el panel admin.
  - `src/app/super/error.tsx` — error para Super Admin.
  - Todos son Client Components con estilos glass coherentes.

- **Generador de QR:**
  - `src/app/api/qr/route.ts` — API route Node.js que recibe `?url=...`, valida que sea http/https, y retorna un SVG generado con el paquete `qrcode` (negro sobre blanco para máxima legibilidad en impresión).
  - `src/components/admin/qr-display.tsx` — Client Component con: previsualización del QR, URL del menú con botón "Copiar", enlace de descarga como `.svg`, e instrucciones.
  - `src/app/admin/qr/page.tsx` — Server Component que resuelve el restaurante del tenant actual (o del admin context si no hay subdominio), construye la URL del menú y pasa al QRDisplay.
  - `src/components/admin/nav.tsx` (actualizado): añadido link "QR" al nav del admin.

- **`package.json`** (actualizado): añadidos `qrcode ^1.5.4` y `zod ^3.24.0` a `dependencies`; `@types/qrcode ^1.5.5` a `devDependencies`.

**Decisiones clave:**

- Zod como única fuente de verdad para validación de pedidos: el schema en `schemas.ts` se usa tanto para validación en el Server Action como para el tipo TypeScript inferido.
- El QR se genera en el servidor (API route Node.js, no Edge) para usar el módulo `qrcode` de Node. Se cachea 24 horas vía `Cache-Control`.
- Los colores del QR son negro (#000) sobre blanco (#fff) — estándar para impresión y escaneo real. El contenedor en la UI tiene fondo blanco para garantizar legibilidad.
- Los security headers no incluyen CSP (Content-Security-Policy) porque Next.js 16 requiere `unsafe-inline`/`unsafe-eval` para su runtime. Una CSP estricta con nonces puede añadirse como mejora futura.
- La migración 006 usa `drop policy if exists` antes de recrear para ser idempotente.

**Para activar Fase 5 en producción:**
1. Ejecutar en el SQL Editor de Supabase: `006_rls_hardening.sql`.
2. Instalar las nuevas dependencias: `cd plataforma && npm install`.
3. Los iconos PWA (`/public/icon-192.png` y `icon-512.png`) deben crearse o copiarse en `plataforma/public/`. Sin ellos la PWA funciona pero sin icono personalizado.
4. Hacer deploy del código actualizado en Render.
5. El QR de cada restaurante está disponible en `/admin/qr` dentro del subdominio del restaurante.

**Próximo paso:** **Piloto con el primer restaurante real** — onboarding desde `/super/restaurantes/new`, crear usuario OWNER, probar el flujo completo de pedido en producción.

---

## Sesión 6 — 2026-06-08 — Alta de dueños + verificación end-to-end + guías

**Objetivo:** Cerrar el hueco operativo que hacía sentir la plataforma "no funcional", verificar que TODO funciona de verdad (no solo que compila), y documentar el entorno local y el despliegue.

**Diagnóstico inicial:** El código de las Fases 0-5 estaba completo y compilaba limpio (`build` ✓, `typecheck` ✓). Lo que faltaba era operativo:
1. Sin `.env.local` + migraciones, la app solo mostraba la demo → daba la falsa impresión de "prototipo de un restaurante".
2. **Hueco real de producto:** el Super Admin podía crear restaurantes pero **no podía crear el login del dueño** — había que hacerlo a mano en el dashboard de Supabase + SQL. Eso rompía el requerimiento "cada dueño con su propio panel, y yo administro cada restaurante".

**Realizado:**

- **Feature: Alta de usuarios del restaurante desde el Super Admin.**
  - `src/lib/db/super-admin.ts`: nueva `getRestaurantUsers(restaurantId)` — lista dueños/staff resolviendo el email vía `auth.admin.getUserById` (service_role), ordenando dueños primero.
  - `src/lib/actions/super-admin.ts`: tres acciones nuevas:
    - `createRestaurantUser` — crea el usuario en Auth (`auth.admin.createUser`, email confirmado) y enlaza su `profile` con el restaurante y el rol. Rollback del usuario si falla el profile. Detecta email duplicado.
    - `resetRestaurantUserPassword` — cambia la contraseña; verifica que el usuario sea de ESE restaurante y no un super admin.
    - `deleteRestaurantUser` — borra el login (`auth.admin.deleteUser`; el profile cae por FK cascade); nunca toca super admins ni usuarios de otro restaurante.
  - `src/components/super/restaurant-users.tsx` (nuevo) — UI glass: lista de accesos con badge de rol, botón "Contraseña" (reset inline con generador) y "Quitar"; formulario "Crear un acceso nuevo" (email, nombre, rol Dueño/Staff, contraseña con botón Generar) y aviso de copiar credenciales.
  - `src/app/super/restaurantes/[id]/page.tsx`: nueva sección "Acceso del restaurante" + banners `saved=user` / `saved=pass`.
  - Sin migración nueva: todo pasa por el service_role (bypassa RLS) y las políticas `profiles_*_super` de 004 ya existían.

- **`scripts/crear-super-admin.mjs` (nuevo):** crea/actualiza el Super Admin de forma idempotente. Lee `.env.local` o variables de entorno (sirve para local y para la nube).

- **Entorno local con Supabase + Docker:** se instaló el CLI de Supabase (`npx supabase`), `supabase init` + `supabase start` (stack completo en Docker), se aplicaron las 6 migraciones y se creó `.env.local` apuntando al stack local. Studio en `:54323`, API en `:54321`.

- **Verificación end-to-end REAL (navegador + Supabase local, no mocks):**
  1. Home demo renderiza ✓
  2. Login ✓ → redirección por rol ✓
  3. Super Admin lista restaurantes ✓
  4. Crear dueño desde el panel ✓ (profile enlazado: `RESTAURANT_OWNER` → `azucar-negra`, verificado en SQL)
  5. Dueño inicia sesión → entra a SU `/admin/menu` ✓
  6. Seguridad: dueño intentando `/super` → redirigido a `/admin/menu` ✓
  7. Vista de cliente `azucar-negra.localhost:3000` lee datos reales de la BD (no demo) ✓
  8. Dueño crea producto → escritura vía RLS con su sesión ✓ (verificado y limpiado en SQL)

- **`setup_produccion.sql` (nuevo):** combinación de las migraciones 001+003+004+005+006 (sin el demo) para pegar de una sola vez en el SQL Editor de la nube.

- **Documentación nueva (raíz):**
  - `GUIA_ENTORNO_LOCAL.md` — modelo mental app+Supabase, Docker explicado, rutina diaria, comandos, subdominios, troubleshooting.
  - `GUIA_DESPLIEGUE.md` — Supabase nube → GitHub → Render (con Root Directory = `plataforma`) → dominio/Cloudflare wildcard → primer restaurante real → notas de plan gratuito.
  - `plataforma/README.md` actualizado (middleware→proxy, arranque con Supabase local).

**Decisiones clave:**

- El alta de dueños usa **service_role** (no el JWT del usuario) porque crear usuarios en Auth es una operación administrativa. Se protege verificando `role = SUPER_ADMIN` antes de instanciar el service client (mismo patrón que el resto de acciones del super admin).
- El CLI nuevo de Supabase entrega llaves en formato `sb_publishable_` / `sb_secret_` en vez de las JWT `anon`/`service_role`. **Ambos formatos funcionan** con `@supabase/supabase-js` 2.107 — confirmado en la prueba (login, RLS y Admin API operaron con las llaves nuevas).
- En Render se usa un **Web Service manual con Root Directory = `plataforma`** en vez del Blueprint de `render.yaml`, porque el repo tiene la app en una subcarpeta (junto a los prototipos) y el Blueprint espera `render.yaml` en la raíz del repo.
- La contraseña del dueño se teclea/genera en el cliente y el Super Admin la entrega manualmente (MVP). El aviso "cópiala ahora, no se vuelve a mostrar" evita confusiones; existe "Contraseña" (reset) si se pierde.

- **Iconos PWA generados** ✅ — `scripts/gen-icons.mjs` (encoder PNG sin dependencias) crea `public/icon-192.png` y `icon-512.png` (fondo asfalto + círculo coral, maskable-safe). Resuelto el 404 de `/icon-192.png`. Reemplazables por el logo real.

**Notas de entorno (Windows):**
- `node`/`npm` en `C:\Program Files\nodejs\` no siempre en el PATH → `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
- PowerShell con ExecutionPolicy `Restricted` bloquea `npm` (es un `.ps1`). Fix permanente: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`. Alternativa sin cambios: usar `npm.cmd`.

**Pendiente / mejoras futuras:**
- `next.config.ts` solo permite imágenes de `**.supabase.co` en `next/image`; para ver fotos servidas desde el Storage **local** habría que añadir el patrón `127.0.0.1:54321` (no afecta producción).
- Email automático de bienvenida al dueño con sus credenciales (hoy se entregan a mano).

**Próximo paso:** Seguir `GUIA_DESPLIEGUE.md` con el proyecto Supabase real y crear el Web Service en Render.

---

## Sesión 9 — 2026-06-08 — Marca Leogin + landing comercial en el dominio raíz

**Objetivo:** corregir una confusión de identidad. **Leogin** es la empresa/plataforma (el SaaS, donde tú eres Super Admin). *Azúcar Negra* era solo un restaurante de ejemplo. El dominio raíz mostraba el menú demo de Azúcar Negra en vez de la página comercial de Leogin.

**Realizado:**
- **Dominio raíz = landing comercial de Leogin.** Nuevo `src/components/landing.tsx` (hero, features, "cómo funciona", planes Catálogo/Premium, CTA "Solicita tu demo", footer). `src/app/page.tsx` ahora rutea: **raíz → landing** · **`demo` → menú demo** · **slug → menú del tenant** (BD).
- **Demo movida a subdominio `demo`** (`demo.tudominio.com` / `demo.localhost:3000`): el menú de Azúcar Negra usa datos en código y **funciona siempre, aunque no haya BD**. Incluye barra superior "Demo de Leogin · Crea el tuyo →" que vuelve a la landing. Slug `demo` reservado en `src/lib/tenant.ts` (`DEMO_SLUG`).
- **Renombrado MenúVivo → Leogin** en superficies de plataforma: login (`/login`), `appleWebApp.title` (layout) y manifest PWA.
- **Manifest PWA dinámico** (`src/app/manifest.ts`): en el subdominio de un restaurante el nombre instalable es **el del restaurante** (el comensal instala "Azúcar Negra", no "Leogin"); en raíz/demo es "Leogin".
- **CTA de contacto configurable** por env: `NEXT_PUBLIC_CONTACT_WHATSAPP` (abre `wa.me`) o `NEXT_PUBLIC_CONTACT_EMAIL` (mailto). Documentado en `.env.local.example`.
- Helpers nuevos en `tenant.ts`: `DEMO_SLUG`, `rootDomainForUrls()`, `subdomainUrl()`.
- **Logo PROVISIONAL de Leogin** (a reemplazar por el original): monograma "L" sobre tile coral con degradado. `src/components/leogin-logo.tsx` (`<LeoginLogo>` marca+wordmark · `<LeoginMark>` solo marca), usado en landing (header/footer), login y nav del Super Admin. Iconos: `public/logo-mark.svg`, `src/app/icon.svg` (favicon, auto-inyectado), `src/app/apple-icon.tsx` (PNG real vía `next/og` ImageResponse, sin dependencias). Manifest PWA apunta a `logo-mark.svg`. **Para cambiarlo:** edita `LeoginMark` + esos 3 archivos de icono.

**Decisiones clave:**
- El **cliente final nunca ve "Leogin"**: ve el nombre del restaurante (sale de la BD, lo controla el Super Admin al crear/editar el restaurante). La marca "Leogin" solo aparece en superficies de plataforma (landing, login, panel).
- La **arquitectura multi-tenant no cambió** — ya era la correcta. Lo único conceptualmente mal era qué se mostraba en el raíz.

**Verificación (server local corriendo, vía HTTP con Host header):**
- `localhost:3000` → landing Leogin (hero, "Planes", "Ver demo en vivo"); **ya NO** muestra el menú de Azúcar Negra. ✓
- `demo.localhost:3000` → menú Azúcar Negra con barra "Demo de Leogin". ✓
- `/login` → dice "Leogin", ya no "MenúVivo". ✓
- `/manifest.webmanifest`: raíz `{"name":"Leogin"}` · demo `{"name":"Azúcar Negra"}`. ✓
- `npm run typecheck` y `npm run lint` limpios. ✓

**Pendiente / mejoras futuras:**
- **Logo definitivo de Leogin** (el actual es provisional: monograma "L" coral). Reemplazar `LeoginMark` + `public/logo-mark.svg` + `src/app/icon.svg` + `src/app/apple-icon.tsx`.
- (Opcional) PWA del tenant con el logo del restaurante (`logo_url`) en vez de la marca Leogin.
- Definir dominio definitivo (ej. `leogin.com`) y fijar `NEXT_PUBLIC_ROOT_DOMAIN` en Render + wildcard en Cloudflare (recordar incluir `demo.` y `www.`).

**Próximo paso:** Decidir dominio definitivo y desplegar (ver `GUIA_DESPLIEGUE.md`).

---

## Sesión — 2026-06-14 — Fase A: Admin Pro · Finanzas y rentabilidad

**Objetivo:** Arrancar el "Admin Pro" (que el panel del restaurante resuelva la operación completa). Primera fase de 4: finanzas y rentabilidad. (Roadmap completo en `PLAN_ADMIN_PRO.md`; el panel multi-sucursal va en `PLAN_GRUPOS.md`, Fase E.)

**Realizado:**
- **Migración `019_finanzas.sql`:** `products.cost`, `order_items.cost_snapshot`, tabla `cash_counts` (cortes de caja, RLS sin políticas) y `place_order` (RPC) ahora congela el costo por ítem.
- **Costo por producto:** input "Costo" con utilidad/margen en vivo en el formulario y el modal de producto; se captura en las 4 acciones de producto.
- **Margen histórico real:** `createOrder` lee `products.cost` y lo congela en cada `order_item`.
- **Reportes financieros** (`src/lib/db/reports.ts` · `getSalesReport`): ingreso, utilidad, margen, ticket, serie diaria, mix por canal/método de pago/zona, top por ingreso y por utilidad.
- **Corte de caja** (`src/lib/actions/finanzas.ts`): efectivo esperado del día (snapshot del servidor), guardar corte con diferencia, historial; export del reporte a CSV.
- **Pantalla `/admin/finanzas`** con selector de rango (7/30/90 días o fechas), KPIs, gráfica, mix, top productos y corte de caja. Ítem "Finanzas" en el nav (con módulo Pedidos) + ícono `wallet`.
- ✅ `npm run build` + `typecheck` limpios. Errores de lint que aparecen son **preexistentes** (shell/notifications/hours-editor, reglas eslint más estrictas).

**Decisiones clave:**
- El costo se congela en `order_items.cost_snapshot` → editar el costo no altera reportes pasados.
- Utilidad/margen solo sobre ítems con costo capturado (se avisa en la UI si faltan).
- `setup_produccion.sql` quedó congelado en mig. 008; la fuente de verdad es `supabase/migrations/`.

**Pendiente:**
- **Verificación real en navegador** (requiere Docker Desktop + `npx supabase start` + aplicar `019`).
- Fases B (analítica), C (inventario) y D (promos/personal) del Admin Pro; luego Fase E (panel de grupo).

**Próximo paso:** Verificar Fase A end-to-end y continuar con la Fase B (analítica avanzada).

---

## Sesión — 2026-06-14 (cont.) — Fase B: Admin Pro · Analítica avanzada

**Objetivo:** Segunda fase del Admin Pro: analítica de operación (complementa a Finanzas, que ve el dinero).

**Realizado:**
- **Migración `020_order_timestamps.sql`:** `orders.accepted_at/ready_at/delivered_at/cancelled_at`.
- **Sellado de tiempos:** `updateOrderStatus` marca el timestamp según la transición; `cancelPublicOrder` sella `cancelled_at`.
- **`src/lib/db/analytics.ts` (`getAnalytics`):** heatmap 7×24 de horas pico, franja/día pico, top vendidos + "no se mueven" (incluye 0 ventas), mix por canal/pago/zona (por nº de pedidos), tasa de cancelación, tiempos promedio prep/entrega.
- **Pantalla `/admin/analitica`** con KPIs, mapa de calor, velocidad de productos y mix; ítem "Analítica" en el nav.
- ✅ Verificado end-to-end: 30 pedidos sembrados + sellado real de `accepted_at`/`ready_at` desde el panel; build/typecheck limpios.

**Decisiones clave:**
- Tiempos se miden desde los cambios de estado (acumulan hacia adelante; los pedidos viejos no tienen marca).
- Finanzas = dinero (por ingreso); Analítica = operación (por nº de pedidos) → sin duplicar.

**Pendiente:** Fase C (inventario), Fase D (promos/personal), Fase E (panel de grupo). El nav ya tiene 11 ítems → la reorg por secciones + overflow móvil va en la Fase D.

**Próximo paso:** Fase C — inventario / control de stock.

---

## Sesión — 2026-06-14 (cont.) — Fase C: Admin Pro · Inventario / stock

**Objetivo:** Tercera fase del Admin Pro: control de existencias real, con anti-sobreventa.

**Realizado:**
- **Migración `021_inventario.sql`:** `products.track_stock/stock/low_stock_threshold`, tabla `stock_movements`, `place_order` (descuento atómico + guardia anti-sobreventa + auto-agotar a 0), `restock_order` (idempotente).
- **`src/lib/actions/inventory.ts`:** `saveInventory`, `adjustStock` (+/−), `getLowStock`.
- **Restock al cancelar:** `updateOrderStatus` y `cancelPublicOrder` llaman `restock_order` antes de marcar CANCEL.
- **Pantalla `/admin/inventario`** (`inventory-panel.tsx`): resumen, filtro, stepper, activar/editar stock+umbral, badges. Ítem "Inventario" en el nav (ícono `box`).
- ✅ Verificado: set/adjust/sale/cancel con bitácora, y **anti-sobreventa** (RAISE + rollback sin pedido fantasma). Build/typecheck limpios.

**Decisiones clave:**
- La guardia anti-sobreventa vive DENTRO de `place_order` (transaccional) → imposible vender de más por carrera.
- Activar control abre un form para capturar el stock inicial (no agota de golpe).

**Pendiente:** Fase D (promos/personal) y Fase E (panel de grupo). Reorg del nav (ya 12 ítems) en la Fase D.

**Próximo paso:** Fase D — promociones/cupones + gestión de personal con permisos.

---

## Sesión — 2026-06-14 (cont.) — Fase D: Admin Pro · Promos y personal

**Objetivo:** Cuarta y última fase del Admin Pro: cupones/descuentos + gestión de personal con permisos + bitácora.

**Realizado:**
- **Migraciones `022_promociones.sql`** (tabla `promotions`, `orders.discount/promo_id/promo_code`, `increment_promo_usage`) y **`023_personal.sql`** (`profiles.permissions`, tabla `activity_log`).
- **Promociones:** `db/promos.ts` (cálculo + resolución), `actions/promos.ts` (preview público + CRUD). Descuento aplicado **server-side** en `createOrder` (autoritativo) + conteo de uso.
- **Cupón en checkout:** campo con preview, desglose de descuento y línea en WhatsApp.
- **Permisos:** `lib/permissions.ts` (`can`), nav filtrado por sección, guards en páginas sensibles.
- **Personal:** `actions/staff.ts` (el dueño gestiona staff acotado a su restaurante con permisos), `/admin/personal` con equipo + bitácora.
- **Bitácora:** `lib/activity.ts` (`logActivity`) cableado en cambios de estado, stock, promos y staff.
- **Nav reorganizado:** secciones en escritorio, scrollable horizontal en móvil (ya caben 14 ítems).
- ✅ Verificado: cupón 20% (Q90→Q72) persistido + uso contado; staff con permisos limitados ve solo sus secciones y es redirigido de las demás. Build/typecheck limpios (35 rutas).

**Decisiones clave:**
- El descuento NUNCA se toma del cliente: se recalcula contra la BD en `createOrder`.
- `place_order` no cambió de firma; el descuento se persiste post-creación (total ya correcto).
- Staff con `permissions=null` = acceso total (compatibilidad); el dueño restringe asignando secciones.

**Pendiente:** Fase E — panel de grupo multi-sucursal (`slug-central`). Hardening menor de guards en páginas legacy.

**Próximo paso:** Fase E — organizaciones, rol GROUP_OWNER, ruteo `-central`, panel `/central/*`, alta de grupos desde el Super Admin.

---

## Sesión — 2026-06-14 (cont.) — Fase E: Panel de Grupo multi-sucursal

**Objetivo:** Panel propio para el dueño de varias sucursales (el "jefe del grupo") en `slug-central.dominio`. (Doc completo en `PLAN_GRUPOS.md`.)

**Realizado:**
- **Migración `024_grupos.sql`:** tabla `organizations`, `restaurants.organization_id`, `profiles.organization_id` + rol `GROUP_OWNER`.
- **Ruteo:** `tenant.ts` (`isGroupSubdomain`/`getGroupSlug` sufijo `-central`, `getTenantSlug` ignora `-central`), `proxy.ts` (rewrite a `/central` + header `x-org-slug`), `validateSlug` reserva `central`.
- **`src/lib/db/group.ts`:** `getGroupContext` (seguro: jefe ve solo su grupo), `getGroupDashboard`, `getGroupReport`.
- **Panel `/central/*`** (`group-shell.tsx`): resumen consolidado, sucursales (con drill-in a `-admin`), comparativa, finanzas. Login propio `/central/login`; `auth.ts` redirige GROUP_OWNER → `/central`.
- **Super Admin `/super/grupos`:** crear grupo, asignar/quitar sucursales, alta del login del jefe, eliminar. Acciones + lecturas en `super-admin.ts`/`db/super-admin.ts`.
- ✅ Verificado end-to-end: grupo con 2 sucursales, consolidado Q269 hoy, comparativa Q2166 (83%/17%) — agregación correcta. Build/typecheck limpios (42 rutas).

**Decisiones clave:**
- Subdominio `slug-central` (cubierto por el wildcard existente; sin DNS nuevo).
- `getGroupContext` es la frontera de seguridad: el jefe solo accede a su `organization_id`.
- El consolidado reusa `getOrderStats`/`getSalesReport` por sucursal (cada una en su zona horaria).

**Pendiente:** que el GROUP_OWNER administre cada sucursal con su mismo login (hoy abre el `-admin`; acceso de escritura cruzado = follow-up). Hardening de guards en páginas admin legacy.

**Próximo paso:** (Roadmap Admin Pro + Grupos COMPLETO.) Desplegar a la nube aplicando migraciones 019–024; opcional: acceso de escritura del jefe por sucursal.

---

## Sesión — 2026-06-16 — Rol Mesero: toma de pedidos en mesa

**Objetivo:** que el restaurante pueda dar de alta **meseros** que tomen pedidos en lugar del cliente (sistema tradicional de servicio en mesa), con interfaz separada optimizada para tablet/móvil.

**Realizado:**
- **Migración `030_meseros.sql`:** nuevo rol `RESTAURANT_WAITER` en el CHECK de `profiles.role`; columna `orders.waiter_id` (FK a `profiles`, `ON DELETE SET NULL`); políticas RLS (`staff read/update own orders`, `staff read own order_items`) recreadas para incluir al mesero; RPC `place_order` recreada con parámetro `p_waiter_id` (graba quién tomó la orden).
- **Alta desde Personal** (`staff-panel.tsx`, `actions/staff.ts`): la sección "Personal" ahora tiene **dos bloques** — *Staff admin* y *Meseros* — cada uno con su botón "+ Nuevo". El modal incluye selector "Tipo de personal"; al elegir Mesero se crea con `role=RESTAURANT_WAITER` y `permissions=null` (sin checkboxes de secciones). `listWaiters()` añadido.
- **Interfaz de mesero** (`/admin/mesero`, route group `(waiter)` aparte de `(protected)`): el layout y `auth.ts` redirigen al mesero a su panel y le bloquean el admin completo. `waiter-panel.tsx` (~400 líneas, touch-friendly): pestañas *Nuevo pedido* / *Mis pedidos*, scroll de categorías, grid de productos con modal de opciones, selector de mesa (1..`dineInTableCount`), nombre/referencia, notas, propina, carrito y total. Lecturas de menú vía `createServiceClient()` (el mesero no pasa las RLS de `categories`).
- **Acción `createWaiterOrder`** (`actions/orders.ts`): valida sesión y rol, usa service client, fuerza `DINE_IN` con `address='Mesa N'`, graba `waiter_id`; salta rate-limit/pausa/horario (el mesero está presente). `updateOrderStatus` ahora acepta al mesero → **control total** de estados (confirmar/listo/servir/cancelar) sobre sus pedidos.
- **Visibilidad del mesero en Pedidos** (`order-card.tsx`, `db/orders.ts`): cada tarjeta muestra `🙋 Mesero: <nombre>` (también en el recibo de cocina). El mesero solo ve sus pedidos **activos** (`getWaiterActiveOrders`, excluye DELIVERED/CANCEL). Realtime para refrescar.
- ✅ **Verificado end-to-end** en local: alta de "Carlos Mesero" → login redirige a `/admin/mesero` → pedido ORD-2026-00004 (Mesa 5, "Familia Pérez", Q45) con `waiter_id` correcto → avance de estado Nuevo→Preparando desde el panel del mesero → el dueño ve "🙋 Mesero: Carlos Mesero" en `/admin/pedidos`.

**Decisiones clave (confirmadas con el usuario):**
- Mesero como **rol nuevo** (no flag sobre staff): ruteo e RLS limpios.
- **Interfaz separada** en `(waiter)` (sin AdminShell), pensada para tablet.
- Reusa el selector de mesa existente (`dineInTableCount`); el mesero elige la mesa.
- El mesero ve **solo sus pedidos activos** y tiene **control total** de estados (igual que cajero).

**Pendiente:**
- Aplicar `030_meseros.sql` a Supabase en la nube al desplegar.

**Nota de entorno:** los puertos por defecto de Supabase local (54321–54324) quedaron en el rango de exclusión de Windows; se reasignaron a 54600–54607 en `supabase/config.toml` y `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`).

**Próximo paso:** desplegar (incluye migración 030) y validar el flujo de mesero en producción.

---

## Sesión — 2026-08-07 — Seed de demo comercial "Rincón 502" (restaurante variado)

**Objetivo:** Leonardo venía mostrando demos con catálogos casi vacíos que no parecían un restaurante real. Se pidió un demo "vivo" — menú variado (hamburguesas, pizzas, pastas, paninis, ensaladas, postres, bebidas), semanas de historial de pedidos, y cada módulo activo con datos usados — pensado para ir a producción (no solo a Supabase local) y mostrarse a prospectos en El Progreso, Jutiapa.

**Realizado:**
- **`plataforma/supabase/seed_demo_rincon502.sql`** (nuevo, ~720 líneas, idempotente): siembra el restaurante "Rincón 502" — 8 categorías, 38 productos (2 marcados `is_available=false` a propósito, sin `image_url`: Leonardo las agrega él mismo), 4 cupones (dos activos que se "gastan" de verdad durante el historial, uno vencido, uno casi agotado), 6 reservaciones, 4 entradas de lista de espera, configuración de lealtad, ~110 pedidos (105 históricos de los últimos 45 días + 5 "en vivo" de las últimas horas) generados **exclusivamente vía el RPC real `place_order`** (nunca INSERT directo en `orders`/`order_items`, para heredar gratis numeración atómica, snapshots y triggers), ~18 calificaciones de pedidos y 5 llamadas de mesero.
- **Flujo de uso deliberado:** el script NO crea el restaurante ni el usuario dueño — Leonardo lo da de alta primero con el flujo normal de la app (self-serve o `/super/restaurantes`), y el script busca por `slug='rincon502'` y falla con un mensaje claro si no existe. Evita tocar `auth.users` por SQL crudo (frágil, no soportado).
- **Verificación exhaustiva contra el esquema real** (108 migraciones), delegada primero a un subagente y luego **releída y confirmada personalmente** contra las migraciones críticas antes de entregarla (`001`, `005`, `020`, `043`, `044`, `045`, `048`, `060`, `071`, `072`, `087`, `093`, `097`): contrato completo y vigente de `place_order` (19 parámetros nombrados, retorna `jsonb`), columnas reales de `coupons`/`reservations`/`waitlist_entries`/`order_ratings`/`waiter_calls`/`loyalty_settings`, y el CHECK vigente de `orders.status` (incluye `SERVED`, migración 071) y `restaurants.plan_actual` (`BASICO/ESTANDAR/PREMIUM/PRO`, migración 072).
- **`schema_notes.md`** (en outputs, no versionado): detalle de qué se confirmó leyendo código y qué quedó como supuesto sin ejecutar contra una base real (no había credenciales de Supabase disponibles en esta sesión).

**Decisiones clave:**
- Restaurante variado (no un nicho único) a pedido explícito: hamburguesas, pizzas, pastas, paninis, ensaladas, postres, bebidas — slug `rincon502`, plan `PREMIUM`, los 7 módulos no pausados activados (`reservaciones, lista_espera, llamada_mesero, encuestas, cupones, loyalty, recetas`).
- Usar el RPC `place_order` en vez de INSERT directo en `orders`/`order_items` — ver entrada nueva en `ERRORES.md` (es una lección reutilizable, no solo de esta sesión).
- Los pedidos `CANCEL` del historial se marcan con `UPDATE` directo del status, no vía la RPC `void_order()` real — por diseño no generan fila en `order_voids` (la auditoría real de anulaciones); es cosmético, no reproduce el flujo anti-fraude completo.
- No se pobló `customers`/`loyalty_accounts`/`loyalty_transactions` (opcional, se dejó fuera para no alargar el script) — la sección "Clientes" del panel quedará vacía aunque haya ~110 pedidos.

**Pendiente (acciones de Leonardo):**
1. Crear el restaurante "Rincón 502" desde la app (self-serve o `/super/restaurantes`) con slug exacto `rincon502`.
2. Correr `seed_demo_rincon502.sql` primero en Supabase **local** y revisar el `RAISE NOTICE` final + un `select count(*) from orders where restaurant_id = ...` antes de tocar producción.
3. Si el rol del SQL Editor da error de permiso en `place_order`/`increment_coupon_usage` (revocados de `anon/authenticated` en 084/092, no probado en vivo si `postgres` los ejecuta igual como dueño), correrlo explícitamente como `service_role`.
4. Agregar las fotos de los 38 productos (a propósito no se generaron/asignaron).
5. Opcional: dar de alta un mesero de prueba desde Personal antes de correr el script, para que ~35% de los pedidos DINE_IN queden asignados a un mesero real.

**Próximo paso:** validar el script en local, poblarlo de imágenes, y usarlo como el demo estándar para mostrar en El Progreso, Jutiapa — en paralelo con `GUION_DEMO_90S.md`.

---

<!-- PLANTILLA PARA NUEVAS SESIONES (copiar y rellenar)

## Sesión N — AAAA-MM-DD — Título

**Objetivo:**

**Realizado:**
-

**Decisiones clave:**
-

**Pendiente:**
-

**Próximo paso:**

-->
