-- 160 · Cobro parcial y cierre comparten bloqueo, saldo y commit (auditoría 0.14).
-- Aplicar DESPUÉS de 001–159 y ANTES del código. No reconstruye pagos históricos.
-- Solo service_role: las acciones Next comprueban sesión, sucursal y permiso.

alter table public.order_payments
  add column if not exists item_amounts jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_payments_item_amounts_object') then
    alter table public.order_payments add constraint order_payments_item_amounts_object
      check (jsonb_typeof(item_amounts) = 'object');
  end if;
end $$;
comment on column public.order_payments.item_amounts is
  'Importe aplicado por línea en este movimiento. {} identifica cobros anteriores o sin asignación por plato; no se infiere ni se reescribe su historia.';

create or replace function public.leogin_bloquear_cuenta_mesa(p_restaurant uuid, p_mesa integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_restaurant is null or p_mesa is null or p_mesa < 1 then
    raise exception 'Mesa inválida.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cobro/' || p_restaurant::text || '/' || p_mesa::text, 0));
  -- Orden fijo; también impide cambiar total/estado durante el cálculo.
  perform id from public.orders where restaurant_id = p_restaurant
    and table_number = p_mesa and order_type = 'DINE_IN'
    and status not in ('DELIVERED', 'CANCEL') order by id for update;
end $$;

