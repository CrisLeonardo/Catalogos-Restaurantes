'use client';

import { useActionState, useState } from 'react';
import { aprobarComprobante, rechazarComprobante, type ComprobanteState } from '@/lib/actions/pago-plan';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';

/* Botones de una tarjeta de la bandeja de comprobantes: aprobar de un
   toque, o rechazar con el motivo que el restaurante va a leer. */
export default function ComprobanteRevision({ id }: { id: string }) {
  const [aprob, aprobar, aprobando] = useActionState<ComprobanteState, FormData>(aprobarComprobante, null);
  const [rech, rechazar, rechazando] = useActionState<ComprobanteState, FormData>(rechazarComprobante, null);
  const [conMotivo, setConMotivo] = useState(false);
  const estado = rech ?? aprob;

  if (estado && 'ok' in estado) {
    return (
      <p role="status" style={{ fontSize: 13, fontWeight: 600, color: rech ? 'var(--u-text-3)' : 'var(--c-ok)', margin: 0 }}>
        {estado.msg}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!conMotivo ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <form action={aprobar}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" disabled={aprobando}>
              <Icon name="checkCircle" size={15} /> {aprobando ? 'Aprobando…' : 'Aprobar pago'}
            </Button>
          </form>
          <Button type="button" variant="outline" onClick={() => setConMotivo(true)}>
            Rechazar
          </Button>
        </div>
      ) : (
        <form action={rechazar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="hidden" name="id" value={id} />
          <Input
            name="motivo"
            required
            maxLength={200}
            autoFocus
            placeholder="Ej. El monto no coincide, o la foto no se lee"
            aria-label="Motivo del rechazo"
            style={{ flex: '1 1 240px' }}
          />
          <Button type="submit" variant="destructive" disabled={rechazando}>
            {rechazando ? 'Rechazando…' : 'Rechazar'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConMotivo(false)}>Cancelar</Button>
        </form>
      )}
      {estado && 'error' in estado && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{estado.error}</p>
      )}
    </div>
  );
}
