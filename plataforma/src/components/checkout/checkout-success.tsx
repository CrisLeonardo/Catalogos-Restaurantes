'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { submitRating } from '@/lib/actions/encuestas';
import type { CheckoutDone } from './checkout-model';

/* La confirmación del pedido, con su encuesta. Vive aparte del formulario
   (REN-04): las estrellas cambian al pasar el dedo y antes eso volvía a
   pintar el checkout entero. */
export default function CheckoutSuccess({
  done, kiosk, encuestasActive, restaurantId, customerName, tp,
}: {
  done: CheckoutDone;
  kiosk: boolean;
  encuestasActive: boolean;
  restaurantId: string;
  customerName: string;
  /** Enlace con el prefijo estable de la mesa. */
  tp: (path: string) => string;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const confirmTitleT = useText('heading', 'confirmationTitle');

  const { orderNumber, trackToken } = done;
  // Kiosko: sin WhatsApp ni seguimiento en el aparato compartido — solo el
  // número de pedido grande y el regreso al menú para el siguiente cliente.
  const waUrl = kiosk ? null : done.waUrl;
  const subtitle = content.confirmation.subtitle || `${config.brandName} ya recibió tu pedido y lo está preparando.`;
  const typeLabel = done.orderType === 'DINE_IN'
    ? `Mesa ${done.tableNumber ?? '?'}`
    : done.orderType === 'PICKUP'
      ? content.checkout.pickup
      : content.checkout.delivery;

  return (
    <main className="anim-fade-up themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div className="anim-pop" style={{ width: 92, height: 92, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--u-text)', color: 'var(--brand-bg)' }}>
          <Icon name="check" size={46} strokeWidth={2.6} />
        </div>
        <div>
          <h2 className="t-display" style={{ ...confirmTitleT.vars, fontSize: 30 * confirmTitleT.size }}>{content.confirmation.title}</h2>
          <p className="t-serif" style={{ fontSize: 'var(--m-fs-lg)', marginTop: 8 }}>{subtitle}</p>
        </div>
        <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--m-sp-3)' }}>
          <Row k={content.confirmation.orderNo} v={orderNumber || '—'} />
          <Row k={content.confirmation.type} v={typeLabel} />
          {done.orderType === 'DINE_IN' && done.coursePreference && (
            <Row k="Servicio" v={done.coursePreference} />
          )}
          <Row k={content.confirmation.eta} v={content.confirmation.etaValue} />
          {done.orderType !== 'DINE_IN' && (
            <Row
              k={content.confirmation.payment}
              /* Para llevar se paga en el local: «Efectivo», no «contra entrega». */
              v={done.payment === 'CARD'
                ? content.checkout.payCard
                : done.orderType === 'PICKUP' ? content.checkout.payCashPickup : content.checkout.payCash}
            />
          )}
        </div>
        {waUrl && (
          <div style={{ width: '100%' }}>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="press"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px 24px', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: 'var(--m-fs-md)', textDecoration: 'none', color: '#fff', background: '#25D366', boxShadow: '0 4px 16px rgba(37,211,102,0.35)' }}>
              <Icon name="whatsapp" size={18} /> Enviar pedido por WhatsApp
            </a>
            <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', marginTop: 7, textAlign: 'center' }}>
              Si WhatsApp no se abrió solo, toca el botón para confirmar con el restaurante.
            </p>
          </div>
        )}
        {trackToken && !kiosk && (
          <PrimaryButton href={tp(`/pedido/${trackToken}`)} full iconRight="arrowRight">
            {content.confirmation.track}
          </PrimaryButton>
        )}
        {kiosk && (
          <p style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', lineHeight: 1.6, margin: 0 }}>
            Guarda tu número de pedido{orderNumber ? ` (${orderNumber})` : ''} — te llamaremos
            al mostrador cuando esté listo.
          </p>
        )}

        {encuestasActive && (
          <RatingBox restaurantId={restaurantId} orderId={done.orderId} customerName={customerName} />
        )}

        {kiosk ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <PrimaryButton href={tp('/')} full iconRight="arrowRight">
              Hacer otro pedido
            </PrimaryButton>
            <p className="t-mute" style={{ fontSize: 'var(--m-fs-xs)', margin: 0 }}>
              La pantalla volverá al menú automáticamente.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Link href={tp('/mis-pedidos')} className="press t-mute" style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 600, textDecoration: 'none', padding: '0 12px', minHeight: 'var(--m-tap)', display: 'inline-flex', alignItems: 'center' }}>
              Mis pedidos
            </Link>
            <Link href={tp('/')} className="press t-mute" style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 600, textDecoration: 'none', padding: '0 12px', minHeight: 'var(--m-tap)', display: 'inline-flex', alignItems: 'center' }}>
              {content.confirmation.again}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

