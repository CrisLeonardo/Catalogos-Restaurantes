-- ============================================================
-- 033 · Agente de impresión propio (reemplazo de QZ Tray)
--
--   print_agents : un agente local por restaurante (token + impresoras vistas)
--   print_jobs   : cola de trabajos de impresión (pending→printing→done/failed)
--
-- El agente local NUNCA toca la base directo: pasa por /api/agent/* con su
-- token. El backend (service_role) es el único que lee/escribe estas tablas.
-- ============================================================

create table if not exists print_agents (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null unique references restaurants(id) on delete cascade,
  name              text not null default 'Agente principal',
  -- sha256 del token del agente (el token en claro solo se muestra al crearlo)
  token_hash        text not null,
  -- última lista de impresoras que el agente reportó (para la UI de config)
  reported_printers jsonb not null default '[]'::jsonb,
  -- destino asignado para cada rol (ej. "windows:EPSON TM-T20" o "tcp://IP:9100")
  kitchen_target    text,
  receipt_target    text,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists print_agents_token_idx on print_agents(token_hash);

create table if not exists print_jobs (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  role           text not null check (role in ('kitchen', 'receipt')),
  -- destino ya resuelto al encolar (el agente solo obedece)
  target         text not null,
  -- bytes ESC/POS en base64 (los tickets son < 1 KB)
  payload_b64    text not null,
  status         text not null default 'pending'
                              check (status in ('pending', 'printing', 'done', 'failed')),
  attempts       int  not null default 0,
  error          text,
  order_id       uuid references orders(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists print_jobs_queue_idx on print_jobs(restaurant_id, status, created_at);

-- RLS habilitado y SIN políticas para anon/authenticated → denegados por
-- defecto. Solo el service_role (que bypasa RLS) accede desde el backend.
alter table print_agents enable row level security;
alter table print_jobs   enable row level security;

-- ── Reclamo atómico de trabajos ─────────────────────────────
-- Marca como 'printing' y devuelve los pendientes (o los 'printing' colgados
-- >90s, p.ej. si el agente se reinició). FOR UPDATE SKIP LOCKED evita que dos
-- llamadas concurrentes tomen el mismo trabajo.
create or replace function claim_print_jobs(p_restaurant_id uuid, p_limit int default 10)
returns setof print_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update print_jobs j
  set status = 'printing', attempts = j.attempts + 1, updated_at = now()
  where j.id in (
    select id from print_jobs
    where restaurant_id = p_restaurant_id
      and attempts < 10
      and (status = 'pending'
           or (status = 'printing' and updated_at < now() - interval '90 seconds'))
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
end;
$$;
