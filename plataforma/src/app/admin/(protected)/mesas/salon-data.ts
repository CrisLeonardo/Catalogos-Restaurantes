import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { PLANS, type PlanCode } from '@/lib/plans';
import type { ThemeConfig } from '@/lib/theme/defaults';

/**
 * Lo que necesitan las DOS pantallas del salón.
 *
 * Desde el rediseño de 2026-08-26, «Mesas» se partió en dos:
 *
 *   · `/admin/mesas` — la OPERACIÓN: qué está pasando en el salón ahora.
 *   · `/admin/ajustes/salon` — la CONFIGURACIÓN: cuántas mesas hay, sus
 *     códigos QR, el plano por niveles y la propina.
 *
 * Antes las dos vivían en la misma pantalla, que se llamaba como la
 * primera y enseñaba solo la segunda. Al separarlas, la resolución del
 * restaurante (tenant por subdominio o contexto del dueño), su
 * configuración y su plan tenían que existir por duplicado — así que
 * viven aquí una sola vez.
 */
export interface SalonData {
  restaurantId: string | null;
  slug: string | null;
  config: ThemeConfig | null;
  /** El panel de mesero es de Premium; también entra el super admin. */
  hasWaiterPanel: boolean;
  /** Un ESTANDAR con el paquete "Local" depende igual de esta pantalla. */
  hasDineIn: boolean;
  isSuperAdmin: boolean;
  /** URL pública del menú, para los códigos QR de mesa. */
  menuUrl: string | null;
  /** Zona horaria del restaurante: el día del salón no acaba a medianoche UTC. */
  timezone: string;
}

export async function getSalonData(): Promise<SalonData> {
  const ctx = await getAdminContext();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  let slug = tenantSlug ?? ctx?.restaurant?.slug ?? null;
  let restaurantId: string | null = null;
  let config: ThemeConfig | null = null;
  let planActual: string | null = null;
  let timezone = 'America/Guatemala';

  if (tenantSlug) {
    const data = await getRestaurantBySlug(tenantSlug);
    if (data) {
      restaurantId = data.restaurant.id;
      slug = tenantSlug;
      config = data.resolved.config;
      planActual = data.restaurant.plan_actual ?? null;
      timezone = data.restaurant.timezone ?? timezone;
    }
  } else if (ctx?.restaurant) {
    restaurantId = ctx.restaurant.id;
    slug = ctx.restaurant.slug;
    planActual = ctx.restaurant.plan_actual ?? null;
    timezone = ctx.restaurant.timezone ?? timezone;
    if (slug) {
      const data = await getRestaurantBySlug(slug);
      if (data) config = data.resolved.config;
    }
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const protocol = rootDomain.includes('localhost') ? 'http' : 'https';

  return {
    restaurantId,
    slug,
    config,
    hasWaiterPanel: PLANS[(planActual ?? 'BASICO') as PlanCode]?.hasWaiterPanel ?? false,
    hasDineIn: config?.orderTypes.includes('dine_in') ?? false,
    isSuperAdmin: ctx?.profile.role === 'SUPER_ADMIN',
    menuUrl: slug ? `${protocol}://${slug}.${rootDomain}` : null,
    timezone,
  };
}
