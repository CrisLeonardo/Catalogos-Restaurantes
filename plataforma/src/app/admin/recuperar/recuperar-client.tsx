'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { requestPasswordReset, type ResetState } from '@/lib/actions/password-reset';

const empty: ResetState = null;

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  color: 'var(--u-text)',
  fontSize: 16,
  outline: 'none',
};

export default function RecuperarClient({ expirado }: { expirado: boolean }) {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, empty);
  const sent = state && 'sent' in state;

  return (
    <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--u-text)', margin: '0 0 6px' }}>
          Recupera tu contraseña
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--u-text-3)', margin: 0 }}>
          Escribe el correo con el que entras a tu panel y te mandamos un enlace para crear
          una contraseña nueva.
        </p>
        {/* Se dice ANTES de que lo intente, no después de un error: quien
            entra con el usuario de su restaurante no tiene buzón, y esta
            pantalla no puede ayudarle por mucho que lo escriba bien. */}
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--u-text-4)', margin: '8px 0 0' }}>
          ¿Entras con un usuario que te dio el restaurante (algo como <strong>carlos@turestaurante</strong>)
          o con un PIN? Eso no tiene correo: pídele a la persona dueña que te lo cambie desde
          <strong> Personal</strong>, en su panel.
        </p>
      </div>

      {expirado && !sent && (
        <p
          style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)', margin: 0, fontSize: 13.5,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fbbf24',
          }}
        >
          Ese enlace ya no sirve: los enlaces caducan y solo se pueden usar una vez. Pide uno nuevo.
        </p>
      )}

      {sent ? (
        <div
          style={{
            display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-md)',
            background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)',
          }}
        >
          <Icon name="check" size={18} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--u-text-2)', margin: 0 }}>
            Si ese correo tiene una cuenta en Leogin, ya va en camino un enlace para cambiar la
            contraseña. Revisa también la carpeta de spam.
          </p>
        </div>
      ) : (
        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label
              htmlFor="reset_email"
              style={{
                fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em',
                textTransform: 'uppercase', display: 'block', marginBottom: 6,
              }}
            >
              Correo
            </label>
            {/* `text` y no `email`: quien entra con el usuario de su
                restaurante escribe `carlos` o `carlos@turestaurante`, y con
                `type="email"` el navegador lo frenaba con un globo suyo
                ("incluye un @") antes de que el servidor pudiera decirle lo
                único útil: que su acceso se recupera por otro lado. */}
            <input
              id="reset_email"
              name="email"
              type="text"
              inputMode="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="tu@email.com"
              style={inputStyle}
            />
          </div>

          {state && 'error' in state && (
            <p
              style={{
                padding: '10px 14px', borderRadius: 'var(--radius-md)', margin: 0, fontSize: 13.5,
                background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)',
                color: '#f87171',
              }}
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="press btn-accent"
            style={{
              padding: '13px', borderRadius: 999, fontWeight: 600, fontSize: 15,
              border: 'none', color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
        </form>
      )}

      <Link
        href="/admin/login"
        style={{ fontSize: 13, color: 'var(--u-text-3)', textAlign: 'center', textDecoration: 'none' }}
      >
        Volver a iniciar sesión
      </Link>
    </div>
  );
}
