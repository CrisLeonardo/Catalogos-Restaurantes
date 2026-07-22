-- ============================================================
--  Migración 088 — Kardex de costo promedio sobre proveedores
--  ------------------------------------------------------------
--  Hasta ahora una orden de compra (040_proveedores.sql) era solo
--  un registro contable: marcarla "RECIBIDA" no tocaba inventario
--  ni costo. Esta migración conecta la compra real con:
--    · products.stock / products.cost   (productos vendidos tal cual)
--    · ingredients.stock / cost_per_unit (insumos de receta —
--      el trigger de 037_recetas.sql ya recalcula products.cost
--      de los platillos que usan ese insumo)
--  usando costo promedio ponderado (weighted average), el método
--  estándar de Kardex. stock_movements pasa a ser el ledger formal
--  (ya no solo de productos: ahora también de insumos, y con el
--  costo de cada movimiento + el promedio resultante).
--  Ejecutar DESPUÉS de 001..087.
-- ============================================================

-- ── Vínculo opcional de cada renglón de compra a un item real ──
-- Antes purchase_order_items.descripcion era solo texto libre; ahora
-- puede además apuntar a un producto (si se vende tal cual, ej. una
-- bebida embotellada) o a un insumo de receta (ej. harina, carne) —
-- nunca ambos. Sigue permitiendo texto libre sin vínculo (ej. un
-- gasto que no es inventario, "servicio de limpieza").
alter table purchase_order_items
  add column if not exists product_id    uuid references products(id) on delete set null,
  add column if not exists ingredient_id uuid references ingredients(id) on delete set null;

alter table purchase_order_items drop constraint if exists purchase_order_items_link_check;
alter table purchase_order_items
  add constraint purchase_order_items_link_check
  check (not (product_id is not null and ingredient_id is not null));

-- ── Insumos: ahora también llevan cantidad en existencia ────────
-- Antes ingredients solo tenía costo/unidad (para calcular food cost),
-- sin noción de cuánto hay en bodega. Necesario para el promedio
-- ponderado: sin saber "cuánto había", no se puede ponderar "cuánto
-- llegó".
alter table ingredients
  add column if not exists stock numeric(12,3) not null default 0;

comment on column ingredients.stock is
  'Cantidad en existencia (misma unidad que ingredients.unit). Entra por leogin_receive_purchase_order; no se descuenta automático al vender (las recetas no controlan merma/consumo por venta, solo costeo).';

-- ── stock_movements: ledger formal (Kardex) ──────────────────────
-- delta/balance_after eran int (solo productos, unidades enteras);
-- se amplían a numeric para poder registrar movimientos de insumos
-- con cantidades fraccionarias (kg, L, etc.) sin perder los enteros
-- ya guardados de productos.
alter table stock_movements
  alter column delta type numeric(12,3) using delta::numeric(12,3),
  alter column balance_after type numeric(12,3) using balance_after::numeric(12,3);

alter table stock_movements
  add column if not exists ingredient_id  uuid references ingredients(id) on delete set null,
  add column if not exists unit_cost      numeric(12,4),
  add column if not exists avg_cost_after numeric(12,4);

comment on column stock_movements.unit_cost is
  'Costo unitario de ESTE movimiento (solo se registra en reason=purchase). Null en venta/cancelación/ajuste — esos movimientos no cambian el costo.';
comment on column stock_movements.avg_cost_after is
  'Costo promedio ponderado del producto/insumo inmediatamente después de este movimiento (solo reason=purchase).';

create index if not exists stock_movements_ingredient_idx
  on stock_movements(ingredient_id, created_at desc);

