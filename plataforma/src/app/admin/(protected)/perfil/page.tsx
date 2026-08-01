import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/admin/profile-form';
import CollapsibleCard from '@/components/admin/collapsible-card';
import { Icon } from '@/components/icons';
import Link from 'next/link';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Perfil – Panel admin' };

export default async function AdminPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const sp = await searchParams;
  const saved = sp.saved === '1';

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  // Cargar datos del restaurante
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) redirect('/admin/login');

  return (
    <div className="anim-fade-up">
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 22,
          marginBottom: 24,
        }}
      >
        Perfil del restaurante
      </h1>

      {saved && (
        <div
          style={{
            marginBottom: 20,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(50,200,100,0.12)',
            border: '1px solid rgba(50,200,100,0.25)',
            color: 'var(--c-ok)',
            fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="checkCircle" size={16} /> Cambios guardados correctamente
        </div>
      )}

      <CollapsibleCard title="Datos del restaurante" icon="user" storageKey="perfil-datos" defaultOpen>
        <ProfileForm
          restaurantId={restaurantId}
          restaurant={restaurant as Restaurant}
        />
      </CollapsibleCard>

      {/* Horario, mapa de entrega, moneda/pedidos e impresión ya no viven en
          Perfil — se movieron a sus propias secciones. Aquí quedan solo los
          punteros para quien las busca en Perfil por costumbre. */}
      <div style={{ borderTop: '1px solid var(--u-hair)', marginTop: 24, paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link
          href="/admin/ajustes"
          className={cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3 p-3.5 no-underline text-inherit')}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text)' }}>
            <Icon name="settings" size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>Ajustes</div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
              Horario, mapa de entrega, moneda/pedidos y este dispositivo.
            </div>
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', marginLeft: 'auto', flexShrink: 0 }} />
        </Link>
        <Link
          href="/admin/mi-pc"
          className={cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3 p-3.5 no-underline text-inherit')}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text)' }}>
            <Icon name="print" size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>Mi PC del local</div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
              La computadora que imprime sola y mantiene el local trabajando sin internet.
            </div>
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', marginLeft: 'auto', flexShrink: 0 }} />
        </Link>
      </div>
    </div>
  );
}
