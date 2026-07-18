import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import AdminThemeEditor from '@/components/admin/admin-theme-editor';
import type { RestaurantThemeTemplate } from '@/lib/actions/restaurant';

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
  const [{ data: themeRow }, { data: ownerTemplates }] = await Promise.all([
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single(),
    db
      .from('restaurant_theme_templates')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }),
  ]);

  const resolved = resolveTheme((themeRow as ThemeRow) ?? null);

  return (
    <div className="anim-fade-up">
      <AdminThemeEditor
        restaurantId={restaurantId}
        config={resolved.config}
        content={resolved.content}
        customCss={resolved.customCss}
        ownerTemplates={(ownerTemplates ?? []) as RestaurantThemeTemplate[]}
      />
    </div>
  );
}
