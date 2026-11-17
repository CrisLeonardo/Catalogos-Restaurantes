/* Turno de práctica (ficha 2.5 de la auditoría, A05).
   ------------------------------------------------------------------
   Una «Mesa P» con la carta real y las piezas de Tomar pedidos, pero
   sin escribir nada: ver `components/admin/servicio/turno-practica.tsx`.
   Esta página resuelve el restaurante como Tomar pedidos y le pasa solo
   lo que la práctica usa: la carta, los favoritos, los alias y la moneda. */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getStaffUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { resolveOwnRestaurantId, resolveEffectiveRole } from '@/lib/db/membership';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { getWaiterCatalogCached } from '@/lib/db/menu';
import { withEffectiveAvailability } from '@/lib/product-availability';
import { getMasPedidosCached, getPreferenciasServicio } from '@/lib/db/servicio';
import { prepararPuestos, rolDeServicio } from '@/lib/servicio/turno';
import TurnoPractica from '@/components/admin/servicio/turno-practica';

export const metadata = { title: 'Turno de práctica – Panel admin' };

export default async function TurnoPracticaPage() {
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const db = createServiceClient();
  const slug = (await headers()).get('x-tenant-slug') ?? null;
  const { data: profile } = await db
    .from('profiles').select('role, restaurant_id, permissions').eq('id', user.id).single();

  let restaurantId = await resolveGroupBranchId() ?? await resolveOwnRestaurantId(profile?.restaurant_id as string | null);
  if (!restaurantId && profile?.role === 'SUPER_ADMIN' && slug) {
    restaurantId = (await getRestaurantBySlug(slug))?.restaurant.id ?? null;
  }
  if (!restaurantId) return null;

  /* Practica quien puede tomar pedidos o cobrar: es lo que se practica. */
  const efectivo = await resolveEffectiveRole(
    { role: (profile?.role as string) ?? '', permissions: (profile?.permissions as string[] | null) ?? null },
    restaurantId,
  );
  const esSuper = profile?.role === 'SUPER_ADMIN';
  if (!esSuper && !can(efectivo.role, efectivo.permissions, 'mesero') && !can(efectivo.role, efectivo.permissions, 'caja.cobrar')) {
    redirect('/admin');
  }

  const { data: r } = await db.from('restaurants').select('slug').eq('id', restaurantId).single();
  const config = (await getRestaurantBySlug(slug ?? (r?.slug as string | null) ?? ''))?.resolved.config ?? null;

  const [catalogo, masPedidos, preferencias] = await Promise.all([
    getWaiterCatalogCached(restaurantId),
    getMasPedidosCached(restaurantId),
    getPreferenciasServicio(restaurantId),
  ]);
  const products = withEffectiveAvailability(catalogo.products);
  const rol = rolDeServicio(esSuper ? 'SUPER_ADMIN' : efectivo.role);

  return (
    <TurnoPractica
      restaurantId={restaurantId}
      products={products}
      categories={catalogo.categories}
      puestos={prepararPuestos(preferencias.favoritos[rol], masPedidos, products)}
      alias={preferencias.alias}
      currency={{
        symbol: config?.currencySymbol ?? 'Q',
        position: config?.currencyPosition ?? 'prefix',
        locale: config?.locale ?? 'es-GT',
      }}
    />
  );
}
