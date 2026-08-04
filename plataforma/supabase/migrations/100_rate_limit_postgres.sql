-- ============================================================
--  Migración 100 — Rate limiting compartido (Postgres en vez de Map)
--  ------------------------------------------------------------
--  HALLAZGO (CHECKLIST_CORRECCIONES.md): src/lib/rate-limit.ts vivía en un
--  Map del proceso — inofensivo con 1 sola instancia de Render, pero cada
--  instancia cuenta por separado en cuanto se escale horizontalmente (un
--  atacante repartido entre instancias nunca topa el límite real).
--
--  Se eligió Postgres (ya disponible) en vez de Upstash/Redis para no
--  depender de una cuenta/credencial externa nueva. leogin_rate_limit() es
--  un UPSERT atómico (INSERT ... ON CONFLICT), así que no hay carrera entre
--  requests concurrentes del mismo key como sí la habría con un
--  "select, comparar, update" en dos pasos.
--
--  Ejecutar DESPUÉS de 001..099.
-- ============================================================

create table if not exists rate_limit_buckets (
  key      text primary key,
  count    int  not null default 1,
  reset_at timestamptz not null
);

comment on table rate_limit_buckets is
  'Cubos de rate limiting compartidos entre instancias (reemplaza el Map en '
  'memoria de src/lib/rate-limit.ts). Una fila por key (ver los ~15 call-sites '
  'de rateLimit() para el formato de key, ej. "login:<ip>"). Se limpia sola '
  '(ver cron más abajo); no necesita mantenimiento manual.';

/**
 * Ventana fija: si el cubo no existe o ya venció, lo reinicia en 1 y
 * permite. Si existe y sigue vigente, incrementa y permite solo si el
 * conteo (ya incrementado) no pasa p_max — mismo comportamiento observable
 * que el rateLimit() en memoria que reemplaza (permite exactamente p_max
 * llamadas por ventana, rechaza el resto hasta que reset_at venza).
 */
create or replace function leogin_rate_limit(p_key text, p_max int, p_window_ms bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limit_buckets as b (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count    = case when b.reset_at <= now() then 1 else b.count + 1 end,
    reset_at = case when b.reset_at <= now() then now() + make_interval(secs => p_window_ms / 1000.0) else b.reset_at end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

comment on function leogin_rate_limit is
  'Reemplazo compartido (Postgres) del rateLimit() en memoria. Misma firma '
  'conceptual: key, max llamadas, ventana en ms. Devuelve true si se permite.';

revoke execute on function leogin_rate_limit(text, int, bigint) from public, anon, authenticated;
grant execute on function leogin_rate_limit(text, int, bigint) to service_role;

-- Limpieza: sin esto la tabla crece para siempre (una fila por key única
-- vista alguna vez). Se borran cubos vencidos hace más de un día — no hace
-- falta más margen, reset_at ya marca cuándo un cubo dejó de importar.
create or replace function leogin_prune_rate_limit_buckets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from rate_limit_buckets where reset_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function leogin_prune_rate_limit_buckets is
  'Borra cubos de rate_limit_buckets vencidos hace más de 1 día. Cron horario.';

revoke execute on function leogin_prune_rate_limit_buckets() from public, anon, authenticated;
grant execute on function leogin_prune_rate_limit_buckets() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-prune-rate-limit-hourly') then
        perform cron.unschedule('leogin-prune-rate-limit-hourly');
      end if;
      perform cron.schedule(
        'leogin-prune-rate-limit-hourly',
        '17 * * * *',
        'select leogin_prune_rate_limit_buckets();'
      );
      raise notice 'pg_cron: job "leogin-prune-rate-limit-hourly" programado (cada hora).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actívalo en el dashboard y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: rate_limit_buckets no se autolimpia hasta activarlo (no bloquea el rate limiting en sí, solo el mantenimiento de la tabla).';
  end if;
end $$;
