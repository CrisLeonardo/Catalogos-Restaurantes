'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

/* Tarjeta del link público de pedidos del grupo (en /central).
   El cliente final entra a este link y lo enrutamos a su sucursal más
   cercana. Reutiliza /api/qr para generar un QR del flyer. */

export default function GroupLinkCard({ url, groupName }: { url: string; groupName: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  const pretty = url.replace(/^https?:\/\//, '');

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>Link de pedidos en línea · grupo</div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.55 }}>
        Comparte <strong>este único link</strong> en Instagram, WhatsApp o flyers. Detecta la
        ubicación del cliente y lo lleva a la sucursal más cercana para pedir.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <code style={{ flex: 1, fontSize: 13, color: 'var(--u-text-2)', wordBreak: 'break-all', lineHeight: 1.5 }}>
          {pretty}
        </code>
        <button
          onClick={copy}
          className="press"
          style={{
            flexShrink: 0, padding: '7px 14px', borderRadius: 'var(--radius-full)',
            fontSize: 12, fontWeight: 600,
            background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.07)',
            color: copied ? '#22c55e' : 'var(--u-text)',
            border: `1px solid ${copied ? 'rgba(34,197,94,0.28)' : 'var(--u-hair-2)'}`,
            cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          {copied ? <><Icon name="check" size={13} strokeWidth={2.6} /> Copiado</> : 'Copiar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href={url} target="_blank" rel="noopener noreferrer" className="press glass-quiet" style={pill}>
          Abrir <Icon name="arrowUpRight" size={13} />
        </a>
        <button onClick={() => setShowQr((v) => !v)} className="press glass-quiet" style={pill}>
          <Icon name="grid" size={13} /> {showQr ? 'Ocultar QR' : 'Ver QR'}
        </button>
      </div>

      {showQr && (
        <div style={{ textAlign: 'center', paddingTop: 4 }}>
          <div style={{ display: 'inline-block', background: '#fff', borderRadius: 12, padding: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?url=${encodeURIComponent(url)}`}
              alt={`QR de pedidos — ${groupName}`}
              width={200}
              height={200}
              style={{ display: 'block' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px',
  borderRadius: 10, fontSize: 12, color: 'var(--u-text-2)', textDecoration: 'none',
  border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
};