-- ── RPC: recibir una orden de compra ─────────────────────────────
-- Aplica costo promedio ponderado a cada renglón vinculado a un
-- producto o insumo real, suma el stock correspondiente, y marca la
-- orden como RECIBIDA. Idempotente (si ya está RECIBIDA, no repite
-- el efecto — mismo patrón que restock_order en 021_inventario.sql).
-- Bloquea las filas de producto/insumo antes de leerlas (FOR UPDATE)
-- para que dos recepciones concurrentes no calculen el promedio con
-- datos obsoletos.
create or replace function leogin_receive_purchase_order(p_po_id uuid, p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado     text;
  r            record;
  v_old_stock  numeric;
  v_old_cost   numeric;
  v_new_stock  numeric;
  v_new_cost   numeric;
begin
  select estado into v_estado
    from purchase_orders
    where id = p_po_id and restaurant_id = p_restaurant_id
    for update;

  if v_estado is null then
    raise exception 'Orden de compra no encontrada' using errcode = 'P0001';
  end if;
  if v_estado = 'RECIBIDA' then
    return; -- ya procesada, no duplicar stock/costo
  end if;
  if v_estado = 'CANCELADA' then
    raise exception 'No se puede recibir una orden cancelada' using errcode = 'P0001';
  end if;

  for r in
    select id, product_id, ingredient_id, cantidad, costo_unitario
      from purchase_order_items
      where purchase_order_id = p_po_id
  loop
    if r.product_id is not null then
      select coalesce(stock, 0), coalesce(cost, 0) into v_old_stock, v_old_cost
        from products where id = r.product_id and restaurant_id = p_restaurant_id
        for update;

      v_new_stock := greatest(v_old_stock, 0) + r.cantidad;
      v_new_cost  := (greatest(v_old_stock, 0) * v_old_cost + r.cantidad * r.costo_unitario) / v_new_stock;

      update products set
        stock          = round(v_new_stock)::int,
        cost           = round(v_new_cost, 4),
        track_stock    = true,
        is_available   = true,
        unavailable_at = null
      where id = r.product_id;

      insert into stock_movements
        (restaurant_id, product_id, delta, reason, balance_after, unit_cost, avg_cost_after)
      values
        (p_restaurant_id, r.product_id, r.cantidad, 'purchase', round(v_new_stock), r.costo_unitario, round(v_new_cost, 4));

    elsif r.ingredient_id is not null then
      select coalesce(stock, 0), coalesce(cost_per_unit, 0) into v_old_stock, v_old_cost
        from ingredients where id = r.ingredient_id and restaurant_id = p_restaurant_id
        for update;

      v_new_stock := greatest(v_old_stock, 0) + r.cantidad;
      v_new_cost  := (greatest(v_old_stock, 0) * v_old_cost + r.cantidad * r.costo_unitario) / v_new_stock;

      update ingredients set
        stock         = v_new_stock,
        cost_per_unit = round(v_new_cost, 4)
      where id = r.ingredient_id;
      -- dispara ingredient_cost_sync (037_recetas.sql): recalcula
      -- products.cost de cada platillo que usa este insumo.

      insert into stock_movements
        (restaurant_id, ingredient_id, delta, reason, balance_after, unit_cost, avg_cost_after)
      values
        (p_restaurant_id, r.ingredient_id, r.cantidad, 'purchase', round(v_new_stock, 3), r.costo_unitario, round(v_new_cost, 4));
    end if;
    -- renglones sin product_id ni ingredient_id: solo contables, no tocan inventario.
  end loop;

  update purchase_orders set estado = 'RECIBIDA', received_at = now()
    where id = p_po_id;
end;
$$;

-- Igual que el resto de funciones desde 084: solo service_role
-- (default privileges de 084 ya lo revoca de anon/authenticated,
-- esto lo deja explícito e idempotente).
revoke execute on function leogin_receive_purchase_order(uuid, uuid) from anon, authenticated;
grant execute on function leogin_receive_purchase_order(uuid, uuid) to service_role;

-- ── Hallazgo real (encontrado probando el Kardex): la cascada de costo
--    de recetas (037_recetas.sql) quedaba "un paso atrás" ────────────
-- ingredient_cost_sync era BEFORE UPDATE: leogin_recompute_recipe_cost
-- vuelve a leer ingredients desde la tabla (para sumar TODOS los
-- insumos de la receta, no solo el que cambió), pero en un trigger
-- BEFORE la fila todavía no se escribió — esa lectura ve el costo
-- ANTERIOR, no el nuevo. Efecto real: cada vez que el costo de un
-- insumo cambiaba (a mano en /admin/ingredientes, o ahora por Kardex),
-- el costo del platillo se recalculaba con el valor de la ACTUALIZACIÓN
-- ANTERIOR, nunca con el vigente — hasta el siguiente cambio. Solo se
-- veía correcto por accidente cuando el costo cambiaba una sola vez.
-- Fix: separar el `updated_at` (necesita ser BEFORE, modifica NEW) de
-- la cascada de receta (necesita ser AFTER, para leer el costo ya
-- escrito).
drop trigger if exists ingredient_cost_sync on ingredients;

create or replace function leogin_ingredient_touch_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists ingredient_touch_updated_at on ingredients;
create trigger ingredient_touch_updated_at
  before update on ingredients
  for each row execute function leogin_ingredient_touch_updated_at();

create or replace function leogin_ingredient_price_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if NEW.cost_per_unit is distinct from OLD.cost_per_unit then
    for r in
      select distinct product_id from recipe_items where ingredient_id = NEW.id
    loop
      perform leogin_recompute_recipe_cost(r.product_id);
    end loop;
  end if;
  return NEW;
end;
$$;

create trigger ingredient_cost_sync
  after update on ingredients
  for each row execute function leogin_ingredient_price_changed();
