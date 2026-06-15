-- 029_planes_y_modulos.sql
-- Renombra planes CATALOGO→BASICO y PREMIUM→POPULAR.
-- Añade PREMIUM como nuevo tier de alto valor.
-- Expande modules JSONB con campos granulares por módulo.

-- 1. Eliminar constraint viejo
alter table restaurants drop constraint if exists restaurants_plan_actual_check;

-- 2. Migrar datos existentes
update restaurants set plan_actual = 'BASICO'  where plan_actual = 'CATALOGO';
update restaurants set plan_actual = 'POPULAR' where plan_actual = 'PREMIUM';

-- 3. Nuevo constraint con los tres planes
alter table restaurants
  add constraint restaurants_plan_actual_check
  check (plan_actual in ('BASICO', 'POPULAR', 'PREMIUM'));

-- 4. Nuevo valor por defecto
alter table restaurants alter column plan_actual set default 'BASICO';

-- 5. Expandir módulos — preserva catalog/orders/whatsapp_notify existentes
--    y agrega los campos nuevos según el plan actual
update restaurants
set modules = modules || jsonb_build_object(
  'analitica',    plan_actual <> 'BASICO',
  'inventario',   plan_actual <> 'BASICO',
  'promociones',  plan_actual <> 'BASICO',
  'personal',     plan_actual <> 'BASICO',
  'finanzas',     plan_actual <> 'BASICO',
  'multi_branch', plan_actual <> 'BASICO'
);

-- 6. Actualizar el default del JSONB para restaurantes nuevos
alter table restaurants
  alter column modules
  set default '{"catalog":true,"orders":false,"whatsapp_notify":false,"analitica":false,"inventario":false,"promociones":false,"personal":false,"finanzas":false,"multi_branch":false}';
