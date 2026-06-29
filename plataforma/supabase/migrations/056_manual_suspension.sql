-- ============================================================
--  Migración 056 — Suspensión manual + módulos premium
--  ------------------------------------------------------------
--  1. Deshabilita la suspensión automática por impago.
--     El cron sigue detectando la mora y la reporta, pero ya no
--     suspende el restaurante sin intervención manual.
--  2. Actualiza leogin_sync_restaurant_status para que, aunque
--     billing_auto_suspend = false, siga retornando 'needs_suspension'
--     cuando hay mora, para que los dashboards puedan mostrarlo.
--  Idempotente; seguro de re-ejecutar.
-- ============================================================

-- 1. Apagar la suspensión automática
UPDATE platform_settings
   SET value = 'false'
 WHERE key = 'billing_auto_suspend';

-- Si por alguna razón la fila no existe, insertarla desactivada
INSERT INTO platform_settings (key, value)
  VALUES ('billing_auto_suspend', 'false')
  ON CONFLICT (key) DO NOTHING;

-- 2. Reemplazar leogin_sync_restaurant_status para retornar
--    'needs_suspension' cuando hay mora y auto_suspend = false
--    (en lugar de 'unchanged'), de modo que leogin_process_overdue
--    pueda contarlo y el panel mostrarlo fácilmente.
CREATE OR REPLACE FUNCTION leogin_sync_restaurant_status(p_restaurant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auto_suspend BOOLEAN := leogin_setting_bool('billing_auto_suspend', false);
  v_grace        INT     := leogin_effective_grace_days(p_restaurant_id);
  v_has_overdue  BOOLEAN;
  v_billing_act  BOOLEAN;
  v_status       TEXT;
  v_flag         BOOLEAN;
BEGIN
  SELECT status INTO v_status FROM restaurants WHERE id = p_restaurant_id;
  SELECT active, suspended_for_nonpayment INTO v_billing_act, v_flag
    FROM restaurant_billing WHERE restaurant_id = p_restaurant_id;
  IF v_billing_act IS NULL THEN RETURN 'no-billing'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM invoices
     WHERE restaurant_id = p_restaurant_id
       AND status = 'PENDING'
       AND due_date IS NOT NULL
       AND (due_date + v_grace) < (now() AT TIME ZONE 'UTC')::date
  ) INTO v_has_overdue;

  IF v_has_overdue AND v_billing_act THEN
    IF v_auto_suspend AND v_status = 'active' THEN
      -- Suspensión automática habilitada: suspender
      UPDATE restaurants        SET status = 'suspended'            WHERE id = p_restaurant_id;
      UPDATE restaurant_billing SET suspended_for_nonpayment = true WHERE restaurant_id = p_restaurant_id;
      RETURN 'suspended';
    ELSIF v_status = 'active' THEN
      -- Suspensión manual: solo sugerir (sin tocar el restaurante)
      RETURN 'needs_suspension';
    END IF;
  ELSE
    -- Sin mora: reactivar SOLO si el sistema lo había suspendido por impago
    IF v_flag AND v_status = 'suspended' THEN
      UPDATE restaurants        SET status = 'active'                WHERE id = p_restaurant_id;
      UPDATE restaurant_billing SET suspended_for_nonpayment = false WHERE restaurant_id = p_restaurant_id;
      RETURN 'reactivated';
    ELSIF v_flag THEN
      UPDATE restaurant_billing SET suspended_for_nonpayment = false WHERE restaurant_id = p_restaurant_id;
    END IF;
  END IF;
  RETURN 'unchanged';
END;
$$;

-- 3. Actualizar el contador en leogin_process_overdue para incluir needs_suspension
CREATE OR REPLACE FUNCTION leogin_process_overdue()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT := 0; r RECORD; v_res TEXT;
BEGIN
  FOR r IN SELECT restaurant_id FROM restaurant_billing LOOP
    v_res := leogin_sync_restaurant_status(r.restaurant_id);
    IF v_res IN ('suspended', 'reactivated', 'needs_suspension') THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
