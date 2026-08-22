'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import OrderCard, { printKitchenTicket, type PanelCurrency } from '@/components/admin/order-card';
import { isKitchenAutoPrintEnabled, markKitchenPrinted } from '@/lib/printing';
import { Icon } from '@/components/icons';
import { getOrdersPdfData, exportOrdersXlsx, updateOrderStatus } from '@/lib/actions/orders';
import { createDoc, drawPdfHeader, brandedAutoTable, finalizePdf } from '@/lib/documents/pdf';
import { formatDocMoney, longDate } from '@/lib/documents/format';
import type { TicketFormat } from '@/lib/escpos';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import { Stat, StatGroup } from '@/components/ui/stat';
import type { OrderWithItems, OrderStats } from '@/lib/db/orders';
import type { Order } from '@/types';

/** Tipo de servicio tal como lo guarda la tabla `orders` (no confundir con el
 *  `OrderType` en minúsculas de la configuración del tema). */
type ServiceType = Order['order_type'];

interface Props {
  activeOrders:   OrderWithItems[];
  closedToday:    OrderWithItems[];
  restaurantId:   string;
  restaurantName: string;
  stats:          OrderStats;
  currency:       PanelCurrency;
  timezone:       string;
  /** Umbrales del semáforo de cocina (Personalización → Cocina). */
  kitchenYellowMin?: number;
  kitchenRedMin?:    number;
  /** El restaurante usa el Agente Leogin para cocina / caja (evita doble impresión). */
  agentKitchen?:      boolean;
  agentReceipt?:      boolean;
  autoConfirmEnabled?: boolean;
  autoConfirmMinutes?: number;
  /** Repartidores activos, para asignar entregas (Fase 2). Lista vacía = el
   *  restaurante no usa reparto propio y no se muestra el selector. */
  drivers?: { id: string; nombre: string }[];
}

/* El sonido y el aviso visual de "pedido nuevo" ya NO viven aquí: los maneja
   NewOrdersAlert (components/admin/new-orders-alert.tsx), montado en el
   AdminShell y por tanto presente en todo el panel. Este componente sonaba en
   /admin/pedidos y notifications.tsx en el resto de pantallas, cada uno con su
   propio freno de ráfagas — dos dueños del mismo evento que podían encimarse.
   Ahora hay un solo dueño, con dedup por id de pedido y entre pestañas. Aquí
   solo queda refrescar los datos y programar la auto-confirmación. */

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

export default function OrdersPanel(props: Props) {
  return <OrdersPanelInner {...props} />;
}

/* ── Etapas del tablero ───────────────────────────────────────
   El tablero se lee de izquierda a derecha como avanza el servicio, y cada
   etapa dice qué hay que HACER con lo que tiene dentro. Antes era una sola
   rejilla de "En curso" mezclando pedidos recién entrados con pedidos ya
   listos esperando a que alguien los llevara: para saber qué atender había
   que leer tarjeta por tarjeta. */

type StageId = 'nuevos' | 'cocina' | 'listos';

const STAGES: { id: StageId; title: string; hint: string; statuses: string[] }[] = [
  { id: 'nuevos', title: 'Por enviar a cocina', hint: 'Revísalos y mándalos a cocina', statuses: ['NEW'] },
  { id: 'cocina', title: 'En cocina',           hint: 'Preparándose ahora',            statuses: ['PREP'] },
  { id: 'listos', title: 'Listos para entregar', hint: 'Sácalos ya: se enfrían',       statuses: ['READY', 'TRANSIT'] },
];

const TYPE_FILTERS: { id: 'ALL' | ServiceType; label: string; icon: string }[] = [
  { id: 'ALL',      label: 'Todos',       icon: 'list' },
  { id: 'DINE_IN',  label: 'En local',    icon: 'utensils' },
  { id: 'PICKUP',   label: 'Para llevar', icon: 'bag' },
  { id: 'DELIVERY', label: 'Domicilio',   icon: 'truck' },
];

