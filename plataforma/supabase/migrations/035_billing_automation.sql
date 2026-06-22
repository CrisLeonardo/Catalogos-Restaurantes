-- ============================================================
--  Migración 035 — Automatización del cobro (sobre 028)
--  ------------------------------------------------------------
--  Objetivo: quitar el trabajo manual del cobro a restaurantes.
--   1. Precio AUTOMÁTICO según el plan (Básico/Popular/Premium)
--      + sucursales extra, con override por restaurante.
--   2. Generación AUTOMÁTICA de la mensualidad cada mes.
--   3. Impago AUTOMÁTICO: vencido → período de gracia → suspende.
--   4. pg_cron diario que corre 2 y 3 sin tocar botones.
--
--  Precios y días de gracia viven en platform_settings (editables
--  desde el Super Admin). Todo el acceso de la app sigue siendo por
--  service role; estas funciones son SECURITY DEFINER para el cron.
--  Ejecutar DESPUÉS de 001..034.
-- ============================================================

-- ── 1. Parámetros globales de precio + gracia ───────────────
insert into platform_settings (key, value) values
  ('plan_price_BASICO',         '200'),
  ('plan_price_POPULAR',        '600'),
  ('plan_price_PREMIUM',        '1200'),
  ('extra_branch_fee',          '600'),
  ('premium_included_branches', '2'),
  ('setup_fee_default',         '500'),
  ('billing_grace_days',        '10'),
  ('billing_auto_suspend',      'true'),
  ('billing_auto_generate',     'true')
on conflict (key) do nothing;

-- ── 2. Columnas nuevas en restaurant_billing ────────────────
alter table restaurant_billing
  add column if not exists auto_price               boolean not null default true,
  add column if not exists grace_days               int,                 -- null = usa el global
  add column if not exists suspended_for_nonpayment boolean not null default false;

comment on column restaurant_billing.auto_price is
  'true = la mensualidad se calcula del plan+sucursales. false = monto manual (override).';
comment on column restaurant_billing.grace_days is
  'Días de gracia tras el vencimiento antes de suspender. null = usa billing_grace_days global.';
comment on column restaurant_billing.suspended_for_nonpayment is
  'true si el sistema lo suspendió por impago (para reactivar solo al pagar, sin tocar suspensiones manuales).';

-- Preservar lo ya configurado a mano: las filas con precio > 0 quedan como
-- override para no pisar precios pactados al activar el modo automático.
update restaurant_billing set auto_price = false where monthly_fee > 0;

-- ── 3. Helpers para leer platform_settings con default ──────
create or replace function leogin_setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select value from platform_settings where key = p_key), '')::numeric,
    p_default
  );
$$;

create or replace function leogin_setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select value from platform_settings where key = p_key), '')::boolean,
    p_default
  );
$$;

-- ── 4. Precio sugerido según plan + sucursales ──────────────
-- Básico/Popular = precio del plan (cada sucursal se cobra por separado, ya
-- que cada una tiene su propia fila de cobro).
-- Premium = el plan incluye N sucursales (default 2); la 1ª sucursal del grupo
-- carga el precio Premium (cubre las incluidas) y las extra cobran extra_branch_fee.
--   2 sucursales = 1200 ·  3 = 1800 ·  4 = 2400  (coincide con el modelo).
create or replace function leogin_compute_monthly_fee(p_restaurant_id uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_plan     text;
  v_org      uuid;
  v_included int;
  v_premium  numeric;
  v_extra    numeric;
  v_rank     int;
begin
  select plan_actual, organization_id into v_plan, v_org
  from restaurants where id = p_restaurant_id;
  if v_plan is null then return 0; end if;

  if v_plan = 'BASICO' then
    return leogin_setting_num('plan_price_BASICO', 200);
  elsif v_plan = 'POPULAR' then
    return leogin_setting_num('plan_price_POPULAR', 600);
  elsif v_plan = 'PREMIUM' then
    v_premium  := leogin_setting_num('plan_price_PREMIUM', 1200);
    v_extra    := leogin_setting_num('extra_branch_fee', 600);
    v_included := greatest(1, leogin_setting_num('premium_included_branches', 2)::int);
    if v_org is null then
      return v_premium;  -- restaurante Premium independiente
    end if;
    -- posición de esta sucursal dentro de su grupo (estable por antigüedad)
    select rnk into v_rank from (
      select id, row_number() over (order by created_at, id) as rnk
      from restaurants
      where organization_id = v_org and plan_actual = 'PREMIUM'
    ) s where s.id = p_restaurant_id;
    if v_rank is null or v_rank = 1 then
      return v_premium;        -- 1ª sucursal: cubre las incluidas
    elsif v_rank <= v_included then
      return 0;                -- sucursales incluidas en el plan
    else
      return v_extra;          -- sucursal extra
    end if;
  end if;
  return 0;
end;
$$;

-- ── 5. Días de gracia efectivos (override por restaurante → global → 10) ──
create or replace function leogin_effective_grace_days(p_restaurant_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select grace_days from restaurant_billing where restaurant_id = p_restaurant_id),
    leogin_setting_num('billing_grace_days', 10)::int,
    10
  );
$$;

