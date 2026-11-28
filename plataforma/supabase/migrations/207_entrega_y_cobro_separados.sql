-- ============================================================
--  207 · Entregar no es cobrar (auditoría del 26-nov-2026)
--  ------------------------------------------------------------
--  Hasta aquí la caja tenía DOS fuentes de dinero: las filas de
--  `order_payments` y, para un domicilio o un «para recoger» del
--  menú en línea entregado SIN filas, su total con el método que
--  eligió el cliente. Marcar «Entregado» contaba efectivo que nadie
--  había registrado, mientras Pedidos decía «Sin cobro registrado».
--
--  Desde esta migración el único registro de cobro es
--  `order_payments`. Entregar y cobrar son dos hechos distintos:
--
--    1. Conciliación del histórico. Cada pedido en línea entregado
--       sin filas recibe la fila de cobro que la caja ya le suponía:
--       mismo método, mismo total, misma hora y la misma marca de
--       registro de caja. Ningún saldo, corte ni reporte cambia; la
--       fila lleva el motivo «Supuesto al entregar…» para que el
--       dueño la distinga y la pueda corregir desde Caja.
--    2. `leogin_cobrar_pedido`: registra el saldo pendiente de un
--       pedido en línea bajo bloqueo de la fila. Reintentar, o
--       confirmar desde otra pantalla, encuentra el saldo en cero y
--       no escribe un segundo cobro.
--    3. Un pedido de prueba (183) no puede pasar a DELIVERED ni a
--       SERVED: se termina con `leogin_terminar_pedido_prueba`.
--    4. `leogin_sales_report` deja fuera los pedidos de prueba y
--       reparte «por método» con lo cobrado de verdad; lo que falta
--       por cobrar sale como `PENDING`.
--    5. `restaurants.reparto_confirmado_en` (hallazgo 5): un local
--       nuevo publica su carta, pero no recibe domicilios hasta que el
--       dueño confirma cobertura, tarifa y horario. Los locales que ya
--       repartían (con zonas, radio o algún domicilio) quedan
--       confirmados al aplicar la migración.
--
--  Aplicar ANTES de desplegar el código. Escribe datos (puntos 1 y
--  5), una sola vez: volver a correrla no duplica nada.
-- ============================================================

begin;

-- ── 1. Conciliar los pedidos en línea ya entregados ──────────────
-- `created_at` explícito: el disparador de la 166 deja
-- `caja_registrado_en` en NULL para filas fechadas, así que se copia
-- después la marca que ya tenía el pedido.
insert into public.order_payments (restaurant_id, order_id, method, amount, kind, reason, created_at)
select o.restaurant_id, o.id, upper(coalesce(nullif(trim(o.payment_method), ''), 'CASH')), o.total, 'PAYMENT',
       'Supuesto al entregar, antes de separar entrega y cobro (migración 207)',
       coalesce(o.delivered_at, o.created_at)
  from public.orders o
 where o.status = 'DELIVERED'
   and o.order_type <> 'DINE_IN'
   and o.total > 0
   and not o.es_prueba
   and not exists (select 1 from public.order_payments p where p.order_id = o.id);

update public.order_payments p
   set caja_registrado_en = o.caja_registrado_en,
       caja_corte_previo = o.caja_corte_previo
  from public.orders o
 where o.id = p.order_id
   and p.reason = 'Supuesto al entregar, antes de separar entrega y cobro (migración 207)'
   and p.caja_registrado_en is null
   and o.caja_registrado_en is not null;

