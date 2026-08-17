-- ============================================================
--  Migración 114 — Invitaciones al equipo (Fase 2)
--  ------------------------------------------------------------
--  La migración 113 dejó el modelo de membresías, pero para sumar a
--  un gerente había que crearle la cuenta a mano y pasarle una
--  contraseña temporal. Eso tiene tres problemas que no se arreglan
--  con mejor UI:
--
--   1) La contraseña viaja por WhatsApp. Queda escrita en un chat
--      para siempre, y casi nadie la cambia después.
--   2) La elige el dueño, no su dueño real. Nunca es solo suya.
--   3) Crear la cuenta OCUPA ese correo en todo Leogin aunque la
--      persona nunca llegue a entrar — y si un día quiere abrir su
--      propio restaurante, se topa con "ya existe una cuenta".
--
--  Con una invitación, la cuenta la crea (o la reusa) QUIEN LA
--  ACEPTA, con su propia contraseña o con su Google. Nada se ocupa
--  hasta que alguien dice que sí.
--
--  DEL LADO DE LA SEGURIDAD:
--   · el token no se guarda: se guarda su hash (sha-256). Una fuga
--     de esta tabla no reparte accesos;
--   · un solo uso (`accepted_at`) y caduca a los 7 días;
--   · la invitación es PARA UN CORREO: quien la acepta tiene que
--     entrar con ese mismo correo. Sin esa regla, reenviar el enlace
--     regala el acceso al restaurante.
--
--  Ejecutar DESPUÉS de 001..113.
-- ============================================================

create table if not exists restaurant_invitations (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  -- A quién se invitó. En minúsculas siempre: es la llave con la que se
  -- compara al aceptar, y "Juan@" y "juan@" son el mismo buzón.
  email         text        not null,
  role          text        not null default 'MANAGER'
                  check (role in ('MANAGER', 'STAFF', 'WAITER')),
  permissions   text[],
  -- sha-256 del token que viaja en el enlace. El token en claro solo existe
  -- en el correo de la persona y en el instante en que se generó.
  token_hash    text        not null unique,
  invited_by    uuid        references auth.users(id) on delete set null,
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

comment on table restaurant_invitations is
  'Invitaciones para sumarse al equipo de un restaurante. La cuenta la crea '
  'quien acepta, con su propia contraseña o con su Google: hasta entonces no '
  'se ocupa ningún correo en Leogin.';

comment on column restaurant_invitations.token_hash is
  'sha-256 del token del enlace. El token en claro nunca se guarda: una fuga '
  'de esta tabla no reparte accesos.';

comment on column restaurant_invitations.email is
  'Correo invitado, en minúsculas. Quien acepta tiene que entrar con ESTE '
  'correo — si no, reenviar el enlace regalaría el acceso.';

-- Lectura típica: "las invitaciones pendientes de este restaurante".
create index if not exists restaurant_invitations_restaurant_idx
  on restaurant_invitations(restaurant_id, created_at desc);

-- Y la del que acepta: buscar por token.
create index if not exists restaurant_invitations_token_idx
  on restaurant_invitations(token_hash);

-- No dos invitaciones vivas al mismo correo para el mismo restaurante: el
-- dueño que pulsa dos veces no deja dos enlaces válidos sueltos.
create unique index if not exists restaurant_invitations_pending_uniq
  on restaurant_invitations(restaurant_id, email)
  where accepted_at is null;

alter table restaurant_invitations enable row level security;

-- Sin políticas: la escribe y la lee el servidor con la service role key,
-- igual que panel_access_log (109) y restaurant_devices (111). Quien pudiera
-- leer esta tabla desde el navegador vería los correos de todo el equipo de
-- cualquier restaurante; quien pudiera escribirla se invitaría solo.

-- ── Limpieza ────────────────────────────────────────────────
-- Las caducadas y las ya aceptadas no sirven para nada después de un tiempo.
-- Mismo patrón que rate_limit_buckets (100) y panel_access_log (109).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'leogin_purge_invitations',
      '30 4 * * *',
      $sql$
        delete from restaurant_invitations
        where (accepted_at is not null and accepted_at < now() - interval '90 days')
           or (accepted_at is null and expires_at < now() - interval '30 days')
      $sql$
    );
  end if;
end $$;
