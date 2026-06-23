-- ============================================================
--  Migración 038 — Activación de módulos en 2 niveles
--  ------------------------------------------------------------
--  · restaurants.modules        → ENTITLEMENTS (los concede Leogin/super admin).
--                                 Llaves nuevas opcionales: fel, proveedores, loyalty.
--                                 Es jsonb libre: no requiere cambio de esquema para
--                                 esas llaves, default ausente = false.
--  · restaurants.module_settings → estado que controla el RESTAURANTE (on/off de los
--                                 módulos a los que está habilitado). Forma:
--                                 { "fel": { "enabled": true }, "loyalty": {...} }
--
--  Módulo ACTIVO  =  entitlement(modules[k]) === true
--                    Y  module_settings[k].enabled === true
--  Si Leogin retira el entitlement, el restaurante no puede activarlo.
--  Ejecutar DESPUÉS de 001..037.
-- ============================================================

alter table restaurants
  add column if not exists module_settings jsonb not null default '{}'::jsonb;
