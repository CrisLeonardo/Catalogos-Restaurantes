-- ============================================================
-- Tutorial demo: Bistró La Plaza
-- Restaurante de demostración para las capturas del Centro de Ayuda.
--
-- CÓMO USARLO:
--   1. Arranca el proyecto local: npm run dev (en /plataforma)
--   2. Ejecuta este script en el SQL Editor de Supabase local:
--        npx supabase db reset  (opcional, para entorno limpio)
--        Luego pega y ejecuta este archivo en la UI o vía psql.
--   3. Inicia sesión en /admin con la cuenta del restaurante demo.
--   4. Toma capturas con resolución 1280×800 (recomendado).
--   5. Guarda en /public/tutorial/screenshots/ con la convención:
--        {sectionId}-paso{N}.png   ej: catalogo-paso1.png
--
-- IDEMPOTENTE: Usa ON CONFLICT DO NOTHING; puedes ejecutarlo varias veces.
-- ============================================================

do $$
declare
  v_rid  uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  v_c1   uuid := 'dddddddd-dddd-dddd-dddd-dddddddddd01'::uuid;
  v_c2   uuid := 'dddddddd-dddd-dddd-dddd-dddddddddd02'::uuid;
  v_c3   uuid := 'dddddddd-dddd-dddd-dddd-dddddddddd03'::uuid;
  v_c4   uuid := 'dddddddd-dddd-dddd-dddd-dddddddddd04'::uuid;
  v_p1   uuid;
  v_p2   uuid;
  v_p3   uuid;
  v_p4   uuid;
  v_o1   uuid;
  v_o2   uuid;
  v_o3   uuid;
begin

-- ── Restaurante ─────────────────────────────────────────────
insert into restaurants (
  id, slug, name, tagline,
  plan_actual, status,
  whatsapp_number, contact_email,
  modules, module_settings
) values (
  v_rid,
  'bistro-la-plaza',
  'Bistró La Plaza',
  'Cocina de mercado en el corazón de la ciudad',
  'PREMIUM', 'active',
  '+502 4500 0000', 'hola@bistroplaza.com',
  '{"catalog":true,"orders":true,"whatsapp_notify":true,"loyalty":true,"recetas":true}'::jsonb,
  '{"loyalty":{"enabled":true},"recetas":{"enabled":true}}'::jsonb
)
on conflict (slug) do nothing;

-- ── Tema ────────────────────────────────────────────────────
insert into restaurant_themes (
  restaurant_id, brand_name,
  color_primary, color_bg, color_text,
  font_display, portada_style, catalog_view, glass_intensity
) values (
  v_rid, 'Bistró La Plaza',
  '#c2882f', '#0e0d0b', '#F6F3EE',
  'Playfair Display', 'poster', 'grid', 'esmerilado'
) on conflict (restaurant_id) do nothing;

-- ── Categorías ───────────────────────────────────────────────
insert into categories (id, restaurant_id, name, sort_order) values
  (v_c1, v_rid, 'Entradas',           0),
  (v_c2, v_rid, 'Platos Principales', 1),
  (v_c3, v_rid, 'Postres',            2),
  (v_c4, v_rid, 'Bebidas',            3)
on conflict (id) do nothing;

