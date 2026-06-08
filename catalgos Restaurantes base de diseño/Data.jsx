// Data.jsx — Azúcar Negra menu + admin seed data. Currency: GTQ (Q).

const CATEGORIES = [
  { id: 'bagels', name: 'Bagels',  icon: 'bagel',     tag: 'B' },
  { id: 'cafe',   name: 'Café',    icon: 'coffee',    tag: 'C' },
  { id: 'frios',  name: 'Fríos',   icon: 'ice',       tag: 'F' },
  { id: 'dulce',  name: 'Dulce',   icon: 'cookie',    tag: 'D' },
];

// tag types: hot (picante), new (nuevo), fav (favorito), veg (veggie)
const PRODUCTS = [
  // ── Bagels ──
  { id: 1,  cat: 'bagels', name: 'Negra Brava',     price: 45, icon: 'flame',   seed: 3,  tags: ['hot','fav'],
    desc: 'Bagel de carbón activado, chorizo artesanal, huevo y jalapeño curtido. La que arde.', avail: true },
  { id: 2,  cat: 'bagels', name: 'El Clásico',      price: 28, icon: 'bagel',   seed: 7,  tags: [],
    desc: 'Bagel del día, queso crema batido y un toque de sal de mar. Sin vueltas.', avail: true },
  { id: 3,  cat: 'bagels', name: 'Lox del Barrio',  price: 62, icon: 'bagel',   seed: 1,  tags: ['fav'],
    desc: 'Salmón curado en casa, queso crema, alcaparras y cebolla morada.', avail: true },
  { id: 4,  cat: 'bagels', name: 'Pastrami Pesado', price: 55, icon: 'wheat',   seed: 9,  tags: [],
    desc: 'Pastrami ahumado 12 horas, mostaza de la casa, pepinillo.', avail: true },
  { id: 5,  cat: 'bagels', name: 'Veggie Calle',    price: 42, icon: 'leaf',    seed: 4,  tags: ['veg'],
    desc: 'Aguacate machacado, tomate asado, rúcula y semillas tostadas.', avail: true },
  { id: 6,  cat: 'bagels', name: 'Tres Quesos',     price: 40, icon: 'milk',    seed: 6,  tags: [],
    desc: 'Mozzarella, cheddar añejo y queso crema fundidos al sartén.', avail: false },

  // ── Café ──
  { id: 7,  cat: 'cafe',   name: 'Mocha Negra',     price: 26, icon: 'coffee',  seed: 2,  tags: ['fav'],
    desc: 'Espresso doble, cacao 70% y leche al vapor. El sabor de la casa.', avail: true },
  { id: 8,  cat: 'cafe',   name: 'Cortado',         price: 18, icon: 'coffee',  seed: 8,  tags: [],
    desc: 'Espresso cortado con un toque de leche texturizada.', avail: true },
  { id: 9,  cat: 'cafe',   name: 'Latte de Calle',  price: 22, icon: 'coffee',  seed: 5,  tags: [],
    desc: 'Espresso suave, leche sedosa, arte en cada taza.', avail: true },
  { id: 10, cat: 'cafe',   name: 'Espresso Doble',  price: 16, icon: 'coffee',  seed: 0,  tags: [],
    desc: 'Dos shots, puro carácter. Para los que van de paso.', avail: true },

  // ── Fríos ──
  { id: 11, cat: 'frios',  name: 'Cold Brew 18h',   price: 24, icon: 'ice',     seed: 4,  tags: ['fav'],
    desc: 'Extracción en frío 18 horas. Suave, intenso, sin amargor.', avail: true },
  { id: 12, cat: 'frios',  name: 'Frappé Azúcar',   price: 30, icon: 'ice',     seed: 9,  tags: ['new'],
    desc: 'Café, hielo, leche y caramelo de azúcar negra batido.', avail: true },
  { id: 13, cat: 'frios',  name: 'Matcha Helado',   price: 28, icon: 'leaf',    seed: 1,  tags: ['veg'],
    desc: 'Matcha ceremonial sobre leche de avena y hielo.', avail: true },

  // ── Dulce ──
  { id: 14, cat: 'dulce',  name: 'Roll de Canela',  price: 25, icon: 'cookie',  seed: 7,  tags: ['fav'],
    desc: 'Recién horneado, glaseado de queso crema. Caliente siempre.', avail: true },
  { id: 15, cat: 'dulce',  name: 'Brownie Negro',   price: 22, icon: 'cookie',  seed: 3,  tags: [],
    desc: 'Chocolate 80%, centro fundido, sal Maldon encima.', avail: true },
  { id: 16, cat: 'dulce',  name: 'Cheesecake',      price: 30, icon: 'cookie',  seed: 6,  tags: ['new'],
    desc: 'Estilo Nueva York, base de galleta de la casa.', avail: true },
];

const TAG_LABEL = {
  hot: 'Picante', new: 'Nuevo', fav: 'Favorito', veg: 'Veggie',
};
const TAG_ICON = { hot: 'flame', new: 'sparkle', fav: 'star', veg: 'leaf' };

const fmtQ = (n) => 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getProduct = (id) => PRODUCTS.find(p => p.id === id);

// ── Admin seed ──
const RESTAURANT = { name: 'Azúcar Negra', tagline: 'Cafetería con sabor a calle', zone: 'Zona 1 · Centro' };

const SEED_ORDERS = [
  { id: 'ORD-00231', cliente: 'Andrea M.', tipo: 'Domicilio', dir: '5a calle 8-23, Zona 1', tel: '5012 4488',
    items: [{ id: 1, q: 2 }, { id: 7, q: 2 }], pago: 'Efectivo', status: 'PREP', mins: 6, total: 142 },
  { id: 'ORD-00230', cliente: 'Kevin R.', tipo: 'Para llevar', dir: 'Recoge en barra', tel: '4471 9920',
    items: [{ id: 11, q: 1 }, { id: 14, q: 1 }], pago: 'Efectivo', status: 'READY', mins: 12, total: 49 },
  { id: 'ORD-00229', cliente: 'Sofía L.', tipo: 'Domicilio', dir: '12 av 4-15, Zona 10', tel: '3398 7765',
    items: [{ id: 3, q: 1 }, { id: 9, q: 1 }, { id: 16, q: 1 }], pago: 'Efectivo', status: 'DELIVERED', mins: 41, total: 114 },
  { id: 'ORD-00228', cliente: 'Diego P.', tipo: 'Para llevar', dir: 'Recoge en barra', tel: '5567 1102',
    items: [{ id: 4, q: 1 }, { id: 10, q: 2 }], pago: 'Efectivo', status: 'DELIVERED', mins: 58, total: 87 },
];

const ORDER_STATUS = {
  NEW:       { label: 'Nuevo',          tone: 'alert' },
  PREP:      { label: 'En preparación', tone: 'open' },
  READY:     { label: 'Listo',          tone: 'mid' },
  TRANSIT:   { label: 'En camino',      tone: 'mid' },
  DELIVERED: { label: 'Entregado',      tone: 'done' },
  CANCEL:    { label: 'Cancelado',      tone: 'off' },
};

const SALES_SERIES = [3.2, 4.1, 3.6, 5.0, 4.4, 6.2, 5.8, 4.9, 6.6, 5.4, 7.1, 6.0, 7.8, 8.3];
const SALES_LABELS = ['','','','','','','','','','','','','A','HOY'];

window.AZ = {
  CATEGORIES, PRODUCTS, TAG_LABEL, TAG_ICON, fmtQ, getProduct,
  RESTAURANT, SEED_ORDERS, ORDER_STATUS, SALES_SERIES, SALES_LABELS,
};
