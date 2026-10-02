import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { getMyBilling } from '@/lib/actions/billing';
import {
  isOverdue, isOnTrial, trialDaysLeft, planLabel,
  getFeeBreakdown, type Invoice, type FeeBreakdown,
} from '@/lib/db/billing';
import { PLANS, PUBLIC_PLANS, INCLUDED_MODULES, nextPlan, isUpgrade, isModuleIncluded, planPriceLabel, type PlanCode } from '@/lib/plans';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { rootDomainForUrls } from '@/lib/tenant';
import { fmtMoney } from '@/lib/money';
import { Icon } from '@/components/icons';
import { createServiceClient } from '@/lib/supabase/service';
import { Card, cardVariants } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { List, ListRow, ListText } from '@/components/ui/list';
import { cn } from '@/lib/utils';
import ReceiptDownloadButton from '@/components/super/receipt-download-button';
import { panelLink, panelBase } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';
import { conMesesLegibles, fechaCorta } from '@/lib/dates';

export const metadata = { title: 'Mi suscripción – Panel admin' };
export const dynamic = 'force-dynamic';

const CONCEPT_LABEL: Record<string, string> = {
  MONTHLY: 'Mensualidad', SETUP: 'Implementación', PRORATE: 'Prorrateo', OTHER: 'Cobro',
};

const CONTACT_WA = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'crisleonardo100@gmail.com';

function nextChargeLabel(billingDay: number): string {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  const day = Math.min(28, Math.max(1, billingDay || 1));
  if (now.getUTCDate() > day) { m += 1; if (m > 11) { m = 0; y += 1; } }
  // «1 nov 2026»: «1 de noviembre 2026» no cabía en su cifra y se cortaba
  // con «…» hasta en escritorio (auditoría 2026-10-02, AJU-13).
  return fechaCorta(`${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

function upgradeHref(restaurantName: string, targetPlan: string): string {
  const msg = `Hola, quiero actualizar mi plan a ${targetPlan} para ${restaurantName}`;
  if (CONTACT_WA) return `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(msg)}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Quiero actualizar mi plan Leogin')}&body=${encodeURIComponent(msg)}`;
}

