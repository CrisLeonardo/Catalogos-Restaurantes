import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import MenuShell from '@/components/menu-shell';
import LeoginLanding from '@/components/landing';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getMenuData } from '@/lib/db/menu';
import { resolveTheme } from '@/lib/theme/resolve';
import { DEMO_SLUG } from '@/lib/tenant';
import type { Category, Product } from '@/types';

/* ── Datos de la demo pública (subdominio `demo`) ──────────── */
const DEMO = {
  categories: [
    { id: 'c1', name: 'Bagels', icon: 'bagel' },
    { id: 'c2', name: 'Café',   icon: 'coffee' },
    { id: 'c3', name: 'Fríos',  icon: 'ice' },
    { id: 'c4', name: 'Dulce',  icon: 'cookie' },
  ] satisfies Pick<Category, 'id' | 'name' | 'icon'>[],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Negra Brava',    description: 'Bagel de carbón activado, chorizo artesanal, huevo y jalapeño curtido.', price: 45, image_url: null, icon: null, tags: ['Picante', 'Favorito'] },
    { id: 'p2', category_id: 'c1', name: 'El Clásico',     description: 'Bagel del día, queso crema batido y un toque de sal de mar.',            price: 28, image_url: null, icon: null, tags: [] },
    { id: 'p3', category_id: 'c1', name: 'Lox del Barrio', description: 'Salmón curado en casa, queso crema, alcaparras y cebolla morada.',        price: 62, image_url: null, icon: null, tags: ['Favorito'] },
    { id: 'p4', category_id: 'c2', name: 'Mocha Negra',    description: 'Espresso doble, cacao 70% y leche al vapor. El sabor de la casa.',        price: 26, image_url: null, icon: null, tags: ['Favorito'] },
    { id: 'p5', category_id: 'c2', name: 'Latte de Calle', description: 'Espresso suave, leche sedosa, arte en cada taza.',                       price: 22, image_url: null, icon: null, tags: [] },
    { id: 'p6', category_id: 'c3', name: 'Cold Brew 18h',  description: 'Extracción en frío 18 horas. Suave, intenso, sin amargor.',               price: 24, image_url: null, icon: null, tags: [] },
    { id: 'p7', category_id: 'c3', name: 'Frappé Azúcar',  description: 'Café, hielo, leche y caramelo de azúcar negra batido.',                   price: 30, image_url: null, icon: null, tags: ['Nuevo'] },
    { id: 'p8', category_id: 'c4', name: 'Roll de Canela', description: 'Recién horneado, glaseado de queso crema. Caliente siempre.',             price: 25, image_url: null, icon: null, tags: ['Favorito'] },
    { id: 'p9', category_id: 'c4', name: 'Brownie Negro',  description: 'Chocolate 80%, centro fundido, sal Maldon encima.',                       price: 22, image_url: null, icon: null, tags: [] },
  ] satisfies Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags'>[],
};

/* ── Metadata dinámica por restaurante ─────────────────────── */
export async function generateMetadata(): Promise<Metadata> {
  const slug = (await headers()).get('x-tenant-slug');

  if (!slug) {
    return {
      title: 'Leogin — Menús digitales para restaurantes',
      description:
        'Convierte el menú de tu restaurante en una experiencia web rápida y espectacular, con panel de administración y pedidos en línea.',
    };
  }

  if (slug === DEMO_SLUG) {
    return { title: 'Demo — Leogin', description: 'Así se ve un restaurante con Leogin.' };
  }

  const data = await getRestaurantBySlug(slug);
  if (!data) return { title: 'Restaurante no encontrado' };

  const name = data.restaurant.name;
  const description = data.restaurant.tagline ?? `Menú en línea de ${name}`;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const menuUrl = rootDomain ? `https://${slug}.${rootDomain}` : undefined;

  return {
    title: `${name} — Menú`,
    description,
    openGraph: { title: `${name} — Menú`, description, url: menuUrl, siteName: name, locale: 'es_MX', type: 'website' },
    twitter: { card: 'summary', title: `${name} — Menú`, description },
    robots: { index: true, follow: false },
  };
}

/* ── Página principal ──────────────────────────────────────── */
export default async function Home() {
  const slug = (await headers()).get('x-tenant-slug');

  // Dominio raíz → landing comercial de Leogin
  if (!slug) return <LeoginLanding />;

  // Subdominio `demo` → menú de ejemplo (Azúcar Negra, sin BD)
  if (slug === DEMO_SLUG) {
    const demo = resolveTheme(
      {
        brand_name: 'Azúcar Negra',
        config: { tagline: 'Cafetería con sabor a calle', zone: 'Zona 1', portadaVariant: 'spotlight' },
      },
      DEMO_SLUG,
    );
    return (
      <>
        <DemoBar />
        <MenuShell
          config={demo.config}
          content={demo.content}
          categories={DEMO.categories}
          products={DEMO.products}
          restaurantId="demo"
          ordersEnabled={false}
        />
      </>
    );
  }

  // Tenant real
  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const menu = await getMenuData(data.restaurant.id);
  const ordersEnabled = data.restaurant.modules?.orders === true;

  return (
    <MenuShell
      config={data.resolved.config}
      content={data.resolved.content}
      categories={menu.categories}
      products={menu.products}
      restaurantId={data.restaurant.id}
      ordersEnabled={ordersEnabled}
    />
  );
}

/* Barra superior solo en la demo. */
function DemoBar() {
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
      <Link href="/" className="press" style={{ color: 'var(--brand-accent)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Crea el tuyo →
      </Link>
    </div>
  );
}
