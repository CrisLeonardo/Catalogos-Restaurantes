'use client';

/* ============================================================
   CORREGIR UN COBRO — el diálogo (PROD-05, migración 145)
   ------------------------------------------------------------
   Una sola puerta por cobro: «Corregir». Lo primero que pregunta es
   QUÉ pasó, con las palabras con que el cajero lo diría, porque
   «cambiar método», «reabrir» y «devolver» son nuestro vocabulario,
   no el suyo:

     · «Se cobró con otro método»     → Efectivo ↔ Tarjeta ↔ Transferencia
     · «Era otra mesa»                → la mesa vuelve al salón
     · «Hay que devolverle dinero»    → todo o una línea

   Antes de firmar dice en una línea qué le pasa al cajón, que es lo que
   el cajero de verdad quiere saber. El servidor vuelve a calcularlo todo.
   ============================================================ */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  corregirMetodoDePago, reabrirMesaCobrada, devolverCobro, getPedidoDevolvible,
  type PedidoDevolvible,
} from '@/lib/actions/caja-correcciones';
import type { CobroDelTurno } from '@/lib/caja/turno-servidor';
import { PAYMENT_METHODS, PAYMENT_LABEL, labelOf, type PaymentMethod } from '@/lib/payment-method';
import { fmtMoney } from '@/lib/money';
import { useFirmaEncargado } from './firma-encargado';

type Que = 'metodo' | 'mesa' | 'devolver';

const money = (n: number) => fmtMoney(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

function hora(iso: string, tz: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
  } catch {
    return iso.slice(11, 16);
  }
}

export function metodosDe(neto: Record<string, number>): string {
  const partes = Object.entries(neto).filter(([, v]) => v > 0);
  if (partes.length === 0) return 'Devuelto';
  if (partes.length === 1) return labelOf(partes[0][0]);
  return partes.map(([m, v]) => `${labelOf(m)} ${money(v)}`).join(' · ');
}

