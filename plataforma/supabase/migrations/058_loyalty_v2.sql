-- ============================================================
--  Migración 058 — Lealtad v2: catálogo de recompensas,
--  puntos por producto y enlace de cuenta (Google) ↔ cliente
--  ------------------------------------------------------------
--  Construye sobre 041 (lealtad) y 042 (canje como descuento).
--  Novedades:
--   · products.loyalty_points   → puntos que otorga cada producto
--     (NULL = usar la regla general earn_rate × subtotal de línea).
--   · customers.auth_user_id    → enlaza la cuenta de Supabase (Google)
--     con el cliente que la lealtad lleva por teléfono. 1:1 por
--     restaurante: el enlace "sigue" al último teléfono del usuario.
--   · loyalty_rewards           → catálogo de productos canjeables por
--     puntos (estilo McDonald's). Costo, stock y límite por cliente.
--   · loyalty_transactions.reward_id + order_items.is_reward/reward_id
--     → trazabilidad del canje. El ítem va a cocina como cualquier otro
--     pero con precio Q0 y marcado como canje.
--   · RPC leogin_loyalty_redeem_reward → canje atómico y autoritativo.
--  RLS: solo service role (igual que el resto de la lealtad).
--  Ejecutar DESPUÉS de 001..057.
-- ============================================================

-- ── 1. Puntos por producto ──────────────────────────────────
alter table products
  add column if not exists loyalty_points integer;

comment on column products.loyalty_points is
  'Puntos de lealtad que otorga UNA unidad de este producto al comprarse. '
  'NULL = usar la regla general del restaurante (earn_rate × subtotal de línea). '
  '0 = no otorga puntos.';

-- ── 2. Enlace cuenta (Google) ↔ cliente ─────────────────────
alter table customers
  add column if not exists auth_user_id uuid;

comment on column customers.auth_user_id is
  'Usuario de Supabase Auth (p. ej. login con Google) enlazado a este '
  'cliente. La lealtad se lleva por teléfono; este enlace permite ver y '
  'canjear puntos desde cualquier dispositivo con la sesión iniciada.';

-- 1:1 por restaurante. upsert_customer reasigna el enlace al último
-- teléfono, así que nunca colisiona (limpia el enlace previo primero).
create unique index if not exists customers_restaurant_authuser_idx
  on customers(restaurant_id, auth_user_id)
  where auth_user_id is not null;

-- ── 3. Ajustes: interruptor del catálogo de recompensas ─────
alter table loyalty_settings
  add column if not exists rewards_enabled boolean not null default true;

comment on column loyalty_settings.rewards_enabled is
  'Si el catálogo de recompensas (canje por productos) se muestra en el menú. '
  'El canje como descuento en Q (migración 042) es independiente.';

-- ── 4. Catálogo de recompensas ──────────────────────────────
create table if not exists loyalty_rewards (
  id                 uuid          primary key default gen_random_uuid(),
  restaurant_id      uuid          not null references restaurants(id) on delete cascade,
  -- Producto del menú que se entrega como recompensa. NULL = recompensa
  -- "suelta" descrita solo con title/description (no está en el menú).
  product_id         uuid          references products(id) on delete set null,
  title              text          not null,
  description        text,
  image_url          text,
  points_cost        integer       not null check (points_cost > 0),
  active             boolean       not null default true,
  sort_order         integer       not null default 0,
  -- Inventario opcional de la recompensa. NULL = ilimitado.
  stock              integer,
  -- Máximo de canjes por cliente. NULL = ilimitado.
  per_customer_limit integer,
  created_at         timestamptz   not null default now()
);

create index if not exists loyalty_rewards_restaurant_idx
  on loyalty_rewards(restaurant_id, active, sort_order);

alter table loyalty_rewards enable row level security;

-- ── 5. Trazabilidad del canje ───────────────────────────────
alter table loyalty_transactions
  add column if not exists reward_id uuid references loyalty_rewards(id) on delete set null;

alter table order_items
  add column if not exists is_reward boolean not null default false,
  add column if not exists reward_id uuid;  -- referencia suave (la recompensa puede borrarse)

comment on column order_items.is_reward is
  'true = este ítem se entregó como canje de puntos de lealtad (precio Q0).';

-- ── 6. RPC: canje de recompensa (atómico y autoritativo) ────
--  Valida que la recompensa esté activa, con stock y dentro del límite por
--  cliente, y que el saldo alcance el costo. Inserta el movimiento, descuenta
--  el saldo y baja el stock. Devuelve el nuevo saldo. Lanza si algo no cuadra.
create or replace function leogin_loyalty_redeem_reward(
  p_restaurant_id uuid,
  p_customer_id   uuid,
  p_reward_id     uuid,
  p_order_id      uuid
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cost    integer;
  v_active  boolean;
  v_stock   integer;
  v_limit   integer;
  v_used    integer;
  v_balance integer;
  v_title   text;
begin
  select points_cost, active, stock, per_customer_limit, title
    into v_cost, v_active, v_stock, v_limit, v_title
    from loyalty_rewards
   where id = p_reward_id and restaurant_id = p_restaurant_id
   for update;

  if not found or not v_active then
    raise exception 'Esta recompensa ya no está disponible.';
  end if;

  if v_stock is not null and v_stock <= 0 then
    raise exception 'Recompensa agotada.';
  end if;

  if v_limit is not null then
    select count(*) into v_used
      from loyalty_transactions
     where customer_id = p_customer_id
       and reward_id = p_reward_id
       and tipo = 'REDEEM_REWARD';
    if v_used >= v_limit then
      raise exception 'Ya alcanzaste el máximo de canjes de esta recompensa.';
    end if;
  end if;

  insert into loyalty_accounts (restaurant_id, customer_id)
    values (p_restaurant_id, p_customer_id)
    on conflict (restaurant_id, customer_id) do nothing;

  select points_balance into v_balance
    from loyalty_accounts
   where restaurant_id = p_restaurant_id and customer_id = p_customer_id
   for update;

  if coalesce(v_balance, 0) < v_cost then
    raise exception 'Puntos insuficientes (saldo %, costo %).', coalesce(v_balance, 0), v_cost;
  end if;

  insert into loyalty_transactions (restaurant_id, customer_id, order_id, reward_id, tipo, points, note)
    values (p_restaurant_id, p_customer_id, p_order_id, p_reward_id, 'REDEEM_REWARD', -v_cost,
            'Canje: ' || coalesce(v_title, 'recompensa'));

  update loyalty_accounts
     set points_balance = points_balance - v_cost,
         updated_at = now()
   where restaurant_id = p_restaurant_id and customer_id = p_customer_id
   returning points_balance into v_balance;

  if v_stock is not null then
    update loyalty_rewards set stock = greatest(0, stock - 1) where id = p_reward_id;
  end if;

  return v_balance;
end;
$$;

-- ── 7. upsert_customer: ahora acepta el enlace de cuenta ────
--  Cambia la firma → drop + create. El enlace es 1:1 por restaurante: antes
--  de asignarlo, lo limpia de cualquier otro cliente para no chocar con el
--  índice único (el usuario que cambia de teléfono "mueve" su cuenta).
drop function if exists upsert_customer(uuid, text, text, text, text, numeric);

create function upsert_customer(
  p_restaurant_id uuid,
  p_name          text,
  p_phone         text,
  p_address       text,
  p_zone          text,
  p_total         numeric,
  p_auth_user_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Mantener el enlace de cuenta 1:1: si este usuario estaba enlazado a otro
  -- cliente (otro teléfono), suéltalo antes de reasignarlo aquí.
  if p_auth_user_id is not null then
    update customers
       set auth_user_id = null
     where restaurant_id = p_restaurant_id
       and auth_user_id = p_auth_user_id;
  end if;

  insert into customers (
    restaurant_id, name, phone, default_address, default_zone,
    total_orders, total_spent, first_order_at, last_order_at, auth_user_id
  )
  values (
    p_restaurant_id, p_name, p_phone, nullif(p_address, ''), nullif(p_zone, ''),
    1, coalesce(p_total, 0), now(), now(), p_auth_user_id
  )
  on conflict (restaurant_id, phone) do update set
    name            = excluded.name,
    default_address = coalesce(excluded.default_address, customers.default_address),
    default_zone    = coalesce(excluded.default_zone, customers.default_zone),
    total_orders    = customers.total_orders + 1,
    total_spent     = customers.total_spent + coalesce(p_total, 0),
    first_order_at  = coalesce(customers.first_order_at, now()),
    last_order_at   = now(),
    auth_user_id    = coalesce(excluded.auth_user_id, customers.auth_user_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── 8. place_order: arrastra is_reward / reward_id por ítem ──
--  Igual que en 030 pero los order_items pueden marcarse como canje. El
--  descuento de stock se mantiene también para los canjes (se entrega una
--  unidad real del inventario).
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
end;
$$;
