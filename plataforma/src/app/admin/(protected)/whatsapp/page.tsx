import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { isTokenKeyConfigured } from '@/lib/whatsapp/crypto';
import { WHATSAPP_PARA_DUENOS } from '@/lib/whatsapp/visible';
import WhatsAppPanel, { type WhatsAppAccountView } from '@/components/admin/whatsapp-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { panelLink } from '@/lib/panel-links-server';

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
  if (!can(ctx.profile.role, ctx.profile.permissions, 'whatsapp')) redirect(await panelLink('/admin'));
  /* Hasta que haya alta guiada, solo el Super Admin conecta el número (D-6).
     La pantalla ya no sale en el menú ni en Ajustes; a quien llegue por la
     dirección se le explica en vez de rebotarlo. Un `redirect()` aquí, ya
     con el armazón del panel en camino, hacía fallar al enrutador de Next
     en el navegador (error #310 de React) antes de llegar a Ajustes. */
  if (!WHATSAPP_PARA_DUENOS && ctx.profile.role !== 'SUPER_ADMIN') {
    return (
      <div className="anim-fade-up adm-w-read">
        <EmptyState
          icon="whatsapp"
          title="WhatsApp lo conectamos nosotros"
          desc="Para avisarle a cada cliente por WhatsApp cómo va su pedido hace falta conectar una cuenta de WhatsApp Business. Escríbenos desde Ayuda y la dejamos lista por ti; los avisos salen solos en cuanto quede conectada."
          action={{ href: '/admin/ayuda', label: 'Ir a Ayuda', icon: null }}
        />
      </div>
    );
  }

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
