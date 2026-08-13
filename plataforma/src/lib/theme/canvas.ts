/* ============================================================
   LIENZO DEL MENÚ — qué composición toca según la pantalla
   ------------------------------------------------------------
   Compañero en TypeScript del bloque «LIENZO DEL MENÚ» de globals.css.
   Reparto de responsabilidades, a propósito:

     · El ANCHO en píxeles vive SOLO en el CSS (`--menu-max`). Así se aplica
       en el primer pintado, sin esperar a que hidrate el JavaScript y sin el
       salto de maqueta que provocaría medir la ventana desde React (en el
       servidor no hay ventana que medir: se asume teléfono).
     · La COMPOSICIÓN —cuántas columnas, qué tamaño de pieza, si el buscador
       sube a la línea del título— vive aquí, porque son decisiones de React
       que no se pueden expresar con una media query.

   Los dos lados comparten los mismos cortes de pantalla (TIER_MIN_VW), que
   es lo único que hay que mantener sincronizado entre ambos archivos.

   `layoutWidth` (lo que elige el dueño) dejó de ser un ancho fijo y pasó a
   ser una AMBICIÓN: cuánto quiere crecer cuando hay pantalla de sobra. En un
   teléfono los tres valores se ven igual. ============================================================ */

import type { LayoutWidth } from './defaults';

/** Escalón de pantalla. No son «dispositivos»: son cantidades de sitio. */
export type ScreenTier = 'phone' | 'tablet' | 'desktop' | 'wide';

/** Ancho de ventana (px) a partir del cual empieza cada escalón.
    DEBE coincidir con las media queries de `[data-canvas]` en globals.css. */
export const TIER_MIN_VW: Record<ScreenTier, number> = {
  phone: 0,
  tablet: 620,
  desktop: 1000,
  wide: 1400,
};

const TIERS: ScreenTier[] = ['phone', 'tablet', 'desktop', 'wide'];

/** Escalón que corresponde a un ancho de ventana. */
export function screenTier(vw: number): ScreenTier {
  let tier: ScreenTier = 'phone';
  for (const t of TIERS) if (vw >= TIER_MIN_VW[t]) tier = t;
  return tier;
}

/**
 * Composición del catálogo: con qué esqueleto se dibuja la carta.
 *
 * Devuelve el mismo vocabulario de siempre ('movil' | 'ancho' | 'revista')
 * porque es el que ya entienden las piezas del catálogo, pero ahora sale de
 * cruzar la ambición del dueño con la pantalla real:
 *
 *   · En un teléfono SIEMPRE es 'movil'. Es de donde entra casi todo el
 *     mundo (el QR de la mesa) y el único caso que nunca desborda: una
 *     plantilla de «revista» tiene ahí 343 px reales, y componer un mosaico
 *     de tres columnas de 106 px con los nombres cortados era el resultado
 *     de decidir la maqueta mirando solo la configuración.
 *   · En escritorio, «Columna de móvil» deja de significar «460 px para
 *     siempre»: pasa a repartirse por ancho disponible como 'ancho'. Sin
 *     esto, un lienzo que ya mide 900 px seguiría dibujando las 2 columnas
 *     fijas del teléfono, o sea tarjetas de 444 px.
 */
export function canvasComposition(configured: LayoutWidth, tier: ScreenTier): LayoutWidth {
  if (tier === 'phone') return 'movil';
  if (tier === 'tablet') return configured === 'movil' ? 'movil' : 'ancho';
  // Escritorio y monitor grande comparten esqueleto: lo que cambia entre
  // ellos es cuánta pieza cabe, y de eso se encarga la rejilla que se
  // auto-ajusta (y `mosaicColumns` donde no la hay).
  return configured === 'revista' ? 'revista' : 'ancho';
}

/**
 * Columnas del MOSAICO (y de la carta impresa, que se parte igual).
 *
 * El mosaico no puede usar la rejilla que se auto-ajusta: reparte las piezas
 * a mano por altura (para que no queden huecos de 800 px), así que necesita
 * un número. Y ese número no puede salir solo de la composición, porque
 * 'ancho' cubre desde 560 px de tablet hasta 1.120 de monitor, y dos columnas
 * en 1.120 px dan piezas de medio metro.
 *
 * Nunca menos de 2 (un mosaico de una columna no es un mosaico) y nunca más
 * columnas que piezas, que dejaría una columna entera en blanco a la derecha.
 */
export function mosaicColumns(
  composition: LayoutWidth,
  tier: ScreenTier,
  ownerColumns: number,
  itemCount: number,
): number {
  return Math.max(2, Math.min(mosaicLayoutColumns(composition, tier, ownerColumns), itemCount || 1));
}

/**
 * Las columnas que pide la PANTALLA, sin recortar por cuántas piezas hay.
 *
 * Sirve para distinguir «esta sección tiene 2 platillos» de «aquí caben 2
 * columnas»: en el primer caso las dos piezas no deben estirarse a 646 px
 * cada una para rellenar un monitor — se dibujan a tamaño normal y el grupo
 * se centra. Ver el uso en catalog.tsx.
 */
export function mosaicLayoutColumns(
  composition: LayoutWidth,
  tier: ScreenTier,
  ownerColumns: number,
): number {
  if (tier === 'phone') return ownerColumns;
  if (tier === 'tablet') return composition === 'movil' ? ownerColumns : 2;
  return composition === 'revista' ? 4 : 3;
}

/** Ancho máximo de una pieza de mosaico cuando la sección no llena la fila. */
export const MOSAIC_MAX_TILE = 340;

/**
 * ¿En cuántas columnas se compone la carta impresa ('texto')?
 *
 * Una sola línea de puntos de 1.100 px separa tanto el nombre del precio que
 * deja de leerse como un par — y en una carta impresa de verdad tampoco se
 * compone así. Se parte en cuanto la columna da para dos de ~380 px, y en una
 * doble página de revista sobre monitor grande, en tres.
 */
export function textColumns(tier: ScreenTier, composition: LayoutWidth): number {
  if (tier === 'phone' || tier === 'tablet') return 1;
  if (tier === 'wide' && composition === 'revista') return 3;
  return 2;
}
