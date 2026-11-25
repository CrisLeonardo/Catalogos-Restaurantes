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
