-- ============================================================
-- 014 · Push Subscriptions (Web Push / VAPID)
-- Almacena las suscripciones push de los admins por restaurante.
-- Un mismo restaurant_id puede tener varias suscripciones (p.ej.
-- el dueño tiene el móvil y el laptop registrados).
-- ============================================================

create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now(),

  -- Un dispositivo puede tener solo una suscripción por restaurante.
  unique (restaurant_id, endpoint)
);

-- Solo el service role puede leer/escribir (las claves son sensibles).
alter table push_subscriptions enable row level security;

create policy "service_role_only" on push_subscriptions
  using (true)
  with check (true);
