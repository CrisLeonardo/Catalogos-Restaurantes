-- ============================================================
--  ACTUALIZACIÓN Admin Pro + Grupos — migraciones 019 a 024
--  Pega TODO este archivo en el SQL Editor de Supabase (nube)
--  y dale Run. Es idempotente: si ya corriste alguna parte,
--  no pasa nada por volver a ejecutarla.
--  Requiere tener aplicadas antes las migraciones 001..018.
-- ============================================================


-- ░░░░░░░░░░ migrations/019_finanzas.sql ░░░░░░░░░░

-- ============================================================
--  Migración 019 — Finanzas y rentabilidad (Fase A · Admin Pro)
--  · products:     costo del producto (para margen/utilidad)
--  · order_items:  costo CONGELADO al vender (margen histórico real)
--  · cash_counts:  cortes de caja diarios (esperado vs. contado)
--  · place_order:  guarda el cost_snapshot que manda el server action
--  Ejecutar DESPUÉS de 001..018 en el SQL Editor de Supabase.
-- ============================================================

-- ── Products: costo ─────────────────────────────────────────
alter table products
  add column if not exists cost numeric(10,2);

comment on column products.cost is
  'Costo del producto para el restaurante. Margen = price - cost. '
  'NULL = sin costo capturado (no se calcula utilidad para ese producto).';

-- ── Order items: costo congelado al momento de la venta ─────
alter table order_items
  add column if not exists cost_snapshot numeric(10,2);

comment on column order_items.cost_snapshot is
  'Costo del producto congelado al vender. La utilidad histórica no cambia '
  'aunque luego se edite products.cost. NULL = no había costo capturado.';

-- ── Cortes de caja ──────────────────────────────────────────
create table if not exists cash_counts (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  business_date  date          not null,
  opening_float  numeric(10,2) not null default 0,   -- fondo inicial de caja
  expected_cash  numeric(10,2) not null default 0,   -- efectivo esperado (snapshot de ventas en efectivo del día)
  counted_cash   numeric(10,2) not null default 0,   -- efectivo realmente contado
  difference     numeric(10,2) not null default 0,   -- contado - (fondo + esperado)
  by_method      jsonb,                              -- desglose por método de pago del día: { "CASH": x, ... }
  notes          text,
  created_by     uuid,                               -- profile.id de quien cerró la caja
  created_at     timestamptz   not null default now()
);

comment on table cash_counts is
  'Cortes de caja del restaurante (puede haber varios por día = turnos). '
  'expected_cash y by_method son un snapshot del día al momento del corte.';

create index if not exists cash_counts_restaurant_date_idx
  on cash_counts(restaurant_id, business_date desc);

-- RLS: sin políticas a propósito — todo el acceso pasa por server actions
-- (service role) que validan el rol del usuario autenticado.
alter table cash_counts enable row level security;

