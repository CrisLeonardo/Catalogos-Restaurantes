-- ============================================================
--  Migración 084 — Restringir funciones SECURITY DEFINER a service_role
--  ------------------------------------------------------------
--  HALLAZGO (ver PLAN_AUDITORIA_LANZAMIENTO.md, Fase 0 §4): el bootstrap de
--  Supabase deja "alter default privileges in schema public grant execute
--  on functions to anon, authenticated, service_role" — así que TODA
--  función security definer creada en este proyecto quedó ejecutable
--  DIRECTAMENTE por cualquiera con la clave anon (pública, va en el JS del
--  navegador) vía POST /rest/v1/rpc/<nombre>, saltándose por completo la
--  server action de Next.js y sus validaciones de rol/restaurante.
--
--  Verificado contra pg_proc + pg_policies antes de escribir esta migración:
--  ninguna de las funciones de abajo se usa dentro de una política RLS
--  (solo get_my_role/get_my_restaurant_id/is_my_group_branch/get_my_org_id
--  lo están, y esas NO se tocan aquí — RLS dejaría de funcionar si pierden
--  execute). Tampoco ninguna se llama desde el cliente anon/autenticado en
--  el código TS: todas se invocan vía `createServiceClient()` desde server
--  actions, o son funciones trigger (no requieren grant al rol que dispara
--  el trigger), o corren dentro de pg_cron.
--
--  get_group_branches sigue pública a propósito (selector de sucursal
--  anónimo, migración 026) — expone solo columnas públicas por diseño.
--
--  Ejecutar DESPUÉS de 001..083.
-- ============================================================

