-- ============================================================
--  138 · Salud de los clientes para el Super Admin (MON-03/04)
--  ------------------------------------------------------------
--  PLAN_ACCESO_Y_MONITOREO_2026-10-08. «Requiere tu atención» del Super
--  Admin solo avisaba de COBRO (vencidos, prueba por vencer, sin tarifa).
--  Con pocos clientes, lo que más protege los ingresos es enterarse a tiempo
--  de los que se están yendo o se trabaron. Estas dos funciones devuelven,
--  en UNA consulta cada una, lo que hace falta para decidirlo (la decisión
--  vive en TypeScript, lib/client-health.ts, con pruebas):
--
--    · leogin_salud_restaurantes(): por restaurante activo — último pedido,
--      platillos, estado de la PC principal, impresiones fallidas en 24 h,
--      horario (para no avisar de la PC a las 3 de la mañana).
--    · leogin_cuentas_sin_restaurante(horas): cuentas que se registraron y
--      no crearon su restaurante (el alta está partida desde el 2026-08-20:
--      /registro crea la cuenta y /mi-cuenta/nuevo el restaurante). Una
--      cuenta así es INVISIBLE en el resto del Super Admin.
--
--  Y dos tablas para el aviso al celular (MON-04):
--    · super_push_subscriptions: los celulares del Super Admin que pidieron
--      avisos (las de los restaurantes viven en push_subscriptions, atadas a
--      un restaurante; estas no).
--    · super_alertas_enviadas: qué aviso se mandó y cuándo, para no repetir
--      el mismo cada hora.
--
--  Todo es SOLO para el cliente de servicio: las funciones son security
--  definer (leen auth.users) y se cierran a anon/authenticated
--  (scripts/audit-security-definer.mjs); las tablas tienen RLS sin reglas.
--
--  Idempotente. Ejecutar DESPUÉS de 001..137.
-- ============================================================

create or replace function public.leogin_salud_restaurantes()
returns table (
  restaurant_id uuid,
  nombre text,
  creado_en timestamptz,
  pedidos_activos boolean,
  ultimo_pedido_en timestamptz,
  platillos integer,
  pc_activa boolean,
  pc_visto_en timestamptz,
  impresiones_fallidas_24h integer,
  horario jsonb,
  excepciones jsonb,
  zona_horaria text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.name,
    r.created_at,
    coalesce((r.modules ->> 'orders')::boolean, false),
    (select max(o.created_at) from orders o where o.restaurant_id = r.id),
    (select count(*)::int from products p where p.restaurant_id = r.id),
    a.is_active,
    a.last_seen_at,
    (select count(*)::int from print_jobs j
      where j.restaurant_id = r.id
        and j.status = 'failed'
        and j.updated_at > now() - interval '24 hours'),
    r.hours,
    r.hour_exceptions,
    r.timezone
  from restaurants r
  left join print_agents a on a.restaurant_id = r.id
  where r.status = 'active';
$$;

create or replace function public.leogin_cuentas_sin_restaurante(p_horas integer default 48)
returns table (user_id uuid, email text, nombre text, creada_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, p.full_name, u.created_at
    from profiles p
    join auth.users u on u.id = p.id
   where p.role = 'RESTAURANT_OWNER'
     and p.restaurant_id is null
     and p.organization_id is null
     and not exists (
       select 1 from restaurant_members m
        where m.user_id = p.id and m.status = 'active'
     )
     and u.created_at < now() - make_interval(hours => p_horas)
     -- Pasado un mes ya no es «se trabó en el alta»: es una cuenta que no
     -- va a volver, y avisar cada día de ella sería ruido.
     and u.created_at > now() - interval '30 days'
   order by u.created_at desc;
$$;

revoke execute on function public.leogin_salud_restaurantes() from public, anon, authenticated;
revoke execute on function public.leogin_cuentas_sin_restaurante(integer) from public, anon, authenticated;
grant execute on function public.leogin_salud_restaurantes() to service_role;
grant execute on function public.leogin_cuentas_sin_restaurante(integer) to service_role;

create table if not exists public.super_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.super_push_subscriptions enable row level security;

create table if not exists public.super_alertas_enviadas (
  clave      text primary key,
  enviada_en timestamptz not null default now()
);
alter table public.super_alertas_enviadas enable row level security;

-- Las dos tablas nuevas también llevan el candado de la 137 (sin reglas
-- permisivas ya no se pueden leer con sesión; esto es por consistencia, y
-- para que la auditoría ACC-11 no las cuente como olvidadas).
do $$
declare
  t text;
begin
  foreach t in array array['super_push_subscriptions', 'super_alertas_enviadas'] loop
    execute format('drop policy if exists %I on public.%I', 'super_admin_segundo_factor', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.leogin_sesion_con_segundo_factor()))
         with check ((select public.leogin_sesion_con_segundo_factor()))',
      'super_admin_segundo_factor', t);
  end loop;
end;
$$;
