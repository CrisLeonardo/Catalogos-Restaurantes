'use client';

import { useEffect, useState } from 'react';
import type { PedidoDemo } from '@/lib/pidelo';

/* ============================================================
   «Pedidos en vivo» de mentira — lo que ve la cocina
   ------------------------------------------------------------
   El remate de «Pídelo tú mismo» (lib/pidelo.ts): el pedido que
   el visitante acaba de hacer, pintado como lo pinta el panel.
   Lo usan la demo (mismo aparato) y la ventana del QR de la web
   (celular + PC), así que se ve igual en los dos.

   Colores fijos y no los del restaurante: esto es el PANEL de
   Leogin, no la carta, y dentro de una carta oscura tiene que
   seguir viéndose como el panel. Superficies sólidas, sin vidrio.

   Se puede tocar: «Aceptar» lo manda a cocina y «Marcar listo»
   lo termina. Son tres toques y es exactamente el ciclo real.
   ============================================================ */

type Etapa = 'nuevo' | 'cocina' | 'listo';

const ETAPA: Record<Etapa, { etiqueta: string; fondo: string; tinta: string }> = {
  nuevo:  { etiqueta: 'NUEVO',     fondo: '#FDE7DF', tinta: '#B4472A' },
  cocina: { etiqueta: 'EN COCINA', fondo: '#FDF1D8', tinta: '#8A5A00' },
  listo:  { etiqueta: 'LISTO',     fondo: '#DFF3E5', tinta: '#1F7A3D' },
};

function haceCuanto(desde: number, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - desde) / 1000));
  if (s < 60) return `hace ${s} s`;
  return `hace ${Math.floor(s / 60)} min`;
}

export function PanelEnVivo({ pedido, dinero, restaurante = 'Rincón 502' }: {
  /** null = todavía esperando el pedido. */
  pedido: PedidoDemo | null;
  dinero: (n: number) => string;
  restaurante?: string;
}) {
  const [etapa, setEtapa] = useState<Etapa>('nuevo');
  const [ahora, setAhora] = useState(() => Date.now());

  // Un pedido nuevo vuelve a empezar como NUEVO.
  useEffect(() => { setEtapa('nuevo'); }, [pedido?.enviado]);

  useEffect(() => {
    if (!pedido) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pedido]);

  const e = ETAPA[etapa];

  return (
    <div
      style={{
        background: '#F6F4F1', border: '1px solid #E6E1DA', borderRadius: 18,
        padding: 14, color: '#1A1613', fontFamily: 'var(--font-geist, system-ui), system-ui, sans-serif',
        textAlign: 'left', width: '100%', maxWidth: 380,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Pedidos en vivo</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#1F7A3D' }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: '#22A055' }} className="pidelo-pulso" />
          EN VIVO
        </span>
      </div>

      {!pedido ? (
        <div
          role="status"
          style={{
            background: '#FFFFFF', border: '1px dashed #D9D2C8', borderRadius: 14,
            padding: '26px 16px', textAlign: 'center', fontSize: 13.5, color: '#6B625A', lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 650, color: '#1A1613', marginBottom: 4 }}>Esperando tu pedido…</div>
          Cuando lo envíes desde tu celular, aparece aquí y suena.
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="pidelo-entra"
          style={{
            background: '#FFFFFF', border: `1.5px solid ${etapa === 'nuevo' ? '#E8A48E' : '#E6E1DA'}`,
            borderRadius: 14, padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 99, background: e.fondo, color: e.tinta }}>
              {e.etiqueta}
            </span>
            <span style={{ fontSize: 12, color: '#8A8178' }}>{haceCuanto(pedido.enviado, ahora)}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8 }}>
            Mesa 4{pedido.cliente ? ` · ${pedido.cliente}` : ''}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pedido.lineas.map((l, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.35 }}>
                <span style={{ fontWeight: 700 }}>{l.cantidad}×</span> {l.nombre}
                {l.detalle && <span style={{ display: 'block', fontSize: 12, color: '#8A8178' }}>{l.detalle}</span>}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{dinero(pedido.total)}</span>
            {etapa === 'listo' ? (
              <span style={{ fontSize: 12.5, color: '#1F7A3D', fontWeight: 600 }}>Le avisamos al cliente ✓</span>
            ) : (
              <button
                type="button"
                onClick={() => setEtapa(etapa === 'nuevo' ? 'cocina' : 'listo')}
                style={{
                  border: 'none', borderRadius: 10, padding: '9px 14px', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, color: '#FFFFFF',
                  background: etapa === 'nuevo' ? '#C4532F' : '#1F7A3D',
                }}
              >
                {etapa === 'nuevo' ? 'Aceptar' : 'Marcar listo'}
              </button>
            )}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: '#8A8178', margin: '10px 2px 0', lineHeight: 1.45 }}>
        Así lo ve la cocina de {restaurante}. En tu restaurante, además, sale impreso solo.
      </p>
    </div>
  );
}
