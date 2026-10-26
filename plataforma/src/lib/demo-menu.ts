/* Menú de ejemplo: Rincón 502, el restaurante demo de Leogin (hamburguesas,
   pizzas y pastas en El Progreso, Jutiapa). Es la misma carta que siembra
   supabase/seed_demo_rincon502.sql, recortada a lo que se ve bien en una
   demo. Se usa en el subdominio `demo`, en la vitrina de diseños de la
   portada (/preview/muestra) y como datos de muestra en la vista previa en
   vivo cuando un restaurante aún no tiene productos cargados.

   Las imágenes son ilustraciones propias (docs/diseno/rincon502/
   ilustraciones.mjs): Rincón 502 no tiene fotos libres de usar. Si algún día
   las hay, basta con dejarlas con el mismo nombre en public/demo/rincon502/.

   Sin dependencias: importable en server y cliente. */

import type { Category, Product } from '@/types';
import type { ThemeRow } from '@/lib/theme/resolve';

export type DemoCategory = Pick<Category, 'id' | 'name' | 'icon'>;
export type DemoProduct = Pick<
  Product,
  'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'
>;

/** El tema de Rincón 502: el mismo de su fila en `restaurant_themes`, con
    superficies sólidas y el esquema oscuro escrito (su fondo es casi negro). */
export const DEMO_THEME: ThemeRow = {
  brand_name: 'Rincón 502',
  color_primary: '#E4572E',
  color_bg: '#161512',
  color_text: '#F7F3EF',
  font_display: 'Unbounded',
  portada_style: 'spotlight',
  catalog_view: 'grid',
  glass_intensity: 'solido',
  config: {
    scheme: 'dark',
    tagline: 'Hamburguesas, pizzas y pastas',
    zone: 'El Progreso, Jutiapa',
  },
};

const foto = (id: string) => `/demo/rincon502/${id}.webp`;

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: 'c1', name: 'Hamburguesas', icon: 'flame' },
  { id: 'c2', name: 'Entradas',     icon: 'utensils' },
  { id: 'c3', name: 'Pizzas',       icon: 'star' },
  { id: 'c4', name: 'Pastas',       icon: 'wheat' },
  { id: 'c5', name: 'Postres',      icon: 'cookie' },
  { id: 'c6', name: 'Bebidas',      icon: 'ice' },
];

/* Algunos productos traen variantes y extras para que el prospecto VEA la
   función en la demo (término de la carne, tamaño de la pizza, sabor de la
   malteada). */
