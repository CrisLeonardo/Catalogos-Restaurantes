import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import MenuShell from '@/components/menu-shell';
import LeoginLanding from '@/components/landing';
import { BranchSelector } from '@/components/islas-de-la-raiz';
import { getRestaurantBySlugCached } from '@/lib/db/restaurants';
import { getGroupBranches } from '@/lib/db/org-public';
import { getEstadosVigentesCached } from '@/lib/db/estados';
import { getMenuDataCached, getMasPedidosSemanaCached, withStockLeft, LecturaMenuFallida, type MenuData } from '@/lib/db/menu';
import CartaNoCargo from '@/components/menu/carta-no-cargo';
import { buildThemeVars, formatPriceCarta } from '@/lib/theme/resolve';
import { getArchivoVitrinaCached, getVendidosDesdeCached, withStockTotal } from '@/lib/db/vitrina';
import { isVitrina } from '@/lib/theme/defaults';
import { estadoEdicion } from '@/lib/vitrina/edicion';
import { resolveTheme } from '@/lib/theme/resolve';
import { isOpenNow, minutosParaCerrar, nextOpenLabel } from '@/lib/hours';
import { conPunto, fraseDeRegreso, pausaVigente } from '@/lib/pausa-pedidos';
import { isModuleActive } from '@/lib/modules';
import { DEMO_SLUG, rootDomainForUrls, isAdminSubdomain, isGroupSubdomain, subdomainUrl, marketingUrl } from '@/lib/tenant';
import { DemoOperativa } from '@/components/pidelo/demo-operativa';
import { casoDemo, platosDeDemo } from '@/lib/demo-operativa';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { currencyCodeFor, jsonLdScript, restaurantJsonLd } from '@/lib/seo/restaurant-jsonld';
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_THEME } from '@/lib/demo-menu';
import { getPublicLoyaltyCached, type PublicReward } from '@/lib/db/loyalty';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import { resolverPlatillo, valorPlatillo } from '@/lib/menu/enlace-platillo';
import { platilloEstrella } from '@/lib/menu/estrella';
import { enlaceDeAlta, leerIntencion, type IntencionAlta } from '@/lib/alta';
import { PLANS, planPriceLabel } from '@/lib/plans';
import { imagenesWeb } from '@/lib/og-web';

/* ── Metadata dinámica por restaurante ─────────────────────── */
/** `?platillo=` (CV-30): el código o el nombre legible (`doble-bacon`, F4-8);
    cualquier otra cosa se ignora. */
