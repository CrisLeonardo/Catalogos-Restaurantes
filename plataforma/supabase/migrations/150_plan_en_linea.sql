-- ============================================================
--  150 · Plan «En línea» (Q99, sin alta)
--  ------------------------------------------------------------
--  docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md (§2).
--
--  Para quien solo vende en línea y va empezando: para llevar y a
--  domicilio, encargos y transferencia, avisos y WhatsApp; sin finanzas,
--  analítica, inventario, personal, cupones, lealtad ni mesero. El código
--  es 'EN_LINEA' y va entre Básico y Estándar (lib/plans.ts).
--
--  1. restaurants_plan_actual_check acepta 'EN_LINEA'.
--  2. platform_settings: plan_price_EN_LINEA = 99, setup_fee_EN_LINEA = 0
--     (solo si no existen: si el super admin ya los puso, se respetan).
--  3. leogin_compute_monthly_fee y leogin_fee_breakdown cobran EN_LINEA.
--     Mismo cuerpo que la 120 con una línea más: sin ella, un restaurante
--     En línea saldría con mensualidad 0.
--  4. leogin_plan_module_floor: el piso de En línea es pedidos + aviso
--     por WhatsApp. Sin esta rama caía en el `else` de Premium y le
--     regalaba finanzas, analítica, inventario y personal.
--     leogin_module_included_in_plan ya devuelve false para cualquier plan
--     que no sea Premium o Pro: no hay que tocarla.
--
--  Idempotente. Aplicar ANTES de desplegar el código: sin ella, elegir
--  En línea en el alta falla por la restricción del paso 1.
-- ============================================================

alter table public.restaurants drop constraint if exists restaurants_plan_actual_check;
alter table public.restaurants add constraint restaurants_plan_actual_check
  check (plan_actual in ('BASICO', 'EN_LINEA', 'ESTANDAR', 'PREMIUM', 'PRO'));

insert into public.platform_settings (key, value) values
  ('plan_price_EN_LINEA', '99'),
  ('setup_fee_EN_LINEA',  '0')
on conflict (key) do nothing;

create or replace function leogin_compute_monthly_fee(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text;
  v_base numeric;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return 0; end if;
  v_base := case v_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   0)
    when 'EN_LINEA' then leogin_setting_num('plan_price_EN_LINEA', 99)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 199)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  349)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',      599)
    else null
  end;
  if v_base is null then return 0; end if;
  return greatest(round(v_base), 0);
end;
$$;

create or replace function leogin_fee_breakdown(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan  text;
  v_base  numeric;
  v_final numeric;
begin
  select plan_actual into v_plan from restaurants where id = p_restaurant_id;
  if v_plan is null then return jsonb_build_object('plan', null); end if;
  v_base := case v_plan
    when 'BASICO'   then leogin_setting_num('plan_price_BASICO',   0)
    when 'EN_LINEA' then leogin_setting_num('plan_price_EN_LINEA', 99)
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 199)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  349)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',      599)
    else 0
  end;
  v_final := leogin_compute_monthly_fee(p_restaurant_id, p_period_start);
  return jsonb_build_object(
    'plan',  v_plan,
    'base',  v_base,
    'final', v_final
  );
end;
$$;

create or replace function public.leogin_plan_module_floor(p_plan text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('catalog', true)
      || case p_plan
           when 'BASICO'   then '{}'::jsonb
           when 'EN_LINEA' then '{"orders":true,"whatsapp_notify":true}'::jsonb
           when 'ESTANDAR' then '{"orders":true,"whatsapp_notify":true,"finanzas":true}'::jsonb
           else '{"orders":true,"whatsapp_notify":true,"finanzas":true,
                  "analitica":true,"inventario":true,"personal":true}'::jsonb
         end
      || coalesce((
           select jsonb_object_agg(k, true)
             from unnest(leogin_addon_module_keys()) k
            where leogin_module_included_in_plan(p_plan, k)
         ), '{}'::jsonb);
$$;
