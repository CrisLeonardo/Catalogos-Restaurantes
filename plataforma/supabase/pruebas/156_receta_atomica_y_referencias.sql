-- ============================================================
--  Prueba de la migración 156 contra Postgres real
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.7 (PA-T10, PA-T11, X12). Todo ocurre en
--  una transacción que se deshace al final: no deja datos.
--
--  Necesita dos restaurantes con al menos un platillo y una categoría
--  (las semillas locales `rincon502` y `tacos-del-norte-test` sirven).
--
--  Correr desde plataforma/:
--    docker exec -i supabase_db_plataforma psql -U postgres -v ON_ERROR_STOP=1 \
--      < supabase/pruebas/156_receta_atomica_y_referencias.sql
--  Si algo falla, termina con ERROR y el nombre del caso; si todo pasa,
--  imprime «156: todo en orden».
-- ============================================================

begin;

create temp table t_ctx on commit drop as
select (select id from restaurants where slug = 'rincon502')            as ra,
       (select id from restaurants where slug = 'tacos-del-norte-test') as rb;

do $$
declare
  ra uuid := (select ra from t_ctx);
  rb uuid := (select rb from t_ctx);
  plato uuid;
  plato_b uuid;
  queso uuid;
  pan uuid;
  ajeno uuid;
  costo_antes numeric;
  n int;
  cat_a uuid;
  cat_b uuid;
  prov_b uuid;
  oc uuid;
  rep_b uuid;
  pedido uuid;
