-- ============================================================
--  Migración 078 — "Plan a tu medida" v3:
--  descuento por MÉTODO de pedido (3 canales × Q50) + el cobro
--  de módulos a la carta ahora sigue el apagado del dueño
--  ------------------------------------------------------------
--  Decisión del dueño (2026-07-16):
--   1) Los canales para precio vuelven a ser los 3 métodos de
--      pedido reales e independientes: comer en local (dine_in),
--      para llevar (pickup) y a domicilio (delivery). La mig. 070
--      los había fusionado en 2 ("local" + delivery).
--   2) El descuento baja de Q100 por canal (de 2) a Q50 por
--      método (de 3). Máximo descontable: 2 — siempre se paga al
--      menos 1 método.
--   3) Los módulos a la carta (no incluidos en el plan) dejan de
--      cobrarse cuando el dueño los DESACTIVA desde su panel —
--      antes el on/off del dueño era solo visual y el cobro
--      seguía la entitlement de Leogin. Mismo anti-abuso que los
--      canales (mig. 073): el cambio no afecta el cobro del ciclo
--      en curso; el módulo debe estar apagado >= 75% del ciclo
--      ANTERIOR para no facturarse.
--
--  Historial: restaurant_channel_log acepta ahora los 3 métodos
--  ('local' se conserva solo como historia congelada de 070-077).
--  Para módulos se crea restaurant_module_log, escrito por un
--  trigger sobre restaurants (mismo razonamiento que 073: un
--  trigger es imposible de saltarse, venga el cambio de donde
--  venga).
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..077.
-- ============================================================

-- ── 1. Los 3 métodos entran al historial de canales ─────────
alter table restaurant_channel_log
  drop constraint if exists restaurant_channel_log_channel_check;
alter table restaurant_channel_log
  add constraint restaurant_channel_log_channel_check
  check (channel in ('local', 'dine_in', 'pickup', 'delivery'));

comment on table restaurant_channel_log is
  'Historial de encendido/apagado de métodos de pedido (dine_in/pickup/delivery; ''local'' es historia de las migs. 070-077) por restaurante, escrito por trigger (trg_restaurant_channel_log). Base del descuento "Plan a tu medida" (mig. 073 + 078).';

-- ── 2. Backfill: una fila inicial por método nuevo reflejando el
--    estado actual, fechada 2 meses atrás (mismo criterio que 073:
--    no penalizar configuraciones existentes por falta de historial).
insert into restaurant_channel_log (restaurant_id, channel, is_active, changed_at)
select rt.restaurant_id,
       c.channel,
       coalesce((rt.config->'orderTypes') ? c.channel, true) as is_active,
       now() - interval '2 months'
  from restaurant_themes rt
  cross join (values ('dine_in'), ('pickup')) as c(channel)
 where not exists (
   select 1 from restaurant_channel_log l
    where l.restaurant_id = rt.restaurant_id and l.channel = c.channel
 );

-- ── 3. Trigger: registra cada método por separado ───────────
create or replace function leogin_log_channel_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old_types jsonb;
  v_new_types jsonb := coalesce(new.config->'orderTypes', '["dine_in","delivery","pickup"]'::jsonb);
  v_channel   text;
  v_old_on    boolean;
  v_new_on    boolean;
begin
  if tg_op = 'INSERT' then
    v_old_types := '["dine_in","delivery","pickup"]'::jsonb; -- baseline de una cuenta nueva
  else
    v_old_types := coalesce(old.config->'orderTypes', '["dine_in","delivery","pickup"]'::jsonb);
    if v_old_types = v_new_types then
      return new;
    end if;
  end if;

  foreach v_channel in array array['dine_in', 'pickup', 'delivery'] loop
    v_old_on := v_old_types ? v_channel;
    v_new_on := v_new_types ? v_channel;
    if v_old_on is distinct from v_new_on then
      insert into restaurant_channel_log (restaurant_id, channel, is_active)
      values (new.restaurant_id, v_channel, v_new_on);
    end if;
  end loop;

  return new;
