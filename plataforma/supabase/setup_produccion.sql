-- ====================================================================
--  Leogin - SETUP DE PRODUCCION (esquema completo)
--  Pega TODO este archivo en: Supabase Dashboard -> SQL Editor -> Run
--  Combina las migraciones 001, 003, 004, 005 y 006 (sin datos demo).
--  Ejecutalo UNA vez en una base de datos NUEVA.
--  (Si lo corres de nuevo veras errores "policy already exists": son
--   inofensivos, significan que ya estaba aplicado.)
-- ====================================================================

-- ============ 001_initial_schema.sql ============

-- ============================================================
-- Fase 1 — Esquema inicial
-- Ejecutar en el SQL Editor de Supabase (o con: supabase db push)
-- ============================================================

-- Restaurantes
create table if not exists restaurants (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  tagline         text,
  plan_actual     text not null default 'CATALOGO'
                    check (plan_actual in ('CATALOGO', 'PREMIUM')),
  modules         jsonb not null
                    default '{"catalog":true,"orders":false,"whatsapp_notify":false}',
  status          text not null default 'active'
                    check (status in ('active', 'suspended')),
  whatsapp_number text,
  contact_email   text,
  created_at      timestamptz not null default now()
);

-- Temas por restaurante (1:1)
create table if not exists restaurant_themes (
  restaurant_id    uuid primary key
                     references restaurants(id) on delete cascade,
  brand_name       text,
  logo_url         text,
  color_primary    text not null default '#D97757',
  color_bg         text not null default '#0b0b0c',
  color_text       text not null default '#F5F3EF',
  font_display     text not null default 'Unbounded',
  portada_style    text not null default 'spotlight'
                     check (portada_style in ('spotlight', 'poster', 'stack')),
  catalog_view     text not null default 'grid'
                     check (catalog_view in ('grid', 'list')),
  glass_intensity  text not null default 'translucido'
                     check (glass_intensity in ('translucido', 'esmerilado', 'solido')),
  background_image text,
  -- Motor de personalización (migración 007): overrides parciales + CSS propio
  config           jsonb not null default '{}'::jsonb,
  content          jsonb not null default '{}'::jsonb,
  custom_css       text
);

-- Categorías del menú
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  icon          text,
  sort_order    int  not null default 0,
  is_active     bool not null default true
);
create index if not exists categories_restaurant_idx
  on categories(restaurant_id, sort_order);

-- Productos
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  description   text,
  price         numeric(10,2) not null,
  image_url     text,
  icon          text,
  tags          text[],
  is_available  bool not null default true,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists products_restaurant_category_idx
  on products(restaurant_id, category_id, sort_order);
create index if not exists products_restaurant_created_idx
  on products(restaurant_id, created_at desc);

-- Perfiles de usuario (extiende auth.users)
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete set null,
  role          text not null
                  check (role in ('SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF')),
  full_name     text
);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================

alter table restaurants       enable row level security;
alter table restaurant_themes enable row level security;
alter table categories        enable row level security;
alter table products          enable row level security;
alter table profiles          enable row level security;

-- Restaurantes: lectura pública (solo activos)
create policy "restaurants_select_active"
  on restaurants for select
  using (status = 'active');

-- Temas: lectura pública
create policy "themes_select"
  on restaurant_themes for select
  using (true);

-- Categorías: lectura pública (solo activas)
create policy "categories_select_active"
  on categories for select
  using (is_active = true);

-- Productos: lectura pública (solo disponibles)
create policy "products_select_available"
  on products for select
  using (is_available = true);

-- Perfiles: cada usuario ve solo el suyo
create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);


-- ============ 003_auth_admin_rls.sql ============

-- ============================================================
-- Fase 2 — Auth + Panel Admin: RLS para escritura + Storage
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 001 y 002
-- ============================================================

-- ── Helpers de contexto del usuario autenticado ────────────
-- "security definer" = corren con privilegios del owner,
-- no del caller, para que no haya recursión de RLS al leer profiles.

