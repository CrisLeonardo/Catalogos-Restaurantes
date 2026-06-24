-- 049_new_plan_tiers.sql
-- Nuevos tiers de planes con límites GMV + trial_days a 30

-- 1. Quitar constraint viejo primero
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_plan_actual_check;

-- 2. Migrar datos ANTES de añadir el nuevo constraint
UPDATE restaurants SET plan_actual = 'PREMIUM' WHERE plan_actual = 'POPULAR';
-- Cualquier otro valor legacy que no esté en la nueva lista → PREMIUM
UPDATE restaurants
  SET plan_actual = 'PREMIUM'
  WHERE plan_actual NOT IN ('BASICO','PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE');

-- 3. Ahora que los datos están limpios, añadir el nuevo constraint
ALTER TABLE restaurants ADD CONSTRAINT restaurants_plan_actual_check
  CHECK (plan_actual IN (
    'BASICO','PREMIUM','PREMIUM_PRO','PREMIUM_ULTRA','ALTO_VOLUMEN','VARIABLE'
  ));

-- 4. Nuevas claves en platform_settings para los precios de cada plan
INSERT INTO platform_settings (key, value) VALUES
  ('plan_price_BASICO',        '299'),
  ('plan_price_PREMIUM',       '600'),
  ('plan_price_PREMIUM_PRO',   '1000'),
  ('plan_price_PREMIUM_ULTRA', '1500'),
  ('plan_price_ALTO_VOLUMEN',  '2250'),
  ('plan_gmv_limit_PREMIUM',       '20000'),
  ('plan_gmv_limit_PREMIUM_PRO',   '40000'),
  ('plan_gmv_limit_PREMIUM_ULTRA', '75000'),
  ('plan_gmv_limit_ALTO_VOLUMEN',  '150000'),
  ('plan_gmv_variable_threshold',  '225000'),
  ('plan_gmv_variable_pct',        '0.01'),
  ('plan_gmv_alert_pct',           '0.80'),
  ('group_panel_fee',              '250')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Eliminar claves obsoletas del modelo anterior
DELETE FROM platform_settings WHERE key IN (
  'plan_price_POPULAR',
  'extra_branch_fee',
  'premium_included_branches'
);

-- 5. Actualizar trial_days a 30 (un mes completo)
UPDATE platform_settings SET value = '30' WHERE key = 'trial_days';

-- 6. Vista helper: GMV del mes actual por restaurante
CREATE OR REPLACE VIEW restaurant_gmv_current_month AS
SELECT
  restaurant_id,
  COALESCE(SUM(total), 0)::numeric AS gmv_current_month,
  COUNT(*)::int                    AS orders_current_month,
  date_trunc('month', now())       AS period_start
FROM orders
WHERE status != 'CANCEL'
  AND created_at >= date_trunc('month', now())
  AND created_at <  date_trunc('month', now()) + interval '1 month'
GROUP BY restaurant_id;

ALTER VIEW restaurant_gmv_current_month OWNER TO postgres;

-- 7. Actualizar la RPC leogin_compute_monthly_fee para nuevos planes
CREATE OR REPLACE FUNCTION leogin_compute_monthly_fee(p_restaurant_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan        text;
  v_org_id      uuid;
  v_base_fee    numeric;
  v_gmv         numeric;
  v_var_pct     numeric;
BEGIN
  SELECT plan_actual, organization_id
    INTO v_plan, v_org_id
    FROM restaurants WHERE id = p_restaurant_id;

  -- Precio base por plan
  v_base_fee := CASE v_plan
    WHEN 'BASICO'        THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_BASICO'        LIMIT 1)
    WHEN 'PREMIUM'       THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_PREMIUM'       LIMIT 1)
    WHEN 'PREMIUM_PRO'   THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_PREMIUM_PRO'   LIMIT 1)
    WHEN 'PREMIUM_ULTRA' THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_PREMIUM_ULTRA' LIMIT 1)
    WHEN 'ALTO_VOLUMEN'  THEN (SELECT value::numeric FROM platform_settings WHERE key = 'plan_price_ALTO_VOLUMEN'  LIMIT 1)
    WHEN 'VARIABLE'      THEN NULL
    ELSE 0
  END;

  -- Plan VARIABLE: 1% del GMV del mes, mínimo Q2,250
  IF v_plan = 'VARIABLE' THEN
    SELECT COALESCE(SUM(total), 0) INTO v_gmv
      FROM orders
     WHERE restaurant_id = p_restaurant_id
       AND status != 'CANCEL'
       AND created_at >= date_trunc('month', now());
    v_var_pct := COALESCE(
      (SELECT value::numeric FROM platform_settings WHERE key = 'plan_gmv_variable_pct' LIMIT 1), 0.01
    );
    v_base_fee := GREATEST(v_gmv * v_var_pct, 2250);
  END IF;

  RETURN COALESCE(v_base_fee, 0);
END;
$$;
