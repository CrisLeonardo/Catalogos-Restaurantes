'use client';

import { useState, useSyncExternalStore, useCallback } from 'react';
import { Icon } from '@/components/icons';
import {
  PRINT_KEYS,
  type PrintRole,
  type UsbPrinterInfo,
  getPrinter,
  setPrinter,
  isKitchenAutoPrintEnabled,
  setKitchenAutoPrintEnabled,
  listPrinters,
  getDefaultPrinter,
  printTicket,
  isWebUsbSupported,
  getUsbPrinterInfo,
  requestUsbPrinter,
  clearUsbPrinter,
  printEscPosViaUsb,
} from '@/lib/printing';
import {
  buildTestKitchenEscPos,
  buildTestReceiptEscPos,
} from '@/lib/escpos';

/** @deprecated usa los helpers de '@/lib/printing'. Se mantiene por compatibilidad. */
export const KITCHEN_PRINT_KEY = PRINT_KEYS.kitchenEnabled;

const QZ_DOWNLOAD_URL = 'https://qz.io/download/';

// ── HTML de prueba (para QZ y browser fallback) ───────────────────────────────

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
<div class="row"><span class="qty">2×</span><span class="item">Hamburguesa Clásica</span></div>
<div class="opts">– Sin cebolla · Extra queso</div>
<div class="row"><span class="qty">1×</span><span class="item">Papas fritas</span></div>
<hr class="sep">
<div class="notes"><div class="notes-label">⚠ Nota</div>Sin gluten — alergia severa</div>
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

// ── Estado y suscripciones ────────────────────────────────────────────────────

type QzState = 'unknown' | 'checking' | 'available' | 'unavailable';

const PRINT_PREF_EVENT = 'leogin-print-pref';

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

// ── Estilos reutilizables ─────────────────────────────────────────────────────

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

const btnStyle: React.CSSProperties = {
  padding: '9px 13px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--u-text-2)',
  fontWeight: 600,
  fontSize: 12.5,
};

