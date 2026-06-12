import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/admin/profile-form';
import HoursEditor from '@/components/admin/hours-editor';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import type { Restaurant, RestaurantTheme } from '@/types';

export const metadata = { title: 'Perfil – Panel admin' };

export default async function AdminPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const sp = await searchParams;
  const saved = sp.saved === '1';

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

  // Cargar restaurant + theme con privilegios admin
  const supabase = await createClient();
  const [{ data: restaurant }, { data: theme }] = await Promise.all([
    supabase.from('restaurants').select('*').eq('id', restaurantId).single(),
    supabase.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single(),
  ]);

  if (!restaurant) redirect('/admin/login');

  const defaultTheme: RestaurantTheme = {
    restaurant_id: restaurantId,
    brand_name: null,
    logo_url: null,
    color_primary: '#D97757',
    color_bg: '#0b0b0c',
    color_text: '#F5F3EF',
    font_display: 'Unbounded',
    portada_style: 'spotlight',
    catalog_view: 'grid',
    glass_intensity: 'translucido',
    background_image: null,
    config: null,
    content: null,
    custom_css: null,
  };

  return (
    <div className="anim-fade-up">
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 22,
          marginBottom: 24,
        }}
      >
        Perfil del restaurante
      </h1>

      {saved && (
        <div
          style={{
            marginBottom: 20,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(50,200,100,0.12)',
            border: '1px solid rgba(50,200,100,0.25)',
            color: '#4ade80',
            fontSize: 14,
          }}
        >
          ✓ Cambios guardados correctamente
        </div>
      )}

      <ProfileForm
        restaurantId={restaurantId}
        restaurant={restaurant as Restaurant}
        theme={(theme as RestaurantTheme) ?? defaultTheme}
      />

      {/* ── Operación: horarios, pausa, zona horaria ───────── */}
      <section style={{ marginTop: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 16,
          }}
        >
          Horario y pedidos
        </h2>
        <HoursEditor restaurant={restaurant as Restaurant} />
      </section>

      {/* ── Ubicación del restaurante + radio de entrega ───── */}
      <section style={{ marginTop: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 4,
          }}
        >
          Mapa de entrega (por radio)
        </h2>
        <p style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 16, lineHeight: 1.5 }}>
          Activa esto para que el cliente vea un mapa interactivo en el checkout
          y coloque su pin. El pedido se rechaza si el pin cae fuera del radio.
        </p>
        <RestaurantLocationEditor restaurant={restaurant as Restaurant} />
      </section>
    </div>
  );
}
