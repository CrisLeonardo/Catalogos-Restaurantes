import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import ProfileForm from '@/components/admin/profile-form';
import HoursEditor from '@/components/admin/hours-editor';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import OrdersCurrencyEditor from '@/components/admin/orders-currency-editor';
import KitchenPrintSettings from '@/components/admin/kitchen-print-settings';
import type { Restaurant } from '@/types';

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

  // Cargar datos del restaurante
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (!restaurant) redirect('/admin/login');

  // Cargar configuración de tema (pedidos y moneda)
  const db = createServiceClient();
  const { data: themeRow } = await db
    .from('restaurant_themes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const resolved = resolveTheme((themeRow as ThemeRow) ?? null);

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

      {/* ── Tipos de pedido, moneda y animaciones ─────────── */}
      <section style={{ marginTop: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 16,
          }}
        >
          Pedidos y moneda
        </h2>
        <OrdersCurrencyEditor
          restaurantId={restaurantId}
          config={{
            orderTypes: resolved.config.orderTypes,
            dineInTableCount: resolved.config.dineInTableCount,
            dineInCourseOptions: resolved.config.dineInCourseOptions,
            tipEnabled: resolved.config.tipEnabled,
            tipPercent: resolved.config.tipPercent,
            acceptsCard: resolved.config.acceptsCard,
            currencySymbol: resolved.config.currencySymbol,
            currencyPosition: resolved.config.currencyPosition,
            locale: resolved.config.locale,
            animations: resolved.config.animations,
          }}
        />
      </section>

      {/* ── Impresión de cocina ────────────────────────────── */}
      <section style={{ marginTop: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 6,
          }}
        >
          Impresión de cocina
        </h2>
        <p style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 16, lineHeight: 1.5 }}>
          Configura la comanda automática que se envía a la impresora de cocina
          al confirmar cada pedido. Esta configuración es por dispositivo.
        </p>
        <KitchenPrintSettings />
      </section>
    </div>
  );
}
