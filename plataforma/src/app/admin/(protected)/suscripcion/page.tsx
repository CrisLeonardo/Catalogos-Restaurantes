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
import { PLANS, INCLUDED_MODULES, isModuleIncluded, planPriceLabel, type PlanCode } from '@/lib/plans';
import { getEffectivePlanPricing } from '@/lib/db/billing';
import { rootDomainForUrls } from '@/lib/tenant';
import { fmtMoney } from '@/lib/money';
import { Icon } from '@/components/icons';
import { createServiceClient } from '@/lib/supabase/service';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { List, ListRow, ListText } from '@/components/ui/list';
import ReceiptDownloadButton from '@/components/super/receipt-download-button';
import { panelLink, panelBase } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';
import { conMesesLegibles, fechaCorta } from '@/lib/dates';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { ultimoComprobante } from '@/lib/db/comprobantes';
import { codigoDePago } from '@/lib/pago-plan';
import PagaTuPlan from '@/components/admin/paga-tu-plan';
import CambiarPlan from '@/components/admin/cambiar-plan';
import { duenoDelRestaurante } from '@/lib/auth/acceso-cobro';
import { estadoDelTope } from '@/lib/tope-pedidos';
import { pedidosDelMes } from '@/lib/db/tope-pedidos';

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

  const [billingResult, feeBreakdown, pricing, contacto, comprobante, dueno] = await Promise.all([
    getMyBilling(restaurantId),
    getFeeBreakdown(restaurantId),
    getEffectivePlanPricing(),
    getPlatformContactSettings(),
    ultimoComprobante(restaurantId),
    duenoDelRestaurante(restaurantId),
  ]);
  const esDueno = !!dueno;
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
    .select('plan_actual, name, timezone')
    .eq('id', restaurantId)
    .single();
  const currentPlan = ((restRow?.plan_actual as PlanCode | null) ?? 'BASICO') as PlanCode;
  if (restRow?.name) restaurantName = restRow.name as string;

  const planInfo = PLANS[currentPlan];
  const tope = planInfo?.monthlyOrderCap
    ? estadoDelTope(currentPlan, await pedidosDelMes(restaurantId, (restRow?.timezone as string | null) ?? 'America/Guatemala'))
    : null;
  const pending = invoices.filter((i) => i.status === 'PENDING');
  const hasOverdue = pending.some((i) => isOverdue(i));
  const onTrial = isOnTrial(config);
  const trialLeft = trialDaysLeft(config);

  /* «Enviar comprobante»: WhatsApp de soporte (Super › Configuración) o, si
     no está, el del entorno. Con el monto y el restaurante ya escritos. */
  const waPago = (contacto.support_whatsapp || CONTACT_WA || '').replace(/[^\d]/g, '');
  const comprobanteHref = pendingTotal > 0 && waPago
    ? `https://wa.me/${waPago}?text=${encodeURIComponent(`Hola, soy de ${restaurantName}. Te envío el comprobante de pago de ${fmtMoney(pendingTotal, currency)}.`)}`
    : null;

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
          <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.5 }}>
            {trialLeft <= 3
              ? `Tu prueba termina pronto. Confirma tu plan abajo para seguir sin interrupciones.`
              : `Tu restaurante está en vivo sin costo. Cuando termine la prueba, te avisaremos antes de cualquier cobro.`}
          </div>
          {trialLeft <= 7 && (
            <Button render={<a href="#cambiar-plan" />} className="mt-3.5 rounded-adm-full">
              <Icon name="sparkle" size={14} />
              Elegir mi plan
            </Button>
          )}
        </Card>
      )}

      {/* ── Paga tu mensualidad ──────────────────────────────────
          Arriba de todo: si hay algo que pagar, es lo primero que el dueño
          viene a hacer aquí, y antes ni sabía cómo (plan 2026-10-28, §3). */}
      {pendingTotal > 0 && (
        <PagaTuPlan
          restaurantId={restaurantId}
          amount={pendingTotal}
          currency={currency}
          vencido={hasOverdue}
          codigo={codigoDePago(restaurantId)}
          cuenta={{
            banco: contacto.pay_bank,
            tipoCuenta: contacto.pay_account_type,
            numeroCuenta: contacto.pay_account_number,
            titular: contacto.pay_account_holder,
          }}
          notas={contacto.payment_instructions}
          waHref={comprobanteHref}
          ultimo={comprobante
            ? { status: comprobante.status, createdAt: comprobante.createdAt, reviewNote: comprobante.reviewNote }
            : null}
        />
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
          style={{ marginTop: 10, fontSize: 12 }}
        >
          Ver comparativa completa de planes <Icon name="arrowUpRight" size={13} />
        </a>
      </Card>

      {/* ── Lo que pagarás este mes ───────────────────────────── */}
      {feeBreakdown && (
        <MeasureCard b={feeBreakdown} currency={currency} autoPrice={config?.auto_price !== false} />
      )}

      {/* ── Cambiar de plan (fase 3 del plan 2026-10-28) ─────────
          Antes: una tarjeta de Premium para el Básico, otra con el
          «siguiente plan» y otra con «más opciones», y las tres abrían un
          WhatsApp a Leogin. Ahora el dueño lo cambia aquí mismo. */}
      <CambiarPlan
        restaurantId={restaurantId}
        planActual={currentPlan}
        pricing={pricing}
        esDueno={esDueno}
        enPrueba={onTrial}
        proximoCorte={config ? nextChargeLabel(config.billing_day) : null}
      />

      {/* ── ¿Varias sucursales? ───────────────────────────────── */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          <Icon name="grid" size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--u-text-4)' }} />
          ¿Tienes 2 o más sucursales? Obtén un panel de grupo consolidado para verlas todas juntas.
        </div>
        <a
          href={upgradeHref(restaurantName, 'Grupo / Franquicia')}
          target="_blank"
          rel="noopener noreferrer"
          className="adm-action-link"
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
        >
          Hablar con Leogin →
        </a>
      </Card>

      {/* ── Estado de cuenta ─────────────────────────────────── */}
      {config && (config.monthly_fee > 0 || invoices.length > 0) && (
        <>
          {/* Con algo pendiente, el estado de cuenta ES la tarjeta «Paga tu
              mensualidad» de arriba (monto, cuenta y comprobante); aquí solo
              queda el «al día». */}
          {pendingTotal <= 0 && (
            <Card className="p-5" style={{ border: '1px solid var(--c-ok-line)' }}>
              <div className="adm-label">Estado de cuenta</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--c-ok)', lineHeight: 1.1, marginTop: 4 }}>
                Estás al día ✓
              </div>
              <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>No tienes cobros pendientes. ¡Gracias!</div>
            </Card>
          )}

          {/* Detalles del plan */}
          <StatGroup>
            <Stat label="Mensualidad" value={fmtMoney(displayedMonthlyFee, currency)} />
            {config.setup_fee > 0 && <Stat label="Implementación" value={fmtMoney(config.setup_fee, currency)} />}
            <Stat label="Próximo cobro" value={nextChargeLabel(config.billing_day)} />
            {config.started_at && <Stat label="Cliente desde" value={fechaCorta(config.started_at)} />}
            {tope && (
              <Stat
                label="Pedidos este mes"
                value={`${tope.usados.toLocaleString('es-GT')} de ${tope.tope.toLocaleString('es-GT')}`}
                tone={tope.nivel === 'pasado' ? 'danger' : tope.nivel === 'cerca' ? 'warn' : undefined}
                sub={tope.nivel === 'pasado'
                  ? 'Pasaste el tope de tu plan. Ningún pedido se corta; el próximo mes te toca Estándar.'
                  : tope.nivel === 'cerca'
                    ? `Te quedan ${tope.restantes}. Al pasarlos tu menú sigue vendiendo.`
                    : 'Se reinicia el día 1. Si lo pasas, tu menú sigue vendiendo.'}
              />
            )}
          </StatGroup>

          <Card className="p-3.5" style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Pagas por transferencia al inicio de cada mes con tu código{' '}
            <strong className="t-mono" style={{ color: 'var(--u-text-2)' }}>{codigoDePago(restaurantId)}</strong>.
            Subes el comprobante aquí y, al revisarlo, el cobro aparece como{' '}
            <strong style={{ color: 'var(--c-ok)' }}>Pagado</strong>.
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
    /* En el teléfono, el concepto va solo en su renglón y debajo el estado, el
       monto y el recibo: los cuatro en una fila partían «Mensualidad 2026-07»
       en cuatro líneas (auditoría 2026-10-02, AJU-13). */
    <ListRow className="flex-wrap gap-y-2 sm:flex-nowrap">
      <ListText
        className="basis-full sm:basis-auto"
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
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: meta.bg, color: meta.color, letterSpacing: '0.05em' }}>
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
      <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 8, lineHeight: 1.5 }}>
        Precio fijo de tu plan: prender o apagar funciones y modos de pedido desde{' '}
        <a href={panelHref(base, '/admin/modulos')} style={{ color: 'var(--brand-accent-ink)', fontWeight: 600 }}>Funciones</a> no cambia tu mensualidad.
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <LineItem label={`Plan ${planLabel(b.plan)}`} value={fmtMoney(b.base, currency)} />
        <div style={{ height: 1, background: 'var(--u-hair)', margin: '2px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
            {autoPrice ? 'Tu mensualidad' : 'Mensualidad sugerida'}
          </span>
          <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 20, color: 'var(--u-text)' }}>
            {fmtMoney(b.final, currency)}
          </span>
        </div>
      </div>

      {!autoPrice && (
        <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 8, lineHeight: 1.45 }}>
          Tienes un precio acordado con nosotros; este desglose es informativo.
        </div>
      )}

      <a href={panelHref(base, '/admin/modulos')} className="adm-action-link" style={{ marginTop: 10, fontSize: 12 }}>
        Gestionar mis modos de pedido y funciones <Icon name="arrowRight" size={13} />
      </a>
    </Card>
  );
}

function LineItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 13, fontWeight: 600, color: accent ?? 'var(--u-text-2)' }}>{value}</span>
    </div>
  );
}
