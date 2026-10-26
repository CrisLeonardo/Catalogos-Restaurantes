import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import LeoginLogo from '@/components/leogin-logo';

export const metadata: Metadata = {
  title: 'Mis restaurantes — Leogin',
  robots: { index: false, follow: false },
};

/**
 * La billetera del comensal vive SOLO en el dominio raíz
 * (PLAN_BILLETERA_COMENSAL_2026-10-25, BIL-00a): en el host de un
 * restaurante no existe, para que nadie la confunda con algo del local.
 */
export default async function BilleteraLayout({ children }: { children: React.ReactNode }) {
  if ((await headers()).get('x-tenant-slug')) notFound();

  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 16px', display: 'flex', alignItems: 'center',
        }}
      >
        <Link href="/billetera" style={{ textDecoration: 'none' }} aria-label="Mis restaurantes">
          <LeoginLogo size={24} />
        </Link>
      </header>
      <div
        className="anim-fade-up"
        style={{ flex: 1, display: 'grid', placeItems: 'start center', padding: '32px 16px 64px' }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>{children}</div>
      </div>
    </main>
  );
}