create or replace function public.get_my_restaurant_id()
returns uuid language sql security definer stable
as $$ select restaurant_id from public.profiles where id = auth.uid() $$;

create or replace function public.get_my_role()
returns text language sql security definer stable
as $$ select role from public.profiles where id = auth.uid() $$;

-- ── PROFILES ───────────────────────────────────────────────
-- El usuario puede crear y actualizar su propio perfil
create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id);

-- ── RESTAURANTS ────────────────────────────────────────────
-- El propietario puede leer SU restaurante (además de la pública ya existente)
-- y actualizarlo.
create policy "restaurants_select_owner"
  on restaurants for select
  using (
    id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  );

create policy "restaurants_update_owner"
  on restaurants for update
  using (
    id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  )
  with check (
    id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  );

-- ── RESTAURANT_THEMES ──────────────────────────────────────
create policy "themes_select_owner"
  on restaurant_themes for select
  using (
    restaurant_id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  );

create policy "themes_update_owner"
  on restaurant_themes for update
  using (
    restaurant_id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  );

-- ── CATEGORIES ─────────────────────────────────────────────
-- Propietario / staff ven TODAS las categorías (incluso inactivas)
create policy "categories_select_owner"
  on categories for select
  using (
    restaurant_id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  );

create policy "categories_insert_owner"
  on categories for insert
  with check (
    get_my_role() = 'SUPER_ADMIN'
    or (
      restaurant_id = get_my_restaurant_id()
      and get_my_role() in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
  );

create policy "categories_update_owner"
  on categories for update
  using (
    get_my_role() = 'SUPER_ADMIN'
    or (
      restaurant_id = get_my_restaurant_id()
      and get_my_role() in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
  );

create policy "categories_delete_owner"
  on categories for delete
  using (
    get_my_role() = 'SUPER_ADMIN'
    or (
      restaurant_id = get_my_restaurant_id()
      and get_my_role() in ('RESTAURANT_OWNER', 'SUPER_ADMIN')
    )
  );

-- ── PRODUCTS ───────────────────────────────────────────────
create policy "products_select_owner"
  on products for select
  using (
    restaurant_id = get_my_restaurant_id()
    or get_my_role() = 'SUPER_ADMIN'
  );

create policy "products_insert_owner"
  on products for insert
  with check (
    get_my_role() = 'SUPER_ADMIN'
    or (
      restaurant_id = get_my_restaurant_id()
      and get_my_role() in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
  );

create policy "products_update_owner"
  on products for update
  using (
    get_my_role() = 'SUPER_ADMIN'
    or (
      restaurant_id = get_my_restaurant_id()
      and get_my_role() in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
  );

create policy "products_delete_owner"
  on products for delete
  using (
    get_my_role() = 'SUPER_ADMIN'
    or (
      restaurant_id = get_my_restaurant_id()
      and get_my_role() in ('RESTAURANT_OWNER', 'SUPER_ADMIN')
    )
  );

-- ── STORAGE: bucket restaurant-assets ─────────────────────
-- Imágenes de productos + logos. Público para lectura, restringido para escritura.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-assets',
  'restaurant-assets',
  true,
  10485760,   -- 10 MB (con margen: las fotos comprimidas quedan en cientos de KB;
              -- el margen es para GIF animados, que se suben sin comprimir)
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) on conflict (id) do nothing;

-- Lectura pública
create policy "assets_select_public"
  on storage.objects for select
  using (bucket_id = 'restaurant-assets');

-- Escritura: el primer segmento del path debe ser el restaurant_id del usuario
-- Ejemplo de path: {restaurant_id}/products/{filename}
create policy "assets_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restaurant-assets'
    and (
      get_my_role() = 'SUPER_ADMIN'
      or (string_to_array(name, '/'))[1] = (get_my_restaurant_id())::text
    )
  );

create policy "assets_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'restaurant-assets'
    and (
      get_my_role() = 'SUPER_ADMIN'
      or (string_to_array(name, '/'))[1] = (get_my_restaurant_id())::text
    )
  );

create policy "assets_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restaurant-assets'
    and (
      get_my_role() = 'SUPER_ADMIN'
      or (string_to_array(name, '/'))[1] = (get_my_restaurant_id())::text
    )
  );


