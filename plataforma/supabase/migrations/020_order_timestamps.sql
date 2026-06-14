-- ============================================================
--  Migración 020 — Marcas de tiempo de estado del pedido (Fase B)
--  Para analítica: tiempo de preparación y de entrega, y para
--  saber cuándo se canceló. Se sellan en updateOrderStatus.
--  Ejecutar DESPUÉS de 001..019.
-- ============================================================

alter table orders
  add column if not exists accepted_at  timestamptz,  -- pasó a PREP (cocina aceptó)
  add column if not exists ready_at      timestamptz, -- pasó a READY (listo)
  add column if not exists delivered_at  timestamptz, -- pasó a DELIVERED (entregado)
  add column if not exists cancelled_at  timestamptz; -- pasó a CANCEL

comment on column orders.accepted_at is 'Cuándo el pedido pasó a PREP (inicio de preparación).';
comment on column orders.ready_at     is 'Cuándo el pedido pasó a READY (listo).';
comment on column orders.delivered_at is 'Cuándo el pedido pasó a DELIVERED (entregado/cerrado).';
comment on column orders.cancelled_at is 'Cuándo el pedido pasó a CANCEL.';