create or replace function public.leogin_cobrar_parte_mesa(
  p_restaurant uuid, p_mesa integer, p_items uuid[], p_pagos jsonb, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item record; v_pago record; v_fila record; v_split record;
  v_lista jsonb := '[]'; v_disponible jsonb := '{}';
  v_saldos jsonb := '{}'; v_legados jsonb := '{}'; v_vistos jsonb := '{}'; v_filas jsonb := '{}';
  v_legado numeric; v_legado_asignado numeric; v_pagado numeric; v_cuota numeric; v_asignado numeric;
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
    select i.*, o.total as total_pedido, (select sum(subtotal) from public.order_items where order_id = o.id) as consumo
    from unnest(p_items) with ordinality s(id, posicion) join public.order_items i on i.id = s.id
    join public.orders o on o.id = i.order_id order by s.posicion
  loop
    if not (v_vistos ? v_item.order_id::text) then
      select coalesce(sum(amount),0), coalesce(sum(amount) filter (where kind = 'PAYMENT' and item_amounts = '{}'),0)
        into v_pagado, v_legado from public.order_payments where order_id = v_item.order_id;
      -- Los pagos antiguos solo tienen asignación verificable si el reparto
      -- guardado conserva sus líneas saldadas. No inventar un backfill monetario.
      select coalesce(sum(round(i.subtotal * v_item.total_pedido / nullif(v_item.consumo,0),2)),0)
        into v_legado_asignado from public.order_items i where i.order_id = v_item.order_id
        and not exists (select 1 from public.order_payments p where p.order_id = i.order_id and p.item_amounts ? i.id::text)
        and exists (select 1 from jsonb_array_elements_text(coalesce(v_split.assignment->i.id::text,'[]')) a(persona)
          where coalesce(v_split.paid,'[]') ? a.persona);
      if v_legado > 0 and abs(v_legado - v_legado_asignado) > 0.001 then
        raise exception 'Hay cobros anteriores sin asignación verificable. Revisa la cuenta antes de cobrar por platos.' using errcode = 'LGD02';
      end if;
      v_saldos := jsonb_set(v_saldos, array[v_item.order_id::text], to_jsonb(greatest(v_item.total_pedido-v_pagado,0)));
      v_legados := jsonb_set(v_legados, array[v_item.order_id::text], to_jsonb(v_legado));
      v_vistos := v_vistos || jsonb_build_object(v_item.order_id::text,true);
    end if;
    v_cuota := round(v_item.subtotal * v_item.total_pedido / nullif(v_item.consumo,0),2);
    select coalesce(sum((item_amounts->>v_item.id::text)::numeric),0) into v_asignado
      from public.order_payments where order_id = v_item.order_id and item_amounts ? v_item.id::text;
    if v_asignado = 0 and (v_legados->>v_item.order_id::text)::numeric > 0 and exists (
      select 1 from jsonb_array_elements_text(coalesce(v_split.assignment->v_item.id::text,'[]')) a(persona)
        where coalesce(v_split.paid,'[]') ? a.persona
    ) then v_asignado := v_cuota; end if;
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

-- Confirmar SOLO el snapshot de pedidos leído por freeTable. Si un parcial
-- ganó la carrera, rechazar la propuesta vieja sin cerrar ni escribir dinero.
create or replace function public.leogin_confirmar_cierre_mesa(
  p_restaurant uuid, p_mesa integer, p_orders uuid[], p_filas jsonb, p_actor uuid
) returns uuid[] language plpgsql security invoker set search_path = '' as $$
declare v_order record; v_fila record; v_neto numeric; v_nuevo numeric; v_ids uuid[]; v_method text;
begin
  if p_actor is null or p_orders is null or cardinality(p_orders) <> (select count(distinct x) from unnest(p_orders) x)
      or jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Cierre inválido.' using errcode='22023'; end if;
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  if (select count(*) from public.orders where id=any(p_orders) and restaurant_id=p_restaurant
      and table_number=p_mesa and order_type='DINE_IN' and status not in ('DELIVERED','CANCEL')) <> cardinality(p_orders) then
    raise exception 'La cuenta cambió o ya se cobró. Actualiza la mesa.' using errcode='LGD01';
  end if;
  for v_fila in select value from jsonb_array_elements(p_filas) loop
    if not coalesce((v_fila.value->>'orderId')::uuid=any(p_orders),false)
        or (v_fila.value->>'method') is null or (v_fila.value->>'method') not in ('CASH','CARD','TRANSFER')
        or jsonb_typeof(v_fila.value->'amount') is distinct from 'number'
        or not ((v_fila.value->>'amount')::numeric between 0.01 and 99999999.99) then
      raise exception 'Movimiento de cierre inválido.' using errcode='22023';
    end if;
  end loop;
  for v_order in select id,total from public.orders where id=any(p_orders) order by id loop
    select coalesce(sum(amount),0) into v_neto from public.order_payments where order_id=v_order.id;
    select coalesce(sum(round((value->>'amount')::numeric,2)),0) into v_nuevo
      from jsonb_array_elements(p_filas) where (value->>'orderId')::uuid=v_order.id;
    if v_neto+v_nuevo > v_order.total or (jsonb_array_length(p_filas)>0 and v_neto+v_nuevo < v_order.total) then
      raise exception 'El pago no coincide con el saldo actual de cada pedido. No se cerró la mesa.' using errcode='LGD01';
    end if;
  end loop;
  for v_fila in select value from jsonb_array_elements(p_filas) loop
    insert into public.order_payments(restaurant_id,order_id,method,amount,cash_received,taken_by,kind)
      values(p_restaurant,(v_fila.value->>'orderId')::uuid,v_fila.value->>'method',round((v_fila.value->>'amount')::numeric,2),
        case when v_fila.value->>'method'='CASH' and (v_fila.value->>'cashReceived')::numeric >= (v_fila.value->>'amount')::numeric
          then (v_fila.value->>'cashReceived')::numeric else null end,p_actor,'TABLE_CLOSE');
  end loop;
  for v_order in select id from public.orders where id=any(p_orders) loop
    select method into v_method from public.order_payments where order_id=v_order.id group by method
      having sum(amount)>0 order by sum(amount) desc,method limit 1;
    update public.orders set status='DELIVERED',delivered_at=clock_timestamp(),payment_method=coalesce(v_method,payment_method),
      cash_amount=(select sum(cash_received) from public.order_payments where order_id=v_order.id and method='CASH')
      where id=v_order.id;
  end loop;
  -- Una ronda que llegó durante el cobro sigue viva y conserva su sesión.
  if not exists(select 1 from public.orders where restaurant_id=p_restaurant and table_number=p_mesa
      and order_type='DINE_IN' and status not in ('DELIVERED','CANCEL')) then
    delete from public.table_splits where restaurant_id=p_restaurant and table_number=p_mesa;
    update public.table_sessions set closed_at=clock_timestamp() where restaurant_id=p_restaurant and table_number=p_mesa and closed_at is null;
  end if;
  v_ids := p_orders;
  return v_ids;
end $$;

revoke all on function public.leogin_bloquear_cuenta_mesa(uuid,integer) from public,anon,authenticated;
revoke all on function public.leogin_cobrar_parte_mesa(uuid,integer,uuid[],jsonb,uuid) from public,anon,authenticated;
revoke all on function public.leogin_confirmar_cierre_mesa(uuid,integer,uuid[],jsonb,uuid) from public,anon,authenticated;
grant execute on function public.leogin_bloquear_cuenta_mesa(uuid,integer) to service_role;
grant execute on function public.leogin_cobrar_parte_mesa(uuid,integer,uuid[],jsonb,uuid) to service_role;
grant execute on function public.leogin_confirmar_cierre_mesa(uuid,integer,uuid[],jsonb,uuid) to service_role;
