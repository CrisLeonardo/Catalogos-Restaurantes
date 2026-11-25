-- 202 · Reutiliza el reporte financiero y agrega el ranking por unidades.
-- Aplicar antes de desplegar el resumen de ventas.

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
    'topByQuantity', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty) order by qty desc, name)
      from (select name, qty from by_product order by qty desc, name limit 5) top_qty
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
