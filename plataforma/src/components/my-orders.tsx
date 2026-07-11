'use client';

/* ============================================================
   MIS PEDIDOS — historial del comensal en este dispositivo
   ------------------------------------------------------------
   Lee los pedidos guardados en localStorage (se agregan solos al
   confirmar un pedido) y consulta el estado real de los más
   recientes. Así, aunque el cliente cierre la app, al volver
   encuentra su pedido y cómo va el proceso.
   ============================================================ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, PrimaryButton } from '@/components/menu/ui';
import { useThemeContent } from '@/lib/theme/context';
import { getPublicOrder, getMyOrderRefs, getOrderRefByClientId } from '@/lib/actions/orders';
import { getLocalOrders, addLocalOrder, type LocalOrderRef } from '@/lib/customer-local';
import type { OrderStatus } from '@/types';

const ACTIVE: OrderStatus[] = ['NEW', 'PREP', 'READY', 'TRANSIT', 'SERVED'];
/** Cuántos pedidos recientes consultan su estado real al servidor. */
const STATUS_LOOKUPS = 8;
/** Cada cuánto reintenta resolver el token real de un pedido de hub aún
    pendiente de sincronizar (ver hub-fallback.ts / getOrderRefByClientId). */
const PENDING_POLL_MS = 8_000;

