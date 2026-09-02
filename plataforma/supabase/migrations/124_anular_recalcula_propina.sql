-- ============================================================
--  Migración 124 — Anular un plato recalcula la propina
--  ------------------------------------------------------------
--  `void_order_item` (migración 079) bajaba `subtotal` y `total` por
--  el importe del plato anulado, pero dejaba `tip` intacto.
--
--  Consecuencia real: se anula el plato caro de una mesa y la cuenta
--  sigue cobrando la propina calculada sobre comida que ya no existe.
--  Con una propina del 10 % y un plato de Q200 anulado, la mesa paga
--  Q20 de propina de más — y el desglose de la cuenta lo enseña, así
--  que además se nota.
--
--  Aquí la propina se recalcula EN PROPORCIÓN a lo que queda: es el
--  mismo criterio con el que se cobró (un porcentaje del consumo), y
--  el único que sigue cuadrando cuando el consumo cambia. Si el
--  pedido no llevaba propina, nada cambia.
--
--  El total baja por las dos cosas: el plato y la parte de propina
--  que le tocaba.
--
--  Idempotente (`create or replace`). Ejecutar DESPUÉS de 001..123.
-- ============================================================

create or replace function void_order_item(
  p_order_item_id uuid,
  p_order_id      uuid,
  p_quantity      int,
  p_reason        text,
  p_requested_by  uuid,
  p_approved_by   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid          uuid;
  v_status       text;
  v_item_qty     int;
  v_price        numeric;
  v_pid          uuid;
  v_track        boolean;
  v_already_void int;
  v_remaining    int;
  v_amount       numeric;
  v_new_stock    int;
  v_old_subtotal numeric;
  v_old_tip      numeric;
  v_new_tip      numeric;
  v_tip_delta    numeric;
  v_new_subtotal numeric;
  v_new_total    numeric;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'El motivo es obligatorio' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Cantidad inválida' using errcode = 'P0001';
  end if;

  select o.restaurant_id, o.status, o.subtotal, coalesce(o.tip, 0)
    into v_rid, v_status, v_old_subtotal, v_old_tip
    from orders o
   where o.id = p_order_id
     for update;

  if v_rid is null then
    raise exception 'Pedido no encontrado' using errcode = 'P0001';
  end if;
  if v_status in ('CANCEL', 'DELIVERED') then
    raise exception 'Este pedido ya está cerrado' using errcode = 'P0001';
  end if;

  select oi.quantity, oi.price_snapshot, oi.product_id
    into v_item_qty, v_price, v_pid
    from order_items oi
   where oi.id = p_order_item_id and oi.order_id = p_order_id
     for update;

  if v_item_qty is null then
    raise exception 'Ítem no encontrado en este pedido' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0) into v_already_void
    from order_voids where item_id = p_order_item_id;

  v_remaining := v_item_qty - v_already_void;
  if p_quantity > v_remaining then
    raise exception 'Solo quedan % unidades de este ítem por anular', v_remaining
      using errcode = 'P0001';
  end if;

  v_amount := v_price * p_quantity;

  -- ── La propina, en proporción a lo que queda ──────────────
  -- Sin propina, o con un subtotal que ya era cero, no hay nada que
  -- repartir y el cálculo se salta entero (evita además dividir por 0).
  v_new_subtotal := greatest(0, v_old_subtotal - v_amount);
  if v_old_tip > 0 and v_old_subtotal > 0 then
    v_new_tip   := round(v_old_tip * (v_new_subtotal / v_old_subtotal), 2);
    v_tip_delta := v_old_tip - v_new_tip;
  else
    v_new_tip   := v_old_tip;
    v_tip_delta := 0;
  end if;

  update orders set
    subtotal = v_new_subtotal,
    tip      = v_new_tip,
    total    = greatest(0, total - v_amount - v_tip_delta)
  where id = p_order_id
  returning subtotal, total into v_new_subtotal, v_new_total;

  -- Reposición parcial de stock (mismo criterio que restock_order, migración 021).
  select track_stock into v_track from products where id = v_pid;
  if coalesce(v_track, false) then
    update products set
      stock          = coalesce(stock, 0) + p_quantity,
      is_available   = case when coalesce(stock, 0) <= 0 then true else is_available end,
      unavailable_at = case when coalesce(stock, 0) <= 0 then null else unavailable_at end
    where id = v_pid
    returning stock into v_new_stock;

    insert into stock_movements (restaurant_id, product_id, delta, reason, balance_after)
    values (v_rid, v_pid, p_quantity, 'cancel', v_new_stock);
  end if;

  insert into order_voids (restaurant_id, order_id, item_id, quantity, reason, requested_by, approved_by)
  values (v_rid, p_order_id, p_order_item_id, p_quantity, p_reason, p_requested_by, p_approved_by);

  return jsonb_build_object('subtotal', v_new_subtotal, 'total', v_new_total, 'tip', v_new_tip);
end;
$$;

comment on function void_order_item is
  'Anula N unidades de un ítem sin cerrar el pedido, dejando auditoría en '
  'order_voids. Desde la migración 124 recalcula la propina en proporción al '
  'consumo que queda: antes se seguía cobrando la propina del plato anulado.';
