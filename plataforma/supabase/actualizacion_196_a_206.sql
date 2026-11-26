-- ============================================================
--  ACTUALIZACIÓN 196 a 206 — reestructura de planes, 26 de noviembre de 2026
--  Pega TODO este archivo en el SQL Editor de Supabase (producción) y pulsa Run.
--  Va dentro de una sola transacción: si algo falla, no queda nada a medias.
--
--  Requiere la 195 aplicada (ya lo está desde el 24 de noviembre).
--  Córrelo ANTES de desplegar el código del PR #195: el código nuevo llama a
--  funciones que nacen aquí. El código que hoy está en producción sigue
--  funcionando con estas migraciones.
--  Si se corre dos veces no pasa nada: todas usan «create or replace»,
--  «if not exists» o «on conflict», y la 206 nunca vuelve a tocar un precio
--  que ya está en la tarifa vigente.
--
--  196 · Tarifas nuevas: Básico Q0, En línea Q75, Estándar Q149, Premium Q299.
--  197 · Cupones básicos en En línea y Estándar; compra mínima y límite de
--        usos solo en Premium.
--  198 · Cambio de plan confirmado: plan, cobro, modalidades e historial juntos.
--  199 · Inventario de platillos desde Estándar.
--  200 · Tope de 150 platillos activos en Básico y En línea.
--  201 · Una estación de impresión en Estándar.
--  202 · Resumen de ventas con los platillos más vendidos por unidades.
--  203 · Prueba gratis de 14 días por restaurante, sin tarjeta (queda
--        ENCENDIDA: decisión del dueño, 26 de noviembre) y cierre automático
--        cada minuto con pg_cron.
--  204 · Recordatorios de la prueba por correo.
--  205 · Una prueba en curso por dueño, ninguna si otra terminó sin
--        contratar, y cambio de plan durante la prueba.
--  206 · Las mensualidades automáticas que quedaron por encima de la tarifa
--        nueva bajan a ella. Nunca sube ninguna; los precios manuales y las
--        facturas emitidas no se tocan. Avisa cada cambio en «Messages».
--
--  Al terminar, la última consulta debe decir «sí» en las once filas.
--  Después, corre también supabase/verificar_huellas.sql (30 funciones).
--
--  Archivo GENERADO a partir de supabase/migrations/196 a 206: si cambia
--  una migración, vuelve a generarlo en lugar de editarlo a mano.
-- ============================================================

begin;

-- ============================================================
-- ========== migrations/196_nuevas_mensualidades.sql ==========
-- ============================================================

-- 196 · Nuevas mensualidades de contratación
-- Aplicar antes del despliegue. Conserva restaurant_billing (precio acordado
-- según la 191), facturas emitidas y tarifas de configuración asistida.

insert into public.platform_settings (key, value) values
  ('plan_price_BASICO',   '0'),
  ('plan_price_EN_LINEA', '75'),
  ('plan_price_ESTANDAR', '149'),
  ('plan_price_PREMIUM',  '299')
on conflict (key) do update set value = excluded.value
where platform_settings.value is distinct from excluded.value;

-- Tarifa de catálogo. La mensualidad particular se fija al contratar.
create or replace function public.leogin_catalog_plan_fee(p_plan text)
returns numeric
language sql stable set search_path = public
as $$
  select case p_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   0)
    when 'EN_LINEA' then leogin_setting_num('plan_price_EN_LINEA', 75)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 149)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  299)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',      599)
    else 0
  end;
$$;

revoke execute on function public.leogin_catalog_plan_fee(text) from public, anon, authenticated;

