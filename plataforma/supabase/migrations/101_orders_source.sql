-- ============================================================
--  Migración 101 — Canal de origen del pedido
--  ------------------------------------------------------------
--  Hoy no hay forma de saber POR DÓNDE entró un pedido. `order_type`
--  responde otra pregunta (DELIVERY/PICKUP/DINE_IN = cómo se entrega),
--  y `synced_from_hub` solo distingue los que llegaron del hub offline.
--  Un pedido tomado por el mesero, uno escaneando el QR y uno que
--  entrara por WhatsApp son hoy indistinguibles en la base.
--
--  Se agrega `source` como vocabulario único del canal, prerrequisito de
--  dos cosas del plan de competencia (PLAN_COMPETENCIA_OLACLICK_FASES.md):
--    · Fase 1 — medir qué porcentaje de pedidos entra por WhatsApp, que
--      es la métrica con la que esa fase se declara terminada.
--    · Fase 5 — mostrar en el KDS de qué plataforma externa viene el
--      pedido (PedidosYa/Rappi/UberEats) sin mirar una segunda pantalla.
--
--  Default 'LEOGIN': los pedidos existentes y todo lo que hoy pasa por
--  place_order quedan clasificados como propios sin tocar la RPC. Los
--  canales nuevos harán un UPDATE después de place_order, igual que la
--  ruta del hub ya hace con `synced_from_hub` (api/agent/offline-orders).
--
--  SIN índice a propósito: `source` tiene 6 valores posibles, así que su
--  selectividad es mala y no justifica el costo en cada escritura. Las
--  consultas de analítica filtran por restaurante y fecha, que ya cubre
--  orders_restaurant_created_idx (migración 005).
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..100.
-- ============================================================

alter table orders
  add column if not exists source text not null default 'LEOGIN';

-- El CHECK se agrega aparte y sin validar el histórico: `add column` ya
-- dejó todas las filas viejas en 'LEOGIN', y así la migración no falla si
-- alguna fila quedara fuera del vocabulario.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_source_check'
  ) then
    alter table orders
      add constraint orders_source_check
      check (source in ('LEOGIN', 'WHATSAPP', 'PEDIDOSYA', 'RAPPI', 'UBEREATS', 'OTRO'));
  end if;
end $$;

comment on column orders.source is
  'Canal por el que ENTRÓ el pedido: LEOGIN (menú QR, mesero, kiosko o hub '
  'offline — todo lo propio), WHATSAPP (bot/agente de la Fase 1), '
  'PEDIDOSYA/RAPPI/UBEREATS (plataformas externas de la Fase 5) u OTRO '
  '(integrador vía API pública). NO confundir con order_type, que es cómo '
  'se entrega (DELIVERY/PICKUP/DINE_IN): un pedido puede ser '
  'source=WHATSAPP y order_type=PICKUP a la vez.';