begin
  if ra is null or rb is null then
    raise exception 'Faltan los restaurantes de prueba (rincon502, tacos-del-norte-test).';
  end if;

  select id into plato from products where restaurant_id = ra order by name limit 1;
  select id into plato_b from products where restaurant_id = rb order by name limit 1;
  insert into ingredients (restaurant_id, name, unit, cost_per_unit) values (ra, 'T queso', 'g', 0.05) returning id into queso;
  insert into ingredients (restaurant_id, name, unit, cost_per_unit) values (ra, 'T pan', 'u', 2) returning id into pan;
  insert into ingredients (restaurant_id, name, unit, cost_per_unit) values (rb, 'T ajeno', 'g', 9.99) returning id into ajeno;

  -- Receta inicial: 200 g de queso → costo 10.
  perform leogin_reemplazar_receta(ra, plato, jsonb_build_array(jsonb_build_object('ingredient_id', queso, 'quantity', 200)));
  select cost into costo_antes from products where id = plato;
  if costo_antes <> 10 then raise exception 'receta inicial: costo % (esperado 10)', costo_antes; end if;

  -- PA-T10: una línea inválida no toca la receta ni el costo anteriores.
  begin
    perform leogin_reemplazar_receta(ra, plato, jsonb_build_array(
      jsonb_build_object('ingredient_id', pan, 'quantity', 1),
      jsonb_build_object('ingredient_id', '00000000-0000-0000-0000-000000000000', 'quantity', 1)));
    raise exception 'PA-T10: aceptó un insumo inexistente';
  exception when check_violation then null;
  end;
  select count(*) into n from recipe_items where product_id = plato;
  if n <> 1 then raise exception 'PA-T10: la receta quedó con % líneas (esperado 1)', n; end if;
  if (select cost from products where id = plato) <> costo_antes then raise exception 'PA-T10: cambió el costo'; end if;

  -- Cantidades inválidas y repetidos.
  begin
    perform leogin_reemplazar_receta(ra, plato, jsonb_build_array(jsonb_build_object('ingredient_id', pan, 'quantity', 0)));
    raise exception 'aceptó cantidad 0';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform leogin_reemplazar_receta(ra, plato, jsonb_build_array(
      jsonb_build_object('ingredient_id', pan, 'quantity', 1),
      jsonb_build_object('ingredient_id', pan, 'quantity', 2)));
    raise exception 'aceptó un ingrediente repetido';
  exception when invalid_parameter_value then null;
  end;

  -- PA-T11 (receta): ni la función ni un INSERT directo aceptan un insumo ajeno.
  begin
    perform leogin_reemplazar_receta(ra, plato, jsonb_build_array(jsonb_build_object('ingredient_id', ajeno, 'quantity', 1)));
    raise exception 'PA-T11: la función aceptó un insumo ajeno';
  exception when check_violation then null;
  end;
  begin
    insert into recipe_items (product_id, ingredient_id, quantity) values (plato, ajeno, 1);
    raise exception 'PA-T11: el INSERT directo aceptó un insumo ajeno';
  exception when check_violation then null;
  end;
  if (select cost from products where id = plato) <> costo_antes then raise exception 'PA-T11: el precio ajeno llegó al costo'; end if;

  -- Platillo de otro restaurante.
  begin
    perform leogin_reemplazar_receta(ra, plato_b, '[]'::jsonb);
    raise exception 'aceptó el platillo de otro restaurante';
  exception when no_data_found then null;
  end;

  -- Reemplazo válido: 2 líneas.
  n := leogin_reemplazar_receta(ra, plato, jsonb_build_array(
    jsonb_build_object('ingredient_id', queso, 'quantity', 100),
    jsonb_build_object('ingredient_id', pan, 'quantity', 1)));
  if n <> 2 then raise exception 'reemplazo válido: % líneas', n; end if;
  if (select cost from products where id = plato) <> 7 then raise exception 'reemplazo válido: costo %', (select cost from products where id = plato); end if;

  -- PA-T11 (compras): proveedor y renglones ajenos.
  insert into suppliers (restaurant_id, name) values (rb, 'T proveedor ajeno') returning id into prov_b;
  begin
    insert into purchase_orders (restaurant_id, supplier_id, folio) values (ra, prov_b, 999001);
    raise exception 'PA-T11: compra con proveedor ajeno';
  exception when check_violation then null;
  end;
  insert into purchase_orders (restaurant_id, folio) values (ra, 999002) returning id into oc;
  begin
    insert into purchase_order_items (purchase_order_id, descripcion, cantidad, unidad, costo_unitario, subtotal, ingredient_id)
      values (oc, 'x', 1, 'g', 1, 1, ajeno);
    raise exception 'PA-T11: renglón con insumo ajeno';
  exception when check_violation then null;
  end;
  begin
    insert into purchase_order_items (purchase_order_id, descripcion, cantidad, unidad, costo_unitario, subtotal, product_id)
      values (oc, 'x', 1, 'u', 1, 1, plato_b);
    raise exception 'PA-T11: renglón con producto ajeno';
  exception when check_violation then null;
  end;
  insert into purchase_order_items (purchase_order_id, descripcion, cantidad, unidad, costo_unitario, subtotal, ingredient_id)
    values (oc, 'x', 1, 'g', 1, 1, queso);  -- el propio sí

  -- PA-T11 (reparto): repartidor ajeno en un pedido, usuario ajeno en un repartidor.
  insert into drivers (restaurant_id, nombre) values (rb, 'T repartidor ajeno') returning id into rep_b;
  select id into pedido from orders where restaurant_id = ra limit 1;
  if pedido is not null then
    begin
      update orders set driver_id = rep_b where id = pedido;
      raise exception 'PA-T11: pedido con repartidor ajeno';
    exception when check_violation then null;
    end;
  end if;
  begin
    insert into drivers (restaurant_id, nombre, profile_id)
      select ra, 'T usuario ajeno', p.id from profiles p
       where p.restaurant_id = rb
         and not exists (select 1 from restaurant_members m where m.user_id = p.id and m.restaurant_id = ra)
       limit 1;
    if found then raise exception 'PA-T11: repartidor con usuario de otro restaurante'; end if;
  exception when check_violation then null;
  end;

  -- X12: dos categorías con la misma posición; subir la segunda funciona.
  select id into cat_a from categories where restaurant_id = ra order by sort_order, name, id limit 1;
  select id into cat_b from categories where restaurant_id = ra order by sort_order, name, id offset 1 limit 1;
  update categories set sort_order = 0 where id in (cat_a, cat_b);
  if not leogin_mover_categoria(ra, cat_b, -1) then raise exception 'X12: no pudo subir'; end if;
  select count(*) - count(distinct sort_order) into n from categories where restaurant_id = ra;
  if n <> 0 then raise exception 'X12: quedaron % posiciones repetidas', n; end if;
  if (select min(sort_order) from categories where restaurant_id = ra) <> 0 then raise exception 'X12: no empieza en 0'; end if;
  if (select sort_order from categories where id = cat_b) <> 0 then raise exception 'X12: la categoría no quedó primera'; end if;
  if leogin_mover_categoria(ra, cat_b, -1) then raise exception 'X12: subió más allá del borde'; end if;
  begin
    perform leogin_mover_categoria(ra, (select id from categories where restaurant_id = rb limit 1), 1);
    raise exception 'X12: movió una categoría de otro restaurante';
  exception when no_data_found then null;
  end;

  raise notice '156: todo en orden';
end;
$$;

rollback;
