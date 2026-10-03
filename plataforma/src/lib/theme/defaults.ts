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
/** Variante de textura para config.grain — antes un único ruido fijo servía
    para "madera quemada", "papel" y "asfalto" por igual (ver auditoría de
    plantillas 2026-07-15). 'fino' reproduce EXACTO el grano original. */
export type GrainStyle = 'fino' | 'grueso' | 'papel';
export type CtaStyle = 'white' | 'accent' | 'outline';
export type CheckoutActiveColor = 'text' | 'accent';
export type PortadaVariant = 'spotlight' | 'poster' | 'stack' | 'fullbleed' | 'ticket' | 'directo' | 'none';
export type CatalogView = 'grid' | 'list';
export type ProductArt = 'auto' | 'pattern' | 'photo';
export type OrderType = 'delivery' | 'pickup' | 'dine_in';

/* ── Ejes de ESTRUCTURA ───────────────────────────────────────
   Hasta aquí una plantilla solo podía cambiar la PIEL: color, tipografía,
   forma, fondo. El esqueleto era siempre el mismo (portada a pantalla
   completa → píldoras de categoría → rejilla), así que 16 plantillas se
   sentían primas entre sí. Estas tres claves cambian el ESQUELETO. */

/** Cómo se recorre el catálogo. */
export type CatalogNav =
  | 'chips'      // filtra UNA categoría con píldoras horizontales (el clásico)
  | 'secciones'  // todas las categorías apiladas, scroll continuo + índice pegajoso
  | 'acordeon'   // categorías plegadas, se abren de una en una (cartas enormes)
  | 'portadas';  // se elige categoría en tarjetas grandes y se entra a su menú

/** Forma de cada platillo dentro de su sección. */
export type CardStyle =
  | 'tarjeta'   // rejilla con arte arriba (equivale al viejo catalogView 'grid')
  | 'fila'      // fila horizontal con miniatura (equivale a catalogView 'list')
  | 'texto'     // SIN imagen: nombre · línea de puntos · precio (carta impresa)
  | 'mosaico'   // alturas alternas y arte dominante (editorial)
  | 'carrusel'; // fila horizontal desplazable por categoría

/** Ambición del lienzo: cuánto quiere crecer el menú cuando hay pantalla de
    sobra. NO es un ancho fijo — en un teléfono los tres valen lo mismo y de
    tablet para arriba cada uno crece hasta su tope. El ancho en píxeles vive
    en el CSS (`--menu-max`, bloque «LIENZO DEL MENÚ» de globals.css) y la
    composición en lib/theme/canvas.ts. */
export type LayoutWidth = 'movil' | 'ancho' | 'revista';

/** Ancho mínimo de columna para las rejillas que se auto-ajustan.
    En 'movil' se respetan las 2/3 columnas explícitas del dueño; en lienzos
    anchos se reparte por ancho disponible, o una tarjeta quedaría de 500 px. */
export const LAYOUT_MIN_COL: Record<LayoutWidth, number> = {
  movil: 0,
  ancho: 210,
  revista: 230,
};

/* ── Tipografía granular ──────────────────────────────────────
   TextStyle describe TODO de un texto: tamaño (multiplicador),
   grosor, itálica, espaciado, interlineado, mayúsculas, color y
   familia. Se aplica por ROL (todos los títulos, todos los precios…)
   y, opcionalmente, override por ELEMENTO (este título en concreto). */

export type FontRole = '' | 'display' | 'poster' | 'body' | 'serif' | 'mono';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

/* Sombra de texto: presets que mejoran la legibilidad sobre fondos vivos o
   con imagen. El "ink" (color de la sombra) se invierte según el esquema
   (oscuro = sombra negra; claro = halo blanco) vía la var CSS --shadow-ink.
   'neon' es distinto a propósito: no es legibilidad, es un brillo LITERAL
   con el color de acento de la marca (antes ninguna plantilla tenía forma
   de lograr un efecto "neón"/"eléctrico" real — ver auditoría 2026-07-15). */
export type ShadowPreset = 'none' | 'soft' | 'medium' | 'strong' | 'glow' | 'neon';

