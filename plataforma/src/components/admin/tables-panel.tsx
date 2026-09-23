'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { saveOrdersAndCurrency } from '@/lib/actions/restaurant';
import { stableTableUrl } from '@/lib/tenant';
import { useToastManager } from '@/components/ui/toast';
import FloorPlanEditor from '@/components/admin/floor-plan-editor';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ThemeConfig, FloorPlan } from '@/lib/theme/defaults';

type Patch = Pick<ThemeConfig,
  'orderTypes' | 'dineInTableCount' | 'dineInCourseOptions' |
  'tipEnabled' | 'tipPercent' | 'acceptsCard' |
  'currencySymbol' | 'currencyPosition' | 'locale' | 'animations' | 'floorPlan'
>;

interface Props {
  restaurantId: string;
  menuUrl: string | null;
  config: Patch;
}

function toggleIn<T>(arr: T[], val: T, on: boolean): T[] {
  const has = arr.includes(val);
  if (on && !has) return [...arr, val];
  if (!on && has) return arr.filter((x) => x !== val);
  return arr;
}

function TableQRCard({ tableNumber, restaurantId }: { tableNumber: number; restaurantId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToastManager();
  // Link ESTABLE (no la URL final del menú): sigue funcionando aunque el
  // restaurante cambie de slug o la plataforma de dominio — ver
  // src/app/m/[restaurantId]/[[...mesa]]/route.ts.
  const tableUrl = stableTableUrl(restaurantId, tableNumber);
  const qrSrc = `/api/qr?url=${encodeURIComponent(tableUrl)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(tableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: seleccionar texto
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
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = `mesa-${tableNumber}.png`;
              a.click();
              URL.revokeObjectURL(blobUrl);
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
      const a = document.createElement('a');
      a.href = qrSrc;
      a.download = `mesa-${tableNumber}.png`;
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
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
      padding: '14px 10px 12px',
      background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
      borderRadius: 14,
      border: '1px solid var(--u-hair)',
    }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 7, boxShadow: '0 1px 8px rgba(0,0,0,0.28)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt={`Mesa ${tableNumber}`} width={96} height={96} style={{ display: 'block' }} />
      </div>
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--u-text)' }}>Mesa {tableNumber}</span>

      {/* Enlace para NFC */}
      <div
        title={tableUrl}
        style={{
          fontSize: 9.5,
          color: 'var(--u-text-4)',
          wordBreak: 'break-all',
          textAlign: 'center',
          lineHeight: 1.4,
          maxWidth: 120,
          cursor: 'text',
          userSelect: 'all',
        }}
      >
        {tableUrl}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <Button
          onClick={copyLink}
          variant="outline"
          size="sm"
          className="h-auto rounded-adm-full px-2.5 py-1 text-[11px]"
          style={copied ? { background: 'var(--c-ok-bg)', color: 'var(--c-ok)', borderColor: 'transparent' } : undefined}
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </Button>
        <Button
          onClick={downloadPng}
          disabled={downloading}
          variant="outline"
          size="sm"
          className="h-auto rounded-adm-full px-2.5 py-1 text-[11px]"
        >
          {downloading ? '…' : '↓ PNG'}
        </Button>
      </div>
    </div>
  );
}

export default function TablesPanel({ restaurantId, menuUrl, config: initial }: Props) {
  const [patch, setPatch] = useState<Patch>(initial);
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const dineInEnabled = patch.orderTypes.includes('dine_in');

  function set<K extends keyof Patch>(k: K, v: Patch[K]) {
    setPatch((p) => ({ ...p, [k]: v }));
  }

  function save() {
    setMsg(null);
    // Limpia mesas del plano que ya no existen (si se redujo el número de mesas).
    const fp = patch.floorPlan;
    const cleaned: Patch = {
      ...patch,
      floorPlan: fp ? { ...fp, tables: fp.tables.filter((t) => t.n <= patch.dineInTableCount) } : fp,
    };
    start(async () => {
      const res = await saveOrdersAndCurrency({ restaurantId, patch: cleaned });
      if (res.error) setMsg(`Error: ${res.error}`);
      else setMsg('Guardado ✓');
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

      {/* ── Configuración ── */}
      <Card className="flex flex-col gap-3.5 p-4.5">
        <div className="adm-label">Configuración</div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', marginBottom: 3 }}>Comer en local</div>
            <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.4 }}>
              Activa el modo mesa para que los clientes pidan desde su mesa.
            </div>
          </div>
          <Switch
            aria-label="Comer en local"
            checked={dineInEnabled}
            onCheckedChange={(on) => { set('orderTypes', toggleIn(patch.orderTypes, 'dine_in', on)); setMsg(null); }}
          />
        </div>

        {dineInEnabled && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            paddingTop: 12, borderTop: '1px solid var(--u-hair)',
          }}>
            <div>
              <div style={{ fontSize: 13.5, color: 'var(--u-text-2)', fontWeight: 500 }}>Número de mesas</div>
              <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>Se generará un QR por cada mesa</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8.5 text-[18px]"
                onClick={() => set('dineInTableCount', Math.max(1, patch.dineInTableCount - 1))}
              >
                −
              </Button>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)', minWidth: 30, textAlign: 'center' }}>
                {patch.dineInTableCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8.5 text-[18px]"
                onClick={() => set('dineInTableCount', Math.min(50, patch.dineInTableCount + 1))}
              >
                +
              </Button>
            </div>
          </div>
        )}

        {dineInEnabled && (
          <div style={{ paddingTop: 14, borderTop: '1px solid var(--u-hair)' }}>
            <FloorPlanEditor
              tableCount={patch.dineInTableCount}
              value={patch.floorPlan ?? { enabled: false, levels: [{ id: 'l1', name: 'Planta baja' }], tables: [] }}
              onChange={(fp: FloorPlan) => { set('floorPlan', fp); setMsg(null); }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: '1px solid var(--u-hair)' }}>
          <Button onClick={save} disabled={isPending} className="rounded-adm-full">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--c-ok)' }}>
              {msg}
            </span>
          )}
        </div>
      </Card>

      {/* ── QR por mesa ── */}
      {dineInEnabled && menuUrl ? (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginBottom: 4 }}>
              Códigos QR por mesa
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
              Cada QR lleva al cliente al menú con su mesa pre-seleccionada en el checkout.
              Imprime cada código y colócalo en la mesa correspondiente.
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}>
            {Array.from({ length: patch.dineInTableCount }, (_, i) => i + 1).map((n) => (
              <TableQRCard key={n} tableNumber={n} restaurantId={restaurantId} />
            ))}
          </div>
        </div>
      ) : !dineInEnabled ? (
        <Card className="flex flex-col items-center gap-2.5 p-7 text-center">
          <Icon name="utensils" size={28} style={{ color: 'var(--u-text-4)' }} />
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', fontWeight: 500 }}>
            Activa “Comer en local” y guarda para generar los QR por mesa.
          </div>
        </Card>
      ) : null}
    </div>
  );
}
