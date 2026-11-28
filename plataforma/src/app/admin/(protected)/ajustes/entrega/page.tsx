import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createClient } from '@/lib/supabase/server';
import RestaurantLocationEditor from '@/components/admin/restaurant-location-editor';
import DeliveryZonesEditor from '@/components/admin/delivery-zones-editor';
import { getDeliveryZones } from '@/lib/db/zones';
import ModoDeEntrega from '@/components/admin/ajustes/modo-entrega';
import { estadoEntrega, estadoHorario, modoEntrega } from '@/lib/ajustes-estado';
import ConfirmarReparto, { type ReglaReparto } from '@/components/admin/ajustes/confirmar-reparto';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { fmtMoney } from '@/lib/money';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Zona de entrega – Panel admin' };

/* /admin/ajustes/entrega — dónde estás, hasta dónde repartes y cuánto
   cobras por zona. Salió del acordeón "Mapa de entrega (por radio)" de la
   pantalla de horarios: no tiene nada que ver con a qué hora abres.

   Las zonas con su tarifa vivían en Repartidores, una pantalla que no está
   en ningún menú: la entrega se configuraba en dos sitios y uno no se
   encontraba (auditoría 2026-10-02, N-03). Ahora está todo aquí. */

export default async function AdminEntregaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }

  if (!restaurantId) redirect('/admin/login');

  const supabase = await createClient();
  const [{ data: restaurant }, zones] = await Promise.all([
    supabase.from('restaurants').select('*').eq('id', restaurantId).single(),
    getDeliveryZones(restaurantId),
  ]);

  if (!restaurant) redirect('/admin/login');

  /* Ficha 2.8 (R28.1): la manera de repartir se elige a propósito y solo
     se enseña el editor de esa manera. */
  const r = restaurant as Restaurant;
  const modo = modoEntrega(zones.length, r.delivery_radius_km, r.location_lat != null && r.location_lng != null);

  /* Sin reparto confirmado (migración 207) la carta no ofrece domicilio:
     las tres reglas, a la vista, antes de empezar (auditoría 26-nov). */
  let reglas: ReglaReparto[] | null = null;
  if (r.reparto_confirmado_en === null) {
    const { data: themeRow } = await createServiceClient()
      .from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).maybeSingle();
    const config = resolveTheme((themeRow as ThemeRow) ?? null).config;
    if (config.orderTypes.includes('delivery')) {
      const cobertura = estadoEntrega(zones.length, r.delivery_radius_km, r.location_lat != null && r.location_lng != null);
      const horario = estadoHorario(r.hours ?? null, r.hour_exceptions ?? null, r.timezone || 'America/Guatemala', new Date());
      const tarifas = zones.map((z) => Number(z.tarifa) || 0);
      const plana = Math.max(0, Number(config.deliveryFee) || 0);
      const tarifa = tarifas.length
        ? (Math.min(...tarifas) === Math.max(...tarifas) ? `${fmtMoney(tarifas[0])} por envío` : `${fmtMoney(Math.min(...tarifas))} a ${fmtMoney(Math.max(...tarifas))} según la zona`)
        : plana > 0 ? `${fmtMoney(plana)} por envío` : 'Envío gratis';
      reglas = [
        { etiqueta: 'Hasta dónde', valor: cobertura.texto,
          aviso: cobertura.tono === 'warn' ? 'Elegiste repartir a cualquier dirección.' : undefined },
        { etiqueta: 'Cuánto cobras', valor: tarifa, href: tarifas.length ? undefined : '/admin/ajustes/pedidos',
          aviso: !tarifas.length && plana === 0 ? 'El envío sale gratis.' : undefined },
        { etiqueta: 'A qué hora', valor: horario.texto, href: '/admin/ajustes/restaurante',
          aviso: horario.texto === 'A toda hora' ? 'Recibirás domicilios a toda hora.' : undefined },
      ];
    }
  }

  return (
    <div className="anim-fade-up adm-w-read">
      {reglas && <ConfirmarReparto restaurantId={restaurantId} reglas={reglas} />}
      <ModoDeEntrega
        restaurantId={restaurantId}
        modo={modo}
        zonas={zones.length}
        editorDistancia={<RestaurantLocationEditor restaurant={r} />}
        editorZonas={
          <DeliveryZonesEditor
            restaurantId={restaurantId}
            initialZones={zones.map((z) => ({ nombre: z.nombre, tarifa: z.tarifa }))}
          />
        }
      />
    </div>
  );
}
