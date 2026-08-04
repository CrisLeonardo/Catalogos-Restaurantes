/* ============================================================
   PLANTILLAS PREDISEÑADAS DE TEMA
   ------------------------------------------------------------
   La galería no es una lista plana de plantillas: es el CRUCE de dos ejes
   independientes, y ese cruce es lo que hace que no todos los menús de la
   plataforma se sientan primos.

   · ESTRUCTURA (7) — el esqueleto. Cómo se recorre la carta (catalogNav),
     qué forma tiene cada platillo (cardStyle), cuánto ancho ocupa la página
     (layoutWidth) y con qué portada se entra.
   · ESTILO / PALETA (22) — la piel. Color, tipografía, fondo, vidrio,
     esquinas, botones.

   Antes había 16 plantillas de estilo que compartían UN esqueleto y 6
   arquetipos sueltos con esqueleto propio pero una sola piel cada uno: quien
   quería la estructura de "Revista" tenía que quedarse con su negro y su rojo.
   Ahora las 22 paletas están disponibles en las 7 estructuras (154
   combinaciones) y el dueño elige primero el esqueleto y luego el color.

   REGLAS:
   · Una plantilla SOLO define claves visuales (TEMPLATE_VISUAL_KEYS).
     Nunca identidad (nombre, logos, zona) ni operación (pedidos,
     moneda, mesas, cocina, propinas…).
   · Aplicar una plantilla = resetear lo visual a defaults y encima
     poner los deltas de la plantilla → resultado reproducible,
     no un acumulado de la personalización anterior.
   · La estructura manda sobre el esqueleto y la paleta sobre la piel. No se
     pisan: por eso cualquier par estructura×paleta da un resultado coherente
     sin tener que revisar 154 combinaciones a mano.

   Sin dependencias de React (importable en server y cliente).
   ============================================================ */

import {
  DEFAULT_CONFIG, DEFAULT_TYPOGRAPHY,
  type ThemeConfig, type ThemeTypography, type TextStyle, type TypographyRole,
} from './defaults';

/** Claves que una plantilla puede definir. Todo lo demás se conserva. */
export const TEMPLATE_VISUAL_KEYS = [
  // Color
  'colorBg', 'colorBg2', 'colorText', 'colorAccent', 'onAccent', 'scheme',
  // Tipografía
  'fontDisplay', 'fontPoster', 'fontBody', 'fontSerif', 'fontMono', 'fontScale',
  'typography', 'elementStyles',
  // Glass / forma
  'glassIntensity', 'glassAmount', 'cornerRadius', 'sheen',
  // Fondo / ambiente
  'backgroundType', 'backgroundImage', 'backgroundGradient',
  'ambientGlow', 'grain', 'grainStyle', 'watermark', 'bgOverlayOpacity', 'watermarkOpacity', 'watermarkSize',
  // CTA / checkout visual
  'ctaStyle', 'checkoutActiveColor', 'checkoutFormGlass', 'checkoutPayGlass', 'checkoutTextShadow',
  // Portada
  'portadaVariant', 'portadaShowLogo', 'portadaShowBadge', 'portadaShowStatus',
  // Estructura (lo que hace que dos plantillas no se sientan primas)
  'layoutWidth', 'catalogNav', 'cardStyle',
  // Catálogo (solo lo visual)
  'catalogView', 'catalogColumns', 'showSearch', 'showCategoryIcons', 'productArt', 'showTags', 'featuredFavorites',
  // Superficies
  'animations', 'surfaceTint', 'cardShadow', 'scrimOpacity', 'badgeBg', 'badgeText',
] as const satisfies readonly (keyof ThemeConfig)[];

type VisualKey = (typeof TEMPLATE_VISUAL_KEYS)[number];
export type TemplateConfig = Partial<Pick<ThemeConfig, VisualKey>>;

/** Overrides tipográficos por ROL, sin repetir los 10 roles completos. */
type TypoOverrides = Partial<Record<TypographyRole, Partial<TextStyle>>>;

