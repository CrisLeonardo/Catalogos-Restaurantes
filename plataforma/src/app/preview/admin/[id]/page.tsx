import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  getRestaurantFullById,
  getRestaurantMenuOverview,
} from '@/lib/db/super-admin';
import {
  resolveTheme,
  buildThemeVars,
  buildFontsHref,
  formatPrice,
  type ThemeRow,
} from '@/lib/theme/resolve';
import AdminShell from '@/components/admin/shell';
import { Icon } from '@/components/icons';

/* ============================================================
   /preview/admin/[id] — Vista previa del PANEL del restaurante
   ------------------------------------------------------------
   Solo Super Admin. Muestra cómo ve el dueño su panel admin
   (shell + catálogo) con el tema y los datos reales guardados,
   en modo solo lectura. Se embebe en un iframe desde el editor
   (misma origin → /preview/* permite framing) o se abre aparte.
   ============================================================ */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vista previa del panel — Leogin',
  robots: { index: false, follow: false },
};

async function requireSuperAdmin() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect('/');
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'SUPER_ADMIN') redirect('/admin/menu');
}

export default async function AdminPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSuperAdmin();

  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const theme = row.restaurant_themes[0] ?? null;
  const resolved = resolveTheme(theme as ThemeRow | null, row.slug, {
    brandName: row.name,
    tagline: row.tagline,
  });
  const vars = buildThemeVars(resolved.config);
  const fontsHref = buildFontsHref(resolved.config);
  const ordersEnabled = row.modules?.orders === true;

  const { categories, products } = await getRestaurantMenuOverview(id);
  const available = products.filter((p) => p.is_available).length;
  const soldOut = products.length - available;

  const countByCat = new Map<string | null, number>();
  for (const p of products) countByCat.set(p.category_id, (countByCat.get(p.category_id) ?? 0) + 1);

  return (
    <div
      data-glass={resolved.config.glassIntensity}
      data-scheme={resolved.config.scheme}
      style={{
        ...(vars as CSSProperties),
        minHeight: '100svh',
        background: 'var(--brand-bg)',
        color: 'var(--u-text)',
        fontFamily: 'var(--ui-font-sans)',
      }}
    >
      {fontsHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}

      <AdminShell
        restaurantName={row.name}
        ordersEnabled={ordersEnabled}
        logoUrl={resolved.config.logoUrl}
        zone={resolved.config.zone}
        preview
      >
        <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Aviso de vista previa */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)',
              background: 'rgba(255,255,255,0.03)', fontSize: 12.5, color: 'var(--u-text-2)',
            }}
          >
            <Icon name="eye" size={16} />
            <span>Vista previa del panel del dueño · datos guardados, solo lectura.</span>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Kpi icon="tag" label="Categorías" value={categories.length} />
            <Kpi icon="bag" label="Productos" value={products.length} />
            <Kpi icon="check" label="Disponibles" value={available} />
            <Kpi icon="x" label="Agotados" value={soldOut} />
            {ordersEnabled && <Kpi icon="list" label="Pedidos" value="Activo" />}
          </div>

          {/* Catálogo por categoría */}
          <div className="glass-quiet" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="t-kicker" style={{ fontSize: 10.5 }}>Catálogo</div>

            {categories.length === 0 && products.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--u-text-4)' }}>
                Aún no hay categorías ni productos cargados en este restaurante.
              </p>
            ) : (
              categories.map((cat) => {
                const items = products.filter((p) => p.category_id === cat.id);
                return (
                  <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{cat.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>· {items.length}</span>
                    </div>
                    {items.slice(0, 6).map((p) => (
                      <ProductRow
                        key={p.id}
                        name={p.name}
                        price={formatPrice(p.price, resolved.config)}
                        available={p.is_available}
                      />
                    ))}
                    {items.length > 6 && (
                      <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', paddingLeft: 2 }}>
                        +{items.length - 6} más…
                      </span>
                    )}
                  </div>
                );
              })
            )}

            {/* Productos sin categoría */}
            {(countByCat.get(null) ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text-3)' }}>Sin categoría</span>
                {products.filter((p) => !p.category_id).slice(0, 6).map((p) => (
                  <ProductRow
                    key={p.id}
                    name={p.name}
                    price={formatPrice(p.price, resolved.config)}
                    available={p.is_available}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </AdminShell>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="glass-quiet" style={{ borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--u-text-3)' }}>
        <Icon name={icon} size={16} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      </div>
      <div className="t-display" style={{ fontSize: 26, color: 'var(--u-text)' }}>{value}</div>
    </div>
  );
}

function ProductRow({ name, price, available }: { name: string; price: string; available: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair)',
        background: 'rgba(255,255,255,0.02)', opacity: available ? 1 : 0.55,
      }}
    >
      <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {!available && (
        <span style={{ fontSize: 10.5, color: 'var(--u-text-4)', border: '1px solid var(--u-hair-2)', borderRadius: 99, padding: '2px 8px' }}>
          Agotado
        </span>
      )}
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-2)' }}>{price}</span>
    </div>
  );
}