export const SHADOW_PRESETS: Record<ShadowPreset, string> = {
  none:   'none',
  soft:   '0 1px 2px rgba(var(--shadow-ink, 0,0,0), 0.40)',
  medium: '0 1px 3px rgba(var(--shadow-ink, 0,0,0), 0.58)',
  strong: '0 2px 5px rgba(var(--shadow-ink, 0,0,0), 0.80)',
  glow:   '0 0 9px rgba(var(--shadow-ink, 0,0,0), 0.72), 0 1px 2px rgba(var(--shadow-ink, 0,0,0), 0.55)',
  neon:   '0 0 6px var(--brand-accent), 0 0 20px color-mix(in srgb, var(--brand-accent) 70%, transparent), 0 1px 2px rgba(var(--shadow-ink, 0,0,0), 0.5)',
};

export const SHADOW_OPTIONS: Array<[ShadowPreset, string]> = [
  ['none', 'Sin sombra'], ['soft', 'Suave'], ['medium', 'Media'], ['strong', 'Fuerte'], ['glow', 'Halo'], ['neon', 'Neón (acento)'],
];

export interface TextStyle {
  size: number;            // multiplicador relativo al tamaño base del rol (1 = base)
  weight: number;          // 100..900
  italic: boolean;
  tracking: number;        // letter-spacing en em (puede ser negativo)
  lineHeight: number;      // interlineado sin unidad (1.0, 1.3…)
  transform: TextTransform;
  color: string;           // '' = color natural del rol; o un color explícito (#hex)
  font: FontRole;          // '' = familia natural del rol; o forzar otra familia
  shadow: ShadowPreset;    // 'none' = sin sombra; los demás mejoran legibilidad
}

/* Los 10 roles cubren TODO texto visible del menú del cliente. */
export type TypographyRole =
  | 'heading'      // títulos grandes / hero (.t-display)
  | 'poster'       // kickers grandes / encabezado del catálogo (.t-poster)
  | 'serif'        // subtítulos / itálicas literarias (.t-serif)
  | 'kicker'       // mini-mayúsculas con tracking (.t-kicker)
  | 'body'         // texto de cuerpo / párrafos
  | 'productName'  // nombre de producto en tarjetas
  | 'productDesc'  // descripción de producto
  | 'price'        // precios y números (.t-mono)
  | 'button'       // texto de botones / CTA
  | 'tag';         // etiquetas / badges

export type ThemeTypography = Record<TypographyRole, TextStyle>;

/* ── Plano del salón (mesas posicionables por nivel) ──────────
   El restaurante coloca cada mesa donde está físicamente, en uno
   o varios niveles (pisos). Las posiciones son relativas (0..1)
   al lienzo, así se ven igual en cualquier pantalla. Las mesas se
   siguen identificando por NÚMERO (1..dineInTableCount); el plano
   solo guarda dónde se dibuja cada una. */
export type TableShape = 'circle' | 'square';

export interface FloorTable {
  n: number;        // número de mesa (coincide con el selector y "Mesa N" del pedido)
  level: string;    // id del nivel al que pertenece
  x: number;        // 0..1 posición horizontal relativa al lienzo
  y: number;        // 0..1 posición vertical relativa al lienzo
  shape?: TableShape;
  seats?: number;   // sillas (opcional, informativo)
  /** Cómo se llama esta mesa en voz alta: «Terraza 2», «Barra A».
      Opcional y solo para mirar: la IDENTIDAD sigue siendo `n` (el QR, el
      pedido y la cuenta van por número). Se pudo añadir cuando la mesa
      dejó de deducirse leyendo el texto del pedido — migración 127. */
  label?: string;
}

export interface FloorLevel {
  id: string;
  name: string;     // "Planta baja", "Segundo nivel", "Terraza"…
}

/* Referencias fijas del salón: la barra, la recepción, la cocina, la
   entrada. No son mesas —no se pueden pedir ni ocupar—, son los puntos
   por los que una persona sabe dónde está parada. Un plano de círculos
   flotando en gris no le dice a un mesero nuevo cuál es la mesa 4; el
   mismo plano con la barra dibujada, sí. */
export type FixtureKind =
  | 'bar'         // barra
  | 'reception'   // recepción / anfitrión
  | 'cashier'     // caja
  | 'kitchen'     // cocina
  | 'entrance'    // entrada
  | 'restroom'    // baños
  | 'wall';       // muro / división

export interface FloorFixture {
  id: string;
  level: string;    // id del nivel al que pertenece
  kind: FixtureKind;
  x: number;        // 0..1 centro horizontal relativo al lienzo
  y: number;        // 0..1 centro vertical relativo al lienzo
  w: number;        // 0..1 ancho relativo al lienzo
  h: number;        // 0..1 alto relativo al lienzo
  /** Texto propio ("Barra fría"); vacío = el nombre por defecto del tipo. */
  label?: string;
}

