'use client';

/* ════════════════════════════════════════════════════════════
   MÓDULO DE SERVICIO — tomar pedidos y mesas
   ------------------------------------------------------------
   Un solo sitio para todo el turno: ver el salón, abrir una mesa,
   armar la comanda, mandarla a cocina, marcar lo servido y cobrar.

   Tres ramas del mismo árbol, decididas por el ancho:

     · < 900 px  una cosa a la vez: Salón → Comanda → Pedido.
     · ≥ 900 px  tres columnas: riel de salón, carta y comanda, y ya
                 no te mueves de esta pantalla en todo el turno.

   QUÉ SE CONSERVÓ DE LO QUE HABÍA, y por qué el handoff no lo dibujaba:

     · el CARRITO ES UN MAPA por mesa — cambiar de mesa no borra lo que
       se estaba apuntando en otra;
     · el BORRADOR sobrevive a cerrar la tablet (6 h, un turno);
     · la COLA SIN CONEXIÓN con respaldo al hub del local: el pedido se
       guarda ANTES de tocar la red y solo sale de la cola con un
       resultado definitivo;
     · el ARTÍCULO LIBRE (M-09) y ANULAR CON MOTIVO Y PIN (mig. 079);
     · la mesa SENTADA sin pedido (mig. 128), que el diseño habría
       pintado libre.

   Y qué se corrigió del propio prototipo: los botones primarios traían
   `color:var(--brand-bg-2)fff` (CSS inválido, el color no se aplicaba),
   la rejilla se colapsaba a un resultado al teclear «2 pep», la
   confirmación de «liberar» no caducaba nunca, los pedidos para llevar
   reusaban el número al cobrar uno y el dictado era un `setTimeout` con
   dos platos quemados.
   ════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Icon } from '@/components/icons';
import {
  ChipEstado, Ghost, Key, Kicker, Pill, Toast, atajo, useReloj, useTeclaMod, type Aviso,
} from '@/components/admin/servicio/pieces';
import { SalonFichas, SalonPlano, SalonRiel, hayPlano, nivelesConMesas } from '@/components/admin/servicio/salon';
import Carta from '@/components/admin/servicio/carta';
import Comanda from '@/components/admin/servicio/comanda';
import HojaCobro, { type PagoElegido } from '@/components/admin/servicio/hoja-cobro';
import {
  HojaAtajos, HojaLibre, HojaLinea, HojaLlevar, HojaMesa, HojaVoz,
} from '@/components/admin/servicio/hojas';
import HojaOpciones from '@/components/admin/servicio/hoja-opciones';
import Paleta, { type AccionPaleta } from '@/components/admin/servicio/paleta';
import VoidOrderDialog from '@/components/admin/void-order-dialog';
import { useSalonLive } from '@/components/admin/salon/use-salon-live';
import { useServiceMode } from '@/components/admin/service-mode';
import { money as fmtMoney, newLineId, LIBRE_ID, type CartLine } from '@/components/admin/waiter/cart';
import type { PanelCurrency } from '@/components/admin/order-card';

import {
  comandaDeMesa, resumirComanda, unidadDeCarrito, importeLinea,
  type EnvioEnVuelo, type LineaServicio,
} from '@/lib/servicio/comanda';
import {
  mesasDeServicio, pasaFiltro, porUrgencia, resumenDelSalon, subtituloDeMesa,
  FILTROS, type FiltroSalon,
} from '@/lib/servicio/estado';
import { reconocimientoDisponible } from '@/lib/servicio/voz';
import {
  createWaiterOrder, freeTable, getTableBill, moveTableOrders, resolveTableCalls,
  updateOrderStatus, printTableBillShare,
} from '@/lib/actions/orders';
import {
  cobrarParteDeMesa, cobrarPedidoParaLlevar, cobradoDeMesa, deshacerServirLineas,
  ponerNombreDeMesa, servirLineas,
} from '@/lib/actions/servicio';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { getQueuedOrders, saveQueuedOrder, removeQueuedOrder } from '@/lib/order-queue';
import { billBreakdown, type BillBreakdown } from '@/lib/bill-split';
import type { OrderWithItems, TableOccupancy, TableCall } from '@/lib/db/orders';
import type { TableSeating } from '@/lib/db/table-sessions';
import type { FloorPlan } from '@/lib/theme/defaults';
import type { Category, OrderStatus, Product } from '@/types';
import { assetSrc } from '@/lib/asset-image';
import { shortOrderNumber } from '@/lib/order-number';

/* ── Borrador del pedido en curso ──────────────────────────────
   El carrito vive en memoria: sin esto, salir de la pantalla a media
   comanda se llevaba por delante una orden de doce platos sin decir una
   palabra. Se guarda en el propio aparato —es un borrador, no un
   pedido— y caduca en seis horas, que es un turno. */
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

type CartMap = Record<string, CartLine[]>;

function draftKey(restaurantId: string, waiterId: string): string {
  return `leogin:servicio-draft:${restaurantId}:${waiterId}`;
}

function contarCarts(carts: CartMap): number {
  return Object.values(carts).reduce((s, c) => s + c.reduce((n, l) => n + l.quantity, 0), 0);
}

/**
 * Qué está elegido. Una sola cosa a la vez.
 *
 * `pedido` es un PARA LLEVAR ya enviado. El handoff los trataba como
 * mesas numeradas L1, L2… y los borraba al cobrar, con lo que el
 * siguiente reusaba el número — dos «L1» en el mismo turno. Aquí la
 * identidad es el pedido de verdad y su número correlativo, que no se
 * repite nunca.
 */
type Sel =
  | { kind: 'none' }
  | { kind: 'mesa'; n: number }
  | { kind: 'llevar' }
  | { kind: 'pedido'; id: string };

function cartKey(sel: Sel): string {
  if (sel.kind === 'mesa') return `mesa-${sel.n}`;
  if (sel.kind === 'llevar') return 'llevar';
  return '';
}

/** Las tres pantallas del teléfono. */
type Pantalla = 'sala' | 'comanda' | 'ticket';

type Hoja =
  | null
  | { k: 'mods'; product: Product; qty: number; line?: CartLine }
  | { k: 'cobrar' }
  | { k: 'mesa' }
  | { k: 'llevar' }
  | { k: 'voz' }
  | { k: 'atajos' }
  | { k: 'libre'; nombre: string }
  | { k: 'linea'; linea: LineaServicio }
  | { k: 'anular'; orderId: string; orderStatus: OrderStatus; item: { id: string; name: string; remainingQty: number } | null };

export interface ServicioPanelProps {
  waiterId: string;
  waiterName: string;
  restaurantId: string;
  restaurantName: string;
  logoUrl?: string | null;
  categories: Category[];
  products: Product[];
  /** Ids de los platos más vendidos, en orden. Alimenta «los más pedidos». */
  masPedidos: string[];
  initialOrders: OrderWithItems[];
  occupancy: Record<number, TableOccupancy>;
  calls: Record<number, TableCall>;
  seatings: Record<number, TableSeating>;
  tableCount: number;
  pickupEnabled: boolean;
  tipEnabled: boolean;
  tipEnabledPickup: boolean;
  currency: PanelCurrency;
  floorPlan: FloorPlan | null;
  hubUrl: string | null;
  hubToken: string | null;
}

