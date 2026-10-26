-- ============================================================
--  146 · Cuenta Leogin: puente de sesión a cada restaurante
--  ------------------------------------------------------------
--  PLAN_BILLETERA_COMENSAL_2026-10-25, Fase 1 (BIL-02, BIL-05).
--
--  El comensal tiene UNA cuenta Leogin (su Google) y una sesión en la
--  billetera (`distleogin.com/billetera`). La sesión de cada restaurante
--  sigue siendo host-only y propia: tener la cuenta iniciada no abre
--  sesión en ningún sitio. Lo que la abre es el PUENTE, con permiso:
--
--    1. el restaurante manda a /billetera/puente;
--    2. la primera vez se le pregunta al comensal si quiere unirse
--       (queda en `cuenta_restaurantes`);
--    3. el servidor crea un código de un solo uso (`cuenta_puentes`) y
--       lo manda al host del restaurante, que lo canjea EN SU SERVIDOR
--       y abre ahí su propia sesión del comensal.
--
--  Lo que cambia en la base:
--
--   1. cuenta_restaurantes — a qué restaurantes se unió cada cuenta y
--      cuándo. Es el permiso del comensal y la lista de su billetera.
--      Distinta de `customers`: ese registro nace al pedir y exige
--      teléfono; unirse no.
--   2. cuenta_puentes — los códigos del puente. Solo se guarda el HASH
--      del código; vence a los 60 s y se gasta al primer canje. La ruta
--      de vuelta viaja aquí y no en la URL, así que no se puede cambiar
--      por el camino.
--   3. pg_cron diario que borra los códigos vencidos.
--
--  Las dos tablas: RLS encendida y SIN políticas — solo el servidor
--  (cliente de servicio) las toca. Llevan la regla restrictiva de la 137.
--
--  Idempotente. Ejecutar DESPUÉS de 001..145 y ANTES de desplegar el
--  código de la Fase 1 (las páginas /billetera/puente y /auth/puente
--  fallan sin estas tablas).
-- ============================================================

create table if not exists public.cuenta_restaurantes (
  auth_user_id  uuid        not null references auth.users(id) on delete cascade,
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  unido_at      timestamptz not null default now(),
  primary key (auth_user_id, restaurant_id)
);

create index if not exists cuenta_restaurantes_restaurante_idx
  on public.cuenta_restaurantes(restaurant_id);

create table if not exists public.cuenta_puentes (
  id            uuid        primary key default gen_random_uuid(),
  codigo_hash   text        not null unique,
  auth_user_id  uuid        not null references auth.users(id) on delete cascade,
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  vuelta        text        not null default '/'
                check (vuelta like '/%' and vuelta not like '//%' and length(vuelta) <= 512),
  creado_at     timestamptz not null default now(),
  vence_at      timestamptz not null default (now() + interval '60 seconds'),
  usado_at      timestamptz
);

create index if not exists cuenta_puentes_vence_idx
  on public.cuenta_puentes(vence_at);

alter table public.cuenta_restaurantes enable row level security;
alter table public.cuenta_puentes      enable row level security;
revoke all on public.cuenta_restaurantes from anon, authenticated;
revoke all on public.cuenta_puentes      from anon, authenticated;

-- Regla restrictiva del segundo factor del Super Admin (migración 137; la
-- exige scripts/audit-rls-candados.mjs). Sin políticas permisivas no abre
-- nada: deja las tablas al nivel de las demás si mañana se les agrega una.
do $$
declare
  t text;
begin
  foreach t in array array['cuenta_restaurantes', 'cuenta_puentes'] loop
    execute format('drop policy if exists %I on public.%I', 'super_admin_segundo_factor', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.leogin_sesion_con_segundo_factor()))
         with check ((select public.leogin_sesion_con_segundo_factor()))',
      'super_admin_segundo_factor', t);
  end loop;
end;
$$;

comment on table public.cuenta_restaurantes is
  'Restaurantes a los que se unió cada cuenta Leogin (permiso del comensal para el puente de sesión). Solo servidor.';
comment on table public.cuenta_puentes is
  'Códigos de un solo uso del puente de sesión billetera → restaurante. Se guarda el hash; vencen a los 60 s. Solo servidor.';

-- ── Limpieza de códigos vencidos ─────────────────────────────
create or replace function public.cuenta_puentes_limpiar()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.cuenta_puentes where vence_at < now() - interval '1 day';
$$;

revoke execute on function public.cuenta_puentes_limpiar() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-cuenta-puentes') then
        perform cron.unschedule('leogin-cuenta-puentes');
      end if;
      perform cron.schedule('leogin-cuenta-puentes', '17 4 * * *', 'select public.cuenta_puentes_limpiar();');
      raise notice 'pg_cron: job "leogin-cuenta-puentes" programado (diario).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actívalo y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: los códigos vencidos se quedan (no sirven para nada, solo ocupan).';
  end if;
end $$;