end;
$$;

comment on function leogin_log_channel_change() is
  'Trigger de restaurant_themes: registra en restaurant_channel_log cualquier transición on/off de dine_in, pickup o delivery, sin depender de que el código que llama al UPDATE se acuerde de hacerlo.';

drop trigger if exists trg_restaurant_channel_log on restaurant_themes;
create trigger trg_restaurant_channel_log
  after insert or update of config on restaurant_themes
  for each row
  execute function leogin_log_channel_change();

-- ── 4. Canales activos EN VIVO: ahora 0-3 ────────────────────
create or replace function leogin_active_channels(p_restaurant_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      (case when bool_or(ot = 'dine_in')  then 1 else 0 end) +
      (case when bool_or(ot = 'pickup')   then 1 else 0 end) +
      (case when bool_or(ot = 'delivery') then 1 else 0 end)
    from restaurant_themes rt,
         jsonb_array_elements_text(rt.config->'orderTypes') ot
    where rt.restaurant_id = p_restaurant_id
  ), 3);
$$;

comment on function leogin_active_channels(uuid) is
  'Número de métodos de pedido activos para precio: dine_in + pickup + delivery, cada uno cuenta por separado. Default 3 si no hay config.';

-- ── 5. Canales activos para EL COBRO del periodo (0-3): un método
--    solo cuenta como apagado si lo estuvo >= 75% del ciclo anterior.
create or replace function leogin_billed_active_channels(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
) returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_window_start timestamptz := (p_period_start - interval '1 month');
  v_window_end   timestamptz := p_period_start;
  v_channel      text;
  v_off          numeric;
  v_active       int := 0;
begin
  foreach v_channel in array array['dine_in', 'pickup', 'delivery'] loop
    v_off := leogin_channel_off_fraction(p_restaurant_id, v_channel, v_window_start, v_window_end);
    if v_off < 0.75 then v_active := v_active + 1; end if;
  end loop;
  return v_active;
end;
$$;

comment on function leogin_billed_active_channels(uuid, date) is
  'Métodos de pedido activos para efectos de COBRO del periodo dado (0-3): un método solo cuenta como apagado (elegible para descuento) si estuvo apagado >= 75% del ciclo ANTERIOR.';

-- ── 5b. Métodos facturados como apagados, con nombre — para que el
--     desglose del dueño diga QUÉ método le está descontando.
create or replace function leogin_billed_channels_off(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_window_start timestamptz := (p_period_start - interval '1 month');
  v_window_end   timestamptz := p_period_start;
  v_channel      text;
  v_off          numeric;
  v_out          jsonb := '[]'::jsonb;
begin
  foreach v_channel in array array['dine_in', 'pickup', 'delivery'] loop
    v_off := leogin_channel_off_fraction(p_restaurant_id, v_channel, v_window_start, v_window_end);
    if v_off >= 0.75 then v_out := v_out || to_jsonb(v_channel); end if;
  end loop;
  return v_out;
end;
$$;

-- ── 6. Historial de módulos a la carta (on/off del dueño) ────
create table if not exists restaurant_module_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  module_key    text not null,
  is_active     boolean not null,
  changed_at    timestamptz not null default now()
);

create index if not exists restaurant_module_log_lookup
  on restaurant_module_log (restaurant_id, module_key, changed_at);

comment on table restaurant_module_log is
  'Historial de activación efectiva de módulos a la carta (entitlement de Leogin × on/off del dueño), escrito por trigger (trg_restaurant_module_log). Base del cobro de módulos con anti-abuso de ciclo previo (mig. 078).';

alter table restaurant_module_log enable row level security;

