-- ============================================================
--  Migración 075 — Ajuste de precios Estándar/Premium
--  ------------------------------------------------------------
--  Nuevos precios:
--    ESTANDAR Q399 → Q299
--    PREMIUM  Q749 → Q599
--  (BASICO y PRO no cambian.)
--
--  Reconcilia platform_settings (fuente real que usan
--  leogin_compute_monthly_fee / leogin_fee_breakdown) y recalcula
--  la mensualidad de los restaurantes con auto_price = true para
--  que el KPI muestre el valor correcto de inmediato.
--  Idempotente; seguro de re-ejecutar.
-- ============================================================

insert into platform_settings (key, value) values
  ('plan_price_ESTANDAR', '299'),
  ('plan_price_PREMIUM',  '599')
on conflict (key) do update set value = excluded.value;

select leogin_apply_auto_price_all();