export interface FloorPlan {
  enabled: boolean;       // false = cuadrícula automática (comportamiento clásico)
  levels: FloorLevel[];   // 1..3 niveles
  tables: FloorTable[];   // mesas colocadas; las no colocadas caen en "otras mesas"
  /** Referencias fijas del salón. Opcional: los planos guardados antes de
      que existieran siguen siendo válidos tal cual (sin migración). */
  fixtures?: FloorFixture[];
}

export interface ThemeConfig {
  // ── Marca ──
  brandName: string;
  tagline: string;
  zone: string;                 // "Zona 1", "Centro", etc. (badge/portada)
  logoUrl: string | null;       // logo grande (portada, sidebar)
  markUrl: string | null;       // marca/ícono chico (watermark de fondo)
  pwaIconUrl: string | null;    // ícono de la app instalada (PWA home screen)

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
  glassAmount: number;          // 0–100: 100 = efecto completo del preset, 0 = sólido puro (sin blur)
  cornerRadius: number;         // 0.6–1.6 multiplicador de radios
  sheen: boolean;               // brillo especular que sigue al cursor

  // ── Fondo / ambiente ──
  backgroundType: BackgroundType;
  backgroundImage: string | null;
  backgroundGradient: string | null;   // p.ej. "linear-gradient(...)"
  ambientGlow: boolean;         // pools de luz a la deriva
  grain: boolean;               // activa la textura de grano (ver grainStyle)
  grainStyle: GrainStyle;       // 'fino' (concreto, default) | 'grueso' (asfalto/parrilla) | 'papel' (fibra cálida)
  watermark: boolean;           // marca gigante girando (usa markUrl/logoUrl)

  // ── CTA / botones ──
  ctaStyle: CtaStyle;
  checkoutActiveColor: CheckoutActiveColor; // color del estado activo en tabs/pills/opciones del checkout
  checkoutFormGlass: boolean;               // envuelve los campos de info del cliente en una tarjeta glass
  checkoutPayGlass: boolean;                // opciones de pago (efectivo/tarjeta) como tarjetas glass para distinguirlas
  checkoutTextShadow: ShadowPreset;         // sombra por defecto en títulos/etiquetas del checkout (legibilidad)

  // ── Portada ──
  portadaVariant: PortadaVariant;
  portadaShowLogo: boolean;
  portadaShowBadge: boolean;    // "Abierto ahora · Zona X"
  portadaShowStatus: boolean;   // el puntito que "respira"

  // ── Lienzo ──
  layoutWidth: LayoutWidth;     // ancho máximo del menú (móvil / ancho / revista)

  // ── Catálogo ──
  catalogNav: CatalogNav;       // estructura de navegación del menú
  cardStyle: CardStyle;         // forma de cada platillo
  /** @deprecated Lo sustituye `cardStyle`. Se conserva porque hay temas ya
      guardados (y la columna legacy `catalog_view`) que solo traen esto; el
      resolver lo traduce a `cardStyle` cuando el tema no define el nuevo. */
  catalogView: CatalogView;
  catalogColumns: 2 | 3;
  showSearch: boolean;
  showCategoryIcons: boolean;
  productArt: ProductArt;       // auto = foto si existe, si no patrón
  showTags: boolean;
  featuredFavorites: boolean;   // productos con etiqueta "Favorito" como tarjeta grande (máx. 3)
  /** «Acompáñalo con…»: en la ficha y en el carrito se ofrecen bebida,
      acompañamiento o postre de la propia carta (lib/menu-pairings.ts). */
  suggestPairings: boolean;

  // ── Pedidos / checkout ──
  orderTypes: OrderType[];
  deliveryFee: number;
  dineInTableCount: number;       // 1–50 mesas que aparecen en el selector
  dineInCourseOptions: string[];  // preferencias de servicio configurables
  acceptsCard: boolean;           // habilita la opción "pagar con tarjeta" en delivery y pickup
  tipEnabled: boolean;            // propina obligatoria activa (ver tipOrderTypes)
  tipPercent: number;             // porcentaje a cobrar (ej. 10 = 10 %)
  tipOrderTypes: OrderType[];     // a qué tipos de pedido aplica la propina obligatoria

  // ── Confirmación automática ──
  autoConfirmEnabled: boolean;    // confirma pedidos NEW→PREP automáticamente
  autoConfirmMinutes: number;     // minutos de espera antes de confirmar (1–60)

