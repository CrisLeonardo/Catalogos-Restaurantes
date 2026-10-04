/* ============================================================
   MOTOR DE PERSONALIZACIÓN — Resolver
   ------------------------------------------------------------
   Combina las capas de personalización en un ResolvedTheme:
     DEFAULTS ← columnas legacy ← config(BD) ← override por código
   y produce:
     • config / content / customCss ya mergeados
     • variables CSS para inyectar en <html style=...>
     • el href de Google Fonts con las familias elegidas
   ============================================================ */

import {
  DEFAULT_CONFIG,
  DEFAULT_CONTENT,
  DEFAULT_TYPOGRAPHY,
  TYPO_ROLES,
  ELEMENT_TARGETS,
  ROLE_NATURAL_COLOR,
  ROLE_NATURAL_FONT,
  FONT_ROLE_VAR,
  SHADOW_PRESETS,
  findFont,
  type ShadowPreset,
  type ThemeConfig,
  type ThemeContent,
  type ThemeTypography,
  type TypographyRole,
  type TextStyle,
  type GlassIntensity,
  type OrderType,
  type CardStyle,
} from './defaults';
import { getTenantOverride } from '@/tenants/registry';

export interface ResolvedTheme {
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Forma flexible de la fila de restaurant_themes (legacy + nuevas columnas). */
export interface ThemeRow {
  brand_name?: string | null;
  logo_url?: string | null;
  color_primary?: string | null;
  color_bg?: string | null;
  color_text?: string | null;
  font_display?: string | null;
  portada_style?: string | null;
  catalog_view?: string | null;
  glass_intensity?: string | null;
  background_image?: string | null;
  config?: Partial<ThemeConfig> | null;
  content?: DeepPartial<ThemeContent> | null;
  custom_css?: string | null;
}

/** Mapea las columnas legacy a overrides parciales de ThemeConfig. */
function legacyToConfig(row: ThemeRow): Partial<ThemeConfig> {
  const out: Partial<ThemeConfig> = {};
  if (row.brand_name) out.brandName = row.brand_name;
  if (row.logo_url) out.logoUrl = row.logo_url;
  if (row.color_primary) out.colorAccent = row.color_primary;
  if (row.color_bg) out.colorBg = row.color_bg;
  if (row.color_text) out.colorText = row.color_text;
  if (row.font_display) out.fontDisplay = row.font_display;
  if (row.portada_style) out.portadaVariant = row.portada_style as ThemeConfig['portadaVariant'];
  if (row.catalog_view) out.catalogView = row.catalog_view as ThemeConfig['catalogView'];
  if (row.glass_intensity) out.glassIntensity = row.glass_intensity as GlassIntensity;
  if (row.background_image) {
    out.backgroundImage = row.background_image;
    out.backgroundType = 'image';
  }
  return out;
}

/**
 * `cardStyle` efectivo a partir de las capas de personalización.
 *
 * Antes de que existieran los ejes de estructura, la forma del platillo vivía
 * en `catalogView` ('grid' | 'list') — y así quedó guardada en los temas de
 * todos los restaurantes que ya están operando, además de en la columna legacy
 * `catalog_view`. Si el resolver se limitara a tomar el default de `cardStyle`,
 * el día del despliegue TODO menú en vista lista amanecería en rejilla.
 *
 * Regla: gana la capa más específica que diga algo; dentro de una capa, el eje
 * nuevo le gana al viejo. Si ninguna capa opina, manda el default.
 */
function resolveCardStyle(layers: Array<Partial<ThemeConfig>>): CardStyle {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer.cardStyle) return layer.cardStyle;
    if (layer.catalogView) return layer.catalogView === 'list' ? 'fila' : 'tarjeta';
  }
  return DEFAULT_CONFIG.cardStyle;
}

/* TEXTOS POR DEFECTO VIEJOS (auditoría 2026-10-02, T-13: la interfaz habla
   de «tú»). El editor del tema guarda una COPIA de todos los textos al
   guardar, así que un restaurante que nunca tocó «¿Cómo te llamás?» lo tiene
   escrito en su fila y seguiría viéndolo aunque el texto por defecto ya diga
   «¿Cómo te llamas?». Solo se cambia lo que es IGUAL al texto por defecto de
   antes: si el dueño escribió el suyo, se respeta tal cual. */
const LEGACY_DEFAULTS: Record<string, string> = {
  '¿Cómo te llamás?': '¿Cómo te llamas?',
  'Decinos tu nombre': 'Dinos tu nombre',
  'Pagás cuando llega tu pedido': 'Pagas cuando llega tu pedido',
  'Nada por aquí. Probá otra cosa.': 'Nada por aquí. Prueba otra cosa.',
  'Volvé en nuestro horario de atención. ¡Te esperamos!': 'Vuelve en nuestro horario de atención. ¡Te esperamos!',
};

