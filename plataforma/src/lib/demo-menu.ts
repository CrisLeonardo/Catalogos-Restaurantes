/* Menú de ejemplo (Café Demo) — se usa en el subdominio `demo` y como
   datos de muestra en la vista previa en vivo cuando un restaurante aún
   no tiene productos cargados. Sin dependencias: importable en server y cliente. */

import type { Category, Product } from '@/types';

export type DemoCategory = Pick<Category, 'id' | 'name' | 'icon'>;
export type DemoProduct = Pick<
  Product,
  'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'
>;

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: 'c1', name: 'Bagels', icon: 'bagel' },
  { id: 'c2', name: 'Café',   icon: 'coffee' },
  { id: 'c3', name: 'Fríos',  icon: 'ice' },
  { id: 'c4', name: 'Dulce',  icon: 'cookie' },
];

/* Algunos productos traen variantes/extras para que el prospecto VEA la
   función en la demo (tamaños de bebida, extras del bagel). */
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'p1', category_id: 'c1', name: 'Bagel Bravo',
    description: 'Bagel de carbón activado, chorizo artesanal, huevo y jalapeño curtido.',
    price: 45, image_url: null, icon: null, tags: ['Picante', 'Favorito'],
    options: [
      {
        id: 'g-extras', name: 'Extras', type: 'multi', max: 3,
        choices: [
          { id: 'x-queso',     name: 'Doble queso',   priceDelta: 8 },
          { id: 'x-aguacate',  name: 'Aguacate',      priceDelta: 10 },
          { id: 'x-jalapeno',  name: 'Más jalapeño',  priceDelta: 0 },
        ],
      },
    ],
  },
  { id: 'p2', category_id: 'c1', name: 'El Clásico',     description: 'Bagel del día, queso crema batido y un toque de sal de mar.',            price: 28, image_url: null, icon: null, tags: [], options: null },
  { id: 'p3', category_id: 'c1', name: 'Lox del Barrio', description: 'Salmón curado en casa, queso crema, alcaparras y cebolla morada.',        price: 62, image_url: null, icon: null, tags: ['Favorito'], options: null },
  {
    id: 'p4', category_id: 'c2', name: 'Mocha de la Casa',
    description: 'Espresso doble, cacao 70% y leche al vapor. El sabor de la casa.',
    price: 26, image_url: null, icon: null, tags: ['Favorito'],
    options: [
      {
        id: 'g-size', name: 'Tamaño', type: 'single', required: true,
        choices: [
          { id: 's-8',  name: '8 oz',  priceDelta: 0 },
          { id: 's-12', name: '12 oz', priceDelta: 6 },
          { id: 's-16', name: '16 oz', priceDelta: 10 },
        ],
      },
      {
        id: 'g-milk', name: 'Leche', type: 'single',
        choices: [
          { id: 'm-entera', name: 'Entera',    priceDelta: 0 },
          { id: 'm-avena',  name: 'De avena',  priceDelta: 5 },
          { id: 'm-deslac', name: 'Deslactosada', priceDelta: 3 },
        ],
      },
    ],
  },
  { id: 'p5', category_id: 'c2', name: 'Latte de Calle', description: 'Espresso suave, leche sedosa, arte en cada taza.',                       price: 22, image_url: null, icon: null, tags: [], options: null },
  { id: 'p6', category_id: 'c3', name: 'Cold Brew 18h',  description: 'Extracción en frío 18 horas. Suave, intenso, sin amargor.',               price: 24, image_url: null, icon: null, tags: [], options: null },
  { id: 'p7', category_id: 'c3', name: 'Frappé Azúcar',  description: 'Café, hielo, leche y caramelo de azúcar negra batido.',                   price: 30, image_url: null, icon: null, tags: ['Nuevo'], options: null },
  { id: 'p8', category_id: 'c4', name: 'Roll de Canela', description: 'Recién horneado, glaseado de queso crema. Caliente siempre.',             price: 25, image_url: null, icon: null, tags: ['Favorito'], options: null },
  { id: 'p9', category_id: 'c4', name: 'Brownie de Chocolate',  description: 'Chocolate 80%, centro fundido, sal Maldon encima.',                       price: 22, image_url: null, icon: null, tags: [], options: null },
];
