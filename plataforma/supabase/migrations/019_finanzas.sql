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
