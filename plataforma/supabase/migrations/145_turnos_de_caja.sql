-- ============================================================
--  145 · Turnos de caja, hora de corte y cobros corregibles
--  ------------------------------------------------------------
--  AUDITORIA_SALIDA_PRODUCCION_2026-10-09: FUN-01, PROD-02..06.
--  Plan: docs/planes/PLAN_CAJA_TURNOS_2026-10-09.md
--
--  La caja no cuadraba en casos normales:
--
--   · esperaba como efectivo TODO lo vendido el día, cobrado o no
--     (cada mesa abierta era un «faltante»);
--   · el segundo turno esperaba el efectivo del primero;
--   · el día era el de calendario: un bar que cierra a la 1:30 cerraba
--     la caja del día SIGUIENTE;
--   · un cobro equivocado no se podía corregir y un corte se podía
--     borrar sin dejar rastro.
--
--  Lo que cambia en la base:
--
--   1. restaurants.day_cutoff_minutes — a qué hora empieza el día de
--      negocio (por omisión 05:00).
--   2. cash_counts pasa a ser el TURNO: se abre (OPEN), se cierra
--      (CLOSED) y, si el cierre estuvo mal, se anula (VOID) con motivo
--      y firma en vez de borrarse.
--   3. order_payments admite movimientos NEGATIVOS con su clase:
--      devolución, corrección de método y reapertura de mesa. El dinero
--      que sale se escribe; la venta no se toca nunca.
--   4. leogin_sales_report entiende la hora de corte y devuelve las
--      devoluciones del rango.
--
--  Idempotente. Ejecutar DESPUÉS de 001..144 y ANTES de desplegar el
--  código que la usa.
-- ============================================================

-- ── 1. Hora de corte del día ─────────────────────────────────
alter table public.restaurants
  add column if not exists day_cutoff_minutes smallint not null default 300;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_day_cutoff_range') then
    alter table public.restaurants
      add constraint restaurants_day_cutoff_range
      check (day_cutoff_minutes between 0 and 720);
  end if;
end $$;

comment on column public.restaurants.day_cutoff_minutes is
  'Minutos después de la medianoche local en que empieza el día de negocio. '
  '300 = 05:00: lo cobrado a la 1:30 cuenta para el día anterior. La usan '
  'caja, gastos, propinas, Hoy, reportes y analítica (migración 145).';

-- ── 2. El turno de caja ──────────────────────────────────────
alter table public.cash_counts
  add column if not exists opened_at        timestamptz,
  add column if not exists opened_by        uuid references public.profiles(id) on delete set null,
  add column if not exists opened_by_name   text,
  add column if not exists period_start     timestamptz,
  add column if not exists closed_at        timestamptz,
  add column if not exists draft_saved_at   timestamptz,
  add column if not exists void_reason      text,
  add column if not exists voided_at        timestamptz,
  add column if not exists voided_by        uuid references public.profiles(id) on delete set null,
  add column if not exists void_approved_by uuid references public.profiles(id) on delete set null;

comment on column public.cash_counts.opened_at is
  'Cuándo se abrió el turno. NULL = se cerró sin abrirlo antes (como antes '
  'de la 145): el fondo se escribió al cerrar.';
comment on column public.cash_counts.period_start is
  'Desde cuándo cuenta el cuadre de este turno: el cierre anterior, nunca '
  'antes del inicio del día de negocio en que se abrió. Se fija al cerrar.';
comment on column public.cash_counts.closed_at is
  'Cuándo se cerró. El cuadre cubre lo COBRADO entre period_start y aquí.';

-- Los cortes de antes cerraron cuando se crearon.
update public.cash_counts
   set closed_at = created_at
 where status = 'CLOSED' and closed_at is null;

-- El estado admite el turno abierto y el corte anulado. DRAFT se queda en la
-- lista solo para que el código de antes de la 145 no reviente en la ventana
-- entre migración y despliegue; el código nuevo ya no lo escribe.
alter table public.cash_counts drop constraint if exists cash_counts_status_valid;
alter table public.cash_counts
  add constraint cash_counts_status_valid
  check (status in ('OPEN', 'DRAFT', 'CLOSED', 'VOID'));

alter table public.cash_counts drop constraint if exists cash_counts_void_con_motivo;
alter table public.cash_counts
  add constraint cash_counts_void_con_motivo
  check (status <> 'VOID' or (void_reason is not null and length(trim(void_reason)) >= 3 and voided_at is not null));

