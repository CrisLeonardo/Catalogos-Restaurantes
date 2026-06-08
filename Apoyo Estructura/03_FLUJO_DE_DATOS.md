# 03 — Flujo de Datos y Estado

Tres flujos principales cubren casi toda la lógica del sistema: autenticación,
lectura del catálogo y creación de un pedido. Entenderlos bien es suficiente para
extender cualquier módulo.

---

## Flujo 1 — Autenticación (Login)

```
[Usuario escribe email + contraseña]
        │
        ▼
[Frontend] POST /api/auth/login  { email, password }
        │
        ▼  (middleware: SecurityHeaders, CORS, Gzip)
[Router: auth.py → POST /api/auth/login]
        │
        │  1. Valida con schema LoginRequest (Pydantic)
        │  2. Llama auth_service.login(email, password, db)
        ▼
[auth_service.py → login()]
        │
        │  3. SELECT users WHERE email = ? (por email único)
        │  4. verify_password(plain, hashed)  — bcrypt checkpw
        │     Si falla → HTTP 401
        │  5. Incrementa intentos o limpia según resultado
        │  6. create_access_token(user_id, role, restaurant_id, token_version)
        │     → JWT firmado HS256, payload: {sub, role, restaurant_id, tv, jti, exp, iat}
        ▼
[Router devuelve] { access_token, token_type: "bearer", user: {...} }
        │
        ▼
[Frontend]
  - Cliente:  localStorage.setItem('dl_client_token', token)
  - Admin:    let token = response.access_token  (en memoria, no persistido)
```

### Flujo de validación en cada request posterior

```
[Request con Authorization: Bearer <JWT>]
        │
        ▼
[dependencies.py → get_current_user()]
        │
        │  1. Decodifica JWT localmente (sin red) — verifica firma y expiración
        │  2. Extrae jti → consulta Redis: ¿está en blacklist? → HTTP 401 si sí
        │  3. Busca user:{id} en Redis (TTL 5 min)
        │     HIT  → verifica is_active y token_version
        │     MISS → consulta PostgreSQL → guarda en Redis
        ▼
[Dependencia devuelve] _CachedUser o User ORM
        │
        ▼
[Guard de rol: require_admin / require_restaurant / require_any]
        │  Si el rol no coincide → HTTP 403
        ▼
[Handler del endpoint recibe current_user ya validado]
```

---

## Flujo 2 — Lectura del Catálogo (con precios personalizados)

```
[Usuario abre la app — o Service Worker sirve desde caché]
        │
        ▼
[Frontend] GET /api/catalog/products?category_id=&search=&page=1
           Authorization: Bearer <JWT del restaurante>
        │
        ▼
[Router: catalog.py]
        │  1. get_current_user() → verifica JWT, obtiene restaurant_id del usuario
        │  2. Pasa restaurant_id a catalog_service.list_products(...)
        ▼
[catalog_service.py → list_products()]
        │
        │  3. SELECT products JOIN categories WHERE active = true
        │     ORDER BY name, LIMIT 20 OFFSET (page-1)*20
        │
        │  4. Para cada producto:
        │     SELECT resolve_price(:product_id, :restaurant_id, CURRENT_DATE)
        │
        │     resolve_price() en PostgreSQL:
        │     ┌─────────────────────────────────────────────────────┐
        │     │  1. ¿Hay precio directo en price_list_items         │
        │     │     para una lista asignada a este restaurante?     │
        │     │     → devuelve ese precio (mayor prioridad)         │
        │     │  2. ¿Hay precio en alguna lista de precios          │
        │     │     activa asignada al restaurante?                 │
        │     │     → devuelve el de mayor prioridad                │
        │     │  3. Fallback → products.master_price               │
        │     └─────────────────────────────────────────────────────┘
        ▼
[Router devuelve] { items: [...], total, page, page_size }
        │
        ▼
[Frontend] renderiza tarjetas con precio ya resuelto
           Service Worker cachea la respuesta (catálogo disponible offline)
```

**Por qué los precios van al frontend ya resueltos:** el cliente nunca conoce el
precio de otro restaurante ni el precio maestro. La resolución ocurre en el servidor
con el contexto del JWT autenticado.

---

## Flujo 3 — Crear un Pedido (el más complejo)

