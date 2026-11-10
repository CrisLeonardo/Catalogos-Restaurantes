-- ============================================================
--  Prueba de la migración 159 contra Postgres real
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.8 (PA-T12, X10). Todo ocurre en una
--  transacción que se deshace al final: no deja datos.
--
--  Necesita dos restaurantes (las semillas locales `rincon502` y
--  `tacos-del-norte-test` sirven). Crea sus propios insumos.
--
--  Correr desde plataforma/:
--    docker exec -i supabase_db_plataforma psql -U postgres -v ON_ERROR_STOP=1 \
--      < supabase/pruebas/159_compras_atomicas_y_estados.sql
--  Si algo falla, termina con ERROR y el nombre del caso; si todo pasa,
--  imprime «159: todo en orden».
-- ============================================================

begin;

create temp table t_ctx on commit drop as
select (select id from restaurants where slug = 'rincon502')            as ra,
       (select id from restaurants where slug = 'tacos-del-norte-test') as rb;

do $$
declare
  ra uuid := (select ra from t_ctx);
  rb uuid := (select rb from t_ctx);
  harina uuid;
  ajeno uuid;
  oc uuid;
  oc2 uuid;
  f1 int;
  f2 int;
  stock_ numeric;
  n int;
  total_ numeric;
  ordenes_antes int;
  msg text;
begin
  if ra is null or rb is null then
    raise exception 'Faltan los restaurantes de prueba (rincon502, tacos-del-norte-test).';
  end if;

  insert into ingredients (restaurant_id, name, unit, stock, cost_per_unit) values (ra, 'T harina', 'kg', 0, 0) returning id into harina;
  insert into ingredients (restaurant_id, name, unit, stock, cost_per_unit) values (rb, 'T ajeno', 'kg', 0, 0) returning id into ajeno;

  -- Crear: cabecera + renglones, total calculado en la base.
  select c.id, c.folio into oc, f1 from leogin_crear_compra(ra, null, ' prueba ', jsonb_build_array(
    jsonb_build_object('descripcion', 'Harina', 'cantidad', 10, 'unidad', 'kg', 'costo_unitario', 5, 'ingredient_id', harina),
    jsonb_build_object('descripcion', 'Bolsas', 'cantidad', 3, 'costo_unitario', 1.5))) c;
  select count(*) into n from purchase_order_items where purchase_order_id = oc;
  select total into total_ from purchase_orders where id = oc;
  if n <> 2 or total_ <> 54.5 then raise exception 'crear: % renglones y total % (esperado 2 y 54.50)', n, total_; end if;

  -- El folio sigue al anterior.
  select c.id, c.folio into oc2, f2 from leogin_crear_compra(ra, null, '', jsonb_build_array(
    jsonb_build_object('descripcion', 'Sal', 'cantidad', 1))) c;
  if f2 <> f1 + 1 then raise exception 'folio: % después de % (esperado consecutivo)', f2, f1; end if;

  -- Renglón inválido o ajeno: no queda cabecera huérfana.
  select count(*) into ordenes_antes from purchase_orders where restaurant_id = ra;
  begin
    perform leogin_crear_compra(ra, null, '', jsonb_build_array(
      jsonb_build_object('descripcion', 'Bien', 'cantidad', 1),
      jsonb_build_object('descripcion', 'Ajeno', 'cantidad', 1, 'ingredient_id', ajeno)));
    raise exception 'crear con insumo ajeno: debió rechazarse';
  exception when check_violation then null;
  end;
  begin
    perform leogin_crear_compra(ra, null, '', jsonb_build_array(
      jsonb_build_object('descripcion', 'Bien', 'cantidad', 1),
      jsonb_build_object('descripcion', 'Cero', 'cantidad', 0)));
    raise exception 'crear con cantidad 0: debió rechazarse';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform leogin_crear_compra(ra, null, '', '[]'::jsonb);
    raise exception 'crear sin renglones: debió rechazarse';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into n from purchase_orders where restaurant_id = ra;
  if n <> ordenes_antes then raise exception 'cabecera huérfana: % órdenes (esperado %)', n, ordenes_antes; end if;

  -- PA-T12: recibir suma una vez; recibida → borrador se rechaza; recibir de nuevo no suma.
  update purchase_orders set estado = 'ENVIADA', sent_at = now() where id = oc;
  perform leogin_receive_purchase_order(oc, ra);
  select stock into stock_ from ingredients where id = harina;
  if stock_ <> 10 then raise exception 'recibir: stock % (esperado 10)', stock_; end if;

  begin
    update purchase_orders set estado = 'BORRADOR' where id = oc;
    raise exception 'recibida → borrador: debió rechazarse';
  exception when sqlstate 'LGC03' then
    get stacked diagnostics msg = message_text;
    if msg <> 'Una compra recibida no puede pasar a borrador.' then
      raise exception 'recibida → borrador: mensaje «%»', msg;
    end if;
  end;
  begin
    update purchase_orders set estado = 'CANCELADA' where id = oc;
    raise exception 'recibida → cancelada: debió rechazarse';
  exception when sqlstate 'LGC03' then null;
  end;
  perform leogin_receive_purchase_order(oc, ra);
  select stock into stock_ from ingredients where id = harina;
  select count(*) into n from stock_movements where ingredient_id = harina;
  if stock_ <> 10 or n <> 1 then raise exception 'doble recepción: stock % y % movimientos (esperado 10 y 1)', stock_, n; end if;

  -- Los renglones de una recibida no se tocan.
  begin
    update purchase_order_items set cantidad = 99 where purchase_order_id = oc;
    raise exception 'editar renglón de recibida: debió rechazarse';
  exception when sqlstate 'LGC03' then null;
  end;
  begin
    insert into purchase_order_items (purchase_order_id, descripcion, cantidad) values (oc, 'Extra', 1);
    raise exception 'agregar renglón a recibida: debió rechazarse';
  exception when sqlstate 'LGC03' then null;
  end;
  begin
    delete from purchase_order_items where purchase_order_id = oc;
    raise exception 'borrar renglón de recibida: debió rechazarse';
  exception when sqlstate 'LGC03' then null;
  end;

  -- Cancelada es final; borrador → recibida sí se permite.
  update purchase_orders set estado = 'CANCELADA' where id = oc2;
  begin
    update purchase_orders set estado = 'ENVIADA' where id = oc2;
    raise exception 'cancelada → enviada: debió rechazarse';
  exception when sqlstate 'LGC03' then null;
  end;
  begin
    update purchase_orders set estado = 'INVENTADO' where id = oc2;
    raise exception 'estado inventado: debió rechazarse';
  exception when check_violation or sqlstate 'LGC03' then null;
  end;
  select c.id into oc2 from leogin_crear_compra(ra, null, '', jsonb_build_array(
    jsonb_build_object('descripcion', 'Harina', 'cantidad', 2, 'costo_unitario', 5, 'ingredient_id', harina))) c;
  perform leogin_receive_purchase_order(oc2, ra);
  select stock into stock_ from ingredients where id = harina;
  if stock_ <> 12 then raise exception 'borrador → recibida: stock % (esperado 12)', stock_; end if;

  -- Borrar el restaurante sigue pudiendo arrastrar compras recibidas (cascada).
  delete from purchase_orders where id = oc;
  select count(*) into n from purchase_order_items where purchase_order_id = oc;
  if n <> 0 then raise exception 'cascada: quedaron % renglones', n; end if;

  raise notice '159: todo en orden';
end;
$$;

rollback;
