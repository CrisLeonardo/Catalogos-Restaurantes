'use client';

/* ============================================================
   SEGUIMIENTO DE PEDIDO EN VIVO — /pedido/[token]
   ------------------------------------------------------------
   Timeline del estado del pedido que se actualiza solo: hace
   polling de getPublicOrder cada pocos segundos mientras el
   pedido siga activo y la pestaña esté visible. El comensal ve
   "En preparación → Listo → En camino → Entregado" sin recargar.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import { getPublicOrder, type PublicOrder } from '@/lib/actions/orders';
import type { OrderStatus } from '@/types';

const POLL_MS = 8000;
const TERMINAL: OrderStatus[] = ['DELIVERED', 'CANCEL'];

interface Step {
  status: OrderStatus;
  icon: string;
  label: (c: ReturnType<typeof useThemeContent>, pickup: boolean) => string;
}

const STEPS: Step[] = [
  { status: 'NEW',       icon: 'receipt', label: (c) => c.tracking.statusNew },
  { status: 'PREP',      icon: 'flame',   label: (c) => c.tracking.statusPrep },
  { status: 'READY',     icon: 'bag',     label: (c, pickup) => (pickup ? c.tracking.statusReadyPickup : c.tracking.statusReady) },
  { status: 'TRANSIT',   icon: 'truck',   label: (c) => c.tracking.statusTransit },
  { status: 'DELIVERED', icon: 'check',   label: (c) => c.tracking.statusDelivered },
];

export default function OrderTracker({
  token,
  restaurantId,
  initialOrder,
}: {
  token: string;
  restaurantId: string;
  initialOrder: PublicOrder;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const [order, setOrder] = useState<PublicOrder>(initialOrder);
  // El intervalo de polling necesita leer el estado MÁS RECIENTE sin
  // re-suscribirse en cada cambio: ref espejo actualizada por efecto.
  const orderRef = useRef(initialOrder);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  /* Permiso de notificaciones del sistema (avisos de cambio de estado). */
  const [notifPerm, setNotifPerm] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('unsupported');
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifPerm(Notification.permission);
    }
  }, []);

  /* Aviso al comensal cuando el estado avanza: vibración + notificación. */
  const notifyStatusChange = (label: string) => {
    try { navigator.vibrate?.([90, 60, 90]); } catch {}
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Tu pedido avanzó', { body: label, tag: token });
      }
    } catch {}
  };

  /* Polling mientras el pedido siga activo. Sin document.hidden como freno:
     si la pestaña queda en segundo plano, igual queremos avisar del cambio. */
  useEffect(() => {
    if (TERMINAL.includes(initialOrder.status)) return;
    let stopped = false;

    const tick = async () => {
      if (stopped || TERMINAL.includes(orderRef.current.status)) return;
      try {
        const fresh = await getPublicOrder(token, restaurantId);
        if (fresh && !stopped) {
          if (fresh.status !== orderRef.current.status) {
            const labels: Record<OrderStatus, string> = {
              NEW: content.tracking.statusNew,
              PREP: content.tracking.statusPrep,
              READY: fresh.orderType === 'PICKUP' ? content.tracking.statusReadyPickup : content.tracking.statusReady,
              TRANSIT: content.tracking.statusTransit,
              DELIVERED: content.tracking.statusDelivered,
              CANCEL: content.tracking.statusCancel,
            };
            notifyStatusChange(`${fresh.orderNumber} · ${labels[fresh.status]}`);
          }
          setOrder(fresh);
        }
      } catch {}
    };

    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, restaurantId, initialOrder.status]);

  async function enableNotifications() {
    try {
      const res = await Notification.requestPermission();
      setNotifPerm(res);
      if (res === 'granted') {
        new Notification('Avisos activados', { body: 'Te avisamos cuando tu pedido avance.' });
      }
    } catch {}
  }

  const pickup = order.orderType === 'PICKUP';
  const steps = STEPS.filter((s) => !(pickup && s.status === 'TRANSIT'));
  const cancelled = order.status === 'CANCEL';
  const activeIdx = cancelled ? -1 : steps.findIndex((s) => s.status === order.status);
  const subtitle = content.tracking.subtitle || 'El estado se actualiza solo, en vivo.';

  return (
    <main className="anim-fade-up" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/" className="press t-mute" style={{ fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="chevronLeft" size={16} /> {content.tracking.back}
        </Link>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="t-display" style={{ fontSize: 28 }}>{content.tracking.title}</h1>
          <span className="t-mono" style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{order.orderNumber}</span>
        </div>
        {!cancelled && !TERMINAL.includes(order.status) && (
          <p className="t-serif" style={{ fontStyle: 'italic', fontSize: 15.5, color: 'var(--u-text-2)', marginTop: 6 }}>{subtitle}</p>
        )}
        {!cancelled && !TERMINAL.includes(order.status) && notifPerm === 'default' && (
          <button
            type="button"
            onClick={enableNotifications}
            className="press glass-quiet"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12,
              padding: '9px 15px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)',
            }}
          >
            <Icon name="bell" size={14} /> Avisarme cuando avance
          </button>
        )}
      </div>

      {/* Cancelado */}
      {cancelled ? (
        <Glass style={{ padding: '22px 20px', textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px', display: 'grid', placeItems: 'center', background: 'rgba(239,68,68,0.14)', color: '#f87171' }}>
            <Icon name="x" size={26} strokeWidth={2.4} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--u-text)' }}>{content.tracking.statusCancel}</div>
        </Glass>
      ) : (
        /* Timeline */
        <Glass style={{ padding: '20px 18px', marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((step, i) => {
              const done = i < activeIdx;
              const active = i === activeIdx;
              const last = i === steps.length - 1;
              const color = done || active ? 'var(--u-text)' : 'var(--u-text-4)';
              return (
                <div key={step.status} style={{ display: 'flex', gap: 14 }}>
                  {/* Columna del punto + línea */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      style={{
                        width: 38, height: 38, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0,
                        background: active ? 'var(--u-text)' : done ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                        color: active ? 'var(--brand-bg)' : color,
                        border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
                        boxShadow: active && config.animations ? '0 0 0 0 rgba(255,255,255,0.4)' : undefined,
                        animation: active && config.animations ? 'pulse-ring 2.2s infinite' : undefined,
                        transition: 'all 300ms var(--ease-entry)',
                      }}
                    >
                      <Icon name={done ? 'check' : step.icon} size={17} strokeWidth={done ? 2.8 : 2} />
                    </div>
                    {!last && (
                      <div style={{ width: 2, flex: 1, minHeight: 22, margin: '4px 0', borderRadius: 2, background: done ? 'var(--u-text-3)' : 'var(--u-hair)', transition: 'background 300ms' }} />
                    )}
                  </div>
                  {/* Etiqueta */}
                  <div style={{ paddingTop: 8, paddingBottom: last ? 0 : 14 }}>
                    <div style={{ fontWeight: active ? 700 : 600, fontSize: 14.5, color: active ? 'var(--u-text)' : done ? 'var(--u-text-2)' : 'var(--u-text-4)', transition: 'color 300ms' }}>
                      {step.label(content, pickup)}
                    </div>
                    {active && step.status === 'NEW' && (
                      <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                        {content.confirmation.eta}: {content.confirmation.etaValue}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Glass>
      )}

      {/* Resumen del pedido */}
      <Glass variant="quiet" style={{ borderRadius: 18, padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0 }}>
                {item.quantity}× {item.name}
                {item.options && item.options.length > 0 && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                    {item.options.map((o) => o.choice).join(' · ')}
                  </span>
                )}
              </span>
              <Price amount={item.subtotal} size={13.5} muted />
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {order.deliveryFee > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.subtotal}</span>
                  <Price amount={order.subtotal} size={13.5} muted />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.shipping}</span>
                  <Price amount={order.deliveryFee} size={13.5} muted />
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{content.cart.total}</span>
              <Price amount={order.total} size={20} />
            </div>
          </div>
        </div>
      </Glass>

      <PrimaryButton href="/" full>{content.tracking.back}</PrimaryButton>
    </main>
  );
}
