-- ============================================================
--  Datos del video promocional — SOLO BASE LOCAL
--  ------------------------------------------------------------
--  Deja a «Rincón 502», el restaurante FICTICIO de la demo de Leogin,
--  listo para grabar el video: su tema de la web (oscuro con coral),
--  las ilustraciones propias de los platillos y un día de ventas creíble
--  con algunos pedidos en curso. Nombres y montos son inventados; no hay
--  ningún dato de un cliente real.
--
--  Requisitos (ver promo-video/README.md):
--   1. Supabase local arriba (`npx supabase start` desde plataforma/).
--   2. Rincón 502 creado con supabase/seed_demo_rincon502.sql.
--
--  Se corre con:  npm run seed   (desde promo-video/)
--  NUNCA lo corras contra producción: borra los pedidos de HOY del
--  restaurante de ejemplo. El script se niega si encuentra más de 20
--  restaurantes o si el restaurante no se llama «Rincón 502».
--
--  Idempotente: se puede correr antes de cada grabación.
-- ============================================================

do $$
declare
  v_rid      uuid;
  v_inicio   timestamptz;
  v_ids      uuid[];
  v_placed   jsonb;
  v_items    jsonb;
  v_sub      numeric;
  v_oid      uuid;
  v_i        int;
  v_ped      record;
  v_cliente  text;
  v_tipo     text;
  v_hace     interval;
  v_sem      int;
  v_nombres  text[] := array[
    'María José', 'Carlos Ramírez', 'Ana Lucía', 'Juan Pablo', 'Gabriela',
    'Luis Fernando', 'Daniela', 'Miguel Ángel', 'Andrea', 'José Manuel',
    'Karla', 'Diego', 'Fernanda', 'Roberto', 'Paola', 'Emilio', 'Silvia',
    'Marco Tulio', 'Lucía', 'Don Julio', 'Doña Marta', 'Sofía', 'Kevin', 'Alejandra'
  ];
