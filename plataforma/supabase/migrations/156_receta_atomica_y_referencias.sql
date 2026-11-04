-- ============================================================
--  156 · Receta atómica, orden de categorías atómico y candados
--        entre restaurantes
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.7 (X08, X11, X12). Reproducido en la
--  base local antes de este cambio:
--
--   · X08 — guardar una receta borraba sus líneas y DESPUÉS insertaba las
--     nuevas, en dos llamadas. Si la inserción fallaba, la receta quedaba
--     vacía. → `leogin_reemplazar_receta`: todo o nada, en una transacción.
--
--   · X11 — una línea de receta aceptaba el insumo de OTRO restaurante, y
--     el costo del platillo pasaba a ser el precio ajeno (el trigger de
--     costo de la 037 lo copia). Lo mismo podía pasar con los renglones de
--     una compra, el proveedor de una compra, el repartidor de un pedido o
--     el usuario de un repartidor: los ids vienen de formularios y el
--     código escribe con service role, que se salta RLS.
--     → triggers que comprueban, en la base, que cada referencia sea del
--       mismo restaurante. Valen para cualquier camino de escritura.
--
--   · X12 — subir/bajar una categoría eran dos UPDATE sueltos con la
--     posición que mandaba el navegador; con dos categorías en la misma
--     posición, «subir» no encontraba vecina. → `leogin_mover_categoria`:
--     bloquea, renumera sin huecos ni repetidos y cambia de lugar.
--
--  Los triggers solo miran escrituras NUEVAS: si en alguna base ya hay una
--  fila cruzada, no impide aplicar esta migración (el verificador de
--  migraciones la cuenta aparte).
--
--  Aplicar ANTES de desplegar: el código nuevo llama a las dos funciones.
-- ============================================================

-- ── Candados: misma casa ─────────────────────────────────────

-- Receta: el platillo y el insumo, del mismo restaurante.
create or replace function leogin_candado_receta_mismo_restaurante()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prod uuid;
  v_ing  uuid;
begin
  select restaurant_id into v_prod from products where id = NEW.product_id;
  select restaurant_id into v_ing from ingredients where id = NEW.ingredient_id;
  if v_prod is distinct from v_ing then
    raise exception 'El insumo no es de este restaurante.' using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists candado_receta_mismo_restaurante on recipe_items;
create trigger candado_receta_mismo_restaurante
  before insert or update of product_id, ingredient_id on recipe_items
  for each row execute function leogin_candado_receta_mismo_restaurante();

-- Renglón de compra: el producto o insumo, del restaurante de la compra.
create or replace function leogin_candado_compra_item_mismo_restaurante()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_po  uuid;
  v_ref uuid;
begin
  select restaurant_id into v_po from purchase_orders where id = NEW.purchase_order_id;
  if NEW.product_id is not null then
    select restaurant_id into v_ref from products where id = NEW.product_id;
    if v_ref is distinct from v_po then
      raise exception 'El producto no es de este restaurante.' using errcode = 'check_violation';
    end if;
  end if;
  if NEW.ingredient_id is not null then
    select restaurant_id into v_ref from ingredients where id = NEW.ingredient_id;
    if v_ref is distinct from v_po then
      raise exception 'El insumo no es de este restaurante.' using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists candado_compra_item_mismo_restaurante on purchase_order_items;
create trigger candado_compra_item_mismo_restaurante
  before insert or update of purchase_order_id, product_id, ingredient_id on purchase_order_items
  for each row execute function leogin_candado_compra_item_mismo_restaurante();

-- Compra: el proveedor, del mismo restaurante.
create or replace function leogin_candado_compra_proveedor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref uuid;
begin
  if NEW.supplier_id is not null then
    select restaurant_id into v_ref from suppliers where id = NEW.supplier_id;
    if v_ref is distinct from NEW.restaurant_id then
      raise exception 'El proveedor no es de este restaurante.' using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists candado_compra_proveedor on purchase_orders;
create trigger candado_compra_proveedor
  before insert or update of supplier_id, restaurant_id on purchase_orders
  for each row execute function leogin_candado_compra_proveedor();

-- Pedido: el repartidor asignado, del mismo restaurante. Solo corre cuando
-- la escritura toca driver_id: no pesa en el resto de cambios de un pedido.
create or replace function leogin_candado_pedido_repartidor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref uuid;
begin
  if NEW.driver_id is not null then
    select restaurant_id into v_ref from drivers where id = NEW.driver_id;
    if v_ref is distinct from NEW.restaurant_id then
      raise exception 'El repartidor no es de este restaurante.' using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists candado_pedido_repartidor on orders;
create trigger candado_pedido_repartidor
  before insert or update of driver_id on orders
  for each row execute function leogin_candado_pedido_repartidor();

