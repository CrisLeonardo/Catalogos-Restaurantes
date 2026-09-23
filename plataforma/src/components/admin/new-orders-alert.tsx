'use client';

/* ============================================================
   PEDIDOS NUEVOS — alerta persistente y accionable
   ------------------------------------------------------------
   Se monta en el AdminShell, así que se ve en TODO el panel: el
   encargado no tiene que estar mirando /admin/pedidos para
   enterarse de que entró un pedido.

   Por qué existe (antes esto no estaba):
   · El aviso de pedido nuevo era un toast de 5 s + un chime, y
     dependía de UN SOLO INSERT de Realtime. Si el socket estaba
     caído (red inestable, laptop que despertó de suspensión, JWT
     vencido) no sonaba nada y no quedaba ningún rastro visual.
     Si nadie estaba viendo la pantalla en esos 5 s, el pedido
     quedaba invisible.
   · Ahora se entera por CUATRO vías y es la ÚNICA fuente del
     sonido de pedido (dedup por id, igual que WaiterCallsAlert
     con las llamadas al mesero):
       1. Evento DOM `order-new` que dispara notifications.tsx en
          el mismo tick que recibe el INSERT de Realtime.
       2. Su propio canal Realtime de respaldo.
       3. Sondeo cada 12 s (getPendingNewOrders) — funciona con el
          socket muerto.
       4. postMessage del service worker cuando llega el push
          (rápido y ajeno al socket).
   · La tarjeta NO se va sola: se queda hasta que alguien pulsa
     "Ver pedido" o "Visto". Y mientras haya alguna sin atender el
     título de la pestaña parpadea, para que se note aunque el
     panel esté en otra pestaña o minimizado.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import {
  primeAudio,
  playOrderSound,
  loadSoundSettings,
  claimSoundEvent,
  startOrderNag,
  stopOrderNag,
} from '@/lib/sounds';
import { getPendingNewOrders, type PendingNewOrder } from '@/lib/actions/orders';
import type { Order } from '@/types';
import { panelBaseFrom, panelHref, internalPanelPath } from '@/lib/panel-links';

/** Pedidos ya descartados en esta pestaña — sobrevive a la navegación entre
    pantallas del panel (el shell se remonta) para que una tarjeta que ya
    marcaron como vista no reaparezca al cambiar de página. */
const DISMISSED_KEY = 'leogin-orders-dismissed-v1';

/** Canal para que "Visto" en una pestaña limpie la tarjeta en las demás. */
const ACK_CHANNEL = 'leogin-orders-ack';

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function saveDismissed(ids: Set<string>): void {
  try {
    // Tope: en un turno largo la lista crecería sin límite y solo importan
    // las últimas (las viejas ya no las devuelve el servidor).
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {}
}

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min === 1) return 'hace 1 min';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

function typeLabel(t: PendingNewOrder['order_type'], address: string | null): string {
  if (t === 'DELIVERY') return 'A domicilio';
  if (t === 'DINE_IN')  return address ?? 'Comer aquí';
  return 'Para llevar';
}

