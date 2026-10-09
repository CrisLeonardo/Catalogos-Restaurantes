'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { cambiarContrasena, type CambioState } from '@/lib/actions/password-change';

const empty: CambioState = null;

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
};

/** `destino`: si el cambio era obligatorio (ACC-05), a dónde seguir después. */
export default function CambiarContrasenaForm({ destino = null }: { destino?: string | null }) {
  const [state, formAction, isPending] = useActionState(cambiarContrasena, empty);
  // Se recuerda el de la primera pintada: al guardar, Next repinta la página
  // y para entonces la marca ya no está (y `destino` llega en null).
  const [continuarA] = useState(destino);
  const [nueva, setNueva] = useState('');
  const [nueva2, setNueva2] = useState('');
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const mismatch = nueva2.length > 0 && nueva !== nueva2;
  const ok = !!state && 'ok' in state;

  // Guardada: se vacía el formulario para que nadie la vuelva a leer en
  // pantalla ni se reenvíe por error.
  useEffect(() => {
    if (!ok) return;
    formRef.current?.reset();
    setNueva('');
    setNueva2('');
  }, [ok, state]);

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label htmlFor="pw-actual" style={labelStyle}>Contraseña actual</label>
        <input
          id="pw-actual" name="actual" type={show ? 'text' : 'password'}
          autoComplete="current-password" required className="adm-field adm-field-lg"
        />
      </div>

      <div>
        <label htmlFor="pw-nueva" style={labelStyle}>Contraseña nueva</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="pw-nueva" name="nueva" type={show ? 'text' : 'password'}
            value={nueva} onChange={(e) => setNueva(e.target.value)}
            autoComplete="new-password" required minLength={8} className="adm-field adm-field-lg"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Ocultar las contraseñas' : 'Ver las contraseñas'}
            className="press"
            style={{
              flexShrink: 0, padding: '0 14px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--u-hair-2)',
              background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
              color: 'var(--u-text-3)', cursor: 'pointer',
            }}
          >
            <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--u-text-4)', margin: '6px 0 0' }}>Mínimo 8 caracteres.</p>
      </div>

      <div>
        <label htmlFor="pw-nueva2" style={labelStyle}>Repite la nueva</label>
        <input
          id="pw-nueva2" name="nueva2" type={show ? 'text' : 'password'}
          value={nueva2} onChange={(e) => setNueva2(e.target.value)}
          autoComplete="new-password" required className="adm-field adm-field-lg"
          aria-invalid={mismatch || undefined}
        />
        {mismatch && (
          <p style={{ fontSize: 11, color: '#f87171', margin: '6px 0 0' }}>Las dos contraseñas no coinciden.</p>
        )}
      </div>

      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--u-text-4)', margin: 0 }}>
        Al cambiarla cerramos tu sesión en los demás aparatos (esta pantalla sigue abierta). Si crees que alguien
        más conocía tu contraseña, con esto queda fuera.
      </p>

      {state && 'error' in state && (
        <p role="alert" style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)', margin: 0, fontSize: 13,
          background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171',
        }}>
          {state.error}
        </p>
      )}
      {ok && state && 'ok' in state && (
        <p role="status" style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)', margin: 0, fontSize: 13,
          background: 'color-mix(in srgb, #22c55e 12%, transparent)',
          border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)', color: 'var(--u-text)',
        }}>
          Listo: tu contraseña nueva ya funciona y cerramos tu sesión en los demás aparatos.
        </p>
      )}
      {ok && continuarA && (
        <a
          href={continuarA}
          className="press btn-accent"
          style={{
            alignSelf: 'flex-start', padding: '11px 22px', borderRadius: 'var(--radius-full)', fontWeight: 600,
            fontSize: 14, color: '#fff', textDecoration: 'none',
          }}
        >
          Continuar
        </a>
      )}

      <button
        type="submit"
        disabled={isPending || mismatch || nueva.length < 8}
        className="press btn-accent"
        style={{
          alignSelf: 'flex-start', padding: '11px 22px', borderRadius: 'var(--radius-full)', fontWeight: 600,
          fontSize: 14, border: 'none', color: '#fff',
          cursor: isPending || mismatch || nueva.length < 8 ? 'not-allowed' : 'pointer',
          opacity: isPending || mismatch || nueva.length < 8 ? 0.6 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