/**
 * Compone un `ThemeTypography` íntegro a partir de capas parciales (los roles
 * no tocados = default exacto). Lo exige el tipo de `ThemeConfig['typography']`
 * y evita depender de que algún consumidor haga merge parcial por rol — el
 * editor en vivo aplica el config tal cual llega.
 */
function typo(...layers: Array<TypoOverrides | undefined>): ThemeTypography {
  const out = {} as ThemeTypography;
  for (const role of Object.keys(DEFAULT_TYPOGRAPHY) as TypographyRole[]) {
    let merged: TextStyle = { ...DEFAULT_TYPOGRAPHY[role] };
    for (const layer of layers) {
      const v = layer?.[role];
      if (v) merged = { ...merged, ...v };
    }
    out[role] = merged;
  }
  return out;
}

/* ============================================================
   EJE 1 · ESTRUCTURA (el esqueleto)
   ============================================================ */

export type StructureId = 'clasico' | 'carta' | 'revista' | 'kiosco' | 'estantes' | 'pizarra' | 'compacto';

/** Las claves que definen el ESQUELETO. Todo lo que no está aquí es piel y lo
    pone la paleta — así ninguna combinación se pelea consigo misma. */
export const SKELETON_KEYS = [
  'layoutWidth', 'catalogNav', 'cardStyle', 'catalogColumns',
  'portadaVariant', 'showCategoryIcons', 'showTags', 'featuredFavorites',
] as const satisfies readonly VisualKey[];

export type SkeletonConfig = Partial<Pick<ThemeConfig, (typeof SKELETON_KEYS)[number]>>;

export interface MenuStructure {
  id: StructureId;
  /** Nombre corto para el filtro ("Revista", "Carta de autor"). */
  name: string;
  /** Una línea: qué hace distinto este esqueleto. */
  desc: string;
  /** Para quién es. Se muestra al elegir la estructura en la galería. */
  hint: string;
  config: SkeletonConfig;
  /** Ajustes tipográficos que el esqueleto NECESITA (le ganan a la paleta). */
  typography?: TypoOverrides;
  /** Paleta con la que nació esta estructura: encabeza su lista de estilos. */
  signature: string;
  /**
   * Id que tenía el arquetipo antes de que la galería fuera un cruce de ejes.
   * Se conserva para que `findTemplate('revista')` —lo que llega en el
   * formulario de registro o en un enlace guardado— siga resolviendo.
   */
  legacyId?: string;
}

