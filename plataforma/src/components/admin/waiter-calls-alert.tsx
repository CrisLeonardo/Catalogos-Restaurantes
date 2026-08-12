'use client';

/* ============================================================
   LLAMADAS AL MESERO — alerta persistente y accionable
   ------------------------------------------------------------
   Se monta en el AdminShell (lo ven dueño, staff y meseros) cuando
   el módulo "Llamar al mesero" está activo. Muestra una lista fija
   de llamadas pendientes con botón "Atendido". Se entera de llamadas
   nuevas por CUATRO vías (evento DOM de notifications.tsx, su propio
   canal Realtime de respaldo, el puente del push del service worker y
   polling cada 6 s) — y este componente
   es la ÚNICA fuente de verdad del SONIDO: lo dispara una sola vez
   por llamada (dedup vía `seenIds`) sin importar cuál de las tres vías
   la detectó primero. Así el chime suena incluso si el canal Realtime
   de notifications.tsx no llega a tiempo (o nunca llega) — antes el
   sonido dependía únicamente de esa vía y quedaba en silencio cuando
   fallaba, aunque la tarjeta sí apareciera vía el polling.
   ============================================================ */

import { useEffect, useRef, useState, useTransition, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import { primeAudio, playWaiterSound, loadSoundSettings, claimSoundEvent } from '@/lib/sounds';
import {
  getPendingWaiterCalls,
  resolveWaiterCall,
  type WaiterCall,
} from '@/lib/actions/waiter-call';

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min === 1) return 'hace 1 min';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

