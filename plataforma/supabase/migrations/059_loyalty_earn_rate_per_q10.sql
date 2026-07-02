-- ============================================================
--  Migración 059 — earn_rate pasa a expresarse "por cada Q10"
--  ------------------------------------------------------------
--  Antes: earn_rate = puntos por cada Q1 gastado (ej. 1 = 1pt/Q1).
--  Ahora: earn_rate = puntos por cada Q10 gastados (ej. 1 = 1pt/Q10),
--  unidad más clara para el admin (ver loyalty-panel.tsx). Se
--  multiplica x10 lo ya configurado para que el comportamiento
--  real NO cambie en restaurantes existentes — solo cambia la
--  unidad, y el nuevo default (1 pt/Q10) para quien configure la
--  tasa desde cero.
--  Ejecutar DESPUÉS de 001..058.
-- ============================================================

update loyalty_settings set earn_rate = earn_rate * 10;

alter table loyalty_settings alter column earn_rate set default 1;

comment on column loyalty_settings.earn_rate is
  'Puntos otorgados por cada Q10 gastados (regla general; los productos '
  'con loyalty_points propio la ignoran). Ej. 1 = 1 punto por cada Q10.';
