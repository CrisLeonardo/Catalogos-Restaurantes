-- ============================================================
-- 062 · Hub local del agente de impresión (Fase 2 de arquitectura offline)
-- ------------------------------------------------------------
-- El agente-impresion/ pasa de ser solo un poller de impresión a un
-- "hub local": guarda un snapshot del menú y acepta pedidos por LAN
-- cuando la nube no responde, imprimiéndolos al instante y
-- sincronizándolos después (vía /api/agent/offline-orders, idempotente
-- por client_id — ver migración 061).
--
-- - print_agents.hub_url: URL LAN que el agente reporta en su heartbeat
--   (ej. "http://192.168.1.50:47100"), para que el navegador del
--   comensal sepa a quién hablarle si la nube no responde.
-- - orders.synced_from_hub: marca los pedidos que se tomaron sin
--   conexión y se sincronizaron después, para reconciliación visible
--   en el panel admin.
--
-- Idempotente en ambos sentidos: seguro de correr aunque ya exista
-- algo parecido (un experimento previo descartado tocó print_agents
-- con una columna similar, ver migración 061).
-- ============================================================

alter table print_agents add column if not exists hub_url text;

alter table orders add column if not exists synced_from_hub boolean not null default false;
