import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { getMenuData } from '@/lib/db/menu';
import { getMyMembership } from '@/lib/db/membership';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from '@/lib/demo-menu';
import PreviewClient from '@/components/super/preview-client';

/* ============================================================
   /preview/[id] — Vista previa en vivo (personal autorizado)
   ------------------------------------------------------------
   Renderiza el menú del restaurante tal y como lo vería el
   comensal, pero conectado por BroadcastChannel al editor de
   apariencia: cada cambio se refleja al instante SIN guardar.

   Se usa de dos formas:
     • Embebida en un iframe (marco de teléfono) junto al editor.
     • En una ventana/pestaña aparte para enseñarle al cliente
       cómo va quedando en otra pantalla.

   `id = "new"` → vista previa con defaults + menú de ejemplo
   (pantalla de creación de restaurante).
   ============================================================ */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vista previa en vivo — Leogin',
  robots: { index: false, follow: false },
};

/* Acceso: Super Admin siempre; el dueño/staff del restaurante solo puede
   previsualizar SU restaurante (el editor de /admin/personalizacion embebe
   esta ruta en su iframe); un dueño de grupo, las sucursales de su grupo. */
async function requirePreviewAccess(id: string) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect('/');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, organization_id')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'SUPER_ADMIN') return;

  if (
    id !== 'new' &&
    (profile?.role === 'RESTAURANT_OWNER' || profile?.role === 'RESTAURANT_STAFF') &&
    profile.restaurant_id === id
  ) {
    return;
  }

  // Y por membresía (migración 113). Sin esto, el dueño del modelo nuevo no
  // podía ver la vista previa de su propio restaurante: su perfil apunta a
  // null y su vínculo vive en `restaurant_members`.
  if (id !== 'new' && (await getMyMembership(id))) return;

  // Quien administra un grupo puede previsualizar sus sucursales (mig. 116).
  if (id !== 'new' && profile?.organization_id) {
    const svc = createServiceClient();
    const { data: branch } = await svc
      .from('restaurants')
      .select('organization_id')
      .eq('id', id)
      .maybeSingle();
    if (branch?.organization_id === profile.organization_id) return;
  }

  redirect('/admin/menu');
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePreviewAccess(id);

  /* Modo creación: aún no existe el restaurante → defaults + menú demo. */
  if (id === 'new') {
    const resolved = resolveTheme(null);
    return (
      <PreviewClient
        previewId="new"
        initialConfig={resolved.config}
        initialContent={resolved.content}
        initialCss={resolved.customCss}
        categories={DEMO_CATEGORIES}
        products={DEMO_PRODUCTS}
        ordersEnabled
        sampleData
      />
    );
  }

  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const theme = row.restaurant_themes[0] ?? null;
  const resolved = resolveTheme(theme as ThemeRow | null, row.slug, {
    brandName: row.name,
    tagline: row.tagline,
  });

  /* Si el restaurante todavía no tiene productos, mostramos el menú de
     ejemplo para que la vista previa nunca se vea vacía mientras se diseña. */
  const menu = await getMenuData(row.id);
  const hasMenu = menu.products.length > 0;

  return (
    <PreviewClient
      previewId={row.id}
      initialConfig={resolved.config}
      initialContent={resolved.content}
      initialCss={resolved.customCss}
      categories={hasMenu ? menu.categories : DEMO_CATEGORIES}
      products={hasMenu ? menu.products : DEMO_PRODUCTS}
      ordersEnabled={row.modules?.orders === true}
      sampleData={!hasMenu}
    />
  );
}
