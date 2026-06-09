# PLAN MAESTRO — Plataforma SaaS de Menús Interactivos para Restaurantes

> **Nombre de trabajo:** *MenúVivo* (provisional — ajustable)
> **Autor técnico:** Arquitectura definida en sesión de planificación
> **Última actualización:** 2026-06-08
> **Estado:** Fase 0 ✅ · Fase 1 ✅ · Fase 2 ✅ · Fase 3 ✅ · Fase 4 ✅ · Fase 5 ✅ → Piloto

---

## 1. Visión y propuesta de valor

Hoy muchos restaurantes usan un QR que lleva a un **PDF estático, lento y aburrido**. Nuestra plataforma reemplaza eso por un **menú web interactivo, rápido y espectacular**, con panel de administración para que el dueño lo controle, y un sistema de **pedidos en línea** opcional.

Es un **SaaS multi-tenant**: una sola plataforma sirve a muchos restaurantes, cada uno con su propio subdominio, su personalización (colores, logo, fondo, estilo) y su plan de suscripción. Tú, como dueño de la plataforma, controlas todo desde un **Super Admin**.

**Lo que nos diferencia:**

- Diseño *liquid glass* premium (portada Spotlight, catálogo en cuadrícula).
- Personalización total por restaurante: cada cliente se siente único.
- Pedidos en tiempo real con alerta sonora + visual + WhatsApp.
- Tú activas/desactivas módulos y planes a voluntad sin tocar código.

---

## 2. Actores y roles

| Rol | Quién es | Acceso |
|-----|----------|--------|
| **SUPER_ADMIN** | Tú (dueño de la plataforma) | Panel maestro global: crea restaurantes, activa/desactiva módulos y planes, personaliza temas, ve métricas de todos. |
| **RESTAURANT_OWNER** | Dueño del restaurante | Panel admin de SU restaurante: catálogo, precios, fotos, disponibilidad, pedidos. |
| **RESTAURANT_STAFF** | Empleado (opcional) | Subconjunto del panel admin (ej. solo gestionar pedidos), sin tocar precios. |
| **CLIENTE FINAL** | Comensal | Vista pública del menú vía QR/subdominio. Sin login. Hace pedidos como invitado (Plan 2). |

> Hereda el patrón RBAC de tu proyecto DistLEOGIN, adaptado a multi-tenant con RLS de Supabase.

---

## 3. Modelo de negocio y planes

El acceso se controla con el campo `plan_actual` en la tabla `restaurants` y un set de **módulos** (flags) que el Super Admin puede encender/apagar.

| Plan | Código | Incluye |
|------|--------|---------|
| **Plan 1 — Solo Catálogo** | `CATALOGO` | Menú en línea dinámico + panel admin para gestionar el catálogo. |
| **Plan 2 — Pedidos (Premium)** | `PREMIUM` | Todo lo del Plan 1 **+** carrito de compras, pedidos para llevar/domicilio (efectivo contra entrega), alerta en tiempo real (sonido + visual) y notificación automática a WhatsApp. |

**Módulos (flags independientes del plan, para flexibilidad total):**

```
modules = {
  catalog:        true,   // siempre on
  orders:         false,  // on en PREMIUM
  whatsapp_notify:false,  // on en PREMIUM
  analytics:      false,  // futuro add-on
  reservations:   false,  // futuro add-on
}
```

`plan_actual` define el preset; los `modules` permiten excepciones (ej. darle pedidos a un cliente del Plan 1 como cortesía). El Super Admin controla ambos.

---

## 4. Decisiones de arquitectura (definitivas)

