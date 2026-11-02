/* La tarjeta del plato en la carta del mesero — lo que no es dibujo.

   Las fotos son las que el restaurante ya subió para su menú en línea.
   Un plato sin foto no puede dejar un hueco gris: lleva sus iniciales
   sobre un tinte que sale del NOMBRE, así el «Café de olla» tiene el
   mismo color en todas las tablets y en todos los turnos sin guardar
   nada (mismo criterio que el color por mesero del salón). */

import type { Product } from '@/types';

/** Palabras que no cuentan para las iniciales: «Tacos de carnitas» → TC. */
const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'con', 'y', 'a', 'al', 'en', 'sin']);

/** Dos iniciales del nombre del plato, sin contar «de», «con», medidas entre paréntesis… */
export function iniciales(nombre: string): string {
  const palabras = nombre
    .replace(/\(.*?\)/g, ' ')
    .split(/[\s\-/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w && !VACIAS.has(w.toLowerCase()));
  if (palabras.length === 0) return nombre.trim().slice(0, 2).toUpperCase();
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/** Tonos para el fondo de un plato sin foto (cálidos, de comida). */
const TONOS = [16, 32, 45, 88, 140, 190, 280, 340];

/** Un color estable por nombre: el mismo plato, el mismo tinte, siempre. */
export function tinteDe(nombre: string): string {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${TONOS[h % TONOS.length]} 62% 52%)`;
}

/**
 * «Quedan N» solo cuando el plato lleva control de existencias y ya bajó
 * de su mínimo. Sin control, o con existencia de sobra, no se dice nada:
 * un número en cada tarjeta sería ruido.
 */
export function quedanPocos(p: Pick<Product, 'track_stock' | 'stock' | 'low_stock_threshold' | 'is_available'>): number | null {
  if (!p.track_stock || p.stock == null || !p.is_available) return null;
  if (p.stock <= 0) return null;   // en cero lo dice «Agotado»
  return p.stock <= (p.low_stock_threshold ?? 0) ? p.stock : null;
}
