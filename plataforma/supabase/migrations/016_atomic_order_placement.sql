-- ============================================================
-- 016 · Colocación de pedidos atómica y transaccional
-- ------------------------------------------------------------
-- Corrige dos riesgos de la ruta de pedidos:
--
--  C1) `generate_order_number` usaba `count(*)+1`: dos pedidos
--      simultáneos del mismo restaurante obtenían el MISMO número
--      (sin índice único que lo delatara).
--  C2) El server action insertaba `orders` y luego `order_items`
--      en dos llamadas separadas: si la segunda fallaba, quedaba
--      un pedido huérfano sin ítems (y el push ya se había disparado).
--
-- Solución: un contador atómico por (restaurante, año) + un RPC
-- `place_order` que numera, inserta pedido e ítems en UNA sola
-- función (= una transacción: si algo falla, rollback completo).
-- ============================================================

-- ── 1. Contador atómico por restaurante y año ──────────────────
create table if not exists order_counters (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  year          int  not null,
  last_number   int  not null default 0,
  primary key (restaurant_id, year)
);

alter table order_counters enable row level security;  -- solo service role

-- Backfill: arranca el contador desde el conteo existente por año, para
-- continuar la numeración sin colisionar con pedidos ya creados.
insert into order_counters (restaurant_id, year, last_number)
select restaurant_id,
       date_part('year', created_at at time zone 'UTC')::int as yr,
       count(*)
from orders
group by restaurant_id, date_part('year', created_at at time zone 'UTC')
on conflict (restaurant_id, year) do nothing;

-- ── 2. RPC transaccional ───────────────────────────────────────
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

  -- Numeración atómica: el UPDATE ... RETURNING serializa los incrementos
  -- concurrentes (toma lock de fila), así que nunca se repite el número.
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
    order_id, product_id, name_snapshot, price_snapshot, quantity, subtotal, options_snapshot
  )
  select
    v_order_id,
    (it->>'product_id')::uuid,
    it->>'name_snapshot',
    (it->>'price_snapshot')::numeric,
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

-- Nota: `generate_order_number` (mig. 005) queda obsoleta tras esto; se deja
-- por compatibilidad pero el server action ya no la usa.
--
-- Opcional (ejecutar tras deduplicar números históricos, si los hubiera):
--   create unique index orders_restaurant_number_idx
--     on orders(restaurant_id, order_number);
