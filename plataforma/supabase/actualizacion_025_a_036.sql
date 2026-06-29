-- ============================================================
--  ACTUALIZACION 025 a 036 — features recientes + cobro automatico
--  Pega TODO este archivo en el SQL Editor de Supabase (nube) y Run.
--  Es IDEMPOTENTE: si ya corriste alguna parte, re-ejecutar no rompe nada.
--  Requiere tener aplicadas antes las migraciones 001..024.
--
--  Incluye: 025 metodo de pago dinamico, 026 selector publico de grupo,
--  027 propina, 028 facturacion, 029 planes y modulos, 030 meseros,
--  031 fix place_order, 032 mesero como seccion, 033 agente de impresion,
--  034 version del agente, 035 COBRO AUTOMATICO (precio del plan + pg_cron +
--  impago/gracia), 036 indices de rendimiento.
--
--  NOTA pg_cron (mig. 035): si ves un aviso de que no se pudo programar el
--  job, activa pg_cron en Dashboard -> Database -> Extensions y vuelve a
--  ejecutar el bloque final de la 035.
-- ============================================================


-- ========== migrations/025_payment_method_dynamic.sql ==========

-- ============================================================
--  MigraciÃ³n 025 â€” MÃ©todo de pago dinÃ¡mico + efectivo con cambio
--  Â· orders:       columna cash_amount (monto con que pagarÃ¡ el cliente)
--  Â· place_order:  acepta p_payment_method y p_cash_amount
--  Ejecutar DESPUÃ‰S de 001..024.
-- ============================================================

-- Monto en efectivo que el cliente indica para que el repartidor lleve cambio.
-- Solo aplica cuando order_type = 'DELIVERY' y payment_method = 'CASH'.
alter table orders
  add column if not exists cash_amount numeric(10,2);

comment on column orders.cash_amount is
  'Monto en efectivo que el cliente indicÃ³ para recibir cambio. '
  'Solo relevante en DELIVERY con payment_method=CASH.';

