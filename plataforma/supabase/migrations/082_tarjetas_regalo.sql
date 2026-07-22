-- ============================================================
--  Migración 082 — Tarjetas de regalo / vales de consumo
--  (Fase 2 auditoría de lanzamiento: retención y utilidades de personal)
--  · gift_cards: saldo emitido/restante por código.
--  · gift_card_transactions: bitácora (emisión, redención, cancelación).
--  · orders.gift_card_id/gift_card_amount: qué vale se aplicó a un pedido
--    y por cuánto (snapshot para recibos/reportes).
--  · redeem_gift_card(): mueve el saldo de forma atómica — bloquea la fila
--    del vale y del pedido para que dos redenciones concurrentes nunca
--    dejen el saldo negativo ni apliquen el vale dos veces al mismo pedido.
--  Ejecutar DESPUÉS de 001..081.
-- ============================================================

create table if not exists gift_cards (
  id               uuid          primary key default gen_random_uuid(),
  restaurant_id    uuid          not null references restaurants(id) on delete cascade,
  code             text          not null,
  initial_balance  numeric(10,2) not null check (initial_balance > 0),
  balance          numeric(10,2) not null,
  recipient_name   text,
  note             text,
  status           text          not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  expires_at       timestamptz,
  created_by       uuid          references profiles(id) on delete set null,
  created_at       timestamptz   not null default now()
);

comment on table gift_cards is
  'Tarjeta de regalo / vale de consumo con saldo propio. Se vende o se '
  'regala al cliente y se redime (parcial o totalmente) contra uno o '
  'varios pedidos hasta agotar el saldo.';

-- Código único por restaurante (sin distinguir mayúsculas/minúsculas).
create unique index if not exists gift_cards_restaurant_code_idx
  on gift_cards(restaurant_id, upper(code));
create index if not exists gift_cards_restaurant_status_idx
  on gift_cards(restaurant_id, status);

alter table gift_cards enable row level security;

create table if not exists gift_card_transactions (
  id             uuid          primary key default gen_random_uuid(),
  gift_card_id   uuid          not null references gift_cards(id) on delete cascade,
  order_id       uuid          references orders(id) on delete set null,
  amount         numeric(10,2) not null,   -- positivo = emisión/recarga, negativo = redención
  kind           text          not null check (kind in ('ISSUE', 'REDEEM', 'CANCEL')),
  created_by     uuid          references profiles(id) on delete set null,
  created_at     timestamptz   not null default now()
);

create index if not exists gift_card_transactions_card_idx
  on gift_card_transactions(gift_card_id, created_at desc);

alter table gift_card_transactions enable row level security;

alter table orders
  add column if not exists gift_card_id     uuid references gift_cards(id) on delete set null,
  add column if not exists gift_card_amount numeric(10,2) not null default 0;

comment on column orders.gift_card_amount is
  'Monto pagado con vale de regalo en este pedido (snapshot, >= 0). '
  'total (cobro real esperado) = total - gift_card_amount.';

