-- ============================================================
--  Migración 013 – Soporte completo para DINE_IN
--  1. Corrige el CHECK constraint de orders.order_type para
--     permitir 'DINE_IN' (antes solo aceptaba PICKUP / DELIVERY).
--  2. Agrega 'dine_in' al array orderTypes de los restaurantes
--     que ya tenían config guardada sin él, para que la opción
--     "Comer aquí" aparezca automáticamente en el checkout.
--  Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ── 1. Constraint de order_type ───────────────────────────────
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('PICKUP', 'DELIVERY', 'DINE_IN'));

-- ── 2. Configs existentes sin dine_in ─────────────────────────
-- Solo toca filas cuyo config->'orderTypes' existe y no incluye
-- 'dine_in'. Lo inserta al inicio para que sea la opción por defecto.
UPDATE restaurant_themes
SET config = jsonb_set(
  config,
  '{orderTypes}',
  '["dine_in"]'::jsonb || (config -> 'orderTypes')
)
WHERE config -> 'orderTypes' IS NOT NULL
  AND NOT (config -> 'orderTypes') @> '["dine_in"]'::jsonb;
