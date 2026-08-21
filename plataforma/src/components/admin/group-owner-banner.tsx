import { Icon } from '@/components/icons';

/**
 * Aviso para quien tiene VARIOS restaurantes y está dentro de uno. Le
 * recuerda en cuál está y le da una salida de un toque al consolidado de
 * todos, que vive en Mi cuenta.
 */
export default function GroupOwnerBanner({
  branchName,
  returnUrl,
}: {
  branchName: string;
  returnUrl: string;
}) {
  return (
    <div
      className="glass-quiet"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        borderRadius: 14, padding: '11px 15px', marginBottom: 16,
        border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)',
        background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
      }}
    >
      <span style={{ color: 'var(--brand-accent-ink)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <Icon name="box" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--u-text-2)' }}>
        Estás administrando <strong style={{ color: 'var(--u-text)' }}>{branchName}</strong>, uno de tus restaurantes.
      </div>
      <a
        href={returnUrl}
        className="press"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          padding: '8px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
          background: 'var(--u-text)', color: 'var(--brand-bg)', textDecoration: 'none',
        }}
      >
        <Icon name="chevronLeft" size={15} /> Ver todos juntos
      </a>
    </div>
  );
}