| Capa | Tecnología | Por qué |
|------|------------|---------|
| **Frontend** | Next.js 16.2 (App Router, TypeScript, Turbopack) | Menús con renderizado en servidor (carga instantánea para QR), el prototipo ya es React, soporte nativo de subdominios vía middleware. |
| **Estilos** | Tailwind CSS v4 + CSS variables (tokens del prototipo) | Porta directo el sistema de diseño *liquid glass* existente; theming por restaurante con variables CSS. |
| **Auth** | Supabase Auth | Login para owners/staff/super-admin. Cliente final es anónimo. |
| **Base de datos** | Supabase (PostgreSQL 15) + **RLS** | Aislamiento multi-tenant a nivel de base de datos (cada query filtra por `restaurant_id` automáticamente). |
| **Tiempo real** | Supabase Realtime | Alerta de pedidos nuevos al panel admin sin Redis ni websockets propios. |
| **Almacenamiento** | Supabase Storage | Fotos de platillos y logos, con CDN y transformación de imágenes. |
| **Notificación WhatsApp** | Enlace `wa.me` (MVP) → Cloud API (futuro) | Sin costo de API para validar el negocio; mensaje pre-llenado al confirmar pedido. |
| **Hosting** | Render (Web Service, Node 22) | Lo pediste; soporta SSR, API routes, middleware y **subdominios wildcard con SSL automático**. |
| **DNS** | Cloudflare (wildcard `*.tudominio.com`) | Enruta todos los subdominios al mismo servicio de Render. |

### Diagrama de arquitectura

```
                    QR del restaurante
                           │
                           ▼
            azucarnegra.tudominio.com
                           │
                           ▼
        ┌──────────────────────────────────┐
        │   Cloudflare (DNS wildcard *)     │
        └──────────────┬───────────────────┘
                       ▼
        ┌──────────────────────────────────┐
        │   Render — Next.js 16 (Web Svc)   │
        │                                   │
        │   middleware.ts                   │
        │   → extrae subdominio (slug)      │
        │   → resuelve restaurant_id        │
        │                                   │
        │   ┌─ App Router ────────────────┐ │
        │   │ /            Vista Cliente  │ │
        │   │ /admin       Panel Restau.  │ │
        │   │ /super       Super Admin    │ │
        │   │ /api/*       Route Handlers │ │
        │   └─────────────────────────────┘ │
        └──────┬─────────────────┬──────────┘
               │                 │
               ▼                 ▼
    ┌────────────────┐   ┌──────────────────┐
    │ Supabase       │   │ Supabase Realtime│
    │  Postgres +RLS │   │  (pedidos live)  │
    │  Auth          │   └──────────────────┘
    │  Storage       │
    └────────────────┘
               │
               ▼ (Plan 2, al confirmar pedido)
        Enlace wa.me con mensaje pre-llenado
```

---

## 5. Multi-tenancy: cómo funciona

1. **Cada restaurante tiene un `slug`** único (ej. `azucar-negra`) → su subdominio es `azucar-negra.tudominio.com`.
2. **`middleware.ts`** lee el `hostname`, extrae el slug y resuelve el `restaurant_id`. Lo inyecta en el contexto de la request (header interno o cookie de sesión).
3. **RLS de Supabase** garantiza que ninguna query devuelva datos de otro restaurante, aunque alguien intente saltarse el frontend. El `restaurant_id` viaja en el JWT (para usuarios autenticados) o se pasa como parámetro validado (para el cliente público de solo-lectura).
4. **El Super Admin** no está atado a un `restaurant_id`: tiene políticas RLS especiales que le dan acceso global.

> Patrón estándar 2026 confirmado: *Wildcard DNS → Next.js middleware → Supabase RLS*.

---

## 6. Sistema de personalización (theming por restaurante)

El corazón del "cada restaurante se siente único". Se basa en el `tweaks-panel` del prototipo, pero **guardado en base de datos** y aplicado por el servidor.

**Tabla `restaurant_themes`** (1:1 con `restaurants`):

```
restaurant_id      → FK
brand_name         → "Azúcar Negra"
logo_url           → Storage
color_primary      → #D97757   (el "coral"/acento)
color_bg           → #0b0b0c   (fondo / asfalto)
color_text         → #F5F3EF
font_display       → "Unbounded"
portada_style      → 'spotlight' | 'poster' | 'stack'
catalog_view       → 'grid' | 'list'
glass_intensity    → 'translucido' | 'esmerilado' | 'solido'
background_image   → Storage (opcional)
```

Next.js lee el tema en el servidor y **inyecta variables CSS** en el `<html>` (igual que `GLASS_PRESETS` y `tokens.css` del prototipo). Cero recompilación: cambiar un color en el Super Admin se refleja al instante.

**Valores por defecto (tu preferencia):** portada `spotlight`, catálogo `grid`, glass `translucido`.

---

