/* ============================================================
   MOTOR DE PERSONALIZACIÓN — Tipos y defaults
   ------------------------------------------------------------
   ThemeConfig  = todos los "knobs" visuales (colores, fuentes,
                  fondo, portada, catálogo, moneda, etc.)
   ThemeContent = TODOS los textos visibles del cliente.

   Lo que se guarda en la BD (restaurant_themes.config / .content)
   son OVERRIDES PARCIALES. El resolver hace el merge sobre estos
   defaults. Así un restaurante puede sobrescribir solo lo que quiere.

   Sin dependencias de React: se puede importar en server y cliente.
   ============================================================ */

/* ── ThemeConfig ─────────────────────────────────────────── */

export type GlassIntensity = 'translucido' | 'esmerilado' | 'solido';
export type ColorScheme = 'dark' | 'light';
export type BackgroundType = 'asphalt' | 'solid' | 'gradient' | 'image';
export type CtaStyle = 'white' | 'accent' | 'outline';
export type PortadaVariant = 'spotlight' | 'poster' | 'stack' | 'none';
export type CatalogView = 'grid' | 'list';
export type ProductArt = 'auto' | 'pattern' | 'photo';
export type OrderType = 'delivery' | 'pickup';

export interface ThemeConfig {
  // ── Marca ──
  brandName: string;
  tagline: string;
  zone: string;                 // "Zona 1", "Centro", etc. (badge/portada)
  logoUrl: string | null;       // logo grande (portada, sidebar)
  markUrl: string | null;       // marca/ícono chico (watermark de fondo)

  // ── Color ──
  colorBg: string;
  colorBg2: string;             // fondo secundario (gradientes asphalt)
  colorText: string;
  colorAccent: string;
  onAccent: string;             // texto sobre el acento
  scheme: ColorScheme;          // afecta el tono de líneas/escala de texto

  // ── Tipografía ── (nombres de familias del catálogo FONT_OPTIONS)
  fontDisplay: string;
  fontPoster: string;
  fontBody: string;
  fontSerif: string;
  fontMono: string;
  fontScale: number;            // 0.9–1.2 multiplicador global de tamaños

  // ── Glass / forma ──
  glassIntensity: GlassIntensity;
  cornerRadius: number;         // 0.6–1.6 multiplicador de radios
  sheen: boolean;               // brillo especular que sigue al cursor

  // ── Fondo / ambiente ──
  backgroundType: BackgroundType;
  backgroundImage: string | null;
  backgroundGradient: string | null;   // p.ej. "linear-gradient(...)"
  ambientGlow: boolean;         // pools de luz a la deriva
  grain: boolean;               // grano de concreto
  watermark: boolean;           // marca gigante girando (usa markUrl/logoUrl)

  // ── CTA / botones ──
  ctaStyle: CtaStyle;

  // ── Portada ──
  portadaVariant: PortadaVariant;
  portadaShowLogo: boolean;
  portadaShowBadge: boolean;    // "Abierto ahora · Zona X"
  portadaShowStatus: boolean;   // el puntito que "respira"

  // ── Catálogo ──
  catalogView: CatalogView;
  catalogColumns: 2 | 3;
  showSearch: boolean;
  showCategoryIcons: boolean;
  productArt: ProductArt;       // auto = foto si existe, si no patrón
  showTags: boolean;

  // ── Pedidos / checkout ──
  orderTypes: OrderType[];
  deliveryFee: number;

  // ── Moneda ──
  currencySymbol: string;       // 'Q', '$', '€'
  currencyPosition: 'prefix' | 'suffix';
  locale: string;               // 'es-GT'

  // ── Animaciones ──
  animations: boolean;
}

export const DEFAULT_CONFIG: ThemeConfig = {
  brandName: 'Tu Restaurante',
  tagline: 'Sabor que enamora',
  zone: '',
  logoUrl: null,
  markUrl: null,

  colorBg: '#0b0b0c',
  colorBg2: '#141416',
  colorText: '#F5F3EF',
  colorAccent: '#D97757',
  onAccent: '#0b0b0c',
  scheme: 'dark',

  fontDisplay: 'Unbounded',
  fontPoster: 'Anton',
  fontBody: 'Geist',
  fontSerif: 'Instrument Serif',
  fontMono: 'JetBrains Mono',
  fontScale: 1,

  glassIntensity: 'translucido',
  cornerRadius: 1,
  sheen: true,

  backgroundType: 'asphalt',
  backgroundImage: null,
  backgroundGradient: null,
  ambientGlow: true,
  grain: false,
  watermark: false,

  ctaStyle: 'white',

  portadaVariant: 'spotlight',
  portadaShowLogo: true,
  portadaShowBadge: true,
  portadaShowStatus: true,

  catalogView: 'grid',
  catalogColumns: 2,
  showSearch: true,
  showCategoryIcons: true,
  productArt: 'auto',
  showTags: true,

  orderTypes: ['delivery', 'pickup'],
  deliveryFee: 0,

  currencySymbol: 'Q',
  currencyPosition: 'prefix',
  locale: 'es-GT',

  animations: true,
};