-- Los cierres a medias de antes son, desde hoy, turnos abiertos con su
-- conteo guardado.
update public.cash_counts
   set status = 'OPEN',
       draft_saved_at = coalesce(draft_saved_at, created_at)
 where status = 'DRAFT';

-- UN turno abierto por restaurante: dos turnos vivos son dos cuadres que se
-- contradicen. Cubre también DRAFT por la misma ventana de despliegue.
drop index if exists public.cash_counts_one_draft_per_restaurant;
create unique index if not exists cash_counts_one_open_per_restaurant
  on public.cash_counts(restaurant_id)
  where status in ('OPEN', 'DRAFT');

-- «¿Cuándo fue el último cierre?» es la pregunta de cada cuadre.
create index if not exists cash_counts_last_close_idx
  on public.cash_counts(restaurant_id, closed_at desc)
  where status = 'CLOSED';

-- ── 3. Movimientos de dinero que salen ───────────────────────
alter table public.order_payments
  add column if not exists kind          text not null default 'PAYMENT',
  add column if not exists reverses_id   uuid references public.order_payments(id) on delete set null,
  add column if not exists order_item_id uuid references public.order_items(id) on delete set null,
  add column if not exists quantity      int,
  add column if not exists reason        text,
  add column if not exists approved_by   uuid references public.profiles(id) on delete set null;

comment on column public.order_payments.kind is
  'PAYMENT = cobro (por partes o para llevar) · TABLE_CLOSE = cobro al cerrar '
  'la mesa · REFUND = devolución (negativa) · METHOD_FIX = corrección de '
  'método (una negativa en el viejo y una positiva en el nuevo) · REOPEN = '
  'compensación al reabrir una mesa cobrada por error (negativa). Migración 145.';
comment on column public.order_payments.reverses_id is
  'La fila que esta compensa (REOPEN y la parte negativa de METHOD_FIX).';

alter table public.order_payments drop constraint if exists order_payments_amount_check;
alter table public.order_payments drop constraint if exists order_payments_amount_por_clase;
alter table public.order_payments
  add constraint order_payments_amount_por_clase
  check (
    (kind in ('PAYMENT', 'TABLE_CLOSE') and amount > 0)
    or (kind in ('REFUND', 'REOPEN') and amount < 0)
    or (kind = 'METHOD_FIX' and amount <> 0)
  );

alter table public.order_payments drop constraint if exists order_payments_correccion_con_motivo;
alter table public.order_payments
  add constraint order_payments_correccion_con_motivo
  check (kind in ('PAYMENT', 'TABLE_CLOSE') or (reason is not null and length(trim(reason)) >= 3));

alter table public.order_payments drop constraint if exists order_payments_quantity_valid;
alter table public.order_payments
  add constraint order_payments_quantity_valid
  check (quantity is null or quantity >= 1);

-- ── 4. Reporte de ventas con hora de corte y devoluciones ────
-- Firma nueva (5 parámetros). Se quita la de 4 para que no queden dos
-- sobrecargas: quien llame con 4 argumentos con nombre cae en esta con el
-- corte a medianoche, que es lo que hacía antes.
drop function if exists public.leogin_sales_report(uuid, date, date, text);

