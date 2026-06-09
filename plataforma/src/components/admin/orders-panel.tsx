'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OrderCard from '@/components/admin/order-card';
import type { OrderWithItems, OrderStats } from '@/lib/db/orders';
import type { Order } from '@/types';

interface Props {
  initialOrders: OrderWithItems[];
  restaurantId:  string;
  stats:         OrderStats;
}

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

function q(n: number) {
  return 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPanel({ initialOrders, restaurantId, stats }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orders = initialOrders;

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const newOrder = payload.new as Order;
          chime();
          showToast(`Nuevo pedido ${newOrder.order_number} — ${newOrder.customer_name}`);
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => { router.refresh(); },
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [restaurantId, router]);

  const active    = orders.filter((o) => !['DELIVERED', 'CANCEL'].includes(o.status));
  const completed = orders.filter((o) =>  ['DELIVERED', 'CANCEL'].includes(o.status));

  const valid     = orders.filter((o) => o.status !== 'CANCEL');
  const ventasHoy = valid.reduce((t, o) => t + Number(o.total), 0);
  const ticket    = valid.length ? ventasHoy / valid.length : 0;
  const enPrep    = orders.filter((o) => o.status === 'NEW' || o.status === 'PREP').length;

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
        <Kpi label="Ventas hoy" value={q(ventasHoy)} sub={`${valid.length} pedidos`} hero />
        <Kpi label="Pedidos hoy" value={String(orders.length)} sub={`${active.length} activos`} />
        <Kpi label="Ticket promedio" value={q(ticket)} sub="por pedido" />
        <Kpi label="En preparación" value={String(enPrep)} sub="en la barra" />
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="glass anim-slide-up"
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 80, padding: '12px 20px', borderRadius: 'var(--radius-full)',
            fontSize: 13, fontWeight: 600, color: 'var(--u-text)', whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          🔔 {toast}
        </div>
      )}

      {/* Board + sidebar */}
      <div className="orders-grid">
        {/* Left: tablero de pedidos */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="t-poster" style={{ fontSize: 20 }}>En curso</h2>
            <span className="t-kicker" style={{ fontSize: 10 }}>{active.length} pedidos</span>
          </div>
          {active.length === 0 ? (
            <div className="glass" style={{ borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14, marginBottom: 28 }}>
              Todo al día. No hay pedidos en curso.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 28 }}>
              {active.map((order) => <OrderCard key={order.id} order={order} />)}
            </div>
          )}
          {completed.length > 0 && (
            <>
              <h2 className="t-poster" style={{ fontSize: 20, marginBottom: 12 }}>Cerrados hoy</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, opacity: 0.62 }}>
                {completed.map((order) => <OrderCard key={order.id} order={order} />)}
              </div>
            </>
          )}
        </div>

        {/* Right: gráfica + top */}
        <aside style={{ width: '100%', minWidth: 0 }}>
          <SalesChart series={stats.series} totalLast14={stats.totalLast14} />
          {stats.topToday.length > 0 && <TopToday items={stats.topToday} />}
        </aside>
      </div>
    </>
  );
}

/* ── Kpi card ─────────────────────────────────────────────── */

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 28 : 24, color: 'var(--u-text)', lineHeight: 1, letterSpacing: hero ? '-0.02em' : '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </div>
  );
}

/* ── Gráfica 14 días ──────────────────────────────────────── */

import type { DaySale, TopProduct } from '@/lib/db/orders';

function SalesChart({ series, totalLast14 }: { series: DaySale[]; totalLast14: number }) {
  const max = Math.max(...series.map((d) => d.total), 1);
  const q14 = (n: number) => 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 12 }}>
      <div>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Ventas · 14 días</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--u-text)', marginTop: 4, lineHeight: 1 }}>
          {q14(totalLast14)}
        </div>
      </div>

      {/* Barras */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {series.map((day, i) => {
          const h = max > 0 ? (day.total / max) * 100 : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(h, day.total > 0 ? 6 : 2)}%`,
                  minHeight: 2,
                  borderRadius: '4px 4px 0 0',
                  background: day.isToday ? 'var(--u-text)' : 'rgba(255,255,255,0.14)',
                  transition: 'height 400ms var(--ease-entry)',
                }}
                title={`${day.label}: Q ${day.total.toFixed(2)}`}
              />
              <span
                className="t-mono"
                style={{ fontSize: 8.5, color: day.isToday ? 'var(--u-text)' : 'var(--u-text-4)', fontWeight: day.isToday ? 700 : 500 }}
              >
                {day.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Top de hoy ───────────────────────────────────────────── */

function TopToday({ items }: { items: TopProduct[] }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-poster" style={{ fontSize: 15 }}>Top de hoy</div>
      {items.map((item, i) => (
        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="t-mono" style={{ width: 18, color: 'var(--u-text-4)', fontSize: 12, flexShrink: 0 }}>
            {i + 1}
          </span>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--u-text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
          <span className="t-mono" style={{ fontSize: 11.5, color: 'var(--u-text-3)', flexShrink: 0 }}>
            {item.qty}×
          </span>
        </div>
      ))}
    </div>
  );
}
