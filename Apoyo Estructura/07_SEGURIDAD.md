# 07 — Seguridad

Resumen de todas las capas de seguridad implementadas y por qué cada una existe.

---

## Autenticación — JWT HS256

### Estructura del token

```json
{
  "sub": "42",
  "role": "RESTAURANT_OWNER",
  "restaurant_id": 7,
  "tv": 3,
  "jti": "a1b2c3d4e5f6...",
  "exp": 1749000000,
  "iat": 1748913600
}
```

| Campo | Propósito |
|-------|-----------|
| `sub` | ID del usuario (como string, convención JWT) |
| `role` | Rol para autorización sin consultar la BD |
| `restaurant_id` | Restricción de tenant (cliente solo ve sus datos) |
| `tv` | `token_version` — invalida todos los tokens al cambiar contraseña |
| `jti` | ID único del token — permite revocar este token concreto (logout) |
| `exp` | Expiración a 24 horas |

### Estrategia de revocación (doble mecanismo)

**Logout individual** → el `jti` se guarda en Redis con TTL igual al tiempo restante
del token. Si el `jti` está en la blacklist, se rechaza.

**Logout global** (cambiar contraseña, admin desactiva usuario) → se incrementa
`users.token_version`. Todos los tokens previos con `tv` antiguo quedan inválidos.

```
Request con JWT
    │
    ▼
1. Verificación criptográfica local (sin red)
2. ¿jti en blacklist Redis? → 401
3. ¿Usuario en caché Redis? → verificar is_active y token_version
4. Miss Redis → consultar PostgreSQL → guardar en caché
```

### Almacenamiento del token en el frontend

| App | Almacenamiento | Razón |
|-----|---------------|-------|
| Cliente (restaurante) | `localStorage` | PWA offline requiere persistencia entre sesiones |
| Admin | Variable JS en memoria | Desktop no necesita persistir entre recargas; más seguro ante XSS |

---

## Contraseñas — bcrypt

```python
# hash_password (backend/app/utils/auth.py)
bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))

# Límite explícito de 72 bytes
if len(password.encode("utf-8")) > 72:
    raise ValueError("Contraseña demasiado larga para bcrypt")
```

bcrypt tiene un límite interno de 72 bytes — contraseñas más largas se truncan
silenciosamente, dando una falsa sensación de seguridad. El límite se verifica
explícitamente en `hash_password` y `verify_password`.

`rounds=12` es el valor por defecto recomendado (balance seguridad/velocidad, ~0.3s por hash).

---

## Autorización — RBAC (Role-Based Access Control)

### Roles del sistema

| Rol | Acceso |
|-----|--------|
| `ADMIN` | Todo — panel admin, CRUDs completos |
| `RESTAURANT_OWNER` | Sus datos + aprobar pedidos de su staff |
| `RESTAURANT_STAFF` | Solo crear pedidos (requieren aprobación del owner) |

### Guards de rol

```python
# Definidos en app/dependencies.py
require_admin         = require_role("ADMIN")
require_restaurant    = require_role("RESTAURANT_OWNER", "RESTAURANT_STAFF")
require_any           = require_role("ADMIN", "RESTAURANT_OWNER", "RESTAURANT_STAFF")

# Uso — como dependencia del endpoint
@router.delete("/products/{id}", dependencies=[Depends(require_admin)])
async def delete_product(id: int, db: DbSession): ...

# O como dependencia que devuelve el usuario
@router.get("/orders")
async def list_orders(db: DbSession, user=Depends(require_restaurant)):
    # user.restaurant_id garantiza que solo ve sus pedidos
    ...
```

### Aislamiento de tenant (multi-restaurante)

Cada query de cliente incluye `WHERE restaurant_id = user.restaurant_id`.
El `restaurant_id` viene del JWT — el cliente nunca puede falsificarlo sin
invalidar la firma del token.

```python
# Patrón de aislamiento de tenant en routers del cliente
@router.get("/orders")
async def list_orders(db: DbSession, user=Depends(require_restaurant)):
    result = await db.execute(
        select(Order)
        .where(Order.restaurant_id == user.restaurant_id)  # ← aislamiento
        .order_by(Order.created_at.desc())
    )
```

---

## Rate Limiting

```python
# Aplicado en POST /api/auth/login
@limiter.limit("10/minute")
async def login(request: Request, ...): ...
```

10 intentos por IP por minuto. Bloquea ataques de fuerza bruta contra contraseñas.
Implementado con `slowapi` (wrapper de `limits` para FastAPI).

