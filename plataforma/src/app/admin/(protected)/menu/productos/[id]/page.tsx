import { redirect, notFound } from 'next/navigation';
/* `Link` es aquí `PanelLink`: el "Volver" llevaba a `/admin/menu` a secas y
   eso saca del panel a quien entró por el origen único (`/panel/<slug>/...`)
   — el botón de salir del formulario de un platillo, que es de los más
   pulsados. Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu, getProductById } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getIngredients, getProductRecipe } from '@/lib/db/recipes';
import { can } from '@/lib/permissions';
import ProductForm from '@/components/admin/product-form';
import DeleteButton from '@/components/admin/delete-button';
import { deleteProduct } from '@/lib/actions/products';

export const metadata = { title: 'Editar producto – Panel admin' };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const [product, { categories }, ingredients, recipe] = await Promise.all([
    getProductById(id, restaurantId),
    getAdminMenu(restaurantId),
    canIngredientes ? getIngredients(restaurantId) : Promise.resolve(undefined),
    canIngredientes ? getProductRecipe(id) : Promise.resolve(undefined),
  ]);

  if (!product) notFound();

  return (
    <div className="anim-fade-up">
      {/* Encabezado */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            ← Volver
          </Link>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 20,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            {product.name}
          </h1>
        </div>

        <DeleteButton
          action={deleteProduct}
          hiddenFields={{ restaurantId, id: product.id }}
          label="Eliminar"
          confirm={`¿Eliminar "${product.name}" permanentemente?`}
        />
      </div>

      <ProductForm
        restaurantId={restaurantId}
        categories={categories}
        product={product}
        ingredients={ingredients}
        initialRecipe={recipe}
      />
    </div>
  );
}
