-- ============================================================
--  ¿Qué migraciones tiene ESTA base? (091 → 141)
--
--  Solo LEE: no cambia nada. Pégalo en Supabase → SQL Editor → Run.
--  Cada fila mira una huella que deja su migración (una tabla, una
--  columna, un disparador, una función…) y dice si está.
--
--    · aplicada = 'sí'  → ya corrió.
--    · aplicada = 'NO'  → falta: corre ese archivo de
--                         plataforma/supabase/migrations/.
--    · aplicada = '—'   → solo movió datos o precios una vez: no deja
--                         huella que se pueda mirar.
--
--  Fíjate en la columna «cuándo»: la 137 y la 138 van DESPUÉS de
--  desplegar el código nuevo (PLAN_ACCESO_Y_MONITOREO_2026-10-08.md).
--  Las demás se corren en orden de número.
-- ============================================================

with
huellas(n, que, ok, cuando) as (values
  ('091', 'permisos base de las tablas',
     has_table_privilege('authenticated', 'public.orders', 'SELECT'), ''),
  ('092', 'funciones sin EXECUTE público',
     to_regprocedure('public.leogin_receive_purchase_order(uuid,uuid)') is null
     or not has_function_privilege('anon', 'public.leogin_receive_purchase_order(uuid,uuid)', 'EXECUTE'), ''),
  ('093', 'cupón en el pedido (orders.coupon_id)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'coupon_id'), ''),
  ('094', 'PC principal (print_agents.is_active)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'print_agents' and column_name = 'is_active'), ''),
  ('095', 'piso del plan (leogin_module_included_in_plan)',
     exists (select 1 from pg_proc where proname = 'leogin_module_included_in_plan'), ''),
  ('096', 'pedidos por WhatsApp (restaurants.orders_whatsapp_enabled)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'restaurants' and column_name = 'orders_whatsapp_enabled'), ''),
  ('097', 'nota por platillo (order_items.note)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'note'), ''),
  ('098', 'reporte de ventas en SQL',
     exists (select 1 from pg_proc where proname = 'leogin_sales_report'), ''),
  ('099', 'auto-archivo de domicilio y llevar',
     exists (select 1 from pg_proc where proname = 'leogin_archive_abandoned_delivery_orders'), ''),
  ('100', 'límite de intentos en Postgres (rate_limit_buckets)',
     to_regclass('public.rate_limit_buckets') is not null, ''),
  ('101', 'origen del pedido (orders.source)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'source'), ''),
  ('102', 'canal de WhatsApp (whatsapp_accounts)',
     to_regclass('public.whatsapp_accounts') is not null, ''),
  ('103', 'reparto (drivers)',
     to_regclass('public.drivers') is not null, ''),
  ('104', 'zonas a tabla (solo datos)', null, ''),
  ('106', 'transmisión FEL (fel_settings.api_clave_cipher)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fel_settings' and column_name = 'api_clave_cipher'), ''),
  ('107', 'canales externos (channel_product_map)',
     to_regclass('public.channel_product_map') is not null, ''),
  ('108', 'propinas en el reporte de ventas',
     exists (select 1 from pg_proc where proname = 'leogin_sales_report' and prosrc ilike '%tips%'), ''),
  ('109', 'bitácora de accesos al panel (panel_access_log)',
     to_regclass('public.panel_access_log') is not null, ''),
  ('110', 'PC principal por aparato (print_agents.activated_device_id)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'print_agents' and column_name = 'activated_device_id'), ''),
  ('111', 'precios de lanzamiento (solo datos)', null, ''),
  ('112', 'aparatos de confianza (restaurant_devices)',
     to_regclass('public.restaurant_devices') is not null, ''),
  ('113', 'membresías (restaurant_members)',
     to_regclass('public.restaurant_members') is not null, ''),
  ('114', 'invitaciones (restaurant_invitations)',
     to_regclass('public.restaurant_invitations') is not null, ''),
  ('115', 'sin descuento por volumen (se ve con la 120)', null, ''),
  ('116', 'adiós al rol GROUP_OWNER',
     exists (select 1 from pg_proc where proname = 'is_my_group_branch' and prosrc not ilike '%GROUP_OWNER%'), ''),
  ('117', 'my_role_in sin EXECUTE para sesiones',
     to_regprocedure('public.my_role_in(uuid)') is null
     or not has_function_privilege('authenticated', 'public.my_role_in(uuid)', 'EXECUTE'), ''),
  ('118', 'corrección fiscal FEL (fel_settings.regimen_iva)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fel_settings' and column_name = 'regimen_iva'), ''),
  ('119', 'grupo automático (solo datos)', null, ''),
  ('120', 'planes fijos sin a la carta',
     exists (select 1 from pg_proc where proname = 'leogin_compute_monthly_fee' and prosrc not ilike '%v_chan_disc%'), ''),
  ('121', 'tema claro por defecto (color_bg sin default)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'restaurant_themes' and column_name = 'color_bg' and is_nullable = 'YES'), ''),
  ('122', 'motivo al llamar al mesero (waiter_calls.reason)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'waiter_calls' and column_name = 'reason'), ''),
  ('123', 'salón y caja (cash_expenses)',
     to_regclass('public.cash_expenses') is not null, ''),
  ('124', 'anular recalcula la propina',
     exists (select 1 from pg_proc where proname = 'void_order_item' and prosrc ilike '%v_new_tip%'), ''),
  ('125', 'reparto de mesa compartido (table_splits)',
     to_regclass('public.table_splits') is not null, ''),
  ('126', 'anulación firmada siempre',
     exists (select 1 from pg_trigger where tgname = 'order_voids_exige_firma_trg'), ''),
  ('127', 'mesa por número (orders.table_number)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'table_number'), ''),
  ('128', 'sentar la mesa (table_sessions)',
     to_regclass('public.table_sessions') is not null, ''),
  ('129', 'pago mixto de mesa (order_payments)',
     to_regclass('public.order_payments') is not null, ''),
  ('130', 'impresión por estación (print_stations)',
     to_regclass('public.print_stations') is not null, ''),
  ('131', 'lista de cuentas del Super (admin_accounts)',
     to_regclass('public.admin_accounts') is not null, ''),
  ('132', 'bitácora del Super Admin (super_admin_log)',
     to_regclass('public.super_admin_log') is not null, ''),
  ('133', 'servido por línea (order_items.served_at)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'served_at'), ''),
  ('134', 'alias de slug (restaurant_slug_aliases)',
     to_regclass('public.restaurant_slug_aliases') is not null, ''),
  ('135', 'anulaciones sin atar al personal (requested_by_name)',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_voids' and column_name = 'requested_by_name'), ''),
  ('136', 'candados de escritura (nadie se hace Super Admin)',
     exists (select 1 from pg_trigger where tgname = 'candado_perfil')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname in ('profiles_update_own', 'profiles_insert_own')),
     'YA, sin esperar el despliegue'),
  ('137', 'Super Admin con segundo factor',
     exists (select 1 from pg_proc where proname = 'leogin_sesion_con_segundo_factor'),
     'DESPUÉS de desplegar'),
  ('138', 'salud de clientes (avisos al celular)',
     to_regclass('public.super_push_subscriptions') is not null,
     'DESPUÉS de la 137'),
  ('139', 'candados de pedidos y dinero',
     exists (select 1 from pg_trigger where tgname = 'candado_columnas_pedido'),
     'YA, sin esperar el despliegue'),
  ('140', 'permisos por sección en la base',
     exists (select 1 from pg_proc where proname = 'leogin_puede'),
     'YA, sin esperar el despliegue'),
  ('141', 'archivo de ediciones de la Vitrina (drop_editions)',
     to_regclass('public.drop_editions') is not null,
     'antes o después del despliegue')
)
select n as migracion,
       case when ok is null then '—' when ok then 'sí' else 'NO' end as aplicada,
       que,
       cuando
  from huellas
 order by (ok is false) desc, n;
