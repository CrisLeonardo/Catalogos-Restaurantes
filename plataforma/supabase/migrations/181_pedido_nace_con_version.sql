-- ============================================================
--  181 · El pedido nace con versión (orders.updated_at)
--  ------------------------------------------------------------
--  Fallo: «Enviar a cocina» (y toda operación con intento de Pedidos
--  en vivo, migración 176) respondía «Operación de pedido inválida.»
--  para cualquier pedido recién creado.
--
--  Causa: la 006 creó `orders.updated_at` sin valor por defecto y su
--  disparador `orders_set_updated_at` es solo BEFORE UPDATE. Ni
--  `place_order` ni los demás INSERT lo llenan, así que el pedido nacía
--  con `updated_at` NULL hasta su primera actualización. El panel usa
--  `updated_at` como versión del intento; el servidor rechaza una
--  versión nula y `leogin_operar_pedido` exige `p_version` no nula.
--
--  Corrección:
--    1. `updated_at` toma `now()` al insertar (igual que `created_at`).
--    2. Los pedidos que ya nacieron sin versión la reciben de su
--       `created_at`. El relleno apaga dos disparadores mientras dura:
--       `orders_set_updated_at` (pondría la hora de la migración en vez
--       de la de creación) y `registro_caja_pedido` (subiría la revisión
--       de caja de cada restaurante sin que haya cambiado dinero).
--    3. La columna pasa a NOT NULL: la versión ya no puede faltar.
--
--  `leogin_operar_pedido` no cambia: compara `updated_at` con la versión
--  recibida y ahora siempre hay una. Se aplica antes o después de
--  desplegar el código indistintamente; el código no cambia de contrato.
-- ============================================================

begin;

alter table public.orders alter column updated_at set default now();

alter table public.orders disable trigger orders_set_updated_at;
alter table public.orders disable trigger registro_caja_pedido;

update public.orders set updated_at = created_at where updated_at is null;

alter table public.orders enable trigger orders_set_updated_at;
alter table public.orders enable trigger registro_caja_pedido;

alter table public.orders alter column updated_at set not null;

comment on column public.orders.updated_at is
  'Versión del pedido: nace con now() y la renueva orders_set_updated_at en cada UPDATE. Pedidos en vivo (176) la usa para detectar cambios ajenos.';

commit;
