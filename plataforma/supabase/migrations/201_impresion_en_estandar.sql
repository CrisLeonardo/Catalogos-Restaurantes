-- 201 · Una estación de impresión nueva por local Estándar.
-- Los destinos ya configurados se pueden seguir usando y editando.
-- Aplicar antes de desplegar el catálogo que anuncia esta modalidad.
create or replace function public.leogin_validar_cupo_de_estaciones()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  plan text;
begin
  if tg_op = 'UPDATE' and old.restaurant_id = new.restaurant_id then return new; end if;
  select plan_actual into plan from restaurants where id = new.restaurant_id for no key update;
  if plan = 'ESTANDAR' and exists (
    select 1 from print_stations where restaurant_id = new.restaurant_id
  ) then
    raise exception 'Estándar incluye una impresora de comandas. Puedes cambiar su destino en la estación actual.'
      using errcode = 'LGP02';
  end if;
  return new;
end;
$$;

revoke execute on function public.leogin_validar_cupo_de_estaciones() from public, anon, authenticated;

drop trigger if exists leogin_validar_cupo_de_estaciones on public.print_stations;
create trigger leogin_validar_cupo_de_estaciones
before insert or update of restaurant_id on public.print_stations
for each row execute function public.leogin_validar_cupo_de_estaciones();
