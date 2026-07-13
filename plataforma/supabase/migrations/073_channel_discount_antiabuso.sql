-- ============================================================
--  Migración 073 — Anti-abuso del descuento "Plan a tu medida"
--  ------------------------------------------------------------
--  Problema (detectado 2026-07-13): leogin_active_channels leía el
--  estado EN VIVO de restaurant_themes.config->orderTypes en el
--  instante exacto en que se generaba la factura del mes (cron
--  diario, leogin_generate_monthly_invoices). Un dueño podía apagar
--  un canal (Domicilio o Local) la noche antes del corte y volverlo
--  a prender minutos después de generada la factura, cobrando el
--  descuento (−Q100) por un mes completo de servicio real sin haber
--  dejado de usar el canal ni un solo día.
--
--  Decisión del dueño (2026-07-13):
--   1) El descuento de un canal NUNCA se refleja en el cobro del
--      mismo ciclo en que se apaga — solo desde el ciclo siguiente.
--   2) Además, exige que ese canal haya estado apagado al menos el
--      75% de los días del ciclo ANTERIOR (25% de margen para que
--      el restaurante lo pruebe sin perder el descuento del mes).
--   3) Sin candado operativo: el dueño puede reactivar el canal
--      cuando quiera (el checkout siempre refleja el estado EN VIVO)
--      — solo el CÁLCULO DEL COBRO tiene memoria, no el canal.
--
--  Requiere: historial de encendido/apagado por canal
--  (restaurant_channel_log), escrito por un TRIGGER en
--  restaurant_themes (no por la app). Primera versión de esta
--  migración lo escribía desde la app (logChannelChanges llamado en
--  3 puntos); se cambió a trigger porque en revisión se encontraron
--  AL MENOS 4 caminos reales que mutan config.orderTypes sin pasar
--  por esos 3 puntos: signup.ts (alta de restaurante), duplicación
--  de restaurante (super-admin.ts), saveOrdersAndCurrency
--  (/admin/ajustes — el mismo toggle "Comer en local" que también
--  vive en /admin/modulos) y un caso borde donde el "estado previo"
--  no se podía reconstruir con precisión desde la app. Un trigger
--  sobre la tabla es estructuralmente imposible de saltarse: CUALQUIER
--  INSERT/UPDATE de restaurant_themes.config queda cubierto, incluidos
--  caminos futuros que todavía no existen.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..072.
-- ============================================================

-- ── 1. Tabla de historial ────────────────────────────────────
create table if not exists restaurant_channel_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  channel       text not null check (channel in ('local', 'delivery')),
  is_active     boolean not null,
  changed_at    timestamptz not null default now(),
  changed_by    uuid references profiles(id) on delete set null
);

create index if not exists restaurant_channel_log_lookup
  on restaurant_channel_log (restaurant_id, channel, changed_at);

comment on table restaurant_channel_log is
  'Historial de encendido/apagado de canales de servicio (local/delivery) por restaurante, escrito por trigger (trg_restaurant_channel_log). Base del descuento "Plan a tu medida": evita que apagar un canal justo antes del cobro otorgue el descuento del mes sin haber dejado de usarlo (mig. 073).';

-- Solo accesible por service_role (igual que activity_log, loyalty_transactions,
-- restaurant_billing, etc.): sin políticas, RLS deniega todo a anon/authenticated.
alter table restaurant_channel_log enable row level security;

