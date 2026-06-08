import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdminContext, getAdminMenu } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { headers } from 'next/headers';
import CategoryManager from '@/components/admin/category-manager';

export const metadata = { title: 'Menú — Panel admin' };

export default async function AdminMenuPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');

  // Resolver restaurantId: SUPER_ADMIN usa el tenant del subdominio
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

  if (!restaurantId) redirect('/login');

  const { categories, products } = await getAdminMenu(restaurantId);

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
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 22,
          }}
        >
          Menú
        </h1>
        <Link
          href="/admin/menu/productos/new"
          className="press btn-accent"
          style={{
            padding: '9px 18px',
            borderRadius: 'var(--radius-full)',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            color: '#fff',
          }}
        >
          + Producto
        </Link>
      </div>

      {/* Estado vacío */}
      {categories.length === 0 && products.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--u-text-3)',
            fontSize: 15,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🍽</div>
          <p>No hay categorías ni productos aún.</p>
          <p style={{ marginTop: 4 }}>Crea una categoría para empezar.</p>
        </div>
      ) : (
        <CategoryManager
          restaurantId={restaurantId}
          categories={categories}
          products={products}
        />
      )}
    </div>
  );
}
