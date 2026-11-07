begin;

-- El recibo de la operación es también su registro de auditoría.
create unique index activity_log_intento_pedido_idx
  on public.activity_log(restaurant_id,entity,actor_id,(meta->>'intento'))
  where action = 'pedido_en_vivo';

create index whatsapp_messages_aviso_pedido_idx
  on public.whatsapp_messages(restaurant_id,order_id,created_at desc,id desc)
  where direction='OUT' and order_id is not null;

create function public.leogin_operar_pedido(
  p_restaurante uuid, p_pedido uuid, p_actor uuid, p_intento uuid,
  p_estado text, p_version timestamptz, p_destino text,
  p_item uuid default null, p_cantidad integer default null, p_motivo text default null,
  p_firma uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_pedido public.orders%rowtype;
  v_ahora timestamptz;
  v_recibo jsonb;
  v_solicitud jsonb := jsonb_build_object('estado',p_estado,'version',p_version,
    'destino',p_destino,'item',p_item,'cantidad',p_cantidad,'motivo',p_motivo);
  v_siguiente text;
  v_estado text;
begin
  if p_actor is null or p_intento is null or p_estado is null or p_version is null or p_destino is null then
    raise exception 'Operación de pedido inválida.' using errcode = '22023';
  end if;
  select * into v_pedido from public.orders
    where id=p_pedido and restaurant_id=p_restaurante for update;
  if not found then raise exception 'Pedido no encontrado.' using errcode = 'LGD01'; end if;

  select meta into v_recibo from public.activity_log where restaurant_id=p_restaurante
    and action='pedido_en_vivo' and entity=p_pedido::text and actor_id=p_actor and meta->>'intento'=p_intento::text;
  if found then
    if v_recibo->'solicitud' is distinct from v_solicitud then
      raise exception 'Este intento pertenece a otra operación. Abre de nuevo el pedido.' using errcode = 'LGD01';
    end if;
    return jsonb_build_object('estado',v_pedido.status,'cambio',false,'repetido',true);
  end if;

  if v_pedido.status is distinct from p_estado or v_pedido.updated_at is distinct from p_version then
    return jsonb_build_object('estado',v_pedido.status,'cambio',false,'conflicto',true);
  end if;

  v_ahora := clock_timestamp();
  v_estado := p_destino;
  if p_destino='CANCEL' then
    if length(btrim(coalesce(p_motivo,''))) not between 1 and 500 then
      raise exception 'Escribe un motivo de hasta 500 caracteres.' using errcode = 'LGD01';
    end if;
    if p_item is null then
      perform public.void_order(p_pedido,p_motivo,p_actor,p_firma);
    else
      perform public.void_order_item(p_item,p_pedido,p_cantidad,p_motivo,p_actor,p_firma);
      select status into v_estado from public.orders where id=p_pedido;
    end if;
  else
    v_siguiente := case p_estado
      when 'NEW' then 'PREP' when 'PREP' then 'READY'
      when 'READY' then case v_pedido.order_type when 'DINE_IN' then 'SERVED'
        when 'DELIVERY' then 'TRANSIT' else 'DELIVERED' end
      when 'TRANSIT' then 'DELIVERED' end;
    if p_destino is distinct from v_siguiente then
      raise exception 'Ese paso no corresponde al estado actual del pedido.' using errcode = 'LGD01';
    end if;
    update public.orders set status=p_destino,
      accepted_at=case when p_destino='PREP' then v_ahora else accepted_at end,
      ready_at=case when p_destino='READY' then v_ahora else ready_at end,
      served_at=case when p_destino='SERVED' then v_ahora else served_at end,
      delivered_at=case when p_destino='DELIVERED' then v_ahora else delivered_at end
      where id=p_pedido;
  end if;

  insert into public.activity_log(restaurant_id,actor_id,action,entity,meta,created_at)
    values(p_restaurante,p_actor,'pedido_en_vivo',p_pedido::text,
      jsonb_build_object('intento',p_intento,'solicitud',v_solicitud,'estado',v_estado),v_ahora);
  return jsonb_build_object('estado',v_estado,'cambio',true);
end $$;

revoke all on function public.leogin_operar_pedido(uuid,uuid,uuid,uuid,text,timestamptz,text,uuid,integer,text,uuid)
  from public,anon,authenticated;
grant execute on function public.leogin_operar_pedido(uuid,uuid,uuid,uuid,text,timestamptz,text,uuid,integer,text,uuid)
  to service_role;

create function public.leogin_resumen_pedidos_vivos(p_restaurante uuid,p_pedidos uuid[])
returns table(pedido uuid,cobrado numeric,movimientos bigint,aviso_fallido boolean)
language sql stable security invoker set search_path = '' as $$
  select o.id,p.cobrado,p.movimientos,coalesce(a.status='failed',false)
  from public.orders o
  cross join lateral (
    select coalesce(sum(amount),0) cobrado,count(*) movimientos
    from public.order_payments p where p.restaurant_id=o.restaurant_id and p.order_id=o.id
  ) p
  left join lateral (
    select w.status from public.whatsapp_messages w where w.restaurant_id=o.restaurant_id
      and w.order_id=o.id and w.direction='OUT' order by w.created_at desc,w.id desc limit 1
  ) a on true
  where o.restaurant_id=p_restaurante and o.id=any(p_pedidos)
$$;

revoke all on function public.leogin_resumen_pedidos_vivos(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.leogin_resumen_pedidos_vivos(uuid,uuid[]) to service_role;

commit;
