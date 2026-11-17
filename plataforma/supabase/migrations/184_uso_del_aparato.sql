-- ============================================================
--  184 · Para qué es cada aparato (ficha 2.6 de la auditoría)
--  ------------------------------------------------------------
--  La tablet de cocina despertaba en «Hoy», como la del dueño, y
--  cada mañana alguien tenía que ir a Pedidos › Cocina › pantalla
--  completa. Ahora quien prepara el aparato le dice una vez para qué
--  es («⋯ › Este aparato») y quien entre ahí abre directo en esa
--  pantalla, a pantalla completa.
--
--  `restaurant_devices.uso` (migración 112) guarda esa elección:
--    'cocina' | 'caja' | 'mesero' | NULL (= panel completo, lo de hoy).
--
--  NO da permisos: el panel solo lleva a esa pantalla a quien ya la
--  tiene (lib/aparato.ts). La escribe el servidor con la service role,
--  como el resto de la tabla (RLS sin políticas).
--
--  Aplicar ANTES de desplegar el código (el panel lee la columna; si
--  falta, el aparato se comporta como «panel completo»). Independiente
--  de la 182 y la 183.
-- ============================================================

begin;

alter table public.restaurant_devices
  add column if not exists uso text;

alter table public.restaurant_devices
  drop constraint if exists restaurant_devices_uso_check;
alter table public.restaurant_devices
  add constraint restaurant_devices_uso_check check (uso is null or uso in ('cocina', 'caja', 'mesero'));

comment on column public.restaurant_devices.uso is
  'Para qué es este aparato (ficha 2.6): cocina, caja o mesero abren directo en '
  'esa pantalla a pantalla completa. NULL = panel completo. No amplía permisos.';

commit;