  // ── Cocina (KDS) ──
  kdsYellowMin: number;           // minutos de espera para que la tarjeta pase a ámbar
  kdsRedMin: number;              // minutos de espera para que la tarjeta pase a rojo
  kdsConfirmFirst: boolean;       // true = solo muestra pedidos PREP (confirmados); false = muestra NEW+PREP

  // ── Salón (cuándo una mesa pide atención) ──
  // Al cruzar el umbral la mesa queda "pendiente" (tinta, sin color); al
  // DOBLE pasa a alarma y lleva acento. Ver lib/table-state.ts.
  salonReadyMin: number;          // minutos con la comida lista sin llevarla
  salonUnpaidMin: number;         // minutos servida sin cobrar
  salonUnacceptedMin: number;     // minutos sin que cocina acepte la comanda

  // ── Moneda ──
  currencySymbol: string;       // 'Q', '$', '€'
  currencyPosition: 'prefix' | 'suffix';
  locale: string;               // 'es-GT'

  // ── Animaciones ──
  animations: boolean;

  // ── Fondo avanzado ──
  bgOverlayOpacity: number;    // opacidad del velo sobre imagen de fondo (0.0–1.0)
  watermarkOpacity: number;    // opacidad del watermark (0.01–0.15)
  watermarkSize: number;       // tamaño del watermark en vmin (40–120)

  // (El panel admin ya NO se personaliza por restaurante: usa 2 temas fijos
  //  claro/oscuro — ver globals.css `html[data-admin-area]` y AdminShell.)

  // ── Plano del salón (mesas) ──
  floorPlan: FloorPlan;

  // ── Tipografía avanzada (roles + override por elemento) ──
  typography: ThemeTypography;
  /** Override total por texto clave (key de ELEMENT_TARGETS → estilo completo). */
  elementStyles: Record<string, TextStyle>;

  // ── Superficies / tarjetas (se adaptan a cualquier paleta) ──
  surfaceTint: number;          // 0.4–2.5 multiplica el alpha de los rellenos sutiles
  cardShadow: number;           // 0–1.6 multiplica la profundidad de sombras
  scrimOpacity: number;         // 0–0.85 opacidad del velo detrás de modales
  badgeBg: string;              // '' = automático por esquema; fondo de badge "No disponible"
  badgeText: string;            // '' = automático; texto del badge
}

/* Estilo base por rol (igual al look actual → sin cambios visibles si no se toca). */
function ts(o: Partial<TextStyle>): TextStyle {
  return { size: 1, weight: 400, italic: false, tracking: 0, lineHeight: 1.3, transform: 'none', color: '', font: '', shadow: 'none', ...o };
}

export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  heading:     ts({ weight: 800, tracking: -0.02, lineHeight: 0.95 }),
  poster:      ts({ weight: 400, tracking: 0.01, lineHeight: 0.95, transform: 'uppercase' }),
  serif:       ts({ weight: 400, tracking: -0.01, lineHeight: 1.3, italic: true }),
  kicker:      ts({ weight: 400, tracking: 0.14, transform: 'uppercase' }),
  body:        ts({ weight: 400, lineHeight: 1.5 }),
  productName: ts({ weight: 700, tracking: -0.01, lineHeight: 1.14 }),
  productDesc: ts({ weight: 400, lineHeight: 1.4 }),
  price:       ts({ weight: 600, tracking: -0.01 }),
  button:      ts({ weight: 600 }),
  tag:         ts({ weight: 600, tracking: 0.02 }),
};

/* Color "natural" de cada rol cuando TextStyle.color === '' (token CSS). */
export const ROLE_NATURAL_COLOR: Record<TypographyRole, string> = {
  heading: 'var(--u-text)', poster: 'var(--u-text)', serif: 'var(--u-text-2)',
  kicker: 'var(--u-text-3)', body: 'var(--u-text)', productName: 'var(--u-text)',
  productDesc: 'var(--u-text-3)', price: 'var(--u-text)', button: 'inherit', tag: 'var(--u-text)',
};

/* Familia "natural" de cada rol cuando TextStyle.font === '' (token CSS). */
export const ROLE_NATURAL_FONT: Record<TypographyRole, string> = {
  heading: 'var(--font-display)', poster: 'var(--font-poster)', serif: 'var(--font-serif)',
  kicker: 'var(--font-poster)', body: 'var(--ui-font-sans)', productName: 'var(--font-display)',
  productDesc: 'var(--ui-font-sans)', price: 'var(--ui-font-mono)', button: 'var(--ui-font-sans)',
  tag: 'var(--ui-font-sans)',
};

