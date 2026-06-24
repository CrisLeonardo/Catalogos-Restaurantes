'use client';

/* ============================================================
   LLAMADAS AL MESERO — alerta persistente y accionable
   ------------------------------------------------------------
   Se monta en el AdminShell (lo ven dueño, staff y meseros) cuando
   el módulo "Llamar al mesero" está activo. Muestra una lista fija
   de llamadas pendientes con botón "Atendido". Realtime + carga
   inicial; el chime/toast lo dispara notifications.tsx en paralelo.
   ============================================================ */

import { useEffect, useState, useTransition } from 'react';
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

  // Carga inicial de pendientes.
  useEffect(() => {
    let cancelled = false;
    getPendingWaiterCalls(restaurantId).then((list) => { if (!cancelled) setCalls(list); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Refresca el "hace X min" cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Realtime: nuevas llamadas (INSERT) y resoluciones desde otro dispositivo (UPDATE).
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
        .subscribe();
    })();

    return () => { cancelled = true; channel?.unsubscribe(); };
  }, [restaurantId]);

  function resolve(id: string) {
    setCalls((prev) => prev.filter((x) => x.id !== id)); // optimista
    startResolve(async () => { await resolveWaiterCall(id); });
  }

  if (calls.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 70,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 'min(340px, calc(100vw - 32px))',
    }}>
      {calls.map((c) => (
        <div
          key={c.id}
          className="glass-solid anim-slide-up"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 13px', borderRadius: 14,
            border: '1px solid rgba(245,158,11,0.4)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'rgba(245,158,11,0.16)', color: '#fbbf24',
          }}>
            <Icon name="bell" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>
              {c.table_number ? `Mesa ${c.table_number}` : 'Llamada al mesero'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{timeAgo(c.created_at)}</div>
          </div>
          <button
            type="button"
            onClick={() => resolve(c.id)}
            disabled={resolving}
            className="press"
            style={{
              flexShrink: 0, padding: '7px 12px', borderRadius: 10, border: 'none',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              background: 'var(--u-text)', color: 'var(--brand-bg)',
            }}
          >
            Atendido
          </button>
        </div>
      ))}
    </div>
  );
}
