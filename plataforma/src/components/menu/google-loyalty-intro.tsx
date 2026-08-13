'use client';

import { Glass } from '@/components/glass';
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
 * cerraba el aviso en vez de agregar el platillo, y el comensal tenía que
 * tocar dos veces sin entender por qué — contradecía el propio comentario
 * de arriba, que ya decía que esto NO debía bloquear el pedido.
 */
export default function GoogleLoyaltyIntro({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Gana puntos de fidelidad"
      style={{
        // Por encima de la barra de navegación (zIndex 90): el fondo
        // oscurecido debe dibujarse sobre ella; antes (zIndex 80) la barra
        // se dibujaba ENCIMA de la tarjeta y la tapaba.
        position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.55)',
        padding: 16,
      }}
      // Sube desde abajo en el teléfono y se centra de tablet para arriba,
      // igual que el resto de hojas del comensal (ver globals.css).
      className="menu-sheet-wrap"
    >
      <div style={{ width: '100%', maxWidth: 420, pointerEvents: 'auto' }}>
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
            <Icon name="star" size={26} style={{ color: 'var(--brand-accent-ink)' }} />
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
