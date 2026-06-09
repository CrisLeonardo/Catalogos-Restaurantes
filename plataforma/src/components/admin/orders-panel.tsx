'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OrderCard from '@/components/admin/order-card';
import type { OrderWithItems } from '@/lib/db/orders';
import type { Order } from '@/types';

interface Props {
  initialOrders: OrderWithItems[];
  restaurantId:  string;
}

function chime() {
  try {
    const ctx = new AudioContext();
    const notes = [660, 880, 1100];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {}
}

export default function OrdersPanel({ initialOrders, restaurantId }: Props) {
  const router = useRouter();
  const [toast,  setToast]  = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // initialOrders se actualiza desde el servidor cada vez que router.refresh() se llama
  const orders = initialOrders;

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) return;

    const supabase = createClient();
    const channel  = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const newOrder = payload.new as Order;
          chime();
          showToast(`Nuevo pedido ${newOrder.order_number} — ${newOrder.customer_name}`);
          // Recargar datos del servidor para obtener el pedido con sus ítems completos
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          // router.refresh() trae los datos actualizados del servidor
          router.refresh();
        },
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [restaurantId, router]);

  const active    = orders.filter((o) => !['DELIVERED', 'CANCEL'].includes(o.status));
  const completed = orders.filter((o) =>  ['DELIVERED', 'CANCEL'].includes(o.status));

  return (
    <>
      {/* Toast de nuevo pedido */}
      {toast && (
        <div
          className="glass anim-slide-up"
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 80, padding: '12px 20px',
            borderRadius: 'var(--radius-full)',
            fontSize: 13, fontWeight: 600,
            color: 'var(--u-text)', whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          🔔 {toast}
        </div>
      )}

      {/* Pedidos activos */}
      {active.length === 0 ? (
        <div
          style={{
            textAlign: 'center', padding: '60px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{ fontSize: 48 }}>📋</div>
          <p className="t-mute" style={{ fontSize: 14 }}>
            No hay pedidos activos.
          </p>
          <p className="t-mute" style={{ fontSize: 12 }}>
            Los nuevos pedidos aparecerán aquí en tiempo real.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {active.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {/* Historial */}
      {completed.length > 0 && (
        <>
          <h3
            style={{
              fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--u-text-3)', marginBottom: 12,
            }}
          >
            Historial hoy
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completed.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
