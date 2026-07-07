-- ============================================================
-- 065: Auto-update del agente de impresión
--      (ver docs/ESTRATEGIA_INSTALABLE.md §3.2)
--
-- Releases publicados del agente. El agente pregunta por
-- /api/agent/latest (autenticado) y recibe el release vigente de SU
-- canal; si la versión es mayor que la suya, descarga, verifica el
-- sha256 y se intercambia solo.
--
-- Operación:
--  · Publicar: `npm run release` en agente-impresion/ (sube el exe a
--    Supabase Storage e inserta la fila aquí).
--  · Rollout por etapas: publicar primero en channel='beta' y mover
--    restaurantes de prueba a ese canal (print_agents.update_channel).
--  · Kill switch / rollback: enabled=false en el release malo — los
--    agentes vuelven a ver el anterior como "vigente" (los ya
--    actualizados se quedan, pero deja de propagarse).
-- ============================================================

create table if not exists agent_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null default 'stable',
  url text not null,
  sha256 text not null,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- Solo service role (RLS activo sin policies).
alter table agent_releases enable row level security;

create index if not exists agent_releases_channel_idx
  on agent_releases (channel, created_at desc);

-- Canal de actualización por restaurante ('stable' | 'beta').
alter table print_agents add column if not exists update_channel text not null default 'stable';
