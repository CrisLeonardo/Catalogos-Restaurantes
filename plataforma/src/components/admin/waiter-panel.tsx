'use client';

/* WaiterPanel — interfaz táctil para meseros.
   ══════════════════════════════════════════════════════════════════
   Flujo guiado en pantallas completas: Mesa → Menú → Revisar, más las
   pestañas "Mis pedidos" y "Cobrar". Cada vista ocupa la pantalla
   entera, centrada en una columna cómoda (.waiter-wrap / narrow) —
   nunca un riel fijo junto a un panel. Es la vuelta al método
   original (commit 520dcdb) tras dos rediseños que el restaurante
   rechazó, esta vez alimentado por la arquitectura de datos nueva:

     · lib/table-state.ts — la única regla del estado de una mesa
       (libre / abierta / atención), con motivo;
     · el carrito es un MAPA por mesa (CartMap): cambiar de mesa nunca
       borra lo que se estaba apuntando en otra;
     · la selección vive en la URL (?mesa=4), para que recargar la
       tablet a media comanda no la pierda;
     · el borrador rescatado, la cola sin conexión con respaldo al hub
       del local, la anulación con motivo y PIN, y el archivado
       automático de mesas abandonadas — nada de esto cambió.

   Responsive: en móvil es una columna a pantalla completa; en PC/tablet
   grande el contenido se centra en una columna cómoda (.waiter-wrap) en
   vez de estirarse a todo lo ancho. Si el restaurante diseñó su plano del
   salón (config.floorPlan), las mesas se muestran colocadas como en el
   local; si no, se usa la cuadrícula automática. */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import { Icon, ICON_PATHS } from '@/components/icons';
import SalonCanvas, {
  SalonViewSwitch, SalonLegend, useSalonView,
} from '@/components/admin/salon/salon-canvas';
import { buildSalonTables, type SalonTable } from '@/components/admin/salon/pieces';
import { useSalonLive } from '@/components/admin/salon/use-salon-live';
import {
  createWaiterOrder, updateOrderStatus, freeTable, getTableBill, archiveAbandonedTables,
  serveTableReady, resolveTableCalls, setTableParty, setItemSeat, moveTableOrders,
  printTableBillShare, undoServeTable, undoResolveTableCalls,
} from '@/lib/actions/orders';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { getQueuedOrders, saveQueuedOrder, removeQueuedOrder } from '@/lib/order-queue';
import WaiterBill, { clearSavedSplit } from '@/components/admin/waiter-bill';
import VoidOrderDialog from '@/components/admin/void-order-dialog';
import ProductOptionsModal from '@/components/admin/waiter/product-options-modal';
import TableJump from '@/components/admin/waiter/table-jump';
import { parseQuery } from '@/components/admin/waiter/dish-finder';
import TableCycle from '@/components/admin/waiter/table-cycle';
import { money, newLineId, type CartLine } from '@/components/admin/waiter/cart';
import { useServiceMode } from '@/components/admin/service-mode';
import {
  selectionFromParams, selectionToQuery, sameSelection,
  type Selection,
} from '@/components/admin/waiter/types';
import { tablesWithState, tableStage, type TableWithState, type SalonUmbrales } from '@/lib/table-state';
import {
  STATUS_LABEL_SHORT, STATUS_CHIP, nextStatus, nextLabel, isCardTerminal,
  stageClock, fmtElapsed, clockChipClass,
} from '@/lib/order-status';
import type { Category, Product, ProductOptionGroup, OrderStatus } from '@/types';
import type { FloorPlan } from '@/lib/theme/defaults';
import { remainingQuantity, type OrderWithItems, type TableOccupancy, type TableCall } from '@/lib/db/orders';
import type { TableSeating } from '@/lib/db/table-sessions';
import { updateSeating } from '@/lib/actions/table-sessions';
import type { PanelCurrency } from '@/components/admin/order-card';
import type { PaymentMethod } from '@/lib/payment-method';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Borrador del pedido en curso ──────────────────────────────
   El carrito vive en memoria: sin esto, salir de la pantalla a media
   comanda se llevaba por delante una orden de doce platos sin decir
   una palabra. Se guarda en el propio aparato (no en la nube: es un
   borrador, no un pedido) y caduca en 6 h —un turno—, para que nadie
   se encuentre mañana con el carrito de anoche.

   Guarda el mapa ENTERO de carritos, no uno solo: cada mesa acumula
   el suyo, y el borrador tiene que rescatarlas todas. */
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
  /** Mesa → turno abierto sin pedido: alguien la sentó y todavía no piden
      (migración 128). Llega aquí para que el mesero NO vea libre una mesa
      que la hostess acaba de sentar — que es la mitad del hallazgo M-02:
      dos meseros yendo a la misma mesa sin saberlo. */
  seatings: Record<number, TableSeating>;
  tableCount: number;
  tipEnabled: boolean;
  tipEnabledPickup: boolean;
  pickupEnabled: boolean;
  tipPercent: number;
  currency: PanelCurrency;
  floorPlan: FloorPlan | null;
  /** Los relojes del salón de este restaurante (Ajustes › Pedidos).
      Sin ellos se usan los de fábrica: ver lib/table-state.ts. */
  umbrales?: SalonUmbrales;
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

/* ── Pantallas ────────────────────────────────────────────────
   El salón, y luego LA MESA: desde el rediseño de 2026-09-01 elegir
   una mesa ya no abre una rejilla de tarjetas, abre la pantalla de esa
   mesa ('ciclo'), que la acompaña de principio a fin —pedir, enviar,
   agregar, mover, juntar y cobrar— con una sola barra abajo que
   siempre dice el siguiente paso.

   Las demás siguen donde estaban: 'menu' es el menú completo para
   quien prefiere tocar antes que teclear, 'review' revisa el envío
   desde ahí, 'orders' son los pedidos en marcha y 'bill' el cobro y
   el reparto. */
type View = 'tables' | 'ciclo' | 'menu' | 'review' | 'orders' | 'bill';

