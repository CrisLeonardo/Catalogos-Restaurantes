'use client';

/* ============================================================
   SEGUIMIENTO DE PEDIDO EN VIVO — /pedido/[token]
   ------------------------------------------------------------
   Timeline del estado del pedido que se actualiza solo: hace
   polling de getPublicOrder cada pocos segundos mientras el
   pedido siga activo y la pestaña esté visible. El comensal ve
   "En preparación → Listo → En camino → Entregado" sin recargar.
   ============================================================ */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { getPublicOrder, cancelPublicOrder, type PublicOrder } from '@/lib/actions/orders';
import { useTenantPrefix } from '@/lib/tenant-client';
import type { OrderStatus } from '@/types';

const POLL_MS = 8000;
// SERVED es terminal para el seguimiento del comensal: una vez servida la
// comida en mesa no hay más que mostrarle (cerrar la mesa es cosa del
// mesero, potencialmente horas después), así que dejamos de sondear ahí.
const TERMINAL: OrderStatus[] = ['SERVED', 'DELIVERED', 'CANCEL'];

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
  { status: 'SERVED',    icon: 'check',   label: (c) => c.tracking.statusServed },
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
  const backHref = useTenantPrefix('/');
  const trackTitleT = useText('heading', 'trackingTitle');
  const [order, setOrder] = useState<PublicOrder>(initialOrder);
  const orderRef = useRef(initialOrder);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, startCancel] = useTransition();

  /* Permiso de notificaciones del sistema (avisos de cambio de estado). */
  const [notifPerm, setNotifPerm] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('unsupported');
  useEffect(() => {
    if (typeof Notification !== 'undefined') {

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
              SERVED: content.tracking.statusServed,
              DELIVERED: content.tracking.statusDelivered,
              CANCEL: content.tracking.statusCancel,
            };
            notifyStatusChange(`${fresh.orderNumber} · ${labels[fresh.status]}`);
          }
          setOrder(fresh);
          // Pedido terminado (entregado/cancelado): deja de sondear.
          if (TERMINAL.includes(fresh.status)) {
            stopped = true;
            clearInterval(interval);
          }
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

  function handleCancelRequest() {
    setCancelError(null);
    setShowCancelConfirm(true);
  }

  function handleCancelConfirm() {
    startCancel(async () => {
      const result = await cancelPublicOrder(token, restaurantId);
      if (result.error) {
        setCancelError(result.error);
        setShowCancelConfirm(false);
      } else {
        setOrder((prev) => ({ ...prev, status: 'CANCEL' as OrderStatus }));
        setShowCancelConfirm(false);
      }
    });
  }

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
  const dineIn = order.orderType === 'DINE_IN';
  // DINE_IN y PICKUP no tienen reparto: el paso "En camino" no aplica
  // (al comensal sentado en su mesa no se le muestra TRANSIT).
  const noTransit = pickup || dineIn;
  // DINE_IN termina en "servido" (SERVED), no en "entregado" (DELIVERED) —
  // ese último paso es el cierre de mesa del mesero, no algo que le importe
  // al comensal. Los demás tipos nunca alcanzan SERVED, así que se oculta.
  const steps = STEPS.filter((s) =>
    !(noTransit && s.status === 'TRANSIT') &&
    !(dineIn && s.status === 'DELIVERED') &&
    !(!dineIn && s.status === 'SERVED'));
  const cancelled = order.status === 'CANCEL';
  const activeIdx = cancelled ? -1 : steps.findIndex((s) => s.status === order.status);
  const subtitle = content.tracking.subtitle || 'El estado se actualiza solo, en vivo.';

  return (
    <main className="anim-fade-up themed-type" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href={backHref} className="press t-mute" style={{ fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="chevronLeft" size={16} /> {content.tracking.back}
        </Link>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="t-display" style={{ ...trackTitleT.vars, fontSize: 28 * trackTitleT.size }}>{content.tracking.title}</h1>
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

        {/* Botón cancelar — solo disponible cuando el pedido está en NEW */}
        {order.status === 'NEW' && (
          <div style={{ marginTop: 14 }}>
            {cancelError && (
              <p style={{ fontSize: 12.5, color: '#f87171', marginBottom: 8 }}>{cancelError}</p>
            )}
            {showCancelConfirm ? (
              <Glass variant="quiet" style={{ borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)', marginBottom: 12 }}>
                  ¿Seguro que quieres cancelar tu pedido?
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginBottom: 14 }}>
                  Esta acción no se puede deshacer. Si ya fue confirmado por el restaurante, no será posible cancelarlo.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={isCancelling}
                    className="press"
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 12,
                      fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--u-hair)',
                      color: 'var(--u-text-2)',
                    }}
                  >
                    No, mantener pedido
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelConfirm}
                    disabled={isCancelling}
                    className="press"
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 12,
                      fontWeight: 700, fontSize: 13,
                      cursor: isCancelling ? 'not-allowed' : 'pointer',
                      background: 'rgba(239,68,68,0.18)',
                      border: '1px solid rgba(239,68,68,0.40)',
                      color: '#f87171',
                      opacity: isCancelling ? 0.6 : 1,
                    }}
                  >
                    {isCancelling ? 'Cancelando...' : 'Sí, cancelar'}
                  </button>
                </div>
              </Glass>
            ) : (
              <button
                type="button"
                onClick={handleCancelRequest}
                className="press"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 99,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                }}
              >
                <Icon name="x" size={13} strokeWidth={2.5} /> Cancelar pedido
              </button>
            )}
          </div>
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
                        background: active ? 'var(--u-text)' : done ? 'var(--surface-strong)' : 'var(--surface-1)',
                        color: active ? 'var(--brand-bg)' : color,
                        border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
                        boxShadow: active && config.animations ? '0 0 0 0 rgba(var(--pulse-ink, 255,255,255), 0.4)' : undefined,
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
                    {item.options.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(' · ')}
                  </span>
                )}
              </span>
              <Price amount={item.subtotal} size={13.5} muted />
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(order.deliveryFee > 0 || order.discount > 0 || order.loyaltyDiscount > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.subtotal}</span>
                <Price amount={order.subtotal} size={13.5} muted />
              </div>
            )}
            {order.deliveryFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.shipping}</span>
                <Price amount={order.deliveryFee} size={13.5} muted />
              </div>
            )}
            {order.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: '#4ade80' }}>Descuento</span>
                <span style={{ fontSize: 13.5, color: '#4ade80', fontWeight: 600 }}>−{formatPrice(order.discount, config)}</span>
              </div>
            )}
            {order.loyaltyDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: '#4ade80' }}>⭐ {order.loyaltyPoints} puntos canjeados</span>
                <span style={{ fontSize: 13.5, color: '#4ade80', fontWeight: 600 }}>−{formatPrice(order.loyaltyDiscount, config)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{content.cart.total}</span>
              <Price amount={order.total} size={20} />
            </div>
          </div>
        </div>
      </Glass>

      <PrimaryButton href={backHref} full>{content.tracking.back}</PrimaryButton>
    </main>
  );
}
