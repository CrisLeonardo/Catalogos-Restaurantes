-- ============================================================
-- 062 — Hub de emergencia (Fase 2 del plan offline)
-- ------------------------------------------------------------
-- El Agente Leogin reporta en su heartbeat la URL LAN de su hub
-- de emergencia (http://IP:9123). El panel la muestra al dueño
-- para que el personal sepa a dónde entrar cuando no hay internet.
-- ============================================================

alter table print_agents add column if not exists hub_url text;
