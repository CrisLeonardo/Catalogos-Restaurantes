-- 204 · Recordatorios de prueba con una reserva temporal por envío.
-- Aplicar antes de desplegar el endpoint que ejecuta el reloj de salud.
create table public.prueba_aviso_envios (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tipo text not null check (tipo in ('previo','vence')),
  reservado_hasta timestamptz not null,
  enviado_en timestamptz,
  primary key (restaurant_id, tipo)
);
alter table public.prueba_aviso_envios enable row level security;
revoke all on public.prueba_aviso_envios from anon, authenticated;
grant select, update on public.prueba_aviso_envios to service_role;

create or replace function public.leogin_tomar_avisos_de_prueba()
returns table (restaurante uuid, tipo text, correo text, nombre text, slug text,
               vence timestamptz, confirmado boolean, reserva timestamptz)
language sql security definer set search_path = public
as $$
  with candidatos as (
    select r.id, r.name, r.slug, u.email, b.trial_ends_at,
           b.trial_confirmed_at is not null as confirmado,
           case when b.trial_ends_at > now() then 'previo' else 'vence' end as tipo
      from restaurant_billing b
      join restaurants r on r.id = b.restaurant_id
      join auth.users u on u.id = b.trial_started_by
     where b.trial_started_at is not null
       and b.trial_ends_at <= now() + interval '3 days'
       and b.trial_ends_at > now() - interval '24 hours'
       and u.email is not null
  ), nuevos as (
    select c.*
      from candidatos c
      left join prueba_aviso_envios e on e.restaurant_id = c.id and e.tipo = c.tipo
     where e.enviado_en is null and coalesce(e.reservado_hasta, '-infinity'::timestamptz) <= now()
     order by c.trial_ends_at
     limit 6
  ), reservados as (
    insert into prueba_aviso_envios as e (restaurant_id, tipo, reservado_hasta)
      select id, n.tipo, now() + interval '15 minutes' from nuevos n
    on conflict on constraint prueba_aviso_envios_pkey
    do update set reservado_hasta = excluded.reservado_hasta
      where e.enviado_en is null and e.reservado_hasta <= now()
    returning e.restaurant_id, e.tipo, e.reservado_hasta
  )
  select n.id, n.tipo, n.email, n.name, n.slug, n.trial_ends_at, n.confirmado, e.reservado_hasta
    from nuevos n join reservados e on e.restaurant_id = n.id and e.tipo = n.tipo;
$$;

revoke execute on function public.leogin_tomar_avisos_de_prueba() from public, anon, authenticated;
grant execute on function public.leogin_tomar_avisos_de_prueba() to service_role;
