'use client';

/* ============================================================
   NOTIFICACIONES DEL ADMIN — campana + configuración de sonido
   ------------------------------------------------------------
   Dos capas:
   1. In-app (Realtime): toast + sonido mientras la pestaña está abierta.
   2. Push (Web Push/VAPID): notificación en la barra del sistema aunque
      la app esté cerrada o en segundo plano.

   Estados de la campana:
   · 'off'      → sin configurar → gris
   · 'basic'    → permiso OK, sin push aún → amarillo
   · 'on'       → permiso + push activo → verde
   · 'blocked'  → bloqueado por el navegador → rojo
   · 'busy'     → procesando → azul

   Sonidos (ver src/lib/sounds.ts):
   · Pedido nuevo  → playOrderSound   (sine ascendente, do-mi-sol)
   · Llamar mesero → playWaiterSound  (triangle urgente, 3 ráfagas)
   · Cocina        → playKitchenSound (sawtooth descendente ding-dong)

   kitchenMode=true → silencia pedidos y llamadas de mesero en la
   pantalla de cocina; kitchen-display.tsx maneja su propio sonido.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import {
  primeAudio,
  playOrderSound,
  playWaiterSound,
  loadSoundSettings,
  saveSoundSettings,
  isAudioUnlocked,
  DEFAULT_SOUND_SETTINGS,
  type SoundSettings,
} from '@/lib/sounds';
import type { Order } from '@/types';

/* ── Web Push helpers ────────────────────────────────────────────────── */
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
  if (!vapidKey) return { sub: null, errorMsg: 'VAPID_MISSING' };
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    return { sub, errorMsg: null };
  } catch (e) {
    return { sub: null, errorMsg: e instanceof Error ? e.message : String(e) };
  }
}

