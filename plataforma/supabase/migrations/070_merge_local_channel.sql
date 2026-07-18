-- ============================================================
--  Migración 070 — Fusionar "comer en local" + "para llevar" en
--  un solo canal "Local" para el descuento de "Plan a tu medida"
--  ------------------------------------------------------------
--  Decisión del dueño (2026-07-04): el panel mostraba 3 canales de
--  servicio (comer en local / para llevar / a domicilio) como si
--  fueran independientes para efectos de precio, lo cual confundía
--  ("¿por qué desactivar uno de dos modos tan parecidos cuenta como
--  un canal completo?"). Ahora hay 2 canales para precio: "Local"
--  (dine_in + pickup, cualquiera de los dos cuenta como el canal
--  activo) y "Domicilio" (delivery). El dueño sigue pudiendo
--  activar/desactivar dine_in y pickup por separado en la UI (para
--  llevar sin mesas, por ejemplo) — lo que cambia es solo el conteo
--  para el descuento, no el almacenamiento (orderTypes sigue las
--  mismas 3 llaves en restaurant_themes.config).
--
--  channel_discount_max ya está en 1 desde la migración 057 (no se
--  toca aquí). Solo se reescriben las funciones que asumían 3
--  canales para que ahora asuman 2.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..069.
-- ============================================================

-- ── 1. Canales activos: dine_in/pickup cuentan como UN solo canal ("local") ──
create or replace function leogin_active_channels(p_restaurant_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      (case when bool_or(ot in ('dine_in','pickup')) then 1 else 0 end) +
      (case when bool_or(ot = 'delivery') then 1 else 0 end)
    from restaurant_themes rt,
         jsonb_array_elements_text(rt.config->'orderTypes') ot
    where rt.restaurant_id = p_restaurant_id
  ), 2);
$$;

comment on function leogin_active_channels(uuid) is
  'Número de canales de servicio activos para precio: "local" (dine_in y/o pickup, cuenta como 1) + "delivery". Default 2 si no hay config.';

-- ── 2. Mensualidad: el piso ahora es sobre 2 canales, no 3 ──────────────
create or replace function leogin_compute_monthly_fee(p_restaurant_id uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan      text;
  v_base      numeric;
  v_gmv       numeric;
  v_pct       numeric;
  v_var_min   numeric;
  v_per       numeric;
  v_max_off   int;
  v_active    int;
  v_disabled  int;
  v_discount  numeric := 0;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return 0; end if;

  v_base := case v_plan
    when 'BASICO'        then leogin_setting_num('plan_price_BASICO',         199)
    when 'ESTANDAR'      then leogin_setting_num('plan_price_ESTANDAR',       399)
    when 'PREMIUM'       then leogin_setting_num('plan_price_PREMIUM',        599)
    when 'PREMIUM_PRO'   then leogin_setting_num('plan_price_PREMIUM_PRO',    999)
    when 'PREMIUM_ULTRA' then leogin_setting_num('plan_price_PREMIUM_ULTRA', 1499)
    when 'ALTO_VOLUMEN'  then leogin_setting_num('plan_price_ALTO_VOLUMEN',  2249)
    else null
  end;

  if v_plan = 'VARIABLE' then
    select coalesce(sum(total), 0) into v_gmv
      from orders
     where restaurant_id = p_restaurant_id
       and status <> 'CANCEL'
       and created_at >= date_trunc('month', now());
    v_pct     := leogin_setting_num('plan_gmv_variable_pct', 0.01);
    v_var_min := leogin_setting_num('plan_gmv_variable_min', 2249);
    return greatest(round(v_gmv * v_pct), v_var_min);
  end if;

  if v_base is null then return 0; end if;

  if leogin_plan_has_channel_discount(v_plan) then
    v_per      := leogin_setting_num('channel_discount_per', 100);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 1)::int);
    v_active   := leogin_active_channels(p_restaurant_id);
    v_disabled := least(greatest(2 - v_active, 0), v_max_off); -- piso: máx 1 de 2 canales
    v_discount := v_disabled * v_per;
  end if;

  return greatest(v_base - v_discount, 0);
end;
$$;

-- ── 3. Desglose para el dueño: channels_total ahora es 2 ────────────────
create or replace function leogin_fee_breakdown(p_restaurant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan     text;
  v_base     numeric;
  v_active   int;
  v_per      numeric;
  v_max_off  int;
  v_disabled int := 0;
  v_final    numeric;
  v_applies  boolean := false;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return jsonb_build_object('plan', null); end if;

  v_base    := case v_plan
    when 'BASICO'        then leogin_setting_num('plan_price_BASICO',         199)
    when 'ESTANDAR'      then leogin_setting_num('plan_price_ESTANDAR',       399)
    when 'PREMIUM'       then leogin_setting_num('plan_price_PREMIUM',        599)
    when 'PREMIUM_PRO'   then leogin_setting_num('plan_price_PREMIUM_PRO',    999)
    when 'PREMIUM_ULTRA' then leogin_setting_num('plan_price_PREMIUM_ULTRA', 1499)
    when 'ALTO_VOLUMEN'  then leogin_setting_num('plan_price_ALTO_VOLUMEN',  2249)
    else 0
  end;

  v_applies := leogin_plan_has_channel_discount(v_plan);
  v_active  := leogin_active_channels(p_restaurant_id);
  if v_applies then
    v_per      := leogin_setting_num('channel_discount_per', 100);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 1)::int);
    v_disabled := least(greatest(2 - v_active, 0), v_max_off);
  end if;

  v_final := leogin_compute_monthly_fee(p_restaurant_id);

  return jsonb_build_object(
    'plan',            v_plan,
    'base',            v_base,
    'channels_active', v_active,
    'channels_total',  2,
    'discount_applies', v_applies,
    'discount_per',    coalesce(v_per, 0),
    'channels_off',    v_disabled,
    'discount',        coalesce(v_disabled,0) * coalesce(v_per,0),
    'final',           v_final
  );
end;
$$;

-- ── 4. Re-aplicar precio automático donde corresponda ───────────────────
select leogin_apply_auto_price_all();