export default function ServicioPanel({
  waiterId, waiterName, restaurantId, restaurantName, logoUrl,
  categories, products, masPedidos, initialOrders,
  occupancy, calls, seatings, tableCount,
  pickupEnabled, tipEnabled, tipEnabledPickup, currency, floorPlan, hubUrl, hubToken,
}: ServicioPanelProps) {
  const servicio = useServiceMode();
  const now = useReloj();
  const mod = useTeclaMod();

  /* ── Qué está elegido ─────────────────────────────────────── */
  const [sel, setSel] = useState<Sel>({ kind: 'none' });
  const [pantalla, setPantalla] = useState<Pantalla>('sala');
  const [filtro, setFiltro] = useState<FiltroSalon>('Todas');
  /* El plano NO es una vista del riel: en 264 px serían mesas de
     dieciocho píxeles. Se abre encima de todo, se mira, se toca una mesa
     y se cierra habiéndola elegido — que es para lo que sirve un plano:
     orientarse, no trabajar. */
  const [planoAbierto, setPlanoAbierto] = useState(false);
  const [nivel, setNivel] = useState<string | null>(null);

  /* ── El pedido que se está apuntando ──────────────────────── */
  const [carts, setCarts] = useState<CartMap>({});
  /* A nombre de quién va el pedido de mostrador. Vive aparte del carrito
     porque no es un plato: es el rótulo que cocina lee en el papel. */
  const [nombreLlevar, setNombreLlevar] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [aprendiz, setAprendiz] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [trabajando, startWork] = useTransition();
  /* Comandas mandadas a cocina que la nube todavía no confirma, por mesa
     (misma clave que el carrito). Ver «Enviar a cocina», más abajo. */
  const [enVuelo, setEnVuelo] = useState<Record<string, EnvioEnVuelo[]>>({});

  /* ── La mesa abierta, desde la base ───────────────────────── */
  const [mesaOrders, setMesaOrders] = useState<OrderWithItems[]>([]);
  const [pagadas, setPagadas] = useState<string[]>([]);
  /* El DINERO ya cobrado de esta mesa, leído de `order_payments`. No se
     deduce de las líneas marcadas: la suma de las líneas es consumo y el
     dinero lleva además propina, así que restar lo uno de lo otro deja la
     cuenta descuadrada. */
  const [cobrado, setCobrado] = useState(0);
  const [cargandoMesa, setCargandoMesa] = useState(false);

  /* Cuántos pedidos esperan a que vuelva la señal. Se dice en voz alta y
     no en silencio: un pedido encolado es comida que cocina no ha visto,
     y el mesero tiene que saberlo para avisar a mano. */
  const [enCola, setEnCola] = useState(0);
  const contarCola = useCallback(() => {
    try { setEnCola(getQueuedOrders(restaurantId, 'waiter').length); } catch { /* sin almacenamiento */ }
  }, [restaurantId]);
  useEffect(() => {
    contarCola();
    const id = setInterval(contarCola, 15_000);
    window.addEventListener('online', contarCola);
    return () => { clearInterval(id); window.removeEventListener('online', contarCola); };
  }, [contarCola]);

  /* ── QUÉ ANCHO TIENE EL MÓDULO ────────────────────────────
     Se mide el MÓDULO y no la ventana, porque dentro del panel no son lo
     mismo: la barra lateral del administrador se lleva 244 px. Medido en
     pantalla con el salón real, a 1.150 px de ventana el módulo medía
     906, el riel y la comanda se quedaban con los anchos de PC y la
     carta caía a 298 px con la rejilla en UNA columna — la primera regla
     dura del handoff, rota.

     Un `ResizeObserver` sobre el armazón, con los MISMOS cortes que las
     `@container` de la hoja de estilos, para que el JavaScript y el CSS
     no puedan discrepar.

     `conTeclado` sí va por PUNTERO y no por ancho: una tablet de 1.280 px
     sigue siendo un dedo, y las pistas de ⌘K no llevan a ningún sitio
     ahí. */
  const [conTeclado, setConTeclado] = useState(false);
  const [hayVoz, setHayVoz] = useState(false);
  const [movil, setMovil] = useState(false);
  const [estrecho, setEstrecho] = useState(false);
  /* Se observa la RAÍZ y no el armazón: un elemento con `container-type`
     no le reporta sus propios cambios de tamaño a un `ResizeObserver`
     —comprobado en pantalla: el ancho pasó de 906 a 700 px y el
     observador no recibió un solo evento—. La raíz mide exactamente lo
     mismo y sí avisa. */
  const raiz = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fino = window.matchMedia('(pointer: fine)');
    const aplicarPuntero = () => setConTeclado(fino.matches);
    aplicarPuntero();
    fino.addEventListener('change', aplicarPuntero);
    setHayVoz(reconocimientoDisponible());

    const el = raiz.current;
    if (!el) return () => fino.removeEventListener('change', aplicarPuntero);

    const medir = (ancho: number) => {
      /* Un 0 es un contenedor todavía sin medir (o un panel oculto): se
         ignora. Sin esto el módulo parpadea a la rama del teléfono en el
         primer fotograma de una PC. */
      if (ancho <= 0) return;
      setMovil(ancho <= 899);
      setEstrecho(ancho <= 1099);
    };
    medir(el.clientWidth);
    const ro = new ResizeObserver((entradas) => {
      for (const e of entradas) medir(e.contentRect.width);
    });
    ro.observe(el);

    /* Y un respaldo por `resize` de ventana. Un `ResizeObserver` entrega
       sus avisos al final de un fotograma, así que en una pestaña que no
       está pintando —en segundo plano, o minimizada— puede tardar. El
       evento de ventana sí llega, y volver a medir es gratis. */
    const alRedimensionar = () => medir(el.clientWidth);
    window.addEventListener('resize', alRedimensionar);

    return () => {
      fino.removeEventListener('change', aplicarPuntero);
      window.removeEventListener('resize', alRedimensionar);
      ro.disconnect();
    };
  }, []);

  /* El salón cambia aunque nadie toque esta pantalla. */
  useSalonLive(`servicio-${restaurantId}`);
  useEffect(() => { if (hubUrl) warmUpHub(hubUrl); }, [hubUrl]);

  /* ── Modo aprendiz: se recuerda por aparato ───────────────── */
  useEffect(() => {
    try { setAprendiz(localStorage.getItem('leogin:servicio-aprendiz') === '1'); } catch { /* sin almacenamiento */ }
  }, []);
  const cambiarAprendiz = useCallback(() => {
    setAprendiz((a) => {
      try { localStorage.setItem('leogin:servicio-aprendiz', a ? '0' : '1'); } catch { /* da igual */ }
      return !a;
    });
  }, []);

  /* ── LA MESA VIVE TAMBIÉN EN LA URL ───────────────────────
     Para que recargar la tablet a media comanda no pierda la mesa, y para
     que el salón del encargado pueda mandar aquí con una mesa puesta
     (`?mesa=7`, y `?ir=cobrar` para aterrizar en el cobro).

     Se escribe con `history.replaceState` y NO con el router: lo segundo
     vuelve a pedir la página al servidor en cada toque de mesa, y en una
     tablet eso son cientos de viajes por turno para no cambiar un dato. */
  const urlLeida = useRef(false);
  useEffect(() => {
    if (urlLeida.current) return;
    urlLeida.current = true;
    const params = new URLSearchParams(window.location.search);
    const n = Number(params.get('mesa'));
    if (!Number.isInteger(n) || n < 1) return;
    setSel({ kind: 'mesa', n });
    if (params.get('ir') === 'cobrar' || params.get('ir') === 'dividir') setHoja({ k: 'cobrar' });
    setPantalla('comanda');
  }, []);

  useEffect(() => {
    const q = sel.kind === 'mesa' ? `?mesa=${sel.n}` : '';
    const actual = `${window.location.pathname}${window.location.search}`;
    const siguiente = `${window.location.pathname}${q}`;
    if (actual !== siguiente) window.history.replaceState(null, '', siguiente);
  }, [sel]);

  /* ── El borrador ──────────────────────────────────────────── */
  const rescatado = useRef(false);
  useEffect(() => {
    if (rescatado.current) return;
    rescatado.current = true;
    try {
      const raw = localStorage.getItem(draftKey(restaurantId, waiterId));
      if (!raw) return;
      const d = JSON.parse(raw) as { carts: CartMap; savedAt: number };
      if (!d?.carts || Date.now() - (d.savedAt ?? 0) > DRAFT_TTL_MS) {
        localStorage.removeItem(draftKey(restaurantId, waiterId));
        return;
      }
      if (contarCarts(d.carts) === 0) return;
      setCarts(d.carts);
      const n = contarCarts(d.carts);
      setAviso({ text: n === 1 ? 'Se recuperó 1 plato sin enviar.' : `Se recuperaron ${n} platos sin enviar.` });
    } catch { /* modo privado: el borrador es un extra */ }
  }, [restaurantId, waiterId]);

  useEffect(() => {
    const k = draftKey(restaurantId, waiterId);
    try {
      if (contarCarts(carts) === 0) { localStorage.removeItem(k); return; }
      localStorage.setItem(k, JSON.stringify({ carts, savedAt: Date.now() }));
    } catch { /* cuota llena */ }
  }, [carts, restaurantId, waiterId]);

  /* ── La mesa elegida se lee de la base ────────────────────── */
  /* La selección y la última lectura pedida, para las respuestas que
     llegan tarde. Sin esto, abrir la Mesa 1 y saltar enseguida a la 2
     podía pintar los platos de la 1 bajo el rótulo de la 2 si su lectura
     llegaba después — y con el envío sin espera, «recargar la mesa al
     confirmar» llega casi siempre después de que el mesero ya siguió. */
  const selRef = useRef(sel);
  useEffect(() => { selRef.current = sel; }, [sel]);
  const lecturaRef = useRef(0);

  const cargarMesa = useCallback(async (n: number) => {
    const yo = ++lecturaRef.current;
    setCargandoMesa(true);
    try {
      const [bill, cobrado] = await Promise.all([
        getTableBill(restaurantId, n),
        cobradoDeMesa(restaurantId, n),
      ]);
      // Una lectura más nueva ya salió (o la mesa cambió): esta sobra.
      if (yo !== lecturaRef.current) return;
      setMesaOrders('orders' in bill ? bill.orders : []);
      setPagadas(cobrado.lineasPagadas ?? []);
      setCobrado(cobrado.total ?? 0);
      if ('error' in bill) setAviso({ text: bill.error, bad: true });
    } catch {
      /* Sin conexión la mesa se queda con lo que hubiera: lo apuntado en
         este aparato se sigue viendo y se puede seguir tomando el pedido,
         que es de lo que trata la cola sin conexión. */
      if (yo === lecturaRef.current) {
        setAviso({ text: 'No se pudo leer la mesa. Lo que apuntes se guarda igual.', bad: true });
      }
    } finally {
      if (yo === lecturaRef.current) setCargandoMesa(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (sel.kind !== 'mesa') { setMesaOrders([]); setPagadas([]); setCobrado(0); return; }
    void cargarMesa(sel.n);
  }, [sel, cargarMesa]);

  /* Cuando el salón cambia por Realtime, la mesa abierta también.
     `occupancy` llega del servidor, así que su identidad cambia con cada
     refresco: es la señal de «vuelve a leer la mesa» más barata que hay. */
  useEffect(() => {
    if (sel.kind === 'mesa') void cargarMesa(sel.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupancy]);

  /* ── El salón ─────────────────────────────────────────────── */
  const key = cartKey(sel);
  const carrito = useMemo(() => carts[key] ?? [], [carts, key]);

  const sinEnviarPorMesa = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [k, lineas] of Object.entries(carts)) {
      if (!k.startsWith('mesa-')) continue;
      const n = Number(k.slice(5));
      if (!Number.isFinite(n)) continue;
      const total = lineas.reduce((s, l) => s + l.quantity, 0);
      if (total > 0) out[n] = total;
    }
    return out;
  }, [carts]);

  const totalSinEnviarPorMesa = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [k, lineas] of Object.entries(carts)) {
      if (!k.startsWith('mesa-')) continue;
      const n = Number(k.slice(5));
      if (!Number.isFinite(n)) continue;
      out[n] = lineas.reduce((s, l) => s + unidadDeCarrito(l) * l.quantity, 0);
    }
    return out;
  }, [carts]);

  /* Pedidos que llegaron por QR y cocina no ha aceptado: `NEW` sin mesero.
     Un pedido sin `waiter_id` en una mesa es el comensal pidiendo desde su
     teléfono, que es justo el caso que el aviso azul atiende. */
  const qrPendientePorMesa = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [k, occ] of Object.entries(occupancy)) {
      if (occ.status === 'NEW' && occ.waiterName == null) out[Number(k)] = occ.itemCount;
    }
    return out;
  }, [occupancy]);

  const mesas = useMemo(() => mesasDeServicio({
    tableCount, occupancy, calls, seatings,
    sinEnviar: sinEnviarPorMesa, totalSinEnviar: totalSinEnviarPorMesa,
    qrPendiente: qrPendientePorMesa, floorPlan, now,
  }), [tableCount, occupancy, calls, seatings, sinEnviarPorMesa, totalSinEnviarPorMesa, qrPendientePorMesa, floorPlan, now]);

  const mesasVisibles = useMemo(
    () => porUrgencia(mesas.filter((m) => pasaFiltro(m, filtro))),
    [mesas, filtro],
  );

  const mesaSel = sel.kind === 'mesa' ? mesas.find((m) => m.n === sel.n) ?? null : null;

  /* ── Los «para llevar» en marcha ──────────────────────────
     Sin esto, el mostrador era una puerta de un solo sentido: se mandaba
     el pedido y desaparecía de la pantalla, sin forma de servirlo ni de
     cobrarlo desde aquí. */
  const llevarActivos = useMemo(
    () => initialOrders.filter((o) => o.order_type === 'PICKUP'
      && o.status !== 'DELIVERED' && o.status !== 'CANCEL'),
    [initialOrders],
  );
  const pedidoSel = sel.kind === 'pedido'
    ? llevarActivos.find((o) => o.id === sel.id) ?? null
    : null;

  /* ── La comanda ───────────────────────────────────────────── */
  const pagadasSet = useMemo(() => new Set(pagadas), [pagadas]);

  /* Lo del QR se aparta de la comanda: no está aceptado todavía, así que
     no puede contar como «falta servir» ni sumar al total. */
  const [ordersQr, ordersVivos] = useMemo(() => {
    const qr: OrderWithItems[] = [];
    const vivos: OrderWithItems[] = [];
    const fuente = pedidoSel ? [pedidoSel] : mesaOrders;
    for (const o of fuente) {
      if (o.status === 'NEW' && !o.waiter_id) qr.push(o); else vivos.push(o);
    }
    return [qr, vivos];
  }, [mesaOrders, pedidoSel]);

  const vueloAqui = useMemo(() => enVuelo[key] ?? [], [enVuelo, key]);
  /* Con un envío en vuelo la mesa no se cobra ni se cierra hasta que la
     nube lo confirme (medio segundo, normalmente): si no, el pedido podía
     llegar a una mesa ya liberada. */
  const envioPendiente = vueloAqui.length > 0;
  const lineas = useMemo(
    () => comandaDeMesa(sel.kind === 'llevar' ? [] : ordersVivos, carrito, pagadasSet, sel.kind === 'mesa' ? vueloAqui : []),
    [sel.kind, ordersVivos, carrito, pagadasSet, vueloAqui],
  );
  const resumen = useMemo(() => resumirComanda(lineas), [lineas]);

  const desglose: BillBreakdown | null = useMemo(
    () => (ordersVivos.length ? billBreakdown(ordersVivos) : null),
    [ordersVivos],
  );

  /* LOS DOS TOTALES, y confundirlos hace que el botón prometa un número y
     el sistema cobre otro.
     ------------------------------------------------------------------
     `resumen` suma LÍNEAS, así que se queda en el consumo: no sabe de
     propina ni de descuentos, que viven en el pedido. `freeTable` cierra
     la mesa cobrando `orders.total`. Aquí se junta lo uno con lo otro:
     lo ya enviado vale lo que valen sus pedidos, y lo apuntado sin enviar
     vale lo que suman sus líneas (todavía no es un pedido). */
  const valorEnviado = desglose ? desglose.grandTotal : resumen.totalEnviado;
  const totalMesa = Math.round((valorEnviado + resumen.totalNuevo) * 100) / 100;
  const porCobrarReal = Math.max(0, Math.round((valorEnviado - cobrado) * 100) / 100);

  const pendientesQr = useMemo(() => {
    if (ordersQr.length === 0) return null;
    const items = ordersQr.flatMap((o) => o.items);
    return {
      id: ordersQr[0].id,
      unidades: items.reduce((s, i) => s + i.quantity, 0),
      texto: items.map((i) => `${i.quantity}× ${i.name_snapshot}`).join(' · '),
    };
  }, [ordersQr]);

  /* ── Dinero ───────────────────────────────────────────────── */
  const money = useCallback((n: number) => fmtMoney(n, currency), [currency]);
  const redondear = useCallback((n: number) => fmtMoney(n, currency, 0), [currency]);

  /* ── Añadir al carrito ────────────────────────────────────── */
  const tocaMesa = useCallback(() => {
    setAviso({ text: 'Elige una mesa primero', bad: true });
  }, []);

  const empujar = useCallback((linea: CartLine, aviso = true) => {
    if (sel.kind === 'none') { tocaMesa(); return; }
    const k = cartKey(sel);
    setCarts((prev) => {
      const actual = prev[k] ?? [];
      /* Se agrupa con la línea idéntica: mismo plato, mismas opciones,
         misma nota. Sin esto, tocar cinco veces el mismo plato deja cinco
         renglones y la comanda deja de leerse. */
      const firma = (l: CartLine) => JSON.stringify([
        l.productId, l.name, [...l.options.map((o) => o.choiceId)].sort(), l.note ?? '', !!l.open, l.price,
      ]);
      const mia = firma(linea);
      const ya = actual.find((l) => firma(l) === mia);
      const siguiente = ya
        ? actual.map((l) => (l === ya ? { ...l, quantity: l.quantity + linea.quantity } : l))
        : [...actual, linea];
      return { ...prev, [k]: siguiente };
    });
    if (aviso) {
      setAviso({ text: `${linea.quantity > 1 ? `${linea.quantity}× ` : ''}${linea.name}` });
    }
  }, [sel, tocaMesa]);

  const agregarProducto = useCallback((p: Product, qty: number) => {
    if (sel.kind === 'none') { tocaMesa(); return; }
    const grupos = (p.options as { id: string; required?: boolean; type?: string }[] | null) ?? [];
    /* Si el plato tiene un grupo OBLIGATORIO, un toque no puede resolverlo:
       se abre la hoja con la cantidad ya puesta. Lo demás entra directo,
       que es lo que hace que tomar un pedido sea un toque por plato. */
    const exige = grupos.some((g) => g.required && g.type !== 'combo');
    if (exige) { setHoja({ k: 'mods', product: p, qty }); return; }
    empujar({
      lineId: newLineId(p.id),
      productId: p.id,
      name: p.name,
      price: p.price,
      quantity: qty,
      options: [],
    });
  }, [sel, empujar, tocaMesa]);

  const paso = useCallback((l: LineaServicio, delta: number) => {
    const k = cartKey(sel);
    if (!k || !l.carrito) return;
    setCarts((prev) => {
      const actual = prev[k] ?? [];
      const siguiente = actual
        .map((x) => (x.lineId === l.id ? { ...x, quantity: x.quantity + delta } : x))
        .filter((x) => x.quantity > 0);
      const out = { ...prev };
      if (siguiente.length) out[k] = siguiente; else delete out[k];
      return out;
    });
  }, [sel]);

  const qtyOf = useCallback(
    (productId: string) => carrito.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity, 0),
    [carrito],
  );

  /* ── Enviar a cocina ──────────────────────────────────────── */
  const enviar = useCallback(() => {
    if (sel.kind === 'none' || carrito.length === 0) return;
    const mesa = sel.kind === 'mesa' ? sel.n : null;
    const k = cartKey(sel);
    const aEnviar = [...carrito];
    /* UUID de verdad, no una cadena con pinta de id: `orders.client_id` es
       una columna `uuid` y el esquema la valida con `z.string().uuid()`.
       Con un `srv-<mesero>-<hora>` el envío moría con «Invalid uuid» —
       visto tal cual contra la base local, con la comanda ya apuntada y
       sin forma de mandarla. */
    const clientId = crypto.randomUUID();
    const subtotal = aEnviar.reduce((s, l) => s + unidadDeCarrito(l) * l.quantity, 0);
    const aplicaPropina = mesa ? tipEnabled : tipEnabledPickup;

    const input = {
      restaurantId,
      clientId,
      waiterId,
      items: aEnviar.filter((l) => !l.open).map((l) => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
        options: l.options.map((o) => ({
          groupId: o.groupId, choiceId: o.choiceId, ...(o.variantId ? { variantId: o.variantId } : {}),
        })),
        ...(l.note ? { note: l.note } : {}),
      })),
      /* Los artículos libres viajan aparte: `items` se contrasta contra el
         catálogo —precio autoritativo desde la base— y un artículo libre no
         tiene con qué contrastarse. Ese es su motivo de existir (M-09). */
      openItems: aEnviar.filter((l) => l.open).map((l) => ({
        name: l.name, price: l.price, quantity: l.quantity, ...(l.note ? { note: l.note } : {}),
      })),
      customer: {
        name: mesa ? `Mesa ${mesa}` : (nombreLlevar || 'Mostrador'),
        phone: '',
        type: (mesa ? 'DINE_IN' : 'PICKUP') as 'PICKUP' | 'DINE_IN',
        ...(mesa ? { tableNumber: mesa } : {}),
      },
      tipAccepted: aplicaPropina && subtotal > 0,
    };

    /* ENVÍO SIN ESPERA. El mesero no se queda mirando «Enviando…»: el
       carrito se vacía al tocar, sus líneas pasan a «Falta servir» marcadas
       como enviándose (ver EnvioEnVuelo) y puede seguir con la siguiente
       mesa mientras la nube contesta. Es seguro por lo mismo que ya lo era
       el modo sin conexión:
         · WRITE-AHEAD: el pedido se guarda en la cola del aparato ANTES de
           tocar la red y solo sale de ella con un resultado definitivo;
         · el `clientId` idempotente (migración 061) impide duplicarlo.
       Si la nube lo RECHAZA (un plato que se agotó, un permiso), las líneas
       vuelven al carrito de su mesa con el motivo: nada se pierde en
       silencio. Y mientras una mesa tiene un envío en vuelo no se puede
       cobrar ni cerrar (puedeCobrar / busy): cerrarla antes de que llegue el
       pedido lo dejaría colgando de una mesa ya libre. */
    const unidades = aEnviar.reduce((s, l) => s + l.quantity, 0);
    const lugar = mesa ? `Mesa ${mesa}` : 'Para llevar';
    const nombreEnviado = nombreLlevar;

    const quitarDelVuelo = () => setEnVuelo((prev) => {
      const quedan = (prev[k] ?? []).filter((e) => e.clientId !== clientId);
      const out = { ...prev };
      if (quedan.length) out[k] = quedan; else delete out[k];
      return out;
    });
    /* Las líneas rechazadas vuelven DELANTE de lo que se haya apuntado
       mientras tanto en esa mesa: son lo que se pidió primero. */
    const devolverAlCarrito = () => {
      setCarts((prev) => ({ ...prev, [k]: [...aEnviar, ...(prev[k] ?? [])] }));
      if (!mesa) setNombreLlevar((prev) => prev || nombreEnviado);
    };

    saveQueuedOrder(restaurantId, { clientId, payload: input, queuedAt: new Date().toISOString() }, 'waiter');
    setCarts((prev) => { const out = { ...prev }; delete out[k]; return out; });
    setEnVuelo((prev) => ({ ...prev, [k]: [...(prev[k] ?? []), { clientId, lineas: aEnviar }] }));
    setAviso({ text: `Enviando ${unidades} a cocina · ${lugar}…` });
    setQ('');
    if (!mesa) { setSel({ kind: 'none' }); setNombreLlevar(''); }
    /* En el teléfono vuelve al salón: el mesero sigue con la siguiente
       mesa. En pantalla grande se queda donde está, que es lo que hace
       que no haya que moverse en todo el turno. */
    if (movil) setPantalla('sala');

    void (async () => {
      try {
        const res = await createWaiterOrder(input);
        removeQueuedOrder(restaurantId, clientId, 'waiter');
        if (res.error) {
          devolverAlCarrito();
          setAviso({ text: `${res.error} La comanda volvió al carrito · ${lugar}.`, bad: true });
          return;
        }
        setAviso({ text: `${unidades} a cocina · ${lugar}` });
        /* Sin `router.refresh()` aquí ni tras las demás acciones del
           servicio: todas llaman a revalidarSalon(), y una acción que
           revalida YA trae la pantalla nueva en su propia respuesta (Next
           la pinta dentro de la acción — action-handler.js,
           skipPageRendering). El refresh pedía una SEGUNDA pintura completa
           del panel —layout con sus consultas incluido— por cada toque.
           La mesa se relee solo si sigue abierta: si el mesero ya pasó a
           otra, la leerá al volver. */
        const ahora = selRef.current;
        if (mesa && ahora.kind === 'mesa' && ahora.n === mesa) await cargarMesa(mesa);
      } catch {
        /* La nube no respondió. Se intenta el hub local del restaurante,
           SALVO si el pedido lleva artículos libres: el hub arma el pedido
           contra su copia del menú y ese descorche se perdería en silencio
           —el mesero vería «impreso» y ese dinero no llegaría nunca—. */
        const conLibres = aEnviar.some((l) => l.open);
        if (hubUrl && !conLibres) {
          const hub = await tryHubOrder(hubUrl, hubToken, input);
          if (hub?.success) {
            removeQueuedOrder(restaurantId, clientId, 'waiter');
            setAviso({ text: `Pedido ${hub.orderNumber} impreso — se sincroniza solo al volver la señal.` });
            return;
          }
        }
        setAviso({
          text: conLibres
            ? 'Sin conexión: el pedido quedó guardado aquí con su artículo libre y se enviará entero al volver la señal. Avisa a cocina a mano.'
            : 'Sin conexión: el pedido quedó guardado en este aparato y se enviará solo al volver la señal.',
          bad: true,
        });
      } finally {
        quitarDelVuelo();
        contarCola();
      }
    })();
  }, [sel, carrito, nombreLlevar, waiterId, restaurantId, tipEnabled, tipEnabledPickup, hubUrl, hubToken, movil, cargarMesa, contarCola]);

  /* ── Servir ───────────────────────────────────────────────── */
  const servir = useCallback((l: LineaServicio) => {
    if (!l.orderId) return;
    startWork(async () => {
      const res = await servirLineas(restaurantId, [l.id]);
      if (res.error) {
        /* Sin la migración 133 no se puede marcar plato a plato: se cae a
           servir la RONDA entera, que es lo que este sistema sabía hacer
           antes, y se dice en voz alta para que nadie crea que marcó uno. */
        if (res.needsMigration && l.orderId) {
          const alt = await updateOrderStatus(l.orderId, 'SERVED');
          if (!alt?.error) {
            setAviso({ text: 'Se marcó la ronda entera como servida (falta la migración 133).' });
            if (sel.kind === 'mesa') void cargarMesa(sel.n);
            return;
          }
        }
        setAviso({ text: res.error, bad: true });
        return;
      }
      setAviso({
        text: `${l.nombre} en la mesa`,
        undo: () => {
          void deshacerServirLineas(restaurantId, res.ids ?? [], res.pedidosServidos ?? [])
            .then(() => { if (sel.kind === 'mesa') void cargarMesa(sel.n); });
        },
      });
      if (sel.kind === 'mesa') void cargarMesa(sel.n);
    });
  }, [restaurantId, sel, cargarMesa]);

  const deshacerServir = useCallback((l: LineaServicio) => {
    startWork(async () => {
      const res = await deshacerServirLineas(restaurantId, [l.id], l.orderId ? [l.orderId] : []);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setHoja(null);
      setAviso({ text: `${l.nombre} vuelve a «falta servir»` });
      if (sel.kind === 'mesa') void cargarMesa(sel.n);
    });
  }, [restaurantId, sel, cargarMesa]);

  /* ── El pedido del QR ─────────────────────────────────────── */
  const aceptarQr = useCallback(() => {
    if (!pendientesQr) return;
    startWork(async () => {
      for (const o of ordersQr) {
        const res = await updateOrderStatus(o.id, 'PREP');
        if (res?.error) { setAviso({ text: res.error, bad: true }); return; }
      }
      setAviso({ text: 'Pedido del QR aceptado y mandado a cocina' });
      if (sel.kind === 'mesa') void cargarMesa(sel.n);
    });
  }, [pendientesQr, ordersQr, sel, cargarMesa]);

  /* Rechazar un pedido del comensal es CANCELARLO, y este sistema exige
     motivo para eso (migración 079). El prototipo lo borraba y ya. */
  const rechazarQr = useCallback(() => {
    const o = ordersQr[0];
    if (!o) return;
    setHoja({ k: 'anular', orderId: o.id, orderStatus: o.status as OrderStatus, item: null });
  }, [ordersQr]);

  /* ── Cobrar ───────────────────────────────────────────────── */
  const cobrarTodo = useCallback((pagos: PagoElegido[]) => {
    if (sel.kind !== 'mesa') return;
    const n = sel.n;
    const importe = porCobrarReal;
    startWork(async () => {
      const res = await freeTable(restaurantId, n, pagos);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setHoja(null);
      setSel({ kind: 'none' });
      setPantalla('sala');
      setAviso({ text: `${money(importe)} cobrado · Mesa ${n} libre` });
    });
  }, [sel, restaurantId, porCobrarReal, money]);

  const cobrarParte = useCallback((parte: LineaServicio[], pagos: PagoElegido[]) => {
    if (sel.kind !== 'mesa') return;
    const n = sel.n;
    const importe = parte.reduce((s, l) => s + importeLinea(l), 0);
    startWork(async () => {
      const res = await cobrarParteDeMesa(
        restaurantId, n, parte.map((l) => l.id),
        pagos.map((p) => ({ method: p.method, amount: p.amount ?? importe, cashReceived: p.cashReceived })),
      );
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setHoja(null);
      setAviso({ text: `${money(res.cobrado ?? importe)} cobrado · la mesa sigue abierta` });
      void cargarMesa(n);
    });
  }, [sel, restaurantId, money, cargarMesa]);

  const cobrarLlevar = useCallback((pagos: PagoElegido[]) => {
    if (!pedidoSel) return;
    const id = pedidoSel.id;
    const numero = pedidoSel.order_number;
    startWork(async () => {
      const res = await cobrarPedidoParaLlevar(restaurantId, id, {
        method: pagos[0].method,
        amount: pagos[0].amount ?? Number(pedidoSel.total ?? 0),
        cashReceived: pagos[0].cashReceived,
      });
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setHoja(null);
      setSel({ kind: 'none' });
      setPantalla('sala');
      setAviso({ text: `Pedido ${numero} cobrado y entregado` });
    });
  }, [pedidoSel, restaurantId]);

  /* ── La mesa ──────────────────────────────────────────────── */
  const liberar = useCallback(() => {
    if (sel.kind !== 'mesa') return;
    const n = sel.n;
    startWork(async () => {
      const res = await freeTable(restaurantId, n);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setHoja(null);
      setSel({ kind: 'none' });
      setPantalla('sala');
      setAviso({ text: `Mesa ${n} liberada sin cobrar`, bad: true });
    });
  }, [sel, restaurantId]);

  const mover = useCallback((destino: number, juntar: boolean) => {
    if (sel.kind !== 'mesa') return;
    const origen = sel.n;
    startWork(async () => {
      const res = await moveTableOrders(restaurantId, origen, destino, juntar);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      /* Lo que estaba apuntado sin enviar se muda también: si no, el
         mesero mueve la mesa y los tres platos que acababa de teclear se
         quedan en una mesa que ya está vacía. */
      setCarts((prev) => {
        const out = { ...prev };
        const suyo = out[`mesa-${origen}`];
        if (suyo?.length) {
          out[`mesa-${destino}`] = [...(out[`mesa-${destino}`] ?? []), ...suyo];
          delete out[`mesa-${origen}`];
        }
        return out;
      });
      setHoja(null);
      setSel({ kind: 'mesa', n: destino });
      setAviso({ text: juntar ? `Mesas ${origen} y ${destino} juntadas` : `Movido a la mesa ${destino}` });
    });
  }, [sel, restaurantId]);

  const nombrarMesa = useCallback((nombre: string) => {
    if (sel.kind !== 'mesa') return;
    const n = sel.n;
    startWork(async () => {
      const res = await ponerNombreDeMesa(restaurantId, n, nombre);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
    });
  }, [sel, restaurantId]);

  const atender = useCallback(() => {
    if (sel.kind !== 'mesa') return;
    const n = sel.n;
    startWork(async () => {
      const res = await resolveTableCalls(restaurantId, n);
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setAviso({ text: 'Aviso atendido' });
    });
  }, [sel, restaurantId]);

  const imprimirCuenta = useCallback(() => {
    if (sel.kind !== 'mesa' || ordersVivos.length === 0) return;
    const n = sel.n;
    startWork(async () => {
      /* `personId: null` = la cuenta COMPLETA de la mesa. Los montos los
         recalcula el servidor desde los pedidos reales: aquí no se manda
         un solo número, para que lo impreso no pueda discrepar de lo que
         la mesa debe. */
      const res = await printTableBillShare({
        restaurantId,
        tableNumber: n,
        mode: 'single',
        peopleIds: [],
        names: {},
        assignment: {},
        personId: null,
      });
      setAviso(res?.error ? { text: res.error, bad: true } : { text: 'Cuenta enviada a la impresora' });
    });
  }, [sel, ordersVivos.length, restaurantId]);

  /* ── Elegir mesa ──────────────────────────────────────────── */
  const elegir = useCallback((n: number) => {
    setSel({ kind: 'mesa', n });
    setQ('');
    setCat(null);
    setHoja(null);
    if (movil) setPantalla('comanda');
  }, [movil]);

  const abrirLlevar = useCallback((nombre: string) => {
    setNombreLlevar(nombre);
    setSel({ kind: 'llevar' });
    setCarts((prev) => ({ ...prev, llevar: prev.llevar ?? [] }));
    setHoja(null);
    setQ('');
    if (movil) setPantalla('comanda');
    if (nombre) setAviso({ text: `Pedido para ${nombre}` });
  }, [movil]);

  /* ── Teclado ──────────────────────────────────────────────── */
  const favs = useMemo(() => {
    const porId = new Map(products.filter((p) => p.is_active && p.is_available).map((p) => [p.id, p]));
    return masPedidos.map((id) => porId.get(id)).filter((p): p is Product => !!p).slice(0, 9);
  }, [products, masPedidos]);

  const abiertas = useMemo(() => mesas.filter((m) => m.estado !== 'libre'), [mesas]);

  /* ⌘K / Ctrl K es de la PALETA del módulo, y de nadie más mientras el
     módulo esté abierto. El buscador global del panel escucha la misma
     tecla en `window`: sin esto se abrían LOS DOS a la vez, la paleta
     encima y el buscador debajo, y el foco se lo quedaba el de debajo —lo
     que se tecleaba iba a una caja que no se veía—. Se atiende en CAPTURA
     y se corta la propagación, así el otro ni se entera. */
  useEffect(() => {
    function onModK(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      e.stopPropagation();
      setPaleta(true);
    }
    window.addEventListener('keydown', onModK, true);
    return () => window.removeEventListener('keydown', onModK, true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (resumen.nNuevas > 0) enviar();
        return;
      }
      if (e.key === 'Escape') {
        if (paleta) { setPaleta(false); return; }
        if (hoja) return;                       // la hoja se cierra sola
        if (movil && pantalla !== 'sala') { setPantalla('sala'); return; }
        return;
      }
      /* A partir de aquí, nada mientras se escribe: un «3» dentro del
         buscador es parte de «3 limonadas», no el atajo del tercer
         favorito. */
      if (escribiendo || hoja || paleta) return;

      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (resumen.nNuevas === 0 && resumen.porCobrar > 0 && !envioPendiente) setHoja({ k: 'cobrar' });
        return;
      }
      if (e.key === '?') { e.preventDefault(); setHoja({ k: 'atajos' }); return; }
      /* «/» vuelve al buscador de la carta. La hoja de atajos lo prometía
         y nadie lo atendía. */
      if (e.key === '/' && !mod) {
        const campo = document.querySelector<HTMLInputElement>('.sv-find > input');
        if (campo) { e.preventDefault(); campo.focus(); campo.select(); }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (e.altKey) {
          /* Salta a la mesa abierta N **tal como se ven**: el prototipo
             usaba el orden del array y no el de la lista, así que Alt+3
             abría una mesa distinta de la tercera que se veía. */
          const m = abiertas[i];
          if (m) { e.preventDefault(); elegir(m.n); }
        } else {
          const p = favs[i];
          if (p) { e.preventDefault(); agregarProducto(p, 1); }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paleta, hoja, movil, pantalla, resumen.nNuevas, resumen.porCobrar, envioPendiente, enviar, abiertas, favs, elegir, agregarProducto]);

  /* ── Sugerir postre o bebida al cobrar ────────────────────── */
  const sugerencias = useMemo(() => {
    if (resumen.servidas.length + resumen.cocina.length === 0) return null;
    const catDe = new Map(products.map((p) => [p.id, p.category_id]));
    const nombreCat = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    const catsEnMesa = new Set(
      lineas.map((l) => (l.productId ? nombreCat.get(catDe.get(l.productId) ?? '') : null)).filter(Boolean),
    );
    const buscar = (palabra: string) => categories.find((c) => c.name.toLowerCase().includes(palabra));
    const postres = buscar('postre');
    const bebidas = buscar('bebida');
    const faltaPostre = postres && !catsEnMesa.has(postres.name.toLowerCase());
    const faltaBebida = bebidas && !catsEnMesa.has(bebidas.name.toLowerCase());
    const elegida = faltaPostre ? postres : faltaBebida ? bebidas : null;
    if (!elegida) return null;
    const items = products.filter((p) => p.category_id === elegida.id && p.is_active && p.is_available).slice(0, 2);
    if (items.length === 0) return null;
    return {
      label: faltaPostre ? 'Nadie pidió postre. ¿Se lo ofreciste?' : 'No hay bebidas en la cuenta.',
      items,
    };
  }, [resumen, products, categories, lineas]);

  /* ── Lo que el pie puede hacer ────────────────────────────── */
  const puedeCobrar = (sel.kind === 'mesa' || sel.kind === 'pedido')
    && resumen.nNuevas === 0 && porCobrarReal > 0.004 && !envioPendiente;
  const tituloSel = sel.kind === 'mesa'
    ? (mesaSel?.etiqueta ?? `Mesa ${sel.n}`)
    : sel.kind === 'llevar' ? 'Para llevar'
    : pedidoSel ? `Llevar · ${pedidoSel.customer_name}` : '';
  const subSel = sel.kind === 'mesa' && mesaSel
    ? `${subtituloDeMesa(mesaSel)}${mesaSel.mesero ? ` · ${mesaSel.mesero}` : ''}`
    : sel.kind === 'llevar' ? 'Mostrador · no ocupa mesa'
    : pedidoSel ? `${shortOrderNumber(pedidoSel.order_number)} · mostrador` : '';

  const nivelesPlano = useMemo(() => nivelesConMesas(floorPlan), [floorPlan]);
  const nivelActivo = nivel ?? nivelesPlano[0]?.id ?? '';
  const conPlano = hayPlano(floorPlan);

  const accionesPaleta: AccionPaleta[] = useMemo(() => [
    { label: 'Enviar a cocina', hint: atajo(mod, '⏎'), run: () => { setPaleta(false); enviar(); }, enabled: resumen.nNuevas > 0 },
    { label: 'Cobrar y cerrar mesa', hint: 'Alt C', run: () => { setPaleta(false); setHoja({ k: 'cobrar' }); }, enabled: puedeCobrar },
    { label: 'Pedido para llevar', hint: 'sin mesa', run: () => { setPaleta(false); setHoja({ k: 'llevar' }); }, enabled: pickupEnabled },
    { label: 'Juntar o mover mesa', hint: 'la mesa abierta', run: () => { setPaleta(false); setHoja({ k: 'mesa' }); }, enabled: sel.kind === 'mesa' },
    { label: 'Cobrar algo que no está en la carta', hint: 'artículo libre', run: () => { setPaleta(false); setHoja({ k: 'libre', nombre: '' }); }, enabled: sel.kind !== 'none' },
    { label: 'Modo aprendiz', hint: aprendiz ? 'activo' : 'apagado', run: () => { setPaleta(false); cambiarAprendiz(); } },
    { label: 'Atajos de teclado', hint: '?', run: () => { setPaleta(false); setHoja({ k: 'atajos' }); } },
  ], [resumen.nNuevas, puedeCobrar, pickupEnabled, sel.kind, aprendiz, enviar, cambiarAprendiz, mod]);

  /* ══════════════════════════════════════════════════════════
     LO QUE SE DIBUJA
     ══════════════════════════════════════════════════════════ */

  const cartaProps = {
    products, categories, masPedidos, q, setQ, cat, setCat, qtyOf,
    onAdd: agregarProducto,
    onOpts: (p: Product, qty: number) => setHoja({ k: 'mods', product: p, qty }),
    onOpenItem: (nombre: string) => setHoja({ k: 'libre', nombre }),
    onVoz: () => setHoja({ k: 'voz' }),
    conTeclado, aprendiz, hayVoz, money, movil,
  };

  const comandaProps = {
    resumen, money,
    pendientes: pendientesQr,
    onAceptarQr: aceptarQr,
    onRechazarQr: rechazarQr,
    atencion: mesaSel?.atencion ?? null,
    onAtender: atender,
    onStep: paso,
    onEditar: (l: LineaServicio) => {
      const p = products.find((x) => x.id === l.productId);
      if (!p || !l.carrito) {
        // Un artículo libre no tiene hoja de opciones: se edita con el ±.
        setAviso({ text: 'Este artículo se escribió a mano: cambia la cantidad con − y +.' });
        return;
      }
      setHoja({ k: 'mods', product: p, qty: l.cantidad, line: l.carrito });
    },
    onServir: servir,
    onLinea: (l: LineaServicio) => setHoja({ k: 'linea', linea: l }),
    aprendiz,
    ocupado: trabajando,
  };

  /* La mesa se está leyendo y todavía no hay nada que enseñar. */
  const leyendo = cargandoMesa && lineas.length === 0;

  const pie = (
    <>
      <div className="sv-foot-row">
        <span className="sv-foot-label">Total</span>
        <span className="sv-foot-total">{leyendo ? '—' : money(totalMesa)}</span>
      </div>
      {desglose && desglose.tip > 0 && (
        <div className="sv-foot-note">Propina incluida: {money(desglose.tip)}</div>
      )}
      {cobrado > 0 && (
        <div className="sv-foot-note">
          Ya cobrado {money(cobrado)} · faltan {money(porCobrarReal)}
        </div>
      )}
      {resumen.nNuevas > 0 && (
        <button type="button" className="sv-cta" onClick={enviar}>
          {`Enviar a cocina · ${resumen.nNuevas}`}
          {conTeclado && <span className="sv-cta-key">{atajo(mod, '⏎')}</span>}
        </button>
      )}
      {puedeCobrar && (
        <button type="button" className="sv-cta" data-tone="ok" onClick={() => setHoja({ k: 'cobrar' })}>
          Cobrar y cerrar mesa
          {conTeclado && <span className="sv-cta-key">Alt C</span>}
        </button>
      )}
      {sel.kind === 'llevar' && resumen.nNuevas === 0 && (
        <div className="sv-foot-note">Toca un plato para empezar el pedido de mostrador.</div>
      )}
      {conTeclado && (
        <div className="sv-foot-keys">
          1-9 los más pedidos · {atajo(mod, 'K')} buscar · {atajo(mod, '⏎')} enviar · Alt C cobrar · ? atajos
        </div>
      )}
    </>
  );

  return (
    <div className="sv" ref={raiz}>
      {/* El armazón es lo que se MIDE (`container-type` en `.sv-frame`).
          Las hojas y la paleta van fuera a propósito: son `position:
          fixed` y un contenedor de consulta las volvería relativas al
          módulo en vez de a la pantalla. */}
      <div className="sv-frame">
      {/* ── Barra superior: solo en tablet y PC ── */}
      {!movil && (
        <div className="sv-top">
          <div className="sv-top-id">
            <span className="sv-top-mark">
              {logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={assetSrc(logoUrl, 96)} alt="" />
                : restaurantName.slice(0, 1).toUpperCase()}
            </span>
            <span className="sv-top-name">
              {restaurantName}
              <span className="sv-top-sub" style={{ display: 'block' }}>{waiterName} · turno de hoy</span>
            </span>
          </div>

          <div className="sv-hs" style={{ flex: 1, minWidth: 0, padding: 2 }}>
            {abiertas.map((m, i) => (
              <button
                key={m.n}
                type="button"
                className="sv-tab"
                data-st={m.estado}
                data-on={sel.kind === 'mesa' && sel.n === m.n ? '1' : '0'}
                onClick={() => elegir(m.n)}
              >
                {conTeclado && i < 9 && <span className="sv-tab-key">{mod === '⌘' ? `⌥${i + 1}` : `Alt ${i + 1}`}</span>}
                <span style={{ fontWeight: 600 }}>Mesa {m.n}</span>
                {m.total > 0 && <span className="sv-tab-total">{redondear(m.total)}</span>}
                {m.atencion ? <span className="sv-tab-dot" style={{ background: 'var(--c-danger-solid)' }} /> : <span className="sv-tab-dot" />}
              </button>
            ))}
            {abiertas.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--u-text-3)', alignSelf: 'center' }}>
                Ninguna mesa abierta todavía
              </span>
            )}
          </div>

          <Ghost onClick={() => setPaleta(true)} icon="search">
            Buscar plato, mesa o acción
            {conTeclado && <Key>{atajo(mod, 'K')}</Key>}
          </Ghost>
          <Ghost onClick={cambiarAprendiz} on={aprendiz} title="Modo aprendiz">Modo aprendiz</Ghost>
          {servicio && (
            <Ghost
              onClick={servicio.toggle}
              icon={servicio.active ? 'x' : 'monitor'}
              soloIcono
              title={servicio.active ? 'Salir de pantalla completa' : 'Pantalla completa'}
            />
          )}
        </div>
      )}

      <div className="sv-body">
        {/* ══ RIEL / SALÓN ══ */}
        {(!movil || pantalla === 'sala') && (
          <div className={movil ? 'sv-pane' : 'sv-rail'}>
            <div className="sv-rail-head" style={movil ? { padding: '16px 16px 10px' } : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={movil ? 'sv-m-sala-title' : 'sv-rail-title'}>Salón</div>
                  <div className="sv-rail-sub">{resumenDelSalon(mesas)}</div>
                  {enCola > 0 && (
                    <div className="sv-chip" data-st="borrador" style={{ marginTop: 6 }}>
                      {enCola} {enCola === 1 ? 'pedido espera' : 'pedidos esperan'} señal
                    </div>
                  )}
                </div>
                {movil && (
                  <>
                    <Ghost onClick={() => setPaleta(true)} icon="search" soloIcono title="Buscar" />
                    <Ghost onClick={cambiarAprendiz} on={aprendiz} soloIcono icon="helpCircle" title="Modo aprendiz" />
                  </>
                )}
              </div>

              <div className="sv-hs">
                {FILTROS.map((f) => (
                  <Pill key={f} on={filtro === f} onClick={() => setFiltro(f)}>{f}</Pill>
                ))}
              </div>

              {conPlano && (
                <Ghost onClick={() => setPlanoAbierto(true)} icon="layout">Ver el plano</Ghost>
              )}

              {aprendiz && (
                <div className="sv-hint">
                  Toca una mesa para abrir su pedido. El color te dice qué le falta:
                  ámbar = sin enviar, azul = falta servir, verde = por cobrar.
                </div>
              )}

              {!movil && pickupEnabled && (
                <button type="button" className="sv-llevar" onClick={() => setHoja({ k: 'llevar' })}>
                  <span className="sv-llevar-ico"><Icon name="bag" size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Para llevar
                  </span>
                </button>
              )}
            </div>

            {(
              <div className={`sv-vs ${movil ? '' : 'sv-rail-list'}`} style={movil ? { padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 } : undefined}>
                {/* Los «para llevar» en marcha, arriba del salón. Sin esto el
                    mostrador era una puerta de un solo sentido: se mandaba el
                    pedido y desaparecía sin forma de servirlo ni cobrarlo. */}
                {llevarActivos.length > 0 && filtro !== 'Libres' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Kicker rule>Para llevar · {llevarActivos.length}</Kicker>
                    {llevarActivos.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="sv-mesa"
                        data-st={o.status === 'SERVED' ? 'listo' : 'cocina'}
                        data-on={sel.kind === 'pedido' && sel.id === o.id ? '1' : '0'}
                        onClick={() => {
                          setSel({ kind: 'pedido', id: o.id });
                          if (movil) setPantalla('ticket');
                        }}
                      >
                        <span className="sv-mesa-n"><Icon name="bag" size={17} /></span>
                        <span className="sv-mesa-id">
                          <span className="sv-mesa-title">{o.customer_name}</span>
                          <span className="sv-mesa-sub">{shortOrderNumber(o.order_number)}</span>
                        </span>
                        <span className="sv-mesa-right">
                          <span className="sv-mesa-total">{redondear(Number(o.total ?? 0))}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {movil ? (
                  <SalonFichas mesas={mesasVisibles} sel={sel.kind === 'mesa' ? sel.n : null} onPick={elegir} money={redondear} />
                ) : (
                  <SalonRiel mesas={mesasVisibles} sel={sel.kind === 'mesa' ? sel.n : null} onPick={elegir} money={redondear} estrecho={estrecho} />
                )}
                {mesasVisibles.length === 0 && (
                  <div className="sv-vacio">No hay mesas en «{filtro}».</div>
                )}
              </div>
            )}

            {movil && pickupEnabled && (
              <div className="sv-m-foot">
                <button type="button" className="sv-cta sv-m-cta" data-tone="quiet" onClick={() => setHoja({ k: 'llevar' })}>
                  <Icon name="bag" size={18} />
                  Pedido para llevar
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ CARTA ══ */}
        {(!movil || pantalla === 'comanda') && (
          <div className="sv-carta">
            {movil && (
              <div className="sv-m-head">
                <button type="button" className="sv-m-back" onClick={() => setPantalla('sala')} aria-label="Volver al salón">
                  <Icon name="chevronLeft" size={20} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sv-m-title">{tituloSel}</div>
                  <div className="sv-m-sub">{subSel}</div>
                </div>
                {sel.kind === 'mesa' && (
                  <button type="button" className="sv-m-back" onClick={() => setHoja({ k: 'mesa' })} aria-label="Opciones de la mesa">
                    <Icon name="more" size={20} />
                  </button>
                )}
              </div>
            )}
            <Carta {...cartaProps} />
            {movil && (
              <div className="sv-m-foot">
                <button type="button" className="sv-m-resumen" onClick={() => setPantalla('ticket')}>
                  {/* Mientras se lee la mesa no se afirma nada: al abrirla
                      el pie decía «Pedido vacío · Q0.00» de una mesa con cinco
                      platos, y en una red lenta eso se lee como cierto. */}
                  <span className="sv-m-resumen-label">
                    {leyendo ? 'Leyendo la mesa…'
                      : resumen.platos === 0 ? 'Pedido vacío'
                      : `Pedido de ${resumen.platos} ${resumen.platos === 1 ? 'plato' : 'platos'}`}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sv-m-resumen-total">{leyendo ? '—' : money(totalMesa)}</span>
                    <span style={{ color: 'var(--u-text-3)', fontSize: 13 }}>ver ▲</span>
                  </span>
                </button>
                {resumen.nNuevas > 0 && (
                  <button type="button" className="sv-cta sv-m-cta" onClick={enviar}>
                    {`Enviar a cocina · ${resumen.nNuevas}`}
                  </button>
                )}
                {puedeCobrar && (
                  <button type="button" className="sv-cta sv-m-cta" data-tone="ok" onClick={() => setHoja({ k: 'cobrar' })}>
                    Cobrar y cerrar mesa
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ COMANDA ══ */}
        {(!movil || pantalla === 'ticket') && (
          <div className={movil ? 'sv-pane' : 'sv-ticket'}>
            {sel.kind === 'none' ? (
              <div className="sv-empty">
                <div className="sv-empty-ico"><Icon name="list" size={24} /></div>
                <div className="sv-empty-title">Elige una mesa para empezar</div>
                <div className="sv-empty-text">
                  La comanda de esa mesa aparece aquí y ya no te mueves de esta pantalla.
                </div>
                {conTeclado && (
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>
                    {atajo(mod, 'K')} para buscarla por número
                  </div>
                )}
              </div>
            ) : (
              <>
                {movil ? (
                  <div className="sv-m-head">
                    <button type="button" className="sv-m-back" onClick={() => setPantalla('comanda')} aria-label="Volver a la carta">
                      <Icon name="chevronLeft" size={20} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sv-m-title">Pedido · {tituloSel}</div>
                      <div className="sv-m-sub">{subSel}</div>
                    </div>
                    {/* Las mismas opciones que en la carta: mover, juntar,
                        imprimir la cuenta. Es justo aquí, con la cuenta
                        delante, donde se piden. */}
                    {sel.kind === 'mesa' && (
                      <button type="button" className="sv-m-back" onClick={() => setHoja({ k: 'mesa' })} aria-label="Opciones de la mesa">
                        <Icon name="more" size={20} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="sv-ticket-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sv-ticket-title">{tituloSel}</div>
                      <div className="sv-ticket-sub">{subSel}</div>
                    </div>
                    {mesaSel && <ChipEstado estado={mesaSel.estado} />}
                    {sel.kind === 'mesa' && (
                      <button type="button" className="sv-edit" onClick={() => setHoja({ k: 'mesa' })} aria-label="Opciones de la mesa">
                        <Icon name="more" size={18} />
                      </button>
                    )}
                  </div>
                )}

                <div className="sv-vs">
                  {leyendo
                    ? <div className="sv-vacio">Leyendo la mesa…</div>
                    : <Comanda {...comandaProps} />}
                </div>

                <div className="sv-foot">{pie}</div>
              </>
            )}
          </div>
        )}
      </div>
      </div>

      {/* ══ HOJAS ══ */}
      {hoja?.k === 'mods' && (
        <HojaOpciones
          product={hoja.product}
          currency={currency}
          initialLine={hoja.line}
          initialQty={hoja.qty}
          onAdd={(linea) => { empujar(linea); setHoja(null); }}
          onSave={(lineId, linea) => {
            const k = cartKey(sel);
            setCarts((prev) => ({
              ...prev,
              [k]: (prev[k] ?? []).map((l) => (l.lineId === lineId ? { ...linea, lineId } : l)),
            }));
            setHoja(null);
            setAviso({ text: 'Opciones actualizadas' });
          }}
          onClose={() => setHoja(null)}
        />
      )}

      {hoja?.k === 'libre' && (
        <HojaLibre
          nombreInicial={hoja.nombre}
          money={money}
          onAgregar={(d) => {
            empujar({
              lineId: newLineId(LIBRE_ID),
              productId: LIBRE_ID,
              name: d.name,
              price: d.price,
              quantity: d.quantity,
              options: [],
              note: d.note,
              open: true,
            });
            setHoja(null);
            setQ('');
          }}
          onClose={() => setHoja(null)}
        />
      )}

      {hoja?.k === 'cobrar' && (
        <HojaCobro
          titulo={tituloSel}
          resumen={resumen}
          desglose={desglose}
          porCobrar={porCobrarReal}
          yaCobrado={cobrado}
          money={money}
          redondear={redondear}
          sugerencias={sugerencias}
          onSugerir={(p) => { agregarProducto(p, 1); setHoja(null); }}
          busy={trabajando || envioPendiente}
          onClose={() => setHoja(null)}
          onCobrarTodo={sel.kind === 'pedido' ? cobrarLlevar : cobrarTodo}
          onCobrarParte={cobrarParte}
        />
      )}

      {hoja?.k === 'mesa' && mesaSel && (
        <HojaMesa
          mesa={mesaSel}
          libres={mesas.filter((m) => m.estado === 'libre' && m.n !== mesaSel.n)}
          ocupadas={mesas.filter((m) => m.estado !== 'libre' && m.n !== mesaSel.n)}
          money={money}
          busy={trabajando || envioPendiente}
          onClose={() => setHoja(null)}
          onNombre={nombrarMesa}
          onMover={(n) => mover(n, false)}
          onJuntar={(n) => mover(n, true)}
          onLiberar={liberar}
          onArticuloLibre={() => setHoja({ k: 'libre', nombre: '' })}
          onImprimirCuenta={porCobrarReal > 0 ? imprimirCuenta : null}
        />
      )}

      {hoja?.k === 'llevar' && (
        <HojaLlevar onClose={() => setHoja(null)} onCrear={abrirLlevar} />
      )}

      {hoja?.k === 'voz' && (
        <HojaVoz
          productos={products.filter((p) => p.is_active)}
          money={money}
          onClose={() => setHoja(null)}
          onAgregar={(dictadas) => {
            for (const d of dictadas) {
              empujar({
                lineId: newLineId(d.producto.id),
                productId: d.producto.id,
                name: d.producto.name,
                price: d.producto.price,
                quantity: d.qty,
                options: [],
                ...(d.nota ? { note: d.nota } : {}),
              }, false);
            }
            setHoja(null);
            const n = dictadas.reduce((s, d) => s + d.qty, 0);
            setAviso({ text: n === 1 ? '1 plato agregado por voz' : `${n} platos agregados por voz` });
          }}
        />
      )}

      {hoja?.k === 'atajos' && <HojaAtajos onClose={() => setHoja(null)} />}

      {hoja?.k === 'linea' && (
        <HojaLinea
          linea={hoja.linea}
          money={money}
          onClose={() => setHoja(null)}
          onServir={() => { servir(hoja.linea); setHoja(null); }}
          onDeshacerServir={() => deshacerServir(hoja.linea)}
          onAnular={() => {
            const l = hoja.linea;
            const o = ordersVivos.find((x) => x.id === l.orderId);
            if (!o || !l.orderId) { setAviso({ text: 'Ese plato ya no se puede anular.', bad: true }); return; }
            setHoja({
              k: 'anular',
              orderId: l.orderId,
              orderStatus: o.status as OrderStatus,
              item: { id: l.id, name: l.nombre, remainingQty: l.cantidad },
            });
          }}
        />
      )}

      {hoja?.k === 'anular' && (
        <VoidOrderDialog
          orderId={hoja.orderId}
          orderStatus={hoja.orderStatus}
          item={hoja.item}
          onClose={() => setHoja(null)}
          onDone={() => {
            setHoja(null);
            if (sel.kind === 'mesa') void cargarMesa(sel.n);
          }}
        />
      )}

      {planoAbierto && conPlano && floorPlan && (
        <div className="sv-plano-scrim" onClick={() => setPlanoAbierto(false)}>
          <div
            className="sv-plano-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Plano del salón"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sv-plano-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sv-ticket-title">Plano del salón</div>
                <div className="sv-ticket-sub">{resumenDelSalon(mesas)}</div>
              </div>
              <button type="button" className="sv-x" onClick={() => setPlanoAbierto(false)} aria-label="Cerrar el plano">
                <Icon name="x" size={17} />
              </button>
            </div>
            {nivelesPlano.length > 1 && (
              <div className="sv-hs" style={{ padding: '10px 16px 0' }}>
                {nivelesPlano.map((l) => (
                  <Pill key={l.id} on={nivelActivo === l.id} onClick={() => setNivel(l.id)}>{l.name}</Pill>
                ))}
              </div>
            )}
            <SalonPlano
              mesas={mesas}
              sel={sel.kind === 'mesa' ? sel.n : null}
              onPick={(n) => { setPlanoAbierto(false); elegir(n); }}
              money={redondear}
              floorPlan={floorPlan}
              nivel={nivelActivo}
            />
          </div>
        </div>
      )}

      {paleta && (
        <Paleta
          productos={products}
          mesas={mesas}
          acciones={accionesPaleta}
          destino={sel.kind === 'none' ? null : tituloSel}
          money={money}
          onAgregar={agregarProducto}
          onMesa={elegir}
          onClose={() => setPaleta(false)}
        />
      )}

      {aviso && <Toast aviso={aviso} onClose={() => setAviso(null)} />}
    </div>
  );
}