/** Mapa de FontRole → variable CSS de familia. */
export const FONT_ROLE_VAR: Record<Exclude<FontRole, ''>, string> = {
  display: 'var(--font-display)', poster: 'var(--font-poster)', serif: 'var(--font-serif)',
  body: 'var(--ui-font-sans)', mono: 'var(--ui-font-mono)',
};

/* Metadatos para el editor: roles editables y su etiqueta. */
export const TYPO_ROLES: { key: TypographyRole; label: string; hint: string }[] = [
  { key: 'heading',     label: 'Títulos',           hint: 'Hero, nombre del restaurante, títulos grandes' },
  { key: 'poster',      label: 'Encabezados poster', hint: 'Título del menú, kickers grandes' },
  { key: 'serif',       label: 'Subtítulos serif',  hint: 'Tagline, descripciones literarias en itálica' },
  { key: 'kicker',      label: 'Kickers / etiquetas', hint: 'Mini-mayúsculas con espaciado (labels)' },
  { key: 'body',        label: 'Texto de cuerpo',   hint: 'Párrafos y texto general' },
  { key: 'productName', label: 'Nombre de producto', hint: 'Nombre en cada tarjeta del menú' },
  { key: 'productDesc', label: 'Descripción de producto', hint: 'Texto descriptivo del producto' },
  { key: 'price',       label: 'Precios y números',  hint: 'Todos los precios del menú' },
  { key: 'button',      label: 'Botones',           hint: 'Texto de los botones / CTA' },
  { key: 'tag',         label: 'Etiquetas (tags)',  hint: 'Picante, Nuevo, Veggie…' },
];

/* Textos clave con override individual ("este texto en particular se ve así"). */
export const ELEMENT_TARGETS: { key: string; label: string; role: TypographyRole }[] = [
  { key: 'portadaTitle',        label: 'Portada · Título',        role: 'heading' },
  { key: 'portadaSubtitle',     label: 'Portada · Subtítulo',     role: 'serif' },
  { key: 'portadaCta',          label: 'Portada · Botón',         role: 'button' },
  { key: 'catalogKicker',       label: 'Menú · Kicker',           role: 'kicker' },
  { key: 'catalogHeading',      label: 'Menú · Título',           role: 'poster' },
  { key: 'catalogSection',      label: 'Menú · Encabezado de sección', role: 'poster' },
  { key: 'cartTitle',           label: 'Carrito · Título',        role: 'heading' },
  { key: 'checkoutTitle',       label: 'Checkout · Título',       role: 'heading' },
  { key: 'productTitle',        label: 'Producto · Título',       role: 'heading' },
  { key: 'confirmationTitle',   label: 'Confirmación · Título',   role: 'heading' },
  { key: 'trackingTitle',       label: 'Seguimiento · Título',    role: 'heading' },
];

