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
| **Fase 3** | Super Admin (panel maestro) | ⬜ Pendiente |
| **Fase 4** | Pedidos en línea (Plan 2 Premium) | ⬜ Pendiente |
| **Fase 5** | Pulido, seguridad y lanzamiento | ⬜ Pendiente |

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
