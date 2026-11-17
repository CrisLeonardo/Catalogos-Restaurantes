import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { isModuleActive } from '@/lib/modules';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import TutorialHub from '@/components/admin/tutorial-hub';
import { can } from '@/lib/permissions';
import { abrible, INTENCIONES } from '@/lib/ayuda/intenciones';

export const metadata: Metadata = { title: 'Ayuda – Panel admin' };

export default async function AyudaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const restaurant = ctx.restaurant;
  const plan = (restaurant?.plan_actual as string | null) ?? null;
  const mod = restaurant?.modules as Record<string, boolean> | null;
  const modSettings = restaurant?.module_settings ?? null;

  const modules: Record<string, boolean> = {
    orders:       mod?.orders === true,
    analitica:    mod?.analitica === true,
    inventario:   mod?.inventario === true,
    finanzas:     mod?.finanzas === true,
    personal:     mod?.personal === true,
    loyalty:      isModuleActive(mod, modSettings, 'loyalty'),
    fel:          isModuleActive(mod, modSettings, 'fel'),
    proveedores:  isModuleActive(mod, modSettings, 'proveedores'),
    encuestas:    isModuleActive(mod, modSettings, 'encuestas'),
    reservaciones: isModuleActive(mod, modSettings, 'reservaciones'),
    cupones:      isModuleActive(mod, modSettings, 'cupones'),
    recetas:      isModuleActive(mod, modSettings, 'recetas'),
  };

  const contact = await getPlatformContactSettings();

  /* Ficha 2.9 (R39.3): ninguna respuesta lleva a una pantalla que esta
     persona no puede abrir; la de un cocinero dice a quién pedírselo. */
  const { role, permissions } = ctx.profile;
  const puede = (s: string) => role === 'SUPER_ADMIN' || can(role, permissions, s);
  const abribles = INTENCIONES.filter((i) => abrible(i, puede)).map((i) => i.id);

  return (
    <TutorialHub
      plan={plan}
      modules={modules}
      contact={contact}
      abribles={abribles}
      restaurantId={restaurant?.id ?? null}
      restaurante={restaurant?.name ?? 'mi restaurante'}
      version={process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local'}
      consultaInicial={((await searchParams).q ?? '').slice(0, 120)}
    />
  );
}
