'use client';

import { Icon } from '@/components/icons';
import { useReportarError } from '@/lib/observability/report-client-error';

export default function SuperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // MON-01: que Leogin se entere, no solo quien lo está viendo.
  useReportarError(error);
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
          Error en Super Admin
        </h2>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
          {error.message ?? 'No se pudo cargar esta sección. Intenta de nuevo.'}
        </p>
      </div>

      <button
        onClick={reset}
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
        Intentar de nuevo
      </button>
    </div>
  );
}
