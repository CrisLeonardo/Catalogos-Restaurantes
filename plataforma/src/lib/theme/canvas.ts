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

/** Orden de los lienzos, de más estrecho a más ancho. */
const ORDER: LayoutWidth[] = ['movil', 'ancho', 'revista'];

/** El lienzo más ancho que tiene sentido en cada escalón de pantalla. */
const ALLOWED_BY_TIER: Record<ScreenTier, LayoutWidth> = {
  phone: 'movil',
  tablet: 'ancho',
  desktop: 'revista',
  wide: 'revista',
};

/**
 * Composición del catálogo: con qué esqueleto se dibuja la carta.
 *
 * El ajuste del dueño es un TECHO y la pantalla solo puede REDUCIRLO, nunca
 * subirlo. Las dos mitades de esa regla importan:
 *
 *   · La pantalla reduce — el menú se abre casi siempre desde el QR de la
 *     mesa, o sea en un teléfono: ahí una plantilla de «revista» tiene 343 px
 *     reales, y decidir la maqueta solo con la configuración daba un mosaico
 *     de tres columnas de 106 px con los nombres cortados.
 *   · La pantalla NO sube — se probó lo contrario (que «Columna de móvil»
 *     se repartiera como 'ancho' en una computadora) y se descartó al verlo:
 *     las piezas están dibujadas para 460 px y estirarlas las deforma. Ver la
 *     nota larga en el bloque «LIENZO DEL MENÚ» de globals.css.
 */
export function canvasComposition(configured: LayoutWidth, tier: ScreenTier): LayoutWidth {
  const i = Math.min(ORDER.indexOf(configured), ORDER.indexOf(ALLOWED_BY_TIER[tier]));
  return ORDER[i < 0 ? 0 : i];
}

/**
 * Columnas del MOSAICO.
 *
 * El mosaico no puede usar la rejilla que se auto-ajusta: reparte las piezas
 * a mano por altura (para que no queden huecos de 800 px), así que necesita
 * un número.
 *
 * Nunca menos de 2 (un mosaico de una columna no es un mosaico) y nunca más
 * columnas que piezas, que dejaría una columna entera en blanco a la derecha.
 */
export function mosaicColumns(composition: LayoutWidth, ownerColumns: number, itemCount: number): number {
  return Math.max(2, Math.min(mosaicLayoutColumns(composition, ownerColumns), itemCount || 1));
}

/**
 * Las columnas que pide el LIENZO, sin recortar por cuántas piezas hay.
 *
 * Sirve para distinguir «esta sección tiene 2 platillos» de «aquí caben 2
 * columnas»: en el primer caso las dos piezas no deben estirarse a llenar el
 * ancho — se dibujan a tamaño normal y el grupo se centra. Sin esto, en un
 * lienzo de revista una sección de dos platillos daba dos tarjetas de más de
 * 500 px, que es justo el tamaño que se ve mal. Ver el uso en catalog.tsx.
 */
export function mosaicLayoutColumns(composition: LayoutWidth, ownerColumns: number): number {
  // Tres columnas en la página de revista, no cuatro: a 263 px la pieza se
  // parecía más a un tablero de recortes que a una doble página.
  return composition === 'revista' ? 3 : composition === 'ancho' ? 2 : ownerColumns;
}

/** Ancho máximo de una pieza de mosaico cuando la sección no llena la fila. */
export const MOSAIC_MAX_TILE = 340;

/**
 * ¿En cuántas columnas se compone la carta impresa ('texto')?
 *
 * Solo se parte en la página de revista: una sola línea de puntos de 1.100 px
 * separa tanto el nombre del precio que deja de leerse como un par — y así es
 * como se compone una carta impresa de verdad.
 */
export function textColumns(composition: LayoutWidth): number {
  return composition === 'revista' ? 2 : 1;
}
