'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import OrderCard, { type PanelCurrency } from '@/components/admin/order-card';
import { Icon } from '@/components/icons';
import { exportOrdersStructured, updateOrderStatus } from '@/lib/actions/orders';
import { localDateKey } from '@/lib/hours';
import type { OrderWithItems, OrderStats } from '@/lib/db/orders';
import type { Order } from '@/types';

interface Props {
  initialOrders:  OrderWithItems[];
  restaurantId:   string;
  restaurantName: string;
  stats:          OrderStats;
  currency:       PanelCurrency;
  timezone:       string;
  /** El restaurante usa el Agente Leogin para cocina / caja (evita doble impresión). */
  agentKitchen?:      boolean;
  agentReceipt?:      boolean;
  autoConfirmEnabled?: boolean;
  autoConfirmMinutes?: number;
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

export default function OrdersPanel({ initialOrders, restaurantId, restaurantName, stats, currency, timezone, agentKitchen = false, agentReceipt = false, autoConfirmEnabled = false, autoConfirmMinutes = 1 }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-confirm timers ────────────────────────────────────────
  const autoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoConfirmEnabledRef = useRef(autoConfirmEnabled);
  const autoConfirmMinutesRef = useRef(autoConfirmMinutes);
  useEffect(() => { autoConfirmEnabledRef.current = autoConfirmEnabled; }, [autoConfirmEnabled]);
  useEffect(() => { autoConfirmMinutesRef.current = autoConfirmMinutes; }, [autoConfirmMinutes]);

  function cancelAutoConfirm(orderId: string) {
    const t = autoTimers.current.get(orderId);
    if (t) { clearTimeout(t); autoTimers.current.delete(orderId); }
  }

  function scheduleAutoConfirm(orderId: string, createdAt: string) {
    if (!autoConfirmEnabledRef.current) return;
    cancelAutoConfirm(orderId);
    const elapsed = Date.now() - new Date(createdAt).getTime();
    const delay   = Math.max(0, autoConfirmMinutesRef.current * 60_000 - elapsed);
    autoTimers.current.set(orderId, setTimeout(async () => {
      autoTimers.current.delete(orderId);
      await updateOrderStatus(orderId, 'PREP');
      router.refresh();
    }, delay));
  }

  // Programar para pedidos NEW que ya llegaron al montar el panel.
  useEffect(() => {
    if (autoConfirmEnabled) {
      initialOrders.filter((o) => o.status === 'NEW').forEach((o) => {
        scheduleAutoConfirm(o.id, o.created_at);
      });
    }
    return () => { autoTimers.current.forEach(clearTimeout); autoTimers.current.clear(); };
  // Solo al montar: initialOrders y autoConfirm* son props de servidor, estables.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isExportingXls, startExportXls] = useTransition();
  const [isExportingPdf, startExportPdf] = useTransition();
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000;
    // RLS filtra los eventos por usuario: sin el JWT de la sesión en el
    // canal realtime no llega NADA, y ese JWT debe refrescarse o caduca
    // a la hora (ver lib/supabase/realtime-auth.ts).
    const { ready, stop: stopAuthSync } = syncRealtimeAuth(supabase);

    function connect() {
      // Guarda contra re-entradas: unsubscribe()/removeChannel() puede disparar
      // el mismo callback de status de forma síncrona (p. ej. pasa a 'CLOSED'
      // en la misma pila que lo originó) — sin este freno, se llamaría a sí
      // mismo indefinidamente hasta reventar el stack ("Maximum call stack
      // size exceeded"). Ver admin/notifications.tsx.
      let closing = false;
      // Topic único por montaje (ver admin/notifications.tsx).
      const ch = supabase
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
            if (newOrder.status === 'NEW') scheduleAutoConfirm(newOrder.id, newOrder.created_at);
            router.refresh();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders' },
          (payload) => {
            const updated = payload.new as Order;
            if (updated.restaurant_id !== restaurantId) return;
            // Si el pedido ya no está en NEW, cancelar su timer de auto-confirm.
            if (updated.status !== 'NEW') cancelAutoConfirm(updated.id);
            router.refresh();
          },
        )
        .subscribe((status) => {
          if (cancelled || closing) return;
          if (status === 'SUBSCRIBED') { retryDelay = 2000; return; }
          // Sin reintento el canal puede quedar muerto en silencio (red
          // inestable, laptop en suspensión) hasta recargar la página
          // (ver admin/notifications.tsx). Backoff exponencial, máx 30s.
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
  }, [restaurantId, router]);

  function buildExportHtml(
    headers: string[],
    rows: string[][],
    restaurantName: string,
    forPrint: boolean,
  ): string {
    const today = new Date().toLocaleDateString('es-GT');
    const thCells = headers.map((h) => `<th>${h}</th>`).join('');
    const bodyRows = rows
      .map((r) => `<tr>${r.map((c) => `<td>${c.replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
      .join('');
    const printScript = forPrint ? '<script>window.onload=()=>{window.print();}<\/script>' : '';
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Pedidos — ${restaurantName}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
  h2 { font-size: 15px; margin: 0 0 4px; }
  p { margin: 0 0 12px; color: #555; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f0f0f0; font-weight: bold; padding: 6px 8px; border: 1px solid #ccc; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border: 1px solid #e0e0e0; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 0; } }
</style>
${printScript}
</head>
<body>
<h2>${restaurantName} — Pedidos (últimos 30 días)</h2>
<p>Generado el ${today} · ${rows.length} pedidos</p>
<table>
<thead><tr>${thCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</body>
</html>`;
  }

  function downloadExcel() {
    startExportXls(async () => {
      const res = await exportOrdersStructured(restaurantId, 30);
      if ('error' in res) { showToast(res.error); return; }
      const html = buildExportHtml(res.headers, res.rows, res.restaurantName, false);
      const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.filename}.xls`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function downloadPdf() {
    startExportPdf(async () => {
      const res = await exportOrdersStructured(restaurantId, 30);
      if ('error' in res) { showToast(res.error); return; }
      const html = buildExportHtml(res.headers, res.rows, res.restaurantName, true);
      const win = window.open('', '_blank');
      if (!win) { showToast('Permite ventanas emergentes para descargar el PDF.'); return; }
      win.document.write(html);
      win.document.close();
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
            pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="bell" size={15} /> {toast}
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
              {active.map((order) => <OrderCard key={order.id} order={order} currency={currency} restaurantName={restaurantName} agentKitchen={agentKitchen} agentReceipt={agentReceipt} />)}
            </div>
          )}
          {completedToday.length > 0 && (
            <>
              <h2 className="t-poster" style={{ fontSize: 20, marginBottom: 12 }}>Cerrados hoy</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, opacity: 0.62 }}>
                {completedToday.map((order) => <OrderCard key={order.id} order={order} currency={currency} restaurantName={restaurantName} agentKitchen={agentKitchen} agentReceipt={agentReceipt} />)}
              </div>
            </>
          )}
        </div>

        {/* Right: gráfica + top + export */}
        <aside style={{ width: '100%', minWidth: 0 }}>
          <SalesChart series={stats.series} totalLast14={stats.totalLast14} currency={currency} />
          {stats.topToday.length > 0 && <TopToday items={stats.topToday} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={downloadExcel}
              disabled={isExportingXls || isExportingPdf}
              className="press glass-quiet"
              style={{
                flex: 1, padding: '12px 10px', borderRadius: 14,
                border: 'none', cursor: isExportingXls ? 'wait' : 'pointer',
                color: 'var(--u-text-2)', fontWeight: 600, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: isExportingXls ? 0.7 : 1,
              }}
            >
              {isExportingXls ? '…' : <><Icon name="download" size={13} /> Excel</>}
            </button>
            <button
              onClick={downloadPdf}
              disabled={isExportingXls || isExportingPdf}
              className="press glass-quiet"
              style={{
                flex: 1, padding: '12px 10px', borderRadius: 14,
                border: 'none', cursor: isExportingPdf ? 'wait' : 'pointer',
                color: 'var(--u-text-2)', fontWeight: 600, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: isExportingPdf ? 0.7 : 1,
              }}
            >
              {isExportingPdf ? '…' : <><Icon name="download" size={13} /> PDF</>}
            </button>
          </div>
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
                  background: day.isToday ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 14%, transparent)',
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
