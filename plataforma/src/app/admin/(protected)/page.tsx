import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats, getActiveOrdersPreview, type ActiveOrderPreview } from '@/lib/db/orders';
import { getBillingConfig, isOnTrial, trialDaysLeft } from '@/lib/db/billing';
import { getVisitStats } from '@/lib/actions/metrics';
import { PLANS } from '@/lib/plans';
import { Icon } from '@/components/icons';
import { can } from '@/lib/permissions';
import { STATUS_LABEL_SHORT } from '@/lib/order-status';
import { formatPrice } from '@/lib/theme/resolve';
import OnboardingChecklist, { type OnboardingStep } from '@/components/admin/onboarding-checklist';
import LockedFeatureSection from '@/components/admin/locked-feature-card';
import { Card, CardContent } from '@/components/ui/card';
import { List, ListLink, ListText, StatusDot, StatusPill, type Tone } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import type { ResolvedTheme } from '@/lib/theme/resolve';
import type { OrderStatus, Restaurant } from '@/types';

export const metadata = { title: 'Hoy – Panel admin' };

/* ============================================================
   /admin — "Hoy"
   ------------------------------------------------------------
   Fase 1 del rediseño (dirección Claridad). Antes esta pantalla
   apilaba hasta seis bloques del mismo peso: aviso de prueba,
   aviso de visitas, aviso de la PC, primeros pasos, números del
   día y seis accesos rápidos que en su mayoría repetían el menú.

   Ahora responde UNA pregunta —cómo va hoy— en tres bloques con
   jerarquía real:
     1. Necesita tu atención — TODOS los avisos juntos, ordenados
        por urgencia, y el bloque entero desaparece si no hay nada.
     2. Resumen del día — los tres números, sin adornos.
     3. En curso — los pedidos que están pasando ahora mismo.

   Los accesos rápidos que sí hacían falta (agregar platillo, ver
   el menú publicado) subieron a la cabecera como acciones; los
   demás eran atajos a entradas que ya están en el menú lateral.
   ============================================================ */

/** Un renglón de "Necesita tu atención", ya resuelto y listo para pintar. */
interface Alert {
  key: string;
  href: string;
  /** Manda el orden y el color del punto: cuanto más arriba, más urgente. */
  level: 'urgente' | 'aviso' | 'info';
  title: string;
  desc: string;
  action: string;
}

const LEVEL_ORDER: Record<Alert['level'], number> = { urgente: 0, aviso: 1, info: 2 };
const LEVEL_TONE: Record<Alert['level'], Tone> = {
  urgente: 'danger',
  aviso: 'warn',
  info: 'neutral',
};

/** Tono del punto de estado de un pedido. Mismo criterio semántico que
 *  STATUS_CHIP: verde = actuar ya (está listo y se enfría), ámbar = está
 *  cocinándose, acento = acaba de entrar, gris = ya no hay nada que hacer. */
const STATUS_TONE: Record<OrderStatus, Tone> = {
  NEW: 'accent',
  PREP: 'warn',
  READY: 'ok',
  TRANSIT: 'ok',
  SERVED: 'neutral',
  DELIVERED: 'neutral',
  CANCEL: 'neutral',
};

/** Cómo se llama el pedido en una lista: la mesa si la hay, si no el canal.
 *  El número de mesa viaja dentro de `address` como "Mesa N" (igual que en
 *  el KDS, ver kitchen-display.tsx). */
function orderLabel(o: ActiveOrderPreview): string {
  if (o.order_type === 'DINE_IN') {
    const m = o.address?.match(/Mesa\s+(\d+)/i);
    return m ? `Mesa ${m[1]}` : 'En local';
  }
  return o.order_type === 'PICKUP' ? 'Para llevar' : 'Domicilio';
}

