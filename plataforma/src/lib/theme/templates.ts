/* ============================================================
   PLANTILLAS PREDISEÑADAS DE TEMA
   ------------------------------------------------------------
   Galería integrada de puntos de partida. Dos familias:

   · ESTILO (16) — misma estructura, distinta piel: paletas claras y
     oscuras, portadas, estilos de botón, niveles de glass.
   · ESTRUCTURA (6, `structural: true`) — mueven el esqueleto: cómo se
     navega la carta (catalogNav), qué forma tiene cada platillo
     (cardStyle) y cuánto ancho ocupa la página (layoutWidth). Son las
     que impiden que todos los menús de la plataforma se sientan primos.

   REGLAS:
   · Una plantilla SOLO define claves visuales (VISUAL_KEYS).
     Nunca identidad (nombre, logos, zona) ni operación (pedidos,
     moneda, mesas, cocina, propinas…).
   · Aplicar una plantilla = resetear lo visual a defaults y encima
     poner los deltas de la plantilla → resultado reproducible,
     no un acumulado de la personalización anterior.

   Sin dependencias de React (importable en server y cliente).
   ============================================================ */

import {
  DEFAULT_CONFIG, DEFAULT_TYPOGRAPHY,
  type ThemeConfig, type ThemeTypography, type TextStyle, type TypographyRole,
} from './defaults';

/**
 * Override tipográfico por ROL para una plantilla, sin tener que repetir los
 * 10 roles completos a mano. Devuelve siempre un `ThemeTypography` íntegro
 * (los roles no tocados = default exacto) — lo exige el tipo de
 * `ThemeConfig['typography']`, y evita depender de que algún consumidor haga
 * merge parcial por rol (el editor en vivo aplica el config tal cual llega).
 */
function typo(overrides: Partial<Record<TypographyRole, Partial<TextStyle>>>): ThemeTypography {
  const out = { ...DEFAULT_TYPOGRAPHY } as ThemeTypography;
  for (const role of Object.keys(overrides) as TypographyRole[]) {
    out[role] = { ...DEFAULT_TYPOGRAPHY[role], ...overrides[role] };
  }
  return out;
}

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

export interface BuiltinTemplate {
  id: string;
  name: string;
  /** Una línea que vende la idea ("Elegante y nocturno…"). */
  desc: string;
  /** Etiqueta corta para filtrar/mostrar: 'Oscuro' | 'Claro'. */
  mode: 'Oscuro' | 'Claro';
  /**
   * Cambia el ESQUELETO del menú, no solo su paleta (navegación, forma del
   * platillo, ancho del lienzo). Se marca aparte porque con 22 plantillas en
   * la galería el dueño necesita poder ir directo a las que se ven distintas
   * de verdad, y no ir abriendo paletas hasta topar con una.
   */
  structural?: boolean;
  config: TemplateConfig;
}

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

