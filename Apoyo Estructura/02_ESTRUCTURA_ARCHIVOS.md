# 02 — Estructura de Archivos de Referencia

## Árbol de directorios

```
DistLEOGINRestaurantes/
│
├── 📄 docker-compose.yml          # 3 servicios: db + redis + backend
├── 📄 Dockerfile                  # Multi-stage build, usuario no-root, puerto 10000
├── 📄 .env                        # Solo POSTGRES_PASSWORD (no subir a Git)
├── 📄 .gitignore
├── 📄 CLAUDE.md                   # Instrucciones para la IA (contexto de sesión)
│
├── 🗄️  001_initial_schema.sql      # Schema base — se aplica al crear el contenedor Docker
├── 🗄️  002_add_cancellation_request.sql  # Parches SQL históricos
├── 🗄️  seed_data.sql               # Datos de prueba locales
├── 🗄️  supabase_seed_completo.sql  # Seed completo para Supabase (producción)
│
├── 📁 backend/
│   ├── 📄 requirements.txt        # Dependencias Python (pip)
│   ├── 📄 pytest.ini              # Configuración de tests
│   ├── 📄 alembic.ini             # Config Alembic (migraciones alternativas)
│   ├── 📄 start-dev.sh / .bat     # Scripts de arranque local sin Docker
│   ├── 📄 .env                    # Variables del backend (NO subir a Git)
│   ├── 📄 .env.example            # Plantilla de variables (SÍ subir a Git)
│   │
│   ├── 📁 app/
│   │   ├── 📄 main.py             # ★ Entry point: FastAPI, middleware, routers, static files
│   │   ├── 📄 config.py           # ★ Settings con Pydantic — fuente única de config
│   │   ├── 📄 database.py         # ★ Engine async, sesión por request, Base ORM
│   │   ├── 📄 dependencies.py     # ★ get_current_user, guards de rol, DbSession
│   │   ├── 📄 cache.py            # Redis: cache de usuarios, blacklist JWT
│   │   ├── 📄 limiter.py          # Rate limiting (slowapi)
│   │   ├── 📄 db_migrate.py       # ★ Migraciones SQL idempotentes con advisory lock
│   │   │
│   │   ├── 📁 models/             # ★ SQLAlchemy ORM — una tabla = un archivo
│   │   │   ├── user.py            # User, Restaurant, UserRole enum
│   │   │   ├── product.py         # Product, Category, UnitOfMeasure
│   │   │   ├── price_list.py      # PriceList, PriceListItem, RestaurantPriceList
│   │   │   ├── order.py           # Order, OrderItem, OrderTemplate, OrderTemplateItem
│   │   │   ├── invoice.py         # Invoice, Payment, PaymentApplication
│   │   │   ├── inventory.py       # InventoryMovement
│   │   │   ├── notification.py    # NotificationTemplate, Notification
│   │   │   ├── route.py           # DeliveryRoute, RouteOrder
│   │   │   ├── push.py            # PushSubscription
│   │   │   └── system_setting.py  # SystemSetting (tabla key-value de config)
│   │   │
│   │   ├── 📁 schemas/            # Pydantic v2 — validación de request/response
│   │   │   ├── auth.py            # LoginRequest, TokenResponse
│   │   │   ├── catalog.py         # ProductOut, CategoryOut
│   │   │   ├── order.py           # OrderCreate, OrderOut, OrderItemCreate
│   │   │   ├── payment.py         # PaymentCreate, InvoiceOut
│   │   │   ├── price_list.py      # PriceListCreate, PriceListItemOut
│   │   │   ├── restaurant.py      # RestaurantCreate, RestaurantOut
│   │   │   ├── inventory.py       # MovementCreate, MovementOut
│   │   │   ├── report.py          # DashboardOut, SalesReportOut
│   │   │   └── common.py          # PaginatedResponse, shared types
│   │   │
│   │   ├── 📁 routers/            # Endpoints HTTP — thin: valida → service
│   │   │   ├── auth.py            # POST /api/auth/login, /logout, /change-password
│   │   │   ├── catalog.py         # GET /api/catalog/*, /favorites, /settings
│   │   │   ├── orders.py          # CRUD /api/orders/*, /reorder, /daily-total
│   │   │   ├── templates.py       # CRUD /api/templates/*
│   │   │   ├── analytics.py       # GET /api/analytics/*, /budget
│   │   │   ├── recurring.py       # CRUD /api/recurring/*, /from-order/{id}
│   │   │   ├── claims.py          # POST /api/orders/{id}/claims
│   │   │   ├── recipes.py         # CRUD /api/recipes/*, /{id}/to-cart
│   │   │   ├── approvals.py       # GET /pending-approvals, POST /{id}/approve|reject
│   │   │   ├── account.py         # GET/PUT /api/account (perfil restaurante)
│   │   │   ├── push.py            # POST /api/push/subscribe
│   │   │   ├── whatsapp.py        # POST /api/whatsapp/webhook (bot Twilio)
│   │   │   ├── health.py          # GET /api/health
│   │   │   └── admin/             # Endpoints exclusivos ADMIN
│   │   │       ├── restaurants.py # CRUD /api/admin/restaurants/*
│   │   │       ├── products.py    # CRUD /api/admin/products/*, /categories, /units
│   │   │       ├── price_lists.py # CRUD /api/admin/price-lists/*
│   │   │       ├── orders.py      # GET/PATCH /api/admin/orders/*, /purchase-list
│   │   │       ├── payments.py    # POST /api/admin/payments/*, /invoices/*
│   │   │       ├── inventory.py   # POST /api/admin/inventory/movements
│   │   │       ├── routes.py      # CRUD /api/admin/routes/*
│   │   │       └── reports.py     # GET /api/admin/reports/dashboard, /sales, /sales.xlsx
│   │   │
│   │   ├── 📁 services/           # ★ Lógica de negocio — aquí vive lo complejo
│   │   │   ├── auth_service.py    # login, logout, cambio de contraseña
│   │   │   ├── catalog_service.py # resolve_price(), listado con precios personalizados
│   │   │   ├── order_service.py   # crear pedido (precios congelados), máquina de estados
│   │   │   ├── pdf_service.py     # generación de PDFs con fpdf2
│   │   │   ├── notification_service.py  # email (SendGrid) + WhatsApp (Twilio)
│   │   │   └── push_service.py    # Web Push con VAPID
│   │   │
│   │   ├── 📁 workers/
│   │   │   └── recurring_scheduler.py  # APScheduler: genera pedidos recurrentes
│   │   │
│   │   ├── 📁 utils/
│   │   │   ├── auth.py            # hash_password, verify_password, create_access_token
│   │   │   └── timezone.py        # helpers de zona horaria (America/Guatemala)
│   │   │
│   │   └── 📁 templates/
│   │       └── pdfs/
│   │           └── invoice_proforma.html  # Template Jinja2 para facturas PDF
│   │
│   ├── 📁 storage/pdfs/           # PDFs generados (volumen Docker en prod)
│   │
│   └── 📁 tests/
│       ├── conftest.py            # fixtures: cliente HTTP async, DB en memoria
│       ├── test_auth.py           # 11 tests — login, logout, tokens
│       ├── test_authorization.py  # guards de rol
│       ├── test_revocation.py     # token_version e invalidación
│       ├── test_security_utils.py # bcrypt, límites
│       ├── test_approvals.py      # flujo STAFF → OWNER
│       └── test_favorites.py      # favoritos por restaurante
│
├── 📁 frontend/
│   ├── 📄 colors_and_type.css     # ★ Design tokens compartidos (variables CSS)
│   ├── 📄 tailwind.config.js      # Configuración Tailwind (purge paths)
│   ├── 📄 package.json            # Dependencias JS (solo Tailwind para compilar)
│   │
│   ├── 📁 assets/                 # Logos, íconos, fuentes auto-hospedadas
│   │   ├── fonts/                 # Geist, Instrument Serif, JetBrains Mono (.woff2)
│   │   ├── icon-192.png           # PWA icons
│   │   ├── icon-512.png
│   │   └── logo-*.png/svg         # Variantes del logo
│   │
│   ├── 📁 client/                 # App móvil para restaurantes
│   │   ├── index.html             # Shell SPA — estructura de pantallas
│   │   ├── app.css                # CSS extraído (glassmorphism, design system)
│   │   ├── app.js                 # JS extraído + bridge window.*
│   │   ├── pwa.js                 # Web Push, analítica, reorden, cola offline
│   │   ├── sw.js                  # ★ Service Worker: cache shell + catálogo offline
│   │   ├── manifest.json          # PWA manifest
│   │   ├── tailwind.css           # Tailwind compilado
│   │   └── chart.min.js           # Chart.js (inyectado bajo demanda)
│   │
│   └── 📁 admin/                  # Panel administrador
│       ├── index.html             # Shell SPA — panel de gestión
│       ├── app.css                # CSS extraído del admin
│       ├── app.js                 # JS extraído + bridge window.*
│       ├── admin-pwa.js           # Web Push para nuevos pedidos
│       ├── sw.js                  # Service Worker admin (solo push)
│       ├── manifest.json
│       └── tailwind.css
│
└── 📁 docs/                       # ← Esta carpeta
    ├── README.md
    ├── 01_ARQUITECTURA.md
    ├── 02_ESTRUCTURA_ARCHIVOS.md  ← este archivo
    ├── 03_FLUJO_DE_DATOS.md
    ├── 04_COMPONENTES_REUTILIZABLES.md
    ├── 05_DESPLIEGUE_CI_CD.md
    ├── 06_BASE_DE_DATOS.md
    └── 07_SEGURIDAD.md
```

