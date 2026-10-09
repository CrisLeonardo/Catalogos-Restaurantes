# 04 — Componentes y Lógica Reutilizable

Módulos que pueden copiarse a otros proyectos FastAPI con mínimas adaptaciones.

---

## Backend

### 1. Configuración centralizada con Pydantic Settings

`backend/app/config.py`

**Por qué es útil:** un solo lugar para todas las variables de entorno. Pydantic valida
tipos, valores requeridos, y puede ejecutar lógica custom de arranque (ej: rechazar
secrets débiles en producción).

```python
# Patrón de uso en cualquier archivo
from app.config import settings

# Como dependencia de FastAPI (recarga-seguro, cacheado con lru_cache)
from app.config import get_settings
settings: Settings = Depends(get_settings)
```

**Adaptar para otro proyecto:**
1. Copiar `config.py`
2. Renombrar la clase `Settings` si quieres
3. Añadir/quitar campos según tus variables de entorno
4. El `@model_validator(mode="after")` de producción es genérico — solo cambia el nombre de la variable

```python
# Patrón de validación de arranque (copiable)
@model_validator(mode="after")
def _check_production_secrets(self) -> "Settings":
    if self.environment == "production":
        if not self.jwt_secret_key or len(self.jwt_secret_key) < 32:
            raise ValueError("JWT_SECRET_KEY débil o ausente en producción")
        if self.debug:
            raise ValueError("DEBUG no puede estar activo en producción")
    return self
```

---

### 2. Motor de base de datos async con pool de conexiones

`backend/app/database.py`

**Por qué es útil:** configura asyncpg con pool persistente (no abre conexión nueva por
request), pre-ping para conexiones muertas, y sesión por request con commit/rollback
automático.

```python
# Copiar completo a otro proyecto. Solo cambiar:
# - settings.database_url
# - El timezone en server_settings si no es Guatemala

# Uso en cualquier router:
@router.get("/items")
async def get_items(db: DbSession):
    result = await db.execute(select(Item))
    return result.scalars().all()
```

**Configuración de pool para Supabase (pgbouncer):**
```python
connect_args={
    "statement_cache_size": 0,  # obligatorio para pgbouncer transaction mode
    "server_settings": {"timezone": "America/Guatemala"},
}
```

---

### 3. Autenticación JWT + Guards de rol

`backend/app/utils/auth.py` + `backend/app/dependencies.py`

**Por qué es útil:** implementación completa con:
- bcrypt para contraseñas (con límite 72 bytes)
- JWT con `jti` para revocación individual (logout)
- `tv` (token_version) para invalidar todos los tokens de un usuario
- Caché Redis para no consultar la DB en cada request
- Guards de rol componibles

```python
# utils/auth.py — funciones copiables
def hash_password(plain_password: str) -> str: ...
def verify_password(plain_password: str, hashed_password: str) -> bool: ...
def create_access_token(user_id, role, restaurant_id=None, token_version=0) -> str: ...

# dependencies.py — guards copiables
require_admin      = require_role("ADMIN")
require_restaurant = require_role("RESTAURANT_OWNER", "RESTAURANT_STAFF")
require_any        = require_role("ADMIN", "RESTAURANT_OWNER", "RESTAURANT_STAFF")

# Uso en cualquier endpoint
@router.post("/admin/products", dependencies=[Depends(require_admin)])
async def create_product(data: ProductCreate, db: DbSession, user=Depends(require_admin)):
    ...
```

**Payload del JWT — estructura recomendada:**
```json
{
  "sub": "42",
  "role": "RESTAURANT_OWNER",
  "restaurant_id": 7,
  "tv": 3,
  "jti": "a1b2c3d4e5...",
  "exp": 1749000000,
  "iat": 1748913600
}
```

---

### 4. Caché de usuario en Redis

`backend/app/cache.py` + fragmento de `dependencies.py`

**Por qué es útil:** patrón cache-aside que elimina consultas a la DB en requests
autenticados. La invalidación es inmediata al cambiar contraseña o desactivar usuario.

```python
# Patrón cache-aside (copiable para cualquier entidad)
cache_key = f"user:{user_id}"
cached = await cache_get(cache_key)

if cached is not None:
    return build_from_cache(cached)

# Miss: consulta BD
user = await db.execute(select(User).where(User.id == user_id))
await cache_set(cache_key, user.to_dict(), ttl=300)  # 5 min
return user

# Invalidación (al cambiar datos críticos)
await cache_delete(f"user:{user_id}")
```

---

### 5. Migraciones SQL idempotentes sin Alembic

`backend/app/db_migrate.py`

