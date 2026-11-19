/* ============================================================
   «LO DE SIEMPRE» (auditoría «La carta que vende», CV-33)
   ------------------------------------------------------------
   Quien ya pidió en este aparato ve arriba de la carta «Pedir lo
   de la última vez · Q87» y lo vuelve a armar en un toque. Vive en
   el aparato (localStorage), sin cuenta ni datos personales: solo
   qué platillos y cuántos.

   Al rearmar se usa la carta DE HOY, nunca lo guardado:
   · precio actual (base + lo que hoy suma cada opción);
   · lo que ya no está, está agotado o cambió de opciones se salta
     y se dice cuántos faltaron;
   · las líneas con variantes de combo no se rearman: la variante
     elegida no se puede validar contra la carta sin abrir la ficha.
   ============================================================ */

import { isUnavailable, type AvailabilityFields } from '@/lib/product-availability';
import type { CartItem, CartItemOption, ProductOptionGroup } from '@/types';

const CLAVE = (restaurantId: string) => `lo-de-siempre-${restaurantId}`;
/** Pasado este tiempo, «la última vez» ya no ayuda. */
const VIGENCIA_MS = 90 * 24 * 60 * 60 * 1000;

export interface LineaGuardada {
  productId: string;
  quantity: number;
  options?: Array<Pick<CartItemOption, 'groupId' | 'choiceId'>>;
}

interface Guardado { at: number; lineas: LineaGuardada[] }

export function guardarUltimoPedido(restaurantId: string, items: readonly CartItem[]): void {
  const lineas: LineaGuardada[] = items
    .filter((i) => !i.rewardId && i.quantity > 0)
    .map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      ...(i.options?.length ? { options: i.options.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId, ...(o.variantId ? { variantId: o.variantId } : {}) })) } : {}),
    }));
  if (lineas.length === 0) return;
  try {
    localStorage.setItem(CLAVE(restaurantId), JSON.stringify({ at: Date.now(), lineas } satisfies Guardado));
  } catch { /* modo privado o sin espacio: no pasa nada */ }
}

export function leerUltimoPedido(restaurantId: string, now: number = Date.now()): LineaGuardada[] | null {
  try {
    const raw = localStorage.getItem(CLAVE(restaurantId));
    if (!raw) return null;
    const g = JSON.parse(raw) as Guardado;
    if (!g || !Array.isArray(g.lineas) || typeof g.at !== 'number' || now - g.at > VIGENCIA_MS) return null;
    return g.lineas;
  } catch {
    return null;
  }
}

type ProductoCarta = {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  options?: ProductOptionGroup[] | null;
} & AvailabilityFields;

export interface PedidoRearmado {
  lineas: Array<{ item: Omit<CartItem, 'quantity' | 'lineId'>; quantity: number }>;
  total: number;
  /** Platillos de la última vez que hoy no se pudieron rearmar. */
  faltan: number;
}

export function rearmarPedido(guardadas: readonly LineaGuardada[], productos: readonly ProductoCarta[], now: number = Date.now()): PedidoRearmado {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const lineas: PedidoRearmado['lineas'] = [];
  let faltan = 0;
  for (const g of guardadas) {
    const p = porId.get(g.productId);
    if (!p || isUnavailable(p, now) || !(g.quantity > 0)) { faltan++; continue; }
    const opciones: CartItemOption[] = [];
    let valida = true;
    for (const o of g.options ?? []) {
      if ('variantId' in o && (o as { variantId?: string }).variantId) { valida = false; break; }
      const grupo = (p.options ?? []).find((gr) => gr.id === o.groupId);
      const choice = grupo?.choices?.find((c) => c.id === o.choiceId);
      if (!grupo || !choice) { valida = false; break; }
      opciones.push({ groupId: grupo.id, groupName: grupo.name, choiceId: choice.id, choiceName: choice.name, priceDelta: Number(choice.priceDelta) || 0 });
    }
    if (!valida) { faltan++; continue; }
    const precio = Number(p.price) + opciones.reduce((s, o) => s + o.priceDelta, 0);
    lineas.push({
      item: { productId: p.id, name: p.name, price: precio, image_url: p.image_url ?? null, ...(opciones.length ? { options: opciones } : {}) },
      quantity: g.quantity,
    });
  }
  return { lineas, total: lineas.reduce((s, l) => s + l.item.price * l.quantity, 0), faltan };
}