/* ── ThemeContent (todos los textos del cliente) ─────────── */

export interface ThemeContent {
  portada: {
    title: string;            // vacío = usa brandName
    subtitle: string;         // vacío = usa tagline
    cta: string;
    badgeOpen: string;
    posterKicker: string;     // "EST · GUATEMALA" en variante poster
  };
  catalog: {
    kicker: string;           // vacío = "{brandName} · {zone}"
    heading: string;
    searchPlaceholder: string;
    allLabel: string;
    empty: string;
  };
  product: {
    add: string;
    soldOut: string;
    prepTime: string;
    fresh: string;
  };
  cart: {
    title: string;
    empty: string;
    emptyCta: string;
    subtotal: string;
    shipping: string;
    free: string;
    total: string;
    checkout: string;
    barCta: string;
    itemsOne: string;         // "producto"
    itemsMany: string;        // "productos"
  };
  checkout: {
    title: string;
    typeLabel: string;
    delivery: string;
    pickup: string;
    name: string;
    namePh: string;
    phone: string;
    phonePh: string;
    address: string;
    addressPh: string;
    notes: string;
    notesPh: string;
    payLabel: string;
    payCash: string;
    payCashSub: string;
    confirm: string;
    errName: string;
    errPhone: string;
    errAddress: string;
  };
  confirmation: {
    title: string;
    subtitle: string;         // vacío = "{brandName} ya recibió tu pedido…"
    orderNo: string;
    type: string;
    eta: string;
    etaValue: string;
    payment: string;
    notified: string;
    again: string;
  };
  tags: {
    hot: string;
    new: string;
    fav: string;
    veg: string;
  };
}

export const DEFAULT_CONTENT: ThemeContent = {
  portada: {
    title: '',
    subtitle: '',
    cta: 'Ver el menú',
    badgeOpen: 'Abierto ahora',
    posterKicker: 'EST · 2024',
  },
  catalog: {
    kicker: '',
    heading: 'El menú',
    searchPlaceholder: 'Buscar…',
    allLabel: 'Todo',
    empty: 'Nada por aquí. Probá otra cosa.',
  },
  product: {
    add: 'Agregar',
    soldOut: 'Agotado',
    prepTime: '8–12 min',
    fresh: 'Recién hecho',
  },
  cart: {
    title: 'Carrito',
    empty: 'Tu carrito está vacío',
    emptyCta: 'Ver el menú',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    free: 'Gratis',
    total: 'Total',
    checkout: 'Ir a pagar',
    barCta: 'Ver carrito',
    itemsOne: 'producto',
    itemsMany: 'productos',
  },
  checkout: {
    title: 'Tu pedido',
    typeLabel: 'Tipo de pedido',
    delivery: 'A domicilio',
    pickup: 'Para llevar',
    name: 'Tu nombre',
    namePh: '¿Cómo te llamás?',
    phone: 'Teléfono',
    phonePh: '5xxx xxxx',
    address: 'Dirección',
    addressPh: 'Calle, zona, referencia',
    notes: 'Notas (opcional)',
    notesPh: 'Sin cebolla, extra picante…',
    payLabel: 'Pago',
    payCash: 'Efectivo contra entrega',
    payCashSub: 'Pagás cuando llega tu pedido',
    confirm: 'Confirmar pedido',
    errName: 'Decinos tu nombre',
    errPhone: 'Necesitamos un teléfono',
    errAddress: '¿A dónde lo llevamos?',
  },
  confirmation: {
    title: '¡Pedido enviado!',
    subtitle: '',
    orderNo: 'Número de pedido',
    type: 'Tipo',
    eta: 'Tiempo estimado',
    etaValue: '20–30 min',
    payment: 'Pago',
    notified: 'El restaurante fue notificado al instante',
    again: 'Hacer otro pedido',
  },
  tags: {
    hot: 'Picante',
    new: 'Nuevo',
    fav: 'Favorito',
    veg: 'Veggie',
  },
};