export default function WaiterPanel({
  waiterId, waiterName, restaurantId, restaurantName,
  categories, products, initialOrders, occupiedSince, tableCalls, seatings,
  tableCount, tipEnabled, tipEnabledPickup, pickupEnabled, tipPercent, currency, floorPlan, umbrales,
  hubUrl, hubToken,
}: Props) {
  const router = useRouter();

  /* ¿Se llegó aquí desde el salón (Pedidos › Mesas) A TRABAJAR UNA MESA?
     ------------------------------------------------------------------
     Solo cuenta si la URL además traía la mesa: es la marca de «me
     mandaron a hacer ESTO», y es lo que hace que la flecha devuelva al
     salón en vez de a la lista de mesas de esta pantalla. Tocar «Tomar
     pedido» en el salón sin mesa elegida deja al mesero en su propia
     lista, y ahí la flecha correcta es la de siempre.

     Se lee UNA vez al montar y se queda: `elegir()` reescribe la barra de
     direcciones con `history.replaceState` en cada cambio de mesa, así
     que el parámetro desaparece al primer toque. Si esto lo leyera de la
     URL cada vez, el camino de vuelta se borraría solo.

     Sin esto, llegar desde una ficha del salón era una puerta de un solo
     sentido: la flecha de la cabecera devolvía a la lista de mesas de
     ESTA pantalla, no al salón del que se venía. */
  const [vueltaAlSalon, setVueltaAlSalon] = useState(false);
  const rutaNavegador = usePathname();
  const salonHref = panelHref(panelBaseFrom(rutaNavegador), '/admin/mesas');
  const volverAlSalon = useCallback(() => { router.push(salonHref); }, [router, salonHref]);
  const servicio = useServiceMode();

  const [view, setView] = useState<View>('tables');

  /* ── Qué está elegido ──────────────────────────────────────── */
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [jumpOpen, setJumpOpen] = useState(false);

  /* A qué asiento van los platos que se agreguen ahora (lienzo `3a`). Se
     elige UNA vez y lo demás se apunta solo: preguntarlo plato por plato
     es lo que hace que nadie lo use. `null` = a la mesa, sin dueño. */
  const [asiento, setAsiento] = useState<number | null>(null);

  /* ── Cuenta de mesa / dividir cuenta ──────────────────────────
     Vive aquí arriba porque el efecto de montaje ya la necesita: al
     llegar desde el salón del dueño con `?ir=cobrar`, la pantalla
     tiene que arrancar en el cobro de esa mesa, no en otra parte. */
  const [billTable, setBillTable] = useState<number | null>(null);
  const [billOrders, setBillOrders] = useState<OrderWithItems[] | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  /* La selección vive TAMBIÉN en la URL, para que recargar la tablet a
     media comanda no pierda la mesa. Se escribe con history.replaceState
     y no con router.replace a propósito: lo segundo vuelve a pedir la
     página al servidor en cada toque de mesa, y en una tablet eso son
     cientos de viajes por turno para no cambiar ni un dato.

     Al montar, si la URL trae una mesa elegida, la pantalla arranca
     directo en el menú de esa mesa en vez de en "Mesas" — solo la
     PRIMERA vez: si luego el mesero vuelve a "Mesas" a propósito, un
     cambio de `tableCount` no debe arrancarlo de nuevo. */
  const mountedSelRef = useRef(false);
  useEffect(() => {
    const sel = selectionFromParams(new URLSearchParams(window.location.search), tableCount);
    setSelection(sel);
    if (!mountedSelRef.current) {
      mountedSelRef.current = true;
      if (sel.kind !== 'none') {
        /* `?ir=` es la intención con la que se llega desde el salón del
           dueño (Pedidos › Mesas): tocar «Cobrar» en una ficha tiene que
           aterrizar en el cobro, no en una pantalla desde la que haya que
           volver a buscarlo. */
        const params = new URLSearchParams(window.location.search);
        if (params.get('volver') === 'salon') setVueltaAlSalon(true);
        const ir = params.get('ir');
        if ((ir === 'cobrar' || ir === 'dividir') && sel.kind === 'mesa') {
          setBillTable(sel.n);
          setView('bill');
        } else {
          setView('ciclo');
        }
      }
    }
  }, [tableCount]);

  const elegir = useCallback((sel: Selection) => {
    setSelection((prev) => (sameSelection(prev, sel) ? prev : sel));
    /* Cambiar de mesa vuelve el asiento a "Mesa": el 2 de la mesa 3 no
       tiene nada que ver con el 2 de la 7. */
    setAsiento(null);
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
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [submitting, startSubmit] = useTransition();
  /* `undo` sale como botón dentro del propio acuse cuando lo que se acaba
     de hacer se puede deshacer («servido», «atendida»): las dos son de un
     solo toque desde una ficha y hasta ahora no tenían vuelta atrás. */
  const [aviso, setAviso] = useState<{ text: string; bad: boolean; undo?: () => void } | null>(null);

  const key = cartKey(selection);
  const cart = useMemo(() => carts[key] ?? [], [carts, key]);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const totalPendiente = contarCarts(carts);

  /* ── Menú: buscador y categoría activa ─────────────────────── */
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [, startStatus] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const retryingQueueRef = useRef(false);

  /* ── Borrador y salida protegida ────────────────────────────── */
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  /* ── Anulación (motivo + aprobación) ───────────────────────── */
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);

  /* Mover a otra mesa o juntar con otra: las dos eligen mesa destino
     con el mismo selector, y lo único que cambia es si el destino
     puede estar ocupado. */
  const [moveMode, setMoveMode] = useState<'move' | 'merge' | null>(null);

  /* La nota de la mesa ("cumpleaños en la 7", "sin picante para todos").
     Viaja con la comanda que se envíe a continuación. */
  const [notaOpen, setNotaOpen] = useState(false);

  /* ¿Hay teclado de verdad? El buscador reclama el foco al abrir la mesa,
     y en una tablet eso levanta el teclado en pantalla y tapa media
     comanda antes de que nadie haya pedido escribir nada. Con ratón sí:
     ahí el foco es lo que permite teclear la comanda de corrido. */
  const [conTeclado, setConTeclado] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const apply = () => setConTeclado(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /* Cuánta gente se sentó en una mesa que TODAVÍA no tiene pedido. En
     cuanto la mesa se abre, el dato vive en la BD (orders.party_size);
     hasta entonces solo existe aquí, y se manda con la primera comanda.
     Sin esto habría que apuntar el primer plato antes de poder decir
     cuántos son, que es al revés de como se sienta la gente. */
  const [partyDraft, setPartyDraft] = useState<Record<number, number>>({});

  const [freeing, startFree] = useTransition();

  /* ── Archivar mesas abandonadas (>24 h) ─────────────────────── */
  const [archiving, startArchive] = useTransition();
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  /* Al entrar: ¿quedó un pedido sin enviar de la última vez? No se
     restaura solo —aparecer con platos que uno no acaba de tocar asusta
     más de lo que ayuda—: se ofrece en "Mesas" y el mesero decide. */
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
     disparador real son los destinos del panel (menú lateral del
     administrador), que están a un toque del botón de enviar. Se
     intercepta en fase de CAPTURA para llegar antes que el <Link> de
     Next. */
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
    setView('ciclo');
  }

  function discardDraft() {
    try { localStorage.removeItem(draftKey(restaurantId, waiterId)); } catch { /* nada que limpiar */ }
    setDraft(null);
  }

  /* ── La cuenta de una mesa (para "Cobrar" y para el diálogo) ── */
  const loadTableBill = useCallback(async (n: number) => {
    setBillTable(n);
    setBillLoading(true);
    setBillError(null);
    /* Con try/catch: sin él, una caída de red dejaba la cuenta en
       «Cargando…» para siempre — el mesero mirando una pantalla que no
       iba a cambiar nunca y sin nada que tocar. */
    try {
      const res = await getTableBill(restaurantId, n);
      setBillLoading(false);
      if ('error' in res) { setBillError(res.error); return; }
      setBillOrders(res.orders);
    } catch {
      setBillLoading(false);
      setBillError('No se pudo traer la cuenta. Revisa la conexión y vuelve a intentarlo.');
    }
  }, [restaurantId]);

  /* La pantalla de la mesa enseña la cuenta COMPLETA, no solo lo que
     apuntó este mesero: si el turno anterior tomó la primera ronda,
     esos platos son de la misma mesa y del mismo total. Se recarga al
     cambiar de mesa y cada vez que llegan pedidos nuevos. */
  useEffect(() => {
    if (selection.kind !== 'mesa') return;
    loadTableBill(selection.n);
  }, [selection, loadTableBill, orders]);

  /* El salón cambia aunque nadie toque esta tablet.
     El canal, el freno de ráfagas y la reconexión viven en el mismo
     sitio que los del tablero del dueño (salon/use-salon-live.ts): eran
     dos copias del mismo montaje, y solo una de las dos sabía
     reconectarse. */
  useSalonLive(`waiter-${waiterId}`);

  /* Precalienta el hub HTTPS (DNS + permiso de red local) mientras hay
     señal, para que el respaldo funcione si el internet se cae a media
     faena. */
  useEffect(() => { warmUpHub(hubUrl); }, [hubUrl]);

  /* El nivel del plano y si hay plano dibujado los resuelve ahora el
     propio lienzo (salon/salon-canvas.tsx), que es quien los dibuja. */

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

  /* ── El salón, resuelto por la regla única ───────────────────
     `tables` es el salón crudo (lo usan el salto de mesa y mover/juntar);
     `salonTables` es el mismo salón ya listo para pintar, construido con
     la MISMA función que usa el tablero del dueño — si una pantalla se
     lo montara por su cuenta volverían a contar historias distintas del
     mismo local. */
  const tables = useMemo(
    () => tablesWithState(tableCount, occupiedSince, tableCalls, now, umbrales, seatings),
    [tableCount, occupiedSince, tableCalls, now, umbrales, seatings],
  );

  /** Monto abreviado para el pin del plano: «Q412», «Q1.2k». */
  const fmtCorto = useCallback((n: number) => (
    n >= 1000
      ? `${currency.position === 'suffix' ? '' : currency.symbol}${(n / 1000).toFixed(1)}k${currency.position === 'suffix' ? currency.symbol : ''}`
      : money(n, currency, 0)
  ), [currency]);

  const salonTables = useMemo(
    () => buildSalonTables({
      tableCount,
      occupancy: occupiedSince,
      calls: tableCalls,
      now,
      floorPlan,
      money: (n) => money(n, currency),
      moneyShort: fmtCorto,
      umbrales,
      seatings,
      /* Aquí el puesto es SERVICIO: sobre una mesa libre el verbo sigue
         siendo «Abrir mesa» —voy a apuntarles ya—, no «Sentar», que es el
         trabajo del encargado en Pedidos › Mesas. Es la única palabra que
         las dos pantallas dicen distinto, y a propósito. */
      puesto: 'servicio',
    }),
    [tableCount, occupiedSince, tableCalls, now, floorPlan, currency, fmtCorto, umbrales, seatings],
  );

  const [salonView, setSalonView] = useSalonView('leogin:salon-vista-mesero', 'fichas');

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
    // El plato nace con el asiento que está elegido arriba.
    if (line.seat === undefined) line = { ...line, seat: asiento };
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

  function openEditLine(line: CartLine) {
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

  /** Agrega (o abre la hoja de opciones de) un producto con `qty` unidades. */
  function handlePick(product: Product, qty: number) {
    const groups: ProductOptionGroup[] = (product.options as ProductOptionGroup[] | null) ?? [];
    if (groups.length === 0) {
      addToCart({
        lineId: newLineId(product.id), productId: product.id,
        name: product.name, price: product.price, quantity: qty, options: [],
      });
      return;
    }
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
  const total = subtotal + tipAmount;
  /** "Mesa 4" / "Para llevar" — a dónde va este pedido. */
  const destLabel = selection.kind === 'mesa' ? `Mesa ${selection.n}` : 'Para llevar';

  /* ── Enviar a cocina ───────────────────────────────────────── */
  /** Vuelve a la pantalla de la mesa y recarga su cuenta con lo recién
      enviado. Sin la recarga, el plato que acaba de salir a cocina no
      aparecería en la comanda hasta el siguiente refresco. */
  function volverAlCiclo(mesa: number | null) {
    setView('ciclo');
    if (mesa != null) loadTableBill(mesa);
  }

  /** Las personas de la mesa elegida: lo que dice la BD manda —el turno de
      la mesa o su comanda, lo que haya— y si no hay nada escrito todavía,
      lo que el mesero acaba de anotar en este aparato. */
  const personasMesa = selection.kind === 'mesa'
    ? (Math.max(
        seatings[selection.n]?.partySize ?? 0,
        occupiedSince[selection.n]?.partySize ?? 0,
      ) || partyDraft[selection.n] || null)
    : null;

  function handleSubmit() {
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
        /* El asiento se decide AL PEDIR, no al cobrar: quien sabe de quién
           es el pepián es el mesero en ese momento (migración 123). */
        ...(l.seat ? { seat: l.seat } : {}),
      })),
      customer: {
        name: finalName,
        phone: '',
        /* Para llevar es PICKUP: no ocupa mesa, no entra al plano del salón
           y su recorrido de estados es el de mostrador, no el de mesa. */
        type: (mesa ? 'DINE_IN' : 'PICKUP') as 'PICKUP' | 'DINE_IN',
        ...(mesa ? { tableNumber: mesa } : {}),
        ...(mesa && personasMesa ? { partySize: personasMesa } : {}),
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
        /* Se QUEDA en la mesa. Antes saltaba a "Mis pedidos", y eso era
           justo lo contrario de lo que hace un mesero: manda la primera
           ronda y sigue en la misma mesa apuntando las bebidas. */
        volverAlCiclo(mesa);
      } catch {
        /* La nube no respondió: se intenta el hub local del restaurante
           antes de dejarlo encolado en este aparato. */
        if (hubUrl) {
          const hubResult = await tryHubOrder(hubUrl, hubToken, input);
          if (hubResult?.success) {
            removeQueuedOrder(restaurantId, clientId, 'waiter');
            setAviso({ text: `Pedido ${hubResult.orderNumber} impreso — se sincroniza solo en cuanto vuelva la señal.`, bad: false });
            limpiar();
            volverAlCiclo(mesa);
            return;
          }
        }
        setQueuedCount(getQueuedOrders(restaurantId, 'waiter').length);
        setAviso({ text: 'Sin conexión: el pedido quedó guardado en este aparato y se enviará solo cuando vuelva la señal.', bad: false });
        limpiar();
        volverAlCiclo(mesa);
      }
    });
  }

  /* Los avisos de envío se van solos: son acuse de recibo, no un estado.
     El que trae «deshacer» aguanta más: cuatro segundos es lo que se tarda
     en LEER que uno se equivocó de mesa, y para entonces el botón ya no
     estaría. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.undo ? 9000 : aviso.bad ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* ── Navegar desde "Mesas" ───────────────────────────────────
     Tocar una mesa abre SU pantalla, esté libre u ocupada. Antes una
     mesa ocupada abría una hoja con tres opciones —agregar, cobrar,
     marcar libre— y había que elegir antes de ver nada; ahora la
     pantalla de la mesa enseña la cuenta, en qué va la comida y la
     única acción que toca, que es de donde salían esas tres. La hoja
     sigue existiendo para "marcar libre" (el botón «···»). */
  function selectTable(n: number) {
    elegir({ kind: 'mesa', n });
    setView('ciclo');
  }

  function startTakeaway() {
    elegir({ kind: 'llevar' });
    setView('ciclo');
  }

  /** Cobra y cierra la mesa `n`, y vuelve a "Mesas".
      `method` es cómo pagó: sin él, el pedido se quedaba con el 'CASH' de
      fábrica y el arqueo de la noche contaba como efectivo lo que se pagó
      con tarjeta (ver lib/payment-method.ts). */
  function liberar(n: number, method: PaymentMethod, cashReceived: number | null) {
    startFree(async () => {
      const res = await freeTable(restaurantId, n, { method, cashReceived });
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      /* La mesa se fue: su reparto ya no le sirve a nadie, y heredarlo a
         los próximos comensales sería peor que empezar de cero. */
      clearSavedSplit(restaurantId, n);
      setBillTable(null);
      setBillOrders(null);
      elegir({ kind: 'none' });
      setView('tables');
      router.refresh();
    });
  }

  /* ════════════════ EL CICLO DE LA MESA ════════════════
     Las acciones que antes obligaban a salirse de la pantalla —o que
     sencillamente no existían— y que ahora viven junto a la comanda. */

  /** Asiento de un plato que TODAVÍA no ha salido a cocina. */
  function setCartSeat(lineId: string, seat: number | null) {
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, seat } : l)));
  }

  /** Asiento de un plato ya enviado. Va a la BD porque el reparto tiene
      que seguir ahí si el cobro lo hace otra persona en la caja. */
  function setSentSeat(itemId: string, seat: number | null) {
    // Optimista: el chip cambia al toque y la BD confirma después. Una
    // espera de red por cada asiento haría el reparto insufrible.
    setBillOrders((prev) => prev?.map((o) => ({
      ...o,
      items: o.items.map((it) => (it.id === itemId ? { ...it, seat_no: seat } : it)),
    })) ?? prev);
    startStatus(async () => {
      const res = await setItemSeat(restaurantId, itemId, seat);
      if (res.error) {
        setAviso({ text: res.error, bad: true });
        if (billTable != null) loadTableBill(billTable);
      }
    });
  }

  /** Cuánta gente se sentó. */
  function handleParty(n: number | null) {
    if (selection.kind !== 'mesa') return;
    const mesa = selection.n;
    setPartyDraft((prev) => ({ ...prev, [mesa]: n ?? 0 }));

    /* Sin comanda todavía no hay pedido donde escribirlo, pero desde la
       migración 128 sí hay dónde: el turno de la mesa. Contar cuatro
       personas SIENTA la mesa, y eso es justo lo que se quería —el número
       deja de vivir en la memoria de este teléfono, y ningún otro mesero
       ve libre una mesa que este acaba de contar—.

       Borrar el número en una mesa que nadie sentó no abre turno: sería
       ocupar una mesa para no anotar nada. Y si la 128 aún no corrió, se
       calla y se queda el borrador de siempre. */
    if (!occupiedSince[mesa]) {
      if (n == null && !seatings[mesa]) return;
      startStatus(async () => {
        const res = await updateSeating(restaurantId, mesa, { partySize: n });
        if (res.error && !res.needsMigration) { setAviso({ text: res.error, bad: true }); return; }
        if (!res.error) router.refresh();
      });
      return;
    }
    setBillOrders((prev) => prev?.map((o) => ({ ...o, party_size: n })) ?? prev);
    startStatus(async () => {
      const res = await setTableParty(restaurantId, mesa, n);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      router.refresh();
    });
  }

  /** Las mesas a las que tiene sentido mover/juntar la actual: libres para
      mover, ocupadas para juntar. Nunca la propia. */
  function destinosDe(modo: 'move' | 'merge'): TableWithState[] {
    return tables.filter((t) => (
      (selection.kind !== 'mesa' || t.n !== selection.n)
      && (modo === 'move' ? t.state.kind === 'libre' : t.state.kind !== 'libre')
    ));
  }

  /** Abre el selector de destino, o dice por qué no hay ninguno. Un
      diálogo vacío es peor que un aviso: parece que la app falló. */
  function abrirMover(modo: 'move' | 'merge') {
    if (destinosDe(modo).length === 0) {
      setAviso({
        text: modo === 'move'
          ? 'No hay ninguna mesa libre a la que mover esta.'
          : 'No hay otra mesa con gente con la que juntar esta.',
        bad: true,
      });
      return;
    }
    setMoveMode(modo);
  }

  /** Mover la mesa a otra, o juntarla con otra. */
  function handleMove(destino: number) {
    if (selection.kind !== 'mesa' || moveMode === null) return;
    const origen = selection.n;
    const merge = moveMode === 'merge';
    setMoveMode(null);
    startStatus(async () => {
      const res = await moveTableOrders(restaurantId, origen, destino, merge);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      /* El reparto guardado era de la mesa vieja: heredarlo a la nueva
         mezclaría dos cuentas que no tienen nada que ver. */
      clearSavedSplit(restaurantId, origen);
      setAviso({
        text: merge
          ? `Mesa ${origen} juntada con la ${destino}.`
          : `Lo de la mesa ${origen} pasó a la ${destino}.`,
        bad: false,
      });
      elegir({ kind: 'mesa', n: destino });
      loadTableBill(destino);
      router.refresh();
    });
  }

  /** «Enviar a cocina» desde la pantalla de la mesa.
      ------------------------------------------------------------------
      Solo aparece cuando la mesa tiene una comanda en NEW, que —como el
      pedido del mesero nace ya en PREP— únicamente puede venir del QR: el
      comensal pidió desde su teléfono y nadie lo pasó a cocina. Se reusa
      `updateOrderStatus`, que es quien pone `accepted_at` Y encola el papel
      al agente de impresión; hacerlo aquí a mano habría sido una segunda
      verdad sobre el mismo paso. */
  function handleMandarACocina() {
    if (selection.kind !== 'mesa') return;
    const mesa = selection.n;
    const sinEnviar = (billTable === mesa ? billOrders ?? [] : []).filter((o) => o.status === 'NEW');
    if (sinEnviar.length === 0) {
      setAviso({ text: 'Esta mesa ya no tiene comandas sin enviar.', bad: true });
      return;
    }
    startStatus(async () => {
      // Una mesa puede acumular varias rondas del QR sin aceptar: van todas.
      for (const o of sinEnviar) {
        const res = await updateOrderStatus(o.id, 'PREP');
        if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      }
      setAviso({
        text: sinEnviar.length === 1
          ? `Mesa ${mesa}: la comanda salió a cocina.`
          : `Mesa ${mesa}: ${sinEnviar.length} comandas salieron a cocina.`,
        bad: false,
      });
      loadTableBill(mesa);
      router.refresh();
    });
  }

  /** Devuelve a «lista» la comida que se acaba de dar por servida. */
  function deshacerServir(mesa: number, ids: string[]) {
    startStatus(async () => {
      const res = await undoServeTable(restaurantId, ids);
      setAviso(res.error
        ? { text: res.error, bad: true }
        : { text: `Mesa ${mesa}: deshecho. La comida vuelve a estar lista.`, bad: false });
      loadTableBill(mesa);
      router.refresh();
    });
  }

  /** Devuelve a pendientes las llamadas que se acaban de atender. */
  function deshacerAtender(mesa: number, ids: string[]) {
    startStatus(async () => {
      const res = await undoResolveTableCalls(restaurantId, ids);
      setAviso(res.error
        ? { text: res.error, bad: true }
        : { text: `Mesa ${mesa}: deshecho. Vuelve a estar llamando.`, bad: false });
      router.refresh();
    });
  }

  /** «Llevar a la mesa»: lo que estaba listo en la barra ya está puesto. */
  function handleServe() {
    if (selection.kind !== 'mesa') return;
    const mesa = selection.n;
    startStatus(async () => {
      const res = await serveTableReady(restaurantId, mesa);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      const ids = res.ids ?? [];
      setAviso({
        text: `Mesa ${mesa}: servida.`,
        bad: false,
        undo: ids.length > 0 ? () => deshacerServir(mesa, ids) : undefined,
      });
      loadTableBill(mesa);
      router.refresh();
    });
  }

  /* ── La única acción de una mesa, desde el salón ─────────────
     El lienzo del salón ofrece UNA acción por mesa, la que toca ahora
     (`tableAction()` en lib/table-state.ts). Antes esta pantalla no la
     usaba: tenía dos listas de pendientes escritas a mano, y la misma
     mesa aparecía en las dos con gestos distintos.

     El dueño hace exactamente lo mismo desde su tablero; lo único que
     cambia es a dónde lleva «cobrar» y «agregar», porque aquí ya
     estamos dentro del panel que los hace. */
  const [mesaOcupada, setMesaOcupada] = useState<number | null>(null);

  function hacerEnMesa(t: SalonTable) {
    switch (t.action.kind) {
      case 'llevar':
        setMesaOcupada(t.n);
        startStatus(async () => {
          const res = await serveTableReady(restaurantId, t.n);
          setMesaOcupada(null);
          if (res.error) { setAviso({ text: res.error, bad: true }); return; }
          const ids = res.ids ?? [];
          setAviso({
            text: `Mesa ${t.n}: servida.`,
            bad: false,
            undo: ids.length > 0 ? () => deshacerServir(t.n, ids) : undefined,
          });
          router.refresh();
        });
        return;
      case 'atender':
        setMesaOcupada(t.n);
        startStatus(async () => {
          const res = await resolveTableCalls(restaurantId, t.n);
          setMesaOcupada(null);
          if (res.error) { setAviso({ text: res.error, bad: true }); return; }
          const ids = res.ids ?? [];
          setAviso({
            text: `Mesa ${t.n}: llamada atendida.`,
            bad: false,
            undo: ids.length > 0 ? () => deshacerAtender(t.n, ids) : undefined,
          });
          router.refresh();
        });
        return;
      case 'cobrar':
        elegir({ kind: 'mesa', n: t.n });
        loadTableBill(t.n);
        setView('bill');
        return;
      /* «Tomar el pedido» (mesa sentada y sin comanda) es lo mismo que
         abrir: la pantalla de la mesa. El verbo cambia porque el trabajo
         empieza distinto —ya hay gente—, no porque lleve a otro sitio. */
      case 'tomar':
      case 'revisar':
      case 'agregar':
      case 'abrir':
      default:
        selectTable(t.n);
    }
  }

  /** La cuenta entera a la impresora de caja (sin repartir). */
  function handlePrintBill() {
    if (selection.kind !== 'mesa') return;
    const mesa = selection.n;
    startStatus(async () => {
      const res = await printTableBillShare({
        restaurantId, tableNumber: mesa, mode: 'single',
        peopleIds: [], names: {}, assignment: {}, personId: null,
      });
      setAviso(res.error
        ? { text: res.error, bad: true }
        : { text: 'Cuenta enviada a la impresora.', bad: false });
    });
  }

  /** Ir al cobro / reparto de la mesa elegida. */
  function irACobrar() {
    if (selection.kind !== 'mesa') return;
    loadTableBill(selection.n);
    setView('bill');
  }

  /* ── Atajo global: cambiar de mesa sin soltar el teclado ─────
     M de mesa, no K.

     Ctrl/⌘+K ya es el buscador global del panel (command-search.tsx) y
     lo intercepta ANTES de que llegue aquí — comprobado en el
     navegador: el salto de mesa sencillamente no abría con K. Funciona
     desde cualquier vista. */
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

  /* Atajos propios de "Menú": "/" vuelve al buscador y Ctrl/⌘+Enter va
     a "Revisar" si hay algo que revisar. Son listeners de teclado —
     nunca disparan por toque, así que no hace falta ningún gateo
     adicional para el móvil. */
  useEffect(() => {
    if (view !== 'menu') return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (cartCount > 0) { e.preventDefault(); setView('review'); }
        return;
      }
      if (e.key === '/') {
        const t = e.target as HTMLElement | null;
        const escribiendo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!escribiendo) { e.preventDefault(); searchRef.current?.focus(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, cartCount]);

  const fmt = useCallback((n: number) => money(n, currency), [currency]);

  /* ── UI compartida ───────────────────────────────────────────── */
  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
    borderRadius: 12, padding: '12px 14px', color: 'var(--u-text)', fontSize: 15, outline: 'none', width: '100%',
  };

  const headerProps = {
    waiterName,
    showOrders: view !== 'orders',
    ordersCount: orders.length,
    onShowOrders: () => setView('orders'),
    // Solo cuando hay algo que encender: en pantalla completa ya no aplica.
    onModoServicio: servicio && !servicio.active ? servicio.toggle : null,
  };

  /* El acuse de recibo del envío ("Pedido #123 enviado a cocina"), y
     nada más: los avisos de borrador/cola/abandonadas viven donde
     siempre vivieron (ver vista "tables" y "orders"), porque ahí es
     donde el mesero los espera. Este se ve en CUALQUIER vista porque
     el envío puede tardar en llevarlo de vuelta a "Mesas". */
  const avisoBanner = aviso ? (
    <div style={{ marginBottom: 4 }}>
      <Banner
        tone={aviso.bad ? 'danger' : 'ok'}
        icon={aviso.bad ? 'alertCircle' : 'checkCircle'}
        text={aviso.text}
        acciones={aviso.undo ? <BannerBtn onClick={aviso.undo}>Deshacer</BannerBtn> : undefined}
      />
    </div>
  ) : null;

  /* Aviso de salida con pedido a medias. Se pinta en todas las vistas del
     panel porque el toque que lo dispara —el menú del administrador—
     está siempre ahí. El pedido NO se pierde (queda de borrador), pero
     salir sin querer en hora pico es de todos modos lo peor que le puede
     pasar a un mesero. */
  const exitGuard = pendingHref === null ? null : (
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
          <button type="button" onClick={() => setPendingHref(null)} className="press btn-accent" style={{ width: '100%', padding: '14px', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            Seguir con el pedido
          </button>
          <button
            type="button"
            onClick={() => { const href = pendingHref; setPendingHref(null); if (href) router.push(href); }}
            className="press glass-quiet"
            style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)' }}
          >
            Salir de todos modos
          </button>
        </div>
      </div>
    </div>
  );

  /* ════════════════ VISTA: MIS PEDIDOS ════════════════ */
  if (view === 'orders') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title="Mis pedidos" onBack={() => setView(selection.kind !== 'none' ? 'menu' : 'tables')} />
        {exitGuard}
        <div className="waiter-scroll">
          <div className="waiter-wrap-narrow waiter-pad" style={{ paddingBlock: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {avisoBanner}
            <button type="button" onClick={() => setView('tables')} className="press btn-accent" style={{ padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
              ＋ Nuevo pedido
            </button>
            {queuedCount > 0 && (
              <Banner
                tone="warn"
                icon="alertCircle"
                text={`${queuedCount} pedido${queuedCount === 1 ? '' : 's'} sin sincronizar — se enviará${queuedCount === 1 ? '' : 'n'} solo${queuedCount === 1 ? '' : 's'} al volver la señal.`}
                acciones={<BannerBtn onClick={() => { retryWaiterQueue(); }}>Reintentar</BannerBtn>}
              />
            )}
            {statusError && <Banner tone="danger" icon="alertCircle" text={statusError} />}
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--u-text-4)', fontSize: 15 }}>
                Sin pedidos activos. Tus pedidos en curso aparecerán aquí.
              </div>
            ) : orders.map((order) => {
              const next = nextStatus(order.status, order.order_type);
              const isTerminal = isCardTerminal(order.status);
              const clk = stageClock(order, 10, 20);
              const elapsedMs = clk && now != null ? now - new Date(clk.since).getTime() : 0;
              return (
                <div key={order.id} className="glass" style={{ borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, opacity: isTerminal ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="t-mono" style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{order.order_number}</span>
                        <span className={`chip ${STATUS_CHIP[order.status]}`}>{STATUS_LABEL_SHORT[order.status]}</span>
                        {clk && now != null && (
                          <span className={`chip ${clockChipClass(elapsedMs / 60000, clk)}`} title={clk.label}>
                            <Icon name="clock" size={11} /> {fmtElapsed(elapsedMs)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginTop: 3 }}>{order.customer_name}</div>
                      {order.address && <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="grid" size={12} /> {order.address}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--u-text)' }}>
                        {fmt(Number(order.total))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {order.items.map((item) => {
                      const remaining = remainingQuantity(item, order.voids ?? []);
                      const voidedQty = item.quantity - remaining;
                      const unitPrice = item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0;
                      return (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--u-text-2)' }}>
                          <span>
                            {remaining}× {item.name_snapshot}
                            {voidedQty > 0 && (
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--c-danger)', fontWeight: 600 }}>
                                {voidedQty} anulada{voidedQty === 1 ? '' : 's'}
                              </span>
                            )}
                            {item.note && (
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--c-warn)', fontWeight: 600 }}>
                                ⚠ {item.note}
                              </span>
                            )}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontWeight: 600 }}>{fmt(unitPrice * remaining)}</span>
                            {!isTerminal && remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => setVoidTarget({ orderId: order.id, orderStatus: order.status, item: { id: item.id, name: item.name_snapshot, remainingQty: remaining } })}
                                title="Anular"
                                className="press"
                                style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--c-danger-line)', background: 'var(--c-danger-bg)', color: 'var(--c-danger)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                              >
                                <Icon name="x" size={11} />
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {!isTerminal && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {next && (
                        <button
                          type="button"
                          onClick={() => startStatus(async () => {
                            setStatusError(null);
                            const res = await updateOrderStatus(order.id, next);
                            if (res.error) { setStatusError(res.error); return; }
                            router.refresh();
                          })}
                          className="press btn-accent"
                          style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
                        >
                          {nextLabel(order.status, order.order_type)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setVoidTarget({ orderId: order.id, orderStatus: order.status, item: null })}
                        className="press"
                        style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)', background: 'color-mix(in srgb, var(--c-danger, #f87171) 8%, transparent)', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {voidTarget && (
          <VoidOrderDialog
            orderId={voidTarget.orderId}
            orderStatus={voidTarget.orderStatus}
            item={voidTarget.item}
            onClose={() => setVoidTarget(null)}
            onDone={() => { setVoidTarget(null); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: CUENTA DE MESA / DIVIDIR ════════════════ */
  if (view === 'bill') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader
          {...headerProps}
          title={`Cuenta · Mesa ${billTable}`}
          backLabel={vueltaAlSalon ? 'Volver al salón' : 'Volver a las mesas'}
          onBack={vueltaAlSalon ? volverAlSalon : () => { setView('tables'); setBillTable(null); setBillOrders(null); }}
        />
        {exitGuard}
        <div className="waiter-scroll">
          <div className="waiter-wrap-narrow waiter-pad" style={{ paddingBlock: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {avisoBanner}
            {billLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)' }}>Cargando la cuenta…</div>
            )}
            {billError && <Banner tone="danger" icon="alertCircle" text={billError} />}
            {!billLoading && !billError && billOrders && billTable != null && (
              <WaiterBill
                restaurantId={restaurantId}
                tableNumber={billTable}
                orders={billOrders}
                currency={currency}
                freeing={freeing}
                onVoidItem={setVoidTarget}
                onFreeTable={(method, cash) => liberar(billTable, method, cash)}
              />
            )}
          </div>
        </div>

        {voidTarget && (
          <VoidOrderDialog
            orderId={voidTarget.orderId}
            orderStatus={voidTarget.orderStatus}
            item={voidTarget.item}
            onClose={() => setVoidTarget(null)}
            onDone={() => { setVoidTarget(null); if (billTable) loadTableBill(billTable); router.refresh(); }}
          />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: REVISAR Y ENVIAR ════════════════ */
  if (view === 'review') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={`Revisar · ${destLabel}`} onBack={() => setView('menu')} />
        {exitGuard}
        <div className="waiter-scroll">
          <div className="waiter-wrap-narrow waiter-pad" style={{ paddingBlock: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {avisoBanner}
            <div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Orden ({cartCount})</div>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
                  Aún no agregaste platos. <button type="button" onClick={() => setView('menu')} style={{ color: 'var(--brand-accent-ink)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Volver al menú</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cart.map((line) => (
                    <div key={line.lineId} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: 'var(--u-text)', fontWeight: 600 }}>{line.name}</div>
                        {line.options.length > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                            {line.options.map((o) => (o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName)).join(', ')}
                          </div>
                        )}
                        {line.note && (
                          <div style={{ fontSize: 11.5, color: 'var(--c-warn)', fontWeight: 600, marginTop: 1 }}>
                            ⚠ {line.note}
                          </div>
                        )}
                        <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 2 }}>{fmt(line.price)} c/u</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={() => openEditLine(line)} aria-label={`Editar ${line.name}`} title="Editar opciones o nota" className="press glass-quiet" style={{ width: 30, height: 30, borderRadius: 9, border: 'none', cursor: 'pointer', color: 'var(--u-text-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          <Icon name="edit" size={14} />
                        </button>
                        <button type="button" onClick={() => decLine(line.lineId)} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                        <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{line.quantity}</span>
                        <button type="button" onClick={() => incLine(line.lineId)} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Nombre / referencia (opcional)</div>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={destLabel} style={inputStyle} />
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notas especiales</div>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alergias, sin sal, extra salsa…" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Barra fija inferior: total + enviar. */}
        <div style={{ borderTop: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--brand-bg) 82%, transparent)', backdropFilter: 'blur(16px)' }}>
          <div className="waiter-wrap-narrow waiter-pad" style={{ paddingBlock: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tipApplies && tipAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Subtotal</span>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{fmt(subtotal)}</span>
              </div>
            )}
            {tipApplies && tipAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Propina ({tipPercent}%)</span>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{fmt(tipAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, color: 'var(--u-text-2)', fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--u-text)' }}>{fmt(total)}</span>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0}
              className="press btn-accent"
              style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: submitting || cart.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: submitting || cart.length === 0 ? 0.6 : 1 }}
            >
              {submitting ? 'Enviando…' : <><Icon name="bell" size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Enviar a cocina</>}
            </button>
          </div>
        </div>

        {productModal && (
          <ProductOptionsModal product={productModal} currency={currency} initialLine={editingLine ?? undefined} initialQty={pendingQty} onAdd={addToCart} onSave={saveLine} onClose={closeProductModal} />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: LA MESA (su ciclo entero) ════════════════
     Aquí aterriza el mesero al tocar una mesa. Es la pantalla que
     acompaña la mesa de principio a fin: la cuenta completa, en qué va
     la comida, el reparto por asiento, el buscador de siempre debajo, y
     UNA barra abajo que dice el siguiente paso. */
  if (view === 'ciclo' && selection.kind !== 'none') {
    const mesaN = selection.kind === 'mesa' ? selection.n : null;
    const occSel = mesaN != null ? occupiedSince[mesaN] : undefined;
    /* POR NÚMERO, no por posición (M-03). Esto era `tables[mesaN - 1]`, que
       da por hecho que la mesa N es la fila N-1 del salón. Deja de ser
       cierto en cuanto una mesa se sale de las configuradas —un QR viejo
       pidiendo en la 25 de un salón de 20—: el índice no existía, el estado
       caía al respaldo «Libre» y la pantalla pintaba como VACÍA una mesa
       con cuatrocientos quetzales encima. */
    const filaSel = mesaN != null ? tables.find((t) => t.n === mesaN) : undefined;
    const stateSel = mesaN != null
      ? (filaSel?.state ?? { kind: 'libre' as const, reason: null, level: null, label: 'Libre', short: 'Libre', since: null, priority: 99 })
      : { kind: 'libre' as const, reason: null, level: null, label: 'Sin enviar', short: 'Sin enviar', since: null, priority: 99 };
    const stageSel = tableStage(occSel, stateSel, filaSel?.seat);
    const ordersSel = mesaN != null && billTable === mesaN ? (billOrders ?? []) : [];

    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader
          {...headerProps}
          title={destLabel}
          backLabel={vueltaAlSalon ? 'Volver al salón' : 'Volver a las mesas'}
          onBack={vueltaAlSalon ? volverAlSalon : () => { elegir({ kind: 'none' }); setView('tables'); }}
        />
        {exitGuard}
        <div className="waiter-scroll">
          <div className="waiter-wrap waiter-pad" style={{ paddingBlock: '14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {avisoBanner}
            {statusError && <Banner tone="danger" icon="alertCircle" text={statusError} />}

            <TableCycle
              mesa={mesaN}
              titulo={destLabel}
              occ={occSel}
              personas={personasMesa}
              state={stateSel}
              stage={stageSel}
              orders={ordersSel}
              ordersLoading={billLoading && billTable === mesaN}
              cart={cart}
              now={now}
              products={products}
              categories={categories}
              money={fmt}
              tipPercent={tipPercent}
              tipApplies={tipApplies}
              onPick={handlePick}
              qtyOf={cartQtyOf}
              onDec={decProduct}
              onSend={cart.length > 0 && !submitting ? handleSubmit : null}
              /* El campo no roba el foco mientras hay un diálogo encima:
                 escribir en la hoja de opciones y que las letras acaben en
                 el buscador es de las cosas más frustrantes que hay. */
              finderFocus={conTeclado && !productModal && !jumpOpen && moveMode === null && pendingHref === null}
              asiento={asiento}
              onAsiento={setAsiento}
              onSeatCart={setCartSeat}
              onSeatItem={setSentSeat}
              onIncCart={incLine}
              onDecCart={decLine}
              onEditCart={openEditLine}
              onParty={handleParty}
              onJuntar={() => abrirMover('merge')}
              onMover={() => abrirMover('move')}
              onNota={() => setNotaOpen(true)}
              onCobrar={irACobrar}
              onImprimir={handlePrintBill}
              onServir={handleServe}
              onMandarACocina={handleMandarACocina}
              onVerMenu={() => setView('menu')}
              ocupado={submitting}
            />
          </div>
        </div>

        {productModal && (
          <ProductOptionsModal product={productModal} currency={currency} initialLine={editingLine ?? undefined} initialQty={pendingQty} onAdd={addToCart} onSave={saveLine} onClose={closeProductModal} />
        )}

        {notaOpen && (
          <NotaDeMesa
            valor={notes}
            titulo={destLabel}
            onGuardar={(v) => { setNotes(v); setNotaOpen(false); }}
            onClose={() => setNotaOpen(false)}
          />
        )}

        {moveMode !== null && (
          <TableJump
            tables={destinosDe(moveMode)}
            money={fmt}
            onPick={handleMove}
            onClose={() => setMoveMode(null)}
          />
        )}

        {jumpOpen && (
          <TableJump
            tables={tables}
            money={fmt}
            onPick={(n) => { setJumpOpen(false); elegir({ kind: 'mesa', n }); setView('ciclo'); }}
            onClose={() => setJumpOpen(false)}
          />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: MESAS ════════════════
     El MISMO lienzo que Pedidos › Mesas (salon/salon-canvas.tsx). Esta
     vista tenía su propio plano —con pellizco y zoom—, su rejilla de
     cuadritos y DOS listas de pendientes que se pisaban: la mesa 4 salía
     en «Te necesitan ahora» y otra vez, doscientos píxeles más abajo, en
     «Servidas sin cobrar», con dos gestos distintos para la misma mesa.

     Ya no hacen falta: el lienzo ordena por urgencia y cada mesa lleva
     su única acción, que es lo que esas dos listas intentaban ser. */
  if (view === 'tables') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
        <WaiterHeader {...headerProps} title={restaurantName} />
        {exitGuard}
        <div className="waiter-scroll">
          <div className="waiter-wrap waiter-pad" style={{ paddingBlock: '18px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {avisoBanner}

            {/* El título y nada más: el modo servicio se mudó a la cabecera
                (WaiterHeader), que está en TODAS las vistas del mesero. Aquí
                solo lo veía quien entraba por «Mesas». */}
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--u-text)' }}>Mesas</div>

            {/* Borrador rescatado: el pedido que se estaba tomando la última
                vez y nunca salió a cocina. */}
            {draft && totalPendiente === 0 && (
              <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, border: '1px solid color-mix(in srgb, var(--c-warn) 35%, transparent)' }}>
                <Icon name="alertCircle" size={17} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
                    Pedido sin enviar
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                    {contarCarts(draft.carts)} platos sin enviar todavía
                  </div>
                </div>
                <button type="button" onClick={resumeDraft} className="press btn-accent" style={{ padding: '9px 15px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  Retomar
                </button>
                <button type="button" onClick={discardDraft} className="press glass-quiet" style={{ padding: '9px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--u-text-3)' }}>
                  Descartar
                </button>
              </div>
            )}

            {abandonedCount > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 25%, transparent)' }}>
                <Icon name="alertCircle" size={16} style={{ color: 'var(--c-danger)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 180, fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger)' }}>
                  {abandonedCount} mesa{abandonedCount === 1 ? '' : 's'} con más de 24h ocupada{abandonedCount === 1 ? '' : 's'} — probablemente un pedido olvidado.
                </span>
                <button
                  type="button"
                  onClick={handleArchiveAbandoned}
                  disabled={archiving}
                  className="press"
                  style={{ padding: '7px 13px', borderRadius: 99, border: 'none', cursor: archiving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12.5, background: 'var(--c-danger, #f87171)', color: '#fff', opacity: archiving ? 0.7 : 1, flexShrink: 0 }}
                >
                  {archiving ? 'Archivando…' : 'Archivar mesas abandonadas'}
                </button>
              </div>
            )}
            {archiveMsg && (
              <div style={{ fontSize: 12.5, color: 'var(--u-text-2)', padding: '8px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--u-text) 5%, transparent)' }}>
                {archiveMsg}
              </div>
            )}

            {/* Pedido sin mesa. Va ARRIBA del salón y no escondido al final. */}
            {pickupEnabled && (
              <button
                type="button"
                onClick={startTakeaway}
                className="press glass"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 15px', borderRadius: 14,
                  border: '1.5px dashed var(--u-hair-2)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent-ink)' }}>
                  <Icon name="bag" size={19} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Para llevar · sin mesa</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>Mostrador, barra o alguien que pasa a recoger</span>
                </span>
                <Icon name="chevronRight" size={18} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SalonViewSwitch view={salonView} onChange={setSalonView} />
              <span style={{ flex: 1 }} />
              {salonView !== 'plano' && <SalonLegend />}
            </div>

            <SalonCanvas
              view={salonView}
              tables={salonTables}
              floorPlan={floorPlan}
              selected={selection.kind === 'mesa' ? selection.n : null}
              onOpen={selectTable}
              onAction={hacerEnMesa}
              busyTable={mesaOcupada}
            />
          </div>
        </div>

        {jumpOpen && (
          <TableJump
            tables={tables}
            money={fmt}
            onPick={(n) => { setJumpOpen(false); elegir({ kind: 'mesa', n }); setView('ciclo'); }}
            onClose={() => setJumpOpen(false)}
          />
        )}
      </div>
    );
  }

  /* ════════════════ VISTA: MENÚ (agregar platos) ════════════════ */
  const { qty: searchQty, term: searchTerm } = parseQuery(search);
  const query = searchTerm.trim().toLowerCase();
  /* Misma regla que el buscador de la mesa (waiter/dish-finder.tsx): al
     BUSCAR, el agotado aparece apagado en vez de desaparecer —esconderlo
     deja al mesero sin saber si se acabó o si lo escribió mal—; navegando
     por categorías no sale, para no llenar la rejilla de platos que no se
     pueden pedir. `is_active` es otra cosa y sigue mandando: eso es un
     plato retirado de la carta, no uno que se acabó hoy. */
  const visibleProducts = products.filter((p) => {
    if (!p.is_active) return false;
    if (query) return p.name.toLowerCase().includes(query);
    if (!p.is_available) return false;
    if (activeCat !== null) return p.category_id === activeCat;
    return true;
  });
  /** La cantidad tecleada ("3 lim") solo se aplica al primer toque que
      agrega el plato — buscar, tocar la tarjeta, listo. Los pasos +/-
      de un plato que ya está en el carrito suben de uno en uno, como
      siempre: es lo que un dedo espera de un botón "+". */
  function tapProduct(p: Product) {
    handlePick(p, search.trim() ? searchQty : 1);
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--brand-bg)' }}>
      <WaiterHeader {...headerProps} title={destLabel} onBack={() => setView('tables')} />
      {exitGuard}
      {avisoBanner && <div className="waiter-wrap waiter-pad" style={{ paddingTop: 10 }}>{avisoBanner}</div>}

      {/* Buscador */}
      <div className="waiter-wrap waiter-pad" style={{ width: '100%', paddingBlock: '12px 6px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-4)', display: 'grid', placeItems: 'center' }}>
            <Icon name="search" size={17} />
          </span>
          {searchQty > 1 && (
            <span style={{
              position: 'absolute', left: 38, top: '50%', transform: 'translateY(-50%)',
              padding: '2px 7px', borderRadius: 6,
              background: 'color-mix(in srgb, var(--adm-accent-500) 14%, transparent)',
              color: 'var(--brand-accent-ink)', fontFamily: 'var(--ui-font-mono)',
              fontSize: 12.5, fontWeight: 700,
            }}>
              ×{searchQty}
            </span>
          )}
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plato… (o «3 lim»)"
            style={{ ...inputStyle, paddingLeft: searchQty > 1 ? 78 : 40, paddingRight: search ? 40 : 14 }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Categorías (ocultas al buscar) */}
      {!query && (
        <div className="waiter-wrap waiter-pad" style={{ width: '100%', display: 'flex', gap: 8, overflowX: 'auto', paddingBlock: '6px 10px', flexShrink: 0, scrollbarWidth: 'none' }}>
          <button
            type="button"
            onClick={() => setActiveCat(null)}
            className="press"
            style={{
              whiteSpace: 'nowrap', padding: '9px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5,
              background: activeCat === null ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 7%, transparent)',
              color: activeCat === null ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
              flexShrink: 0,
            }}
          >
            Todos
          </button>
          {categories.filter((c) => c.is_active).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              className="press"
              style={{
                whiteSpace: 'nowrap', padding: '9px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13.5,
                background: activeCat === cat.id ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 7%, transparent)',
                color: activeCat === cat.id ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                flexShrink: 0,
              }}
            >
              {cat.icon && (
                ICON_PATHS[cat.icon]
                  ? <Icon name={cat.icon} size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                  : <span style={{ marginRight: 4 }}>{cat.icon}</span>
              )}{cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Productos */}
      <div className="waiter-scroll">
        <div className="waiter-wrap waiter-pad" style={{ paddingBlock: '4px 96px' }}>
          {visibleProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-4)', fontSize: 14 }}>
              {query ? 'Ningún plato coincide con tu búsqueda.' : 'Sin productos disponibles en esta categoría.'}
            </div>
          ) : (
            <div className="waiter-menu-grid">
              {visibleProducts.map((p) => {
                const qty = cartQtyOf(p.id);
                const hasOptions = ((p.options as ProductOptionGroup[] | null) ?? []).length > 0;
                const agotado = !p.is_available;
                return (
                  <div
                    key={p.id}
                    role={agotado ? undefined : 'button'}
                    tabIndex={agotado ? undefined : 0}
                    aria-disabled={agotado || undefined}
                    onClick={agotado ? undefined : () => tapProduct(p)}
                    onKeyDown={agotado ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapProduct(p); } }}
                    className={agotado ? 'glass' : 'press glass'}
                    style={{
                      borderRadius: 14, padding: '12px 12px 11px', position: 'relative',
                      cursor: agotado ? 'default' : 'pointer', opacity: agotado ? 0.6 : 1,
                      display: 'flex', flexDirection: 'column', gap: 6,
                      border: qty > 0 ? '1.5px solid var(--brand-accent)' : '1.5px solid transparent',
                    }}
                  >
                    {qty > 0 && (
                      <span style={{ position: 'absolute', top: 8, right: 8, minWidth: 24, height: 24, padding: '0 6px', borderRadius: 99, background: 'var(--brand-accent)', color: 'var(--brand-on-accent, #fff)', fontSize: 13, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                        {qty}
                      </span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--u-text)' }}>
                      {p.icon && (
                        ICON_PATHS[p.icon]
                          ? <Icon name={p.icon} size={23} />
                          : <span style={{ fontSize: 23 }}>{p.icon}</span>
                      )}
                      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, paddingRight: qty > 0 ? 24 : 0 }}>{p.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-accent-ink)' }}>{fmt(p.price)}</span>
                    </div>

                    {agotado ? (
                      /* En el sitio del botón, la respuesta: se acabó. Antes
                         la tarjeta no se pintaba y buscar el plato no decía
                         nada. Ver `visibleProducts` arriba. */
                      <div style={{ marginTop: 2, padding: '10px', borderRadius: 10, textAlign: 'center', background: 'color-mix(in srgb, var(--c-warn) 14%, transparent)', color: 'var(--c-warn)', fontSize: 13, fontWeight: 700 }}>
                        Agotado
                      </div>
                    ) : hasOptions ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); tapProduct(p); }} className="press" style={{ marginTop: 2, padding: '10px', borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {qty > 0 ? 'Agregar otro' : '+ Elegir opciones'}
                      </button>
                    ) : qty > 0 ? (
                      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); decProduct(p.id); }} className="press" style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>−</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handlePick(p, 1); }} className="press" style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', cursor: 'pointer', fontSize: 19, display: 'grid', placeItems: 'center' }}>+</button>
                      </div>
                    ) : (
                      <button type="button" onClick={(e) => { e.stopPropagation(); tapProduct(p); }} className="press" style={{ marginTop: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent-ink)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        + Agregar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Barra flotante del carrito → Revisar, con mini-carrito desplegable. */}
      {cartCount > 0 && (
        <div className="waiter-cart-bar" style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(to top, var(--brand-bg) 60%, transparent)', flexShrink: 0 }}>
          <div className="waiter-wrap waiter-pad" style={{ paddingBlock: '0 12px' }}>
            {miniCartOpen && (
              <div className="glass anim-slide-up" style={{ borderRadius: 16, padding: '8px 10px', marginBottom: 8, maxHeight: '34vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cart.map((line) => (
                  <div key={line.lineId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name}</div>
                      {line.note && (
                        <div style={{ fontSize: 11, color: 'var(--c-warn)', fontWeight: 600 }}>⚠ {line.note}</div>
                      )}
                    </div>
                    <button type="button" onClick={() => decLine(line.lineId)} className="press glass-quiet" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', color: 'var(--u-text)', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center', flexShrink: 0 }}>−</button>
                    <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{line.quantity}</span>
                    <button type="button" onClick={() => incLine(line.lineId)} className="press glass-quiet" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', color: 'var(--u-text)', cursor: 'pointer', fontSize: 16, display: 'grid', placeItems: 'center', flexShrink: 0 }}>+</button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMiniCartOpen((v) => !v)}
              className="press"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px', marginBottom: 6, borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--u-text-3)', fontSize: 11.5, fontWeight: 600 }}
            >
              <Icon name="chevronDown" size={12} style={{ transform: miniCartOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              {miniCartOpen ? 'Ocultar pedido' : 'Ver pedido actual'}
            </button>
            <button
              type="button"
              onClick={() => setView('review')}
              className="press btn-accent"
              style={{ width: '100%', padding: '15px 18px', borderRadius: 16, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontWeight: 700, fontSize: 15.5 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 26, height: 26, borderRadius: 99, background: 'rgba(0,0,0,0.18)', display: 'grid', placeItems: 'center', fontSize: 13.5, fontWeight: 800 }}>{cartCount}</span>
                Revisar pedido
              </span>
              <span>{fmt(total)} →</span>
            </button>
          </div>
        </div>
      )}

      {productModal && (
        <ProductOptionsModal product={productModal} currency={currency} initialLine={editingLine ?? undefined} initialQty={pendingQty} onAdd={addToCart} onSave={saveLine} onClose={closeProductModal} />
      )}

      {jumpOpen && (
        <TableJump
          tables={tables}
          money={fmt}
          onPick={(n) => { setJumpOpen(false); elegir({ kind: 'mesa', n }); setView('menu'); }}
          onClose={() => setJumpOpen(false)}
        />
      )}
    </div>
  );
}

/* ── La nota de la mesa ────────────────────────────────────────
   "Cumpleaños en la 7", "sin picante para todos", "la señora es
   celíaca". Viaja con la siguiente comanda hasta la cocina, que es
   donde hace falta.

   Es una hoja y no un campo suelto en la pantalla a propósito: se
   escribe una vez por mesa, no en cada ronda, y tenerlo siempre a la
   vista solo restaría sitio a la comanda. */
function NotaDeMesa({ valor, titulo, onGuardar, onClose }: {
  valor: string;
  titulo: string;
  onGuardar: (v: string) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState(valor);
  return (
    <div onClick={onClose} className="waiter-sheet-scrim" style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="glass anim-slide-up waiter-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, padding: '22px 20px 28px' }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--u-text)' }}>
          Nota de {titulo.toLowerCase()}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', marginTop: 6, lineHeight: 1.45 }}>
          Lo que cocina tiene que saber de esta mesa. Sale impreso con la siguiente comanda.
        </div>
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(texto.trim()); } }}
          placeholder="Cumpleaños, alergias, sin picante…"
          aria-label="Nota de la mesa"
          maxLength={500}
          style={{
            width: '100%', height: 48, marginTop: 16, padding: '0 14px', borderRadius: 12, outline: 'none',
            border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
            color: 'var(--u-text)', fontSize: 16,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
          <button type="button" onClick={() => onGuardar(texto.trim())} className="press btn-accent" style={{ width: '100%', padding: '14px', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            Guardar la nota
          </button>
          {valor && (
            <button type="button" onClick={() => onGuardar('')} className="press glass-quiet" style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)' }}>
              Quitar la nota
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Encabezado compartido ─────────────────────────────────── */
function WaiterHeader({
  title, waiterName, onBack, backLabel, showOrders, ordersCount, onShowOrders, onModoServicio,
}: {
  title: string;
  waiterName: string;
  onBack?: () => void;
  /** A dónde lleva la flecha. Una flecha pelada no distingue «a las mesas
      de aquí» de «al salón del que vine», y desde el rediseño son dos
      sitios distintos. */
  backLabel?: string;
  showOrders: boolean;
  ordersCount: number;
  onShowOrders: () => void;
  /** Encender el modo servicio. `null` si ya está encendido o no existe aquí. */
  onModoServicio: (() => void) | null;
}) {
  return (
    <header style={{
      background: 'linear-gradient(color-mix(in srgb, var(--u-text) 4%, transparent), color-mix(in srgb, var(--u-text) 4%, transparent)), color-mix(in srgb, var(--brand-bg) 82%, transparent)',
      borderBottom: '1px solid var(--u-hair)',
      borderRadius: 16,
    }}>
      <div className="waiter-wrap waiter-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBlock: 12 }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={backLabel ?? 'Volver'} title={backLabel} className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
            <Icon name="chevronLeft" size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--u-text-3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="userPlus" size={12} /> {waiterName}</div>
        </div>
        {/* El modo servicio vive AQUÍ desde el rediseño de 2026-09-01. Antes
            estaba solo en la vista «Mesas», así que quien llegaba desde el
            salón del dueño con `?mesa=4` no lo veía nunca — y es justo el
            modo que le devuelve media pantalla en el teléfono. */}
        {onModoServicio && (
          <button
            type="button"
            onClick={onModoServicio}
            className="press glass-quiet"
            aria-label="Modo servicio: pantalla completa"
            title="Modo servicio"
            style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', color: 'var(--u-text-2)', flexShrink: 0 }}
          >
            <Icon name="monitor" size={17} />
          </button>
        )}
        {showOrders && (
          <button type="button" onClick={onShowOrders} className="press glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            <Icon name="list" size={14} /> Pedidos{ordersCount > 0 ? ` (${ordersCount})` : ''}
          </button>
        )}
      </div>
    </header>
  );
}

/* ── Aviso de una línea ────────────────────────────────────────
   Todos los avisos del panel tienen la misma forma. */
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
