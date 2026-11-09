import { redirect } from 'next/navigation';
/* `Link` es aquí `PanelLink`: el "Volver" llevaba a `/admin/menu` a secas y
   eso saca del panel a quien entró por el origen único (`/panel/<slug>/...`)
   — el botón de salir del formulario de un platillo, que es de los más
   pulsados. Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getIngredients } from '@/lib/db/recipes';
import { can } from '@/lib/permissions';
import ProductForm from '@/components/admin/product-form';
import { createServiceClient } from '@/lib/supabase/service';

export const metadata = { title: 'Nuevo platillo – Panel admin' };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; creado?: string }>;
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

  const canIngredientes = can(ctx.profile.role, ctx.profile.permissions, 'ingredientes');

  const [{ categories }, ingredients, idiomas] = await Promise.all([
    getAdminMenu(restaurantId),
    canIngredientes ? getIngredients(restaurantId) : Promise.resolve(undefined),
    createServiceClient().from('restaurants').select('menu_languages').eq('id', restaurantId).maybeSingle(),
  ]);
  const sp = await searchParams;
  const bilingue = ((idiomas.data?.menu_languages as string[] | null) ?? []).includes('en');

  return (
    <div className="anim-fade-up">
      {/* Encabezado */}
      {/* Un solo título: «Nuevo platillo» ya lo dice la barra (auditoría 1.9, N17). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link
          href="/admin/menu"
          className="press"
          style={{
            background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
            border: '1px solid var(--u-hair)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 14px',
            fontSize: 13,
            color: 'var(--u-text-2)',
            textDecoration: 'none',
          }}
        >
          ← Volver al catálogo
        </Link>
      </div>

      <ProductForm
        restaurantId={restaurantId}
        categories={categories}
        defaultCategoryId={sp.cat}
        ingredients={ingredients}
        bilingue={bilingue}
        creado={sp.creado?.slice(0, 120)}
        /* Cada alta es un formulario nuevo: sin `key`, «Crear y agregar otro»
           conservaría lo escrito en el anterior. */
        key={sp.creado ?? 'nuevo'}
      />
    </div>
  );
}
