'use client';

/* «Cobros de este turno» — lo que entró desde el cierre anterior, pedido
   por pedido, con una sola puerta para arreglarlo («Corregir»).

   Es la lista que el cajero repasa cuando el cuadre no le sale: si ve
   «Mesa 4 · Efectivo» y sabe que pagaron con tarjeta, lo arregla aquí
   mismo, con la firma del encargado, y el cuadre de al lado se mueve. */

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import type { CobroDelTurno } from '@/lib/caja/turno-servidor';
import { getPedidoDevolvible, type PedidoDevolvible } from '@/lib/actions/caja-correcciones';
import { fmtMoney } from '@/lib/money';
import CorreccionCobro, { metodosDe } from './correccion-cobro';

const money = (n: number) => fmtMoney(n);

function hora(iso: string, tz: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
  } catch {
    return iso.slice(11, 16);
  }
}

export default function CobrosDelTurno({ restaurantId, cobros, timezone, selfApproves, onAviso }: {
  restaurantId: string;
  cobros: CobroDelTurno[];
  timezone: string;
  selfApproves: boolean;
  onAviso: (a: { text: string; bad: boolean }) => void;
}) {
  const [abierto, setAbierto] = useState<CobroDelTurno | null>(null);
  const [buscado, setBuscado] = useState<PedidoDevolvible | null>(null);
  const [numero, setNumero] = useState('');
  const [buscando, startBuscar] = useTransition();
  const [verTodos, setVerTodos] = useState(false);

  const visibles = verTodos ? cobros : cobros.slice(0, 8);

  function buscar() {
    const n = numero.trim();
    if (!n) return;
    startBuscar(async () => {
      const r = await getPedidoDevolvible(restaurantId, { orderNumber: n });
      if (r.error || !r.order) { onAviso({ text: r.error ?? 'No encontré ese pedido.', bad: true }); return; }
      setBuscado(r.order);
    });
  }

  return (
    <section className="caja-tarjeta" aria-labelledby="caja-cobros-titulo" style={{ gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id="caja-cobros-titulo" className="t-display" style={{ flex: 1, minWidth: 180, fontSize: 16, margin: 0 }}>
          Cobros de este turno
        </h2>
        <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
          {cobros.length === 0 ? 'ninguno todavía' : `${cobros.length} ${cobros.length === 1 ? 'cobro' : 'cobros'}`}
        </span>
      </div>

      {cobros.length === 0 ? (
        <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Aquí aparece cada mesa y pedido que se cobre en este turno. Si uno se cobró mal, se corrige desde aquí.
        </p>
      ) : (
        <ul className="caja-cobros" role="list">
          {visibles.map((c) => (
            <li key={c.orderId} className="caja-cobro">
              <span className="t-mono caja-cobro-hora">{hora(c.at, timezone)}</span>
              <span className="caja-cobro-que">
                <span className="caja-cobro-nombre">
                  {c.label}
                  {c.reabierta && <span className="caja-marca">reabierta</span>}
                  {c.corregido && !c.reabierta && <span className="caja-marca">corregido</span>}
                  {c.devuelto > 0 && <span className="caja-marca">devuelto {money(c.devuelto)}</span>}
                  {c.sinCobrar && <span className="caja-marca caja-marca-aviso">liberada sin cobrar</span>}
                </span>
                <span className="caja-cobro-detalle">
                  {[c.orderNumber, c.sinCobrar || c.reabierta ? null : metodosDe(c.neto)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="t-mono caja-cobro-monto">{money(c.total)}</span>
              {!c.sinCobrar && !c.reabierta && (
                <button type="button" className="press caja-cobro-btn" onClick={() => setAbierto(c)}
                  aria-label={`Corregir el cobro de ${c.label}`}>
                  Corregir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {cobros.length > 8 && (
        <button type="button" className="press caja-link" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? 'Ver menos' : `Ver los ${cobros.length}`}
        </button>
      )}

      {/* Una devolución de un pedido de otro turno (hasta 3 días). */}
      <div className="caja-buscar">
        <label htmlFor="caja-buscar-num" style={{ fontSize: 12, color: 'var(--u-text-3)' }}>
          ¿Devolución de un pedido de otro turno?
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="caja-buscar-num"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            placeholder="Número del ticket, ej. 00123"
            className="adm-field"
            style={{ height: 40, flex: 1, minWidth: 0 }}
          />
          <button type="button" className="press caja-cobro-btn" style={{ height: 40 }} onClick={buscar}
            disabled={buscando || !numero.trim()}>
            <Icon name="search" size={14} />
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      {(abierto || buscado) && (
        <CorreccionCobro
          restaurantId={restaurantId}
          cobro={abierto}
          pedidoBuscado={buscado}
          timezone={timezone}
          selfApproves={selfApproves}
          onClose={() => { setAbierto(null); setBuscado(null); }}
          onDone={(texto) => {
            setAbierto(null); setBuscado(null); setNumero('');
            onAviso({ text: texto, bad: false });
          }}
        />
      )}
    </section>
  );
}
