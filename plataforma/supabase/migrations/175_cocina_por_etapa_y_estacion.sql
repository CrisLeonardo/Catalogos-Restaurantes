begin;

alter table public.order_items
  add column cocina_estacion_id uuid,
  add column cocina_alergenos text[],
  add column cocina_preparada_at timestamptz;

alter table public.orders
  add column cocina_salida_at timestamptz,
  add column cocina_anulacion_vista_at timestamptz;

-- Conserva el puesto de trabajo aunque cambie el mapa de impresión del local.
-- El mismo criterio de asignación que el papel, sin depender de si hay impresora.
create function public.leogin_ruta_cocina(p_restaurante uuid, p_producto uuid)
returns table(estacion uuid, alergenos text[])
language sql stable security invoker set search_path = '' as $$
  select coalesce(s.id, (
      select d.id from public.print_stations d where d.restaurant_id = p_restaurante
      order by d.is_default desc, d.sort_order, d.name, d.id limit 1
    )), array(select unnest(coalesce(p.dietary_tags,'{}'::text[])) intersect
      select unnest(array['contiene_gluten','contiene_lacteos','contiene_frutos_secos',
        'contiene_mariscos','contiene_huevo','contiene_soya']))
  from (select 1) seed
  left join public.products p on p.id = p_producto and p.restaurant_id = p_restaurante
  left join public.categories c on c.id = p.category_id and c.restaurant_id = p_restaurante
  left join public.print_stations s on s.id = coalesce(p.station_id,c.station_id) and s.restaurant_id = p_restaurante
$$;

create function public.leogin_fijar_ruta_cocina()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pedido record;
begin
  select restaurant_id, status, coalesce(ready_at,served_at,created_at) as lista
    into v_pedido from public.orders where id = new.order_id;
  select estacion, alergenos into new.cocina_estacion_id, new.cocina_alergenos
    from public.leogin_ruta_cocina(v_pedido.restaurant_id,new.product_id);
  new.cocina_preparada_at := case when v_pedido.status in ('READY','TRANSIT','SERVED','DELIVERED')
    then v_pedido.lista else null end;
  return new;
end $$;

create trigger leogin_fijar_ruta_cocina before insert on public.order_items
  for each row execute function public.leogin_fijar_ruta_cocina();

with rutas as (
  select i.id, r.estacion, r.alergenos, case when o.status = 'READY'
    then coalesce(o.ready_at,o.accepted_at,o.created_at) else i.served_at end as preparada
  from public.order_items i join public.orders o on o.id = i.order_id
  cross join lateral public.leogin_ruta_cocina(o.restaurant_id,i.product_id) r
  where o.status in ('NEW','PREP','READY')
)
update public.order_items i set cocina_estacion_id = r.estacion, cocina_alergenos = r.alergenos,
  cocina_preparada_at = r.preparada from rutas r where i.id = r.id;

-- Los clientes conservan sus permisos anteriores sobre pedidos y renglones.
-- Las nuevas marcas solo se escriben desde las transiciones de Cocina.
create function public.leogin_proteger_marcas_cocina()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    raise exception 'Usa la acción de Cocina para actualizar sus marcas.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger leogin_proteger_marcas_cocina before update of cocina_salida_at,cocina_anulacion_vista_at
  on public.orders for each row execute function public.leogin_proteger_marcas_cocina();
create trigger leogin_proteger_marcas_cocina before update of cocina_estacion_id,cocina_alergenos,cocina_preparada_at
  on public.order_items for each row execute function public.leogin_proteger_marcas_cocina();

