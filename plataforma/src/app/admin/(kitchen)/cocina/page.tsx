import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { resolveOwnRestaurantId } from '@/lib/db/membership';
import { getKitchenOrders } from '@/lib/db/orders';
import { getPrintStations, getFallosDeImpresion } from '@/lib/db/print-stations';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import KitchenDisplay from '@/components/admin/kitchen-display';

export const metadata = { title: 'Cocina (KDS)' };

export default async function CocinaPage() {
  const { data: { user } } = await getStaffUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const slug = (await headers()).get('x-tenant-slug');

  const { data: profile } = await db
    .from('profiles')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single();

  // El restaurante del subdominio si es suyo por membresía: el dueño del
  // modelo de membresías (migración 113) no tiene `restaurant_id` en el
  // perfil, y sin esto Cocina lo devolvía al login con la sesión abierta.
  // SUPER_ADMIN no tiene restaurant_id propio: lo resolvemos del slug de tenant.
  let restaurantId = await resolveOwnRestaurantId(profile?.restaurant_id as string | null);
  if (!restaurantId && profile?.role === 'SUPER_ADMIN' && slug) {
    const tenant = await getRestaurantBySlug(slug);
    restaurantId = tenant?.restaurant.id ?? null;
  }
  if (!restaurantId) redirect('/admin/login');

  const { data: themeRow } = await db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single();
  const cfg = resolveTheme((themeRow as ThemeRow) ?? null).config;
  const [orders, estaciones] = await Promise.all([
    getKitchenOrders(restaurantId, cfg.kdsConfirmFirst),
    getPrintStations(restaurantId),
  ]);
  const pedidosDeMesa = orders.filter((o) => o.order_type === 'DINE_IN').map((o) => o.id);
  const [fallos, rondas] = await Promise.all([
    getFallosDeImpresion(restaurantId, orders.filter((o) => o.status === 'PREP' || o.status === 'READY')
      .map((o) => o.id), true),
    pedidosDeMesa.length > 0 ? db.rpc('leogin_rondas_cocina', {
      p_restaurante: restaurantId, p_pedidos: pedidosDeMesa,
    }) : { data: [] },
  ]);
  const rondasPorPedido = Array.isArray(rondas.data)
    ? Object.fromEntries(rondas.data.map(({ pedido, ronda }: { pedido: string; ronda: number }) => [pedido, ronda]))
    : {};

  // Sigue el switch claro/oscuro del panel admin (cookie `admin-theme`), NO
  // el tema del restaurante — la paleta de alto contraste del KDS es fija
  // para legibilidad, pero antes ignoraba también este switch y se quedaba
  // siempre oscura.
  const scheme = (await cookies()).get('admin-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <KitchenDisplay
      restaurantId={restaurantId}
      initialOrders={orders}
      estaciones={estaciones.map(({ id, name }) => ({ id, name }))}
      fallos={fallos}
      rondas={rondasPorPedido}
      yellowMin={cfg.kdsYellowMin}
      redMin={cfg.kdsRedMin}
      confirmFirst={cfg.kdsConfirmFirst}
      scheme={scheme}
    />
  );
}