-- Backfill: estado efectivo actual, fechado 2 meses atrás — así el ciclo
-- anterior queda cubierto y nadie pierde ni gana cobro por falta de datos.
insert into restaurant_module_log (restaurant_id, module_key, is_active, changed_at)
select r.id,
       k.module_key,
       coalesce((r.modules->>k.module_key)::boolean, false)
         and coalesce((r.module_settings->k.module_key->>'enabled')::boolean, true) as is_active,
       now() - interval '2 months'
  from restaurants r
  cross join (values ('reservaciones'),('llamada_mesero'),('encuestas'),('cupones'),
                     ('loyalty'),('proveedores'),('recetas'),('fel')) as k(module_key)
 where not exists (
   select 1 from restaurant_module_log l
    where l.restaurant_id = r.id and l.module_key = k.module_key
 );

-- Trigger: registra transiciones del estado EFECTIVO (entitlement × enabled)
-- en cualquier UPDATE de restaurants.modules o restaurants.module_settings.
create or replace function leogin_log_module_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key    text;
  v_old_on boolean;
  v_new_on boolean;
begin
  foreach v_key in array array['reservaciones','llamada_mesero','encuestas','cupones',
                               'loyalty','proveedores','recetas','fel'] loop
    v_old_on := coalesce((old.modules->>v_key)::boolean, false)
                and coalesce((old.module_settings->v_key->>'enabled')::boolean, true);
    v_new_on := coalesce((new.modules->>v_key)::boolean, false)
                and coalesce((new.module_settings->v_key->>'enabled')::boolean, true);
    if v_old_on is distinct from v_new_on then
      insert into restaurant_module_log (restaurant_id, module_key, is_active)
      values (new.id, v_key, v_new_on);
    end if;
  end loop;
  return new;
end;
$$;

comment on function leogin_log_module_change() is
  'Trigger de restaurants: registra en restaurant_module_log cualquier transición on/off efectiva de un módulo a la carta (cambie por entitlement de Leogin o por el toggle del dueño).';

drop trigger if exists trg_restaurant_module_log on restaurants;
create trigger trg_restaurant_module_log
  after update of modules, module_settings on restaurants
  for each row
  execute function leogin_log_module_change();

-- Fracción de tiempo apagado de un módulo en una ventana (mismo diseño que
-- leogin_channel_off_fraction, sobre restaurant_module_log).
create or replace function leogin_module_off_fraction(
  p_restaurant_id uuid, p_module_key text, p_window_start timestamptz, p_window_end timestamptz
) returns numeric language sql stable security definer set search_path = public as $$
  with events as (
    select is_active, changed_at,
           lead(changed_at) over (order by changed_at) as next_changed_at
      from restaurant_module_log
     where restaurant_id = p_restaurant_id and module_key = p_module_key
       and changed_at < p_window_end
  ),
  clipped as (
    select is_active,
           greatest(changed_at, p_window_start)                        as seg_start,
           least(coalesce(next_changed_at, p_window_end), p_window_end) as seg_end
      from events
  ),
  valid as (
    select * from clipped where seg_end > seg_start
  )
  select case when not exists (select 1 from valid) then 0 else
    coalesce(
      sum(case when not is_active then extract(epoch from (seg_end - seg_start)) else 0 end)
      / nullif(sum(extract(epoch from (seg_end - seg_start))), 0),
      0
    )
  end
  from valid;
$$;

comment on function leogin_module_off_fraction(uuid, text, timestamptz, timestamptz) is
  'Fracción (0-1) del tiempo observado en que un módulo estuvo apagado (efectivo), dentro de la ventana dada.';

