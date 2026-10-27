'use client';

import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { PanelEnVivo } from '@/components/pidelo/panel-en-vivo';
import { useSala } from '@/components/pidelo/use-sala';
import { nuevaSala, type PedidoDemo } from '@/lib/pidelo';
import { playOrderSound, primeAudio } from '@/lib/sounds';
import { fmtMoney } from '@/lib/money';

/* «Pídelo tú mismo» en la web (auditoría de experiencia 2026-10-27, EV-01).
 *
 * Antes era «Míralo en tu celular» (PLAN_MOMENTOS_PICO W1): un QR que abría
 * la demo en la mano. Bien, pero la demo terminaba en el precio, sin botón, y
 * lo que de verdad vende Leogin —el pedido entra solo y suena— se quedaba
 * contado. Ahora el QR abre la demo con una SALA de un solo uso: el visitante
 * pide desde su celular y el panel de esta ventana suena con su pedido, con
 * su nombre (ver lib/pidelo.ts y components/pidelo/).
 *
 * En una computadora con ratón el botón abre esta ventana; en lo táctil es el
 * enlace a la demo, que tiene su propio «así le llegó a la cocina». Lo decide
 * el CSS (.lp-demo-pc / .lp-demo-movil), así que no hay salto al hidratar.
 *
 * El QR se dibuja aquí y no en el servidor: lleva la sala, que es de cada
 * visita. `qrcode` se carga al abrir, no con la portada. */
export function LandingDemo({ href }: { href: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sala, setSala] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pedido, setPedido] = useState<PedidoDemo | null>(null);

  const alRecibir = useCallback((p: PedidoDemo) => {
    setPedido(p);
    playOrderSound(0.6, 2, { force: true });
  }, []);
  const { fallo } = useSala(sala, alRecibir);

  async function abrir() {
    // El clic desbloquea el audio: el pedido llega después, sin gesto, y sin
    // esto el navegador no lo dejaría sonar.
    primeAudio();
    const s = sala ?? nuevaSala();
    setSala(s);
    ref.current?.showModal();
    if (!qr) {
      const QRCode = (await import('qrcode')).default;
      setQr(await QRCode.toString(`${href}/?sala=${s}`, {
        type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1C1C1E', light: '#FFFFFF' },
      }));
    }
  }
  const close = () => ref.current?.close();

  return (
    <>
      <a href={href} className="lp-btn lp-btn-lg lp-btn-soft lp-demo-movil">
        <Icon name="grid" size={16} /> Ver demo en vivo
      </a>
      <button
        type="button"
        className="lp-btn lp-btn-lg lp-btn-soft lp-demo-pc"
        onClick={abrir}
        aria-haspopup="dialog"
      >
        <Icon name="phone" size={16} /> Haz un pedido de prueba
      </button>

      <dialog
        ref={ref}
        className="lp-demo-dialog lp-pidelo"
        aria-labelledby="lp-demo-titulo"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <button type="button" className="lp-demo-cerrar" onClick={close} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <div className="lp-pidelo-grid">
          <div>
            <h2 id="lp-demo-titulo" className="lp-h3">Pídelo tú mismo</h2>
            <ol className="lp-pidelo-pasos">
              <li>Escanea el código con la cámara de tu celular.</li>
              <li>Elige algo de Rincón 502 y envíalo.</li>
              <li>Mira esta pantalla: aquí suena, como en tu cocina.</li>
            </ol>
            <div className="lp-demo-qr" aria-label="Código QR de la demo">
              {qr && <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: qr }} />}
            </div>
            {/* En otra pestaña y con la misma sala: sin celular a mano, el
                pedido se hace allá y esta ventana suena igual. */}
            <a href={sala ? `${href}/?sala=${sala}` : href} target="_blank" rel="noopener" className="lp-demo-aqui">
              o ábrelo aquí en la computadora <Icon name="arrowRight" size={14} />
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <PanelEnVivo pedido={pedido} dinero={(n) => fmtMoney(n)} />
            {fallo && !pedido && (
              <p style={{ fontSize: 12.5, color: '#8A8178', margin: 0, textAlign: 'center' }}>
                No pudimos conectar esta pantalla. Tu celular te enseña igual cómo llega el pedido.
              </p>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