-- ── 2. Cobrar un pedido en línea, una sola vez ───────────────────
create or replace function public.leogin_cobrar_pedido(
  p_restaurante uuid, p_pedido uuid, p_actor uuid, p_metodo text, p_recibido numeric default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_pedido public.orders%rowtype;
  v_metodo text := upper(trim(coalesce(p_metodo, '')));
  v_cobrado numeric;
  v_saldo numeric;
  v_recibido numeric;
begin
  if p_restaurante is null or p_pedido is null or p_actor is null then
    raise exception 'Operación inválida.' using errcode = '22023';
  end if;
  if v_metodo not in ('CASH', 'CARD', 'TRANSFER') then
    raise exception 'Elige cómo pagó el cliente.' using errcode = 'LGD01';
  end if;

  -- El bloqueo de la fila serializa dos pantallas cobrando a la vez.
  select * into v_pedido from public.orders
   where id = p_pedido and restaurant_id = p_restaurante for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'LGD01';
  end if;
  if v_pedido.es_prueba then
    raise exception 'Es un pedido de prueba: no se cobra, se termina.' using errcode = 'LGD01';
  end if;
  if v_pedido.order_type = 'DINE_IN' then
    raise exception 'Las mesas se cobran desde Servicio.' using errcode = 'LGD01';
  end if;
  if v_pedido.status = 'CANCEL' then
    raise exception 'Este pedido está anulado.' using errcode = 'LGD01';
  end if;

  select coalesce(sum(amount), 0) into v_cobrado
    from public.order_payments where order_id = p_pedido and kind <> 'REFUND';
  v_saldo := round(v_pedido.total - v_cobrado, 2);
  if v_saldo < 0.01 then
    return jsonb_build_object('cobrado', 0, 'yaCobrado', true, 'metodo', v_pedido.payment_method);
  end if;

  v_recibido := case when v_metodo = 'CASH' and p_recibido is not null and p_recibido >= v_saldo then round(p_recibido, 2) end;

  insert into public.order_payments (restaurant_id, order_id, method, amount, cash_received, kind, taken_by)
    values (p_restaurante, p_pedido, v_metodo, v_saldo, v_recibido, 'PAYMENT', p_actor);

  update public.orders
     set payment_method = v_metodo,
         cash_amount = coalesce(v_recibido, case when v_metodo = 'CASH' then cash_amount end)
   where id = p_pedido;

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'cobro_pedido', p_pedido::text,
      jsonb_build_object('pedido', v_pedido.order_number, 'metodo', v_metodo, 'monto', v_saldo, 'estado', v_pedido.status));

  return jsonb_build_object('cobrado', v_saldo, 'yaCobrado', false, 'metodo', v_metodo);
end $$;

revoke all on function public.leogin_cobrar_pedido(uuid, uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.leogin_cobrar_pedido(uuid, uuid, uuid, text, numeric) to service_role;

-- ── 3. Un pedido de prueba nunca se cierra como venta ────────────
create or replace function public.leogin_prueba_no_se_entrega()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.es_prueba and new.status in ('DELIVERED', 'SERVED') and old.status is distinct from new.status then
    raise exception 'Es un pedido de prueba: termínalo con «Terminar la prueba».' using errcode = 'LGD01';
  end if;
  return new;
end $$;

drop trigger if exists prueba_no_se_entrega on public.orders;
create trigger prueba_no_se_entrega before update of status on public.orders
  for each row execute function public.leogin_prueba_no_se_entrega();

-- ── 4. Resumen de ventas sin pruebas y con el cobro real ─────────
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
      and not o.es_prueba
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
  -- Lo cobrado de cada venta, por método y con sus correcciones. Las
  -- devoluciones van aparte, por la fecha en que salió el dinero.
  cobros as (
    select p.order_id, upper(coalesce(nullif(p.method, ''), 'CASH')) as key, sum(p.amount) as monto
    from order_payments p
    join base b on b.id = p.order_id
    where p.kind <> 'REFUND'
    group by 1, 2
  ),
  cobrado as (
    select order_id, sum(monto) as monto from cobros group by order_id
  ),
  pendiente as (
    select b.id as order_id, 'PENDING'::text as key, b.total - coalesce(c.monto, 0) as monto
    from base b
    left join cobrado c on c.order_id = b.id
    where b.total - coalesce(c.monto, 0) >= 0.005
  ),
  by_payment as (
    select key, count(distinct order_id)::int as orders, coalesce(sum(monto), 0)::numeric as revenue
    from (
      select order_id, key, monto from cobros where monto >= 0.005
      union all
      select order_id, key, monto from pendiente
    ) x
    group by key
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

  select coalesce(-sum(p.amount), 0)::numeric, count(distinct p.order_id)::int
    into v_refunds, v_refund_count
    from order_payments p
    join orders o on o.id = p.order_id
   where p.restaurant_id = p_restaurant_id
     and p.kind = 'REFUND'
     and not o.es_prueba
     and p.created_at >= v_since
     and p.created_at <  v_until;

  return v_result || jsonb_build_object('refunds', v_refunds, 'refundOrders', v_refund_count);
end;
$$;

revoke execute on function public.leogin_sales_report(uuid, date, date, text, int) from public, anon, authenticated;
grant execute on function public.leogin_sales_report(uuid, date, date, text, int) to service_role;

-- ── 5. Reparto confirmado por el dueño ────────────────────────────
alter table public.restaurants add column if not exists reparto_confirmado_en timestamptz;
comment on column public.restaurants.reparto_confirmado_en is
  'Cuándo confirmó el dueño cobertura, tarifa y horario del reparto. NULL = la carta no recibe pedidos a domicilio.';

update public.restaurants r
   set reparto_confirmado_en = now()
 where r.reparto_confirmado_en is null
   and (r.delivery_radius_km is not null
        or exists (select 1 from public.delivery_zones z where z.restaurant_id = r.id)
        or exists (select 1 from public.orders o where o.restaurant_id = r.id and o.order_type = 'DELIVERY' and not o.es_prueba));

notify pgrst, 'reload schema';
commit;