export default async function SuscripcionPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'suscripcion')) redirect(await panelLink('/admin'));

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

  const [billingResult, feeBreakdown, pricing] = await Promise.all([
    getMyBilling(restaurantId),
    getFeeBreakdown(restaurantId),
    getEffectivePlanPricing(),
  ]);
  const { config, invoices, pendingTotal, currency } = billingResult;

  // La "Mensualidad" mostrada debe reflejar siempre el precio real vigente.
  // `config.monthly_fee` es una foto guardada que solo se resincroniza en el
  // próximo corte de cobro; si el restaurante está en auto_price, usamos el
  // precio fijo del plan (getFeeBreakdown) para que nunca discrepen.
  const displayedMonthlyFee =
    config && config.auto_price !== false && feeBreakdown ? feeBreakdown.final : config?.monthly_fee ?? 0;

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
  const includedCount = INCLUDED_MODULES[currentPlan].length;

  // Plan feature highlights
  const planFeatures = planInfo ? [
    { label: 'Pedidos online',           active: planInfo.hasOrders },
    { label: 'Notificación WhatsApp',    active: planInfo.hasWhatsapp },
    { label: 'Alertas en tiempo real',   active: planInfo.hasRealtime },
    { label: 'Personalización completa', active: planInfo.hasFullTheme },
    { label: 'Llamar al mesero',         active: isModuleIncluded(currentPlan, 'llamada_mesero') },
    { label: 'Reportes financieros',     active: planInfo.hasFinance },
    { label: 'Estadísticas y reportes',  active: planInfo.hasAnalytics },
    { label: 'Puntos de lealtad',        active: isModuleIncluded(currentPlan, 'loyalty') },
  ] : [];

  const rootDomain = rootDomainForUrls();
  const isLocalDev = rootDomain.includes('localhost');
  const planesUrl = `${isLocalDev ? 'http' : 'https'}://${rootDomain}/planes`;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>

      {/* ── Trial banner ─────────────────────────────────────── */}
      {onTrial && (
        <Card
          className="p-5"
          style={{
            border: trialLeft <= 3
              ? '1px solid var(--c-danger-line)'
              : trialLeft <= 7
              ? '1px solid rgba(251,146,60,0.4)'
              : '1px solid color-mix(in srgb, var(--brand-accent) 32%, transparent)',
          }}
        >
          <div className="adm-label" style={{ color: trialLeft <= 3 ? 'var(--c-danger)' : trialLeft <= 7 ? '#fb923c' : 'var(--brand-accent)' }}>
            Prueba gratis
          </div>
          <div className="t-mono" style={{ fontWeight: 600, fontSize: 28, color: 'var(--u-text)', lineHeight: 1.1, marginTop: 4 }}>
            {trialLeft} día{trialLeft !== 1 ? 's' : ''} restante{trialLeft !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.5 }}>
            {trialLeft <= 3
              ? `Tu prueba termina pronto. Contáctanos para continuar sin interrupciones.`
              : `Tu restaurante está en vivo sin costo. Cuando termine la prueba, te avisaremos antes de cualquier cobro.`}
          </div>
          {trialLeft <= 7 && (
            <Button
              render={<a href={upgradeHref(restaurantName, planInfo?.name ?? 'Premium')} target="_blank" rel="noopener noreferrer" />}
              className="mt-3.5 rounded-adm-full"
            >
              <Icon name="sparkle" size={14} />
              Continuar con Leogin
            </Button>
          )}
        </Card>
      )}

      {/* ── Tu plan actual ───────────────────────────────────── */}
      <Card className="p-5">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="adm-label">Tu plan actual</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--u-text)', marginTop: 4, lineHeight: 1.1 }}>
              {planInfo?.name ?? planLabel(currentPlan)}
            </div>
            {planInfo?.tagline && (
              <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3 }}>{planInfo.tagline}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 20, color: 'var(--u-text)' }}>
              {planInfo ? planPriceLabel(pricing, currentPlan) : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>
              {planInfo?.hasOrders ? 'Sin límite de ventas' : 'Menú digital · sin pedidos'}
              {includedCount > 0 ? ` · ${includedCount} ${includedCount === 1 ? 'función incluida' : 'funciones incluidas'}` : ''}
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
                style={{ color: active ? 'var(--c-ok)' : 'var(--u-text-4)', flexShrink: 0 }}
              />
              <span style={{ color: active ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>{label}</span>
            </div>
          ))}
        </div>

        <a
          href={planesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="adm-action-link"
          style={{ marginTop: 10, fontSize: 12.5 }}
        >
          Ver comparativa completa de planes <Icon name="arrowUpRight" size={13} />
        </a>
      </Card>

      {/* ── Lo que pagarás este mes ───────────────────────────── */}
      {feeBreakdown && (
        <MeasureCard b={feeBreakdown} currency={currency} autoPrice={config?.auto_price !== false} />
      )}

      {/* ── Lo que te falta en Básico (solo BASICO) ──────────── */}
      {currentPlan === 'BASICO' && nextPlanInfo && (
        <Card
          className="p-5"
          style={{ border: '1px solid color-mix(in srgb, var(--brand-accent) 35%, transparent)' }}
        >
          <div className="adm-label" style={{ color: 'var(--brand-accent-ink)' }}>Con Premium ({planPriceLabel(pricing, 'PREMIUM')}) desbloqueas</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--u-text)', marginTop: 4, lineHeight: 1.15 }}>
            Todo lo que falta en tu plan actual
          </div>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.5 }}>
            Sin límite de ventas · Sin compromiso · Tu menú sigue en vivo
          </div>

          {/* Feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 9, marginTop: 16 }}>
            {[
              { icon: 'whatsapp',  label: 'Aviso por WhatsApp',      desc: 'Alerta inmediata en cada pedido' },
              { icon: 'thumbsUp', label: 'Programa de lealtad',      desc: 'Puntos que hacen volver a tus clientes' },
              { icon: 'ticket',   label: 'Cupones y descuentos',     desc: 'Convierte visitas en pedidos' },
              { icon: 'calendar', label: 'Reservaciones en línea',   desc: 'Mesas llenas incluso entre semana' },
              { icon: 'chart',    label: 'Estadísticas avanzadas',   desc: 'Ventas, horas pico y ticket promedio' },
              { icon: 'users',    label: 'Usuarios ilimitados',      desc: 'Tu equipo opera sin depender de ti' },
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
                <Icon name={icon} size={15} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text-2)', lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <Button render={<a href={upgradeHref(restaurantName, nextPlanInfo.name)} target="_blank" rel="noopener noreferrer" />} className="rounded-adm-full">
              <Icon name="sparkle" size={14} />
              Actualizar a Premium — {planPriceLabel(pricing, 'PREMIUM')}
            </Button>
            <Button render={<a href={planesUrl} target="_blank" rel="noopener noreferrer" />} variant="secondary" className="rounded-adm-full">
              Ver todos los planes <Icon name="chevronRight" size={14} />
            </Button>
          </div>
        </Card>
      )}

      {/* ── Actualizar plan (Estándar/Premium en adelante) ───── */}
      {nextPlanInfo && currentPlan !== 'BASICO' && (
        <Card className="p-5">
          <div className="adm-label" style={{ color: 'var(--brand-accent-ink)' }}>
            Siguiente plan disponible
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--u-text)', marginTop: 4 }}>
            {nextPlanInfo.name} — {nextPlanCode ? planPriceLabel(pricing, nextPlanCode) : ''}
          </div>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.5 }}>
            {nextPlanInfo.tagline}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <Button render={<a href={upgradeHref(restaurantName, nextPlanInfo.name)} target="_blank" rel="noopener noreferrer" />} className="rounded-adm-full">
              <Icon name="sparkle" size={14} />
              Actualizar a {nextPlanInfo.name}
            </Button>
            <Button render={<a href={planesUrl} target="_blank" rel="noopener noreferrer" />} variant="secondary" className="rounded-adm-full">
              Ver todos los planes <Icon name="chevronRight" size={14} />
            </Button>
          </div>
        </Card>
      )}

      {/* ── Más opciones de upgrade (planes 2+ pasos arriba) ── */}
      {(() => {
        const higherPlans = PUBLIC_PLANS.filter((p) => isUpgrade(currentPlan, p) && p !== nextPlanCode);
        if (higherPlans.length === 0) return null;
        return (
          <Card className="flex flex-col gap-3 p-4">
            <div className="adm-label" style={{ color: 'var(--u-text-4)' }}>
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
                    className={cn(cardVariants({ variant: 'interactive' }), 'flex flex-col gap-1.5 p-3.5 no-underline')}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>
                      {planPriceLabel(pricing, code)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.4 }}>
                      {p.tagline}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--brand-accent-ink)', fontWeight: 700, marginTop: 4 }}>
                      Solicitar →
                    </div>
                  </a>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
              Puedes saltar directamente al plan que mejor se ajuste a lo que necesitas.
            </p>
          </Card>
        );
      })()}

      {/* ── ¿Varias sucursales? ───────────────────────────────── */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          <Icon name="grid" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
          ¿Tienes 2 o más sucursales? Obtén un panel de grupo consolidado para verlas todas juntas.
        </div>
        <a
          href={upgradeHref(restaurantName, 'Grupo / Franquicia')}
          target="_blank"
          rel="noopener noreferrer"
          className="adm-action-link"
          style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}
        >
          Hablar con Leogin →
        </a>
      </Card>

      {/* ── Estado de cuenta ─────────────────────────────────── */}
      {config && (config.monthly_fee > 0 || invoices.length > 0) && (
        <>
          <Card
            className="p-5"
            style={{ border: hasOverdue ? '1px solid var(--c-danger-line)' : pendingTotal > 0 ? '1px solid var(--c-warn-line)' : '1px solid var(--c-ok-line)' }}
          >
            <div className="adm-label">Estado de cuenta</div>
            {pendingTotal > 0 ? (
              <>
                <div className="t-mono" style={{ fontWeight: 600, fontSize: 30, color: hasOverdue ? 'var(--c-danger)' : 'var(--c-warn)', lineHeight: 1, marginTop: 4 }}>
                  {fmtMoney(pendingTotal, currency)}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 4 }}>
                  {hasOverdue ? 'Tienes pagos vencidos' : 'Pendiente por pagar'} · {pending.length} {pending.length === 1 ? 'cobro' : 'cobros'}.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--c-ok)', lineHeight: 1.1, marginTop: 4 }}>
                  Estás al día ✓
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 4 }}>No tienes cobros pendientes. ¡Gracias!</div>
              </>
            )}
          </Card>

          {/* Detalles del plan */}
          <StatGroup>
            <Stat label="Mensualidad" value={fmtMoney(displayedMonthlyFee, currency)} />
            {config.setup_fee > 0 && <Stat label="Implementación" value={fmtMoney(config.setup_fee, currency)} />}
            <Stat label="Próximo cobro" value={nextChargeLabel(config.billing_day)} />
            {config.started_at && <Stat label="Cliente desde" value={fechaCorta(config.started_at)} />}
          </StatGroup>

          <Card className="p-3.5" style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Los pagos se realizan al inicio de cada mes. Cuando registremos tu pago, el cobro
            aparecerá como <strong style={{ color: 'var(--c-ok)' }}>Pagado</strong> aquí mismo.
          </Card>

          {/* Historial */}
          <Section title="Historial de cobros">
            {invoices.length === 0 ? (
              <Card className="p-3.5" style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Aún no hay cobros.</Card>
            ) : (
              <List>
                {invoices.map((inv) => <InvoiceRow key={inv.id} inv={inv} currency={currency} restaurantName={restaurantName} />)}
              </List>
            )}
          </Section>
        </>
      )}

      {/* If no billing config yet */}
      {(!config || (config.monthly_fee <= 0 && invoices.length === 0)) && (
        <Card className="p-3.5" style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          <Icon name="helpCircle" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
          Cuando se configure tu cobro, aquí verás tu mensualidad, fechas de pago y el historial completo.
        </Card>
      )}
    </div>
  );
}

