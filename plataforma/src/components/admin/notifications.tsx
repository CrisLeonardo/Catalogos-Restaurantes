'use client';

/* ============================================================
   NOTIFICACIONES DEL ADMIN — campana del topbar
   ------------------------------------------------------------
   Dos capas de notificación:
   1. In-app (Realtime): toast + sonido cuando la pestaña está abierta.
   2. Push (Web Push / VAPID): notificación en la barra del sistema
      del dispositivo aunque la app esté cerrada o en segundo plano.

   La campana agrupa ambas. Al hacer clic:
   · Si no está activado → pide permiso + suscribe push.
   · Si ya está activado → desuscribe (deja de llegar).
   · Estado claro con dot de color y tooltip descriptivo.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import type { Order } from '@/types';

/* ── Audio chime ────────────────────────────────────────────── */

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

/* ── Helpers de Web Push ────────────────────────────────────── */

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

async function getPushSubscription(
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  return reg.pushManager.getSubscription();
}

async function subscribePush(
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return null;
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } catch {
    return null;
  }
}

async function saveSub(sub: PushSubscription): Promise<boolean> {
  try {
    const json = sub.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function removeSub(sub: PushSubscription): Promise<void> {
  try {
    await sub.unsubscribe();
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {}
}

/* ── Tipos de estado ────────────────────────────────────────── */

// Estado combinado de la campana.
// 'active'    → permisos OK + suscrito a push → dot verde
// 'partial'   → permisos OK pero sin push (SW no disponible o sin VAPID) → dot amarillo
// 'inactive'  → sin activar → dot gris
// 'denied'    → permisos bloqueados → dot rojo
// 'pending'   → procesando

type BellState = 'active' | 'partial' | 'inactive' | 'denied' | 'pending';

/* ── Componente principal ───────────────────────────────────── */

export default function AdminNotifications({
  restaurantId,
  muteChime = false,
}: {
  restaurantId: string;
  muteChime?: boolean;
}) {
  const router = useRouter();
  const [bellState, setBellState] = useState<BellState>('inactive');
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const muteRef = useRef(muteChime);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => { muteRef.current = muteChime; }, [muteChime]);

  // ── Inicialización ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (typeof Notification === 'undefined') return;

      const perm = Notification.permission;
      if (perm === 'denied') { setBellState('denied'); return; }
      if (perm !== 'granted') { setBellState('inactive'); return; }

      // Permiso concedido: comprobar si hay push activo.
      if (!('serviceWorker' in navigator)) { setBellState('partial'); return; }

      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        swRegRef.current = reg;
        const sub = await getPushSubscription(reg);
        setBellState(sub ? 'active' : 'partial');
      } catch {
        setBellState('partial');
      }
    })();
  }, []);

  // ── Realtime: escucha pedidos nuevos ────────────────────────
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      channel = supabase
        .channel(`orders-notify-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'orders' },
          (payload) => {
            const order = payload.new as Order;
            if (order.restaurant_id !== restaurantId) return;
            const msg = `Nuevo pedido ${order.order_number} — ${order.customer_name}`;

            // Toast + sonido (siempre, aunque las notificaciones push estén activas).
            if (!muteRef.current) {
              chime();
              if (toastTimer.current) clearTimeout(toastTimer.current);
              setToast(msg);
              toastTimer.current = setTimeout(() => setToast(null), 5000);
            }

            // Notificación in-app como refuerzo (si la pestaña está activa).
            // La notificación push ya la disparó el servidor cuando creó el pedido.
            try {
              if (Notification.permission === 'granted') {
                const typeLabel =
                  order.order_type === 'DELIVERY' ? 'A domicilio' :
                  order.order_type === 'DINE_IN'  ? 'Comer aquí'  :
                  'Para llevar';
                const body = `${order.order_number} · ${order.customer_name} · ${typeLabel}`;
                const reg = swRegRef.current;
                if (reg) {
                  reg.showNotification('🛎 Nuevo pedido', {
                    body, icon: '/icon-192.png', badge: '/icon-192.png', tag: order.id,
                    data: { url: '/admin/pedidos' },
                  });
                } else {
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

  // ── Clic en la campana ──────────────────────────────────────
  async function handleBell() {
    if (bellState === 'pending' || bellState === 'denied') {
      showHint(
        bellState === 'denied'
          ? 'Notificaciones bloqueadas. Actívalas en el candado de la barra del navegador.'
          : '',
      );
      return;
    }

    if (bellState === 'active') {
      // Desuscribir.
      setBellState('pending');
      const reg = swRegRef.current;
      if (reg) {
        const sub = await getPushSubscription(reg);
        if (sub) await removeSub(sub);
      }
      setBellState('inactive');
      showHint('Notificaciones desactivadas. Ya no recibirás avisos en este dispositivo.');
      return;
    }

    // Activar: pedir permiso si hace falta, luego suscribir.
    setBellState('pending');

    const perm = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
    if (perm !== 'granted') {
      setBellState('denied');
      showHint('Notificaciones bloqueadas. Actívalas en el candado de la barra del navegador.');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      // Permisos OK pero sin SW (navegador antiguo): modo parcial.
      setBellState('partial');
      showHint('Recibirás avisos cuando la pestaña esté abierta, pero no en segundo plano.');
      return;
    }

    try {
      let reg = swRegRef.current;
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
        swRegRef.current = reg;
      }
      // Esperar a que el SW esté activo.
      await navigator.serviceWorker.ready;

      const sub = await subscribePush(reg);
      if (sub) {
        await saveSub(sub);
        setBellState('active');
        showHint('¡Listo! Recibirás notificaciones en este dispositivo aunque cierres el navegador.');
        // Notificación de confirmación.
        reg.showNotification('Notificaciones activadas', {
          body: 'Te avisaremos aquí cuando entre un pedido nuevo.',
          icon: '/icon-192.png',
        });
      } else {
        // Push no disponible (HTTP, modo privado, etc.).
        setBellState('partial');
        showHint('Recibirás avisos cuando la pestaña esté abierta. Para avisos en segundo plano, abre desde HTTPS.');
      }
    } catch {
      setBellState('partial');
      showHint('Recibirás avisos cuando la pestaña esté abierta.');
    }
  }

  function showHint(msg: string) {
    if (!msg) return;
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 4000);
  }

  // ── Colores y etiquetas ─────────────────────────────────────
  const dotColor =
    bellState === 'active'   ? '#4ade80' :
    bellState === 'partial'  ? '#facc15' :
    bellState === 'denied'   ? '#f87171' :
    bellState === 'pending'  ? '#60a5fa' :
    'var(--u-text-4)';

  const tooltip =
    bellState === 'active'  ? 'Notificaciones activas — toca para desactivar' :
    bellState === 'partial' ? 'Avisos básicos activos (push no disponible)' :
    bellState === 'denied'  ? 'Notificaciones bloqueadas en el navegador' :
    bellState === 'pending' ? 'Procesando…' :
    'Activar notificaciones de pedidos nuevos';

  return (
    <>
      <button
        type="button"
        onClick={handleBell}
        disabled={bellState === 'pending'}
        className="glass-quiet press"
        title={tooltip}
        style={{
          position: 'relative', width: 42, height: 42, borderRadius: 12, border: 'none',
          display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: bellState === 'pending' ? 'default' : 'pointer',
          opacity: bellState === 'pending' ? 0.6 : 1,
        }}
      >
        <Icon name={bellState === 'active' ? 'bell' : 'bell'} size={19} />
        <span style={{
          position: 'absolute', top: 9, right: 9, width: 8, height: 8,
          borderRadius: 99, background: dotColor, border: '2px solid var(--brand-bg)',
          transition: 'background 300ms',
        }} />
      </button>

      {/* Tooltip de estado ── */}
      {hint && (
        <div
          className="glass-solid anim-pop"
          style={{
            position: 'fixed', top: 70, right: 16, zIndex: 90, maxWidth: 300,
            padding: '12px 15px', borderRadius: 14, fontSize: 12.5, lineHeight: 1.5,
            color: 'var(--u-text-2)',
          }}
        >
          {hint}
        </div>
      )}

      {/* Toast de pedido nuevo ── */}
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
