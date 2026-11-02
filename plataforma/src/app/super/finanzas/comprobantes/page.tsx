import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import ComprobanteRevision from '@/components/super/comprobante-revision';
import { comprobantesPorRevisar } from '@/lib/db/comprobantes';
import { codigoDePago } from '@/lib/pago-plan';
import { fmtMoney } from '@/lib/money';
import { fechaCorta } from '@/lib/dates';

export const metadata = { title: 'Comprobantes — Super Admin' };
export const dynamic = 'force-dynamic';

/* Bandeja de comprobantes de transferencia que suben los restaurantes desde
   «Mi suscripción» (plan 2026-10-28, §3). Aprobar marca pagadas las facturas
   que cubría el envío; rechazar deja un motivo que el dueño ve. */
export default async function ComprobantesPage() {
  const { disponible, items } = await comprobantesPorRevisar();

  if (!disponible) {
    return (
      <Card className="p-5" style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Falta aplicar la migración 148 (comprobantes de pago) en esta base. Mientras tanto, los
        restaurantes siguen mandando el comprobante por WhatsApp.
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-5" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon name="checkCircle" size={18} style={{ color: 'var(--c-ok)' }} />
        <span style={{ fontSize: 14, color: 'var(--u-text-2)' }}>No hay comprobantes por revisar.</span>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        Compara el monto y el código de pago con tu banca en línea antes de aprobar.
      </p>
      {items.map((c) => (
        <Card key={c.id} className="p-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <a
            href={c.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir comprobante de ${c.restaurantName}`}
            style={{
              display: 'grid', placeItems: 'center', minHeight: 180, borderRadius: 'var(--radius-lg)',
              background: 'var(--adm-bg-2)', border: '1px solid var(--u-hair)', overflow: 'hidden',
              color: 'var(--u-text-3)', textDecoration: 'none', fontSize: 13,
            }}
          >
            {!c.url ? (
              'El archivo ya no está'
            ) : c.esPdf ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Icon name="receipt" size={28} /> Abrir PDF
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- enlace firmado de 10 min, no pasa por /img
              <img src={c.url} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'contain' }} />
            )}
          </a>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div>
              <Link
                href={`/super/restaurantes/${c.restaurantId}/cobro`}
                style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)', textDecoration: 'none' }}
              >
                {c.restaurantName}
              </Link>
              <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>
                Enviado el {fechaCorta(c.createdAt)} · {c.invoiceIds.length} {c.invoiceIds.length === 1 ? 'cobro' : 'cobros'}
              </div>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', margin: 0, fontSize: 13 }}>
              <dt style={{ color: 'var(--u-text-4)' }}>Monto</dt>
              <dd style={{ margin: 0, fontFamily: 'var(--ui-font-mono)', fontWeight: 700, color: 'var(--u-text)' }}>
                {fmtMoney(c.amount, c.currency)}
              </dd>
              <dt style={{ color: 'var(--u-text-4)' }}>Código</dt>
              <dd style={{ margin: 0, fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text-2)' }}>{codigoDePago(c.restaurantId)}</dd>
              <dt style={{ color: 'var(--u-text-4)' }}>Boleta</dt>
              <dd style={{ margin: 0, color: 'var(--u-text-2)' }}>{c.bankReference ?? '—'}</dd>
            </dl>
            <ComprobanteRevision id={c.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