-- â”€â”€ place_order actualizado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Igual a la versiÃ³n de migraciÃ³n 021 (con descuento de stock),
-- pero ahora acepta mÃ©todo de pago y monto de cambio.
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
  p_cash_amount    numeric default null
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
    payment_method, cash_amount, status, subtotal, delivery_fee, total, notes
  ) values (
    p_restaurant_id, v_order_number, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    coalesce(p_payment_method, 'CASH'), p_cash_amount, 'NEW', p_subtotal, p_delivery_fee, p_total, p_notes
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


-- ========== migrations/026_group_public_selector.sql ==========

-- ============================================================
--  MigraciÃ³n 026 â€” Selector pÃºblico de sucursal (link Ãºnico del grupo)
--  Â· restaurants.address: direcciÃ³n legible para mostrar en el selector.
--  Â· get_group_branches(p_org_slug): RPC pÃºblica (anon) que devuelve el
--    grupo + sus sucursales activas con SOLO columnas pÃºblicas, para que
--    `grupo-slug.dominio` enrute al cliente a la sucursal mÃ¡s cercana.
--  Reutiliza la geo de la migraciÃ³n 011 (location_lat/lng, delivery_radius_km).
--  Ejecutar DESPUÃ‰S de 001..025.
-- ============================================================

-- â”€â”€ DirecciÃ³n legible de la sucursal (para el selector y futuros usos) â”€â”€
alter table restaurants
  add column if not exists address text;

comment on column restaurants.address is
  'DirecciÃ³n legible del local (ej. "5a Av. 10-23, Zona 1"). Se muestra en el '
  'selector pÃºblico de sucursal del grupo. Opcional.';

-- â”€â”€ RPC pÃºblica: sucursales de un grupo para el selector del cliente â”€â”€
-- SECURITY DEFINER: el selector es anÃ³nimo y la tabla organizations tiene RLS
-- solo-service-role (mig. 024); esta funciÃ³n expone EXCLUSIVAMENTE columnas
-- pÃºblicas (nada de finanzas, dueÃ±os, mÃ³dulos internos, etc.).
create or replace function get_group_branches(p_org_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org organizations%rowtype;
  v_branches jsonb;
begin
  select * into v_org from organizations where slug = p_org_slug;
  if v_org.id is null then
    return null; -- no existe ese grupo
  end if;

  select coalesce(jsonb_agg(b order by b.name), '[]'::jsonb)
    into v_branches
  from (
    select
      r.slug,
      r.name,
      r.tagline,
      r.address,
      r.location_lat,
      r.location_lng,
      r.delivery_radius_km,
      (r.modules->>'orders' = 'true')                  as orders_enabled,
      coalesce(rt.logo_url, '')                         as logo_url
    from restaurants r
    left join restaurant_themes rt on rt.restaurant_id = r.id
    where r.organization_id = v_org.id
      and r.status = 'active'
  ) b;

  return jsonb_build_object(
    'name',          v_org.name,
    'slug',          v_org.slug,
    'logo_url',      v_org.logo_url,
    'color_primary', v_org.color_primary,
    'branches',      v_branches
  );
end;
$$;

comment on function get_group_branches(text) is
  'Selector pÃºblico de sucursal: devuelve { name, slug, logo_url, color_primary, '
  'branches[] } de un grupo por su slug, con solo columnas pÃºblicas de cada '
  'sucursal activa (slug, name, tagline, address, location_lat/lng, '
  'delivery_radius_km, orders_enabled, logo_url). NULL si el grupo no existe.';

grant execute on function get_group_branches(text) to anon, authenticated;


-- ========== migrations/027_propina.sql ==========

-- ============================================================
--  MigraciÃ³n 027 â€” Propina (tip) en pedidos de comer en local
--  Â· orders: columna tip (monto absoluto, default 0)
--  Â· place_order: acepta p_tip
--  La propina se habilita/configura desde restaurant_themes.config
--  (tipEnabled, tipPercent). Solo aplica para DINE_IN.
-- ============================================================

alter table orders
  add column if not exists tip numeric(10,2) not null default 0;

comment on column orders.tip is
  'Propina aplicada al pedido. Solo para DINE_IN cuando el restaurante la habilita.';

-- â”€â”€ place_order actualizado con soporte de propina â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  p_tip            numeric default 0
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
    payment_method, cash_amount, tip, status, subtotal, delivery_fee, total, notes
  ) values (
    p_restaurant_id, v_order_number, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    coalesce(p_payment_method, 'CASH'), p_cash_amount, coalesce(p_tip, 0),
    'NEW', p_subtotal, p_delivery_fee, p_total, p_notes
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


-- ========== migrations/028_facturacion.sql ==========

-- ============================================================
--  MigraciÃ³n 028 â€” FacturaciÃ³n / suscripciones de restaurantes
--  (cobro de Leogin a sus restaurantes clientes)
--  Â· restaurant_billing: config 1:1 â€” cuota de implementaciÃ³n,
--    mensualidad, dÃ­a de cobro, moneda, estado del servicio.
--  Â· invoices: cobros emitidos (mensualidad / implementaciÃ³n /
--    prorrateo / otros) con su estado de pago.
--  Acceso EXCLUSIVO vÃ­a service role en server actions; el panel
--  del dueÃ±o lee sus propias facturas tras validar sesiÃ³n.
--  Ejecutar DESPUÃ‰S de 001..027 en el SQL Editor de Supabase.
-- ============================================================

-- â”€â”€ Config de cobro por restaurante (1:1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists restaurant_billing (
  restaurant_id  uuid          primary key references restaurants(id) on delete cascade,
  currency       text          not null default 'GTQ',
  setup_fee      numeric(10,2) not null default 0,    -- costo de implementaciÃ³n (una vez)
  monthly_fee    numeric(10,2) not null default 0,    -- mensualidad recurrente
  billing_day    int           not null default 1,    -- dÃ­a del mes en que se cobra (al inicio)
  active         boolean       not null default true, -- Â¿se le sigue cobrando?
  started_at     date,                                -- inicio del servicio
  notes          text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

comment on table restaurant_billing is
  'ConfiguraciÃ³n de cobro de Leogin a cada restaurante cliente '
  '(implementaciÃ³n + mensualidad). Acceso solo vÃ­a service role.';

-- â”€â”€ Cobros / facturas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists invoices (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  concept        text          not null default 'MONTHLY',  -- MONTHLY | SETUP | PRORATE | OTHER
  description    text,
  period         date,                                      -- primer dÃ­a del mes que cubre (MONTHLY/PRORATE)
  amount         numeric(10,2) not null default 0,
  currency       text          not null default 'GTQ',
  status         text          not null default 'PENDING',  -- PENDING | PAID | CANCELLED
  due_date       date,                                      -- fecha lÃ­mite de pago
  paid_at        timestamptz,                               -- cuÃ¡ndo se registrÃ³ el pago
  paid_amount    numeric(10,2),
  payment_method text,                                      -- Efectivo, transferencia, etc.
  notes          text,
  created_at     timestamptz   not null default now()
);

comment on table invoices is
  'Cobros emitidos a un restaurante (mensualidad, implementaciÃ³n, prorrateo). '
  'status PAID = ya cancelÃ³. Acceso solo vÃ­a service role.';

create index if not exists invoices_restaurant_idx
  on invoices(restaurant_id, created_at desc);

-- GeneraciÃ³n idempotente: una sola mensualidad por restaurante y periodo.
create unique index if not exists invoices_monthly_period_uniq
  on invoices(restaurant_id, period)
  where concept = 'MONTHLY' and period is not null;

-- RLS: sin polÃ­ticas a propÃ³sito â€” todo el acceso pasa por server actions
-- (service role) que validan el rol del usuario autenticado.
alter table restaurant_billing enable row level security;
alter table invoices            enable row level security;


-- ========== migrations/029_planes_y_modulos.sql ==========

-- 029_planes_y_modulos.sql
-- Renombra planes CATALOGOâ†’BASICO y PREMIUMâ†’POPULAR.
-- AÃ±ade PREMIUM como nuevo tier de alto valor.
-- Expande modules JSONB con campos granulares por mÃ³dulo.

-- 1. Eliminar constraint viejo
alter table restaurants drop constraint if exists restaurants_plan_actual_check;

-- 2. Migrar datos existentes
update restaurants set plan_actual = 'BASICO'  where plan_actual = 'CATALOGO';
update restaurants set plan_actual = 'POPULAR' where plan_actual = 'PREMIUM';

-- 3. Nuevo constraint con los tres planes
alter table restaurants
  add constraint restaurants_plan_actual_check
  check (plan_actual in ('BASICO', 'POPULAR', 'PREMIUM'));

-- 4. Nuevo valor por defecto
alter table restaurants alter column plan_actual set default 'BASICO';

-- 5. Expandir mÃ³dulos â€” preserva catalog/orders/whatsapp_notify existentes
--    y agrega los campos nuevos segÃºn el plan actual
update restaurants
set modules = modules || jsonb_build_object(
  'analitica',    plan_actual <> 'BASICO',
  'inventario',   plan_actual <> 'BASICO',
  'promociones',  plan_actual <> 'BASICO',
  'personal',     plan_actual <> 'BASICO',
  'finanzas',     plan_actual <> 'BASICO',
  'multi_branch', plan_actual <> 'BASICO'
);

-- 6. Actualizar el default del JSONB para restaurantes nuevos
alter table restaurants
  alter column modules
  set default '{"catalog":true,"orders":false,"whatsapp_notify":false,"analitica":false,"inventario":false,"promociones":false,"personal":false,"finanzas":false,"multi_branch":false}';


-- ========== migrations/030_meseros.sql ==========

-- ============================================================
--  MigraciÃ³n 030 â€” Meseros
--  Â· profiles: nuevo rol RESTAURANT_WAITER
--  Â· orders: columna waiter_id (FK â†’ profiles, nullable)
--  Â· RLS: meseros pueden leer/actualizar pedidos de su restaurante
--  Â· place_order: acepta p_waiter_id opcional
-- ============================================================

-- â”€â”€ 1. Nuevo rol RESTAURANT_WAITER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in (
    'SUPER_ADMIN', 'RESTAURANT_OWNER',
    'RESTAURANT_STAFF', 'GROUP_OWNER',
    'RESTAURANT_WAITER'
  ));

comment on column profiles.role is
  'SUPER_ADMIN = Leogin; RESTAURANT_OWNER = dueÃ±o del restaurante; '
  'RESTAURANT_STAFF = cajero/admin con permisos; '
  'RESTAURANT_WAITER = mesero (solo toma pedidos desde /admin/mesero); '
  'GROUP_OWNER = dueÃ±o de grupo multi-sucursal.';

-- â”€â”€ 2. Columna waiter_id en orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table orders
  add column if not exists waiter_id uuid
    references profiles(id) on delete set null;

comment on column orders.waiter_id is
  'Mesero que tomÃ³ el pedido. NULL = pedido online del cliente.';

create index if not exists orders_waiter_id_idx on orders(waiter_id);

-- â”€â”€ 3. RLS: incluir RESTAURANT_WAITER en lectura/actualizaciÃ³n de pedidos
-- Las polÃ­ticas actuales solo cubren RESTAURANT_OWNER y RESTAURANT_STAFF.
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

-- â”€â”€ 4. place_order actualizado con p_waiter_id opcional â”€â”€â”€
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


-- ========== migrations/031_fix_place_order_overloads.sql ==========

-- ============================================================
--  MigraciÃ³n 031 â€” Eliminar sobrecargas obsoletas de place_order
--
--  Problema: cada migraciÃ³n (016, 025, 027, 030) usÃ³ CREATE OR REPLACE
--  con una firma diferente, acumulando 4 versiones de place_order:
--    Â· 14 params (016/019/021)
--    Â· 16 params (025: + p_payment_method, p_cash_amount)
--    Â· 17 params (027: + p_tip)
--    Â· 18 params (030: + p_waiter_id)  â† la correcta y Ãºnica que debe quedar
--
--  PostgreSQL no puede resolver la ambigÃ¼edad cuando el cliente pÃºblico
--  llama sin p_waiter_id: tanto la versiÃ³n de 17 como la de 18 params
--  son candidatas vÃ¡lidas â†’ error "could not choose the best candidate".
--
--  SoluciÃ³n: eliminar las 3 versiones obsoletas. La versiÃ³n de 18 params
--  ya tiene p_waiter_id DEFAULT NULL, por lo que funciona para ambos casos
--  (pedido pÃºblico y pedido de mesero).
-- ============================================================

-- VersiÃ³n 14 params (016 / 019 / 021)
drop function if exists public.place_order(
  uuid, text, text, text, text, text, float8, float8,
  uuid, numeric, numeric, numeric, text, jsonb
);

-- VersiÃ³n 16 params (025: + p_payment_method, p_cash_amount)
drop function if exists public.place_order(
  uuid, text, text, text, text, text, float8, float8,
  uuid, numeric, numeric, numeric, text, jsonb,
  text, numeric
);

-- VersiÃ³n 17 params (027: + p_tip)
drop function if exists public.place_order(
  uuid, text, text, text, text, text, float8, float8,
  uuid, numeric, numeric, numeric, text, jsonb,
  text, numeric, numeric
);

-- Queda SOLO la versiÃ³n de 18 params (030: + p_waiter_id DEFAULT NULL)
-- que maneja ambos flujos: pedido pÃºblico (waiter_id = NULL) y mesero.


-- ========== migrations/032_mesero_como_seccion.sql ==========

-- ============================================================
--  MigraciÃ³n 032 â€” "Mesero" deja de ser un rol aparte y pasa a
--  ser una SECCIÃ“N/permiso combinable de RESTAURANT_STAFF.
--
--  Â· Antes: RESTAURANT_WAITER = rol rÃ­gido, solo /admin/mesero.
--  Â· Ahora: el dueÃ±o marca la secciÃ³n "mesero" igual que cualquier
--    otra (pedidos, catÃ¡logoâ€¦). Un mismo miembro puede tener
--    "mesero" + otras secciones del panel.
--
--  Migra los meseros existentes a RESTAURANT_STAFF con
--  permissions = ["mesero"] (mesero "puro"). El rol
--  RESTAURANT_WAITER se conserva en el CHECK por compatibilidad
--  pero queda deprecado: ya no se crean nuevos.
--  Ejecutar DESPUÃ‰S de 023..031.
-- ============================================================

-- â”€â”€ 1. Migrar meseros existentes a STAFF con permiso "mesero" â”€â”€
update profiles
   set role        = 'RESTAURANT_STAFF',
       permissions = '["mesero"]'::jsonb
 where role = 'RESTAURANT_WAITER';

comment on column profiles.permissions is
  'Secciones permitidas para RESTAURANT_STAFF: ["pedidos","mesero",...]. '
  'NULL = todas (dueÃ±os / super admin). "mesero" habilita /admin/mesero.';

comment on column profiles.role is
  'SUPER_ADMIN = Leogin; RESTAURANT_OWNER = dueÃ±o; '
  'RESTAURANT_STAFF = personal con permisos por secciÃ³n '
  '(incluye "mesero" para tomar pedidos en mesa); '
  'GROUP_OWNER = dueÃ±o de grupo. '
  'RESTAURANT_WAITER = DEPRECADO (migrado a STAFF + ["mesero"]).';

-- Nota: las polÃ­ticas RLS de pedidos (migraciÃ³n 030) ya incluyen
-- RESTAURANT_STAFF, asÃ­ que los ex-meseros conservan lectura y
-- actualizaciÃ³n de pedidos sin cambios adicionales.


-- ========== migrations/033_print_agents_y_jobs.sql ==========

-- ============================================================
-- 033 Â· Agente de impresiÃ³n propio (reemplazo de QZ Tray)
--
--   print_agents : un agente local por restaurante (token + impresoras vistas)
--   print_jobs   : cola de trabajos de impresiÃ³n (pendingâ†’printingâ†’done/failed)
--
-- El agente local NUNCA toca la base directo: pasa por /api/agent/* con su
-- token. El backend (service_role) es el Ãºnico que lee/escribe estas tablas.
-- ============================================================

create table if not exists print_agents (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null unique references restaurants(id) on delete cascade,
  name              text not null default 'Agente principal',
  -- sha256 del token del agente (el token en claro solo se muestra al crearlo)
  token_hash        text not null,
  -- Ãºltima lista de impresoras que el agente reportÃ³ (para la UI de config)
  reported_printers jsonb not null default '[]'::jsonb,
  -- destino asignado para cada rol (ej. "windows:EPSON TM-T20" o "tcp://IP:9100")
  kitchen_target    text,
  receipt_target    text,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists print_agents_token_idx on print_agents(token_hash);

create table if not exists print_jobs (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  role           text not null check (role in ('kitchen', 'receipt')),
  -- destino ya resuelto al encolar (el agente solo obedece)
  target         text not null,
  -- bytes ESC/POS en base64 (los tickets son < 1 KB)
  payload_b64    text not null,
  status         text not null default 'pending'
                              check (status in ('pending', 'printing', 'done', 'failed')),
  attempts       int  not null default 0,
  error          text,
  order_id       uuid references orders(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists print_jobs_queue_idx on print_jobs(restaurant_id, status, created_at);

-- RLS habilitado y SIN polÃ­ticas para anon/authenticated â†’ denegados por
-- defecto. Solo el service_role (que bypasa RLS) accede desde el backend.
alter table print_agents enable row level security;
alter table print_jobs   enable row level security;

-- â”€â”€ Reclamo atÃ³mico de trabajos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Marca como 'printing' y devuelve los pendientes (o los 'printing' colgados
-- >90s, p.ej. si el agente se reiniciÃ³). FOR UPDATE SKIP LOCKED evita que dos
-- llamadas concurrentes tomen el mismo trabajo.
create or replace function claim_print_jobs(p_restaurant_id uuid, p_limit int default 10)
returns setof print_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update print_jobs j
  set status = 'printing', attempts = j.attempts + 1, updated_at = now()
  where j.id in (
    select id from print_jobs
    where restaurant_id = p_restaurant_id
      and attempts < 10
      and (status = 'pending'
           or (status = 'printing' and updated_at < now() - interval '90 seconds'))
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;


-- ========== migrations/034_print_agent_version.sql ==========

-- ============================================================
-- 034 Â· VersiÃ³n reportada por el agente de impresiÃ³n
-- El agente envÃ­a su versiÃ³n en cada poll; se guarda para que el panel
-- muestre quÃ© versiÃ³n corre y avisar de actualizaciones.
-- ============================================================

alter table print_agents add column if not exists agent_version text;


-- ========== migrations/035_billing_automation.sql ==========

-- ============================================================
--  MigraciÃ³n 035 â€” AutomatizaciÃ³n del cobro (sobre 028)
--  ------------------------------------------------------------
--  Objetivo: quitar el trabajo manual del cobro a restaurantes.
--   1. Precio AUTOMÃTICO segÃºn el plan (BÃ¡sico/Popular/Premium)
--      + sucursales extra, con override por restaurante.
--   2. GeneraciÃ³n AUTOMÃTICA de la mensualidad cada mes.
--   3. Impago AUTOMÃTICO: vencido â†’ perÃ­odo de gracia â†’ suspende.
--   4. pg_cron diario que corre 2 y 3 sin tocar botones.
--
--  Precios y dÃ­as de gracia viven en platform_settings (editables
--  desde el Super Admin). Todo el acceso de la app sigue siendo por
--  service role; estas funciones son SECURITY DEFINER para el cron.
--  Ejecutar DESPUÃ‰S de 001..034.
-- ============================================================

-- â”€â”€ 1. ParÃ¡metros globales de precio + gracia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
insert into platform_settings (key, value) values
  ('plan_price_BASICO',         '200'),
  ('plan_price_POPULAR',        '599'),
  ('plan_price_PREMIUM',        '1200'),
  ('extra_branch_fee',          '600'),
  ('premium_included_branches', '2'),
  ('setup_fee_default',         '500'),
  ('billing_grace_days',        '10'),
  ('billing_auto_suspend',      'true'),
  ('billing_auto_generate',     'true')
on conflict (key) do nothing;

-- â”€â”€ 2. Columnas nuevas en restaurant_billing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table restaurant_billing
  add column if not exists auto_price               boolean not null default true,
  add column if not exists grace_days               int,                 -- null = usa el global
  add column if not exists suspended_for_nonpayment boolean not null default false;

comment on column restaurant_billing.auto_price is
  'true = la mensualidad se calcula del plan+sucursales. false = monto manual (override).';
comment on column restaurant_billing.grace_days is
  'DÃ­as de gracia tras el vencimiento antes de suspender. null = usa billing_grace_days global.';
comment on column restaurant_billing.suspended_for_nonpayment is
  'true si el sistema lo suspendiÃ³ por impago (para reactivar solo al pagar, sin tocar suspensiones manuales).';

-- Preservar lo ya configurado a mano: las filas con precio > 0 quedan como
-- override para no pisar precios pactados al activar el modo automÃ¡tico.
update restaurant_billing set auto_price = false where monthly_fee > 0;

-- â”€â”€ 3. Helpers para leer platform_settings con default â”€â”€â”€â”€â”€â”€
create or replace function leogin_setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select value from platform_settings where key = p_key), '')::numeric,
    p_default
  );
$$;

create or replace function leogin_setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select value from platform_settings where key = p_key), '')::boolean,
    p_default
  );
$$;

-- â”€â”€ 4. Precio sugerido segÃºn plan + sucursales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- BÃ¡sico/Popular = precio del plan (cada sucursal se cobra por separado, ya
-- que cada una tiene su propia fila de cobro).
-- Premium = el plan incluye N sucursales (default 2); la 1Âª sucursal del grupo
-- carga el precio Premium (cubre las incluidas) y las extra cobran extra_branch_fee.
--   2 sucursales = 1200 Â·  3 = 1800 Â·  4 = 2400  (coincide con el modelo).
create or replace function leogin_compute_monthly_fee(p_restaurant_id uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan     text;
  v_org      uuid;
  v_included int;
  v_premium  numeric;
  v_extra    numeric;
  v_rank     int;
begin
  select plan_actual, organization_id into v_plan, v_org
  from restaurants where id = p_restaurant_id;
  if v_plan is null then return 0; end if;

  if v_plan = 'BASICO' then
    return leogin_setting_num('plan_price_BASICO', 200);
  elsif v_plan = 'POPULAR' then
    return leogin_setting_num('plan_price_POPULAR', 599);
  elsif v_plan = 'PREMIUM' then
    v_premium  := leogin_setting_num('plan_price_PREMIUM', 1200);
    v_extra    := leogin_setting_num('extra_branch_fee', 600);
    v_included := greatest(1, leogin_setting_num('premium_included_branches', 2)::int);
    if v_org is null then
      return v_premium;  -- restaurante Premium independiente
    end if;
    -- posiciÃ³n de esta sucursal dentro de su grupo (estable por antigÃ¼edad)
    select rnk into v_rank from (
      select id, row_number() over (order by created_at, id) as rnk
      from restaurants
      where organization_id = v_org and plan_actual = 'PREMIUM'
    ) s where s.id = p_restaurant_id;
    if v_rank is null or v_rank = 1 then
      return v_premium;        -- 1Âª sucursal: cubre las incluidas
    elsif v_rank <= v_included then
      return 0;                -- sucursales incluidas en el plan
    else
      return v_extra;          -- sucursal extra
    end if;
  end if;
  return 0;
end;
$$;

-- â”€â”€ 5. DÃ­as de gracia efectivos (override por restaurante â†’ global â†’ 10) â”€â”€
create or replace function leogin_effective_grace_days(p_restaurant_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select grace_days from restaurant_billing where restaurant_id = p_restaurant_id),
    leogin_setting_num('billing_grace_days', 10)::int,
    10
  );
$$;

-- â”€â”€ 6. Aplicar el precio automÃ¡tico (uno / todos) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function leogin_apply_auto_price(p_restaurant_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_fee numeric;
begin
  v_fee := leogin_compute_monthly_fee(p_restaurant_id);
  update restaurant_billing
     set monthly_fee = v_fee, updated_at = now()
   where restaurant_id = p_restaurant_id and auto_price = true;
  return v_fee;
end;
$$;

create or replace function leogin_apply_auto_price_all()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in select restaurant_id from restaurant_billing where auto_price = true loop
    update restaurant_billing
       set monthly_fee = leogin_compute_monthly_fee(r.restaurant_id), updated_at = now()
     where restaurant_id = r.restaurant_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- â”€â”€ 7. GeneraciÃ³n idempotente de la mensualidad del mes â”€â”€â”€â”€â”€
create or replace function leogin_generate_monthly_invoices()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
  v_count  int  := 0;
  c        record;
  v_fee    numeric;
  v_due    date;
begin
  for c in select * from restaurant_billing where active = true loop
    if c.auto_price then
      v_fee := leogin_compute_monthly_fee(c.restaurant_id);
      update restaurant_billing set monthly_fee = v_fee, updated_at = now()
        where restaurant_id = c.restaurant_id;
    else
      v_fee := c.monthly_fee;
    end if;
    if v_fee is null or v_fee <= 0 then continue; end if;

    -- el Ã­ndice Ãºnico (restaurant_id, period) where MONTHLY garantiza no duplicar
    if exists (
      select 1 from invoices
      where restaurant_id = c.restaurant_id and concept = 'MONTHLY' and period = v_period
    ) then
      continue;
    end if;

    v_due := make_date(
      extract(year  from v_period)::int,
      extract(month from v_period)::int,
      least(28, greatest(1, coalesce(c.billing_day, 1)))
    );

    insert into invoices (restaurant_id, concept, description, period, amount, currency, status, due_date)
    values (
      c.restaurant_id, 'MONTHLY',
      'Mensualidad ' || to_char(v_period, 'YYYY-MM'),
      v_period, v_fee, coalesce(c.currency, 'GTQ'), 'PENDING', v_due
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- â”€â”€ 8. Sincronizar el estado de UN restaurante (suspender/reactivar) â”€â”€
-- Suspende si tiene un cobro vencido mÃ¡s allÃ¡ de la gracia; reactiva si pagÃ³
-- (solo si la suspensiÃ³n fue por impago, nunca toca suspensiones manuales).
create or replace function leogin_sync_restaurant_status(p_restaurant_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_auto_suspend boolean := leogin_setting_bool('billing_auto_suspend', true);
  v_grace        int     := leogin_effective_grace_days(p_restaurant_id);
  v_has_overdue  boolean;
  v_billing_act  boolean;
  v_status       text;
  v_flag         boolean;
begin
  select status into v_status from restaurants where id = p_restaurant_id;
  select active, suspended_for_nonpayment into v_billing_act, v_flag
    from restaurant_billing where restaurant_id = p_restaurant_id;
  if v_billing_act is null then return 'no-billing'; end if;

  select exists (
    select 1 from invoices
    where restaurant_id = p_restaurant_id
      and status = 'PENDING'
      and due_date is not null
      and (due_date + v_grace) < (now() at time zone 'UTC')::date
  ) into v_has_overdue;

  if v_has_overdue and v_billing_act then
    if v_auto_suspend and v_status = 'active' then
      update restaurants        set status = 'suspended'            where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = true where restaurant_id = p_restaurant_id;
      return 'suspended';
    end if;
  else
    -- sin mora: reactivar SOLO si el sistema lo habÃ­a suspendido por impago
    if v_flag and v_status = 'suspended' then
      update restaurants        set status = 'active'                where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
      return 'reactivated';
    elsif v_flag then
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
    end if;
  end if;
  return 'unchanged';
end;
$$;

-- â”€â”€ 9. Procesar impago de TODOS (para el cron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function leogin_process_overdue()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record; v_res text;
begin
  for r in select restaurant_id from restaurant_billing loop
    v_res := leogin_sync_restaurant_status(r.restaurant_id);
    if v_res in ('suspended', 'reactivated') then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- â”€â”€ 10. Tarea diaria: generar + procesar impago â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function leogin_billing_cron()
returns void language plpgsql security definer set search_path = public as $$
begin
  if leogin_setting_bool('billing_auto_generate', true) then
    perform leogin_generate_monthly_invoices();
  end if;
  perform leogin_process_overdue();
end;
$$;

-- â”€â”€ 11. Programar el cron diario (si pg_cron estÃ¡ disponible) â”€â”€
-- 13:00 UTC â‰ˆ 07:00 Guatemala. Idempotente: re-programa si ya existÃ­a.
-- Si pg_cron no estÃ¡ habilitado, no falla la migraciÃ³n: el botÃ³n "Generar
-- cobros" del panel corre el mismo motor manualmente como respaldo.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-billing-daily') then
        perform cron.unschedule('leogin-billing-daily');
      end if;
      perform cron.schedule('leogin-billing-daily', '0 13 * * *', 'select leogin_billing_cron();');
      raise notice 'pg_cron: job "leogin-billing-daily" programado (13:00 UTC diario).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actÃ­valo en el dashboard y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: la generaciÃ³n corre por el panel (respaldo manual).';
  end if;
end $$;


-- ========== migrations/036_performance_indexes.sql ==========

-- ============================================================
--  MigraciÃ³n 036 â€” Ãndices de rendimiento
--  ------------------------------------------------------------
--  Los tableros GLOBALES del Super Admin (cobros, mÃ©tricas) escanean
--  por rango de fecha SIN filtrar por restaurante:
--    Â· page_visits  WHERE created_at >= hace 30 dÃ­as   (afluencia)
--    Â· orders       WHERE created_at >= hace 30 dÃ­as    (ventas)
--  Los Ã­ndices existentes empiezan por restaurant_id, asÃ­ que no
--  sirven para un escaneo global por fecha. Estos Ã­ndices por
--  created_at aceleran esas consultas cuando los datos crezcan.
--  (Idempotente y seguro: solo agrega Ã­ndices.)
-- ============================================================

create index if not exists page_visits_created_idx on page_visits(created_at);
create index if not exists orders_created_idx       on orders(created_at);

-- BÃºsqueda de cobros pendientes/vencidos (cron de impago + tablero).
create index if not exists invoices_status_due_idx
  on invoices(status, due_date)
  where status = 'PENDING';