/* ── Catálogo de fuentes Google curadas ──────────────────── */
// `family` = nombre exacto en Google Fonts. `axis` = lo que pedimos en el href.
// `role` filtra qué fuentes ofrecemos en cada selector del editor.

export interface FontOption {
  family: string;
  label: string;
  axis: string;                 // segmento family= del href de Google Fonts
  roles: Array<'display' | 'poster' | 'body' | 'serif' | 'mono'>;
  stack: string;                // fallback CSS
}

export const FONT_OPTIONS: FontOption[] = [
  // Display / poster (títulos con carácter)
  { family: 'Unbounded',        label: 'Unbounded',        axis: 'Unbounded:wght@400;500;600;700;800;900', roles: ['display', 'poster'], stack: 'system-ui, sans-serif' },
  { family: 'Anton',            label: 'Anton',            axis: 'Anton',                                   roles: ['poster', 'display'], stack: "'Arial Narrow', sans-serif" },
  { family: 'Archivo Black',    label: 'Archivo Black',    axis: 'Archivo+Black',                           roles: ['display', 'poster'], stack: 'system-ui, sans-serif' },
  { family: 'Bebas Neue',       label: 'Bebas Neue',       axis: 'Bebas+Neue',                              roles: ['poster', 'display'], stack: "'Arial Narrow', sans-serif" },
  { family: 'Space Grotesk',    label: 'Space Grotesk',    axis: 'Space+Grotesk:wght@400;500;600;700',      roles: ['display', 'body'],   stack: 'system-ui, sans-serif' },
  { family: 'Syne',             label: 'Syne',             axis: 'Syne:wght@400;500;600;700;800',           roles: ['display', 'poster'], stack: 'system-ui, sans-serif' },
  { family: 'Playfair Display', label: 'Playfair Display', axis: 'Playfair+Display:ital,wght@0,400;0,700;1,400', roles: ['display', 'serif'], stack: 'Georgia, serif' },
  { family: 'Fraunces',         label: 'Fraunces',         axis: 'Fraunces:ital,wght@0,400;0,600;1,400',    roles: ['display', 'serif'],  stack: 'Georgia, serif' },
  { family: 'Cormorant Garamond', label: 'Cormorant',      axis: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400', roles: ['serif', 'display'], stack: 'Georgia, serif' },

  // Serif decorativa (itálicas)
  { family: 'Instrument Serif', label: 'Instrument Serif', axis: 'Instrument+Serif:ital@0;1',               roles: ['serif'],             stack: "'Times New Roman', serif" },

  // Body / sans (cuerpo)
  { family: 'Geist',            label: 'Geist',            axis: 'Geist:wght@300;400;500;600;700',          roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Inter',            label: 'Inter',            axis: 'Inter:wght@300;400;500;600;700',          roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Manrope',          label: 'Manrope',          axis: 'Manrope:wght@300;400;500;600;700;800',    roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Plus Jakarta Sans', label: 'Jakarta Sans',    axis: 'Plus+Jakarta+Sans:wght@300;400;500;600;700', roles: ['body'],          stack: 'system-ui, sans-serif' },
  { family: 'DM Sans',          label: 'DM Sans',          axis: 'DM+Sans:wght@400;500;600;700',            roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Poppins',          label: 'Poppins',          axis: 'Poppins:wght@300;400;500;600;700',        roles: ['body', 'display'],   stack: 'system-ui, sans-serif' },

  // Mono (precios/números)
  { family: 'JetBrains Mono',   label: 'JetBrains Mono',   axis: 'JetBrains+Mono:wght@400;500;600',         roles: ['mono'],              stack: 'ui-monospace, monospace' },
  { family: 'Space Mono',       label: 'Space Mono',       axis: 'Space+Mono:wght@400;700',                 roles: ['mono'],              stack: 'ui-monospace, monospace' },
  { family: 'IBM Plex Mono',    label: 'IBM Plex Mono',    axis: 'IBM+Plex+Mono:wght@400;500;600',          roles: ['mono'],              stack: 'ui-monospace, monospace' },
];

export function fontsForRole(role: FontOption['roles'][number]): FontOption[] {
  return FONT_OPTIONS.filter((f) => f.roles.includes(role));
}

export function findFont(family: string): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.family === family);
}
