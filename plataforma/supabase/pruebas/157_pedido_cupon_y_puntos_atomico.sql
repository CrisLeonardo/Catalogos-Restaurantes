-- ============================================================
--  Prueba de la migración 157 contra Postgres real
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.6 (F21, PA-T07, PA-T08). Todo ocurre en
--  una transacción que se deshace al final: no deja datos.
--  Necesita el restaurante de prueba `rincon502` con algún platillo.
--
--  Correr desde plataforma/:
--    docker exec -i supabase_db_plataforma psql -U postgres -v ON_ERROR_STOP=1 \
--      < supabase/pruebas/157_pedido_cupon_y_puntos_atomico.sql
--  Si todo pasa imprime «157: todo en orden».
--
--  La carrera real entre dos sesiones (dos pedidos a la vez por el último
--  uso) se probó aparte con dos conexiones; aquí se prueba la regla.
-- ============================================================

begin;

do $$
declare
  ra uuid := (select id from restaurants where slug = 'rincon502');
  plato uuid;
  plato_stock uuid;
  cupon uuid;
  cli uuid;
  premio uuid;
  premio2 uuid;
  r jsonb;
  p1 uuid;
  n int;
  items jsonb;
  items_premio jsonb;
  items_dos_premios jsonb;
  cid uuid := gen_random_uuid();
