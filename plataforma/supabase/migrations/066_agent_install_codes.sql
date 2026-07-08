-- ============================================================
-- 066: Códigos cortos de instalación del agente
--
-- Reemplaza el esquema anterior (LG1: URL+token embebidos en base64 en el
-- nombre del archivo, muy largo) por uno más corto (LG2): el nombre del
-- archivo solo lleva el dominio del panel + un código corto de un solo uso;
-- el instalador resuelve el token real llamando a /api/agent/resolve-install
-- en el momento de instalar. El código expira y se invalida tras el primer
-- uso — la exposición del secreto es menor que antes (que viajaba en claro
-- e indefinidamente en el nombre del archivo).
-- ============================================================

create table if not exists agent_install_codes (
  code text primary key,
  api_url text not null,
  token text not null,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

-- Solo el service role toca esta tabla (RLS activo sin policies).
alter table agent_install_codes enable row level security;
