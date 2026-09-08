'use client';

/* UNA LÍNEA DE LA CUENTA DE UNA MESA.
   ------------------------------------------------------------------
   Hallazgo M-22. `BillPanel` (el salón del encargado) y `TableCycle` (la
   pantalla del mesero) pintaban la cuenta de la MISMA mesa con dos
   árboles distintos, y ya no decían lo mismo: el del mesero enseñaba el
   asiento y en qué iba cada plato, el del salón no. Es exactamente la
   trampa de la que salió `SalonCanvas`, un piso más abajo — y desde que
   sentar y repartir por asiento son parte del trabajo (migraciones 128 y
   129), que el encargado no vea el asiento dejó de ser un detalle.

   Así que la fila vive aquí, una sola vez, y las dos pantallas la usan.

   Lo que SÍ es distinto entre las dos no son los datos, son los mandos:
   el mesero puede tocar el asiento, el tiempo, quitar uno o anular; el
   encargado mira. Eso entra por `controles`, un hueco donde cada pantalla
   mete los suyos — en vez de una docena de propiedades booleanas que
   acabarían convirtiendo esto en dos componentes otra vez, pero dentro
   del mismo archivo. */

import type { OrderStatus } from '@/types';

/** Cómo se llama cada estado en una línea de la cuenta. Vive aquí para
    que las dos pantallas no puedan volver a llamarlo distinto. */
const ESTADO_PLATO: Partial<Record<OrderStatus, string>> = {
  NEW: 'Sin aceptar',
  PREP: 'En cocina',
  READY: 'Lista',
  TRANSIT: 'En camino',
  SERVED: 'Servido',
};

export function estadoDePlato(status: OrderStatus | null): string {
  // `null` = todavía en el carrito, sin enviar a cocina.
  if (status === null) return 'Por enviar';
  return ESTADO_PLATO[status] ?? '';
}

export interface LineaCuenta {
  key: string;
  qty: number;
  name: string;
  /** Opciones elegidas, ya en texto. */
  detail?: string | null;
  note?: string | null;
  price: number;
  seat?: number | null;
  /** `null` = en el carrito; `undefined` = esta pantalla no lo enseña. */
  status?: OrderStatus | null;
}

export default function BillLine({
  l, money, compacta = false, meta, controles,
}: {
  l: LineaCuenta;
  money: (n: number) => string;
  /** La versión de tres columnas del panel del salón: sin chips ni
      mandos, para un panel de 336 px que solo se lee. */
  compacta?: boolean;
  /** El estado y el asiento, si esta pantalla los enseña. */
  meta?: React.ReactNode;
  /** Los mandos de esta pantalla: ±, editar, anular… */
  controles?: React.ReactNode;
}) {
  const detalle = [l.detail, l.note].filter(Boolean).join(' · ');

  if (compacta) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13.5 }}>
        <span className="t-mono" style={{ width: 22, flexShrink: 0, fontWeight: 600, color: 'var(--u-text-3)' }}>
          {l.qty}
        </span>
        <span style={{ flex: 1, minWidth: 0, color: 'var(--u-text-2)' }}>
          {l.name}
          {/* El asiento y el estado, que el panel del salón NO enseñaba
              (M-22). Van en la misma línea de detalle para no ganar altura
              en un panel que a menudo lista quince platos. */}
          {(detalle || l.seat != null || l.status !== undefined) && (
            <span style={{ display: 'block', fontSize: 12, marginTop: 1, color: detalle ? 'var(--brand-accent-ink)' : 'var(--u-text-4)' }}>
              {[
                l.seat != null ? `As. ${l.seat}` : null,
                l.status !== undefined ? estadoDePlato(l.status) : null,
                detalle || null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="t-mono" style={{ fontWeight: 600, color: 'var(--u-text)' }}>{money(l.price)}</span>
      </div>
    );
  }

  return (
    <div className="ciclo-item">
      {/* La cantidad primero, como se lee una comanda; el precio al otro
          extremo, que es donde importa al repartir la cuenta.
          «×2», no «2»: al otro extremo del renglón hay otro número suelto
          —el asiento— y a tamaño real los dos se leían igual. */}
      <span className="ciclo-chip ciclo-qty" aria-hidden>×{l.qty}</span>
      <span className="ciclo-name" style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, color: 'var(--u-text)' }}>{l.name}</span>
        <span style={{ display: 'block', fontSize: 12.5, marginTop: 1, color: detalle ? 'var(--brand-accent-ink)' : 'var(--u-text-4)' }}>
          {detalle || 'Sin notas'}
        </span>
      </span>
      {/* Estado, asiento y mandos van juntos: en el teléfono bajan a su
          propio renglón (`display: contents` los deja planos en escritorio,
          donde sí caben en la misma línea). */}
      <span className="ciclo-meta">{meta}{controles}</span>
      <span className="t-mono ciclo-price" style={{ width: 74, textAlign: 'right', flexShrink: 0, fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
        {money(l.price)}
      </span>
    </div>
  );
}
