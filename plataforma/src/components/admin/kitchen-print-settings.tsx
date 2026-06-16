'use client';

import { useEffect, useState } from 'react';

export const KITCHEN_PRINT_KEY = 'leogin_kitchen_print_enabled';

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
<div class="row">
  <span class="qty">3×</span>
  <span class="item">Refresco mediano</span>
</div>
<hr class="sep">
<div class="notes">
  <div class="notes-label">⚠ Nota</div>
  Sin gluten — alergia severa
</div>
<div class="footer">Leogin · Comanda de prueba</div>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;
}

export default function KitchenPrintSettings() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(localStorage.getItem(KITCHEN_PRINT_KEY) === '1');
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(KITCHEN_PRINT_KEY, next ? '1' : '0');
  }

  function testPrint() {
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) { alert('Permite ventanas emergentes para imprimir.'); return; }
    win.document.write(buildKitchenTestHtml());
    win.document.close();
  }

  if (!mounted) return null;

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--u-hair)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Toggle principal */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
            Imprimir comanda de cocina
          </div>
          <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
            Al confirmar un pedido se imprime automáticamente el ticket de cocina
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
          <span
            style={{
              width: 19, height: 19, borderRadius: 99,
              background: enabled ? 'var(--brand-bg)' : 'var(--u-text)',
            }}
          />
        </button>
      </div>

      {/* Info y acciones — solo si está activo */}
      {enabled && (
        <>
          {/* Instrucción de impresora */}
          <div
            style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.20)',
              borderRadius: 10,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#60a5fa' }}>
              🖨 Configurar impresora de cocina
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: 0 }}>
              Usa el botón de prueba para verificar que el ticket se imprime correctamente.
              En el diálogo del sistema elige la impresora térmica de cocina y
              márcala como <strong style={{ color: 'var(--u-text-2)' }}>impresora predeterminada</strong> en
              este dispositivo para que las comandas futuras salgan automáticamente.
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: 0 }}>
              Tamaño de papel recomendado: 80 mm (ticket térmico).
            </p>
          </div>

          {/* Botón de prueba */}
          <button
            type="button"
            onClick={testPrint}
            className="press glass-quiet"
            style={{
              padding: '10px 14px', borderRadius: 'var(--radius-lg)',
              border: 'none', cursor: 'pointer',
              color: 'var(--u-text-2)', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            🖨 Imprimir comanda de prueba
          </button>
        </>
      )}
    </div>
  );
}
