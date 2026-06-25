import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/db/admin';
import { isModuleActive } from '@/lib/modules';
import TutorialHub from '@/components/admin/tutorial-hub';

export const metadata: Metadata = { title: 'Ayuda — Panel Admin' };

export default async function AyudaPage() {
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
    promociones:  mod?.promociones === true,
    personal:     mod?.personal === true,
    loyalty:      isModuleActive(mod, modSettings, 'loyalty'),
    fel:          isModuleActive(mod, modSettings, 'fel'),
    proveedores:  isModuleActive(mod, modSettings, 'proveedores'),
    encuestas:    isModuleActive(mod, modSettings, 'encuestas'),
    reservaciones: isModuleActive(mod, modSettings, 'reservaciones'),
    cupones:      isModuleActive(mod, modSettings, 'cupones'),
    recetas:      isModuleActive(mod, modSettings, 'recetas'),
  };

  return <TutorialHub plan={plan} modules={modules} />;
}
