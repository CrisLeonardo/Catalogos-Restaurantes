'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { submitRating } from '@/lib/actions/encuestas';
import { getFinalDelPedido, type FinalDelPedido } from '@/lib/actions/pedido-final';
import { celebrarEnvio } from '@/lib/sonido-enviado';
import type { CheckoutDone } from './checkout-model';

/* La confirmación del pedido, con su encuesta. Vive aparte del formulario
   (REN-04): las estrellas cambian al pasar el dedo y antes eso volvía a
   pintar el checkout entero.

   Es el pico del comensal (PLAN_MOMENTOS_PICO M1 y M2): el pedido sale
   volando hacia la cocina, la palomita se dibuja sola en verde, suena un
   «pop» suave y, si el restaurante tiene lealtad, se le dice cuántos
   puntos suma y cuánto le falta para su premio. Nada de Leo aquí: en el
   menú la marca es la del restaurante. */
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

  /* El pico: una sola vez al llegar a esta pantalla. */
  useEffect(() => { celebrarEnvio(); }, []);

  /* Los puntos y la sorpresa se piden aparte: la confirmación sale al
     instante y esto llega un momento después. */
  const [final, setFinal] = useState<FinalDelPedido | null>(null);
  useEffect(() => {
    if (!trackToken) return;
    let vivo = true;
    getFinalDelPedido(restaurantId, trackToken)
      .then((f) => { if (vivo) setFinal(f); })
      .catch(() => { /* sin puntos que mostrar */ });
    return () => { vivo = false; };
  }, [restaurantId, trackToken]);
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
        {/* «El pedido vuela» y «Listo» (estrategia §5.2, firmas 1 y 5). */}
        <div className="pedido-enviado" aria-hidden>
          <span className="pedido-vuela"><Icon name="receipt" size={30} /></span>
          <span className="pedido-check">
            <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
          </span>
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
        {final?.sorpresa && <Sorpresa texto={final.sorpresa} />}
        {final?.lealtad && !kiosk && <PuntosDelPedido l={final.lealtad} cuentaHref={tp('/?openTab=cuenta')} />}

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
          <div style={{ width: '100%' }}>
            <PrimaryButton href={tp(`/pedido/${trackToken}`)} full iconRight="arrowRight">
              {content.confirmation.track}
            </PrimaryButton>
            <p className="t-mute" style={{ fontSize: 'var(--m-fs-xs)', margin: '7px 0 0', textAlign: 'center' }}>
              Ahí te avisamos cuando esté listo.
            </p>
          </div>
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

/* ── Los puntos de este pedido (M2) ───────────────────────── */

function PuntosDelPedido({ l, cuentaHref }: { l: NonNullable<FinalDelPedido['lealtad']>; cuentaHref: string }) {
  if (!l.conCuenta) {
    // Aversión a la pérdida (§2.1), dicho sin regañar: es para la próxima.
    return (
      <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)', width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 'var(--m-fs-md)', fontWeight: 700, color: 'var(--u-text)' }}>
          Con tu cuenta, este pedido te daba {l.puntos} puntos{l.doble ? ' (doble por ser el primero)' : ''}.
        </div>
        <p style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
          Entra con tu cuenta Leogin antes de tu próximo pedido y empieza a juntar para tus premios.
        </p>
        <Link href={cuentaHref} className="press" style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--brand-accent-ink, var(--brand-accent))', textDecoration: 'none', minHeight: 'var(--m-tap)', display: 'inline-flex', alignItems: 'center' }}>
          Entrar con mi cuenta →
        </Link>
      </div>
    );
  }
  const total = l.saldo !== null ? l.saldo + l.puntos : null;
  const meta = l.siguiente;
  const avance = meta && total !== null ? Math.min(1, total / meta.costo) : null;
  return (
    <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)', width: '100%', textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center' }}>
      {/* «El sello» (firma 4): el punto se estampa como un sello de goma. */}
      <span className="pedido-sello" aria-hidden>+{l.puntos}</span>
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 'var(--m-fs-md)', fontWeight: 700, color: 'var(--u-text)' }}>
          Sumas {l.puntos} puntos{l.doble ? ', doble por tu primer pedido' : ''}
        </div>
        <div style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)' }}>
          Se acreditan cuando te lo entreguen{total !== null ? ` · quedarás con ${total}` : ''}.
        </div>
        {l.alcanza ? (
          <div style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--c-ok)' }}>¡Ya te alcanza para {l.alcanza}!</div>
        ) : meta && avance !== null ? (
          <>
            <div className="pedido-meta" role="progressbar" aria-valuenow={Math.round(avance * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Puntos para ${meta.titulo}`}>
              <i style={{ transform: `scaleX(${avance})` }} />
            </div>
            <div style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)' }}>
              Te faltan <strong>{meta.faltan}</strong> para {meta.titulo}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ── La sorpresa de la casa (M4) ─────────────────────────── */

function Sorpresa({ texto }: { texto: string }) {
  return (
    <div className="pedido-sorpresa" role="status">
      <Icon name="gift" size={26} />
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 'var(--m-fs-xs)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>¡Sorpresa de la casa!</div>
        <div style={{ fontSize: 'var(--m-fs-md)', fontWeight: 700 }}>{texto}</div>
        <div style={{ fontSize: 'var(--m-fs-xs)', opacity: 0.85 }}>Enséñale esta pantalla a quien te atienda.</div>
      </div>
    </div>
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
