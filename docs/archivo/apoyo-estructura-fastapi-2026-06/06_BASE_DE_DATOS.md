# 06 — Base de Datos

**Motor:** PostgreSQL 15  
**ORM:** SQLAlchemy 2.0 async + asyncpg  
**Migraciones:** `app/db_migrate.py` (SQL idempotente) + `001_initial_schema.sql`

---

## Mapa de tablas (28 tablas)

```
┌─── Usuarios ──────────────────────────┐
│  restaurants                          │
│    ├── id, name, email, phone         │
│    ├── customer_type (RESTAURANTE/    │
│    │   ESCUELA)                       │
│    └── min_order_amount               │
│                                       │
│  users                                │
│    ├── id, email, full_name, password │
│    ├── role (ADMIN / RESTAURANT_OWNER │
│    │   / RESTAURANT_STAFF)            │
│    ├── restaurant_id → restaurants    │
│    ├── is_active                      │
│    └── token_version  (revocación JWT)│
└───────────────────────────────────────┘

┌─── Catálogo ───────────────────────────┐
│  categories (jerarquía parent_id)      │
│  units_of_measure (kg, lb, docena…)    │
│  products                              │
│    ├── master_price (precio base)      │
│    ├── category_id, unit_id            │
│    └── image_url, is_active            │
└────────────────────────────────────────┘

┌─── Precios personalizados ★ ──────────────────────────────────────┐
│  price_lists          (nombre, prioridad, válido desde/hasta)      │
│  price_list_items     (price_list_id, product_id, custom_price)    │
│  restaurant_price_lists (restaurant_id ↔ price_list_id)           │
│                                                                     │
│  FUNCIÓN SQL:  resolve_price(product_id, restaurant_id, date)      │
│  Cascada: precio_directo > lista_de_precios > master_price         │
└─────────────────────────────────────────────────────────────────────┘

┌─── Pedidos ────────────────────────────────────────────────────────┐
│  orders                                                             │
│    ├── order_number (ORD-2026-00042 — función SQL)                  │
│    ├── restaurant_id, status (DRAFT→DELIVERED)                      │
│    ├── subtotal, total (precio congelado al crear)                  │
│    ├── delivery_date, delivery_route_id                             │
│    ├── pending_approval + approval_rejection_reason                 │
│    └── cancellation_requested + cancellation_request_reason         │
│                                                                     │
│  order_items                                                        │
│    ├── order_id, product_id, quantity                               │
│    └── unit_price (★ CONGELADO — resolve_price al crear)            │
│                                                                     │
│  order_templates + order_template_items (plantillas reutilizables) │
│  recurring_orders + recurring_order_items (pedidos programados)     │
│  order_claims (reclamos en pedidos DELIVERED)                       │
└─────────────────────────────────────────────────────────────────────┘

┌─── Inventario ─────────────────────────────────────────────────────┐
│  inventory_movements (libro-mayor)                                  │
│    stock = SUM(quantity) de todos los movimientos                   │
│    Nunca campo mutable — siempre suma de movimientos                │
└─────────────────────────────────────────────────────────────────────┘

┌─── Facturación ─────────────────────────────────────────────────────┐
│  invoices (PROFORMA / FINAL / DELIVERY_NOTE)                        │
│    └── invoice_number (FAC-2026-00001 — función SQL)                │
│  payments                                                           │
│    └── payment_number (PAG-2026-00001 — función SQL)                │
│  payment_applications (m:n entre payment e invoice)                 │
└──────────────────────────────────────────────────────────────────────┘

┌─── Logística ─────────────────────────────────────────────────────┐
│  delivery_routes (ruta del día, vehículo, conductor)               │
│  route_orders (pedidos en la ruta, con secuencia y hora estimada)  │
└────────────────────────────────────────────────────────────────────┘

┌─── Notificaciones ───────────────────────────────────────────────────┐
│  notification_templates (EMAIL / WHATSAPP — cuerpo en Jinja2)       │
│  notifications (registro de envíos — estado: PENDING/SENT/FAILED)   │
│  push_subscriptions (endpoint VAPID por usuario)                     │
└──────────────────────────────────────────────────────────────────────┘

┌─── Otros ────────────────────────────────────────────────────────────┐
│  system_settings (tabla key-value: order_min_amount, etc.)           │
│  budgets (presupuesto mensual por restaurante con alertas)           │
│  recipes + recipe_ingredients (escandallo / calculadora de costos)   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Funciones SQL críticas

### `resolve_price(product_id, restaurant_id, date)`

La función más importante del sistema. Nunca reimplementar en Python.

```sql
-- Lógica conceptual (el SQL real está en 001_initial_schema.sql)
CREATE FUNCTION resolve_price(p_product_id INT, p_restaurant_id INT, p_date DATE)
RETURNS NUMERIC AS $$
DECLARE
    v_price NUMERIC;
