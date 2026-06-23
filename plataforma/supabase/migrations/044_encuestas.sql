-- ============================================================
--  Migración 044 — Módulo de Encuestas de satisfacción
--  Calificaciones post-pedido (1-5 estrellas + comentario).
-- ============================================================

create table if not exists order_ratings (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  order_id      uuid        references orders(id) on delete set null,
  rating        int         not null check (rating between 1 and 5),
  comment       text,
  customer_name text,
  created_at    timestamptz not null default now()
);

create index if not exists order_ratings_restaurant_date
  on order_ratings(restaurant_id, created_at desc);

alter table order_ratings enable row level security;

-- Staff del restaurante puede ver sus reseñas
create policy "staff can view ratings"
  on order_ratings for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or p.restaurant_id = order_ratings.restaurant_id)
    )
  );

-- Cualquiera puede enviar una calificación (clientes sin auth)
create policy "public can submit rating"
  on order_ratings for insert
  with check (true);
