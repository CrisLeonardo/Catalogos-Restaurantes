begin;

create table public.servicio_preferencias (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tipo text not null check (tipo in ('favoritos', 'alias')),
  clave text not null,
  valor jsonb not null,
  primary key (restaurant_id, tipo, clave),
  check (
    (tipo = 'favoritos' and clave in ('dueno','equipo','mesero')
      and jsonb_typeof(valor) = 'array' and jsonb_array_length(valor) <= 9)
    or (tipo = 'alias' and jsonb_typeof(valor) = 'string')
  )
);
alter table public.servicio_preferencias enable row level security;
create policy super_admin_segundo_factor on public.servicio_preferencias
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.servicio_preferencias from public, anon, authenticated, service_role;
grant select, insert, update on public.servicio_preferencias to service_role;

commit;