/** Merge de 2 niveles para content (sección → claves). */
function mergeContent(...layers: Array<DeepPartial<ThemeContent> | null | undefined>): ThemeContent {
  const base = structuredClone(DEFAULT_CONTENT) as ThemeContent;
  for (const layer of layers) {
    if (!layer) continue;
    for (const section of Object.keys(layer) as Array<keyof ThemeContent>) {
      const vals = layer[section];
      if (vals && typeof vals === 'object') {
        const limpio: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(vals)) {
          limpio[k] = typeof v === 'string' && v in LEGACY_DEFAULTS ? LEGACY_DEFAULTS[v] : v;
        }
        Object.assign(base[section], limpio);
      }
    }
  }
  return base;
}

/** Merge profundo de tipografía: cada rol se completa contra su default. */
function mergeTypography(
  ...layers: Array<Partial<ThemeTypography> | null | undefined>
): ThemeTypography {
  const out = {} as ThemeTypography;
  for (const role of Object.keys(DEFAULT_TYPOGRAPHY) as TypographyRole[]) {
    let merged: TextStyle = { ...DEFAULT_TYPOGRAPHY[role] };
    for (const layer of layers) {
      const v = layer?.[role];
      if (v && typeof v === 'object') merged = { ...merged, ...v };
    }
    out[role] = merged;
  }
  return out;
}

/** El lema por defecto de antes (relleno). Ver CAT-03 en resolveTheme. */
export const PLACEHOLDER_TAGLINE = 'Sabor que enamora';

/** Semilla del nombre/tagline reales del restaurante (tabla restaurants). */
export interface ThemeFallback {
  brandName?: string;
  tagline?: string | null;
}

export function resolveTheme(
  row: ThemeRow | null,
  slug?: string,
  fallback?: ThemeFallback,
): ResolvedTheme {
  const override = slug ? getTenantOverride(slug) : undefined;

  const seed: Partial<ThemeConfig> = {};
  if (fallback?.brandName) seed.brandName = fallback.brandName;
  if (fallback?.tagline) seed.tagline = fallback.tagline;

  const legacy = legacyToConfig(row ?? {});
  const stored = row?.config ?? {};
  const forced = override?.config ?? {};

  const config: ThemeConfig = {
    ...DEFAULT_CONFIG,
    ...seed,
    ...legacy,
    ...stored,
    ...forced,
  };

  // El lema de relleno de antes quedó guardado en muchos temas: se trata como
  // vacío, o como el lema real del restaurante si lo tiene (CAT-03).
  if (config.tagline === PLACEHOLDER_TAGLINE) {
    config.tagline = seed.tagline && seed.tagline !== PLACEHOLDER_TAGLINE ? seed.tagline : '';
  }

  // La forma del platillo se migró de `catalogView` a `cardStyle`: hay que
  // traducir lo que ya está guardado en vez de pisarlo con el default.
  config.cardStyle = resolveCardStyle([legacy, stored, forced]);

  // Los objetos anidados (typography/elementStyles) se mergean en profundidad
  // contra los defaults: un override parcial nunca borra los roles no tocados.
  config.typography = mergeTypography(
    DEFAULT_CONFIG.typography,
    (row?.config as Partial<ThemeConfig> | undefined)?.typography,
    override?.config?.typography,
  );
  config.elementStyles = {
    ...(DEFAULT_CONFIG.elementStyles ?? {}),
    ...((row?.config as Partial<ThemeConfig> | undefined)?.elementStyles ?? {}),
    ...(override?.config?.elementStyles ?? {}),
  };

  const content = mergeContent(row?.content, override?.content);

  const customCss = sanitizeCustomCss(override?.customCss ?? row?.custom_css ?? '');

  return { config, content, customCss };
}

/**
 * Neutraliza el custom_css antes de inyectarlo con dangerouslySetInnerHTML.
 *
 * Un `<style>` es un "raw text element": el navegador solo lo cierra al
 * encontrar literalmente `</style`. Sin esto, un dueño podría guardar
 * `custom_css = "</style><script>…</script>"` y lograr XSS almacenado que
 * corre en el menú de TODOS sus comensales. Quitamos esa secuencia (y, por
 * higiene, cualquier `</script`/`<!--`); el CSS legítimo nunca la necesita.
 *
 * Nota: esto cierra el "breakout" a JS, pero el CSS arbitrario aún puede
 * exfiltrar datos por selectores+url(). El control real es restringir quién
 * puede escribir custom_css y/o un Content-Security-Policy.
 */
