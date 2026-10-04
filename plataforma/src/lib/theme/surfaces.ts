/* ============================================================
   QUIÉN EDITA QUÉ — reparto de las claves de ThemeConfig
   ------------------------------------------------------------
   `ThemeConfig` tiene 76 claves y mezcla tres cosas que no se parecen en
   nada: la identidad y la piel del menú, los remates finos que casi nadie
   toca, y ajustes de OPERACIÓN (modos de pedido, propina, moneda, KDS,
   plano del salón) que no tienen nada de visual y se editan en Ajustes.

   Mientras ese reparto vivía solo en la cabeza de quien escribió la
   pantalla, no había forma de responder a «¿dónde se edita esto?» sin leer
   1.000 líneas de JSX — ni de notar que una clave nueva se quedó sin sitio.
   Aquí está declarado, y `surfaces.test.ts` lo verifica: toda clave de
   `ThemeConfig` pertenece a EXACTAMENTE un grupo, así que una clave 77
   no se puede añadir sin decidir quién la toca.

   ESTO NO ES UN PERMISO. Es un mapa: dice dónde se edita cada cosa, no
   quién tiene derecho a ello (de eso se ocupan los roles y `tenant-guard`).

   Relacionado: `templates.ts` declara qué puede tocar una PLANTILLA
   (TEMPLATE_VISUAL_KEYS) y cuál es el esqueleto (SKELETON_KEYS).
   ============================================================ */

import { DEFAULT_CONFIG, type ThemeConfig } from './defaults';

type Key = keyof ThemeConfig;

/** Lo que el dueño decide de entrada: quién es y cómo se recorre su carta.
    Son las pestañas Diseño · Marca · Menú del editor. */
export const OWNER_BASIC_KEYS = [
  // Identidad
  'brandName', 'tagline', 'zone', 'logoUrl', 'markUrl', 'pwaIconUrl',
  // Color
  'colorBg', 'colorBg2', 'colorText', 'colorAccent', 'onAccent', 'scheme',
  // Portada
  'portadaVariant', 'portadaShowLogo', 'portadaShowBadge', 'portadaShowStatus', 'ctaStyle',
  // Estructura y catálogo
  'layoutWidth', 'catalogNav', 'cardStyle', 'catalogColumns',
  'showSearch', 'showCategoryIcons', 'productArt', 'showTags', 'featuredFavorites',
  'suggestPairings',
] as const satisfies readonly Key[];

/** Los remates: fondo, vidrio, forma y familias tipográficas. Un restaurante
    puede vivir toda su vida sin abrir esto, y por eso está detrás de la
    pestaña «Avanzado» y no en la primera pantalla. */
export const OWNER_ADVANCED_KEYS = [
  // Tipografía
  'fontDisplay', 'fontPoster', 'fontBody', 'fontSerif', 'fontMono', 'fontScale',
  // Vidrio y forma
  'glassIntensity', 'glassAmount', 'cornerRadius', 'sheen',
  // Fondo
  'backgroundType', 'backgroundImage', 'backgroundGradient',
  'ambientGlow', 'grain', 'grainStyle', 'watermark',
  'bgOverlayOpacity', 'watermarkOpacity', 'watermarkSize',
  'animations',
  // Checkout (solo su aspecto)
  'checkoutActiveColor', 'checkoutFormGlass', 'checkoutPayGlass', 'checkoutTextShadow',
] as const satisfies readonly Key[];

/** Solo el súper admin (`components/super/theme-editor.tsx`): tipografía por
    ROL con sus diez propiedades, override por elemento suelto y el ajuste
    fino de superficies. Poner esto delante de un dueño es pedirle que
    entienda `letter-spacing` para cambiar el color de un botón. */
export const EXPERT_KEYS = [
  'typography', 'elementStyles',
  'surfaceTint', 'cardShadow', 'scrimOpacity', 'badgeBg', 'badgeText',
] as const satisfies readonly Key[];

/** No son visuales. Viven en ThemeConfig por historia, pero se editan en
    Ajustes (pedidos, entrega, moneda), en Cocina o en Mesas. El editor de
    personalización NO debe enseñarlas nunca: una plantilla que cambiara el
    modo de pedido o la propina sería un desastre silencioso. */
export const OPERATIONAL_KEYS = [
  'orderTypes', 'deliveryFee', 'dineInTableCount', 'dineInCourseOptions', 'acceptsCard',
  'tipEnabled', 'tipPercent', 'tipOrderTypes',
  'autoConfirmEnabled', 'autoConfirmMinutes',
  'kdsYellowMin', 'kdsRedMin', 'kdsConfirmFirst',
  'salonReadyMin', 'salonUnpaidMin', 'salonUnacceptedMin',
  'currencySymbol', 'currencyPosition', 'locale',
  'floorPlan',
] as const satisfies readonly Key[];

/** Sustituidas por otra clave. Se conservan porque hay temas guardados que
    solo traen la vieja y el resolver las traduce. No se editan en ningún
    sitio: sale la nueva. */
export const DEPRECATED_KEYS = [
  'catalogView', // lo sustituye `cardStyle` (ver resolveCardStyle)
] as const satisfies readonly Key[];

/** Identidad del restaurante. Se declara aparte porque `templates.ts` promete
    por escrito que una plantilla «nunca» la toca, y esa promesa no la
    verificaba nadie: aplicar una plantilla podía haber renombrado el
    restaurante y no lo habría notado ningún test. */
export const IDENTITY_KEYS = [
  'brandName', 'tagline', 'zone', 'logoUrl', 'markUrl', 'pwaIconUrl',
] as const satisfies readonly Key[];

/** Todo lo que el dueño puede tocar desde su panel. */
export const OWNER_KEYS = [...OWNER_BASIC_KEYS, ...OWNER_ADVANCED_KEYS] as const;

/** El reparto completo, en el orden en que se explica arriba. */
export const KEY_SURFACES = {
  ownerBasic: OWNER_BASIC_KEYS,
  ownerAdvanced: OWNER_ADVANCED_KEYS,
  expert: EXPERT_KEYS,
  operational: OPERATIONAL_KEYS,
  deprecated: DEPRECATED_KEYS,
} as const;

export type KeySurface = keyof typeof KEY_SURFACES;

/** Dónde se edita una clave. `null` = no está repartida (lo que el test
    impide que ocurra, pero en caliente vale más devolver null que reventar). */
export function surfaceOf(key: Key): KeySurface | null {
  for (const [surface, keys] of Object.entries(KEY_SURFACES) as [KeySurface, readonly Key[]][]) {
    if (keys.includes(key)) return surface;
  }
  return null;
}

/** Todas las claves reales de ThemeConfig, sacadas del objeto por defecto
    (que es el único sitio donde están TODAS y en tiempo de ejecución). */
export function allConfigKeys(): Key[] {
  return Object.keys(DEFAULT_CONFIG) as Key[];
}
