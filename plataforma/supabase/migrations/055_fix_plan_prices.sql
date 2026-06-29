-- ============================================================
--  Migración 055 — Corrección de precios de planes
--  ------------------------------------------------------------
--  Los precios correctos son:
--    BASICO Q199 · ESTANDAR Q399 · PREMIUM Q599 · PREMIUM_PRO Q999
--    PREMIUM_ULTRA Q1,499 · ALTO_VOLUMEN Q2,249
--
--  Reconcilia el valor incorrecto de '600' que pudo quedar en
--  platform_settings si la mig. 049 se corrió antes de la 050.
--  Luego recalcula la mensualidad de todos los restaurantes con
--  auto_price = true para que el KPI muestre el valor correcto.
--  Idempotente; seguro de re-ejecutar.
-- ============================================================

-- 1. Corregir precios en platform_settings
INSERT INTO platform_settings (key, value) VALUES
  ('plan_price_BASICO',        '199'),
  ('plan_price_ESTANDAR',      '399'),
  ('plan_price_PREMIUM',       '599'),
  ('plan_price_PREMIUM_PRO',   '999'),
  ('plan_price_PREMIUM_ULTRA', '1499'),
  ('plan_price_ALTO_VOLUMEN',  '2249')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Recalcular la mensualidad de todos los restaurantes en modo automático
SELECT leogin_apply_auto_price_all();
