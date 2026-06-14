-- ============================================================
--  Migración 023 — Personal (permisos) + bitácora de actividad
--  · profiles.permissions: secciones del panel a las que accede
--    el staff (NULL = todas, para dueños).
--  · activity_log: registro de acciones clave del panel.
--  Ejecutar DESPUÉS de 001..022.
-- ============================================================

alter table profiles
  add column if not exists permissions jsonb;

comment on column profiles.permissions is
  'Secciones permitidas para RESTAURANT_STAFF: ["pedidos","inventario",...]. '
  'NULL = todas (dueños / super admin).';

create table if not exists activity_log (
  id            bigint      generated always as identity primary key,
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  actor_id      uuid,
  action        text        not null,   -- 'order_status' | 'product' | 'stock' | 'promo' | 'staff' | ...
  entity        text,                    -- descripción corta (nombre/numero)
  meta          jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_restaurant_idx
  on activity_log(restaurant_id, created_at desc);

-- RLS sin políticas: acceso por server actions (service role) que validan rol.
alter table activity_log enable row level security;