export const MENU_STRUCTURES: MenuStructure[] = [
  {
    id: 'clasico',
    name: 'Clásico',
    desc: 'Portada a pantalla completa, píldoras de categoría y rejilla de tarjetas.',
    hint: 'El recorrido que todo el mundo reconoce. Va bien con casi cualquier carta y es el más seguro si no quieres pensarlo mucho.',
    signature: 'carbon-autor',
    config: {
      layoutWidth: 'movil', catalogNav: 'chips', cardStyle: 'tarjeta', catalogColumns: 2,
      portadaVariant: 'spotlight', showCategoryIcons: true, showTags: true, featuredFavorites: true,
    },
  },
  {
    id: 'carta',
    name: 'Carta de autor',
    desc: 'Sin una sola foto: secciones, serifas y el precio al final de una línea de puntos.',
    hint: 'Para bistrós, bares de vinos y cocina de autor: donde una foto del plato resta en vez de sumar y la carta se lee como un texto.',
    signature: 'papel-autor',
    legacyId: 'carta-autor',
    config: {
      layoutWidth: 'ancho', catalogNav: 'secciones', cardStyle: 'texto',
      portadaVariant: 'ticket', showCategoryIcons: false, showTags: false, featuredFavorites: false,
    },
    // El encabezado de sección y el nombre del platillo van en la serif: es una
    // carta impresa, y ahí la tipografía hace todo el trabajo que en las demás
    // estructuras hace la foto.
    typography: {
      poster: { font: 'serif', transform: 'none', weight: 500, tracking: 0 },
      productName: { font: 'serif', weight: 600, size: 1.05, tracking: 0 },
      price: { font: 'serif', weight: 500 },
    },
  },
  {
    id: 'revista',
    name: 'Revista',
    desc: 'Mosaico editorial a página completa, con el destacado abriendo cada sección.',
    hint: 'Para quien vende con la imagen del plato y tiene fotos buenas. Aprovecha la pantalla ancha: en el teléfono se pliega a dos columnas.',
    signature: 'tinta-editorial',
    legacyId: 'revista',
    config: {
      layoutWidth: 'revista', catalogNav: 'secciones', cardStyle: 'mosaico',
      portadaVariant: 'fullbleed', showCategoryIcons: true, showTags: true, featuredFavorites: true,
    },
    typography: { poster: { tracking: -0.02 }, heading: { weight: 700 } },
  },
  {
    id: 'kiosco',
    name: 'Kiosco',
    desc: 'Se entra eligiendo sección en portadas grandes, como una app de comida.',
    hint: 'Para cartas con secciones muy distintas entre sí (desayunos, almuerzos, bebidas): el comensal elige a qué va antes de ver precios.',
    signature: 'rojo-bandeja',
    legacyId: 'kiosco',
    config: {
      layoutWidth: 'ancho', catalogNav: 'portadas', cardStyle: 'tarjeta', catalogColumns: 2,
      portadaVariant: 'directo', showCategoryIcons: true, showTags: true, featuredFavorites: true,
    },
  },
  {
    id: 'estantes',
    name: 'Estantes',
    desc: 'Una fila deslizable por categoría, al estilo de las apps de domicilio.',
    hint: 'Para cartas anchas donde todo cabe de un vistazo: cada categoría es una repisa que se desliza con el pulgar.',
    signature: 'naranja-reparto',
    legacyId: 'estantes',
    config: {
      layoutWidth: 'ancho', catalogNav: 'secciones', cardStyle: 'carrusel',
      portadaVariant: 'directo', showCategoryIcons: true, showTags: true, featuredFavorites: false,
    },
  },
  {
    id: 'pizarra',
    name: 'Pizarra',
    desc: 'Categorías que se despliegan una a una y platillos escritos en línea.',
    hint: 'Para bares y cantinas: el pizarrón de siempre, sin fotos y sin desplazamiento infinito.',
    signature: 'tiza-pizarron',
    legacyId: 'pizarra',
    config: {
      layoutWidth: 'movil', catalogNav: 'acordeon', cardStyle: 'texto',
      portadaVariant: 'poster', showCategoryIcons: false, showTags: true, featuredFavorites: false,
    },
    typography: { productName: { transform: 'uppercase', tracking: 0.03, weight: 500 } },
  },
  {
    id: 'compacto',
    name: 'Compacto',
    desc: 'Todo plegado y filas densas: la carta entera cabe en una pantalla.',
    hint: 'Para cartas enormes (60, 100 platillos). El comensal abre solo la sección que le interesa en vez de deslizar durante un minuto.',
    signature: 'azul-hielo',
    legacyId: 'compacto',
    config: {
      layoutWidth: 'movil', catalogNav: 'acordeon', cardStyle: 'fila',
      portadaVariant: 'directo', showCategoryIcons: true, showTags: true, featuredFavorites: false,
    },
  },
];

export function findStructure(id: string): MenuStructure | undefined {
  return MENU_STRUCTURES.find((s) => s.id === id);
}

/* ============================================================
   EJE 2 · PALETA (la piel)
   ============================================================ */

/** Lo que aporta una paleta: color, tipografía, fondo, vidrio y botones.
    Nunca esqueleto — eso lo pone la estructura. */
type SkinConfig = Omit<TemplateConfig, (typeof SKELETON_KEYS)[number] | 'typography'>;