function InvoiceRow({ inv, currency, restaurantName }: { inv: Invoice; currency: string; restaurantName: string }) {
  const overdue = isOverdue(inv);
  const meta = overdue
    ? { label: 'Vencido', color: 'var(--c-danger)', bg: 'var(--c-danger-bg)' }
    : inv.status === 'PAID'
    ? { label: 'Pagado', color: 'var(--c-ok)', bg: 'var(--c-ok-bg)' }
    : inv.status === 'CANCELLED'
    ? { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
    : { label: 'Pendiente', color: 'var(--c-warn)', bg: 'var(--c-warn-bg)' };

  return (
    <ListRow>
      <ListText
        /* Las fechas venían crudas de la base («Mensualidad 2026-09», «Vence
           el 2026-09-01»): auditoría 2026-10-02, T-02. */
        title={conMesesLegibles(inv.description ?? CONCEPT_LABEL[inv.concept])}
        desc={
          inv.status === 'PAID' && inv.paid_at
            ? `Pagado el ${fechaCorta(inv.paid_at)}${inv.payment_method ? ` · ${inv.payment_method}` : ''}`
            : inv.due_date
            ? `Vence el ${fechaCorta(inv.due_date)}`
            : CONCEPT_LABEL[inv.concept]
        }
      />
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: meta.bg, color: meta.color, letterSpacing: '0.05em' }}>
        {meta.label.toUpperCase()}
      </span>
      <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)', minWidth: 90, textAlign: 'right' }}>
        {fmtMoney(inv.amount, inv.currency || currency)}
      </div>
      {inv.status === 'PAID' && (
        <ReceiptDownloadButton
          data={{
            folio: inv.id.slice(0, 8).toUpperCase(),
            restaurantName,
            concept: inv.description ?? CONCEPT_LABEL[inv.concept],
            period: inv.period,
            amount: inv.paid_amount ?? inv.amount,
            currency: inv.currency,
            paidAt: inv.paid_at ?? new Date().toISOString(),
            paymentMethod: inv.payment_method,
          }}
        />
      )}
    </ListRow>
  );
}