-- Incluye rondas que ya salieron de la pantalla, dentro de la misma ocupación.
create function public.leogin_rondas_cocina(p_restaurante uuid, p_pedidos uuid[])
returns table(pedido uuid, ronda int)
language sql stable security invoker set search_path = '' as $$
  select o.id, (
    select count(*)::int from public.orders anterior
    where anterior.restaurant_id = o.restaurant_id and anterior.table_number = o.table_number
      and anterior.order_type = 'DINE_IN' and anterior.created_at >= t.seated_at
      and (anterior.created_at,anterior.id) <= (o.created_at,o.id)
  )
  from public.orders o
  join lateral (
    select s.seated_at from public.table_sessions s
    where s.restaurant_id = o.restaurant_id and s.table_number = o.table_number
      and s.seated_at <= o.created_at and (s.closed_at is null or s.closed_at >= o.created_at)
    order by s.seated_at desc limit 1
  ) t on true
  where o.restaurant_id = p_restaurante and o.id = any(p_pedidos) and o.order_type = 'DINE_IN'
$$;

-- Una cantidad anulada ya no participa en el pase.
create function public.leogin_lineas_vivas_cocina(p_pedido uuid)
returns table(id uuid, estacion uuid, preparada timestamptz, servida timestamptz)
language sql stable security invoker set search_path = '' as $$
  select i.id,i.cocina_estacion_id,i.cocina_preparada_at,i.served_at
  from public.order_items i
  where i.order_id = p_pedido and i.quantity > coalesce((
    select sum(v.quantity) from public.order_voids v where v.order_id = p_pedido and v.item_id = i.id
  ),0)
$$;

-- Los controles anteriores de Pedidos siguen disponibles para una sola
-- estación. Con varias, deben terminar sus líneas antes de declarar listo.
create function public.leogin_proteger_pase_cocina()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'READY' and old.status <> 'READY' then
    if (select count(distinct coalesce(l.estacion::text,'')) > 1 and bool_or(l.preparada is null)
        from public.leogin_lineas_vivas_cocina(new.id) l) then
      raise exception 'Completa las estaciones desde Cocina antes de marcar listo.' using errcode = 'LGD01';
    end if;
    new.ready_at := coalesce(new.ready_at,clock_timestamp());
    update public.order_items set cocina_preparada_at = new.ready_at
      where order_id = new.id and cocina_preparada_at is null;
  end if;
  return new;
end $$;
create trigger leogin_proteger_pase_cocina before update of status on public.orders
  for each row execute function public.leogin_proteger_pase_cocina();

