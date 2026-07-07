import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import ProfileForm from '@/components/admin/profile-form';
import CollapsibleCard from '@/components/admin/collapsible-card';
import { Icon } from '@/components/icons';
import HoursEditor from '@/components/admin/hours-editor';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import OrdersCurrencyEditor from '@/components/admin/orders-currency-editor';
import Link from 'next/link';
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

  // Cargar configuración de tema (pedidos y moneda)
  const db = createServiceClient();
  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const resolved = resolveTheme((themeRow as ThemeRow) ?? null);

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
            color: '#4ade80',
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

      <CollapsibleCard title="Horario y pedidos" icon="clock" storageKey="perfil-horario" defaultOpen={false}>
        <HoursEditor restaurant={restaurant as Restaurant} />
      </CollapsibleCard>

      <CollapsibleCard
        title="Mapa de entrega (por radio)"
        icon="mapPin"
        storageKey="perfil-mapa"
        defaultOpen={false}
        subtitle="Activa esto para que el cliente vea un mapa interactivo en el checkout y coloque su pin. El pedido se rechaza si el pin cae fuera del radio."
      >
        <RestaurantLocationEditor restaurant={restaurant as Restaurant} />
      </CollapsibleCard>

      <CollapsibleCard title="Pedidos y moneda" icon="wallet" storageKey="perfil-pedidos" defaultOpen={false}>
        <OrdersCurrencyEditor
          restaurantId={restaurantId}
          config={{
            orderTypes: resolved.config.orderTypes,
            dineInTableCount: resolved.config.dineInTableCount,
            dineInCourseOptions: resolved.config.dineInCourseOptions,
            tipEnabled: resolved.config.tipEnabled,
            tipPercent: resolved.config.tipPercent,
            acceptsCard: resolved.config.acceptsCard,
            currencySymbol: resolved.config.currencySymbol,
            currencyPosition: resolved.config.currencyPosition,
            locale: resolved.config.locale,
            animations: resolved.config.animations,
            kdsYellowMin: resolved.config.kdsYellowMin,
            kdsRedMin: resolved.config.kdsRedMin,
            kdsConfirmFirst: resolved.config.kdsConfirmFirst,
            autoConfirmEnabled: resolved.config.autoConfirmEnabled,
            autoConfirmMinutes: resolved.config.autoConfirmMinutes,
          }}
        />
      </CollapsibleCard>

      {/* La impresión y el modo offline se movieron a su propia sección
          (/admin/impresion) — aquí queda solo el puntero para quien la
          buscaba en Perfil por costumbre. */}
      <div style={{ borderTop: '1px solid var(--u-hair)', marginTop: 24, paddingTop: 20 }}>
        <Link
          href="/admin/impresion"
          className="glass press"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 14,
            borderRadius: 16, textDecoration: 'none', color: 'inherit',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text)' }}>
            <Icon name="print" size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>Impresión y modo offline</div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
              El Agente Leogin (impresión automática + respaldo sin internet) ahora tiene su propia sección.
            </div>
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', marginLeft: 'auto', flexShrink: 0 }} />
        </Link>
      </div>
    </div>
  );
}