-- ============ 004_super_admin.sql ============

-- ============================================================
-- Fase 3 — Super Admin: políticas INSERT/DELETE/SELECT globales
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 001, 002 y 003
-- ============================================================

-- ── RESTAURANTS ────────────────────────────────────────────
-- SUPER_ADMIN puede crear y eliminar restaurantes.
-- (El panel usa service_role, pero estas políticas cubren el cliente JWT.)
create policy "restaurants_insert_super"
  on restaurants for insert
  with check (get_my_role() = 'SUPER_ADMIN');

create policy "restaurants_delete_super"
  on restaurants for delete
  using (get_my_role() = 'SUPER_ADMIN');

-- ── RESTAURANT_THEMES ──────────────────────────────────────
create policy "themes_insert_super"
  on restaurant_themes for insert
  with check (get_my_role() = 'SUPER_ADMIN');

create policy "themes_delete_super"
  on restaurant_themes for delete
  using (get_my_role() = 'SUPER_ADMIN');

-- ── PROFILES ───────────────────────────────────────────────
-- SUPER_ADMIN puede ver y gestionar todos los perfiles (dar de alta owners).
-- La política "profiles_select_own" (001) se mantiene para usuarios normales;
-- esta política adicional da acceso global al SUPER_ADMIN (las políticas son OR).
create policy "profiles_select_super"
  on profiles for select
  using (get_my_role() = 'SUPER_ADMIN');

create policy "profiles_insert_super"
  on profiles for insert
  with check (get_my_role() = 'SUPER_ADMIN');

create policy "profiles_update_super"
  on profiles for update
  using (get_my_role() = 'SUPER_ADMIN');

-- ── ÍNDICES PARA QUERIES GLOBALES ───────────────────────────
create index if not exists restaurants_created_idx
  on restaurants(created_at desc);

create index if not exists restaurants_status_plan_idx
  on restaurants(status, plan_actual);


-- ============ 005_orders.sql ============

-- ============================================================
--  FASE 4 — Pedidos en línea (Plan 2 Premium)
--  Tablas: orders + order_items
--  RLS + función de numeración correlativa
-- ============================================================

-- Tabla principal de pedidos
create table if not exists orders (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  order_number   text          not null,
  customer_name  text          not null,
  customer_phone text          not null,
  order_type     text          not null check (order_type in ('PICKUP', 'DELIVERY')),
  address        text,
  payment_method text          not null default 'CASH',
  status         text          not null default 'NEW'
                               check (status in ('NEW','PREP','READY','TRANSIT','DELIVERED','CANCEL')),
  subtotal       numeric(10,2) not null,
  delivery_fee   numeric(10,2) not null default 0,
  total          numeric(10,2) not null,
  notes          text,
  created_at     timestamptz   not null default now()
);

-- Items con precios CONGELADOS al momento del pedido
create table if not exists order_items (
  id             uuid          primary key default gen_random_uuid(),
  order_id       uuid          not null references orders(id) on delete cascade,
  product_id     uuid          references products(id) on delete set null,
  name_snapshot  text          not null,
  price_snapshot numeric(10,2) not null,
  quantity       int           not null check (quantity > 0),
  subtotal       numeric(10,2) not null
);

-- Índices de rendimiento
create index if not exists orders_restaurant_created_idx on orders(restaurant_id, created_at desc);
create index if not exists orders_status_idx             on orders(restaurant_id, status);
create index if not exists order_items_order_idx         on order_items(order_id);

