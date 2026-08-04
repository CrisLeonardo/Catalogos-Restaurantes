-- ============================================================
--  Migración 098 — getSalesReport: agregación en SQL, no en Node
--  ------------------------------------------------------------
--  HALLAZGO (CHECKLIST_CORRECCIONES.md): src/lib/db/reports.ts traía hasta
--  20,000 pedidos (con sus order_items anidados) por request y los agregaba
--  en Maps de JavaScript — crece linealmente con el volumen del restaurante
--  y no usa el índice orders_restaurant_created_idx de forma eficiente
--  (trae TODAS las columnas de TODOS los pedidos del rango solo para sumar).
--
--  leogin_sales_report() hace el GROUP BY (día local/canal/pago/zona/
--  producto) directo en Postgres y devuelve un jsonb solo con los totales.
--  Ventaja extra sobre el código anterior: antes se pedía un margen de ±1
--  día en UTC y se re-filtraba en JS por clave de día local (localDateKey);
--  aquí el rango [p_from, p_to] se convierte UNA vez a límites UTC exactos
--  con AT TIME ZONE, así que el WHERE es sargable (usa el índice) y no hace
--  falta el margen+refiltro.
--
--  Ejecutar DESPUÉS de 001..097.
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
      o.subtotal, o.delivery_fee, o.total,
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
      coalesce(sum(delivery_fee), 0)::numeric as delivery_revenue
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
  'entre dos fechas locales del restaurante. Sustituye la agregación en Node '
  'de getSalesReport (src/lib/db/reports.ts) que traía hasta 20,000 filas '
  'crudas por request.';

-- Mismo patrón que toda función security definer del proyecto desde la
-- migración 084/092: nada de anon/authenticated, solo el service role que
-- ya usa getSalesReport (createServiceClient(), ver header de reports.ts).
revoke execute on function leogin_sales_report(uuid, date, date, text) from public, anon, authenticated;
grant execute on function leogin_sales_report(uuid, date, date, text) to service_role;