create or replace function public.leogin_sales_report(
  p_restaurant_id  uuid,
  p_from           date,
  p_to             date,
  p_timezone       text default 'America/Guatemala',
  p_cutoff_minutes int  default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut    interval := make_interval(mins => greatest(0, least(coalesce(p_cutoff_minutes, 0), 720)));
  v_since  timestamptz := ((p_from::timestamp) + v_cut) at time zone p_timezone;
  v_until  timestamptz := (((p_to + 1)::timestamp) + v_cut) at time zone p_timezone;
  v_result jsonb;
  v_refunds numeric;
  v_refund_count int;
begin
  with base as (
    select
      o.id, o.order_type, o.payment_method, o.delivery_zone,
      o.subtotal, o.delivery_fee, o.tip, o.total,
      ((o.created_at at time zone p_timezone) - v_cut)::date as local_day
    from orders o
    where o.restaurant_id = p_restaurant_id
      and o.status <> 'CANCEL'
      and o.created_at >= v_since
      and o.created_at <  v_until
  ),
  items as (
    select oi.name_snapshot, oi.cost_snapshot, oi.quantity, oi.subtotal
    from order_items oi
    join base b on b.id = oi.order_id
  ),
  totals as (
    select
      count(*)::int as orders,
      coalesce(sum(total), 0)::numeric as revenue,
      coalesce(sum(subtotal), 0)::numeric as product_revenue,
      coalesce(sum(delivery_fee), 0)::numeric as delivery_revenue,
      coalesce(sum(tip), 0)::numeric as tips
    from base
  ),
  cost_totals as (
    select
      coalesce(sum(case when cost_snapshot is not null then cost_snapshot * quantity else 0 end), 0)::numeric as cost,
      coalesce(sum(case when cost_snapshot is not null then subtotal else 0 end), 0)::numeric as costed_revenue
    from items
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  by_day_raw as (
    select local_day, count(*)::int as orders, coalesce(sum(total), 0)::numeric as revenue
    from base
    group by local_day
  ),
  by_day as (
    select to_char(d.day, 'YYYY-MM-DD') as date, coalesce(r.orders, 0) as orders, coalesce(r.revenue, 0) as revenue
    from days d
    left join by_day_raw r on r.local_day = d.day
  ),
  by_channel as (
    select order_type as key, count(*)::int as orders, coalesce(sum(total), 0)::numeric as revenue
    from base
    group by order_type
  ),
  by_payment as (
    select upper(coalesce(nullif(payment_method, ''), 'CASH')) as key, count(*)::int as orders, coalesce(sum(total), 0)::numeric as revenue
    from base
    group by 1
  ),
  by_zone as (
    select delivery_zone as key, count(*)::int as orders, coalesce(sum(total), 0)::numeric as revenue
    from base
    where delivery_zone is not null
    group by delivery_zone
  ),
  by_product as (
    select
      name_snapshot as name,
      sum(quantity)::int as qty,
      coalesce(sum(subtotal), 0)::numeric as revenue,
      coalesce(sum(case when cost_snapshot is not null then cost_snapshot * quantity else 0 end), 0)::numeric as cost,
      bool_or(cost_snapshot is not null) as has_cost
    from items
    group by name_snapshot
  )
  select jsonb_build_object(
    'orders',          t.orders,
    'revenue',         t.revenue,
    'productRevenue',  t.product_revenue,
    'deliveryRevenue', t.delivery_revenue,
    'tips',            t.tips,
    'cost',            ct.cost,
    'costedRevenue',   ct.costed_revenue,
    'series',      coalesce((select jsonb_agg(jsonb_build_object('date', date, 'orders', orders, 'revenue', revenue) order by date) from by_day), '[]'::jsonb),
    'byChannel',   coalesce((select jsonb_agg(jsonb_build_object('key', key, 'orders', orders, 'revenue', revenue) order by revenue desc) from by_channel), '[]'::jsonb),
    'byPayment',   coalesce((select jsonb_agg(jsonb_build_object('key', key, 'orders', orders, 'revenue', revenue) order by revenue desc) from by_payment), '[]'::jsonb),
    'byZone',      coalesce((select jsonb_agg(jsonb_build_object('key', key, 'orders', orders, 'revenue', revenue) order by revenue desc) from by_zone), '[]'::jsonb),
    'topByRevenue', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue, 'cost', cost, 'profit', revenue - cost, 'hasCost', has_cost) order by revenue desc)
      from (select * from by_product order by revenue desc limit 12) top_rev
    ), '[]'::jsonb),
    'topByProfit', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue, 'cost', cost, 'profit', revenue - cost, 'hasCost', has_cost) order by (revenue - cost) desc)
      from (select * from by_product where has_cost order by (revenue - cost) desc limit 12) top_prof
    ), '[]'::jsonb)
  )
  into v_result
  from totals t, cost_totals ct;

  -- Las devoluciones van por la fecha en que SALIÓ el dinero, no por la de
  -- la venta: la venta del lunes sigue siendo del lunes, y el dinero que se
  -- devolvió el martes falta en la caja del martes.
  select coalesce(-sum(p.amount), 0)::numeric, count(distinct p.order_id)::int
    into v_refunds, v_refund_count
    from order_payments p
   where p.restaurant_id = p_restaurant_id
     and p.kind = 'REFUND'
     and p.created_at >= v_since
     and p.created_at <  v_until;

  return v_result || jsonb_build_object('refunds', v_refunds, 'refundOrders', v_refund_count);
end;
$$;

comment on function public.leogin_sales_report(uuid, date, date, text, int) is
  'Reporte de ventas agregado en SQL entre dos días de negocio del restaurante '
  '(con su hora de corte, migración 145). Incluye propinas y devoluciones del rango.';

revoke execute on function public.leogin_sales_report(uuid, date, date, text, int) from public, anon, authenticated;
grant execute on function public.leogin_sales_report(uuid, date, date, text, int) to service_role;
