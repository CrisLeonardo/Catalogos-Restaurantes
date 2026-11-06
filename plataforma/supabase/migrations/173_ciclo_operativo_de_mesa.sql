begin;

alter table public.table_sessions
  add column limpieza_desde timestamptz,
  add column limpieza_cuenta text;

alter publication supabase_realtime add table public.table_sessions, public.order_payments;

-- Los recibos siguen a los pedidos al trasladar una cuenta. La identidad del intento conserva la mesa original.
create or replace function public.leogin_contexto_pago_mesa(p_restaurant uuid, p_mesa integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_contexto jsonb; v_cuenta text; v_pedidos uuid[]; v_saldo numeric;
  v_historial jsonb; v_recibos jsonb; v_reparto jsonb; v_saldada boolean;
begin
  -- Esta lectura toma el mismo bloqueo de mesa y pedidos que 160–165.
  v_contexto := public.leogin_saldos_platos_mesa(p_restaurant,p_mesa);
  with cuentas as (
    select o.id,o.total,coalesce(sum(p.amount),0) as cobrado,
      coalesce(jsonb_agg(p.id order by p.id) filter(where p.id is not null),'[]') as movimientos
    from public.orders o left join public.order_payments p on p.order_id=o.id
    where o.restaurant_id=p_restaurant and o.table_number=p_mesa
      and o.order_type='DINE_IN' and o.status not in ('DELIVERED','CANCEL')
    group by o.id
  )
  select md5(coalesce(jsonb_agg(jsonb_build_array(id,total,cobrado,movimientos) order by id),'[]')::text),
    coalesce(array_agg(id order by id),'{}'),coalesce(sum(total-cobrado),0),
    count(*)>0 and coalesce(bool_and(total=cobrado),false)
  into v_cuenta,v_pedidos,v_saldo,v_saldada from cuentas;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.at desc,m.id desc),'[]') into v_historial from (
    select id,method,amount,kind,created_at as at,cash_received as "cashReceived"
    from public.order_payments where order_id=any(v_pedidos)
    order by created_at desc,id desc limit 80
  ) m;
  select coalesce(jsonb_agg(r.resultado || jsonb_build_object('at',r.created_at)
      order by r.created_at desc,r.intento_id desc),'[]') into v_recibos from (
    select intento_id,resultado,created_at from public.cobro_intentos
    where restaurant_id=p_restaurant and solicitud->>'modo'='abono'
      and resultado->'orderIds' ?| v_pedidos::text[]
    order by created_at desc,intento_id desc limit 80
  ) r;
  select jsonb_build_object('id',r.id,'partes',r.partes,'desactualizado',r.cuenta<>v_cuenta)
    into v_reparto from public.cobro_repartos_mesa r
    where r.restaurant_id=p_restaurant and r.table_number=p_mesa and r.pedidos && v_pedidos;
  return v_contexto || jsonb_build_object('cuenta',v_cuenta,'pedidos',v_pedidos,
    'saldo',v_saldo,'saldada',v_saldada,'reparto',v_reparto,'historial',v_historial,'recibos',v_recibos);
end $$;

-- Protege también las entradas de QR y las escrituras desde el hub.
create function public.leogin_proteger_mesa_en_limpieza()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_type <> 'DINE_IN' or new.table_number is null
      or new.status in ('DELIVERED','CANCEL') then return new; end if;
  if tg_op = 'UPDATE' and old.order_type = new.order_type
      and old.restaurant_id = new.restaurant_id and old.table_number = new.table_number
      and old.status not in ('DELIVERED','CANCEL') and old.total is not distinct from new.total then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cobro/' || new.restaurant_id::text || '/' || new.table_number::text, 0));
  if exists(select 1 from public.table_sessions where restaurant_id = new.restaurant_id
      and table_number = new.table_number and closed_at is null and limpieza_desde is not null) then
    raise exception 'La mesa está por limpiar. Confirma la limpieza antes de abrir otro pedido.' using errcode = 'LGD01';
  end if;
  return new;
end $$;

create trigger leogin_proteger_mesa_en_limpieza
  before insert or update of restaurant_id, table_number, order_type, status, total on public.orders
  for each row execute function public.leogin_proteger_mesa_en_limpieza();

