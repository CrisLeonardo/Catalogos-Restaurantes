-- ============================================================
--  Migración 030 — Meseros
--  · profiles: nuevo rol RESTAURANT_WAITER
--  · orders: columna waiter_id (FK → profiles, nullable)
--  · RLS: meseros pueden leer/actualizar pedidos de su restaurante
--  · place_order: acepta p_waiter_id opcional
-- ============================================================

-- ── 1. Nuevo rol RESTAURANT_WAITER ─────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in (
    'SUPER_ADMIN', 'RESTAURANT_OWNER',
    'RESTAURANT_STAFF', 'GROUP_OWNER',
    'RESTAURANT_WAITER'
  ));

comment on column profiles.role is
  'SUPER_ADMIN = Leogin; RESTAURANT_OWNER = dueño del restaurante; '
  'RESTAURANT_STAFF = cajero/admin con permisos; '
  'RESTAURANT_WAITER = mesero (solo toma pedidos desde /admin/mesero); '
  'GROUP_OWNER = dueño de grupo multi-sucursal.';

-- ── 2. Columna waiter_id en orders ─────────────────────────
alter table orders
  add column if not exists waiter_id uuid
    references profiles(id) on delete set null;

comment on column orders.waiter_id is
  'Mesero que tomó el pedido. NULL = pedido online del cliente.';

create index if not exists orders_waiter_id_idx on orders(waiter_id);

-- ── 3. RLS: incluir RESTAURANT_WAITER en lectura/actualización de pedidos
-- Las políticas actuales solo cubren RESTAURANT_OWNER y RESTAURANT_STAFF.
-- Los meseros necesitan: leer sus propios pedidos (para Realtime en /mesero)
-- y actualizar el estado (control total = igual que cajero).

-- orders SELECT
drop policy if exists "staff read own orders" on orders;
create policy "staff read own orders"
  on orders for select
  using (
    restaurant_id = (
      select restaurant_id from profiles
      where id = auth.uid()
        and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'SUPER_ADMIN'
    )
  );

-- orders UPDATE
drop policy if exists "staff update own orders" on orders;
create policy "staff update own orders"
  on orders for update
  using (
    restaurant_id = (
      select restaurant_id from profiles
      where id = auth.uid()
        and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'SUPER_ADMIN'
    )
  )
  with check (true);

-- order_items SELECT
drop policy if exists "staff read own order_items" on order_items;
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
              and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')
          )
          or exists (
            select 1 from profiles
            where id = auth.uid() and role = 'SUPER_ADMIN'
          )
        )
    )
  );

-- ── 4. place_order actualizado con p_waiter_id opcional ───
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
  p_items          jsonb,
  p_payment_method text    default 'CASH',
  p_cash_amount    numeric default null,
  p_tip            numeric default 0,
  p_waiter_id      uuid    default null
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
    payment_method, cash_amount, tip, status, subtotal, delivery_fee, total, notes,
    waiter_id
  ) values (
    p_restaurant_id, v_order_number, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    coalesce(p_payment_method, 'CASH'), p_cash_amount, coalesce(p_tip, 0),
    'NEW', p_subtotal, p_delivery_fee, p_total, p_notes,
    p_waiter_id
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
