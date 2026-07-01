'use client';

/* ============================================================
   LLAMADAS AL MESERO — alerta persistente y accionable
   ------------------------------------------------------------
   Se monta en el AdminShell (lo ven dueño, staff y meseros) cuando
   el módulo "Llamar al mesero" está activo. Muestra una lista fija
   de llamadas pendientes con botón "Atendido". Realtime + polling
   de respaldo cada 20 s; el chime/toast lo dispara notifications.tsx
   en paralelo.
   ============================================================ */

import { useEffect, useState, useTransition, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
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

export default function WaiterCallsAlert({ restaurantId }: { restaurantId: string }) {
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [, setTick] = useState(0);
  const [resolving, startResolve] = useTransition();

  // Carga (o recarga) de llamadas pendientes del servidor.
  const refresh = useCallback(async () => {
    const list = await getPendingWaiterCalls(restaurantId);
    // Merge: añadir nuevas, conservar las ya conocidas, quitar las resueltas.
    setCalls((prev) => {
      const serverIds = new Set(list.map((c) => c.id));
      // Quitar las que el servidor ya no devuelve (resueltas desde otro dispositivo).
      const still = prev.filter((c) => serverIds.has(c.id));
      // Añadir las que no teníamos aún.
      const newOnes = list.filter((c) => !prev.some((p) => p.id === c.id));
      return [...still, ...newOnes];
    });
  }, [restaurantId]);

  // Carga inicial.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling de respaldo cada 20 s — garantiza actualización aunque Realtime falle.
  useEffect(() => {
    const id = setInterval(() => refresh(), 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Refresca el "hace X min" cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Evento DOM inmediato: notifications.tsx lo dispara en el mismo tick que recibe
  // el INSERT de Realtime, así la tarjeta aparece sin esperar un canal propio.
  useEffect(() => {
    function onNew(e: Event) {
      const c = (e as CustomEvent).detail as { id: string; restaurant_id: string; table_number: number | null; created_at: string };
      if (c.restaurant_id !== restaurantId) return;
      setCalls((prev) => (prev.some((x) => x.id === c.id)
        ? prev
        : [...prev, { id: c.id, table_number: c.table_number, created_at: c.created_at }]));
    }
    window.addEventListener('waiter-call-new', onNew);
    return () => window.removeEventListener('waiter-call-new', onNew);
  }, [restaurantId]);

  // Canal propio solo para UPDATE (resoluciones desde otro dispositivo) y como
  // respaldo de INSERT si notifications.tsx no está montado.
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
        .channel(`waiter-calls-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
          // Respaldo: si el evento DOM ya llegó primero, setCalls lo deduplica.
          const c = payload.new as WaiterCall & { restaurant_id: string; resolved_at: string | null };
          if (c.restaurant_id !== restaurantId || c.resolved_at) return;
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
          if (status === 'CHANNEL_ERROR') refresh();
        });
    })();

    return () => { cancelled = true; channel?.unsubscribe(); };
  }, [restaurantId, refresh]);

  function resolve(id: string) {
    setCalls((prev) => prev.filter((x) => x.id !== id)); // optimista
    startResolve(async () => { await resolveWaiterCall(id); });
  }

  if (calls.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 70,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 'min(360px, calc(100vw - 32px))',
    }}>
      {calls.map((c) => (
        <div
          key={c.id}
          className="glass-solid anim-slide-up"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 16,
            border: '1px solid rgba(245,158,11,0.45)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          {/* Icono con pulso */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              display: 'grid', placeItems: 'center',
              background: 'rgba(245,158,11,0.18)', color: '#fbbf24',
            }}>
              <Icon name="bell" size={19} />
            </div>
            {/* Anillo de pulso */}
            <span style={{
              position: 'absolute', inset: -3, borderRadius: 15,
              border: '2px solid rgba(251,191,36,0.5)',
              animation: 'waiter-ping 1.6s ease-out infinite',
              pointerEvents: 'none',
            }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', lineHeight: 1.2 }}>
              {c.table_number ? `Mesa ${c.table_number}` : 'Llamada al mesero'}
            </div>
            <div style={{ fontSize: 11.5, color: '#fbbf24', marginTop: 2 }}>
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
