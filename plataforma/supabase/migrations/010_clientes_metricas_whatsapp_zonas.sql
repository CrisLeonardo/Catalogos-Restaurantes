-- ============================================================
--  Migración 010 — Clientes, métricas de visitas, WhatsApp y
--  zonas de cobertura de delivery
--  · restaurants: número de WhatsApp para RECIBIR pedidos y
--    lista de zonas que cubre el delivery
--  · customers:   registro automático de clientes finales
--    (se crea/actualiza al hacer un pedido, clave = teléfono)
--  · orders:      enlace al cliente + zona de entrega elegida
--  · page_visits: tracking de visitas a la web del restaurante
--  · realtime:    asegura que `orders` publique cambios
--  Ejecutar DESPUÉS de 001..009 en el SQL Editor de Supabase.
-- ============================================================

-- ── Restaurants: WhatsApp de pedidos + zonas de cobertura ───
alter table restaurants
  add column if not exists orders_whatsapp text,
  add column if not exists delivery_zones  jsonb;

comment on column restaurants.orders_whatsapp is
  'Número de WhatsApp al que se envían los pedidos (puede ser distinto '
  'del whatsapp_number público). NULL = usar whatsapp_number.';
comment on column restaurants.delivery_zones is
  'Zonas que cubre el delivery: ["Zona 1", "Zona 4", ...]. '
  'NULL o [] = sin restricción (entrega a cualquier dirección).';

-- ── Customers: clientes finales por restaurante ─────────────
create table if not exists customers (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references restaurants(id) on delete cascade,
  name           text        not null,
  phone          text        not null,
  email          text,
  default_address text,
  default_zone   text,
  total_orders   int         not null default 0,
  total_spent    numeric(12,2) not null default 0,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique (restaurant_id, phone)
);

comment on table customers is
  'Clientes finales, creados/actualizados automáticamente al pedir. '
  'La clave natural es el teléfono dentro de cada restaurante.';

create index if not exists customers_restaurant_last_idx
  on customers(restaurant_id, last_order_at desc);

-- RLS: sin políticas a propósito — todo el acceso pasa por server
-- actions (service role) que validan el rol del usuario.
alter table customers enable row level security;

-- Upsert atómico: crea el cliente al primer pedido o actualiza
-- nombre/dirección/contadores en pedidos siguientes (sin carreras).
create or replace function upsert_customer(
  p_restaurant_id uuid,
  p_name          text,
  p_phone         text,
  p_address       text,
  p_zone          text,
  p_total         numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into customers (
    restaurant_id, name, phone, default_address, default_zone,
    total_orders, total_spent, first_order_at, last_order_at
  )
  values (
    p_restaurant_id, p_name, p_phone, nullif(p_address, ''), nullif(p_zone, ''),
    1, coalesce(p_total, 0), now(), now()
  )
  on conflict (restaurant_id, phone) do update set
    name            = excluded.name,
    default_address = coalesce(excluded.default_address, customers.default_address),
    default_zone    = coalesce(excluded.default_zone, customers.default_zone),
    total_orders    = customers.total_orders + 1,
    total_spent     = customers.total_spent + coalesce(p_total, 0),
    first_order_at  = coalesce(customers.first_order_at, now()),
    last_order_at   = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Orders: enlace al cliente + zona elegida ────────────────
alter table orders
  add column if not exists customer_id   uuid references customers(id) on delete set null,
  add column if not exists delivery_zone text;

create index if not exists orders_customer_idx on orders(customer_id);

comment on column orders.delivery_zone is
  'Zona de cobertura elegida en el checkout (si el restaurante configuró zonas).';

-- ── Page visits: métricas de tráfico por restaurante ────────
create table if not exists page_visits (
  id            bigint      generated always as identity primary key,
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  visitor_id    uuid        not null,
  path          text        not null default '/',
  created_at    timestamptz not null default now()
);

comment on table page_visits is
  'Una fila por visita de página al sitio del restaurante. visitor_id es un '
  'UUID anónimo por dispositivo (localStorage); sirve para visitantes únicos.';

create index if not exists page_visits_restaurant_created_idx
  on page_visits(restaurant_id, created_at desc);

-- RLS: sin políticas — los inserts vienen de un server action con
-- service role (el visitante nunca toca la tabla directo) y las
-- lecturas son de los paneles (server actions que validan rol).
alter table page_visits enable row level security;

-- ── Realtime: asegurar que orders publica INSERT/UPDATE ─────
-- (Las notificaciones del panel admin dependen de esto.)
do $$
begin
  alter publication supabase_realtime add table orders;
exception
  when duplicate_object then null;  -- ya estaba en la publicación
  when undefined_object then null;  -- publicación gestionada de otra forma
end $$;
