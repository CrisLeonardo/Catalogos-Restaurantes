import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import MenuShell from '@/components/menu-shell';
import LeoginLanding from '@/components/landing';
import BranchSelector from '@/components/branch-selector';
import { getRestaurantBySlugCached } from '@/lib/db/restaurants';
import { getGroupBranches } from '@/lib/db/org-public';
import { getMenuDataCached, withStockLeft } from '@/lib/db/menu';
import { resolveTheme } from '@/lib/theme/resolve';
import { isOpenNow, nextOpenLabel } from '@/lib/hours';
import { isModuleActive } from '@/lib/modules';
import { DEMO_SLUG, rootDomainForUrls, isAdminSubdomain, isGroupSubdomain, subdomainUrl } from '@/lib/tenant';
import { currencyCodeFor, jsonLdScript, restaurantJsonLd } from '@/lib/seo/restaurant-jsonld';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from '@/lib/demo-menu';
import { getPublicLoyaltyCached, type PublicReward } from '@/lib/db/loyalty';
import { isGoogleAuthEnabled } from '@/lib/auth-config';

/* ── Metadata dinámica por restaurante ─────────────────────── */
export async function generateMetadata(): Promise<Metadata> {
  const slug = (await headers()).get('x-tenant-slug');

  if (!slug) {
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0]?.trim();
    const base = root && !root.includes('localhost') ? `https://${root}` : undefined;
    const title = 'Leogin — Menús digitales para restaurantes';
    const description =
      'Convierte el menú de tu restaurante en una experiencia web rápida y espectacular, con panel de administración y pedidos en línea.';
    return {
      title,
      description,
      keywords: [
        'menú digital', 'menú QR', 'restaurantes', 'pedidos en línea',
        'carta digital', 'Guatemala', 'sistema para restaurantes',
        'pantalla de cocina', 'KDS', 'programa de lealtad',
      ],
      ...(base ? { metadataBase: new URL(base), alternates: { canonical: '/' } } : {}),
      openGraph: {
        title,
        description,
        siteName: 'Leogin',
        locale: 'es_GT',
        type: 'website',
        ...(base ? { url: base } : {}),
        images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'Leogin' }],
      },
      twitter: { card: 'summary', title, description, images: ['/icon-512.png'] },
    };
  }

  if (slug === DEMO_SLUG) {
    return { title: 'Demo — Leogin', description: 'Así se ve un restaurante con Leogin.' };
  }

  const data = await getRestaurantBySlugCached(slug);
  if (!data) {
    // ¿Es el link público de un grupo? (grupo-slug.dominio → selector)
    const group = await getGroupBranches(slug);
    if (group) {
      return {
        title: `${group.name} — Pide en línea`,
        description: `Elige tu sucursal de ${group.name} y pide en línea.`,
        robots: { index: false, follow: false },
      };
    }
    return { title: 'Restaurante no encontrado' };
  }

  const name = data.restaurant.name;
  const description = data.restaurant.tagline ?? `Menú en línea de ${name}`;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const menuUrl = rootDomain ? `https://${slug}.${rootDomain}` : undefined;
  // pwaIconUrl tiene prioridad para favicon; si no hay, usa el logo de portada.
  const favicon = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl;
  const logo = data.resolved.config.logoUrl;

  return {
    title: `${name} — Menú`,
    description,
    icons: favicon ? { icon: favicon, apple: favicon } : undefined,
    openGraph: {
      title: `${name} — Menú`,
      description,
      url: menuUrl,
      siteName: name,
      // es_GT como la portada de Leogin; antes decía es_MX (CAT-11).
      locale: 'es_GT',
      type: 'website',
      images: logo ? [{ url: logo }] : undefined,
    },
    twitter: { card: 'summary', title: `${name} — Menú`, description },
    robots: { index: true, follow: false },
  };
}

