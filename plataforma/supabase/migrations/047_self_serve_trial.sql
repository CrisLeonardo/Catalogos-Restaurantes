-- ============================================================
--  Migración 047 — Registro self-serve + prueba gratis
--  ------------------------------------------------------------
--  Permite que un restaurante se registre solo desde la web y
--  quede EN VIVO con una prueba gratis: el restaurante está
--  activo (status='active') pero su cobro está pausado
--  (restaurant_billing.active=false) hasta que la prueba vence.
--
--  Cuando la prueba vence, leogin_graduate_trials() activa el
--  cobro automáticamente (lo corre el cron diario antes de
--  generar las mensualidades). Leonardo registra los pagos como
--  siempre desde /super/cobros.
--  Ejecutar DESPUÉS de 001..046.
-- ============================================================

-- ── 1. Columna de fin de prueba ─────────────────────────────
alter table restaurant_billing
  add column if not exists trial_ends_at timestamptz;

comment on column restaurant_billing.trial_ends_at is
  'Fin de la prueba gratis. Mientras active=false y trial_ends_at>now() el restaurante está en vivo sin cobro. Al vencer, leogin_graduate_trials() activa el cobro.';

-- ── 2. Graduar pruebas vencidas (activa el cobro) ───────────
create or replace function leogin_graduate_trials()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with graduated as (
    update restaurant_billing
       set active        = true,
           started_at    = coalesce(started_at, (now() at time zone 'UTC')::date),
           updated_at    = now()
     where active = false
       and trial_ends_at is not null
       and trial_ends_at <= now()
    returning restaurant_id
  )
  select count(*) into v_count from graduated;
  return v_count;
end;
$$;

-- ── 3. El cron diario gradúa pruebas antes de cobrar ────────
create or replace function leogin_billing_cron()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform leogin_graduate_trials();
  if leogin_setting_bool('billing_auto_generate', true) then
    perform leogin_generate_monthly_invoices();
  end if;
  perform leogin_process_overdue();
end;
$$;

-- ── 4. Duración de la prueba (editable desde platform_settings) ──
insert into platform_settings (key, value) values
  ('trial_days', '14')
on conflict (key) do nothing;

-- ── 5. Onboarding guiado para registros self-serve ──────────
-- Los restaurantes ya existentes quedan como "ya configurados" (default true);
-- el registro self-serve crea la fila con onboarding_done=false para mostrar
-- el asistente guiado la primera vez que el dueño entra a su panel.
alter table restaurants
  add column if not exists onboarding_done boolean not null default true;

comment on column restaurants.onboarding_done is
  'false = mostrar el asistente de configuración inicial en el panel del dueño (registro self-serve).';

-- ── 6. Permitir self-serve: el slug público sigue siendo único ──
-- (no se requieren cambios de RLS: el registro usa service role validado por
--  rate-limit y validación de entrada en la server action signupRestaurant).
