import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { listStaff, getActivityLog } from '@/lib/actions/staff';
import { ADMIN_SECTIONS, type SectionKey } from '@/lib/permissions';
import { isModuleActive, type ModulesMap, type ModuleSettings } from '@/lib/modules';
import StaffPanel from '@/components/admin/staff-panel';
import AccessLogPanel from '@/components/admin/access-log-panel';
import { getPanelAccessLog } from '@/lib/auth/access-log';

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
  const [staff, activity, accessLog, { data: restaurant }, { data: themeRow }] = await Promise.all([
    listStaff(restaurantId),
    getActivityLog(restaurantId, 30),
    getPanelAccessLog(restaurantId, 20),
    db.from('restaurants').select('modules, module_settings, plan_actual, timezone').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);

  // No confundir al dueño con secciones que ni él mismo tiene activas (ej.
  // Facturación/Proveedores si no los ha prendido) — mismo criterio que
  // filtra el nav en AdminShell.
  const mod = (restaurant?.modules as ModulesMap) ?? null;
  const modSettings = (restaurant?.module_settings as ModuleSettings | null) ?? null;
  const planActual = (restaurant?.plan_actual as string | null) ?? null;
  const ordersEnabled = mod?.['orders'] === true;
  const hasWaiterPanel = planActual !== 'BASICO' && planActual !== 'ESTANDAR';
  // Igual que en mesas/page.tsx: "comer en local" activo también da acceso
  // a Mesas, aunque el plan no incluya el panel de mesero completo.
  const dineInEnabled = resolveTheme((themeRow as ThemeRow) ?? null).config.orderTypes.includes('dine_in');
  const mesasAccessible = hasWaiterPanel || dineInEnabled;
  const GATES: Partial<Record<SectionKey, boolean>> = {
    mesero: ordersEnabled && hasWaiterPanel,
    mesas: ordersEnabled && mesasAccessible,
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
  };
  const enabledSections = ADMIN_SECTIONS.map((s) => s.key).filter((k) => GATES[k] ?? true);

  return (
    <div className="anim-fade-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Link
          href="/admin/personal/propinas"
          className="press"
          style={{
            padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600,
            border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
            color: 'var(--u-text)', textDecoration: 'none',
          }}
        >
          Reparto de propinas →
        </Link>
      </div>
      <StaffPanel restaurantId={restaurantId} staff={staff} activity={activity} enabledSections={enabledSections} />
      <AccessLogPanel
        rows={accessLog}
        timezone={(restaurant?.timezone as string) || 'America/Guatemala'}
      />
    </div>
  );
}