-- ── Productos ────────────────────────────────────────────────
insert into products (restaurant_id, category_id, name, description, price, tags, sort_order)
values
  -- Entradas
  (v_rid, v_c1, 'Ceviche Mixto',
   'Camarón y pescado fresco en leche de tigre, camote y choclo.',
   85.00, ARRAY['Favorito', 'Sin gluten'], 0),
  (v_rid, v_c1, 'Bruschetta de la Casa',
   'Pan artesanal tostado, tomate cherry, albahaca fresca y aceite de oliva.',
   55.00, ARRAY['Vegano'], 1),
  -- Platos principales
  (v_rid, v_c2, 'Filete de Res a la Parrilla',
   '250 g de corte choice, papas rústicas y ensalada de temporada.',
   195.00, ARRAY['Favorito'], 0),
  (v_rid, v_c2, 'Pasta Primavera',
   'Fettuccine al dente con verduras salteadas y pesto casero.',
   120.00, ARRAY['Vegetariano'], 1),
  -- Postres
  (v_rid, v_c3, 'Lava Cake de Chocolate',
   'Pastel tibio de chocolate con centro fundido y bola de helado de vainilla.',
   75.00, ARRAY['Nuevo'], 0),
  -- Bebidas
  (v_rid, v_c4, 'Limonada Natural',
   'Limón fresco exprimido al momento, sin conservantes.',
   35.00, NULL, 0),
  (v_rid, v_c4, 'Agua de Maracuyá',
   'Maracuyá natural con agua mineral y toque de menta.',
   40.00, ARRAY['Sin azúcar'], 1)
on conflict do nothing;

-- ── Pedidos demo ────────────────────────────────────────────
-- Solo inserta si el restaurante no tiene pedidos aún (idempotente)
if not exists (select 1 from orders where restaurant_id = v_rid) then

  -- IDs de productos para los items
  select id into v_p1 from products
    where restaurant_id = v_rid and name = 'Ceviche Mixto' limit 1;
  select id into v_p2 from products
    where restaurant_id = v_rid and name = 'Filete de Res a la Parrilla' limit 1;
  select id into v_p3 from products
    where restaurant_id = v_rid and name = 'Lava Cake de Chocolate' limit 1;
  select id into v_p4 from products
    where restaurant_id = v_rid and name = 'Limonada Natural' limit 1;

  -- Pedido 1 — entregado hace 2 horas
  v_o1 := gen_random_uuid();
  insert into orders (id, restaurant_id, order_number, customer_name, customer_phone,
    order_type, payment_method, status, subtotal, total, created_at)
  values (v_o1, v_rid, 'ORD-2026-00001',
    'María González', '+502 5500 1111',
    'PICKUP', 'CASH', 'DELIVERED',
    280.00, 280.00, now() - interval '2 hours');

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, subtotal)
  values
    (v_o1, v_p2, 'Filete de Res a la Parrilla', 195.00, 1, 195.00),
    (v_o1, v_p1, 'Ceviche Mixto', 85.00, 1, 85.00);

  -- Pedido 2 — en preparación
  v_o2 := gen_random_uuid();
  insert into orders (id, restaurant_id, order_number, customer_name, customer_phone,
    order_type, payment_method, status, subtotal, total, notes, created_at)
  values (v_o2, v_rid, 'ORD-2026-00002',
    'Carlos Pérez', '+502 5500 2222',
    'DELIVERY', 'CARD', 'PREP',
    195.00, 205.00,
    'Entregar en portón azul', now() - interval '25 minutes');

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, subtotal)
  values (v_o2, v_p2, 'Filete de Res a la Parrilla', 195.00, 1, 195.00);

  -- Pedido 3 — nuevo (recién llegado)
  v_o3 := gen_random_uuid();
  insert into orders (id, restaurant_id, order_number, customer_name, customer_phone,
    order_type, payment_method, status, subtotal, total, notes, created_at)
  values (v_o3, v_rid, 'ORD-2026-00003',
    'Ana López', '+502 5500 3333',
    'PICKUP', 'CASH', 'NEW',
    160.00, 160.00,
    'Sin cebolla en el ceviche', now() - interval '5 minutes');

  insert into order_items (order_id, product_id, name_snapshot, price_snapshot, quantity, subtotal)
  values
    (v_o3, v_p1, 'Ceviche Mixto', 85.00, 1, 85.00),
    (v_o3, v_p3, 'Lava Cake de Chocolate', 75.00, 1, 75.00);

end if;

raise notice 'Demo Bistró La Plaza insertado. Slug: bistro-la-plaza';
end $$;
