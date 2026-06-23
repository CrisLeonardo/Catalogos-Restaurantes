import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getIngredients } from '@/lib/db/recipes';
import { can } from '@/lib/permissions';
import ProductForm from '@/components/admin/product-form';

export const metadata = { title: 'Nuevo producto – Panel admin' };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
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

  const [{ categories }, ingredients] = await Promise.all([
    getAdminMenu(restaurantId),
    canIngredientes ? getIngredients(restaurantId) : Promise.resolve(undefined),
  ]);

  return (
    <div className="anim-fade-up">
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link
          href="/admin/menu"
          className="press"
          style={{
            background: 'rgba(255,255,255,0.06)',
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
            fontSize: 22,
          }}
        >
          Nuevo producto
        </h1>
      </div>

      <ProductForm
        restaurantId={restaurantId}
        categories={categories}
        defaultCategoryId={(await searchParams).cat}
        ingredients={ingredients}
      />
    </div>
  );
}