export default function WaiterCallsAlert({
  restaurantId,
  muteChime = false,
}: {
  restaurantId: string;
  /** true en /admin/pedidos (vivo) y /admin/cocina — la tarjeta se sigue viendo, solo se silencia el chime. */
  muteChime?: boolean;
}) {
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [, setTick] = useState(0);
  const [resolving, startResolve] = useTransition();
  // Con media sala llamando a la vez, apilar UNA TARJETA POR LLAMADA cubría
  // la pantalla completa del panel (y seguía creciendo sin tope). Se muestran
  // las más antiguas (las que llevan más tiempo esperando) y el resto se
  // resume en un contador expandible.
  const [showAll, setShowAll] = useState(false);

  const muteRef = useRef(muteChime);
  useEffect(() => { muteRef.current = muteChime; }, [muteChime]);

  // IDs ya vistos, para no volver a sonar por la misma llamada si tres vías
  // distintas la reportan (DOM, canal propio, polling). `null` = todavía no
  // se cargó el snapshot inicial: las llamadas que YA estaban pendientes al
  // montar no deben sonar (evita un "beep" retroactivo al recargar la página
  // con una llamada de hace rato aún sin atender).
  const seenIds = useRef<Set<string> | null>(null);

  const noteNew = useCallback((id: string) => {
    if (seenIds.current === null || seenIds.current.has(id)) return;
    seenIds.current.add(id);
    if (muteRef.current) return;
    // Dedup ENTRE pestañas: tener el panel abierto en dos pestañas (resumen +
    // pedidos, o el navegador restaurando la sesión) hacía que cada una sonara
    // por su cuenta con unos milisegundos de diferencia — dos campanillas
    // desfasadas se oyen exactamente como "llegaron varias llamadas a la vez".
    // La tarjeta sí se muestra en todas; solo el audio se reparte.
    if (!claimSoundEvent('waiter', id)) return;
    primeAudio();
    const s = loadSoundSettings();
    playWaiterSound(s.waiterVolume, s.waiterRepeat);
  }, []);

  // Carga (o recarga) de llamadas pendientes del servidor.
  const refresh = useCallback(async () => {
    const list = await getPendingWaiterCalls(restaurantId);
    if (seenIds.current === null) {
      // Snapshot inicial: se marcan como "vistas" sin sonar.
      seenIds.current = new Set(list.map((c) => c.id));
    } else {
      list.forEach((c) => noteNew(c.id));
    }
    // Merge: añadir nuevas, conservar las ya conocidas, quitar las resueltas.
    setCalls((prev) => {
      const serverIds = new Set(list.map((c) => c.id));
      // Quitar las que el servidor ya no devuelve (resueltas desde otro dispositivo).
      const still = prev.filter((c) => serverIds.has(c.id));
      // Añadir las que no teníamos aún.
      const newOnes = list.filter((c) => !prev.some((p) => p.id === c.id));
      return [...still, ...newOnes];
    });
  }, [restaurantId, noteNew]);

  // Carga inicial.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling de respaldo — garantiza que la tarjeta Y el sonido lleguen en un
  // tiempo razonable aunque Realtime falle o se demore.
  //
  // La cadencia depende de si el canal propio está vivo. Esta alerta se monta
  // en el AdminShell, o sea en TODAS las pantallas del panel: 6 s fijos eran
  // 10 consultas por minuto y por pestaña abierta, indefinidamente, cuando con
  // el socket en pie la llamada ya había entrado por el canal o por el evento
  // DOM. Suscrito baja a 45 s; el sondeo NO se apaga nunca porque un socket
  // puede quedarse "suscrito" y dejar de entregar en silencio. Si el canal
  // falla, expira o se cierra, vuelve a los 6 s de siempre — llamar al mesero
  // y que nadie conteste es justo el fallo que esta vía existe para evitar.
  const [realtimeVivo, setRealtimeVivo] = useState(false);

  useEffect(() => {
    const cada = realtimeVivo ? 45_000 : 6_000;
    const id = setInterval(() => refresh(), cada);
    return () => clearInterval(id);
  }, [refresh, realtimeVivo]);

  // Push → instantáneo: el service worker reenvía aquí el push apenas llega
  // (misma vía que ya usan las notificaciones del sistema, rápida y ajena al
  // socket de Realtime). Si este dispositivo no tiene el push activado, este
  // mensaje simplemente nunca llega y todo sigue funcionando por Realtime +
  // el polling de arriba — sin esto no hay regresión, solo se pierde el atajo.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'push-notify' && e.data.pushType === 'waiter_call') refresh();
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refresh]);

  // Refresca el "hace X min" cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Evento DOM inmediato: notifications.tsx lo dispara en el mismo tick que recibe
  // el INSERT de Realtime, así la tarjeta (y el sonido, vía noteNew) llegan sin
  // esperar un canal propio.
  useEffect(() => {
    function onNew(e: Event) {
      const c = (e as CustomEvent).detail as { id: string; restaurant_id: string; table_number: number | null; created_at: string };
      if (c.restaurant_id !== restaurantId) return;
      noteNew(c.id);
      setCalls((prev) => (prev.some((x) => x.id === c.id)
        ? prev
        : [...prev, { id: c.id, table_number: c.table_number, created_at: c.created_at }]));
    }
    window.addEventListener('waiter-call-new', onNew);
    return () => window.removeEventListener('waiter-call-new', onNew);
  }, [restaurantId, noteNew]);

  // Canal propio: respaldo de INSERT (por si notifications.tsx no está montado
  // o su canal no llega) y UPDATE para resoluciones desde otro dispositivo.
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
        .channel(`waiter-calls-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
          // Respaldo: si el evento DOM ya llegó primero, noteNew/setCalls lo deduplican.
          const c = payload.new as WaiterCall & { restaurant_id: string; resolved_at: string | null };
          if (c.restaurant_id !== restaurantId || c.resolved_at) return;
          noteNew(c.id);
          setCalls((prev) => (prev.some((x) => x.id === c.id)
            ? prev
            : [...prev, { id: c.id, table_number: c.table_number, created_at: c.created_at }]));
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'waiter_calls' }, (payload) => {
          const c = payload.new as { id: string; restaurant_id: string; resolved_at: string | null };
          if (c.restaurant_id !== restaurantId) return;
          if (c.resolved_at) setCalls((prev) => prev.filter((x) => x.id !== c.id));
        })
        .subscribe((status) => {
          // Marca la cadencia del sondeo de respaldo (ver arriba).
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
  }, [restaurantId, refresh, noteNew]);

  function resolve(id: string) {
    setCalls((prev) => prev.filter((x) => x.id !== id)); // optimista
    startResolve(async () => { await resolveWaiterCall(id); });
  }

  if (calls.length === 0) return null;

  const MAX_VISIBLE = 3;
  // Más antiguas primero: son las mesas que llevan más tiempo esperando.
  const sorted = [...calls].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 70,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 'min(360px, calc(100vw - 32px))',
      // Expandida, la lista es desplazable en vez de crecer sin límite.
      maxHeight: 'calc(100vh - 90px)', overflowY: showAll ? 'auto' : 'visible',
    }}>
      {visible.map((c) => (
        <div
          key={c.id}
          className="glass-solid anim-slide-up"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 16,
            border: '1px solid var(--c-warn-line)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          {/* Icono con pulso */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              display: 'grid', placeItems: 'center',
              background: 'var(--c-warn-bg)', color: 'var(--c-warn)',
            }}>
              <Icon name="bell" size={19} />
            </div>
            {/* Anillo de pulso */}
            <span style={{
              position: 'absolute', inset: -3, borderRadius: 15,
              border: '2px solid var(--c-warn-line)',
              animation: 'waiter-ping 1.6s ease-out infinite',
              pointerEvents: 'none',
            }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', lineHeight: 1.2 }}>
              {c.table_number ? `Mesa ${c.table_number}` : 'Llamada al mesero'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-warn)', marginTop: 2 }}>
              Solicita atención · {timeAgo(c.created_at)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => resolve(c.id)}
            disabled={resolving}
            className="press"
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: 'none',
              cursor: resolving ? 'not-allowed' : 'pointer',
              fontSize: 12.5, fontWeight: 700,
              background: 'var(--u-text)', color: 'var(--brand-bg)',
              opacity: resolving ? 0.7 : 1,
            }}
          >
            Atendido
          </button>
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
            border: '1px solid var(--c-warn-line)',
            color: 'var(--c-warn)', fontSize: 13, fontWeight: 700,
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          <Icon name="bell" size={14} />
          {showAll
            ? 'Mostrar menos'
            : `+${hiddenCount} mesa${hiddenCount === 1 ? '' : 's'} más esperando — ver todas`}
        </button>
      )}

      {/* Animación keyframe via style tag (solo se inserta una vez) */}
      <style>{`
        @keyframes waiter-ping {
          0%   { transform: scale(1);   opacity: 0.7; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
