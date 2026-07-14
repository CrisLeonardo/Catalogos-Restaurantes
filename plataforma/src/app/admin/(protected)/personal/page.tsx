import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { listStaff, getActivityLog } from '@/lib/actions/staff';
import { ADMIN_SECTIONS, type SectionKey } from '@/lib/permissions';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import StaffPanel from '@/components/admin/staff-panel';

export const metadata = { title: 'Personal – Panel admin' };

/* /admin/personal — gestión de staff (solo el dueño) + bitácora de actividad. */
export default async function AdminPersonalPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  // Solo el dueño (o super admin) gestiona personal.
  if (ctx.profile.role !== 'RESTAURANT_OWNER' && ctx.profile.role !== 'SUPER_ADMIN') {
    redirect('/admin/menu');
  }

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) restaurantId = (await getRestaurantBySlug(slug))?.restaurant.id ?? null;
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const [staff, activity, { data: restaurant }] = await Promise.all([
    listStaff(restaurantId),
    getActivityLog(restaurantId, 30),
    db.from('restaurants').select('modules, module_settings, plan_actual').eq('id', restaurantId).single(),
  ]);

  // No confundir al dueño con secciones que ni él mismo tiene activas (ej.
  // Facturación/Proveedores si no los ha prendido) — mismo criterio que
  // filtra el nav en AdminShell.
  const mod = (restaurant?.modules as ModulesMap) ?? null;
  const modSettings = (restaurant?.module_settings as ModuleSettings | null) ?? null;
  const planActual = (restaurant?.plan_actual as string | null) ?? null;
  const ordersEnabled = mod?.['orders'] === true;
  const hasWaiterPanel = planActual !== 'BASICO' && planActual !== 'ESTANDAR';
  const GATES: Partial<Record<SectionKey, boolean>> = {
    mesero: ordersEnabled && hasWaiterPanel,
    mesas: ordersEnabled && hasWaiterPanel,
    pedidos: ordersEnabled,
    cocina: ordersEnabled,
    impresion: ordersEnabled,
    clientes: ordersEnabled,
    inventario: mod?.['inventario'] === true,
    ingredientes: isModuleActive(mod, modSettings, 'recetas'),
    proveedores: isModuleActive(mod, modSettings, 'proveedores'),
    fel: isModuleActive(mod, modSettings, 'fel'),
    loyalty: isModuleActive(mod, modSettings, 'loyalty'),
    analitica: mod?.['analitica'] === true,
    finanzas: mod?.['finanzas'] === true,
    promociones: mod?.['promociones'] === true,
  };
  const enabledSections = ADMIN_SECTIONS.map((s) => s.key).filter((k) => GATES[k] ?? true);

  return (
    <div className="anim-fade-up">
      <StaffPanel restaurantId={restaurantId} staff={staff} activity={activity} enabledSections={enabledSections} />
    </div>
  );
}
