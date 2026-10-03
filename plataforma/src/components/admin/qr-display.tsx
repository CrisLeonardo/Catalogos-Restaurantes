'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import { subdomainUrl } from '@/lib/tenant';
import { FIELD_LABEL } from '@/components/admin/field-label';

interface Props {
  restaurantName: string;
  slug: string;
  restaurantId: string;
  /** Color de acento del restaurante (detalles de la tarjeta). */
  accent: string;
  /** Tiene logo: el QR lo lleva al centro. */
  hasLogo: boolean;
}

export default function QRDisplay({ restaurantName, slug, restaurantId, accent, hasLogo }: Props) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [making, setMaking] = useState<null | 'redes' | 'cartel'>(null);

  /* Tarjeta para redes y cartel para imprimir, con tu nombre y tu logo
     (auditoría 2026-10-02, AJU-07). Se cargan al pedirlas. */
  async function makeArt(kind: 'redes' | 'cartel') {
    setMaking(kind);
    try {
      const art = await import('@/lib/documents/qr-art');
      const opts = { url: menuUrl, restaurantName, restaurantId, accent };
      if (kind === 'redes') await art.downloadQrSocialPng(opts);
      else await art.downloadQrCardPdf(opts);
      toast.add({ title: kind === 'redes' ? 'Tarjeta para redes descargada' : 'Cartel para imprimir descargado', type: 'success' });
    } catch {
      toast.add({ title: 'No se pudo armar el archivo', description: 'Revisa tu conexión e inténtalo otra vez.', type: 'error' });
    } finally {
      setMaking(null);
    }
  }
  const toast = useToastManager();
  // Este link SÍ lleva el slug (a diferencia del de las mesas): no se
  // imprime, es el que la gente teclea, pega en redes o pone en su bio para
  // pedir en línea — ahí lo memorable importa más que la permanencia. Los QR
  // de mesa siguen en /m/<id>/<mesa> (stableTableUrl, tables-panel.tsx)
  // porque esos sí se imprimen y no se pueden reimprimir si cambia el slug.
  const menuUrl = subdomainUrl(slug);

  const qrSrc = `/api/qr?url=${encodeURIComponent(menuUrl)}${hasLogo ? '&ecc=H' : ''}`;
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
    let downloaded = false;
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
              downloaded = true;
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
      downloaded = true;
    } finally {
      setDownloading(false);
      toast.add(downloaded
        ? { title: 'QR descargado', type: 'success' }
        : { title: 'No se pudo descargar el QR', type: 'error' });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* QR code */}
      <Card className="px-5 py-7 text-center">
        <div
          style={{
            display: 'inline-block',
            position: 'relative',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
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
          {/* El logo al centro, como en lo que se descarga (el QR va con
              corrección alta para que se siga leyendo con él encima). */}
          {hasLogo && (
            <span
              aria-hidden
              style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: 53, height: 53, borderRadius: 'var(--radius-md)', background: '#fff',
                display: 'grid', placeItems: 'center', padding: 6,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/doc-logo/restaurant/${restaurantId}`}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                // Si el logo no se puede cargar, fuera el recuadro: mejor el QR
                // limpio que una imagen rota encima.
                onError={(e) => { const box = e.currentTarget.parentElement; if (box) box.style.display = 'none'; }}
              />
            </span>
          )}
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
        <p style={FIELD_LABEL}>Enlace del menú</p>

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
            style={copied ? { background: 'var(--c-ok-bg)', color: 'var(--c-ok)', borderColor: 'var(--c-ok-line)' } : undefined}
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </Button>
        </div>
      </Card>

      {/* Descargas: lo listo para usar primero, el QR suelto al final */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-tour-step="qr-descargar">
        <Button type="button" onClick={() => makeArt('redes')} disabled={making !== null} size="lg" className="w-full rounded-adm-full">
          {making === 'redes' ? 'Armando la tarjeta…' : 'Tarjeta para redes (PNG)'}
        </Button>
        <Button type="button" onClick={() => makeArt('cartel')} disabled={making !== null} variant="secondary" size="lg" className="w-full rounded-adm-full">
          {making === 'cartel' ? 'Armando el cartel…' : 'Cartel para imprimir (PDF, A6)'}
        </Button>
        <Button type="button" onClick={downloadPng} disabled={downloading} variant="ghost" className="w-full rounded-adm-full">
          {downloading ? 'Generando…' : 'Solo el código QR (PNG)'}
        </Button>
      </div>

      {/* Instructions */}
      <p
        style={{
          fontSize: 12,
          color: 'var(--u-text-4)',
          lineHeight: 1.7,
          padding: '0 2px',
        }}
      >
        La tarjeta va con tu nombre{hasLogo ? ' y tu logo' : ''}, lista para
        publicar en Instagram o WhatsApp; el cartel se imprime en una hoja A5 y
        se recorta. Para las mesas, cada una con su número, usa los QR de
        Ajustes › Salón.
      </p>
    </div>
  );
}
