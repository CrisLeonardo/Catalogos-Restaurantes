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
import { getPublicOrder } from '@/lib/actions/orders';
import { getLocalOrders, type LocalOrderRef } from '@/lib/customer-local';
import type { OrderStatus } from '@/types';

const ACTIVE: OrderStatus[] = ['NEW', 'PREP', 'READY', 'TRANSIT'];
/** Cuántos pedidos recientes consultan su estado real al servidor. */
const STATUS_LOOKUPS = 8;

export default function MyOrders({ restaurantId, onBack }: { restaurantId: string; onBack?: () => void }) {
  const content = useThemeContent();
  const [orders, setOrders] = useState<LocalOrderRef[]>([]);
  const [statuses, setStatuses] = useState<Record<string, OrderStatus>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const list = getLocalOrders(restaurantId);

    setOrders(list);
    setLoaded(true);

    let cancelled = false;
    (async () => {
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

  const statusLabel = (s: OrderStatus | undefined) => {
    switch (s) {
      case 'NEW':       return content.tracking.statusNew;
      case 'PREP':      return content.tracking.statusPrep;
      case 'READY':     return content.tracking.statusReady;
      case 'TRANSIT':   return content.tracking.statusTransit;
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
          const status = statuses[o.token];
          const isActive = status !== undefined && ACTIVE.includes(status);
          const date = new Date(o.createdAt);
          let when = '';
          try {
            when = date.toLocaleDateString('es', { day: 'numeric', month: 'short' }) +
              ' · ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
          } catch {}
          return (
            <Link key={o.token} href={`/pedido/${o.token}`} className="press" style={{ textDecoration: 'none' }}>
              <Glass
                style={{
                  padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 13,
                  border: isActive ? '1px solid var(--u-hair-2)' : undefined,
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0,
                    background: isActive ? 'var(--u-text)' : 'var(--surface-2)',
                    color: isActive ? 'var(--brand-bg)' : 'var(--u-text-3)',
                  }}
                >
                  <Icon name={isActive ? 'flame' : status === 'CANCEL' ? 'x' : 'check'} size={19} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="t-mono" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>{o.orderNumber}</span>
                    {status && (
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
                  <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)' }} />
                </div>
              </Glass>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
