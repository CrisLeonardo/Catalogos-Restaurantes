-- ============================================================
--  Migración 091 — Grants base de tabla para anon/authenticated/service_role
--  ------------------------------------------------------------
--  HALLAZGO (Fase 0 de PLAN_CORRECCION_PREVENTA.md, primer PR de prueba de
--  CI real): un Supabase local recién levantado con `supabase start` +
--  `db reset` (CLI actual) NO deja a `service_role` con privilegios de
--  tabla sobre `public` — `insert into restaurants` como service_role
--  falla con "permission denied for table restaurants". Ninguna migración
--  de este proyecto había otorgado esto nunca porque siempre se asumió el
--  grant automático de la plataforma Supabase — todavía cierto hoy en
--  producción hospedada (por eso nadie lo había notado), pero ya no
--  garantizado en un bootstrap fresco del CLI local más reciente. El propio
--  `supabase/config.toml` de este proyecto ya documentaba un cambio de
--  default parecido (`auto_expose_new_tables`, con fecha de corte
--  2026-05-30) — la plataforma ha estado moviendo sus defaults hacia menos
--  acceso automático.
--
--  Esta migración es aditiva e idempotente: en un proyecto que YA tiene
--  estos grants (como debería ser producción hoy) no cambia nada — repetir
--  un GRANT ya otorgado no es un error ni afloja nada. Existe para que el
--  proyecto no dependa implícitamente de un comportamiento de plataforma
--  que ya demostró no ser constante entre versiones del CLI, y para que
--  cualquier entorno nuevo (CI, un dev nuevo, una reconstrucción de
--  producción) quede funcional sin depender de ese detalle externo.
--
--  El acceso real sigue gobernado por RLS (cada tabla mantiene sus
--  políticas ya auditadas) — este grant es solo el requisito de Postgres
--  para que RLS tenga oportunidad de evaluarse; es el patrón estándar de
--  Supabase (grant amplio a nivel de tabla + RLS como el filtro real).
--
--  A propósito NO toca privilegios de FUNCIONES (`execute`) — eso ya lo
--  gobierna por completo la migración 084 (revoca `anon`/`authenticated`
--  de las funciones `security definer` sensibles) y no debe tocarse aquí.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant usage, select on all sequences in schema public to authenticated, anon;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, anon;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, anon;
