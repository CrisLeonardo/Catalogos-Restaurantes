/* Tipos compartidos del armazón de dos paneles.
   ------------------------------------------------------------------
   Viven aparte porque los tocan las cuatro piezas (riel, panel de
   atención, comanda y el orquestador) y ninguna de ellas es la dueña
   natural de los tres. */

/**
 * Qué está elegido ahora mismo.
 *
 * Es UNA sola cosa a la vez, y por eso es una unión y no tres estados
 * sueltos: con `tableNumber` y `takeaway` separados —como estaba antes—
 * era posible representar "mesa 4 y además para llevar", que no
 * significa nada, y había que acordarse de apagar el uno al encender
 * el otro en cada sitio.
 *
 * Vive además en la URL (`?mesa=4`), para que recargar la tablet a
 * media comanda no pierda la mesa.
 */
export type Selection =
  | { kind: 'none' }
  | { kind: 'mesa'; n: number }
  | { kind: 'llevar' };

/** Lee la selección de una URL. Cualquier cosa rara equivale a "nada". */
export function selectionFromParams(params: URLSearchParams, tableCount: number): Selection {
  const mesa = Number(params.get('mesa'));
  if (Number.isInteger(mesa) && mesa >= 1 && mesa <= tableCount) return { kind: 'mesa', n: mesa };
  if (params.get('llevar') === '1') return { kind: 'llevar' };
  return { kind: 'none' };
}

/** Cómo se escribe una selección en la barra de direcciones. */
export function selectionToQuery(sel: Selection): string {
  if (sel.kind === 'mesa') return `?mesa=${sel.n}`;
  if (sel.kind === 'llevar') return '?llevar=1';
  return '';
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'mesa' && b.kind === 'mesa') return a.n === b.n;
  return true;
}

/**
 * Una fila de la pestaña "Pedidos" del riel.
 *
 * Mesa, para llevar y domicilio conviven en la MISMA lista a
 * propósito: para el mesero son la misma pregunta —"¿qué tengo en
 * marcha y qué le pasa?"— y separarlos en tres pantallas era lo que
 * convertía "para llevar" en un ciudadano de segunda.
 */
export interface PedidoRow {
  key: string;
  /** "Mesa 4", "Llevar · Ana L.", "Domicilio · Zona 10". */
  title: string;
  /** "Pidió la cuenta", "En cocina", "Servida". */
  estado: string;
  /** Color del punto de estado. */
  tone: string;
  /** "hace 42 min". */
  detalle: string;
  total: string;
  selected: boolean;
  onSelect: () => void;
}
