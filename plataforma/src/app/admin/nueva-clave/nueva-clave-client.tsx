'use client';

import { useActionState, useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { setNewPassword, type ResetState } from '@/lib/actions/password-reset';

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

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
};

export default function NuevaClaveClient() {
  const [state, formAction, isPending] = useActionState(setNewPassword, empty);
  // Navegación de DOCUMENTO, no `redirect()` del servidor: mismo motivo que
  // `enterRestaurant` (lib/actions/mi-cuenta.ts).
  const entrando = !!state && 'url' in state;
  useEffect(() => {
    if (state && 'url' in state) window.location.assign(state.url);
  }, [state]);
  // Misma decisión que en el registro: se escribe dos veces y se puede ver.
  // Aquí importa aún más — quien llega es alguien que YA se quedó fuera una vez.
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [show, setShow] = useState(false);
  const mismatch = password2.length > 0 && password !== password2;

  return (
    <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--u-text)', margin: '0 0 6px' }}>
          Crea tu contraseña nueva
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--u-text-3)', margin: 0 }}>
          Con esta contraseña entrarás a tu panel a partir de ahora.
        </p>
      </div>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label htmlFor="np" style={labelStyle}>Contraseña nueva</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="np"
              name="password"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Ocultar la contraseña' : 'Ver la contraseña'}
              className="press"
              style={{
                flexShrink: 0, padding: '0 14px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--u-hair-2)',
                background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                color: 'var(--u-text-3)', cursor: 'pointer',
              }}
            >
              <Icon name="eye" size={17} />
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '6px 0 0' }}>Mínimo 8 caracteres.</p>
        </div>

        <div>
          <label htmlFor="np2" style={labelStyle}>Repite la contraseña</label>
          <input
            id="np2"
            name="password2"
            type={show ? 'text' : 'password'}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            required
            style={inputStyle}
          />
          {mismatch && (
            <p style={{ fontSize: 11.5, color: '#f87171', margin: '6px 0 0' }}>
              Las dos contraseñas no coinciden.
            </p>
          )}
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
          disabled={isPending || entrando || mismatch || password.length < 8}
          className="press btn-accent"
          style={{
            padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15,
            border: 'none', color: '#fff',
            cursor: isPending || entrando || mismatch ? 'not-allowed' : 'pointer',
            opacity: isPending || entrando || mismatch || password.length < 8 ? 0.6 : 1,
          }}
        >
          {isPending || entrando ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </div>
  );
}
