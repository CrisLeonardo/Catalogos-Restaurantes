-- 163 · Reparte el cobro de cierre sobre el saldo neto de cada pedido (0.16).
-- Aplicar DESPUÉS de la 162 y ANTES del código. No reconstruye historia.
begin;
create function public.leogin_cerrar_saldo_mesa(
  p_restaurant uuid, p_mesa integer, p_orders uuid[], p_pagos jsonb,
  p_actor uuid, p_intento uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_resultado jsonb; v_order record; v_pago record;
  v_saldos jsonb := '{}'; v_filas jsonb := '[]';
  v_neto numeric; v_saldo numeric; v_total numeric := 0;
  v_explicito numeric := 0; v_solicitado numeric := 0; v_sin_importe integer := 0;
  v_importe numeric; v_resta numeric; v_aplica numeric; v_recibido numeric; v_primero boolean;
begin
  v_resultado := public.leogin_recuperar_intento_cobro(p_restaurant,p_mesa,p_intento,'cierre',jsonb_build_object('pagos',p_pagos),p_actor);
  if v_resultado is not null then return v_resultado; end if;
  if p_orders is null or cardinality(p_orders)=0
      or cardinality(p_orders) <> (select count(distinct x) from unnest(p_orders) x)
      or jsonb_typeof(p_pagos) is distinct from 'array' or jsonb_array_length(p_pagos) not between 1 and 120 then
    raise exception 'La cuenta cambió o ya se cobró. Actualiza la mesa.' using errcode='LGD01';
  end if;
  -- El mismo bloqueo de la 160: nada se reparte sobre una lectura obsoleta.
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  if (select count(*) from public.orders where id=any(p_orders) and restaurant_id=p_restaurant
      and table_number=p_mesa and order_type='DINE_IN' and status not in ('DELIVERED','CANCEL')) <> cardinality(p_orders) then
    raise exception 'La cuenta cambió o ya se cobró. Actualiza la mesa.' using errcode='LGD01';
  end if;
  for v_order in select id,total from public.orders where id=any(p_orders) order by created_at,id loop
    -- Incluye PAYMENT, TABLE_CLOSE, cambios de método, devoluciones y reaperturas.
    select coalesce(sum(amount),0) into v_neto from public.order_payments where order_id=v_order.id;
    v_saldo := v_order.total-v_neto;
    if v_saldo < 0 then
      raise exception 'Un pedido tiene cobros por encima de su total. Revisa la cuenta.' using errcode='LGD01';
    end if;
    v_saldos := jsonb_set(v_saldos,array[v_order.id::text],to_jsonb(v_saldo));
    v_total := v_total+v_saldo;
  end loop;
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    if (v_pago.value->>'method') is null or (v_pago.value->>'method') not in ('CASH','CARD','TRANSFER') then
      raise exception 'Forma de pago inválida.' using errcode='22023';
    end if;
    if v_pago.value->>'amount' is null then v_sin_importe := v_sin_importe+1;
    else
      if jsonb_typeof(v_pago.value->'amount') is distinct from 'number' then
        raise exception 'Importe de pago inválido.' using errcode='22023';
      end if;
      v_importe := round((v_pago.value->>'amount')::numeric,2);
      if v_importe not between 0.01 and 99999999.99 then
        raise exception 'Importe de pago inválido.' using errcode='22023';
      end if;
      v_explicito := v_explicito+v_importe;
    end if;
  end loop;
  v_solicitado := case when v_sin_importe=1 then v_total else v_explicito end;
  -- amount es lo aplicado, cashReceived es el billete. No recortar un
  -- importe desactualizado ni cargar el pago previo a otra ronda.
  if v_total <= 0 or v_sin_importe > 1 or v_solicitado <> v_total
      or (v_sin_importe=1 and v_explicito >= v_total) then
    raise exception 'El pago no coincide con el saldo actual de cada pedido. No se cerró la mesa.' using errcode='LGD01';
  end if;
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    v_importe := coalesce(round((v_pago.value->>'amount')::numeric,2),v_total-v_explicito);
    v_resta := v_importe;
    v_recibido := null;
    if v_pago.value->>'method'='CASH' and jsonb_typeof(v_pago.value->'cashReceived')='number' then
      v_recibido := round((v_pago.value->>'cashReceived')::numeric,2);
      if v_recibido < v_importe or v_recibido > 99999999.99 then v_recibido := null; end if;
    end if;
    v_primero := true;
    for v_order in select id from public.orders where id=any(p_orders) order by created_at,id loop
      v_aplica := least(v_resta,(v_saldos->>v_order.id::text)::numeric);
      if v_aplica <= 0 then continue; end if;
      v_filas := v_filas || jsonb_build_array(jsonb_build_object('orderId',v_order.id,
        'method',v_pago.value->>'method','amount',v_aplica,
        'cashReceived',case when v_primero then v_recibido else null end));
      v_primero := false;
      v_saldos := jsonb_set(v_saldos,array[v_order.id::text],to_jsonb((v_saldos->>v_order.id::text)::numeric-v_aplica));
      v_resta := v_resta-v_aplica;
    end loop;
    if v_resta <> 0 then raise exception 'No se pudo asignar todo el pago.' using errcode='LGD01'; end if;
  end loop;
  -- Conserva el commit conjunto de dinero/cierre/recibo de 160–161.
  return public.leogin_cerrar_mesa_idempotente(p_restaurant,p_mesa,p_orders,v_filas,p_actor,p_intento,p_pagos);
end $$;
revoke all on function public.leogin_cerrar_saldo_mesa(uuid,integer,uuid[],jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.leogin_cerrar_saldo_mesa(uuid,integer,uuid[],jsonb,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
