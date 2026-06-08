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
