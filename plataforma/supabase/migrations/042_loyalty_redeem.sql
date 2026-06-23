-- ============================================================
--  Migración 042 — Canje de puntos en el checkout
--  ------------------------------------------------------------
--  Registra en el pedido cuántos puntos de lealtad canjeó el cliente
--  y el descuento que generaron. El descuento por promo sigue en
--  `discount`; este es independiente (puede coexistir).
--  Ejecutar DESPUÉS de 001..041.
-- ============================================================

alter table orders
  add column if not exists loyalty_points_redeemed integer       not null default 0,
  add column if not exists loyalty_discount         numeric(12,2) not null default 0;
