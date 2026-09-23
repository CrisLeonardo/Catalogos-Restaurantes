import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats, getActiveOrdersPreview, type ActiveOrderPreview } from '@/lib/db/orders';
import { getHoyWidgets } from '@/lib/db/hoy';
import { getBillingConfig, isOnTrial, trialDaysLeft } from '@/lib/db/billing';
import { getVisitStats } from '@/lib/actions/metrics';
import { subdomainUrl } from '@/lib/tenant';
import { PLANS, withPlanFloor, PLAN_ORDER, type PlanCode } from '@/lib/plans';
import { isModuleActive } from '@/lib/modules';
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
import {
  agoLabel, HouseWidget, OnlineWidget, RatingsWidget, StockWidget,
} from '@/components/admin/hoy-widgets';
import { SalesTrendWidget, TopTodayWidget } from '@/components/admin/sales-widgets';
import type { ResolvedTheme } from '@/lib/theme/resolve';
import type { OrderStatus, Restaurant } from '@/types';
import { mesaDeFila, direccionDeMesa } from '@/lib/mesa';
import { panelBase } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';

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
 *  La mesa sale de `lib/mesa.ts`, igual que en el KDS y en el salón: antes
 *  cada pantalla traía su propia copia del regex sobre `address`. */
function orderLabel(o: ActiveOrderPreview): string {
  if (o.order_type === 'DINE_IN') {
    const n = mesaDeFila(o);
    return n != null ? direccionDeMesa(n) : 'En local';
  }
  return o.order_type === 'PICKUP' ? 'Para llevar' : 'Domicilio';
}

