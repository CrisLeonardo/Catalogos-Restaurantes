/* El pedido que se está apuntando y todavía no ha salido a cocina.
   ------------------------------------------------------------------
   El tipo y sus tres ayudantes viven aquí porque los comparten el
   orquestador (waiter-panel.tsx), la hoja de opciones del plato y el
   panel de la comanda. */

import type { PanelCurrency } from '@/components/admin/order-card';

export interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  options: {
    groupId: string; groupName: string;
    choiceId: string; choiceName: string;
    priceDelta: number;
    variantId?: string; variantName?: string;
  }[];
  /** Nota libre para ESTE plato ("sin cebolla"), distinta de la nota
      general del pedido. */
  note?: string;
  /**
   * Asiento al que se le apunta (migración 123). `null`/ausente = de la
   * mesa, sin dueño.
   *
   * Se decide AL PEDIR y no al cobrar a propósito: quien sabe que el
   * pepián es del que está frente a la ventana es el mesero en ese
   * momento, no el cajero dos horas después.
   */
  seat?: number | null;
  /**
   * Artículo que NO está en la carta (M-09): el plato del día que nadie dio
   * de alta, un descorche, un recargo. Su `productId` es la constante
   * `LIBRE_ID` —no hay producto al que apuntar— y su precio lo escribió una
   * persona, así que viaja por su propio camino al servidor
   * (`openItems` en createWaiterOrder) y no por el de los platos, que se
   * contrastan contra el catálogo.
   */
  open?: boolean;
}

/** El `productId` de un artículo libre. No es un uuid a propósito: así no
    puede chocar nunca con un producto de verdad ni colarse en una
    búsqueda por id. */
export const LIBRE_ID = 'libre';

let _lineSeq = 0;

/** Id único y estable para cada línea. No usa Date.now() porque dos
    platos agregados en el mismo milisegundo compartirían id, y el
    segundo desaparecería de la lista al re-renderizar. */
export function newLineId(productId: string): string {
  _lineSeq += 1;
  return `${productId}-${_lineSeq}`;
}

/** Un importe tal como lo escribe este restaurante (símbolo, posición
    y separadores de su país). */
/** `decimals` baja a 0 para el pin del plano, donde en 100 px de ancho no
    caben los centavos («Q412» en vez de «Q412.00»). */
export function money(n: number, c: PanelCurrency, decimals = 2): string {
  let num: string;
  try { num = n.toLocaleString(c.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
  catch { num = n.toFixed(decimals); }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}

/** Cómo se lee una línea debajo de su nombre: las opciones elegidas y,
    al final, la nota para cocina. */
export function lineDetail(l: CartLine): string {
  const partes = l.options.map((o) => o.variantName ?? o.choiceName);
  if (l.note) partes.push(l.note);
  return partes.join(' · ');
}