-- ── 6. Aplicar el precio automático (uno / todos) ───────────
create or replace function leogin_apply_auto_price(p_restaurant_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_fee numeric;
begin
  v_fee := leogin_compute_monthly_fee(p_restaurant_id);
  update restaurant_billing
     set monthly_fee = v_fee, updated_at = now()
   where restaurant_id = p_restaurant_id and auto_price = true;
  return v_fee;
end;
$$;

create or replace function leogin_apply_auto_price_all()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in select restaurant_id from restaurant_billing where auto_price = true loop
    update restaurant_billing
       set monthly_fee = leogin_compute_monthly_fee(r.restaurant_id), updated_at = now()
     where restaurant_id = r.restaurant_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 7. Generación idempotente de la mensualidad del mes ─────
create or replace function leogin_generate_monthly_invoices()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', now() at time zone 'UTC')::date;
  v_count  int  := 0;
  c        record;
  v_fee    numeric;
  v_due    date;
begin
  for c in select * from restaurant_billing where active = true loop
    if c.auto_price then
      v_fee := leogin_compute_monthly_fee(c.restaurant_id);
      update restaurant_billing set monthly_fee = v_fee, updated_at = now()
        where restaurant_id = c.restaurant_id;
    else
      v_fee := c.monthly_fee;
    end if;
    if v_fee is null or v_fee <= 0 then continue; end if;

    -- el índice único (restaurant_id, period) where MONTHLY garantiza no duplicar
    if exists (
      select 1 from invoices
      where restaurant_id = c.restaurant_id and concept = 'MONTHLY' and period = v_period
    ) then
      continue;
    end if;

    v_due := make_date(
      extract(year  from v_period)::int,
      extract(month from v_period)::int,
      least(28, greatest(1, coalesce(c.billing_day, 1)))
    );

    insert into invoices (restaurant_id, concept, description, period, amount, currency, status, due_date)
    values (
      c.restaurant_id, 'MONTHLY',
      'Mensualidad ' || to_char(v_period, 'YYYY-MM'),
      v_period, v_fee, coalesce(c.currency, 'GTQ'), 'PENDING', v_due
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── 8. Sincronizar el estado de UN restaurante (suspender/reactivar) ──
-- Suspende si tiene un cobro vencido más allá de la gracia; reactiva si pagó
-- (solo si la suspensión fue por impago, nunca toca suspensiones manuales).
create or replace function leogin_sync_restaurant_status(p_restaurant_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_auto_suspend boolean := leogin_setting_bool('billing_auto_suspend', true);
  v_grace        int     := leogin_effective_grace_days(p_restaurant_id);
  v_has_overdue  boolean;
  v_billing_act  boolean;
  v_status       text;
  v_flag         boolean;
begin
  select status into v_status from restaurants where id = p_restaurant_id;
  select active, suspended_for_nonpayment into v_billing_act, v_flag
    from restaurant_billing where restaurant_id = p_restaurant_id;
  if v_billing_act is null then return 'no-billing'; end if;

  select exists (
    select 1 from invoices
    where restaurant_id = p_restaurant_id
      and status = 'PENDING'
      and due_date is not null
      and (due_date + v_grace) < (now() at time zone 'UTC')::date
  ) into v_has_overdue;

  if v_has_overdue and v_billing_act then
    if v_auto_suspend and v_status = 'active' then
      update restaurants        set status = 'suspended'            where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = true where restaurant_id = p_restaurant_id;
      return 'suspended';
    end if;
  else
    -- sin mora: reactivar SOLO si el sistema lo había suspendido por impago
    if v_flag and v_status = 'suspended' then
      update restaurants        set status = 'active'                where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
      return 'reactivated';
    elsif v_flag then
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
    end if;
  end if;
  return 'unchanged';
end;
$$;

-- ── 9. Procesar impago de TODOS (para el cron) ──────────────
create or replace function leogin_process_overdue()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record; v_res text;
begin
  for r in select restaurant_id from restaurant_billing loop
    v_res := leogin_sync_restaurant_status(r.restaurant_id);
    if v_res in ('suspended', 'reactivated') then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- ── 10. Tarea diaria: generar + procesar impago ─────────────
create or replace function leogin_billing_cron()
returns void language plpgsql security definer set search_path = public as $$
begin
  if leogin_setting_bool('billing_auto_generate', true) then
    perform leogin_generate_monthly_invoices();
  end if;
  perform leogin_process_overdue();
end;
$$;

-- ── 11. Programar el cron diario (si pg_cron está disponible) ──
-- 13:00 UTC ≈ 07:00 Guatemala. Idempotente: re-programa si ya existía.
-- Si pg_cron no está habilitado, no falla la migración: el botón "Generar
-- cobros" del panel corre el mismo motor manualmente como respaldo.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-billing-daily') then
        perform cron.unschedule('leogin-billing-daily');
      end if;
      perform cron.schedule('leogin-billing-daily', '0 13 * * *', 'select leogin_billing_cron();');
      raise notice 'pg_cron: job "leogin-billing-daily" programado (13:00 UTC diario).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actívalo en el dashboard y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: la generación corre por el panel (respaldo manual).';
  end if;
end $$;
