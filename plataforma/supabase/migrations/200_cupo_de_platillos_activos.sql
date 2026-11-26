-- 200 · Cupo de platillos activos en Básico y En línea.
-- Aplicar antes del código. Los platillos ya activos quedan como están.
create or replace function public.leogin_validar_cupo_del_catalogo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  plan text;
begin
  if new.is_active is not true then return new; end if;
  if tg_op = 'UPDATE' and old.is_active is true and old.restaurant_id = new.restaurant_id then
    return new;
  end if;

  -- Una publicación a la vez por local, incluido publicar un lote.
  select plan_actual into plan from restaurants where id = new.restaurant_id for no key update;
  if plan in ('BASICO','EN_LINEA') and (
    select count(*) from products where restaurant_id = new.restaurant_id and is_active is true
  ) >= 150 then
    raise exception 'Llegaste al límite de 150 platillos activos. Oculta un platillo o cambia de plan para publicar más.'
      using errcode = 'LGD02';
  end if;
  return new;
end;
$$;

revoke execute on function public.leogin_validar_cupo_del_catalogo() from public, anon, authenticated;

drop trigger if exists leogin_validar_cupo_del_catalogo on public.products;
create trigger leogin_validar_cupo_del_catalogo
before insert or update of is_active, restaurant_id on public.products
for each row execute function public.leogin_validar_cupo_del_catalogo();