create function public.leogin_proteger_ocupacion_de_mesa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Una sesión de tipo order acompaña al grupo que ya hizo un pedido.
  if new.source = 'order' or new.closed_at is not null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cobro/' || new.restaurant_id::text || '/' || new.table_number::text, 0));
  if exists(select 1 from public.orders where restaurant_id = new.restaurant_id
      and table_number = new.table_number and order_type = 'DINE_IN' and status not in ('DELIVERED','CANCEL')) then
    raise exception 'La mesa ya tiene un grupo con pedidos.' using errcode = 'LGD01';
  end if;
  return new;
end $$;

create trigger leogin_proteger_ocupacion_de_mesa
  before insert on public.table_sessions for each row execute function public.leogin_proteger_ocupacion_de_mesa();

-- Las rutas de cierre anteriores nunca se saltan la limpieza de un turno.
create function public.leogin_exigir_limpieza_de_mesa()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon','authenticated') and old.limpieza_desde is not null and old.closed_at is null then
      raise exception 'Confirma la limpieza desde el salón.' using errcode = '42501';
    end if;
    return old;
  end if;
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' and (new.limpieza_desde is not null or new.limpieza_cuenta is not null) then
      raise exception 'Registra la limpieza desde el salón.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (old.limpieza_desde is distinct from new.limpieza_desde
        or old.limpieza_cuenta is distinct from new.limpieza_cuenta
        or (old.limpieza_desde is not null and
          (old.restaurant_id is distinct from new.restaurant_id or old.table_number is distinct from new.table_number))) then
      raise exception 'Registra la limpieza desde el salón.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then return new; end if;
  if old.closed_at is null and new.closed_at is not null and old.limpieza_desde is not null then
    raise exception 'Confirma la limpieza para liberar esta mesa.' using errcode = 'LGD01';
  end if;
  return new;
end $$;

create trigger leogin_exigir_limpieza_de_mesa
  before insert or update or delete on public.table_sessions
  for each row execute function public.leogin_exigir_limpieza_de_mesa();