export function sanitizeCustomCss(css: string | null | undefined): string {
  if (!css) return '';
  return css.replace(/<\/(style|script)/gi, '').replace(/<!--/g, '');
}

/* ── Helpers de color ─────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [245, 243, 239];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Luminancia relativa simple (para decidir contraste claro/oscuro). */
export function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

const GLASS_PRESETS: Record<GlassIntensity, { blur: number; sat: number; fill: number; fill2: number }> = {
  translucido: { blur: 13, sat: 150, fill: 0.045, fill2: 0.085 },
  esmerilado: { blur: 22, sat: 135, fill: 0.065, fill2: 0.11 },
  solido: { blur: 30, sat: 120, fill: 0.1, fill2: 0.17 },
};

/* ── Variables CSS para inyectar en <html style=...> ──────── */

export function buildThemeVars(config: ThemeConfig): Record<string, string> {
  const text = config.colorText;
  const preset = GLASS_PRESETS[config.glassIntensity];
  const amt = Math.max(0, Math.min(100, config.glassAmount ?? 100)) / 100;
  const cr = config.cornerRadius;

  // Interpola entre el preset seleccionado (amt=1) y sólido puro (amt=0).
  const glassBlur  = preset.blur  * amt;
  const glassSat   = 100 + (preset.sat  - 100) * amt;
  const glassFill  = preset.fill  * amt;
  const glassFill2 = preset.fill2 * amt;
  const [bgR, bgG, bgB] = hexToRgb(config.colorBg);
  // Fondo sólido que tapa el fondo cuando el glass se reduce (0 = transparente, 1 = color del fondo)
  const glassBg = amt < 1 ? `rgba(${bgR},${bgG},${bgB},${(1 - amt).toFixed(3)})` : 'transparent';

  // Las variables de glass para modo claro las manejan reglas CSS puras en globals.css
  // usando html[data-scheme="light"] y html[data-scheme="light"][data-glass="..."].
  // Aquí siempre inyectamos los valores de modo oscuro como base; CSS los sobreescribe.

  const dispFont = findFont(config.fontDisplay);
  const postFont = findFont(config.fontPoster);
  const serifFont = findFont(config.fontSerif);
  const bodyFont = findFont(config.fontBody);
  const monoFont = findFont(config.fontMono);

  const fam = (family: string, fallback: string) => {
    const selfHosted = SELF_HOSTED_FONT_VARS[family];
    return selfHosted ? `${selfHosted}, ${fallback}` : `'${family}', ${fallback}`;
  };

  return {
    '--brand-bg': config.colorBg,
    '--brand-bg-2': config.colorBg2,
    '--brand-text': text,
    '--brand-accent': config.colorAccent,
    '--brand-on-accent': config.onAccent,

    '--u-text': text,
    '--u-text-2': rgba(text, 0.74),
    '--u-text-3': rgba(text, 0.5),
    '--u-text-4': rgba(text, 0.48),
    // Modo claro: CSS html[data-scheme="light"] sobreescribe a rgba(0,0,0,0.10/0.16)
    '--u-hair': rgba(text, 0.1),
    '--u-hair-2': rgba(text, 0.18),

    '--glass-blur': `${glassBlur.toFixed(1)}px`,
    '--glass-sat': `${Math.round(glassSat)}%`,
    '--glass-fill': `rgba(255,255,255,${glassFill.toFixed(4)})`,
    '--glass-fill-2': `rgba(255,255,255,${glassFill2.toFixed(4)})`,
    '--glass-bg': glassBg,
    // Modo claro: CSS sobreescribe stroke y hi a valores oscuros-sobre-blanco
    '--glass-stroke': 'rgba(255,255,255,0.14)',
    '--glass-hi': 'rgba(255,255,255,0.42)',

    '--font-display': fam(config.fontDisplay, dispFont?.stack ?? 'system-ui, sans-serif'),
    '--font-poster': fam(config.fontPoster, postFont?.stack ?? "'Arial Narrow', sans-serif"),
    '--font-serif': fam(config.fontSerif, serifFont?.stack ?? 'Georgia, serif'),
    '--ui-font-sans': `${fam(config.fontBody, bodyFont?.stack ?? 'system-ui, sans-serif')}`,
    '--ui-font-mono': fam(config.fontMono, monoFont?.stack ?? 'ui-monospace, monospace'),

    '--font-scale': String(config.fontScale),

    '--radius-md': `${10 * cr}px`,
    '--radius-lg': `${14 * cr}px`,
    '--radius-xl': `${20 * cr}px`,
    '--radius-2xl': `${28 * cr}px`,

    /* El multiplicador de esquinas EN CRUDO. Las cuatro variables de arriba ya
       vienen resueltas a píxeles, así que una escala nueva no podía derivarse
       de ellas sin volver a dividir. El menú del comensal construye sus propios
       radios (--m-r-*) a partir de este número: hasta ahora 86 de los 106
       redondeos del menú estaban escritos a mano (18, 16, 13, 12…) y el
       control «Esquinas» del editor solo movía el 19 % de ellos. */
    '--corner-scale': String(cr),

    '--bg-overlay-opacity': String(config.bgOverlayOpacity ?? 1),
    '--watermark-opacity': String(config.watermarkOpacity ?? 0.04),
    '--watermark-size': `${config.watermarkSize ?? 78}svmin`,

    // ── Tipografía por rol (--t-<rol>-*) ────────────────────
    ...buildTypographyVars(config.typography ?? DEFAULT_TYPOGRAPHY),

    // ── Superficies / tarjetas (se adaptan a la paleta) ─────
    ...buildSurfaceVars(config),

    // (El panel admin ya no emite variables por tenant: usa 2 temas fijos —
    //  ver globals.css `html[data-admin-area]`.)
  };
}

