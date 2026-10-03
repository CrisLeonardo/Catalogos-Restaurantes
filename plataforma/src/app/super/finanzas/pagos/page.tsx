import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/super/ui';
import ReceiptDownloadButton from '@/components/super/receipt-download-button';
import { getFinanceOverview, type PaymentRecord } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';
import { conMesesLegibles, fechaCorta } from '@/lib/dates';

export const metadata = { title: 'Pagos — Super Admin' };
export const dynamic = 'force-dynamic';

const CONCEPT_LABEL: Record<string, string> = {
  MONTHLY: 'Mensualidad', SETUP: 'Implementación', PRORATE: 'Prorrateo', OTHER: 'Otro',
};

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_LONG[(m - 1) % 12]} ${y}`;
}

export default async function PagosPage() {
  const fin = await getFinanceOverview();

  // Agrupar por mes de pago (más reciente primero) — el historial se lee
  // como estado de cuenta: "en julio entraron Q X en N pagos".
  const groups = new Map<string, PaymentRecord[]>();
  for (const p of fin.payments) {
    const key = p.paidAt.slice(0, 7);
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  if (fin.payments.length === 0) {
    return (
      <EmptyState
        icon="checkCircle"
        title="Aún no hay pagos registrados"
        body="Cuando marques un cobro como pagado (en Cobranza o en la ficha del restaurante), aparecerá aquí con su recibo descargable."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {[...groups.entries()].map(([month, payments]) => {
        const total = payments.reduce((s, p) => s + p.amount, 0);
        return (
          <section key={month}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--u-text)', margin: 0, textTransform: 'capitalize' }}>
                {monthTitle(month)}
              </h2>
              <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13.5, color: 'var(--c-ok)' }}>
                {fmtMoney(total, fin.currency)}
              </span>
              <span className="t-mute" style={{ fontSize: 12 }}>{payments.length} {payments.length === 1 ? 'pago' : 'pagos'}</span>
            </div>
            <Card style={{ overflow: 'hidden' }}>
              {payments.map((p, i) => (
                <div
                  key={p.invoiceId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', flexWrap: 'wrap',
                    borderTop: i > 0 ? '1px solid var(--adm-border, var(--u-hair))' : 'none',
                  }}
                >
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <Link href={`/super/restaurantes/${p.restaurantId}/cobro`} style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--u-text)', textDecoration: 'none' }}>
                      {p.restaurantName}
                    </Link>
                    <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conMesesLegibles(p.description ?? CONCEPT_LABEL[p.concept])} · {fechaCorta(p.paidAt)}{p.method ? ` · ${p.method}` : ''}
                    </div>
                  </div>
                  <Badge variant="neutral" style={{ fontSize: 11 }}>{CONCEPT_LABEL[p.concept]}</Badge>
                  <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)', whiteSpace: 'nowrap' }}>
                    {fmtMoney(p.amount, p.currency)}
                  </span>
                  <ReceiptDownloadButton
                    data={{
                      folio: p.invoiceId.slice(0, 8).toUpperCase(),
                      restaurantName: p.restaurantName,
                      concept: p.description ?? CONCEPT_LABEL[p.concept],
                      period: p.period,
                      amount: p.amount,
                      currency: p.currency,
                      paidAt: p.paidAt,
                      paymentMethod: p.method,
                    }}
                  />
                </div>
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
