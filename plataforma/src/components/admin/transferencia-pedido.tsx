'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { verComprobantePedido, revisarTransferencia } from '@/lib/actions/pago-transferencia';
import { TRANSFERENCIA_ETIQUETA, type EstadoTransferencia } from '@/lib/pago-transferencia';

/* Estado de la transferencia de un pedido, dentro de su tarjeta del panel
   (mig. 149). Con comprobante subido: verlo y confirmarlo de un toque, o
   marcarlo como no recibido (el comensal ve que debe enviar otro). */

const NOTA: Record<EstadoTransferencia, string> = {
  ESPERANDO: 'note-warn',
  POR_CONFIRMAR: 'note-warn',
  CONFIRMADO: 'note-ok',
  RECHAZADO: 'note-danger',
};

export default function TransferenciaPedido({ orderId, estado }: { orderId: string; estado: EstadoTransferencia }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ver() {
    setError(null);
    start(async () => {
      const r = await verComprobantePedido(orderId);
      if ('error' in r) return setError(r.error);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    });
  }

  function revisar(confirmada: boolean) {
    setError(null);
    start(async () => {
      const r = await revisarTransferencia(orderId, confirmada);
      if ('error' in r) setError(r.error);
    });
  }

  return (
    <div className={`note ${NOTA[estado]}`} style={{ marginTop: 4, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
        <Icon name={estado === 'CONFIRMADO' ? 'checkCircle' : estado === 'RECHAZADO' ? 'alertCircle' : 'clock'} size={13} />
        {TRANSFERENCIA_ETIQUETA[estado]}
      </span>
      {estado === 'ESPERANDO' && (
        <span style={{ fontSize: 11, lineHeight: 1.4 }}>El cliente aún no sube su comprobante. Lo verás aquí cuando lo haga.</span>
      )}
      {(estado === 'POR_CONFIRMAR' || estado === 'CONFIRMADO' || estado === 'RECHAZADO') && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button type="button" size="sm" variant="secondary" onClick={ver} disabled={pending}>
            <Icon name="receipt" size={13} /> Ver comprobante
          </Button>
          {estado === 'POR_CONFIRMAR' && (
            <>
              <Button type="button" size="sm" onClick={() => revisar(true)} disabled={pending}>
                <Icon name="check" size={13} /> Confirmar pago
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => revisar(false)} disabled={pending}>
                No llegó
              </Button>
            </>
          )}
        </div>
      )}
      {error && <span role="alert" style={{ fontSize: 11 }}>{error}</span>}
    </div>
  );
}
