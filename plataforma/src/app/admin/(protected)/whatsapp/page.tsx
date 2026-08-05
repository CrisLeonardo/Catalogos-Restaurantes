import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { isTokenKeyConfigured } from '@/lib/whatsapp/crypto';
import WhatsAppPanel, { type WhatsAppAccountView } from '@/components/admin/whatsapp-panel';

export const metadata = { title: 'WhatsApp – Panel admin' };

/* ============================================================
   /admin/whatsapp — canal de WhatsApp (Fase 1A)
   ------------------------------------------------------------
   Conectar el número y ver si está activo. Los avisos de estado del pedido
   salen solos desde updateOrderStatus una vez conectado; aquí no hay nada
   que encender aparte de eso.

   El token nunca se selecciona: esta página solo lee las columnas que puede
   mostrar sin riesgo.
   ============================================================ */

export default async function AdminWhatsAppPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'whatsapp')) redirect('/admin/menu');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const db = createServiceClient();
  const { data } = await db
    .from('whatsapp_accounts')
    .select('phone_number_id, display_phone, waba_id, activo, updated_at')
    .eq('restaurant_id', restaurantId)
    .single();

  const account: WhatsAppAccountView | null = data
    ? {
        phoneNumberId: data.phone_number_id as string,
        displayPhone: (data.display_phone as string | null) ?? null,
        wabaId: (data.waba_id as string | null) ?? null,
        activo: data.activo as boolean,
        updatedAt: data.updated_at as string,
      }
    : null;

  return (
    <div className="anim-fade-up">
      <WhatsAppPanel
        restaurantId={restaurantId}
        account={account}
        tokenKeyReady={isTokenKeyConfigured()}
      />
    </div>
  );
}
