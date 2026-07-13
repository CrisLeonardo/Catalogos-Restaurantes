'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import { updateOrderStatus } from '@/lib/actions/orders';
import { primeAudio, playKitchenSound, loadSoundSettings } from '@/lib/sounds';
import type { OrderWithItems } from '@/lib/db/orders';
import type { Order } from '@/types';

interface Props {
  restaurantId: string;
  restaurantName: string;
  initialOrders: OrderWithItems[];
  /* Umbrales del semáforo (minutos de espera desde que entró el pedido).
     Configurables por el restaurante en Personalización → Cocina. */
  yellowMin: number;
  redMin: number;
  /** true = solo muestra pedidos ya confirmados (PREP); false = también muestra los recién llegados (NEW). */
  confirmFirst?: boolean;
  /** Esquema claro/oscuro del panel admin (cookie `admin-theme`), NO el tema del restaurante. */
  scheme?: 'light' | 'dark';
}

/* Paletas de alto contraste — independientes del tema del restaurante, pero
   sí siguen el switch claro/oscuro del panel admin (igual que el resto del
   admin, que usa 2 paletas fijas en vez de heredar el tema del tenant). */
const C_DARK = {
  bg: '#0b0d10',
  panel: '#15181d',
  panelHi: '#1c2026',
  text: '#f5f7fa',
  dim: '#9aa3ad',
  hair: 'color-mix(in srgb, var(--u-text) 9%, transparent)',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
};

const C_LIGHT = {
  bg: '#eef0f3',
  panel: '#ffffff',
  panelHi: '#f4f5f7',
  text: '#14181f',
  dim: '#5b6472',
  hair: 'color-mix(in srgb, var(--u-text) 12%, transparent)',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
  blue: '#2563eb',
};

type Palette = typeof C_DARK;


function orderLabel(o: OrderWithItems): { icon: string; text: string } {
  if (o.order_type === 'DINE_IN') {
    const m = o.address?.match(/Mesa\s+(\d+)/i);
    return { icon: 'utensils', text: m ? `Mesa ${m[1]}` : (o.address || 'En local') };
  }
  if (o.order_type === 'PICKUP') return { icon: 'bag', text: 'Para llevar' };
  return { icon: 'truck', text: 'Domicilio' };
}

/** Tiempo transcurrido formateado mm:ss (o h:mm:ss si pasa de una hora). */
function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function semaforo(elapsedMin: number, yellowMin: number, redMin: number, C: Palette): string {
  if (elapsedMin >= redMin) return C.red;
  if (elapsedMin >= yellowMin) return C.amber;
  return C.green;
}

