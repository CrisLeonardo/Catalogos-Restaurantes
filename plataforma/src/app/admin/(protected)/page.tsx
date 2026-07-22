import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats } from '@/lib/db/orders';
import { getBillingConfig, isOnTrial, trialDaysLeft } from '@/lib/db/billing';
import { getVisitStats } from '@/lib/actions/metrics';
import { PLANS } from '@/lib/plans';
import { Icon } from '@/components/icons';
import { can } from '@/lib/permissions';
import { formatPrice } from '@/lib/theme/resolve';
import OnboardingChecklist, { type OnboardingStep } from '@/components/admin/onboarding-checklist';
import LockedFeatureSection from '@/components/admin/locked-feature-card';
import { Card, CardContent, cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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

  // ── Aviso de visitas del plan gratuito (solo aviso, nunca bloquea el menú) ──
  const visitWarningLimit = restaurant?.plan_actual ? PLANS[restaurant.plan_actual].monthlyVisitWarning : undefined;
  const visitStats = visitWarningLimit && restaurantId
    ? await getVisitStats(restaurantId, timezone)
    : null;
  const visitWarning = !!visitStats && !!visitWarningLimit && visitStats.last30 >= visitWarningLimit;

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
      { key: 'escritorio', label: 'Instala Leogin en tu PC', desc: 'Impresión automática y modo offline', icon: 'monitor', href: '/admin/escritorio', done: false },
    ];
  }

  const allow = (key: string) => can(profile.role, profile.permissions, key);

  // ── Agente Leogin (recomendación / salud) ───────────────────
  // 'install': aún no hay agente funcionando → invitar a instalarlo.
  // 'offline': existía y dejó de reportar >10 min → avisar (sin agente no hay
  // impresión automática ni respaldo offline).
  let agentBanner: 'install' | 'offline' | null = null;
  if (ordersEnabled && restaurantId && allow('impresion')) {
    const db = createServiceClient();
    const { data: agent } = await db
      .from('print_agents')
      .select('last_seen_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    const lastSeen = (agent?.last_seen_at as string | null) ?? null;
    if (!lastSeen) agentBanner = 'install';
    // Frescura evaluada al momento del request a propósito (server component).
    // eslint-disable-next-line react-hooks/purity
    else if (Date.now() - new Date(lastSeen).getTime() > 10 * 60_000) agentBanner = 'offline';
  }
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
    <div className="anim-fade-up flex max-w-[960px] flex-col gap-5">
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
          className={cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3.5 px-4.5 py-4 no-underline')}
          style={{
            border: trialLeft <= 3
              ? '1px solid rgba(248,113,113,0.4)'
              : trialLeft <= 7
              ? '1px solid rgba(251,146,60,0.4)'
              : '1px solid color-mix(in srgb, var(--adm-accent-500) 30%, transparent)',
          }}
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-adm-md"
            style={{
              background: trialLeft <= 3
                ? 'rgba(248,113,113,0.14)'
                : trialLeft <= 7
                ? 'rgba(251,146,60,0.14)'
                : 'color-mix(in srgb, var(--adm-accent-500) 16%, transparent)',
              color: trialLeft <= 3 ? '#f87171' : trialLeft <= 7 ? '#fb923c' : 'var(--adm-accent-500)',
            }}
          >
            <Icon name={trialLeft <= 7 ? 'alertCircle' : 'sparkle'} size={17} />
          </span>
          <div className="min-w-0 flex-1">
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

      {/* Aviso de visitas del plan gratuito (solo aviso — el menú público nunca se bloquea) */}
      {visitWarning && visitStats && (
        <Link
          href="/admin/suscripcion"
          className={cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3.5 px-4.5 py-4 no-underline')}
          style={{ border: '1px solid rgba(251,146,60,0.4)' }}
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-adm-md"
            style={{ background: 'rgba(251,146,60,0.14)', color: '#fb923c' }}
          >
            <Icon name="chart" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
              Tu menú va muy bien: {visitStats.last30.toLocaleString('es-GT')} visitas este mes
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
              Pasaste el uso típico del plan gratuito. Sube de plan para pedidos en línea, WhatsApp y avisos en tiempo real.
            </div>
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
        </Link>
      )}

      {/* Agente Leogin: invitar a instalarlo / avisar si se desconectó */}
      {agentBanner && (
        <Link
          href={agentBanner === 'offline' ? '/admin/impresion' : '/admin/escritorio'}
          className={cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3.5 px-4.5 py-4 no-underline')}
          style={{
            border: agentBanner === 'offline'
              ? '1px solid rgba(251,146,60,0.4)'
              : '1px solid color-mix(in srgb, var(--adm-accent-500) 30%, transparent)',
          }}
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-adm-md"
            style={{
              background: agentBanner === 'offline'
                ? 'rgba(251,146,60,0.14)'
                : 'color-mix(in srgb, var(--adm-accent-500) 16%, transparent)',
              color: agentBanner === 'offline' ? '#fb923c' : 'var(--adm-accent-500)',
            }}
          >
            <Icon name={agentBanner === 'offline' ? 'alertCircle' : 'monitor'} size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
              {agentBanner === 'offline'
                ? 'Leogin en tu PC está desconectado'
                : 'Recomendado: instala Leogin Desktop'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
              {agentBanner === 'offline'
                ? 'Revisa que la PC del local esté encendida — sin el servicio de Leogin no hay impresión automática ni respaldo sin internet.'
                : 'La app de escritorio de Leogin: comandas que se imprimen solas y pedidos que no se detienen sin internet.'}
            </div>
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
        </Link>
      )}

      {/* Onboarding guiado (primera vez) */}
      {needsOnboarding && onboardingSteps.length > 0 && restaurantId && (
        <OnboardingChecklist restaurantId={restaurantId} firstName={firstName} steps={onboardingSteps} />
      )}

      {/* Números de hoy (solo si tiene pedidos en línea) */}
      {stats && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Kpi label="Pedidos hoy" value={String(stats.todayOrders)} icon="list" hero />
          <Kpi label="Ventas hoy" value={fmt(stats.todaySales)} icon="wallet" />
          <Kpi label="Ticket promedio" value={fmt(stats.todayTicket)} icon="chart" />
        </div>
      )}

      {/* Funciones bloqueadas (planes BASICO y ESTANDAR) */}
      {(restaurant?.plan_actual === 'BASICO' || restaurant?.plan_actual === 'ESTANDAR') && (
        <Card>
          <CardContent className="pt-5">
            <LockedFeatureSection restaurantName={brandName} planActual={restaurant.plan_actual} />
          </CardContent>
        </Card>
      )}

      {/* Accesos rápidos */}
      <div>
        <div className="t-kicker mb-2.5" style={{ fontSize: 10 }}>Accesos rápidos</div>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {actions.map((a) => {
            const inner = (
              <>
                <div
                  className="grid size-11 shrink-0 place-items-center rounded-adm-md"
                  style={{
                    background: a.accent ? 'var(--admin-panel-btn, var(--adm-accent-500))' : 'var(--adm-bg-2)',
                    color: a.accent ? 'var(--admin-panel-btn-text, #fff)' : 'var(--u-text)',
                  }}
                >
                  <Icon name={a.icon} size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{a.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.35 }}>{a.desc}</div>
                </div>
                <Icon name={a.external ? 'arrowUpRight' : 'chevronRight'} size={16} style={{ color: 'var(--u-text-4)', marginLeft: 'auto', flexShrink: 0 }} />
              </>
            );
            const className = cn(cardVariants({ variant: 'interactive' }), 'flex items-center gap-3.5 p-4.5 no-underline text-inherit');
            return a.external ? (
              <a key={a.href + a.label} href={a.href} target="_blank" rel="noopener noreferrer" className={className}>{inner}</a>
            ) : (
              <Link key={a.href + a.label} href={a.href} className={className}>{inner}</Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, hero }: { label: string; value: string; icon: string; hero?: boolean }) {
  return (
    <Card className="p-0">
      <CardContent className="flex flex-col gap-3 p-5">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--u-text-3)' }}>
          <Icon name={icon} size={14} />
          <span className="t-kicker" style={{ fontSize: 9.5 }}>{label}</span>
        </div>
        <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 28 : 24, color: 'var(--u-text)', lineHeight: 1.1 }}>{value}</div>
      </CardContent>
    </Card>
  );
}