## 7. Modelo de datos (esquema inicial)

```sql
-- Núcleo multi-tenant
restaurants (
  id uuid PK, slug text unique, name text,
  plan_actual text default 'CATALOGO',   -- CATALOGO | PREMIUM
  modules jsonb default '{"catalog":true,"orders":false}',
  status text default 'active',           -- active | suspended
  whatsapp_number text, contact_email text,
  created_at timestamptz default now()
)

restaurant_themes ( ... ver sección 6 ... )

profiles (              -- extiende auth.users
  id uuid PK FK→auth.users, restaurant_id uuid FK,
  role text,            -- SUPER_ADMIN | RESTAURANT_OWNER | RESTAURANT_STAFF
  full_name text
)

-- Catálogo
categories (
  id uuid PK, restaurant_id uuid FK, name text, icon text,
  sort_order int, is_active bool default true
)

products (
  id uuid PK, restaurant_id uuid FK, category_id uuid FK,
  name text, description text, price numeric(10,2),
  image_url text, tags text[], is_available bool default true,
  sort_order int, created_at timestamptz default now()
)

-- Pedidos (Plan 2)
orders (
  id uuid PK, restaurant_id uuid FK, order_number text,
  customer_name text, customer_phone text,
  order_type text,      -- PICKUP | DELIVERY
  address text, payment_method text default 'CASH',
  status text default 'NEW',  -- NEW|PREP|READY|TRANSIT|DELIVERED|CANCEL
  subtotal numeric, total numeric, notes text,
  created_at timestamptz default now()
)

order_items (
  id uuid PK, order_id uuid FK, product_id uuid FK,
  name_snapshot text, price_snapshot numeric,  -- precio CONGELADO
  quantity int, subtotal numeric
)
```

**Principios heredados de tu doc de referencia:**

- **Precios congelados** en `order_items` al crear el pedido (no recalcular después).
- **RLS en TODAS las tablas** desde el día 1 (multi-tenant seguro de origen).
- Numeración correlativa de pedidos (`ORD-2026-00042`) con función SQL.
- ENUMs / `CHECK` para estados; índices compuestos `(restaurant_id, created_at desc)`.

---

## 8. Flujo de pedido en tiempo real (Plan 2)

```
[Cliente] arma carrito → confirma (PICKUP/DELIVERY, efectivo)
        │
        ▼
[API route] inserta order + order_items (precios congelados)
        │
        ├──► Supabase Realtime emite INSERT en `orders`
        │         │
        │         ▼
        │   [Panel Admin] suscrito al canal:
        │     · 🔔 sonido (Web Audio, como el `chime()` del prototipo)
        │     · toast visual + badge pulsante
        │
        └──► Genera enlace wa.me con resumen del pedido
                  → se abre/envía al WhatsApp del restaurante
```

> El sonido y el toast ya están prototipados (`App.jsx` → `chime()` y `Toast`). Se portan tal cual.

---

## 9. Roadmap por FASES

Cada fase entrega algo **funcional y demostrable**. No avanzamos a la siguiente sin cerrar la anterior.

### FASE 0 — Fundaciones (setup)
- Repositorio + Next.js 16 (TS, Tailwind v4, ESLint).
- Estructura de carpetas (app/, components/, lib/, supabase/).
- Proyecto Supabase + variables de entorno + cliente conectado.
- Portar sistema de diseño del prototipo (tokens + liquid glass).
- Deploy "hello world" en Render + DNS wildcard configurado.
- **Entregable:** subdominio de prueba sirviendo una página con el estilo glass.

### FASE 1 — Vista Cliente + Multi-tenant (núcleo Plan 1)
- Esquema BD: `restaurants`, `categories`, `products`, `restaurant_themes` + RLS.
- `middleware.ts` resuelve subdominio → restaurant.
- Vista cliente: **Portada Spotlight** + **catálogo cuadrícula** + glass translúcido.
- Detalle de producto, categorías, disponibilidad, imágenes desde Storage.
- Theming dinámico (cada subdominio con su color/logo).
- **Entregable:** un menú real navegable en `restaurante.tudominio.com`.