async function MeasureCard({ b, currency, autoPrice }: { b: FeeBreakdown; currency: string; autoPrice: boolean }) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();
  return (
    <Card className="p-5" style={{ border: '1px solid var(--u-hair-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkle" size={15} style={{ color: 'var(--brand-accent)' }} />
        <div className="adm-label">Lo que pagarás este mes</div>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 8, lineHeight: 1.5 }}>
        Precio fijo de tu plan: prender o apagar funciones y modos de pedido desde{' '}
        <a href={panelHref(base, '/admin/modulos')} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600 }}>Funciones</a> no cambia tu mensualidad.
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <LineItem label={`Plan ${planLabel(b.plan)}`} value={fmtMoney(b.base, currency)} />
        <div style={{ height: 1, background: 'var(--u-hair)', margin: '2px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
            {autoPrice ? 'Tu mensualidad' : 'Mensualidad sugerida'}
          </span>
          <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 20, color: 'var(--u-text)' }}>
            {fmtMoney(b.final, currency)}
          </span>
        </div>
      </div>

      {!autoPrice && (
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 8, lineHeight: 1.45 }}>
          Tienes un precio acordado con nosotros; este desglose es informativo.
        </div>
      )}

      <a href={panelHref(base, '/admin/modulos')} className="adm-action-link" style={{ marginTop: 10, fontSize: 12.5 }}>
        Gestionar mis modos de pedido y funciones <Icon name="arrowRight" size={13} />
      </a>
    </Card>
  );
}

function LineItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 13.5, fontWeight: 600, color: accent ?? 'var(--u-text-2)' }}>{value}</span>
    </div>
  );
}
