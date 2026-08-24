'use client';

import { useState } from 'react';
import { createDinerClient } from '@/lib/supabase/client';
import { getStableLinkPrefix } from '@/lib/tenant-client';
import GoogleG from '@/components/auth/google-g';

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
      // Cliente del COMENSAL: el flujo OAuth guarda el code-verifier y la
      // sesión bajo la cookie del comensal, sin tocar la del personal.
      const supabase = createDinerClient();
      const url = new URL(window.location.pathname + window.location.search, window.location.origin);
      if (returnTab) url.searchParams.set('openTab', returnTab);
      const next = url.pathname + url.search;
      // getStableLinkPrefix: bajo el link estable de mesa, el callback tiene
      // que volver a /m/<restaurantId>/auth/callback — si no, el proxy no
      // puede resolver a qué restaurante pertenece esta vuelta del OAuth (ver
      // proxy.ts §1b). Seguro llamarlo aquí (solo corre al hacer clic, nunca
      // durante el render). `next` ya trae el prefijo (viene de window.location.pathname).
      const redirectTo = `${window.location.origin}${getStableLinkPrefix() ?? ''}/auth/callback?next=${encodeURIComponent(next)}`;
      // `prompt: 'select_account'` fuerza el selector de cuenta de Google en
      // CADA inicio de sesión, incluso si el navegador ya tiene una sesión de
      // Google activa. Sin esto, Google reautentica en silencio con la última
      // cuenta usada — así que cerrar sesión en Leogin y volver a entrar
      // siempre "elegía sola" la cuenta anterior, sin dejar cambiarla.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } },
      });
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
        background: '#fff', color: '#1f2937', fontWeight: 600, fontSize: 'var(--m-fs-md)',
        border: '1px solid rgba(0,0,0,0.12)', cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      <GoogleG />
      {loading ? 'Conectando…' : label}
    </button>
  );
}
