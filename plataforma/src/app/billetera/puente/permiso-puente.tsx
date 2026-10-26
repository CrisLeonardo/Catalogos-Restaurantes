'use client';

import { useState } from 'react';
import { aceptarPuente } from '@/lib/actions/cuenta-puente';

/**
 * El permiso de la primera vez (BIL-00b): qué ve el restaurante y qué no.
 * «Unirme» crea el código y el navegador navega solo al canje.
 */
export default function PermisoPuente({
  slug, nombre, via, vuelta, email, sinCuenta,
}: {
  slug: string; nombre: string; via: string; vuelta: string; email: string; sinCuenta: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unirme() {
    setBusy(true);
    setError(null);
    const res = await aceptarPuente(slug, via, vuelta);
    if ('url' in res) {
      window.location.assign(res.url);
      return;
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--u-text-2)', margin: '0 0 12px' }}>
        Vas a unirte con <strong style={{ color: 'var(--u-text)', overflowWrap: 'anywhere' }}>{email}</strong>.
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--u-text-2)', margin: '0 0 20px', paddingLeft: 18 }}>
        <li>{nombre} verá tu nombre, tu correo y tu teléfono si se lo das al pedir.</li>
        <li>No verá tus alergias ni a qué otros restaurantes vas.</li>
      </ul>
      {error && (
        <p role="alert" style={{ fontSize: 14, color: 'var(--c-danger, #b42318)', margin: '0 0 12px' }}>{error}</p>
      )}
      <button
        type="button"
        onClick={unirme}
        disabled={busy}
        className="press btn-accent"
        style={{
          width: '100%', padding: '12px 18px', borderRadius: 'var(--radius-full)',
          fontWeight: 600, fontSize: 15, border: 'none', cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.75 : 1,
        }}
      >
        {busy ? 'Entrando…' : 'Unirme y entrar'}
      </button>
      <a href={sinCuenta} style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--u-text-3)' }}>
        Ahora no
      </a>
    </>
  );
}
