'use client';

import { useCallback, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import OrderCard, { type PanelCurrency } from '@/components/admin/order-card';
import { Icon } from '@/components/icons';
import { getOrdersPdfData, exportOrdersXlsx, updateOrderStatus } from '@/lib/actions/orders';
import { createDoc, drawPdfHeader, brandedAutoTable, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, longDate } from '@/lib/documents/format';
import { playOrderSound, loadSoundSettings } from '@/lib/sounds';
import { localDateKey } from '@/lib/hours';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToastProvider, Toaster, useToastManager } from '@/components/ui/toast';
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

/** Sonido de pedido nuevo — el MISMO de sounds.ts a propósito: respeta el
    volumen/repetición que el usuario configuró en la campana, reutiliza el
    AudioContext compartido (la versión anterior creaba un contexto NUEVO por
    cada pedido — fuga de recursos y sonidos encimados en ráfagas) y trae el
    freno de ráfagas incorporado (15 pedidos sincronizando de golpe suenan
    UNA vez, no 15). */
function chime() {
  const s = loadSoundSettings();
  playOrderSound(s.orderVolume, s.orderRepeat);
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

/** Envuelve el panel en el proveedor de notificaciones (Base UI Toast) —
    reemplaza el toast local ad-hoc (useState + setTimeout) que antes se
    reimplementaba a mano en este componente. */
export default function OrdersPanel(props: Props) {
  return (
    <ToastProvider>
      <OrdersPanelInner {...props} />
      <Toaster />
    </ToastProvider>
  );
}

function OrdersPanelInner({ initialOrders, restaurantId, restaurantName, stats, currency, timezone, agentKitchen = false, agentReceipt = false, autoConfirmEnabled = false, autoConfirmMinutes = 1 }: Props) {
  const router = useRouter();
  const toastManager = useToastManager();

  // Coalescer de router.refresh() (mismo patrón que admin/notifications.tsx):
  // en una ráfaga (15 pedidos sincronizando de golpe al volver la señal, o
  // sus 15 auto-confirmaciones venciendo juntas un minuto después) cada
  // evento disparaba un re-render COMPLETO del server component — el panel
  // se congelaba justo en el momento de mayor presión. Máximo un refresh
  // cada 2.5 s; el último evento de la ráfaga siempre queda cubierto.
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

  // ── Auto-confirm timers ────────────────────────────────────────
  const autoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoConfirmEnabledRef = useRef(autoConfirmEnabled);
  const autoConfirmMinutesRef = useRef(autoConfirmMinutes);
  useEffect(() => { autoConfirmEnabledRef.current = autoConfirmEnabled; }, [autoConfirmEnabled]);
  useEffect(() => { autoConfirmMinutesRef.current = autoConfirmMinutes; }, [autoConfirmMinutes]);

  const cancelAutoConfirm = useCallback((orderId: string) => {
    const t = autoTimers.current.get(orderId);
    if (t) { clearTimeout(t); autoTimers.current.delete(orderId); }
  }, []);

  const scheduleAutoConfirm = useCallback((orderId: string, createdAt: string) => {
    if (!autoConfirmEnabledRef.current) return;
    cancelAutoConfirm(orderId);
    const elapsed = Date.now() - new Date(createdAt).getTime();
    const delay   = Math.max(0, autoConfirmMinutesRef.current * 60_000 - elapsed);
    autoTimers.current.set(orderId, setTimeout(async () => {
      autoTimers.current.delete(orderId);
      await updateOrderStatus(orderId, 'PREP');
      refreshSoon();
    }, delay));
  }, [cancelAutoConfirm, refreshSoon]);

  // Programar para pedidos NEW que ya llegaron al montar el panel.
  useEffect(() => {
    if (autoConfirmEnabled) {
      initialOrders.filter((o) => o.status === 'NEW').forEach((o) => {
        scheduleAutoConfirm(o.id, o.created_at);
      });
    }
    const timers = autoTimers.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  // Solo al montar: initialOrders y autoConfirm* son props de servidor, estables.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isExportingXls, startExportXls] = useTransition();
  const [isExportingPdf, startExportPdf] = useTransition();
  const orders = initialOrders;

  const showToast = useCallback((msg: string) => {
    toastManager.add({ title: msg, type: 'info' });
  }, [toastManager]);

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
            refreshSoon();
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
            refreshSoon();
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
  }, [restaurantId, refreshSoon, scheduleAutoConfirm, cancelAutoConfirm, showToast]);

  function downloadExcel() {
    startExportXls(async () => {
      const res = await exportOrdersXlsx(restaurantId, 30);
      if (res.error || !res.xlsx) { showToast(res.error ?? 'No se pudo exportar.'); return; }
      const binary = atob(res.xlsx);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename ?? 'pedidos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function downloadPdf() {
    startExportPdf(async () => {
      const res = await getOrdersPdfData(restaurantId, 30);
      if ('error' in res) { showToast(res.error); return; }
      const { rows, branding, filename } = res;

      const doc = await createDoc({ format: 'a4', orientation: 'l' });
      const y = await drawPdfHeader(doc, {
        branding,
        title: 'Listado de pedidos',
        subtitle: `Últimos 30 días · ${rows.length} pedido${rows.length === 1 ? '' : 's'}`,
      });

      await brandedAutoTable(doc, branding, {
        startY: y,
        head: [['Número', 'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Tipo', 'Estado', 'Productos', 'Subtotal', 'Envío', 'Total', 'Notas']],
        body: rows.map((r) => [
          r.orderNumber, r.date, r.time, r.customerName, r.customerPhone, r.orderType, r.status, r.items,
          formatDocMoney(r.subtotal, branding), formatDocMoney(r.deliveryFee, branding), formatDocMoney(r.total, branding), r.notes,
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.6 },
        columnStyles: { 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } },
      });

      finalizePdf(doc, { branding, generatedAtLabel: longDate(new Date().toISOString()) });
      doc.save(`${filename}.pdf`);
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Kpi label="Ventas hoy" value={fmtMoney(stats.todaySales, currency)} sub={`${stats.todayOrders} pedidos`} hero />
        <Kpi label="Pedidos hoy" value={String(stats.todayOrders)} sub={`${active.length} activos`} />
        <Kpi label="Ticket promedio hoy" value={fmtMoney(stats.todayTicket, currency)} sub="por pedido" />
        <Kpi label="En preparación" value={String(enPrep)} sub="en la barra" />
      </div>

      {/* Board + sidebar */}
      <div className="orders-grid">
        {/* Left: tablero de pedidos */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="t-poster" style={{ fontSize: 20 }}>En curso</h2>
            <span className="t-kicker" style={{ fontSize: 10 }}>{active.length} pedidos</span>
          </div>
          {active.length === 0 ? (
            <Card className="mb-7 p-10 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
              Todo al día. No hay pedidos en curso.
            </Card>
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
          <div className="mt-3 flex gap-2">
            <Button
              onClick={downloadExcel}
              disabled={isExportingXls || isExportingPdf}
              variant="secondary"
              size="sm"
              className="flex-1"
            >
              {isExportingXls ? '…' : <><Icon name="download" size={13} /> Excel</>}
            </Button>
            <Button
              onClick={downloadPdf}
              disabled={isExportingXls || isExportingPdf}
              variant="secondary"
              size="sm"
              className="flex-1"
            >
              {isExportingPdf ? '…' : <><Icon name="download" size={13} /> PDF</>}
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── Kpi card ─────────────────────────────────────────────── */

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <Card className="p-0">
      <CardContent className="flex flex-col gap-2.5 p-5">
        <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
        <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--ui-font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 26 : 22, color: 'var(--u-text)', lineHeight: 1.15, letterSpacing: hero ? '-0.02em' : '-0.01em' }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

/* ── Gráfica 14 días ──────────────────────────────────────── */

import type { DaySale, TopProduct } from '@/lib/db/orders';

function SalesChart({ series, totalLast14, currency }: { series: DaySale[]; totalLast14: number; currency: PanelCurrency }) {
  const max = Math.max(...series.map((d) => d.total), 1);

  return (
    <Card className="mb-3 flex flex-col gap-4 p-5">
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
                  background: day.isToday ? 'var(--adm-accent-500, var(--u-text))' : 'color-mix(in srgb, var(--u-text) 14%, transparent)',
                  transition: 'height 400ms var(--ease-entry)',
                }}
                title={`${day.label}: ${fmtMoney(day.total, currency)}`}
              />
              <span
                className="t-mono"
                style={{ fontSize: 8.5, color: day.isToday ? 'var(--adm-accent-500, var(--u-text))' : 'var(--u-text-4)', fontWeight: day.isToday ? 700 : 500 }}
              >
                {day.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Top de hoy ───────────────────────────────────────────── */

function TopToday({ items }: { items: TopProduct[] }) {
  return (
    <Card className="flex flex-col gap-3.5 p-5">
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
    </Card>
  );
}