**Por qué es útil:** para proyectos pequeños/medianos donde Alembic es overhead.
Las sentencias son `IF NOT EXISTS` — re-ejecutarlas no rompe nada.
El advisory lock de PostgreSQL garantiza que solo un proceso aplica las migraciones
aunque haya múltiples workers.

```python
# Patrón de migración (copiable)
_STATEMENTS = [
    # Formato: (descripción, SQL idempotente)
    ("add user.phone", "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)"),
    ("create audit_log", """
        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            action VARCHAR(100) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """),
]

# Se llama UNA VEZ antes de arrancar uvicorn (no en el lifespan)
# CMD en Dockerfile:
# python -m app.db_migrate && uvicorn app.main:app ...
```

---

### 6. Rate Limiting en endpoints de autenticación

`backend/app/limiter.py` + uso en `routers/auth.py`

```python
# limiter.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# main.py
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# En el router
from app.limiter import limiter

@router.post("/login")
@limiter.limit("10/minute")     # máximo 10 intentos por IP por minuto
async def login(request: Request, data: LoginRequest, db: DbSession):
    ...
```

---

### 7. Paginación consistente

`backend/app/schemas/common.py`

```python
# Schema genérico reutilizable
from pydantic import BaseModel
from typing import Generic, TypeVar

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

# Uso en cualquier router
@router.get("/products", response_model=PaginatedResponse[ProductOut])
async def list_products(page: int = 1, page_size: int = 20, db: DbSession = ...):
    offset = (page - 1) * page_size
    total = await db.scalar(select(func.count()).select_from(Product))
    items = await db.scalars(select(Product).offset(offset).limit(page_size))
    return PaginatedResponse(
        items=list(items),
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )
```

---

### 8. Seguridad de cabeceras HTTP

`backend/app/main.py` — clase `SecurityHeadersMiddleware`

```python
# Copiable a cualquier app FastAPI
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Content-Security-Policy", YOUR_CSP)
        if is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
```

---

## Frontend

### 9. Wrapper de fetch con JWT

`frontend/client/app.js` — funciones `get()` y `post()`

```javascript
// Patrón copiable para cualquier app JS Vanilla con JWT
const API_URL = 'http://localhost:8000';

async function get(endpoint) {
    const res = await fetch(API_URL + endpoint, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
        logout();  // token expirado o revocado
        return null;
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function post(endpoint, body) {
    const res = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (res.status === 401) { logout(); return null; }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
```

---

### 10. Escape de HTML para prevenir XSS

`frontend/client/app.js` — función `esc()`

```javascript
// SIEMPRE usar al insertar datos del usuario en innerHTML
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// Uso correcto:
element.innerHTML = `<span>${esc(userName)}</span>`;

// Uso incorrecto (XSS):
element.innerHTML = `<span>${userName}</span>`;

// textContent no necesita escape:
element.textContent = userName;  // seguro directo
```

---

### 11. Toast de notificaciones

```javascript
// Patrón simple de toast (copiable)
function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;  // textContent — no necesita esc()
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// Uso:
toast('Pedido enviado', 'success');
toast('Error al conectar', 'error');
```

---

### 12. Service Worker con versionado para invalidar caché

`frontend/client/sw.js`

```javascript
// Patrón de Service Worker con cache versionado (copiable)
const VERSION = 'mi-app-2026-06-07';
const CACHE_NAME = `shell-${VERSION}`;

const SHELL_ASSETS = [
    '/', '/app.css', '/app.js', '/manifest.json',
    // añadir todos los archivos del shell
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
});

self.addEventListener('fetch', e => {
    // Cache-first para shell, network-first para API
    if (e.request.url.includes('/api/')) {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    } else {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    }
});
```

---

## Resumen de lo más reutilizable

| Módulo | Archivo | Impacto |
|--------|---------|---------|
| Config Pydantic con validación producción | `app/config.py` | ★★★ |
| Engine async + sesión por request | `app/database.py` | ★★★ |
| JWT + bcrypt + guards de rol | `app/utils/auth.py` + `app/dependencies.py` | ★★★ |
| Migraciones SQL idempotentes | `app/db_migrate.py` | ★★★ |
| Caché Redis cache-aside | `app/cache.py` | ★★ |
| Rate limiting slowapi | `app/limiter.py` | ★★ |
| Security headers middleware | `app/main.py` | ★★ |
| Paginación genérica | `app/schemas/common.py` | ★★ |
| Fetch wrapper con JWT | `frontend/*/app.js` | ★★★ |
| Escape HTML (XSS) | `frontend/*/app.js` `esc()` | ★★★ |
| Service Worker versionado | `frontend/client/sw.js` | ★★ |
