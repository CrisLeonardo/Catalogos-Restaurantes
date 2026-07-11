-- ============================================================
--  Migración 071 – Estado SERVED para pedidos DINE_IN
--  Separa "comida servida" (SERVED) de "mesa cerrada" (DELIVERED):
--  antes, marcar un plato como servido en mesa reusaba el mismo
--  estado DELIVERED que usa el sistema para saber si la mesa está
--  libre, así que la mesa se veía libre y el pedido desaparecía de
--  "Mis pedidos" apenas se servía la comida, sin que el mesero
--  hubiera cerrado la cuenta. Ahora SERVED es un paso intermedio
--  que sigue contando como mesa ocupada; solo "Marcar como libre"
--  (freeTable) transiciona a DELIVERED.
--  Ejecutar en el SQL Editor de Supabase.
-- ============================================================

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('NEW', 'PREP', 'READY', 'TRANSIT', 'SERVED', 'DELIVERED', 'CANCEL'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS served_at timestamptz;