BEGIN
    -- 1. Buscar precio en listas asignadas al restaurante (por prioridad DESC)
    SELECT pli.price INTO v_price
    FROM price_list_items pli
    JOIN price_lists pl ON pl.id = pli.price_list_id
    JOIN restaurant_price_lists rpl ON rpl.price_list_id = pl.id
    WHERE pli.product_id = p_product_id
      AND rpl.restaurant_id = p_restaurant_id
      AND pl.valid_from <= p_date
      AND (pl.valid_until IS NULL OR pl.valid_until >= p_date)
    ORDER BY pl.priority DESC
    LIMIT 1;

    -- 2. Fallback a precio maestro del producto
    IF v_price IS NULL THEN
        SELECT master_price INTO v_price FROM products WHERE id = p_product_id;
    END IF;

    RETURN v_price;
END;
$$ LANGUAGE plpgsql;
```

**Cómo se llama desde Python:**
```python
price = await db.scalar(
    text("SELECT resolve_price(:pid, :rid, CURRENT_DATE)"),
    {"pid": product_id, "rid": restaurant_id},
)
```

### `generate_order_number()`, `generate_invoice_number()`, `generate_payment_number()`

Generan numeración correlativa del tipo `ORD-2026-00042`, con bloqueo de tabla para
evitar duplicados bajo concurrencia. Se llaman con `SELECT generate_order_number()`.

---

## Patrón de inventario por libro-mayor

```sql
-- El stock NUNCA es un campo. Siempre se calcula así:
SELECT SUM(quantity) AS stock
FROM inventory_movements
WHERE product_id = :product_id;

-- Tipos de movimiento: ENTRADA, SALIDA, AJUSTE
-- Cada movimiento es inmutable — solo se añaden filas, nunca se editan
```

Ventajas:
- Auditabilidad completa (quién movió qué y cuándo)
- Sin race conditions (no hay UPDATE en un campo numérico)
- Historial gratuito

---

## Migraciones

### Flujo inicial (primera vez con Docker)
```
docker compose up → db arranca → 
docker-entrypoint-initdb.d/001_initial_schema.sql se aplica automáticamente
```

### Migraciones post-inicial (columnas/tablas nuevas)
Se añaden a `backend/app/db_migrate.py`:
```python
_STATEMENTS = [
    ("add orders.pending_approval",
     "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN DEFAULT FALSE"),
    
    ("create push_subscriptions",
     """CREATE TABLE IF NOT EXISTS push_subscriptions (
         id SERIAL PRIMARY KEY,
         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         endpoint TEXT NOT NULL UNIQUE,
         ...
     )"""),
]
```

El script corre con `python -m app.db_migrate` antes de arrancar uvicorn.
Usa `pg_try_advisory_lock(12345)` para que solo un proceso lo ejecute en paralelo.

---

## Índices relevantes

```sql
-- Índice compuesto para listado de pedidos por restaurante (ORDER BY created_at)
CREATE INDEX idx_orders_restaurant_created
    ON orders (restaurant_id, created_at DESC);

-- Unicidad de favoritos (un restaurante no puede marcar el mismo producto dos veces)
CREATE UNIQUE INDEX ON product_favorites (restaurant_id, product_id);

-- ENUMs nativos de PostgreSQL (no VARCHAR con CHECK)
CREATE TYPE user_role AS ENUM ('ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF');
CREATE TYPE order_status AS ENUM ('DRAFT', 'PENDING', 'CONFIRMED', ...);
```

---

## Zona horaria

La sesión de PostgreSQL se configura con `America/Guatemala` (UTC-6) en el engine:

```python
connect_args={
    "server_settings": {"timezone": "America/Guatemala"},
}
```

Esto garantiza que `now()`, `CURRENT_DATE`, `date_trunc(...)` en las consultas SQL
usen la hora local de Guatemala, evitando que los cortes diarios de reportes se
desplacen 6 horas hacia el día siguiente.

---

## Configuración del pool de conexiones

```python
engine = create_async_engine(
    database_url,
    pool_size=5,         # conexiones base mantenidas siempre abiertas
    max_overflow=5,      # adicionales bajo alta carga (total máx: 10)
    pool_pre_ping=True,  # descarta conexiones muertas antes de reutilizarlas
    pool_recycle=1800,   # recicla conexiones cada 30 min (evita timeout Supabase)
    connect_args={
        "statement_cache_size": 0,  # compatible con pgbouncer (Supabase Session Pooler)
    },
)
```

Para Supabase con Session Pooler (puerto 5432): estos valores son conservadores y
no agotan los slots disponibles en el plan gratuito.