create or replace function public.leogin_compute_monthly_fee(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  return greatest(round(leogin_catalog_plan_fee(v_plan), 2), 0);
end;
$$;

create or replace function public.leogin_fee_breakdown(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text;
  v_base numeric;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return jsonb_build_object('plan', null); end if;
  v_base := leogin_catalog_plan_fee(v_plan);
  return jsonb_build_object('plan', v_plan, 'base', v_base, 'final', greatest(round(v_base, 2), 0));
end;
$$;


-- ============================================================
-- ========== migrations/197_cupones_en_linea_y_estandar.sql ==========
-- ============================================================

-- 197 · Cupones en En línea y Estándar
-- Aplicar antes del despliegue. Respeta los ajustes de activación del dueño.

create or replace function public.leogin_module_included_in_plan(p_plan text, p_key text)
returns boolean
language sql immutable
as $$
  select case
    when p_plan = 'PRO' then true
    when p_plan = 'PREMIUM' then
      p_key in ('llamada_mesero','encuestas','cupones','loyalty','recetas','reservaciones','lista_espera')
    when p_plan in ('EN_LINEA', 'ESTANDAR') then p_key = 'cupones'
    else false
  end;
$$;

update public.restaurants
   set modules = coalesce(modules, '{}'::jsonb) || '{"cupones":true}'::jsonb
 where plan_actual in ('EN_LINEA', 'ESTANDAR')
   and modules->'cupones' is distinct from 'true'::jsonb;

-- Protege el cambio de plan y la aplicación del cupón dentro de la
-- transacción del pedido. Las anulaciones aún pueden devolver usos.
create or replace function public.leogin_validar_plan_del_cupon()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  local restaurants%rowtype;
  aplica boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.uses < old.uses and new.min_order is not distinct from old.min_order
       and new.max_uses is not distinct from old.max_uses
       and new.is_active is not distinct from old.is_active then
      return new;
    end if;
    aplica := new.uses > old.uses;
  end if;

  select * into local from restaurants where id = new.restaurant_id for share;
  if not found then
    raise exception 'Restaurante no disponible.' using errcode = '23503';
  end if;

  if not (leogin_module_included_in_plan(local.plan_actual, 'cupones')
          or coalesce(local.modules->'cupones' = 'true'::jsonb, false))
     or local.module_settings #> '{cupones,enabled}' = 'false'::jsonb
     or (aplica and local.plan_actual = 'BASICO'
         and not coalesce(local.modules->'orders' = 'true'::jsonb, false)) then
    raise exception 'El cupón ya no está disponible.' using errcode = 'LGC01';
  end if;

  if local.plan_actual not in ('PREMIUM','PRO') then
    if tg_op = 'INSERT' and (new.min_order is not null or new.max_uses is not null) then
      raise exception 'La compra mínima y el límite de usos se configuran con Premium.' using errcode = '23514';
    elsif tg_op = 'UPDATE' and (
      (new.min_order is not null and new.min_order is distinct from old.min_order)
      or (new.max_uses is not null and new.max_uses is distinct from old.max_uses)
    ) then
      raise exception 'La compra mínima y el límite de usos se configuran con Premium.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.leogin_validar_plan_del_cupon() from public, anon, authenticated;

drop trigger if exists leogin_validar_plan_del_cupon on public.coupons;
create trigger leogin_validar_plan_del_cupon
before insert or update of min_order, max_uses, uses, is_active on public.coupons
for each row
execute function public.leogin_validar_plan_del_cupon();


-- ============================================================
-- ========== migrations/198_confirmar_cambio_de_plan.sql ==========
-- ============================================================

-- 198 · Confirmación de cambio de plan en una sola transacción
-- Aplicar después de la 196 y antes del código que usa este RPC.
-- Comprueba el importe confirmado y conserva facturas ya emitidas.

create or replace function public.leogin_confirmar_cambio_de_plan(
  p_restaurante uuid, p_actor uuid, p_anterior text, p_nuevo text, p_nombre text,
  p_modulos_anteriores jsonb, p_modulos_nuevos jsonb,
  p_modos_anteriores jsonb, p_modos_nuevos jsonb, p_importe numeric, p_moneda text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  local restaurants%rowtype;
  cobro restaurant_billing%rowtype;
  modo_actual jsonb;
  importe numeric;
  moneda text;
begin
  if p_nuevo is null or p_nuevo not in ('BASICO','EN_LINEA','ESTANDAR','PREMIUM') then
    raise exception 'Ese plan no está disponible.' using errcode = 'LGP01';
  end if;

  select * into local from restaurants where id = p_restaurante for update;
  if not found then
    raise exception 'Restaurante no encontrado.' using errcode = 'LGP01';
  end if;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;

  -- Reintento de una confirmación ya aplicada: conserva su auditoría y precio.
  if local.plan_actual = p_nuevo then
    if cobro.monthly_fee = p_importe and coalesce(cobro.currency, 'GTQ') = p_moneda then
      return false;
    end if;
    raise exception 'Ya tienes ese plan con otra mensualidad.' using errcode = 'LGP01';
  end if;
  if local.plan_actual is distinct from p_anterior or local.modules is distinct from p_modulos_anteriores then
    raise exception 'Tu plan o sus funciones cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;
  if cobro.trial_ends_at is not null and cobro.active = false then
    raise exception 'Contacta a Leogin para cambiar de plan mientras tienes una prueba.' using errcode = 'LGP01';
  end if;

  importe := case
    when p_nuevo = 'BASICO' then 0
    when cobro.auto_price = false then cobro.monthly_fee
    else greatest(round(leogin_catalog_plan_fee(p_nuevo), 2), 0)
  end;
  moneda := case when p_nuevo = 'BASICO' or cobro.auto_price is distinct from false
                then 'GTQ' else cobro.currency end;
  if importe is distinct from p_importe or moneda is distinct from p_moneda then
    raise exception 'La mensualidad cambió. Actualiza la página y revisa el nuevo importe.' using errcode = 'LGP01';
  end if;

  -- Solo espera los pedidos que perderían su modo o su flujo de atención.
  if exists (
    select 1 from orders
    where restaurant_id = p_restaurante and status not in ('DELIVERED','CANCEL')
      and (
        p_nuevo = 'BASICO'
        or (p_nuevo = 'EN_LINEA' and order_type = 'DINE_IN')
        or (p_nuevo = 'ESTANDAR' and p_anterior in ('PREMIUM','PRO') and table_number is not null)
      )
  ) then
    raise exception 'Completa o anula tus pedidos abiertos antes de bajar de plan.' using errcode = 'LGP01';
  end if;

  select config->'orderTypes' into modo_actual from restaurant_themes
  where restaurant_id = p_restaurante for update;
  if modo_actual is distinct from p_modos_anteriores then
    raise exception 'Tus modalidades de pedido cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;

  update restaurants set plan_actual = p_nuevo, modules = p_modulos_nuevos where id = p_restaurante;

  if p_modos_nuevos is distinct from modo_actual then
    insert into restaurant_themes (restaurant_id, config)
      values (p_restaurante, jsonb_build_object('orderTypes', p_modos_nuevos))
    on conflict (restaurant_id) do update
      set config = coalesce(restaurant_themes.config, '{}'::jsonb) || excluded.config;
  end if;

  insert into restaurant_billing (restaurant_id, monthly_fee, currency, billing_day, started_at,
                                  plan_del_precio, precio_fijado_en)
    values (p_restaurante, importe, moneda,
            least(28, extract(day from now() at time zone 'America/Guatemala')::int),
            (now() at time zone 'America/Guatemala')::date, p_nuevo, now())
  on conflict (restaurant_id) do update
    set monthly_fee = excluded.monthly_fee, currency = excluded.currency, plan_del_precio = excluded.plan_del_precio,
        precio_fijado_en = excluded.precio_fijado_en, updated_at = now(),
        auto_price = case when p_nuevo = 'BASICO' then true else restaurant_billing.auto_price end;

  insert into activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'plan_cambiado', p_nombre,
            jsonb_build_object('antes', p_anterior, 'despues', p_nuevo, 'mensualidad', importe, 'moneda', moneda));

  return true;
end;
$$;

revoke execute on function public.leogin_confirmar_cambio_de_plan(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric,text)
  from public, anon, authenticated;
grant execute on function public.leogin_confirmar_cambio_de_plan(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric,text)
  to service_role;


-- ============================================================
-- ========== migrations/199_inventario_de_productos_en_estandar.sql ==========
-- ============================================================

-- 199 · Inventario de productos terminados desde Estándar.
-- Aplicar antes del código. Recetas e ingredientes conservan su titularidad.
create or replace function public.leogin_plan_module_floor(p_plan text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('catalog', true)
      || case p_plan
           when 'BASICO'   then '{}'::jsonb
           when 'EN_LINEA' then '{"orders":true,"whatsapp_notify":true}'::jsonb
           when 'ESTANDAR' then '{"orders":true,"whatsapp_notify":true,"finanzas":true,"inventario":true}'::jsonb
           else '{"orders":true,"whatsapp_notify":true,"finanzas":true,
                  "analitica":true,"inventario":true,"personal":true}'::jsonb
         end
      || coalesce((
           select jsonb_object_agg(k, true)
             from unnest(leogin_addon_module_keys()) k
            where leogin_module_included_in_plan(p_plan, k)
         ), '{}'::jsonb);
$$;

update public.restaurants
   set modules = coalesce(modules, '{}'::jsonb) || '{"inventario":true}'::jsonb
 where plan_actual = 'ESTANDAR'
   and modules->'inventario' is distinct from 'true'::jsonb;


-- ============================================================
-- ========== migrations/200_cupo_de_platillos_activos.sql ==========
-- ============================================================

-- 200 · Cupo de platillos activos en Básico y En línea.
-- Aplicar antes del código. Los platillos ya activos quedan como están.
create or replace function public.leogin_validar_cupo_del_catalogo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  plan text;
begin
  if new.is_active is not true then return new; end if;
  if tg_op = 'UPDATE' and old.is_active is true and old.restaurant_id = new.restaurant_id then
    return new;
  end if;

  -- Una publicación a la vez por local, incluido publicar un lote.
  select plan_actual into plan from restaurants where id = new.restaurant_id for no key update;
  if plan in ('BASICO','EN_LINEA') and (
    select count(*) from products where restaurant_id = new.restaurant_id and is_active is true
  ) >= 150 then
    raise exception 'Llegaste al límite de 150 platillos activos. Oculta un platillo o cambia de plan para publicar más.'
      using errcode = 'LGD02';
  end if;
  return new;
end;
$$;

revoke execute on function public.leogin_validar_cupo_del_catalogo() from public, anon, authenticated;

drop trigger if exists leogin_validar_cupo_del_catalogo on public.products;
create trigger leogin_validar_cupo_del_catalogo
before insert or update of is_active, restaurant_id on public.products
for each row execute function public.leogin_validar_cupo_del_catalogo();


-- ============================================================
-- ========== migrations/201_impresion_en_estandar.sql ==========
-- ============================================================

-- 201 · Una estación de impresión nueva por local Estándar.
-- Los destinos ya configurados se pueden seguir usando y editando.
-- Aplicar antes de desplegar el catálogo que anuncia esta modalidad.
create or replace function public.leogin_validar_cupo_de_estaciones()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  plan text;
begin
  if tg_op = 'UPDATE' and old.restaurant_id = new.restaurant_id then return new; end if;
  select plan_actual into plan from restaurants where id = new.restaurant_id for no key update;
  if plan = 'ESTANDAR' and exists (
    select 1 from print_stations where restaurant_id = new.restaurant_id
  ) then
    raise exception 'Estándar incluye una impresora de comandas. Puedes cambiar su destino en la estación actual.'
      using errcode = 'LGP02';
  end if;
  return new;
end;
$$;

revoke execute on function public.leogin_validar_cupo_de_estaciones() from public, anon, authenticated;

drop trigger if exists leogin_validar_cupo_de_estaciones on public.print_stations;
create trigger leogin_validar_cupo_de_estaciones
before insert or update of restaurant_id on public.print_stations
for each row execute function public.leogin_validar_cupo_de_estaciones();


-- ============================================================
-- ========== migrations/202_resumen_de_ventas.sql ==========
-- ============================================================

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


-- ============================================================
-- ========== migrations/203_prueba_voluntaria_por_restaurante.sql ==========
-- ============================================================

-- 203 · Prueba voluntaria de 14 días por establecimiento.
-- Aplicar antes del código. Las pruebas ya creadas conservan su flujo.
alter table public.restaurant_billing
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_started_by uuid references auth.users(id) on delete set null,
  add column if not exists trial_plan text,
  add column if not exists trial_confirmed_at timestamptz,
  add column if not exists trial_confirmed_fee numeric(10,2),
  add column if not exists trial_finished_at timestamptz;

create index if not exists restaurant_billing_pruebas_por_vencer
  on public.restaurant_billing (trial_ends_at)
  where trial_started_at is not null and trial_finished_at is null;

insert into public.platform_settings(key, value) values ('prueba_voluntaria_activa','1')
on conflict (key) do nothing;

create or replace function public.leogin_iniciar_prueba_de_plan(
  p_restaurante uuid, p_actor uuid, p_nuevo text, p_nombre text,
  p_modulos_anteriores jsonb, p_modulos_nuevos jsonb,
  p_modos_anteriores jsonb, p_modos_nuevos jsonb, p_importe numeric
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  cobro restaurant_billing%rowtype;
  inicio timestamptz := clock_timestamp();
begin
  perform 1 from restaurants where id = p_restaurante for update;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;
  if cobro.trial_started_at is not null or cobro.trial_ends_at is not null then
    raise exception 'Este restaurante ya usó su prueba.' using errcode = 'LGP01';
  end if;
  if p_nuevo is null or p_nuevo not in ('EN_LINEA','ESTANDAR','PREMIUM')
     or leogin_setting_num('prueba_voluntaria_activa', 0) <> 1 then
    raise exception 'La prueba no está disponible.' using errcode = 'LGP01';
  end if;
  if not leogin_confirmar_cambio_de_plan(p_restaurante, p_actor, 'BASICO', p_nuevo, p_nombre,
      p_modulos_anteriores, p_modulos_nuevos, p_modos_anteriores, p_modos_nuevos, p_importe, 'GTQ') then
    raise exception 'El plan de este restaurante cambió. Actualiza la página.' using errcode = 'LGP01';
  end if;
  update restaurant_billing
     set active = false, trial_started_at = inicio, trial_started_by = p_actor,
         trial_ends_at = inicio + interval '336 hours', trial_plan = p_nuevo, updated_at = inicio
   where restaurant_id = p_restaurante;
  return true;
end;
$$;

create or replace function public.leogin_confirmar_prueba_de_plan(
  p_restaurante uuid, p_actor uuid, p_plan text, p_importe numeric, p_vencimiento timestamptz, p_acepta boolean
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  cobro restaurant_billing%rowtype;
  plan text;
begin
  select plan_actual into plan from restaurants where id = p_restaurante for update;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;
  if cobro.trial_plan is distinct from p_plan or plan is distinct from p_plan
      or cobro.trial_ends_at is distinct from p_vencimiento then
    raise exception 'Tu prueba cambió. Actualiza la página y revisa la mensualidad.' using errcode = 'LGP01';
  end if;
  if p_acepta and cobro.trial_confirmed_at is not null and cobro.trial_confirmed_fee = p_importe then
    return false;
  end if;
  if cobro.trial_started_at is null or cobro.trial_finished_at is not null
     or cobro.active or cobro.trial_ends_at <= clock_timestamp() then
    raise exception 'La prueba ya terminó.' using errcode = 'LGP01';
  end if;
  if p_acepta is false then
    if cobro.trial_confirmed_at is null then return false; end if;
    update restaurant_billing
       set trial_confirmed_at = null, trial_confirmed_fee = null, updated_at = now()
     where restaurant_id = p_restaurante;
    insert into activity_log (restaurant_id, actor_id, action, entity)
      values (p_restaurante, p_actor, 'contratacion_retirada_en_prueba', p_plan);
    return true;
  end if;
  if p_acepta is distinct from true or p_importe is distinct from cobro.monthly_fee or cobro.currency <> 'GTQ' then
    raise exception 'La mensualidad cambió. Actualiza la página antes de confirmar.' using errcode = 'LGP01';
  end if;
  update restaurant_billing
     set trial_confirmed_at = now(), trial_confirmed_fee = p_importe, updated_at = now()
   where restaurant_id = p_restaurante;
  insert into activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'contratacion_tras_prueba', p_plan,
      jsonb_build_object('mensualidad', p_importe, 'moneda', 'GTQ', 'desde', p_vencimiento));
  return true;
end;
$$;

create or replace function public.leogin_cerrar_pruebas_voluntarias()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  pendiente record;
  local restaurants%rowtype;
  cobro restaurant_billing%rowtype;
  fecha date;
  resueltas int := 0;
begin
  for pendiente in
    select restaurant_id from restaurant_billing
    where trial_started_at is not null and trial_finished_at is null and trial_ends_at <= now()
    order by trial_ends_at limit 100
  loop
    select * into local from restaurants where id = pendiente.restaurant_id for update skip locked;
    if not found then continue; end if;
    select * into cobro from restaurant_billing where restaurant_id = local.id for update;
    if cobro.trial_finished_at is not null then continue; end if;
    fecha := (cobro.trial_ends_at at time zone 'America/Guatemala')::date;

    if cobro.trial_confirmed_at is not null and cobro.trial_confirmed_fee is not null
       and local.plan_actual = cobro.trial_plan then
      -- La primera factura vence el día acordado, incluso el 29, 30 o 31.
      -- Las siguientes usan el día recurrente que admite el motor actual.
      if cobro.trial_confirmed_fee > 0 then
        insert into invoices (restaurant_id, concept, description, period, amount, currency, status, due_date)
        values (local.id, 'MONTHLY', 'Primera mensualidad después de la prueba',
                date_trunc('month', fecha)::date, cobro.trial_confirmed_fee, 'GTQ', 'PENDING', fecha)
        on conflict do nothing;
      end if;
      update restaurant_billing
         set active = true, monthly_fee = cobro.trial_confirmed_fee, plan_del_precio = cobro.trial_plan,
             precio_fijado_en = cobro.trial_confirmed_at, started_at = fecha,
             billing_day = least(28, extract(day from fecha)::int), trial_finished_at = now(), updated_at = now()
       where restaurant_id = local.id;
    else
      update restaurants
         set plan_actual = 'BASICO',
             modules = (coalesce(modules, '{}'::jsonb) - array[
               'orders','whatsapp_notify','finanzas','analitica','inventario','personal','cupones',
               'llamada_mesero','encuestas','loyalty','recetas','reservaciones','lista_espera'
             ]) || leogin_plan_module_floor('BASICO')
       where id = local.id;
      update restaurant_billing
         set active = true, monthly_fee = 0, auto_price = true, plan_del_precio = 'BASICO',
             precio_fijado_en = now(), trial_finished_at = now(), updated_at = now()
       where restaurant_id = local.id;
    end if;
    insert into activity_log (restaurant_id, action, entity, meta)
      values (local.id, 'prueba_terminada', cobro.trial_plan,
              jsonb_build_object('contratada', cobro.trial_confirmed_at is not null and local.plan_actual = cobro.trial_plan));
    resueltas := resueltas + 1;
  end loop;
  return resueltas;
end;
$$;

create or replace function public.leogin_graduate_trials()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  nuevos int := leogin_cerrar_pruebas_voluntarias();
  anteriores int;
  hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  update restaurant_billing
     set active = true, started_at = hoy, billing_day = least(28, extract(day from hoy)::int), updated_at = now()
   where active = false and trial_ends_at <= now() and trial_started_at is null;
  get diagnostics anteriores = row_count;
  return nuevos + anteriores;
end;
$$;

-- Cierra nuevas ventas aunque el reloj aún no haya actualizado el plan.
-- Las actualizaciones de pedidos ya aceptados conservan su vía normal.
create or replace function public.leogin_pedido_durante_prueba()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from restaurant_billing b
    join restaurants r on r.id = b.restaurant_id
    where r.id = new.restaurant_id and b.trial_started_at is not null
      and b.trial_ends_at <= clock_timestamp()
      and ((b.trial_finished_at is null and b.trial_confirmed_at is null) or r.plan_actual = 'BASICO')
  ) then
    raise exception 'La prueba del restaurante terminó. Su carta sigue disponible.' using errcode = 'LGP03';
  end if;
  return new;
end;
$$;

drop trigger if exists leogin_pedido_durante_prueba on public.orders;
create trigger leogin_pedido_durante_prueba
before insert on public.orders for each row execute function public.leogin_pedido_durante_prueba();

revoke execute on function public.leogin_iniciar_prueba_de_plan(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,numeric) from public, anon, authenticated;
revoke execute on function public.leogin_confirmar_prueba_de_plan(uuid,uuid,text,numeric,timestamptz,boolean) from public, anon, authenticated;
revoke execute on function public.leogin_cerrar_pruebas_voluntarias() from public, anon, authenticated;
revoke execute on function public.leogin_pedido_durante_prueba() from public, anon, authenticated;
grant execute on function public.leogin_iniciar_prueba_de_plan(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,numeric) to service_role;
grant execute on function public.leogin_confirmar_prueba_de_plan(uuid,uuid,text,numeric,timestamptz,boolean) to service_role;
grant execute on function public.leogin_cerrar_pruebas_voluntarias() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leogin-cerrar-pruebas-voluntarias', '* * * * *', 'select public.leogin_cerrar_pruebas_voluntarias();');
  end if;
end;
$$;


-- ============================================================
-- ========== migrations/204_recordatorios_de_prueba.sql ==========
-- ============================================================

-- 204 · Recordatorios de prueba con una reserva temporal por envío.
-- Aplicar antes de desplegar el endpoint que ejecuta el reloj de salud.
create table if not exists public.prueba_aviso_envios (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tipo text not null check (tipo in ('previo','vence')),
  reservado_hasta timestamptz not null,
  enviado_en timestamptz,
  primary key (restaurant_id, tipo)
);
alter table public.prueba_aviso_envios enable row level security;
drop policy if exists super_admin_segundo_factor on public.prueba_aviso_envios;
create policy super_admin_segundo_factor on public.prueba_aviso_envios
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.prueba_aviso_envios from public, anon, authenticated, service_role;
grant select, update on public.prueba_aviso_envios to service_role;

create or replace function public.leogin_tomar_avisos_de_prueba()
returns table (restaurante uuid, tipo text, correo text, nombre text, slug text,
               vence timestamptz, confirmado boolean, reserva timestamptz)
language sql security definer set search_path = public
as $$
  with candidatos as (
    select r.id, r.name, r.slug, u.email, b.trial_ends_at,
           b.trial_confirmed_at is not null as confirmado,
           case when b.trial_ends_at > now() then 'previo' else 'vence' end as tipo
      from restaurant_billing b
      join restaurants r on r.id = b.restaurant_id
      join auth.users u on u.id = b.trial_started_by
     where b.trial_started_at is not null
       and b.trial_ends_at <= now() + interval '3 days'
       and b.trial_ends_at > now() - interval '24 hours'
       and u.email is not null
  ), nuevos as (
    select c.*
      from candidatos c
      left join prueba_aviso_envios e on e.restaurant_id = c.id and e.tipo = c.tipo
     where e.enviado_en is null and coalesce(e.reservado_hasta, '-infinity'::timestamptz) <= now()
     order by c.trial_ends_at
     limit 6
  ), reservados as (
    insert into prueba_aviso_envios as e (restaurant_id, tipo, reservado_hasta)
      select id, n.tipo, now() + interval '15 minutes' from nuevos n
    on conflict on constraint prueba_aviso_envios_pkey
    do update set reservado_hasta = excluded.reservado_hasta
      where e.enviado_en is null and e.reservado_hasta <= now()
    returning e.restaurant_id, e.tipo, e.reservado_hasta
  )
  select n.id, n.tipo, n.email, n.name, n.slug, n.trial_ends_at, n.confirmado, e.reservado_hasta
    from nuevos n join reservados e on e.restaurant_id = n.id and e.tipo = n.tipo;
$$;

revoke execute on function public.leogin_tomar_avisos_de_prueba() from public, anon, authenticated;
grant execute on function public.leogin_tomar_avisos_de_prueba() to service_role;


-- ============================================================
-- ========== migrations/205_prueba_por_dueno_y_cambio_en_prueba.sql ==========
-- ============================================================

-- 205 · Una prueba por dueño a la vez y cambio de plan durante la prueba
-- Aplicar después de la 204 y antes del código que llama a
-- leogin_cambiar_plan_en_prueba y leogin_motivo_sin_prueba.
--
-- La 203 dejó la prueba por establecimiento sin ningún control por persona:
-- bastaba con crear otro restaurante cada 14 días para no pagar nunca. La
-- regla de aquí es proporcionada (especificación del 25 de noviembre, §6):
--   · cada establecimiento tiene una sola prueba (sigue igual);
--   · un dueño no puede tener dos pruebas en curso a la vez;
--   · si una prueba suya venció o terminó sin contratar, sus restaurantes
--     nuevos ya no llevan prueba. Quien contrató sí puede probar en el
--     siguiente local, que es el caso legítimo de abrir una sucursal.
-- Las pruebas del flujo anterior (sin trial_started_at) no cuentan.

-- ── 1. ¿Puede este dueño empezar una prueba aquí? ──────────────
-- null = sí; 'en_curso' = tiene otra prueba abierta; 'usada' = una prueba
-- anterior terminó sin contratar.
create or replace function public.leogin_motivo_sin_prueba(p_dueno uuid, p_restaurante uuid default null)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_dueno is null then 'usada'
    when exists (
      select 1 from restaurant_billing b
       where b.trial_started_by = p_dueno
         and b.trial_started_at is not null
         and b.trial_finished_at is null
         and b.restaurant_id is distinct from p_restaurante
    ) then 'en_curso'
    when exists (
      select 1 from restaurant_billing b
       where b.trial_started_by = p_dueno
         and b.trial_started_at is not null
         and b.trial_finished_at is not null
         and b.trial_confirmed_at is null
         and b.restaurant_id is distinct from p_restaurante
    ) then 'usada'
    else null
  end;
$$;

-- ── 2. La regla vale por cualquier camino que abra una prueba ──
-- Alta desde Mi cuenta (insert) y prueba desde Suscripción (update). El
-- candado por dueño evita que dos altas simultáneas se salten la regla.
create or replace function public.leogin_validar_prueba_del_dueno()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  motivo text;
begin
  if new.trial_started_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.trial_started_at is not null then return new; end if;
  if new.trial_started_by is null then
    raise exception 'La prueba necesita al dueño que la inicia.' using errcode = 'LGP01';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('leogin_prueba:' || new.trial_started_by::text, 0));
  motivo := leogin_motivo_sin_prueba(new.trial_started_by, new.restaurant_id);
  if motivo = 'en_curso' then
    raise exception 'Ya tienes una prueba en curso en otro restaurante. Puedes contratar este plan directamente.'
      using errcode = 'LGP01';
  elsif motivo = 'usada' then
    raise exception 'Ya usaste tu prueba gratis en otro restaurante. Puedes contratar este plan directamente.'
      using errcode = 'LGP01';
  end if;
  return new;
end;
$$;

drop trigger if exists leogin_validar_prueba_del_dueno on public.restaurant_billing;
create trigger leogin_validar_prueba_del_dueno
before insert or update of trial_started_at on public.restaurant_billing
for each row execute function public.leogin_validar_prueba_del_dueno();

-- ── 3. Cambiar de plan mientras dura la prueba ─────────────────
-- Antes la 198 respondía «Contacta a Leogin». Ahora el dueño puede:
--   · probar otro plan de pago: la prueba sigue con la misma fecha de
--     vencimiento y la contratación confirmada se retira (la confirma de
--     nuevo con el precio del plan nuevo);
--   · volver a Básico: la prueba termina en ese momento, sin cobro.
create or replace function public.leogin_cambiar_plan_en_prueba(
  p_restaurante uuid, p_actor uuid, p_anterior text, p_nuevo text, p_nombre text,
  p_modulos_anteriores jsonb, p_modulos_nuevos jsonb,
  p_modos_anteriores jsonb, p_modos_nuevos jsonb, p_importe numeric
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  local restaurants%rowtype;
  cobro restaurant_billing%rowtype;
  modo_actual jsonb;
  importe numeric;
  hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  if p_nuevo is null or p_nuevo not in ('BASICO','EN_LINEA','ESTANDAR','PREMIUM') then
    raise exception 'Ese plan no está disponible.' using errcode = 'LGP01';
  end if;

  select * into local from restaurants where id = p_restaurante for update;
  if not found then
    raise exception 'Restaurante no encontrado.' using errcode = 'LGP01';
  end if;
  select * into cobro from restaurant_billing where restaurant_id = p_restaurante for update;

  -- Reintento de un cambio ya aplicado.
  if local.plan_actual = p_nuevo then return false; end if;

  if cobro.trial_started_at is null or cobro.trial_finished_at is not null
     or cobro.active or cobro.trial_ends_at <= clock_timestamp() then
    raise exception 'Tu prueba ya terminó. Actualiza la página.' using errcode = 'LGP01';
  end if;
  if local.plan_actual is distinct from p_anterior or local.modules is distinct from p_modulos_anteriores then
    raise exception 'Tu plan o sus funciones cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;

  importe := case when p_nuevo = 'BASICO' then 0
                  else greatest(round(leogin_catalog_plan_fee(p_nuevo), 2), 0) end;
  if importe is distinct from p_importe then
    raise exception 'La mensualidad cambió. Actualiza la página y revisa el nuevo importe.' using errcode = 'LGP01';
  end if;

  -- Misma regla que la 198: solo esperan los pedidos que perderían su modo o su mesa.
  if exists (
    select 1 from orders
    where restaurant_id = p_restaurante and status not in ('DELIVERED','CANCEL')
      and (
        p_nuevo = 'BASICO'
        or (p_nuevo = 'EN_LINEA' and order_type = 'DINE_IN')
        or (p_nuevo = 'ESTANDAR' and p_anterior in ('PREMIUM','PRO') and table_number is not null)
      )
  ) then
    raise exception 'Completa o anula tus pedidos abiertos antes de bajar de plan.' using errcode = 'LGP01';
  end if;

  select config->'orderTypes' into modo_actual from restaurant_themes
  where restaurant_id = p_restaurante for update;
  if modo_actual is distinct from p_modos_anteriores then
    raise exception 'Tus modalidades de pedido cambiaron. Actualiza la página y vuelve a confirmar.' using errcode = 'LGP01';
  end if;

  update restaurants set plan_actual = p_nuevo, modules = p_modulos_nuevos where id = p_restaurante;

  if p_modos_nuevos is distinct from modo_actual then
    insert into restaurant_themes (restaurant_id, config)
      values (p_restaurante, jsonb_build_object('orderTypes', p_modos_nuevos))
    on conflict (restaurant_id) do update
      set config = coalesce(restaurant_themes.config, '{}'::jsonb) || excluded.config;
  end if;

  if p_nuevo = 'BASICO' then
    update restaurant_billing
       set active = true, monthly_fee = 0, auto_price = true, plan_del_precio = 'BASICO',
           precio_fijado_en = now(), started_at = hoy, billing_day = least(28, extract(day from hoy)::int),
           trial_confirmed_at = null, trial_confirmed_fee = null, trial_finished_at = now(), updated_at = now()
     where restaurant_id = p_restaurante;
  else
    update restaurant_billing
       set monthly_fee = importe, currency = 'GTQ', plan_del_precio = p_nuevo, precio_fijado_en = now(),
           trial_plan = p_nuevo, trial_confirmed_at = null, trial_confirmed_fee = null, updated_at = now()
     where restaurant_id = p_restaurante;
  end if;

  insert into activity_log (restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'plan_cambiado_en_prueba', p_nombre,
            jsonb_build_object('antes', p_anterior, 'despues', p_nuevo, 'mensualidad', importe,
                               'prueba_terminada', p_nuevo = 'BASICO'));
  return true;
end;
$$;

-- ── 4. Avisos: no avisar de una prueba que el dueño ya terminó ─
-- Misma función que la 204 con una condición más: una prueba cerrada antes
-- de su vencimiento (vuelta voluntaria a Básico) no recibe recordatorios.
create or replace function public.leogin_tomar_avisos_de_prueba()
returns table (restaurante uuid, tipo text, correo text, nombre text, slug text,
               vence timestamptz, confirmado boolean, reserva timestamptz)
language sql security definer set search_path = public
as $$
  with candidatos as (
    select r.id, r.name, r.slug, u.email, b.trial_ends_at,
           b.trial_confirmed_at is not null as confirmado,
           case when b.trial_ends_at > now() then 'previo' else 'vence' end as tipo
      from restaurant_billing b
      join restaurants r on r.id = b.restaurant_id
      join auth.users u on u.id = b.trial_started_by
     where b.trial_started_at is not null
       and (b.trial_finished_at is null or b.trial_finished_at >= b.trial_ends_at)
       and b.trial_ends_at <= now() + interval '3 days'
       and b.trial_ends_at > now() - interval '24 hours'
       and u.email is not null
  ), nuevos as (
    select c.*
      from candidatos c
      left join prueba_aviso_envios e on e.restaurant_id = c.id and e.tipo = c.tipo
     where e.enviado_en is null and coalesce(e.reservado_hasta, '-infinity'::timestamptz) <= now()
     order by c.trial_ends_at
     limit 6
  ), reservados as (
    insert into prueba_aviso_envios as e (restaurant_id, tipo, reservado_hasta)
      select id, n.tipo, now() + interval '15 minutes' from nuevos n
    on conflict on constraint prueba_aviso_envios_pkey
    do update set reservado_hasta = excluded.reservado_hasta
      where e.enviado_en is null and e.reservado_hasta <= now()
    returning e.restaurant_id, e.tipo, e.reservado_hasta
  )
  select n.id, n.tipo, n.email, n.name, n.slug, n.trial_ends_at, n.confirmado, e.reservado_hasta
    from nuevos n join reservados e on e.restaurant_id = n.id and e.tipo = n.tipo;
$$;

revoke execute on function public.leogin_motivo_sin_prueba(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.leogin_validar_prueba_del_dueno() from public, anon, authenticated;
revoke execute on function public.leogin_cambiar_plan_en_prueba(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric)
  from public, anon, authenticated;
revoke execute on function public.leogin_tomar_avisos_de_prueba() from public, anon, authenticated;
grant execute on function public.leogin_motivo_sin_prueba(uuid, uuid) to service_role;
grant execute on function public.leogin_cambiar_plan_en_prueba(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric)
  to service_role;
grant execute on function public.leogin_tomar_avisos_de_prueba() to service_role;


-- ============================================================
-- ========== migrations/206_bajar_mensualidades_a_la_tarifa_vigente.sql ==========
-- ============================================================

-- 206 · Bajar a la tarifa vigente las mensualidades que quedaron por encima
-- Aplicar después de la 196 (y de la 205), antes o junto con el despliegue.
--
-- La 191 hace que `monthly_fee` sea el precio acordado: cambiar las tarifas
-- globales no mueve lo que ya paga un restaurante. Eso protege al cliente
-- cuando una tarifa SUBE, pero cuando BAJA lo deja pagando más que lo que
-- anuncia la web (Premium Q349 frente a Q299). Decisión del dueño, 26 nov
-- 2026: los restaurantes en precio automático pasan a la tarifa vigente si
-- es menor. Nunca se sube una mensualidad, el precio manual (acordado a
-- mano) no se toca y las facturas ya emitidas siguen como están.

create or replace function public.leogin_bajar_a_tarifa_vigente()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_vigente numeric;
  v_count int := 0;
begin
  for r in
    select b.restaurant_id, b.monthly_fee, rs.plan_actual
      from restaurant_billing b
      join restaurants rs on rs.id = b.restaurant_id
     where b.auto_price = true
       and rs.plan_actual is not null
     for update of b
  loop
    v_vigente := leogin_compute_monthly_fee(r.restaurant_id);
    if v_vigente is not null and v_vigente < r.monthly_fee then
      update restaurant_billing
         set monthly_fee = v_vigente, plan_del_precio = r.plan_actual,
             precio_fijado_en = now(), updated_at = now()
       where restaurant_id = r.restaurant_id;
      insert into activity_log (restaurant_id, action, entity, meta)
        values (r.restaurant_id, 'mensualidad_bajada_a_tarifa_vigente', r.plan_actual,
                jsonb_build_object('antes', r.monthly_fee, 'despues', v_vigente));
      raise notice 'Restaurante %: Q% -> Q% (%)', r.restaurant_id, r.monthly_fee, v_vigente, r.plan_actual;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.leogin_bajar_a_tarifa_vigente() from public, anon, authenticated;
grant execute on function public.leogin_bajar_a_tarifa_vigente() to service_role;

select public.leogin_bajar_a_tarifa_vigente();


commit;

-- ¿Quedaron aplicadas?
select '196' as migracion, case when to_regprocedure('public.leogin_catalog_plan_fee(text)') is not null then 'sí' else 'NO' end as aplicada
union all
select '197', case when to_regprocedure('public.leogin_validar_plan_del_cupon()') is not null then 'sí' else 'NO' end
union all
select '198', case when to_regprocedure('public.leogin_confirmar_cambio_de_plan(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric,text)') is not null then 'sí' else 'NO' end
union all
select '199', case when public.leogin_plan_module_floor('ESTANDAR')->'inventario' = 'true'::jsonb then 'sí' else 'NO' end
union all
select '200', case when to_regprocedure('public.leogin_validar_cupo_del_catalogo()') is not null then 'sí' else 'NO' end
union all
select '201', case when to_regprocedure('public.leogin_validar_cupo_de_estaciones()') is not null then 'sí' else 'NO' end
union all
select '202', case when pg_get_functiondef(to_regprocedure('public.leogin_sales_report(uuid,date,date,text,integer)')) like '%topByQuantity%' then 'sí' else 'NO' end
union all
select '203', case when to_regprocedure('public.leogin_cerrar_pruebas_voluntarias()') is not null then 'sí' else 'NO' end
union all
select '204', case when to_regprocedure('public.leogin_tomar_avisos_de_prueba()') is not null then 'sí' else 'NO' end
union all
select '205', case when to_regprocedure('public.leogin_cambiar_plan_en_prueba(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,numeric)') is not null
     and exists (select 1 from pg_trigger where tgname = 'leogin_validar_prueba_del_dueno') then 'sí' else 'NO' end
union all
select '206', case when to_regprocedure('public.leogin_bajar_a_tarifa_vigente()') is not null then 'sí' else 'NO' end;