-- Numeración correlativa por restaurante y año: ORD-2026-00001
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
  v_year := to_char(now() at time zone 'UTC', 'YYYY');
  select coalesce(count(*), 0) + 1 into v_count
  from orders
  where restaurant_id = p_restaurant_id
    and date_part('year', created_at at time zone 'UTC') = date_part('year', now() at time zone 'UTC');
  return 'ORD-' || v_year || '-' || lpad(v_count::text, 5, '0');
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────

alter table orders      enable row level security;
alter table order_items enable row level security;

-- Cualquier visitante puede crear un pedido (cliente anónimo)
create policy "anon insert orders"
  on orders for insert
  with check (true);

-- Staff lee sus propios pedidos; Super Admin lee todos
create policy "staff read own orders"
  on orders for select
  using (
    restaurant_id = (
      select restaurant_id from profiles
      where id = auth.uid()
        and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'SUPER_ADMIN'
    )
  );

-- Solo staff/super_admin pueden cambiar el estado
create policy "staff update own orders"
  on orders for update
  using (
    restaurant_id = (
      select restaurant_id from profiles
      where id = auth.uid()
        and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'SUPER_ADMIN'
    )
  )
  with check (true);

-- Items: cualquiera inserta (misma sesión que el pedido)
create policy "anon insert order_items"
  on order_items for insert
  with check (true);

-- Items: solo quien puede leer el pedido puede ver sus items
create policy "staff read own order_items"
  on order_items for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (
          o.restaurant_id = (
            select restaurant_id from profiles
            where id = auth.uid()
              and role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF')
          )
          or exists (
            select 1 from profiles
            where id = auth.uid() and role = 'SUPER_ADMIN'
          )
        )
    )
  );

-- ── NOTA PARA ACTIVAR REALTIME ──────────────────────────────
-- En el dashboard de Supabase: Database → Replication → Supabase Realtime
-- Activar la tabla `orders` para que el panel admin reciba notificaciones
-- en tiempo real sin necesidad de recargar la página.


-- ============ 006_rls_hardening.sql ============

-- ============================================================
--  FASE 5 — Hardening de RLS y auditoría
--  Refuerza las políticas de pedidos a nivel de base de datos
--  (defensa en profundidad, independiente del frontend).
-- ============================================================

-- ── Orders: INSERT más estricto ────────────────────────────────
-- La política actual permite cualquier INSERT anónimo.
-- La reemplazamos por una que verifica que el restaurante esté
-- activo Y tenga el módulo de pedidos habilitado, además de
-- imponer status='NEW' y payment_method='CASH' en la inserción.

drop policy if exists "anon insert orders" on orders;

create policy "anon insert orders"
  on orders for insert
  with check (
    status         = 'NEW'
    and payment_method = 'CASH'
    and exists (
      select 1
      from   restaurants r
      where  r.id     = restaurant_id
        and  r.status = 'active'
        and  (r.modules ->> 'orders') = 'true'
    )
  );

-- ── Order items: INSERT más estricto ───────────────────────────
-- Requiere precio y cantidad positivos, y que el pedido exista.

drop policy if exists "anon insert order_items" on order_items;

create policy "anon insert order_items"
  on order_items for insert
  with check (
    quantity       > 0
    and price_snapshot > 0
    and price_snapshot < 100000
    and exists (
      select 1 from orders o
      where  o.id = order_id
    )
  );

-- ── updated_at automático en orders ────────────────────────────
-- Útil para el panel Realtime y para auditoría.

alter table orders
  add column if not exists updated_at timestamptz;

create or replace function set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();


-- ============ 007_theme_engine.sql (ALTER — ya incluido en CREATE TABLE arriba) ============
-- Las columnas config/content/custom_css ya están en la definición de restaurant_themes.

-- ============ 008_delivery_fee_product_icon.sql ============
-- Si corrés este archivo en una BD existente (actualización), aplicad estas líneas:
alter table orders   add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table products add column if not exists icon         text;

