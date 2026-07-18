-- ============================================================
--  Migración 072 — Planes modulares sin GMV/comisión sobre ventas
--  ------------------------------------------------------------
--  Decisión del dueño (2026-07-12): dejar de cobrar en función de
--  cuánto vende el restaurante (topes de GMV + plan VARIABLE al 1%).
--  Ningún competidor evaluado (OlaClick, GloriaFood, Waiterio,
--  ChowNow, Popmenu, Owner.com, Fudo, Toast) cobra así — todos usan
--  precio fijo por plan, a veces + un fee de procesamiento de pago,
--  nunca un % de las ventas del restaurante.
--
--  Nuevo modelo:
--   1) 4 planes de precio FIJO, sin tope de GMV:
--        BASICO Q149 · ESTANDAR Q399 · PREMIUM Q749 · PRO Q999
--      (colapsa PREMIUM_PRO + PREMIUM_ULTRA + ALTO_VOLUMEN + VARIABLE → PRO)
--   2) Los 8 módulos activables (reservaciones, llamada_mesero,
--      encuestas, cupones, loyalty, proveedores, recetas, fel) se
--      venden A LA CARTA sobre cualquier plan. PREMIUM incluye 6 gratis;
--      PRO los incluye los 8. BASICO/ESTANDAR los añaden por su precio.
--   3) Sucursales de un mismo grupo: descuento por volumen a partir
--      de la 2a sucursal (10%/15%/20% según el total del grupo).
--   4) Se mantiene el descuento "Plan a tu medida" por canal
--      desactivado (Q100, ya existente desde mig. 057/070) en
--      PREMIUM/PRO.
--   5) Clientes ya facturando en modo automático en PREMIUM o en un
--      tier que desaparece: se CONGELA su mensualidad actual
--      (auto_price = false + nota) para que el dueño decida cuándo
--      avisar el cambio. Nadie sufre un cobro sorpresa por este
--      cambio. BASICO/ESTANDAR siguen en automático (su precio no
--      sube: Básico baja, Estándar no cambia).
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..071.
-- ============================================================

-- ── 0. Congelar mensualidad de quienes vayan a moverse de precio ──
-- Usa la función leogin_compute_monthly_fee TAL COMO ESTÁ HOY (antes de
-- redefinirla más abajo) para fotografiar el cobro actual, y desactiva
-- auto_price para que ese monto no cambie hasta revisión manual.
do $$
declare
  r record;
  v_current numeric;
begin
  for r in
    select rb.restaurant_id, rst.plan_actual
      from restaurant_billing rb
      join restaurants rst on rst.id = rb.restaurant_id
     where rb.auto_price = true
       and rst.plan_actual in ('PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE')
  loop
    v_current := coalesce(leogin_compute_monthly_fee(r.restaurant_id), 0);
    update restaurant_billing
       set auto_price = false,
           monthly_fee = v_current,
           notes = trim(both E'\n' from
             coalesce(notes, '') || E'\n' ||
             '[Migración 072 — ' || to_char(now(), 'YYYY-MM-DD') || '] ' ||
             'Congelado en Q' || v_current::text || ' (antes plan ' || r.plan_actual || '). ' ||
             'Requiere revisión manual antes de reactivar precio automático con la nueva estructura.'
           ),
           updated_at = now()
     where restaurant_id = r.restaurant_id;
  end loop;
end $$;

-- ── 1. Remapear planes viejos → nuevo set de 4 ─────────────────
alter table restaurants drop constraint if exists restaurants_plan_actual_check;

update restaurants set plan_actual = 'PREMIUM' where plan_actual = 'POPULAR';
update restaurants set plan_actual = 'PRO'
  where plan_actual in ('PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE');
update restaurants set plan_actual = 'PREMIUM'
  where plan_actual not in ('BASICO','ESTANDAR','PREMIUM','PRO');

alter table restaurants add constraint restaurants_plan_actual_check
  check (plan_actual in ('BASICO','ESTANDAR','PREMIUM','PRO'));

