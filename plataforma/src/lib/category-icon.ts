/* ============================================================
   ICONO SUGERIDO PARA UNA CATEGORÍA
   ------------------------------------------------------------
   Sin icono elegido, la categoría usaba siempre el mismo (una mesa),
   en el panel y en la carta: repetido en todas no dice nada. Este es
   el que sugiere su nombre (Café → taza, Dulce → galleta). Lo usan el
   panel de Categorías y la carta del comensal, para que digan lo mismo
   (auditoría 2026-10-02, MEN-08 y CAT-06).
   ============================================================ */

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export const CAT_ICON_MAP: [string, string[]][] = [
  ['coffee',    ['cafe', 'coffee', 'te', 'latte', 'capuchino', 'espreso', 'expreso', 'boba', 'jugo', 'refresco', 'cocoa', 'matcha', 'bebida', 'agua', 'soda', 'limonada', 'horchata']],
  ['sparkle',   ['cocktail', 'coctel', 'bar', 'alcohol', 'cerveza', 'beer', 'vino', 'wine', 'copa', 'bebida alcoholica', 'cantina']],
  ['ice',       ['frappe', 'smoothie', 'batido', 'licuado', 'malteada', 'shake', 'frio', 'agua fresca']],
  ['flame',     ['parrilla', 'grill', 'brasa', 'bbq', 'barbecue', 'carne', 'asado', 'parrillada', 'alitas', 'wings', 'taco', 'plato fuerte', 'fuerte']],
  ['leaf',      ['vegano', 'vegetal', 'ensalada', 'salad', 'saludable', 'verde', 'organico', 'natural', 'verduras', 'fruta', 'fruit', 'vegetariano', 'entrada', 'botana', 'aperitivo']],
  ['cookie',    ['postre', 'dessert', 'pastel', 'torta', 'dulce', 'sweet', 'galleta', 'helado', 'gelatina', 'flan', 'brownie', 'crepa', 'waffle', 'pan dulce']],
  ['croissant', ['sandwich', 'sanwich', 'hamburguesa', 'burger', 'torta', 'wrap', 'hot dog', 'hotdog', 'baguette', 'pan', 'bread', 'tostada', 'quesadilla', 'burritos']],
  ['milk',      ['lacteo', 'queso', 'leche', 'dairy', 'yogurt', 'yogur', 'cremoso']],
  ['wheat',     ['pasta', 'arroz', 'rice', 'cereal', 'harina', 'espagueti', 'fideos', 'noodles']],
  ['star',      ['especial', 'special', 'premium', 'signature', 'chef', 'popular', 'favorito', 'destacado', 'promocion', 'oferta', 'combo']],
  ['bagel',     ['pizza', 'donut', 'dona', 'bagel', 'empanada', 'gordita', 'arepa']],
  ['utensils',  []],
];

/* Palabra completa (con su plural), no un trozo: con `includes`, el «te»
   de té casaba con «Platos fuerTEs» y la categoría salía con una taza. */
function hasWord(text: string, kw: string): boolean {
  const k = fold(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${k}(s|es)?($|[^a-z0-9])`).test(text);
}

export function suggestIcon(name: string): string {
  const n = fold(name);
  for (const [icon, kws] of CAT_ICON_MAP) {
    for (const kw of kws) {
      if (hasWord(n, kw)) return icon;
    }
  }
  return 'utensils';
}