create function public.leogin_transicion_mesa(
  p_restaurant uuid, p_mesa integer, p_turno uuid, p_cuenta text, p_accion text, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_turno public.table_sessions%rowtype;
  v_ctx jsonb;
  v_pedidos uuid[];
begin
  if p_actor is null or p_accion is null or p_accion not in ('limpiar','liberar','reabrir','sin_cobro')
      or p_cuenta is null then
    raise exception 'Transición de mesa inválida.' using errcode = '22023';
  end if;
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  select * into v_turno from public.table_sessions where restaurant_id = p_restaurant
    and table_number = p_mesa and closed_at is null for update;
  if v_turno.id is distinct from p_turno then
    raise exception 'La ocupación de la mesa cambió. Actualiza el salón.' using errcode = 'LGD01';
  end if;
  v_ctx := public.leogin_contexto_pago_mesa(p_restaurant,p_mesa);
  if p_cuenta is distinct from v_ctx->>'cuenta' then
    raise exception 'La cuenta cambió. Revisa el saldo de la mesa.' using errcode = 'LGD01';
  end if;
  select coalesce(array_agg(value::uuid),'{}') into v_pedidos from jsonb_array_elements_text(v_ctx->'pedidos');

  if p_accion in ('limpiar','sin_cobro') then
    if v_turno.limpieza_desde is not null then
      raise exception 'La mesa ya está por limpiar.' using errcode = 'LGD01';
    end if;
    if v_turno.id is null and cardinality(v_pedidos) = 0 then
      raise exception 'La mesa ya está libre.' using errcode = 'LGD01';
    end if;
    if exists (select 1 from public.orders where id = any(v_pedidos) and status <> 'SERVED') then
      raise exception 'Quedan pedidos por entregar.' using errcode = 'LGD01';
    end if;
    if p_accion = 'limpiar' and cardinality(v_pedidos) > 0
        and (v_ctx->>'saldada')::boolean is distinct from true then
      raise exception 'La mesa tiene saldo pendiente.' using errcode = 'LGD01';
    end if;
    if p_accion = 'sin_cobro' and (v_ctx->>'saldo')::numeric <= 0 then
      raise exception 'Esta cuenta no tiene saldo pendiente.' using errcode = 'LGD01';
    end if;
    if v_turno.id is null then
      insert into public.table_sessions (restaurant_id,table_number,source,seated_by,limpieza_desde,limpieza_cuenta)
      values (p_restaurant,p_mesa,'order',p_actor,clock_timestamp(),p_cuenta) returning * into v_turno;
    else
      update public.table_sessions set limpieza_desde = clock_timestamp(), limpieza_cuenta = p_cuenta
        where id = v_turno.id;
    end if;
  else
    if v_turno.limpieza_desde is null then
      raise exception 'La mesa ya no está por limpiar.' using errcode = 'LGD01';
    end if;
    if p_accion = 'liberar' and (p_cuenta is distinct from v_turno.limpieza_cuenta
        or exists (select 1 from public.orders where id = any(v_pedidos) and status <> 'SERVED')) then
      raise exception 'La cuenta o la entrega cambió. Reabre la mesa para revisarla.' using errcode = 'LGD01';
    end if;
    update public.table_sessions set limpieza_desde = null, limpieza_cuenta = null where id = v_turno.id;
    if p_accion = 'liberar' then
      perform public.leogin_confirmar_cierre_mesa(p_restaurant,p_mesa,v_pedidos,'[]',p_actor);
    end if;
  end if;

  insert into public.activity_log (restaurant_id,actor_id,action,entity,meta)
  values (p_restaurant,p_actor,'mesa',p_mesa::text,jsonb_build_object(
    'transicion',p_accion,'turno',v_turno.id,'pedidos',v_pedidos,'saldo',(v_ctx->>'saldo')::numeric));
  return jsonb_build_object('orderIds',v_pedidos,'saldada',(v_ctx->>'saldada')::boolean);
end $$;

revoke all on function public.leogin_proteger_mesa_en_limpieza(),
  public.leogin_proteger_ocupacion_de_mesa(),
  public.leogin_exigir_limpieza_de_mesa(),
  public.leogin_transicion_mesa(uuid,integer,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.leogin_transicion_mesa(uuid,integer,uuid,text,text,uuid) to service_role;

create function public.leogin_trasladar_mesa(
  p_restaurant uuid, p_origen integer, p_destino integer, p_unir boolean, p_actor uuid
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_origen public.table_sessions%rowtype;
  v_destino public.table_sessions%rowtype;
  v_pedidos uuid[];
  v_destino_ocupado boolean;
begin
  if p_actor is null or p_unir is null or p_origen not between 1 and 999
      or p_destino not between 1 and 999 or p_origen = p_destino then
    raise exception 'Traslado inválido.' using errcode = '22023';
  end if;
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,least(p_origen,p_destino));
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,greatest(p_origen,p_destino));
  select * into v_origen from public.table_sessions where restaurant_id = p_restaurant
    and table_number = p_origen and closed_at is null for update;
  select * into v_destino from public.table_sessions where restaurant_id = p_restaurant
    and table_number = p_destino and closed_at is null for update;
  if v_origen.limpieza_desde is not null or v_destino.limpieza_desde is not null then
    raise exception 'Una de las mesas está por limpiar.' using errcode = 'LGD01';
  end if;
  select coalesce(array_agg(id),'{}') into v_pedidos from public.orders where restaurant_id = p_restaurant
    and table_number = p_origen and order_type = 'DINE_IN' and status not in ('DELIVERED','CANCEL');
  v_destino_ocupado := v_destino.id is not null or exists(select 1 from public.orders
    where restaurant_id = p_restaurant and table_number = p_destino
      and order_type = 'DINE_IN' and status not in ('DELIVERED','CANCEL'));
  if (v_origen.id is null and cardinality(v_pedidos) = 0) or p_unir <> v_destino_ocupado then
    raise exception 'La ocupación cambió. Revisa el origen y el destino.' using errcode = 'LGD01';
  end if;
  if p_unir and (v_origen.source in ('reservation','waitlist') and v_destino.source in ('reservation','waitlist')) then
    raise exception 'Las dos mesas tienen grupos vinculados en recepción. Trasládalas por separado.' using errcode = 'LGD01';
  end if;
  -- Unir no puede descartar repartos vigentes de ninguna de las dos cuentas.
  if p_unir and (exists(select 1 from public.table_splits where restaurant_id = p_restaurant
      and table_number in (p_origen,p_destino)) or exists(select 1 from public.cobro_repartos_mesa r
      join public.orders o on o.id = any(r.pedidos) where r.restaurant_id = p_restaurant
        and r.table_number in (p_origen,p_destino) and o.status not in ('DELIVERED','CANCEL'))) then
    raise exception 'Hay un reparto abierto. Revisa las cuentas antes de unirlas.' using errcode = 'LGD01';
  end if;

  update public.orders set table_number = p_destino, address = 'Mesa ' || p_destino
    where id = any(v_pedidos);
  update public.waiter_calls set table_number = p_destino
    where restaurant_id = p_restaurant and table_number = p_origen and resolved_at is null;
  if v_destino.id is null then
    update public.table_sessions set table_number = p_destino where id = v_origen.id;
  elsif v_origen.id is not null then
    update public.table_sessions set closed_at = clock_timestamp() where id = v_origen.id;
    update public.table_sessions set
      party_size = nullif(least(100,coalesce(v_destino.party_size,0)+coalesce(v_origen.party_size,0)),0),
      waiter_id = coalesce(v_destino.waiter_id,v_origen.waiter_id),
      allergies = nullif(concat_ws(', ',v_destino.allergies,v_origen.allergies),''),
      source = case when v_origen.source in ('reservation','waitlist') then v_origen.source else v_destino.source end,
      origin_id = coalesce(v_origen.origin_id,v_destino.origin_id)
    where id = v_destino.id;
  end if;
  update public.reservations set table_number = p_destino where restaurant_id = p_restaurant
    and id = v_origen.origin_id and v_origen.source = 'reservation';
  update public.waitlist_entries set table_number = p_destino where restaurant_id = p_restaurant
    and id = v_origen.origin_id and v_origen.source = 'waitlist';
  if not p_unir then
    delete from public.table_splits where restaurant_id = p_restaurant and table_number = p_destino;
    update public.table_splits set table_number = p_destino where restaurant_id = p_restaurant and table_number = p_origen;
    if exists(select 1 from public.cobro_repartos_mesa where restaurant_id = p_restaurant
        and table_number = p_origen and pedidos && v_pedidos) then
      -- El borrador histórico de una cuenta cerrada no pertenece al nuevo grupo.
      delete from public.cobro_repartos_mesa where restaurant_id = p_restaurant and table_number = p_destino;
      update public.cobro_repartos_mesa set table_number = p_destino where restaurant_id = p_restaurant and table_number = p_origen;
    end if;
  end if;
  insert into public.activity_log (restaurant_id,actor_id,action,entity,meta)
  values (p_restaurant,p_actor,'mesa',p_origen::text,jsonb_build_object(
    'traslado',p_destino,'union',p_unir,'pedidos',v_pedidos,'origen',v_origen.id,'destino',v_destino.id));
  return cardinality(v_pedidos);
end $$;

-- Sentar el grupo y actualizar la recepción forman una sola operación.
create function public.leogin_sentar_desde_recepcion(
  p_restaurant uuid, p_mesa integer, p_origen uuid, p_fuente text, p_capacidad integer, p_actor uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_pax integer; v_status text; v_mesa integer; v_nombre text;
begin
  if p_actor is null or p_origen is null or p_mesa not between 1 and 999
      or p_fuente is null or p_fuente not in ('reservation','waitlist') then
    raise exception 'Grupo o mesa inválidos.' using errcode = '22023';
  end if;
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  if p_fuente = 'reservation' then
    select party_size,status,table_number,customer_name into v_pax,v_status,v_mesa,v_nombre
      from public.reservations where restaurant_id = p_restaurant and id = p_origen for update;
  else
    select party_size,status,table_number,customer_name into v_pax,v_status,v_mesa,v_nombre
      from public.waitlist_entries where restaurant_id = p_restaurant and id = p_origen for update;
  end if;
  if v_status = 'SEATED' and v_mesa = p_mesa and exists(select 1 from public.table_sessions
      where restaurant_id = p_restaurant and table_number = p_mesa and closed_at is null
        and origin_id = p_origen and source = p_fuente) then return; end if;
  if v_status is null or (p_fuente = 'reservation' and v_status <> 'CONFIRMED')
      or (p_fuente = 'waitlist' and v_status not in ('WAITING','NOTIFIED')) then
    raise exception 'El estado del grupo cambió. Actualiza la recepción.' using errcode = 'LGD01';
  end if;
  if p_capacidad is not null and v_pax > p_capacidad then
    raise exception 'La mesa no tiene capacidad para este grupo.' using errcode = 'LGD01';
  end if;
  if exists(select 1 from public.table_sessions where restaurant_id = p_restaurant and table_number = p_mesa
      and closed_at is null) or exists(select 1 from public.orders where restaurant_id = p_restaurant
        and table_number = p_mesa and order_type = 'DINE_IN' and status not in ('DELIVERED','CANCEL')) then
    raise exception 'La mesa ya está ocupada o por limpiar. Elige otra.' using errcode = 'LGD01';
  end if;
  insert into public.table_sessions (restaurant_id,table_number,party_size,source,origin_id,seated_by,note)
    values (p_restaurant,p_mesa,v_pax,p_fuente,p_origen,p_actor,left(v_nombre,40));
  if p_fuente = 'reservation' then
    update public.reservations set status = 'SEATED', table_number = p_mesa, updated_at = clock_timestamp()
      where restaurant_id = p_restaurant and id = p_origen;
  else
    update public.waitlist_entries set status = 'SEATED', table_number = p_mesa, seated_at = clock_timestamp()
      where restaurant_id = p_restaurant and id = p_origen;
  end if;
  insert into public.activity_log (restaurant_id,actor_id,action,entity,meta)
    values (p_restaurant,p_actor,'mesa',p_mesa::text,jsonb_build_object('sentar',true,'source',p_fuente,'origen',p_origen,'pax',v_pax));
exception when unique_violation then
  raise exception 'La mesa ya está ocupada o por limpiar. Elige otra.' using errcode = 'LGD01';
end $$;

-- La previsión queda en Reservas. Solo la llegada abre un turno físico.
create function public.leogin_prever_mesa_de_reserva(
  p_restaurant uuid, p_reserva uuid, p_mesa integer, p_capacidad integer
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_reserva public.reservations%rowtype;
begin
  if p_mesa is not null then perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa); end if;
  select * into v_reserva from public.reservations where restaurant_id = p_restaurant
    and id = p_reserva and status = 'CONFIRMED' for update;
  if v_reserva.id is null then
    raise exception 'La reserva ya no está confirmada.' using errcode = 'LGD01';
  end if;
  if p_capacidad is not null and v_reserva.party_size > p_capacidad then
    raise exception 'La mesa no tiene capacidad para esta reserva.' using errcode = 'LGD01';
  end if;
  if exists(select 1 from public.reservations where restaurant_id = p_restaurant and table_number = p_mesa
      and date = v_reserva.date and time = v_reserva.time and status = 'CONFIRMED' and id <> p_reserva) then
    raise exception 'Otra reserva tiene esta mesa a la misma hora.' using errcode = 'LGD01';
  end if;
  update public.reservations set table_number = p_mesa, updated_at = clock_timestamp() where id = p_reserva;
end $$;

revoke all on function public.leogin_trasladar_mesa(uuid,integer,integer,boolean,uuid),
  public.leogin_sentar_desde_recepcion(uuid,integer,uuid,text,integer,uuid),
  public.leogin_prever_mesa_de_reserva(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.leogin_trasladar_mesa(uuid,integer,integer,boolean,uuid),
  public.leogin_sentar_desde_recepcion(uuid,integer,uuid,text,integer,uuid),
  public.leogin_prever_mesa_de_reserva(uuid,uuid,integer,integer) to service_role;
grant delete on public.cobro_repartos_mesa to service_role;

create or replace function public.leogin_archive_abandoned_orders(p_restaurant_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; r record;
begin
  for r in
    select o.id from public.orders o
    where o.order_type = 'DINE_IN' and o.status not in ('CANCEL','DELIVERED')
      and o.created_at < now() - interval '24 hours'
      and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
      and not exists(select 1 from public.order_payments p where p.order_id = o.id)
      and not exists(select 1 from public.table_sessions t where t.restaurant_id = o.restaurant_id
        and t.table_number = o.table_number and t.closed_at is null and t.limpieza_desde is not null)
    for update skip locked
  loop
    -- La cuenta pudo cobrar mientras el archivador esperaba su fila.
    if exists(select 1 from public.order_payments p where p.order_id = r.id) then continue; end if;
    perform public.restock_order(r.id);
    update public.orders set status = 'CANCEL', cancelled_at = now(), auto_archived_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  update public.table_sessions t set closed_at = now()
    where t.closed_at is null and t.limpieza_desde is null and t.seated_at < now() - interval '24 hours'
      and (p_restaurant_id is null or t.restaurant_id = p_restaurant_id)
      and not exists(select 1 from public.orders o where o.restaurant_id = t.restaurant_id
        and o.table_number = t.table_number and o.order_type = 'DINE_IN' and o.status not in ('CANCEL','DELIVERED'));
  return v_count;
end $$;

commit;