/* ── Encuesta de satisfacción ─────────────────────────────── */

function RatingBox({ restaurantId, orderId, customerName }: { restaurantId: string; orderId: string; customerName: string }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <p style={{ fontSize: 'var(--m-fs-md)', color: 'var(--c-ok)', fontWeight: 600, textAlign: 'center' }}>
        ¡Gracias por tu calificación! ⭐
      </p>
    );
  }

  return (
    <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--m-sp-3)', textAlign: 'left' }}>
      <div style={{ fontSize: 'var(--m-fs-md)', fontWeight: 700, color: 'var(--u-text)', textAlign: 'center' }}>
        ¿Cómo fue tu experiencia?
      </div>
      {/* Estrellas */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((s) => {
          const filled = s <= (hover || value);
          return (
            <button
              key={s}
              type="button"
              className="press"
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setValue(s)}
              /* Medían 32 px: acertar la estrella de al lado le da al
                 restaurante una opinión que el comensal no quiso dar,
                 y una encuesta no tiene deshacer. El dibujo sigue
                 siendo de 28 px; lo que crece es la zona que se toca. */
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 'var(--m-tap)', minHeight: 'var(--m-tap)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
              aria-label={`${s} estrella${s !== 1 ? 's' : ''}`}
            >
              <svg width={28} height={28} viewBox="0 0 24 24"
                fill={filled ? 'var(--c-warn, #fbbf24)' : 'none'}
                stroke={filled ? 'var(--c-warn, #fbbf24)' : 'var(--u-text-3)'}
                strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'all 120ms' }}
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          );
        })}
      </div>
      {/* Comentario (solo si eligió estrella) */}
      {value > 0 && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comentario opcional…"
          rows={2}
          style={{
            background: 'var(--surface-1)', border: '1px solid var(--u-hair)',
            borderRadius: 'var(--m-r-sm)', padding: 'var(--m-sp-3)', color: 'var(--u-text)',
            fontSize: 'max(16px, var(--m-fs-md))', resize: 'none', width: '100%', outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      )}
      {value > 0 && (
        <button
          type="button"
          disabled={pending}
          className="press"
          onClick={() => {
            start(async () => {
              // El resultado sí importa: la acción puede rechazar
              // (pedido ya calificado, módulo apagado, exceso de
              // envíos). Antes se daba por enviada siempre y el
              // comensal veía "gracias" aunque no se guardara nada.
              const res = await submitRating({
                restaurantId,
                rating: value,
                comment: comment || undefined,
                orderId: orderId || undefined,
                customerName: customerName || undefined,
              });
              if (res?.error) { setError(res.error); return; }
              setError(null);
              setSent(true);
            });
          }}
          style={{
            padding: '11px', borderRadius: 'var(--m-r-md)', border: 'none',
            background: 'var(--brand-accent)', color: 'var(--brand-on-accent, #fff)',
            fontWeight: 700, fontSize: 'var(--m-fs-md)', cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? 'Enviando…' : 'Enviar calificación'}
        </button>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger)', margin: 0, textAlign: 'center', lineHeight: 1.45 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)' }}>
      <span>{k}</span>
      <span className="t-mono" style={{ color: 'var(--u-text-2)' }}>{v}</span>
    </div>
  );
}
