-- ============================================================
--  Migración 057 — Paquetes de Estándar + cap de descuento Premium
--  ------------------------------------------------------------
--  Decisiones del dueño (2026-06-29):
--
--  1) PLAN ESTÁNDAR (Q399, flat) ahora se ofrece como UN paquete a
--     elegir en el registro (el super admin lo cambia después con el
--     editor de tipos de pedido):
--        · Paquete A — Solo Delivery → orderTypes = ['delivery']
--        · Paquete B — Local         → orderTypes = ['pickup','dine_in']
--                                       (para llevar + comer en local con QR)
--     Ambos paquetes cuestan lo mismo (Q399). Estándar NO participa en el
--     descuento por canal (leogin_plan_has_channel_discount lo excluye),
--     así que el precio es fijo sin importar el paquete elegido.
--     => No requiere cambios de esquema: el paquete vive en
--        restaurant_themes.config->'orderTypes', igual que hoy.
--
--  2) "Plan a tu medida" (PREMIUM+): el descuento por canal desactivado
--     se limita a UN solo canal. Antes: hasta 2 canales (−Q200). Ahora:
--     máximo 1 canal descontable (−Q100). El piso de ≥1 canal pagado se
--     mantiene por la propia fórmula (least(3-activos, max)).
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..056.
-- ============================================================

-- ── 1. Cap del descuento por canal a 1 (máx −Q100) ──────────
update platform_settings set value = '1' where key = 'channel_discount_max';
insert into platform_settings (key, value)
  values ('channel_discount_max', '1')
  on conflict (key) do update set value = excluded.value;

-- ── 2. Re-aplicar el precio automático donde corresponda ────
-- Recalcula la mensualidad de los restaurantes en modo automático para
-- que el KPI y la ficha del dueño reflejen el nuevo tope de descuento.
select leogin_apply_auto_price_all();
