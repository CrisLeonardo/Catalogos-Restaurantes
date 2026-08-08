-- ============================================================
--  SEED DEMO — Rincón 502 (El Progreso, Jutiapa)
--  ------------------------------------------------------------
--  Siembra un restaurante de demostración "vivo": catálogo completo,
--  cupones, reservaciones, lista de espera, ~110 pedidos históricos
--  (generados vía el RPC real place_order), calificaciones y llamadas
--  de mesero. Pensado para que Leonardo lo muestre a restaurantes
--  prospecto en El Progreso, Jutiapa.
--
--  FLUJO DE USO (en este orden, no te lo saltes):
--   1. Leonardo crea el restaurante "Rincón 502" con el flujo normal
--      de la app (registro self-serve en /signup, o alta desde
--      /super/restaurantes). Eso crea correctamente la fila en
--      `restaurants` + el usuario de `auth.users` + su `profiles`
--      como RESTAURANT_OWNER. Usa el slug: rincon502
--      Este script NO inserta en auth.users ni crea el owner — eso lo
--      maneja la app; hacerlo por SQL crudo es frágil y no soportado.
--   2. (Opcional) Leonardo da de alta un mesero de prueba
--      (ej. "Carlos Mesero") desde el panel de Personal del admin
--      (rol RESTAURANT_WAITER). También crea su propio auth.users/
--      profiles. Si existe, este script lo detecta solo y lo usa
--      para ~35% de los pedidos DINE_IN. Si no existe, esos pedidos
--      simplemente quedan sin mesero (no falla).
--   3. Corre este script completo en el SQL Editor de Supabase:
--        primero en LOCAL (npx supabase db reset / studio local),
--        luego en PRODUCCIÓN cuando esté verificado.
--      El script busca el restaurante por slug = 'rincon502'. Si no
--      existe, lanza `raise exception` con instrucciones — no crea la
--      fila `restaurants` desde cero.
--
--  IDEMPOTENTE: se puede correr más de una vez sin duplicar nada.
--  Sigue el patrón de supabase/setup_tutorial_demo.sql de este mismo
--  repo: bloque `do $$ ... end $$;`, `on conflict do nothing`, e
--  `if not exists (select 1 from <tabla> where restaurant_id = v_rid)`
--  para no duplicar catálogo/cupones/historial en reejecuciones.
--
--  NOTA sobre "lucir reciente": las fechas del historial (pedidos,
--  lista de espera activa, llamada de mesero pendiente) se calculan
--  relativas a `now()` EN EL MOMENTO EN QUE CORRES EL SCRIPT. Como el
--  bloque de pedidos está guardado por `if not exists (...)`, esas
--  fechas quedan FIJAS la primera vez que se ejecuta con éxito. Si
--  pasan muchos días y quieres que el panel "en vivo" vuelva a verse
--  recién sucedido, borra el historial de este restaurante
--  (orders/order_items, waitlist_entries, waiter_calls de v_rid) y
--  vuelve a correr el script.
--
--  SUPUESTOS NO VERIFICADOS CONTRA UNA BASE REAL (no hay credenciales
--  de Supabase en el entorno donde se escribió este script — toda la
--  verificación fue leyendo supabase/migrations/*.sql y src/lib/*
--  con cuidado, no ejecutando nada). Ver schema_notes.md para el
--  detalle completo y honesto de qué se confirmó y qué no.
--
--  Ejecutar en el SQL Editor de Supabase con el rol `postgres`
--  (el que usa el SQL Editor por defecto): es el dueño de
--  place_order()/increment_coupon_usage(), así que puede ejecutarlas
--  aunque 084/092 les revocaron EXECUTE a anon/authenticated/public.
-- ============================================================

do $$
declare
  v_rid              uuid;
  v_waiter_id        uuid;

  -- Categorías
  v_cat_entradas     uuid;
  v_cat_hamburguesas uuid;
  v_cat_pizzas       uuid;
  v_cat_pastas       uuid;
  v_cat_paninis      uuid;
  v_cat_ensaladas    uuid;
  v_cat_postres      uuid;
  v_cat_bebidas      uuid;

  -- Cupones
  v_coupon_bienvenida uuid;
  v_coupon_rincon50   uuid;

  -- Pools de datos para el historial de pedidos
  v_names   text[] := array[
    'María José López', 'Carlos Alberto Ramírez', 'Ana Lucía García',
    'Juan Pablo Hernández', 'Gabriela Morales', 'Luis Fernando Pérez',
    'Daniela Castillo', 'Miguel Ángel Rodríguez', 'Andrea Solórzano',
    'José Manuel Gómez', 'Karla Patricia Ruiz', 'Diego Alejandro Vásquez',
    'Fernanda Chacón', 'Roberto Carlos Aguilar', 'Paola Beatriz Reyes',
    'Emilio Alexander Cordón', 'Silvia Elizabeth Monzón', 'Marco Tulio Barrios',
    'Cristina Alvarado', 'Óscar Danilo Sandoval'
  ];
  v_phones  text[] := array[
    '+502 5511 2233', '+502 5522 3344', '+502 5533 4455', '+502 5544 5566',
    '+502 5555 6677', '+502 5566 7788', '+502 5577 8899', '+502 5588 9900',
    '+502 5599 0011', '+502 5600 1122', '+502 5611 2233', '+502 5622 3344',
    '+502 5633 4455', '+502 5644 5566', '+502 5655 6677', '+502 5666 7788',
    '+502 5677 8899', '+502 5688 9900', '+502 5699 0011', '+502 5700 1122'
  ];
  v_addresses text[] := array[
    '4a calle 3-15, Barrio El Centro, El Progreso, Jutiapa',
    '2a avenida 5-22, Colonia Nueva Jutiapa, El Progreso',
    'Km 121 Carretera a Jutiapa, El Progreso',
    '6a calle "A" 1-40, Barrio San Sebastián, El Progreso',
    '1a avenida 2-10, Aldea El Rosario, El Progreso, Jutiapa',
    '3a calle 4-05, Colonia Las Brisas, El Progreso'
  ];
  v_zones text[] := array[
    'Casco Urbano', 'Barrio El Centro', 'Colonia Nueva Jutiapa',
    'Aldea El Rosario', 'Barrio San Sebastián', 'Colonia Las Brisas'
  ];
  v_notes_pool text[] := array[
    'Sin cebolla, por favor', 'Que la carne esté bien cocida',
    'Extra salsa aparte, por favor', 'Entregar en el portón negro',
    'Sin picante', 'Sonar el timbre al llegar'
  ];

  -- Variables del loop de pedidos
  i                 int;
  v_order_type      text;
  v_status          text;
  v_created_at      timestamptz;
  v_idx             int;
  v_customer_name   text;
  v_customer_phone  text;
  v_item_count      int;
  v_items           jsonb;
  v_subtotal        numeric(10,2);
  v_fee             numeric(10,2);
  v_tip             numeric(10,2);
  v_discount        numeric(10,2);
  v_total           numeric(10,2);
  v_payment_method  text;
  v_waiter_for_order uuid;
  v_placed          jsonb;
  v_order_id        uuid;
  v_coupon_id       uuid;
  v_coupon_code     text;
  v_coupon_uses_count int := 0;
  v_address         text;
  v_zone            text;
  v_table_no        int;
  v_notes           text;
  v_live            record;
  v_rand            numeric;
begin

  -- ══════════════════════════════════════════════════════════
  -- 1. Buscar el restaurante (NO se crea desde cero)
  -- ══════════════════════════════════════════════════════════
  select id into v_rid from restaurants where slug = 'rincon502';

  if v_rid is null then
    raise exception
      'No existe ningún restaurante con slug = ''rincon502''. '
      'Créalo primero desde la app: registro self-serve en /signup, '
      'o alta manual desde /super/restaurantes (Super Admin) usando '
      'exactamente ese slug. Luego vuelve a correr este script.';
  end if;

  -- ══════════════════════════════════════════════════════════
  -- 2. Actualizar plan / módulos / datos de contacto
  --    (merge sobre el jsonb existente, no lo pisa por completo,
  --    igual que hace la migración 029 con `modules || jsonb...`)
  -- ══════════════════════════════════════════════════════════
  update restaurants set
    name            = 'Rincón 502',
    tagline         = 'Burgers, pizza, pasta y más — sabores variados para toda la familia',
    plan_actual     = 'PREMIUM',
    status          = 'active',
    whatsapp_number = '+502 5555 0202',
    contact_email   = 'hola@rincon502.com',
    modules = coalesce(modules, '{}'::jsonb) || jsonb_build_object(
      'catalog',         true,
      'orders',          true,
      'whatsapp_notify', true,
      'reservaciones',   true,
      'lista_espera',    true,
      'llamada_mesero',  true,
      'encuestas',       true,
      'cupones',         true,
      'loyalty',         true,
      'recetas',         true
    ),
    module_settings = coalesce(module_settings, '{}'::jsonb) || jsonb_build_object(
      'reservaciones',   jsonb_build_object('enabled', true),
      'lista_espera',    jsonb_build_object('enabled', true),
      'llamada_mesero',  jsonb_build_object('enabled', true),
      'encuestas',       jsonb_build_object('enabled', true),
      'cupones',         jsonb_build_object('enabled', true),
      'loyalty',         jsonb_build_object('enabled', true),
      'recetas',         jsonb_build_object('enabled', true)
    )
  where id = v_rid;

  -- ══════════════════════════════════════════════════════════
  -- 3. Tema (1:1 con el restaurante → upsert por PK)
  -- ══════════════════════════════════════════════════════════
  insert into restaurant_themes (
    restaurant_id, brand_name,
    color_primary, color_bg, color_text,
    font_display, portada_style, catalog_view, glass_intensity
  ) values (
    v_rid, 'Rincón 502',
    '#E4572E', '#161512', '#F7F3EC',
    'Unbounded', 'spotlight', 'grid', 'translucido'
  )
  on conflict (restaurant_id) do update set
    brand_name      = excluded.brand_name,
    color_primary   = excluded.color_primary,
    color_bg        = excluded.color_bg,
    color_text      = excluded.color_text,
    font_display    = excluded.font_display,
    portada_style   = excluded.portada_style,
    catalog_view    = excluded.catalog_view,
    glass_intensity = excluded.glass_intensity;

  -- ══════════════════════════════════════════════════════════
  -- 4. Categorías (bloque completo, guardado por existencia)
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from categories where restaurant_id = v_rid) then
    insert into categories (restaurant_id, name, sort_order) values
      (v_rid, 'Entradas y Aperitivos',   0),
      (v_rid, 'Hamburguesas',            1),
      (v_rid, 'Pizzas',                  2),
      (v_rid, 'Pastas',                  3),
      (v_rid, 'Paninis y Sandwiches',    4),
      (v_rid, 'Ensaladas',               5),
      (v_rid, 'Postres',                 6),
      (v_rid, 'Bebidas',                 7);
  end if;

  select id into v_cat_entradas     from categories where restaurant_id = v_rid and name = 'Entradas y Aperitivos';
  select id into v_cat_hamburguesas from categories where restaurant_id = v_rid and name = 'Hamburguesas';
  select id into v_cat_pizzas       from categories where restaurant_id = v_rid and name = 'Pizzas';
  select id into v_cat_pastas       from categories where restaurant_id = v_rid and name = 'Pastas';
  select id into v_cat_paninis      from categories where restaurant_id = v_rid and name = 'Paninis y Sandwiches';
  select id into v_cat_ensaladas    from categories where restaurant_id = v_rid and name = 'Ensaladas';
  select id into v_cat_postres      from categories where restaurant_id = v_rid and name = 'Postres';
  select id into v_cat_bebidas      from categories where restaurant_id = v_rid and name = 'Bebidas';

  -- ══════════════════════════════════════════════════════════
  -- 5. Productos (bloque completo, guardado por existencia)
  --    Sin image_url a propósito — Leonardo las agrega él mismo.
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from products where restaurant_id = v_rid) then

    -- Entradas y Aperitivos
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_entradas, 'Papas a la Francesa con Queso', 'Papas fritas cubiertas de queso fundido y tocino crocante.', 35.00, array['Favorito'], true, 0),
      (v_rid, v_cat_entradas, 'Alitas BBQ 8 unidades', 'Bañadas en salsa BBQ casera, con apio y aderezo ranch.', 55.00, array['Picante'], true, 1),
      (v_rid, v_cat_entradas, 'Nachos Supremos', 'Totopos, frijol, queso fundido, guacamole, pico de gallo y crema.', 48.00, array['Vegetariano'], true, 2),
      (v_rid, v_cat_entradas, 'Dedos de Mozzarella', 'Bastones de mozzarella empanizados con salsa marinara.', 42.00, null, true, 3),
      (v_rid, v_cat_entradas, 'Aros de Cebolla', 'Aros de cebolla crujientes, empanizados y fritos.', 30.00, null, false, 4);

    -- Hamburguesas
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_hamburguesas, 'Rincón Clásica', 'Carne 150g, queso cheddar, lechuga, tomate, cebolla morada, papas incluidas.', 52.00, array['Favorito'], true, 0),
      (v_rid, v_cat_hamburguesas, 'Doble Bacon', 'Doble carne, doble queso, tocino, salsa especial de la casa.', 68.00, array['Favorito'], true, 1),
      (v_rid, v_cat_hamburguesas, 'BBQ Crispy', 'Pechuga empanizada, aros de cebolla, salsa BBQ, queso.', 58.00, null, true, 2),
      (v_rid, v_cat_hamburguesas, 'Hongo Suizo', 'Carne 150g, champiñones salteados, queso suizo.', 56.00, null, true, 3),
      (v_rid, v_cat_hamburguesas, 'Veggie Garden', 'Hamburguesa de vegetales, aguacate, brotes.', 50.00, array['Vegetariano'], true, 4),
      (v_rid, v_cat_hamburguesas, 'Mini Burgers Trío', 'Tres mini hamburguesas para compartir.', 65.00, array['Nuevo'], true, 5);

    -- Pizzas
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_pizzas, 'Margarita (mediana)', 'Salsa de tomate, mozzarella fresca, albahaca.', 75.00, null, true, 0),
      (v_rid, v_cat_pizzas, 'Pepperoni (mediana)', 'Pizza mediana de pepperoni con abundante queso mozzarella.', 85.00, array['Favorito'], true, 1),
      (v_rid, v_cat_pizzas, 'Hawaiana (mediana)', 'Jamón y piña.', 80.00, null, true, 2),
      (v_rid, v_cat_pizzas, 'Cuatro Quesos (mediana)', 'Pizza mediana con mezcla de cuatro quesos derretidos.', 95.00, null, true, 3),
      (v_rid, v_cat_pizzas, 'Vegetariana (mediana)', 'Pimiento, champiñón, cebolla, aceituna, elote.', 85.00, array['Vegetariano'], true, 4),
      (v_rid, v_cat_pizzas, 'La Rincón Especial (familiar)', 'Pepperoni, jamón, salchicha, tocino, champiñón.', 145.00, array['Favorito'], true, 5);

    -- Pastas
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_pastas, 'Fettuccine Alfredo', 'Pasta fettuccine bañada en salsa alfredo cremosa.', 65.00, null, true, 0),
      (v_rid, v_cat_pastas, 'Espagueti a la Boloñesa', 'Espagueti con salsa boloñesa de carne, cocida a fuego lento.', 68.00, null, true, 1),
      (v_rid, v_cat_pastas, 'Penne Arrabiata', 'Penne en salsa arrabiata picante de tomate y ajo.', 60.00, array['Picante'], true, 2),
      (v_rid, v_cat_pastas, 'Lasaña de la Casa', 'Lasaña horneada con capas de carne, queso y salsa de la casa.', 75.00, array['Favorito'], true, 3),
      (v_rid, v_cat_pastas, 'Ravioles de Ricotta y Espinaca', 'Ravioles rellenos de ricotta y espinaca en salsa a elección.', 78.00, array['Vegetariano'], false, 4);

    -- Paninis y Sandwiches
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_paninis, 'Panini de Pollo y Pesto', 'Panini de pechuga de pollo con pesto y queso derretido.', 48.00, null, true, 0),
      (v_rid, v_cat_paninis, 'Panini Caprese', 'Mozzarella, tomate, albahaca, balsámico.', 45.00, array['Vegetariano'], true, 1),
      (v_rid, v_cat_paninis, 'Club Sandwich', 'Pavo, tocino, huevo, lechuga, tomate.', 52.00, null, true, 2),
      (v_rid, v_cat_paninis, 'Cubano', 'Cerdo, jamón, queso suizo, pepinillo, mostaza.', 50.00, array['Nuevo'], true, 3);

    -- Ensaladas
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_ensaladas, 'César con Pollo', 'Lechuga romana, pollo a la parrilla, crutones y aderezo césar.', 48.00, null, true, 0),
      (v_rid, v_cat_ensaladas, 'Ensalada Griega', 'Tomate, pepino, aceituna, cebolla morada y queso feta.', 45.00, array['Vegetariano', 'Sin gluten'], true, 1),
      (v_rid, v_cat_ensaladas, 'Ensalada de la Huerta', 'Mezcla de lechugas, frutos secos, vinagreta de mora.', 42.00, array['Vegano'], true, 2);

    -- Postres
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_postres, 'Volcán de Chocolate', 'Pastel tibio de chocolate con centro fundido.', 32.00, array['Favorito'], true, 0),
      (v_rid, v_cat_postres, 'Cheesecake de Fresa', 'Cheesecake cremoso con cobertura de fresa.', 30.00, null, true, 1),
      (v_rid, v_cat_postres, 'Tres Leches', 'Clásico pastel tres leches, húmedo y suave.', 28.00, null, true, 2),
      (v_rid, v_cat_postres, 'Helado Artesanal 2 bolas', 'Dos bolas de helado artesanal, sabor a elección.', 22.00, null, true, 3);

    -- Bebidas
    insert into products (restaurant_id, category_id, name, description, price, tags, is_available, sort_order) values
      (v_rid, v_cat_bebidas, 'Limonada con Menta', 'Limón fresco exprimido con un toque de menta.', 18.00, null, true, 0),
      (v_rid, v_cat_bebidas, 'Refresco de Jamaica', 'Refresco natural de flor de jamaica.', 15.00, null, true, 1),
      (v_rid, v_cat_bebidas, 'Gaseosa', 'Lata de gaseosa, varios sabores.', 12.00, null, true, 2),
      (v_rid, v_cat_bebidas, 'Malteada varios sabores', 'Malteada cremosa, sabor a elección.', 28.00, array['Nuevo'], true, 3),
      (v_rid, v_cat_bebidas, 'Café Americano', 'Café negro recién preparado.', 15.00, null, true, 4);

  end if;

  -- ══════════════════════════════════════════════════════════
  -- 6. Cupones
  --    Esquema real (045_cupones.sql): coupons_unique_code
  --    unique(restaurant_id, code) → ON CONFLICT idempotente.
  --    BIENVENIDA10 y RINCON50 arrancan con uses = 0: el loop de
  --    pedidos de más abajo los va "gastando" de verdad vía
  --    increment_coupon_usage(), así que su contador refleja el
  --    historial real generado, no un número inventado.
  -- ══════════════════════════════════════════════════════════
  insert into coupons (restaurant_id, code, description, discount_type, discount_value, min_order, max_uses, uses, valid_from, valid_until, is_active) values
    (v_rid, 'BIENVENIDA10', '10% de descuento para nuevos clientes', 'PERCENT', 10.00, null, null, 0, now() - interval '20 days', now() + interval '160 days', true),
    (v_rid, 'RINCON50', 'Q50 de descuento en compras mayores a Q200', 'FIXED', 50.00, 200.00, null, 0, now() - interval '40 days', null, true),
    (v_rid, 'VERANO2025', 'Promoción de temporada — ya vencida (deja de aplicar por fecha y por estar inactiva)', 'PERCENT', 15.00, null, 100, 67, now() - interval '135 days', now() - interval '45 days', false),
    (v_rid, 'MESA5', 'Q20 de descuento por tiempo limitado — casi agotado', 'FIXED', 20.00, null, 5, 4, now() - interval '10 days', now() + interval '20 days', true)
  on conflict (restaurant_id, code) do nothing;

  select id into v_coupon_bienvenida from coupons where restaurant_id = v_rid and code = 'BIENVENIDA10';
  select id into v_coupon_rincon50   from coupons where restaurant_id = v_rid and code = 'RINCON50';

  -- ══════════════════════════════════════════════════════════
  -- 7. Reservaciones (043_reservaciones.sql)
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from reservations where restaurant_id = v_rid) then
    insert into reservations (restaurant_id, customer_name, customer_phone, party_size, date, time, notes, status, created_at) values
      (v_rid, 'María José López',      '+502 5511 2233', 4, (current_date - 5), '19:30', 'Mesa junto a la ventana si es posible.', 'COMPLETED', now() - interval '6 days'),
      (v_rid, 'Roberto Carlos Aguilar', '+502 5644 5566', 8, (current_date - 10), '20:00', 'Cumpleaños, llevan pastel.', 'COMPLETED', now() - interval '11 days'),
      (v_rid, 'Karla Patricia Ruiz',    '+502 5611 2233', 2, (current_date - 3), '13:00', null, 'CANCELLED', now() - interval '4 days'),
      (v_rid, 'Diego Alejandro Vásquez','+502 5622 3344', 6, (current_date + 1), '19:00', 'Reunión de trabajo.', 'CONFIRMED', now() - interval '1 day'),
      (v_rid, 'Fernanda Chacón',        '+502 5633 4455', 2, (current_date + 3), '20:30', null, 'PENDING', now() - interval '3 hours'),
      (v_rid, 'Emilio Alexander Cordón','+502 5666 7788', 5, (current_date + 6), '18:30', 'Celebración familiar.', 'CONFIRMED', now() - interval '2 hours');
  end if;

  -- ══════════════════════════════════════════════════════════
  -- 8. Lista de espera (087_lista_espera.sql)
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from waitlist_entries where restaurant_id = v_rid) then
    insert into waitlist_entries (restaurant_id, customer_name, party_size, phone, notes, status, created_at, notified_at, seated_at, cancelled_at) values
      (v_rid, 'Silvia Elizabeth Monzón', 3, '+502 5677 8899', null, 'SEATED',
        now() - interval '2 days' - interval '40 minutes', now() - interval '2 days' - interval '25 minutes', now() - interval '2 days' - interval '20 minutes', null),
      (v_rid, 'Marco Tulio Barrios', 2, '+502 5688 9900', 'Prefieren mesa afuera.', 'CANCELLED',
        now() - interval '1 day' - interval '30 minutes', null, null, now() - interval '1 day' - interval '15 minutes'),
      (v_rid, 'Cristina Alvarado', 4, '+502 5699 0011', null, 'WAITING',
        now() - interval '12 minutes', null, null, null),
      (v_rid, 'Óscar Danilo Sandoval', 2, '+502 5700 1122', 'Ya avisados, esperando mesa.', 'NOTIFIED',
        now() - interval '25 minutes', now() - interval '5 minutes', null, null);
  end if;

  -- ══════════════════════════════════════════════════════════
  -- 9. Configuración de lealtad (041_loyalty.sql / 058 / 059 / 060)
  --    Opcional per las instrucciones — se incluye porque es barato:
  --    solo la fila de configuración, sin loyalty_accounts/transactions.
  -- ══════════════════════════════════════════════════════════
  insert into loyalty_settings (restaurant_id, earn_rate, earn_amount, redeem_value, min_redeem, signup_bonus, rewards_enabled)
  values (v_rid, 1, 10, 0.10, 100, 20, true)
  on conflict (restaurant_id) do nothing;

  -- ══════════════════════════════════════════════════════════
  -- 10. Mesero existente de este restaurante (si lo hay)
  --     No se crea ninguno aquí — eso lo hace la app (Personal).
  -- ══════════════════════════════════════════════════════════
  select id into v_waiter_id
    from profiles
    where restaurant_id = v_rid and role = 'RESTAURANT_WAITER'
    order by id
    limit 1;

  -- ══════════════════════════════════════════════════════════
  -- 11. Historial de pedidos — vía RPC place_order (NUNCA INSERT
  --     directo en orders/order_items: ver cabecera del archivo y
  --     schema_notes.md para la justificación completa).
  --     ~105 pedidos históricos (últimos 45 días, >3h de antigüedad)
  --     + 5 pedidos "en vivo" (últimas 2-3h) para que el panel de
  --     pedidos activos no se vea vacío al mostrarlo en una demo.
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from orders where restaurant_id = v_rid) then

    -- ── 11a. Pedidos históricos ──────────────────────────────
    for i in 1..105 loop

      -- Canal: ~40% DINE_IN, ~30% PICKUP, ~30% DELIVERY (un solo
      -- random() para que los umbrales sean exactos).
      v_rand := random();
      if v_rand < 0.40 then
        v_order_type := 'DINE_IN';
      elsif v_rand < 0.70 then
        v_order_type := 'PICKUP';
      else
        v_order_type := 'DELIVERY';
      end if;

      -- Fecha: entre 3 horas y 45 días atrás (siempre "vieja" para
      -- efectos de status DELIVERED/CANCEL).
      v_created_at := now() - interval '3 hours' - (random() * interval '45 days');

      -- Estado: 92% DELIVERED, 8% CANCEL
      if random() < 0.92 then
        v_status := 'DELIVERED';
      else
        v_status := 'CANCEL';
      end if;

      -- Cliente (pool de 20, para que se repitan como clientes reales)
      v_idx := 1 + floor(random() * 20)::int;
      v_customer_name  := v_names[v_idx];
      v_customer_phone := v_phones[v_idx];

      -- Dirección / zona / mesa según canal
      if v_order_type = 'DINE_IN' then
        v_table_no := 1 + floor(random() * 12)::int;
        v_address  := 'Mesa ' || v_table_no;
        v_zone     := null;
      elsif v_order_type = 'DELIVERY' then
        v_address := v_addresses[1 + floor(random() * array_length(v_addresses, 1))::int];
        v_zone    := v_zones[1 + floor(random() * array_length(v_zones, 1))::int];
      else
        v_address := null;
        v_zone    := null;
      end if;

      -- Nota ocasional (~15%)
      if random() < 0.15 then
        v_notes := v_notes_pool[1 + floor(random() * array_length(v_notes_pool, 1))::int];
      else
        v_notes := null;
      end if;

      -- 1 a 4 productos disponibles, cantidad 1-2 cada uno
      v_item_count := (1 + floor(random() * 4))::int;

      select
        coalesce(jsonb_agg(jsonb_build_object(
          'product_id',       sub.id,
          'name_snapshot',    sub.name,
          'price_snapshot',   sub.price,
          'cost_snapshot',    null,
          'quantity',         sub.qty,
          'subtotal',         sub.price * sub.qty,
          'options_snapshot', null,
          'note',             null
        )), '[]'::jsonb),
        coalesce(sum(sub.price * sub.qty), 0)
        into v_items, v_subtotal
      from (
        select id, name, price, (1 + floor(random() * 2))::int as qty
        from products
        where restaurant_id = v_rid and is_available = true
        order by random()
        limit v_item_count
      ) sub;

      -- Si por lo que sea no hay productos disponibles, saltar esta iteración
      continue when v_subtotal = 0;

      -- Envío
      v_fee := case when v_order_type = 'DELIVERY' then 15.00 else 0.00 end;

      -- Propina ~30% en DELIVERY/PICKUP, 10% del subtotal
      v_tip := 0;
      if v_order_type in ('DELIVERY', 'PICKUP') and random() < 0.30 then
        v_tip := round(v_subtotal * 0.10, 2);
      end if;

      -- Cupón (~8-10 de los 105, tope duro en 10)
      v_discount    := 0;
      v_coupon_id   := null;
      v_coupon_code := null;
      if v_coupon_uses_count < 10 and random() < 0.09 then
        if v_subtotal >= 200 and random() < 0.5 then
          v_coupon_id   := v_coupon_rincon50;
          v_coupon_code := 'RINCON50';
          v_discount    := 50.00;
        else
          v_coupon_id   := v_coupon_bienvenida;
          v_coupon_code := 'BIENVENIDA10';
          v_discount    := round(v_subtotal * 0.10, 2);
        end if;
        v_coupon_uses_count := v_coupon_uses_count + 1;
      end if;

      v_total := greatest(0, v_subtotal + v_fee - v_discount + v_tip);

      -- Método de pago: DINE_IN siempre CASH (igual que createWaiterOrder
      -- en orders.ts, que lo fuerza); PICKUP/DELIVERY variado.
      if v_order_type = 'DINE_IN' then
        v_payment_method := 'CASH';
      else
        v_payment_method := case when random() < 0.55 then 'CASH' else 'CARD' end;
      end if;

      -- Mesero (~35% de los DINE_IN, solo si existe uno sembrado/real)
      v_waiter_for_order := null;
      if v_order_type = 'DINE_IN' and v_waiter_id is not null and random() < 0.35 then
        v_waiter_for_order := v_waiter_id;
      end if;

      -- Crear el pedido vía el RPC real (numeración atómica, snapshots,
      -- stock, etc. — ver 097_order_item_note.sql, firma vigente).
      select place_order(
        p_restaurant_id  => v_rid,
        p_customer_name  => v_customer_name,
        p_customer_phone => v_customer_phone,
        p_order_type     => v_order_type,
        p_address        => v_address,
        p_delivery_zone  => v_zone,
        p_delivery_lat   => null,
        p_delivery_lng   => null,
        p_customer_id    => null,
        p_subtotal       => v_subtotal,
        p_delivery_fee   => v_fee,
        p_total          => v_total,
        p_notes          => v_notes,
        p_payment_method => v_payment_method,
        p_cash_amount    => null,
        p_tip            => v_tip,
        p_waiter_id      => v_waiter_for_order,
        p_client_id      => gen_random_uuid(),
        p_items          => v_items
      ) into v_placed;

      v_order_id := (v_placed ->> 'id')::uuid;

      -- "Envejecer" el pedido: place_order siempre pone created_at=now()
      -- y status='NEW'. Lo corregimos aquí con las fechas/estado que
      -- decidimos arriba, calculando también accepted_at/ready_at/
      -- served_at/delivered_at/cancelled_at según el status final
      -- (columnas confirmadas: 020_order_timestamps.sql + 071 + 079).
      update orders set
        created_at   = v_created_at,
        status       = v_status,
        accepted_at  = case when v_status in ('PREP','READY','TRANSIT','SERVED','DELIVERED')
                             then v_created_at + (interval '2 minutes' + random() * interval '3 minutes') else null end,
        ready_at     = case when v_status in ('READY','TRANSIT','SERVED','DELIVERED')
                             then v_created_at + (interval '8 minutes' + random() * interval '7 minutes') else null end,
        served_at    = case when v_order_type = 'DINE_IN' and v_status in ('SERVED','DELIVERED')
                             then v_created_at + (interval '12 minutes' + random() * interval '8 minutes') else null end,
        delivered_at = case when v_status = 'DELIVERED'
                             then v_created_at + (interval '20 minutes' + random() * interval '15 minutes') else null end,
        cancelled_at = case when v_status = 'CANCEL'
                             then v_created_at + (interval '3 minutes' + random() * interval '10 minutes') else null end
      where id = v_order_id;

      -- Metadata de cupón aplicado (igual que orders.ts líneas ~514-520)
      if v_coupon_id is not null then
        update orders set
          discount    = v_discount,
          coupon_id   = v_coupon_id,
          coupon_code = v_coupon_code
        where id = v_order_id;
        perform increment_coupon_usage(v_coupon_id);
      end if;

    end loop;

    -- ── 11b. Pedidos "en vivo" (últimas 2-3 horas) ───────────
    -- Para que el panel de pedidos activos no se vea vacío al abrir
    -- una demo. Un pedido por combinación canal/estado plausible.
    for v_live in
      select * from (values
        ('DINE_IN'::text,  'NEW'::text,     interval '8 minutes'),
        ('DINE_IN',        'PREP',          interval '25 minutes'),
        ('PICKUP',         'READY',         interval '15 minutes'),
        ('DELIVERY',       'TRANSIT',       interval '35 minutes'),
        ('DELIVERY',       'PREP',          interval '10 minutes')
      ) as t(order_type, status, ago)
    loop
      v_order_type := v_live.order_type;
      v_status     := v_live.status;
      v_created_at := now() - v_live.ago;

      v_idx := 1 + floor(random() * 20)::int;
      v_customer_name  := v_names[v_idx];
      v_customer_phone := v_phones[v_idx];

      if v_order_type = 'DINE_IN' then
        v_table_no := 1 + floor(random() * 12)::int;
        v_address  := 'Mesa ' || v_table_no;
        v_zone     := null;
      elsif v_order_type = 'DELIVERY' then
        v_address := v_addresses[1 + floor(random() * array_length(v_addresses, 1))::int];
        v_zone    := v_zones[1 + floor(random() * array_length(v_zones, 1))::int];
      else
        v_address := null;
        v_zone    := null;
      end if;

      v_item_count := (1 + floor(random() * 4))::int;

      select
        coalesce(jsonb_agg(jsonb_build_object(
          'product_id',       sub.id,
          'name_snapshot',    sub.name,
          'price_snapshot',   sub.price,
          'cost_snapshot',    null,
          'quantity',         sub.qty,
          'subtotal',         sub.price * sub.qty,
          'options_snapshot', null,
          'note',             null
        )), '[]'::jsonb),
        coalesce(sum(sub.price * sub.qty), 0)
        into v_items, v_subtotal
      from (
        select id, name, price, (1 + floor(random() * 2))::int as qty
        from products
        where restaurant_id = v_rid and is_available = true
        order by random()
        limit v_item_count
      ) sub;

      continue when v_subtotal = 0;

      v_fee := case when v_order_type = 'DELIVERY' then 15.00 else 0.00 end;
      v_tip := 0;
      v_total := greatest(0, v_subtotal + v_fee);

      if v_order_type = 'DINE_IN' then
        v_payment_method := 'CASH';
      else
        v_payment_method := case when random() < 0.55 then 'CASH' else 'CARD' end;
      end if;

      v_waiter_for_order := null;
      if v_order_type = 'DINE_IN' and v_waiter_id is not null and random() < 0.35 then
        v_waiter_for_order := v_waiter_id;
      end if;

      select place_order(
        p_restaurant_id  => v_rid,
        p_customer_name  => v_customer_name,
        p_customer_phone => v_customer_phone,
        p_order_type     => v_order_type,
        p_address        => v_address,
        p_delivery_zone  => v_zone,
        p_delivery_lat   => null,
        p_delivery_lng   => null,
        p_customer_id    => null,
        p_subtotal       => v_subtotal,
        p_delivery_fee   => v_fee,
        p_total          => v_total,
        p_notes          => null,
        p_payment_method => v_payment_method,
        p_cash_amount    => null,
        p_tip            => v_tip,
        p_waiter_id      => v_waiter_for_order,
        p_client_id      => gen_random_uuid(),
        p_items          => v_items
      ) into v_placed;

      v_order_id := (v_placed ->> 'id')::uuid;

      update orders set
        created_at   = v_created_at,
        status       = v_status,
        accepted_at  = case when v_status in ('PREP','READY','TRANSIT','SERVED','DELIVERED')
                             then v_created_at + interval '2 minutes' else null end,
        ready_at     = case when v_status in ('READY','TRANSIT','SERVED','DELIVERED')
                             then v_created_at + interval '9 minutes' else null end
      where id = v_order_id;

    end loop;

  end if;

  -- ══════════════════════════════════════════════════════════
  -- 12. Calificaciones de pedidos (044_encuestas.sql)
  --     Solo tiene sentido si ya hay pedidos DELIVERED — por eso
  --     también se guarda con su propio `if not exists`.
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from order_ratings where restaurant_id = v_rid) then
    insert into order_ratings (restaurant_id, order_id, rating, comment, customer_name, created_at)
    select
      v_rid,
      picked.id,
      picked.rating,
      case
        when picked.rating = 3 then
          (array[
            'Buena comida pero la espera fue larga.',
            'Rico, pero llegó un poco frío.',
            'Buen sabor, esperaba un poco más de cantidad.'
          ])[1 + floor(random() * 3)::int]
        when random() < 0.25 then
          (array[
            '¡Excelente atención, todo delicioso!',
            'Muy buen servicio y rapidez, volveremos.',
            'Como siempre, una gran experiencia.'
          ])[1 + floor(random() * 3)::int]
        else null
      end,
      picked.customer_name,
      picked.created_at + interval '1 hour' + (random() * interval '30 hours')
    from (
      select o.id, o.customer_name, o.created_at,
        (case when random() < 0.55 then 5 when random() < 0.85 then 4 else 3 end) as rating
      from orders o
      where o.restaurant_id = v_rid and o.status = 'DELIVERED'
      order by random()
      limit 18
    ) picked;
  end if;

  -- ══════════════════════════════════════════════════════════
  -- 13. Llamadas de mesero (048_waiter_calls.sql)
  --     Tabla mínima: solo table_number/resolved_at/created_at,
  --     sin referencia a order_id (confirmado leyendo la migración).
  -- ══════════════════════════════════════════════════════════
  if not exists (select 1 from waiter_calls where restaurant_id = v_rid) then
    insert into waiter_calls (restaurant_id, table_number, created_at, resolved_at) values
      (v_rid, 3, now() - interval '3 hours',                now() - interval '3 hours' + interval '4 minutes'),
      (v_rid, 7, now() - interval '1 day',                   now() - interval '1 day' + interval '6 minutes'),
      (v_rid, 2, now() - interval '2 days',                  now() - interval '2 days' + interval '3 minutes'),
      (v_rid, 5, now() - interval '5 hours',                 now() - interval '5 hours' + interval '8 minutes'),
      (v_rid, 4, now() - interval '8 minutes',                null);
  end if;

  raise notice 'Rincón 502 (slug=rincon502, id=%) sembrado/actualizado correctamente.', v_rid;

end $$;
