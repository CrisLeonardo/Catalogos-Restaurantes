import { headers } from 'next/headers';
import { Glass } from '@/components/glass';
import { stableRootUrl } from '@/lib/tenant';

/* ============================================================
   404 (auditoría 2026-10-02, CAT-12)
   ------------------------------------------------------------
   Antes decía siempre «Este subdominio no corresponde a ningún
   restaurante activo» y nada más: sin salida, y con ese mismo texto
   de «subdominio» también en el dominio principal, donde no tiene
   sentido. Ahora:
   · en la dirección de un restaurante que no existe, lo dice con
     palabras de comensal, ofrece volver a Leogin y —quien llega
     aquí a veces es el dueño buscando su menú— «Crea tu menú gratis»;
   · en el dominio principal, «esta página no existe» y el inicio.
   ============================================================ */

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 44, padding: '0 20px', borderRadius: 'var(--radius-full)',
  fontSize: 14, fontWeight: 600, textDecoration: 'none',
};

export default async function NotFound() {
  const h = await headers();
  const slug = h.get('x-admin-area') ? null : h.get('x-tenant-slug');
  const root = stableRootUrl();

  return (
    <main
      style={{
        width: '100%', maxWidth: 440,
        margin: '0 auto', padding: '28px 16px 64px',
      }}
    >
      <Glass style={{ padding: '44px 28px', textAlign: 'center' }}>
        <p className="t-kicker" style={{ fontSize: 10, marginBottom: 18, letterSpacing: '0.2em' }}>
          404
        </p>
        <h1 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 14 }}>
          {slug ? 'Este menú no existe' : 'Esta página no existe'}
        </h1>
        <p className="t-mute" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 26 }}>
          {slug
            ? 'No encontramos ningún restaurante en esta dirección. Revisa el enlace o vuelve a escanear el código QR del local.'
            : 'El enlace puede estar mal escrito o la página ya no está aquí.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
          <a href={slug ? root : '/'} className="press btn-accent" style={btnBase}>
            {slug ? 'Ir a Leogin' : 'Ir al inicio'}
          </a>
          {slug && (
            <a
              href={`${root}/registro`}
              className="press"
              style={{ ...btnBase, color: 'var(--u-text-2)', border: '1px solid var(--u-hair-2)' }}
            >
              ¿Es tu restaurante? Crea tu menú gratis
            </a>
          )}
        </div>
      </Glass>
    </main>
  );
}
