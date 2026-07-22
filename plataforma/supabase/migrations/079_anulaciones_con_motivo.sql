-- ============================================================
--  Migración 079 — Anulación de pedido/ítem con motivo + aprobación
--  (Fase 1 auditoría de lanzamiento: anti-fraude y operación de mesero)
--  · order_voids:      auditoría de anulaciones (quién, por qué, quién
--                       aprobó). Sin políticas — solo service_role.
--  · void_order_item:  anula N unidades de UN ítem sin cancelar el
--                       pedido (repone stock parcial, reduce
--                       subtotal/total del pedido).
--  · void_order:       anula el pedido COMPLETO (equivalente a marcar
--                       CANCEL) dejando registro de motivo/aprobador —
--                       reemplaza el cancel directo sin auditoría que
--                       hacía updateOrderStatus.
--  Ejecutar DESPUÉS de 001..078.
-- ============================================================

create table if not exists order_voids (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references restaurants(id) on delete cascade,
  order_id       uuid        not null references orders(id) on delete cascade,
  -- NULL = se anuló el pedido COMPLETO; si no, el id del order_item anulado.
  item_id        uuid        references order_items(id) on delete set null,
  -- Unidades anuladas de ese ítem (NULL cuando item_id es NULL).
  quantity       int,
  reason         text        not null,
  requested_by   uuid        not null references profiles(id),
  -- NULL = el propio solicitante ya tenía permiso de encargado (auto-aprobado).
  approved_by    uuid        references profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists order_voids_order_idx on order_voids(order_id);
create index if not exists order_voids_restaurant_idx on order_voids(restaurant_id, created_at desc);

comment on table order_voids is
  'Auditoría de anulaciones de pedido/ítem (motivo obligatorio + aprobación '
  'de encargado si el pedido ya se envió a cocina). Solo accesible por '
  'service_role (igual que activity_log, stock_movements, etc.) — sin '
  'políticas, RLS deniega todo a anon/authenticated.';

alter table order_voids enable row level security;

-- ── void_order_item: anula N unidades de un ítem sin cerrar el pedido ──
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
  v_new_subtotal numeric;
  v_new_total    numeric;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'El motivo es obligatorio' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Cantidad inválida' using errcode = 'P0001';
  end if;

  select o.restaurant_id, o.status
    into v_rid, v_status
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

  update orders set
    subtotal = greatest(0, subtotal - v_amount),
    total    = greatest(0, total    - v_amount)
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

  return jsonb_build_object('subtotal', v_new_subtotal, 'total', v_new_total);
end;
$$;

comment on function void_order_item is
  'Anula p_quantity unidades de un order_item sin cerrar el pedido: reduce '
  'subtotal/total del pedido, repone stock parcial y audita en order_voids. '
  'p_approved_by NULL = el solicitante ya tenía permiso de encargado.';

-- ── void_order: anula el pedido COMPLETO (motivo + aprobador auditados) ──
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

  -- Reposición de stock idempotente (migración 021); el status aún no es
  -- CANCEL en este punto así que sí actúa.
  perform restock_order(p_order_id);

  update orders set status = 'CANCEL', cancelled_at = now() where id = p_order_id;

  insert into order_voids (restaurant_id, order_id, item_id, quantity, reason, requested_by, approved_by)
  values (v_rid, p_order_id, null, null, p_reason, p_requested_by, p_approved_by);
end;
$$;

comment on function void_order is
  'Anula el pedido COMPLETO (equivalente a status=CANCEL) dejando auditoría '
  'de motivo/aprobador en order_voids. Reemplaza el cancel directo sin '
  'motivo — updateOrderStatus() ya no acepta CANCEL, ver lib/actions/orders.ts.';

-- ── Fix: restock_order (migración 021) no sabía de anulaciones parciales ──
-- Antes de order_voids, restock_order (llamado UNA sola vez por pedido, justo
-- antes de CANCEL) repone la cantidad ORIGINAL de cada order_item. Con
-- void_order_item ahora se puede reponer stock ANTES de que el pedido se
-- cancele por completo — si luego void_order() (o cancelPublicOrder) llama a
-- restock_order sobre ese mismo pedido, repondría esas unidades DOS VECES.
-- Redefinida (misma firma — sin riesgo de sobrecarga ambigua) para descontar
-- lo ya repuesto vía order_voids antes de sumar el resto. Sin filas en
-- order_voids (el caso de siempre) el resultado es idéntico al de antes.
create or replace function restock_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_rid    uuid;
  r        record;
  v_new    int;
begin
  select status, restaurant_id into v_status, v_rid from orders where id = p_order_id;
  if v_status is null or v_status = 'CANCEL' then
    return;  -- inexistente o ya cancelado → no doble-restock
  end if;

  for r in
    select
      oi.product_id as pid,
      oi.quantity - coalesce(
        (select sum(ov.quantity) from order_voids ov where ov.item_id = oi.id), 0
      ) as qty
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.track_stock = true
  loop
    if r.qty <= 0 then continue; end if;

    update products set
      stock          = coalesce(stock, 0) + r.qty,
      is_available   = case when coalesce(stock, 0) <= 0 then true else is_available end,
      unavailable_at = case when coalesce(stock, 0) <= 0 then null else unavailable_at end
    where id = r.pid
    returning stock into v_new;

    insert into stock_movements (restaurant_id, product_id, delta, reason, balance_after)
    values (v_rid, r.pid, r.qty, 'cancel', v_new);
  end loop;
end;
$$;
