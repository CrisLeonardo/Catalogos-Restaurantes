import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import CollapsibleCard from '@/components/admin/collapsible-card';
import DesktopServerSettings from '@/components/admin/desktop-server-settings';
import HoursEditor from '@/components/admin/hours-editor';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import OrdersCurrencyEditor from '@/components/admin/orders-currency-editor';
import MenuLanguagesEditor from '@/components/admin/menu-languages-editor';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Ajustes – Panel admin' };

export default async function AdminAjustesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

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

  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) redirect('/admin/login');

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
        Ajustes
      </h1>

      <CollapsibleCard title="Este dispositivo" icon="monitor" storageKey="ajustes-dispositivo" defaultOpen>
        <DesktopServerSettings />
      </CollapsibleCard>

      <CollapsibleCard title="Horario y pedidos" icon="clock" storageKey="ajustes-horario" defaultOpen={false}>
        <HoursEditor restaurant={restaurant as Restaurant} />
      </CollapsibleCard>

      <CollapsibleCard
        title="Mapa de entrega (por radio)"
        icon="mapPin"
        storageKey="ajustes-mapa"
        defaultOpen={false}
        subtitle="Activa esto para que el cliente vea un mapa interactivo en el checkout y coloque su pin. El pedido se rechaza si el pin cae fuera del radio."
      >
        <RestaurantLocationEditor restaurant={restaurant as Restaurant} />
      </CollapsibleCard>

      <CollapsibleCard title="Idiomas del menú" icon="globe" storageKey="ajustes-idiomas" defaultOpen={false}>
        <MenuLanguagesEditor restaurant={restaurant as Restaurant} />
      </CollapsibleCard>

      <CollapsibleCard title="Pedidos y moneda" icon="wallet" storageKey="ajustes-pedidos" defaultOpen={false}>
        <OrdersCurrencyEditor
          restaurantId={restaurantId}
          config={{
            orderTypes: resolved.config.orderTypes,
            dineInTableCount: resolved.config.dineInTableCount,
            dineInCourseOptions: resolved.config.dineInCourseOptions,
            tipEnabled: resolved.config.tipEnabled,
            tipPercent: resolved.config.tipPercent,
            tipOrderTypes: resolved.config.tipOrderTypes,
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
    </div>
  );
}
