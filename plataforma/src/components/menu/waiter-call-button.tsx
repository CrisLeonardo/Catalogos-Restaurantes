'use client';

/* FAB compacto "Llamar al mesero". Solo se renderiza (lo decide menu-client)
   cuando el módulo está activo Y el comensal escaneó el QR de su mesa.
   Lee la mesa desde el helper table-session y envía la llamada. */

import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { callWaiter, type CallReason } from '@/lib/actions/waiter-call';
import { getScannedTable, watchScannedTable } from '@/lib/table-session';

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
  /* Un solo botón que ofrece las dos cosas. Llamar al mesero y pedir la
     cuenta son necesidades distintas —la segunda es la que libera la mesa,
     y por eso el salón la trata aparte— pero no merecen dos botones
     flotantes peleando por la misma esquina. */
  const [open, setOpen] = useState(false);
  const [sentReason, setSentReason] = useState<CallReason>('call');

  useEffect(() => {
    setTableNumber(getScannedTable(restaurantId));
    // Re-valida el TTL al volver a primer plano / al vencer: el número de
    // mesa no debe quedarse pegado en una PWA que estuvo dormida horas.
    return watchScannedTable(restaurantId, setTableNumber);
  }, [restaurantId]);

  // Vuelve a 'idle' tras mostrar el resultado un momento.
  useEffect(() => {
    if (status === 'sent' || status === 'error') {
      const t = setTimeout(() => setStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [status]);

  function handleCall(reason: CallReason) {
    if (status === 'sending' || status === 'sent' || isPending) return;
    setOpen(false);
    setSentReason(reason);
    setStatus('sending');
    startTransition(async () => {
      const res = await callWaiter(restaurantId, tableNumber, reason);
      setStatus(res.ok ? 'sent' : 'error');
    });
  }

  const sending = status === 'sending' || isPending;
  const done = status === 'sent';
  const failed = status === 'error';

  const label =
    sending ? 'Avisando…' :
    done    ? (sentReason === 'bill' ? 'Ya le avisamos, ahí va la cuenta' : '¡El mesero ya viene!') :
    failed  ? 'Reintentar' :
              'Llamar al mesero';

  const bg =
    done   ? 'var(--c-ok-bg)' :
    failed ? 'var(--c-danger-bg)' :
             'var(--surface-2, rgba(22,22,24,0.94))';
  const borderColor =
    done   ? 'var(--c-ok-line)' :
    failed ? 'var(--c-danger-line)' :
             'var(--u-hair-2)';
  const color =
    done   ? 'var(--c-ok)' :
    failed ? 'var(--c-danger)' :
             'var(--u-text)';
  const iconName = done ? 'check' : failed ? 'x' : 'bell';

  /* Ancla común del FAB y de las dos opciones: el canto derecho de la
     CARTA, no el de la ventana (mismo criterio que active-order-chip.tsx). */
  const right = 'max(16px, calc(50% - var(--menu-max, 460px) / 2 + var(--menu-pad, 16px)))';
  const base = raised ? 160 : 92;

  function choice(reason: CallReason, icon: string, text: string, bottom: number) {
    return (
      <button
        type="button"
        onClick={() => handleCall(reason)}
        className="press glass-solid anim-slide-up"
        style={{
          position: 'fixed', right, bottom, zIndex: 61,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 46, padding: '0 16px',
          borderRadius: 'var(--m-r-pill)',
          border: '1px solid var(--u-hair-2)',
          background: 'var(--surface-2, rgba(22,22,24,0.94))',
          color: 'var(--u-text)',
          fontSize: 'var(--m-fs-sm)', fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <Icon name={icon} size={18} />
        <span style={{ whiteSpace: 'nowrap' }}>{text}</span>
      </button>
    );
  }

  return (
    <>
      {/* Al tocar el botón se abren las dos opciones; tocar fuera las cierra. */}
      {open && !sending && !done && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 59 }}
            aria-hidden="true"
          />
          {choice('bill', 'wallet', 'La cuenta, por favor', base + 112)}
          {choice('call', 'bell', 'Necesito algo', base + 56)}
        </>
      )}

      <button
        type="button"
        onClick={() => {
          if (sending || done) return;
          if (failed) { handleCall(sentReason); return; }
          setOpen((v) => !v);
        }}
        disabled={sending || done}
        aria-expanded={open}
        aria-label={tableNumber ? `Llamar al mesero · mesa ${tableNumber}` : 'Llamar al mesero'}
        className="press glass-solid"
        style={{
          position: 'fixed',
          right,
          bottom: base,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 46,
          padding: '0 16px',
          borderRadius: 'var(--m-r-pill)',
          border: `1px solid ${borderColor}`,
          background: bg,
          color,
          fontSize: 'var(--m-fs-sm)',
          fontWeight: 600,
          cursor: sending || done ? 'default' : 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          transition: 'background 220ms, border-color 220ms, color 220ms, bottom 220ms',
          opacity: sending ? 0.85 : 1,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <Icon name={open && !sending && !done ? 'x' : iconName} size={18} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {open && !sending && !done ? 'Cerrar' : label}
        </span>
      </button>
    </>
  );
}