begin
  -- Candado: esto es para la base local de desarrollo.
  if (select count(*) from restaurants) > 20 then
    raise exception 'Hay más de 20 restaurantes: esto no parece la base local. No se toca nada.';
  end if;

  select id into v_rid from restaurants where slug = 'rincon502' and name = 'Rincón 502';
  if v_rid is null then
    raise exception 'No existe Rincón 502 (slug rincon502). Corre antes plataforma/supabase/seed_demo_rincon502.sql.';
  end if;

  perform setseed(0.502);

  -- ── 1. El tema de la demo web (lib/demo-menu.ts → DEMO_THEME) ──────
  update restaurants set
    orders_paused = false,
    orders_paused_until = null,
    tagline = 'Hamburguesas, pizzas y pastas'
  where id = v_rid;

  update restaurant_themes set
    color_primary   = '#E4572E',
    color_bg        = '#161512',
    color_text      = '#F7F3EF',
    font_display    = 'Unbounded',
    portada_style   = 'spotlight',
    catalog_view    = 'grid',
    glass_intensity = 'solido',
    config = config || jsonb_build_object(
      'scheme', 'dark',
      'tagline', 'Hamburguesas, pizzas y pastas',
      'zone', 'El Progreso, Jutiapa',
      'colorAccent', '#E4572E',
      'colorBg', '#161512',
      'colorBg2', '#1F1D19',
      'colorText', '#F7F3EF',
      'onAccent', '#FFFFFF',
      'fontDisplay', 'Unbounded',
      'portadaVariant', 'spotlight',
      'glassIntensity', 'solido',
      'catalogView', 'grid',
      'backgroundType', 'solid',
      'ambientGlow', false,
      'typography', jsonb_set(config->'typography', '{heading,shadow}', '"none"')
    )
  where restaurant_id = v_rid;

  -- ── 2. Ilustraciones propias de los platillos (public/demo/rincon502) ─
  update products p set image_url = '/demo/rincon502/' || f.archivo || '.webp'
  from (values
    ('Rincón Clásica', 'rincon-clasica'),
    ('Doble Bacon', 'doble-bacon'),
    ('Alitas BBQ 8 unidades', 'alitas-bbq'),
    ('Nachos Supremos', 'nachos-supremos'),
    ('Papas a la Francesa con Queso', 'papas-con-queso'),
    ('Pepperoni (mediana)', 'pizza-pepperoni'),
    ('Margarita (mediana)', 'pizza-margarita'),
    ('Fettuccine Alfredo', 'fettuccine-alfredo'),
    ('Lasaña de la Casa', 'lasana-de-la-casa'),
    ('Volcán de Chocolate', 'volcan-de-chocolate'),
    ('Cheesecake de Fresa', 'cheesecake-de-fresa'),
    ('Malteada varios sabores', 'malteada'),
    ('Limonada con Menta', 'limonada-con-menta')
  ) as f(nombre, archivo)
  where p.restaurant_id = v_rid and p.name = f.nombre;

  -- Un producto de prueba que no debe salir en cámara.
  update products set is_active = false
  where restaurant_id = v_rid and name ilike '%de prueba%';

  -- Ningún platillo del video agotado.
  update products set is_available = true, unavailable_at = null, agotado_motivo = null, vuelve_at = null
  where restaurant_id = v_rid and image_url like '/demo/rincon502/%';

  -- Los platillos con ilustración, primero en la carta (la hamburguesa del
  -- video arriba a la izquierda); el resto después, en su orden de antes.
  update products set sort_order = 100 + coalesce(sort_order, 0)
  where restaurant_id = v_rid and sort_order < 100;
  update products p set sort_order = o.pos
  from (values
    ('Rincón Clásica', 0), ('Doble Bacon', 1), ('Pepperoni (mediana)', 2), ('Nachos Supremos', 3),
    ('Alitas BBQ 8 unidades', 4), ('Papas a la Francesa con Queso', 5), ('Margarita (mediana)', 6),
    ('Fettuccine Alfredo', 7), ('Lasaña de la Casa', 8), ('Malteada varios sabores', 9),
    ('Limonada con Menta', 10), ('Volcán de Chocolate', 11), ('Cheesecake de Fresa', 12)
  ) as o(nombre, pos)
  where p.restaurant_id = v_rid and p.name = o.nombre;

  -- ── 3. Hoy empieza limpio ───────────────────────────────────────────
  -- Día de negocio: desde las 5:00 a. m. de Guatemala (day_cutoff_minutes = 300).
  v_inicio := (date_trunc('day', now() at time zone 'America/Guatemala') + interval '5 hours') at time zone 'America/Guatemala';
  if v_inicio > now() then v_inicio := v_inicio - interval '1 day'; end if;

  select coalesce(array_agg(id), '{}') into v_ids
  from orders where restaurant_id = v_rid and created_at >= v_inicio;

  delete from print_jobs            where order_id = any(v_ids);
  delete from loyalty_transactions  where order_id = any(v_ids);
  delete from order_ratings         where order_id = any(v_ids);
  delete from gift_card_transactions where order_id = any(v_ids);
  delete from whatsapp_messages     where order_id = any(v_ids);
  delete from fel_documents         where order_id = any(v_ids);
  delete from orders                where id = any(v_ids);

  update table_sessions set closed_at = now()
  where restaurant_id = v_rid and closed_at is null;

  -- El conteo de caja a medias de la grabación anterior.
  delete from caja_borradores where restaurant_id = v_rid;

  -- ── 4. Lo que ya se vendió hoy (entregado y cobrado) ────────────────
  -- y, para que «vs. un sábado normal» compare contra algo real, los mismos
  -- días de las cuatro semanas anteriores con ventas parecidas (una sola vez).
  for v_sem in 0..4 loop
  if v_sem > 0 and (select count(*) from orders where restaurant_id = v_rid
       and created_at >= v_inicio - make_interval(days => 7 * v_sem)
       and created_at <  v_inicio - make_interval(days => 7 * v_sem - 1)) >= 15 then
    continue;
  end if;
  for v_i in 1..(case when v_sem = 0 then 18 else 21 + v_sem end) loop
    v_tipo := (array['DINE_IN','DINE_IN','DINE_IN','PICKUP','PICKUP','DELIVERY'])[1 + floor(random() * 6)::int];
    v_cliente := v_nombres[1 + floor(random() * array_length(v_nombres, 1))::int];

    select jsonb_agg(jsonb_build_object(
             'product_id', s.id, 'name_snapshot', s.name, 'price_snapshot', s.price,
             'cost_snapshot', null, 'quantity', s.qty, 'subtotal', s.price * s.qty,
             'options_snapshot', null, 'note', null)),
           sum(s.price * s.qty)
      into v_items, v_sub
    from (
      select id, name, price, (1 + floor(random() * 2))::int as qty
      from products
      where restaurant_id = v_rid and is_active and is_available and image_url like '/demo/rincon502/%'
      order by random() limit (1 + floor(random() * 2))::int
    ) s;

    select place_order(
      p_restaurant_id => v_rid, p_customer_name => v_cliente, p_customer_phone => '+502 5555 ' || (1000 + v_i)::text, -- número ficticio
      p_order_type => v_tipo,
      p_address => case when v_tipo = 'DELIVERY' then 'Barrio El Centro, El Progreso' end,
      p_delivery_zone => null, p_delivery_lat => null, p_delivery_lng => null, p_customer_id => null,
      p_subtotal => v_sub, p_delivery_fee => case when v_tipo = 'DELIVERY' then 15 else 0 end,
      p_total => v_sub + case when v_tipo = 'DELIVERY' then 15 else 0 end,
      p_notes => null, p_items => v_items,
      p_payment_method => case when random() < 0.65 then 'CASH' else 'CARD' end,
      p_cash_amount => null, p_tip => 0, p_waiter_id => null, p_client_id => gen_random_uuid()
    ) into v_placed;
    v_oid := (v_placed ->> 'id')::uuid;

    -- repartidos a lo largo del día, del más viejo al más reciente
    v_hace := (now() - v_inicio) * (1 - (v_i::numeric / 28)) + make_interval(days => 7 * v_sem);
    update orders set
      created_at   = now() - v_hace,
      status       = 'DELIVERED',
      table_number = case when v_tipo = 'DINE_IN' then 1 + floor(random() * 12)::int end,
      accepted_at  = now() - v_hace + interval '2 minutes',
      ready_at     = now() - v_hace + interval '11 minutes',
      served_at    = case when v_tipo = 'DINE_IN' then now() - v_hace + interval '13 minutes' end,
      delivered_at = now() - v_hace + interval '25 minutes'
    where id = v_oid;
  end loop;
  end loop;

  -- ── 5. Pedidos en curso (para que «En vivo» no se vea vacío) ─────────
  for v_ped in
    select * from (values
      ('PICKUP',   'Ana Lucía',   'PREP',    interval '6 minutes',  'Pepperoni (mediana)',  1, 'Limonada con Menta', 2, null::int),
      ('DINE_IN',  'Mesa 7',      'PREP',    interval '8 minutes', 'Doble Bacon',          2, 'Malteada varios sabores', 2, 7),
      ('DELIVERY', 'Don Julio',   'PREP',    interval '4 minutes', 'Lasaña de la Casa',    1, 'Cheesecake de Fresa', 1, null)
    ) as t(tipo, cliente, estado, hace, p1, q1, p2, q2, mesa)
  loop
    select jsonb_agg(jsonb_build_object(
             'product_id', p.id, 'name_snapshot', p.name, 'price_snapshot', p.price,
             'cost_snapshot', null, 'quantity', x.q, 'subtotal', p.price * x.q,
             'options_snapshot', null, 'note', null)),
           sum(p.price * x.q)
      into v_items, v_sub
    from (values (v_ped.p1, v_ped.q1), (v_ped.p2, v_ped.q2)) as x(n, q)
    join products p on p.restaurant_id = v_rid and p.name = x.n;

    select place_order(
      p_restaurant_id => v_rid, p_customer_name => v_ped.cliente, p_customer_phone => '+502 5555 0999', -- número ficticio
      p_order_type => v_ped.tipo,
      p_address => case when v_ped.tipo = 'DELIVERY' then 'Colonia Las Flores, El Progreso' end,
      p_delivery_zone => null, p_delivery_lat => null, p_delivery_lng => null, p_customer_id => null,
      p_subtotal => v_sub, p_delivery_fee => case when v_ped.tipo = 'DELIVERY' then 15 else 0 end,
      p_total => v_sub + case when v_ped.tipo = 'DELIVERY' then 15 else 0 end,
      p_notes => null, p_items => v_items, p_payment_method => 'CASH',
      p_cash_amount => null, p_tip => 0, p_waiter_id => null, p_client_id => gen_random_uuid()
    ) into v_placed;
    v_oid := (v_placed ->> 'id')::uuid;

    update orders set
      created_at   = now() - v_ped.hace,
      status       = v_ped.estado,
      table_number = v_ped.mesa,
      accepted_at  = now() - v_ped.hace + interval '1 minute',
      ready_at     = null
    where id = v_oid;
  end loop;

  raise notice 'Rincón 502 listo para grabar (restaurante %).', v_rid;
end $$;
