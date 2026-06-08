-- ============================================================
--  FASE 4 — Pedidos en línea (Plan 2 Premium)
--  Tablas: orders + order_items
--  RLS + función de numeración correlativa
-- ============================================================

-- Tabla principal de pedidos
create table if not exists orders (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  order_number   text          not null,
  customer_name  text          not null,
  customer_phone text          not null,
  order_type     text          not null check (order_type in ('PICKUP', 'DELIVERY')),
  address        text,
  payment_method text          not null default 'CASH',
  status         text          not null default 'NEW'
                               check (status in ('NEW','PREP','READY','TRANSIT','DELIVERED','CANCEL')),
  subtotal       numeric(10,2) not null,
  total          numeric(10,2) not null,
  notes          text,
  created_at     timestamptz   not null default now()
);

-- Items con precios CONGELADOS al momento del pedido
create table if not exists order_items (
  id             uuid          primary key default gen_random_uuid(),
  order_id       uuid          not null references orders(id) on delete cascade,
  product_id     uuid          references products(id) on delete set null,
  name_snapshot  text          not null,
  price_snapshot numeric(10,2) not null,
  quantity       int           not null check (quantity > 0),
  subtotal       numeric(10,2) not null
);

-- Índices de rendimiento
create index if not exists orders_restaurant_created_idx on orders(restaurant_id, created_at desc);
create index if not exists orders_status_idx             on orders(restaurant_id, status);
create index if not exists order_items_order_idx         on order_items(order_id);

-- Numeración correlativa por restaurante y año: ORD-2026-00001
create or replace function generate_order_number(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_year  text;
begin
  v_year := to_char(now() at time zone 'UTC', 'YYYY');
  select coalesce(count(*), 0) + 1 into v_count
  from orders
  where restaurant_id = p_restaurant_id
    and date_part('year', created_at at time zone 'UTC') = date_part('year', now() at time zone 'UTC');
  return 'ORD-' || v_year || '-' || lpad(v_count::text, 5, '0');
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────

alter table orders      enable row level security;
alter table order_items enable row level security;

-- Cualquier visitante puede crear un pedido (cliente anónimo)
create policy "anon insert orders"
  on orders for insert
  with check (true);

-- Staff lee sus propios pedidos; Super Admin lee todos
create policy "staff read own orders"
  on orders for select
  using (
    restaurant_id = (
      select restaurant_id from profiles
      where id = auth.uid()
        and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'SUPER_ADMIN'
    )
  );

-- Solo staff/super_admin pueden cambiar el estado
create policy "staff update own orders"
  on orders for update
  using (
    restaurant_id = (
      select restaurant_id from profiles
      where id = auth.uid()
        and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'SUPER_ADMIN'
    )
  )
  with check (true);

-- Items: cualquiera inserta (misma sesión que el pedido)
create policy "anon insert order_items"
  on order_items for insert
  with check (true);

-- Items: solo quien puede leer el pedido puede ver sus items
create policy "staff read own order_items"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (
          o.restaurant_id = (
            select restaurant_id from profiles
            where id = auth.uid()
              and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
          )
          or exists (
            select 1 from profiles
            where id = auth.uid() and role = 'SUPER_ADMIN'
          )
        )
    )
  );

-- ── NOTA PARA ACTIVAR REALTIME ──────────────────────────────
-- En el dashboard de Supabase: Database → Replication → Supabase Realtime
-- Activar la tabla `orders` para que el panel admin reciba notificaciones
-- en tiempo real sin necesidad de recargar la página.
