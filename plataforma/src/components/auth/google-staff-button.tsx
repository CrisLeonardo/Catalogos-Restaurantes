'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import GoogleG from '@/components/auth/google-g';

/**
 * "Continuar con Google" del PERSONAL (dueño / gerente), no del comensal.
 *
 * Diferencias con el botón del menú (menu/google-signin.tsx), que es el motivo
 * de que sean dos componentes y no uno:
 *  · usa `createClient()` → la sesión cae en la cookie del PERSONAL
 *    (`sb-<ref>-auth-token`, dominio `.leogin.online`), no en la del comensal.
 *    Así el dueño puede tener su cuenta de Google abierta en el menú Y su
 *    sesión del panel a la vez, sin que una pise a la otra.
 *  · vuelve por `/admin/auth/google/callback`, que además de canjear el código
 *    resuelve a qué panel entra este perfil (y deja el acceso en la bitácora).
 *
 * `intent`:
 *  · 'login'  → si la cuenta no tiene restaurante, el callback la manda a crear uno.
 *  · 'signup' → viene del wizard de registro; vuelve siempre a /registro.
 *  · 'reauth' → ya estaba dentro y solo confirma que es ella antes de algo
 *    delicado (ACC-09); vuelve a `next`, la misma pantalla.
 */
export default function GoogleStaffButton({
  intent = 'login',
  label = 'Continuar con Google',
  next,
  onBeforeRedirect,
}: {
  intent?: 'login' | 'signup' | 'reauth';
  label?: string;
  /** Ruta relativa a la que volver tras el callback (se respeta en signup y reauth). */
  next?: string;
  /** Última oportunidad de guardar estado local antes de salir de la página. */
  onBeforeRedirect?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      onBeforeRedirect?.();
      const supabase = createClient();
      // Si ya había sesión del personal en este navegador (otra cuenta, de
      // otra visita), se cierra ANTES de ir a Google. Sin esto, el navegador
      // tiene que sobreescribir una cookie que ya existe con el mismo nombre
      // cuando vuelve el callback — y ahí es donde se vio fallar en Edge: la
      // pestaña se quedaba con la sesión VIEJA pese a que el servidor sí
      // canjeó el código y mandó la cookie nueva (confirmado con los logs:
      // exchangeCodeForSession sin error, pero /registro seguía leyendo la
      // cuenta anterior). Partiendo sin cookie previa, el `Set-Cookie` ya no
      // es una sobreescritura sino un alta limpia.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      const params = new URLSearchParams({ intent });
      if (next) params.set('next', next);
      const redirectTo = `${window.location.origin}/admin/auth/google/callback?${params.toString()}`;
      // `prompt: 'select_account'` fuerza el selector de cuenta de Google en
      // cada intento: sin esto, quien administra dos negocios con dos cuentas
      // distintas entraba siempre con la última que usó, sin poder cambiarla.
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } },
      });
      if (err) {
        setError('No pudimos abrir el acceso con Google. Intenta con tu correo.');
        setLoading(false);
      }
      // En éxito el navegador se va a Google: no hace falta limpiar el estado.
    } catch {
      setError('No pudimos abrir el acceso con Google. Intenta con tu correo.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="press"
        style={{
          width: '100%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '13px 18px', borderRadius: 'var(--radius-full)',
          background: '#fff', color: '#1f2937', fontWeight: 600, fontSize: 15,
          border: '1px solid rgba(0,0,0,0.12)', cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      >
        <GoogleG />
        {loading ? 'Conectando…' : label}
      </button>
      {error && (
        <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}
