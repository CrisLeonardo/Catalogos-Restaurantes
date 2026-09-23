'use client';

import { memo, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import { updateOrderStatus } from '@/lib/actions/orders';
import { primeAudio, playKitchenSound, loadSoundSettings } from '@/lib/sounds';
import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';
import type { Order } from '@/types';
import { etiquetaDeMesa } from '@/lib/mesa';

interface Props {
  restaurantId: string;
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
  /* -400 y no -500: es TINTA sobre panel casi negro, y con #ef4444 el reloj
     de un pedido atrasado —lo que más hay que leer de lejos— daba 4.3:1. */
  red: '#f87171',
  blue: '#3b82f6',
  /* Rellenos de los botones grandes, que llevan texto BLANCO encima. Con
     los tonos de tinta de arriba «Marcar listo» medía 2.3:1 (blanco sobre
     #22c55e) y «Comenzar» 3.7:1; los -700 pasan de 5:1. */
  fillGreen: '#15803d',
  fillBlue: '#1d4ed8',
};

/* Tonos -700 a propósito: estos colores se usan como TINTA sobre panel blanco
   (contador "en cocina", opciones del plato, etiqueta de nota). Con los -600
   de antes, texto de 13 px quedaba en ~3:1 — por debajo del mínimo legible, y
   en una cocina se mira la pantalla de lejos y de reojo. */
const C_LIGHT = {
  bg: '#eef0f3',
  panel: '#ffffff',
  panelHi: '#f4f5f7',
  text: '#14181f',
  dim: '#525c6b',
  hair: 'color-mix(in srgb, var(--u-text) 12%, transparent)',
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
  blue: '#1d4ed8',
  fillGreen: '#15803d',
  fillBlue: '#1d4ed8',
};

type Palette = typeof C_DARK;


function orderLabel(o: OrderWithItems): { icon: string; text: string } {
  if (o.order_type === 'DINE_IN') {
    return { icon: 'utensils', text: etiquetaDeMesa(o) };
  }
  if (o.order_type === 'PICKUP') return { icon: 'bag', text: 'Para llevar' };
  return { icon: 'truck', text: 'Domicilio' };
}

/** Tiempo transcurrido formateado mm:ss (o h:mm:ss si pasa de una hora).
 *  Pasadas 48 h el cronómetro deja de tener sentido operativo (pedido
 *  olvidado/de prueba): se muestra en días para no pintar "193:00:12". */
function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  if (h >= 48) return `${Math.floor(h / 24)} días`;
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

/**
 * Cronómetro mm:ss de una tarjeta, con su PROPIO reloj.
 *
 * Antes el reloj vivía en KitchenDisplay y bajaba como prop `now` a cada
 * tarjeta: una vez por segundo React reconciliaba el árbol ENTERO de cada
 * pedido — cabecera, la lista de platillos con sus opciones y notas, el aviso
 * del mesero y el botón. Con 20 pedidos de 5 líneas eso es más de mil nodos
 * revisados por segundo, en la tablet más barata del local y justo en hora
 * pico, que es cuando el KDS tiene que responder al toque sin pensárselo.
 *
 * Aquí el segundero solo se pinta a sí mismo: dos nodos. El color del
 * semáforo NO se calcula aquí porque también tiñe el borde y la sombra de la
 * tarjeta — ese viaja como prop ya resuelta desde el padre (que se actualiza
 * cada 10 s, ver el temporizador de KitchenDisplay), así que la tarjeta solo
 * se vuelve a pintar cuando el color de verdad cambia.
 *
 * Empieza en '··:··' y no en el tiempo real: el HTML lo genera el servidor y
 * ahí no existe "ahora" del navegador. Pintar un número en el servidor daría
 * un desajuste de hidratación y, peor, un cronómetro congelado en la hora del
 * servidor durante el primer instante.
 */
const Cronometro = memo(function Cronometro({ createdMs }: { createdMs: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{now == null ? '··:··' : fmtElapsed(now - createdMs)}</>;
});

export default function KitchenDisplay({ restaurantId, initialOrders, yellowMin, redMin, confirmFirst = false, scheme = 'dark' }: Props) {
  const router = useRouter();
  const orders = initialOrders;
  const [now, setNow] = useState<number | null>(null);
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

  /* Reloj del ENCABEZADO y del semáforo — cada 10 s, no cada segundo.
     El segundero de cada pedido ya no depende de este estado: se lo pinta
     solo el componente <Cronometro>. Lo único que sigue colgando de aquí es
     la hora hh:mm de la barra (que cambia una vez por minuto) y el color del
     semáforo, cuyos umbrales están en MINUTOS. A 10 s, el peor retraso al
     virar a ámbar o rojo son 10 segundos sobre un umbral que el restaurante
     define en minutos; a cambio, el tablero se reconcilia 6 veces menos. */
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  // Desbloquear AudioContext con el primer gesto del usuario (click, tecla o
  // toque — antes solo click: en una tablet táctil el primer gesto suele ser
  // un scroll/touch y el KDS quedaba mudo hasta el primer tap real).
  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = ['click', 'pointerdown', 'keydown', 'touchstart'];
    const handler = () => {
      primeAudio();
      events.forEach((ev) => document.removeEventListener(ev, handler));
    };
    events.forEach((ev) => document.addEventListener(ev, handler, { once: true }));
    return () => events.forEach((ev) => document.removeEventListener(ev, handler));
  }, []);

  /* ── Aviso sonoro: UNA vez por pedido, cuando entra a ESTA pantalla ──
     La regla es la misma que ya usa la alerta de pedidos del panel: dedup por
     id. Antes se decidía por el tipo de evento (INSERT suena, UPDATE suena
     solo si confirmFirst) y eso se rompía en cuanto un pedido nacía ya
     confirmado —el del mesero, que llega como INSERT en estado PREP— o cuando
     un UPDATE cualquiera (una anulación, un cupón) tocaba una fila que ya
     estaba en PREP y hacía sonar la campana otra vez. */
  const announced = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Lo que ya estaba en pantalla al abrirla es historial: no suena.
    initialOrders.forEach((o) => announced.current.add(o.id));
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const announce = useCallback((order: Order) => {
    const visibleHere = confirmFirst ? order.status === 'PREP' : (order.status === 'NEW' || order.status === 'PREP');
    if (!visibleHere) return;
    if (announced.current.has(order.id)) return;
    announced.current.add(order.id);
    const s = soundSettingsRef.current;
    playKitchenSound(s.kitchenVolume, s.kitchenRepeat);
  }, [confirmFirst]);

  // Realtime: pedido que entra a cocina → sonido + refresco; resto → refresco.
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
            const order = payload.new as Order;
            if (order.restaurant_id !== restaurantId) return;
            announce(order);
            refreshSoon();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload) => {
            const updated = payload.new as Order;
            if (updated.restaurant_id !== restaurantId) return;
            announce(updated);
            refreshSoon();
          },
        )
        .subscribe();
    })();

    return () => { cancelled = true; channel?.unsubscribe(); stopAuthSync(); };
  }, [restaurantId, announce, refreshSoon]);

  /* Estable entre renders: si fuera `() => router.refresh()` en línea, cada
     tarjeta recibiría una función nueva cada vez y el memo de KitchenCard no
     serviría de nada. */
  const refreshNow = useCallback(() => router.refresh(), [router]);

  const nuevos = orders.filter((o) => o.status === 'NEW').length;
  const clock = now == null ? '—' : new Date(now).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });

  // Sin header propio ni `position: fixed`: vive dentro del panel como
  // cualquier otra pantalla (sidebar + topbar, sin envoltorio propio — igual
  // que /admin/pedidos). El botón "Pantalla completa" del panel (shell.tsx)
  // recrea, opcionalmente, el tablero a pantalla entera de antes.
  return (
    <div style={{ color: C.text, fontFamily: 'var(--ui-font, system-ui, sans-serif)', padding: 16 }}>
      {/* Franja de estado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 16px', marginBottom: 16, borderRadius: 12, border: `1px solid ${C.hair}`, background: C.panel }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Icon name="flame" size={18} style={{ color: C.amber, flexShrink: 0 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14 }}>
            <span style={{ color: orders.length > 0 ? C.green : C.dim }}>{orders.length}</span>
            <span style={{ color: C.dim, fontSize: 12, fontWeight: 600 }}>en cocina</span>
          </span>
          {nuevos > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 999, background: `${C.blue}22`, color: C.blue, fontSize: 12, fontWeight: 800 }}>
              {nuevos} nuevo{nuevos !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'var(--ui-font-mono, monospace)', fontSize: 14, fontWeight: 700, color: C.dim, minWidth: 46, textAlign: 'right' }}>{clock}</span>
      </div>

      {/* Tablero */}
      <div>
        {orders.length === 0 ? (
          <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: C.dim }}>
            <Icon name="checkCircle" size={52} style={{ color: C.green }} />
            <p style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Todo al día</p>
            <p style={{ fontSize: 14 }}>{confirmFirst ? 'Los pedidos aparecen aquí al ser confirmados desde el panel.' : 'No hay pedidos pendientes en cocina.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
            {orders.map((order) => {
              /* El semáforo se resuelve AQUÍ, a color y booleano ya cocidos.
                 Así KitchenCard (memo) recibe primitivas que casi nunca
                 cambian y solo se vuelve a pintar cuando el pedido de verdad
                 cambia de tramo — no 60 veces por minuto. */
              const elapsedMin = now == null ? 0 : (now - new Date(order.created_at).getTime()) / 60000;
              const mounted = now != null;
              return (
                <KitchenCard
                  key={order.id}
                  order={order}
                  color={mounted ? semaforo(elapsedMin, yellowMin, redMin, C) : C.green}
                  urgente={mounted && elapsedMin >= redMin}
                  C={C}
                  onRefresh={refreshNow}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tarjeta de pedido ──────────────────────────────────────── */

/**
 * Memoizada a propósito. Sus props son ahora todas estables o primitivas:
 * `order` conserva identidad entre renders del padre (viene tal cual del
 * server component), `C` es una constante de módulo, `onRefresh` va con
 * useCallback y `color`/`urgente` ya vienen resueltos. Resultado: el tablero
 * puede actualizar su reloj sin tocar una sola tarjeta, y cada tarjeta solo
 * se vuelve a pintar cuando cambia su pedido o su tramo de semáforo.
 */
const KitchenCard = memo(function KitchenCard({ order, color, urgente, C, onRefresh }: { order: OrderWithItems; color: string; urgente: boolean; C: Palette; onRefresh: () => void }) {
  const [isPending, start] = useTransition();
  const createdMs = new Date(order.created_at).getTime();
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
      boxShadow: urgente ? `0 0 0 1px ${color}55, 0 6px 24px ${color}22` : 'none',
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
          <span style={{ fontFamily: 'var(--ui-font-mono, monospace)', fontSize: 15, minWidth: 44, textAlign: 'right' }}><Cronometro createdMs={createdMs} /></span>
        </div>
      </div>

      {/* Ítems */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        {order.items.map((item) => {
          const remaining = remainingQuantity(item, order.voids ?? []);
          const voidedQty = item.quantity - remaining;
          const fullyVoided = remaining === 0;
          return (
            <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: fullyVoided ? 0.45 : 1 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: C.text, minWidth: 32, lineHeight: 1.2, textDecoration: fullyVoided ? 'line-through' : 'none' }}>
                {fullyVoided ? item.quantity : remaining}×
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.25, textDecoration: fullyVoided ? 'line-through' : 'none' }}>
                  {item.name_snapshot}
                </div>
                {voidedQty > 0 && (
                  <div style={{ fontSize: 12, color: C.red, marginTop: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {fullyVoided ? 'Anulado — no preparar' : `${voidedQty} anulada${voidedQty === 1 ? '' : 's'}`}
                  </div>
                )}
                {item.options_snapshot && item.options_snapshot.length > 0 && (
                  <div style={{ fontSize: 13, color: C.amber, marginTop: 2, fontWeight: 600 }}>
                    {item.options_snapshot.map((o) => o.variant ? `${o.choice} (${o.variant})` : o.choice).join(' · ')}
                  </div>
                )}
                {item.note && (
                  <div style={{ fontSize: 13, color: C.red, marginTop: 2, fontWeight: 800 }}>
                    ⚠ {item.note}
                  </div>
                )}
              </div>
            </div>
          );
        })}

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
            background: isNew ? C.fillBlue : C.fillGreen,
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
});