-- ── 2. Backfill: una fila inicial por canal reflejando el estado
--    actual, fechada 2 meses atrás — para no penalizar de golpe
--    configuraciones ya existentes con el nuevo requisito de
--    historial (sin esto, todo restaurante con un canal ya apagado
--    perdería el descuento en su próxima factura por "falta de
--    historial", que no es lo que queremos). El trigger (paso 3)
--    solo dispara con cambios FUTUROS; este backfill cubre el
--    estado ya existente. ──
insert into restaurant_channel_log (restaurant_id, channel, is_active, changed_at)
select rt.restaurant_id,
       c.channel,
       case c.channel
         when 'local'    then coalesce((rt.config->'orderTypes') ?| array['dine_in', 'pickup'], true)
         when 'delivery' then coalesce((rt.config->'orderTypes') ? 'delivery', true)
       end as is_active,
       now() - interval '2 months'
  from restaurant_themes rt
  cross join (values ('local'), ('delivery')) as c(channel)
 where not exists (
   select 1 from restaurant_channel_log l
    where l.restaurant_id = rt.restaurant_id and l.channel = c.channel
 );

-- ── 3. Trigger: registra transiciones de canal en CUALQUIER INSERT
--    o UPDATE de restaurant_themes.config, sin importar qué código
--    lo dispare. Para un INSERT (alta o duplicación de restaurante)
--    compara contra el estado "todo encendido" (el default real de
--    una cuenta nueva) para no perder el baseline de un canal que
--    nace apagado. ──
create or replace function leogin_log_channel_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old_types    jsonb;
  v_new_types    jsonb := coalesce(new.config->'orderTypes', '["dine_in","delivery","pickup"]'::jsonb);
  v_old_local    boolean;
  v_new_local    boolean;
  v_old_delivery boolean;
  v_new_delivery boolean;
begin
  if tg_op = 'INSERT' then
    v_old_types := '["dine_in","delivery","pickup"]'::jsonb; -- baseline de una cuenta nueva
  else
    v_old_types := coalesce(old.config->'orderTypes', '["dine_in","delivery","pickup"]'::jsonb);
    if v_old_types = v_new_types then
      return new;
    end if;
  end if;

  v_old_local    := v_old_types ?| array['dine_in', 'pickup'];
  v_new_local    := v_new_types ?| array['dine_in', 'pickup'];
  v_old_delivery := v_old_types ? 'delivery';
  v_new_delivery := v_new_types ? 'delivery';

  if v_old_local is distinct from v_new_local then
    insert into restaurant_channel_log (restaurant_id, channel, is_active)
    values (new.restaurant_id, 'local', v_new_local);
  end if;
  if v_old_delivery is distinct from v_new_delivery then
    insert into restaurant_channel_log (restaurant_id, channel, is_active)
    values (new.restaurant_id, 'delivery', v_new_delivery);
  end if;

  return new;
end;
$$;

comment on function leogin_log_channel_change() is
  'Trigger de restaurant_themes: registra en restaurant_channel_log cualquier transición on/off de "local" o "delivery", sin depender de que el código que llama al UPDATE se acuerde de hacerlo.';

drop trigger if exists trg_restaurant_channel_log on restaurant_themes;
create trigger trg_restaurant_channel_log
  after insert or update of config on restaurant_themes
  for each row
  execute function leogin_log_channel_change();

-- ── 4. Fracción (0-1) de tiempo apagado de un canal dentro de una
--    ventana, sobre el tiempo REALMENTE observado (desde el primer
--    registro de historial disponible) — así una cuenta creada a
--    mitad de la ventana no queda castigada por falta de datos de
--    antes de que existiera. ──
create or replace function leogin_channel_off_fraction(
  p_restaurant_id uuid, p_channel text, p_window_start timestamptz, p_window_end timestamptz
) returns numeric language sql stable security definer set search_path = public as $$
  with events as (
    select is_active, changed_at,
           lead(changed_at) over (order by changed_at) as next_changed_at
      from restaurant_channel_log
     where restaurant_id = p_restaurant_id and channel = p_channel
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

comment on function leogin_channel_off_fraction(uuid, text, timestamptz, timestamptz) is
  'Fracción (0-1) del tiempo observado en que un canal estuvo apagado, dentro de la ventana dada.';

-- ── 5. Canales "apagados" para EFECTOS DE COBRO del periodo dado:
--    mira el ciclo ANTERIOR al que se está por facturar y exige
--    >= 75% apagado. Un canal recién apagado sigue contando como
--    activo (precio completo) hasta el ciclo siguiente. El default
--    de p_period_start se normaliza a UTC — igual que
--    leogin_generate_monthly_invoices (`now() at time zone 'UTC'`)
--    — para que el mes "actual" nunca difiera entre el cron y una
--    llamada interactiva (ej. el preview de /admin/suscripcion) por
--    el TimeZone de la sesión. ──
create or replace function leogin_billed_active_channels(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
) returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_window_start timestamptz := (p_period_start - interval '1 month');
  v_window_end   timestamptz := p_period_start;
  v_local_off    numeric;
  v_delivery_off numeric;
  v_active       int := 0;
begin
  v_local_off    := leogin_channel_off_fraction(p_restaurant_id, 'local',    v_window_start, v_window_end);
  v_delivery_off := leogin_channel_off_fraction(p_restaurant_id, 'delivery', v_window_start, v_window_end);

  if v_local_off < 0.75    then v_active := v_active + 1; end if;
  if v_delivery_off < 0.75 then v_active := v_active + 1; end if;

  return v_active;
end;
$$;

comment on function leogin_billed_active_channels(uuid, date) is
  'Canales activos para efectos de COBRO del periodo dado: un canal solo cuenta como apagado (elegible para el descuento) si estuvo apagado >= 75% del ciclo ANTERIOR. Reemplaza a leogin_active_channels (estado en vivo) dentro del cálculo de mensualidad — leogin_active_channels se conserva para usos operativos/UI que sí deben reflejar el estado actual.';

-- ── 6. leogin_compute_monthly_fee: ahora recibe el periodo a
--    facturar (default: mes actual en UTC) y usa el historial — no
--    el estado en vivo — para el descuento de canal. El resto de la
--    fórmula (branch discount, addons) no cambia.
--    IMPORTANTE: hay que tumbar la firma vieja de 1 argumento — un
--    `create or replace` con una firma distinta (parámetro nuevo) NO
--    la reemplaza, crea una función sobrecargada, y entonces
--    leogin_compute_monthly_fee(uuid) queda AMBIGUO (dos candidatos)
--    para cualquier llamador que solo mande el restaurant_id. ──
drop function if exists leogin_compute_monthly_fee(uuid);

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
    when 'ESTANDAR' then leogin_setting_num('plan_price_ESTANDAR', 399)
    when 'PREMIUM'  then leogin_setting_num('plan_price_PREMIUM',  749)
    when 'PRO'      then leogin_setting_num('plan_price_PRO',     999)
    else null
  end;
  if v_base is null then return 0; end if;

  if leogin_plan_has_channel_discount(v_plan) then
    v_per      := leogin_setting_num('channel_discount_per', 100);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 1)::int);
    v_active   := leogin_billed_active_channels(p_restaurant_id, p_period_start);
    v_disabled := least(greatest(2 - v_active, 0), v_max_off);
    v_chan_disc := v_disabled * v_per;
  end if;

  v_branch_pct := leogin_branch_discount_pct(v_org_id, p_restaurant_id);
  v_plan_net   := greatest(v_base - v_chan_disc, 0) * (1 - v_branch_pct);

  v_addon := leogin_addon_modules_cost(p_restaurant_id);

  return greatest(round(v_plan_net + v_addon), 0);
