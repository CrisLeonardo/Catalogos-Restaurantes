-- ============================================================
--  Migración 009 — Operaciones reales + variantes + seguimiento
--  · restaurants: zona horaria, horarios semanales, pausa de pedidos
--  · products:    variantes/extras (grupos de opciones en JSONB)
--  · orders:      token público de seguimiento del comensal
--  · order_items: snapshot de las opciones elegidas
--  · generate_order_number: fix de carrera con advisory lock
--  · theme_templates: plantillas de tema del Super Admin
--  Ejecutar DESPUÉS de 001..008 en el SQL Editor de Supabase.
-- ============================================================

-- ── Restaurants: operación ──────────────────────────────────
alter table restaurants
  add column if not exists timezone       text    not null default 'America/Guatemala',
  add column if not exists hours          jsonb,
  add column if not exists orders_paused  boolean not null default false,
  add column if not exists pause_message  text;

comment on column restaurants.timezone is
  'Zona horaria IANA del restaurante (KPIs "hoy", horarios de apertura).';
comment on column restaurants.hours is
  'Horario semanal: { "0".."6" (0=domingo): [["HH:MM","HH:MM"], ...] }. '
  'Día ausente o lista vacía = cerrado ese día. NULL = sin horario (siempre abierto). '
  'Un intervalo con cierre <= apertura cruza la medianoche.';
comment on column restaurants.orders_paused is
  'Pausa manual de pedidos ("cocina saturada"): bloquea el checkout sin tocar horarios.';
comment on column restaurants.pause_message is
  'Mensaje opcional que ve el comensal cuando los pedidos están pausados.';

-- ── Products: variantes / extras ────────────────────────────
alter table products
  add column if not exists options jsonb;

comment on column products.options is
  'Grupos de opciones: [{ id, name, type: "single"|"multi", required?, max?, '
  'choices: [{ id, name, priceDelta }] }]. NULL o [] = producto simple.';

-- ── Orders: seguimiento público ─────────────────────────────
alter table orders
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists orders_public_token_idx
  on orders(public_token);

comment on column orders.public_token is
  'Token opaco para la página pública de seguimiento (/pedido/[token]). '
  'Solo lo conoce quien hizo el pedido; la lectura va por server action con service role.';

-- ── Order items: snapshot de opciones ───────────────────────
alter table order_items
  add column if not exists options_snapshot jsonb;

comment on column order_items.options_snapshot is
  'Opciones elegidas, congeladas al ordenar: [{ group, choice, priceDelta }].';

-- ── Numeración correlativa SIN carrera ──────────────────────
-- La versión anterior usaba count(*)+1: dos pedidos simultáneos podían
-- recibir el mismo número. El advisory lock transaccional por restaurante
-- serializa la numeración sin bloquear a otros restaurantes.
create or replace function generate_order_number(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_year  text;
begin
  perform pg_advisory_xact_lock(hashtext('order_number:' || p_restaurant_id::text));
  v_year := to_char(now() at time zone 'UTC', 'YYYY');
  select coalesce(count(*), 0) + 1 into v_count
  from orders
  where restaurant_id = p_restaurant_id
    and date_part('year', created_at at time zone 'UTC') = date_part('year', now() at time zone 'UTC');
  return 'ORD-' || v_year || '-' || lpad(v_count::text, 5, '0');
end;
$$;

-- ── Plantillas de tema (Super Admin) ────────────────────────
create table if not exists theme_templates (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  config     jsonb       not null default '{}'::jsonb,
  content    jsonb       not null default '{}'::jsonb,
  custom_css text,
  created_at timestamptz not null default now()
);

comment on table theme_templates is
  'Temas guardados como plantilla reutilizable. Solo el Super Admin las usa '
  '(server actions con service role); RLS sin políticas = nadie más las lee.';

alter table theme_templates enable row level security;
-- Sin políticas a propósito: anon/authenticated no pueden leer ni escribir;
-- el service role (server actions del Super Admin) salta RLS.
