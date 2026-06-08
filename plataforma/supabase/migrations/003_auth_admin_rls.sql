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
  5242880,   -- 5 MB
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
