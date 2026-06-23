import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { can } from '@/lib/permissions';
import { getMyBilling } from '@/lib/actions/billing';
import { isOverdue, isOnTrial, trialDaysLeft, type Invoice } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';

export const metadata = { title: 'Mi suscripción – Panel admin' };
export const dynamic = 'force-dynamic';

const CONCEPT_LABEL: Record<string, string> = {
  MONTHLY: 'Mensualidad', SETUP: 'Implementación', PRORATE: 'Prorrateo', OTHER: 'Cobro',
};
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function nextChargeLabel(billingDay: number): string {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  const day = Math.min(28, Math.max(1, billingDay || 1));
  // Si ya pasó el día de cobro de este mes, el próximo es el mes siguiente.
  if (now.getUTCDate() > day) { m += 1; if (m > 11) { m = 0; y += 1; } }
  return `${day} de ${MONTHS[m]} ${y}`;
}

export default async function SuscripcionPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'suscripcion')) redirect('/admin/menu');

  let restaurantId: string | null = null;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) restaurantId = (await getRestaurantBySlug(slug))?.restaurant.id ?? null;
  } else {
    restaurantId = ctx.profile.restaurant_id;
  }
  if (!restaurantId) redirect('/admin/login');

  const { config, invoices, pendingTotal, currency } = await getMyBilling(restaurantId);

  const pending = invoices.filter((i) => i.status === 'PENDING');
  const hasOverdue = pending.some((i) => isOverdue(i));
  const onTrial = isOnTrial(config);
  const trialLeft = trialDaysLeft(config);

  if (!config || (config.monthly_fee <= 0 && invoices.length === 0)) {
    return (
      <div className="glass" style={{ borderRadius: 16, padding: '24px 22px', maxWidth: 560 }}>
        <div className="t-display" style={{ fontSize: 20, marginBottom: 8 }}>Mi suscripción</div>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
          Aún no hay cobros registrados para tu cuenta. Cuando se configure tu plan,
          aquí verás tu mensualidad, las fechas de pago y el estado de cada cobro.
        </p>
      </div>
    );
  }

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Prueba gratis */}
      {onTrial && (
        <div
          className="glass"
          style={{
            borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 6,
            border: '1px solid color-mix(in srgb, var(--brand-accent) 32%, transparent)',
          }}
        >
          <div className="t-kicker" style={{ fontSize: 9.5, color: 'var(--brand-accent)' }}>Prueba gratis</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--u-text)', lineHeight: 1.1 }}>
            {trialLeft} día{trialLeft !== 1 ? 's' : ''} restante{trialLeft !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>
            Tu restaurante está en vivo sin costo. Cuando termine la prueba, tu mensualidad será de{' '}
            <strong style={{ color: 'var(--u-text)' }}>{fmtMoney(config.monthly_fee, currency)}</strong>. Te avisaremos antes.
          </div>
        </div>
      )}

      {/* Estado de cuenta */}
      <div
        className="glass"
        style={{
          borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 6,
          border: hasOverdue ? '1px solid rgba(248,113,113,0.3)' : pendingTotal > 0 ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(74,222,128,0.25)',
        }}
      >
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Estado de cuenta</div>
        {pendingTotal > 0 ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: hasOverdue ? '#f87171' : '#fbbf24', lineHeight: 1 }}>
              {fmtMoney(pendingTotal, currency)}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>
              {hasOverdue ? 'Tienes pagos vencidos.' : 'Pendiente por pagar.'} {pending.length} cobro(s).
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#4ade80', lineHeight: 1.1 }}>
              Estás al día ✓
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>No tienes cobros pendientes. ¡Gracias!</div>
          </>
        )}
      </div>

      {/* Detalles del plan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Mensualidad" value={fmtMoney(config.monthly_fee, currency)} />
        {config.setup_fee > 0 && <Kpi label="Implementación" value={fmtMoney(config.setup_fee, currency)} />}
        <Kpi label="Próximo cobro" value={nextChargeLabel(config.billing_day)} small />
        {config.started_at && <Kpi label="Cliente desde" value={config.started_at} small />}
      </div>

      <div className="glass-quiet" style={{ borderRadius: 13, padding: '12px 16px', fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Los pagos se realizan al inicio de cada mes. Cuando registremos tu pago, el cobro
        aparecerá como <strong style={{ color: '#4ade80' }}>Pagado</strong> aquí mismo.
      </div>

      {/* Historial de cobros */}
      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Historial de cobros</div>
        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Aún no hay cobros.</div>
        ) : (
          invoices.map((inv) => <Row key={inv.id} inv={inv} currency={currency} />)
        )}
      </div>
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
