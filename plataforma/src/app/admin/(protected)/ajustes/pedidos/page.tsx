import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import OrdersCurrencyEditor from '@/components/admin/orders-currency-editor';

export const metadata = { title: 'Pedidos y cobro – Panel admin' };

/* /admin/ajustes/pedidos — cómo se cobra y cómo entran los pedidos.
   Era el acordeón "Pedidos y moneda" de la pantalla de horarios: trece
   ajustes en una sola tarjeta, separados por rótulos. Ahora es su propia
   pantalla y cada bloque es un grupo con nombre. */

export default async function AdminPedidosAjustesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const resolved = resolveTheme((themeRow as ThemeRow) ?? null);

  return (
    <div className="anim-fade-up max-w-[720px]">
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
          salonReadyMin: resolved.config.salonReadyMin,
          salonUnpaidMin: resolved.config.salonUnpaidMin,
          salonUnacceptedMin: resolved.config.salonUnacceptedMin,
          autoConfirmEnabled: resolved.config.autoConfirmEnabled,
          autoConfirmMinutes: resolved.config.autoConfirmMinutes,
        }}
      />
    </div>
  );
}
