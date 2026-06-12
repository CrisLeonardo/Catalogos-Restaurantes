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
  findFont,
  type ThemeConfig,
  type ThemeContent,
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

  const content = mergeContent(row?.content, override?.content);

  const customCss = override?.customCss ?? row?.custom_css ?? '';

  return { config, content, customCss };
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
  // El esquema se auto-detecta del color de fondo (no hay control manual).
  // Así el glass y los bordes siempre se adaptan sin que el admin lo configure.
  const light = isLight(config.colorBg);
  const g = GLASS_PRESETS[config.glassIntensity];
  const cr = config.cornerRadius;

  // El glass es blanco-traslúcido en oscuro; en claro sube opacidad y usa borde oscuro.
  const glassTint = light ? '255,255,255' : '255,255,255';
  const glassFill = light ? Math.min(0.85, g.fill * 8 + 0.4) : g.fill;
  const glassFill2 = light ? Math.min(0.92, g.fill2 * 6 + 0.45) : g.fill2;
  const glassStroke = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)';
  const glassHi = light ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.42)';

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
    '--u-text-4': rgba(text, 0.32),
    '--u-hair': light ? rgba('#000000', 0.1) : rgba(text, 0.1),
    '--u-hair-2': light ? rgba('#000000', 0.16) : rgba(text, 0.18),

    '--glass-blur': `${g.blur}px`,
    '--glass-sat': `${g.sat}%`,
    '--glass-fill': `rgba(${glassTint},${glassFill})`,
    '--glass-fill-2': `rgba(${glassTint},${glassFill2})`,
    '--glass-stroke': glassStroke,
    '--glass-hi': glassHi,

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
