-- 164 · Cuotas por plato con centavos exactos, comunes a pantalla y cobro (0.17).
-- Aplicar DESPUÉS de la 163 y ANTES del código. No reescribe dinero histórico.
begin;

create function public.leogin_cuotas_platos_pedido(p_order uuid, p_assignment jsonb, p_paid jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_total numeric; v_consumo numeric; v_neto numeric; v_legado numeric;
  v_item record; v_asignado numeric; v_mapeado boolean; v_saldada boolean; v_cuota numeric;
  v_legado_asignado numeric := 0; v_fijo numeric := 0; v_peso numeric := 0; v_centavos numeric;
  v_pesos jsonb := '{}'; v_cuotas jsonb := '{}'; v_asignados jsonb := '{}';
begin
  select total into v_total from public.orders where id=p_order;
  select coalesce(sum(amount),0),coalesce(sum(amount) filter(where kind='PAYMENT' and item_amounts='{}'),0)
    into v_neto,v_legado from public.order_payments where order_id=p_order;
  select coalesce(sum(round(i.subtotal/nullif(i.quantity,0)*greatest(i.quantity-coalesce(
    (select sum(quantity) from public.order_voids where item_id=i.id),0),0),2)),0)
    into v_consumo from public.order_items i where order_id=p_order;
  for v_item in select i.id,round(i.subtotal/nullif(i.quantity,0)*greatest(i.quantity-coalesce(
      (select sum(quantity) from public.order_voids where item_id=i.id),0),0),2) as peso
      from public.order_items i where order_id=p_order order by id loop
    select coalesce(sum((item_amounts->>v_item.id::text)::numeric),0),count(*)>0
      into v_asignado,v_mapeado from public.order_payments where order_id=p_order and item_amounts ? v_item.id::text;
    v_saldada := (v_mapeado or v_legado>0) and exists (
      select 1 from jsonb_array_elements_text(coalesce(p_assignment->v_item.id::text,'[]')) a(persona)
        where coalesce(p_paid,'[]') ? a.persona);
    if v_saldada then
      if not v_mapeado then
        -- Únicamente la evidencia legada aceptada por la 160. No inventar backfill.
        v_asignado := round(v_item.peso*v_total/nullif(v_consumo,0),2);
        v_legado_asignado := v_legado_asignado+v_asignado;
      end if;
      v_cuotas := jsonb_set(v_cuotas,array[v_item.id::text],to_jsonb(v_asignado));
      v_fijo := v_fijo+v_asignado;
    else
      v_pesos := jsonb_set(v_pesos,array[v_item.id::text],to_jsonb(coalesce(v_item.peso,0)));
      v_peso := v_peso+coalesce(v_item.peso,0);
    end if;
    v_asignados := jsonb_set(v_asignados,array[v_item.id::text],to_jsonb(v_asignado));
  end loop;
  if v_legado>0 and abs(v_legado-v_legado_asignado)>0.001 then
    raise exception 'Hay cobros anteriores sin asignación verificable. Revisa la cuenta antes de cobrar por platos.' using errcode='LGD02';
  end if;
  v_centavos := round((v_total-v_fijo)*100);
  if v_total is null or v_centavos<0 or v_neto<0 or v_neto>v_total
      or abs(v_neto-coalesce((select sum(value::numeric) from jsonb_each_text(v_asignados)),0))>0.001
      or (v_centavos>0 and v_peso<=0) then
    raise exception 'No se puede repartir el saldo sin cambiar cobros anteriores. Revisa la cuenta.' using errcode='LGD02';
  end if;
  -- Resto mayor en centavos enteros. El UUID desempata; jamás el orden de clic.
  with crudas as (
    select key,case when v_peso>0 then v_centavos*value::numeric/v_peso else 0 end as cuota
      from jsonb_each_text(v_pesos)
  ), bases as (
    select key,floor(cuota) as base,row_number() over(order by cuota-floor(cuota) desc,key) as posicion,
      v_centavos-sum(floor(cuota)) over() as resto from crudas
  )
  select v_cuotas||coalesce(jsonb_object_agg(key,(base+case when posicion<=resto then 1 else 0 end)/100),'{}')
    into v_cuotas from bases;
  if exists(select 1 from jsonb_each_text(v_cuotas) where value::numeric < (v_asignados->>key)::numeric) then
    raise exception 'La cuota cambió por debajo de lo ya cobrado. Revisa la cuenta.' using errcode='LGD02';
  end if;
  return jsonb_build_object('cuotas',v_cuotas,'asignados',v_asignados,'neto',v_neto);
end $$;

create function public.leogin_saldos_platos_mesa(p_restaurant uuid,p_mesa integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_order record; v_split record; v_reparto jsonb; v_linea record; v_saldo numeric;
  v_total numeric := 0; v_pendientes jsonb := '{}'; v_pagadas jsonb := '[]';
begin
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  select * into v_split from public.table_splits where restaurant_id=p_restaurant and table_number=p_mesa for update;
  for v_order in select id from public.orders where restaurant_id=p_restaurant and table_number=p_mesa
      and order_type='DINE_IN' and status not in ('DELIVERED','CANCEL') order by id loop
    v_reparto := public.leogin_cuotas_platos_pedido(v_order.id,v_split.assignment,v_split.paid);
    v_total := v_total+(v_reparto->>'neto')::numeric;
    for v_linea in select key,value from jsonb_each_text(v_reparto->'cuotas') loop
      v_saldo := v_linea.value::numeric-(v_reparto->'asignados'->>v_linea.key)::numeric;
      v_pendientes := jsonb_set(v_pendientes,array[v_linea.key],to_jsonb(v_saldo));
      if v_saldo=0 then v_pagadas := v_pagadas||to_jsonb(v_linea.key); end if;
    end loop;
  end loop;
  return jsonb_build_object('total',v_total,'lineasPendientes',v_pendientes,'lineasPagadas',v_pagadas);
end $$;

-- El cobro de la 160 se conserva abajo, cambiando únicamente el cálculo
-- de cuotas por esta fuente común. La envoltura durable de la 161 no cambia.
create or replace function public.leogin_cobrar_parte_mesa(
  p_restaurant uuid, p_mesa integer, p_items uuid[], p_pagos jsonb, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item record; v_pago record; v_fila record; v_split record;
  v_lista jsonb := '[]'; v_disponible jsonb := '{}';
  v_saldos jsonb := '{}'; v_repartos jsonb := '{}'; v_vistos jsonb := '{}'; v_filas jsonb := '{}';
  v_reparto jsonb; v_cuota numeric; v_asignado numeric;
  v_importe numeric; v_solicitado numeric := 0; v_maximo numeric; v_resta numeric; v_aplica numeric;
  v_recibido numeric; v_primero boolean; v_clave text; v_previa jsonb; v_persona text;
  v_ids uuid[] := '{}'; v_saldadas uuid[] := '{}'; v_total numeric := 0;
begin
  if p_actor is null or p_items is null or cardinality(p_items) not between 1 and 120
      or cardinality(p_items) <> (select count(distinct x) from unnest(p_items) x)
      or jsonb_typeof(p_pagos) is distinct from 'array' or jsonb_array_length(p_pagos) not between 1 and 120 then
    raise exception 'Cobro inválido.' using errcode = '22023';
  end if;
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    if (v_pago.value->>'method') is null or (v_pago.value->>'method') not in ('CASH','CARD','TRANSFER')
        or jsonb_typeof(v_pago.value->'amount') is distinct from 'number' then
      raise exception 'Forma o importe de pago inválidos.' using errcode = '22023';
    end if;
    v_importe := round((v_pago.value->>'amount')::numeric, 2);
    if v_importe <= 0 or v_importe > 99999999.99 then raise exception 'Importe inválido.' using errcode = '22023'; end if;
    v_solicitado := v_solicitado + v_importe;
  end loop;
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant, p_mesa);
  if (select count(*) from public.order_items i join public.orders o on o.id = i.order_id
      where i.id = any(p_items) and o.restaurant_id = p_restaurant and o.table_number = p_mesa
      and o.order_type = 'DINE_IN' and o.status not in ('DELIVERED','CANCEL')) <> cardinality(p_items) then
    raise exception 'Los platos cambiaron de mesa o ya se cerraron. Actualiza la cuenta.' using errcode = 'LGD01';
  end if;
  select * into v_split from public.table_splits where restaurant_id = p_restaurant and table_number = p_mesa for update;

  for v_item in
    select i.*, o.total as total_pedido
    from unnest(p_items) with ordinality s(id, posicion) join public.order_items i on i.id = s.id
    join public.orders o on o.id = i.order_id order by s.posicion
  loop
    if not (v_vistos ? v_item.order_id::text) then
      v_reparto := public.leogin_cuotas_platos_pedido(v_item.order_id,v_split.assignment,v_split.paid);
      v_repartos := jsonb_set(v_repartos,array[v_item.order_id::text],v_reparto);
      v_saldos := jsonb_set(v_saldos,array[v_item.order_id::text],to_jsonb(greatest(v_item.total_pedido-(v_reparto->>'neto')::numeric,0)));
      v_vistos := v_vistos || jsonb_build_object(v_item.order_id::text,true);
    end if;
    v_reparto := v_repartos->v_item.order_id::text;
    v_cuota := (v_reparto->'cuotas'->>v_item.id::text)::numeric;
    v_asignado := (v_reparto->'asignados'->>v_item.id::text)::numeric;
    if v_cuota is null or v_cuota <= v_asignado then
      raise exception 'Esos platos ya están pagados. Actualiza la cuenta.' using errcode = 'LGD01';
    end if;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('id',v_item.id,'order_id',v_item.order_id));
    v_disponible := jsonb_set(v_disponible,array[v_item.id::text],to_jsonb(v_cuota-v_asignado));
  end loop;
  select coalesce(sum(least(c.disponible,(v_saldos->>c.pedido)::numeric)),0) into v_maximo from (
    select value->>'order_id' as pedido, sum((v_disponible->>(value->>'id'))::numeric) as disponible
      from jsonb_array_elements(v_lista) group by value->>'order_id'
  ) c;
  if v_solicitado > v_maximo or v_maximo <= 0 then
    raise exception 'El saldo cambió o el importe supera los platos pendientes. Actualiza la cuenta.' using errcode = 'LGD01';
  end if;

  for v_pago in select value, ordinality as posicion from jsonb_array_elements(p_pagos) with ordinality loop
    v_resta := round((v_pago.value->>'amount')::numeric,2);
    v_recibido := null;
    if v_pago.value->>'method' = 'CASH' and jsonb_typeof(v_pago.value->'cashReceived') = 'number' then
      v_recibido := round((v_pago.value->>'cashReceived')::numeric,2);
      if v_recibido < v_resta or v_recibido > 99999999.99 then v_recibido := null; end if;
    end if;
    v_primero := true;
    for v_item in select value->>'id' as id, value->>'order_id' as pedido from jsonb_array_elements(v_lista) loop
      v_aplica := least(v_resta,(v_disponible->>v_item.id)::numeric,(v_saldos->>v_item.pedido)::numeric);
      if v_aplica <= 0 then continue; end if;
      v_clave := v_pago.posicion::text || '/' || v_item.pedido;
      v_previa := coalesce(v_filas->v_clave,jsonb_build_object('order_id',v_item.pedido,'method',v_pago.value->>'method','amount',0,'cash_received',null,'item_amounts','{}'::jsonb));
      if v_primero then
        v_previa := jsonb_set(v_previa,'{cash_received}',coalesce(to_jsonb(v_recibido),'null'::jsonb));
        v_primero := false;
      end if;
      v_previa := jsonb_set(v_previa,'{amount}',to_jsonb((v_previa->>'amount')::numeric+v_aplica));
      v_previa := jsonb_set(v_previa,array['item_amounts',v_item.id],to_jsonb(coalesce((v_previa->'item_amounts'->>v_item.id)::numeric,0)+v_aplica));
      v_filas := jsonb_set(v_filas,array[v_clave],v_previa);
      v_disponible := jsonb_set(v_disponible,array[v_item.id],to_jsonb((v_disponible->>v_item.id)::numeric-v_aplica));
      v_saldos := jsonb_set(v_saldos,array[v_item.pedido],to_jsonb((v_saldos->>v_item.pedido)::numeric-v_aplica));
      v_resta := v_resta-v_aplica;
    end loop;
    if v_resta <> 0 then raise exception 'No se pudo asignar todo el pago.' using errcode = 'LGD01'; end if;
  end loop;
  for v_fila in select value from jsonb_each(v_filas) order by key loop
    v_ids := array_append(v_ids,gen_random_uuid());
    insert into public.order_payments(id,restaurant_id,order_id,method,amount,cash_received,taken_by,item_amounts)
      values(v_ids[array_length(v_ids,1)],p_restaurant,(v_fila.value->>'order_id')::uuid,v_fila.value->>'method',
        (v_fila.value->>'amount')::numeric,(v_fila.value->>'cash_received')::numeric,p_actor,v_fila.value->'item_amounts');
    v_total := v_total+(v_fila.value->>'amount')::numeric;
  end loop;
  select coalesce(array_agg(key::uuid),'{}') into v_saldadas from jsonb_each_text(v_disponible) where value::numeric = 0;
  if cardinality(v_saldadas) > 0 then
    if jsonb_array_length(coalesce(v_split.people,'[]')) >= 30 then
      raise exception 'El reparto ya tiene 30 partes. Revisa la cuenta antes de añadir otra.' using errcode = '22023';
    end if;
    v_persona := 'p' || gen_random_uuid()::text;
    insert into public.table_splits(restaurant_id,table_number,mode,people,assignment,paid,updated_at,updated_by)
      values(p_restaurant,p_mesa,'byItem',coalesce(v_split.people,'[]')||jsonb_build_array(jsonb_build_object('id',v_persona,'name','Parte cobrada')),
        coalesce(v_split.assignment,'{}') || (select jsonb_object_agg(x::text,jsonb_build_array(v_persona)) from unnest(v_saldadas) x),
        coalesce(v_split.paid,'[]')||to_jsonb(v_persona),clock_timestamp(),p_actor)
      on conflict (restaurant_id,table_number) do update set mode=excluded.mode,people=excluded.people,
        assignment=excluded.assignment,paid=excluded.paid,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  end if;
  return jsonb_build_object('cobrado',v_total,'paymentIds',to_jsonb(v_ids));
end $$;


revoke all on function public.leogin_cuotas_platos_pedido(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.leogin_saldos_platos_mesa(uuid,integer) from public,anon,authenticated;
revoke all on function public.leogin_cobrar_parte_mesa(uuid,integer,uuid[],jsonb,uuid) from public,anon,authenticated;
grant execute on function public.leogin_cuotas_platos_pedido(uuid,jsonb,jsonb) to service_role;
grant execute on function public.leogin_saldos_platos_mesa(uuid,integer) to service_role;
grant execute on function public.leogin_cobrar_parte_mesa(uuid,integer,uuid[],jsonb,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
