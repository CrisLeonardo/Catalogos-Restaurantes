import Link from 'next/link';
import { notFound } from 'next/navigation';
import BillingManager from '@/components/super/billing-manager';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { getBillingConfig, getInvoices, getPricingSettings, computeSuggestedFee, planLabel } from '@/lib/db/billing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cobro — Super Admin' };

export default async function FichaCobroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const [billingConfig, invoices, suggestedFee, pricing] = await Promise.all([
    getBillingConfig(id),
    getInvoices(id),
    computeSuggestedFee(id),
    getPricingSettings(),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.55 }}>
        Define cuánto paga este restaurante, genera sus cobros y registra cuándo te paga.
        El dueño lo ve en su panel en «Mi suscripción». El panorama completo de todos tus
        cobros está en{' '}
        <Link href="/super/finanzas" style={{ color: 'var(--brand-accent)' }}>Finanzas →</Link>
      </p>
      <BillingManager
        key={row.id}
        restaurantId={row.id}
        restaurantName={row.name}
        config={billingConfig}
        invoices={invoices}
        suggestedFee={suggestedFee}
        planName={planLabel(row.plan_actual)}
        globalGraceDays={pricing.graceDays}
      />
    </div>
  );
}
