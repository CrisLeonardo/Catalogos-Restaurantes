'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { Price, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { pedidoDesdeCarrito, salaValida, type PedidoDemo } from '@/lib/pidelo';
import { playOrderSound, primeAudio } from '@/lib/sounds';
import { PanelEnVivo } from '@/components/pidelo/panel-en-vivo';
import { useSala } from '@/components/pidelo/use-sala';

/* ============================================================
   «Pídelo tú mismo» en la demo (lib/pidelo.ts, auditoría EV-01)
   ------------------------------------------------------------
   En la demo el carrito no lleva al checkout —no hay restaurante
   real ni base—: lleva aquí. Dos pasos:
     1. A nombre de quién (opcional) y «Enviar a la cocina».
     2. «Así le llegó a la cocina»: el panel con el pedido, sonando.
   Si la demo se abrió desde el QR de la web (`?sala=`), el pedido
   también viaja a la computadora, que suena con él.

   Siempre montado en la demo (aunque cerrado) para que el canal de
   la sala ya esté suscrito cuando se toque «Enviar».
   ============================================================ */

/** El registro vive en el dominio raíz, no en `demo.`. */
function urlDeRegistro(): string {
  if (typeof window === 'undefined') return '/registro';
  const { protocol, host } = window.location;
  return `${protocol}//${host.replace(/^demo\./, '')}/registro`;
}

export function PedidoDemo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, total, clearCart } = useCart();
  const config = useThemeConfig();
  const [sala, setSala] = useState<string | null>(null);
  const [cliente, setCliente] = useState('');
  const [enviado, setEnviado] = useState<PedidoDemo | null>(null);
  const [enLaPc, setEnLaPc] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { listo, enviar } = useSala(sala);

  useEffect(() => {
    setSala(salaValida(new URLSearchParams(window.location.search).get('sala')));
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  async function mandar() {
    if (enviando || items.length === 0) return;
    // El toque desbloquea el audio: sin un gesto, el navegador no deja sonar.
    primeAudio();
    setEnviando(true);
    const pedido = pedidoDesdeCarrito(items, cliente);
    const llego = sala && listo ? await enviar(pedido) : false;
    // Un respiro antes del sonido: así se siente como algo que viaja.
    window.setTimeout(() => {
      setEnviado(pedido);
      setEnLaPc(llego);
      setEnviando(false);
      clearCart();
      playOrderSound(0.6, 2, { force: true });
      try { navigator.vibrate?.([80, 60, 80]); } catch { /* sin vibración */ }
    }, 650);
  }

  function cerrar() {
    setEnviado(null);
    setCliente('');
    onClose();
  }

  return (
    <div
      className="menu-sheet-wrap"
      style={{ position: 'fixed', inset: 0, zIndex: 70 }}
      onClick={cerrar}
      role="dialog"
      aria-modal="true"
      aria-label={enviado ? 'Así le llegó a la cocina' : 'Tu pedido de prueba'}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div
        className="glass anim-slide-up menu-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '20px 20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 className="t-display" style={{ fontSize: 24, lineHeight: 1.15 }}>
            {enviado ? '¡Así le llegó a la cocina!' : 'Tu pedido de prueba'}
          </h2>
          <button onClick={cerrar} className="press m-tap" style={{ borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', color: 'var(--u-text)', cursor: 'pointer', flexShrink: 0 }} aria-label="Cerrar">
            <Icon name="x" size={19} />
          </button>
        </div>

        {!enviado ? (
          <>
            <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', lineHeight: 1.5, margin: 0 }}>
              Es una demo: no se cobra ni se prepara nada. Envíalo y mira cómo lo recibe
              el restaurante{sala ? ', aquí y en la computadora' : ''}.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--u-text-2)', fontSize: 'var(--m-fs-sm)' }}>
                {items.reduce((n, i) => n + i.quantity, 0)} {items.length === 1 && items[0].quantity === 1 ? 'platillo' : 'platillos'}
              </span>
              <Price amount={total} size={20} />
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)' }}>
              ¿A nombre de quién?
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                maxLength={24}
                placeholder="Tu nombre (opcional)"
                autoComplete="given-name"
                style={{
                  padding: '12px 14px', borderRadius: 'var(--m-r-sm)', border: '1px solid var(--u-hair-2, var(--u-hair))',
                  background: 'var(--surface-2)', color: 'var(--u-text)', fontSize: 16,
                }}
              />
            </label>
            <PrimaryButton onClick={mandar} size="lg" full iconRight="arrowRight" disabled={enviando || items.length === 0}>
              {enviando ? 'Enviando…' : 'Enviar a la cocina'}
            </PrimaryButton>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PanelEnVivo pedido={enviado} dinero={(n) => formatPrice(n, config)} />
            </div>
            {enLaPc && (
              <p style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', textAlign: 'center' }}>
                Mira la computadora: allá también sonó.
              </p>
            )}
            <PrimaryButton href={urlDeRegistro()} size="lg" full iconRight="arrowRight">
              Quiero esto en mi restaurante
            </PrimaryButton>
            <button
              type="button"
              onClick={cerrar}
              className="press"
              style={{ background: 'none', border: 'none', color: 'var(--u-text-2)', fontSize: 'var(--m-fs-sm)', cursor: 'pointer', padding: 6 }}
            >
              Seguir viendo la carta
            </button>
          </>
        )}
      </div>
    </div>
  );
}
