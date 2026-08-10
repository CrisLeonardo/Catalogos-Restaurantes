'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { isStaleBuildError, recoverFromStaleBuild } from '@/lib/stale-build';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // El panel se queda abierto días en la PC del restaurante, así que es el
  // sitio donde más probable es que un despliegue lo pille con el bundle
  // viejo. Ver lib/stale-build.ts.
  const [reloading, setReloading] = useState(false);
  const stale = isStaleBuildError(error);
  useEffect(() => {
    if (stale) setReloading(recoverFromStaleBuild());
  }, [stale]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--c-danger-bg)',
          border: '1px solid var(--c-danger-line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--c-danger)',
        }}
      >
        <Icon name="alertCircle" size={22} />
      </div>

      <div style={{ maxWidth: 300 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--u-text)',
            marginBottom: 6,
          }}
        >
          {stale ? 'Hay una versión nueva' : 'Error en el panel'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
          {stale
            ? reloading
              ? 'Estamos actualizando el panel…'
              : 'Este panel tiene una versión anterior de Leogin. Recárgalo para continuar.'
            : error.message || 'No se pudo cargar esta sección. Intenta de nuevo.'}
        </p>
      </div>

      <button
        // Contra un build viejo, `reset()` remonta el mismo bundle roto.
        onClick={() => (stale ? window.location.reload() : reset())}
        style={{
          padding: '9px 20px',
          borderRadius: 'var(--radius-full)',
          background: 'color-mix(in srgb, var(--u-text) 8%, transparent)',
          border: '1px solid var(--u-hair-2)',
          color: 'var(--u-text)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {stale ? 'Recargar' : 'Intentar de nuevo'}
      </button>
    </div>
  );
}