const btnDangerStyle: React.CSSProperties = {
  ...btnStyle,
  color: '#f87171',
  background: 'rgba(239,68,68,0.10)',
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function KitchenPrintSettings() {
  // Preferencias persistidas
  const enabled = useSyncExternalStore(
    subscribePrintPrefs,
    () => isKitchenAutoPrintEnabled(),
    () => false,
  );
  const kitchenPrinter = useSyncExternalStore(
    subscribePrintPrefs,
    () => getPrinter('kitchen'),
    () => '',
  );
  const receiptPrinter = useSyncExternalStore(
    subscribePrintPrefs,
    () => getPrinter('receipt'),
    () => '',
  );
  const usbKitchen = useSyncExternalStore(
    subscribePrintPrefs,
    () => getUsbPrinterInfo('kitchen'),
    () => null,
  );
  const usbReceipt = useSyncExternalStore(
    subscribePrintPrefs,
    () => getUsbPrinterInfo('receipt'),
    () => null,
  );

  const [qzState, setQzState] = useState<QzState>('unknown');
  const [printers, setPrinters] = useState<string[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const [qzError, setQzError] = useState('');
  const [usbMsg, setUsbMsg] = useState('');

  const usbSupported = isWebUsbSupported();

  function toggle() {
    setKitchenAutoPrintEnabled(!enabled);
    notifyPrintPrefs();
  }

  async function detectPrinters() {
    setQzState('checking');
    setTestMsg('');
    setQzError('');
    try {
      const [list, def] = await Promise.all([listPrinters(), getDefaultPrinter()]);
      setPrinters(list);
      setDefaultPrinter(def);
      setQzState('available');
    } catch (e) {
      setQzError((e as Error)?.message || String(e));
      setQzState('unavailable');
    }
  }

  function choosePrinter(role: PrintRole, name: string) {
    setPrinter(role, name);
    notifyPrintPrefs();
  }

  async function testQz(role: PrintRole) {
    setTestMsg('Enviando…');
    const html = role === 'kitchen' ? buildKitchenTestHtml() : buildReceiptTestHtml();
    const escpos = role === 'kitchen' ? buildTestKitchenEscPos : buildTestReceiptEscPos;
    const res = await printTicket(role, html, escpos);
    setTestMsg(
      res.method === 'qz'
        ? `✓ Enviado (QZ) a «${getPrinter(role)}»`
        : res.method === 'usb'
          ? `✓ Enviado (USB) a «${getUsbPrinterInfo(role)?.productName ?? 'impresora'}»`
          : '✓ Diálogo del navegador (sin QZ ni USB configurado)',
    );
  }

  const configureUsb = useCallback(async (role: PrintRole) => {
    setUsbMsg('Selecciona la impresora en el selector del navegador…');
    try {
      const info = await requestUsbPrinter(role);
      if (info) {
        notifyPrintPrefs();
        setUsbMsg(`✓ ${info.productName ?? `Dispositivo ${info.vendorId}:${info.productId}`} guardado`);
      } else {
        setUsbMsg('Selección cancelada.');
      }
    } catch (e) {
      setUsbMsg(`Error: ${(e as Error)?.message}`);
    }
  }, []);

  function removeUsb(role: PrintRole) {
    clearUsbPrinter(role);
    notifyPrintPrefs();
    setUsbMsg('');
  }

  async function testUsb(role: PrintRole) {
    const info = getUsbPrinterInfo(role);
    if (!info) return;
    setUsbMsg('Enviando prueba por USB…');
    try {
      const data = role === 'kitchen' ? buildTestKitchenEscPos() : buildTestReceiptEscPos();
      const ok = await printEscPosViaUsb(role, data);
      setUsbMsg(
        ok
          ? `✓ Impreso en «${info.productName ?? 'impresora USB'}»`
          : 'No se pudo imprimir. La impresora puede no estar conectada o el driver de Windows bloqueó el acceso. Intenta con QZ Tray.',
      );
    } catch (e) {
      setUsbMsg(`Error USB: ${(e as Error)?.message}`);
    }
  }

  function usbDeviceLabel(info: UsbPrinterInfo): string {
    return info.productName || `USB ${info.vendorId.toString(16)}:${info.productId.toString(16)}`;
  }

  return (
    <div style={cardStyle}>

      {/* ── Toggle: comanda automática ───────────────────────────────────── */}
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

      {/* ── Sección: Web USB ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
            Impresión directa · USB
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '4px 0 0' }}>
            Conecta la impresora por USB, configúrala una vez y el navegador la recuerda.
            Sin instalar apps ni QZ Tray. Funciona en <strong style={{ color: 'var(--u-text-2)' }}>Chrome y Edge</strong>.
            {' '}Compatible con Epson TM, 3Nstar, Star Micronics y similares.
          </p>
        </div>

        {!usbSupported ? (
          <div style={{
            fontSize: 12, color: 'var(--u-text-4)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--u-hair)',
            borderRadius: 8, padding: '8px 12px',
          }}>
            Web USB no disponible en este navegador. Usa Chrome o Edge para configurar impresoras USB sin instalar nada.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Impresora cocina USB */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 6 }}>
                Impresora de cocina (USB)
              </label>
              {usbKitchen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
                    ● {usbDeviceLabel(usbKitchen)}
                  </span>
                  <button type="button" onClick={() => configureUsb('kitchen')} className="press glass-quiet" style={btnStyle}>
                    Cambiar
                  </button>
                  <button type="button" onClick={() => removeUsb('kitchen')} className="press" style={btnDangerStyle}>
                    Quitar
                  </button>
                  <button type="button" onClick={() => testUsb('kitchen')} className="press glass-quiet" style={btnStyle}>
                    Probar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => configureUsb('kitchen')} className="press glass-quiet" style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="print" size={14} /> Seleccionar impresora de cocina
                </button>
              )}
            </div>

            {/* Impresora caja/recibos USB */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 6 }}>
                Impresora de caja / recibos (USB)
              </label>
              {usbReceipt ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
                    ● {usbDeviceLabel(usbReceipt)}
                  </span>
                  <button type="button" onClick={() => configureUsb('receipt')} className="press glass-quiet" style={btnStyle}>
                    Cambiar
                  </button>
                  <button type="button" onClick={() => removeUsb('receipt')} className="press" style={btnDangerStyle}>
                    Quitar
                  </button>
                  <button type="button" onClick={() => testUsb('receipt')} className="press glass-quiet" style={btnStyle}>
                    Probar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => configureUsb('receipt')} className="press glass-quiet" style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="print" size={14} /> Seleccionar impresora de caja
                </button>
              )}
            </div>

            {usbMsg && (
              <div style={{ fontSize: 12, color: usbMsg.startsWith('✓') ? '#4ade80' : 'var(--u-text-3)', lineHeight: 1.5 }}>
                {usbMsg}
              </div>
            )}

            <div style={{
              fontSize: 11.5, color: 'var(--u-text-4)',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: 8, padding: '7px 10px', lineHeight: 1.55,
            }}>
              En Windows, si el sistema ya tiene instalado un driver para la impresora,
              puede que el acceso USB falle. En ese caso instala{' '}
              <a href={QZ_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>QZ Tray</a>{' '}
              como alternativa.
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--u-hair)' }} />

      {/* ── Sección: QZ Tray ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
          Impresión avanzada · QZ Tray
        </div>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: 0 }}>
          Para impresoras por <strong style={{ color: 'var(--u-text-2)' }}>WiFi, red o Bluetooth</strong>,
          o si el USB no funciona en Windows. Requiere instalar{' '}
          <a href={QZ_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>QZ Tray</a>{' '}
          en esta PC (gratis, corre en segundo plano).
        </p>
      </div>

      {qzState === 'available' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
            ● QZ Tray conectado · {printers.length} impresora{printers.length === 1 ? '' : 's'} detectada{printers.length === 1 ? '' : 's'}
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 5 }}>
              Impresora de cocina (QZ)
            </label>
            <select style={selectStyle} value={kitchenPrinter} onChange={(e) => choosePrinter('kitchen', e.target.value)}>
              <option value="">— Usar diálogo del navegador —</option>
              {printers.map((p) => (
                <option key={p} value={p}>{p}{p === defaultPrinter ? ' (predeterminada)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 5 }}>
              Impresora de caja / recibos (QZ)
            </label>
            <select style={selectStyle} value={receiptPrinter} onChange={(e) => choosePrinter('receipt', e.target.value)}>
              <option value="">— Usar diálogo del navegador —</option>
              {printers.map((p) => (
                <option key={p} value={p}>{p}{p === defaultPrinter ? ' (predeterminada)' : ''}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => testQz('kitchen')} className="press glass-quiet" style={btnStyle}>
              Probar cocina
            </button>
            <button type="button" onClick={() => testQz('receipt')} className="press glass-quiet" style={btnStyle}>
              Probar recibo
            </button>
            <button type="button" onClick={detectPrinters} className="press glass-quiet" style={{ ...btnStyle, color: 'var(--u-text-3)' }}>
              ↻ Volver a detectar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {qzState === 'unavailable' && (
            <div style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.22)',
              borderRadius: 10, padding: '10px 12px',
              fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55,
            }}>
              No se pudo conectar con QZ Tray. Verifica que esté abierto (ícono junto al reloj)
              y que hayas permitido el acceso cuando lo pidió.
              {qzError && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--u-text-4)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                  {qzError}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={detectPrinters}
              disabled={qzState === 'checking'}
              className="press glass-quiet"
              style={{ ...btnStyle, opacity: qzState === 'checking' ? 0.6 : 1, cursor: qzState === 'checking' ? 'wait' : 'pointer' }}
            >
              {qzState === 'checking' ? 'Conectando…' : <><Icon name="plug" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Conectar con QZ Tray</>}
            </button>
          </div>
        </div>
      )}

      {testMsg && (
        <div style={{ fontSize: 12, color: testMsg.startsWith('✓') ? '#4ade80' : 'var(--u-text-3)' }}>
          {testMsg}
        </div>
      )}
    </div>
  );
}