export default function MyOrders({ restaurantId, onBack }: { restaurantId: string; onBack?: () => void }) {
  const content = useThemeContent();
  const [orders, setOrders] = useState<LocalOrderRef[]>([]);
  const [statuses, setStatuses] = useState<Record<string, OrderStatus>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const local = getLocalOrders(restaurantId);

    setOrders(local);
    setLoaded(true);

    let cancelled = false;
    (async () => {
      // Combina lo local (este dispositivo) con lo de la cuenta (si hay
      // sesión con Google), sin duplicar por token — así "Mis pedidos" sigue
      // al comensal a cualquier dispositivo donde inicie sesión.
      let list = local;
      try {
        const remote = await getMyOrderRefs(restaurantId);
        if (remote.length) {
          const seen = new Set(local.map((o) => o.token));
          list = [...local, ...remote.filter((o) => !seen.has(o.token))]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          if (!cancelled) setOrders(list);
        }
      } catch { /* sin sesión o sin cuenta enlazada: se queda con lo local */ }

      const recent = list.slice(0, STATUS_LOOKUPS);
      const results = await Promise.all(
        recent.map(async (o) => {
          try {
            const order = await getPublicOrder(o.token, restaurantId);
            return [o.token, order?.status] as const;
          } catch {
            return [o.token, undefined] as const;
          }
        }),
      );
      if (cancelled) return;
      const map: Record<string, OrderStatus> = {};
      for (const [token, status] of results) {
        if (status) map[token] = status;
      }
      setStatuses(map);
    })();

    return () => { cancelled = true; };
  }, [restaurantId]);

  // Resuelve en segundo plano los pedidos aceptados por el hub local sin
  // conexión (llegan con token vacío + clientId — ver checkout-form.tsx /
  // finishSuccess): consulta getOrderRefByClientId hasta que el agente los
  // sincronice con Supabase, y entonces les asigna su token real.
  useEffect(() => {
    const pending = orders.filter((o) => !o.token && o.clientId);
    if (pending.length === 0) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      for (const o of pending) {
        if (!o.clientId) continue;
        try {
          const resolved = await getOrderRefByClientId(restaurantId, o.clientId);
          if (!resolved || cancelled) continue;
          const updated: LocalOrderRef = {
            token: resolved.token,
            orderNumber: resolved.orderNumber || o.orderNumber,
            createdAt: o.createdAt,
            total: resolved.total || o.total,
            // clientId viaja para que addLocalOrder deduplique y reemplace el
            // registro "pendiente" — no hace falta conservarlo después.
            clientId: o.clientId,
          };
          addLocalOrder(restaurantId, updated);
          setOrders((prev) => [updated, ...prev.filter((p) => p.clientId !== o.clientId && p.token !== updated.token)]);
          getPublicOrder(resolved.token, restaurantId)
            .then((order) => { if (order && !cancelled) setStatuses((prev) => ({ ...prev, [resolved.token]: order.status })); })
            .catch(() => {});
        } catch { /* sigue pendiente: se reintenta en el próximo ciclo */ }
      }
    }, PENDING_POLL_MS);

    return () => { cancelled = true; clearInterval(timer); };
  }, [orders, restaurantId]);

  const statusLabel = (s: OrderStatus | undefined) => {
    switch (s) {
      case 'NEW':       return content.tracking.statusNew;
      case 'PREP':      return content.tracking.statusPrep;
      case 'READY':     return content.tracking.statusReady;
      case 'TRANSIT':   return content.tracking.statusTransit;
      case 'SERVED':    return content.tracking.statusServed;
      case 'DELIVERED': return content.tracking.statusDelivered;
      case 'CANCEL':    return content.tracking.statusCancel;
      default:          return '';
    }
  };

  return (
    <main className="anim-fade-up themed-type" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: `calc(16px + env(safe-area-inset-top, 0px)) 16px ${onBack ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : '80px'}` }}>
      {/* Header uniforme con Fidelidad y Cuenta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {onBack ? (
          <button onClick={onBack} className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 13, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer', flexShrink: 0 }} aria-label="Volver al menú">
            <Icon name="chevronLeft" size={20} />
          </button>
        ) : (
          <Link href="/" className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 13, display: 'grid', placeItems: 'center', color: 'var(--u-text)', textDecoration: 'none', flexShrink: 0 }} aria-label="Volver al menú">
            <Icon name="chevronLeft" size={20} />
          </Link>
        )}
        <div>
          <div className="t-kicker" style={{ fontSize: 11 }}>Seguimiento</div>
          <h1 className="t-display" style={{ fontSize: 26, lineHeight: 1 }}>Mis pedidos</h1>
        </div>
      </div>

      {loaded && orders.length === 0 && (
        <Glass style={{ padding: '32px 24px', textAlign: 'center' }}>
          <Icon name="receipt" size={40} strokeWidth={1.3} style={{ color: 'var(--u-text-4)', margin: '0 auto 14px' }} />
          <h2 className="t-display" style={{ fontSize: 'var(--fs-h2)', marginBottom: 8 }}>Aún no tienes pedidos</h2>
          <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginBottom: 18 }}>
            Cuando hagas un pedido, aquí lo encontrarás con su seguimiento en vivo.
          </p>
          <PrimaryButton href="/">{content.cart.emptyCta}</PrimaryButton>
        </Glass>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orders.map((o) => {
          const pending = !o.token;
          const status = statuses[o.token];
          const isActive = status !== undefined && ACTIVE.includes(status);
          const date = new Date(o.createdAt);
          let when = '';
          try {
            when = date.toLocaleDateString('es', { day: 'numeric', month: 'short' }) +
              ' · ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
          } catch {}
          const card = (
            <Glass
              style={{
                padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 13,
                border: isActive ? '1px solid var(--u-hair-2)' : undefined,
                opacity: pending ? 0.75 : 1,
              }}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0,
                  background: isActive ? 'var(--u-text)' : 'var(--surface-2)',
                  color: isActive ? 'var(--brand-bg)' : 'var(--u-text-3)',
                }}
              >
                <Icon name={pending ? 'clock' : isActive ? 'flame' : status === 'CANCEL' ? 'x' : 'check'} size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="t-mono" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>{o.orderNumber}</span>
                  {pending ? (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--u-text-3)' }}>
                      Sincronizando…
                    </span>
                  ) : status && (
                    <span
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: isActive ? 'rgba(74,222,128,0.14)' : 'var(--surface-2)',
                        color: isActive ? '#4ade80' : status === 'CANCEL' ? '#f87171' : 'var(--u-text-3)',
                      }}
                    >
                      {statusLabel(status)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3 }}>{when}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {o.total > 0 && <Price amount={o.total} size={14} muted />}
                {!pending && <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)' }} />}
              </div>
            </Glass>
          );
          return pending ? (
            <div key={o.clientId || o.token}>{card}</div>
          ) : (
            <Link key={o.clientId || o.token} href={`/pedido/${o.token}`} className="press" style={{ textDecoration: 'none' }}>
              {card}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
