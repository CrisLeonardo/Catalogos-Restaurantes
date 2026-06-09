-- ============================================================
--  Migración 008 — Cargo de envío + Ícono por producto
-- ============================================================

-- Cargo de envío almacenado en cada pedido (0 para pickup o sin cargo)
alter table orders
  add column if not exists delivery_fee numeric(10,2) not null default 0;

-- Ícono personalizado por producto (override del ícono derivado de categoría)
-- Valores válidos: cualquier clave del registro ICON_PATHS del frontend.
alter table products
  add column if not exists icon text;
