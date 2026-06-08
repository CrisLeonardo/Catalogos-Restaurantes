-- ============================================================
-- Demo: Azúcar Negra
-- Ejecutar DESPUÉS de 001_initial_schema.sql
-- ============================================================

do $$
declare
  v_rid  uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_c1   uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01'::uuid;
  v_c2   uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02'::uuid;
  v_c3   uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03'::uuid;
  v_c4   uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04'::uuid;
begin

-- Restaurante
insert into restaurants (id, slug, name, tagline, plan_actual, status)
values (v_rid, 'azucar-negra', 'Azúcar Negra', 'Cafetería con sabor a calle', 'CATALOGO', 'active')
on conflict (slug) do nothing;

-- Tema
insert into restaurant_themes (
  restaurant_id, brand_name,
  color_primary, color_bg, color_text,
  font_display, portada_style, catalog_view, glass_intensity
) values (
  v_rid, 'Azúcar Negra',
  '#D97757', '#0b0b0c', '#F5F3EF',
  'Unbounded', 'spotlight', 'grid', 'translucido'
) on conflict (restaurant_id) do nothing;

-- Categorías
insert into categories (id, restaurant_id, name, sort_order) values
  (v_c1, v_rid, 'Bagels', 0),
  (v_c2, v_rid, 'Café',   1),
  (v_c3, v_rid, 'Fríos',  2),
  (v_c4, v_rid, 'Dulce',  3)
on conflict (id) do nothing;

-- Productos
insert into products (restaurant_id, category_id, name, description, price, tags, sort_order) values
  (v_rid, v_c1, 'Negra Brava',
   'Bagel de carbón activado, chorizo artesanal, huevo y jalapeño curtido.',
   45.00, ARRAY['Picante'], 0),
  (v_rid, v_c1, 'Lox del Barrio',
   'Salmón curado en casa, queso crema, alcaparras y cebolla morada.',
   62.00, ARRAY['Favorito'], 1),
  (v_rid, v_c2, 'Mocha Negra',
   'Espresso doble, cacao 70% y leche al vapor. El sabor de la casa.',
   26.00, ARRAY['Favorito'], 0),
  (v_rid, v_c3, 'Cold Brew 18h',
   'Extracción en frío 18 horas. Suave, intenso, sin amargor.',
   24.00, NULL, 0),
  (v_rid, v_c4, 'Roll de Canela',
   'Recién horneado, glaseado de queso crema. Caliente siempre.',
   25.00, ARRAY['Nuevo'], 0),
  (v_rid, v_c4, 'Brownie Negro',
   'Chocolate 80%, centro fundido, sal Maldon encima.',
   22.00, NULL, 1);

end $$;
