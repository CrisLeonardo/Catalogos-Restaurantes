'use client';

/* ============================================================
   SEGUIMIENTO DE PEDIDO EN VIVO — /pedido/[token]
   ------------------------------------------------------------
   Timeline del estado del pedido que se actualiza solo: hace
   polling de getPublicOrder cada pocos segundos mientras el
   pedido siga activo y la pestaña esté visible.

   Auditoría 1.12 (M06, X23): Recibido → Aceptado → En preparación
   (platos listos) → Listo → … con la hora real de cada paso, sin
   tiempo estimado fijo. Si sigue «Recibido» 10 minutos, se dice y se
   da el WhatsApp del local. Superficies sólidas del tema.
   ============================================================ */

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Price, PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { getPublicOrder, cancelPublicOrder, type PublicOrder } from '@/lib/actions/orders';
import { useTenantPrefix } from '@/lib/tenant-client';
import type { OrderStatus } from '@/types';
import { waDigits } from '@/lib/reminder';
import { minutosSinAceptar, pasosDelSeguimiento } from '@/lib/pedido/seguimiento';

/* Superficie sólida del tema: el texto del tema mezclado con su fondo, sin
   transparencia ni desenfoque (antes era vidrio). */
const SOLIDA: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--u-text) 6%, var(--brand-bg))',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 18,
};

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false }) : null);

const POLL_MS = 8000;
// SERVED es terminal para el seguimiento del comensal: una vez servida la
// comida en mesa no hay más que mostrarle (cerrar la mesa es cosa del
// mesero, potencialmente horas después), así que dejamos de sondear ahí.
const TERMINAL: OrderStatus[] = ['SERVED', 'DELIVERED', 'CANCEL'];

