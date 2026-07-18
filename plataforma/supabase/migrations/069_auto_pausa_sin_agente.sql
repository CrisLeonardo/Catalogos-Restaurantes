-- ============================================================
-- 069 — Auto-pausa de pedidos en línea sin agente (OPCIONAL)
-- ------------------------------------------------------------
-- Cierra el punto ciego del modo emergencia: si el local pierde
-- internet, la nube sigue viva y los comensales con datos móviles
-- pueden pedir a domicilio sin que el restaurante se entere.
--
-- Con este toggle ACTIVADO (por restaurante, default apagado):
-- cuando su Agente Leogin lleva >5 min sin reportarse (heartbeat
-- de /api/agent/poll), createOrder rechaza los pedidos PÚBLICOS
-- con un mensaje amable. Al reconectar el agente, se reanudan
-- solos. Los pedidos del mesero y del hub no se ven afectados.
--
-- Vive en print_agents (no en restaurants) a propósito: el toggle
-- solo tiene sentido con un agente vinculado, y así el chequeo en
-- createOrder es UNA query que degrada sola si la migración no
-- está aplicada (select falla → sin pausa).
-- ============================================================

alter table print_agents
  add column if not exists auto_pause_enabled boolean not null default false;
