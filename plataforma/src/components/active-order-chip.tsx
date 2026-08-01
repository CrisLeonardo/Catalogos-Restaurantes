'use client';

/* ============================================================
   CHIP DE PEDIDO ACTIVO — flotante en el menú
   ------------------------------------------------------------
   Si el comensal tiene un pedido en curso (aunque haya cerrado
   la app y vuelto a entrar), muestra una pastilla fija abajo
   con el estado en vivo que lleva al seguimiento. Desaparece
   sola cuando el pedido se entrega o cancela.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useCart } from '@/lib/cart-context';
import { useThemeContent } from '@/lib/theme/context';
import { getPublicOrder, getMyOrderRefs, getOrderRefByClientId } from '@/lib/actions/orders';
import { getLocalOrders, addLocalOrder } from '@/lib/customer-local';
import { useStableLinkPrefix } from '@/lib/tenant-client';
import type { OrderStatus } from '@/types';

const ACTIVE: OrderStatus[] = ['NEW', 'PREP', 'READY', 'TRANSIT', 'SERVED'];
const POLL_MS = 20000;
/** Solo miramos pedidos de las últimas 12 h: lo demás ya no es "en curso". */
const FRESH_MS = 12 * 60 * 60 * 1000;

export default function ActiveOrderChip({ restaurantId }: { restaurantId: string }) {
  const content = useThemeContent();
  const { count } = useCart();
  const stablePrefix = useStableLinkPrefix();
  const [active, setActive] = useState<{ token: string; orderNumber: string; status: OrderStatus } | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let onVisible: (() => void) | undefined;

    (async () => {
      // Combina lo local (este dispositivo) con lo de la cuenta (si hay
      // sesión con Google) — así el pedido en curso se ve aunque el comensal
      // haya iniciado sesión desde otro dispositivo.
      const local = getLocalOrders(restaurantId);
      let all = local;
      try {
        const remote = await getMyOrderRefs(restaurantId);
        if (remote.length) {
          const seen = new Set(local.map((o) => o.token));
          all = [...local, ...remote.filter((o) => !seen.has(o.token))];
        }
      } catch { /* sin sesión o sin cuenta enlazada: se queda con lo local */ }
      if (stopped.current) return;

      const candidates = all.filter(
        (o) => Date.now() - new Date(o.createdAt).getTime() < FRESH_MS,
      ).slice(0, 3);
      if (candidates.length === 0) return;

      async function check(force = false) {
        if (stopped.current || (document.hidden && !force)) return;
        for (const c of candidates) {
          try {
            // Pedido aceptado por el hub local sin conexión: todavía sin
            // token público (ver checkout-form.tsx / finishSuccess). Se
            // resuelve por clientId; si el agente aún no sincronizó, se
            // salta este candidato y se reintenta en el próximo ciclo.
            if (!c.token && c.clientId) {
              const resolved = await getOrderRefByClientId(restaurantId, c.clientId);
              if (!resolved) continue;
              c.token = resolved.token;
              addLocalOrder(restaurantId, {
                token: resolved.token,
                orderNumber: resolved.orderNumber || c.orderNumber,
                createdAt: c.createdAt,
                total: resolved.total || c.total,
                // clientId viaja para que addLocalOrder deduplique y
                // reemplace el registro "pendiente" que dejó el hub.
                clientId: c.clientId,
              });
            }
            const order = await getPublicOrder(c.token, restaurantId);
            if (order && ACTIVE.includes(order.status)) {
              if (!stopped.current) {
                setActive({ token: c.token, orderNumber: order.orderNumber, status: order.status });
              }
              return;
            }
          } catch {}
        }
        if (!stopped.current) setActive(null);
      }

      check(true);
      interval = setInterval(() => check(), POLL_MS);
      onVisible = () => { if (!document.hidden) check(); };
      document.addEventListener('visibilitychange', onVisible);
    })();

    return () => {
      stopped.current = true;
      if (interval) clearInterval(interval);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [restaurantId]);

  if (!active) return null;

  const label =
    active.status === 'NEW'     ? content.tracking.statusNew
    : active.status === 'PREP'  ? content.tracking.statusPrep
    : active.status === 'READY' ? content.tracking.statusReady
    : active.status === 'SERVED' ? content.tracking.statusServed
    : content.tracking.statusTransit;

  return (
    <Link
      href={stablePrefix ? `${stablePrefix}/pedido/${active.token}` : `/pedido/${active.token}`}
      className="glass-solid press anim-slide-up"
      style={{
        // Si la barra del carrito está visible, el chip flota encima de ella.
        // Anclado a la izquierda (no centrado) para no solapar el FAB
        // "Llamar al mesero" que vive en el lado derecho.
        position: 'fixed', bottom: `calc(${count > 0 ? 156 : 84}px + env(safe-area-inset-bottom, 0px))`,
        left: 16,
        zIndex: 70, display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 18px', borderRadius: 99, textDecoration: 'none',
        maxWidth: 'calc(100vw - 210px)', whiteSpace: 'nowrap',
        transition: 'bottom 200ms var(--ease-out)',
      }}
    >
      <span
        style={{
          width: 9, height: 9, borderRadius: 99, flexShrink: 0,
          background: 'var(--c-ok)', boxShadow: '0 0 8px #4ade80',
          animation: 'pulse-ring 2.2s infinite',
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {active.orderNumber} · {label}
      </span>
      <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
    </Link>
  );
}
