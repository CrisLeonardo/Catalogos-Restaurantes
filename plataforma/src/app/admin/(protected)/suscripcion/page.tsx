import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { getMyBilling } from '@/lib/actions/billing';
import {
  isOverdue, isOnTrial, trialDaysLeft, planLabel, planGmvLimit,
  getRestaurantGmvCurrentMonth, type Invoice,
} from '@/lib/db/billing';
import { PLANS, PLAN_ORDER, nextPlan, isUpgrade, type PlanCode } from '@/lib/plans';
import { rootDomainForUrls } from '@/lib/tenant';
import { fmtMoney } from '@/lib/money';
import { Icon } from '@/components/icons';
import { createServiceClient } from '@/lib/supabase/service';

export const metadata = { title: 'Mi suscripción – Panel admin' };
export const dynamic = 'force-dynamic';

const CONCEPT_LABEL: Record<string, string> = {
  MONTHLY: 'Mensualidad', SETUP: 'Implementación', PRORATE: 'Prorrateo', OTHER: 'Cobro',
};
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';

function nextChargeLabel(billingDay: number): string {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  const day = Math.min(28, Math.max(1, billingDay || 1));
  if (now.getUTCDate() > day) { m += 1; if (m > 11) { m = 0; y += 1; } }
  return `${day} de ${MONTHS[m]} ${y}`;
}

