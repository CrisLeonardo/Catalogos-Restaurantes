import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import TablesPanel from '@/components/admin/tables-panel';
import PlanLockedScreen from '@/components/admin/plan-locked-screen';
import { PLANS, type PlanCode } from '@/lib/plans';
import type { ThemeConfig } from '@/lib/theme/defaults';

export const metadata = { title: 'Mesas — Panel Admin' };

export default async function MesasPage() {
  const ctx = await getAdminContext();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  let slug = tenantSlug ?? ctx?.restaurant?.slug ?? null;
  let restaurantId: string | null = null;
  let resolvedConfig: ThemeConfig | null = null;
  let planActual: string | null = null;

  if (tenantSlug) {
    const data = await getRestaurantBySlug(tenantSlug);
    if (data) {
      restaurantId = data.restaurant.id;
      slug = tenantSlug;
      resolvedConfig = data.resolved.config;
      planActual = data.restaurant.plan_actual ?? null;
    }
  } else if (ctx?.restaurant) {
    restaurantId = ctx.restaurant.id;
    slug = ctx.restaurant.slug;
    planActual = ctx.restaurant.plan_actual ?? null;
    if (slug) {
      const data = await getRestaurantBySlug(slug);
      if (data) resolvedConfig = data.resolved.config;
    }
  }

  // Gestión de mesas es exclusiva de Premium — no se vende a la carta. Un
  // restaurante BASICO/ESTANDAR no debe poder usarla aunque conozca la URL.
  const hasWaiterPanel = PLANS[(planActual ?? 'BASICO') as PlanCode]?.hasWaiterPanel ?? false;
  if (ctx?.profile.role !== 'SUPER_ADMIN' && !hasWaiterPanel) {
    return (
      <PlanLockedScreen
        feature="Gestión de mesas"
        description="El mapa de mesas y el control de estado (libre, ocupada, por cobrar) son parte del panel de mesero, exclusivo del plan Premium."
        icon="grid"
      />
    );
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const isLocal = rootDomain.includes('localhost');
  const protocol = isLocal ? 'http' : 'https';
  const menuUrl = slug ? `${protocol}://${slug}.${rootDomain}` : null;

  if (!restaurantId || !resolvedConfig) {
    return (
      <p style={{ fontSize: 14, color: 'var(--u-text-3)' }}>
        No se pudo cargar la configuración del restaurante.
      </p>
    );
  }

  const c = resolvedConfig;

  return (
    <TablesPanel
      restaurantId={restaurantId}
      menuUrl={menuUrl}
      config={{
        orderTypes: c.orderTypes,
        dineInTableCount: c.dineInTableCount,
        dineInCourseOptions: c.dineInCourseOptions,
        tipEnabled: c.tipEnabled,
        tipPercent: c.tipPercent,
        acceptsCard: c.acceptsCard,
        currencySymbol: c.currencySymbol,
        currencyPosition: c.currencyPosition,
        locale: c.locale,
        animations: c.animations,
        floorPlan: c.floorPlan,
      }}
    />
  );
}