-- ── place_order: congelar el costo por ítem ─────────────────
-- Misma firma que la migración 016 (el costo viaja DENTRO de p_items),
-- así que no cambia el contrato del RPC; solo persiste cost_snapshot.
create or replace function place_order(
  p_restaurant_id  uuid,
  p_customer_name  text,
  p_customer_phone text,
  p_order_type     text,
  p_address        text,
  p_delivery_zone  text,
  p_delivery_lat   float8,
  p_delivery_lng   float8,
  p_customer_id    uuid,
  p_subtotal       numeric,
  p_delivery_fee   numeric,
  p_total          numeric,
  p_notes          text,
  p_items          jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_int     int;
  v_num          int;
  v_order_number text;
  v_order_id     uuid;
  v_token        uuid;
begin
  v_year_int := date_part('year', now() at time zone 'UTC')::int;

  insert into order_counters (restaurant_id, year, last_number)
  values (p_restaurant_id, v_year_int, 1)
  on conflict (restaurant_id, year)
  do update set last_number = order_counters.last_number + 1
  returning last_number into v_num;

  v_order_number := 'ORD-' || v_year_int::text || '-' || lpad(v_num::text, 5, '0');

  insert into orders (
    restaurant_id, order_number, customer_name, customer_phone, order_type,
    address, delivery_zone, delivery_lat, delivery_lng, customer_id,
    payment_method, status, subtotal, delivery_fee, total, notes
  ) values (
    p_restaurant_id, v_order_number, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    'CASH', 'NEW', p_subtotal, p_delivery_fee, p_total, p_notes
  )
  returning id, public_token into v_order_id, v_token;

  insert into order_items (
    order_id, product_id, name_snapshot, price_snapshot, cost_snapshot,
    quantity, subtotal, options_snapshot
  )
  select
    v_order_id,
    (it->>'product_id')::uuid,
    it->>'name_snapshot',
    (it->>'price_snapshot')::numeric,
    case when it ? 'cost_snapshot' and it->>'cost_snapshot' is not null
         then (it->>'cost_snapshot')::numeric else null end,
    (it->>'quantity')::int,
    (it->>'subtotal')::numeric,
    case
      when it->'options_snapshot' is null or it->'options_snapshot' = 'null'::jsonb
      then null
      else it->'options_snapshot'
    end
  from jsonb_array_elements(p_items) as it;

  return jsonb_build_object(
    'id',           v_order_id,
    'order_number', v_order_number,
    'public_token', v_token
  );
end;
$$;

-- ░░░░░░░░░░ migrations/020_order_timestamps.sql ░░░░░░░░░░

-- ============================================================
--  Migración 020 — Marcas de tiempo de estado del pedido (Fase B)
--  Para analítica: tiempo de preparación y de entrega, y para
--  saber cuándo se canceló. Se sellan en updateOrderStatus.
--  Ejecutar DESPUÉS de 001..019.
-- ============================================================

alter table orders
  add column if not exists accepted_at  timestamptz,  -- pasó a PREP (cocina aceptó)
  add column if not exists ready_at      timestamptz, -- pasó a READY (listo)
  add column if not exists delivered_at  timestamptz, -- pasó a DELIVERED (entregado)
  add column if not exists cancelled_at  timestamptz; -- pasó a CANCEL

comment on column orders.accepted_at is 'Cuándo el pedido pasó a PREP (inicio de preparación).';
comment on column orders.ready_at     is 'Cuándo el pedido pasó a READY (listo).';
comment on column orders.delivered_at is 'Cuándo el pedido pasó a DELIVERED (entregado/cerrado).';
comment on column orders.cancelled_at is 'Cuándo el pedido pasó a CANCEL.';

-- ░░░░░░░░░░ migrations/021_inventario.sql ░░░░░░░░░░

-- ============================================================
--  Migración 021 — Inventario / control de stock (Fase C)
--  · products:        track_stock, stock, low_stock_threshold
--  · stock_movements: bitácora de movimientos de inventario
--  · place_order:     descuenta stock con guardia anti-sobreventa
--                     y auto-agota (is_available=false) al llegar a 0
--  · restock_order:   devuelve stock al cancelar un pedido
--  Ejecutar DESPUÉS de 001..020.
-- ============================================================

-- ── Products: campos de inventario ──────────────────────────
alter table products
  add column if not exists track_stock         boolean not null default false,
  add column if not exists stock               int,
  add column if not exists low_stock_threshold int not null default 0;

comment on column products.track_stock is
  'true = el restaurante controla existencias de este producto (descuenta al vender).';
comment on column products.stock is
  'Unidades disponibles. Solo aplica si track_stock = true.';
comment on column products.low_stock_threshold is
  'Umbral para alertar "stock bajo" (stock <= umbral y > 0).';

-- ── Bitácora de movimientos de inventario ───────────────────
create table if not exists stock_movements (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  product_id    uuid        references products(id) on delete set null,
  delta         int         not null,          -- negativo = salida, positivo = entrada
  reason        text        not null,          -- 'sale' | 'cancel' | 'adjust' | 'set'
  balance_after int,                            -- stock resultante tras el movimiento
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists stock_movements_restaurant_idx
  on stock_movements(restaurant_id, created_at desc);

-- RLS sin políticas: acceso solo por server actions (service role).
alter table stock_movements enable row level security;

-- ── place_order: descuento de stock atómico ─────────────────
-- Misma firma; añade el descuento de stock con guardia anti-sobreventa
-- DENTRO de la transacción del pedido (si falta stock → rollback total).
create or replace function place_order(
  p_restaurant_id  uuid,
  p_customer_name  text,
  p_customer_phone text,
  p_order_type     text,
  p_address        text,
  p_delivery_zone  text,
  p_delivery_lat   float8,
  p_delivery_lng   float8,
  p_customer_id    uuid,
  p_subtotal       numeric,
  p_delivery_fee   numeric,
  p_total          numeric,
  p_notes          text,
  p_items          jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_int     int;
  v_num          int;
  v_order_number text;
  v_order_id     uuid;
  v_token        uuid;
  v_item         jsonb;
  v_pid          uuid;
  v_qty          int;
  v_track        boolean;
  v_stock        int;
  v_pname        text;
  v_new          int;
begin
  v_year_int := date_part('year', now() at time zone 'UTC')::int;

  insert into order_counters (restaurant_id, year, last_number)
  values (p_restaurant_id, v_year_int, 1)
  on conflict (restaurant_id, year)
  do update set last_number = order_counters.last_number + 1
  returning last_number into v_num;

  v_order_number := 'ORD-' || v_year_int::text || '-' || lpad(v_num::text, 5, '0');

  insert into orders (
    restaurant_id, order_number, customer_name, customer_phone, order_type,
    address, delivery_zone, delivery_lat, delivery_lng, customer_id,
    payment_method, status, subtotal, delivery_fee, total, notes
  ) values (
    p_restaurant_id, v_order_number, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    'CASH', 'NEW', p_subtotal, p_delivery_fee, p_total, p_notes
  )
  returning id, public_token into v_order_id, v_token;

  insert into order_items (
    order_id, product_id, name_snapshot, price_snapshot, cost_snapshot,
    quantity, subtotal, options_snapshot
  )
  select
    v_order_id,
    (it->>'product_id')::uuid,
    it->>'name_snapshot',
    (it->>'price_snapshot')::numeric,
    case when it ? 'cost_snapshot' and it->>'cost_snapshot' is not null
         then (it->>'cost_snapshot')::numeric else null end,
    (it->>'quantity')::int,
    (it->>'subtotal')::numeric,
    case
      when it->'options_snapshot' is null or it->'options_snapshot' = 'null'::jsonb
      then null
      else it->'options_snapshot'
    end
  from jsonb_array_elements(p_items) as it;

  -- Descuento de stock para productos con control de inventario.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    select track_stock, stock, name into v_track, v_stock, v_pname
      from products where id = v_pid and restaurant_id = p_restaurant_id
      for update;

    if coalesce(v_track, false) then
      if coalesce(v_stock, 0) < v_qty then
        raise exception 'Sin stock suficiente de %', coalesce(v_pname, 'un producto')
          using errcode = 'P0001';
      end if;
      update products set
        stock          = stock - v_qty,
        is_available   = case when stock - v_qty <= 0 then false else is_available end,
        unavailable_at = case when stock - v_qty <= 0 then now() else unavailable_at end
      where id = v_pid
      returning stock into v_new;

      insert into stock_movements (restaurant_id, product_id, delta, reason, balance_after)
      values (p_restaurant_id, v_pid, -v_qty, 'sale', v_new);
    end if;
  end loop;

  return jsonb_build_object(
    'id',           v_order_id,
    'order_number', v_order_number,
    'public_token', v_token
  );
end;
$$;

-- ── restock_order: devolver stock al cancelar ───────────────
-- Idempotente: si el pedido ya está CANCEL (o no existe), no hace nada.
-- Debe llamarse ANTES de marcar el pedido como CANCEL.
create or replace function restock_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_rid    uuid;
  r        record;
  v_new    int;
begin
  select status, restaurant_id into v_status, v_rid from orders where id = p_order_id;
  if v_status is null or v_status = 'CANCEL' then
    return;  -- inexistente o ya cancelado → no doble-restock
  end if;

  for r in
    select oi.product_id as pid, oi.quantity as qty
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.track_stock = true
  loop
    update products set
      stock          = coalesce(stock, 0) + r.qty,
      is_available   = case when coalesce(stock, 0) <= 0 then true else is_available end,
      unavailable_at = case when coalesce(stock, 0) <= 0 then null else unavailable_at end
    where id = r.pid
    returning stock into v_new;

    insert into stock_movements (restaurant_id, product_id, delta, reason, balance_after)
    values (v_rid, r.pid, r.qty, 'cancel', v_new);
  end loop;
end;
$$;

-- ░░░░░░░░░░ migrations/022_promociones.sql ░░░░░░░░░░

-- ============================================================
--  Migración 022 — Promociones / cupones (Fase D)
--  · promotions: descuentos a nivel de pedido (%, monto, envío gratis)
--  · orders:     descuento aplicado + promo usada (snapshot)
--  El total ya viene descontado desde el server action; estas columnas
--  son la metadata para reportes y recibos.
--  Ejecutar DESPUÉS de 001..021.
-- ============================================================

create table if not exists promotions (
  id            uuid          primary key default gen_random_uuid(),
  restaurant_id uuid          not null references restaurants(id) on delete cascade,
  name          text          not null,
  kind          text          not null check (kind in ('PERCENT', 'AMOUNT', 'FREE_DELIVERY')),
  value         numeric(10,2) not null default 0,   -- % (0-100) o monto; ignora en FREE_DELIVERY
  code          text,                                -- NULL = se aplica automático; con código = cupón
  min_order     numeric(10,2) not null default 0,    -- subtotal mínimo para aplicar
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean       not null default true,
  usage_limit   int,                                 -- NULL = sin límite
  used_count    int           not null default 0,
  created_at    timestamptz   not null default now()
);

comment on table promotions is
  'Promociones a nivel de pedido. code NULL = automática; con code = cupón que el '
  'cliente escribe en el checkout. La validación autoritativa es server-side.';

create index if not exists promotions_restaurant_idx on promotions(restaurant_id, active);
-- Código único por restaurante (cuando tiene código).
create unique index if not exists promotions_restaurant_code_idx
  on promotions(restaurant_id, lower(code)) where code is not null;

-- RLS sin políticas: acceso por server actions (service role) que validan rol.
alter table promotions enable row level security;

-- ── Orders: descuento aplicado + promo (snapshot) ───────────
alter table orders
  add column if not exists discount   numeric(10,2) not null default 0,
  add column if not exists promo_id    uuid references promotions(id) on delete set null,
  add column if not exists promo_code  text;

comment on column orders.discount is 'Descuento aplicado al pedido (>= 0). total = subtotal + envío - descuento.';

-- Incremento atómico del contador de usos de una promo (lo llama createOrder).
create or replace function increment_promo_usage(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update promotions set used_count = used_count + 1 where id = p_id;
$$;

-- ░░░░░░░░░░ migrations/023_personal.sql ░░░░░░░░░░

-- ============================================================
--  Migración 023 — Personal (permisos) + bitácora de actividad
--  · profiles.permissions: secciones del panel a las que accede
--    el staff (NULL = todas, para dueños).
--  · activity_log: registro de acciones clave del panel.
--  Ejecutar DESPUÉS de 001..022.
-- ============================================================

alter table profiles
  add column if not exists permissions jsonb;

comment on column profiles.permissions is
  'Secciones permitidas para RESTAURANT_STAFF: ["pedidos","inventario",...]. '
  'NULL = todas (dueños / super admin).';

create table if not exists activity_log (
  id            bigint      generated always as identity primary key,
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  actor_id      uuid,
  action        text        not null,   -- 'order_status' | 'product' | 'stock' | 'promo' | 'staff' | ...
  entity        text,                    -- descripción corta (nombre/numero)
  meta          jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_restaurant_idx
  on activity_log(restaurant_id, created_at desc);

-- RLS sin políticas: acceso por server actions (service role) que validan rol.
alter table activity_log enable row level security;

-- ░░░░░░░░░░ migrations/024_grupos.sql ░░░░░░░░░░

-- ============================================================
--  Migración 024 — Grupos / cadenas multi-sucursal (Fase E)
--  · organizations: el "grupo" dueño de varias sucursales.
--  · restaurants.organization_id: a qué grupo pertenece (NULL = independiente).
--  · profiles.organization_id + rol GROUP_OWNER: el jefe del grupo.
--  Subdominio del panel del grupo: slug-central.dominio (ver tenant.ts/proxy.ts).
--  Ejecutar DESPUÉS de 001..023.
-- ============================================================

create table if not exists organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        unique not null,
  logo_url      text,
  color_primary text        not null default '#D97757',
  contact_email text,
  created_at    timestamptz not null default now()
);

comment on table organizations is
  'Grupo/cadena dueño de varias sucursales (restaurants). El jefe (GROUP_OWNER) '
  'monitorea todas desde slug-central.dominio.';

alter table organizations enable row level security; -- sin políticas: solo service role

-- ── Restaurants: a qué grupo pertenecen ─────────────────────
alter table restaurants
  add column if not exists organization_id uuid references organizations(id) on delete set null;

create index if not exists restaurants_organization_idx on restaurants(organization_id);

comment on column restaurants.organization_id is
  'Grupo dueño de esta sucursal. NULL = restaurante independiente.';

-- ── Profiles: dueño de grupo ────────────────────────────────
alter table profiles
  add column if not exists organization_id uuid references organizations(id) on delete set null;

-- Añadir GROUP_OWNER al check de roles (recrea la restricción).
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'GROUP_OWNER'));

comment on column profiles.organization_id is
  'Para GROUP_OWNER: el grupo que administra (ve todas sus sucursales).';