export default async function AdminHomePage() {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();
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

  /* Módulos activos, con el MISMO criterio que el menú lateral: el plan manda
     sobre la bandera del jsonb (withPlanFloor) y un módulo activable necesita
     además que el restaurante lo tenga encendido (isModuleActive).

     Antes esta pantalla miraba `modules.orders` a pelo. Eso bastaba mientras
     solo decidía si pintar tres cifras, pero con los widgets significa que un
     restaurante cuyo plan incluye pedidos y tiene la bandera atrasada vería
     media portada vacía — justo la incoherencia que withPlanFloor existe para
     evitar en el nav. */
  const planActual = (restaurant?.plan_actual as string | null) ?? null;
  const mod = withPlanFloor(
    ((PLAN_ORDER as string[]).includes(planActual ?? '') ? planActual : 'BASICO') as PlanCode,
    (restaurant?.modules as Record<string, boolean> | null) ?? {},
  );
  const modSettings = restaurant?.module_settings ?? null;
  const ordersEnabled = mod.orders === true;
  const timezone = restaurant?.timezone ?? 'America/Guatemala';
  const restaurantId = restaurant?.id ?? profile.restaurant_id ?? null;
  const allow = (key: string) => can(profile.role, profile.permissions, key);

  const [stats, live] = await Promise.all([
    ordersEnabled && restaurantId ? getOrderStats(restaurantId, timezone) : null,
    ordersEnabled && restaurantId && allow('pedidos')
      ? getActiveOrdersPreview(restaurantId, 4)
      : null,
  ]);

  /* Visitas al menú. Se piden SIEMPRE y una sola vez: las usan el aviso del
     plan gratuito (más abajo) y el widget "Tu menú en línea". Antes solo se
     pedían en los planes con tope de visitas. */
  const visitStats = restaurantId ? await getVisitStats(restaurantId, timezone) : null;

  /* ── Los widgets ────────────────────────────────────────────
     Cada uno se pide solo si su módulo está activo Y quien mira tiene
     permiso para esa sección: enseñarle a un cajero sin acceso a inventario
     que se está acabando la carne es filtrarle datos por la portada.
     getHoyWidgets lanza en paralelo lo que quede y devuelve null en lo que
     no tenga nada que decir; abajo, un null es un bloque que no se pinta. */
  const widgets = restaurantId
    ? await getHoyWidgets(
        restaurantId,
        timezone,
        {
          orders: ordersEnabled && !!stats,
          dineIn: (resolved?.config.orderTypes.includes('dine_in') ?? false) && allow('mesas'),
          waitlist: isModuleActive(mod, modSettings, 'lista_espera') && allow('lista_espera'),
          reservations: isModuleActive(mod, modSettings, 'reservaciones') && allow('reservaciones'),
          inventory: mod.inventario === true && allow('inventario'),
          surveys: isModuleActive(mod, modSettings, 'encuestas') && allow('encuestas'),
        },
        {
          tableCount: resolved?.config.dineInTableCount ?? 0,
          todayOrders: stats?.todayOrders ?? 0,
          visits: visitStats,
        },
      )
    : null;

  // ── Prueba gratis ───────────────────────────────────────────
  const billing = restaurantId ? await getBillingConfig(restaurantId) : null;
  const onTrial = isOnTrial(billing);
  const trialLeft = onTrial ? trialDaysLeft(billing) : 0;

  // ── Aviso de visitas del plan gratuito (solo aviso, nunca bloquea el menú) ──
  const visitWarningLimit = restaurant?.plan_actual ? PLANS[restaurant.plan_actual].monthlyVisitWarning : undefined;
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
      { key: 'marca', label: 'Personaliza tu marca', desc: 'Logo, colores y estilo', icon: 'sparkle', href: panelHref(base, '/admin/personalizacion'), done: hasLogo },
      { key: 'categoria', label: 'Crea una categoría', desc: 'Organiza tu menú', icon: 'tag', href: panelHref(base, '/admin/categorias'), done: (catCount ?? 0) > 0 },
      { key: 'platillo', label: 'Agrega tu primer platillo', desc: 'Suma un producto', icon: 'plus', href: panelHref(base, '/admin/menu/productos/new'), done: (prodCount ?? 0) > 0 },
      { key: 'qr', label: 'Comparte tu menú', desc: 'Descarga tu código QR', icon: 'image', href: panelHref(base, '/admin/qr'), done: false },
      { key: 'escritorio', label: 'Elige la PC del local', desc: 'Para que imprima sola y no te frene un corte de internet', icon: 'monitor', href: panelHref(base, '/admin/mi-pc'), done: false },
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

  // El menú público vive en el subdominio SIN "-admin": un href="/" relativo
  // se reescribe de vuelta a "/admin/" en ese subdominio (ver proxy.ts §3),
  // así que "Ver mi menú" reabría el propio panel en vez del catálogo.
  const menuUrl = slug ? subdomainUrl(slug) : '/';

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
      key: 'pc', href: panelHref(base, '/admin/mi-pc'), level: 'urgente',
      title: 'La PC del local dejó de responder',
      desc: 'Revisa que esté encendida y con internet — mientras tanto no se imprimen comandas solas.',
      action: 'Revisar',
    });
  }
  if (onTrial && trialLeft <= 3) {
    alerts.push({
      key: 'trial', href: panelHref(base, '/admin/suscripcion'), level: 'urgente',
      title: `Tu prueba termina en ${trialLeft} día${trialLeft !== 1 ? 's' : ''}`,
      desc: 'Contáctanos para continuar sin interrupciones.',
      action: 'Ver planes',
    });
  }
  if (visitWarning && visitStats) {
    alerts.push({
      key: 'visitas', href: panelHref(base, '/admin/suscripcion'), level: 'aviso',
      title: `Tu menú va muy bien: ${visitStats.last30.toLocaleString('es-GT')} visitas este mes`,
      desc: 'Pasaste el uso típico del plan gratuito. Sube de plan para pedidos en línea, WhatsApp y avisos en tiempo real.',
      action: 'Ver planes',
    });
  }
  if (onTrial && trialLeft > 3) {
    alerts.push({
      key: 'trial', href: panelHref(base, '/admin/suscripcion'), level: 'info',
      title: trialLeft === 1 ? 'Te queda 1 día de prueba' : `Te quedan ${trialLeft} días de prueba`,
      desc: 'Tu menú ya está en vivo. Aprovéchalo al máximo.',
      action: 'Ver planes',
    });
  }
  alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  return (
    <div className="anim-fade-up flex max-w-[1040px] flex-col gap-6">

      {/* Cabecera: el título y las dos únicas acciones que no están en el menú.
          El bloque del título lleva un mínimo (no min-w-0): sin él, flexbox
          nunca manda los botones al siguiente renglón —los dos caben "a la
          fuerza" en la misma línea— y en un teléfono el título y la fecha
          terminan encogidos a una columna de ~50px, una palabra por renglón.
          El mínimo obliga el salto ANTES de llegar a eso, igual que el truco
          ya usado en sales-widgets.tsx. Los botones también envuelven
          (flex-wrap) por si acaso en una pantalla muy angosta (~320px)
          tampoco entran juntos. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[190px] flex-1">
          <h2 className="t-display" style={{ fontSize: 26, lineHeight: 1.15 }}>Hoy</h2>
          <p style={{ fontSize: 14.5, color: 'var(--u-text-3)', marginTop: 6 }}>
            {today} · {brandName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={menuUrl}
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
              href={panelHref(base, "/admin/menu/productos/new")}
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
          action={allow('metricas') ? { href: panelHref(base, '/admin/metricas'), label: 'Ver el mes' } : undefined}
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
              <ListLink key={o.id} href={panelHref(base, "/admin/pedidos")}>
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
              href={panelHref(base, "/admin/pedidos")}
              className="gap-2 text-[14px] font-semibold"
              style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
            >
              Ver {live.total === 1 ? 'el pedido' : `los ${live.total} pedidos`}
              <Icon name="chevronRight" size={15} />
            </ListLink>
          </List>
        </Section>
      )}

      {/* ── Los widgets ──────────────────────────────────────────
          Van DEBAJO de los tres bloques de siempre y en orden fijo de
          urgencia: lo que se rompe arriba, lo que sirve para decidir en
          medio, lo que se mira una vez por semana abajo. El orden no cambia
          entre restaurantes, así que se aprende una sola vez.

          Cada uno se pinta solo si trae algo; el `null` lo decidió ya
          lib/db/hoy.ts. Un martes a las diez de la mañana esta zona está
          entera vacía, y así debe ser. */}

      {/* 4 · Se está acabando — arriba del resto porque es lo único de aquí
             que cuesta dinero si no se ve: un agotado sigue en el menú y el
             pedido entra igual. */}
      {widgets?.stock && (
        <StockWidget data={widgets.stock} canSeeInventory={allow('inventario')} />
      )}

      {/* 5 · La casa */}
      {widgets?.house && (
        <HouseWidget data={widgets.house} now={now} canSeeTables={allow('mesas')} />
      )}

      {/* 6 · Cómo va el día — la misma pieza que usa Pedidos */}
      {stats && stats.series.length > 0 && stats.totalLast14 > 0 && (
        <SalesTrendWidget
          series={stats.series}
          totalLast14={stats.totalLast14}
          todaySales={stats.todaySales}
          pace={widgets?.pace ?? null}
          money={fmt}
        />
      )}

      {/* 7 · Lo que más sale hoy */}
      {stats && stats.topToday.length > 0 && <TopTodayWidget items={stats.topToday} />}

      {/* 8 · Tu menú en línea */}
      {widgets?.online && <OnlineWidget data={widgets.online} showOrders={ordersEnabled} />}

      {/* 9 · Lo que dicen tus clientes — semanal, no diario: por eso, último. */}
      {widgets?.ratings && (
        <RatingsWidget data={widgets.ratings} now={now} canSeeSurveys={allow('encuestas')} />
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

