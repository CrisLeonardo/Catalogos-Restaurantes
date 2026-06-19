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
  findFont,
  type ThemeConfig,
  type ThemeContent,
  type ThemeTypography,
  type TypographyRole,
  type TextStyle,
  type GlassIntensity,
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

/** Merge de 2 niveles para content (sección → claves). */
function mergeContent(...layers: Array<DeepPartial<ThemeContent> | null | undefined>): ThemeContent {
  const base = structuredClone(DEFAULT_CONTENT) as ThemeContent;
  for (const layer of layers) {
    if (!layer) continue;
    for (const section of Object.keys(layer) as Array<keyof ThemeContent>) {
      const vals = layer[section];
      if (vals && typeof vals === 'object') {
        Object.assign(base[section], vals);
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

  const config: ThemeConfig = {
    ...DEFAULT_CONFIG,
    ...seed,
    ...legacyToConfig(row ?? {}),
    ...(row?.config ?? {}),
    ...(override?.config ?? {}),
  };

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

function hexToRgb(hex: string): [number, number, number] {
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
  const g = GLASS_PRESETS[config.glassIntensity];
  const cr = config.cornerRadius;

  // Las variables de glass para modo claro las manejan reglas CSS puras en globals.css
  // usando html[data-scheme="light"] y html[data-scheme="light"][data-glass="..."].
  // Aquí siempre inyectamos los valores de modo oscuro como base; CSS los sobreescribe.

  const dispFont = findFont(config.fontDisplay);
  const postFont = findFont(config.fontPoster);
  const serifFont = findFont(config.fontSerif);
  const bodyFont = findFont(config.fontBody);
  const monoFont = findFont(config.fontMono);

  const fam = (family: string, fallback: string) => `'${family}', ${fallback}`;

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

    '--glass-blur': `${g.blur}px`,
    '--glass-sat': `${g.sat}%`,
    '--glass-fill': `rgba(255,255,255,${g.fill})`,
    '--glass-fill-2': `rgba(255,255,255,${g.fill2})`,
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

    '--bg-overlay-opacity': String(config.bgOverlayOpacity ?? 1),
    '--watermark-opacity': String(config.watermarkOpacity ?? 0.04),
    '--watermark-size': `${config.watermarkSize ?? 78}svmin`,

    // ── Tipografía por rol (--t-<rol>-*) ────────────────────
    ...buildTypographyVars(config.typography ?? DEFAULT_TYPOGRAPHY),

    // ── Superficies / tarjetas (se adaptan a la paleta) ─────
    ...buildSurfaceVars(config),

    // ── Panel admin — colores del sidebar/topbar ────────────
    // Cuando adminUseClientTheme=true se heredan los colores del restaurante;
    // cuando es false se usan los colores del panel configurados independientemente.
    ...buildAdminPanelVars(config),
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
  };
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

/** Multiplicador de tamaño efectivo de un rol (para componentes que fijan px). */
export function roleSize(config: ThemeConfig, role: TypographyRole, elementKey?: string): number {
  const el = elementKey ? config.elementStyles?.[elementKey] : undefined;
  return el?.size ?? config.typography?.[role]?.size ?? 1;
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

/** Genera las variables CSS del panel admin (personalización total). */
function buildAdminPanelVars(config: ThemeConfig): Record<string, string> {
  const useClient = config.adminUseClientTheme ?? false;

  const bg     = useClient ? config.colorBg      : (config.adminPanelBg     ?? '#0c0c0e');
  const accent = useClient ? config.colorAccent   : (config.adminPanelAccent ?? config.colorAccent);

  // Esquema del panel: 'auto' decide por luminancia del fondo; o se fuerza.
  const schemePref = config.adminPanelScheme ?? 'auto';
  const adminLight = useClient
    ? isLight(bg)
    : schemePref === 'light' ? true : schemePref === 'dark' ? false : isLight(bg);

  // Texto: heredado, explícito, o auto por esquema.
  const adminText = useClient
    ? config.colorText
    : (config.adminPanelText || (adminLight ? '#15130f' : '#F5F3EF'));

  // Fondo de tarjetas del panel (usercard, etc.).
  const cardBg = useClient
    ? rgba(config.colorText, 0.06)
    : (config.adminPanelCardBg || (adminLight ? rgba('#000000', 0.04) : rgba('#ffffff', 0.06)));

  // Familia del panel: una de FONT_OPTIONS, o Geist por defecto.
  const adminFont = !useClient && config.adminPanelFont
    ? `'${config.adminPanelFont}', var(--ui-font-sans)`
    : 'var(--ui-font-sans)';

  const scale  = useClient ? 1 : (config.adminPanelTextScale ?? 1);
  const radius = useClient ? 1 : (config.adminPanelRadius ?? 1);

  return {
    '--admin-panel-bg':       bg,
    '--admin-panel-accent':   accent,
    '--admin-panel-text':     adminText,
    '--admin-panel-text-2':   rgba(adminText, 0.74),
    '--admin-panel-text-3':   rgba(adminText, 0.50),
    '--admin-panel-text-4':   rgba(adminText, 0.48),
    '--admin-panel-hair':     adminLight ? rgba('#000000', 0.10) : rgba(adminText, 0.10),
    '--admin-panel-hair-2':   adminLight ? rgba('#000000', 0.16) : rgba(adminText, 0.18),
    '--admin-panel-card':     cardBg,
    '--admin-panel-font':     adminFont,
    '--admin-panel-scale':    String(scale),
    '--admin-panel-radius':   String(radius),
  };
}

/* ── Google Fonts href ────────────────────────────────────── */

export function buildFontsHref(config: ThemeConfig): string | null {
  const families = [
    config.fontDisplay,
    config.fontPoster,
    config.fontBody,
    config.fontSerif,
    config.fontMono,
    config.adminPanelFont,
  ];
  const axes = new Set<string>();
  for (const family of families) {
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
