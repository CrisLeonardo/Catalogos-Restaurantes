import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import MenuClient from '@/components/menu-client';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getMenuData } from '@/lib/db/menu';
import type { Category, Product } from '@/types';

/* ── Datos de demo para el dominio raíz (sin slug de tenant) ── */
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
  if (!slug) return { title: 'Menú en línea — Demo' };

  const data = await getRestaurantBySlug(slug);
  if (!data) return { title: 'Restaurante no encontrado' };

  return {
    title: `${data.restaurant.name} — Menú`,
    description:
      data.restaurant.tagline ?? `Menú en línea de ${data.restaurant.name}`,
  };
}

/* ── Página principal ──────────────────────────────────────── */
export default async function Home() {
  const slug = (await headers()).get('x-tenant-slug');

  // Modo tenant: buscar en Supabase
  if (slug) {
    const data = await getRestaurantBySlug(slug);
    if (!data) notFound();

    const menu = await getMenuData(data.restaurant.id);

    return (
      <MenuPage
        name={data.restaurant.name}
        tagline={data.restaurant.tagline}
        categories={menu.categories}
        products={menu.products}
      />
    );
  }

  // Modo demo: dominio raíz
  return (
    <MenuPage
      name={DEMO.name}
      tagline={DEMO.tagline}
      categories={DEMO.categories}
      products={DEMO.products}
      isDemo
    />
  );
}

/* ── Plantilla de la página del menú ───────────────────────── */
function MenuPage({
  name,
  tagline,
  categories,
  products,
  isDemo = false,
}: {
  name: string;
  tagline: string | null;
  categories: Pick<Category, 'id' | 'name' | 'icon'>[];
  products: Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'tags'>[];
  isDemo?: boolean;
}) {
  return (
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
          {isDemo && (
            <div className="t-kicker" style={{ fontSize: 9.5, marginBottom: 14 }}>
              Demo del sistema de diseño
            </div>
          )}
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
        <MenuClient categories={categories} products={products} />
      </div>
    </main>
  );
}
