-- ============================================================
--  143 · La cancelación del comensal, de una vez (PROD-09)
--  ------------------------------------------------------------
--  AUDITORIA_SALIDA_PRODUCCION_2026-10-09. `cancelPublicOrder` leía el
--  pedido, comprobaba que siguiera en NEW, reponía el stock y luego lo
--  pasaba a CANCEL SIN volver a exigir NEW. Si cocina lo aceptaba en ese
--  segundo, el pedido quedaba cancelado con la comanda ya impresa.
--
--  No basta con añadir `status = 'NEW'` al UPDATE desde la app:
--  `restock_order` (079) no repone nada si el pedido ya está en CANCEL, así
--  que el stock tiene que volver ANTES del cambio de estado y solo si el
--  cambio entra. Eso es una transacción: se bloquea la fila (`for update`),
--  se comprueba NEW, se repone y se cancela, igual que `void_order`.
--
--  Devuelve true si canceló, false si el pedido no existe en ese
--  restaurante o ya no está en NEW (cocina llegó antes).
--
--  Idempotente. Ejecutar DESPUÉS de 001..142. El código nuevo funciona sin
--  ella (vuelve al camino de antes), así que puede aplicarse antes o
--  después del despliegue; hasta que corra, la carrera sigue abierta.
-- ============================================================

create or replace function public.cancel_public_order(p_order_id uuid, p_restaurant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
    from orders
   where id = p_order_id
     and restaurant_id = p_restaurant_id
     for update;

  if v_status is distinct from 'NEW' then
    return false;
  end if;

  -- El status aún es NEW, así que restock_order sí actúa.
  perform restock_order(p_order_id);

  update orders
     set status = 'CANCEL', cancelled_at = now()
   where id = p_order_id;

  return true;
end;
$$;

-- Solo el servidor (clave de servicio) la llama, como el resto (mig 084).
revoke execute on function public.cancel_public_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_public_order(uuid, uuid) to service_role;