export default function OrderTracker({
  token,
  restaurantId,
  initialOrder,
  whatsapp,
}: {
  token: string;
  restaurantId: string;
  initialOrder: PublicOrder;
  /** WhatsApp del restaurante, para que un pedido cancelado tenga salida. */
  whatsapp?: string | null;
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

  /* Reloj para el aviso de «aún no lo aceptan»: cada 30 s basta. */
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const dineIn = order.orderType === 'DINE_IN';
  const cancelled = order.status === 'CANCEL';
  const pasos = pasosDelSeguimiento(order, {
    recibido: content.tracking.statusNew,
    preparando: content.tracking.statusPrep,
    listo: content.tracking.statusReady,
    listoRecoger: content.tracking.statusReadyPickup,
    camino: content.tracking.statusTransit,
    servido: content.tracking.statusServed,
    entregado: content.tracking.statusDelivered,
  });
  const ICONO: Record<string, string> = { recibido: 'receipt', aceptado: 'thumbsUp', preparando: 'flame', listo: 'bag', camino: 'truck', final: 'check' };
  const sinAceptar = minutosSinAceptar(order, ahora);
  const wa = waDigits(whatsapp);
  const subtitle = content.tracking.subtitle || 'El estado se actualiza solo, en vivo.';

  return (
    <main className="anim-fade-up themed-type" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        {/* Alto de dedo (--m-tap) como los «volver» del checkout; con solo
            la línea de texto eran 20 px y el pulgar se iba de largo. */}
        <Link href={backHref} className="press t-mute" style={{ fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4, minHeight: 'var(--m-tap)' }}>
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

        {/* Aún no lo aceptan a los 10 minutos: se dice y se da cómo contactar (M06). */}
        {sinAceptar !== null && (
          <div role="status" style={{ ...SOLIDA, padding: '12px 14px', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text)', lineHeight: 1.45 }}>
              <strong>El restaurante aún no lo acepta</strong> (hace {sinAceptar} min).{' '}
              {dineIn ? 'Pregunta al personal de tu mesa' : wa ? 'Si tienes prisa, escríbele:' : 'Si tienes prisa, comunícate con el restaurante.'}
            </p>
            {wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, hice el pedido ${order.orderNumber} hace ${sinAceptar} min y aún aparece como recibido. ¿Me ayudan?`)}`}
                target="_blank" rel="noopener noreferrer" className="press"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 'var(--radius-lg)', fontWeight: 700, textDecoration: 'none', color: '#fff', background: '#25D366' }}
              >
                <Icon name="whatsapp" size={17} /> WhatsApp al restaurante
              </a>
            )}
          </div>
        )}

        {/* Botón cancelar — solo disponible cuando el pedido está en NEW */}
        {order.status === 'NEW' && (
          <div style={{ marginTop: 14 }}>
            {cancelError && (
              <p style={{ fontSize: 12.5, color: 'var(--c-danger)', marginBottom: 8 }}>{cancelError}</p>
            )}
            {showCancelConfirm ? (
              <div style={{ ...SOLIDA, borderRadius: 14, padding: '14px 16px' }}>
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
                      background: 'var(--c-danger-bg)',
                      border: '1px solid var(--c-danger-line)',
                      color: 'var(--c-danger)',
                      opacity: isCancelling ? 0.6 : 1,
                    }}
                  >
                    {isCancelling ? 'Cancelando...' : 'Sí, cancelar'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCancelRequest}
                className="press"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 99,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--c-danger-bg)',
                  border: '1px solid var(--c-danger-line)',
                  color: 'var(--c-danger)',
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
        <div style={{ ...SOLIDA, padding: '22px 20px', textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px', display: 'grid', placeItems: 'center', background: 'var(--c-danger-bg)', color: 'var(--c-danger)' }}>
            <Icon name="x" size={26} strokeWidth={2.4} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--u-text)' }}>{content.tracking.statusCancel}</div>
          {/* Antes «Cancelado» y nada más: ni a quién preguntar ni cómo volver
              a pedir (auditoría 2026-10-02, CAT-08). */}
          <p style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', lineHeight: 1.5, margin: '8px auto 0', maxWidth: 320 }}>
            {waDigits(whatsapp)
              ? 'Si no esperabas esto o tienes dudas, escríbele al restaurante.'
              : 'Si no esperabas esto o tienes dudas, pregúntale al restaurante.'}
          </p>
          {/* «Volver al menú» ya está debajo de la cuenta: aquí solo la vía
              para preguntar, si el restaurante tiene WhatsApp. */}
          {waDigits(whatsapp) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', maxWidth: 320, margin: '16px auto 0' }}>
            {waDigits(whatsapp) && (
              <a
                href={`https://wa.me/${waDigits(whatsapp)}?text=${encodeURIComponent(`Hola, mi pedido ${order.orderNumber} aparece como cancelado. ¿Me pueden ayudar?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press btn-accent"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 'var(--radius-lg)', fontWeight: 600, textDecoration: 'none' }}
              >
                <Icon name="whatsapp" size={17} /> Escribir por WhatsApp
              </a>
            )}
          </div>
          )}
        </div>
      ) : (
        /* Timeline */
        <ol style={{ ...SOLIDA, listStyle: 'none', margin: '0 0 18px', padding: '20px 18px', display: 'flex', flexDirection: 'column' }} aria-label="Estado del pedido">
          {pasos.map((paso, i) => {
            const done = paso.estado === 'hecho';
            const active = paso.estado === 'activo';
            const last = i === pasos.length - 1;
            const color = done || active ? 'var(--u-text)' : 'var(--u-text-4)';
            const hora = hhmm(paso.hora);
            return (
              <li key={paso.clave} aria-current={active ? 'step' : undefined} style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0,
                      background: active ? 'var(--u-text)' : done ? 'var(--surface-strong)' : 'var(--brand-bg)',
                      color: active ? 'var(--brand-bg)' : color,
                      border: `1px solid ${active ? 'transparent' : 'var(--u-hair)'}`,
                      animation: active && config.animations ? 'pulse-ring 2.2s infinite' : undefined,
                      transition: 'all 300ms var(--ease-entry)',
                    }}
                  >
                    <Icon name={done ? 'check' : ICONO[paso.clave] ?? 'check'} size={17} strokeWidth={done ? 2.8 : 2} />
                  </div>
                  {!last && (
                    <div style={{ width: 2, flex: 1, minHeight: 22, margin: '4px 0', borderRadius: 2, background: done ? 'var(--u-text-3)' : 'var(--u-hair)', transition: 'background 300ms' }} />
                  )}
                </div>
                <div style={{ paddingTop: 8, paddingBottom: last ? 0 : 14, flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: active ? 700 : 600, fontSize: 14.5, color: active ? 'var(--u-text)' : done ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>
                      {paso.label}
                    </span>
                    {hora && <span className="t-mono" style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>{hora}</span>}
                  </div>
                  {paso.detalle && (
                    <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', marginTop: 2 }}>{paso.detalle}</div>
                  )}
                  {active && paso.clave === 'preparando' && order.platos && order.platos.total > 0 && (
                    <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--u-hair)', marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((order.platos.listos / order.platos.total) * 100)}%`, background: 'var(--brand-accent)' }} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Resumen del pedido */}
      <div style={{ ...SOLIDA, padding: '16px 18px', marginBottom: 18 }}>
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
                <span style={{ fontSize: 13, color: 'var(--c-ok)' }}>Descuento</span>
                <span style={{ fontSize: 13.5, color: 'var(--c-ok)', fontWeight: 600 }}>−{formatPrice(order.discount, config)}</span>
              </div>
            )}
            {order.loyaltyDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--c-ok)' }}>⭐ {order.loyaltyPoints} puntos canjeados</span>
                <span style={{ fontSize: 13.5, color: 'var(--c-ok)', fontWeight: 600 }}>−{formatPrice(order.loyaltyDiscount, config)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{content.cart.total}</span>
              <Price amount={order.total} size={20} />
            </div>
          </div>
        </div>
      </div>

      <PrimaryButton href={backHref} full>{content.tracking.back}</PrimaryButton>
    </main>
  );
}
