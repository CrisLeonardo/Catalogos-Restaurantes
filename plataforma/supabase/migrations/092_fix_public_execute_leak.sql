-- ============================================================
--  Migración 092 — Cierra el hueco de PUBLIC en la protección de la 084
--  ------------------------------------------------------------
--  HALLAZGO (Fase 0 de PLAN_CORRECCION_PREVENTA.md, PR de prueba de CI real
--  contra una base recién creada desde cero): audit-security-definer.mjs
--  encontró que `leogin_receive_purchase_order` (migración 088) sigue
--  ejecutable por anon/authenticated pese a que 088 ya traía un
--  `revoke execute ... from anon, authenticated`.
--
--  CAUSA RAÍZ REAL (no lo que se documentó al principio de la Fase 0 como
--  "desfase de esta base local" — eso era una conclusión equivocada,
--  corregida aquí): en Postgres, `PUBLIC` es un pseudo-rol del que TODO rol
--  —incluidos anon y authenticated— es miembro implícito. `CREATE FUNCTION`
--  otorga `EXECUTE` a `PUBLIC` por default. La migración 084 sí cambió los
--  privilegios por defecto para que las funciones NUEVAS no le den execute
--  a `anon`/`authenticated` — pero nunca se lo quitó a `PUBLIC` mismo. Como
--  anon/authenticated son miembros de PUBLIC, heredan el execute de todas
--  formas. La 088 hizo un revoke explícito pero solo nombró
--  `anon, authenticated` (no `public`), así que no alcanzó a cerrar el
--  hueco que en realidad venía de PUBLIC. `has_function_privilege()` sí
--  calcula el privilegio efectivo vía membresía, por eso el script de
--  auditoría lo detectó correctamente.
--
--  Esta migración: (1) corrige la función específica, con `public`
--  incluido esta vez, igual que el patrón correcto de la 084; (2) cierra el
--  hueco del mecanismo para toda función `security definer` NUEVA de aquí
--  en adelante, agregando `public` al `alter default privileges` que la 084
--  dejó incompleto — así una futura migración que solo llame
--  `revoke ... from anon, authenticated` (como hizo la 088) ya no
--  reintroduce el mismo problema por la vía de PUBLIC.
-- ============================================================

revoke execute on function public.leogin_receive_purchase_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leogin_receive_purchase_order(uuid, uuid) to service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
