'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { leerHistorialPedido } from '@/lib/actions/pedidos-en-vivo';
import type { OrderWithItems } from '@/lib/db/orders';
import { fmtCurrency, type PanelCurrency } from '@/lib/money';
import { shortOrderNumber } from '@/lib/order-number';
import { STATUS_LABEL } from '@/lib/order-status';
import { estadoDelCobro, type HitoPedido, type ResumenPedidoVivo } from '@/lib/pedidos-en-vivo';
import styles from './pedidos-en-vivo.module.css';

export default function PedidoHistorial({ pedido, restaurante, resumen, moneda, zona, leidoEn, cerrar }: {
  pedido: OrderWithItems; restaurante: string; resumen?: ResumenPedidoVivo; moneda: PanelCurrency;
  zona: string; leidoEn: string; cerrar: () => void;
}) {
  const [hitos, setHitos] = useState<HitoPedido[] | null>(null);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const id = pedido.id;
  useEffect(() => {
    let vigente = true;
    leerHistorialPedido(restaurante, id).then((resultado) => {
      if (!vigente) return;
      if ('error' in resultado) setError(resultado.error);
      else { setHitos(resultado.hitos); setError(''); }
    }).catch(() => { if (vigente) setError('Se perdió la conexión al cargar el historial.'); });
    return () => { vigente = false; };
  }, [restaurante, id, leidoEn, recarga]);

  const horaLocal = new Intl.DateTimeFormat(moneda.locale || 'es-GT', { timeZone: zona, dateStyle: 'short', timeStyle: 'short' });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) cerrar(); }}>
      <DialogContent className={styles.historial}>
        <DialogHeader>
          <DialogTitle>Pedido {shortOrderNumber(pedido.order_number)}</DialogTitle>
          <DialogDescription>{pedido.customer_name} · {STATUS_LABEL[pedido.status]}</DialogDescription>
        </DialogHeader>
        <div className={styles.resumen}>
          <strong>{estadoDelCobro(resumen, Number(pedido.total), pedido.cash_collected)}</strong>
          {resumen && resumen.movimientos > 0 && <span>{fmtCurrency(resumen.cobrado, moneda)} de {fmtCurrency(Number(pedido.total), moneda)}</span>}
          {resumen?.movimientos === 0 && Number(pedido.cash_collected) > 0 && <span>{fmtCurrency(Number(pedido.cash_collected), moneda)}</span>}
        </div>
        {pedido.notes && <p className="note note-warn">{pedido.notes}</p>}
        <h3 className={styles.titulo}>Historial del pedido</h3>
        {error && <div className="note note-danger" role="status"><span>{error}</span>
          <button type="button" className={styles.accion} onClick={() => { setError(''); setRecarga((n) => n + 1); }}>Reintentar</button>
        </div>}
        {!hitos && !error && <p role="status">Cargando historial…</p>}
        {hitos && <ol className={styles.cronologia}>{hitos.map((h) => <li key={h.id} data-alerta={h.alerta || undefined}>
          <time dateTime={h.hora}>{horaLocal.format(new Date(h.hora))}</time>
          <div><strong>{h.titulo}{h.monto !== undefined && ` · ${fmtCurrency(h.monto, moneda)}`}</strong>
            {h.detalle && <p>{h.detalle}</p>}</div>
        </li>)}</ol>}
      </DialogContent>
    </Dialog>
  );
}
