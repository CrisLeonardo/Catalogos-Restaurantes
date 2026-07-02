-- ============================================================
--  Migración 060 — intervalo de gasto configurable ("cada cuánto")
--  ------------------------------------------------------------
--  Antes: earn_rate = puntos por cada Q10 gastados, con el "Q10"
--  fijo en el código (award/10). Ahora el intervalo también es
--  configurable vía earn_amount (default 10, igual que antes) —
--  el admin puede fijar, por ejemplo, "1 punto por cada Q25".
--  Ejecutar DESPUÉS de 001..059.
-- ============================================================

alter table loyalty_settings
  add column if not exists earn_amount numeric(8,2) not null default 10;

comment on column loyalty_settings.earn_amount is
  'Monto (Q) sobre el que se aplica earn_rate para la regla general. '
  'Ej. earn_rate=1, earn_amount=10 → 1 punto por cada Q10 gastados.';

comment on column loyalty_settings.earn_rate is
  'Puntos otorgados por cada earn_amount (Q) gastados (regla general; los '
  'productos con loyalty_points propio la ignoran).';