export interface StylePalette {
  id: string;
  name: string;
  /** Una línea que vende el ambiente. Solo color y letra: la estructura la
      describe el otro eje, así que aquí nunca se habla de portadas ni rejillas. */
  desc: string;
  mode: 'Oscuro' | 'Claro';
  config: SkinConfig;
  typography?: TypoOverrides;
  /**
   * Esqueleto "natural" de esta paleta, que solo se aplica en la estructura
   * CLÁSICA. Es lo que conserva intactas las 16 plantillas de siempre: cada una
   * traía su propia portada y su propia rejilla, y sin esto todas amanecerían
   * con portada spotlight y dos columnas el día del despliegue.
   */
  own?: SkeletonConfig;
}

export const STYLE_PALETTES: StylePalette[] = [
  {
    id: 'carbon-autor',
    name: 'Carbón de Autor',
    desc: 'Oscuro, cálido y con acento terracota: el look insignia.',
    mode: 'Oscuro',
    // = defaults visuales (colorBg #0b0b0c, acento #D97757)
    config: {},
  },
  {
    id: 'brasa-humo',
    name: 'Brasa & Humo',
    desc: 'Brasa naranja sobre madera quemada, con serifas de parrilla.',
    mode: 'Oscuro',
    config: {
      colorBg: '#140d0a', colorBg2: '#241109', colorText: '#f3e9df',
      colorAccent: '#e0913f', onAccent: '#140d0a', scheme: 'dark',
      fontDisplay: 'Playfair Display', fontPoster: 'Bebas Neue', fontBody: 'Manrope',
      fontSerif: 'Cormorant Garamond', fontMono: 'IBM Plex Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(170deg, #140d0a, #241109)',
      grain: true, ambientGlow: true,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 0.8,
    },
    own: { portadaVariant: 'poster', cardStyle: 'fila' },
  },
  {
    id: 'marfil-oro',
    name: 'Marfil & Oro',
    desc: 'Marfil sereno, dorado discreto y serifas de alta cocina.',
    mode: 'Claro',
    config: {
      colorBg: '#faf6ee', colorBg2: '#f1e9da', colorText: '#241d12',
      colorAccent: '#a8842c', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Cormorant Garamond', fontPoster: 'Playfair Display', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      ctaStyle: 'outline', cornerRadius: 0.7, cardShadow: 0.6,
    },
    // Alta cocina = menos peso, más tracking (grito grueso ≠ elegancia).
    typography: { heading: { weight: 600 }, kicker: { tracking: 0.22, weight: 500 } },
    own: { cardStyle: 'fila', featuredFavorites: false },
  },
  {
    id: 'neon-urbano',
    name: 'Neón Urbano',
    desc: 'Violeta neón, tipografía enorme y energía de calle a medianoche.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0a0714', colorBg2: '#1b0b33', colorText: '#f2ecff',
      colorAccent: '#a855f7', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Syne', fontPoster: 'Archivo Black', fontBody: 'Space Grotesk',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(160deg, #0a0714, #1b0b33)',
      ambientGlow: true,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 1.1,
    },
    own: { portadaVariant: 'poster', catalogColumns: 3 },
  },
  {
    id: 'jardin-fresco',
    name: 'Jardín Fresco',
    desc: 'Verdes naturales sobre fondo claro: aire de bistró de mediodía.',
    mode: 'Claro',
    config: {
      colorBg: '#f7f8f3', colorBg2: '#eaeee2', colorText: '#1d241a',
      colorAccent: '#3e7d4e', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Fraunces', fontPoster: 'Space Grotesk', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 1.3,
    },
    // "Aire tranquilo" = título menos macizo y con algo más de respiro.
    typography: { heading: { weight: 700, lineHeight: 1.05 } },
  },
  {
    id: 'medianoche-azul',
    name: 'Medianoche Azul',
    desc: 'Azul profundo de bar con un eléctrico que no se apaga.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0a1220', colorBg2: '#101c31', colorText: '#e7eefc',
      colorAccent: '#4f8ff7', onAccent: '#061020', scheme: 'dark',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'asphalt', ambientGlow: true, ctaStyle: 'white',
    },
    // "Eléctrico moderno" era solo una promesa del texto: el título de portada
    // ahora sí lleva un brillo neón real con el acento azul.
    typography: { heading: { shadow: 'neon' } },
    own: { portadaVariant: 'stack' },
  },
  {
    id: 'rosa-pastel',
    name: 'Rosa Pastel',
    desc: 'Rosa suave, esquinas redondas y dulzura de repostería.',
    mode: 'Claro',
    config: {
      colorBg: '#fdf2f6', colorBg2: '#fbe4ee', colorText: '#35141f',
      colorAccent: '#d4548c', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Poppins', fontPoster: 'Poppins', fontBody: 'DM Sans',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 1.5,
    },
    // Menos "GRITO EN MAYÚSCULAS" y más dulzura en los kickers.
    typography: { kicker: { tracking: 0.08 } },
  },
  {
    id: 'selva-tropical',
    name: 'Selva Tropical',
    desc: 'Verde selva profundo con un coral que llama desde lejos.',
    mode: 'Oscuro',
    config: {
      colorBg: '#06201d', colorBg2: '#0d3a2e', colorText: '#eafff8',
      colorAccent: '#ff7a59', onAccent: '#06201d', scheme: 'dark',
      fontDisplay: 'Syne', fontPoster: 'Anton', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(160deg, #06201d, #0d3a2e)',
      ambientGlow: true,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 1.2,
    },
    own: { portadaVariant: 'stack' },
  },
  {
    id: 'taqueria-viva',
    name: 'Taquería Viva',
    desc: 'Naranja fuego y tipografía de cartel: antojitos con carácter.',
    mode: 'Oscuro',
    config: {
      colorBg: '#1a0b04', colorBg2: '#2b1206', colorText: '#ffedd9',
      colorAccent: '#f97316', onAccent: '#1a0b04', scheme: 'dark',
      fontDisplay: 'Archivo Black', fontPoster: 'Anton', fontBody: 'Poppins',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'solid', grain: true, grainStyle: 'grueso',
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 0.9,
    },
    typography: { poster: { tracking: -0.02 } },
    own: { portadaVariant: 'poster', catalogColumns: 3 },
  },
  {
    id: 'nieve-minimal',
    name: 'Nieve Minimal',
    desc: 'Blanco, azul y aire: ultra limpio, sin un adorno de más.',
    mode: 'Claro',
    config: {
      colorBg: '#f8fafc', colorBg2: '#eef2f8', colorText: '#0f172a',
      colorAccent: '#2563eb', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 0.9, cardShadow: 0.5,
    },
    // El .t-poster del catálogo es aquí la primera impresión: menos peso y más
    // aire = "ultra limpio" real, no solo de palabra.
    typography: { poster: { weight: 300, tracking: 0.02 }, kicker: { tracking: 0.18 } },
    own: { portadaVariant: 'none', cardStyle: 'fila', showCategoryIcons: false, featuredFavorites: false },
  },
  {
    id: 'trattoria',
    name: 'Trattoria',
    desc: 'Crema, rojo tomate y serifas con historia de mesa larga.',
    mode: 'Claro',
    config: {
      colorBg: '#fbf5ea', colorBg2: '#f3e8d5', colorText: '#2a1c12',
      colorAccent: '#c03a2b', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Playfair Display', fontPoster: 'Anton', fontBody: 'DM Sans',
      fontSerif: 'Cormorant Garamond', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      ctaStyle: 'accent', cornerRadius: 1.1,
    },
    typography: { heading: { weight: 700 } },
    own: { cardStyle: 'fila' },
  },
  {
    id: 'zen-carbon',
    name: 'Zen Carbón',
    desc: 'Carbón neutro, rojo puntual y cero ruido visual.',
    mode: 'Oscuro',
    config: {
      colorBg: '#16161a', colorBg2: '#1e1e24', colorText: '#f0ede6',
      colorAccent: '#e5484d', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false, grain: false,
      glassIntensity: 'solido', ctaStyle: 'outline', cornerRadius: 0.6,
    },
    own: { showCategoryIcons: false, featuredFavorites: false },
  },
  {
    id: 'cafe-barrio',
    name: 'Café de Barrio',
    desc: 'Papel, tonos tierra y textura de grano tostado.',
    mode: 'Claro',
    config: {
      colorBg: '#f5f1e8', colorBg2: '#e9e2d2', colorText: '#26200f',
      colorAccent: '#8b5e34', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Fraunces', fontPoster: 'Space Grotesk', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', grain: true, grainStyle: 'papel', ambientGlow: false, sheen: false,
      ctaStyle: 'outline', cornerRadius: 1.2,
    },
    typography: { kicker: { tracking: 0.1 } },
    own: { portadaVariant: 'stack', featuredFavorites: false },
  },
  {
    id: 'fuego-amarillo',
    name: 'Fuego Amarillo',
    desc: 'Negro asfalto y un amarillo que grita desde la acera.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0d0d0b', colorBg2: '#191914', colorText: '#fdf6e3',
      colorAccent: '#facc15', onAccent: '#131303', scheme: 'dark',
      fontDisplay: 'Archivo Black', fontPoster: 'Anton', fontBody: 'Space Grotesk',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'asphalt', grain: true, grainStyle: 'grueso',
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 0.8,
    },
    // Poster gráfico "que grita" = brillo neón amarillo, no un t-poster plano.
    typography: { poster: { shadow: 'neon' } },
    own: { portadaVariant: 'poster', catalogColumns: 3 },
  },
  {
    id: 'oceano',
    name: 'Océano',
    desc: 'Azul agua, claridad de puerto y esquinas suaves.',
    mode: 'Claro',
    config: {
      colorBg: '#f2f8fa', colorBg2: '#e2eff4', colorText: '#0c2733',
      colorAccent: '#0891b2', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'DM Sans',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: true, sheen: false,
      ctaStyle: 'accent', checkoutActiveColor: 'accent', cornerRadius: 1.4,
    },
    typography: { heading: { weight: 700 } },
  },
  {
    id: 'lounge-violeta',
    name: 'Lounge Violeta',
    desc: 'Violeta profundo con brillo de vitrina de coctelería.',
    mode: 'Oscuro',
    config: {
      colorBg: '#100c1e', colorBg2: '#191233', colorText: '#eae6ff',
      colorAccent: '#8b7cf7', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Unbounded', fontPoster: 'Bebas Neue', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(165deg, #100c1e, #191233)',
      ambientGlow: true, sheen: true, ctaStyle: 'white', cornerRadius: 1.2,
    },
    own: { portadaVariant: 'stack' },
  },

  /* ── Las seis que estrenaron los arquetipos ──────────────────
     Nacieron pegadas a una estructura (la paleta de "Revista", la de
     "Pizarra"…). Al separarse los ejes se quedan como paletas de pleno
     derecho: ahora también se pueden usar en cualquier otro esqueleto. */

  {
    id: 'papel-autor',
    name: 'Papel de Autor',
    desc: 'Papel crema, tinta parda y serifas de carta impresa.',
    mode: 'Claro',
    config: {
      colorBg: '#faf7f2', colorBg2: '#f1ebe1', colorText: '#1f1a14',
      colorAccent: '#7a6a4f', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Cormorant Garamond', fontPoster: 'Bebas Neue', fontBody: 'DM Sans',
      fontSerif: 'Cormorant Garamond', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false, grain: true, grainStyle: 'papel',
      glassIntensity: 'solido', glassAmount: 0, cornerRadius: 0.5, cardShadow: 0,
      ctaStyle: 'outline',
    },
    own: { portadaVariant: 'ticket', cardStyle: 'fila', showCategoryIcons: false, featuredFavorites: false },
  },
  {
    id: 'tinta-editorial',
    name: 'Tinta Editorial',
    desc: 'Negro tinta con el rojo de una portada de revista.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0c0c0e', colorBg2: '#17171b', colorText: '#f4f2ef',
      colorAccent: '#e0533d', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Syne', fontPoster: 'Archivo Black', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: true,
      ctaStyle: 'white', cornerRadius: 0.8,
    },
    own: { portadaVariant: 'poster', catalogColumns: 3 },
  },
  {
    id: 'rojo-bandeja',
    name: 'Rojo Bandeja',
    desc: 'Blanco de bandeja y rojo de rótulo, limpio y directo.',
    mode: 'Claro',
    config: {
      colorBg: '#fdfdfc', colorBg2: '#f1f0ec', colorText: '#18181b',
      colorAccent: '#dc2626', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Anton', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 25, cornerRadius: 1.3, cardShadow: 0.8,
      ctaStyle: 'accent', checkoutActiveColor: 'accent',
    },
    own: { portadaVariant: 'directo' },
  },
  {
    id: 'tiza-pizarron',
    name: 'Tiza y Pizarrón',
    desc: 'Pizarra gris verdosa y tiza amarilla escrita a mano alzada.',
    mode: 'Oscuro',
    config: {
      colorBg: '#14171a', colorBg2: '#1b1f23', colorText: '#f2efe6',
      colorAccent: '#e8c547', onAccent: '#14171a', scheme: 'dark',
      fontDisplay: 'Bebas Neue', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'solid', grain: true, grainStyle: 'grueso', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 20, cornerRadius: 0.5, cardShadow: 0.3,
      ctaStyle: 'accent', checkoutActiveColor: 'accent',
    },
    typography: { poster: { tracking: 0.06 } },
    own: { portadaVariant: 'poster', cardStyle: 'fila', showCategoryIcons: false },
  },
  {
    id: 'naranja-reparto',
    name: 'Naranja Reparto',
    desc: 'Blanco de aplicación y naranja de repartidor: todo se ve al instante.',
    mode: 'Claro',
    config: {
      colorBg: '#ffffff', colorBg2: '#f3f5f7', colorText: '#0f172a',
      colorAccent: '#ea580c', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Archivo Black', fontBody: 'Plus Jakarta Sans',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 30, cornerRadius: 1.2, cardShadow: 0.7,
      ctaStyle: 'accent', checkoutActiveColor: 'accent',
    },
    own: { portadaVariant: 'directo' },
  },
  {
    id: 'azul-hielo',
    name: 'Azul Hielo',
    desc: 'Grafito frío con un azul de hielo que ordena la lectura.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0f1115', colorBg2: '#171a20', colorText: '#e8eaed',
      colorAccent: '#38bdf8', onAccent: '#06121a', scheme: 'dark',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 40, cornerRadius: 0.8, cardShadow: 0.4,
      ctaStyle: 'accent', checkoutActiveColor: 'accent',
    },
    own: { portadaVariant: 'directo', cardStyle: 'fila' },
  },
];