-- ── 2. Precios y parámetros nuevos ──────────────────────────────
insert into platform_settings (key, value) values
  ('plan_price_BASICO',   '149'),
  ('plan_price_ESTANDAR', '399'),
  ('plan_price_PREMIUM',  '749'),
  ('plan_price_PRO',      '999'),
  ('setup_fee_BASICO',    '0'),
  ('setup_fee_ESTANDAR',  '300'),
  ('setup_fee_PREMIUM',   '300'),
  ('setup_fee_PRO',       '0'),
  ('setup_fee_default',   '300'),
  ('group_panel_fee',     '299'),
  ('channel_discount_per', '100'),
  ('channel_discount_max', '1'),
  -- Módulos a la carta (mensual, GTQ)
  ('module_price_reservaciones',  '99'),
  ('module_price_llamada_mesero', '49'),
  ('module_price_encuestas',      '49'),
  ('module_price_cupones',        '79'),
  ('module_price_loyalty',        '99'),
  ('module_price_recetas',        '79'),
  ('module_price_proveedores',    '99'),
  ('module_price_fel',            '249'),
  ('module_setup_fee_fel',        '500'),
  ('trial_days',                  '30')
on conflict (key) do update set value = excluded.value;

-- Limpieza: fuera las claves del modelo GMV/variable (ya no aplican).
delete from platform_settings where key in (
  'plan_price_PREMIUM_PRO', 'plan_price_PREMIUM_ULTRA', 'plan_price_ALTO_VOLUMEN',
  'plan_gmv_limit_ESTANDAR', 'plan_gmv_limit_PREMIUM', 'plan_gmv_limit_PREMIUM_PRO',
  'plan_gmv_limit_PREMIUM_ULTRA', 'plan_gmv_limit_ALTO_VOLUMEN',
  'plan_gmv_variable_threshold', 'plan_gmv_variable_pct', 'plan_gmv_variable_min',
  'plan_gmv_alert_pct'
);

-- ── 3. ¿Este plan incluye este módulo gratis? ───────────────────
-- PRO: los 8. PREMIUM: 6 (todos menos proveedores y fel). BASICO/ESTANDAR: ninguno.
create or replace function leogin_module_included_in_plan(p_plan text, p_key text)
returns boolean language sql immutable as $$
  select case
    when p_plan = 'PRO'     then true
    when p_plan = 'PREMIUM' then p_key in ('llamada_mesero','encuestas','cupones','loyalty','recetas','reservaciones')
    else false
  end;
$$;

