-- ============================================================
--  Migración 123 — Rediseño de salón, comanda y caja
--  ------------------------------------------------------------
--  Lo que el rediseño de Mesas · Tomar pedidos · Caja necesita y el
--  modelo de datos todavía no sabía decir:
--
--   · orders.party_size      cuánta gente hay en la mesa. Sin esto la
--                            ficha no puede decir "4 pers" ni el reparto
--                            de la cuenta puede partirse por persona.
--   · order_items.seat_no    de quién es cada plato. Es lo que convierte
--                            "dividir la cuenta" de un rompecabezas en
--                            una lista ya hecha.
--   · cash_expenses          lo que salió de la caja durante el turno.
--                            Sin esta tabla el arqueo NUNCA cuadra: el
--                            dinero del mercado y el gas ya no está en
--                            el cajón y nada lo explicaba.
--   · cash_counts.*          el cierre deja de ser un formulario de una
--                            sola pasada: se guarda a medias (status),
--                            arrastra los gastos y reparte propinas.
--
--  Todo es aditivo y opcional: una instalación que no corra esta
--  migración sigue funcionando exactamente igual (la UI degrada sola,
--  ver §9 del handoff).
--  Ejecutar DESPUÉS de 001..122.
-- ============================================================

-- ── 1. Personas en la mesa ──────────────────────────────────
alter table orders
  add column if not exists party_size int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_party_size_range'
  ) then
    alter table orders
      add constraint orders_party_size_range
      check (party_size is null or (party_size >= 1 and party_size <= 100));
  end if;
end $$;

comment on column orders.party_size is
  'Comensales en la mesa cuando se tomó el pedido. NULL = no se preguntó '
  '(pedido del propio comensal por QR, o mesero que no lo anotó). La UI '
  'lo omite en vez de inventarlo.';

-- ── 2. Asiento por plato ────────────────────────────────────
alter table order_items
  add column if not exists seat_no int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_seat_no_range'
  ) then
    alter table order_items
      add constraint order_items_seat_no_range
      check (seat_no is null or (seat_no >= 1 and seat_no <= 40));
  end if;
end $$;

comment on column order_items.seat_no is
  'Asiento (1..N) al que se le apunta este plato. NULL = de la mesa, sin '
  'dueño. Es la base del reparto de la cuenta: sin esto, dividir obliga a '
  'volver a tocar plato por plato en el momento de cobrar.';

-- ── 3. place_order persiste el asiento ──────────────────────
-- MISMA FIRMA que la migración 061 (19 params): esto es un reemplazo
-- limpio, no una sobrecarga nueva (ver el aviso de 031 sobre firmas
-- distintas). El asiento viaja DENTRO de p_items, como ya viajan el
-- costo y las opciones, así que ningún llamador existente cambia.
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
    quantity, subtotal, options_snapshot, note, is_reward, reward_id, seat_no
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
    nullif(trim(it->>'note'), ''),
    case when it ? 'is_reward' then (it->>'is_reward')::boolean else false end,
    case when it ? 'reward_id' and it->>'reward_id' is not null
         then (it->>'reward_id')::uuid else null end,
    case when it ? 'seat_no' and it->>'seat_no' is not null
         then (it->>'seat_no')::int else null end
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

-- ── 4. Gastos pagados de la caja ────────────────────────────
create table if not exists cash_expenses (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  business_date  date          not null,
  concept        text          not null,
  amount         numeric(10,2) not null check (amount > 0),
  /** Quién puso el dinero / lo gestionó. Texto libre: el proveedor del
      mercado no tiene usuario en el sistema. */
  paid_by        text,
  /** Foto del recibo (URL en el bucket público del restaurante). */
  receipt_url    text,
  /** Corte de caja al que quedó atado cuando se cerró el turno. NULL =
      todavía suelto, cuenta para el cierre de hoy. */
  cash_count_id  uuid          references cash_counts(id) on delete set null,
  notes          text,
  created_by     uuid,
  created_at     timestamptz   not null default now()
);

comment on table cash_expenses is
  'Lo que salió de la caja durante el turno (mercado, gas, mandados). Es la '
  'pieza que faltaba para que el arqueo cuadre: ese dinero ya no está en el '
  'cajón y hasta ahora nada lo explicaba.';

create index if not exists cash_expenses_restaurant_date_idx
  on cash_expenses(restaurant_id, business_date desc);

create index if not exists cash_expenses_count_idx
  on cash_expenses(cash_count_id)
  where cash_count_id is not null;

-- Igual que cash_counts: sin políticas a propósito. Todo el acceso pasa
-- por server actions con service role que validan el permiso 'finanzas'.
alter table cash_expenses enable row level security;

-- ── 5. El cierre de caja, en tres pasos ─────────────────────
alter table cash_counts
  add column if not exists status text not null default 'CLOSED',
  add column if not exists expenses_total numeric(10,2) not null default 0,
  add column if not exists tips_total numeric(10,2) not null default 0,
  add column if not exists tips_distribution jsonb,
  add column if not exists shift_label text,
  add column if not exists cashier_name text,
  add column if not exists denomination_breakdown jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cash_counts_status_valid'
  ) then
    alter table cash_counts
      add constraint cash_counts_status_valid
      check (status in ('DRAFT', 'CLOSED'));
  end if;
end $$;

comment on column cash_counts.status is
  'DRAFT = "Guardar y seguir después": el cierre se dejó a medias y se '
  'retoma. CLOSED = turno cerrado. Solo puede haber UN borrador por '
  'restaurante a la vez.';

comment on column cash_counts.expenses_total is
  'Suma de cash_expenses atados a este corte. Se resta del efectivo '
  'esperado: ese dinero salió del cajón durante el turno.';

comment on column cash_counts.tips_distribution is
  'Reparto de propinas del turno: [{ "profileId": uuid|null, "name": text, '
  '"tables": int, "amount": numeric }]. NULL = no se repartió.';

-- Un solo borrador vivo por restaurante: el cierre del día es uno, y dos
-- borradores abiertos a la vez son dos cuadres que se contradicen.
create unique index if not exists cash_counts_one_draft_per_restaurant
  on cash_counts(restaurant_id)
  where status = 'DRAFT';
