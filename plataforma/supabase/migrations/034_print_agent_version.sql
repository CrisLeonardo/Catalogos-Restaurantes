-- ============================================================
-- 034 · Versión reportada por el agente de impresión
-- El agente envía su versión en cada poll; se guarda para que el panel
-- muestre qué versión corre y avisar de actualizaciones.
-- ============================================================

alter table print_agents add column if not exists agent_version text;
