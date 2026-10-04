'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { resendEmailVerification } from '@/lib/actions/email-verification';

/**
 * Aviso persistente mientras el dueño no confirme su correo (migración 109).
 *
 * A propósito NO bloquea nada: el restaurante ya está operando y un correo
 * que se fue a spam no puede dejar a un cliente real fuera de su panel. Lo
 * que sí hace es no dejar que se olvide, porque de ese correo depende poder
 * recuperar la contraseña.
 */
export default function VerifyEmailBanner({ email }: { email: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        borderRadius: 'var(--radius-lg)', padding: '11px 15px', marginBottom: 16,
        border: '1px solid rgba(245,158,11,0.3)',
        background: 'rgba(245,158,11,0.08)',
      }}
    >
      <span style={{ color: '#f59e0b', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <Icon name="alertCircle" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 180, fontSize: 13, color: 'var(--u-text-2)' }}>
        {message ?? (
          <>
            Falta confirmar tu correo{email ? <> <strong style={{ color: 'var(--u-text)' }}>({email})</strong></> : null}.
            Es por donde recuperarías tu contraseña si se te olvida.
          </>
        )}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendEmailVerification();
            setMessage(
              result && 'error' in result
                ? result.error
                : 'Te mandamos el correo otra vez. Revisa también la carpeta de spam.',
            );
          })
        }
        className="press"
        style={{
          whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 'var(--radius-full)',
          fontSize: 12, fontWeight: 600, border: 'none',
          background: 'var(--u-text)', color: 'var(--brand-bg)',
          cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Enviando…' : 'Reenviar correo'}
      </button>
    </div>
  );
}
