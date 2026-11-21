import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, type PlanCode } from '@/lib/plans';
import CatalogPanel from '@/components/admin/catalog-panel';
import ProductosExportButton from '@/components/admin/productos-export-button';
import AvisoImportacion from '@/components/admin/aviso-importacion';
import { panelLink } from '@/lib/panel-links-server';
import { withEffectiveAvailability } from '@/lib/product-availability';
import { corteAHora } from '@/lib/caja/dia';
import EstadosDelDia from '@/components/admin/estados-del-dia';
import { getEstadosVigentes } from '@/lib/db/estados';
import { assetPath } from '@/lib/asset-image';

export const metadata = { title: 'Catálogo – Panel admin' };

export default async function AdminMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string; cat?: string; f?: string; orden?: string; importado?: string; n?: string; p?: string }>;
}) {
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
  const [{ categories, products }, { data: rest }, estados] = await Promise.all([
    getAdminMenu(restaurantId),
    db
      .from('restaurants')
      .select('plan_actual, timezone, day_cutoff_minutes')
      .eq('id', restaurantId)
      .single(),
    // Estados del día (CV-32, migración 189).
    getEstadosVigentes(restaurantId),
  ]);

  const maxProducts = rest?.plan_actual ? PLANS[rest.plan_actual as PlanCode]?.maxProducts : undefined;

  /* Lo agotado ya no son tarjetas arriba de la lista: la propia lista lo
     dice en una línea y lo filtra (auditoría 1.9, R06.1). */
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();
  const sp = await searchParams;
  const importarHref = await panelLink('/admin/menu/importar');
  const lote = sp.importado && /^[0-9a-f-]{36}$/i.test(sp.importado) ? sp.importado : null;

  return (
    <div className="anim-fade-up flex flex-col gap-4">
      {/* La lista recibe la disponibilidad YA resuelta con la regla del menú:
          antes pintaba la columna cruda y enseñaba «Agotado» en platillos que
          el comensal estaba pidiendo (auditoría 2026-10-02, CAT-01). */}
      {/* Recién importado (ficha 2.4): qué entró y «Deshacer». */}
      {lote && (
        <AvisoImportacion restaurantId={restaurantId} lote={lote}
          nuevos={Math.max(0, Number(sp.n) || 0)} precios={Math.max(0, Number(sp.p) || 0)} />
      )}
      <EstadosDelDia
        restaurantId={restaurantId}
        estados={estados.estados}
        faltaTabla={estados.faltaTabla}
        ahora={ahora}
        platillos={products.map((p) => {
          /* Solo fotos de este restaurante en el bucket: son las que el
             estado puede reusar (publicarEstado rechaza las demás). */
          const url = (p.image_url as string | null) ?? null;
          const reusable = url && p.is_active !== false && assetPath(url)?.startsWith(`${restaurantId}/`);
          return { id: p.id as string, name: p.name as string, foto: reusable ? url : null };
        })}
      />
      <CatalogPanel
        exportSlot={<ProductosExportButton restaurantId={restaurantId} importarHref={importarHref} />}
        inicial={sp}
        restaurantId={restaurantId}
        categories={categories}
        products={withEffectiveAvailability(products, ahora)}
        maxProducts={maxProducts}
        timezone={(rest?.timezone as string | null) ?? undefined}
        horaCorte={corteAHora(Number(rest?.day_cutoff_minutes ?? 300))}
      />
    </div>
  );
}
