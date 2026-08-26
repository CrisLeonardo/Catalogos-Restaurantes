'use client';

/* Tomar pedidos — el armazón de dos paneles.
   ══════════════════════════════════════════════════════════════════
   Esta pantalla dejó de ser un asistente de tres pasos (Mesa → Menú →
   Revisar) y pasó a ser un solo sitio donde el salón y la comanda se
   ven a la vez:

     · el RIEL de la izquierda dice qué hay (mesas, o todo lo que está
       en marcha). Nunca navega: solo cambia qué está elegido;
     · el PANEL de la derecha es el objeto elegido. Sin nada elegido
       no se queda en blanco: contesta "¿quién me necesita ahora?".

   Por debajo de 1024 px se pliega: el riel ES la pantalla y elegir una
   mesa la sustituye por su comanda. Es el mismo marcado y los mismos
   componentes, no un segundo diseño (ver `.wp` en globals.css).

   Este archivo es el orquestador: guarda el estado, habla con el
   servidor y reparte. Lo que se ve vive en components/admin/waiter/.

   ── Lo que NO cambió ──────────────────────────────────────────────
   El borrador que rescata la comanda a medias, la cola sin conexión
   con identificador idempotente y su respaldo contra el hub del local,
   la anulación con motivo y PIN, dividir la cuenta, el plano del salón
   con zoom y niveles. Cambió dónde se tocan, no qué hacen. */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { Icon } from '@/components/icons';
import { createWaiterOrder, updateOrderStatus, freeTable, getTableBill, archiveAbandonedTables } from '@/lib/actions/orders';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { getQueuedOrders, saveQueuedOrder, removeQueuedOrder } from '@/lib/order-queue';
import WaiterBill, { clearSavedSplit } from '@/components/admin/waiter-bill';
import VoidOrderDialog from '@/components/admin/void-order-dialog';
import ProductOptionsModal from '@/components/admin/waiter/product-options-modal';
import Rail, { type RailTab } from '@/components/admin/waiter/rail';
import AttentionPane from '@/components/admin/waiter/attention-pane';
import ComandaPane from '@/components/admin/waiter/comanda-pane';
import TableJump from '@/components/admin/waiter/table-jump';
import { money, newLineId, lineDetail, type CartLine } from '@/components/admin/waiter/cart';
import { usePaneHeight } from '@/components/admin/waiter/use-pane-height';
import { useServiceMode } from '@/components/admin/service-mode';
import {
  selectionFromParams, selectionToQuery, sameSelection,
  type Selection, type PedidoRow,
} from '@/components/admin/waiter/types';
import { tablesWithState, needsAttention, fmtMin } from '@/lib/table-state';
import { STATUS_LABEL_SHORT } from '@/lib/order-status';
import type { Category, Product, ProductOptionGroup, OrderStatus } from '@/types';
import type { FloorPlan } from '@/lib/theme/defaults';
import type { OrderWithItems, TableOccupancy, TableCall } from '@/lib/db/orders';
import type { PanelCurrency } from '@/components/admin/order-card';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Borrador del pedido en curso ──────────────────────────────
   El carrito vive en memoria: sin esto, tocar "Menú" o "Negocio" en la
   barra inferior del panel se llevaba por delante una comanda de doce
   platos sin decir una palabra. Se guarda en el propio aparato (no en
   la nube: es un borrador, no un pedido) y caduca en 6 h —un turno—,
   para que nadie se encuentre mañana con el carrito de anoche.

   Desde el rediseño se guarda el mapa ENTERO de carritos, no uno solo:
   ahora cada mesa acumula el suyo. */
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

/** Carrito por objeto elegido: "mesa-4", "llevar". */
type CartMap = Record<string, CartLine[]>;

interface OrderDraft {
  carts: CartMap;
  guestName: string;
  notes: string;
  savedAt: number;
}

function draftKey(restaurantId: string, waiterId: string): string {
  return `leogin:waiter-draft:${restaurantId}:${waiterId}`;
}

function contarCarts(carts: CartMap): number {
  return Object.values(carts).reduce((s, c) => s + c.reduce((n, l) => n + l.quantity, 0), 0);
}

function readDraft(restaurantId: string, waiterId: string): OrderDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(restaurantId, waiterId));
    if (!raw) return null;
    const d = JSON.parse(raw) as OrderDraft;
    if (!d.carts || typeof d.carts !== 'object' || contarCarts(d.carts) === 0) return null;
    if (!d.savedAt || Date.now() - d.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(restaurantId, waiterId));
      return null;
    }
    return d;
  } catch { return null; }
}

/** Qué carrito le toca a cada selección. "" = nada elegido, sin carrito. */
function cartKey(sel: Selection): string {
  if (sel.kind === 'mesa') return `mesa-${sel.n}`;
  if (sel.kind === 'llevar') return 'llevar';
  return '';
}

