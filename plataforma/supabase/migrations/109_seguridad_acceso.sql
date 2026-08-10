-- ============================================================
--  Migración 109 — Seguridad del acceso al panel
--  ------------------------------------------------------------
--  Dos piezas, las dos nacidas de la misma revisión (2026-08-08):
--
--  1) profiles.email_verified_at — verificación SUAVE del correo.
--     El registro self-serve crea al dueño con `email_confirm: true`
--     (src/lib/actions/signup.ts): el correo queda marcado como
--     verificado sin haberse verificado nunca. Se mantiene así a
--     propósito —la cuenta tiene que nacer viva, el pitch es "en vivo
--     en 2 minutos"— pero ahora se guarda aparte si el dueño confirmó
--     de verdad, y el panel se lo recuerda hasta que lo haga. Sin
--     bloquear nada: un correo de confirmación que se va a spam no
--     puede dejar a un cliente real fuera de su panel.
--
--     No se usa auth.users.email_confirmed_at porque ese campo ya
--     está puesto por el alta y no se puede distinguir del real.
--
--  2) panel_access_log — bitácora de accesos.
--     Antes no quedaba rastro de quién entró al panel, desde dónde
--     ni cuándo. Sin eso, "alguien entró a mi cuenta" no se puede ni
--     confirmar ni desmentir. El dueño la ve en /admin/personal.
--
--  Ejecutar DESPUÉS de 001..108.
-- ============================================================

alter table profiles
  add column if not exists email_verified_at timestamptz;

comment on column profiles.email_verified_at is
  'Cuándo el dueño confirmó su correo abriendo el enlace que le mandamos. '
  'NULL = todavía no lo ha confirmado (la cuenta funciona igual; el panel '
  'muestra un aviso). Distinto de auth.users.email_confirmed_at, que el alta '
  'self-serve pone siempre para que la cuenta nazca usable.';

create table if not exists panel_access_log (
  id            bigint      generated always as identity primary key,
  restaurant_id uuid        references restaurants(id) on delete cascade,
  profile_id    uuid        not null references profiles(id) on delete cascade,
  -- 'password' | 'pin' | 'soporte'
  method        text        not null,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

comment on table panel_access_log is
  'Un renglón por inicio de sesión en el panel. Lo escribe el servidor '
  '(src/lib/auth/access-log.ts) y lo lee el dueño en /admin/personal.';

-- Lectura típica: "los últimos accesos de MI restaurante".
create index if not exists panel_access_log_restaurant_idx
  on panel_access_log(restaurant_id, created_at desc);

-- Y "los últimos accesos de esta persona", para detectar el dispositivo nuevo.
create index if not exists panel_access_log_profile_idx
  on panel_access_log(profile_id, created_at desc);

alter table panel_access_log enable row level security;

-- Sin políticas: nadie llega a esta tabla con el cliente anónimo. La escribe
-- y la lee el servidor con la service role key, que salta RLS. Es a propósito
-- —una bitácora que el propio cliente puede editar no sirve como bitácora—
-- y con RLS activada sin políticas, cualquier intento desde el navegador
-- devuelve vacío en vez de datos.

-- Limpieza: 180 días es suficiente para investigar un acceso raro y evita
-- que la tabla crezca sin fin. Mismo patrón que rate_limit_buckets (mig 100).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'leogin_purga_panel_access_log',
      '30 4 * * *',
      $cmd$delete from panel_access_log where created_at < now() - interval '180 days'$cmd$
    );
  end if;
exception when others then
  -- Sin pg_cron la tabla simplemente no se purga sola: no es motivo para
  -- que falle la migración entera.
  null;
end $$;
