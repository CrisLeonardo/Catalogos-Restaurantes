import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import ModulesPanel from '@/components/admin/modules-panel';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import type { ModulesMap, ModuleSettings } from '@/lib/modules';
import type { OrderType } from '@/lib/theme/defaults';

export const metadata = { title: 'Módulos – Panel admin' };

export default async function ModulosPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  // Activar módulos es decisión de propietario (o Leogin).
  if (ctx.profile.role !== 'RESTAURANT_OWNER' && ctx.profile.role !== 'SUPER_ADMIN') {
    redirect('/admin/menu');
  }

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const [{ data: rest }, { data: theme }, contact] = await Promise.all([
    db.from('restaurants').select('modules, module_settings, plan_actual').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('config').eq('restaurant_id', restaurantId).maybeSingle(),
    getPlatformContactSettings(),
  ]);

  const planActual = (rest?.plan_actual as string | null) ?? null;
  // BASICO y ESTANDAR solo pueden usar pickup; los otros tipos quedan bloqueados en la UI.
  const pickupOnlyPlan = planActual === 'BASICO' || planActual === 'ESTANDAR';
  const defaultOrderTypes: OrderType[] = pickupOnlyPlan ? ['pickup'] : ['dine_in', 'delivery', 'pickup'];
  const orderTypes: OrderType[] =
    (theme?.config as Record<string, unknown> | null)?.orderTypes as OrderType[] | undefined
    ?? defaultOrderTypes;

  return (
    <div className="anim-fade-up">
      <ModulesPanel
        restaurantId={restaurantId}
        modules={(rest?.modules as ModulesMap) ?? null}
        settings={(rest?.module_settings as ModuleSettings) ?? {}}
        orderTypes={orderTypes}
        supportWhatsapp={contact.support_whatsapp}
        planActual={planActual}
      />
    </div>
  );
}
