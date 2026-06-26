import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats } from '@/lib/db/orders';
import { getBillingConfig, isOnTrial, trialDaysLeft } from '@/lib/db/billing';
import { Icon } from '@/components/icons';
import { can } from '@/lib/permissions';
import { formatPrice } from '@/lib/theme/resolve';
import OnboardingChecklist, { type OnboardingStep } from '@/components/admin/onboarding-checklist';
import PlanGmvBar from '@/components/admin/plan-gmv-bar';
import LockedFeatureSection from '@/components/admin/locked-feature-card';
import type { ResolvedTheme } from '@/lib/theme/resolve';
import type { Restaurant } from '@/types';

export const metadata = { title: 'Inicio – Panel admin' };

/* ============================================================
   /admin — Inicio del panel
   ------------------------------------------------------------
   Antes redirigía directo a /admin/menu. Ahora es un tablero
   con accesos rápidos (lo que el dueño hace a diario) y los
   números de hoy, para no caer de golpe en una lista larga.
   ============================================================ */

interface QuickAction {
  href: string;
  icon: string;
  label: string;
  desc: string;
  external?: boolean;
  accent?: boolean;
}

export default async function AdminHomePage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  const { profile } = ctx;

  const slug = (await headers()).get('x-tenant-slug');

  let restaurant: Restaurant | null = ctx.restaurant ?? null;
  let resolved: ResolvedTheme | null = null;
  if (slug) {
    const data = await getRestaurantBySlug(slug);
    if (data) { restaurant = data.restaurant; resolved = data.resolved; }
  }

  const modules = restaurant?.modules as Record<string, boolean> | null;
  const ordersEnabled = modules?.orders === true;
  const timezone = restaurant?.timezone ?? 'America/Guatemala';
  const restaurantId = restaurant?.id ?? profile.restaurant_id ?? null;

  const stats = ordersEnabled && restaurantId
    ? await getOrderStats(restaurantId, timezone)
    : null;

  // ── Prueba gratis (banner) ──────────────────────────────────
  const billing = restaurantId ? await getBillingConfig(restaurantId) : null;
  const onTrial = isOnTrial(billing);
  const trialLeft = onTrial ? trialDaysLeft(billing) : 0;

  // ── Onboarding guiado (solo el dueño, primera vez) ──────────
  const needsOnboarding =
    profile.role === 'RESTAURANT_OWNER' && restaurant?.onboarding_done === false && !!restaurantId;
  let onboardingSteps: OnboardingStep[] = [];
  if (needsOnboarding && restaurantId) {
    const db = createServiceClient();
    const [{ count: catCount }, { count: prodCount }] = await Promise.all([
      db.from('categories').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
      db.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    ]);
    const hasLogo = !!resolved?.config.logoUrl;
    onboardingSteps = [
      { key: 'marca', label: 'Personaliza tu marca', desc: 'Logo, colores y estilo', icon: 'sparkle', href: '/admin/personalizacion', done: hasLogo },
      { key: 'categoria', label: 'Crea una categoría', desc: 'Organiza tu menú', icon: 'tag', href: '/admin/categorias', done: (catCount ?? 0) > 0 },
      { key: 'platillo', label: 'Agrega tu primer platillo', desc: 'Suma un producto', icon: 'plus', href: '/admin/menu/productos/new', done: (prodCount ?? 0) > 0 },
      { key: 'qr', label: 'Comparte tu menú', desc: 'Descarga tu código QR', icon: 'image', href: '/admin/qr', done: false },
    ];
  }

  const allow = (key: string) => can(profile.role, profile.permissions, key);
  const fmt = (n: number) => (resolved ? formatPrice(n, resolved.config) : `Q${n.toFixed(2)}`);
  const firstName = (profile.full_name || '').trim().split(' ')[0];
  const brandName = restaurant?.name ?? 'tu restaurante';

  const actions: QuickAction[] = [
    ordersEnabled && allow('pedidos') && { href: '/admin/pedidos', icon: 'list', label: 'Pedidos en vivo', desc: 'Atiende y avanza pedidos', accent: true },
    allow('catalogo') && { href: '/admin/menu/productos/new', icon: 'plus', label: 'Agregar platillo', desc: 'Suma un producto al menú' },
    allow('catalogo') && { href: '/admin/menu', icon: 'bag', label: 'Mi catálogo', desc: 'Edita precios y disponibilidad' },
    allow('categorias') && { href: '/admin/categorias', icon: 'tag', label: 'Categorías', desc: 'Organiza tu menú' },
    allow('personalizar') && { href: '/admin/personalizacion', icon: 'sparkle', label: 'Personalizar', desc: 'Colores, fuentes y estilo' },
    { href: '/', icon: 'eye', label: 'Ver mi menú', desc: 'Cómo lo ve tu cliente', external: true },
  ].filter(Boolean) as QuickAction[];

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 920 }}>
      <div>
        <h2 className="t-display" style={{ fontSize: 24, lineHeight: 1.1 }}>
          {firstName ? `Hola, ${firstName}` : `Hola`}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 4 }}>
          Esto es lo que pasa hoy en {brandName}.
        </p>
      </div>

      {/* Banner de prueba gratis */}
      {onTrial && (
        <Link
          href="/admin/suscripcion"
          className="glass press"
          style={{
            borderRadius: 14, padding: '12px 16px', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 11,
            border: trialLeft <= 3
              ? '1px solid rgba(248,113,113,0.45)'
              : trialLeft <= 7
              ? '1px solid rgba(251,146,60,0.45)'
              : '1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent)',
          }}
        >
          <span style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: trialLeft <= 3
              ? 'rgba(248,113,113,0.14)'
              : trialLeft <= 7
              ? 'rgba(251,146,60,0.14)'
              : 'rgba(var(--brand-accent-rgb, 99,102,241),0.14)',
            color: trialLeft <= 3 ? '#f87171' : trialLeft <= 7 ? '#fb923c' : 'var(--brand-accent)',
          }}>
            <Icon name={trialLeft <= 7 ? 'alertCircle' : 'sparkle'} size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
              {trialLeft <= 3
                ? `¡Tu prueba termina en ${trialLeft} día${trialLeft !== 1 ? 's' : ''}!`
                : `Prueba gratis · ${trialLeft} día${trialLeft !== 1 ? 's' : ''} restante${trialLeft !== 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
              {trialLeft <= 3
                ? 'Contáctanos para continuar sin interrupciones.'
                : 'Tu menú ya está en vivo. Aprovéchalo al máximo.'}
            </div>
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
        </Link>
      )}

      {/* Onboarding guiado (primera vez) */}
      {needsOnboarding && onboardingSteps.length > 0 && restaurantId && (
        <OnboardingChecklist restaurantId={restaurantId} firstName={firstName} steps={onboardingSteps} />
      )}

      {/* Barra GMV (solo para planes con límite mensual) */}
      {restaurantId && restaurant?.plan_actual && !['VARIABLE'].includes(restaurant.plan_actual) && (
        <PlanGmvBar restaurantId={restaurantId} />
      )}

      {/* Números de hoy (solo si tiene pedidos en línea) */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Kpi label="Pedidos hoy" value={String(stats.todayOrders)} icon="list" hero />
          <Kpi label="Ventas hoy" value={fmt(stats.todaySales)} icon="wallet" />
          <Kpi label="Ticket promedio" value={fmt(stats.todayTicket)} icon="chart" />
        </div>
      )}

      {/* Funciones bloqueadas (planes BASICO y ESTANDAR) */}
      {(restaurant?.plan_actual === 'BASICO' || restaurant?.plan_actual === 'ESTANDAR') && (
        <div className="glass" style={{ borderRadius: 18, padding: '20px 18px' }}>
          <LockedFeatureSection restaurantName={brandName} planActual={restaurant.plan_actual} />
        </div>
      )}

      {/* Accesos rápidos */}
      <div>
        <div className="t-kicker" style={{ fontSize: 10, marginBottom: 10 }}>Accesos rápidos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {actions.map((a) => {
            const inner = (
              <>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: a.accent ? 'var(--admin-panel-btn, var(--brand-accent))' : 'var(--surface-3)',
                  color: a.accent ? 'var(--admin-panel-btn-text, #fff)' : 'var(--u-text)',
                }}>
                  <Icon name={a.icon} size={19} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{a.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>{a.desc}</div>
                </div>
                <Icon name={a.external ? 'arrowUpRight' : 'chevronRight'} size={16} style={{ color: 'var(--u-text-4)', marginLeft: 'auto', flexShrink: 0 }} />
              </>
            );
            const style: React.CSSProperties = {
              display: 'flex', alignItems: 'center', gap: 12, padding: 14,
              textDecoration: 'none', color: 'inherit', borderRadius: 16,
            };
            return a.external ? (
              <a key={a.href + a.label} href={a.href} target="_blank" rel="noopener noreferrer" className="glass press" style={style}>{inner}</a>
            ) : (
              <Link key={a.href + a.label} href={a.href} className="glass press" style={style}>{inner}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, hero }: { label: string; value: string; icon: string; hero?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--u-text-3)' }}>
        <Icon name={icon} size={14} />
        <span className="t-kicker" style={{ fontSize: 9.5 }}>{label}</span>
      </div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 30 : 24, color: 'var(--u-text)', lineHeight: 1 }}>{value}</div>
    </div>
  );
}
