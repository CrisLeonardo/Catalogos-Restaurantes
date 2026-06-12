-- ============================================================
--  Migración 012 — Disponibilidad avanzada de productos
--  · is_active:      oculto permanente (el restaurante decide)
--  · unavailable_at: marca de tiempo para auto-restaurar en 12h
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_active       boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unavailable_at  timestamptz          NULL;

COMMENT ON COLUMN products.is_active IS
  'true = el producto puede aparecer en el menú; '
  'false = oculto permanentemente hasta que el restaurante lo reactive.';

COMMENT ON COLUMN products.unavailable_at IS
  'Timestamp de cuando fue marcado no-disponible (is_available=false). '
  'El catálogo del cliente lo muestra tachado si now()-unavailable_at < 12h, '
  'y como disponible de nuevo si >= 12h. Se pone NULL al marcarlo disponible.';

-- La política pública ahora filtra por is_active en lugar de is_available.
-- Los productos no-disponibles (is_available=false) se devuelven al cliente
-- para mostrarlos tachados durante las primeras 12h; después se muestran normales.
DROP POLICY IF EXISTS "products_select_available" ON products;

CREATE POLICY "products_select_available"
  ON products FOR SELECT
  USING (is_active = true);