/* ── Tipografía: TextStyle → variables CSS ────────────────────
   Devuelve las 8 propiedades CSS de un rol. Las clases de rol
   (bajo .themed-type) las consumen; para overrides por elemento se
   re-emiten estas mismas vars inline en el elemento concreto. */
export function textStyleVars(role: TypographyRole, s: TextStyle): Record<string, string> {
  const fam = s.font ? FONT_ROLE_VAR[s.font] : ROLE_NATURAL_FONT[role];
  const col = s.color ? s.color : ROLE_NATURAL_COLOR[role];
  return {
    [`--t-${role}-size`]: String(s.size),
    [`--t-${role}-weight`]: String(s.weight),
    [`--t-${role}-style`]: s.italic ? 'italic' : 'normal',
    [`--t-${role}-tracking`]: `${s.tracking}em`,
    [`--t-${role}-lh`]: String(s.lineHeight),
    [`--t-${role}-transform`]: s.transform,
    [`--t-${role}-color`]: col,
    [`--t-${role}-family`]: fam,
    [`--t-${role}-shadow`]: SHADOW_PRESETS[s.shadow ?? 'none'],
  };
}

/** CSS text-shadow de un preset (para usar inline donde no hay rol). */
export function shadowCss(preset: ShadowPreset | undefined): string {
  return SHADOW_PRESETS[preset ?? 'none'];
}

function buildTypographyVars(typo: ThemeTypography): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of TYPO_ROLES) {
    Object.assign(out, textStyleVars(key, typo[key] ?? DEFAULT_TYPOGRAPHY[key]));
  }
  return out;
}

/**
 * Vars CSS para el override de UN elemento concreto. Se aplican inline en el
 * elemento (`style`) y, al ser variables, la clase del rol recalcula solo para
 * ese subárbol. Devuelve {} si el elemento no tiene override.
 */
export function elementStyleVars(config: ThemeConfig, elementKey: string): Record<string, string> {
  const style = config.elementStyles?.[elementKey];
  if (!style) return {};
  const target = ELEMENT_TARGETS.find((t) => t.key === elementKey);
  if (!target) return {};
  return textStyleVars(target.role, style);
}

/** Multiplicador de tamaño efectivo de un rol (para componentes que fijan px).
    Incluye la escala global (config.fontScale): sin esto, el slider "Escala de
    texto global" solo afectaba a las páginas de plataforma (que usan --fs-*)
    y no al menú del comensal, que fija píxeles inline × este multiplicador. */
export function roleSize(config: ThemeConfig, role: TypographyRole, elementKey?: string): number {
  const el = elementKey ? config.elementStyles?.[elementKey] : undefined;
  return (el?.size ?? config.typography?.[role]?.size ?? 1) * (config.fontScale ?? 1);
}

function buildSurfaceVars(config: ThemeConfig): Record<string, string> {
  return {
    '--surface-tint': String(config.surfaceTint ?? 1),
    '--card-shadow': String(config.cardShadow ?? 1),
    '--scrim': `rgba(0,0,0,${config.scrimOpacity ?? 0.55})`,
    '--badge-bg': config.badgeBg || 'rgba(0,0,0,0.62)',
    '--badge-text': config.badgeText || 'rgba(255,255,255,0.86)',
  };
}

/* ── Google Fonts href ────────────────────────────────────── */

