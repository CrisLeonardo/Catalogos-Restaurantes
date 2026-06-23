'use client';

/* Botón flotante "Llamar al mesero" que aparece en el menú QR cuando
   el módulo está activo. Lee la mesa desde localStorage (guardada al
   escanear el QR de mesa: ?mesa=N). */

import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { callWaiter } from '@/lib/actions/waiter-call';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function WaiterCallButton({ restaurantId }: { restaurantId: string }) {
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      // La mesa se guarda cuando el cliente escanea el QR de su mesa (?mesa=N)
      const stored = localStorage.getItem(`qr-mesa-${restaurantId}`);
      if (stored) {
        const n = parseInt(stored, 10);
        if (n > 0) setTableNumber(n);
      }
    } catch {}
  }, [restaurantId]);

  // Resetea el estado después de mostrarlo brevemente
  useEffect(() => {
    if (status === 'sent' || status === 'error') {
      const t = setTimeout(() => setStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [status]);

  function handleCall() {
    if (status === 'sending' || isPending) return;
    setStatus('sending');
    startTransition(async () => {
      const res = await callWaiter(restaurantId, tableNumber);
      setStatus(res.ok ? 'sent' : 'error');
    });
  }

  const label =
    status === 'sending' ? 'Llamando…' :
    status === 'sent'    ? '¡El mesero ya viene!' :
    status === 'error'   ? 'No se pudo llamar' :
    tableNumber          ? `Llamar al mesero · Mesa ${tableNumber}` :
                           'Llamar al mesero';

  const bg =
    status === 'sent'  ? 'rgba(74,222,128,0.18)' :
    status === 'error' ? 'rgba(248,113,113,0.18)' :
    'var(--surface-2)';

  const borderColor =
    status === 'sent'  ? 'rgba(74,222,128,0.4)' :
    status === 'error' ? 'rgba(248,113,113,0.4)' :
    'var(--u-hair-2)';

  const textColor =
    status === 'sent'  ? '#4ade80' :
    status === 'error' ? '#f87171' :
    'var(--u-text-2)';

  const iconName =
    status === 'sent'  ? 'check' :
    status === 'error' ? 'x' :
    'bell';

  return (
    <button
      type="button"
      onClick={handleCall}
      disabled={status === 'sending' || isPending || status === 'sent'}
      className="press"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '13px 16px',
        borderRadius: 14,
        border: `1px solid ${borderColor}`,
        background: bg,
        color: textColor,
        cursor: (status === 'sending' || isPending || status === 'sent') ? 'default' : 'pointer',
        fontSize: 14,
        fontWeight: 600,
        transition: 'all 200ms',
        opacity: (status === 'sending' || isPending) ? 0.7 : 1,
      }}
    >
      <Icon name={iconName} size={18} />
      {label}
    </button>
  );
}
