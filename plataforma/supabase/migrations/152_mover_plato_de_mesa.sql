-- ============================================================
--  152 · Mover un plato ya enviado a otra mesa
--  ------------------------------------------------------------
--  «Ese pepián era de la mesa 7, no de la 5.» En Toast o Lightspeed se
--  llama «transferir ítems»: el plato cambia de cuenta sin anularlo ni
--  volverlo a mandar a cocina (ya está hecho). Aquí no existía: la única
--  salida era anular con PIN y volver a apuntarlo, que deja una venta
--  anulada que no lo fue y vuelve a imprimir la comanda.
--
--  move_order_item(item, cantidad, mesa destino) en UNA transacción:
--    · valida que el plato siga en pie (lo anulado no se mueve) y que la
--      cuenta de origen no tenga cobros, descuentos, cupón, tarjeta de
--      regalo ni canje de puntos — repartir eso entre dos cuentas
--      descuadraría el arqueo, y Caja tiene sus propias herramientas;
--    · busca la cuenta abierta de la mesa destino (sin cobros ni
--      descuentos); si no hay, crea una con su número de pedido y el
--      mismo estado de cocina del plato;
--    · mueve la línea entera o la parte con una línea nueva;
--    · baja subtotal, propina y total del origen —la propina en
--      proporción, como anular (migración 124)— y sube los del destino
--      con la propina que le tocaba a ese plato. El dinero se conserva;
--    · si el origen se queda sin nada en pie, se cierra como cancelado
--      con la nota «Movido a la mesa N», para que la mesa no siga
--      ocupada con una cuenta de Q0.
--  Solo la llama el servidor (service_role), después de comprobar el
--  acceso a la mesa.
--
--  Idempotente (`create or replace`). Aplicar ANTES de desplegar: sin
--  ella el botón «Pasar a otra mesa» responde que falta la migración.
-- ============================================================