-- Repartidor: el usuario que lo opera, del personal de ese restaurante
-- (perfil propio o membresía activa, migración 113).
create or replace function leogin_candado_repartidor_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.profile_id is not null
     and not exists (select 1 from profiles p where p.id = NEW.profile_id and p.restaurant_id = NEW.restaurant_id)
     and not exists (select 1 from restaurant_members m
                      where m.user_id = NEW.profile_id and m.restaurant_id = NEW.restaurant_id and m.status = 'active')
  then
    raise exception 'Ese usuario no es del personal de este restaurante.' using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists candado_repartidor_usuario on drivers;
create trigger candado_repartidor_usuario
  before insert or update of profile_id, restaurant_id on drivers
  for each row execute function leogin_candado_repartidor_usuario();

-- Las funciones de trigger no se llaman a mano.
revoke execute on function leogin_candado_receta_mismo_restaurante() from public, anon, authenticated;
revoke execute on function leogin_candado_compra_item_mismo_restaurante() from public, anon, authenticated;
revoke execute on function leogin_candado_compra_proveedor() from public, anon, authenticated;
revoke execute on function leogin_candado_pedido_repartidor() from public, anon, authenticated;
revoke execute on function leogin_candado_repartidor_usuario() from public, anon, authenticated;

-- ── Receta: reemplazo atómico ────────────────────────────────
-- p_lineas: [{"ingredient_id": "...", "quantity": 150}, ...]. Lista vacía =
-- quitar la receta. Si algo no cuadra, no se toca nada y se explica.
create or replace function leogin_reemplazar_receta(
  p_restaurant_id uuid,
  p_product_id    uuid,
  p_lineas        jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas int;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Receta inválida.' using errcode = 'invalid_parameter_value';
  end if;

  -- El platillo es de este restaurante; se bloquea para que dos guardados
  -- a la vez no se mezclen.
  perform 1 from products where id = p_product_id and restaurant_id = p_restaurant_id for update;
  if not found then
    raise exception 'Producto no encontrado.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from jsonb_to_recordset(p_lineas) as l(ingredient_id uuid, quantity numeric)
              where l.ingredient_id is null or l.quantity is null or l.quantity <= 0 or l.quantity = 'NaN'::numeric) then
    raise exception 'Cada ingrediente necesita una cantidad mayor que cero.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lineas) as l(ingredient_id uuid, quantity numeric)
              group by l.ingredient_id having count(*) > 1) then
    raise exception 'Un ingrediente aparece dos veces en la receta.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lineas) as l(ingredient_id uuid, quantity numeric)
              left join ingredients i on i.id = l.ingredient_id and i.restaurant_id = p_restaurant_id
              where i.id is null) then
    raise exception 'El insumo no es de este restaurante.' using errcode = 'check_violation';
  end if;

  delete from recipe_items where product_id = p_product_id;
  insert into recipe_items (product_id, ingredient_id, quantity)
    select p_product_id, l.ingredient_id, l.quantity
      from jsonb_to_recordset(p_lineas) as l(ingredient_id uuid, quantity numeric);
  get diagnostics v_lineas = row_count;
  return v_lineas;
end;
$$;

revoke execute on function leogin_reemplazar_receta(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function leogin_reemplazar_receta(uuid, uuid, jsonb) to service_role;

-- ── Categorías: mover una posición, atómico ──────────────────
-- p_direccion: -1 sube, +1 baja. Devuelve false si ya está en el borde.
create or replace function leogin_mover_categoria(
  p_restaurant_id uuid,
  p_category_id   uuid,
  p_direccion     int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos     int;
  v_total   int;
  v_vecina  uuid;
begin
  if p_direccion not in (-1, 1) then
    raise exception 'Dirección inválida.' using errcode = 'invalid_parameter_value';
  end if;

  -- Una sola reordenación a la vez por restaurante.
  perform 1 from categories where restaurant_id = p_restaurant_id for update;

  if not exists (select 1 from categories where id = p_category_id and restaurant_id = p_restaurant_id) then
    raise exception 'Categoría no encontrada.' using errcode = 'no_data_found';
  end if;

  -- Renumerar 0..n-1 sin huecos ni repetidos, respetando el orden actual.
  with orden as (
    select id, (row_number() over (order by sort_order, name, id) - 1)::int as pos
      from categories where restaurant_id = p_restaurant_id
  )
  update categories c set sort_order = o.pos
    from orden o
   where c.id = o.id and c.sort_order is distinct from o.pos;

  select sort_order into v_pos from categories where id = p_category_id;
  select count(*) into v_total from categories where restaurant_id = p_restaurant_id;
  if v_pos + p_direccion < 0 or v_pos + p_direccion >= v_total then
    return false;
  end if;

  select id into v_vecina from categories
   where restaurant_id = p_restaurant_id and sort_order = v_pos + p_direccion;

  update categories set sort_order = v_pos + p_direccion where id = p_category_id;
  update categories set sort_order = v_pos where id = v_vecina;
  return true;
end;
$$;

revoke execute on function leogin_mover_categoria(uuid, uuid, int) from public, anon, authenticated;
grant execute on function leogin_mover_categoria(uuid, uuid, int) to service_role;
