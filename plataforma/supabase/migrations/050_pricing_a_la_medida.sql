-- ============================================================
--  Migración 050 — Modelo de precios definitivo + "Plan a tu medida"
--  ------------------------------------------------------------
--  Decisiones del dueño (2026-06-27):
--   · Tiers reales = los del código/landing:
--       BASICO Q199 · ESTANDAR Q399 · PREMIUM Q599 · PREMIUM_PRO Q999
--       PREMIUM_ULTRA Q1,499 · ALTO_VOLUMEN Q2,249 · VARIABLE 1% (mín Q2,249)
--   · "Plan a tu medida": en planes con todos los canales (PREMIUM+), cada
--     canal de servicio DESACTIVADO (domicilio / comer en local / para llevar)
--     descuenta Q100 de la mensualidad — con PISO: siempre se paga al menos
--     un canal (máx 2 canales descontables ⇒ máx −Q200).
--
--  Reconcilia las 3 épocas de pricing (3-tiers por sucursal → 6-tiers GMV →
--  este modelo). Idempotente; seguro de re-ejecutar. Ejecutar tras 001..049.
-- ============================================================

-- ── 1. Normalizar valores legacy de plan_actual ─────────────
-- POPULAR (modelo viejo) = PREMIUM nuevo. Cualquier valor fuera del set nuevo
-- (incluido el viejo "PREMIUM tope" si lo hubiera) cae a PREMIUM, que es el
-- tier con pedidos + todas las funciones. El super admin ajusta caso por caso.
alter table restaurants drop constraint if exists restaurants_plan_actual_check;

update restaurants set plan_actual = 'PREMIUM' where plan_actual = 'POPULAR';
update restaurants set plan_actual = 'PREMIUM'
  where plan_actual not in (
    'BASICO','ESTANDAR','PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE'
  );

alter table restaurants add constraint restaurants_plan_actual_check
  check (plan_actual in (
    'BASICO','ESTANDAR','PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE'
  ));

-- ── 2. Precios y parámetros del modelo (editables en /super/configuracion) ──
insert into platform_settings (key, value) values
  ('plan_price_BASICO',        '199'),
  ('plan_price_ESTANDAR',      '399'),
  ('plan_price_PREMIUM',       '599'),
  ('plan_price_PREMIUM_PRO',   '999'),
  ('plan_price_PREMIUM_ULTRA', '1499'),
  ('plan_price_ALTO_VOLUMEN',  '2249'),
  ('plan_gmv_limit_ESTANDAR',      '10000'),
  ('plan_gmv_limit_PREMIUM',       '20000'),
  ('plan_gmv_limit_PREMIUM_PRO',   '40000'),
  ('plan_gmv_limit_PREMIUM_ULTRA', '75000'),
  ('plan_gmv_limit_ALTO_VOLUMEN',  '150000'),
  ('plan_gmv_variable_threshold',  '225000'),
  ('plan_gmv_variable_pct',        '0.01'),
  ('plan_gmv_variable_min',        '2249'),
  ('plan_gmv_alert_pct',           '0.80'),
  ('group_panel_fee',              '250'),
  -- "Plan a tu medida"
  ('channel_discount_per',         '100'),   -- Q por canal desactivado
  ('channel_discount_max',         '2')      -- máx canales descontables (piso = 1 canal pagado)
on conflict (key) do update set value = excluded.value;

-- Limpiar claves del modelo por-sucursal anterior (ya no aplican)
delete from platform_settings where key in (
  'plan_price_POPULAR', 'extra_branch_fee', 'premium_included_branches'
);

-- ── 3. Helper: cuántos canales de servicio tiene activos un restaurante ──
-- Lee restaurant_themes.config->'orderTypes'. Si no hay config, asume los 3.
-- Solo cuenta los 3 canales estándar (dine_in, delivery, pickup).
create or replace function leogin_active_channels(p_restaurant_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select count(*)::int
    from restaurant_themes rt,
         jsonb_array_elements_text(rt.config->'orderTypes') ot
    where rt.restaurant_id = p_restaurant_id
      and ot in ('dine_in','delivery','pickup')
  ), 3);
$$;

comment on function leogin_active_channels(uuid) is
  'Número de canales de servicio activos (dine_in/delivery/pickup) según restaurant_themes.config. Default 3 si no hay config.';

-- ── 4. Planes que participan en "Plan a tu medida" ──────────
-- Solo planes de precio fijo con TODOS los canales. BASICO no tiene pedidos;
-- ESTANDAR es entrada (no se descuenta); VARIABLE es por % (no aplica).
create or replace function leogin_plan_has_channel_discount(p_plan text)
returns boolean language sql immutable as $$
  select p_plan in ('PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN');
$$;

-- ── 5. Reescribir el cálculo de la mensualidad ──────────────
-- Cada restaurante paga su propio plan (sin lógica de sucursales incluidas;
-- el panel de grupo se cobra aparte como concepto OTHER por group_panel_fee).
-- PREMIUM+ aplica descuento por canal desactivado, con piso (máx 2 canales).
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

  -- Precio base por plan
  v_base := case v_plan
    when 'BASICO'        then leogin_setting_num('plan_price_BASICO',         199)
    when 'ESTANDAR'      then leogin_setting_num('plan_price_ESTANDAR',       399)
    when 'PREMIUM'       then leogin_setting_num('plan_price_PREMIUM',        599)
    when 'PREMIUM_PRO'   then leogin_setting_num('plan_price_PREMIUM_PRO',    999)
    when 'PREMIUM_ULTRA' then leogin_setting_num('plan_price_PREMIUM_ULTRA', 1499)
    when 'ALTO_VOLUMEN'  then leogin_setting_num('plan_price_ALTO_VOLUMEN',  2249)
    else null
  end;

  -- VARIABLE: 1% del GMV del mes, con mínimo
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

  -- "Plan a tu medida": descuento por canal desactivado (con piso)
  if leogin_plan_has_channel_discount(v_plan) then
    v_per     := leogin_setting_num('channel_discount_per', 100);
    v_max_off := greatest(0, leogin_setting_num('channel_discount_max', 2)::int);
    v_active  := leogin_active_channels(p_restaurant_id);
    v_disabled := least(greatest(3 - v_active, 0), v_max_off); -- piso: máx 2 canales
    v_discount := v_disabled * v_per;
  end if;

  return greatest(v_base - v_discount, 0);
end;
$$;

-- ── 6. Desglose para mostrar al dueño ("Plan a tu medida") ──
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
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 2)::int);
    v_disabled := least(greatest(3 - v_active, 0), v_max_off);
  end if;

  v_final := leogin_compute_monthly_fee(p_restaurant_id);

  return jsonb_build_object(
    'plan',            v_plan,
    'base',            v_base,
    'channels_active', v_active,
    'channels_total',  3,
    'discount_applies', v_applies,
    'discount_per',    coalesce(v_per, 0),
    'channels_off',    v_disabled,
    'discount',        coalesce(v_disabled,0) * coalesce(v_per,0),
    'final',           v_final
  );
end;
$$;

-- ── 7. Re-aplicar precio automático donde corresponda ───────
-- (solo filas con auto_price = true; respeta overrides manuales)
select leogin_apply_auto_price_all();
