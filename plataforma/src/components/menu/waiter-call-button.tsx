'use client';

/* FAB compacto "Llamar al mesero". Solo se renderiza (lo decide menu-client)
   cuando el módulo está activo Y el comensal escaneó el QR de su mesa.
   Lee la mesa desde el helper table-session y envía la llamada. */

import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { callWaiter } from '@/lib/actions/waiter-call';
import { getScannedTable } from '@/lib/table-session';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function WaiterCallButton({
  restaurantId,
  raised = false,
}: {
  restaurantId: string;
  /** Elevar el FAB por encima de la barra del carrito cuando hay pedidos. */
  raised?: boolean;
}) {
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {

    setTableNumber(getScannedTable(restaurantId));
  }, [restaurantId]);

  // Vuelve a 'idle' tras mostrar el resultado un momento.
  useEffect(() => {
    if (status === 'sent' || status === 'error') {
      const t = setTimeout(() => setStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [status]);

  function handleCall() {
    if (status === 'sending' || status === 'sent' || isPending) return;
    setStatus('sending');
    startTransition(async () => {
      const res = await callWaiter(restaurantId, tableNumber);
      setStatus(res.ok ? 'sent' : 'error');
    });
  }

  const sending = status === 'sending' || isPending;
  const done = status === 'sent';
  const failed = status === 'error';

  const label =
    sending ? 'Llamando…' :
    done    ? '¡El mesero ya viene!' :
    failed  ? 'Reintentar' :
              'Llamar al mesero';

  const bg =
    done   ? 'rgba(74,222,128,0.16)' :
    failed ? 'rgba(248,113,113,0.16)' :
             'var(--surface-2, rgba(22,22,24,0.94))';
  const borderColor =
    done   ? 'rgba(74,222,128,0.45)' :
    failed ? 'rgba(248,113,113,0.45)' :
             'var(--u-hair-2)';
  const color =
    done   ? '#4ade80' :
    failed ? '#f87171' :
             'var(--u-text)';
  const iconName = done ? 'check' : failed ? 'x' : 'bell';

  return (
    <button
      type="button"
      onClick={handleCall}
      disabled={sending || done}
      aria-label={tableNumber ? `Llamar al mesero · mesa ${tableNumber}` : 'Llamar al mesero'}
      className="press glass-solid"
      style={{
        position: 'fixed',
        right: 16,
        bottom: raised ? 160 : 92,
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 46,
        padding: '0 16px',
        borderRadius: 999,
        border: `1px solid ${borderColor}`,
        background: bg,
        color,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: sending || done ? 'default' : 'pointer',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        transition: 'background 220ms, border-color 220ms, color 220ms, bottom 220ms',
        opacity: sending ? 0.85 : 1,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <Icon name={iconName} size={18} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}
