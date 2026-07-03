-- ============================================================
-- 061 — Idempotencia de pedidos (Fase 1 del plan offline)
-- ------------------------------------------------------------
-- Los pedidos tomados sin señal se encolan en el dispositivo y se
-- reenvían al reconectar. El dispositivo genera un client_id (UUID)
-- por pedido; la BD deduplica: reintentar N veces crea UN pedido.
--
-- · orders.client_id uuid + índice único parcial (NULL = pedidos
--   normales sin cola, sin restricción).
-- · place_order acepta p_client_id:
--     - si ya existe un pedido con ese client_id → lo devuelve tal
--       cual (con 'duplicate': true) en vez de crear otro.
--     - carrera de dos reintentos simultáneos: el índice único hace
--       fallar al segundo insert y el handler devuelve el ganador.
-- ============================================================

alter table orders add column if not exists client_id uuid;

create unique index if not exists orders_client_id_key
  on orders (client_id)
  where client_id is not null;

-- Nueva firma (parámetro extra) → hay que tirar la anterior para no dejar
-- una sobrecarga ambigua para PostgREST.
drop function if exists place_order(
  uuid, text, text, text, text, text, float8, float8, uuid,
  numeric, numeric, numeric, text, jsonb, text, numeric, numeric, uuid
);

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
  p_waiter_id      uuid    default null,
  p_client_id      uuid    default null
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
  -- Idempotencia: si este client_id ya creó un pedido, devolverlo tal cual.
  if p_client_id is not null then
    select id, order_number, public_token
      into v_order_id, v_order_number, v_token
      from orders where client_id = p_client_id;
    if found then
      return jsonb_build_object(
        'id',           v_order_id,
        'order_number', v_order_number,
        'public_token', v_token,
        'duplicate',    true
      );
    end if;
  end if;

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
    waiter_id, client_id
  ) values (
    p_restaurant_id, v_order_number, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    coalesce(p_payment_method, 'CASH'), p_cash_amount, coalesce(p_tip, 0),
    'NEW', p_subtotal, p_delivery_fee, p_total, p_notes,
    p_waiter_id, p_client_id
  )
  returning id, public_token into v_order_id, v_token;

  insert into order_items (
    order_id, product_id, name_snapshot, price_snapshot, cost_snapshot,
    quantity, subtotal, options_snapshot, is_reward, reward_id
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
    end,
    case when it ? 'is_reward' then (it->>'is_reward')::boolean else false end,
    case when it ? 'reward_id' and it->>'reward_id' is not null
         then (it->>'reward_id')::uuid else null end
  from jsonb_array_elements(p_items) as it;

  -- Descuento de stock para productos con control de inventario.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    if v_pid is null then continue; end if;

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

exception
  when unique_violation then
    -- Carrera entre dos reintentos con el mismo client_id: el bloque entero
    -- se revierte y devolvemos el pedido que ganó la carrera.
    if p_client_id is not null then
      select id, order_number, public_token
        into v_order_id, v_order_number, v_token
        from orders where client_id = p_client_id;
      if found then
        return jsonb_build_object(
          'id',           v_order_id,
          'order_number', v_order_number,
          'public_token', v_token,
          'duplicate',    true
        );
      end if;
    end if;
    raise;
end;
$$;
