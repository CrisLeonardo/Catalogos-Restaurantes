-- ============================================================
--  144 · Anular un pedido devuelve los puntos y el uso del cupón (PROD-11)
--  ------------------------------------------------------------
--  AUDITORIA_SALIDA_PRODUCCION_2026-10-09. `void_order` y la cancelación
--  del comensal devolvían el stock, pero no:
--    · los puntos que el cliente canjeó en ese pedido
--      (`leogin_loyalty_redeem_reward`, y el canje directo `REDEEM` de los
--      pedidos viejos), ni la existencia de la recompensa canjeada;
--    · el uso del cupón (`increment_coupon_usage`): un cupón de «máximo 50
--      usos» se gastaba con pedidos que nunca se cobraron.
--
--  `leogin_devolver_canjes(pedido)` hace las dos cosas y la llaman
--  `void_order` y `cancel_public_order` DENTRO de su transacción, con la
--  fila del pedido ya bloqueada y antes de pasarlo a CANCEL. Deja la marca
--  `orders.canjes_devueltos_at`: llamarla dos veces no devuelve dos veces
--  ni los puntos ni el uso del cupón.
--
--  Lo que NO hace: quitar los puntos GANADOS por el pedido (se ganan al
--  entregar o servir; anular un pedido servido los deja) ni descontar el
--  canje del límite por cliente de la recompensa. Quedan anotados.
--
--  Redefine `void_order` (126) y `cancel_public_order` (143) con la misma
--  firma. Idempotente. Ejecutar DESPUÉS de 001..143. No depende del código.
-- ============================================================

alter table orders add column if not exists canjes_devueltos_at timestamptz;

comment on column orders.canjes_devueltos_at is
  'Cuándo se devolvieron los puntos canjeados y el uso del cupón al anular (migración 144). Null = nunca.';

create or replace function public.leogin_devolver_canjes(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid    uuid;
  v_coupon uuid;
  r        record;
begin
  -- La marca va primero: si ya estaba puesta, no hay nada que devolver.
  update orders
     set canjes_devueltos_at = now()
   where id = p_order_id and canjes_devueltos_at is null
  returning restaurant_id, coupon_id into v_rid, v_coupon;
  if v_rid is null then
    return;
  end if;

  -- El uso del cupón (createOrder lo suma solo si hubo descuento).
  if v_coupon is not null then
    update coupons set uses = greatest(0, uses - 1) where id = v_coupon;
  end if;

  -- Los puntos canjeados, con un movimiento inverso por cliente.
  for r in
    select customer_id, -sum(points)::integer as pts
      from loyalty_transactions
     where order_id = p_order_id
       and tipo in ('REDEEM', 'REDEEM_REWARD')
       and points < 0
     group by customer_id
  loop
    insert into loyalty_transactions (restaurant_id, customer_id, order_id, tipo, points, note)
    values (v_rid, r.customer_id, p_order_id, 'REFUND', r.pts, 'Devolución: pedido anulado');

    update loyalty_accounts
       set points_balance = points_balance + r.pts,
           updated_at = now()
     where restaurant_id = v_rid and customer_id = r.customer_id;
  end loop;

  -- La recompensa canjeada vuelve a estar disponible si llevaba existencias.
  update loyalty_rewards lr
     set stock = lr.stock + x.n
    from (
      select reward_id, count(*)::integer as n
        from loyalty_transactions
       where order_id = p_order_id and tipo = 'REDEEM_REWARD' and reward_id is not null
       group by reward_id
    ) x
   where lr.id = x.reward_id and lr.stock is not null;
end;
$$;

revoke execute on function public.leogin_devolver_canjes(uuid) from public, anon, authenticated;
grant execute on function public.leogin_devolver_canjes(uuid) to service_role;

-- ── void_order (126) + devolución ─────────────────────────────
create or replace function void_order(
  p_order_id     uuid,
  p_reason       text,
  p_requested_by uuid,
  p_approved_by  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid    uuid;
  v_status text;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'El motivo es obligatorio' using errcode = 'P0001';
  end if;

  select restaurant_id, status into v_rid, v_status from orders where id = p_order_id for update;
  if v_rid is null then
    raise exception 'Pedido no encontrado' using errcode = 'P0001';
  end if;
  if v_status in ('CANCEL', 'DELIVERED') then
    raise exception 'Este pedido ya está cerrado' using errcode = 'P0001';
  end if;

  insert into order_voids (restaurant_id, order_id, item_id, quantity, reason, requested_by, approved_by)
  values (v_rid, p_order_id, null, null, p_reason, p_requested_by, p_approved_by);

  -- Reposición de stock idempotente (migración 021); el status aún no es
  -- CANCEL en este punto así que sí actúa.
  perform restock_order(p_order_id);
  -- Puntos canjeados y uso del cupón (esta migración).
  perform leogin_devolver_canjes(p_order_id);

  update orders set status = 'CANCEL', cancelled_at = now() where id = p_order_id;
end;
$$;

-- ── cancel_public_order (143) + devolución ────────────────────
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
  perform leogin_devolver_canjes(p_order_id);

  update orders
     set status = 'CANCEL', cancelled_at = now()
   where id = p_order_id;

  return true;
end;
$$;