/* ── Página principal ──────────────────────────────────────── */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [slug, params] = await Promise.all([
    headers().then((h) => h.get('x-tenant-slug')),
    searchParams,
  ]);
  const rawMesa = typeof params.mesa === 'string' ? params.mesa : undefined;
  const initialMesa = rawMesa ? (parseInt(rawMesa, 10) || undefined) : undefined;

  // Dominio raíz → landing comercial de Leogin.
  //
  // Con una excepción que existe por un fallo real: `x-tenant-slug` lo pone
  // el proxy, así que "no hay slug" puede significar dos cosas muy distintas
  // —estamos en el dominio raíz, o esta petición NO PASÓ POR EL PROXY—. Lo
  // segundo ocurre cuando Next resuelve por dentro un redirect al mismo host
  // (los `redirect()` de una server action; ver la nota en enterRestaurant):
  // ahí llega `/` del subdominio del panel sin ninguna cabecera nuestra, y
  // esta línea le enseñaba al dueño la web de VENTAS de Leogin dentro del
  // marco de su panel. La cabecera `host` sí sobrevive a ese camino, así que
  // sirve para distinguirlos: si venimos de un host de panel, `/` es el
  // panel y no hay portada que pintar.
  if (!slug) {
    const host = (await headers()).get('host');
    if (isAdminSubdomain(host)) redirect('/admin');
    if (isGroupSubdomain(host)) redirect('/mi-cuenta/resumen');
    return <LeoginLanding />;
  }

  // Subdominio `demo` → menú de ejemplo (Café Demo, sin BD)
  if (slug === DEMO_SLUG) {
    const demo = resolveTheme(
      {
        brand_name: 'Café Demo',
        config: { tagline: 'Sabor de barrio', zone: 'Zona 1', portadaVariant: 'spotlight' },
      },
      DEMO_SLUG,
    );
    return (
      <>
        <DemoBar />
        <MenuShell
          config={demo.config}
          content={demo.content}
          categories={DEMO_CATEGORIES}
          products={DEMO_PRODUCTS}
          restaurantId="demo"
          ordersEnabled={false}
        />
      </>
    );
  }

  // Tenant real
  const data = await getRestaurantBySlugCached(slug);
  if (!data) {
    // Fallback: ¿es el link público de un grupo? → selector de sucursal.
    const group = await getGroupBranches(slug);
    if (group && group.branches.length > 0) return <BranchSelector group={group} />;
    notFound();
  }

  const menu = await getMenuDataCached(data.restaurant.id);
  const ordersEnabled = data.restaurant.modules?.orders === true;
  const tz = data.restaurant.timezone || 'America/Guatemala';
  const isOpen = isOpenNow(data.restaurant.hours, tz, new Date(), data.restaurant.hour_exceptions);
  const reopenHint = !isOpen ? nextOpenLabel(data.restaurant.hours, tz, new Date(), data.restaurant.hour_exceptions) : null;

  const mod = data.restaurant.modules as Record<string, boolean> | null;
  const modSettings = data.restaurant.module_settings ?? null;

  // Lealtad v2: pestaña "Fidelidad" en la barra de navegación + panel de canje.
  const loyaltyOn = isModuleActive(mod, modSettings, 'loyalty');
  let rewardsCatalog: PublicReward[] | null = null;
  if (loyaltyOn) {
    const { settings, rewards } = await getPublicLoyaltyCached(data.restaurant.id);
    if (settings.rewards_enabled) rewardsCatalog = rewards;
  }

  // WhatsApp de contacto para el panel "Mi cuenta".
  const whatsappNumber = data.restaurant.orders_whatsapp || data.restaurant.whatsapp_number || null;

  /* Ficha para Google: restaurante, horario y carta con precios
     (schema.org, auditoría 2026-10-02, CAT-11). Con lo ya cargado. */
  const jsonLd = restaurantJsonLd({
    name: data.restaurant.name,
    description: data.restaurant.tagline,
    url: subdomainUrl(slug),
    logo: data.resolved.config.logoUrl,
    address: data.restaurant.address,
    telephone: whatsappNumber,
    hours: data.restaurant.hours,
    currency: currencyCodeFor(data.resolved.config.currencySymbol, data.resolved.config.locale),
    categories: menu.categories,
    products: menu.products,
  });

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
    <MenuShell
      config={data.resolved.config}
      content={data.resolved.content}
      categories={menu.categories}
      products={withStockLeft(menu.products, menu.stockLeft, data.resolved.config)}
      restaurantId={data.restaurant.id}
      ordersEnabled={ordersEnabled}
      isOpen={isOpen}
      reopenHint={reopenHint}
      timezone={tz}
      initialMesa={initialMesa}
      llamadaMeseroEnabled={isModuleActive(mod, modSettings, 'llamada_mesero')}
      loyaltyOn={loyaltyOn}
      rewardsCatalog={rewardsCatalog}
      googleAuthEnabled={isGoogleAuthEnabled()}
      whatsappNumber={whatsappNumber}
      restaurantLat={data.restaurant.location_lat}
      restaurantLng={data.restaurant.location_lng}
      deliveryRadiusKm={data.restaurant.delivery_radius_km}
      menuLanguages={data.restaurant.menu_languages ?? []}
    />
    </>
  );
}

/* Barra superior solo en la demo. */
function DemoBar() {
  // El enlace debe llevar a la landing del DOMINIO RAÍZ, no a "/" del
  // subdominio demo (que volvería a cargar la misma demo).
  const root = rootDomainForUrls();
  const isLocal = root.includes('localhost') || root.startsWith('127.');
  const rootUrl = `${isLocal ? 'http' : 'https'}://${root}`;

  return (
    <div
      className="glass-solid"
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 12.5,
      }}
    >
      <span className="t-mute">Demo de Leogin · así se vería tu restaurante</span>
      <a href={rootUrl} className="press" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Crea el tuyo →
      </a>
    </div>
  );
}
