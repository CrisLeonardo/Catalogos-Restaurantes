/* ============================================================
   120 — Planes fijos: sin módulos a la carta ni descuento por canal
   ------------------------------------------------------------
   Venía de la 050/072/078: en Premium/Pro, cada método de pedido que el
   restaurante desactivaba (comer en local / para llevar / a domicilio)
   descontaba de su mensualidad; y en cualquier plan se podía comprar
   un módulo suelto (reservaciones, lealtad, etc.) sin subir de plan.

   Se retira por decisión de Leonardo (2026-08-21): con el precio base ya
   bajado (Premium a Q349 el 2026-08-17), dos mecanismos de precio variable
   encima de un precio ya reducido era complejidad sin beneficio claro.
   A partir de aquí cada plan es de precio fijo: lo que trae, lo trae por
   ese precio, sin descuentos ni compras sueltas. Ver plans.ts para el
   detalle de qué incluye cada plan.

   El dueño SIGUE pudiendo apagar un módulo o un canal desde su panel por
   preferencia propia — eso nunca fue parte del cobro (module_settings /
   restaurant_themes.config.orderTypes) y no cambia aquí.

   No hay clientes activos hoy con un módulo comprado a la carta fuera de
   su plan ni con un canal descontado (confirmado con Leonardo antes de
   escribir esto), así que no hace falta lógica de herencia — pero se deja
   el mismo informe de la 115 para confirmarlo en cada entorno donde corra.

   Limpieza deliberadamente conservadora: las funciones y tablas que solo
   existían para el anti-abuso de estos dos cobros (ver el aviso al final)
   quedan INERTES, no se borran en esta migración — es más fácil auditar
   "ya no se usa" que reconstruir una tabla de bitácora si hiciera falta.
   ============================================================ */

drop table if exists _fee_antes;
create temporary table _fee_antes as
  select restaurant_id, monthly_fee
    from restaurant_billing
   where auto_price = true;

-- ── 1. Mensualidad: solo el precio fijo del plan ────────────
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
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 199)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  349)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',      599)
    else null
  end;
  if v_base is null then return 0; end if;

  return greatest(round(v_base), 0);
end;
$$;

-- ── 2. Desglose para el dueño: solo plan base y total ────────
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

-- ── 3. Refrescar las mensualidades ya guardadas ─────────────
select leogin_apply_auto_price_all();

-- ── 4. Informe de a quién le cambia y cuánto ────────────────
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
    raise notice 'Ningun restaurante cambia de mensualidad: nadie tenia descuento por canal ni modulo a la carta activo.';
  else
    raise notice '% restaurantes cambian de mensualidad. Diferencia total: %+ al mes.', v_n, v_delta;
    raise notice 'Revisalo ANTES de generar la factura del mes.';
  end if;
end $$;

drop table if exists _fee_antes;

/* ── Nota: qué queda inerte a propósito ──────────────────────
   leogin_billed_addon_modules, leogin_plan_has_channel_discount,
   leogin_channel_off_fraction, leogin_module_off_fraction,
   leogin_billed_active_channels, leogin_billed_channels_off, y las
   tablas/triggers restaurant_channel_log / restaurant_module_log
   (migs. 073/078) ya no las llama nadie — vivían solo para el anti-abuso
   de estos dos cobros. Se dejan sin tocar por ahora (limpieza futura). */