interface Props {
  waiterId: string;
  waiterName: string;
  restaurantId: string;
  restaurantName: string;
  categories: Category[];
  products: Product[];
  initialOrders: OrderWithItems[];
  /** Mesa → qué hay en ella (desde cuándo, quién atiende, estado, total). */
  occupiedSince: Record<number, TableOccupancy>;
  /** Mesa → llamada del comensal sin resolver (migración 048 + 122). */
  tableCalls: Record<number, TableCall>;
  tableCount: number;
  tipEnabled: boolean;
  tipEnabledPickup: boolean;
  pickupEnabled: boolean;
  tipPercent: number;
  currency: PanelCurrency;
  floorPlan: FloorPlan | null;
  /** Hub local del restaurante (Fase 2 offline) — respaldo cuando la nube
      no responde, antes de encolar el pedido en este dispositivo. */
  hubUrl: string | null;
  hubToken: string | null;
}

/** Objetivo de un modal de anulación en curso: null = cerrado. */
type VoidTarget = {
  orderId: string;
  orderStatus: OrderStatus;
  /** null = anular el pedido completo. */
  item: { id: string; name: string; remainingQty: number } | null;
};

/** El panel derecho: la comanda, o la cuenta de esa misma mesa. */
type PaneMode = 'comanda' | 'cobrar';