revoke execute on function public.api_key_touch(text) from public, anon, authenticated;
revoke execute on function public.check_delivery_coverage(uuid, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.claim_print_jobs(uuid, integer) from public, anon, authenticated;
revoke execute on function public.generate_order_number(uuid) from public, anon, authenticated;
revoke execute on function public.increment_promo_usage(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_active_channels(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_addon_modules_cost(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_apply_auto_price(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_apply_auto_price_all() from public, anon, authenticated;
revoke execute on function public.leogin_archive_abandoned_orders(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_billed_active_channels(uuid, date) from public, anon, authenticated;
revoke execute on function public.leogin_billed_addon_modules(uuid, date) from public, anon, authenticated;
revoke execute on function public.leogin_billed_channels_off(uuid, date) from public, anon, authenticated;
revoke execute on function public.leogin_billing_cron() from public, anon, authenticated;
revoke execute on function public.leogin_branch_discount_pct(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.leogin_channel_off_fraction(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.leogin_compute_monthly_fee(uuid, date) from public, anon, authenticated;
revoke execute on function public.leogin_effective_grace_days(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_fee_breakdown(uuid, date) from public, anon, authenticated;
revoke execute on function public.leogin_generate_monthly_invoices() from public, anon, authenticated;
revoke execute on function public.leogin_graduate_trials() from public, anon, authenticated;
revoke execute on function public.leogin_ingredient_price_changed() from public, anon, authenticated;
revoke execute on function public.leogin_log_channel_change() from public, anon, authenticated;
revoke execute on function public.leogin_log_module_change() from public, anon, authenticated;
revoke execute on function public.leogin_loyalty_apply(uuid, uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.leogin_loyalty_redeem_reward(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.leogin_module_off_fraction(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.leogin_next_po_folio(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_process_overdue() from public, anon, authenticated;
revoke execute on function public.leogin_recipe_item_changed() from public, anon, authenticated;
revoke execute on function public.leogin_recompute_recipe_cost(uuid) from public, anon, authenticated;
revoke execute on function public.leogin_setting_bool(text, boolean) from public, anon, authenticated;
revoke execute on function public.leogin_setting_num(text, numeric) from public, anon, authenticated;
revoke execute on function public.leogin_sync_restaurant_status(uuid) from public, anon, authenticated;
revoke execute on function public.place_order(uuid, text, text, text, text, text, double precision, double precision, uuid, numeric, numeric, numeric, text, jsonb, text, numeric, numeric, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.restock_order(uuid) from public, anon, authenticated;
revoke execute on function public.upsert_customer(uuid, text, text, text, text, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.upsert_customer(uuid, text, text, text, text, numeric, uuid, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.visit_stats(uuid, text) from public, anon, authenticated;
revoke execute on function public.void_order(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.void_order_item(uuid, uuid, integer, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.api_key_touch(text) to service_role;
grant execute on function public.check_delivery_coverage(uuid, double precision, double precision) to service_role;
grant execute on function public.claim_print_jobs(uuid, integer) to service_role;
grant execute on function public.generate_order_number(uuid) to service_role;
grant execute on function public.increment_promo_usage(uuid) to service_role;
grant execute on function public.leogin_active_channels(uuid) to service_role;
grant execute on function public.leogin_addon_modules_cost(uuid) to service_role;
grant execute on function public.leogin_apply_auto_price(uuid) to service_role;
grant execute on function public.leogin_apply_auto_price_all() to service_role;
grant execute on function public.leogin_archive_abandoned_orders(uuid) to service_role;
grant execute on function public.leogin_billed_active_channels(uuid, date) to service_role;
grant execute on function public.leogin_billed_addon_modules(uuid, date) to service_role;
grant execute on function public.leogin_billed_channels_off(uuid, date) to service_role;
grant execute on function public.leogin_billing_cron() to service_role;
grant execute on function public.leogin_branch_discount_pct(uuid, uuid) to service_role;
grant execute on function public.leogin_channel_off_fraction(uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.leogin_compute_monthly_fee(uuid, date) to service_role;
grant execute on function public.leogin_effective_grace_days(uuid) to service_role;
grant execute on function public.leogin_fee_breakdown(uuid, date) to service_role;
grant execute on function public.leogin_generate_monthly_invoices() to service_role;
grant execute on function public.leogin_graduate_trials() to service_role;
grant execute on function public.leogin_ingredient_price_changed() to service_role;
grant execute on function public.leogin_log_channel_change() to service_role;
grant execute on function public.leogin_log_module_change() to service_role;
grant execute on function public.leogin_loyalty_apply(uuid, uuid, uuid, text, integer, text) to service_role;
grant execute on function public.leogin_loyalty_redeem_reward(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.leogin_module_off_fraction(uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.leogin_next_po_folio(uuid) to service_role;
grant execute on function public.leogin_process_overdue() to service_role;
grant execute on function public.leogin_recipe_item_changed() to service_role;
grant execute on function public.leogin_recompute_recipe_cost(uuid) to service_role;
grant execute on function public.leogin_setting_bool(text, boolean) to service_role;
grant execute on function public.leogin_setting_num(text, numeric) to service_role;
grant execute on function public.leogin_sync_restaurant_status(uuid) to service_role;
grant execute on function public.place_order(uuid, text, text, text, text, text, double precision, double precision, uuid, numeric, numeric, numeric, text, jsonb, text, numeric, numeric, uuid, uuid) to service_role;
grant execute on function public.restock_order(uuid) to service_role;
grant execute on function public.upsert_customer(uuid, text, text, text, text, numeric, uuid) to service_role;
grant execute on function public.upsert_customer(uuid, text, text, text, text, numeric, uuid, double precision, double precision) to service_role;
grant execute on function public.visit_stats(uuid, text) to service_role;
grant execute on function public.void_order(uuid, text, uuid, uuid) to service_role;
grant execute on function public.void_order_item(uuid, uuid, integer, text, uuid, uuid) to service_role;

-- pg_cron programa sus jobs para correr como el rol que los agenda (el
-- superusuario que ejecuta las migraciones), no como anon/authenticated —
-- así que este REVOKE no rompe leogin_billing_cron ni el cron de 080.
-- Las funciones trigger (leogin_*_changed, leogin_log_*_change) tampoco se
-- ven afectadas: un trigger se dispara por la operación en la tabla, no
-- requiere que el rol de la sesión tenga EXECUTE sobre la función trigger.

-- ── De cara al futuro: nuevas funciones NO deben quedar públicas por default ──
-- Supabase configura "alter default privileges ... grant execute on
-- functions to anon, authenticated" a nivel de rol postgres; esto lo
-- contrarresta para que cualquier función SECURITY DEFINER nueva empiece
-- SIN acceso de anon/authenticated y haya que concedérselo a propósito
-- (como get_group_branches) en vez de que sea el default silencioso.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