export default function NewOrdersAlert({
  restaurantId,
  muteChime = false,
  showCards = true,
}: {
  restaurantId: string;
  /** true en modo cocina — la pantalla de cocina tiene su propio aviso. */
  muteChime?: boolean;
  /**
   * false donde el pedido nuevo YA está en pantalla (el tablero de
   * pedidos, la pantalla de cocina). Apaga la TARJETA, no el
   * componente: este es la única fuente del sonido de pedido y de su
   * refresco (ver la cabecera).
   */
  showCards?: boolean;
}) {
  const router   = useRouter();
  const pathname = usePathname();

  const [orders,  setOrders]  = useState<PendingNewOrder[]>([]);
  const [, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const muteRef = useRef(muteChime);
  useEffect(() => { muteRef.current = muteChime; }, [muteChime]);

  // En /admin/pedidos el propio panel ya refresca los datos del server
  // component; refrescar también desde aquí duplicaría el re-render.
  // `internalPanelPath` traduce `/panel/<slug>/pedidos` a `/admin/pedidos`,
  // asi que esta comparacion vale en los dos origenes.
  const isOrdersPage = internalPanelPath(pathname).startsWith('/admin/pedidos');
  const isOrdersPageRef = useRef(isOrdersPage);
  useEffect(() => { isOrdersPageRef.current = isOrdersPage; }, [isOrdersPage]);

  const dismissedRef = useRef<Set<string>>(new Set());
  useEffect(() => { dismissedRef.current = loadDismissed(); }, []);

  /* IDs por los que ya se decidió si suena o no. */
  const seenIds = useRef<Set<string>>(new Set());
  /* ¿Ya llegó el primer listado del servidor? Lo que venga por sondeo antes de
     eso es historial (pedidos que ya estaban sin atender al abrir la pantalla). */
  const snapshotDone = useRef(false);

  /* Coalescer de router.refresh(): una ráfaga de pedidos (p. ej. 15 encolados
     offline que sincronizan de golpe) no debe disparar un re-render completo
     del server component por pedido. Mismo patrón que orders-panel.tsx. */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefresh  = useRef(0);
  const refreshSoon = useCallback(() => {
    if (isOrdersPageRef.current) return;
    if (refreshTimer.current) return;
    const wait = Math.max(0, 2500 - (Date.now() - lastRefresh.current));
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      lastRefresh.current = Date.now();
      router.refresh();
    }, wait);
  }, [router]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  /** Suena UNA vez por pedido, sin importar por cuál de las cuatro vías se
      enteró primero. claimSoundEvent además evita que dos pestañas abiertas
      del panel suenen desfasadas por el mismo pedido. */
  const noteNew = useCallback((id: string, live: boolean) => {
    if (seenIds.current.has(id)) return;
    seenIds.current.add(id);
    // `live` = vino de un INSERT de Realtime, o sea que la fila se acaba de
    // crear: eso suena siempre, sin depender del reloj del navegador ni de que
    // el primer listado del servidor haya llegado ya (un pedido que entra en
    // los primeros milisegundos tras abrir la pantalla también tiene que
    // sonar). Lo que llega por sondeo antes del primer listado es historial:
    // se muestra en tarjeta pero no suena, si no navegar entre pantallas del
    // panel dispararía un chime retroactivo por cada pedido pendiente.
    if (!live && !snapshotDone.current) return;
    if (muteRef.current) return;
    if (!claimSoundEvent('order', id)) return;
    primeAudio();
    const s = loadSoundSettings();
    playOrderSound(s.orderVolume, s.orderRepeat);
  }, []);

  const addOrder = useCallback((o: PendingNewOrder, live: boolean) => {
    if (dismissedRef.current.has(o.id)) return;
    noteNew(o.id, live);
    setOrders((prev) => (prev.some((x) => x.id === o.id) ? prev : [...prev, o]));
  }, [noteNew]);

  /* Vía 3 — sondeo de respaldo. Es lo que hace que el aviso funcione con el
     socket de Realtime caído, que es el caso en el que antes no pasaba
     absolutamente nada. */
  const refresh = useCallback(async () => {
    /* Sin red el sondeo falla, y es justo cuando más corre (cada 12 s con
       el socket caído). Sin capturarlo, cada intento dejaba un «Failed to
       fetch» sin atender en la consola. Se deja como estaba y se reintenta
       en el siguiente tic. */
    let list: PendingNewOrder[];
    try { list = await getPendingNewOrders(restaurantId); } catch { return; }
    list.forEach((o) => addOrder(o, false));
    // Después de procesar el primer lote: de aquí en adelante lo que aparezca
    // por sondeo SÍ es un pedido nuevo (y suena) — es la vía que cubre el caso
    // de Realtime caído, en el que antes no pasaba absolutamente nada.
    snapshotDone.current = true;
  }, [restaurantId, addOrder]);

  useEffect(() => { refresh(); }, [refresh]);

  /* Cadencia del sondeo según esté vivo o no el socket de Realtime (vía 2).
     Esta alerta se monta en el AdminShell, o sea en TODAS las pantallas del
     panel: preguntar cada 12 s de por vida era una consulta cada 12 s por
     pestaña abierta y por restaurante, las 24 horas, casi siempre para
     enterarse de nada — porque con Realtime en pie el pedido ya había
     entrado por la vía 2 mucho antes.
     Con el canal suscrito baja a 60 s, y ahí se queda como red de seguridad
     de verdad: un socket puede quedarse "suscrito" y dejar de entregar en
     silencio, así que el sondeo NO se apaga nunca. En cuanto el canal falla,
     expira o se cierra, vuelve a 12 s (y pregunta ya, sin esperar al
     siguiente tic), que es el caso para el que se escribió esta vía. */
  const [realtimeVivo, setRealtimeVivo] = useState(false);

  useEffect(() => {
    const cada = realtimeVivo ? 60_000 : 12_000;
    const id = setInterval(() => refresh(), cada);
    return () => clearInterval(id);
  }, [refresh, realtimeVivo]);

  /* Refresca el "hace X min" de las tarjetas. */
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /* Vía 1 — evento DOM de notifications.tsx (mismo tick que su INSERT). */
  useEffect(() => {
    function onNew(e: Event) {
      const o = (e as CustomEvent).detail as Order;
      if (o.restaurant_id !== restaurantId) return;
      // Igual que en el canal propio: solo lo que nadie ha atendido todavía.
      if (o.status !== 'NEW' || o.waiter_id) return;
      addOrder({
        id: o.id,
        order_number:  o.order_number,
        customer_name: o.customer_name,
        order_type:    o.order_type,
        address:       o.address,
        created_at:    o.created_at,
      }, true);
      refreshSoon();
    }
    window.addEventListener('order-new', onNew);
    return () => window.removeEventListener('order-new', onNew);
  }, [restaurantId, addOrder, refreshSoon]);

  /* Vía 4 — el service worker reenvía el push apenas llega. Necesita que el
     push traiga type:'new_order' (ver lib/actions/orders.ts). */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'push-notify' && e.data.pushType === 'new_order') refresh();
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refresh]);

  /* Vía 2 — canal propio de respaldo: INSERT para pedidos nuevos, UPDATE para
     quitar de la lista lo que se anuló o entregó desde otro dispositivo. */
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const { ready, stop: stopAuthSync } = syncRealtimeAuth(supabase);

    (async () => {
      await ready;
      if (cancelled) return;

      channel = supabase
        .channel(`new-orders-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          const o = payload.new as Order;
          if (o.restaurant_id !== restaurantId) return;
          // Solo lo que de verdad está SIN ATENDER. Un pedido que nace ya
          // enviado a cocina (lo tomó un mesero en el local, o llegó del hub
          // offline ya impreso) no necesita que suene una campana pidiendo que
          // alguien lo mire: ya lo miró una persona. Esta alerta es para los
          // pedidos que entran solos —en línea o por el QR de la mesa— y que
          // nadie ha visto todavía. Es la misma condición que usa el sondeo
          // (getPendingNewOrders filtra status = 'NEW'), que antes no coincidía
          // con lo que aceptaba este canal.
          //
          // Y por eso también fuera todo lo que trae mesero: `place_order` lo
          // inserta en NEW y lo pasa a PREP en un UPDATE aparte, así que el
          // INSERT llega diciendo NEW aunque ya esté en cocina. Mirando solo
          // el estado, cada comanda del mesero sonaba como pedido nuevo.
          if (o.status !== 'NEW' || o.waiter_id) return;
          addOrder({
            id: o.id,
            order_number:  o.order_number,
            customer_name: o.customer_name,
            order_type:    o.order_type,
            address:       o.address,
            created_at:    o.created_at,
          }, true);
          refreshSoon();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
          const o = payload.new as Order;
          if (o.restaurant_id !== restaurantId) return;
          // Un pedido anulado o ya entregado no tiene nada que avisar. Un
          // cambio NEW→PREP no basta para quitar la tarjeta: con
          // "auto-confirmar" activado eso pasa solo, sin que nadie lo haya
          // visto, y desaparecería el aviso justo por el mecanismo que
          // pretende evitarlo.
          if (o.status === 'CANCEL' || o.status === 'DELIVERED') {
            setOrders((prev) => prev.filter((x) => x.id !== o.id));
          }
        })
        .subscribe((status) => {
          // El estado del canal es lo que decide la cadencia del sondeo de
          // respaldo (vía 3). Cualquier cosa que no sea SUBSCRIBED lo devuelve
          // a 12 s; CHANNEL_ERROR además pregunta en el acto.
          setRealtimeVivo(status === 'SUBSCRIBED');
          if (status === 'CHANNEL_ERROR') refresh();
        });
    })();

    return () => {
      cancelled = true;
      setRealtimeVivo(false);
      channel?.unsubscribe();
      stopAuthSync();
    };
  }, [restaurantId, addOrder, refresh, refreshSoon]);

  /* ── Descartar ──────────────────────────────────────────────────── */
  const dismiss = useCallback((id: string, broadcast = true) => {
    dismissedRef.current.add(id);
    saveDismissed(dismissedRef.current);
    setOrders((prev) => prev.filter((x) => x.id !== id));
    if (!broadcast || typeof BroadcastChannel === 'undefined') return;
    try {
      const bc = new BroadcastChannel(ACK_CHANNEL);
      bc.postMessage({ id });
      bc.close();
    } catch {}
  }, []);

  const dismissAll = useCallback(() => {
    orders.forEach((o) => dismiss(o.id));
  }, [orders, dismiss]);

  /* Otra pestaña marcó un pedido como visto → limpiarlo aquí también, para
     que atenderlo en un dispositivo no deje la alerta encendida en el resto. */
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let bc: BroadcastChannel;
    try { bc = new BroadcastChannel(ACK_CHANNEL); } catch { return; }
    bc.onmessage = (e: MessageEvent) => {
      const id = (e.data as { id?: string })?.id;
      if (id) dismiss(id, false);
    };
    return () => bc.close();
  }, [dismiss]);

  /* ── Sonido insistente mientras nadie atienda ───────────────────── */
  useEffect(() => {
    if (muteChime || orders.length === 0) { stopOrderNag(); return; }
    const s = loadSoundSettings();
    if (!s.orderNag) { stopOrderNag(); return; }
    startOrderNag(s.orderVolume, s.orderRepeat);
    return () => stopOrderNag();
  }, [orders.length, muteChime]);

  /* ── Título de la pestaña parpadeando ───────────────────────────────
     La pieza que hace que el aviso funcione con el panel en segundo plano o
     minimizado: el nombre de la pestaña alterna entre el título normal y el
     aviso, así que se ve desde la barra de pestañas o la barra de tareas sin
     tener el panel al frente. */
  useEffect(() => {
    if (orders.length === 0) return;
    const original = document.title;
    let on = true;
    const label = orders.length === 1
      ? '🛎 ¡Pedido nuevo!'
      : `🛎 ¡${orders.length} pedidos nuevos!`;
    document.title = label;
    const id = setInterval(() => {
      on = !on;
      document.title = on ? label : original;
    }, 1300);
    return () => { clearInterval(id); document.title = original; };
  }, [orders.length]);

  if (orders.length === 0 || !showCards) return null;

  const MAX_VISIBLE = 3;
  // Más antiguos primero: son los que llevan más tiempo esperando.
  const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - visible.length;

  return (
    /* Sin `position` propia: la pone el contenedor único de avisos del
       armazón (.adm-float-alert en shell.tsx), que además los levanta por
       encima de la barra inferior del teléfono. */
    <div className="adm-float-stack" style={{
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch',
      maxWidth: 'min(370px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 90px)', overflowY: showAll ? 'auto' : 'visible',
    }}>
      {visible.map((o) => (
        <div
          key={o.id}
          className="glass-solid anim-slide-up"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 16,
            // Verde: inconfundible frente al ámbar de "llamada al mesero".
            // Vía tokens --c-*: el verde claro de antes era ilegible sobre la
            // tarjeta casi blanca del modo claro.
            border: '1px solid color-mix(in srgb, var(--c-ok-solid) 45%, transparent)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              display: 'grid', placeItems: 'center',
              background: 'var(--c-ok-bg)', color: 'var(--c-ok)',
            }}>
              <Icon name="bell" size={19} />
            </div>
            <span style={{
              position: 'absolute', inset: -3, borderRadius: 15,
              border: '2px solid color-mix(in srgb, var(--c-ok-solid) 50%, transparent)',
              animation: 'new-order-ping 1.6s ease-out infinite',
              pointerEvents: 'none',
            }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', lineHeight: 1.2 }}>
              Pedido nuevo · {o.order_number}
            </div>
            <div style={{
              fontSize: 11.5, color: 'var(--c-ok)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {o.customer_name} · {typeLabel(o.order_type, o.address)} · {timeAgo(o.created_at)}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => { dismiss(o.id); router.push(panelHref(panelBaseFrom(pathname), '/admin/pedidos')); }}
              className="press"
              style={{
                padding: '7px 13px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700,
                background: 'var(--u-text)', color: 'var(--brand-bg)',
              }}
            >
              Ver pedido
            </button>
            <button
              type="button"
              onClick={() => dismiss(o.id)}
              className="press"
              style={{
                padding: '4px 13px', borderRadius: 9, cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: 'transparent', color: 'var(--u-text-3)',
                border: '1px solid var(--glass-stroke)',
              }}
            >
              Visto
            </button>
          </div>
        </div>
      ))}

      {(hiddenCount > 0 || showAll) && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="glass-solid press"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 14, cursor: 'pointer',
            border: '1px solid color-mix(in srgb, var(--c-ok-solid) 45%, transparent)',
            color: 'var(--c-ok)', fontSize: 13, fontWeight: 700,
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          <Icon name="bell" size={14} />
          {showAll
            ? 'Mostrar menos'
            : `+${hiddenCount} pedido${hiddenCount === 1 ? '' : 's'} más sin atender — ver todos`}
        </button>
      )}

      {sorted.length > 1 && (
        <button
          type="button"
          onClick={dismissAll}
          className="press"
          style={{
            alignSelf: 'flex-end', padding: '5px 12px', borderRadius: 9, cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            background: 'transparent', color: 'var(--u-text-3)',
            border: '1px solid var(--glass-stroke)',
          }}
        >
          Marcar todos como vistos
        </button>
      )}

      <style>{`
        @keyframes new-order-ping {
          0%   { transform: scale(1);   opacity: 0.7; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
