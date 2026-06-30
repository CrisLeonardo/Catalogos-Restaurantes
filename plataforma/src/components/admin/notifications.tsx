'use client';

/* ============================================================
   NOTIFICACIONES DEL ADMIN — campana del topbar
   ------------------------------------------------------------
   Dos capas:
   1. In-app (Realtime): toast + sonido mientras la pestaña está abierta.
   2. Push (Web Push/VAPID): notificación en la barra del sistema aunque
      la app esté cerrada o en segundo plano.

   Estados de la campana:
   · 'off'      → sin configurar → gris → "Activar notificaciones"
   · 'basic'    → permiso OK, sin push aún → amarillo → "Toca para activar en 2do plano"
   · 'on'       → permiso + push activo → verde → "Activo · toca para desactivar"
   · 'blocked'  → bloqueado por el navegador → rojo → instrucción
   · 'busy'     → procesando → azul
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import type { Order } from '@/types';

/* ── Chime ──────────────────────────────────────────────────── */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
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

/* Alarma fuerte para llamada al mesero: 3 ráfagas de 3 timbres agudos */
function waiterAlarm() {
  try {
    const ctx = new AudioContext();
    const totalTones = 9; // 3 ráfagas × 3 timbres
    for (let i = 0; i < totalTones; i++) {
      const burst = Math.floor(i / 3);
      const pos   = i % 3;
      const t = ctx.currentTime + burst * 1.1 + pos * 0.22;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = pos === 1 ? 1047 : 880; // sol-do-sol patrón
      osc.type = 'triangle'; // más perceptible que sine a igual volumen
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.75, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    }
  } catch {}
}

/* ── Web Push helpers ───────────────────────────────────────── */
function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  const arr     = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

async function trySubscribePush(
  reg: ServiceWorkerRegistration,
): Promise<{ sub: PushSubscription | null; errorMsg: string | null }> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    return { sub: null, errorMsg: 'VAPID_MISSING' };
  }
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    return { sub, errorMsg: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sub: null, errorMsg: msg };
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
  } catch { return false; }
}