-- ── 7. Cobro de módulos a la carta del periodo, con detalle ──
--    Un módulo se factura si: Leogin lo tiene habilitado AHORA
--    (entitlement), el plan actual no lo incluye gratis, y NO estuvo
--    apagado >= 75% del ciclo anterior. Un módulo recién apagado
--    sigue cobrándose completo hasta el ciclo siguiente (anti-abuso,
--    mismo criterio que los canales). Devuelve
--    { total, items: [{ key, price }] } para el desglose del dueño.
create or replace function leogin_billed_addon_modules(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_window_start timestamptz := (p_period_start - interval '1 month');
  v_window_end   timestamptz := p_period_start;
  v_plan    text;
  v_modules jsonb;
  v_key     text;
  v_price   numeric;
  v_total   numeric := 0;
  v_items   jsonb := '[]'::jsonb;
begin
  select plan_actual, modules into v_plan, v_modules from restaurants where id = p_restaurant_id;
  if v_modules is null or v_plan is null then
    return jsonb_build_object('total', 0, 'items', '[]'::jsonb);
  end if;

  foreach v_key in array array['reservaciones','llamada_mesero','encuestas','cupones',
                               'loyalty','proveedores','recetas','fel'] loop
    if coalesce((v_modules->>v_key)::boolean, false)
       and not leogin_module_included_in_plan(v_plan, v_key)
       and leogin_module_off_fraction(p_restaurant_id, v_key, v_window_start, v_window_end) < 0.75 then
      v_price := leogin_setting_num('module_price_' || v_key, 0);
      v_total := v_total + v_price;
      v_items := v_items || jsonb_build_object('key', v_key, 'price', v_price);
    end if;
  end loop;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

comment on function leogin_billed_addon_modules(uuid, date) is
  'Módulos a la carta que se facturan en el periodo dado (entitlement × apagado del dueño con regla del 75% del ciclo anterior), con precio por módulo y total.';

-- Compat: leogin_addon_modules_cost ahora delega en la versión con periodo
-- (la firma de 1 argumento se conserva porque otros llamadores la usan).
create or replace function leogin_addon_modules_cost(p_restaurant_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((leogin_billed_addon_modules(p_restaurant_id)->>'total')::numeric, 0);
$$;

-- ── 8. Mensualidad: 3 métodos, Q50 c/u (default), máx 2 ─────
create or replace function leogin_compute_monthly_fee(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
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

  v_branch_pct := leogin_branch_discount_pct(v_org_id, p_restaurant_id);
  v_plan_net   := greatest(v_base - v_chan_disc, 0) * (1 - v_branch_pct);

  v_addon := coalesce((leogin_billed_addon_modules(p_restaurant_id, p_period_start)->>'total')::numeric, 0);

  return greatest(round(v_plan_net + v_addon), 0);
end;
$$;

-- ── 9. Desglose para el dueño: 3 métodos + detalle de módulos ──
create or replace function leogin_fee_breakdown(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan          text;
  v_org_id        uuid;
  v_base          numeric;
  v_active_live   int;
  v_active_billed int;
  v_per           numeric;
  v_max_off       int;
  v_disabled      int := 0;
  v_applies       boolean := false;
  v_chan_disc     numeric := 0;
  v_branch_pct    numeric := 0;
  v_addons        jsonb;
  v_final         numeric;
begin
  select plan_actual, organization_id into v_plan, v_org_id
    from restaurants where id = p_restaurant_id;
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

  v_branch_pct := leogin_branch_discount_pct(v_org_id, p_restaurant_id);
  v_addons     := leogin_billed_addon_modules(p_restaurant_id, p_period_start);
  v_final      := leogin_compute_monthly_fee(p_restaurant_id, p_period_start);

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
    'branch_discount_pct',    v_branch_pct,
    'addon_total',            coalesce((v_addons->>'total')::numeric, 0),
    'addon_items',            coalesce(v_addons->'items', '[]'::jsonb),
    'final',                  v_final
  );
end;
$$;

-- ── 10. Nuevos defaults de la plataforma: Q50 por método, máx 2 ──
--     (upsert deliberado: es un cambio de política de precios, no
--     un default "solo si no existe").
insert into platform_settings (key, value)
values ('channel_discount_per', '50'), ('channel_discount_max', '2')
on conflict (key) do update set value = excluded.value;

-- ── 11. Refresca restaurant_billing.monthly_fee (auto_price) con
--     la fórmula nueva, igual que 050/057/070/072/073.
select leogin_apply_auto_price_all();