function platoDe(params: Record<string, string | string[] | undefined>): string | null {
  return valorPlatillo(params.platillo);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const slug = (await headers()).get('x-tenant-slug');

  if (!slug) {
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0]?.trim();
    const base = root && !root.includes('localhost') ? `https://${root}` : undefined;
    const title = 'Leogin — Tu restaurante, bajo control';
    const description =
      'Menú digital con QR, pedidos, cocina, caja e inventario en tu celular, aunque no estés. Gratis para empezar y sin comisión sobre lo que vendes.';
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
        images: imagenesWeb('portada', 'Leogin: tu restaurante, bajo control').og,
      },
      twitter: { ...imagenesWeb('portada', 'Leogin: tu restaurante, bajo control').twitter, title, description },
    };
  }

  if (slug === DEMO_SLUG) {
    /* La demo es un restaurante de mentira: en un buscador competiría con la
       portada y confundiría a quien busca «Rincón 502». Se sigue pudiendo
       enlazar y compartir; solo no se indexa (auditoría 2026-11-23, WEB-07). */
    return {
      title: 'Rincón 502 · Demo de Leogin',
      description: 'Así se ve un restaurante con Leogin: el menú de Rincón 502, nuestro restaurante de ejemplo.',
      robots: { index: false, follow: true },
    };
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
  /* Con el primer dominio raíz, no con la variable cruda: trae varios
     separados por coma y la vista previa salía con `og:url`
     «https://slug.distleogin.com,leogin.online» (auditoría 2026-11-23,
     WEB-06). */
  const menuUrl = subdomainUrl(slug);
  // pwaIconUrl tiene prioridad para favicon; si no hay, usa el logo de portada.
  const favicon = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl;
  const logo = data.resolved.config.logoUrl;
  const ogTarjeta = `${subdomainUrl(slug)}/api/og/${encodeURIComponent(slug)}`;

  /* El enlace de un platillo (CV-30) se presenta como ESE platillo: su
     nombre, su precio y su foto en la vista previa de WhatsApp o Facebook. */
  const platoId = platoDe(await searchParams);
  if (platoId) {
    const menu = await getMenuDataCached(data.restaurant.id).catch(() => null);
    const plato = resolverPlatillo(platoId, menu?.products ?? []);
    if (plato) {
      const precio = formatPriceCarta(Number(plato.price), data.resolved.config);
      const titulo = `${plato.name} · ${precio} — ${name}`;
      const desc = plato.description || `Pídelo en línea en ${name}.`;
      const img = `${ogTarjeta}?platillo=${platoId}`;
      return {
        title: titulo,
        description: desc,
        icons: favicon ? { icon: favicon, apple: favicon } : undefined,
        openGraph: {
          title: titulo, description: desc, url: `${menuUrl}/?platillo=${platoId}`,
          siteName: name, locale: 'es_GT', type: 'website',
          images: [{ url: img, width: 1200, height: 630, alt: plato.name }],
        },
        twitter: { card: 'summary_large_image', title: titulo, description: desc, images: [img] },
        robots: { index: false, follow: false },
      };
    }
  }

  /* La tarjeta grande con la foto del platillo estrella vende más que el
     logo cuadrado (F4-9): con estrella va la tarjeta aunque haya logo. */
  const conEstrella = !!(await platilloEstrella(data.restaurant.id).catch(() => null));
  const usarTarjeta = !logo || conEstrella;
  return {
    title: `${name} — Menú`,
    description,
    alternates: { canonical: menuUrl },
    icons: favicon ? { icon: favicon, apple: favicon } : undefined,
    openGraph: {
      title: `${name} — Menú`,
      description,
      url: menuUrl,
      siteName: name,
      // es_GT como la portada de Leogin; antes decía es_MX (CAT-11).
      locale: 'es_GT',
      type: 'website',
      // Sin logo, una tarjeta con el nombre y la paleta (CV-04): un enlace
      // sin imagen en WhatsApp se ve como texto pelado.
      images: usarTarjeta ? [{ url: ogTarjeta, width: 1200, height: 630, alt: name }] : [{ url: logo! }],
    },
    twitter: usarTarjeta
      ? { card: 'summary_large_image', title: `${name} — Menú`, description, images: [ogTarjeta] }
      : { card: 'summary', title: `${name} — Menú`, description },
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
  const initialPlato = platoDe(params);

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
    if (isGroupSubdomain(host)) redirect('/mi-cuenta');
    return <LeoginLanding />;
  }

  // Subdominio `demo` → menú de ejemplo.
  if (slug === DEMO_SLUG) {
    /* UNA sola demo (2026-11-19, pedido del dueño): había dos Rincón 502 —
       el restaurante de ejemplo en producción, con fotos reales, y esta
       copia fija con dibujos— y confundían. Si existe el restaurante
       `DEMO_RESTAURANT_SLUG` (por omisión «rincon502»), la demo enseña SU
       carta, su tema y sus fotos. Sigue siendo demo: `restaurantId="demo"`,
       así que el pedido termina en «Pídelo tú mismo» y no toca la base. Sin
       ese restaurante (o con su lectura caída), la copia fija de siempre. */
    const real = await getRestaurantBySlugCached(process.env.DEMO_RESTAURANT_SLUG || 'rincon502').catch(() => null);
    const menuReal = real ? await getMenuDataCached(real.restaurant.id).catch(() => null) : null;

    /* Demo por caso (maqueta MAQUETA_DEMO_POR_CASO_Y_CUPO_2026-11-25, aprobada
       el 2026-11-25): mostrador y mesas enseñan la operación —pedido, cobro,
       cocina y caja, o la mesa completa— en vez de la carta del comensal.
       `&vista=carta` vuelve a la carta y al pedido de prueba de siempre. */
    const caso = casoDemo(params.caso);
    if (caso && params.vista !== 'carta') {
      const plan = caso === 'mostrador' ? 'ESTANDAR' : 'PREMIUM';
      const pricing = await getEffectivePlanPricing().catch(() => null);
      const fuente = menuReal && menuReal.products.length > 0 ? menuReal.products : DEMO_PRODUCTS;
      const q = new URLSearchParams({ caso, vista: 'carta', ...(typeof params.plan === 'string' ? { plan: params.plan } : {}) });
      return (
        <DemoOperativa
          caso={caso}
          platos={platosDeDemo(fuente as { id: string; name: string; price: number; is_available?: boolean | null }[])}
          cartaHref={`/?${q.toString()}`}
          registroHref={marketingUrl(enlaceDeAlta({ plan, caso }))}
          plan={PLANS[plan].name}
          precio={pricing ? planPriceLabel(pricing, plan) : ''}
        />
      );
    }
    if (real && menuReal && menuReal.products.length > 0) {
      const [masPedidosDemo, estadosDemo] = await Promise.all([
        getMasPedidosSemanaCached(real.restaurant.id).catch(() => []),
        getEstadosVigentesCached(real.restaurant.id).catch(() => []),
      ]);
      return (
        <>
          <DemoBar intencion={leerIntencion(params.plan, params.caso)} />
          <MenuShell
            config={real.resolved.config}
            content={real.resolved.content}
            categories={menuReal.categories}
            products={withStockLeft(menuReal.products, menuReal.stockLeft, real.resolved.config)}
            restaurantId="demo"
            ordersEnabled
            masPedidos={masPedidosDemo}
            estados={estadosDemo}
          />
        </>
      );
    }
    const demo = resolveTheme(DEMO_THEME, DEMO_SLUG);
    return (
      <>
        <DemoBar intencion={leerIntencion(params.plan, params.caso)} />
        <MenuShell
          config={demo.config}
          content={demo.content}
          categories={DEMO_CATEGORIES}
          products={DEMO_PRODUCTS}
          restaurantId="demo"
          /* Con carrito: el pedido termina en «Pídelo tú mismo», que lo
             enseña llegando al panel sin tocar la base (EV-01). Antes la
             demo dejaba elegir término y extras y no tenía botón. */
          ordersEnabled
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

  // Lectura fallida ≠ carta vacía (CV-02): se dice y se ofrece reintentar.
  let menu: MenuData;
  // «Lo más pedido» (CV-31) se pide junto con la carta; si falla, la tira no se pinta.
  const masPedidosP = getMasPedidosSemanaCached(data.restaurant.id).catch(() => []);
  // Estados del día (CV-32): si falla o falta la migración 189, no se pintan.
  const estadosP = getEstadosVigentesCached(data.restaurant.id).catch(() => []);
  try {
    menu = await getMenuDataCached(data.restaurant.id);
  } catch (e) {
    if (!(e instanceof LecturaMenuFallida)) throw e;
    return <CartaNoCargo nombre={data.restaurant.name} vars={buildThemeVars(data.resolved.config)} />;
  }
  const ordersEnabled = data.restaurant.modules?.orders === true;
  const tz = data.restaurant.timezone || 'America/Guatemala';
  const isOpen = isOpenNow(data.restaurant.hours, tz, new Date(), data.restaurant.hour_exceptions);
  const cierraEn = isOpen ? minutosParaCerrar(data.restaurant.hours, tz, new Date(), data.restaurant.hour_exceptions) : null;
  const reopenHint = !isOpen ? nextOpenLabel(data.restaurant.hours, tz, new Date(), data.restaurant.hour_exceptions) : null;
  /* La pausa se ve desde que se abre la carta (auditoría 26-nov, hallazgo 4):
     antes solo la decía el checkout, con el carrito ya lleno. */
  const r = data.restaurant as { orders_paused?: boolean | null; orders_paused_until?: string | null; pause_message?: string | null };
  const pausa = ordersEnabled && pausaVigente({ orders_paused: r.orders_paused, orders_paused_until: r.orders_paused_until ?? null })
    ? {
        mensaje: conPunto(r.pause_message?.trim() || 'Los pedidos están pausados por el momento.'),
        regreso: fraseDeRegreso(r.orders_paused_until ?? null, tz),
        hasta: r.orders_paused_until ?? null,
      }
    : null;

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

  /* Vitrina en lanzamiento: el archivo de ediciones y, con la edición
     abierta y «Quedan pocas» encendido, cuántas había al abrir (para «Quedan
     9 de 30»). Solo de los productos que el aviso ya enseña. */
  const cfg = data.resolved.config;
  const lanzamiento = isVitrina(cfg) && cfg.launchMode;
  const edicion = estadoEdicion(cfg, new Date().getTime());
  let productos = withStockLeft(menu.products, menu.stockLeft, cfg);
  if (lanzamiento && cfg.showStockLeft && edicion.estado === 'abierta' && edicion.abre !== null) {
    productos = withStockTotal(productos, await getVendidosDesdeCached(data.restaurant.id, new Date(edicion.abre).toISOString()));
  }
  const archivo = lanzamiento ? await getArchivoVitrinaCached(data.restaurant.id) : [];

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
    <MenuShell
      config={data.resolved.config}
      content={data.resolved.content}
      categories={menu.categories}
      products={productos}
      restaurantId={data.restaurant.id}
      ordersEnabled={ordersEnabled}
      isOpen={isOpen}
      pausa={pausa}
      reopenHint={reopenHint}
      cierraEn={cierraEn}
      timezone={tz}
      initialMesa={initialMesa}
      initialPlato={initialPlato}
      masPedidos={await masPedidosP}
      estados={await estadosP}
      llamadaMeseroEnabled={isModuleActive(mod, modSettings, 'llamada_mesero')}
      loyaltyOn={loyaltyOn}
      rewardsCatalog={rewardsCatalog}
      googleAuthEnabled={isGoogleAuthEnabled()}
      whatsappNumber={whatsappNumber}
      restaurantLat={data.restaurant.location_lat}
      restaurantLng={data.restaurant.location_lng}
      deliveryRadiusKm={data.restaurant.delivery_radius_km}
      menuLanguages={data.restaurant.menu_languages ?? []}
      archivo={archivo}
    />
    </>
  );
}

/* Barra superior solo en la demo.
 *
 * Con `?caso=` (las tarjetas «¿Cómo es tu negocio?» de la portada) dice qué
 * se va a probar y lleva al alta con ese plan y ese caso: antes «Crea el
 * tuyo» volvía siempre a la portada y el visitante tenía que elegir otra
 * vez lo que ya había elegido (WEB-UX-01). Sin caso, como siempre. */
function DemoBar({ intencion }: { intencion: IntencionAlta | null }) {
  // El enlace debe llevar al DOMINIO RAÍZ, no a "/" del subdominio demo (que
  // volvería a cargar la misma demo).
  const root = rootDomainForUrls();
  const isLocal = root.includes('localhost') || root.startsWith('127.');
  const rootUrl = `${isLocal ? 'http' : 'https'}://${root}`;
  const destino = intencion ? `${rootUrl}${enlaceDeAlta(intencion)}` : rootUrl;

  return (
    <aside
      aria-label="Demo de Leogin"
      className="glass-solid"
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
        padding: '8px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 10, rowGap: 2, fontSize: 12.5,
      }}
    >
      <span className="t-mute">
        {intencion ? 'Demo · pide y mira la cocina' : 'Demo de Leogin · así se vería tu restaurante'}
      </span>
      <a href={destino} className="press" style={{ color: 'var(--brand-accent-ink)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        {intencion ? `Empezar con ${PLANS[intencion.plan].name} →` : 'Crea el tuyo →'}
      </a>
    </aside>
  );
}