async function deleteSub(sub: PushSubscription): Promise<void> {
  try {
    await sub.unsubscribe();
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {}
}

/* ── Tipos ──────────────────────────────────────────────────── */
type BellState = 'off' | 'basic' | 'on' | 'blocked' | 'busy';

/* ── Componente ─────────────────────────────────────────────── */
export default function AdminNotifications({
  restaurantId,
  muteChime = false,
}: {
  restaurantId: string;
  muteChime?: boolean;
}) {
  const router  = useRouter();
  const [state, setState]  = useState<BellState>('off');
  const [toast, setToast]  = useState<string | null>(null);
  const [popup, setPopup]  = useState<{ msg: string; type: 'info' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const muteRef    = useRef(muteChime);
  const swRegRef   = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => { muteRef.current = muteChime; }, [muteChime]);

  /* ── Detectar estado inicial ─────────────────────────────── */
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const perm = Notification.permission;
    if (perm === 'denied') { setState('blocked'); return; }
    if (perm !== 'granted') { setState('off'); return; }

    // Tiene permiso → verificar si ya tiene push activo.
    if (!('serviceWorker' in navigator)) { setState('basic'); return; }

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      swRegRef.current = reg;
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? 'on' : 'basic');
    }).catch(() => {
      setState('basic');
    });
  }, []);

  /* ── Realtime pedidos ────────────────────────────────────── */
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          const order = payload.new as Order;
          if (order.restaurant_id !== restaurantId) return;

          if (!muteRef.current) {
            chime();
            if (toastTimer.current) clearTimeout(toastTimer.current);
            setToast(`Nuevo pedido ${order.order_number} — ${order.customer_name}`);
            toastTimer.current = setTimeout(() => setToast(null), 5000);
            router.refresh();
          }

          // Notificación in-app de refuerzo (el servidor ya disparó el push).
          try {
            if (Notification.permission === 'granted') {
              const typeLabel = order.order_type === 'DELIVERY' ? 'A domicilio'
                : order.order_type === 'DINE_IN' ? 'Comer aquí' : 'Para llevar';
              const body = `${order.order_number} · ${order.customer_name} · ${typeLabel}`;
              const reg = swRegRef.current;
              if (reg) {
                reg.showNotification('🛎 Nuevo pedido', {
                  body, icon: '/icon-192.png', badge: '/badge.svg',
                  tag: order.id, data: { url: '/admin/pedidos' },
                });
              } else {
                const n = new Notification('🛎 Nuevo pedido', { body, tag: order.id });
                n.onclick = () => { window.focus(); router.push('/admin/pedidos'); };
              }
            }
          } catch {}
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
          const call = payload.new as { restaurant_id: string; table_number: number | null };
          if (call.restaurant_id !== restaurantId) return;

          const tableLabel = call.table_number ? ` · Mesa ${call.table_number}` : '';
          waiterAlarm();
          if (toastTimer.current) clearTimeout(toastTimer.current);
          setToast(`🔔 Llamada al mesero${tableLabel}`);
          toastTimer.current = setTimeout(() => setToast(null), 8000);

          try {
            if (Notification.permission === 'granted') {
              const reg = swRegRef.current;
              const body = `Un cliente${tableLabel} necesita atención.`;
              if (reg) {
                reg.showNotification('🔔 Llamada al mesero', {
                  body, icon: '/icon-192.png', badge: '/badge.svg',
                  data: { url: '/admin/mesas' },
                });
              } else {
                new Notification('🔔 Llamada al mesero', { body });
              }
            }
          } catch {}
        })
        .subscribe();
    })();

    return () => { cancelled = true; channel?.unsubscribe(); };
  }, [restaurantId, router]);

  /* ── Clic en la campana ──────────────────────────────────── */
  async function handleBell() {
    if (state === 'busy') return;

    /* Bloqueado ── */
    if (state === 'blocked') {
      showPopup('Las notificaciones están bloqueadas. Toca el candado en la barra del navegador y cámbialas a "Permitir".', 'error');
      return;
    }

    /* Desactivar push ── */
    if (state === 'on') {
      setState('busy');
      try {
        const reg = swRegRef.current ?? await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await deleteSub(sub);
      } catch {}
      setState('basic');
      showPopup('Push desactivado. Seguirás recibiendo avisos dentro de la app.', 'info');
      return;
    }

    /* Activar (state === 'off' o 'basic') ── */
    setState('busy');

    // 1. Pedir permiso de notificaciones.
    let perm: NotificationPermission;
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = 'default';
    }

    if (perm === 'denied') {
      setState('blocked');
      showPopup('Notificaciones bloqueadas. Actívalas en el candado de la barra del navegador.', 'error');
      return;
    }
    if (perm !== 'granted') {
      // El usuario cerró el diálogo sin elegir.
      setState('off');
      showPopup('Acepta el permiso de notificaciones para continuar.', 'info');
      return;
    }

    // 2. Registrar SW y suscribir a push.
    if (!('serviceWorker' in navigator)) {
      setState('basic');
      showPopup('Tu navegador no soporta notificaciones en segundo plano. Recibirás avisos mientras la pestaña esté abierta.', 'info');
      return;
    }

    try {
      let reg = swRegRef.current;
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
        swRegRef.current = reg;
      }
      await navigator.serviceWorker.ready;

      const { sub, errorMsg } = await trySubscribePush(reg);

      if (sub) {
        const saved = await saveSub(sub);
        if (saved) {
          setState('on');
          showPopup('¡Listo! Recibirás notificaciones en este dispositivo aunque cierres el navegador.', 'info');
          reg.showNotification('Notificaciones push activadas', {
            body: 'Te avisaremos aquí cuando entre un pedido nuevo.',
            icon: '/icon-192.png',
            badge: '/badge.svg',
          });
        } else {
          // Push suscrito pero no se pudo guardar en el servidor.
          setState('basic');
          showPopup('Error al guardar la suscripción en el servidor. Intenta de nuevo.', 'error');
        }
      } else {
        // Reportar razón específica.
        setState('basic');
        if (errorMsg === 'VAPID_MISSING') {
          showPopup('Falta la configuración VAPID en el servidor. Agrega NEXT_PUBLIC_VAPID_PUBLIC_KEY al entorno.', 'error');
        } else if (errorMsg?.includes('registration failed') || errorMsg?.includes('not https')) {
          showPopup('Las notificaciones push requieren HTTPS. Actívalo desde tu dominio principal.', 'error');
        } else {
          showPopup(`No se pudo activar push (${errorMsg ?? 'error desconocido'}). Recibirás avisos mientras la pestaña esté abierta.`, 'error');
        }
      }
    } catch (e) {
      setState('basic');
      showPopup(`Error al configurar el Service Worker: ${e instanceof Error ? e.message : 'desconocido'}`, 'error');
    }
  }

  function showPopup(msg: string, type: 'info' | 'error') {
    setPopup({ msg, type });
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => setPopup(null), 6000);
  }

  /* ── Estilos según estado ────────────────────────────────── */
  const dotColor =
    state === 'on'      ? '#4ade80' :
    state === 'basic'   ? '#facc15' :
    state === 'blocked' ? '#f87171' :
    state === 'busy'    ? '#60a5fa' :
    'rgba(255,255,255,0.25)';

  const tooltip =
    state === 'on'      ? 'Push activo — toca para desactivar' :
    state === 'basic'   ? 'Toca para activar notificaciones en segundo plano' :
    state === 'blocked' ? 'Notificaciones bloqueadas — toca para instrucciones' :
    state === 'busy'    ? 'Configurando…' :
    'Activar notificaciones de pedidos nuevos';

  return (
    <>
      {/* ── Campana ── */}
      <button
        type="button"
        onClick={handleBell}
        disabled={state === 'busy'}
        className="glass-quiet press"
        title={tooltip}
        style={{
          position: 'relative', width: 42, height: 42, borderRadius: 12, border: 'none',
          display: 'grid', placeItems: 'center', color: 'var(--u-text)',
          cursor: state === 'busy' ? 'default' : 'pointer',
          opacity: state === 'busy' ? 0.65 : 1,
        }}
      >
        <Icon name="bell" size={19} />
        <span style={{
          position: 'absolute', top: 9, right: 9, width: 8, height: 8,
          borderRadius: 99, background: dotColor, border: '2px solid var(--brand-bg)',
          transition: 'background 300ms',
        }} />
      </button>

      {/* ── Popup de estado ── */}
      {popup && (
        <div
          className="glass-solid anim-pop"
          style={{
            position: 'fixed', top: 70, right: 16, zIndex: 9999, maxWidth: 320,
            padding: '12px 15px', borderRadius: 14, fontSize: 12.5, lineHeight: 1.55,
            color: popup.type === 'error' ? '#fca5a5' : 'var(--u-text-2)',
            border: `1px solid ${popup.type === 'error' ? 'rgba(248,113,113,0.25)' : 'var(--glass-stroke)'}`,
          }}
        >
          {popup.msg}
        </div>
      )}

      {/* ── Toast pedido nuevo ── */}
      {toast && (
        <div
          className="glass anim-slide-up"
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 80, padding: '12px 20px', borderRadius: 'var(--radius-full)',
            fontSize: 13, fontWeight: 600, color: 'var(--u-text)', whiteSpace: 'nowrap',
            pointerEvents: 'none', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="bell" size={15} /> {toast}
        </div>
      )}
    </>
  );
}
