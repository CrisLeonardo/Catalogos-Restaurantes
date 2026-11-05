-- 161 · Identidad durable y resultado original del cobro (auditoría 0.15).
-- DESPUÉS de la 160 y ANTES del código. Sin backfill ni cambios históricos.
begin;

create table public.cobro_intentos (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  intento_id uuid not null,
  table_number integer not null check (table_number > 0),
  operacion text not null check (operacion in ('parte','cierre')),
  actor_id uuid not null, -- conservar la identidad incluso si se elimina el usuario
  solicitud jsonb not null,
  resultado jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (restaurant_id, intento_id)
);
alter table public.cobro_intentos enable row level security;
revoke all on public.cobro_intentos from public, anon, authenticated, service_role;
grant select, insert on public.cobro_intentos to service_role;
comment on table public.cobro_intentos is
  'Solicitud y recibo inmutables del intento, confirmados junto con dinero/reparto/cierre. Sin caducidad: un reintento antiguo nunca es un cobro nuevo.';

-- El bloqueo por intento precede siempre al bloqueo de mesa de la 160.
-- También sirve para buscar ANTES de releer un cierre: la mesa puede tener
-- otra sesión o ronda y el resultado debe seguir siendo el original.
create function public.leogin_recuperar_intento_cobro(
  p_restaurant uuid, p_mesa integer, p_intento uuid, p_operacion text,
  p_solicitud jsonb, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_previo public.cobro_intentos%rowtype;
begin
  if p_restaurant is null or p_mesa is null or p_mesa < 1 or p_intento is null or p_actor is null
      or p_operacion is null or p_operacion not in ('parte','cierre')
      or jsonb_typeof(p_solicitud) is distinct from 'object' then
    raise exception 'Identidad de cobro inválida.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('intento-cobro/' || p_restaurant::text || '/' || p_intento::text,0));
  select * into v_previo from public.cobro_intentos where restaurant_id=p_restaurant and intento_id=p_intento;
  if found then
    if v_previo.table_number <> p_mesa or v_previo.operacion <> p_operacion
        or v_previo.actor_id <> p_actor or v_previo.solicitud <> p_solicitud then
      raise exception 'La identidad del intento ya corresponde a otro cobro. Recupera el intento original.' using errcode='LGD03';
    end if;
    return v_previo.resultado;
  end if;
  return null;
end $$;

create function public.leogin_cobrar_parte_mesa_idempotente(
  p_restaurant uuid, p_mesa integer, p_items uuid[], p_pagos jsonb, p_actor uuid, p_intento uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_solicitud jsonb; v_resultado jsonb;
begin
  v_solicitud := jsonb_build_object('items',p_items,'pagos',p_pagos);
  v_resultado := public.leogin_recuperar_intento_cobro(p_restaurant,p_mesa,p_intento,'parte',v_solicitud,p_actor);
  if v_resultado is not null then return v_resultado; end if;
  -- La 160 conserva íntegros su bloqueo, validación, reparto y atomicidad.
  v_resultado := public.leogin_cobrar_parte_mesa(p_restaurant,p_mesa,p_items,p_pagos,p_actor)
    || jsonb_build_object('intentoId',p_intento);
  insert into public.cobro_intentos values(p_restaurant,p_intento,p_mesa,'parte',p_actor,v_solicitud,v_resultado,clock_timestamp());
  return v_resultado;
end $$;

create function public.leogin_cerrar_mesa_idempotente(
  p_restaurant uuid, p_mesa integer, p_orders uuid[], p_filas jsonb, p_actor uuid,
  p_intento uuid, p_pagos jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_solicitud jsonb; v_resultado jsonb; v_anteriores uuid[]; v_orders uuid[];
begin
  if jsonb_typeof(p_pagos) is distinct from 'array' or jsonb_array_length(p_pagos)=0 then
    raise exception 'Falta cómo se pagó.' using errcode='22023';
  end if;
  v_solicitud := jsonb_build_object('pagos',p_pagos);
  v_resultado := public.leogin_recuperar_intento_cobro(p_restaurant,p_mesa,p_intento,'cierre',v_solicitud,p_actor);
  if v_resultado is not null then return v_resultado; end if;
  if coalesce(cardinality(p_orders),0)=0 or jsonb_array_length(p_filas)=0 then
    raise exception 'La cuenta cambió o ya se cobró. Actualiza la mesa.' using errcode='LGD01';
  end if;
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  select coalesce(array_agg(id),'{}') into v_anteriores from public.order_payments where order_id=any(p_orders);
  v_orders := public.leogin_confirmar_cierre_mesa(p_restaurant,p_mesa,p_orders,p_filas,p_actor);
  select jsonb_build_object('intentoId',p_intento,'orderIds',v_orders,
    'paymentIds',coalesce(jsonb_agg(id order by id),'[]'),'cobrado',coalesce(sum(amount),0))
    into v_resultado from public.order_payments where order_id=any(v_orders) and not(id=any(v_anteriores));
  insert into public.cobro_intentos values(p_restaurant,p_intento,p_mesa,'cierre',p_actor,v_solicitud,v_resultado,clock_timestamp());
  return v_resultado;
end $$;

revoke all on function public.leogin_recuperar_intento_cobro(uuid,integer,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.leogin_cobrar_parte_mesa_idempotente(uuid,integer,uuid[],jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leogin_cerrar_mesa_idempotente(uuid,integer,uuid[],jsonb,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.leogin_recuperar_intento_cobro(uuid,integer,uuid,text,jsonb,uuid) to service_role;
grant execute on function public.leogin_cobrar_parte_mesa_idempotente(uuid,integer,uuid[],jsonb,uuid,uuid) to service_role;
grant execute on function public.leogin_cerrar_mesa_idempotente(uuid,integer,uuid[],jsonb,uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
