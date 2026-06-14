-- ============================================================
--  Migración 024 — Grupos / cadenas multi-sucursal (Fase E)
--  · organizations: el "grupo" dueño de varias sucursales.
--  · restaurants.organization_id: a qué grupo pertenece (NULL = independiente).
--  · profiles.organization_id + rol GROUP_OWNER: el jefe del grupo.
--  Subdominio del panel del grupo: slug-central.dominio (ver tenant.ts/proxy.ts).
--  Ejecutar DESPUÉS de 001..023.
-- ============================================================

create table if not exists organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        unique not null,
  logo_url      text,
  color_primary text        not null default '#D97757',
  contact_email text,
  created_at    timestamptz not null default now()
);

comment on table organizations is
  'Grupo/cadena dueño de varias sucursales (restaurants). El jefe (GROUP_OWNER) '
  'monitorea todas desde slug-central.dominio.';

alter table organizations enable row level security; -- sin políticas: solo service role

-- ── Restaurants: a qué grupo pertenecen ─────────────────────
alter table restaurants
  add column if not exists organization_id uuid references organizations(id) on delete set null;

create index if not exists restaurants_organization_idx on restaurants(organization_id);

comment on column restaurants.organization_id is
  'Grupo dueño de esta sucursal. NULL = restaurante independiente.';

-- ── Profiles: dueño de grupo ────────────────────────────────
alter table profiles
  add column if not exists organization_id uuid references organizations(id) on delete set null;

-- Añadir GROUP_OWNER al check de roles (recrea la restricción).
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'GROUP_OWNER'));

comment on column profiles.organization_id is
  'Para GROUP_OWNER: el grupo que administra (ve todas sus sucursales).';