begin
  if ra is null then raise exception 'Falta el restaurante de prueba rincon502.'; end if;
  select id into plato from products where restaurant_id = ra and coalesce(track_stock, false) = false order by name limit 1;
  items := jsonb_build_array(jsonb_build_object('product_id', plato, 'name_snapshot', 'T plato', 'price_snapshot', 100, 'quantity', 1, 'subtotal', 100));

  insert into coupons (restaurant_id, code, discount_type, discount_value, max_uses, uses, is_active)
    values (ra, 'T157TOPE1', 'PERCENT', 10, 1, 0, true) returning id into cupon;

  -- ── PA-T07: el último uso del cupón ───────────────────────
  r := leogin_crear_pedido(ra, 'T A', '5000', 'PICKUP', null, null, null, null, null,
         100, 0, 90, null, items, 'CASH', null, 0, null, cupon, 10);
  p1 := (r ->> 'id')::uuid;
  if (select uses from coupons where id = cupon) <> 1 then raise exception 'PA-T07: el primer pedido no sumó el uso'; end if;
  if (select coupon_id from orders where id = p1) is distinct from cupon then raise exception 'F21: el pedido no registró el cupón'; end if;
  if (select discount from orders where id = p1) <> 10 then raise exception 'F21: el pedido no registró el descuento'; end if;

  begin
    perform leogin_crear_pedido(ra, 'T B', '5000', 'PICKUP', null, null, null, null, null,
              100, 0, 90, null, items, 'CASH', null, 0, null, cupon, 10);
    raise exception 'PA-T07: el segundo pedido pasó el tope';
  exception when sqlstate 'LGC01' then null;
  end;
  if (select uses from coupons where id = cupon) <> 1 then raise exception 'PA-T07: el tope se pasó'; end if;
  if exists (select 1 from orders where restaurant_id = ra and customer_name = 'T B') then
    raise exception 'PA-T07: quedó creado el pedido rechazado';
  end if;

  -- ── Descuento que ya no coincide con el cupón ─────────────
  update coupons set max_uses = null where id = cupon;
  begin
    perform leogin_crear_pedido(ra, 'T C', '5000', 'PICKUP', null, null, null, null, null,
              100, 0, 50, null, items, 'CASH', null, 0, null, cupon, 50);
    raise exception 'F21: aceptó un descuento distinto al del cupón';
  exception when sqlstate 'LGC02' then null;
  end;
  if (select uses from coupons where id = cupon) <> 1 then raise exception 'LGC02: sumó un uso igual'; end if;

  -- ── Cupón vencido o de otro restaurante ───────────────────
  update coupons set valid_until = now() - interval '1 minute' where id = cupon;
  begin
    perform leogin_crear_pedido(ra, 'T D', '5000', 'PICKUP', null, null, null, null, null,
              100, 0, 90, null, items, 'CASH', null, 0, null, cupon, 10);
    raise exception 'aceptó un cupón vencido';
  exception when sqlstate 'LGC01' then null;
  end;
  update coupons set valid_until = null where id = cupon;

  -- ── Reintento del mismo pedido (client_id) ────────────────
  perform leogin_crear_pedido(ra, 'T E', '5000', 'PICKUP', null, null, null, null, null,
            100, 0, 90, null, items, 'CASH', null, 0, cid, cupon, 10);
  n := (select uses from coupons where id = cupon);
  begin
    perform leogin_crear_pedido(ra, 'T E', '5000', 'PICKUP', null, null, null, null, null,
              100, 0, 90, null, items, 'CASH', null, 0, cid, cupon, 10);
    raise exception 'reintento: se creó otro pedido';
  exception when unique_violation then null;
  end;
  if (select uses from coupons where id = cupon) <> n then raise exception 'reintento: sumó otro uso del cupón'; end if;

  -- ── PA-T08: canjes contra un saldo que alcanza para uno ──
  insert into customers (restaurant_id, name, phone) values (ra, 'T Cliente', '59990157') returning id into cli;
  insert into loyalty_accounts (restaurant_id, customer_id, points_balance) values (ra, cli, 100);
  insert into loyalty_rewards (restaurant_id, title, points_cost, active, stock) values (ra, 'T premio', 100, true, 5) returning id into premio;
  insert into loyalty_rewards (restaurant_id, title, points_cost, active) values (ra, 'T premio 2', 100, true) returning id into premio2;
  items_premio := jsonb_build_array(jsonb_build_object('product_id', plato, 'name_snapshot', 'premio', 'price_snapshot', 0, 'quantity', 1, 'subtotal', 0, 'is_reward', true, 'reward_id', premio));
  items_dos_premios := items_premio || jsonb_build_array(jsonb_build_object('product_id', plato, 'name_snapshot', 'premio 2', 'price_snapshot', 0, 'quantity', 1, 'subtotal', 0, 'is_reward', true, 'reward_id', premio2));

  -- Dos premios en un mismo pedido con saldo para uno: no se crea nada.
  begin
    perform leogin_crear_pedido(ra, 'T F', '5000', 'PICKUP', null, null, null, null, cli,
              0, 0, 0, null, items_dos_premios, 'CASH', null, 0, null, null, 0, cli, array[premio, premio2]);
    raise exception 'PA-T08: aceptó dos canjes sin saldo';
  exception when sqlstate 'P0001' then null;
  end;
  if (select points_balance from loyalty_accounts where customer_id = cli) <> 100 then raise exception 'PA-T08: tocó el saldo en el pedido rechazado'; end if;
  if exists (select 1 from orders where restaurant_id = ra and customer_name = 'T F') then raise exception 'PA-T08: quedó el pedido rechazado'; end if;

  -- Primer canje: pasa. Segundo, con el saldo ya gastado: no se crea.
  r := leogin_crear_pedido(ra, 'T G', '5000', 'PICKUP', null, null, null, null, cli,
         0, 0, 0, null, items_premio, 'CASH', null, 0, null, null, 0, cli, array[premio]);
  begin
    perform leogin_crear_pedido(ra, 'T H', '5000', 'PICKUP', null, null, null, null, cli,
              0, 0, 0, null, items_premio, 'CASH', null, 0, null, null, 0, cli, array[premio]);
    raise exception 'PA-T08: el segundo canje pasó sin saldo';
  exception when sqlstate 'P0001' then null;
  end;
  if (select points_balance from loyalty_accounts where customer_id = cli) <> 0 then raise exception 'PA-T08: saldo final distinto de 0'; end if;
  if exists (select 1 from orders where restaurant_id = ra and customer_name = 'T H') then raise exception 'PA-T08: quedó el pedido sin puntos'; end if;
  if (select stock from loyalty_rewards where id = premio) <> 4 then raise exception 'PA-T08: existencias del premio %', (select stock from loyalty_rewards where id = premio); end if;

  -- ── Cancelación: devuelve puntos, existencia y uso del cupón (144) ──
  perform cancel_public_order((r ->> 'id')::uuid, ra);
  if (select points_balance from loyalty_accounts where customer_id = cli) <> 100 then raise exception 'cancelar: no devolvió los puntos'; end if;
  if (select stock from loyalty_rewards where id = premio) <> 5 then raise exception 'cancelar: no devolvió la existencia'; end if;
  n := (select uses from coupons where id = cupon);
  perform cancel_public_order(p1, ra);
  if (select uses from coupons where id = cupon) <> n - 1 then raise exception 'cancelar: no devolvió el uso del cupón'; end if;
  perform cancel_public_order(p1, ra); -- dos veces no devuelve dos veces
  if (select uses from coupons where id = cupon) <> n - 1 then raise exception 'cancelar: devolvió dos veces'; end if;

  -- ── Un paso que falla a mitad no deja nada (stock + cupón) ──
  select id into plato_stock from products where restaurant_id = ra order by name offset 1 limit 1;
  update products set track_stock = true, stock = 0 where id = plato_stock;
  n := (select uses from coupons where id = cupon);
  begin
    perform leogin_crear_pedido(ra, 'T I', '5000', 'PICKUP', null, null, null, null, null,
              100, 0, 90, null,
              jsonb_build_array(jsonb_build_object('product_id', plato_stock, 'name_snapshot', 'x', 'price_snapshot', 100, 'quantity', 1, 'subtotal', 100)),
              'CASH', null, 0, null, cupon, 10);
    raise exception 'aceptó un pedido sin stock';
  exception when sqlstate 'P0001' then null;
  end;
  if (select uses from coupons where id = cupon) <> n then raise exception 'sin stock: sumó el uso del cupón'; end if;

  raise notice '157: todo en orden';
end;
$$;

rollback;
