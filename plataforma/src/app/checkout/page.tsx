import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { hasAnyHours, isOpenNow } from '@/lib/hours';
import { getMenuDataCached, getTopSellingProductIdsCached } from '@/lib/db/menu';
import { masPedidos } from '@/lib/menu-pairings';
import { hasActiveCoupons } from '@/lib/db/cupones';
import { getDeliveryZones } from '@/lib/db/zones';
import { isModuleActive } from '@/lib/modules';
import { getAgentHubInfo } from '@/lib/print-agent';
import CheckoutForm from '@/components/checkout-form';
import CheckoutBlocked from '@/components/checkout-blocked';
import { encargoParaPedido } from '@/lib/db/encargos';
import { estadoEncargo, lugaresLibres, textoEntrega } from '@/lib/encargos';
import { aceptaTransferencia, cuentaDelRestaurante } from '@/lib/pago-transferencia';

export const metadata: Metadata = { title: 'Hacer pedido' };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ encargo?: string }>;
}) {
  const sp = await searchParams;
  const slug = (await headers()).get('x-tenant-slug');
  if (!slug) notFound();

  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const { restaurant, resolved } = data;
  const modules = restaurant.modules as { orders?: boolean } | null;

  if (!modules?.orders || restaurant.status !== 'active') notFound();

  // BASICO solo soporta pickup. ESTANDAR y Premium+ honran sus orderTypes
  // configurados (en Estándar son los 2 de 3 modos elegidos por el dueño).
  const planActual = (restaurant.plan_actual as string | null) ?? null;
  const safeConfig = planActual === 'BASICO'
    ? { ...resolved.config, orderTypes: ['pickup' as const] }
    : resolved.config;

  // Operación: pausa manual ("cocina saturada") y horario real.
  // createOrder vuelve a validar en el servidor; esto es solo la UX.
  const paused = restaurant.orders_paused === true;
  const open = isOpenNow(restaurant.hours, restaurant.timezone || 'America/Guatemala', new Date(), restaurant.hour_exceptions);

  // Encargo (mig. 149): con una tanda abierta y con lugar, se puede pedir
  // aunque el local esté cerrado ahora — es para otro día. createOrder lo
  // vuelve a validar todo.
  const encargoFila = sp.encargo && /^[0-9a-f-]{36}$/i.test(sp.encargo)
    ? await encargoParaPedido(restaurant.id, sp.encargo)
    : null;
  const encargo = encargoFila && estadoEncargo(encargoFila) === 'abierto'
    ? {
        id: encargoFila.id,
        titulo: encargoFila.titulo,
        entrega: textoEntrega(encargoFila),
        quedan: lugaresLibres(encargoFila),
        pagoAdelantado: encargoFila.pagoAdelantado,
      }
    : null;
  const hasCoupons = await hasActiveCoupons(restaurant.id);
  // Zonas con su tarifa (migración 104). El checkout las muestra; el cobro
  // real lo recalcula createOrder contra esta misma tabla.
  const zones = await getDeliveryZones(restaurant.id);
  const { hubUrl, hubToken } = await getAgentHubInfo(restaurant.id);
  const mod = restaurant.modules as Record<string, boolean> | null;
  const modSettings = restaurant.module_settings ?? null;
  const encuestasActive = isModuleActive(mod, modSettings, 'encuestas');

  /* «Lo más pedido» por si el carrito llega vacío (CAT-09). El carrito vive
     en el teléfono, así que aquí no se sabe; las dos lecturas están en
     caché (la carta, un minuto; las ventas, una hora) y la lista viaja
     corta: cuatro platillos con nombre y precio. */
  const [menu, topIds] = await Promise.all([
    getMenuDataCached(restaurant.id),
    getTopSellingProductIdsCached(restaurant.id),
  ]);
  const tz = restaurant.timezone || 'America/Guatemala';
  const ahora = new Date();
  const catById = new Map(menu.categories.map((c) => [c.id, c]));
  const sugeridos = masPedidos({
    productos: menu.products,
    topIds,
    categoriaAbierta: (id) => {
      const c = catById.get(id);
      return !c || !hasAnyHours(c.availability) || isOpenNow(c.availability, tz, ahora);
    },
    now: ahora.getTime(),
  }).map((p) => ({ id: p.id, name: p.name, name_en: p.name_en, price: p.price, image_url: p.image_url }));

  if (paused || (!open && !encargo)) {
    return (
      <ThemeProvider config={resolved.config} content={resolved.content}>
        <CheckoutBlocked
          reason={paused ? 'paused' : 'closed'}
          pauseMessage={restaurant.pause_message}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider config={safeConfig} content={resolved.content}>
      <CartProvider restaurantId={restaurant.id}>
        <CheckoutForm
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          whatsappNumber={restaurant.orders_whatsapp_enabled === false ? null : (restaurant.orders_whatsapp || restaurant.whatsapp_number)}
          deliveryZones={zones.map((z) => ({ nombre: z.nombre, tarifa: z.tarifa }))}
          restaurantLat={restaurant.location_lat}
          restaurantLng={restaurant.location_lng}
          deliveryRadiusKm={restaurant.delivery_radius_km}
          hasCoupons={hasCoupons}
          encuestasActive={encuestasActive}
          hubUrl={hubUrl}
          hubToken={hubToken}
          sugeridos={sugeridos}
          encargo={encargo}
          encargoNoDisponible={!!sp.encargo && !encargo}
          transferencia={aceptaTransferencia(resolved.config) ? cuentaDelRestaurante(resolved.config) : null}
        />
      </CartProvider>
    </ThemeProvider>
  );
}