async function saveSub(
  sub: PushSubscription,
  restaurantId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const json = sub.toJSON();
    const res  = await fetch('/api/push/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId,
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}

async function deleteSub(sub: PushSubscription): Promise<void> {
  try {
    await sub.unsubscribe();
    await fetch('/api/push/subscribe', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {}
}

/* ── Tipos ───────────────────────────────────────────────────────────── */
type BellState = 'off' | 'basic' | 'on' | 'blocked' | 'busy';

/* ── Componente principal ────────────────────────────────────────────── */
export default function AdminNotifications({
  restaurantId,
  muteChime   = false,
  kitchenMode = false,
}: {
  restaurantId: string;
  muteChime?:   boolean;
  kitchenMode?: boolean;
}) {
  const router = useRouter();

  const [state,          setState]          = useState<BellState>('off');
  const [toast,          setToast]          = useState<string | null>(null);
  const [popup,          setPopup]          = useState<{ msg: string; type: 'info' | 'error' } | null>(null);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [soundSettings,  setSoundSettings]  = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [audioBlocked,   setAudioBlocked]   = useState(false);

  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const muteRef     = useRef(muteChime);
  const kitchenRef  = useRef(kitchenMode);
  const settingsRef = useRef<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const swRegRef    = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => { muteRef.current    = muteChime;    }, [muteChime]);
  useEffect(() => { kitchenRef.current = kitchenMode;  }, [kitchenMode]);
  useEffect(() => { settingsRef.current = soundSettings; }, [soundSettings]);

  /* Cargar ajustes de sonido desde localStorage */
  useEffect(() => { setSoundSettings(loadSoundSettings()); }, []);

  /* Desbloquear AudioContext con el primer gesto del usuario (click, tecla o
     toque) en cualquier parte de la página. Sin un gesto previo, el navegador
     deja el AudioContext "suspended": los eventos Realtime que lleguen antes
     (típico justo tras cargar/recargar el panel) muestran el toast/tarjeta
     con normalidad pero suenan en silencio. Mientras siga bloqueado, se
     muestra un indicador junto al botón de sonido (ver JSX más abajo). */
  useEffect(() => {
    setAudioBlocked(!isAudioUnlocked());
    const events: (keyof DocumentEventMap)[] = ['click', 'pointerdown', 'keydown', 'touchstart'];
    const handler = () => {
      primeAudio();
      setAudioBlocked(!isAudioUnlocked());
      events.forEach((ev) => document.removeEventListener(ev, handler));
    };
    events.forEach((ev) => document.addEventListener(ev, handler, { once: true }));
    return () => events.forEach((ev) => document.removeEventListener(ev, handler));
  }, []);

  /* ── Detectar estado inicial ─────────────────────────────────────── */
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const perm = Notification.permission;
    if (perm === 'denied')   { setState('blocked'); return; }
    if (perm !== 'granted')  { setState('off');     return; }

    if (!('serviceWorker' in navigator)) { setState('basic'); return; }

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      swRegRef.current = reg;
      const existing   = await reg.pushManager.getSubscription();
      setState(existing ? 'on' : 'basic');
    }).catch(() => setState('basic'));
  }, []);

  /* ── Realtime: pedidos y llamadas al mesero ──────────────────────── */
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000;
    const { ready, stop: stopAuthSync } = syncRealtimeAuth(supabase);

    function connect() {
      channel = supabase
        .channel(`orders-notify-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)

        /* ── Pedido nuevo ── */
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          const order = payload.new as Order;
          if (order.restaurant_id !== restaurantId) return;

          // En modo cocina y en modo pedidos-en-vivo el sonido/toast lo
          // maneja el componente específico (kitchen-display / orders-panel).
          if (!muteRef.current && !kitchenRef.current) {
            const s = settingsRef.current;
            playOrderSound(s.orderVolume, s.orderRepeat);
            if (toastTimer.current) clearTimeout(toastTimer.current);
            setToast(`🛎 Pedido ${order.order_number} — ${order.customer_name}`);
            toastTimer.current = setTimeout(() => setToast(null), 5000);
            router.refresh();
          }

          // Notificación in-app de refuerzo (el servidor ya disparó el push).
          try {
            if (Notification.permission === 'granted') {
              const typeLabel =
                order.order_type === 'DELIVERY' ? 'A domicilio'
                : order.order_type === 'DINE_IN' ? 'Comer aquí' : 'Para llevar';
              const body = `${order.order_number} · ${order.customer_name} · ${typeLabel}`;
              const reg  = swRegRef.current;
              if (reg) {
                reg.showNotification('🛎 Nuevo pedido', {
                  body, icon: '/icon-192.png', badge: '/badge.svg',
                  tag: order.id, data: { url: '/admin/pedidos' },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  vibrate: [200, 100, 200],
                } as any);
              } else {
                const n = new Notification('🛎 Nuevo pedido', { body, tag: order.id });
                n.onclick = () => { window.focus(); router.push('/admin/pedidos'); };
              }
            }
          } catch {}
        })

        /* ── Llamada al mesero ── */
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
          const call = payload.new as {
            id: string; restaurant_id: string; table_number: number | null;
            created_at: string; resolved_at: string | null;
          };
          if (call.restaurant_id !== restaurantId || call.resolved_at) return;

          // Avisa al WaiterCallsAlert en el mismo tick (sin esperar su propio canal).
          // WaiterCallsAlert es la única fuente de verdad para el SONIDO de mesero:
          // combina este evento con su propio canal de respaldo y el polling de 20s,
          // así que dispara el audio una sola vez sin importar por cuál vía se enteró.
          window.dispatchEvent(new CustomEvent('waiter-call-new', { detail: call }));

          // En modo cocina NO llegan alertas de llamada al mesero.
          if (kitchenRef.current) return;

          const tableLabel = call.table_number ? ` · Mesa ${call.table_number}` : '';

          if (toastTimer.current) clearTimeout(toastTimer.current);
          setToast(`🔔 Llamada al mesero${tableLabel}`);
          toastTimer.current = setTimeout(() => setToast(null), 8000);

          try {
            if (Notification.permission === 'granted') {
              const reg  = swRegRef.current;
              const body = `Un cliente${tableLabel} necesita atención.`;
              if (reg) {
                reg.showNotification('🔔 Llamada al mesero', {
                  body, icon: '/icon-192.png', badge: '/badge.svg',
                  data: { url: '/admin/mesas' },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  vibrate: [300, 100, 300, 100, 300, 200, 600],
                  requireInteraction: true,
                } as any);
              } else {
                new Notification('🔔 Llamada al mesero', { body });
              }
            }
          } catch {}
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') { retryDelay = 2000; return; }
          // El socket puede caerse en silencio (red inestable, laptop en
          // suspensión, JWT que tarda en refrescar) y el canal no se
          // reconecta solo — sin esto, el toast/sonido deja de llegar hasta
          // recargar la página. Reintentar con backoff exponencial (máx 30s).
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            channel?.unsubscribe();
            retryTimer = setTimeout(() => { if (!cancelled) connect(); }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
          }
        });
    }

    (async () => {
      await ready;
      if (cancelled) return;
      connect();
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      channel?.unsubscribe();
      stopAuthSync();
    };
  }, [restaurantId, router]);

  /* ── Clic en la campana ──────────────────────────────────────────── */
  async function handleBell() {
    if (state === 'busy') return;
    primeAudio();

    if (state === 'blocked') {
      showPopup('Las notificaciones están bloqueadas. Toca el candado en la barra del navegador y cámbialas a "Permitir".', 'error');
      return;
    }

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

    setState('busy');

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
      setState('off');
      showPopup('Acepta el permiso de notificaciones para continuar.', 'info');
      return;
    }

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
        const result = await saveSub(sub, restaurantId);
        if (result.ok) {
          setState('on');
          showPopup('¡Listo! Recibirás notificaciones en este dispositivo aunque cierres el navegador.', 'info');
          reg.showNotification('Notificaciones push activadas', {
            body: 'Te avisaremos aquí cuando entre un pedido nuevo.',
            icon: '/icon-192.png',
            badge: '/badge.svg',
          });
        } else {
          setState('basic');
          showPopup(`Error al guardar la suscripción: ${result.error ?? 'intenta de nuevo'}.`, 'error');
        }
      } else {
        setState('basic');
        if (errorMsg === 'VAPID_MISSING') {
          showPopup('Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el servidor.', 'error');
        } else if (errorMsg?.includes('registration failed') || errorMsg?.includes('not https')) {
          showPopup('Las notificaciones push requieren HTTPS en el dominio principal.', 'error');
        } else {
          showPopup(`No se pudo activar push: ${errorMsg ?? 'error desconocido'}. Recibirás avisos con la pestaña abierta.`, 'error');
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
    popupTimer.current = setTimeout(() => setPopup(null), 8000);
  }

  function updateSound(partial: Partial<SoundSettings>) {
    setSoundSettings(prev => {
      const next = { ...prev, ...partial };
      saveSoundSettings(next);
      return next;
    });
  }

  /* ── Estilos según estado ────────────────────────────────────────── */
  const dotColor =
    state === 'on'      ? '#4ade80' :
    state === 'basic'   ? '#facc15' :
    state === 'blocked' ? '#f87171' :
    state === 'busy'    ? '#60a5fa' :
    'color-mix(in srgb, var(--u-text) 25%, transparent)';

  const tooltip =
    state === 'on'      ? 'Push activo — toca para desactivar' :
    state === 'basic'   ? 'Toca para activar notificaciones en segundo plano' :
    state === 'blocked' ? 'Notificaciones bloqueadas — toca para instrucciones' :
    state === 'busy'    ? 'Configurando…' :
    'Activar notificaciones de pedidos nuevos';

  const btnBase: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 12, border: 'none', background: 'none',
    display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer',
  };

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
          ...btnBase, position: 'relative',
          opacity: state === 'busy' ? 0.65 : 1,
          cursor:  state === 'busy' ? 'default' : 'pointer',
        }}
      >
        <Icon name="bell" size={19} />
        <span style={{
          position: 'absolute', top: 9, right: 9, width: 8, height: 8,
          borderRadius: 99, background: dotColor, border: '2px solid var(--brand-bg)',
          transition: 'background 300ms',
        }} />
      </button>

      {/* ── Botón de configuración de sonido ── */}
      <button
        type="button"
        onClick={() => { primeAudio(); setAudioBlocked(!isAudioUnlocked()); setShowSoundPanel(v => !v); }}
        className="glass-quiet press"
        title={audioBlocked ? 'El sonido está bloqueado por el navegador — toca aquí para activarlo' : 'Configurar sonidos de notificación'}
        style={{
          ...btnBase, position: 'relative',
          opacity: showSoundPanel ? 1 : 0.65,
          color:   showSoundPanel ? 'var(--u-text)' : 'var(--u-text-3)',
        }}
      >
        <Icon name="volume" size={17} />
        {audioBlocked && (
          <span style={{
            position: 'absolute', top: 9, right: 9, width: 8, height: 8,
            borderRadius: 99, background: '#f87171', border: '2px solid var(--brand-bg)',
          }} />
        )}
      </button>

      {/* ── Panel de configuración de sonidos ── */}
      {showSoundPanel && (
        <div
          className="glass-solid"
          style={{
            position: 'fixed', top: 70, right: 16, zIndex: 9999,
            width: 290, borderRadius: 16, padding: 16,
            border: '1px solid var(--glass-stroke)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {/* Cabecera */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
              Sonidos de notificación
            </span>
            <button
              type="button"
              onClick={() => setShowSoundPanel(false)}
              className="press"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', padding: 2, borderRadius: 6 }}
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          {/* Fila: Pedidos nuevos */}
          <SoundRow
            label="🛎 Pedidos nuevos"
            volume={soundSettings.orderVolume}
            repeat={soundSettings.orderRepeat}
            maxRepeat={3}
            onVolume={v  => updateSound({ orderVolume:  v })}
            onRepeat={r  => updateSound({ orderRepeat:  r })}
            onTest={() => { primeAudio(); setAudioBlocked(!isAudioUnlocked()); playOrderSound(soundSettings.orderVolume, soundSettings.orderRepeat); }}
          />

          <div style={{ height: 1, background: 'var(--glass-stroke)', margin: '10px 0' }} />

          {/* Fila: Llamar al mesero */}
          <SoundRow
            label="🔔 Llamar al mesero"
            volume={soundSettings.waiterVolume}
            repeat={soundSettings.waiterRepeat}
            maxRepeat={3}
            onVolume={v  => updateSound({ waiterVolume:  v })}
            onRepeat={r  => updateSound({ waiterRepeat:  r })}
            onTest={() => { primeAudio(); setAudioBlocked(!isAudioUnlocked()); playWaiterSound(soundSettings.waiterVolume, soundSettings.waiterRepeat); }}
          />

          <div style={{ height: 1, background: 'var(--glass-stroke)', margin: '10px 0' }} />

          {/* Fila: Cocina */}
          <SoundRow
            label="👨‍🍳 Cocina"
            volume={soundSettings.kitchenVolume}
            repeat={soundSettings.kitchenRepeat}
            maxRepeat={2}
            onVolume={v  => updateSound({ kitchenVolume:  v })}
            onRepeat={r  => updateSound({ kitchenRepeat:  r })}
            onTest={() => {
              // Importar dinámicamente para no añadir el símbolo al bundle de cocina
              import('@/lib/sounds').then(m => {
                primeAudio();
                setAudioBlocked(!m.isAudioUnlocked());
                m.playKitchenSound(soundSettings.kitchenVolume, soundSettings.kitchenRepeat);
              });
            }}
          />

          {audioBlocked && (
            <p style={{ fontSize: 11, color: '#fca5a5', marginTop: 10, marginBottom: 4, lineHeight: 1.5, fontWeight: 600 }}>
              🔇 El sonido está bloqueado por el navegador en esta pestaña. Toca cualquier botón (por ejemplo &quot;Probar&quot;) para activarlo.
            </p>
          )}
          <p style={{ fontSize: 10.5, color: 'var(--u-text-3)', marginTop: 10, lineHeight: 1.5 }}>
            Los ajustes se guardan automáticamente en este dispositivo.
          </p>
        </div>
      )}

      {/* ── Popup de estado (errores / info) ── */}
      {popup && (
        <div
          className="glass-solid anim-pop"
          style={{
            position: 'fixed', top: 70, right: showSoundPanel ? 322 : 16,
            zIndex: 9998, maxWidth: 320,
            padding: '12px 15px', borderRadius: 14, fontSize: 12.5, lineHeight: 1.55,
            color: popup.type === 'error' ? '#fca5a5' : 'var(--u-text-2)',
            border: `1px solid ${popup.type === 'error' ? 'rgba(248,113,113,0.25)' : 'var(--glass-stroke)'}`,
            transition: 'right 200ms',
          }}
        >
          {popup.msg}
        </div>
      )}

      {/* ── Toast pedido/mesero ── */}
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
          {toast}
        </div>
      )}
    </>
  );
}

/* ── Sub-componente: fila de ajuste de sonido ───────────────────────── */
function SoundRow({
  label, volume, repeat, maxRepeat, onVolume, onRepeat, onTest,
}: {
  label:    string;
  volume:   number;
  repeat:   number;
  maxRepeat: number;
  onVolume: (v: number) => void;
  onRepeat: (r: number) => void;
  onTest:   () => void;
}) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--u-text-2)', marginBottom: 7 }}>
        {label}
      </div>

      {/* Slider de volumen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Icon name="volume" size={12} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
        <input
          type="range"
          min={0} max={100}
          value={Math.round(volume * 100)}
          onChange={e => onVolume(Number(e.target.value) / 100)}
          style={{ flex: 1, accentColor: 'var(--brand-accent, #6366f1)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 10.5, color: 'var(--u-text-3)', minWidth: 28, textAlign: 'right' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {/* Repetición + probar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10.5, color: 'var(--u-text-3)' }}>Repetir:</span>
        {Array.from({ length: maxRepeat }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onRepeat(n)}
            style={{
              padding: '2px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: repeat === n ? 'rgba(99,102,241,0.25)' : 'transparent',
              color:      repeat === n ? 'var(--u-text)' : 'var(--u-text-3)',
              border:     `1px solid ${repeat === n ? 'rgba(99,102,241,0.5)' : 'var(--glass-stroke)'}`,
              fontWeight: repeat === n ? 700 : 400,
            }}
          >
            {n}×
          </button>
        ))}
        <button
          type="button"
          onClick={onTest}
          style={{
            marginLeft: 'auto', padding: '2px 10px', borderRadius: 6, fontSize: 10.5,
            cursor: 'pointer', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
            color: 'var(--u-text-2)', border: '1px solid var(--glass-stroke)',
          }}
        >
          ▶ Probar
        </button>
      </div>
    </div>
  );
}
