import { Icon } from '@/components/icons';

/**
 * Franja fija mientras un SUPER_ADMIN está dentro del panel de un restaurante
 * con un pase de soporte (ver lib/auth/support-session.ts).
 *
 * Existe para que entrar al panel de un cliente nunca se sienta igual que
 * estar en el propio: si se olvida una pestaña abierta, o si alguien más
 * llega a esa sesión, la pantalla lo dice. Deliberadamente en rojo y sin
 * disimular — no es decoración, es un aviso.
 */
export default function SupportModeBanner({ restaurantName }: { restaurantName: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        borderRadius: 14, padding: '11px 15px', marginBottom: 16,
        border: '1px solid rgba(220,50,50,0.35)',
        background: 'rgba(220,50,50,0.10)',
      }}
    >
      <span style={{ color: '#f87171', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <Icon name="alertCircle" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--u-text-2)' }}>
        <strong style={{ color: 'var(--u-text)' }}>Modo soporte.</strong>{' '}
        Estás dentro del panel de <strong style={{ color: 'var(--u-text)' }}>{restaurantName}</strong>{' '}
        como Super Admin de Leogin. La visita quedó anotada en la bitácora del restaurante.
      </div>
      <a
        href="/admin/soporte/salir"
        className="press"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          padding: '8px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
          background: 'var(--u-text)', color: 'var(--brand-bg)', textDecoration: 'none',
        }}
      >
        Salir del modo soporte
      </a>
    </div>
  );
}
