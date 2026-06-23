-- ============================================================
--  Migración 041 — Lealtad / Puntos
--  ------------------------------------------------------------
--  Módulo activable en 2 niveles (ver 038). Programa de puntos:
--  el cliente acumula puntos por compra y los canjea como descuento.
--  RLS: solo service role.
--  Ejecutar DESPUÉS de 001..040.
-- ============================================================

-- ── Configuración del programa (1 por restaurante) ──────────
create table if not exists loyalty_settings (
  restaurant_id   uuid          primary key references restaurants(id) on delete cascade,
  -- Puntos ganados por cada unidad de moneda gastada (ej. 1 = 1 punto por Q1).
  earn_rate       numeric(8,4)  not null default 1,
  -- Valor en moneda de cada punto al canjear (ej. 0.10 = 1 punto vale Q0.10).
  redeem_value    numeric(8,4)  not null default 0.10,
  -- Mínimo de puntos para poder canjear.
  min_redeem      integer       not null default 100,
  -- Puntos de bienvenida al crear la cuenta.
  signup_bonus    integer       not null default 0,
  updated_at      timestamptz   not null default now()
);

alter table loyalty_settings enable row level security;

-- ── Cuenta de puntos por cliente ────────────────────────────
create table if not exists loyalty_accounts (
  id              uuid          primary key default gen_random_uuid(),
  restaurant_id   uuid          not null references restaurants(id) on delete cascade,
  customer_id     uuid          not null references customers(id) on delete cascade,
  points_balance  integer       not null default 0,
  lifetime_points integer       not null default 0,
  updated_at      timestamptz   not null default now(),
  unique (restaurant_id, customer_id)
);

create index if not exists loyalty_accounts_restaurant_idx on loyalty_accounts(restaurant_id);
alter table loyalty_accounts enable row level security;

-- ── Movimientos (ledger) ────────────────────────────────────
create table if not exists loyalty_transactions (
  id            uuid          primary key default gen_random_uuid(),
  restaurant_id uuid          not null references restaurants(id) on delete cascade,
  customer_id   uuid          not null references customers(id) on delete cascade,
  order_id      uuid          references orders(id) on delete set null,
  tipo          text          not null,                   -- EARN | REDEEM | ADJUST | SIGNUP
  points        integer       not null,                   -- + acumula, − resta
  note          text          not null default '',
  created_at    timestamptz   not null default now()
);

create index if not exists loyalty_tx_restaurant_idx on loyalty_transactions(restaurant_id, created_at desc);
create index if not exists loyalty_tx_customer_idx   on loyalty_transactions(customer_id);
alter table loyalty_transactions enable row level security;

-- ── RPC: aplica un movimiento de puntos de forma atómica ────
--  Crea la cuenta si no existe, inserta el movimiento y ajusta saldos.
--  Devuelve el nuevo saldo. Rechaza canjes que dejarían saldo negativo.
create or replace function leogin_loyalty_apply(
  p_restaurant_id uuid,
  p_customer_id   uuid,
  p_order_id      uuid,
  p_tipo          text,
  p_points        integer,
  p_note          text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  insert into loyalty_accounts (restaurant_id, customer_id)
    values (p_restaurant_id, p_customer_id)
    on conflict (restaurant_id, customer_id) do nothing;

  select points_balance into v_balance
    from loyalty_accounts
   where restaurant_id = p_restaurant_id and customer_id = p_customer_id
   for update;

  if v_balance + p_points < 0 then
    raise exception 'Puntos insuficientes (saldo %, intento %)', v_balance, p_points;
  end if;

  insert into loyalty_transactions (restaurant_id, customer_id, order_id, tipo, points, note)
    values (p_restaurant_id, p_customer_id, p_order_id, p_tipo, p_points, coalesce(p_note, ''));

  update loyalty_accounts
     set points_balance  = points_balance + p_points,
         lifetime_points = lifetime_points + greatest(p_points, 0),
         updated_at      = now()
   where restaurant_id = p_restaurant_id and customer_id = p_customer_id
   returning points_balance into v_balance;

  return v_balance;
end;
$$;