export function findPalette(id: string): StylePalette | undefined {
  return STYLE_PALETTES.find((p) => p.id === id);
}

/* ============================================================
   EL CRUCE · una plantilla = estructura × paleta
   ============================================================ */

export interface BuiltinTemplate {
  id: string;
  name: string;
  /** Una línea que vende la idea ("Elegante y nocturno…"). */
  desc: string;
  /** Etiqueta corta para filtrar/mostrar: 'Oscuro' | 'Claro'. */
  mode: 'Oscuro' | 'Claro';
  /** Esqueleto del que sale. Ausente en las plantillas propias del dueño,
      que son una foto de su diseño actual y no un cruce de la galería. */
  structure?: StructureId;
  /** Paleta de la que sale (misma salvedad). */
  palette?: string;
  config: TemplateConfig;
}

/**
 * Compone estructura × paleta. La paleta pone la piel, la estructura el
 * esqueleto, y en tipografía la estructura tiene la última palabra sobre los
 * roles que declara (si "Carta de autor" pide el nombre del platillo en serif,
 * es porque sin foto ese nombre ES la pieza; ninguna paleta debe deshacerlo).
 */
export function composeTemplate(structure: MenuStructure, palette: StylePalette): BuiltinTemplate {
  const skeleton: SkeletonConfig = structure.id === 'clasico'
    ? { ...structure.config, ...palette.own }
    : structure.config;

  return {
    id: templateId(structure, palette),
    name: palette.name,
    desc: palette.desc,
    mode: palette.mode,
    structure: structure.id,
    palette: palette.id,
    config: {
      ...structuredClone(palette.config),
      ...skeleton,
      typography: typo(palette.typography, structure.typography),
    },
  };
}

