'use client';

/* ============================================================
   COBRAR UN PEDIDO EN LÍNEA (auditoría del 26-nov-2026, hallazgo 1)
   ------------------------------------------------------------
   La hoja que se abre al entregar un domicilio o un «para recoger» del
   menú en línea, o al cobrar después uno que se entregó sin cobro.

   El método del cliente viene marcado (es lo que dijo que usaría), pero
   el cobro no existe hasta que alguien lo confirma aquí. Al entregar hay
   una segunda salida, «Entregar sin cobrar»: el repartidor todavía trae
   el efectivo, o el cliente paga después. La caja no lo espera hasta que
   se cobre.

   Mismas piezas que la hoja de cobro de Servicio (`.sv-*`, HojaOperativa).
   ============================================================ */

import { useRef, useState } from 'react';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { Kicker } from '@/components/admin/servicio/pieces';
import { CampoImporte, Fila } from '@/components/admin/servicio/hoja-cobro';
import { cobrarPedido } from '@/lib/actions/cobro-pedido';
import { isPaymentMethod, PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-method';

const centavos = (n: number) => Math.round(n * 100);

function leerCentavos(valor: string) {
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(valor.trim())) return null;
  const [entero, decimales = ''] = valor.trim().replace(',', '.').split('.');
  return Number(entero) * 100 + Number(decimales.padEnd(2, '0'));
}