-- Al crear el vale, deja registrada la emisión en la bitácora (útil para
-- saber cuánto se ha emitido en total sin sumar gift_cards.initial_balance
-- a mano en cada reporte).
create or replace function issue_gift_card(
  p_restaurant_id   uuid,
  p_code            text,
  p_initial_balance numeric,
  p_recipient_name  text,
  p_note            text,
  p_expires_at      timestamptz,
  p_created_by      uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_initial_balance is null or p_initial_balance <= 0 then
    raise exception 'El saldo inicial debe ser mayor a 0' using errcode = 'P0001';
  end if;

  insert into gift_cards (
    restaurant_id, code, initial_balance, balance,
    recipient_name, note, expires_at, created_by
  ) values (
    p_restaurant_id, p_code, p_initial_balance, p_initial_balance,
    nullif(trim(p_recipient_name), ''), nullif(trim(p_note), ''), p_expires_at, p_created_by
  )
  returning id into v_id;

  insert into gift_card_transactions (gift_card_id, amount, kind, created_by)
  values (v_id, p_initial_balance, 'ISSUE', p_created_by);

  return v_id;
end;
$$;

-- Redención atómica: bloquea el vale y el pedido, valida estado/vigencia/
-- saldo/tope del total del pedido, descuenta el saldo y deja rastro.
create or replace function redeem_gift_card(
  p_gift_card_id uuid,
  p_order_id     uuid,
  p_amount       numeric,
  p_created_by   uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance          numeric;
  v_status           text;
  v_expires          timestamptz;
  v_card_restaurant  uuid;
  v_order_restaurant uuid;
  v_order_total      numeric;
  v_already          numeric;
  v_new_balance      numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido' using errcode = 'P0001';
  end if;

  select balance, status, expires_at, restaurant_id into v_balance, v_status, v_expires, v_card_restaurant
    from gift_cards where id = p_gift_card_id for update;
  if v_balance is null then
    raise exception 'Vale no encontrado' using errcode = 'P0001';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'El vale ya no está activo' using errcode = 'P0001';
  end if;
  if v_expires is not null and v_expires < now() then
    raise exception 'El vale ya venció' using errcode = 'P0001';
  end if;
  if v_balance < p_amount then
    raise exception 'Saldo insuficiente en el vale (disponible: %)', v_balance using errcode = 'P0001';
  end if;

  select total, gift_card_amount, restaurant_id into v_order_total, v_already, v_order_restaurant
    from orders where id = p_order_id for update;
  if v_order_total is null then
    raise exception 'Pedido no encontrado' using errcode = 'P0001';
  end if;
  if v_order_restaurant <> v_card_restaurant then
    raise exception 'El vale no pertenece a este restaurante' using errcode = 'P0001';
  end if;
  if v_already > 0 then
    raise exception 'Este pedido ya tiene un vale aplicado' using errcode = 'P0001';
  end if;
  if p_amount > v_order_total then
    raise exception 'El monto excede el total del pedido (%)', v_order_total using errcode = 'P0001';
  end if;

  update gift_cards set balance = balance - p_amount
    where id = p_gift_card_id
    returning balance into v_new_balance;

  insert into gift_card_transactions (gift_card_id, order_id, amount, kind, created_by)
  values (p_gift_card_id, p_order_id, -p_amount, 'REDEEM', p_created_by);

  update orders set gift_card_id = p_gift_card_id, gift_card_amount = p_amount
    where id = p_order_id;

  return v_new_balance;
end;
$$;

comment on function redeem_gift_card is
  'Aplica hasta el saldo disponible de un vale contra UN pedido (una sola '
  'vez por pedido). Bloquea vale + pedido (for update) para que dos '
  'redenciones concurrentes nunca dejen el saldo negativo.';

-- IMPORTANTE (hallazgo real de esta migración, verificado contra Supabase
-- local): el bootstrap de Supabase deja "alter default privileges in schema
-- public grant execute on functions to anon, authenticated, service_role",
-- así que TODA función nueva en public queda ejecutable por anon/authenticated
-- automáticamente — "revoke ... from public" NO alcanza, porque el grant es
-- directo a esos roles, no vía PUBLIC. Como estas funciones son SECURITY
-- DEFINER (corren con privilegios del dueño, saltándose RLS), sin este
-- REVOKE explícito cualquiera con la clave anon (pública, va en el JS del
-- navegador) podía llamar issue_gift_card/redeem_gift_card directamente por
-- REST: emitirse vales gratis o drenar el saldo de un vale ajeno contra
-- cualquier pedido, sin pasar por lib/actions/gift-cards.ts ni por sus
-- validaciones de rol y restaurante. Confirmado con un POST anon real a
-- /rest/v1/rpc/redeem_gift_card ANTES de este fix (sí ejecutaba la función,
-- llegaba a "Vale no encontrado" en vez de un error de permisos) y de nuevo
-- DESPUÉS (ya rechazado). Mismo patrón de riesgo probablemente heredado por
-- otras funciones SECURITY DEFINER más antiguas del proyecto (place_order,
-- void_order, etc.) — fuera de alcance de esta migración, reportado aparte.
revoke all on function issue_gift_card(uuid, text, numeric, text, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function redeem_gift_card(uuid, uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function issue_gift_card(uuid, text, numeric, text, text, timestamptz, uuid) to service_role;
grant execute on function redeem_gift_card(uuid, uuid, numeric, uuid) to service_role;
