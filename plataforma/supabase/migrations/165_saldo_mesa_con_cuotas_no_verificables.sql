-- 165 · Conservar el total monetario aunque no sea verificable el reparto.
-- Aplicar DESPUÉS de la 164 y ANTES del código de 0.17. Sin cambios de datos.
-- La 164 ya se aplicó localmente y permanece intacta.
begin;
create or replace function public.leogin_saldos_platos_mesa(p_restaurant uuid,p_mesa integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_order record; v_split record; v_reparto jsonb; v_linea record; v_saldo numeric;
  v_total numeric; v_pendientes jsonb := '{}'; v_pagadas jsonb := '[]'; v_aviso text;
begin
  perform public.leogin_bloquear_cuenta_mesa(p_restaurant,p_mesa);
  select * into v_split from public.table_splits where restaurant_id=p_restaurant and table_number=p_mesa for update;
  select coalesce(sum(p.amount),0) into v_total from public.order_payments p join public.orders o on o.id=p.order_id
    where o.restaurant_id=p_restaurant and o.table_number=p_mesa
      and o.order_type='DINE_IN' and o.status not in ('DELIVERED','CANCEL');
  for v_order in select id from public.orders where restaurant_id=p_restaurant and table_number=p_mesa
      and order_type='DINE_IN' and status not in ('DELIVERED','CANCEL') order by id loop
    begin
      v_reparto := public.leogin_cuotas_platos_pedido(v_order.id,v_split.assignment,v_split.paid);
    exception when sqlstate 'LGD02' then
      -- Solo el reparto requiere revisión. El total sigue permitiendo cerrar
      -- el saldo por pedido con la 163, sin volver a cobrar el pago legado.
      v_aviso := sqlerrm;
      continue;
    end;
    for v_linea in select key,value from jsonb_each_text(v_reparto->'cuotas') loop
      v_saldo := v_linea.value::numeric-(v_reparto->'asignados'->>v_linea.key)::numeric;
      v_pendientes := jsonb_set(v_pendientes,array[v_linea.key],to_jsonb(v_saldo));
      if v_saldo=0 then v_pagadas := v_pagadas||to_jsonb(v_linea.key); end if;
    end loop;
  end loop;
  return jsonb_build_object('total',v_total,'lineasPendientes',v_pendientes,'lineasPagadas',v_pagadas,'avisoCuotas',v_aviso);
end $$;
-- CREATE OR REPLACE conserva los privilegios exclusivos del servicio de la 164.
notify pgrst, 'reload schema';
commit;
