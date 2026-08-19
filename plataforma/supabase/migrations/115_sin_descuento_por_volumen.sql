/* ============================================================
   115 — Se retira el descuento por volumen de sucursales
   ------------------------------------------------------------
   Venía de la 072: 10% con 2-4 locales activos en un grupo, 15% con 5-9,
   20% con 10+, sobre el neto del plan de cada sucursal salvo la fundadora.

   Se quita por decisión de negocio. A partir de aquí cada local paga su
   plan, pertenezca o no a una cadena.

   OJO — ESTO SUBE EL PRECIO A CLIENTES ACTUALES. Solo afecta a los
   restaurantes que hoy están dentro de un grupo con dos o más locales
   activos; un restaurante suelto nunca tuvo descuento y no cambia. Al
   final la migración deja en los avisos (NOTICE) cuántos suben y de
   cuánto a cuánto, para que se pueda revisar ANTES de facturar el mes.
   ============================================================ */

-- ── Foto del antes, para poder informar del cambio ──────────
-- Sin `on commit drop`: si el editor de SQL corre cada sentencia en su
-- propia transaccion, esa clausula la borraria al instante y el informe
-- del final se quedaria sin con que comparar. Una tabla temporal vive por
-- sesion; se borra a mano al terminar.
drop table if exists _fee_antes;
create temporary table _fee_antes as
  select restaurant_id, monthly_fee
    from restaurant_billing
   where auto_price = true;

-- ── 1. Mensualidad, sin el factor de sucursales ─────────────
create or replace function leogin_compute_monthly_fee(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_plan       text;
  v_base       numeric;
  v_per        numeric;
  v_max_off    int;
  v_active     int;
  v_disabled   int;
  v_chan_disc  numeric := 0;
  v_addon      numeric := 0;
  v_plan_net   numeric;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return 0; end if;

  v_base := case v_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   149)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 299)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  599)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',      999)
    else null
  end;
  if v_base is null then return 0; end if;

  if leogin_plan_has_channel_discount(v_plan) then
    v_per      := leogin_setting_num('channel_discount_per', 50);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 2)::int);
    v_active   := leogin_billed_active_channels(p_restaurant_id, p_period_start);
    v_disabled := least(greatest(3 - v_active, 0), v_max_off); -- piso: siempre se paga >= 1 método
    v_chan_disc := v_disabled * v_per;
  end if;

  v_plan_net := greatest(v_base - v_chan_disc, 0);
  v_addon    := coalesce((leogin_billed_addon_modules(p_restaurant_id, p_period_start)->>'total')::numeric, 0);

  return greatest(round(v_plan_net + v_addon), 0);
end;
$$;

-- ── 2. Desglose para el dueño, sin la línea de sucursales ────
create or replace function leogin_fee_breakdown(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan          text;
  v_base          numeric;
  v_active_live   int;
  v_active_billed int;
  v_per           numeric;
  v_max_off       int;
  v_disabled      int := 0;
  v_applies       boolean := false;
  v_chan_disc     numeric := 0;
  v_addons        jsonb;
  v_final         numeric;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return jsonb_build_object('plan', null); end if;

  v_base := case v_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   149)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 299)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  599)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',      999)
    else 0
  end;

  v_applies       := leogin_plan_has_channel_discount(v_plan);
  v_active_live   := leogin_active_channels(p_restaurant_id);
  v_active_billed := leogin_billed_active_channels(p_restaurant_id, p_period_start);
  if v_applies then
    v_per      := leogin_setting_num('channel_discount_per', 50);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 2)::int);
    v_disabled := least(greatest(3 - v_active_billed, 0), v_max_off);
    v_chan_disc := v_disabled * v_per;
  end if;

  v_addons := leogin_billed_addon_modules(p_restaurant_id, p_period_start);
  v_final  := leogin_compute_monthly_fee(p_restaurant_id, p_period_start);

  return jsonb_build_object(
    'plan',                   v_plan,
    'base',                   v_base,
    'channels_active_live',   v_active_live,
    'channels_active_billed', v_active_billed,
    'channels_total',         3,
    'discount_applies',       v_applies,
    'discount_per',           coalesce(v_per, 0),
    'channels_off',           v_disabled,
    'channels_off_keys',      leogin_billed_channels_off(p_restaurant_id, p_period_start),
    'discount',               v_chan_disc,
    'addon_total',            coalesce((v_addons->>'total')::numeric, 0),
    'addon_items',            coalesce(v_addons->'items', '[]'::jsonb),
    'final',                  v_final
  );
end;
$$;

-- ── 3. Fuera la función del descuento ───────────────────────
-- Ya no la llama nadie (los dos únicos usos eran los de arriba). Se borra
-- en vez de dejarla huérfana: una función de precio que existe pero no se
-- aplica es una trampa para el próximo que lea esto.
drop function if exists leogin_branch_discount_pct(uuid, uuid);

-- ── 4. Refrescar las mensualidades ya guardadas ─────────────
-- Sin esto el cambio no se notaría: `restaurant_billing.monthly_fee`
-- conserva el número calculado CON descuento hasta que algo lo recalcule.
select leogin_apply_auto_price_all();

-- ── 5. Informe de a quién le sube y cuánto ──────────────────
do $$
declare
  r record;
  v_n int := 0;
  v_delta numeric := 0;
begin
  for r in
    select b.restaurant_id, x.name, a.monthly_fee as antes, b.monthly_fee as ahora
      from restaurant_billing b
      join _fee_antes a on a.restaurant_id = b.restaurant_id
      join restaurants x on x.id = b.restaurant_id
     where b.monthly_fee is distinct from a.monthly_fee
     order by (b.monthly_fee - a.monthly_fee) desc
  loop
    v_n := v_n + 1;
    v_delta := v_delta + (r.ahora - r.antes);
    raise notice '  % : % -> %  (%+)', r.name, r.antes, r.ahora, (r.ahora - r.antes);
  end loop;

  if v_n = 0 then
    raise notice 'Ningun restaurante cambia de mensualidad: no habia grupos con descuento activo.';
  else
    raise notice '% restaurantes cambian de mensualidad. Diferencia total: %+ al mes.', v_n, v_delta;
    raise notice 'Revisalo ANTES de generar la factura del mes: a estos clientes les sube el precio.';
  end if;
end $$;

drop table if exists _fee_antes;
