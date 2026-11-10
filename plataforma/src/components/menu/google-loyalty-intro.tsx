'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/icons';
import GoogleSignInButton from '@/components/menu/google-signin';

/**
 * Aviso de una sola vez (primera visita) explicando que los puntos de
 * fidelidad requieren sesión de Google. No bloquea el pedido — es
 * informativo y se puede cerrar sin iniciar sesión.
 *
 * El fondo oscurecido cubre toda la pantalla PERO con pointer-events: none,
 * así que solo es visual — nunca intercepta el toque. Antes el fondo (con
 * inset:0 + onClick) sí capturaba cualquier tap fuera de la tarjeta,
 * incluido un "Agregar" de un producto justo debajo: ese primer toque solo
 * cerraba el aviso en vez de agregar el platillo.
 *
 * Auditoría 1.11 (N11, E08): la tarjeta era vidrio transparente con el
 * párrafo al 50 % de opacidad y en tema oscuro no se leía. Ahora es sólida,
 * con el fondo y el texto del tema, recibe el foco al abrir, se cierra con
 * Escape y devuelve el foco a donde estaba. Sigue sin bloquear la carta
 * (decisión del dueño, 2026-11-09; moverlo a después de pedir es la 3.3).
 */
export default function GoogleLoyaltyIntro({ onClose }: { onClose: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const anterior = document.activeElement;
    titulo.current?.focus({ preventScroll: true });
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div
      style={{
        // Por encima de la barra de navegación (zIndex 90).
        position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.55)',
        padding: 16,
      }}
      // Sube desde abajo en el teléfono y se centra de tablet para arriba,
      // igual que el resto de hojas del comensal (ver globals.css).
      className="menu-sheet-wrap"
    >
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="leal-titulo"
        aria-describedby="leal-texto"
        style={{
          width: '100%', maxWidth: 420, pointerEvents: 'auto',
          borderRadius: 'var(--m-r-xl)', padding: '26px 22px',
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
          // Sólida: el fondo del tema y su borde, sin vidrio ni desenfoque.
          background: 'var(--brand-bg)', border: '1px solid var(--u-hair-2)',
          boxShadow: '0 18px 48px -18px rgba(0,0,0,0.6)', color: 'var(--u-text)',
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: 'var(--m-r-lg)', display: 'grid', placeItems: 'center',
          background: 'var(--surface-2)', border: '1px solid var(--u-hair)', marginBottom: 14,
        }}>
          <Icon name="star" size={26} style={{ color: 'var(--brand-accent-ink)' }} />
        </div>
        <h2 id="leal-titulo" ref={titulo} tabIndex={-1} className="t-display"
          style={{ fontSize: 'var(--m-fs-xl)', marginBottom: 8, outline: 'none', color: 'var(--u-text)' }}>
          Gana puntos con cada pedido
        </h2>
        <p id="leal-texto" style={{ fontSize: 'var(--m-fs-sm)', lineHeight: 1.55, marginBottom: 20, color: 'var(--u-text-2)' }}>
          Para acumular y usar tus puntos necesitas iniciar sesión con tu cuenta de Google.
          Así te reconocemos en cualquier dispositivo, sin crear otra contraseña.
        </p>
        <GoogleSignInButton full label="Continuar con Google" returnTab="fidelidad" />
        <button
          type="button"
          onClick={onClose}
          className="press"
          style={{
            display: 'block', width: '100%', textAlign: 'center', marginTop: 8, minHeight: 44,
            background: 'none', border: 'none', fontSize: 'var(--m-fs-sm)', fontWeight: 600,
            color: 'var(--u-text-2)', cursor: 'pointer', padding: '6px 0',
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