create or replace function public.move_order_item(
  p_order_item_id uuid,
  p_quantity      int,
  p_target_table  int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src          orders%rowtype;
  v_item         order_items%rowtype;
  v_voided       int;
  v_remaining    int;
  v_amount       numeric;
  v_src_sub      numeric;
  v_src_tip      numeric;
  v_tip_delta    numeric;
  v_dst_id       uuid;
  v_created      boolean := false;
  v_year_int     int;
  v_num          int;
  v_new_item_id  uuid;
  v_live         int;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Cantidad inválida' using errcode = 'P0001';
  end if;
  if p_target_table is null or p_target_table < 1 then
    raise exception 'Mesa destino inválida' using errcode = 'P0001';
  end if;

  select * into v_item from order_items where id = p_order_item_id for update;
  if v_item.id is null then
    raise exception 'Plato no encontrado' using errcode = 'P0001';
  end if;

  select * into v_src from orders where id = v_item.order_id for update;
  if v_src.order_type <> 'DINE_IN' then
    raise exception 'Solo se mueven platos de una mesa' using errcode = 'P0001';
  end if;
  if v_src.status in ('CANCEL', 'DELIVERED') then
    raise exception 'Esta cuenta ya está cerrada' using errcode = 'P0001';
  end if;
  if v_src.table_number = p_target_table then
    raise exception 'El plato ya es de esa mesa' using errcode = 'P0001';
  end if;
  if coalesce(v_src.discount, 0) > 0 or v_src.coupon_id is not null or v_src.gift_card_id is not null
     or coalesce(v_src.loyalty_discount, 0) > 0
     or exists (select 1 from order_payments where order_id = v_src.id) then
    raise exception 'Esta cuenta ya tiene un cobro o un descuento: muévelo desde Caja o quita el descuento antes'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0) into v_voided from order_voids where item_id = v_item.id;
  v_remaining := v_item.quantity - v_voided;
  if p_quantity > v_remaining then
    raise exception 'Solo quedan % de este plato en la cuenta', v_remaining using errcode = 'P0001';
  end if;

  -- ── La cuenta destino ──────────────────────────────────────
  select o.id into v_dst_id
    from orders o
   where o.restaurant_id = v_src.restaurant_id
     and o.order_type = 'DINE_IN'
     and o.table_number = p_target_table
     and o.status not in ('CANCEL', 'DELIVERED')
     and coalesce(o.discount, 0) = 0 and o.coupon_id is null and o.gift_card_id is null
     and coalesce(o.loyalty_discount, 0) = 0
     and not exists (select 1 from order_payments op where op.order_id = o.id)
   order by o.created_at desc
   limit 1
   for update;

  if v_dst_id is null then
    v_year_int := date_part('year', now() at time zone 'UTC')::int;
    insert into order_counters (restaurant_id, year, last_number)
    values (v_src.restaurant_id, v_year_int, 1)
    on conflict (restaurant_id, year)
    do update set last_number = order_counters.last_number + 1
    returning last_number into v_num;

    insert into orders (
      restaurant_id, order_number, customer_name, customer_phone, order_type,
      address, table_number, payment_method, tip, status, subtotal, delivery_fee, total,
      notes, waiter_id, accepted_at, ready_at, served_at
    ) values (
      v_src.restaurant_id,
      'ORD-' || v_year_int::text || '-' || lpad(v_num::text, 5, '0'),
      'Mesa ' || p_target_table, '', 'DINE_IN',
      'Mesa ' || p_target_table, p_target_table, 'CASH', 0, v_src.status, 0, 0, 0,
      null, v_src.waiter_id, v_src.accepted_at, v_src.ready_at, v_src.served_at
    )
    returning id into v_dst_id;
    v_created := true;
  end if;

  -- ── La línea: entera, o la parte que se va ─────────────────
  v_amount := v_item.price_snapshot * p_quantity;

  if p_quantity = v_item.quantity and v_voided = 0 then
    update order_items set order_id = v_dst_id where id = v_item.id;
    v_new_item_id := v_item.id;
  else
    update order_items set
      quantity = quantity - p_quantity,
      subtotal = price_snapshot * (quantity - p_quantity)
    where id = v_item.id;

    insert into order_items (
      order_id, product_id, name_snapshot, price_snapshot, cost_snapshot,
      quantity, subtotal, options_snapshot, note, is_reward, reward_id, seat_no, served_at
    ) values (
      v_dst_id, v_item.product_id, v_item.name_snapshot, v_item.price_snapshot, v_item.cost_snapshot,
      p_quantity, v_amount, v_item.options_snapshot, v_item.note, v_item.is_reward, v_item.reward_id,
      null, v_item.served_at
    )
    returning id into v_new_item_id;
  end if;

  -- El asiento era de la otra mesa: en la nueva no significa nada.
  update order_items set seat_no = null where id = v_new_item_id;

  -- ── El dinero: sale del origen y entra al destino ──────────
  v_src_sub := greatest(0, coalesce(v_src.subtotal, 0) - v_amount);
  v_src_tip := coalesce(v_src.tip, 0);
  if v_src_tip > 0 and coalesce(v_src.subtotal, 0) > 0 then
    v_tip_delta := v_src_tip - round(v_src_tip * (v_src_sub / v_src.subtotal), 2);
  else
    v_tip_delta := 0;
  end if;

  update orders set
    subtotal = v_src_sub,
    tip      = v_src_tip - v_tip_delta,
    total    = greatest(0, coalesce(total, 0) - v_amount - v_tip_delta)
  where id = v_src.id;

  update orders set
    subtotal = coalesce(subtotal, 0) + v_amount,
    tip      = coalesce(tip, 0) + v_tip_delta,
    total    = coalesce(total, 0) + v_amount + v_tip_delta
  where id = v_dst_id;

  -- ── Si el origen se quedó vacío, se cierra ─────────────────
  select count(*) into v_live
    from order_items oi
   where oi.order_id = v_src.id
     and oi.quantity > coalesce((select sum(v.quantity) from order_voids v where v.item_id = oi.id), 0);
  if v_live = 0 then
    update orders set
      status       = 'CANCEL',
      cancelled_at = now(),
      notes        = trim(both ' ' from coalesce(notes, '') || ' Movido a la mesa ' || p_target_table)
    where id = v_src.id;
  end if;

  return jsonb_build_object(
    'target_order_id', v_dst_id,
    'created', v_created,
    'item_id', v_new_item_id,
    'source_closed', v_live = 0
  );
end;
$$;

revoke execute on function public.move_order_item(uuid, int, int) from public, anon, authenticated;
grant execute on function public.move_order_item(uuid, int, int) to service_role;

comment on function public.move_order_item(uuid, int, int) is
  'Mueve N unidades de un plato ya enviado a la cuenta abierta de otra mesa (o le crea una), '
  'repartiendo subtotal, propina y total. Migración 152.';
