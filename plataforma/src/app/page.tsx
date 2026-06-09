import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import MenuShell from '@/components/menu-shell';
import LeoginLanding from '@/components/landing';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getMenuData } from '@/lib/db/menu';
import { DEMO_SLUG } from '@/lib/tenant';
import type { Category, Product } from '@/types';

/* ── Datos de la demo pública (subdominio `demo`) ──────────── */
const DEMO = {
  name: 'Azúcar Negra',
  tagline: 'Cafetería con sabor a calle',
  categories: [
    { id: 'c1', name: 'Bagels', icon: null },
    { id: 'c2', name: 'Café',   icon: null },
    { id: 'c3', name: 'Fríos',  icon: null },
    { id: 'c4', name: 'Dulce',  icon: null },
  ] satisfies Pick<Category, 'id' | 'name' | 'icon'>[],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Negra Brava',    description: 'Bagel de carbón activado, chorizo artesanal, huevo y jalapeño curtido.', price: 45, image_url: null, tags: ['Picante']  },
    { id: 'p2', category_id: 'c1', name: 'Lox del Barrio', description: 'Salmón curado en casa, queso crema, alcaparras y cebolla morada.',        price: 62, image_url: null, tags: ['Favorito'] },
    { id: 'p3', category_id: 'c2', name: 'Mocha Negra',    description: 'Espresso doble, cacao 70% y leche al vapor. El sabor de la casa.',        price: 26, image_url: null, tags: ['Favorito'] },
    { id: 'p4', category_id: 'c3', name: 'Cold Brew 18h',  description: 'Extracción en frío 18 horas. Suave, intenso, sin amargor.',               price: 24, image_url: null, tags: null         },
    { id: 'p5', category_id: 'c4', name: 'Roll de Canela', description: 'Recién horneado, glaseado de queso crema. Caliente siempre.',              price: 25, image_url: null, tags: ['Nuevo']    },
    { id: 'p6', category_id: 'c4', name: 'Brownie Negro',  description: 'Chocolate 80%, centro fundido, sal Maldon encima.',                       price: 22, image_url: null, tags: null         },
  ] satisfies Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'tags'>[],
};

/* ── Metadata dinámica por restaurante ─────────────────────── */
export async function generateMetadata(): Promise<Metadata> {
  const slug = (await headers()).get('x-tenant-slug');

  // Dominio raíz → landing de Leogin
  if (!slug) {
    return {
      title: 'Leogin — Menús digitales para restaurantes',
      description:
        'Convierte el menú de tu restaurante en una experiencia web rápida y espectacular, con panel de administración y pedidos en línea.',
    };
  }

  // Subdominio `demo` → menú de ejemplo
  if (slug === DEMO_SLUG) {
    return { title: 'Demo — Leogin', description: 'Así se ve un restaurante con Leogin.' };
  }

  const data = await getRestaurantBySlug(slug);
  if (!data) return { title: 'Restaurante no encontrado' };

  const name = data.restaurant.name;
  const description =
    data.restaurant.tagline ?? `Menú en línea de ${name}`;

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const menuUrl = rootDomain ? `https://${slug}.${rootDomain}` : undefined;

  return {
    title: `${name} — Menú`,
    description,
    openGraph: {
      title: `${name} — Menú`,
      description,
      url: menuUrl,
      siteName: name,
      locale: 'es_MX',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${name} — Menú`,
      description,
    },
    robots: {
      index: true,
      follow: false,
    },
  };
}

/* ── Página principal ──────────────────────────────────────── */
export default async function Home() {
  const slug = (await headers()).get('x-tenant-slug');

  // Dominio raíz (sin subdominio) → landing comercial de Leogin
  if (!slug) return <LeoginLanding />;

  // Subdominio `demo` → menú de ejemplo (datos en código, siempre disponible)
  if (slug === DEMO_SLUG) {
    return (
      <MenuPage
        name={DEMO.name}
        tagline={DEMO.tagline}
        categories={DEMO.categories}
        products={DEMO.products}
        restaurantId="demo"
        ordersEnabled={false}
        isDemo
      />
    );
  }

  // Tenant real: buscar en Supabase
  const data = await getRestaurantBySlug(slug);
  if (!data) notFound();

  const menu = await getMenuData(data.restaurant.id);
  const ordersEnabled = data.restaurant.modules?.orders === true;

  return (
    <MenuPage
      name={data.restaurant.name}
      tagline={data.restaurant.tagline}
      categories={menu.categories}
      products={menu.products}
      restaurantId={data.restaurant.id}
      ordersEnabled={ordersEnabled}
    />
  );
}

/* ── Plantilla de la página del menú ───────────────────────── */
function MenuPage({
  name,
  tagline,
  categories,
  products,
  restaurantId,
  ordersEnabled,
  isDemo = false,
}: {
  name: string;
  tagline: string | null;
  categories: Pick<Category, 'id' | 'name' | 'icon'>[];
  products: Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'tags'>[];
  restaurantId: string;
  ordersEnabled: boolean;
  isDemo?: boolean;
}) {
  return (
    <>
      {/* ── Barra de demo (solo en el subdominio `demo`) ──── */}
      {isDemo && (
        <div
          className="glass-solid"
          style={{
            position: 'sticky', top: 0, zIndex: 50,
            borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
            padding: '8px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10, fontSize: 12.5,
          }}
        >
          <span className="t-mute">Demo de Leogin · así se vería tu restaurante</span>
          <Link
            href="/"
            className="press"
            style={{
              color: 'var(--brand-accent)', fontWeight: 600,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Crea el tuyo →
          </Link>
        </div>
      )}

      <main
        className="anim-fade-up"
        style={{
          width: '100%', maxWidth: 440,
          margin: '0 auto', padding: '28px 16px 64px',
        }}
      >
      {/* ── Portada Spotlight ─────────────────────────────── */}
      <section style={{ position: 'relative', marginBottom: 28 }}>
        {/* Glow de acento detrás de la tarjeta */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: '-40px -20px 0',
            background:
              'radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <Glass style={{ padding: '28px 22px', textAlign: 'center' }}>
          <h1 className="t-display" style={{ fontSize: 'var(--fs-display-xl)' }}>
            {name}
          </h1>
          {tagline && (
            <p className="t-mute" style={{ marginTop: 10, fontSize: 14 }}>
              {tagline}
            </p>
          )}
          <a
            href="#menu"
            className="press btn-accent"
            style={{
              display: 'inline-block', marginTop: 18,
              padding: '12px 24px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 600, fontSize: 14,
              textDecoration: 'none', color: '#fff',
            }}
          >
            Ver el menú
          </a>
        </Glass>
      </section>

      {/* ── Catálogo ──────────────────────────────────────── */}
      <div id="menu">
        <MenuShell
          categories={categories}
          products={products}
          restaurantId={restaurantId}
          ordersEnabled={ordersEnabled}
        />
      </div>
      </main>
    </>
  );
}