function agoLabel(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.round(mins / 60)} h`;
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
  const allow = (key: string) => can(profile.role, profile.permissions, key);

  const [stats, live] = await Promise.all([
    ordersEnabled && restaurantId ? getOrderStats(restaurantId, timezone) : null,
    ordersEnabled && restaurantId && allow('pedidos')
      ? getActiveOrdersPreview(restaurantId, 4)
      : null,
  ]);

  // ── Prueba gratis ───────────────────────────────────────────
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
      { key: 'escritorio', label: 'Elige la PC del local', desc: 'Para que imprima sola y no te frene un corte de internet', icon: 'monitor', href: '/admin/mi-pc', done: false },
    ];
  }

  // ── Salud de la PC principal ────────────────────────────────
  // Solo 'offline': la PC estaba encendida y dejó de reportar >10 min, que es
  // un PROBLEMA (se fue la luz, la apagaron sin querer). Los casos "no hay
  // ninguna" y "la apagué yo" ya los cubre el aviso del layout
  // (components/admin/main-pc-banner.tsx) en todas las pantallas.
  let agentOffline = false;
  if (ordersEnabled && restaurantId && allow('impresion')) {
    const db = createServiceClient();
    const { data: agent } = await db
      .from('print_agents')
      .select('last_seen_at, is_active')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    const lastSeen = (agent?.last_seen_at as string | null) ?? null;
    // Frescura evaluada al momento del request a propósito (server component).
    // eslint-disable-next-line react-hooks/purity
    const stale = !!lastSeen && Date.now() - new Date(lastSeen).getTime() > 10 * 60_000;
    if (stale && (agent?.is_active as boolean | null) !== false) agentOffline = true;
  }

  const fmt = (n: number) => (resolved ? formatPrice(n, resolved.config) : `Q${n.toFixed(2)}`);
  const brandName = restaurant?.name ?? 'tu restaurante';

  // Fecha de hoy en la zona del restaurante, no en la del servidor.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  let today: string;
  try {
    today = new Intl.DateTimeFormat('es-GT', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone,
    }).format(new Date(now));
    today = today.charAt(0).toUpperCase() + today.slice(1);
  } catch {
    today = brandName;
  }

  // ── Un solo bloque de avisos, ordenado por urgencia ─────────
  const alerts: Alert[] = [];
  if (agentOffline) {
    alerts.push({
      key: 'pc', href: '/admin/mi-pc', level: 'urgente',
      title: 'La PC del local dejó de responder',
      desc: 'Revisa que esté encendida y con internet — mientras tanto no se imprimen comandas solas.',
      action: 'Revisar',
    });
  }
  if (onTrial && trialLeft <= 3) {
    alerts.push({
      key: 'trial', href: '/admin/suscripcion', level: 'urgente',
      title: `Tu prueba termina en ${trialLeft} día${trialLeft !== 1 ? 's' : ''}`,
      desc: 'Contáctanos para continuar sin interrupciones.',
      action: 'Ver planes',
    });
  }
  if (visitWarning && visitStats) {
    alerts.push({
      key: 'visitas', href: '/admin/suscripcion', level: 'aviso',
      title: `Tu menú va muy bien: ${visitStats.last30.toLocaleString('es-GT')} visitas este mes`,
      desc: 'Pasaste el uso típico del plan gratuito. Sube de plan para pedidos en línea, WhatsApp y avisos en tiempo real.',
      action: 'Ver planes',
    });
  }
  if (onTrial && trialLeft > 3) {
    alerts.push({
      key: 'trial', href: '/admin/suscripcion', level: 'info',
      title: `Te quedan ${trialLeft} días de prueba`,
      desc: 'Tu menú ya está en vivo. Aprovéchalo al máximo.',
      action: 'Ver planes',
    });
  }
  alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  return (
    <div className="anim-fade-up flex max-w-[1040px] flex-col gap-6">

      {/* Cabecera: el título y las dos únicas acciones que no están en el menú */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="t-display" style={{ fontSize: 26, lineHeight: 1.15 }}>Hoy</h2>
          <p style={{ fontSize: 14.5, color: 'var(--u-text-3)', marginTop: 6 }}>
            {today} · {brandName}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-2 rounded-adm-md px-3.5 py-2 no-underline"
            style={{
              border: '1px solid var(--u-hair-2)', color: 'var(--u-text-2)',
              fontSize: 13.5, fontWeight: 500,
            }}
          >
            <Icon name="eye" size={15} />
            Ver mi menú
          </a>
          {allow('catalogo') && (
            <Link
              href="/admin/menu/productos/new"
              className="btn-accent press inline-flex items-center gap-2 rounded-adm-md px-3.5 py-2 no-underline"
              style={{ fontSize: 13.5, fontWeight: 600 }}
            >
              <Icon name="plus" size={15} />
              Agregar platillo
            </Link>
          )}
        </div>
      </div>

      {/* Primeros pasos (solo la primera vez) */}
      {needsOnboarding && onboardingSteps.length > 0 && restaurantId && (
        <OnboardingChecklist restaurantId={restaurantId} firstName={(profile.full_name || '').trim().split(' ')[0]} steps={onboardingSteps} />
      )}

      {/* 1 · Necesita tu atención — desaparece entero cuando no hay nada */}
      {alerts.length > 0 && (
        <Section title="Necesita tu atención">
          <List>
            {alerts.map((a) => (
              <ListLink key={a.key} href={a.href}>
                <StatusDot tone={LEVEL_TONE[a.level]} size={9} />
                <ListText title={a.title} desc={a.desc} />
                <span
                  className="shrink-0 text-[13.5px] font-semibold"
                  style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
                >
                  {a.action}
                </span>
              </ListLink>
            ))}
          </List>
        </Section>
      )}

      {/* 2 · Resumen del día */}
      {stats && (
        <Section
          title="Resumen del día"
          action={allow('metricas') ? { href: '/admin/metricas', label: 'Ver el mes' } : undefined}
        >
          <StatGroup>
            <Stat label="Ventas" value={fmt(stats.todaySales)} />
            <Stat label="Pedidos" value={String(stats.todayOrders)} />
            <Stat label="Ticket promedio" value={fmt(stats.todayTicket)} />
          </StatGroup>
        </Section>
      )}

      {/* 3 · En curso */}
      {live && live.total > 0 && (
        <Section title="En curso">
          <List>
            {live.orders.map((o) => (
              <ListLink key={o.id} href="/admin/pedidos">
                <span className="w-26 shrink-0 text-[14.5px] font-semibold text-adm-text">
                  {orderLabel(o)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-adm-text-3">
                  {o.customer_name ? `${o.customer_name} · ` : ''}{agoLabel(o.created_at, now)}
                </span>
                <StatusPill tone={STATUS_TONE[o.status]} className="w-29 shrink-0">
                  {STATUS_LABEL_SHORT[o.status]}
                </StatusPill>
                <span className="t-mono w-24 shrink-0 text-right text-[14.5px] text-adm-text">
                  {fmt(Number(o.total))}
                </span>
              </ListLink>
            ))}
            <ListLink
              href="/admin/pedidos"
              className="gap-2 text-[14px] font-semibold"
              style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
            >
              Ver {live.total === 1 ? 'el pedido' : `los ${live.total} pedidos`}
              <Icon name="chevronRight" size={15} />
            </ListLink>
          </List>
        </Section>
      )}

      {/* Qué incluye subir de plan. Vive al FINAL a propósito: es una oferta,
          no una tarea del día, y no debe competir con lo de arriba. */}
      {(restaurant?.plan_actual === 'BASICO' || restaurant?.plan_actual === 'ESTANDAR') && (
        <Card>
          <CardContent className="pt-5">
            <LockedFeatureSection restaurantName={brandName} planActual={restaurant.plan_actual} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

