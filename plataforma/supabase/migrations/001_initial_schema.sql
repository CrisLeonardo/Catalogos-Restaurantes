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
  background_image text
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
