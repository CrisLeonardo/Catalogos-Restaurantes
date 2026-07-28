-- ============================================================
--  Migración 093 — Eliminar módulo Promociones (Fase D), consolidar en Cupones
--  · promociones y cupones eran dos módulos redundantes; solo cupones
--    estaba conectado al checkout. Se elimina promotions y se migran
--    las columnas de snapshot de orders a la tabla coupons.
--  Ejecutar DESPUÉS de 001..092.
-- ============================================================

alter table orders drop column if exists promo_id;
alter table orders drop column if exists promo_code;

drop function if exists increment_promo_usage(uuid);
drop table if exists promotions;

-- ── Orders: cupón aplicado (snapshot para recibos/reportes) ─
alter table orders
  add column if not exists coupon_id   uuid references coupons(id) on delete set null,
  add column if not exists coupon_code text;

comment on column orders.coupon_id is 'Cupón aplicado al pedido (snapshot). discount ya trae el descuento en Q.';

-- Incremento atómico del contador de usos de un cupón (lo llama createOrder).
create or replace function increment_coupon_usage(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update coupons set uses = uses + 1 where id = p_id;
$$;

-- Mismo patrón que 084/092: nueva función security definer, execute solo
-- para service_role (se invoca vía createServiceClient() desde createOrder).
revoke execute on function public.increment_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(uuid) to service_role;
