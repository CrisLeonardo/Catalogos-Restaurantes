/* ============================================================
   FALLBACK AL HUB LOCAL (Fase 2 offline)
   ------------------------------------------------------------
   Cuando la nube no responde, antes de encolar el pedido en el
   dispositivo (ver lib/order-queue.ts), se intenta el hub local del
   restaurante (agente-impresion/ convertido en hub) por la LAN. Si el
   comensal está en el WiFi del restaurante, esto lo resuelve al
   instante (con impresión inmediata); si no, el fetch simplemente
   falla rápido (dirección LAN inalcanzable desde fuera) y el llamador
   sigue con lo que ya hacía.
   ============================================================ */

import type { CreateOrderResult } from '@/lib/actions/orders';

const TIMEOUT_MS = 2500;

/** Intenta crear el pedido en el hub local. null = no se pudo (el llamador
    debe seguir con su plan B de siempre — cola local). */
export async function tryHubOrder(hubUrl: string, payload: unknown): Promise<CreateOrderResult | null> {
  try {
    const res = await fetch(`${hubUrl.replace(/\/+$/, '')}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CreateOrderResult;
    return data.success ? data : null;
  } catch {
    return null;
  }
}