export default function WaiterPanel({
  waiterId, waiterName, restaurantId, restaurantName,
  categories, products, initialOrders, occupiedSince, tableCalls,
  tableCount, tipEnabled, tipEnabledPickup, pickupEnabled, tipPercent, currency, floorPlan,
  hubUrl, hubToken,
}: Props) {
  const router = useRouter();
  /* Pantalla completa sin chrome del panel. `null` donde no existe
     (la vista previa del editor de temas). */
  const servicio = useServiceMode();

  /* ── Qué está elegido ──────────────────────────────────────── */
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [railTab, setRailTab] = useState<RailTab>('sala');
  const [paneMode, setPaneMode] = useState<PaneMode>('comanda');
  const [planMode, setPlanMode] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);

  /* La selección vive TAMBIÉN en la URL, para que recargar la tablet a
     media comanda no pierda la mesa. Se escribe con history.replaceState
     y no con router.replace a propósito: lo segundo vuelve a pedir la
     página al servidor en cada toque de mesa, y en una tablet eso son
     cientos de viajes por turno para no cambiar ni un dato. */
  useEffect(() => {
    setSelection(selectionFromParams(new URLSearchParams(window.location.search), tableCount));
  }, [tableCount]);

  const elegir = useCallback((sel: Selection) => {
    setSelection((prev) => (sameSelection(prev, sel) ? prev : sel));
    setPaneMode('comanda');
    const q = selectionToQuery(sel);
    window.history.replaceState(null, '', `${window.location.pathname}${q}`);
  }, []);

  /* ── El pedido que se está apuntando ───────────────────────── */
  const [carts, setCarts] = useState<CartMap>({});
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [productModal, setProductModal] = useState<Product | null>(null);
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [submitting, startSubmit] = useTransition();
  const [aviso, setAviso] = useState<{ text: string; bad: boolean } | null>(null);

  const key = cartKey(selection);
  const cart = useMemo(() => carts[key] ?? [], [carts, key]);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const totalPendiente = contarCarts(carts);

  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [, startStatus] = useTransition();
  const [queuedCount, setQueuedCount] = useState(0);
  const retryingQueueRef = useRef(false);

  /* ── Borrador y salida protegida ──────────────────────────── */
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  /* ── Anulación (motivo + aprobación) ─────────────────────── */
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);

  /* ── Cuenta de la mesa elegida ────────────────────────────── */
  const [tableOrders, setTableOrders] = useState<OrderWithItems[] | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);
  const [freeing, startFree] = useTransition();

  /* ── Archivar mesas abandonadas (>24 h) ───────────────────── */
  const [archiving, startArchive] = useTransition();
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  /* Al entrar: ¿quedó un pedido sin enviar de la última vez? No se
     restaura solo —aparecer con platos que uno no acaba de tocar asusta
     más de lo que ayuda—: se ofrece y el mesero decide. */
  useEffect(() => {
    setDraft(readDraft(restaurantId, waiterId));
  }, [restaurantId, waiterId]);

  /* Guardar el borrador en cuanto cambie algo del pedido. */
  useEffect(() => {
    const k = draftKey(restaurantId, waiterId);
    try {
      if (contarCarts(carts) === 0) { localStorage.removeItem(k); return; }
      const d: OrderDraft = { carts, guestName, notes, savedAt: Date.now() };
      localStorage.setItem(k, JSON.stringify(d));
    } catch { /* modo privado / cuota llena: el borrador es un extra */ }
  }, [carts, guestName, notes, restaurantId, waiterId]);

  /* Salir del panel con el carrito lleno pide confirmación. El
     disparador real son los destinos de la barra inferior, que están a
     un dedo del botón de enviar. Se intercepta en fase de CAPTURA para
     llegar antes que el <Link> de Next. */
  useEffect(() => {
    if (totalPendiente === 0) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href.startsWith('/admin/mesero')) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ''; }
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [totalPendiente]);

  function resumeDraft() {
    if (!draft) return;
    setCarts(draft.carts);
    setGuestName(draft.guestName);
    setNotes(draft.notes);
    setDraft(null);
    // Lleva al mesero donde lo dejó: la primera mesa con algo apuntado.
    const primera = Object.keys(draft.carts).find((k2) => (draft.carts[k2]?.length ?? 0) > 0);
    if (primera === 'llevar') elegir({ kind: 'llevar' });
    else if (primera?.startsWith('mesa-')) elegir({ kind: 'mesa', n: Number(primera.slice(5)) });
  }

  function discardDraft() {
    try { localStorage.removeItem(draftKey(restaurantId, waiterId)); } catch { /* nada que limpiar */ }
    setDraft(null);
  }

  /* ── Los pedidos de la mesa elegida ────────────────────────── */
  const loadTableBill = useCallback(async (n: number) => {
    setBillLoading(true);
    setBillError(null);
    const res = await getTableBill(restaurantId, n);
    setBillLoading(false);
    if ('error' in res) { setBillError(res.error); setTableOrders([]); return; }
    setTableOrders(res.orders);
  }, [restaurantId]);

  /* Elegir una mesa carga lo que ya tiene. Se pide aquí y no en el
     servidor porque la selección no viaja: cambiar de mesa no vuelve a
     pedir la página (ver `elegir`).

     La dependencia es una FIRMA de la mesa, no el objeto `occupiedSince`
     entero: ese objeto se crea de nuevo en cada render del servidor, y
     el panel se refresca solo con cada aviso de Realtime y con el sondeo
     de pedidos nuevos. Atado al objeto, cada uno de esos refrescos
     disparaba otra consulta de la cuenta sin que la mesa hubiera
     cambiado. Atado a la firma, se vuelve a pedir cuando de verdad le
     pasó algo a ESTA mesa. */
  const mesaSelN = selection.kind === 'mesa' ? selection.n : null;
  const firmaMesa = useMemo(() => {
    if (mesaSelN == null) return null;
    const occ = occupiedSince[mesaSelN];
    if (!occ) return 'libre';
    return `${occ.since}|${occ.status}|${occ.itemCount}|${occ.total}|${occ.servedAt ?? ''}`;
  }, [mesaSelN, occupiedSince]);

  useEffect(() => {
    if (mesaSelN == null) { setTableOrders(null); setBillError(null); return; }
    if (firmaMesa === 'libre') { setTableOrders([]); setBillError(null); return; }
    loadTableBill(mesaSelN);
  }, [mesaSelN, firmaMesa, loadTableBill]);

  /* Coalescer de router.refresh(): una ráfaga de eventos Realtime (la cola
     del hub sincronizando 20 pedidos de golpe) disparaba un re-render
     completo POR EVENTO y congelaba la tablet. Máximo uno cada 2,5 s. */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefresh = useRef(0);
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

  /* Precalienta el hub HTTPS (DNS + permiso de red local) mientras hay
     señal, para que el respaldo funcione si el internet se cae a media
     faena. */
  useEffect(() => { warmUpHub(hubUrl); }, [hubUrl]);

  const planEnabled = !!floorPlan?.enabled && (floorPlan?.levels.length ?? 0) > 0;
  const levels = useMemo(() => floorPlan?.levels ?? [], [floorPlan]);
  const [activeLevel, setActiveLevel] = useState<string>('');
  useEffect(() => {
    setActiveLevel((prev) => (prev && levels.some((l) => l.id === prev) ? prev : levels[0]?.id ?? ''));
  }, [levels]);

  /** Reintenta los pedidos que quedaron en la cola local (sin conexión
      total: ni la nube ni el hub respondieron). Éxito o rechazo definitivo
      del servidor → fuera de la cola; fallo de red → se quedan. */
  const retryWaiterQueue = useCallback(async () => {
    if (retryingQueueRef.current) return;
    retryingQueueRef.current = true;
    try {
      for (const q of getQueuedOrders(restaurantId, 'waiter')) {
        try {
          const result = await createWaiterOrder(q.payload);
          if (result.success || result.error) {
            removeQueuedOrder(restaurantId, q.clientId, 'waiter');
          }
        } catch { /* sigue sin conexión: se reintenta en el próximo ciclo */ }
      }
    } finally {
      setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
      retryingQueueRef.current = false;
    }
  }, [restaurantId]);

  useEffect(() => {
    setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
    retryWaiterQueue();
  }, [restaurantId, retryWaiterQueue]);

  useEffect(() => {
    if (queuedCount === 0) return;
    const onOnline = () => retryWaiterQueue();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => retryWaiterQueue(), 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [queuedCount, retryWaiterQueue]);

  /* Realtime: el salón cambia aunque nadie toque esta tablet. */
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const { ready, stop: stopAuthSync } = syncRealtimeAuth(supabase);

    (async () => {
      await ready;
      if (cancelled) return;
      channel = supabase
        .channel(`waiter-orders-${waiterId}-${crypto.randomUUID().slice(0, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, refreshSoon)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, refreshSoon)
        /* Una llamada del comensal cambia el salón tanto como un pedido:
           sin esto, "pidió la cuenta" no aparecía hasta el próximo toque. */
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, refreshSoon)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'waiter_calls' }, refreshSoon)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      stopAuthSync();
    };
  }, [waiterId, refreshSoon]);

  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);

  /* Reloj de los temporizadores. Arranca en null: servidor y primer
     render del cliente pintan sin tiempo transcurrido, que es lo que
     evita el aviso de hidratación. */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearTimeout(t0); clearInterval(id); };
  }, []);

  /* ── El salón, resuelto por la regla única ─────────────────── */
  const tables = useMemo(
    () => tablesWithState(tableCount, occupiedSince, tableCalls, now),
    [tableCount, occupiedSince, tableCalls, now],
  );
  const attention = useMemo(() => needsAttention(tables), [tables]);
  const occupiedSet = useMemo(() => new Set(Object.keys(occupiedSince).map(Number)), [occupiedSince]);

  const abandonedCount = useMemo(() => {
    if (now == null) return 0;
    return Object.values(occupiedSince).filter((occ) => now - new Date(occ.since).getTime() > DAY_MS).length;
  }, [occupiedSince, now]);

  function handleArchiveAbandoned() {
    setArchiveMsg(null);
    startArchive(async () => {
      const res = await archiveAbandonedTables(restaurantId);
      if (res.error) { setArchiveMsg(res.error); return; }
      setArchiveMsg(
        res.archived && res.archived > 0
          ? `Se archivaron ${res.archived} mesa${res.archived === 1 ? '' : 's'} abandonada${res.archived === 1 ? '' : 's'}.`
          : 'No había mesas abandonadas por archivar.',
      );
      router.refresh();
    });
  }

  /* ── El carrito ────────────────────────────────────────────── */
  const setCart = useCallback((fn: (prev: CartLine[]) => CartLine[]) => {
    setCarts((prev) => {
      if (!key) return prev;
      const next = fn(prev[key] ?? []);
      if (next.length === 0) {
        const resto = { ...prev };
        delete resto[key];
        return resto;
      }
      return { ...prev, [key]: next };
    });
  }, [key]);

  function addToCart(line: CartLine) {
    setCart((prev) => {
      /* La nota entra en la clave de fusión: dos líneas con las mismas
         opciones pero notas distintas ("sin sal" vs. sin nota) son platos
         distintos para cocina y no deben mezclarse en una cantidad. */
      const idx = prev.findIndex(
        (l) => l.productId === line.productId
          && JSON.stringify(l.options) === JSON.stringify(line.options)
          && (l.note ?? '') === (line.note ?? ''),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
        return next;
      }
      return [...prev, line];
    });
  }

  function saveLine(lineId: string, updated: Omit<CartLine, 'lineId'>) {
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...updated, lineId } : l)));
  }

  function openEditLine(lineId: string) {
    const line = cart.find((l) => l.lineId === lineId);
    if (!line) return;
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    setEditingLine(line);
    setPendingQty(1);
    setProductModal(product);
  }

  function closeProductModal() {
    setProductModal(null);
    setEditingLine(null);
    setPendingQty(1);
  }

  function decLine(lineId: string) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.lineId === lineId);
      if (idx < 0) return prev;
      const next = [...prev];
      if (next[idx].quantity > 1) next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
      else next.splice(idx, 1);
      return next;
    });
  }

  function incLine(lineId: string) {
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l)));
  }

  function cartQtyOf(productId: string): number {
    return cart.reduce((s, l) => (l.productId === productId ? s + l.quantity : s), 0);
  }

  function decProduct(productId: string) {
    const line = [...cart].reverse().find((l) => l.productId === productId);
    if (line) decLine(line.lineId);
  }

  /** El buscador eligió un plato. Si tiene opciones (variantes, combo) se
      abre la hoja; si no, entra directo al carrito. */
  function handlePick(product: Product, qty: number) {
    const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
    if (groups.length === 0) {
      addToCart({
        lineId: newLineId(product.id), productId: product.id,
        name: product.name, price: product.price, quantity: qty, options: [],
      });
      return;
    }
    /* La cantidad tecleada ("3 lim") viaja a la hoja para no tener que
       volver a marcarla ahí. */
    setPendingQty(qty);
    setEditingLine(null);
    setProductModal(product);
  }

  /* `l.price` YA lleva sumado el recargo de las opciones: la hoja del plato
     lo pliega ahí al construir la línea, y `options[].priceDelta` es solo el
     desglose. Sumarlo otra vez cobraba los extras dos veces. */
  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const esLlevar = selection.kind === 'llevar';
  const tipApplies = esLlevar ? tipEnabledPickup : tipEnabled;
  const tipAmount = tipApplies && subtotal > 0 ? Math.round(subtotal * tipPercent) / 100 : 0;

  /* ── Enviar a cocina ───────────────────────────────────────── */
  async function handleSubmit() {
    if (selection.kind === 'none') return;
    if (cart.length === 0) { setAviso({ text: 'No hay platos que enviar.', bad: true }); return; }
    setAviso(null);

    const mesa = selection.kind === 'mesa' ? selection.n : null;
    const finalName = guestName.trim() || (mesa ? `Mesa ${mesa}` : 'Para llevar');
    const clientId = crypto.randomUUID();
    const enviadoDe = key;

    const input = {
      restaurantId,
      clientId,
      /* Solo lo usa el camino del hub sin conexión: la nube resuelve el
         mesero de la sesión real (ver createWaiterOrder). */
      waiterId,
      items: cart.map((l) => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
        /* El variantId es obligatorio cuando el componente tiene variantes
           (resolveItemOptions lo exige): sin él, TODO pedido de mesero con
           combo + variantes era rechazado con "Elige una variante". */
        options: l.options.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId, ...(o.variantId ? { variantId: o.variantId } : {}) })),
        ...(l.note ? { note: l.note } : {}),
      })),
      customer: {
        name: finalName,
        phone: '',
        /* Para llevar es PICKUP: no ocupa mesa, no entra al plano del salón
           y su recorrido de estados es el de mostrador, no el de mesa. */
        type: (mesa ? 'DINE_IN' : 'PICKUP') as 'PICKUP' | 'DINE_IN',
        ...(mesa ? { tableNumber: mesa } : {}),
        notes: notes.trim() || undefined,
      },
      tipAccepted: tipApplies && subtotal > 0,
    };

    /** Vacía SOLO el carrito que se acaba de enviar: las demás mesas
        siguen con lo suyo apuntado. */
    const limpiar = () => {
      setCarts((prev) => {
        const resto = { ...prev };
        delete resto[enviadoDe];
        return resto;
      });
      setNotes('');
      if (!mesa) setGuestName('');
    };

    startSubmit(async () => {
      /* WRITE-AHEAD: el pedido se guarda en la cola del aparato ANTES de
         intentar cualquier red, y solo sale de ella tras un resultado
         definitivo. Bug real reproducido en pruebas (2026-07-10): con la
         nube caída, la página murió DURANTE la ventana del respaldo
         (~2,5 s) y el pedido —que solo existía en memoria— se perdió sin
         dejar rastro. Con la cola primero, el peor caso es un pedido que
         se reenvía solo más tarde; el clientId idempotente (migración
         061) garantiza que nunca se duplica. */
      saveQueuedOrder(restaurantId, { clientId, payload: input, queuedAt: new Date().toISOString() }, 'waiter');
      try {
        const result = await createWaiterOrder(input);
        removeQueuedOrder(restaurantId, clientId, 'waiter');
        if (result.error) { setAviso({ text: result.error, bad: true }); return; }
        setAviso({ text: `Pedido ${result.orderNumber} enviado a cocina.`, bad: false });
        limpiar();
        router.refresh();
      } catch {
        /* La nube no respondió: se intenta el hub local del restaurante
           antes de dejarlo encolado en este aparato. */
        if (hubUrl) {
          const hubResult = await tryHubOrder(hubUrl, hubToken, input);
          if (hubResult?.success) {
            removeQueuedOrder(restaurantId, clientId, 'waiter');
            setAviso({ text: `Pedido ${hubResult.orderNumber} impreso — se sincroniza solo en cuanto vuelva la señal.`, bad: false });
            limpiar();
            return;
          }
        }
        setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
        setAviso({ text: 'Sin conexión: el pedido quedó guardado en este aparato y se enviará solo cuando vuelva la señal.', bad: false });
        limpiar();
      }
    });
  }

  /* Los avisos de envío se van solos: son acuse de recibo, no un estado. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.bad ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* ── Avanzar el estado de la mesa ──────────────────────────── */
  /** Los pedidos de la mesa elegida que ya están listos y nadie llevó. */
  const listosSinLlevar = useMemo(
    () => (tableOrders ?? []).filter((o) => o.status === 'READY'),
    [tableOrders],
  );

  const accionEstado = useMemo(() => {
    if (selection.kind !== 'mesa' || listosSinLlevar.length === 0) return null;
    const n = selection.n;
    return {
      label: listosSinLlevar.length === 1 ? 'Marcar servida' : `Marcar servidas (${listosSinLlevar.length})`,
      run: () => {
        startStatus(async () => {
          for (const o of listosSinLlevar) await updateOrderStatus(o.id, 'SERVED');
          loadTableBill(n);
          router.refresh();
        });
      },
    };
  }, [selection, listosSinLlevar, loadTableBill, router]);

  /* ── La lista unificada de la pestaña "Pedidos" ────────────── */
  const pedidos = useMemo<PedidoRow[]>(() => {
    const filas: PedidoRow[] = [];

    /* Mesas: salen de la ocupación, que es de TODO el restaurante — así
       se ven también las que atiende otro mesero. */
    for (const t of tables) {
      if (!t.occ) continue;
      filas.push({
        key: `mesa-${t.n}`,
        title: `Mesa ${t.n}`,
        estado: t.state.kind === 'atencion' ? t.state.short : (STATUS_LABEL_SHORT[t.occ.status] ?? ''),
        tone: t.state.kind === 'atencion' ? 'var(--brand-accent-ink)'
          : t.occ.status === 'SERVED' ? 'var(--c-ok)' : 'var(--c-warn)',
        detalle: now == null ? 'en marcha' : `hace ${fmtMin((now - new Date(t.occ.since).getTime()) / 60000)}`,
        total: money(t.occ.total, currency),
        selected: selection.kind === 'mesa' && selection.n === t.n,
        onSelect: () => elegir({ kind: 'mesa', n: t.n }),
      });
    }

    /* Lo que no es mesa: para llevar y domicilio, de este mesero. */
    for (const o of orders) {
      if (o.order_type === 'DINE_IN') continue;
      if (o.status === 'DELIVERED' || o.status === 'CANCEL') continue;
      filas.push({
        key: o.id,
        title: `${o.order_type === 'DELIVERY' ? 'Domicilio' : 'Llevar'} · ${o.customer_name ?? 'Sin nombre'}`,
        estado: STATUS_LABEL_SHORT[o.status] ?? o.status,
        tone: o.status === 'READY' ? 'var(--brand-accent-ink)' : o.status === 'SERVED' ? 'var(--c-ok)' : 'var(--c-warn)',
        detalle: now == null ? 'en marcha' : `hace ${fmtMin((now - new Date(o.created_at).getTime()) / 60000)}`,
        total: money(Number(o.total ?? 0), currency),
        selected: false,
        onSelect: () => elegir({ kind: 'llevar' }),
      });
    }

    /* Lo urgente arriba. Es la misma prioridad que usa "Te necesitan
       ahora", para que las dos listas no se contradigan. */
    const urgencia = (f: PedidoRow) => (f.tone === 'var(--brand-accent-ink)' ? 0 : f.tone === 'var(--c-warn)' ? 1 : 2);
    return filas.sort((a, b) => urgencia(a) - urgencia(b));
  }, [tables, orders, now, currency, selection, elegir]);

  const llevarEnCurso = orders.filter(
    (o) => o.order_type !== 'DINE_IN' && o.status !== 'DELIVERED' && o.status !== 'CANCEL',
  ).length;

  /* ── Atajo global: cambiar de mesa sin soltar el teclado ─────
     M de mesa, no K.

     El lienzo de diseño dibujaba ⌘K, pero Ctrl/⌘+K ya es el buscador
     global del panel (command-search.tsx:117) y lo intercepta ANTES de
     que llegue aquí — comprobado en el navegador: el salto de mesa
     sencillamente no abría. Se probó y se cambió; no volver a K. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setJumpOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Medidas del armazón ───────────────────────────────────── */
  const wpRef = useRef<HTMLDivElement | null>(null);
  const hayBanners = !!draft || queuedCount > 0 || abandonedCount > 0 || !!archiveMsg || !!aviso;
  usePaneHeight(wpRef, [hayBanners]);

  const fmt = useCallback((n: number) => money(n, currency), [currency]);

  const mesaSel = selection.kind === 'mesa' ? tables.find((t) => t.n === selection.n) ?? null : null;
  const hayDialogo = !!productModal || !!voidTarget || !!pendingHref || jumpOpen;

  const planTables = planEnabled
    ? (floorPlan?.tables ?? []).filter((t) => t.level === activeLevel && t.n <= tableCount)
    : [];
  const planFixtures = planEnabled
    ? (floorPlan?.fixtures ?? []).filter((f) => f.level === activeLevel)
    : [];

  /** Libera la mesa `n` y vuelve a "nada elegido". */
  function liberar(n: number) {
    startFree(async () => {
      const res = await freeTable(restaurantId, n);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      /* La mesa se fue: su reparto ya no le sirve a nadie, y heredarlo a
         los próximos comensales sería peor que empezar de cero. */
      clearSavedSplit(restaurantId, n);
      elegir({ kind: 'none' });
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Avisos ────────────────────────────────────────────────
          Van todos aquí arriba, con la misma forma: antes podían
          apilarse hasta cinco bandas distintas —cinco alturas, cinco
          colores, cinco clases de botón— antes de que se viera la
          primera mesa. */}
      {aviso && (
        <Banner
          tone={aviso.bad ? 'danger' : 'ok'}
          icon={aviso.bad ? 'alertCircle' : 'checkCircle'}
          text={aviso.text}
        />
      )}

      {draft && totalPendiente === 0 && (
        <Banner
          tone="warn"
          icon="alertCircle"
          text={`Quedó un pedido sin enviar: ${contarCarts(draft.carts)} platos.`}
          acciones={
            <>
              <BannerBtn onClick={resumeDraft} primary>Retomar</BannerBtn>
              <BannerBtn onClick={discardDraft}>Descartar</BannerBtn>
            </>
          }
        />
      )}

      {queuedCount > 0 && (
        <Banner
          tone="warn"
          icon="alertCircle"
          text={`${queuedCount} pedido${queuedCount === 1 ? '' : 's'} guardado${queuedCount === 1 ? '' : 's'} en este aparato, esperando señal. Se envían solos.`}
          acciones={<BannerBtn onClick={() => { retryWaiterQueue(); }}>Reintentar ahora</BannerBtn>}
        />
      )}

      {abandonedCount > 0 && (
        <Banner
          tone="danger"
          icon="alertCircle"
          text={`${abandonedCount} mesa${abandonedCount === 1 ? '' : 's'} con más de 24 h ocupada${abandonedCount === 1 ? '' : 's'} — casi seguro un pedido olvidado.`}
          acciones={
            <BannerBtn onClick={handleArchiveAbandoned} disabled={archiving} primary>
              {archiving ? 'Archivando…' : 'Archivar'}
            </BannerBtn>
          }
        />
      )}

      {archiveMsg && (
        <Banner tone="ok" icon="checkCircle" text={archiveMsg} acciones={<BannerBtn onClick={() => setArchiveMsg(null)}>Entendido</BannerBtn>} />
      )}

      {/* ── El armazón ───────────────────────────────────────── */}
      <div className="wp" ref={wpRef} data-sel={selection.kind === 'none' ? '0' : '1'}>
        <Rail
          restaurantName={restaurantName}
          tables={tables}
          attention={attention}
          selection={selection}
          tab={railTab}
          onTab={setRailTab}
          onSelectTable={(n) => elegir({ kind: 'mesa', n })}
          onSelectLlevar={() => elegir({ kind: 'llevar' })}
          pedidos={pedidos}
          llevarEnCurso={llevarEnCurso}
          pickupEnabled={pickupEnabled}
          money={fmt}
          planEnabled={planEnabled}
          planMode={planMode}
          onPlanMode={setPlanMode}
          planTables={planTables}
          planFixtures={planFixtures}
          levels={levels}
          activeLevel={activeLevel}
          onLevel={setActiveLevel}
          occupiedSet={occupiedSet}
          occupiedSince={occupiedSince}
          now={now}
        />

        {selection.kind === 'none' ? (
          <div className="wp-pane">
            <div className="wp-top">
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--u-text)' }}>Sala</span>
                <span style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginLeft: 10 }}>{waiterName}</span>
              </div>
              {servicio && (
                <button
                  type="button"
                  onClick={servicio.toggle}
                  className="press"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                    height: 36, padding: '0 13px', borderRadius: 9, cursor: 'pointer',
                    border: '1px solid var(--adm-border-2)', background: 'none',
                    color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
                  }}
                >
                  <Icon name="monitor" size={15} />
                  <span className="wp-wide-only">{servicio.active ? 'Salir del modo servicio' : 'Modo servicio'}</span>
                </button>
              )}
              {pickupEnabled && (
                <button
                  type="button"
                  onClick={() => elegir({ kind: 'llevar' })}
                  className="press btn-accent"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                    height: 36, padding: '0 15px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    fontSize: 13.5, fontWeight: 600,
                  }}
                >
                  <Icon name="plus" size={15} />
                  <span className="wp-wide-only">Pedido para llevar</span>
                  <span className="wp-phone-only">Llevar</span>
                </button>
              )}
            </div>
            <AttentionPane
              attention={attention}
              tables={tables}
              tableCount={tableCount}
              now={now}
              money={fmt}
              onSelectTable={(n) => elegir({ kind: 'mesa', n })}
              onCobrar={(n) => { elegir({ kind: 'mesa', n }); setPaneMode('cobrar'); }}
            />
          </div>
        ) : paneMode === 'cobrar' && selection.kind === 'mesa' ? (
          <div className="wp-pane">
            <div className="wp-top">
              <button
                type="button"
                onClick={() => setPaneMode('comanda')}
                className="press"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                  height: 36, padding: '0 13px', borderRadius: 9, cursor: 'pointer',
                  border: '1px solid var(--adm-border-2)', background: 'none',
                  color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
                }}
              >
                <Icon name="chevronLeft" size={15} />
                <span>Volver a la comanda</span>
              </button>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--u-text)' }}>
                  Mesa {selection.n} · cobrar
                </span>
              </div>
            </div>
            <div className="wp-scroll" style={{ padding: 16 }}>
              {billLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)' }}>Cargando la cuenta…</div>}
              {billError && <div style={{ fontSize: 13.5, color: 'var(--c-danger)' }}>{billError}</div>}
              {!billLoading && !billError && tableOrders && (
                <WaiterBill
                  restaurantId={restaurantId}
                  tableNumber={selection.n}
                  orders={tableOrders}
                  currency={currency}
                  freeing={freeing}
                  onVoidItem={setVoidTarget}
                  onFreeTable={() => liberar(selection.n)}
                />
              )}
            </div>
          </div>
        ) : (
          <ComandaPane
            titulo={selection.kind === 'mesa' ? `Mesa ${selection.n}` : 'Para llevar'}
            subtitulo={
              selection.kind === 'mesa'
                ? (mesaSel?.occ
                  ? `${mesaSel.state.label}${mesaSel.occ.waiterName ? ` · ${mesaSel.occ.waiterName}` : ''}`
                  : 'Libre · comanda nueva')
                : 'Mostrador, barra o alguien que pasa a recoger'
            }
            esMesa={selection.kind === 'mesa'}
            state={mesaSel?.state ?? null}
            tableOrders={tableOrders}
            cargando={billLoading}
            error={billError}
            cart={cart.map((l) => ({
              lineId: l.lineId,
              productId: l.productId,
              name: l.name,
              price: l.price,
              quantity: l.quantity,
              detalle: lineDetail(l),
            }))}
            subtotal={subtotal + tipAmount}
            onInc={incLine}
            onDec={decLine}
            onEdit={openEditLine}
            products={products}
            categories={categories}
            onPick={handlePick}
            qtyOf={cartQtyOf}
            onDecProduct={decProduct}
            onBack={() => elegir({ kind: 'none' })}
            onEnviar={handleSubmit}
            enviando={submitting}
            onCobrar={selection.kind === 'mesa' && !!mesaSel?.occ ? () => setPaneMode('cobrar') : null}
            onDividir={selection.kind === 'mesa' && !!mesaSel?.occ ? () => setPaneMode('cobrar') : null}
            accionEstado={accionEstado}
            onLiberar={selection.kind === 'mesa' && !!mesaSel?.occ && !freeing ? () => liberar(selection.n) : null}
            guestName={guestName}
            onGuestName={setGuestName}
            notes={notes}
            onNotes={setNotes}
            money={fmt}
            now={now}
            focoBuscador={!hayDialogo}
          />
        )}
      </div>

      {/* ── Encima de todo ───────────────────────────────────── */}
      {productModal && (
        <ProductOptionsModal
          product={productModal}
          currency={currency}
          initialLine={editingLine ?? undefined}
          initialQty={pendingQty}
          onAdd={addToCart}
          onSave={saveLine}
          onClose={closeProductModal}
        />
      )}

      {voidTarget && (
        <VoidOrderDialog
          orderId={voidTarget.orderId}
          orderStatus={voidTarget.orderStatus}
          item={voidTarget.item}
          onClose={() => setVoidTarget(null)}
          onDone={() => {
            setVoidTarget(null);
            if (selection.kind === 'mesa') loadTableBill(selection.n);
            router.refresh();
          }}
        />
      )}

      {jumpOpen && (
        <TableJump
          tables={tables}
          money={fmt}
          onPick={(n) => { setJumpOpen(false); elegir({ kind: 'mesa', n }); }}
          onClose={() => setJumpOpen(false)}
        />
      )}

      {/* Salir con la comanda a medias. El pedido NO se pierde (queda de
          borrador), pero salir sin querer en hora pico es de todos modos
          lo peor que le puede pasar a un mesero. */}
      {pendingHref !== null && (
        <div onClick={() => setPendingHref(null)} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="glass anim-slide-up waiter-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, padding: '22px 20px 28px' }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--u-text)' }}>
              Tienes un pedido a medias
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.45 }}>
              {totalPendiente} {totalPendiente === 1 ? 'plato' : 'platos'} sin enviar a cocina. Si sales ahora se
              guardan como borrador y los puedes retomar al volver.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 20 }}>
              <button type="button" onClick={() => setPendingHref(null)} className="press btn-accent" style={{ width: '100%', padding: 14, borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                Seguir con el pedido
              </button>
              <button type="button" onClick={() => { const href = pendingHref; setPendingHref(null); if (href) router.push(href); }} className="press glass-quiet" style={{ width: '100%', padding: 13, borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)' }}>
                Salir de todos modos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cuenta viva del pedido en curso para lectores de pantalla: en la
          tablet el total está a la vista, pero quien navega a oídas
          necesita que alguien se lo diga cuando cambia. */}
      <span className="sr-only" role="status" aria-live="polite">
        {cartCount === 0 ? '' : `${cartCount} platos por enviar, ${fmt(subtotal)}`}
      </span>
    </div>
  );
}

/* ── Aviso de una línea ────────────────────────────────────────
   Todos los avisos del panel tienen la misma forma. Antes cada uno se
   dibujaba por su cuenta. */
function Banner({ tone, icon, text, acciones }: {
  tone: 'ok' | 'warn' | 'danger';
  icon: 'checkCircle' | 'alertCircle';
  text: string;
  acciones?: React.ReactNode;
}) {
  const color = tone === 'ok' ? 'var(--c-ok)' : tone === 'warn' ? 'var(--c-warn)' : 'var(--c-danger)';
  return (
    <div
      role="status"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        background: `color-mix(in srgb, ${color} 9%, transparent)`,
      }}
    >
      <Icon name={icon} size={16} style={{ color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 180, fontSize: 13, fontWeight: 500, color: 'var(--u-text-2)', lineHeight: 1.45 }}>
        {text}
      </span>
      {acciones}
    </div>
  );
}

function BannerBtn({ children, onClick, primary = false, disabled = false }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press"
      style={{
        flexShrink: 0, height: 32, padding: '0 13px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
        border: primary ? 'none' : '1px solid var(--adm-border-2)',
        background: primary ? 'var(--adm-accent-500)' : 'none',
        color: primary ? '#ffffff' : 'var(--u-text-2)',
        fontSize: 13, fontWeight: 600, opacity: disabled ? 0.65 : 1,
      }}
    >
      {children}
    </button>
  );
}
