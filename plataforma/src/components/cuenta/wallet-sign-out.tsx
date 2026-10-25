'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Cerrar la sesión de la cuenta Leogin en ESTE aparato.
 *
 * `scope: 'local'` a propósito: el `signOut()` por omisión es global y
 * revocaría también las sesiones que el puente abrió en cada restaurante.
 * Salir de la billetera no te saca de los menús donde ya estás.
 */
export default function WalletSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function salir() {
    setBusy(true);
    try {
      const { createWalletClient } = await import('@/lib/supabase/client');
      await createWalletClient().auth.signOut({ scope: 'local' });
    } catch { /* sin sesión que cerrar */ }
    router.refresh();
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={busy}
      className="press"
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: 'var(--u-text-3)', fontSize: 13, textDecoration: 'underline',
      }}
    >
      {busy ? 'Cerrando…' : 'Cerrar sesión'}
    </button>
  );
}
