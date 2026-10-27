'use client';

import { useRef } from 'react';
import { Icon } from '@/components/icons';

/* «Míralo en tu celular» (PLAN_MOMENTOS_PICO W1 · estrategia §2.2).
 *
 * El «ajá» de un dueño es ver SU menú en SU mano, no en la pantalla de otro.
 * Por eso en una computadora el botón no abre la demo ahí mismo: enseña un
 * QR grande para abrirla en el celular. En el celular (o en una pantalla
 * táctil) es el enlace de siempre. Lo decide el CSS (.lp-demo-pc /
 * .lp-demo-movil), así que no hay salto al hidratar.
 *
 * El QR llega ya dibujado del servidor (qrcode, en landing.tsx). */
export function LandingDemo({ href, qrSvg }: { href: string; qrSvg: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <a href={href} className="lp-btn lp-btn-lg lp-btn-soft lp-demo-movil">
        <Icon name="grid" size={16} /> Ver demo en vivo
      </a>
      <button
        type="button"
        className="lp-btn lp-btn-lg lp-btn-soft lp-demo-pc"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
      >
        <Icon name="phone" size={16} /> Míralo en tu celular
      </button>

      <dialog
        ref={ref}
        className="lp-demo-dialog"
        aria-labelledby="lp-demo-titulo"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <button type="button" className="lp-demo-cerrar" onClick={close} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <h2 id="lp-demo-titulo" className="lp-h3">Míralo en tu celular</h2>
        <p className="lp-body" style={{ fontSize: 14.5, marginTop: 8 }}>
          Abre la cámara y apunta al código. El menú de Rincón 502 se abre en tu mano, como lo
          verían tus clientes en la mesa.
        </p>
        <div className="lp-demo-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <a href={href} className="lp-demo-aqui">
          o ábrelo aquí en la computadora <Icon name="arrowRight" size={14} />
        </a>
      </dialog>
    </>
  );
}
