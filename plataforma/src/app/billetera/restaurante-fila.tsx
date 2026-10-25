/* eslint-disable @next/next/no-img-element -- logos de cualquier origen, pequeños */

/** Una fila de «Mis restaurantes»: logo (o inicial), nombre y flecha. */
export function RestauranteFila({ nombre, logoUrl, href }: { nombre: string; logoUrl: string | null; href: string }) {
  return (
    <a
      href={href}
      className="press"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
        borderRadius: 12, textDecoration: 'none', color: 'var(--u-text)', minHeight: 56,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
          display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 16,
          background: 'color-mix(in srgb, var(--u-text) 7%, transparent)', color: 'var(--u-text-2)',
        }}
      >
        {logoUrl
          ? <img src={logoUrl} alt="" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'cover' }} />
          : nombre.charAt(0).toUpperCase()}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {nombre}
      </span>
      <span style={{ color: 'var(--u-text-3)', fontSize: 22, lineHeight: 1 }} aria-hidden>›</span>
    </a>
  );
}
