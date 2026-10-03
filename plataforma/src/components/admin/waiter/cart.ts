/* El pedido que se está apuntando y todavía no ha salido a cocina.
   ------------------------------------------------------------------
   El tipo y sus tres ayudantes viven aquí porque los comparten el
   orquestador (waiter-panel.tsx), la hoja de opciones del plato y el
   panel de la comanda. */

import { fmtCurrency } from '@/lib/money';

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
  /**
   * Tiempo de la comida al que va este plato (M-06): 1.º, 2.º o postre.
   * `undefined` = sin marcar, sale con lo demás. Viaja a cocina dentro de
   * la nota del plato, que es lo que se imprime.
   */
  course?: number;
}

/**
 * LOS TIEMPOS DE LA COMIDA (M-06)
 * ------------------------------------------------------------
 * En una mesa de seis, las entradas y los fuertes salían juntos porque no
 * había manera de decir otra cosa: todo lo apuntado se iba a cocina en el
 * mismo envío. Es lo que separa un sistema de mostrador de uno de
 * servicio a mesa, y los cuatro referentes lo tratan como función central.
 *
 * Tres y fijos, no una lista configurable. `dineInCourseOptions` ya existe
 * y es otra cosa: una PREFERENCIA de todo el pedido que escribe el
 * comensal desde el menú («Entrada primero»). Esto es el tiempo de CADA
 * plato, lo lee cocina en el papel, y ahí un texto libre por restaurante
 * sería una etiqueta distinta en cada comanda.
 */
export const TIEMPOS = [
  { n: 1, corto: '1.º', label: 'Primer tiempo' },
  { n: 2, corto: '2.º', label: 'Segundo tiempo' },
  { n: 3, corto: 'Postre', label: 'Postre' },
] as const;

/** Cómo se llama un tiempo en el papel de cocina. */
export function tiempoTexto(n: number | null | undefined): string | null {
  const t = TIEMPOS.find((x) => x.n === n);
  return t ? t.label : null;
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
export const money = fmtCurrency;

/** Cómo se lee una línea debajo de su nombre: las opciones elegidas y,
    al final, la nota para cocina. */
export function lineDetail(l: CartLine): string {
  const partes = l.options.map((o) => o.variantName ?? o.choiceName);
  if (l.note) partes.push(l.note);
  return partes.join(' · ');
}