/**
 * Id de una combinación. Las de la estructura clásica conservan el id pelado de
 * la paleta y la combinación que estrenó cada arquetipo conserva el suyo
 * ('revista', 'kiosco'…): son los ids que ya viajan en el formulario de
 * registro y en enlaces guardados, y romperlos dejaría al que se registre con
 * un enlace viejo sin plantilla.
 */
function templateId(structure: MenuStructure, palette: StylePalette): string {
  if (structure.id === 'clasico') return palette.id;
  if (structure.legacyId && structure.signature === palette.id) return structure.legacyId;
  return `${structure.id}-${palette.id}`;
}

/** Las paletas en el orden en que se muestran para una estructura: primero la
    que la estrenó (es la que el dueño reconoce del filtro), luego el resto. */
export function palettesForStructure(structure: MenuStructure): StylePalette[] {
  const signature = STYLE_PALETTES.filter((p) => p.id === structure.signature);
  return [...signature, ...STYLE_PALETTES.filter((p) => p.id !== structure.signature)];
}

/** Las 22 plantillas de una estructura, listas para la galería. */
export function templatesForStructure(structureId: StructureId): BuiltinTemplate[] {
  const structure = findStructure(structureId);
  if (!structure) return [];
  return palettesForStructure(structure).map((p) => composeTemplate(structure, p));
}

