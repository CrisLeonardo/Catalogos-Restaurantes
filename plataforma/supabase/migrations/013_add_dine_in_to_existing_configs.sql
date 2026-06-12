-- ============================================================
--  Migración 013 – Agregar dine_in a configs existentes
--  · Restaurantes que tenían orderTypes guardado sin dine_in
--    (antes de que se implementara el tipo DINE_IN) no ven la
--    opción "Comer aquí" porque la BD sobreescribe el default.
--  · Este script inserta 'dine_in' al INICIO del array para
--    que aparezca como primera opción (seleccionada por defecto).
--  · Restaurantes con config NULL no se tocan: ya heredan el
--    nuevo DEFAULT_CONFIG con dine_in incluido.
--  Ejecutar en el SQL Editor de Supabase.
-- ============================================================

UPDATE restaurant_themes
SET config = jsonb_set(
  config,
  '{orderTypes}',
  '["dine_in"]'::jsonb || (config -> 'orderTypes')
)
WHERE config -> 'orderTypes' IS NOT NULL
  AND NOT (config -> 'orderTypes') @> '["dine_in"]'::jsonb;
