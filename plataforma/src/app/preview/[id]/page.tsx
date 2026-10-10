import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { getMenuData, withStockLeft } from '@/lib/db/menu';
import { getArchivoVitrinaCached } from '@/lib/db/vitrina';
import { getMyMembership } from '@/lib/db/membership';
import { getPublicLoyaltyCached, type PublicReward } from '@/lib/db/loyalty';
import { isModuleActive } from '@/lib/modules';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
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

  redirect('/admin');
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
  const [menu, archivo] = await Promise.all([getMenuData(row.id), getArchivoVitrinaCached(row.id)]);
  const hasMenu = menu.products.length > 0;

  /* Lo mismo que le llega al menú real (src/app/page.tsx): WhatsApp, módulos,
     fidelidad e idiomas cambian la portada y la barra de navegación, y el
     dueño tiene que ver el diseño que va a abrir el comensal. */
  const mod = row.modules as Record<string, boolean> | null;
  const modSettings = row.module_settings ?? null;
  const loyaltyOn = isModuleActive(mod, modSettings, 'loyalty');
  let rewardsCatalog: PublicReward[] | null = null;
  if (loyaltyOn) {
    const { settings, rewards } = await getPublicLoyaltyCached(row.id);
    if (settings.rewards_enabled) rewardsCatalog = rewards;
  }

  return (
    <PreviewClient
      previewId={row.id}
      initialConfig={resolved.config}
      initialContent={resolved.content}
      initialCss={resolved.customCss}
      categories={hasMenu ? menu.categories : DEMO_CATEGORIES}
      // Todas las existencias bajas: el dueño mueve el umbral de «Quedan
      // pocas» en vivo y el catálogo filtra con la config que llega por el canal.
      products={hasMenu ? withStockLeft(menu.products, menu.stockLeft, resolved.config, true) : DEMO_PRODUCTS}
      ordersEnabled={row.modules?.orders === true}
      sampleData={!hasMenu}
      archivo={archivo}
      menuExtras={{
        timezone: row.timezone || 'America/Guatemala',
        llamadaMeseroEnabled: isModuleActive(mod, modSettings, 'llamada_mesero'),
        loyaltyOn,
        rewardsCatalog,
        googleAuthEnabled: isGoogleAuthEnabled(),
        whatsappNumber: row.orders_whatsapp || row.whatsapp_number || null,
        restaurantLat: row.location_lat,
        restaurantLng: row.location_lng,
        deliveryRadiusKm: row.delivery_radius_km,
        menuLanguages: row.menu_languages ?? [],
      }}
    />
  );
}
