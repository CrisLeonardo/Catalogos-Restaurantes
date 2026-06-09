'use client';

import { useState } from 'react';
import { Glass } from '@/components/glass';

interface Props {
  restaurantName: string;
  menuUrl: string;
}

export default function QRDisplay({ restaurantName, menuUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const qrSrc = `/api/qr?url=${encodeURIComponent(menuUrl)}`;
  const fileName = `qr-${restaurantName.toLowerCase().replace(/\s+/g, '-')}.svg`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // clipboard not available
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* QR code */}
      <Glass style={{ padding: '28px 20px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            background: '#ffffff',
            borderRadius: 12,
            padding: 16,
            boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`Código QR — ${restaurantName}`}
            width={240}
            height={240}
            style={{ display: 'block' }}
          />
        </div>

        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: 'var(--u-text-3)',
          }}
        >
          Escanea con la cámara del teléfono para verificar
        </p>
      </Glass>

      {/* URL */}
      <Glass style={{ padding: '14px 18px' }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--u-text-4)',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          URL del menú
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <code
            style={{
              flex: 1,
              fontSize: 13,
              color: 'var(--u-text-2)',
              wordBreak: 'break-all',
              lineHeight: 1.5,
            }}
          >
            {menuUrl}
          </code>

          <button
            onClick={copyUrl}
            className="press"
            style={{
              flexShrink: 0,
              padding: '7px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 600,
              background: copied
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(255,255,255,0.07)',
              color: copied ? '#22c55e' : 'var(--u-text)',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.28)' : 'var(--u-hair-2)'}`,
              cursor: 'pointer',
              transition: 'all 150ms',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
      </Glass>

      {/* Download */}
      <a
        href={qrSrc}
        download={fileName}
        className="press"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '13px 20px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--u-hair-2)',
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          color: 'var(--u-text)',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        ↓ Descargar QR (.svg)
      </a>

      {/* Instructions */}
      <p
        style={{
          fontSize: 12,
          color: 'var(--u-text-4)',
          lineHeight: 1.7,
          padding: '0 2px',
        }}
      >
        Imprime el QR y colócalo en las mesas de tu restaurante. Los clientes
        podrán escanear el código con la cámara de su teléfono para ver tu menú
        en línea.
      </p>
    </div>
  );
}
