-- ============================================================
--  Migración 048 — Llamadas al mesero
--  El cliente presiona "Llamar al mesero" en el menú QR y se
--  registra una solicitud en esta tabla. El panel admin la
--  muestra en tiempo real y la mesera puede resolverla.
-- ============================================================

create table if not exists waiter_calls (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  table_number  int,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists waiter_calls_restaurant_pending
  on waiter_calls(restaurant_id, created_at desc)
  where resolved_at is null;

alter table waiter_calls enable row level security;

-- Staff puede ver y actualizar llamadas de su restaurante
create policy "staff can manage waiter_calls"
  on waiter_calls for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or p.restaurant_id = waiter_calls.restaurant_id)
    )
  );

-- Clientes (anon) pueden insertar llamadas
create policy "public can insert waiter_call"
  on waiter_calls for insert
  with check (true);

-- Realtime: el panel admin y el mesero reciben las llamadas en vivo.
-- (Sin esto el canal `waiter_calls` de notifications.tsx nunca dispara.)
do $$
begin
  alter publication supabase_realtime add table waiter_calls;
exception
  when duplicate_object then null;
end $$;
