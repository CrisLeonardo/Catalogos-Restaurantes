-- ============================================================
--  Migración 043 — Módulo de Reservaciones
--  Tabla para gestionar reservas de mesa desde el panel admin.
-- ============================================================

create table if not exists reservations (
  id              uuid        primary key default gen_random_uuid(),
  restaurant_id   uuid        not null references restaurants(id) on delete cascade,
  customer_name   text        not null,
  customer_phone  text,
  party_size      int         not null default 2 check (party_size >= 1 and party_size <= 100),
  date            date        not null,
  time            time        not null,
  notes           text,
  status          text        not null default 'PENDING'
                  check (status in ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reservations_restaurant_date
  on reservations(restaurant_id, date);

alter table reservations enable row level security;

create policy "staff can manage reservations"
  on reservations for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or (p.restaurant_id = reservations.restaurant_id
              and p.role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')))
    )
  );