export default function KitchenDisplay({ restaurantId, restaurantName, initialOrders, yellowMin, redMin, confirmFirst = false, scheme = 'dark' }: Props) {
  const router = useRouter();
  const orders = initialOrders;
  const [now, setNow] = useState<number | null>(null);
  const [isFull, setIsFull] = useState(false);
  const soundSettingsRef = useRef(loadSoundSettings());
  const C = scheme === 'light' ? C_LIGHT : C_DARK;

  // Coalescer de router.refresh() (mismo patrón que orders-panel.tsx): una
  // ráfaga de pedidos (p. ej. la cola offline sincronizando de golpe) hacía
  // un re-render completo del server component POR PEDIDO — la pantalla de
  // cocina se congelaba en plena hora pico. Máximo un refresh cada 2.5 s.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefresh  = useRef(0);
  const refreshSoon = useCallback(() => {
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

  // Reloj/temporizadores
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  // Desbloquear AudioContext al primer gesto del usuario en la pantalla de cocina
  useEffect(() => {
    const handler = () => primeAudio();
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  }, []);

  // Realtime: pedido nuevo → sonido de cocina + refresco; cambio de estado → refresco.
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
        .channel(`kds-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'orders' },
          (payload) => {
            if ((payload.new as Order).restaurant_id !== restaurantId) return;
            // Con confirmFirst este pedido todavía no entra a la lista del KDS
            // (sigue NEW, solo se muestra PREP) — sonar aquí sería un aviso
            // prematuro y falso. Ese caso lo cubre el handler de UPDATE abajo.
            if (!confirmFirst) {
              const s = soundSettingsRef.current;
              playKitchenSound(s.kitchenVolume, s.kitchenRepeat);
            }
            refreshSoon();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload) => {
            const updated = payload.new as Order;
            if (updated.restaurant_id !== restaurantId) return;
            // Con "Confirmar antes de enviar a cocina" (confirmFirst) un pedido
            // llega a esta pantalla recién cuando pasa de NEW a PREP, es decir
            // por un UPDATE, no un INSERT. Sin esto, el KDS quedaba mudo para
            // TODO restaurante con ese modo activado.
            if (confirmFirst && updated.status === 'PREP') {
              const s = soundSettingsRef.current;
              playKitchenSound(s.kitchenVolume, s.kitchenRepeat);
            }
            refreshSoon();
          },
        )
        .subscribe();
    })();

    return () => { cancelled = true; channel?.unsubscribe(); stopAuthSync(); };
  }, [restaurantId, confirmFirst, refreshSoon]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFull(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFull(false)).catch(() => {});
    }
  }

  const nuevos = orders.filter((o) => o.status === 'NEW').length;
  const clock = now == null ? '—' : new Date(now).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.text, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--ui-font, system-ui, sans-serif)' }}>
      {/* Barra superior */}
      <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px', borderBottom: `1px solid ${C.hair}`, background: C.panel }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Icon name="flame" size={22} style={{ color: C.amber, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Cocina</div>
            <div style={{ fontSize: 12, color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{restaurantName}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 999, background: C.panelHi, fontWeight: 700, fontSize: 14 }}>
            <span style={{ color: orders.length > 0 ? C.green : C.dim }}>{orders.length}</span>
            <span style={{ color: C.dim, fontSize: 12, fontWeight: 600 }}>en cocina</span>
            {nuevos > 0 && (
              <span style={{ marginLeft: 4, padding: '2px 8px', borderRadius: 999, background: `${C.blue}22`, color: C.blue, fontSize: 12, fontWeight: 800 }}>
                {nuevos} nuevo{nuevos !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span style={{ fontFamily: 'var(--ui-font-mono, monospace)', fontSize: 16, fontWeight: 700, color: C.dim, minWidth: 54, textAlign: 'right' }}>{clock}</span>
          <button onClick={toggleFullscreen} title="Pantalla completa" style={iconBtnStyle(C)}>
            <Icon name={isFull ? 'x' : 'grid'} size={17} />
          </button>
          <a href="/admin/pedidos" title="Volver al panel" style={{ ...iconBtnStyle(C), textDecoration: 'none', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevronLeft" size={19} />
          </a>
        </div>
      </header>

      {/* Tablero */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {orders.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: C.dim }}>
            <Icon name="checkCircle" size={52} style={{ color: C.green }} />
            <p style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Todo al día</p>
            <p style={{ fontSize: 14 }}>{confirmFirst ? 'Los pedidos aparecen aquí al ser confirmados desde el panel.' : 'No hay pedidos pendientes en cocina.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
            {orders.map((order) => (
              <KitchenCard key={order.id} order={order} now={now} yellowMin={yellowMin} redMin={redMin} C={C} onRefresh={() => router.refresh()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function iconBtnStyle(C: Palette): React.CSSProperties {
  return {
    width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.hair}`,
    background: C.panelHi, color: C.dim, cursor: 'pointer', display: 'grid', placeItems: 'center',
  };
}

/* ── Tarjeta de pedido ──────────────────────────────────────── */

function KitchenCard({ order, now, yellowMin, redMin, C, onRefresh }: { order: OrderWithItems; now: number | null; yellowMin: number; redMin: number; C: Palette; onRefresh: () => void }) {
  const [isPending, start] = useTransition();
  const createdMs = new Date(order.created_at).getTime();
  const elapsedMs = now == null ? 0 : now - createdMs;
  const elapsedMin = elapsedMs / 60000;
  const mounted = now != null;
  const color = mounted ? semaforo(elapsedMin, yellowMin, redMin, C) : C.green;
  const isNew = order.status === 'NEW';
  const label = orderLabel(order);

  function advance() {
    const next = isNew ? 'PREP' : 'READY';
    start(async () => {
      await updateOrderStatus(order.id, next);
      onRefresh();
    });
  }

  return (
    <div style={{
      borderRadius: 14,
      background: C.panel,
      border: `1px solid ${C.hair}`,
      borderTop: `4px solid ${color}`,
      boxShadow: mounted && elapsedMin >= redMin ? `0 0 0 1px ${color}55, 0 6px 24px ${color}22` : 'none',
      display: 'flex', flexDirection: 'column',
      opacity: isPending ? 0.55 : 1,
      transition: 'opacity 150ms',
    }}>
      {/* Encabezado */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${C.hair}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>#{order.order_number}</span>
            {isNew && (
              <span style={{ padding: '2px 8px', borderRadius: 999, background: `${C.blue}22`, color: C.blue, fontSize: 11, fontWeight: 800, animation: 'kdsPulse 1.6s ease-in-out infinite' }}>
                NUEVO
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, color: C.dim, fontSize: 13, fontWeight: 600 }}>
            <Icon name={label.icon} size={14} /> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.text}</span>
          </div>
        </div>
        {/* Temporizador con semáforo */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: `${color}1a`, color, fontWeight: 800 }}>
          <Icon name="clock" size={14} />
          <span style={{ fontFamily: 'var(--ui-font-mono, monospace)', fontSize: 15, minWidth: 44, textAlign: 'right' }}>{mounted ? fmtElapsed(elapsedMs) : '··:··'}</span>
        </div>
      </div>

      {/* Ítems */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        {order.items.map((item) => (
          <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: C.text, minWidth: 32, lineHeight: 1.2 }}>{item.quantity}×</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{item.name_snapshot}</div>
              {item.options_snapshot && item.options_snapshot.length > 0 && (
                <div style={{ fontSize: 13, color: C.amber, marginTop: 2, fontWeight: 600 }}>
                  {item.options_snapshot.map((o) => o.choice).join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {order.notes && (
          <div style={{ marginTop: 2, padding: '8px 10px', borderRadius: 8, background: `${C.amber}14`, border: `1px solid ${C.amber}40` }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.05em', color: C.amber, textTransform: 'uppercase', marginBottom: 2 }}>Nota</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{order.notes}</div>
          </div>
        )}

        {order.waiter_name && (
          <div style={{ fontSize: 12, color: C.dim, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="userPlus" size={12} /> Mesero: <strong style={{ color: C.text }}>{order.waiter_name}</strong>
          </div>
        )}
      </div>

      {/* Acción táctil */}
      <div style={{ padding: '0 14px 14px' }}>
        <button
          onClick={advance}
          disabled={isPending}
          style={{
            width: '100%',
            padding: '14px 12px',
            borderRadius: 11,
            border: 'none',
            cursor: isPending ? 'wait' : 'pointer',
            fontSize: 16,
            fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: isNew ? C.blue : C.green,
            color: '#fff',
            letterSpacing: '0.01em',
          }}
        >
          {isPending ? (
            '…'
          ) : isNew ? (
            <><Icon name="flame" size={18} /> Comenzar</>
          ) : (
            <><Icon name="check" size={18} /> Marcar listo</>
          )}
        </button>
      </div>

      <style>{`@keyframes kdsPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>
    </div>
  );
}