function fmtQ(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

function upgradeHref(restaurantName: string, targetPlan: string): string {
  const msg = `Hola, quiero actualizar mi plan a ${targetPlan} para ${restaurantName}`;
  if (CONTACT_WA) return `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(msg)}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero actualizar mi plan Leogin')}&body=${encodeURIComponent(msg)}`;
}

export default async function SuscripcionPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'suscripcion')) redirect('/admin/menu');

  let restaurantId: string | null = null;
  let restaurantName = 'mi restaurante';

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const data = await getRestaurantBySlug(slug);
      restaurantId = data?.restaurant.id ?? null;
      restaurantName = data?.restaurant.name ?? restaurantName;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    restaurantName = ctx.restaurant?.name ?? restaurantName;
  }
  if (!restaurantId) redirect('/admin/login');

  const [billingResult, gmvData] = await Promise.all([
    getMyBilling(restaurantId),
    getRestaurantGmvCurrentMonth(restaurantId),
  ]);
  const { config, invoices, pendingTotal, currency } = billingResult;

  // Get current plan
  const db = createServiceClient();
  const { data: restRow } = await db
    .from('restaurants')
    .select('plan_actual, name')
    .eq('id', restaurantId)
    .single();
  const currentPlan = ((restRow?.plan_actual as PlanCode | null) ?? 'BASICO') as PlanCode;
  if (restRow?.name) restaurantName = restRow.name as string;

  const planInfo = PLANS[currentPlan];
  const pending = invoices.filter((i) => i.status === 'PENDING');
  const hasOverdue = pending.some((i) => isOverdue(i));
  const onTrial = isOnTrial(config);
  const trialLeft = trialDaysLeft(config);

  const nextPlanCode = nextPlan(currentPlan);
  const nextPlanInfo = nextPlanCode ? PLANS[nextPlanCode] : null;

  const hasGmvLimit = planGmvLimit(currentPlan) !== null;
  const gmvPct = gmvData.pct ?? 0;
  const gmvLimit = gmvData.limit ?? 0;
  const gmv = gmvData.gmv;
  const barColor =
    gmvPct >= 1.0 ? '#f87171'
    : gmvPct >= 0.8 ? '#fb923c'
    : gmvPct >= 0.6 ? '#fbbf24'
    : '#4ade80';

  // Plan feature highlights
  const planFeatures = planInfo ? [
    { label: 'Pedidos online',           active: planInfo.hasOrders },
    { label: 'Notificación WhatsApp',    active: planInfo.hasWhatsapp },
    { label: 'Alertas en tiempo real',   active: planInfo.hasRealtime },
    { label: 'Personalización completa', active: planInfo.hasFullTheme },
    { label: 'Llamar al mesero',         active: planInfo.hasWaiterCall },
    { label: 'Estadísticas y reportes',  active: planInfo.hasAnalytics },
    { label: 'Puntos de lealtad',        active: planInfo.hasLoyalty },
  ] : [];

  const rootDomain = rootDomainForUrls();
  const isLocalDev = rootDomain.includes('localhost');
  const planesUrl = `${isLocalDev ? 'http' : 'https'}://${rootDomain}/planes`;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>

      {/* ── Trial banner ─────────────────────────────────────── */}
      {onTrial && (
        <div
          className="glass"
          style={{
            borderRadius: 16, padding: 20,
            border: trialLeft <= 3
              ? '1px solid rgba(248,113,113,0.4)'
              : trialLeft <= 7
              ? '1px solid rgba(251,146,60,0.4)'
              : '1px solid color-mix(in srgb, var(--brand-accent) 32%, transparent)',
          }}
        >
          <div className="t-kicker" style={{
            fontSize: 9.5,
            color: trialLeft <= 3 ? '#f87171' : trialLeft <= 7 ? '#fb923c' : 'var(--brand-accent)',
          }}>
            Prueba gratis
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--u-text)', lineHeight: 1.1, marginTop: 4 }}>
            {trialLeft} día{trialLeft !== 1 ? 's' : ''} restante{trialLeft !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.5 }}>
            {trialLeft <= 3
              ? `Tu prueba termina pronto. Contáctanos para continuar sin interrupciones.`
              : `Tu restaurante está en vivo sin costo. Cuando termine la prueba, te avisaremos antes de cualquier cobro.`}
          </div>
          {trialLeft <= 7 && (
            <a
              href={upgradeHref(restaurantName, planInfo?.name ?? 'Premium')}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                marginTop: 14, padding: '10px 18px', borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
                background: 'var(--brand-accent)', color: '#fff',
              }}
            >
              <Icon name="sparkle" size={14} />
              Continuar con Leogin
            </a>
          )}
        </div>
      )}

      {/* ── Tu plan actual ───────────────────────────────────── */}
      <div className="glass" style={{ borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="t-kicker" style={{ fontSize: 9.5 }}>Tu plan actual</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--u-text)', marginTop: 4, lineHeight: 1.1 }}>
              {planInfo?.name ?? planLabel(currentPlan)}
            </div>
            {planInfo?.tagline && (
              <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3 }}>{planInfo.tagline}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 20, color: 'var(--u-text)' }}>
              {planInfo?.priceLabel ?? '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>
              {planInfo?.gmvLimitLabel ?? ''}
            </div>
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px 14px', marginTop: 16 }}>
          {planFeatures.map(({ label, active }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <Icon
                name={active ? 'check' : 'x'}
                size={14}
                style={{ color: active ? '#4ade80' : 'var(--u-text-4)', flexShrink: 0 }}
              />
              <span style={{ color: active ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>{label}</span>
            </div>
          ))}
        </div>

        <a
          href={planesUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 14, fontSize: 12.5, color: 'var(--brand-accent)', textDecoration: 'none', fontWeight: 600 }}
        >
          Ver comparativa completa de planes <Icon name="arrowUpRight" size={13} />
        </a>
      </div>

      {/* ── GMV del mes actual (solo planes con límite) ──────── */}
      {hasGmvLimit && (
        <div className="glass" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ventas digitales este mes
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
              {Math.round(gmvPct * 100)}% del límite
            </span>
          </div>
          <div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(gmvPct * 100, 100)}%`, borderRadius: 99, background: barColor, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: barColor, fontFamily: 'var(--ui-font-mono)' }}>{fmtQ(gmv)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>de {fmtQ(gmvLimit)}</span>
            </div>
          </div>
          {gmvPct >= 1.0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
              <Icon name="alertCircle" size={15} style={{ color: '#f87171', flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: '#f87171', lineHeight: 1.4 }}>Has superado el límite este mes. Nos pondremos en contacto contigo.</span>
            </div>
          )}
          {gmvPct >= 0.8 && gmvPct < 1.0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)' }}>
              <Icon name="alertCircle" size={15} style={{ color: '#fb923c', flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: '#fb923c', lineHeight: 1.4 }}>Estás al {Math.round(gmvPct * 100)}% de tu límite mensual. Considera actualizar tu plan.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Actualizar plan ──────────────────────────────────── */}
      {/* ── Lo que te falta en Básico (solo BASICO) ──────────── */}
      {currentPlan === 'BASICO' && nextPlanInfo && (
        <div
          className="glass"
          style={{
            borderRadius: 16, padding: 20,
            border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)',
          }}
        >
          <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--brand-accent)' }}>Con Premium (Q599/mes) desbloqueas</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--u-text)', marginTop: 4, lineHeight: 1.15 }}>
            Todo lo que falta en tu plan actual
          </div>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.5 }}>
            {nextPlanInfo.gmvLimitLabel} · Sin compromiso · Tu menú sigue en vivo
          </div>

          {/* Feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 9, marginTop: 16 }}>
            {[
              { icon: 'whatsapp',  label: 'Aviso por WhatsApp',      desc: 'Alerta inmediata en cada pedido' },
              { icon: 'thumbsUp', label: 'Programa de lealtad',      desc: 'Puntos que hacen volver a tus clientes' },
              { icon: 'ticket',   label: 'Cupones y descuentos',     desc: 'Convierte visitas en pedidos' },
              { icon: 'calendar', label: 'Reservaciones en línea',   desc: 'Mesas llenas incluso entre semana' },
              { icon: 'chart',    label: 'Estadísticas avanzadas',   desc: 'Ventas, horas pico y ticket promedio' },
              { icon: 'users',    label: 'Hasta 3 usuarios',         desc: 'Tu equipo opera sin depender de ti' },
              { icon: 'truck',    label: 'Pedidos a domicilio',      desc: 'Canal de delivery con mapa integrado' },
              { icon: 'grid',     label: 'Comer en local (QR)',      desc: 'Pedidos desde la mesa del cliente' },
              { icon: 'userPlus', label: 'Panel de mesero',          desc: 'Tablet para tomar pedidos en sala' },
              { icon: 'bellRing', label: 'Alertas en tiempo real',   desc: 'Panel de cocina y pedidos en vivo' },
              { icon: 'sparkle',  label: 'Personalización completa', desc: 'Fuentes, colores, estilos sin límite' },
              { icon: 'print',    label: 'Impresión de comandas',    desc: 'Tickets directo a tu impresora' },
            ].map(({ icon, label, desc }) => (
              <div key={label} style={{
                display: 'flex', gap: 9, alignItems: 'flex-start',
                padding: '10px 11px', borderRadius: 11,
                background: 'rgba(var(--brand-accent-rgb,99,102,241),0.05)',
                border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.12)',
              }}>
                <Icon name={icon} size={15} style={{ color: 'var(--brand-accent)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text-2)', lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <a
              href={upgradeHref(restaurantName, nextPlanInfo.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="press btn-accent"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '11px 20px', borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
              }}
            >
              <Icon name="sparkle" size={14} />
              Actualizar a Premium — Q599/mes
            </a>
            <a
              href={planesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '11px 16px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
                color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              Ver todos los planes <Icon name="chevronRight" size={14} />
            </a>
          </div>
        </div>
      )}

      {/* ── Actualizar plan (planes PREMIUM en adelante) ───── */}
      {nextPlanInfo && currentPlan !== 'VARIABLE' && currentPlan !== 'BASICO' && (
        <div
          className="glass"
          style={{
            borderRadius: 16, padding: 20,
            border: gmvPct >= 0.8 ? '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)' : undefined,
          }}
        >
          <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--brand-accent)' }}>
            Siguiente plan disponible
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--u-text)', marginTop: 4 }}>
            {nextPlanInfo.name} — {nextPlanInfo.priceLabel}
          </div>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.5 }}>
            {nextPlanInfo.tagline} · {nextPlanInfo.gmvLimitLabel}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <a
              href={upgradeHref(restaurantName, nextPlanInfo.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="press btn-accent"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
              }}
            >
              <Icon name="sparkle" size={14} />
              Actualizar a {nextPlanInfo.name}
            </a>
            <a
              href={planesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 'var(--radius-full)',
                fontWeight: 600, fontSize: 13.5, textDecoration: 'none',
                color: 'var(--u-text)', border: '1px solid var(--u-hair-2)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              Ver todos los planes <Icon name="chevronRight" size={14} />
            </a>
          </div>
        </div>
      )}

      {/* ── Más opciones de upgrade (planes 2+ pasos arriba) ── */}
      {currentPlan !== 'VARIABLE' && (() => {
        const higherPlans = PLAN_ORDER.filter(
          (p) => p !== 'VARIABLE' && isUpgrade(currentPlan, p) && p !== nextPlanCode,
        );
        if (higherPlans.length === 0) return null;
        return (
          <div className="glass-quiet" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--u-text-4)' }}>
              Más opciones de upgrade
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {higherPlans.map((code) => {
                const p = PLANS[code];
                return (
                  <a
                    key={code}
                    href={upgradeHref(restaurantName, p.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass press"
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 5,
                      padding: '14px 16px', borderRadius: 14, textDecoration: 'none',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>
                      {p.priceLabel}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.4 }}>
                      {p.gmvLimitLabel}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--brand-accent)', fontWeight: 700, marginTop: 4 }}>
                      Solicitar →
                    </div>
                  </a>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
              Puedes saltar directamente al plan que mejor se ajuste a tu volumen actual.
            </p>
          </div>
        );
      })()}

      {/* VARIABLE plan — contact for custom billing */}
      {currentPlan === 'VARIABLE' && (
        <div className="glass" style={{ borderRadius: 14, padding: '14px 18px', fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55 }}>
          <Icon name="chart" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--brand-accent)' }} />
          Estás en el plan Variable. Tu cobro mensual es el 1% de tus ventas digitales del mes (mínimo Q2,249). Se calcula al cierre de cada periodo.
        </div>
      )}

      {/* ── Estado de cuenta ─────────────────────────────────── */}
      {config && (config.monthly_fee > 0 || invoices.length > 0) && (
        <>
          <div
            className="glass"
            style={{
              borderRadius: 16, padding: 20,
              border: hasOverdue ? '1px solid rgba(248,113,113,0.3)' : pendingTotal > 0 ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(74,222,128,0.25)',
            }}
          >
            <div className="t-kicker" style={{ fontSize: 9.5 }}>Estado de cuenta</div>
            {pendingTotal > 0 ? (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: hasOverdue ? '#f87171' : '#fbbf24', lineHeight: 1, marginTop: 4 }}>
                  {fmtMoney(pendingTotal, currency)}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 4 }}>
                  {hasOverdue ? 'Tienes pagos vencidos.' : 'Pendiente por pagar.'} {pending.length} cobro(s).
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#4ade80', lineHeight: 1.1, marginTop: 4 }}>
                  Estás al día ✓
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 4 }}>No tienes cobros pendientes. ¡Gracias!</div>
              </>
            )}
          </div>

          {/* Detalles del plan */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Kpi label="Mensualidad" value={fmtMoney(config.monthly_fee, currency)} />
            {config.setup_fee > 0 && <Kpi label="Implementación" value={fmtMoney(config.setup_fee, currency)} />}
            <Kpi label="Próximo cobro" value={nextChargeLabel(config.billing_day)} small />
            {config.started_at && <Kpi label="Cliente desde" value={config.started_at.slice(0, 10)} small />}
          </div>

          <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Los pagos se realizan al inicio de cada mes. Cuando registremos tu pago, el cobro
            aparecerá como <strong style={{ color: '#4ade80' }}>Pagado</strong> aquí mismo.
          </div>

          {/* Historial */}
          <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="t-kicker" style={{ fontSize: 9.5 }}>Historial de cobros</div>
            {invoices.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Aún no hay cobros.</div>
            ) : (
              invoices.map((inv) => <Row key={inv.id} inv={inv} currency={currency} />)
            )}
          </div>
        </>
      )}

      {/* If no billing config yet */}
      {(!config || (config.monthly_fee <= 0 && invoices.length === 0)) && (
        <div className="glass-quiet" style={{ borderRadius: 14, padding: '13px 16px', fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          <Icon name="helpCircle" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
          Cuando se configure tu cobro, aquí verás tu mensualidad, fechas de pago y el historial completo.
        </div>
      )}
    </div>
  );
}

function Row({ inv, currency }: { inv: Invoice; currency: string }) {
  const overdue = isOverdue(inv);
  const meta = overdue
    ? { label: 'Vencido', color: '#f87171', bg: 'rgba(248,113,113,0.13)' }
    : inv.status === 'PAID'
    ? { label: 'Pagado', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' }
    : inv.status === 'CANCELLED'
    ? { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
    : { label: 'Pendiente', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--u-hair)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text-2)' }}>
          {inv.description ?? CONCEPT_LABEL[inv.concept]}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
          {inv.status === 'PAID' && inv.paid_at
            ? `Pagado el ${inv.paid_at.slice(0, 10)}${inv.payment_method ? ` · ${inv.payment_method}` : ''}`
            : inv.due_date
            ? `Vence el ${inv.due_date}`
            : CONCEPT_LABEL[inv.concept]}
        </div>
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: meta.bg, color: meta.color, letterSpacing: '0.05em' }}>
        {meta.label.toUpperCase()}
      </span>
      <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)', minWidth: 90, textAlign: 'right' }}>
        {fmtMoney(inv.amount, inv.currency || currency)}
      </div>
    </div>
  );
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: small ? 'var(--font-sans)' : 'var(--ui-font-mono)', fontWeight: small ? 600 : 700, fontSize: small ? 15 : 22, color: 'var(--u-text)', lineHeight: 1.15 }}>
        {value}
      </div>
    </div>
  );
}
