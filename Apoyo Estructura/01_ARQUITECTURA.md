# 01 — Arquitectura del Sistema

## Visión general

DistLEOGIN es una aplicación **monolítica** con separación de responsabilidades clara:
el mismo servidor FastAPI sirve tanto la API REST como los archivos estáticos del
frontend. No hay un servidor de frontend separado en producción.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTE (Browser / PWA)                        │
│                                                                             │
│  frontend/client/index.html   ←→   localStorage (JWT, carrito)             │
│  frontend/admin/index.html    ←→   memoria JS   (JWT admin)                │
│                                                                             │
│  Service Worker (sw.js)  →  cache offline de shell + catálogo              │
└────────────────┬──────────────────────────────────────────────────────────-─┘
                 │  HTTP / HTTPS   Bearer: <JWT>
                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           FastAPI (Uvicorn)  :8000 / :10000                │
│                                                                             │
│  ┌─ Middleware stack ────────────────────────────────────────────────────┐ │
│  │  GZipMiddleware   SecurityHeadersMiddleware   CORSMiddleware          │ │
│  │  slowapi (rate-limit login)                                           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ Routers (API REST) ──────────────────────────────────────────────────┐ │
│  │  /api/auth/*          /api/catalog/*     /api/orders/*               │ │
│  │  /api/analytics/*     /api/recipes/*     /api/recurring/*            │ │
│  │  /api/claims/*        /api/approvals/*   /api/push/*                 │ │
│  │  /api/whatsapp/*      /api/account/*     /api/templates/*            │ │
│  │  /api/admin/restaurants  /api/admin/products  /api/admin/orders      │ │
│  │  /api/admin/payments     /api/admin/price_lists  /api/admin/routes   │ │
│  │  /api/admin/inventory    /api/admin/reports                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ Static files ────────────────────────────────────────────────────────┐ │
│  │  /         → frontend/client/   (SPA cliente PWA)                    │ │
│  │  /admin/   → frontend/admin/    (panel administrador)                │ │
│  │  /assets/  → frontend/assets/   (logos, fuentes, iconos)             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ Services / Workers ──────────────────────────────────────────────────┐ │
│  │  auth_service.py     catalog_service.py   order_service.py           │ │
│  │  pdf_service.py      notification_service.py   push_service.py       │ │
│  │  recurring_scheduler.py  (APScheduler — background task)             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└────────┬──────────────────────────────┬───────────────────────────────────-┘
         │  asyncpg (pool persistente)  │  redis-py async
         ▼                              ▼
┌──────────────────┐         ┌─────────────────────┐
│  PostgreSQL 15   │         │      Redis 7         │
│                  │         │                      │
│  28 tablas       │         │  Cache usuarios      │
│  ENUMs nativos   │         │  Blacklist JWT (jti) │
│  Triggers        │         │  Cola notificaciones │
│  resolve_price() │         │  (futuro: pub/sub)   │
│  Funciones SQL   │         └─────────────────────┘
│  (numeración)    │
└──────────────────┘
         │
         ▼ (servicios externos opcionales)
┌──────────────────────────────────────────────────────┐
│  SendGrid (email)   Twilio (WhatsApp)   VAPID (Push) │
└──────────────────────────────────────────────────────┘
```

---

## Componentes y su responsabilidad

### Frontend — dos aplicaciones independientes

| App | Ruta | Tecnología | Descripción |
|-----|------|------------|-------------|
| **Cliente PWA** | `/` | HTML5 + CSS + JS Vanilla | App móvil para restaurantes. Offline-capable via Service Worker. |
| **Panel Admin** | `/admin/` | HTML5 + CSS + JS Vanilla | Dashboard de escritorio para el distribuidor. Solo-push SW. |

Ambas apps comparten:
- `frontend/colors_and_type.css` — design tokens (`--coral`, `--ink`, `--cream`, …)
- `frontend/assets/` — fuentes auto-hospedadas (Geist, Instrument Serif, JetBrains Mono)
- `Tailwind CSS` compilado localmente (no CDN)

### Backend — FastAPI

| Capa | Archivos | Responsabilidad |
|------|----------|-----------------|
| **Configuración** | `app/config.py` | Variables de entorno con validación Pydantic |
| **DB engine** | `app/database.py` | Pool async asyncpg, sesión por request |
| **Cache** | `app/cache.py` | Redis: cache de usuarios, blacklist JWTs |
| **Modelos ORM** | `app/models/*.py` | Mapeo SQLAlchemy ↔ tablas PostgreSQL |
| **Schemas** | `app/schemas/*.py` | Validación entrada/salida con Pydantic v2 |
| **Dependencias** | `app/dependencies.py` | Inyección: sesión DB, usuario actual, guards de rol |
| **Routers** | `app/routers/**/*.py` | Endpoints HTTP (thin layer: valida → delega a service) |
| **Services** | `app/services/*.py` | Lógica de negocio (operaciones complejas multi-tabla) |
| **Workers** | `app/workers/*.py` | Background tasks (pedidos recurrentes con APScheduler) |
| **Migraciones** | `app/db_migrate.py` | SQL idempotente con advisory lock, corre antes de uvicorn |

### Infraestructura — Docker Compose (3 servicios)

```
docker-compose.yml
├── db        (postgres:15-alpine) — puerto 5432
├── redis     (redis:7-alpine)     — puerto 6379
└── backend   (Dockerfile)         — puerto 8000
```

El backend **espera** a que db y redis pasen el healthcheck antes de arrancar
(`depends_on: condition: service_healthy`).

---

## Decisiones arquitectónicas clave

### 1. Monolito intencionado (no microservicios)
FastAPI sirve tanto la API como los archivos estáticos. Esto simplifica el despliegue
(un solo contenedor en Render), elimina el problema de CORS entre frontend/backend
en producción, y es suficiente para el volumen de un distribuidor regional.

### 2. Precios en PostgreSQL, nunca en Python
`resolve_price(product_id, restaurant_id, date)` es una función SQL con cascada de
prioridades: precio por restaurante > lista de precios > precio maestro. Llamarla
desde Python con `SELECT resolve_price(...)` garantiza consistencia y evita
reimplementaciones divergentes.

### 3. Sesión DB por request (no global)
`get_db()` abre una sesión `asyncpg` por request, hace `commit` automático al salir
sin excepciones, y `rollback` si algo falla. Esto previene estados sucios entre requests.

### 4. Caché de usuarios en Redis (no DB en cada request)
`get_current_user` sigue este orden:
1. Verificación criptográfica del JWT (sin red)
2. `jti` contra blacklist en Redis (O(1))
3. Usuario en caché Redis (TTL 5 min)
4. Fallback a PostgreSQL → guarda en Redis

Resultado: la mayoría de requests autenticados nunca tocan PostgreSQL para validar la sesión.

### 5. Frontend sin frameworks JS
Decisión explícita del proyecto. Toda la lógica es JS vanilla con funciones globales.
CSS extraído a `app.css`, JS a `app.js`. El Service Worker cachea el shell para uso
offline y pre-carga el catálogo.