const EXTRAS_HAMBURGUESA = {
  id: 'g-extras', name: 'Extras', type: 'multi' as const, max: 3,
  choices: [
    { id: 'x-tocino',   name: 'Tocino',       priceDelta: 10 },
    { id: 'x-queso',    name: 'Queso extra',  priceDelta: 8 },
    { id: 'x-aguacate', name: 'Aguacate',     priceDelta: 10 },
  ],
};
const TERMINO = {
  id: 'g-termino', name: 'Término de la carne', type: 'single' as const, required: true,
  choices: [
    { id: 't-medio',  name: 'Término medio', priceDelta: 0 },
    { id: 't-34',     name: 'Tres cuartos',  priceDelta: 0 },
    { id: 't-cocido', name: 'Bien cocido',   priceDelta: 0 },
  ],
};
const TAMANO_PIZZA = {
  id: 'g-tamano', name: 'Tamaño', type: 'single' as const, required: true,
  choices: [
    { id: 's-mediana',  name: 'Mediana',  priceDelta: 0 },
    { id: 's-familiar', name: 'Familiar', priceDelta: 50 },
  ],
};

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'p1', category_id: 'c1', name: 'Rincón Clásica',
    description: 'Carne de 150 g, queso cheddar, lechuga, tomate y cebolla morada. Con papas.',
    price: 52, image_url: foto('rincon-clasica'), icon: null, tags: ['Favorito'],
    options: [TERMINO, EXTRAS_HAMBURGUESA],
  },
  {
    id: 'p2', category_id: 'c1', name: 'Doble Bacon',
    description: 'Doble carne, doble queso, tocino crocante y la salsa especial de la casa.',
    price: 68, image_url: foto('doble-bacon'), icon: null, tags: ['Favorito', 'Nuevo'],
    options: [TERMINO, EXTRAS_HAMBURGUESA],
  },
  { id: 'p3', category_id: 'c2', name: 'Papas con Queso',  description: 'Papas fritas cubiertas de queso fundido, tocino y cebollín.',   price: 35, image_url: foto('papas-con-queso'), icon: null, tags: ['Favorito'], options: null },
  { id: 'p4', category_id: 'c2', name: 'Alitas BBQ',       description: 'Ocho alitas bañadas en salsa BBQ de la casa, con apio y ranch.', price: 55, image_url: foto('alitas-bbq'),      icon: null, tags: ['Picante'],  options: null },
  { id: 'p5', category_id: 'c2', name: 'Nachos Supremos',  description: 'Totopos, frijol, queso fundido, guacamole, pico de gallo y crema.', price: 48, image_url: foto('nachos-supremos'), icon: null, tags: [], dietary_tags: ['vegetariano'], options: null },
  {
    id: 'p6', category_id: 'c3', name: 'Pepperoni',
    description: 'Salsa de tomate, abundante mozzarella y pepperoni crocante.',
    price: 85, image_url: foto('pizza-pepperoni'), icon: null, tags: ['Favorito'],
    options: [TAMANO_PIZZA],
  },
  {
    id: 'p7', category_id: 'c3', name: 'Margarita',
    description: 'Tomate, mozzarella fresca y albahaca. La de siempre.',
    price: 75, image_url: foto('pizza-margarita'), icon: null, tags: [], dietary_tags: ['vegetariano'],
    options: [TAMANO_PIZZA],
  },
  { id: 'p8', category_id: 'c4', name: 'Fettuccine Alfredo', description: 'Fettuccine en salsa alfredo cremosa, con perejil y pimienta.', price: 65, image_url: foto('fettuccine-alfredo'), icon: null, tags: [], options: null },
  { id: 'p9', category_id: 'c4', name: 'Lasaña de la Casa',  description: 'Capas de carne, queso y salsa de la casa, horneada al momento.', price: 75, image_url: foto('lasana-de-la-casa'), icon: null, tags: ['Favorito'], options: null },
  { id: 'p10', category_id: 'c5', name: 'Volcán de Chocolate', description: 'Pastel tibio con el centro fundido y una bola de vainilla.', price: 32, image_url: foto('volcan-de-chocolate'), icon: null, tags: ['Favorito'], options: null },
  { id: 'p11', category_id: 'c5', name: 'Cheesecake de Fresa', description: 'Cremoso, con cobertura y fresas enteras.',                    price: 30, image_url: foto('cheesecake-de-fresa'), icon: null, tags: [], options: null },
  {
    id: 'p12', category_id: 'c6', name: 'Malteada',
    description: 'Cremosa, con crema batida y cereza.',
    price: 28, image_url: foto('malteada'), icon: null, tags: ['Nuevo'],
    options: [
      {
        id: 'g-sabor', name: 'Sabor', type: 'single', required: true,
        choices: [
          { id: 'm-fresa',    name: 'Fresa',     priceDelta: 0 },
          { id: 'm-vainilla', name: 'Vainilla',  priceDelta: 0 },
          { id: 'm-choco',    name: 'Chocolate', priceDelta: 0 },
        ],
      },
    ],
  },
  { id: 'p13', category_id: 'c6', name: 'Limonada con Menta', description: 'Limón exprimido al momento, menta fresca y mucho hielo.', price: 18, image_url: foto('limonada-con-menta'), icon: null, tags: [], options: null },
];
