-- ============================================================
--  Migración 051 — Sistema de API keys (con hashing)
--  ------------------------------------------------------------
--  Infraestructura para integraciones externas y, a futuro, el cobro
--  de la suscripción de Leogin (webhooks de pasarela, conciliación
--  bancaria, etc.). Las llaves NUNCA se guardan en claro: solo el
--  hash SHA-256. El valor en claro se muestra UNA sola vez al crearla.
--
--  Modelo de seguridad:
--   · Tabla con RLS ON y SIN políticas → acceso solo por service role
--     (la app del super admin las gestiona vía service client).
--   · `key_prefix` (primeros chars) sirve para identificar la llave en
--     listados/logs sin exponer el secreto.
--   · La verificación compara el hash del token entrante (ver lib/api-keys.ts).
--
--  IMPORTANTE: las llaves SECRETAS de terceros (Stripe/Recurrente) NO van
--  aquí; esas viven en variables de entorno. Esta tabla es para llaves que
--  LEOGIN EMITE a integradores que llaman SU API.
-- ============================================================

create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                         -- etiqueta legible ("Webhook Recurrente")
  key_prefix   text not null,                         -- p.ej. "lk_live_ab12" (para identificar sin exponer)
  key_hash     text not null unique,                  -- SHA-256 hex del token completo
  scopes       text[] not null default '{}',          -- permisos (p.ej. {'billing:read','webhooks:write'})
  restaurant_id uuid references restaurants(id) on delete cascade, -- null = llave a nivel plataforma
  created_by   uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists api_keys_prefix_idx on api_keys (key_prefix);
create index if not exists api_keys_restaurant_idx on api_keys (restaurant_id);

alter table api_keys enable row level security;
-- Sin políticas: solo el service role (super admin server-side) puede leer/escribir.

comment on table api_keys is
  'Llaves de API que Leogin emite a integradores. Solo se guarda el hash SHA-256; el secreto se ve una vez al crearla. RLS ON sin políticas → solo service role.';

-- Marca de uso (la llama la verificación de la app con service role).
create or replace function api_key_touch(p_hash text)
returns void language sql security definer set search_path = public as $$
  update api_keys set last_used_at = now() where key_hash = p_hash;
$$;
