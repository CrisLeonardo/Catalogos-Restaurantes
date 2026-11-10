-- 169 · Abonos y partes persistentes de una cuenta de mesa (auditoría 1.1).
-- Aplicar después de 168 y antes del código. Los movimientos anteriores se conservan.
begin;

create table public.cobro_repartos_mesa (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number integer not null check (table_number > 0),
  id uuid not null default gen_random_uuid(),
  pedidos uuid[] not null,
  cuenta text not null,
  partes jsonb not null check (jsonb_typeof(partes) = 'array'),
  primary key (restaurant_id, table_number)
);
alter table public.cobro_repartos_mesa enable row level security;
revoke all on public.cobro_repartos_mesa from public, anon, authenticated, service_role;
grant select, insert, update on public.cobro_repartos_mesa to service_role;
create policy super_admin_segundo_factor on public.cobro_repartos_mesa
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));

create index cobro_intentos_abonos_mesa on public.cobro_intentos(restaurant_id,table_number,created_at desc)
  where solicitud->>'modo'='abono';

create function public.leogin_contexto_pago_mesa(p_restaurant uuid, p_mesa integer)
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
    where restaurant_id=p_restaurant and table_number=p_mesa and solicitud->>'modo'='abono'
      and resultado->'orderIds' ?| v_pedidos::text[]
    order by created_at desc,intento_id desc limit 80
  ) r;
  select jsonb_build_object('id',r.id,'partes',r.partes,'desactualizado',r.cuenta<>v_cuenta)
    into v_reparto from public.cobro_repartos_mesa r
    where r.restaurant_id=p_restaurant and r.table_number=p_mesa and r.pedidos && v_pedidos;
  return v_contexto || jsonb_build_object('cuenta',v_cuenta,'pedidos',v_pedidos,
    'saldo',v_saldo,'saldada',v_saldada,'reparto',v_reparto,'historial',v_historial,'recibos',v_recibos);
end $$;

create function public.leogin_guardar_partes_mesa(
  p_restaurant uuid,p_mesa integer,p_cuenta text,p_anterior uuid,p_n integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ctx jsonb; v_partes jsonb; v_pedidos uuid[]; v_centavos bigint; v_ultimo integer;
begin
  if p_n is null or p_n not between 1 and 20 then
    raise exception 'Elige entre 1 y 20 partes pendientes.' using errcode='22023';
  end if;
  v_ctx := public.leogin_contexto_pago_mesa(p_restaurant,p_mesa);
  if p_cuenta is distinct from v_ctx->>'cuenta' or p_anterior is distinct from (v_ctx->'reparto'->>'id')::uuid then
    raise exception 'La cuenta o el reparto cambió. Actualiza la mesa.' using errcode='LGD01';
  end if;
  if v_ctx->>'avisoCuotas' is not null then
    raise exception '%',v_ctx->>'avisoCuotas' using errcode='LGD02';
  end if;
  v_centavos := round((v_ctx->>'saldo')::numeric*100);
  if v_centavos < p_n then
    raise exception 'El saldo no alcanza para ese número de partes.' using errcode='22023';
  end if;
  select array_agg(value::uuid) into v_pedidos from jsonb_array_elements_text(v_ctx->'pedidos');
  select coalesce(jsonb_agg(value order by (value->>'numero')::int),'[]'),coalesce(max((value->>'numero')::int),0)
    into v_partes,v_ultimo
    from jsonb_array_elements(coalesce(v_ctx->'reparto'->'partes','[]')) where value->>'recibo' is not null;
  -- Los primeros restos se llevan un centavo. Los recibos previos conservan número e importe.
  select v_partes || jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'numero',v_ultimo+n,
    'importe',(v_centavos/p_n + case when n<=v_centavos%p_n then 1 else 0 end)::numeric/100,'recibo',null) order by n)
    into v_partes from generate_series(1,p_n) n;
  insert into public.cobro_repartos_mesa(restaurant_id,table_number,pedidos,cuenta,partes)
    values(p_restaurant,p_mesa,v_pedidos,p_cuenta,v_partes)
    on conflict (restaurant_id,table_number) do update set id=excluded.id,pedidos=excluded.pedidos,
      cuenta=excluded.cuenta,partes=excluded.partes;
  return public.leogin_contexto_pago_mesa(p_restaurant,p_mesa)->'reparto';
end $$;