end;
$$;

-- ── 7. leogin_fee_breakdown: agrega el periodo y expone tanto el
--    estado EN VIVO como el FACTURADO (pueden diferir por el
--    retraso de un ciclo) para que el dueño entienda la diferencia
--    en /admin/suscripcion. Misma razón que arriba: tumbar la firma
--    vieja de 1 argumento para no dejarla ambigua. ──
drop function if exists leogin_fee_breakdown(uuid);

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
  v_addon         numeric := 0;
  v_final         numeric;
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

  v_applies       := leogin_plan_has_channel_discount(v_plan);
  v_active_live   := leogin_active_channels(p_restaurant_id);
  v_active_billed := leogin_billed_active_channels(p_restaurant_id, p_period_start);
  if v_applies then
    v_per      := leogin_setting_num('channel_discount_per', 100);
    v_max_off  := greatest(0, leogin_setting_num('channel_discount_max', 1)::int);
    v_disabled := least(greatest(2 - v_active_billed, 0), v_max_off);
    v_chan_disc := v_disabled * v_per;
  end if;

  v_branch_pct := leogin_branch_discount_pct(v_org_id, p_restaurant_id);
  v_addon      := leogin_addon_modules_cost(p_restaurant_id);
  v_final      := leogin_compute_monthly_fee(p_restaurant_id, p_period_start);

  return jsonb_build_object(
    'plan',                   v_plan,
    'base',                   v_base,
    'channels_active_live',   v_active_live,
    'channels_active_billed', v_active_billed,
    'channels_total',         2,
    'discount_applies',       v_applies,
    'discount_per',           coalesce(v_per, 0),
    'channels_off',           v_disabled,
    'discount',               v_chan_disc,
    'branch_discount_pct',    v_branch_pct,
    'addon_total',            v_addon,
    'final',                  v_final
  );
end;
$$;

-- ── 8. Refresca de una vez restaurant_billing.monthly_fee (filas
--    auto_price=true) con la fórmula nueva, igual que hacen las
--    migraciones hermanas 050/057/070/072 al cambiar el cálculo —
--    si no, el precio mostrado queda con la fórmula VIEJA hasta el
--    próximo toggle de canal o la próxima corrida del cron. ──
select leogin_apply_auto_price_all();
