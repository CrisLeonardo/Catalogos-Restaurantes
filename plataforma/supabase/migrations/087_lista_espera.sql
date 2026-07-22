-- ============================================================
--  Migración 087 — Lista de espera para walk-ins (sin reserva)
--  (Fase 3 auditoría de lanzamiento: experiencia multi-mercado)
--  ------------------------------------------------------------
--  A diferencia de `reservations` (migración 043, reserva anticipada con
--  fecha/hora), esto es una cola en vivo: el host/mesero anota al grupo que
--  llegó SIN reservar, y lo marca conforme avanza. No hay concepto de mesa
--  numerada aquí (ver lib/db/orders.ts: las mesas son virtuales, inferidas
--  de orders.address) — la lista de espera es independiente de eso.
--  Solo el staff la escribe (a diferencia de waiter_calls, migración 048,
--  que el cliente anónimo también puede insertar): el walk-in llega al
--  mostrador, no anota su propio nombre desde el celular.
--  Ejecutar DESPUÉS de 001..086.
-- ============================================================

create table if not exists waitlist_entries (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  customer_name text        not null,
  party_size    int         not null default 2 check (party_size >= 1 and party_size <= 100),
  phone         text,
  notes         text,
  status        text        not null default 'WAITING'
                check (status in ('WAITING', 'NOTIFIED', 'SEATED', 'CANCELLED')),
  created_at    timestamptz not null default now(),
  notified_at   timestamptz,
  seated_at     timestamptz,
  cancelled_at  timestamptz
);

create index if not exists waitlist_entries_restaurant_waiting
  on waitlist_entries(restaurant_id, created_at)
  where status in ('WAITING', 'NOTIFIED');

alter table waitlist_entries enable row level security;

create policy "staff can manage waitlist_entries"
  on waitlist_entries for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or (p.restaurant_id = waitlist_entries.restaurant_id
              and p.role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')))
    )
  );

-- Realtime: si el host y un mesero tienen la pantalla abierta a la vez,
-- ambos ven altas/cambios de estado sin recargar (mismo patrón que
-- waiter_calls, migración 048).
do $$
begin
  alter publication supabase_realtime add table waitlist_entries;
exception
  when duplicate_object then null;
end $$;