create function public.leogin_registrar_abono_mesa(
  p_restaurant uuid,p_mesa integer,p_cuenta text,p_reparto uuid,p_partes uuid[],
  p_pagos jsonb,p_actor uuid,p_intento uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_solicitud jsonb; v_resultado jsonb; v_ctx jsonb; v_despues jsonb; v_pago jsonb;
  v_importe numeric; v_recibido numeric; v_total numeric := 0; v_aplicado numeric;
  v_cuotas numeric; v_n integer; v_partes jsonb; v_cuenta text;
  v_asignacion jsonb; v_persona constant text := 'abonos-mesa';
begin
  v_solicitud := jsonb_build_object('modo','abono','cuenta',p_cuenta,'reparto',p_reparto,'partes',p_partes,'pagos',p_pagos);
  v_resultado := public.leogin_recuperar_intento_cobro(p_restaurant,p_mesa,p_intento,'parte',v_solicitud,p_actor);
  if v_resultado is not null then return v_resultado; end if;
  if jsonb_typeof(p_pagos) is distinct from 'array' or jsonb_array_length(p_pagos) not between 1 and 3
      or jsonb_array_length(p_pagos) <> (select count(distinct value->>'method') from jsonb_array_elements(p_pagos))
      or (p_reparto is null and coalesce(cardinality(p_partes),0)>0)
      or (p_reparto is not null and (coalesce(cardinality(p_partes),0) not between 1 and 20
        or cardinality(p_partes) <> (select count(distinct x) from unnest(p_partes) x))) then
    raise exception 'Formas de pago o partes inválidas.' using errcode='22023';
  end if;
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    if (v_pago->>'method') not in ('CASH','CARD','TRANSFER')
        or jsonb_typeof(v_pago->'amount') is distinct from 'number' then
      raise exception 'Forma o importe de pago inválido.' using errcode='22023';
    end if;
    v_importe := (v_pago->>'amount')::numeric;
    if v_importe not between 0.01 and 99999999.99 or v_importe<>round(v_importe,2) then
      raise exception 'El importe debe ser positivo y tener hasta dos decimales.' using errcode='22023';
    end if;
    if v_pago->>'cashReceived' is not null then
      if v_pago->>'method'<>'CASH' or jsonb_typeof(v_pago->'cashReceived')<>'number' then
        raise exception 'El recibido solo corresponde a efectivo.' using errcode='22023';
      end if;
      v_recibido := (v_pago->>'cashReceived')::numeric;
      if v_recibido not between v_importe and 99999999.99 or v_recibido<>round(v_recibido,2) then
        raise exception 'El efectivo recibido debe cubrir el importe aplicado.' using errcode='22023';
      end if;
    end if;
    v_total := v_total+v_importe;
  end loop;

  v_ctx := public.leogin_contexto_pago_mesa(p_restaurant,p_mesa);
  if p_cuenta is distinct from v_ctx->>'cuenta' or v_total>(v_ctx->>'saldo')::numeric then
    raise exception 'La cuenta cambió o el importe supera el saldo. Actualiza la mesa.' using errcode='LGD01';
  end if;
  if v_ctx->>'avisoCuotas' is not null then
    raise exception '%',v_ctx->>'avisoCuotas' using errcode='LGD02';
  end if;
  if p_reparto is not null then
    if p_reparto is distinct from (v_ctx->'reparto'->>'id')::uuid
        or (v_ctx->'reparto'->>'desactualizado')::boolean is distinct from false then
      raise exception 'El reparto cambió. Reparte el saldo pendiente de nuevo.' using errcode='LGD01';
    end if;
    select count(*),coalesce(sum((value->>'importe')::numeric),0) into v_n,v_cuotas
      from jsonb_array_elements(v_ctx->'reparto'->'partes')
      where (value->>'id')::uuid=any(p_partes) and value->>'recibo' is null;
    if v_n<>cardinality(p_partes) or v_cuotas<>v_total then
      raise exception 'Una parte ya se cobró o su importe cambió. Actualiza la mesa.' using errcode='LGD01';
    end if;
  end if;

  -- Los intervalos acumulados cruzan cuotas verificadas (164/165) con los
  -- métodos del abono. Cada intersección se registra en el pedido de su plato.
  with cuotas as (
    select key::uuid as item,value::numeric as cuota,sum(value::numeric) over (order by key) as hasta
    from jsonb_each_text(v_ctx->'lineasPendientes') where value::numeric>0
  ), metodos as (
    select n,value->>'method' as metodo,(value->>'cashReceived')::numeric as recibido,
      (value->>'amount')::numeric as importe,sum((value->>'amount')::numeric) over (order by n) as hasta
    from jsonb_array_elements(p_pagos) with ordinality as t(value,n)
  ), asignados as (
    select c.item,c.cuota,i.order_id,m.n,m.metodo,m.recibido,
      least(c.hasta,m.hasta)-greatest(c.hasta-c.cuota,m.hasta-m.importe) as importe
    from cuotas c join metodos m on c.hasta>m.hasta-m.importe and m.hasta>c.hasta-c.cuota
    join public.order_items i on i.id=c.item
  ), movimientos as (
    insert into public.order_payments(restaurant_id,order_id,method,amount,cash_received,taken_by,item_amounts)
    select p_restaurant,order_id,metodo,sum(importe),
      case when row_number() over (partition by n order by order_id)=1 then recibido end,
      p_actor,jsonb_object_agg(item,importe)
    from asignados group by n,order_id,metodo,recibido
    returning id,order_id,amount
  )
  select coalesce(sum(amount),0),jsonb_build_object('intentoId',p_intento,'cobrado',coalesce(sum(amount),0),
    'paymentIds',jsonb_agg(id order by id),'orderIds',jsonb_agg(distinct order_id),'pagos',p_pagos),
    (select jsonb_object_agg(item,jsonb_build_array(v_persona)) from (
      select item from asignados group by item,cuota having sum(importe)=cuota
    ) s)
  into v_aplicado,v_resultado,v_asignacion from movimientos;
  if v_aplicado<>v_total then
    raise exception 'No se pudo asignar todo el abono. Actualiza la mesa.' using errcode='LGD01';
  end if;
  if v_asignacion is not null then
    -- Un marcador compartido mantiene las cuotas saldadas de la vista por
    -- platos. Cada pago y cada participación tienen su recibo propio.
    insert into public.table_splits as s(restaurant_id,table_number,mode,people,assignment,paid,updated_at,updated_by)
      values(p_restaurant,p_mesa,'byItem',jsonb_build_array(jsonb_build_object('id',v_persona,'name','Abonos')),
        v_asignacion,jsonb_build_array(v_persona),clock_timestamp(),p_actor)
      on conflict (restaurant_id,table_number) do update set mode=excluded.mode,
        people=case when s.paid ? v_persona then s.people else s.people||excluded.people end,
        assignment=s.assignment||excluded.assignment,
        paid=case when s.paid ? v_persona then s.paid else s.paid||excluded.paid end,
        updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  end if;
  if p_reparto is not null then
    select jsonb_agg(case when (value->>'id')::uuid=any(p_partes) then
      jsonb_set(value,'{recibo}',v_resultado) else value end order by (value->>'numero')::int)
      into v_partes from jsonb_array_elements(v_ctx->'reparto'->'partes');
    v_despues := public.leogin_contexto_pago_mesa(p_restaurant,p_mesa);
    v_cuenta := case when v_despues->'pedidos'=v_ctx->'pedidos'
      and (v_despues->>'saldo')::numeric=(v_ctx->>'saldo')::numeric-v_total
      then v_despues->>'cuenta' else p_cuenta end;
    update public.cobro_repartos_mesa set partes=v_partes,cuenta=v_cuenta
      where restaurant_id=p_restaurant and table_number=p_mesa and id=p_reparto;
  end if;
  insert into public.cobro_intentos values(p_restaurant,p_intento,p_mesa,'parte',p_actor,v_solicitud,v_resultado,clock_timestamp());
  return v_resultado;
end $$;

create function public.leogin_cerrar_cuenta_pagada(
  p_restaurant uuid,p_mesa integer,p_cuenta text,p_actor uuid,p_intento uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_ctx jsonb; v_solicitud jsonb; v_resultado jsonb; v_pedidos uuid[];
begin
  v_solicitud := jsonb_build_object('modo','pagada','cuenta',p_cuenta);
  v_resultado := public.leogin_recuperar_intento_cobro(p_restaurant,p_mesa,p_intento,'cierre',v_solicitud,p_actor);
  if v_resultado is not null then return v_resultado||jsonb_build_object('repetido',true); end if;
  v_ctx := public.leogin_contexto_pago_mesa(p_restaurant,p_mesa);
  if p_cuenta is distinct from v_ctx->>'cuenta' or (v_ctx->>'saldada')::boolean is distinct from true then
    raise exception 'La cuenta cambió o tiene saldo pendiente. Actualiza la mesa.' using errcode='LGD01';
  end if;
  select array_agg(value::uuid) into v_pedidos from jsonb_array_elements_text(v_ctx->'pedidos');
  if exists (select 1 from public.orders where id=any(v_pedidos) and status<>'SERVED') then
    raise exception 'Sirve los pedidos pendientes antes de cerrar la cuenta pagada.' using errcode='LGD01';
  end if;
  v_pedidos := public.leogin_confirmar_cierre_mesa(p_restaurant,p_mesa,v_pedidos,'[]',p_actor);
  v_resultado := jsonb_build_object('intentoId',p_intento,'orderIds',v_pedidos,'paymentIds','[]'::jsonb,'cobrado',0);
  insert into public.cobro_intentos values(p_restaurant,p_intento,p_mesa,'cierre',p_actor,v_solicitud,v_resultado,clock_timestamp());
  return v_resultado;
end $$;

revoke all on function public.leogin_contexto_pago_mesa(uuid,integer),
  public.leogin_guardar_partes_mesa(uuid,integer,text,uuid,integer),
  public.leogin_registrar_abono_mesa(uuid,integer,text,uuid,uuid[],jsonb,uuid,uuid),
  public.leogin_cerrar_cuenta_pagada(uuid,integer,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.leogin_contexto_pago_mesa(uuid,integer),
  public.leogin_guardar_partes_mesa(uuid,integer,text,uuid,integer),
  public.leogin_registrar_abono_mesa(uuid,integer,text,uuid,uuid[],jsonb,uuid,uuid),
  public.leogin_cerrar_cuenta_pagada(uuid,integer,text,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
