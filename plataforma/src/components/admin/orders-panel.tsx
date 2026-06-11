'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OrderCard, { type PanelCurrency } from '@/components/admin/order-card';
import { exportOrdersCsv } from '@/lib/actions/orders';
import { localDateKey } from '@/lib/hours';
import type { OrderWithItems, OrderStats } from '@/lib/db/orders';
import type { Order } from '@/types';

interface Props {
  initialOrders: OrderWithItems[];
  restaurantId:  string;
  stats:         OrderStats;
  currency:      PanelCurrency;
  timezone:      string;
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

/** Formatea un monto con la moneda REAL del restaurante (no "Q" fijo). */
export function fmtMoney(n: number, c: PanelCurrency, decimals = 2): string {
  let num: string;
  try {
    num = n.toLocaleString(c.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch {
    num = n.toLocaleString('es-GT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}

export default function OrdersPanel({ initialOrders, restaurantId, stats, currency, timezone }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isExporting, startExport] = useTransition();
  const orders = initialOrders;

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // RLS filtra los eventos por usuario: sin el JWT de la sesión en el
      // canal realtime no llega NADA. setAuth ANTES de suscribirse.
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(session?.access_token ?? null);
      if (cancelled) return;

      // Topic único por montaje (ver admin/notifications.tsx).
      channel = supabase
        .channel(`orders-${restaurantId}-${crypto.randomUUID().slice(0, 8)}`)
        .on(
          'postgres_changes',
          // Sin filter server-side (ver admin/notifications.tsx): RLS limita
          // por usuario y el restaurante se verifica en el handler.
          { event: 'INSERT', schema: 'public', table: 'orders' },
          (payload) => {
            const newOrder = payload.new as Order;
            if (newOrder.restaurant_id !== restaurantId) return;
            chime();
            showToast(`Nuevo pedido ${newOrder.order_number} — ${newOrder.customer_name}`);
            router.refresh();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload) => {
            if ((payload.new as Order).restaurant_id !== restaurantId) return;
            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => { cancelled = true; channel?.unsubscribe(); };
  }, [restaurantId, router]);

  function downloadCsv() {
    startExport(async () => {
      const res = await exportOrdersCsv(restaurantId, 30);
      if (res.error || !res.csv) {
        showToast(res.error ?? 'No se pudo exportar.');
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'pedidos.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const todayKey  = localDateKey(new Date(), timezone);
  const active    = orders.filter((o) => !['DELIVERED', 'CANCEL'].includes(o.status));
  // "Cerrados hoy" de verdad: solo los terminados HOY (hora del restaurante).
  const completedToday = orders.filter(
    (o) =>
      ['DELIVERED', 'CANCEL'].includes(o.status) &&
      localDateKey(new Date(o.created_at), timezone) === todayKey,
  );

  const enPrep = orders.filter((o) => o.status === 'NEW' || o.status === 'PREP').length;

  return (
    <>
      {/* KPIs — calculados en el servidor con la zona horaria del restaurante */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
        <Kpi label="Ventas hoy" value={fmtMoney(stats.todaySales, currency)} sub={`${stats.todayOrders} pedidos`} hero />
        <Kpi label="Pedidos hoy" value={String(stats.todayOrders)} sub={`${active.length} activos`} />
        <Kpi label="Ticket promedio hoy" value={fmtMoney(stats.todayTicket, currency)} sub="por pedido" />
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
              {active.map((order) => <OrderCard key={order.id} order={order} currency={currency} />)}
            </div>
          )}
          {completedToday.length > 0 && (
            <>
              <h2 className="t-poster" style={{ fontSize: 20, marginBottom: 12 }}>Cerrados hoy</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, opacity: 0.62 }}>
                {completedToday.map((order) => <OrderCard key={order.id} order={order} currency={currency} />)}
              </div>
            </>
          )}
        </div>

        {/* Right: gráfica + top + export */}
        <aside style={{ width: '100%', minWidth: 0 }}>
          <SalesChart series={stats.series} totalLast14={stats.totalLast14} currency={currency} />
          {stats.topToday.length > 0 && <TopToday items={stats.topToday} />}
          <button
            onClick={downloadCsv}
            disabled={isExporting}
            className="press glass-quiet"
            style={{
              width: '100%', marginTop: 12, padding: '12px 16px', borderRadius: 14,
              border: 'none', cursor: isExporting ? 'wait' : 'pointer',
              color: 'var(--u-text-2)', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: isExporting ? 0.7 : 1,
            }}
          >
            {isExporting ? 'Exportando…' : '⬇ Exportar CSV (30 días)'}
          </button>
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

function SalesChart({ series, totalLast14, currency }: { series: DaySale[]; totalLast14: number; currency: PanelCurrency }) {
  const max = Math.max(...series.map((d) => d.total), 1);

  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 12 }}>
      <div>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Ventas · 14 días</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--u-text)', marginTop: 4, lineHeight: 1 }}>
          {fmtMoney(totalLast14, currency, 0)}
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
                title={`${day.label}: ${fmtMoney(day.total, currency)}`}
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