---

## Por qué esta estructura es una buena práctica

### Separación de capas

```
Routers  →  reciben HTTP, validan con Pydantic, delegan
Services →  lógica de negocio, operaciones multi-tabla
Models   →  mapeo ORM, sin lógica de negocio
Schemas  →  contratos de entrada/salida (nunca exponer el modelo ORM directo)
```

Este patrón evita el "fat router" (todo en un endpoint) y el "fat model" (Active Record).
Los services son testables en aislamiento y los routers son thin.

### Un archivo por tabla en `models/`
Cada modelo tiene su propio archivo. Al crecer el equipo, los conflictos de Git en
modelos son casi imposibles. Importar desde `app/models/__init__.py` como punto central.

### `db_migrate.py` en lugar de Alembic para migraciones de aplicación
Las migraciones de esquema **post-inicial** (añadir columnas, nuevas tablas) usan
sentencias SQL idempotentes (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`)
con un advisory lock de PostgreSQL para que solo un worker las aplique. Esto es más
simple y robusto para un equipo pequeño que mantener archivos Alembic.

### Service Worker con versión explícita
```js
const VERSION = 'distleogin-2026-06-07';
```
Cambiar esta constante en cada commit que toque `frontend/client/` invalida el caché
del navegador móvil y fuerza la descarga de los nuevos archivos. Sin esto, los usuarios
verían código viejo aunque el servidor ya tenga la versión nueva.

### `.env` nunca en Git — `.env.example` siempre
`.env` contiene secretos reales. `.env.example` tiene la misma estructura pero con
valores de placeholder. El equipo puede copiar el ejemplo y rellenar los valores reales.
