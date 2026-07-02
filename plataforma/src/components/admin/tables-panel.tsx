'use client';

import { useState, useTransition } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { saveOrdersAndCurrency } from '@/lib/actions/restaurant';
import FloorPlanEditor from '@/components/admin/floor-plan-editor';
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

function TableQRCard({ tableNumber, menuUrl }: { tableNumber: number; menuUrl: string }) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const tableUrl = `${menuUrl}?mesa=${tableNumber}`;
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
    } finally {
      setDownloading(false);
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
        <button
          onClick={copyLink}
          className="press"
          style={{
            padding: '5px 11px',
            borderRadius: 99,
            border: '1px solid var(--u-hair-2)',
            background: copied ? 'rgba(74,222,128,0.15)' : 'transparent',
            color: copied ? '#4ade80' : 'var(--u-text-3)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 200ms, color 200ms',
          }}
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
        <button
          onClick={downloadPng}
          disabled={downloading}
          className="press"
          style={{
            padding: '5px 11px',
            borderRadius: 99,
            border: '1px solid var(--u-hair-2)',
            background: 'transparent',
            color: 'var(--u-text-3)',
            fontSize: 11,
            fontWeight: 600,
            cursor: downloading ? 'wait' : 'pointer',
            opacity: downloading ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {downloading ? '…' : '↓ PNG'}
        </button>
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
      <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="t-kicker" style={{ fontSize: 10.5 }}>Configuración</div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', marginBottom: 3 }}>Comer en local</div>
            <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.4 }}>
              Activa el modo mesa para que los clientes pidan desde su mesa.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { set('orderTypes', toggleIn(patch.orderTypes, 'dine_in', !dineInEnabled)); setMsg(null); }}
            className="press"
            style={{
              width: 44, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3,
              background: dineInEnabled ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)',
              display: 'flex', justifyContent: dineInEnabled ? 'flex-end' : 'flex-start',
              transition: 'background 180ms', flexShrink: 0,
            }}
          >
            <span style={{ width: 20, height: 20, borderRadius: 99, background: dineInEnabled ? 'var(--brand-bg)' : 'var(--u-text)' }} />
          </button>
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
              <button
                type="button"
                className="press"
                onClick={() => set('dineInTableCount', Math.max(1, patch.dineInTableCount - 1))}
                style={{
                  width: 34, height: 34, borderRadius: 9, border: '1px solid var(--u-hair-2)',
                  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: 'var(--u-text-2)', cursor: 'pointer',
                  fontSize: 18, display: 'grid', placeItems: 'center',
                }}
              >
                −
              </button>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--u-text)', minWidth: 30, textAlign: 'center' }}>
                {patch.dineInTableCount}
              </span>
              <button
                type="button"
                className="press"
                onClick={() => set('dineInTableCount', Math.min(50, patch.dineInTableCount + 1))}
                style={{
                  width: 34, height: 34, borderRadius: 9, border: '1px solid var(--u-hair-2)',
                  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: 'var(--u-text-2)', cursor: 'pointer',
                  fontSize: 18, display: 'grid', placeItems: 'center',
                }}
              >
                +
              </button>
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
          <button
            onClick={save}
            disabled={isPending}
            className="press btn-white"
            style={{
              padding: '10px 20px', borderRadius: 99, fontWeight: 700, fontSize: 13.5,
              border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>
              {msg}
            </span>
          )}
        </div>
      </Glass>

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
              <TableQRCard key={n} tableNumber={n} menuUrl={menuUrl} />
            ))}
          </div>
        </div>
      ) : !dineInEnabled ? (
        <Glass variant="quiet" style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <Icon name="utensils" size={28} style={{ color: 'var(--u-text-4)' }} />
          <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', fontWeight: 500 }}>
            Activa “Comer en local” y guarda para generar los QR por mesa.
          </div>
        </Glass>
      ) : null}
    </div>
  );
}
