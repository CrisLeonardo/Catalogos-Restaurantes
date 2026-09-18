-- ============================================================
--  133 · Servir plato por plato
--  ------------------------------------------------------------
--  El rediseño del módulo de servicio (handoff «Servicio», 2026-09-17)
--  pide una vista de «qué falta servir» POR MESA, con un botón «Servido»
--  en cada renglón.
--
--  Eso no se podía escribir. El estado vive en el PEDIDO
--  (`orders.status`), así que «servido» era todo o nada: una mesa que
--  pidió pepián y limonada en la misma comanda tenía que esperar a que
--  saliera el pepián para poder marcar la limonada, o mentir marcando las
--  dos. En una mesa de seis con tres rondas eso es justo el dato que el
--  mesero necesita al volver a la barra: qué le falta llevar.
--
--  `served_at` en la línea responde eso sin tocar el recorrido del
--  pedido, que sigue siendo el de siempre: NEW → PREP → READY → SERVED.
--  Cuando todas las líneas vivas de un pedido tienen `served_at`, el
--  pedido pasa a SERVED — lo hace la acción, no un disparador, porque
--  ese salto ya tiene dueño (`updateOrderStatus`) y dos sitios que
--  escriban el mismo estado es cómo se llega a que discrepen.
--
--  QUÉ NO CAMBIA. Nada que ya existiera. Una línea sin `served_at` en un
--  pedido SERVED se lee como servida (es lo que hay en toda la historia
--  anterior a esta migración): la regla está en `lib/servicio/comanda.ts`
--  y no depende de rellenar el pasado.
--
--  Idempotente. Ejecutar DESPUÉS de 001..132.
-- ============================================================

alter table order_items
  add column if not exists served_at timestamptz;

comment on column order_items.served_at is
  'Cuándo se llevó ESTE plato a la mesa. NULL = todavía no, o pedido '
  'anterior a la migración 133 (ahí manda orders.status: si el pedido '
  'está SERVED/DELIVERED, sus líneas se leen como servidas). Es lo que '
  'permite la vista «falta servir» por mesa del módulo de servicio.';

-- La pregunta es siempre «de este pedido, qué falta servir».
create index if not exists order_items_por_servir_idx
  on order_items (order_id)
  where served_at is null;
