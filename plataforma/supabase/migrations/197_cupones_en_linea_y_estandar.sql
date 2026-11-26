-- 197 · Cupones en En línea y Estándar
-- Aplicar antes del despliegue. Respeta los ajustes de activación del dueño.

create or replace function public.leogin_module_included_in_plan(p_plan text, p_key text)
returns boolean
language sql immutable
as $$
  select case
    when p_plan = 'PRO' then true
    when p_plan = 'PREMIUM' then
      p_key in ('llamada_mesero','encuestas','cupones','loyalty','recetas','reservaciones','lista_espera')
    when p_plan in ('EN_LINEA', 'ESTANDAR') then p_key = 'cupones'
    else false
  end;
$$;

update public.restaurants
   set modules = coalesce(modules, '{}'::jsonb) || '{"cupones":true}'::jsonb
 where plan_actual in ('EN_LINEA', 'ESTANDAR')
   and modules->'cupones' is distinct from 'true'::jsonb;

-- Protege el cambio de plan y la aplicación del cupón dentro de la
-- transacción del pedido. Las anulaciones aún pueden devolver usos.
create or replace function public.leogin_validar_plan_del_cupon()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  local restaurants%rowtype;
  aplica boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.uses < old.uses and new.min_order is not distinct from old.min_order
       and new.max_uses is not distinct from old.max_uses
       and new.is_active is not distinct from old.is_active then
      return new;
    end if;
    aplica := new.uses > old.uses;
  end if;

  select * into local from restaurants where id = new.restaurant_id for share;
  if not found then
    raise exception 'Restaurante no disponible.' using errcode = '23503';
  end if;

  if not (leogin_module_included_in_plan(local.plan_actual, 'cupones')
          or coalesce(local.modules->'cupones' = 'true'::jsonb, false))
     or local.module_settings #> '{cupones,enabled}' = 'false'::jsonb
     or (aplica and local.plan_actual = 'BASICO'
         and not coalesce(local.modules->'orders' = 'true'::jsonb, false)) then
    raise exception 'El cupón ya no está disponible.' using errcode = 'LGC01';
  end if;

  if local.plan_actual not in ('PREMIUM','PRO') then
    if tg_op = 'INSERT' and (new.min_order is not null or new.max_uses is not null) then
      raise exception 'La compra mínima y el límite de usos se configuran con Premium.' using errcode = '23514';
    elsif tg_op = 'UPDATE' and (
      (new.min_order is not null and new.min_order is distinct from old.min_order)
      or (new.max_uses is not null and new.max_uses is distinct from old.max_uses)
    ) then
      raise exception 'La compra mínima y el límite de usos se configuran con Premium.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.leogin_validar_plan_del_cupon() from public, anon, authenticated;

drop trigger if exists leogin_validar_plan_del_cupon on public.coupons;
create trigger leogin_validar_plan_del_cupon
before insert or update of min_order, max_uses, uses, is_active on public.coupons
for each row
execute function public.leogin_validar_plan_del_cupon();