export const DEFAULT_CONFIG: ThemeConfig = {
  brandName: 'Tu Restaurante',
  /* Vacío: «Sabor que enamora» era relleno y salía publicado en menús reales
     cuyo dueño no había escrito su lema (auditoría 2026-10-02, CAT-03). Sin
     lema, la portada no pinta esa línea y Hoy pide escribirlo. */
  tagline: '',
  zone: '',
  logoUrl: null,
  markUrl: null,
  pwaIconUrl: null,

  /* TEMA CLARO POR DEFECTO (2026-08-24, a peticion del usuario). Antes el
     arranque era carbon oscuro. El sistema ya estaba preparado: el bloque
     `html[data-scheme="light"]` de globals.css recalcula las tintas
     secundarias al 82/72/64 % —porque la misma opacidad NO da el mismo
     contraste en los dos modos: 0.48 pasa 4.6:1 en oscuro y se queda en 3.1:1
     en claro— y oscurece el acento un 24 % cuando hace de TEXTO.

     Los blancos son CALIDOS y no grises: el acento coral (#D97757) sobre un
     blanco azulado se ensucia. `onAccent` sigue siendo tinta oscura sobre el
     coral (6.2:1); en blanco se quedaria en 3.1:1 y no pasa AA para texto.

     OJO al alcance: esto solo cambia a los restaurantes que NUNCA eligieron
     colores. El que tenga su paleta guardada la conserva tal cual. */
  colorBg: '#FAF8F5',
  colorBg2: '#F1ECE5',
  colorText: '#1A1613',
  colorAccent: '#D97757',
  onAccent: '#0b0b0c',
  scheme: 'light',

  fontDisplay: 'Unbounded',
  fontPoster: 'Anton',
  fontBody: 'Geist',
  fontSerif: 'Instrument Serif',
  fontMono: 'JetBrains Mono',
  fontScale: 1,

  glassIntensity: 'translucido',
  glassAmount: 100,
  cornerRadius: 1,
  sheen: true,

  backgroundType: 'asphalt',
  backgroundImage: null,
  backgroundGradient: null,
  ambientGlow: true,
  grain: false,
  grainStyle: 'fino',
  watermark: false,

  ctaStyle: 'white',
  checkoutActiveColor: 'text',
  checkoutFormGlass: false,
  checkoutPayGlass: true,
  checkoutTextShadow: 'soft',

  portadaVariant: 'spotlight',
  portadaShowLogo: true,
  portadaShowBadge: true,
  portadaShowStatus: true,

  layoutWidth: 'movil',

  catalogNav: 'chips',
  cardStyle: 'tarjeta',
  catalogView: 'grid',
  catalogColumns: 2,
  showSearch: true,
  showCategoryIcons: true,
  productArt: 'auto',
  showTags: true,
  featuredFavorites: false,
  suggestPairings: true,

  orderTypes: ['dine_in', 'delivery', 'pickup'],
  deliveryFee: 0,
  dineInTableCount: 20,
  dineInCourseOptions: ['Entrada primero', 'Plato principal primero', 'Postre al final'],
  acceptsCard: false,
  tipEnabled: false,
  tipPercent: 10,
  tipOrderTypes: ['dine_in'],

  autoConfirmEnabled: false,
  autoConfirmMinutes: 1,

  kdsYellowMin: 10,
  kdsRedMin: 20,
  kdsConfirmFirst: false,

  salonReadyMin: 8,
  salonUnpaidMin: 15,
  salonUnacceptedMin: 5,

  currencySymbol: 'Q',
  currencyPosition: 'prefix',
  locale: 'es-GT',

  animations: true,

  bgOverlayOpacity: 1,
  watermarkOpacity: 0.04,
  watermarkSize: 78,

  floorPlan: {
    enabled: false,
    levels: [{ id: 'l1', name: 'Planta baja' }],
    tables: [],
    fixtures: [],
  },

  typography: DEFAULT_TYPOGRAPHY,
  elementStyles: {},

  surfaceTint: 1,
  cardShadow: 1,
  scrimOpacity: 0.55,
  badgeBg: '',
  badgeText: '',
};

/* ── ThemeContent (todos los textos del cliente) ─────────── */