create function public.leogin_transicion_cocina(
  p_restaurante uuid, p_pedido uuid, p_accion text, p_actor uuid,
  p_lineas uuid[] default '{}', p_marca timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v public.orders%rowtype;
  v_hora timestamptz;
  v_anulacion timestamptz;
  v_cambiadas uuid[] := '{}';
  v_estado text;
begin
  if p_actor is null or p_accion is null or p_accion not in ('aceptar','preparar','reabrir','salida','anulacion')
      or p_lineas is null or cardinality(p_lineas) > 250 then
    raise exception 'Acción de cocina inválida.' using errcode = '22023';
  end if;
  select * into v from public.orders where id = p_pedido and restaurant_id = p_restaurante for update;
  if not found then raise exception 'Comanda no encontrada.' using errcode = 'LGD01'; end if;
  v_hora := clock_timestamp();
  v_estado := v.status;

  if p_accion = 'aceptar' then
    if v.status = 'PREP' then return jsonb_build_object('estado',v_estado,'cambio',false); end if;
    if v.status <> 'NEW' then raise exception 'La comanda ya cambió de etapa.' using errcode = 'LGD01'; end if;
    update public.orders set status = 'PREP', accepted_at = v_hora where id = p_pedido;
    v_estado := 'PREP';
  elsif p_accion = 'anulacion' then
    select greatest(v.cancelled_at,max(created_at)) into v_anulacion from public.order_voids where order_id = p_pedido;
    if v_anulacion is null or v_anulacion is distinct from p_marca then
      raise exception 'La anulación cambió. Revisa el aviso actualizado.' using errcode = 'LGD01';
    end if;
    if v.cocina_anulacion_vista_at >= v_anulacion then
      return jsonb_build_object('estado',v_estado,'cambio',false);
    end if;
    update public.orders set cocina_anulacion_vista_at = v_anulacion where id = p_pedido;
  elsif p_accion = 'salida' then
    if v.cocina_salida_at is not null then return jsonb_build_object('estado',v_estado,'cambio',false); end if;
    if v.status <> 'READY' then raise exception 'La comanda ya no está lista para salir.' using errcode = 'LGD01'; end if;
    select max(created_at) into v_anulacion from public.order_voids where order_id = p_pedido;
    if v_anulacion is not null and (v.cocina_anulacion_vista_at is null or v.cocina_anulacion_vista_at < v_anulacion) then
      raise exception 'Confirma la anulación antes de pasar la comanda a Servicio.' using errcode = 'LGD01';
    end if;
    update public.orders set cocina_salida_at = v_hora where id = p_pedido;
  else
    if v.status not in ('PREP','READY') or v.cocina_salida_at is not null then
      raise exception 'La comanda ya salió de preparación.' using errcode = 'LGD01';
    end if;
    if cardinality(p_lineas) = 0 or (select count(*) from public.leogin_lineas_vivas_cocina(p_pedido)
        where id = any(p_lineas)) <> cardinality(p_lineas) then
      raise exception 'Las líneas de la comanda cambiaron. Revisa el tablero.' using errcode = 'LGD01';
    end if;
    if p_accion = 'reabrir' then
      if p_marca is null or exists(select 1 from public.leogin_lineas_vivas_cocina(p_pedido)
          where id = any(p_lineas) and (servida is not null or preparada is distinct from p_marca)) then
        raise exception 'La preparación cambió o ya se entregó.' using errcode = 'LGD01';
      end if;
      update public.order_items set cocina_preparada_at = null where id = any(p_lineas);
      update public.orders set status = 'PREP', ready_at = null where id = p_pedido;
      v_estado := 'PREP';
      v_cambiadas := p_lineas;
    else
      with nuevas as (
        update public.order_items set cocina_preparada_at = v_hora
        where id = any(p_lineas) and cocina_preparada_at is null returning id
      )
      select coalesce(array_agg(id),'{}') into v_cambiadas from nuevas;
      if cardinality(v_cambiadas) = 0 then return jsonb_build_object('estado',v_estado,'cambio',false); end if;
      -- El pedido se bloquea primero, igual que una anulación o un traslado.
      -- Actualizar su fila también avisa a los otros puestos por Realtime.
      update public.orders set updated_at = v_hora where id = p_pedido;
    end if;
  end if;

  if p_accion in ('preparar','anulacion') and v_estado = 'PREP' and (
      select count(*) > 0 and bool_and(preparada is not null)
      from public.leogin_lineas_vivas_cocina(p_pedido)
    ) then
    update public.orders set status = 'READY', ready_at = v_hora where id = p_pedido;
    v_estado := 'READY';
  end if;

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  values (p_restaurante,p_actor,'cocina',p_accion,jsonb_build_object(
    'pedido',p_pedido,'estado',v_estado,'lineas',v_cambiadas,'marca',v_hora));
  return jsonb_build_object('estado',v_estado,'cambio',true,'marca',v_hora,'lineas',v_cambiadas);
end $$;

revoke all on function public.leogin_ruta_cocina(uuid,uuid), public.leogin_fijar_ruta_cocina(),
  public.leogin_lineas_vivas_cocina(uuid), public.leogin_proteger_pase_cocina(),
  public.leogin_proteger_marcas_cocina(), public.leogin_rondas_cocina(uuid,uuid[]),
  public.leogin_transicion_cocina(uuid,uuid,text,uuid,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.leogin_lineas_vivas_cocina(uuid),
  public.leogin_rondas_cocina(uuid,uuid[]),
  public.leogin_transicion_cocina(uuid,uuid,text,uuid,uuid[],timestamptz) to service_role;

commit;
