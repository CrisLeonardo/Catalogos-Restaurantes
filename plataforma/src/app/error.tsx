'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100svh',
        padding: '32px 20px',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.30)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        ⚠
      </div>

      <div style={{ maxWidth: 320 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--u-text)',
            marginBottom: 8,
          }}
        >
          Algo salió mal
        </h2>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
          {error.message ?? 'Ha ocurrido un error inesperado. Por favor intenta de nuevo.'}
        </p>
      </div>

      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '11px 24px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--brand-accent)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 14,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Intentar de nuevo
      </button>
    </main>
  );
}