En producción Render puede estar detrás de un proxy — verificar que `get_remote_address`
recibe la IP real del cliente (header `X-Forwarded-For`).

---

## XSS — Cross-Site Scripting

### Regla principal: siempre `esc()` en `innerHTML`

```javascript
// MAL — XSS si restaurantName contiene <script>
element.innerHTML = `<h2>${restaurantName}</h2>`;

// BIEN — esc() escapa < > & " '
element.innerHTML = `<h2>${esc(restaurantName)}</h2>`;

// textContent es seguro sin esc()
element.textContent = restaurantName;
```

La función `esc()` en `app.js`:
```javascript
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
```

### Content-Security-Policy

Configurada en `main.py` como header HTTP en todas las respuestas:

```
default-src 'self';
script-src  'self' 'unsafe-inline' https://cdn.jsdelivr.net;
style-src   'self' 'unsafe-inline';
img-src     'self' data: blob: https:;
font-src    'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri    'self';
form-action 'self';
object-src  'none'
```

- `'unsafe-inline'` en script/style: necesario porque el HTML usa event handlers
  inline (`onclick=...`) y estilos inline. El código propio no llega desde ningún
  CDN externo, así que el riesgo es bajo.
- `https://cdn.jsdelivr.net` en script-src: permitido para Chart.js del panel admin.
  Si se añade otro CDN, actualizar aquí.
- `frame-ancestors 'none'`: equivalente a `X-Frame-Options: DENY`. Evita clickjacking.

---

## Cabeceras de seguridad HTTP

Todas las respuestas incluyen (via `SecurityHeadersMiddleware`):

| Header | Valor | Protege contra |
|--------|-------|----------------|
| `Content-Security-Policy` | Ver arriba | XSS, data injection |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Fuga de URL en referer |
| `Permissions-Policy` | `geolocation=(self), microphone=()` | Acceso a APIs del navegador |
| `Strict-Transport-Security` | `max-age=31536000` (solo producción) | Downgrade HTTPS→HTTP |

---

## CORS

```python
CORSMiddleware(
    allow_origins=settings.allowed_origins,  # lista explícita, nunca "*"
    allow_credentials=False,                 # no cookies — usa Bearer token
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
```

En producción, `ALLOWED_ORIGINS` debe contener solo el dominio real de la app.
`allow_credentials=False` es correcto porque la autenticación va en el header
`Authorization`, no en cookies.

---

## Validación de secretos al arrancar

`config.py` rechaza la app en producción si:

```python
@model_validator(mode="after")
def _check_production_secrets(self):
    if self.environment == "production":
        if not self.jwt_secret_key or self.jwt_secret_key == INSECURE_PLACEHOLDER:
            raise ValueError("JWT_SECRET_KEY no configurado")
        if len(self.jwt_secret_key) < 32:
            raise ValueError("JWT_SECRET_KEY demasiado corto")
        if self.debug:
            raise ValueError("DEBUG no puede estar activo en producción")
```

Esto convierte errores de configuración en fallos de arranque visibles,
en lugar de vulnerabilidades silenciosas en producción.

---

## Seguridad en background tasks

Las notificaciones (email, WhatsApp, push) se envían en background con `asyncio.create_task`.
La regla crítica:

```python
# MAL — la sesión DB del request se cierra antes de que la task la use
async def notify(order_id, db):  # db del request
    await send_email(...)  # puede fallar con "session closed"

# BIEN — la task abre su propia sesión
async def notify(order_id):
    async with AsyncSessionLocal() as db:  # sesión propia
        order = await db.get(Order, order_id)
        await send_email(order)
```

---

## Docker — usuario no-root

```dockerfile
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser
```

El proceso de la app corre como usuario sin privilegios. Si hay una vulnerabilidad
de ejecución de código, el atacante no obtiene acceso root al contenedor.

---

## Resumen de superficie de ataque y mitigaciones

| Amenaza | Mitigación |
|---------|------------|
| Contraseñas débiles | bcrypt rounds=12, sin límite de longitud real |
| Fuerza bruta login | Rate limit 10/min por IP |
| Tokens comprometidos | Revocación por jti (logout) y token_version (global) |
| XSS | `esc()` obligatorio en innerHTML + CSP estricto |
| CSRF | No aplica — no usa cookies de sesión |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Secrets débiles en prod | Validación en arranque (config.py) |
| SQL injection | SQLAlchemy ORM + parámetros bind (nunca f-string en SQL) |
| Acceso cross-tenant | `restaurant_id` del JWT en cada query del cliente |
| MITM | HSTS (producción) + redirect HTTPS en Render |
