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
import TrustedDevicesPanel from '@/components/admin/trusted-devices-panel';
import EntryPinCard from '@/components/admin/entry-pin-card';
import InvitationsPanel from '@/components/admin/invitations-panel';
import { listPendingInvitations } from '@/lib/auth/invitations';
import { getPanelAccessLog } from '@/lib/auth/access-log';
import { listTrustedDevices } from '@/lib/auth/trusted-device';

export const metadata = { title: 'Personal – Panel admin' };

/* /admin/personal — gestión de staff (solo el dueño) + bitácora de actividad. */
export default async function AdminPersonalPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  // El dueño, el super admin y —desde la migración 113— el GERENTE de esta
  // sucursal, que es quien da de alta a su propio equipo. Lo que el gerente
  // no puede hacer se corta en las acciones (lib/actions/staff.ts), no
  // escondiendo la pantalla.
  const isManager = ctx.memberRole === 'MANAGER';
  if (!isManager && ctx.profile.role !== 'RESTAURANT_OWNER' && ctx.profile.role !== 'SUPER_ADMIN') {
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
  const [staff, activity, accessLog, devices, invitations, { data: restaurant }, { data: themeRow }] = await Promise.all([
    listStaff(restaurantId),
    getActivityLog(restaurantId, 30),
    getPanelAccessLog(restaurantId, 20),
    listTrustedDevices(restaurantId),
    listPendingInvitations(restaurantId),
    // `slug` viene con lo demás: es la segunda mitad de la credencial del
    // administrador (`carlos@rincon-502`), lo que hace que sirva también
    // fuera del subdominio de este local.
    db.from('restaurants').select('slug, modules, module_settings, plan_actual, timezone').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
  ]);

  // Las columnas de los candados van en su PROPIA consulta, aparte y tolerante
  // a fallo: viven en las migraciones 112 y 113. Pedirlas en la consulta de
  // arriba haría que, entre desplegar el código y aplicar las migraciones, esa
  // consulta fallara ENTERA y la pantalla se quedara sin plan, sin módulos y
  // sin zona horaria — una pantalla rota por dos columnas que ni siquiera son
  // el asunto principal. Así, mientras no existan, los candados salen apagados
  // y el resto de Personal funciona igual.
  let requiresTrustedDevice = false;
  let hasEntryPin = false;
  try {
    const { data: locks } = await db
      .from('restaurants')
      .select('pin_requires_trusted_device, entry_pin_hash')
      .eq('id', restaurantId)
      .maybeSingle();
    requiresTrustedDevice = locks?.pin_requires_trusted_device === true;
    hasEntryPin = !!locks?.entry_pin_hash;
  } catch {
    /* migraciones sin aplicar → sin candados, como antes */
  }

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
      <StaffPanel
        restaurantId={restaurantId}
        slug={(restaurant?.slug as string | null) ?? null}
        staff={staff}
        activity={activity}
        enabledSections={enabledSections}
        isOwner={!isManager}
      />
      {/* Invitaciones por correo: se retiraron de la pantalla. El acceso del
          administrador se crea aquí mismo, con usuario y contraseña, que es
          lo que un dueño puede dictar por WhatsApp sin depender de que la
          otra persona tenga correo, lo revise, y de que nuestro proveedor de
          correo esté en pie. Este bloque solo aparece si quedan invitaciones
          vivas de antes, para poder revocarlas — cuando no queda ninguna,
          desaparece solo y para siempre. */}
      {!isManager && invitations.length > 0 && (
        <InvitationsPanel restaurantId={restaurantId} invitations={invitations} />
      )}
      <TrustedDevicesPanel
        restaurantId={restaurantId}
        devices={devices}
        requiresTrusted={requiresTrustedDevice}
      />
      {/* El candado de Mi cuenta es del dueño: un gerente no le pone a su
          jefe un PIN que su jefe no conoce. */}
      {!isManager && (
        <EntryPinCard restaurantId={restaurantId} hasPin={hasEntryPin} />
      )}
      <AccessLogPanel
        rows={accessLog}
        timezone={(restaurant?.timezone as string) || 'America/Guatemala'}
      />
    </div>
  );
}
