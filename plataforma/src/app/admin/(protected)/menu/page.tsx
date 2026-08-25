import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, type PlanCode } from '@/lib/plans';
import CatalogPanel from '@/components/admin/catalog-panel';
import ProductosExportButton from '@/components/admin/productos-export-button';
import { OffMenuWidget, type OffMenuItem } from '@/components/admin/off-menu-widget';
import { isUnavailable } from '@/lib/product-availability';

export const metadata = { title: 'Catálogo – Panel admin' };

/** "hace 20 min" / "hace 3 h". Nunca pasa de doce horas: a las doce el
 *  platillo vuelve solo al menú y deja de estar en esta lista. */
function desdeHace(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.floor(mins / 60)} h`;
}

export default async function AdminMenuPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  // getAdminMenu y la fila de módulos solo dependen de restaurantId, no una
  // de la otra — se lanzan juntas en vez de esperarlas en serie.
  const db = createServiceClient();
  const [{ categories, products }, { data: rest }] = await Promise.all([
    getAdminMenu(restaurantId),
    db
      .from('restaurants')
      .select('plan_actual')
      .eq('id', restaurantId)
      .single(),
  ]);

  const maxProducts = rest?.plan_actual ? PLANS[rest.plan_actual as PlanCode]?.maxProducts : undefined;

  /* Lo que el comensal NO puede pedir ahora mismo. Sin consulta nueva: el
     catálogo entero ya está cargado arriba para pintar la lista.

     Se usa `isUnavailable`, la MISMA función con la que el menú del comensal
     decide qué se puede pedir. Es importante que sea la misma: lo marcado
     agotado hace más de doce horas ya volvió solo al menú, así que anunciarlo
     aquí como apagado le haría creer al restaurante que está perdiendo ventas
     que en realidad sí puede hacer.

     `is_active: false` no cuenta: eso es "archivado hasta nuevo aviso", una
     decisión tomada, no un descuido. */
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();
  const apagados: OffMenuItem[] = products
    .filter((p) => p.is_active && isUnavailable(p, ahora))
    .map((p) => ({
      id: p.id,
      name: p.name,
      // El inventario es quien lo apaga solo al llegar a cero; cualquier otro
      // caso lo marcó una persona.
      reason: p.track_stock && Number(p.stock ?? 0) <= 0 ? 'inventario' as const : 'mano' as const,
      since: p.unavailable_at ? desdeHace(ahora - new Date(p.unavailable_at).getTime()) : null,
    }))
    // Primero lo que se apagó solo: es lo que se está dejando de vender sin
    // que nadie lo haya decidido.
    .sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'inventario' ? -1 : 1));

  return (
    <div className="anim-fade-up flex flex-col gap-4">
      {apagados.length > 0 && (
        <OffMenuWidget items={apagados.slice(0, 4)} total={apagados.length} />
      )}
      {products.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ProductosExportButton restaurantId={restaurantId} />
        </div>
      )}
      <CatalogPanel
        restaurantId={restaurantId}
        categories={categories}
        products={products}
        maxProducts={maxProducts}
      />
    </div>
  );
}
