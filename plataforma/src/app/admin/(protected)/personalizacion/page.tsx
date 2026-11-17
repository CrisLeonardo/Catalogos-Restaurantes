import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import AdminThemeEditor from '@/components/admin/admin-theme-editor';
import type { RestaurantThemeTemplate } from '@/lib/actions/restaurant';
import type { PlatoMuestra } from '@/components/admin/personalizar/muestra';

export const metadata = { title: 'Personalizar – Panel admin' };

export default async function AdminPersonalizacionPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const { profile } = ctx;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  let restaurantId: string | null = null;

  if (profile.role === 'SUPER_ADMIN') {
    if (tenantSlug) {
      const tenantData = await getRestaurantBySlug(tenantSlug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const [{ data: themeRow }, { data: ownerTemplates }, { data: restaurant }, { data: productos }, { data: categorias }] = await Promise.all([
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single(),
    db
      .from('restaurant_theme_templates')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }),
    db.from('restaurants').select('slug, name, tagline').eq('id', restaurantId).single(),
    /* La carta de verdad para las muestras (ficha 2.7). */
    db.from('products').select('name, price, image_url, description, category_id')
      .eq('restaurant_id', restaurantId).eq('is_active', true).order('sort_order').limit(300),
    db.from('categories').select('id, name').eq('restaurant_id', restaurantId),
  ]);

  // Igual que el menú real (lib/db/restaurants.ts) y que la ficha del Super
  // Admin: con el slug y el nombre/lema del restaurante como semilla. Sin ellos
  // el editor arrancaba con «Tu Restaurante» y, como es el editor quien le manda
  // su estado a la vista previa, esta enseñaba un nombre que el menú no tiene.
  const resolved = resolveTheme((themeRow as ThemeRow) ?? null, restaurant?.slug ?? undefined, {
    brandName: restaurant?.name ?? undefined,
    tagline: restaurant?.tagline ?? null,
  });

  /* Lo que la carta ya tiene decide los tres diseños recomendados. */
  const catNombre = new Map((categorias ?? []).map((c) => [c.id as string, c.name as string]));
  const todos: PlatoMuestra[] = (productos ?? []).map((p) => ({
    nombre: p.name as string,
    precio: Number(p.price) || 0,
    foto: (p.image_url as string | null) || null,
    desc: (p.description as string | null) || null,
    categoria: catNombre.get(p.category_id as string) ?? null,
  }));
  const tipos = resolved.config.orderTypes;
  const senales = {
    total: todos.length,
    conFoto: todos.filter((p) => p.foto).length,
    paraLlevar: !tipos.includes('dine_in') && (tipos.includes('pickup') || tipos.includes('delivery')),
  };
  // Muestra: primero con foto, y siempre uno sin foto si existe (es lo que se rompe).
  const muestra = [...todos.filter((p) => p.foto).slice(0, 10), ...todos.filter((p) => !p.foto).slice(0, 2)];

  return (
    <div className="anim-fade-up">
      <AdminThemeEditor
        restaurantId={restaurantId}
        config={resolved.config}
        content={resolved.content}
        customCss={resolved.customCss}
        ownerTemplates={(ownerTemplates ?? []) as RestaurantThemeTemplate[]}
        carta={{ senales, platos: muestra }}
        hayAnterior={!!(themeRow as { config_anterior?: unknown } | null)?.config_anterior}
      />
    </div>
  );
}
