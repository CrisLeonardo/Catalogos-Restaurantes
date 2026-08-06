-- ============================================================
--  Migración 108 — Propinas visibles en el reporte de ventas
--  ------------------------------------------------------------
--  leogin_sales_report() (mig. 098) no devolvía la propina como
--  cifra aparte. El "Ingreso" de /admin/finanzas ya la incluye
--  (total = subtotal + envío − descuento + propina), pero el
--  restaurante no podía ver CUÁNTO de eso fue propina: lo único
--  que existía era el módulo Personal › Propinas, que solo muestra
--  lo PENDIENTE de repartir (no el total del rango, incluya o no
--  propinas ya repartidas).
--
--  Se agrega 'tips' al jsonb — mismo criterio que 'deliveryRevenue',
--  que ya se desglosa aparte de 'revenue' sin restarse de ahí.
--
--  Ejecutar DESPUÉS de 001..107.
-- ============================================================

create or replace function leogin_sales_report(
  p_restaurant_id uuid,
  p_from date,
  p_to date,
  p_timezone text default 'America/Guatemala'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := (p_from::timestamp) at time zone p_timezone;
  v_until timestamptz := ((p_to + 1)::timestamp) at time zone p_timezone;
  v_result jsonb;
begin
  with base as (
    select
      o.id, o.order_type, o.payment_method, o.delivery_zone,
      o.subtotal, o.delivery_fee, o.tip, o.total,
      (o.created_at at time zone p_timezone)::date as local_day
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

  return v_result;
end;
$$;

comment on function leogin_sales_report is
  'Reporte de ventas agregado en SQL (día local/canal/pago/zona/producto) '
  'entre dos fechas locales del restaurante, incluye propinas del rango. '
  'Sustituye la agregación en Node de getSalesReport (src/lib/db/reports.ts).';

-- Mismo patrón que toda función security definer del proyecto: nada de
-- anon/authenticated, solo el service role que ya usa getSalesReport.
revoke execute on function leogin_sales_report(uuid, date, date, text) from public, anon, authenticated;
grant execute on function leogin_sales_report(uuid, date, date, text) to service_role;