export default function CorreccionCobro({
  restaurantId, cobro, pedidoBuscado = null, timezone, selfApproves, onClose, onDone,
}: {
  restaurantId: string;
  /** null = devolución de un pedido de otro turno, buscado por número. */
  cobro: CobroDelTurno | null;
  /** Cuando se busca por número, el pedido ya encontrado. */
  pedidoBuscado?: PedidoDevolvible | null;
  timezone: string;
  selfApproves: boolean;
  onClose: () => void;
  onDone: (texto: string) => void;
}) {
  const reabrible = !!cobro?.reabrible;
  const [que, setQue] = useState<Que | null>(cobro ? null : 'devolver');
  const [metodo, setMetodo] = useState<PaymentMethod | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, start] = useTransition();
  const firma = useFirmaEncargado(restaurantId, selfApproves);

  /* ── Devolución: el pedido con sus líneas ── */
  const [devolvible, setDevolvible] = useState<PedidoDevolvible | null>(pedidoBuscado);
  const [cargando, setCargando] = useState(false);
  const [linea, setLinea] = useState<string | null>(null); // null = todo
  const [cantidad, setCantidad] = useState(1);
  const [metodoDevolucion, setMetodoDevolucion] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    if (que !== 'devolver' || devolvible || !cobro) return;
    let vivo = true;
    setCargando(true);
    getPedidoDevolvible(restaurantId, { orderId: cobro.orderId })
      .then((r) => {
        if (!vivo) return;
        setCargando(false);
        if (r.error || !r.order) { setError(r.error ?? 'No se pudo leer el pedido.'); return; }
        setDevolvible(r.order);
      })
      .catch(() => { if (vivo) { setCargando(false); setError('No se pudo leer el pedido.'); } });
    return () => { vivo = false; };
  }, [que, devolvible, cobro, restaurantId]);

  const neto = useMemo(() => cobro?.neto ?? devolvible?.neto ?? {}, [cobro, devolvible]);
  const principal = Object.entries(neto).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'CASH';

  /* Lo que le pasa al cajón, en una línea. */
  const efecto = useMemo(() => {
    if (que === 'metodo' && metodo) {
      const mueve = Object.entries(neto).filter(([m, v]) => m !== metodo && v > 0);
      if (mueve.length === 0) return `Ya está cobrado en ${labelOf(metodo)}.`;
      const total = r2(mueve.reduce((s, [, v]) => s + v, 0));
      const efectivo = mueve.find(([m]) => m === 'CASH')?.[1] ?? 0;
      if (efectivo > 0) return `El cajón deja de esperar ${money(efectivo)} en efectivo. El cobro sigue siendo de ${money(r2(total + (neto[metodo] ?? 0)))}.`;
      if (metodo === 'CASH') return `El cajón tiene que tener ${money(total)} más en efectivo.`;
      return `Pasan ${money(total)} a ${labelOf(metodo)}. El efectivo del cajón no cambia.`;
    }
    if (que === 'mesa' && cobro) {
      return `${cobro.label} vuelve al salón como servida y su cobro de ${money(cobro.total)} se compensa. Cóbrala de nuevo cuando toque.`;
    }
    if (que === 'devolver' && devolvible) {
      const l = linea ? devolvible.lineas.find((x) => x.id === linea) : null;
      const monto = l ? Math.min(r2(l.unitAmount * cantidad), devolvible.restante) : devolvible.restante;
      const via = metodoDevolucion ?? (devolvible.principal as PaymentMethod);
      return via === 'CASH'
        ? `Salen ${money(monto)} del cajón en efectivo. La venta no se borra.`
        : `Se devuelven ${money(monto)} por ${labelOf(via)}. El efectivo del cajón no cambia.`;
    }
    return null;
  }, [que, metodo, neto, cobro, devolvible, linea, cantidad, metodoDevolucion]);

  const motivoOk = motivo.trim().length >= 3;
  const puede = !!que && motivoOk && firma.valor.lista && !firma.valor.bloqueada && !enviando
    && (que !== 'metodo' || !!metodo)
    && (que !== 'devolver' || (!!devolvible && devolvible.restante > 0));

  function enviar() {
    setError(null);
    const id = cobro?.orderId ?? devolvible?.orderId;
    if (!que || !id) return;
    const base = { restaurantId, orderId: id, reason: motivo.trim(), approverId: firma.valor.approverId, approverPin: firma.valor.approverPin };
    start(async () => {
      const res = que === 'metodo'
        ? await corregirMetodoDePago({ ...base, method: metodo as PaymentMethod })
        : que === 'mesa'
          ? await reabrirMesaCobrada(base)
          : await devolverCobro({
              ...base,
              itemId: linea,
              quantity: linea ? cantidad : null,
              method: metodoDevolucion ?? devolvible?.principal ?? null,
            });
      if (res.error) { setError(res.error); firma.limpiarPin(); return; }
      onDone(
        que === 'metodo' ? `Cobro corregido a ${labelOf(metodo)}`
          : que === 'mesa' ? `${cobro?.label ?? 'La mesa'} volvió al salón`
            : `Devolución de ${money((res as { amount?: number }).amount ?? 0)} anotada`,
      );
    });
  }

  const titulo = cobro ? `Corregir · ${cobro.label}` : `Devolución · ${devolvible?.orderNumber ?? ''}`;
  const sub = cobro
    ? [cobro.orderNumber, `cobrado ${hora(cobro.at, timezone)}`, metodosDe(cobro.neto)].filter(Boolean).join(' · ')
    : devolvible ? `Cobrado ${money(devolvible.total)} · queda por devolver ${money(devolvible.restante)}` : '';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[min(94vw,520px)]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{sub}</DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '62vh', overflowY: 'auto' }}>
          {cobro && (
            <div role="radiogroup" aria-label="Qué pasó" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="caja-campo-label">¿Qué pasó?</div>
              <Opcion on={que === 'metodo'} onClick={() => setQue('metodo')} icono="creditCard"
                titulo="Se cobró con otro método" detalle="Ej. marcaron Efectivo y pagó con tarjeta" />
              {reabrible && (
                <Opcion on={que === 'mesa'} onClick={() => setQue('mesa')} icono="utensils"
                  titulo="Era otra mesa" detalle="La mesa vuelve al salón y el cobro se compensa" />
              )}
              <Opcion on={que === 'devolver'} onClick={() => setQue('devolver')} icono="undo"
                titulo="Hay que devolverle dinero" detalle="Todo el pedido o un platillo" />
            </div>
          )}

          {que === 'metodo' && (
            <div>
              <div className="caja-campo-label">¿Cómo se pagó de verdad?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PAYMENT_METHODS.map((m) => (
                  <button key={m} type="button" className="press caja-opcion caja-opcion-fila"
                    data-on={metodo === m ? '1' : '0'} aria-pressed={metodo === m}
                    disabled={Object.keys(neto).length === 1 && principal === m}
                    onClick={() => setMetodo(m)}>
                    {PAYMENT_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {que === 'devolver' && (
            cargando || !devolvible ? (
              !error && <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)' }}>Leyendo el pedido…</p>
            ) : devolvible.restante <= 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)' }}>Este pedido ya se devolvió completo.</p>
            ) : (
              <>
                <div>
                  <div className="caja-campo-label">¿Qué se devuelve?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Fila on={linea === null} onClick={() => setLinea(null)}
                      nombre="Todo lo que queda" monto={money(devolvible.restante)} />
                    {devolvible.lineas.map((l) => {
                      const quedan = l.quantity - l.refundedQty;
                      return (
                        <Fila key={l.id} on={linea === l.id} disabled={quedan <= 0}
                          onClick={() => { setLinea(l.id); setCantidad(1); }}
                          nombre={`${l.name}${l.quantity > 1 ? ` · ${l.quantity}` : ''}`}
                          detalle={l.refundedQty > 0 ? `${l.refundedQty} ya devuelto${l.refundedQty === 1 ? '' : 's'}` : undefined}
                          monto={`${money(l.unitAmount)} c/u`} />
                      );
                    })}
                  </div>
                </div>
                {linea && (() => {
                  const l = devolvible.lineas.find((x) => x.id === linea);
                  const max = l ? l.quantity - l.refundedQty : 1;
                  return max > 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="caja-campo-label" style={{ margin: 0 }}>Cantidad</span>
                      <button type="button" className="press caja-paso-btn" aria-label="Uno menos"
                        onClick={() => setCantidad((c) => Math.max(1, c - 1))}>−</button>
                      <span className="t-mono" style={{ fontSize: 16, fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{cantidad}</span>
                      <button type="button" className="press caja-paso-btn" aria-label="Uno más"
                        onClick={() => setCantidad((c) => Math.min(max, c + 1))}>+</button>
                      <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>de {max}</span>
                    </div>
                  ) : null;
                })()}
                <div>
                  <div className="caja-campo-label">¿Por dónde sale el dinero?</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PAYMENT_METHODS.map((m) => {
                      const on = (metodoDevolucion ?? devolvible.principal) === m;
                      return (
                        <button key={m} type="button" className="press caja-opcion caja-opcion-fila"
                          data-on={on ? '1' : '0'} aria-pressed={on} onClick={() => setMetodoDevolucion(m)}>
                          {PAYMENT_LABEL[m]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )
          )}

          {que && (
            <>
              <div>
                <label htmlFor="caja-motivo" className="caja-campo-label">Motivo</label>
                <textarea
                  id="caja-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder={que === 'metodo' ? 'Ej. pagó con tarjeta, se marcó mal' : que === 'mesa' ? 'Ej. se cobró la 4 y era la 5' : 'Ej. el platillo llegó frío'}
                  className="adm-field"
                  style={{ resize: 'none' }}
                />
              </div>
              {firma.bloque}
            </>
          )}

          {efecto && (
            <div className="caja-efecto" role="status">
              <Icon name="helpCircle" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{efecto}</span>
            </div>
          )}

          {error && (
            <div className="note note-danger">
              <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={!puede}>
            {enviando ? 'Guardando…'
              : que === 'metodo' ? 'Corregir el cobro'
                : que === 'mesa' ? 'Reabrir la mesa'
                  : que === 'devolver' ? 'Anotar la devolución' : 'Continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opcion({ on, onClick, icono, titulo, detalle }: {
  on: boolean; onClick: () => void; icono: Parameters<typeof Icon>[0]['name']; titulo: string; detalle: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className="press caja-opcion caja-opcion-grande" data-on={on ? '1' : '0'}>
      <Icon name={icono} size={18} style={{ flexShrink: 0 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</span>
        <span style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 400 }}>{detalle}</span>
      </span>
    </button>
  );
}

function Fila({ on, onClick, nombre, detalle, monto, disabled }: {
  on: boolean; onClick: () => void; nombre: string; detalle?: string; monto: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className="press caja-opcion caja-opcion-linea" data-on={on ? '1' : '0'}>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{nombre}</span>
        {detalle && <span style={{ display: 'block', fontSize: 11, color: 'var(--u-text-4)', fontWeight: 400 }}>{detalle}</span>}
      </span>
      <span className="t-mono" style={{ fontSize: 13, fontWeight: 600 }}>{monto}</span>
    </button>
  );
}
