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
