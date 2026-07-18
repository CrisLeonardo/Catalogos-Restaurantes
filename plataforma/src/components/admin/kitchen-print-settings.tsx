'use client';

import { useState, useSyncExternalStore, useCallback } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  PRINT_KEYS,
  type PrintRole,
  type UsbPrinterInfo,
  isKitchenAutoPrintEnabled,
  setKitchenAutoPrintEnabled,
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

// ── Estado y suscripciones ────────────────────────────────────────────────────

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

// ── Componente ────────────────────────────────────────────────────────────────

export default function KitchenPrintSettings() {
  // Preferencias persistidas
  const enabled = useSyncExternalStore(
    subscribePrintPrefs,
    () => isKitchenAutoPrintEnabled(),
    () => false,
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

  const [usbMsg, setUsbMsg] = useState('');

  const usbSupported = isWebUsbSupported();

  function toggle() {
    setKitchenAutoPrintEnabled(!enabled);
    notifyPrintPrefs();
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
          : 'No se pudo imprimir. La impresora puede no estar conectada o el driver de Windows bloqueó el acceso.',
      );
    } catch (e) {
      setUsbMsg(`Error USB: ${(e as Error)?.message}`);
    }
  }

  function usbDeviceLabel(info: UsbPrinterInfo): string {
    return info.productName || `USB ${info.vendorId.toString(16)}:${info.productId.toString(16)}`;
  }

  return (
    <Card className="flex flex-col gap-4 p-4.5">

      <div style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.55 }}>
        Alternativa a Leogin en tu PC para equipos que prefieren impresión directa. Si no configuras
        ninguna impresora aquí, los recibos y comandas salen por el <strong style={{ color: 'var(--u-text-3)' }}>diálogo
        del navegador</strong> (sirve también desde el celular hacia una impresora térmica conectada al dispositivo).
      </div>

      <div style={{ borderTop: '1px solid var(--u-hair)' }} />

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
        <Switch checked={enabled} onCheckedChange={toggle} aria-label="Imprimir comanda de cocina al confirmar" />
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
            Sin instalar apps. Funciona en <strong style={{ color: 'var(--u-text-2)' }}>Chrome y Edge</strong>.
            {' '}Compatible con Epson TM, 3Nstar, Star Micronics y similares.
          </p>
        </div>

        {!usbSupported ? (
          <div style={{
            fontSize: 12, color: 'var(--u-text-4)',
            background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
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
                  <span style={{ fontSize: 13, color: 'var(--c-ok, #4ade80)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    ● {usbDeviceLabel(usbKitchen)}
                  </span>
                  <Button type="button" onClick={() => configureUsb('kitchen')} variant="secondary" size="sm">
                    Cambiar
                  </Button>
                  <Button type="button" onClick={() => removeUsb('kitchen')} variant="destructive" size="sm">
                    Quitar
                  </Button>
                  <Button type="button" onClick={() => testUsb('kitchen')} variant="secondary" size="sm">
                    Probar
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={() => configureUsb('kitchen')} variant="secondary" size="sm">
                  <Icon name="print" size={14} /> Seleccionar impresora de cocina
                </Button>
              )}
            </div>

            {/* Impresora caja/recibos USB */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-2)', display: 'block', marginBottom: 6 }}>
                Impresora de caja / recibos (USB)
              </label>
              {usbReceipt ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--c-ok, #4ade80)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    ● {usbDeviceLabel(usbReceipt)}
                  </span>
                  <Button type="button" onClick={() => configureUsb('receipt')} variant="secondary" size="sm">
                    Cambiar
                  </Button>
                  <Button type="button" onClick={() => removeUsb('receipt')} variant="destructive" size="sm">
                    Quitar
                  </Button>
                  <Button type="button" onClick={() => testUsb('receipt')} variant="secondary" size="sm">
                    Probar
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={() => configureUsb('receipt')} variant="secondary" size="sm">
                  <Icon name="print" size={14} /> Seleccionar impresora de caja
                </Button>
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
              puede que el acceso USB falle. En ese caso usa el <strong style={{ color: 'var(--u-text-3)' }}>Agente
              Leogin</strong> (arriba), que imprime sin depender del navegador.
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
