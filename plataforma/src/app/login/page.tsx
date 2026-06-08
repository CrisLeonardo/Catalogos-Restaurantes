'use client';

import { useActionState } from 'react';
import { Glass } from '@/components/glass';
import { login, type AuthState } from '@/lib/actions/auth';

const emptyState: AuthState = null;

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, emptyState);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--u-hair-2)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    color: 'var(--u-text)',
    fontSize: 16,
    outline: 'none',
  };

  return (
    <main
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100svh',
        padding: '24px 16px',
      }}
    >
      <div className="anim-fade-up" style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo / título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1
            className="t-display"
            style={{ fontSize: 32, marginBottom: 8 }}
          >
            MenúVivo
          </h1>
          <p className="t-mute" style={{ fontSize: 14 }}>
            Acceso al panel de administración
          </p>
        </div>

        <Glass style={{ padding: '28px 24px' }}>
          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label
                htmlFor="email"
                style={{
                  fontSize: 12,
                  color: 'var(--u-text-3)',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="tu@email.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{
                  fontSize: 12,
                  color: 'var(--u-text-3)',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>

            {state?.error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(220,50,50,0.12)',
                  border: '1px solid rgba(220,50,50,0.25)',
                  color: '#f87171',
                  fontSize: 14,
                }}
              >
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="press btn-accent"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                fontSize: 16,
                border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {isPending ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </Glass>
      </div>
    </main>
  );
}
