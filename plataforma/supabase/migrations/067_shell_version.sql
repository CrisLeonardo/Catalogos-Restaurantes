-- ============================================================
-- 067: Telemetría mínima del shell (Leogin Desktop)
--
-- Hasta ahora solo el AGENTE (servicio de impresión) reportaba su versión
-- en print_agents.agent_version. Leogin Desktop (la app instalable, ver
-- leogin-desktop/) es una pieza distinta — el shell de ventana + bandeja —
-- y reporta la suya por separado desde el propio panel (fetch autenticado
-- por sesión, sin pasar por el agente ni por IPC — ver
-- SHELL_TELEMETRY_JS_TEMPLATE en leogin-desktop/src-tauri/src/main.rs y
-- /api/agent/shell-heartbeat).
-- ============================================================

alter table print_agents
  add column if not exists shell_version text,
  add column if not exists shell_last_seen_at timestamptz;
