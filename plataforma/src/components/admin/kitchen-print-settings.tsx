'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  PRINT_KEYS,
  type PrintRole,
  getPrinter,
  setPrinter,
  isKitchenAutoPrintEnabled,
  setKitchenAutoPrintEnabled,
  listPrinters,
  getDefaultPrinter,
  printTicket,
} from '@/lib/printing';

/** @deprecated usa los helpers de '@/lib/printing'. Se mantiene por compatibilidad. */
export const KITCHEN_PRINT_KEY = PRINT_KEYS.kitchenEnabled;

const QZ_DOWNLOAD_URL = 'https://qz.io/download/';

function buildKitchenTestHtml(): string {
  const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comanda — Prueba</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 14px; color: #000; background: #fff; width: 80mm; margin: 0 auto; padding: 6mm 4mm; }
  .header { text-align: center; border: 3px solid #000; padding: 8px; margin-bottom: 10px; }
  .kitchen-label { font-size: 28px; font-weight: 900; letter-spacing: 4px; }
  .order-num { font-size: 36px; font-weight: 900; letter-spacing: 2px; margin: 4px 0; }
  .sep { border: none; border-top: 2px dashed #000; margin: 8px 0; }
  .sep-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .row { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0; }
  .qty { font-size: 22px; font-weight: 900; min-width: 36px; }
  .item { font-size: 18px; font-weight: 700; line-height: 1.3; }
  .opts { font-size: 14px; font-weight: 600; color: #333; padding-left: 42px; margin-top: 2px; }
  .meta { font-size: 13px; margin-bottom: 8px; }
  .tag { display: inline-block; background: #000; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
  .notes { border: 2px solid #000; padding: 6px 8px; margin-top: 8px; font-size: 15px; font-weight: 700; }
  .notes-label { font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
  .footer { text-align: center; font-size: 11px; color: #888; margin-top: 10px; }
  @media print { body { width: 100%; padding: 0; } @page { margin: 4mm; size: 80mm auto; } }
</style>
</head>
<body>
<div class="header">
  <div class="kitchen-label">COCINA</div>
  <div class="order-num">#TEST</div>
  <div class="meta">${now} · <span class="tag">Prueba</span></div>
</div>
<div class="meta">Cliente: <strong>Prueba de impresión</strong></div>
<hr class="sep-solid">
<div class="row">
  <span class="qty">2×</span>
  <span class="item">Hamburguesa Clásica</span>
</div>
<div class="opts">– Sin cebolla · Extra queso</div>
<div class="row">
  <span class="qty">1×</span>
  <span class="item">Papas fritas</span>
</div>
<hr class="sep">
<div class="notes">
  <div class="notes-label">⚠ Nota</div>
  Sin gluten — alergia severa
</div>
<div class="footer">Leogin · Comanda de prueba</div>
</body>
</html>`;
}

function buildReceiptTestHtml(): string {
  const now = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo — Prueba</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; width: 80mm; margin: 0 auto; padding: 8mm 4mm; }
  .center { text-align: center; }
  .restaurant { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .order-num { font-size: 22px; font-weight: bold; letter-spacing: 2px; margin: 6px 0 2px; }
  .date { font-size: 10px; color: #555; margin-bottom: 6px; }
  .sep { border: none; border-top: 1px dashed #999; margin: 7px 0; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .qty { width: 22px; vertical-align: top; font-size: 11px; }
  .desc { padding: 0 4px; line-height: 1.35; }
  .amount { text-align: right; white-space: nowrap; font-weight: 600; }
  .total-row { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 4px; display: flex; justify-content: space-between; }
  .footer { text-align: center; font-size: 10px; color: #888; margin-top: 10px; }
  @media print { body { width: 100%; padding: 0; } @page { margin: 4mm; size: 80mm auto; } }
</style>
</head>
<body>
<div class="center">
  <div class="restaurant">Restaurante de prueba</div>
  <div class="order-num">#TEST</div>
  <div class="date">${now}</div>
</div>
<hr class="sep">
<table><tbody>
  <tr><td class="qty">2×</td><td class="desc">Hamburguesa Clásica</td><td class="amount">120.00</td></tr>
  <tr><td class="qty">1×</td><td class="desc">Papas fritas</td><td class="amount">35.00</td></tr>
</tbody></table>
<hr class="sep">
<div class="total-row"><span>TOTAL</span><span>155.00</span></div>
<div class="footer">Leogin · Recibo de prueba</div>
</body>
</html>`;
}

type QzState = 'unknown' | 'checking' | 'available' | 'unavailable';

const PRINT_PREF_EVENT = 'leogin-print-pref';

/** Suscripción a cambios de localStorage (otras pestañas) y de este componente. */
function subscribePrintPrefs(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  window.addEventListener(PRINT_PREF_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(PRINT_PREF_EVENT, cb);
  };
}
function notifyPrintPrefs(): void {
  window.dispatchEvent(new Event(PRINT_PREF_EVENT));
}

export default function KitchenPrintSettings() {
  // Preferencias persistidas, leídas SSR-safe (sin setState en effect).
  const enabled = useSyncExternalStore(subscribePrintPrefs, () => isKitchenAutoPrintEnabled(), () => false);
  const kitchenPrinter = useSyncExternalStore(subscribePrintPrefs, () => getPrinter('kitchen'), () => '');
  const receiptPrinter = useSyncExternalStore(subscribePrintPrefs, () => getPrinter('receipt'), () => '');

  const [qzState, setQzState] = useState<QzState>('unknown');
  const [printers, setPrinters] = useState<string[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('');

  function toggle() {
    setKitchenAutoPrintEnabled(!enabled);
    notifyPrintPrefs();
  }

  async function detectPrinters() {
    setQzState('checking');
    setTestMsg('');
    try {
      const [list, def] = await Promise.all([listPrinters(), getDefaultPrinter()]);
      setPrinters(list);
      setDefaultPrinter(def);
      setQzState('available');
    } catch {
      setQzState('unavailable');
    }
  }

  function choosePrinter(role: PrintRole, name: string) {
    setPrinter(role, name);
    notifyPrintPrefs();
  }

  async function test(role: PrintRole) {
    setTestMsg('Enviando…');
    const html = role === 'kitchen' ? buildKitchenTestHtml() : buildReceiptTestHtml();
    const res = await printTicket(role, html);
    setTestMsg(
      res.method === 'qz'
        ? `✓ Enviado en silencio a «${getPrinter(role)}»`
        : '✓ Abrimos el diálogo del navegador (sin QZ o sin impresora asignada)',
    );
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-lg)',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--u-hair)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid var(--u-hair)',
    color: 'var(--u-text)',
    fontSize: 13,
  };

  return (
    <div style={cardStyle}>
      {/* Toggle principal: comanda automática al confirmar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
            Imprimir comanda de cocina al confirmar
          </div>
          <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
            Al pasar un pedido a «En preparación» se imprime la comanda automáticamente
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="press"
          style={{
            width: 46, height: 27, borderRadius: 99, border: 'none',
            cursor: 'pointer', padding: 4, flexShrink: 0,
            background: enabled ? 'var(--u-text)' : 'rgba(255,255,255,0.12)',
            display: 'flex',
            justifyContent: enabled ? 'flex-end' : 'flex-start',
            transition: 'background 180ms',
          }}
        >
          <span style={{ width: 19, height: 19, borderRadius: 99, background: enabled ? 'var(--brand-bg)' : 'var(--u-text)' }} />
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--u-hair)' }} />

      {/* Impresión silenciosa con QZ Tray */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
          Impresión directa (sin diálogo) · QZ Tray
        </div>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: 0 }}>
          Instalando <strong style={{ color: 'var(--u-text-2)' }}>QZ Tray</strong> en esta PC,
          la comanda sale sola a la impresora de cocina y el recibo a otra impresora distinta,
          sin diálogo y sin volver a configurar. Es por dispositivo.
          {' '}En móvil o sin QZ se usa el diálogo del navegador.
        </p>
      </div>

      {qzState === 'available' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              fontSize: 12, fontWeight: 600, color: '#4ade80',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ● QZ Tray conectado · {printers.length} impresora{printers.length === 1 ? '' : 's'} detectada{printers.length === 1 ? '' : 's'}
          </div>

          {/* Selector cocina */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 5 }}>
              🍳 Impresora de cocina
            </label>
            <select
              style={selectStyle}
              value={kitchenPrinter}
              onChange={(e) => choosePrinter('kitchen', e.target.value)}
            >
              <option value="">— Usar diálogo del navegador —</option>
              {printers.map((p) => (
                <option key={p} value={p}>{p}{p === defaultPrinter ? ' (predeterminada)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Selector recibos */}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 5 }}>
              🧾 Impresora de recibos
            </label>
            <select
              style={selectStyle}
              value={receiptPrinter}
              onChange={(e) => choosePrinter('receipt', e.target.value)}
            >
              <option value="">— Usar diálogo del navegador —</option>
              {printers.map((p) => (
                <option key={p} value={p}>{p}{p === defaultPrinter ? ' (predeterminada)' : ''}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => test('kitchen')} className="press glass-quiet"
              style={{ padding: '9px 13px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', color: 'var(--u-text-2)', fontWeight: 600, fontSize: 12.5 }}>
              🖨 Probar cocina
            </button>
            <button type="button" onClick={() => test('receipt')} className="press glass-quiet"
              style={{ padding: '9px 13px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', color: 'var(--u-text-2)', fontWeight: 600, fontSize: 12.5 }}>
              🖨 Probar recibo
            </button>
            <button type="button" onClick={detectPrinters} className="press glass-quiet"
              style={{ padding: '9px 13px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', fontWeight: 600, fontSize: 12.5 }}>
              ↻ Volver a detectar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {qzState === 'unavailable' && (
            <div
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.22)',
                borderRadius: 10, padding: '10px 12px',
                fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55,
              }}
            >
              No detectamos QZ Tray en este equipo. Instálalo desde{' '}
              <a href={QZ_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>qz.io/download</a>,
              ábrelo y vuelve a intentar. Mientras tanto, la impresión usa el diálogo del navegador.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={detectPrinters} disabled={qzState === 'checking'} className="press glass-quiet"
              style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', cursor: qzState === 'checking' ? 'wait' : 'pointer', color: 'var(--u-text-2)', fontWeight: 600, fontSize: 13, opacity: qzState === 'checking' ? 0.6 : 1 }}>
              {qzState === 'checking' ? 'Conectando…' : '🔌 Conectar con QZ Tray'}
            </button>
            <button type="button" onClick={() => test('kitchen')} className="press glass-quiet"
              style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', fontWeight: 600, fontSize: 13 }}>
              🖨 Probar con el navegador
            </button>
          </div>
        </div>
      )}

      {testMsg && (
        <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{testMsg}</div>
      )}
    </div>
  );
}
