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

/** Precalienta el camino al hub HTTPS mientras HAY internet: deja la
    resolución DNS del hostname en caché del sistema (durante un corte total
    el DNS público ya no responde) y dispara el prompt de "acceso a red
    local" de Chrome en un momento tranquilo — no a mitad del corte, cuando
    el comensal está estresado. Solo aplica a URLs https (el http de dev no
    lo necesita). Best-effort absoluto: cualquier fallo se ignora. */
export function warmUpHub(hubUrl: string | null | undefined): void {
  if (!hubUrl || !hubUrl.startsWith('https://')) return;
  try {
    void fetch(`${hubUrl.replace(/\/+$/, '')}/health`, {
      signal: AbortSignal.timeout(4000),
      targetAddressSpace: 'private',
    } as RequestInit).catch(() => {});
  } catch {
    /* no-op */
  }
}

/** Intenta crear el pedido en el hub local. null = no se pudo (el llamador
    debe seguir con su plan B de siempre — cola local). `hubToken` viaja en
    x-hub-token (migración 063); si aún no se conoce (agente recién
    instalado, no ha reportado su token todavía) se manda la petición sin
    header y el hub la rechaza — el llamador cae a su plan B igual. */
export async function tryHubOrder(hubUrl: string, hubToken: string | null, payload: unknown): Promise<CreateOrderResult | null> {
  try {
    const res = await fetch(`${hubUrl.replace(/\/+$/, '')}/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(hubToken ? { 'x-hub-token': hubToken } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Local Network Access (Chrome 138+): declara que el destino es una IP
      // privada para que el navegador muestre el prompt de permiso de red
      // local (sin esto, o si el usuario no lo concede, el fetch falla y se
      // cae a la cola local — ver ARQUITECTURA_OFFLINE.md §8.1). Los
      // navegadores que no conocen la opción la ignoran sin efecto.
      targetAddressSpace: 'private',
    } as RequestInit);
    if (!res.ok) return null;
    const data = (await res.json()) as CreateOrderResult;
    return data.success ? data : null;
  } catch {
    return null;
  }
}