/** La galería completa: 7 estructuras × 22 paletas. */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = MENU_STRUCTURES.flatMap((s) =>
  palettesForStructure(s).map((p) => composeTemplate(s, p)),
);

export function findTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

/* ── Aplicar / extraer ──────────────────────────────────────── */

/**
 * Aplica una plantilla sobre la config actual del restaurante:
 * resetea lo visual a defaults, pone los deltas de la plantilla y
 * conserva identidad + operación intactas.
 */
export function applyTemplateToConfig(prev: ThemeConfig, tpl: BuiltinTemplate): ThemeConfig {
  const next: ThemeConfig = { ...prev };
  for (const k of TEMPLATE_VISUAL_KEYS) {
    (next as unknown as Record<string, unknown>)[k] = structuredClone(DEFAULT_CONFIG[k]);
  }
  Object.assign(next, structuredClone(tpl.config));
  return next;
}

/**
 * Recorta una config completa a solo sus claves visuales — lo que se guarda
 * cuando el restaurante guarda su DISEÑO ACTUAL como plantilla propia
 * reutilizable (mismo subconjunto que una plantilla builtin, por eso el
 * resultado encaja directo en `BuiltinTemplate.config` / `applyTemplateToConfig`).
 */
export function extractVisualConfig(config: ThemeConfig): TemplateConfig {
  const out: TemplateConfig = {};
  for (const k of TEMPLATE_VISUAL_KEYS) {
    (out as Record<string, unknown>)[k] = structuredClone(config[k]);
  }
  return out;
}

/**
 * Qué estructura tiene una config cualquiera. Sirve para abrir la galería en la
 * estructura que el restaurante ya está usando en vez de en la primera de la
 * lista — y para que las plantillas propias del dueño se dibujen con su
 * esqueleto real. Compara solo los ejes que se ven de un vistazo (navegación,
 * forma y ancho); el resto del esqueleto es afinado del dueño.
 */
export function structureOfConfig(config: Pick<ThemeConfig, 'catalogNav' | 'cardStyle' | 'layoutWidth'>): StructureId {
  const match = MENU_STRUCTURES.find(
    (s) =>
      s.config.catalogNav === config.catalogNav &&
      s.config.cardStyle === config.cardStyle &&
      s.config.layoutWidth === config.layoutWidth,
  );
  return match?.id ?? 'clasico';
}