-- ── 4. Costo mensual de módulos a la carta ACTIVOS y no incluidos ──
-- Cobra por módulo con modules[key] = true (lo gestiona Leogin) que
-- el plan actual no incluya gratis. El apagado del propio dueño
-- (module_settings) no afecta el cobro: es solo visual/uso.
create or replace function leogin_addon_modules_cost(p_restaurant_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_plan    text;
  v_modules jsonb;
  v_total   numeric := 0;
  v_key     text;
begin
  select plan_actual, modules into v_plan, v_modules from restaurants where id = p_restaurant_id;
  if v_modules is null or v_plan is null then return 0; end if;

  for v_key in
    select k from unnest(array[
      'reservaciones','llamada_mesero','encuestas','cupones','loyalty','proveedores','recetas','fel'
    ]) as k
  loop
    if coalesce((v_modules->>v_key)::boolean, false)
       and not leogin_module_included_in_plan(v_plan, v_key) then
      v_total := v_total + leogin_setting_num('module_price_' || v_key, 0);
    end if;
  end loop;

  return v_total;
end;
$$;

-- ── 5. Descuento por volumen de sucursales (mismo grupo/organización) ──
-- Sobre el precio del PLAN de cada sucursal (no sobre módulos). La
-- sucursal más antigua del grupo paga siempre precio completo; el
-- descuento aplica a partir de la 2a. Umbral por tamaño TOTAL del grupo.
create or replace function leogin_branch_discount_pct(p_organization_id uuid, p_restaurant_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_total  int;
  v_older  int;
begin
  if p_organization_id is null then return 0; end if;

  select count(*) into v_total
    from restaurants where organization_id = p_organization_id and status = 'active';
  if v_total <= 1 then return 0; end if;

  select count(*) into v_older
    from restaurants
   where organization_id = p_organization_id and status = 'active'
     and created_at < (select created_at from restaurants where id = p_restaurant_id);
  if v_older = 0 then return 0; end if; -- es la sucursal fundadora del grupo: sin descuento

  return case
    when v_total >= 10 then 0.20
    when v_total >= 5  then 0.15
    when v_total >= 2  then 0.10
    else 0
  end;
end;
$$;

comment on function leogin_branch_discount_pct(uuid, uuid) is
  'Descuento por volumen de franquicia: 10% (2-4 sucursales) / 15% (5-9) / 20% (10+), sobre el precio del plan de cada sucursal excepto la más antigua del grupo.';

-- ── 6. ¿Este plan participa del descuento por canal desactivado? ──
-- Solo PREMIUM y PRO (planes de precio fijo con los 2 canales incluidos).
create or replace function leogin_plan_has_channel_discount(p_plan text)
returns boolean language sql immutable as $$
  select p_plan in ('PREMIUM','PRO');
$$;

-- ── 7. Mensualidad final = base − descuento canal, con descuento de
--       volumen aplicado a ese neto, más módulos a la carta a precio lleno ──
create or replace function leogin_compute_monthly_fee(p_restaurant_id uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_plan       text;
  v_org_id     uuid;
  v_base       numeric;
  v_per        numeric;
  v_max_off    int;
  v_active     int;
  v_disabled   int;
  v_chan_disc  numeric := 0;
  v_addon      numeric := 0;
  v_branch_pct numeric := 0;
  v_plan_net   numeric;
begin
  select plan_actual, organization_id into v_plan, v_org_id
    from restaurants where id = p_restaurant_id;
  if v_plan is null then return 0; end if;

  v_base := case v_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   149)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 399)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  749)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',     999)
    else null
  end;
  if v_base is null then return 0; end if;

  if leogin_plan_has_channel_discount(v_plan) then
    v_per      := leogin_setting_num('channel_discount_per', 100);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 1)::int);
    v_active   := leogin_active_channels(p_restaurant_id);
    v_disabled := least(greatest(2 - v_active, 0), v_max_off);
    v_chan_disc := v_disabled * v_per;
  end if;

  v_branch_pct := leogin_branch_discount_pct(v_org_id, p_restaurant_id);
  v_plan_net   := greatest(v_base - v_chan_disc, 0) * (1 - v_branch_pct);

  v_addon := leogin_addon_modules_cost(p_restaurant_id);

  return greatest(round(v_plan_net + v_addon), 0);
end;
$$;

-- ── 8. Desglose para mostrar al dueño / super admin ─────────────
create or replace function leogin_fee_breakdown(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan       text;
  v_org_id     uuid;
  v_base       numeric;
  v_active     int;
  v_per        numeric;
  v_max_off    int;
  v_disabled   int := 0;
  v_applies    boolean := false;
  v_chan_disc  numeric := 0;
  v_branch_pct numeric := 0;
  v_addon      numeric := 0;
  v_final      numeric;
begin
  select plan_actual, organization_id into v_plan, v_org_id
    from restaurants where id = p_restaurant_id;
  if v_plan is null then return jsonb_build_object('plan', null); end if;

  v_base := case v_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   149)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 399)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  749)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',     999)
    else 0
  end;

  v_applies := leogin_plan_has_channel_discount(v_plan);
  v_active  := leogin_active_channels(p_restaurant_id);
  if v_applies then
    v_per      := leogin_setting_num('channel_discount_per', 100);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 1)::int);
    v_disabled := least(greatest(2 - v_active, 0), v_max_off);
    v_chan_disc := v_disabled * v_per;
  end if;

  v_branch_pct := leogin_branch_discount_pct(v_org_id, p_restaurant_id);
  v_addon      := leogin_addon_modules_cost(p_restaurant_id);
  v_final      := leogin_compute_monthly_fee(p_restaurant_id);

  return jsonb_build_object(
    'plan',               v_plan,
    'base',                v_base,
    'channels_active',     v_active,
    'channels_total',      2,
    'discount_applies',    v_applies,
    'discount_per',        coalesce(v_per, 0),
    'channels_off',        v_disabled,
    'discount',            v_chan_disc,
    'branch_discount_pct', v_branch_pct,
    'addon_total',         v_addon,
    'final',               v_final
  );
end;
$$;

-- ── 9. Re-aplicar precio automático (solo filas auto_price = true) ──
-- BASICO/ESTANDAR y cualquier restaurante nuevo recalculan ya con la
-- estructura nueva; los congelados en el paso 0 no se tocan.
select leogin_apply_auto_price_all();
