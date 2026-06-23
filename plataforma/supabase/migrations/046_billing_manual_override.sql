-- ============================================================
--  Migración 046 — Override manual de suspensión por impago
--  ------------------------------------------------------------
--  Permite al super admin habilitar manualmente un restaurante
--  suspendido por impago y evitar que el cron lo vuelva a
--  suspender automáticamente mientras el override esté activo.
--
--  Cambios:
--   1. Nueva columna `admin_override_suspend` en restaurant_billing.
--   2. `leogin_sync_restaurant_status` actualizada para respetar el override.
-- ============================================================

-- ── 1. Columna nueva ────────────────────────────────────────
alter table restaurant_billing
  add column if not exists admin_override_suspend boolean not null default false;

comment on column restaurant_billing.admin_override_suspend is
  'true = el admin pausó la suspensión automática por impago; el cron no suspenderá a este restaurante aunque tenga facturas vencidas.';

-- ── 2. Función actualizada (respeta el override) ────────────
create or replace function leogin_sync_restaurant_status(p_restaurant_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_auto_suspend   boolean := leogin_setting_bool('billing_auto_suspend', true);
  v_grace          int     := leogin_effective_grace_days(p_restaurant_id);
  v_has_overdue    boolean;
  v_billing_act    boolean;
  v_status         text;
  v_flag           boolean;
  v_admin_override boolean;
begin
  select status into v_status from restaurants where id = p_restaurant_id;
  select active, suspended_for_nonpayment, admin_override_suspend
    into v_billing_act, v_flag, v_admin_override
    from restaurant_billing where restaurant_id = p_restaurant_id;
  if v_billing_act is null then return 'no-billing'; end if;

  -- Verificar si hay facturas vencidas más allá del período de gracia.
  select exists (
    select 1 from invoices
    where restaurant_id = p_restaurant_id
      and status = 'PENDING'
      and due_date is not null
      and (due_date + v_grace) < (now() at time zone 'UTC')::date
  ) into v_has_overdue;

  if v_has_overdue and v_billing_act then
    -- Si el admin activó el override, no suspender aunque haya mora.
    if coalesce(v_admin_override, false) then
      return 'override-active';
    end if;
    if v_auto_suspend and v_status = 'active' then
      update restaurants        set status = 'suspended'            where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = true where restaurant_id = p_restaurant_id;
      return 'suspended';
    end if;
  else
    -- Sin mora: reactivar SOLO si el sistema lo había suspendido por impago
    -- (nunca toca suspensiones manuales).
    if v_flag and v_status = 'suspended' then
      update restaurants        set status = 'active'                where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
      return 'reactivated';
    elsif v_flag then
      -- Ya activo pero el flag quedó sucio, limpiarlo.
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
    end if;
  end if;
  return 'unchanged';
end;
$$;
