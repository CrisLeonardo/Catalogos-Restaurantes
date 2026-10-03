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

   Sonidos (ver src/lib/sounds.ts): este componente NO reproduce ninguno.
   Solo aloja el panel de ajustes (volumen / repetición / probar). Cada
   sonido tiene un dueño único, para que dos componentes no puedan sonar
   encimados por el mismo evento:
   · Pedido nuevo  → new-orders-alert.tsx  (playOrderSound)
   · Llamar mesero → waiter-calls-alert.tsx (playWaiterSound)
   · Cocina        → kitchen-display.tsx    (playKitchenSound)
   Aquí solo se traducen los INSERT de Realtime a eventos DOM
   (`order-new`, `waiter-call-new`) que esos dueños escuchan, más la
   notificación del sistema (push / Tauri).

   kitchenMode=true → sin toast de llamada al mesero en la pantalla de
   cocina (por diseño: la cocina no atiende mesas).
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import { friendlyError } from '@/lib/friendly-error';
import {
  primeAudio,
  playOrderSound,
  playWaiterSound,
  loadSoundSettings,
  saveSoundSettings,
  isAudioUnlocked,
  tryAutoUnlockAudio,
  DEFAULT_SOUND_SETTINGS,
  type SoundSettings,
} from '@/lib/sounds';
import type { Order } from '@/types';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import { shortOrderNumber } from '@/lib/order-number';

/* ── Leogin Desktop (Tauri): notificaciones nativas ──────────────────────
   Dentro del webview de escritorio, Notification.requestPermission()/
   new Notification() de la Web API NO se resuelven de forma fiable (el
   WebView2 no tiene el mismo manejo de permisos que un navegador real) —
   por eso el plugin tauri-plugin-notification expone su propia API bajo
   window.__TAURI__.notification (habilitado por withGlobalTauri en
   tauri.conf.json). Cuando corre dentro de Leogin Desktop, este componente
   usa esa API en vez de la Web Notification API/Push; fuera de ahí (navegador
   normal) el flujo de abajo sigue sin cambios. */
interface TauriNotificationApi {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<'granted' | 'denied' | 'default'>;
  sendNotification: (options: { title: string; body?: string }) => void;
}
function getTauriNotification(): TauriNotificationApi | null {
  if (typeof window === 'undefined') return null;
  const t = (window as unknown as { __TAURI__?: { notification?: TauriNotificationApi } }).__TAURI__;
  return t?.notification ?? null;
}

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

/** Flag local: el usuario ya activó las notificaciones nativas de Leogin
    Desktop en este dispositivo (permite re-detectarlas en silencio al
    recargar el webview — ver "Detectar estado inicial"). */
const DESKTOP_NOTIF_KEY = 'leogin-desktop-notif-enabled';

