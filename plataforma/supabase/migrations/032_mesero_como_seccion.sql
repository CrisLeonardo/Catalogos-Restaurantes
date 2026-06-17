-- ============================================================
--  Migración 032 — "Mesero" deja de ser un rol aparte y pasa a
--  ser una SECCIÓN/permiso combinable de RESTAURANT_STAFF.
--
--  · Antes: RESTAURANT_WAITER = rol rígido, solo /admin/mesero.
--  · Ahora: el dueño marca la sección "mesero" igual que cualquier
--    otra (pedidos, catálogo…). Un mismo miembro puede tener
--    "mesero" + otras secciones del panel.
--
--  Migra los meseros existentes a RESTAURANT_STAFF con
--  permissions = ["mesero"] (mesero "puro"). El rol
--  RESTAURANT_WAITER se conserva en el CHECK por compatibilidad
--  pero queda deprecado: ya no se crean nuevos.
--  Ejecutar DESPUÉS de 023..031.
-- ============================================================

-- ── 1. Migrar meseros existentes a STAFF con permiso "mesero" ──
update profiles
   set role        = 'RESTAURANT_STAFF',
       permissions = '["mesero"]'::jsonb
 where role = 'RESTAURANT_WAITER';

comment on column profiles.permissions is
  'Secciones permitidas para RESTAURANT_STAFF: ["pedidos","mesero",...]. '
  'NULL = todas (dueños / super admin). "mesero" habilita /admin/mesero.';

comment on column profiles.role is
  'SUPER_ADMIN = Leogin; RESTAURANT_OWNER = dueño; '
  'RESTAURANT_STAFF = personal con permisos por sección '
  '(incluye "mesero" para tomar pedidos en mesa); '
  'GROUP_OWNER = dueño de grupo. '
  'RESTAURANT_WAITER = DEPRECADO (migrado a STAFF + ["mesero"]).';

-- Nota: las políticas RLS de pedidos (migración 030) ya incluyen
-- RESTAURANT_STAFF, así que los ex-meseros conservan lectura y
-- actualización de pedidos sin cambios adicionales.
