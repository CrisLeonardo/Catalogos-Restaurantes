'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { stableMenuUrl } from '@/lib/tenant';

interface Props {
  restaurantName: string;
  restaurantId: string;
}

export default function QRDisplay({ restaurantName, restaurantId }: Props) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Link ESTABLE (no la URL final del menú): sigue funcionando aunque el
  // restaurante cambie de slug o la plataforma de dominio — ver
  // src/app/m/[restaurantId]/[[...mesa]]/route.ts.
  const menuUrl = stableMenuUrl(restaurantId);

  const qrSrc = `/api/qr?url=${encodeURIComponent(menuUrl)}`;
  const fileName = `qr-${restaurantName.toLowerCase().replace(/\s+/g, '-')}.png`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // clipboard not available
    }
  }

  async function downloadPng() {
    setDownloading(true);
    try {
      const res = await fetch(qrSrc);
      const svgBlob = await res.blob();
      const svgUrl = URL.createObjectURL(svgBlob);
      await new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const size = 480;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              a.click();
              URL.revokeObjectURL(url);
            }
            URL.revokeObjectURL(svgUrl);
            resolve();
          }, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(); };
        img.src = svgUrl;
      });
    } catch {
      // fallback: direct link
      const a = document.createElement('a');
      a.href = qrSrc;
      a.download = fileName;
      a.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* QR code */}
      <Card className="px-5 py-7 text-center">
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
      </Card>

      {/* URL */}
      <Card data-tour-step="qr-enlace" className="px-4.5 py-3.5">
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

          <Button
            type="button"
            onClick={copyUrl}
            variant={copied ? 'primary' : 'secondary'}
            size="sm"
            className="shrink-0 whitespace-nowrap"
            style={copied ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.28)' } : undefined}
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </Button>
        </div>
      </Card>

      {/* Download */}
      <Button
        type="button"
        onClick={downloadPng}
        disabled={downloading}
        data-tour-step="qr-descargar"
        variant="secondary"
        size="lg"
        className="w-full rounded-adm-full"
      >
        {downloading ? 'Generando…' : '↓ Descargar QR (.png)'}
      </Button>

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
