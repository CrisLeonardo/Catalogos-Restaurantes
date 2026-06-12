'use client';

/* ============================================================
   NOTIFICACIONES DEL ADMIN — campana del topbar
   ------------------------------------------------------------
   · Escucha pedidos nuevos por Supabase Realtime en TODO el
     panel (no solo en /admin/pedidos): suena, muestra toast y
     —si el dueño lo activó— notificación del sistema.
   · La campana pide/enseña el permiso de notificaciones del
     navegador; el puntito indica el estado.
   · Usa el Service Worker (sw.js) para mostrar la notificación
     en la barra del sistema del dispositivo, incluso cuando la
     pestaña está en segundo plano (funciona en móvil y desktop).
   · En /admin/pedidos el chime lo pone OrdersPanel (muteChime
     evita el doble sonido).
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import type { Order } from '@/types';

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

type Perm = 'default' | 'granted' | 'denied' | 'unsupported';

export default function AdminNotifications({
  restaurantId,
  muteChime = false,
}: {
  restaurantId: string;
  muteChime?: boolean;
}) {
  const router = useRouter();
  const [perm, setPerm] = useState<Perm>('default');
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  // El callback de realtime debe leer el valor actual sin re-suscribirse.
  const muteRef = useRef(muteChime);
  useEffect(() => { muteRef.current = muteChime; }, [muteChime]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as Perm));
  }, []);

  // Registrar el service worker para mostrar notificaciones en la barra del sistema.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        swRegRef.current = reg;
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // RLS filtra los eventos por usuario: sin el JWT de la sesión en el
      // canal realtime no llega NADA. setAuth ANTES de suscribirse.
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      // Topic único por montaje: con el doble-mount de React en dev, el
      // phx_leave del primer montaje mataría la suscripción del segundo
      // si compartieran el mismo nombre de canal.
      channel = supabase
        .channel(`orders-notify-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on(
          'postgres_changes',
          // Sin filter del lado servidor: RLS ya limita lo que cada usuario
          // recibe, y el filter server-side resultó poco fiable en realtime.
          // El restaurante se verifica aquí (importa para el Super Admin).
          { event: 'INSERT', schema: 'public', table: 'orders' },
          (payload) => {
            const order = payload.new as Order;
            if (order.restaurant_id !== restaurantId) return;
            const msg = `Nuevo pedido ${order.order_number} — ${order.customer_name}`;

            if (!muteRef.current) {
              chime();
              if (toastTimer.current) clearTimeout(toastTimer.current);
              setToast(msg);
              toastTimer.current = setTimeout(() => setToast(null), 5000);
            }

            // Notificación del sistema: usa el SW para que llegue a la barra
            // de notificaciones del dispositivo (móvil y desktop, incluso
            // con la pestaña en segundo plano).
            try {
              if (Notification.permission === 'granted') {
                const typeLabel = order.order_type === 'DELIVERY' ? 'A domicilio'
                  : order.order_type === 'DINE_IN' ? 'Comer aquí'
                  : 'Para llevar';
                const body = `${order.order_number} · ${order.customer_name} · ${typeLabel}`;
                const swReg = swRegRef.current;
                if (swReg) {
                  swReg.showNotification('🛎 Nuevo pedido', {
                    body,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: order.id,
                    data: { url: '/admin/pedidos' },
                  });
                } else {
                  // Fallback si el SW aún no está listo
                  const n = new Notification('🛎 Nuevo pedido', { body, tag: order.id });
                  n.onclick = () => { window.focus(); router.push('/admin/pedidos'); };
                }
              }
            } catch {}

            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => { cancelled = true; channel?.unsubscribe(); };
  }, [restaurantId, router]);

  async function handleBell() {
    if (perm === 'unsupported') return;
    if (perm === 'default') {
      try {
        const res = await Notification.requestPermission();
        setPerm(res as Perm);
        if (res === 'granted') {
          const swReg = swRegRef.current;
          if (swReg) {
            swReg.showNotification('Avisos activados', { body: 'Te avisaremos aquí cuando entre un pedido.', icon: '/icon-192.png' });
          } else {
            new Notification('Avisos activados', { body: 'Te avisaremos aquí cuando entre un pedido.' });
          }
          return;
        }
      } catch {}
    }
    setHint(true);
    setTimeout(() => setHint(false), 3500);
  }

  const dotColor =
    perm === 'granted' ? '#4ade80'
    : perm === 'denied' ? '#f87171'
    : 'var(--u-text-4)';

  return (
    <>
      <button
        type="button"
        onClick={handleBell}
        className="glass-quiet press"
        title={
          perm === 'granted' ? 'Avisos del sistema activados'
          : perm === 'denied' ? 'Avisos bloqueados — actívalos en el candado del navegador'
          : 'Activar avisos de pedidos nuevos'
        }
        style={{
          position: 'relative', width: 42, height: 42, borderRadius: 12, border: 'none',
          display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer',
        }}
      >
        <Icon name="bell" size={19} />
        {perm !== 'unsupported' && (
          <span style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: 99, background: dotColor, border: '2px solid var(--brand-bg)' }} />
        )}
      </button>

      {hint && (
        <div
          className="glass-solid anim-pop"
          style={{
            position: 'fixed', top: 70, right: 16, zIndex: 90, maxWidth: 280,
            padding: '12px 15px', borderRadius: 14, fontSize: 12.5, lineHeight: 1.45, color: 'var(--u-text-2)',
          }}
        >
          {perm === 'granted'
            ? 'Los avisos del sistema están activados. Te notificamos cuando entre un pedido, incluso con la pestaña en segundo plano.'
            : 'Los avisos están bloqueados. Tócalo en el candado de la barra del navegador para permitir notificaciones.'}
        </div>
      )}

      {toast && (
        <div
          className="glass anim-slide-up"
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 80, padding: '12px 20px', borderRadius: 'var(--radius-full)',
            fontSize: 13, fontWeight: 600, color: 'var(--u-text)', whiteSpace: 'nowrap',
            pointerEvents: 'none', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          🔔 {toast}
        </div>
      )}
    </>
  );
}