/**
 * Familias que viajan self-hosted vía next/font (ver layout.tsx) en vez de
 * pedirse a Google Fonts en tiempo real: Geist ya estaba cargada para toda la
 * app (usada como fuente de cuerpo del panel), y Unbounded/Anton/Instrument
 * Serif/JetBrains Mono son la paleta tipográfica por defecto del sistema
 * (ver DEFAULT_CONFIG). Cuando el tema de un tenant elige exactamente una de
 * estas familias, `fam()` usa la variable CSS en vez del nombre literal (el
 * nombre generado internamente por next/font no coincide con el de Google),
 * y `buildFontsHref` la excluye del <link> dinámico para no pedirla dos veces.
 */
export const SELF_HOSTED_FONT_VARS: Record<string, string> = {
  Geist: 'var(--font-geist-sans)',
  Unbounded: 'var(--font-unbounded)',
  Anton: 'var(--font-anton)',
  'Instrument Serif': 'var(--font-instrument-serif)',
  'JetBrains Mono': 'var(--font-jetbrains-mono)',
  // El resto del catálogo (REN-08): declaradas en app/catalog-fonts.ts.
  'Archivo Black': 'var(--font-archivo-black)',
  'Bebas Neue': 'var(--font-bebas-neue)',
  'Space Grotesk': 'var(--font-space-grotesk)',
  Syne: 'var(--font-syne)',
  'Playfair Display': 'var(--font-playfair)',
  Fraunces: 'var(--font-fraunces)',
  'Cormorant Garamond': 'var(--font-cormorant)',
  Inter: 'var(--font-inter)',
  Manrope: 'var(--font-manrope)',
  'Plus Jakarta Sans': 'var(--font-jakarta)',
  'DM Sans': 'var(--font-dm-sans)',
  Poppins: 'var(--font-poppins)',
  'Space Mono': 'var(--font-space-mono)',
  'IBM Plex Mono': 'var(--font-plex-mono)',
};

export function buildFontsHref(config: ThemeConfig): string | null {
  const families = [
    config.fontDisplay,
    config.fontPoster,
    config.fontBody,
    config.fontSerif,
    config.fontMono,
  ];
  const axes = new Set<string>();
  for (const family of families) {
    if (SELF_HOSTED_FONT_VARS[family]) continue;
    const f = findFont(family);
    if (f) axes.add(f.axis);
  }
  if (axes.size === 0) return null;
  const query = [...axes].map((a) => `family=${a}`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

/* ── Formato de precio ────────────────────────────────────── */

export function formatAmount(amount: number, config: ThemeConfig): string {
  // Un locale inválido escrito en el editor (campo libre) lanzaría RangeError
  // y rompería TODO el sitio del tenant; ante eso caemos al default.
  try {
    return amount.toLocaleString(config.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return amount.toLocaleString('es-GT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

export function formatPrice(amount: number, config: ThemeConfig): string {
  const n = formatAmount(amount, config);
  return config.currencyPosition === 'prefix'
    ? `${config.currencySymbol}${n}`
    : `${n}${config.currencySymbol}`;
}

/* ── Propina obligatoria ──────────────────────────────────────
   'DINE_IN'/'PICKUP'/'DELIVERY' (mayúsculas, tipo de pedido del cliente/
   schema) vs 'dine_in'/'pickup'/'delivery' (OrderType del tema, minúsculas)
   son dos convenciones que ya conviven en el código — este mapeo evita
   duplicar la comparación en cada punto que calcula la propina. */
type CustomerOrderType = 'DINE_IN' | 'PICKUP' | 'DELIVERY';

function toConfigOrderType(t: CustomerOrderType): OrderType {
  return t === 'DINE_IN' ? 'dine_in' : t === 'PICKUP' ? 'pickup' : 'delivery';
}

/** ¿La propina obligatoria aplica a este tipo de pedido según la config? */
export function tipAppliesToType(config: ThemeConfig, orderType: CustomerOrderType): boolean {
  if (config.tipEnabled !== true) return false;
  if (!((Number(config.tipPercent) || 0) > 0)) return false;
  return config.tipOrderTypes.includes(toConfigOrderType(orderType));
}

/** Monto autoritativo de propina sobre un subtotal (servidor: siempre recalcular aquí, nunca confiar en un monto que mande el cliente). */
export function computeTip(config: ThemeConfig, orderType: CustomerOrderType, tipAccepted: boolean, subtotal: number): number {
  if (!tipAccepted || !tipAppliesToType(config, orderType)) return 0;
  return Math.round(subtotal * (Number(config.tipPercent) || 0)) / 100;
}
