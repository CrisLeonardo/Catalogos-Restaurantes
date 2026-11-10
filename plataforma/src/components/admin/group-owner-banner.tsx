import { Icon } from '@/components/icons';

/**
 * Para quien tiene VARIOS restaurantes y está dentro de uno: en cuál está y
 * una salida de un toque al consolidado de todos, que vive en Mi cuenta.
 *
 * Es UNA línea y no una caja: sale en todas las pantallas del panel, y como
 * tarjeta de color con botón se comía cien píxeles del teléfono en cada una
 * para decir algo que el dueño ya sabe. El nombre del restaurante lo repite
 * a propósito: es lo único que distingue un panel de otro.
 */
export default function GroupOwnerBanner({
  branchName,
  returnUrl,
}: {
  branchName: string;
  returnUrl: string;
}) {
  return (
    <a
      href={returnUrl}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
        minHeight: 44, marginTop: -8, marginBottom: 4, fontSize: 13,
        color: 'var(--u-text-2)', textDecoration: 'none',
      }}
    >
      <Icon name="chevronLeft" size={15} />
      <strong style={{ color: 'var(--u-text)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {branchName}
      </strong>
      <span style={{ whiteSpace: 'nowrap' }}>· Ver todos</span>
    </a>
  );
}
