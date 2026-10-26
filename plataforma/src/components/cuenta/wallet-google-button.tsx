'use client';

import { useState } from 'react';
import GoogleG from '@/components/auth/google-g';

/* Mismo motivo que el botón del menú (components/menu/google-signin.tsx):
   el cliente de Supabase se carga al tocar, no con la página. */
const loadWalletClient = () => import('@/lib/supabase/client').then((m) => m.createWalletClient());

/**
 * «Continuar con Google» de la CUENTA LEOGIN (billetera, dominio raíz).
 *
 * Guarda el verificador PKCE y la sesión bajo WALLET_COOKIE_NAME: no toca
 * la sesión del panel ni la de ningún restaurante. Vuelve por
 * `/billetera/auth/callback` a `next`, que tiene que ser una ruta de
 * `/billetera` (el callback lo vuelve a comprobar).
 */
export default function WalletGoogleButton({ next = '/billetera' }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      const supabase = await loadWalletClient();
      const redirectTo = `${window.location.origin}/billetera/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } },
      });
      if (error) setLoading(false);
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
        width: '100%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '12px 18px', borderRadius: 'var(--radius-full)',
        background: '#fff', color: '#1f2937', fontWeight: 600, fontSize: 15,
        border: '1px solid rgba(0,0,0,0.12)', cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      <GoogleG />
      {loading ? 'Conectando…' : 'Continuar con Google'}
    </button>
  );
}
