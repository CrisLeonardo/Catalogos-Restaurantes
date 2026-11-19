/* ============================================================
   «LO MÁS PEDIDO» (auditoría «La carta que vende», CV-31)
   ------------------------------------------------------------
   Prueba social honesta: lo que de verdad se vendió esta semana.
   Reglas, para que nunca mienta ni se vea pobre:
   · solo platillos que siguen en la carta y se pueden pedir;
   · la tira aparece con al menos 2 platillos vendidos;
   · el número («41 vendidos esta semana») solo desde 5 unidades:
     «2 vendidos» resta en vez de sumar;
   · como mucho 4, del más vendido al menos.
   ============================================================ */

import { isUnavailable, type AvailabilityFields } from '@/lib/product-availability';
import type { MasPedido } from '@/lib/db/menu';

export const MAS_PEDIDOS_MAX = 4;
export const MAS_PEDIDOS_MIN_TIRA = 2;
export const MAS_PEDIDOS_MIN_NUMERO = 5;

export interface DestacadoVentas<P> {
  producto: P;
  puesto: number;
  /** Unidades a decir, o null si son pocas para decirlo. */
  vendidos: number | null;
}

export function elegirMasPedidos<P extends { id: string } & AvailabilityFields>(
  ventas: readonly MasPedido[],
  productos: readonly P[],
  now: number = Date.now(),
): DestacadoVentas<P>[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const out: DestacadoVentas<P>[] = [];
  for (const v of ventas) {
    if (out.length >= MAS_PEDIDOS_MAX) break;
    const p = porId.get(v.id);
    if (!p || v.unidades <= 0 || isUnavailable(p, now)) continue;
    out.push({ producto: p, puesto: out.length + 1, vendidos: v.unidades >= MAS_PEDIDOS_MIN_NUMERO ? v.unidades : null });
  }
  return out.length >= MAS_PEDIDOS_MIN_TIRA ? out : [];
}