```
[Usuario llena carrito y pulsa "Confirmar pedido"]
        │
        ▼
[Frontend] POST /api/orders
  {
    delivery_date: "2026-06-08",
    notes: "...",
    items: [
      { product_id: 5, quantity: 3 },
      { product_id: 12, quantity: 1 }
    ]
  }
        │
        ▼
[Router: orders.py]
        │  1. Valida con OrderCreate (Pydantic) — tipos, rangos, campo requerido
        │  2. get_current_user() → extrae restaurant_id
        │  3. Llama order_service.create_order(data, restaurant_id, db)
        ▼
[order_service.py → create_order()]
        │
        │  4. Verifica que product_id existe y está activo en BD
        │  5. SELECT generate_order_number() → "ORD-2026-00042" (función SQL)
        │
        │  6. INSERT orders (order_number, restaurant_id, status=PENDING,
        │                    delivery_date, notes, created_at)
        │
        │  7. Para cada item:
        │     a. resolve_price(product_id, restaurant_id, CURRENT_DATE)
        │        → precio congelado en este momento
        │     b. INSERT order_items (order_id, product_id, quantity,
        │                            unit_price=precio_congelado,
        │                            subtotal=qty*precio)
        │
        │  8. UPDATE orders SET
        │       subtotal = SUM(order_items.subtotal),
        │       total    = subtotal  (sin IVA en v1)
        │
        │  9. await db.commit()   ← punto de commit único
        │
        │  10. [background] notify_new_order(order_id)
        │      → abre sesión DB propia (NO reutiliza la del request)
        │      → envía email al admin + WhatsApp si configurado
        │      → Push notification al panel admin
        ▼
[Router devuelve] OrderOut (pedido completo con items y precios)
        │
        ▼
[Frontend]
  - Muestra pantalla de confirmación (#screen-confirm)
  - Limpia el carrito (localStorage)
  - Invalida caché de daily-total
```

### Flujo de aprobación (STAFF vs OWNER)

```
STAFF crea pedido
  → status = DRAFT, pending_approval = TRUE

OWNER consulta GET /api/orders/pending-approvals
  → lista de pedidos con pending_approval = TRUE del restaurante

OWNER POST /api/orders/{id}/approve
  → status → PENDING (va al distribuidor)
  → pending_approval = FALSE

OWNER POST /api/orders/{id}/reject  { reason: "..." }
  → pending_approval = FALSE
  → approval_rejection_reason = reason
  (status queda en DRAFT — puede editarse y reenviar)
```

---

## Flujo 4 — Máquina de estados de un pedido

```
DRAFT ──(OWNER aprueba)──► PENDING ──(Admin confirma)──► CONFIRMED
                                                              │
                                                              ▼
CANCELLED ◄──(Admin/Cliente cancela)──────────────── IN_PREPARATION
                                                              │
                                                              ▼
                                                          OUT_FOR_DELIVERY
                                                              │
                                                              ▼
                                                          DELIVERED
                                                              │
                                                              ▼
                                                         (puede crear reclamo)
```

Transiciones controladas en `order_service.py`. El admin puede mover hacia adelante;
el cliente puede cancelar solo desde PENDING con solicitud de cancelación.

---

## Estado en el frontend

### Cliente (app.js)

| Variable global | Tipo | Descripción |
|----------------|------|-------------|
| `token` | `string \| null` | JWT del restaurante (localStorage) |
| `cart` | `Array` | Carrito en sessionStorage (`dl_cart`) |
| `allProducts` | `Array` | Catálogo completo cacheado en memoria |
| `favoriteIds` | `Set<number>` | IDs de favoritos del restaurante |
| `storefront` | `Object` | Config de tienda (min_order, free_delivery) |
| `_dailyTotals` | `Object` | Cache temporal de totales diarios |
| `window._pickerMode` | `string` | Controla el product picker: `null`/`'recipe'`/`'recurring'` |

### Admin (app.js admin)

| Variable | Descripción |
|----------|-------------|
| `token` | JWT en memoria (no localStorage — más seguro en desktop) |
| `currentSection` | Sección activa del dashboard |
| `ordersSortMode` | Modo de ordenación de pedidos (`'recent'` / `'priority'`) |

### Service Worker (offline)

```
SHELL_ASSETS (precache al instalar):
  /, /app.css, /app.js, /pwa.js, /tailwind.css,
  /chart.min.js, /colors_and_type.css,
  /manifest.json, /assets/fonts/*.woff2,
  /assets/*.png

Runtime cache:
  /api/catalog/products → stale-while-revalidate
  /api/catalog/categories → stale-while-revalidate

Cola offline:
  POST /api/orders → indexedDB queue → sincroniza al reconectar
```