/* ── Componente principal ────────────────────────────────────────────── */
export default function AdminNotifications({
  restaurantId,
  kitchenMode = false,
}: {
  restaurantId: string;
  kitchenMode?: boolean;
}) {
  const router = useRouter();
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());

  const [state,          setState]          = useState<BellState>('off');
  const [toast,          setToast]          = useState<string | null>(null);
  const [popup,          setPopup]          = useState<{ msg: string; type: 'info' | 'error' } | null>(null);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [soundSettings,  setSoundSettings]  = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [audioBlocked,   setAudioBlocked]   = useState(false);
  // Diferido a un efecto (no calculado directo en el render) para no
  // desalinear el HTML del servidor con el del cliente al hidratar.
  const [isTauri,        setIsTauri]        = useState(false);
  useEffect(() => { setIsTauri(Boolean(getTauriNotification())); }, []);

  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kitchenRef  = useRef(kitchenMode);
  const swRegRef    = useRef<ServiceWorkerRegistration | null>(null);

  /* El coalescer de router.refresh() que vivía aquí se fue a NewOrdersAlert,
     que ahora es el dueño único del evento "pedido nuevo" (sonido, tarjeta y
     refresco). Tener dos coalescers separados reaccionando al mismo INSERT
     disparaba dos re-renders del server component por pedido. */

  useEffect(() => { kitchenRef.current = kitchenMode;  }, [kitchenMode]);

  /* Cargar ajustes de sonido desde localStorage */
  useEffect(() => { setSoundSettings(loadSoundSettings()); }, []);

  /* Desbloquear AudioContext con el primer gesto del usuario (click, tecla o
     toque) en cualquier parte de la página. Sin un gesto previo, el navegador
     deja el AudioContext "suspended": los eventos Realtime que lleguen antes
     (típico justo tras cargar/recargar el panel) muestran el toast/tarjeta
     con normalidad pero suenan en silencio. Mientras siga bloqueado, se
     muestra un indicador junto al botón de sonido (ver JSX más abajo). */
  useEffect(() => {
    let cancelled = false;
    setAudioBlocked(!isAudioUnlocked());
    // tryAutoUnlockAudio() espera de verdad el resultado de resume() antes de
    // reportar el estado — un chequeo síncrono aquí mismo casi siempre daría
    // "bloqueado" aunque el contexto termine reanudándose solo un instante
    // después (p. ej. dentro del WebView de Leogin Desktop, que no exige un
    // gesto real). Sin este await, el punto rojo quedaba encendido en cada
    // apertura de la app aunque el sonido sonara con normalidad.
    tryAutoUnlockAudio().then((unlocked) => { if (!cancelled) setAudioBlocked(!unlocked); });
    const events: (keyof DocumentEventMap)[] = ['click', 'pointerdown', 'keydown', 'touchstart'];
    const handler = () => {
      primeAudio();
      setAudioBlocked(!isAudioUnlocked());
      events.forEach((ev) => document.removeEventListener(ev, handler));
    };
    events.forEach((ev) => document.addEventListener(ev, handler, { once: true }));
    return () => {
      cancelled = true;
      events.forEach((ev) => document.removeEventListener(ev, handler));
    };
  }, []);

  /* ── Detectar estado inicial ─────────────────────────────────────── */
  useEffect(() => {
    const tn = getTauriNotification();
    if (tn) {
      // Leogin Desktop: isPermissionGranted() del plugin puede devolver false
      // en cada nueva carga del webview AUNQUE Windows ya haya concedido el
      // permiso — por eso, tras entrar a Cocina y volver (recarga de página)
      // o reabrir la app entera, la campana aparecía apagada un momento
      // (o de plano se quedaba así) y había que "activar" de nuevo aunque las
      // notificaciones reales seguían funcionando. Si el usuario ya las
      // activó antes en este dispositivo (flag local), se muestra 'on' desde
      // el primer render — optimista — y se confirma/corrige en silencio:
      // Windows responde 'granted' al instante sin mostrar ningún diálogo.
      let enabledBefore = false;
      try { enabledBefore = localStorage.getItem(DESKTOP_NOTIF_KEY) === '1'; } catch {}
      if (enabledBefore) setState('on');

      tn.isPermissionGranted()
        .then(async (granted) => {
          if (granted) { setState('on'); return; }
          if (!enabledBefore) { setState('off'); return; }
          try {
            const perm = await tn.requestPermission();
            setState(perm === 'granted' ? 'on' : 'off');
          } catch { setState('off'); }
        })
        .catch(() => { if (!enabledBefore) setState('off'); });
      return;
    }
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

  /** Notificación de fondo (pedido nuevo / llamada al mesero): dentro de
      Leogin Desktop usa el plugin nativo de Tauri; en navegador, Push/SW si
      hay suscripción activa, si no la Notification API directa. */
  function notifyUser(
    title: string,
    body: string,
    opts?: { tag?: string; url?: string; vibrate?: number[]; requireInteraction?: boolean },
  ) {
    const tn = getTauriNotification();
    if (tn) {
      try { tn.sendNotification({ title, body }); } catch {}
      return;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const reg = swRegRef.current;
      if (reg) {
        reg.showNotification(title, {
          body, icon: '/icon-192.png', badge: '/badge.svg',
          tag: opts?.tag,
          data: opts?.url ? { url: opts.url } : undefined,
          vibrate: opts?.vibrate,
          requireInteraction: opts?.requireInteraction,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      } else {
        const n = new Notification(title, { body, tag: opts?.tag });
        if (opts?.url) n.onclick = () => { window.focus(); router.push(opts.url!); };
      }
    } catch {}
  }

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
      // Guarda contra re-entradas: unsubscribe()/removeChannel() puede disparar
      // el mismo callback de status de forma síncrona (p. ej. pasa a 'CLOSED'
      // en la misma pila que lo originó) — sin este freno, `closing` seguiría
      // siendo false y se llamaría a sí mismo indefinidamente hasta reventar
      // el stack ("Maximum call stack size exceeded").
      let closing = false;
      const ch = supabase
        .channel(`orders-notify-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)

        /* ── Pedido nuevo ── */
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          const order = payload.new as Order;
          if (order.restaurant_id !== restaurantId) return;
          /* Un pedido con mesero lo tomó una persona del local y ya salió a
             cocina: no hay nada que avisar. Hay que mirarlo AQUÍ y no por el
             estado, porque `place_order` lo inserta en NEW y lo pasa a PREP
             en un UPDATE aparte — el INSERT llega diciendo NEW, y cada
             comanda que mandaba un mesero hacía sonar «Pedido nuevo», con
             tarjeta fija que tapaba «Cobrar y cerrar mesa» hasta que alguien
             pulsara «Visto». */
          if (order.waiter_id) return;

          // Avisa a NewOrdersAlert en el mismo tick (sin esperar su propio
          // canal). NewOrdersAlert es la única fuente de verdad del SONIDO y
          // de la tarjeta de pedido nuevo: combina este evento con su canal de
          // respaldo, el sondeo de 12 s y el puente del push, y dispara el
          // audio una sola vez sin importar por cuál vía se enteró. Antes este
          // componente sonaba por su cuenta y mostraba un toast de 5 s: si el
          // socket se caía no pasaba nada, y si nadie miraba en esos 5 s el
          // pedido quedaba invisible.
          window.dispatchEvent(new CustomEvent('order-new', { detail: order }));

          // Notificación de fondo (en navegador, refuerza el push que ya
          // disparó el servidor; en Leogin Desktop es la única vía real).
          {
            const typeLabel =
              order.order_type === 'DELIVERY' ? 'A domicilio'
              : order.order_type === 'DINE_IN' ? 'Comer aquí' : 'Para llevar';
            const body = `${shortOrderNumber(order.order_number)} · ${order.customer_name} · ${typeLabel}`;
            notifyUser('🛎 Nuevo pedido', body, { tag: order.id, url: panelHref(base, '/admin/pedidos'), vibrate: [200, 100, 200] });
          }
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

          {
            const body = `Un cliente${tableLabel} necesita atención.`;
            notifyUser('🔔 Llamada al mesero', body, {
              url: panelHref(base, '/admin/mesas'),
              vibrate: [300, 100, 300, 100, 300, 200, 600],
              requireInteraction: true,
            });
          }
        })
        .subscribe((status) => {
          if (cancelled || closing) return;
          if (status === 'SUBSCRIBED') { retryDelay = 2000; return; }
          // El socket puede caerse en silencio (red inestable, laptop en
          // suspensión, JWT que tarda en refrescar) y el canal no se
          // reconecta solo — sin esto, el toast/sonido deja de llegar hasta
          // recargar la página. Reintentar con backoff exponencial (máx 30s).
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            closing = true;
            supabase.removeChannel(ch);
            retryTimer = setTimeout(() => { if (!cancelled) connect(); }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
          }
        });
      channel = ch;
    }

    (async () => {
      await ready;
      if (cancelled) return;
      connect();
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
      stopAuthSync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, router]);

  /* ── Clic en la campana ──────────────────────────────────────────── */
  async function handleBell() {
    if (state === 'busy') return;
    primeAudio();

    // Leogin Desktop: permiso nativo de Windows, sin Push/Service Worker.
    const tn = getTauriNotification();
    if (tn) {
      if (state === 'blocked') {
        showPopup('Notificaciones bloqueadas por Windows. Ve a Configuración → Sistema → Notificaciones y actívalas para Leogin.', 'error');
        return;
      }
      if (state === 'on') {
        showPopup('Las notificaciones de Windows ya están activas para Leogin.', 'info');
        return;
      }
      setState('busy');
      let perm: 'granted' | 'denied' | 'default';
      try { perm = await tn.requestPermission(); } catch { perm = 'denied'; }
      if (perm === 'granted') {
        setState('on');
        try { localStorage.setItem(DESKTOP_NOTIF_KEY, '1'); } catch {}
        showPopup('¡Listo! Windows te avisará cuando entre un pedido nuevo.', 'info');
        try { tn.sendNotification({ title: 'Notificaciones activadas', body: 'Te avisaremos aquí cuando entre un pedido nuevo.' }); } catch {}
      } else {
        setState('blocked');
        try { localStorage.removeItem(DESKTOP_NOTIF_KEY); } catch {}
        showPopup('Notificaciones bloqueadas por Windows. Ve a Configuración → Sistema → Notificaciones y actívalas para Leogin.', 'error');
      }
      return;
    }

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
      showPopup(friendlyError(e), 'error');
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
    state === 'on'      ? 'var(--c-ok)' :
    state === 'basic'   ? '#facc15' :
    state === 'blocked' ? 'var(--c-danger)' :
    state === 'busy'    ? 'var(--c-info)' :
    'color-mix(in srgb, var(--u-text) 25%, transparent)';

  const tooltip =
    state === 'on'      ? (isTauri ? 'Notificaciones de Windows activas' : 'Push activo — toca para desactivar') :
    state === 'basic'   ? 'Toca para activar notificaciones en segundo plano' :
    state === 'blocked' ? 'Notificaciones bloqueadas — toca para instrucciones' :
    state === 'busy'    ? 'Configurando…' :
    'Activar notificaciones de pedidos nuevos';

  const btnBase: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 'var(--radius-lg)', border: 'none', background: 'none',
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
          borderRadius: 'var(--radius-full)', background: dotColor, border: '2px solid var(--brand-bg)',
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
            borderRadius: 'var(--radius-full)', background: 'var(--c-danger)', border: '2px solid var(--brand-bg)',
          }} />
        )}
      </button>

      {/* ── Panel de configuración de sonidos ── */}
      {showSoundPanel && (
        <div
          className="glass-solid"
          style={{
            position: 'fixed', top: 70, right: 16, zIndex: 9999,
            width: 290, borderRadius: 'var(--radius-lg)', padding: 16,
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', padding: 2, borderRadius: 'var(--radius-sm)' }}
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
            onTest={() => { primeAudio(); setAudioBlocked(!isAudioUnlocked()); playOrderSound(soundSettings.orderVolume, soundSettings.orderRepeat, { force: true }); }}
          />

          {/* Recordatorio insistente: un solo chime se pierde con facilidad
              (encargado en la bodega, cobrando, local ruidoso). Con esto el
              aviso se repite cada ~22 s mientras el pedido siga sin atender. */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
            marginTop: 9, marginBottom: 2,
          }}>
            <input
              type="checkbox"
              checked={soundSettings.orderNag}
              onChange={e => { primeAudio(); updateSound({ orderNag: e.target.checked }); }}
              style={{ marginTop: 2, accentColor: 'var(--brand-accent, #6366f1)', cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontSize: 11, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
              Repetir el aviso hasta que alguien atienda el pedido
              <span style={{ display: 'block', color: 'var(--u-text-3)', fontSize: 11 }}>
                Se repite cada 22 s (máximo 10 veces) mientras la alerta siga en pantalla.
              </span>
            </span>
          </label>

          <div style={{ height: 1, background: 'var(--glass-stroke)', margin: '10px 0' }} />

          {/* Fila: Llamar al mesero */}
          <SoundRow
            label="🔔 Llamar al mesero"
            volume={soundSettings.waiterVolume}
            repeat={soundSettings.waiterRepeat}
            maxRepeat={3}
            onVolume={v  => updateSound({ waiterVolume:  v })}
            onRepeat={r  => updateSound({ waiterRepeat:  r })}
            onTest={() => { primeAudio(); setAudioBlocked(!isAudioUnlocked()); playWaiterSound(soundSettings.waiterVolume, soundSettings.waiterRepeat, { force: true }); }}
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
                m.playKitchenSound(soundSettings.kitchenVolume, soundSettings.kitchenRepeat, { force: true });
              });
            }}
          />

          {audioBlocked && (
            <p style={{ fontSize: 11, color: 'var(--c-danger)', marginTop: 10, marginBottom: 4, lineHeight: 1.5, fontWeight: 600 }}>
              🔇 El sonido está bloqueado por el navegador en esta pestaña. Toca cualquier botón (por ejemplo &quot;Probar&quot;) para activarlo.
            </p>
          )}
          <p style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 10, lineHeight: 1.5 }}>
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
            padding: '12px 15px', borderRadius: 'var(--radius-lg)', fontSize: 12.5, lineHeight: 1.55,
            color: popup.type === 'error' ? 'var(--c-danger)' : 'var(--u-text-2)',
            border: `1px solid ${popup.type === 'error' ? 'var(--c-danger-line)' : 'var(--glass-stroke)'}`,
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
            /* Centrado con márgenes, no con `translateX(-50%)`: la clase
               `anim-slide-up` anima `transform` con `both` y se queda con
               la última palabra — el aviso acababa con el canto izquierdo
               en el centro. Y por encima de la barra de destinos del
               teléfono, que a 24 px del suelo lo tapaba entero. */
            position: 'fixed', left: 0, right: 0, marginInline: 'auto', width: 'max-content',
            bottom: 'calc(24px + var(--adm-nav-h) + env(safe-area-inset-bottom, 0px))',
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
        <span style={{ fontSize: 11, color: 'var(--u-text-3)', minWidth: 28, textAlign: 'right' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {/* Repetición + probar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--u-text-3)' }}>Repetir:</span>
        {Array.from({ length: maxRepeat }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onRepeat(n)}
            style={{
              padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, cursor: 'pointer',
              background: repeat === n ? 'var(--c-alt-line)' : 'transparent',
              color:      repeat === n ? 'var(--u-text)' : 'var(--u-text-3)',
              border:     `1px solid ${repeat === n ? 'var(--c-alt-line)' : 'var(--glass-stroke)'}`,
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
            marginLeft: 'auto', padding: '2px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
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
