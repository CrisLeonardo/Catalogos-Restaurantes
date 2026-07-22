-- ============================================================
--  Migración 089 — Plan Básico pasa a ser gratuito
--  ------------------------------------------------------------
--  BASICO Q149 → Q0. Se mantiene como plan de "menú digital QR
--  sin pedidos en línea", ahora usado como puerta de entrada
--  gratuita (freemium) en vez de plan de pago más bajo.
--
--  Reconcilia platform_settings (fuente real que usan
--  leogin_compute_monthly_fee / leogin_fee_breakdown, que si no
--  encuentra la fila cae al default hardcodeado de 149 en SQL) y
--  recalcula la mensualidad de los restaurantes con auto_price =
--  true para que el KPI muestre el valor correcto de inmediato.
--  Idempotente; seguro de re-ejecutar.
-- ============================================================

insert into platform_settings (key, value) values
  ('plan_price_BASICO', '0')
on conflict (key) do update set value = excluded.value;

select leogin_apply_auto_price_all();
