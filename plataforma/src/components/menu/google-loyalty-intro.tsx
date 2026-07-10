'use client';

import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import GoogleSignInButton from '@/components/menu/google-signin';

/**
 * Aviso de una sola vez (primera visita) explicando que los puntos de
 * fidelidad requieren sesión de Google. No bloquea el pedido — es
 * informativo y se puede cerrar sin iniciar sesión.
 */
export default function GoogleLoyaltyIntro({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gana puntos de fidelidad"
      style={{
        // Por encima de la barra de navegación (zIndex 90): es un modal con
        // fondo oscurecido; antes (zIndex 80) la barra se dibujaba ENCIMA de
        // la tarjeta y la tapaba.
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420 }}>
        <Glass
          style={{
            borderRadius: 22, padding: '26px 22px', width: '100%',
            marginBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--brand-accent) 18%, transparent)', marginBottom: 14,
          }}>
            <Icon name="star" size={26} style={{ color: 'var(--brand-accent)' }} />
          </div>
          <h2 className="t-display" style={{ fontSize: 20, marginBottom: 8 }}>Gana puntos con cada pedido</h2>
          <p className="t-mute" style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 20 }}>
            Para acumular y usar tus puntos de fidelidad necesitas iniciar sesión con tu cuenta de Google.
            Así te reconocemos en cualquier dispositivo, sin crear otra contraseña.
          </p>
          <GoogleSignInButton full label="Continuar con Google" returnTab="fidelidad" />
          <button
            type="button"
            onClick={onClose}
            className="press t-mute"
            style={{
              display: 'block', width: '100%', textAlign: 'center', marginTop: 12,
              background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', padding: '6px 0',
            }}
          >
            Ahora no
          </button>
        </Glass>
      </div>
    </div>
  );
}
