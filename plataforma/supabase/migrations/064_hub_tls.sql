-- ============================================================
-- 064: HTTPS del hub local (patrón Plex) — ver docs/ARQUITECTURA_OFFLINE.md §8.1
--
-- La plataforma emite UN certificado wildcard (*.hub.<dominio>) vía Let's
-- Encrypt DNS-01 (Cloudflare) y se lo entrega a los agentes por su canal
-- autenticado. Cada agente recibe un hostname propio
-- (<id-sin-guiones>.hub.<dominio>) cuyo registro A apunta a su IP LAN.
-- Así el navegador del comensal/mesero puede hablarle al hub por HTTPS
-- sin chocar con mixed content.
-- ============================================================

-- Certificados wildcard emitidos (el vigente = expires_at más lejano).
create table if not exists hub_certificates (
  id uuid primary key default gen_random_uuid(),
  cert_pem text not null,
  key_pem text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Solo el service role toca esta tabla (RLS activo sin policies).
alter table hub_certificates enable row level security;

-- Llave de cuenta ACME (Let's Encrypt) — una por directorio (prod/staging).
create table if not exists acme_accounts (
  directory_url text primary key,
  account_key_pem text not null,
  created_at timestamptz not null default now()
);

alter table acme_accounts enable row level security;

-- Datos TLS/DNS por agente.
alter table print_agents add column if not exists hub_hostname text;
alter table print_agents add column if not exists hub_lan_ip text;
alter table print_agents add column if not exists hub_dns_synced_ip text;
