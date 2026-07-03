'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Logo "G" oficial de Google (multicolor). */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 4.5 29.5 2.5 24 2.5 12.1 2.5 2.5 12.1 2.5 24S12.1 45.5 24 45.5 45.5 35.9 45.5 24c0-1.2-.1-2.4-.3-3.5z" />
      <path fill="#FF3D00" d="M5.3 14.7l6.6 4.8C13.6 16 18.4 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16 4.5 9 9.2 5.3 14.7z" transform="translate(0 -2)" />
      <path fill="#4CAF50" d="M24 45.5c5.4 0 10.3-2 14-5.3l-6.5-5.3c-2 1.5-4.6 2.4-7.5 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9 40.7 16 45.5 24 45.5z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.5 5.3c-.5.4 6.8-4.9 6.8-15.2 0-1.2-.1-2.4-.3-3.5z" />
    </svg>
  );
}

/**
 * "Continuar con Google" para comensales. Inicia el flujo OAuth y vuelve a la
 * misma página (`/auth/callback?next=...`). El que renderiza decide si mostrarlo
 * (solo si el proveedor está configurado — ver isGoogleAuthEnabled).
 *
 * `returnTab` ('cuenta' | 'fidelidad'): qué panel reabrir automáticamente al
 * volver de Google. El login es una redirección de página completa (no una
 * llamada en el sitio), así que cualquier sheet abierto (useState) se pierde
 * en la vuelta; sin esto el comensal vuelve al menú y tiene que volver a
 * tocar la pestaña para ver que ya quedó identificado.
 */
export default function GoogleSignInButton({ label = 'Continuar con Google', full = false, returnTab }: { label?: string; full?: boolean; returnTab?: 'cuenta' | 'fidelidad' }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      const supabase = createClient();
      const url = new URL(window.location.pathname + window.location.search, window.location.origin);
      if (returnTab) url.searchParams.set('openTab', returnTab);
      const next = url.pathname + url.search;
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) setLoading(false);
      // En éxito, el navegador redirige a Google: no hace falta limpiar el estado.
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      className="press"
      style={{
        width: full ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '12px 18px', borderRadius: 'var(--radius-full)',
        background: '#fff', color: '#1f2937', fontWeight: 600, fontSize: 14.5,
        border: '1px solid rgba(0,0,0,0.12)', cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      <GoogleG />
      {loading ? 'Conectando…' : label}
    </button>
  );
}
