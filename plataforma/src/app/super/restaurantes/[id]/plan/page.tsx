import { notFound } from 'next/navigation';
import { Glass } from '@/components/glass';
import { SavedBanner } from '@/components/super/ui';
import PlanEditor from '@/components/super/plan-editor';
import OrderTypesEditor from '@/components/super/order-types-editor';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { getEffectivePlanPricing, getRestaurantPlanPresentation } from '@/lib/db/billing';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { formatPlanAmount } from '@/lib/plans';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plan y módulos — Super Admin' };

export default async function FichaPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const theme = row.restaurant_themes[0] ?? null;
  const [planPricing, contract] = await Promise.all([
    getEffectivePlanPricing(),
    getRestaurantPlanPresentation(id),
  ]);
  const resolved = resolveTheme(theme as ThemeRow | null, row.slug, {
    brandName: row.name,
    tagline: row.tagline,
  });

  const fmtQ = formatPlanAmount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {saved === 'plan' && <SavedBanner message="Plan y módulos guardados. Revisa la mensualidad y el próximo cobro en Cobro." />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PlanEditor key={row.id} restaurant={row} pricing={planPricing} />
        {resolved.config.orderTypes && (
          <OrderTypesEditor
            key={`${row.id}-ot`}
            restaurantId={row.id}
            initialOrderTypes={resolved.config.orderTypes}
          />
        )}
      </div>

      {contract && (
        <section>
          <h2 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: 'var(--u-text)' }}>
            Desglose de mensualidad
          </h2>
          <Glass variant="quiet" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Tarifa pública del plan" value={fmtQ(contract.publicAmount)} />
            <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />
            <Row label="Mensualidad del restaurante" value={contract.monthlyLabel} bold />
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '4px 0 0', lineHeight: 1.5 }}>
              {contract.priceExplanation} {contract.orderScope}. {contract.selectedScope}.
            </p>
          </Glass>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 800 : 600, fontFamily: 'var(--ui-font-mono)', color: color ?? (bold ? 'var(--u-text)' : 'var(--u-text-2)') }}>
        {value}
      </span>
    </div>
  );
}