function OrdersPanelInner({
  activeOrders, closedToday, restaurantId, restaurantName, stats, currency, timezone,
  kitchenYellowMin = 10, kitchenRedMin = 20,
  agentKitchen = false, agentReceipt = false,
  autoConfirmEnabled = false, autoConfirmMinutes = 1,
  drivers = [],
}: Props) {
  const router = useRouter();
  const toastManager = useToastManager();

  const ticketFormat: TicketFormat = useMemo(
    () => ({ timezone, locale: currency.locale || 'es-GT' }),
    [timezone, currency.locale],
  );

  // Reloj compartido: UN intervalo para todas las tarjetas (no uno por tarjeta).
  // Arranca en null para que servidor y primer render pinten lo mismo.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  const [typeFilter, setTypeFilter] = useState<'ALL' | ServiceType>('ALL');
  const [showClosed, setShowClosed] = useState(false);

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
      activeOrders.filter((o) => o.status === 'NEW').forEach((o) => {
        scheduleAutoConfirm(o.id, o.created_at);
      });
    }
    const timers = autoTimers.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  // Solo al montar: activeOrders y autoConfirm* son props de servidor, estables.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* ── Comanda por navegador (Web USB), para locales sin Agente ───────────
     Antes la disparaba el botón "Confirmar" de la tarjeta. Eso dejaba fuera
     todo pedido que entrara a cocina por otra vía: el que toma un mesero (que
     ya nace enviado a cocina), el que confirma la pantalla de cocina y el que
     sincroniza la cola offline. Ahora el disparador es el HECHO —"este pedido
     está en cocina"— y no un botón concreto. Una sola vez por pedido y por
     dispositivo (markKitchenPrinted). */
  const printedSweep = useRef(false);
  useEffect(() => {
    if (agentKitchen) return;              // lo imprime el Agente en el servidor
    if (!isKitchenAutoPrintEnabled()) return; // este dispositivo no imprime cocina
    const inKitchen = activeOrders.filter((o) => o.status === 'PREP');

    if (!printedSweep.current) {
      // Primera pasada tras abrir/recargar la pantalla: lo que ya llevaba rato
      // en cocina es historial y su papel ya salió — se marca como impreso sin
      // imprimir, o abrir el panel escupiría una pila de comandas viejas. Solo
      // se imprime lo que acaba de entrar (menos de 2 minutos).
      printedSweep.current = true;
      const RECIENTE_MS = 2 * 60_000;
      inKitchen.forEach((o) => {
        const firedAt = new Date(o.accepted_at ?? o.created_at).getTime();
        if (Date.now() - firedAt > RECIENTE_MS) markKitchenPrinted(o.id);
      });
    }

    inKitchen.forEach((o) => printKitchenTicket(o, restaurantName, ticketFormat));
  }, [activeOrders, agentKitchen, restaurantName, ticketFormat]);

  const [isExportingXls, startExportXls] = useTransition();
  const [isExportingPdf, startExportPdf] = useTransition();

  const showToast = useCallback((msg: string, type: 'error' | 'success' | 'info' = 'info') => {
    toastManager.add({ title: msg, type });
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
            // Sin chime ni toast: NewOrdersAlert ya muestra una tarjeta
            // persistente y suena una sola vez por pedido.
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
  }, [restaurantId, refreshSoon, scheduleAutoConfirm, cancelAutoConfirm]);

  function downloadExcel() {
    startExportXls(async () => {
      const res = await exportOrdersXlsx(restaurantId, 30);
      if (res.error || !res.xlsx) { showToast(res.error ?? 'No se pudo exportar.', 'error'); return; }
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
      showToast('Excel descargado', 'success');
    });
  }

  function downloadPdf() {
    startExportPdf(async () => {
      const res = await getOrdersPdfData(restaurantId, 30);
      if ('error' in res) { showToast(res.error, 'error'); return; }
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
      showToast('PDF descargado', 'success');
    });
  }

  const visibleActive = typeFilter === 'ALL'
    ? activeOrders
    : activeOrders.filter((o) => o.order_type === typeFilter);
  const visibleClosed = typeFilter === 'ALL'
    ? closedToday
    : closedToday.filter((o) => o.order_type === typeFilter);

  // SERVED es un limbo útil: el plato ya está en la mesa pero la cuenta sigue
  // abierta. No estorba en el tablero de etapas (no hay nada que hacer con él
  // hasta que el mesero cierre la mesa), pero tampoco está cerrado.
  const servedOpen = visibleActive.filter((o) => o.status === 'SERVED');

  const cardProps = {
    currency, restaurantName, ticketFormat, now,
    kitchenYellowMin, kitchenRedMin,
    agentKitchen, agentReceipt,
    drivers, restaurantId,
  };

  const countByType = (t: 'ALL' | ServiceType) =>
    t === 'ALL' ? activeOrders.length : activeOrders.filter((o) => o.order_type === t).length;

  return (
    <>
      {/* KPIs — calculados en el servidor con la zona horaria del restaurante */}
      <StatGroup className="mb-4.5">
        <Stat label={`Ventas hoy (${stats.todayOrders} pedidos)`} value={fmtMoney(stats.todaySales, currency)} />
        <Stat label={`Pedidos hoy (${activeOrders.length} en curso)`} value={String(stats.todayOrders)} />
        <Stat label="Ticket promedio hoy" value={fmtMoney(stats.todayTicket, currency)} />
        <Stat label="En cocina (preparándose ahora)" value={String(activeOrders.filter((o) => o.status === 'PREP').length)} />
      </StatGroup>

      {/* Board + sidebar */}
      <div className="orders-grid">
        {/* Left: tablero de pedidos por etapa */}
        <div style={{ minWidth: 0 }}>
          {/* Filtro por tipo de servicio: un local con mucho domicilio necesita
              poder mirar SOLO domicilio sin que el resto le estorbe. */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {TYPE_FILTERS.map((f) => {
              const on = typeFilter === f.id;
              const n = countByType(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTypeFilter(f.id)}
                  className="press"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 13px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                    fontSize: 12.5, fontWeight: 600,
                    border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                    background: on ? 'var(--adm-accent-500, var(--brand-accent))' : 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                    color: on ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                  }}
                >
                  <Icon name={f.icon} size={13} />
                  {f.label}
                  <span style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </button>
              );
            })}
          </div>

          {visibleActive.length === 0 ? (
            <Card className="mb-7 p-10 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text-2)', marginBottom: 4 }}>Todo al día</div>
              No hay pedidos en curso{typeFilter !== 'ALL' ? ' de este tipo' : ''}.
            </Card>
          ) : (
            STAGES.map((stage) => {
              const orders = visibleActive.filter((o) => stage.statuses.includes(o.status));
              if (orders.length === 0) return null;
              return (
                <section key={stage.id} style={{ marginBottom: 26 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <h2 className="t-poster" style={{ fontSize: 18 }}>
                      {stage.title}
                      <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>
                        {orders.length}
                      </span>
                    </h2>
                    <span className="t-kicker" style={{ fontSize: 10 }}>{stage.hint}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
                    {orders.map((order) => <OrderCard key={order.id} order={order} {...cardProps} />)}
                  </div>
                </section>
              );
            })
          )}

          {servedOpen.length > 0 && (
            <section style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <h2 className="t-poster" style={{ fontSize: 18 }}>
                  Servidos, mesa abierta
                  <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>
                    {servedOpen.length}
                  </span>
                </h2>
                <span className="t-kicker" style={{ fontSize: 10 }}>Se cierran al liberar la mesa</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12, opacity: 0.8 }}>
                {servedOpen.map((order) => <OrderCard key={order.id} order={order} {...cardProps} />)}
              </div>
            </section>
          )}

          {visibleClosed.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '10px 14px', marginBottom: 12, borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
                  color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                <Icon name={showClosed ? 'chevronDown' : 'chevronRight'} size={14} />
                Cerrados hoy
                <span className="t-mono" style={{ color: 'var(--u-text-3)' }}>{visibleClosed.length}</span>
              </button>
              {showClosed && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12, opacity: 0.7 }}>
                  {visibleClosed.map((order) => <OrderCard key={order.id} order={order} {...cardProps} />)}
                </div>
              )}
            </section>
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