/* ── La galería ─────────────────────────────────────────────── */

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'carbon-autor',
    name: 'Carbón de Autor',
    desc: 'El look insignia: oscuro, cálido y con acento terracota.',
    mode: 'Oscuro',
    config: {
      // = defaults visuales (colorBg #0b0b0c, acento #D97757, spotlight, grid 2)
      featuredFavorites: true,
    },
  },
  {
    id: 'brasa-humo',
    name: 'Brasa & Humo',
    desc: 'Parrilla y cortes: brasa naranja sobre madera quemada, tipografía editorial.',
    mode: 'Oscuro',
    config: {
      colorBg: '#140d0a', colorBg2: '#241109', colorText: '#f3e9df',
      colorAccent: '#e0913f', onAccent: '#140d0a', scheme: 'dark',
      fontDisplay: 'Playfair Display', fontPoster: 'Bebas Neue', fontBody: 'Manrope',
      fontSerif: 'Cormorant Garamond', fontMono: 'IBM Plex Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(170deg, #140d0a, #241109)',
      grain: true, ambientGlow: true,
      portadaVariant: 'poster', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'fila', cornerRadius: 0.8, featuredFavorites: true,
    },
  },
  {
    id: 'marfil-oro',
    name: 'Marfil & Oro',
    desc: 'Alta cocina: marfil sereno, dorado discreto y serifas clásicas.',
    mode: 'Claro',
    config: {
      colorBg: '#faf6ee', colorBg2: '#f1e9da', colorText: '#241d12',
      colorAccent: '#a8842c', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Cormorant Garamond', fontPoster: 'Playfair Display', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      portadaVariant: 'spotlight', ctaStyle: 'outline',
      cardStyle: 'fila', cornerRadius: 0.7, cardShadow: 0.6,
      // Alta cocina = menos peso, más tracking (grito grueso ≠ elegancia).
      typography: typo({ heading: { weight: 600 }, kicker: { tracking: 0.22, weight: 500 } }),
    },
  },
  {
    id: 'neon-urbano',
    name: 'Neón Urbano',
    desc: 'Street food nocturno: violeta neón, tipografía enorme y energía.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0a0714', colorBg2: '#1b0b33', colorText: '#f2ecff',
      colorAccent: '#a855f7', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Syne', fontPoster: 'Archivo Black', fontBody: 'Space Grotesk',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(160deg, #0a0714, #1b0b33)',
      ambientGlow: true,
      portadaVariant: 'poster', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 3, cornerRadius: 1.1, featuredFavorites: true,
    },
  },
  {
    id: 'jardin-fresco',
    name: 'Jardín Fresco',
    desc: 'Bistró de día: verdes naturales, fondo claro y aire tranquilo.',
    mode: 'Claro',
    config: {
      colorBg: '#f7f8f3', colorBg2: '#eaeee2', colorText: '#1d241a',
      colorAccent: '#3e7d4e', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Fraunces', fontPoster: 'Space Grotesk', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      portadaVariant: 'spotlight', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 1.3, featuredFavorites: true,
      // "Aire tranquilo" = título menos macizo y con algo más de respiro.
      typography: typo({ heading: { weight: 700, lineHeight: 1.05 } }),
    },
  },
  {
    id: 'medianoche-azul',
    name: 'Medianoche Azul',
    desc: 'Bar & cocina de noche: azul profundo con eléctrico moderno.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0a1220', colorBg2: '#101c31', colorText: '#e7eefc',
      colorAccent: '#4f8ff7', onAccent: '#061020', scheme: 'dark',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'asphalt', ambientGlow: true,
      portadaVariant: 'stack', ctaStyle: 'white',
      cardStyle: 'tarjeta', catalogColumns: 2, featuredFavorites: true,
      // "Eléctrico moderno" era solo una promesa del texto: el título de
      // portada ahora sí lleva un brillo neón real con el acento azul.
      typography: typo({ heading: { shadow: 'neon' } }),
    },
  },
  {
    id: 'rosa-pastel',
    name: 'Rosa Pastel',
    desc: 'Cafetería y postres: rosa suave, esquinas redondas, dulzura.',
    mode: 'Claro',
    config: {
      colorBg: '#fdf2f6', colorBg2: '#fbe4ee', colorText: '#35141f',
      colorAccent: '#d4548c', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Poppins', fontPoster: 'Poppins', fontBody: 'DM Sans',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      portadaVariant: 'spotlight', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 1.5, featuredFavorites: true,
      // Menos "GRITO EN MAYÚSCULAS" y más dulzura en los kickers.
      typography: typo({ kicker: { tracking: 0.08 } }),
    },
  },
  {
    id: 'selva-tropical',
    name: 'Selva Tropical',
    desc: 'Cocina caribeña: verde selva profundo con coral vibrante.',
    mode: 'Oscuro',
    config: {
      colorBg: '#06201d', colorBg2: '#0d3a2e', colorText: '#eafff8',
      colorAccent: '#ff7a59', onAccent: '#06201d', scheme: 'dark',
      fontDisplay: 'Syne', fontPoster: 'Anton', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(160deg, #06201d, #0d3a2e)',
      ambientGlow: true,
      portadaVariant: 'stack', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 1.2, featuredFavorites: true,
    },
  },
  {
    id: 'taqueria-viva',
    name: 'Taquería Viva',
    desc: 'Antojitos con carácter: naranja fuego, poster gigante, 3 columnas.',
    mode: 'Oscuro',
    config: {
      colorBg: '#1a0b04', colorBg2: '#2b1206', colorText: '#ffedd9',
      colorAccent: '#f97316', onAccent: '#1a0b04', scheme: 'dark',
      fontDisplay: 'Archivo Black', fontPoster: 'Anton', fontBody: 'Poppins',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'solid', grain: true, grainStyle: 'grueso',
      portadaVariant: 'poster', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 3, cornerRadius: 0.9, featuredFavorites: true,
      typography: typo({ poster: { tracking: -0.02 } }),
    },
  },
  {
    id: 'nieve-minimal',
    name: 'Nieve Minimal',
    desc: 'Ultra limpio: blanco, azul, sin portada — directo al menú en lista.',
    mode: 'Claro',
    config: {
      colorBg: '#f8fafc', colorBg2: '#eef2f8', colorText: '#0f172a',
      colorAccent: '#2563eb', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      portadaVariant: 'none',
      cardStyle: 'fila', showCategoryIcons: false, ctaStyle: 'accent',
      checkoutActiveColor: 'accent', cornerRadius: 0.9, cardShadow: 0.5,
      // Sin portada (`heading`/.t-display NUNCA se pinta aquí), el kicker +
      // el .t-poster del catálogo SON la primera impresión: menos peso y
      // más aire = "ultra limpio" real, no solo de palabra.
      typography: typo({ poster: { weight: 300, tracking: 0.02 }, kicker: { tracking: 0.18 } }),
    },
  },
  {
    id: 'trattoria',
    name: 'Trattoria',
    desc: 'Italiano de mesa larga: crema, rojo tomate y serifas con historia.',
    mode: 'Claro',
    config: {
      colorBg: '#fbf5ea', colorBg2: '#f3e8d5', colorText: '#2a1c12',
      colorAccent: '#c03a2b', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Playfair Display', fontPoster: 'Anton', fontBody: 'DM Sans',
      fontSerif: 'Cormorant Garamond', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      portadaVariant: 'spotlight', ctaStyle: 'accent',
      cardStyle: 'fila', cornerRadius: 1.1, featuredFavorites: true,
      typography: typo({ heading: { weight: 700 } }),
    },
  },
  {
    id: 'zen-carbon',
    name: 'Zen Carbón',
    desc: 'Minimal japonés: carbón neutro, rojo puntual, cero ruido visual.',
    mode: 'Oscuro',
    config: {
      colorBg: '#16161a', colorBg2: '#1e1e24', colorText: '#f0ede6',
      colorAccent: '#e5484d', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false, grain: false,
      glassIntensity: 'solido',
      portadaVariant: 'spotlight', ctaStyle: 'outline',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 0.6, showCategoryIcons: false,
    },
  },
  {
    id: 'cafe-barrio',
    name: 'Café de Barrio',
    desc: 'Café de especialidad: papel, tonos tierra y textura de grano.',
    mode: 'Claro',
    config: {
      colorBg: '#f5f1e8', colorBg2: '#e9e2d2', colorText: '#26200f',
      colorAccent: '#8b5e34', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Fraunces', fontPoster: 'Space Grotesk', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', grain: true, grainStyle: 'papel', ambientGlow: false, sheen: false,
      portadaVariant: 'stack', ctaStyle: 'outline',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 1.2,
      typography: typo({ kicker: { tracking: 0.1 } }),
    },
  },
  {
    id: 'fuego-amarillo',
    name: 'Fuego Amarillo',
    desc: 'Hamburguesas bold: negro asfalto y amarillo que grita.',
    mode: 'Oscuro',
    config: {
      colorBg: '#0d0d0b', colorBg2: '#191914', colorText: '#fdf6e3',
      colorAccent: '#facc15', onAccent: '#131303', scheme: 'dark',
      fontDisplay: 'Archivo Black', fontPoster: 'Anton', fontBody: 'Space Grotesk',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'asphalt', grain: true, grainStyle: 'grueso',
      portadaVariant: 'poster', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 3, cornerRadius: 0.8, featuredFavorites: true,
      // Poster gráfico "que grita" = brillo neón amarillo, no un t-poster plano.
      typography: typo({ poster: { shadow: 'neon' } }),
    },
  },
  {
    id: 'oceano',
    name: 'Océano',
    desc: 'Mariscos frescos: azul agua, claridad y esquinas suaves.',
    mode: 'Claro',
    config: {
      colorBg: '#f2f8fa', colorBg2: '#e2eff4', colorText: '#0c2733',
      colorAccent: '#0891b2', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'DM Sans',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: true, sheen: false,
      portadaVariant: 'spotlight', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 1.4, featuredFavorites: true,
      typography: typo({ heading: { weight: 700 } }),
    },
  },
  {
    id: 'lounge-violeta',
    name: 'Lounge Violeta',
    desc: 'Cocktails y tapas: violeta profundo con brillo de vitrina.',
    mode: 'Oscuro',
    config: {
      colorBg: '#100c1e', colorBg2: '#191233', colorText: '#eae6ff',
      colorAccent: '#8b7cf7', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Unbounded', fontPoster: 'Bebas Neue', fontBody: 'Manrope',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'gradient', backgroundGradient: 'linear-gradient(165deg, #100c1e, #191233)',
      ambientGlow: true, sheen: true,
      portadaVariant: 'stack', ctaStyle: 'white',
      cardStyle: 'tarjeta', catalogColumns: 2, cornerRadius: 1.2, featuredFavorites: true,
    },
  },

  /* ── Arquetipos: cambian el esqueleto, no la pintura ─────────
     Las 16 de arriba comparten estructura (portada a pantalla completa →
     píldoras de categoría → rejilla de tarjetas) y solo se distinguen por
     paleta y tipografía. Estas seis mueven los ejes nuevos —navegación,
     forma del platillo y ancho del lienzo— y por eso se sienten de otro
     planeta aunque se les cambie el color después. */

  {
    id: 'carta-autor',
    name: 'Carta de Autor',
    desc: 'Sin una sola foto: secciones, serifas y precio al final de una línea de puntos.',
    mode: 'Claro',
    structural: true,
    config: {
      colorBg: '#faf7f2', colorBg2: '#f1ebe1', colorText: '#1f1a14',
      colorAccent: '#7a6a4f', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Cormorant Garamond', fontPoster: 'Bebas Neue', fontBody: 'DM Sans',
      fontSerif: 'Cormorant Garamond', fontMono: 'IBM Plex Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false, grain: true, grainStyle: 'papel',
      glassIntensity: 'solido', glassAmount: 0, cornerRadius: 0.5, cardShadow: 0,
      portadaVariant: 'ticket', ctaStyle: 'outline',
      layoutWidth: 'ancho', catalogNav: 'secciones', cardStyle: 'texto',
      showCategoryIcons: false, showTags: false,
      // El encabezado de sección y el nombre del platillo van en la serif: es
      // una carta impresa, y ahí la tipografía hace todo el trabajo que en las
      // demás plantillas hace la foto.
      typography: typo({
        poster: { font: 'serif', transform: 'none', weight: 500, tracking: 0 },
        productName: { font: 'serif', weight: 600, size: 1.05, tracking: 0 },
        price: { font: 'serif', weight: 500 },
      }),
    },
  },
  {
    id: 'revista',
    name: 'Revista',
    desc: 'Mosaico editorial a página completa: fotos grandes de alturas desiguales.',
    mode: 'Oscuro',
    structural: true,
    config: {
      colorBg: '#0c0c0e', colorBg2: '#17171b', colorText: '#f4f2ef',
      colorAccent: '#e0533d', onAccent: '#ffffff', scheme: 'dark',
      fontDisplay: 'Syne', fontPoster: 'Archivo Black', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: true,
      portadaVariant: 'fullbleed', ctaStyle: 'white',
      layoutWidth: 'revista', catalogNav: 'secciones', cardStyle: 'mosaico',
      cornerRadius: 0.8, featuredFavorites: true,
      typography: typo({ poster: { tracking: -0.02 }, heading: { weight: 700 } }),
    },
  },
  {
    id: 'kiosco',
    name: 'Kiosco',
    desc: 'Se entra eligiendo sección en portadas grandes, como una app de comida.',
    mode: 'Claro',
    structural: true,
    config: {
      colorBg: '#fdfdfc', colorBg2: '#f1f0ec', colorText: '#18181b',
      colorAccent: '#dc2626', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Anton', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 25, cornerRadius: 1.3, cardShadow: 0.8,
      portadaVariant: 'directo', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      layoutWidth: 'ancho', catalogNav: 'portadas', cardStyle: 'tarjeta', catalogColumns: 2,
      featuredFavorites: true,
    },
  },
  {
    id: 'pizarra',
    name: 'Pizarra',
    desc: 'Bar de barrio: pizarra, tiza amarilla y categorías que se despliegan una a una.',
    mode: 'Oscuro',
    structural: true,
    config: {
      colorBg: '#14171a', colorBg2: '#1b1f23', colorText: '#f2efe6',
      colorAccent: '#e8c547', onAccent: '#14171a', scheme: 'dark',
      fontDisplay: 'Bebas Neue', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'Space Mono',
      backgroundType: 'solid', grain: true, grainStyle: 'grueso', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 20, cornerRadius: 0.5, cardShadow: 0.3,
      portadaVariant: 'poster', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      layoutWidth: 'movil', catalogNav: 'acordeon', cardStyle: 'texto',
      showCategoryIcons: false,
      typography: typo({
        poster: { tracking: 0.06 },
        productName: { transform: 'uppercase', tracking: 0.03, weight: 500 },
      }),
    },
  },
  {
    id: 'estantes',
    name: 'Estantes',
    desc: 'Una fila deslizable por categoría, al estilo de las apps de domicilio.',
    mode: 'Claro',
    structural: true,
    config: {
      colorBg: '#ffffff', colorBg2: '#f3f5f7', colorText: '#0f172a',
      colorAccent: '#ea580c', onAccent: '#ffffff', scheme: 'light',
      fontDisplay: 'Space Grotesk', fontPoster: 'Archivo Black', fontBody: 'Plus Jakarta Sans',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 30, cornerRadius: 1.2, cardShadow: 0.7,
      portadaVariant: 'directo', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      layoutWidth: 'ancho', catalogNav: 'secciones', cardStyle: 'carrusel',
    },
  },
  {
    id: 'compacto',
    name: 'Compacto',
    desc: 'Para cartas enormes: todo plegado, filas densas y sin desplazamiento infinito.',
    mode: 'Oscuro',
    structural: true,
    config: {
      colorBg: '#0f1115', colorBg2: '#171a20', colorText: '#e8eaed',
      colorAccent: '#38bdf8', onAccent: '#06121a', scheme: 'dark',
      fontDisplay: 'Space Grotesk', fontPoster: 'Bebas Neue', fontBody: 'Inter',
      fontSerif: 'Instrument Serif', fontMono: 'JetBrains Mono',
      backgroundType: 'solid', ambientGlow: false, sheen: false,
      glassIntensity: 'solido', glassAmount: 40, cornerRadius: 0.8, cardShadow: 0.4,
      portadaVariant: 'directo', ctaStyle: 'accent', checkoutActiveColor: 'accent',
      layoutWidth: 'movil', catalogNav: 'acordeon', cardStyle: 'fila',
    },
  },
];

export function findTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
