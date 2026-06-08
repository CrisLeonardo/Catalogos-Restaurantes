import { Glass } from '@/components/glass';

export default function NotFound() {
  return (
    <main
      style={{
        width: '100%', maxWidth: 440,
        margin: '0 auto', padding: '28px 16px 64px',
      }}
    >
      <Glass style={{ padding: '48px 28px', textAlign: 'center' }}>
        <p className="t-kicker" style={{ fontSize: 10, marginBottom: 18, letterSpacing: '0.2em' }}>
          404
        </p>
        <h1 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 14 }}>
          Restaurante no encontrado
        </h1>
        <p className="t-mute" style={{ fontSize: 14, lineHeight: 1.6 }}>
          Este subdominio no corresponde a ningún restaurante activo en la plataforma.
        </p>
      </Glass>
    </main>
  );
}