### FASE 2 — Auth + Panel Admin del Restaurante (Plan 1 completo)
- Supabase Auth (login owners/staff) + políticas RLS por rol.
- Panel admin: CRUD de categorías y productos (precio, foto, descripción, tags).
- Subida de fotos a Storage; toggle de disponibilidad; reordenar.
- Edición del perfil del restaurante.
- **Entregable:** el dueño gestiona su menú solo, sin tocarte a ti.

### FASE 3 — Super Admin (tu panel maestro)
- Panel `/super`: crear/editar/suspender restaurantes.
- Activar/desactivar `plan_actual` y `modules` por restaurante.
- Editor de personalización (colores, fondo, logo, fuentes, portada, glass).
- Métricas globales (nº restaurantes, pedidos, etc.).
- Onboarding: alta de un restaurante en minutos.
- **Entregable:** controlas toda la plataforma desde un solo lugar.

### FASE 4 — Pedidos en línea (Plan 2 Premium)
- Carrito de compras en la vista cliente.
- Checkout: para llevar / domicilio, efectivo contra entrega, datos del cliente.
- Creación de pedidos + máquina de estados + numeración.
- **Realtime:** alerta sonora + visual en panel admin.
- Notificación automática vía `wa.me`.
- Gating por plan: el carrito solo aparece si `modules.orders = true`.
- **Entregable:** un restaurante Premium recibe y gestiona pedidos.

### FASE 5 — Pulido, seguridad y lanzamiento
- Gating estricto de planes en frontend y backend.
- Generador de **QR por restaurante**.
- Auditoría de RLS, rate limiting, validaciones, manejo de errores.
- PWA / performance / SEO de menús.
- Piloto con el primer restaurante real.
- **Entregable:** plataforma lista para vender.

---

## 10. Costos estimados (arranque en planes gratuitos)

| Servicio | Plan free | Límite relevante | Cuándo subir |
|----------|-----------|------------------|--------------|
| Supabase | Free | 500 MB BD, 1 GB Storage, 2 proyectos | Al pasar ~varios restaurantes activos |
| Render | Free/Starter | Free duerme tras 15 min inactividad | Starter (~$7/mes) para evitar el "sleep" |
| Cloudflare | Free | DNS wildcard incluido | No necesita upgrade |
| Dominio | ~$10-15/año | — | Necesario desde Fase 0 |
| WhatsApp (wa.me) | Gratis | Mensaje manual asistido | Al querer 100% automático → Cloud API |

> Arranque viable por el costo de **un dominio**. El "sleep" de Render se mitiga con UptimeRobot (gratis) hasta justificar el plan Starter.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Render free "duerme" → primera carga lenta | UptimeRobot ping cada 5 min; subir a Starter al tener clientes. |
| RLS mal configurada → fuga de datos entre restaurantes | RLS desde día 1 + auditoría en Fase 5 + tests de aislamiento. |
| wa.me no es 100% automático | Aceptable para MVP; migración a Cloud API documentada para cuando haya volumen. |
| Imágenes pesadas → menú lento | Supabase image transform + lazy loading + formatos modernos. |
| Crecer y necesitar lógica pesada | La arquitectura permite añadir un microservicio FastAPI en Render sin reescribir. |

---

## 12. Cómo se conecta con tu proyecto de referencia (DistLEOGIN)

**Lo que reutilizamos como apoyo de estructura:**

- Separación de capas (rutas finas → servicios → datos).
- Patrón RBAC y aislamiento de tenant (adaptado a RLS).
- Precios congelados en items de pedido.
- Máquina de estados de pedidos.
- Estrategia de notificaciones y plantillas.
- Disciplina de seguridad (escape de HTML, validación, rate limiting).
- Filosofía de migraciones idempotentes (aquí: migraciones de Supabase).

**Lo que NO copiamos (porque Supabase lo resuelve mejor):**

- Redis para cache/blacklist → Supabase Auth + RLS lo cubren.
- Servidor FastAPI monolítico → Next.js + Supabase para el MVP.
- Service Worker manual complejo → PWA simplificada.

---

## 13. Próximo paso

Arrancar **Fase 0**. Antes de escribir código necesitaré de ti: el **nombre definitivo** de la plataforma y el **dominio** que vas a usar (o si quieres que trabajemos primero en local con subdominios simulados). El detalle operativo está en `IMPLEMENTACIONES.md`.