export interface ThemeContent {
  portada: {
    title: string;            // vacío = usa brandName
    subtitle: string;         // vacío = usa tagline
    cta: string;
    badgeOpen: string;
    badgeClosed: string;      // cuando el horario dice "cerrado"
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
    chooseOne: string;        // grupos de opciones obligatorios ("Elige uno")
    optional: string;         // grupos opcionales
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
    dineIn: string;           // "Comer aquí"
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
    // Mesa (dine_in)
    mesa: string;             // "Tu mesa"
    mesaDetected: string;     // "Detectada al escanear el QR"
    mesaNotFound: string;     // "No se detectó mesa. Escanea el QR de tu mesa para continuar."
    // Preferencia de servicio
    courseLabel: string;      // "Preferencia de servicio"
    courseNone: string;       // "Sin preferencia"
    // Pago
    payLabel: string;
    payCash: string;
    payCashSub: string;
    payCashPickup: string;    // "Efectivo" (pickup)
    payCashPickupSub: string; // "Pagas en el local al recoger"
    payCard: string;
    payCardSub: string;
    payCardPickupSub: string; // "Pagas con tarjeta en el local"
    // Efectivo con cambio
    cashAmountLabel: string;  // "¿Con cuánto vas a pagar?"
    cashAmountSub: string;    // "Para que el repartidor lleve el cambio exacto."
    confirm: string;
    errName: string;
    errPhone: string;
    errAddress: string;
    closedTitle: string;      // checkout bloqueado: fuera de horario
    closedMsg: string;
    pausedTitle: string;      // checkout bloqueado: pausa manual
    pausedMsg: string;        // vacío = usa el mensaje del restaurante
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
    track: string;            // botón "Seguir mi pedido"
    again: string;
  };
  tracking: {
    title: string;
    subtitle: string;         // vacío = "Actualizamos el estado en vivo"
    statusNew: string;
    statusPrep: string;
    statusReady: string;
    statusReadyPickup: string;  // "Listo" cuando es para llevar
    statusTransit: string;
    statusServed: string;       // comida entregada en mesa, cuenta aún pendiente
    statusDelivered: string;
    statusCancel: string;
    back: string;             // "Volver al menú"
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
    badgeClosed: 'Cerrado ahora',
    posterKicker: 'EST · 2024',
  },
  catalog: {
    kicker: '',
    heading: 'El menú',
    searchPlaceholder: 'Buscar…',
    allLabel: 'Todo',
    empty: 'Nada por aquí. Prueba otra cosa.',
  },
  product: {
    add: 'Agregar',
    soldOut: 'Agotado',
    prepTime: '8–12 min',
    fresh: 'Recién hecho',
    chooseOne: 'Elige uno',
    optional: 'Opcional',
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
    dineIn: 'Comer aquí',
    delivery: 'A domicilio',
    pickup: 'Para llevar',
    name: 'Tu nombre',
    namePh: '¿Cómo te llamas?',
    phone: 'Teléfono',
    phonePh: '5xxx xxxx',
    address: 'Dirección',
    addressPh: 'Calle, zona, referencia',
    notes: 'Notas (opcional)',
    notesPh: 'Sin cebolla, extra picante…',
    mesa: 'Tu mesa',
    mesaDetected: 'Detectada al escanear el QR',
    mesaNotFound: 'No se detectó mesa. Escanea el QR de tu mesa para continuar.',
    courseLabel: 'Preferencia de servicio',
    courseNone: 'Sin preferencia',
    payLabel: 'Pago',
    payCash: 'Efectivo contra entrega',
    payCashSub: 'Pagas cuando llega tu pedido',
    payCashPickup: 'Efectivo',
    payCashPickupSub: 'Pagas en el local al recoger',
    payCard: 'Tarjeta (paga al recibir)',
    payCardSub: 'El repartidor lleva el dispositivo POS',
    payCardPickupSub: 'Pagas con tarjeta en el local',
    cashAmountLabel: '¿Con cuánto vas a pagar?',
    cashAmountSub: 'Para que el repartidor lleve el cambio exacto.',
    confirm: 'Confirmar pedido',
    errName: 'Dinos tu nombre',
    errPhone: 'Necesitamos un teléfono',
    errAddress: '¿A dónde lo llevamos?',
    closedTitle: 'Estamos cerrados',
    closedMsg: 'Vuelve en nuestro horario de atención. ¡Te esperamos!',
    pausedTitle: 'Pedidos en pausa',
    pausedMsg: '',
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
    track: 'Seguir mi pedido en vivo',
    again: 'Hacer otro pedido',
  },
  tracking: {
    title: 'Tu pedido',
    subtitle: '',
    statusNew: 'Recibido',
    statusPrep: 'En preparación',
    statusReady: 'Listo',
    statusReadyPickup: 'Listo para recoger',
    statusTransit: 'En camino',
    statusServed: 'Comida servida',
    statusDelivered: 'Entregado',
    statusCancel: 'Cancelado',
    back: 'Volver al menú',
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
//
// PESOS EN RANGO (`wght@300..700`), NO EN LISTA (`wght@300;400;500;600;700`):
// la mayoría de estas familias son fuentes VARIABLES. Pidiendo una lista de
// pesos, Google devuelve un archivo estático POR PESO; pidiendo el rango,
// devuelve UN archivo que los cubre todos y además deja disponibles los
// intermedios. Medido el 2026-08-12 sobre el subconjunto latino:
//   Inter          235 KB en 5 archivos → 47 KB en 1   (−188 KB)
//   Space Grotesk   87 KB en 4 archivos → 21 KB en 1   (−66 KB)
//   Fraunces        93 KB en 3 archivos → 80 KB en 2   (−13 KB)
// Un restaurante con esas tres (rincon502) pasa de 415 KB a 148 KB de
// tipografía, y de 12 descargas encadenadas tras el CSS de Google a 4.
//
// OJO al añadir fuentes: el rango solo vale si la familia es variable. Para
// las que no lo son, Google responde 400 y el tenant se queda SIN tipografía.
// Comprobadas como estáticas (van con lista de pesos a propósito): Poppins,
// Space Mono, IBM Plex Mono. Verificación rápida antes de tocar una línea:
//   curl -o /dev/null -w '%{http_code}' \
//     'https://fonts.googleapis.com/css2?family=LaFuente:wght@400..700'

export interface FontOption {
  family: string;
  label: string;
  axis: string;                 // segmento family= del href de Google Fonts
  roles: Array<'display' | 'poster' | 'body' | 'serif' | 'mono'>;
  stack: string;                // fallback CSS
}

export const FONT_OPTIONS: FontOption[] = [
  // Display / poster (títulos con carácter)
  { family: 'Unbounded',        label: 'Unbounded',        axis: 'Unbounded:wght@400..900',                 roles: ['display', 'poster'], stack: 'system-ui, sans-serif' },
  { family: 'Anton',            label: 'Anton',            axis: 'Anton',                                   roles: ['poster', 'display'], stack: "'Arial Narrow', sans-serif" },
  { family: 'Archivo Black',    label: 'Archivo Black',    axis: 'Archivo+Black',                           roles: ['display', 'poster'], stack: 'system-ui, sans-serif' },
  { family: 'Bebas Neue',       label: 'Bebas Neue',       axis: 'Bebas+Neue',                              roles: ['poster', 'display'], stack: "'Arial Narrow', sans-serif" },
  { family: 'Space Grotesk',    label: 'Space Grotesk',    axis: 'Space+Grotesk:wght@400..700',             roles: ['display', 'body'],   stack: 'system-ui, sans-serif' },
  { family: 'Syne',             label: 'Syne',             axis: 'Syne:wght@400..800',                      roles: ['display', 'poster'], stack: 'system-ui, sans-serif' },
  { family: 'Playfair Display', label: 'Playfair Display', axis: 'Playfair+Display:ital,wght@0,400..700;1,400..700', roles: ['display', 'serif'], stack: 'Georgia, serif' },
  { family: 'Fraunces',         label: 'Fraunces',         axis: 'Fraunces:ital,wght@0,400..700;1,400..700', roles: ['display', 'serif'], stack: 'Georgia, serif' },
  { family: 'Cormorant Garamond', label: 'Cormorant',      axis: 'Cormorant+Garamond:ital,wght@0,400..600;1,400..600', roles: ['serif', 'display'], stack: 'Georgia, serif' },

  // Serif decorativa (itálicas)
  { family: 'Instrument Serif', label: 'Instrument Serif', axis: 'Instrument+Serif:ital@0;1',               roles: ['serif'],             stack: "'Times New Roman', serif" },

  // Body / sans (cuerpo)
  { family: 'Geist',            label: 'Geist',            axis: 'Geist:wght@300..700',                     roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Inter',            label: 'Inter',            axis: 'Inter:wght@300..700',                     roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Manrope',          label: 'Manrope',          axis: 'Manrope:wght@300..800',                   roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'Plus Jakarta Sans', label: 'Jakarta Sans',    axis: 'Plus+Jakarta+Sans:wght@300..700',         roles: ['body'],              stack: 'system-ui, sans-serif' },
  { family: 'DM Sans',          label: 'DM Sans',          axis: 'DM+Sans:wght@400..700',                   roles: ['body'],              stack: 'system-ui, sans-serif' },
  // Estática en Google Fonts: el rango da 400. Va con lista de pesos.
  { family: 'Poppins',          label: 'Poppins',          axis: 'Poppins:wght@300;400;500;600;700',        roles: ['body', 'display'],   stack: 'system-ui, sans-serif' },

  // Mono (precios/números)
  { family: 'JetBrains Mono',   label: 'JetBrains Mono',   axis: 'JetBrains+Mono:wght@400..600',            roles: ['mono'],              stack: 'ui-monospace, monospace' },
  // Estáticas en Google Fonts (el rango da 400): lista de pesos a propósito.
  { family: 'Space Mono',       label: 'Space Mono',       axis: 'Space+Mono:wght@400;700',                 roles: ['mono'],              stack: 'ui-monospace, monospace' },
  { family: 'IBM Plex Mono',    label: 'IBM Plex Mono',    axis: 'IBM+Plex+Mono:wght@400;500;600',          roles: ['mono'],              stack: 'ui-monospace, monospace' },
];

export function fontsForRole(role: FontOption['roles'][number]): FontOption[] {
  return FONT_OPTIONS.filter((f) => f.roles.includes(role));
}

export function findFont(family: string): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.family === family);
}
