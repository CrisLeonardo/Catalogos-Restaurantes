'use client';

/* Botón "Recibo PDF" reutilizable (historial de pagos de Finanzas). */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { downloadReceipt, type ReceiptData } from '@/lib/receipt';

export default function ReceiptDownloadButton({ data }: { data: ReceiptData }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="press"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await downloadReceipt(data); } finally { setBusy(false); }
      }}
      title="Descargar comprobante en PDF"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
        border: '1px solid var(--adm-border, var(--u-hair-2))',
        background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
        color: 'var(--brand-accent)', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <Icon name="download" size={13} />
      {busy ? '…' : 'Recibo'}
    </button>
  );
}
