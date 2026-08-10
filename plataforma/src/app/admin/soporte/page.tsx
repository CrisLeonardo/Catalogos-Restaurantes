import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { Icon } from '@/components/icons';
import { grantSupportAccess } from './actions';

export const metadata = {
  title: 'Entrar como soporte — Leogin',
  robots: { index: false, follow: false },
};

/**
 * Confirmación antes de que el Super Admin entre al panel de un restaurante.
 *
 * Vive FUERA de (protected) a propósito: el candado de tenant manda aquí, así
 * que si esta página estuviera protegida se redirigiría a sí misma para
 * siempre. El mismo motivo por el que /admin/login vive fuera.
 */
export default async function SoportePage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  // Nadie más tiene nada que hacer aquí: el resto de los roles ya fue resuelto
  // por el candado (a su panel, a /central o al login).
  if (profile?.role !== 'SUPER_ADMIN') redirect('/admin/login');

  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) redirect('/super/restaurantes');
  const tenant = await getRestaurantBySlug(slug);
  if (!tenant) redirect('/super/restaurantes');

  const destino = (await searchParams).destino ?? '/admin/menu';

  return (
    <main
      style={{
        minHeight: '100dvh', display: 'grid', placeItems: 'center',
        padding: 24, background: 'var(--u-bg, #0b0b0c)',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 18,
          padding: 26, borderRadius: 18,
          border: '1px solid rgba(220,50,50,0.3)',
          background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#f87171', display: 'grid', placeItems: 'center' }}>
            <Icon name="alertCircle" size={22} />
          </span>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>
            Vas a entrar a un panel que no es tuyo
          </h1>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--u-text-3)', margin: 0 }}>
          Estás por abrir el panel de{' '}
          <strong style={{ color: 'var(--u-text)' }}>{tenant.restaurant.name}</strong> como Super
          Admin de Leogin. Verás sus pedidos, sus clientes y sus finanzas.
        </p>

        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--u-text-3)', margin: 0, paddingLeft: 18 }}>
          <li>Queda anotado en la bitácora del restaurante, con tu nombre y la hora.</li>
          <li>El panel muestra una franja roja mientras dure el acceso.</li>
          <li>El permiso caduca solo a las 2 horas.</li>
        </ul>

        <form action={grantSupportAccess} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="destino" value={destino} />
          <button
            type="submit"
            className="press"
            style={{
              padding: '13px', borderRadius: 999, fontWeight: 600, fontSize: 15,
              border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer',
            }}
          >
            Entrar como soporte
          </button>
          <Link
            href="/super/restaurantes"
            style={{
              padding: '12px', borderRadius: 999, fontWeight: 600, fontSize: 14,
              border: '1px solid var(--u-hair-2)', color: 'var(--u-text-2)',
              textAlign: 'center', textDecoration: 'none',
            }}
          >
            Cancelar
          </Link>
        </form>
      </div>
    </main>
  );
}