function billetes(total: number): number[] {
  const out = new Set<number>();
  for (const paso of [50, 100, 200, 500]) {
    const arriba = Math.ceil(total / paso) * paso;
    if (arriba > total) out.add(arriba);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}

export default function CobroPedido({
  restaurantId, orderId, numero, saldo, metodoIndicado, pagaCon, entregar, money, onClose, onListo,
}: {
  restaurantId: string;
  orderId: string;
  /** «#00003», para el título. */
  numero: string;
  /** Lo que falta cobrar. */
  saldo: number;
  /** Lo que eligió el cliente en la carta. */
  metodoIndicado: string | null;
  /** «Paga con» que escribió el cliente, si pagará en efectivo. */
  pagaCon?: number | null;
  /** Se abre al entregar: ofrece «Entregar sin cobrar» y entrega después de cobrar. */
  entregar?: () => Promise<string | null>;
  money: (n: number) => string;
  onClose: () => void;
  /** Termina bien: el texto que el panel enseña. */
  onListo: (texto: string) => void;
}) {
  const indicado = (metodoIndicado ?? '').toUpperCase();
  const [metodo, setMetodo] = useState<PaymentMethod>(isPaymentMethod(indicado) ? indicado : 'CASH');
  const [recibido, setRecibido] = useState(pagaCon && pagaCon >= saldo ? String(pagaCon) : '');
  const [busy, setBusy] = useState<null | 'cobrar' | 'entregar'>(null);
  const [error, setError] = useState('');
  const enVuelo = useRef(false);

  const total = centavos(saldo);
  const recibidoCent = recibido.trim() === '' ? null : leerCentavos(recibido);
  const efectivoInvalido = metodo === 'CASH' && recibido.trim() !== '' && (recibidoCent == null || recibidoCent < total);

  async function correr(tipo: 'cobrar' | 'entregar') {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setBusy(tipo);
    setError('');
    try {
      if (tipo === 'cobrar') {
        /* Primero la entrega y después el cobro: cobrar escribe el método
           en el pedido y cambia su versión, así que entregar después lo
           tomaba por un cambio ajeno. Si la entrega falla no se cobra; si
           el cobro falla, el pedido queda entregado con «Cobrar» a la vista. */
        if (entregar) {
          const fallo = await entregar();
          if (fallo) { setError(fallo); return; }
        }
        const r = await cobrarPedido(restaurantId, orderId, metodo, metodo === 'CASH' && recibidoCent != null ? recibidoCent / 100 : null);
        if ('error' in r) {
          if (entregar) { onListo(`Pedido ${numero} entregado. No se registró el cobro: ${r.error}`); return; }
          setError(r.error);
          return;
        }
        const cobro = r.yaCobrado ? `El pedido ${numero} ya estaba cobrado` : `Cobro registrado: ${money(r.cobrado)} en ${r.metodo.toLowerCase()}`;
        onListo(entregar ? `${cobro} · entregado` : cobro);
        return;
      }
      const fallo = await entregar?.();
      if (fallo) { setError(fallo); return; }
      onListo(`Pedido ${numero} entregado · cobro pendiente`);
    } catch {
      setError('Se perdió la respuesta. Revisa el pedido: si sigue sin cobro, vuelve a intentarlo; no se cobra dos veces.');
    } finally {
      enVuelo.current = false;
      setBusy(null);
    }
  }

  const titulo = entregar ? `Entregar el pedido ${numero}` : `Cobrar el pedido ${numero}`;
  return (
    <HojaOperativa
      label={titulo}
      className="hoja-cobro"
      onClose={onClose}
      resumen={<Fila label="Por cobrar" valor={money(saldo)} destacada />}
      footer={
        <div className="sv-cobro-pie">
          {metodo === 'CASH' && recibidoCent != null && !efectivoInvalido && (
            <div role="status"><Fila label="Vuelto" valor={money((recibidoCent - total) / 100)} tone="ok" /></div>
          )}
          {error && <p role="alert" className="sv-hint">{error}</p>}
          <Button type="button" size="action" onClick={() => correr('cobrar')} disabled={busy !== null || efectivoInvalido} aria-busy={busy === 'cobrar'}>
            {busy === 'cobrar' ? 'Cobrando…' : `${entregar ? 'Cobrar y entregar' : 'Cobrar'} ${money(saldo)}`}
          </Button>
          {entregar && (
            <Button type="button" size="touch" variant="ghost" onClick={() => correr('entregar')} disabled={busy !== null} aria-busy={busy === 'entregar'}>
              {busy === 'entregar' ? 'Entregando…' : 'Entregar sin cobrar'}
            </Button>
          )}
        </div>
      }
    >
      <div className="sv-cobro-contenido">
        <div>
          <Kicker>¿Cómo pagó?</Kicker>
          <div className="sv-cobro-metodos" role="group" aria-label="Método de pago">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" className="sv-choice" data-on={metodo === m ? '1' : '0'}
                aria-pressed={metodo === m} disabled={busy !== null} onClick={() => setMetodo(m)}>
                {PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
          {isPaymentMethod(indicado) && (
            <p className="sv-foot-note">El cliente indicó {PAYMENT_LABEL[indicado].toLowerCase()} en la carta.</p>
          )}
        </div>
        {metodo === 'CASH' && (
          <div className="grid gap-2">
            <CampoImporte label="Efectivo recibido (opcional)" value={recibido} onChange={setRecibido} disabled={busy !== null} />
            <div className="sv-opts-row">
              {[saldo, ...billetes(saldo)].map((v) => (
                <button key={v} type="button" className="sv-choice" data-mono="1"
                  data-on={recibidoCent === centavos(v) ? '1' : '0'} aria-pressed={recibidoCent === centavos(v)}
                  disabled={busy !== null} onClick={() => setRecibido(String(v))}>
                  {centavos(v) === total ? `Justo ${money(v)}` : money(v)}
                </button>
              ))}
            </div>
            {efectivoInvalido && (
              <p className="sv-hint" role="alert">{recibidoCent == null
                ? 'Ingresa un importe con hasta dos decimales.'
                : `Faltan ${money((total - recibidoCent) / 100)}.`}</p>
            )}
          </div>
        )}
        {metodo !== 'CASH' && (
          <p className="sv-foot-note">Registra aquí el pago que ya cobraste con {metodo === 'CARD' ? 'el POS' : 'la transferencia'}. No entra al efectivo del cajón.</p>
        )}
        {entregar && (
          <p className="sv-foot-note">¿Todavía no pagan? «Entregar sin cobrar» lo deja pendiente: lo cobras después desde el pedido.</p>
        )}
      </div>
    </HojaOperativa>
  );
}
