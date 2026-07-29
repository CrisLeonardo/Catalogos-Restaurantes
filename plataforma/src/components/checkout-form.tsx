'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, Field, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice, shadowCss, tipAppliesToType } from '@/lib/theme/resolve';
import { createOrder, type CreateOrderResult } from '@/lib/actions/orders';
import { validateCoupon } from '@/lib/actions/cupones';
import { getMyCheckoutProfile } from '@/lib/actions/loyalty';
import { addLocalOrder, getLocalProfile, saveLocalProfile } from '@/lib/customer-local';
import { getQueuedOrders, removeQueuedOrder, saveQueuedOrder } from '@/lib/order-queue';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { isValidGuatemalaPhone } from '@/lib/schemas';
import { submitRating } from '@/lib/actions/encuestas';
import { getScannedTable, clearScannedTable, watchScannedTable } from '@/lib/table-session';
import { isKioskMode } from '@/lib/kiosk';

const DeliveryMap = dynamic(() => import('./delivery-map'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 280, borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--u-text-4)', fontSize: 13,
    }}>
      Cargando mapa…
    </div>
  ),
});

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  restaurantId: string;
  restaurantName: string;
  whatsappNumber: string | null;
  deliveryZones?: string[];
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliveryRadiusKm?: number | null;
  hasCoupons?: boolean;
  encuestasActive?: boolean;
  /** URL LAN del hub local del restaurante (Fase 2 offline), si tiene uno
      vinculado. Se intenta ANTES de encolar el pedido en el dispositivo. */
  hubUrl?: string | null;
  /** Token que ese hub exige en POST /orders (migración 063). */
  hubToken?: string | null;
}

type Step = 'form' | 'success' | 'queued';

/** Snapshot congelado al enviar — un reintento posterior (misma orden, mismo
    clientId) usa exactamente estos valores en vez de releer el estado
    en vivo del formulario. */
interface PendingSnapshot {
  itemsSnapshot: { name: string; opts: string; qty: number; sub: number }[];
  feeSnapshot: number;
  tipSnapshot: number;
  totalSnapshot: number;
  discountSnapshot: number;
  paymentSnapshot: 'CASH' | 'CARD';
  cashAmountSnapshot: number;
  orderTypeSnapshot: OrderType;
}
type OrderType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';

const NO_ZONE = '__fuera__';


export default function CheckoutForm({
  restaurantId,
  restaurantName,
  whatsappNumber,
  deliveryZones = [],
  restaurantLat,
  restaurantLng,
  deliveryRadiusKm,
  hasCoupons = false,
  encuestasActive = false,
  hubUrl = null,
  hubToken = null,
}: Props) {
  const config  = useThemeConfig();
  const content = useThemeContent();
  const checkoutTitleT = useText('heading', 'checkoutTitle');
  const confirmTitleT  = useText('heading', 'confirmationTitle');
  const { items, total, clearCart, pointsToRedeem } = useCart();

  // "Comer en local" solo se ofrece si el comensal escaneó el QR de su mesa.
  const [hasScannedTable, setHasScannedTable] = useState(false);

  // MODO KIOSKO (autoservicio, dispositivo compartido del mostrador): el
  // pedido es siempre "para recoger", sin autocompletar ni guardar el perfil
  // del cliente anterior, sin lealtad (la sesión sería de otra persona) y con
  // regreso automático al menú tras confirmar. Ver src/lib/kiosk.ts.
  const [kiosk, setKiosk] = useState(false);
  useEffect(() => {
    if (isKioskMode()) setKiosk(true);
  }, []);

  const typeOptions = kiosk
    ? [{ id: 'PICKUP' as const, label: content.checkout.pickup, icon: 'bag' }]
    : ([
        config.orderTypes.includes('dine_in')  && hasScannedTable && { id: 'DINE_IN'   as const, label: content.checkout.dineIn, icon: 'utensils' },
        config.orderTypes.includes('delivery') && { id: 'DELIVERY'  as const, label: content.checkout.delivery, icon: 'truck' },
        config.orderTypes.includes('pickup')   && { id: 'PICKUP'    as const, label: content.checkout.pickup, icon: 'bag' },
      ].filter(Boolean) as { id: OrderType; label: string; icon: string }[]);

  const activeBg   = config.checkoutActiveColor === 'accent' ? 'var(--brand-accent)' : 'var(--u-text)';
  const activeText = config.checkoutActiveColor === 'accent' ? 'var(--brand-on-accent)' : 'var(--brand-bg)';

  // Legibilidad: sombra por defecto del checkout (item #2) + glass en pago (item #3).
  const labelShadow = shadowCss(config.checkoutTextShadow);
  const payGlass    = config.checkoutPayGlass !== false;

  // Precalienta el hub HTTPS (DNS + permiso de red local) mientras hay señal,
  // para que el fallback funcione si el internet se cae a mitad del pedido.
  useEffect(() => {
    warmUpHub(hubUrl);
  }, [hubUrl]);

  const [step, setStep] = useState<Step>('form');
  const [orderNumber, setOrderNumber] = useState('');
  const [trackToken, setTrackToken] = useState('');
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [isPending, start] = useTransition();

  // Encuesta de satisfacción
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSent, setRatingSent] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingPending, startRating] = useTransition();

  const [snapshot, setSnapshot] = useState<{ name: string; opts: string; qty: number; sub: number }[]>([]);
  const [snapshotTotal, setSnapshotTotal] = useState(0);
  const [snapshotFee, setSnapshotFee] = useState(0);
  const [snapshotDiscount, setSnapshotDiscount] = useState(0);
  const [snapshotPayment, setSnapshotPayment] = useState<'CASH' | 'CARD'>('CASH');
  const [snapshotCashAmount, setSnapshotCashAmount] = useState(0);
  const [snapshotOrderType, setSnapshotOrderType] = useState<OrderType>('DINE_IN');
  const [snapshotTip, setSnapshotTip] = useState(0);

  // Cola offline (Fase 1): clientId estable + el payload/snapshot
  // congelados del intento actual, para reintentar sin duplicar el pedido
  // ni releer estado en vivo del formulario.
  const clientIdRef = useRef<string | null>(null);
  const pendingPayloadRef = useRef<unknown>(null);
  const pendingSnapshotRef = useRef<PendingSnapshot | null>(null);
  const retryingRef = useRef(false);

  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [type, setType]       = useState<OrderType>(typeOptions[0]?.id ?? 'DINE_IN');
  const [address, setAddress] = useState('');
  const [zone, setZone]       = useState('');
  const [notes, setNotes]     = useState('');
  const [welcomeBack, setWelcomeBack] = useState(false);

  // Kiosko: fuerza "para recoger" en cuanto se detecta el modo (typeOptions
  // ya solo ofrece PICKUP, esto sincroniza el estado si arrancó en otro tipo).
  useEffect(() => {
    if (kiosk) setType('PICKUP');
  }, [kiosk]);

  // Kiosko: tras confirmar, la pantalla vuelve sola al menú para el siguiente
  // cliente (recarga completa = estado limpio garantizado). El margen da
  // tiempo a leer el número de pedido y dejar una calificación.
  useEffect(() => {
    if (!kiosk || step !== 'success') return;
    const t = setTimeout(() => { window.location.href = '/'; }, 45_000);
    return () => clearTimeout(t);
  }, [kiosk, step]);

  // Método de pago
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [cashAmount, setCashAmount] = useState('');

  // Propina obligatoria — el admin decide en qué tipos de pedido se cobra
  // (tipOrderTypes) y el porcentaje; el comensal no puede quitarla. Monto
  // calculado en el servidor.

  // DINE_IN: mesa y preferencia de servicio
  const [tableNumber, setTableNumber]         = useState<number | null>(null);
  const [coursePreference, setCoursePreference] = useState('');

  // Geo: coordenadas del pin del cliente en el mapa
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  // El mapa solo lee su posición inicial UNA vez al montar Leaflet — hay que
  // esperar a que termine de revisarse el perfil guardado (local o de cuenta)
  // antes de montarlo, o el pin guardado nunca se restauraría.
  const [profileChecked, setProfileChecked] = useState(false);

  // Cupón
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ discount: number; code: string } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);

  useEffect(() => {
    // Kiosko: JAMÁS autocompletar — serían los datos del cliente anterior.
    if (isKioskMode()) { setProfileChecked(true); return; }
    let cancelled = false;
    (async () => {
      try {
        // Prioridad: cuenta de Google enlazada (sigue al comensal a cualquier
        // dispositivo) sobre el perfil local de este dispositivo únicamente.
        const remote = await getMyCheckoutProfile(restaurantId).catch(() => null);
        if (cancelled) return;
        if (remote) {
          setName(remote.name);
          setPhone(remote.phone);
          if (remote.address) setAddress(remote.address);
          if (remote.zone && deliveryZones.includes(remote.zone)) setZone(remote.zone);
          if (remote.lat != null && remote.lng != null) { setDeliveryLat(remote.lat); setDeliveryLng(remote.lng); }
          setWelcomeBack(true);
          return;
        }

        const p = getLocalProfile(restaurantId);
        if (!p) return;
        setName(p.name);
        setPhone(p.phone);
        if (p.address) setAddress(p.address);
        if (p.zone && deliveryZones.includes(p.zone)) setZone(p.zone);
        if (p.lat != null && p.lng != null) { setDeliveryLat(p.lat); setDeliveryLng(p.lng); }
        setWelcomeBack(true);
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (!config.orderTypes.includes('dine_in')) return;
    if (isKioskMode()) return; // kiosko: siempre "para recoger", sin mesa
    // No se borra la mesa al leerla: el botón "Llamar al mesero" también la usa.
    // Se mantiene mientras el comensal está sentado (la sobrescribe el próximo escaneo).
    const n = getScannedTable(restaurantId);
    if (n != null && n <= config.dineInTableCount) {
      setHasScannedTable(true);
      setType('DINE_IN');
      setTableNumber(n);
    }
    // Y se re-valida el TTL mientras la página sigue viva (PWA dormida que
    // vuelve horas después): al vencer, "Comer en local" desaparece y el tipo
    // activo salta al primer canal disponible.
    return watchScannedTable(restaurantId, (t) => {
      const valid = t != null && t <= config.dineInTableCount;
      setHasScannedTable(valid);
      if (valid) {
        setTableNumber(t);
      } else {
        setTableNumber(null);
        setType((prev) => {
          if (prev !== 'DINE_IN') return prev;
          return config.orderTypes.includes('delivery') ? 'DELIVERY' : 'PICKUP';
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const zonesActive = deliveryZones.length > 0;
  const outOfZone   = type === 'DELIVERY' && zonesActive && zone === NO_ZONE;

  const geoActive = type === 'DELIVERY'
    && restaurantLat !== undefined && restaurantLat !== null
    && restaurantLng !== undefined && restaurantLng !== null
    && deliveryRadiusKm !== undefined && deliveryRadiusKm !== null;

  const geoDistanceKm = geoActive && deliveryLat !== undefined && deliveryLng !== undefined
    ? haversineKm(restaurantLat!, restaurantLng!, deliveryLat, deliveryLng)
    : null;
  const geoOutOfRange = geoActive && (
    deliveryLat === undefined || deliveryLng === undefined || (geoDistanceKm !== null && geoDistanceKm > deliveryRadiusKm!)
  );

  // Limpiar cashAmount si cambia el tipo o método de pago
  useEffect(() => {
    setCashAmount('');
  }, [type, paymentMethod]);

  const errs = {
    name:  type !== 'DINE_IN' && !name.trim() ? content.checkout.errName : '',
    phone: type === 'DINE_IN'
      ? (phone.trim() && !isValidGuatemalaPhone(phone) ? 'Número inválido. Ingresa 8 dígitos (ej. 5555 0000)' : '')
      : (!phone.trim()
          ? content.checkout.errPhone
          : !isValidGuatemalaPhone(phone)
            ? 'Número inválido. Ingresa 8 dígitos (ej. 5555 0000)'
            : ''),
    address: type === 'DELIVERY' && !geoActive && !address.trim() ? content.checkout.errAddress : '',
    zone:    type === 'DELIVERY' && zonesActive && !zone ? 'Elige tu zona' : '',
    geo:     geoActive && (deliveryLat === undefined || deliveryLng === undefined)
              ? 'Coloca tu ubicación en el mapa' : '',
    table:   type === 'DINE_IN' && !tableNumber ? 'Escanea el QR de tu mesa para continuar' : '',
  };

  const deliveryFee  = type === 'DELIVERY' ? config.deliveryFee : 0;
  const discount     = appliedCoupon ? Math.min(appliedCoupon.discount, total) : 0;

  // Propina obligatoria — según los tipos de pedido que el restaurante habilitó (tipOrderTypes).
  const tipAvailable = tipAppliesToType(config, type);
  const showTip      = tipAvailable;
  const tipAmount    = showTip ? Math.round(total * (Number(config.tipPercent) || 0)) / 100 : 0;

  const finalTotal   = Math.max(0, total + deliveryFee - discount + tipAmount);

  // cashAmount: validación después de finalTotal porque depende del total final
  const cashAmountNum = parseFloat(cashAmount.replace(',', '.')) || 0;
  const needsCashAmount = type === 'DELIVERY' && paymentMethod === 'CASH';
  const cashAmountErr = needsCashAmount && cashAmount.trim()
    ? cashAmountNum < finalTotal ? `El monto mínimo es ${formatPrice(finalTotal, config)}` : ''
    : '';
  const cashAmountValid = !needsCashAmount || (cashAmount.trim() !== '' && cashAmountNum >= finalTotal);

  const valid = !errs.name && !errs.phone && !errs.address && !errs.zone && !errs.geo && !errs.table
    && !outOfZone && !geoOutOfRange && cashAmountValid;

  // Si cambia el carrito o el tipo de pedido, el cupón se revalida (se limpia).
  useEffect(() => {
    if (appliedCoupon) { setAppliedCoupon(null); setCouponMsg(''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, deliveryFee]);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponChecking(true);
    setCouponMsg('');
    const res = await validateCoupon(restaurantId, couponCode.trim(), total);
    setCouponChecking(false);
    if (res.ok) {
      setAppliedCoupon({ discount: res.discount, code: res.code });
      setCouponMsg('');
    } else {
      setAppliedCoupon(null);
      setCouponMsg(res.error);
    }
  }

  /** Aplica el resultado exitoso de createOrder (primer intento o reintento
      desde la cola) usando el snapshot congelado del pedido, no el estado
      en vivo del formulario. */
  function finishSuccess(result: CreateOrderResult) {
    const snap = pendingSnapshotRef.current;
    if (!snap) return;
    const clientIdForRef = clientIdRef.current;

    // Kiosko: no dejar rastro del cliente en el aparato compartido (ni perfil
    // para autocompletar, ni su pedido en el historial local del dispositivo).
    if (!isKioskMode()) {
      saveLocalProfile(restaurantId, {
        name, phone,
        ...(address.trim() ? { address } : {}),
        ...(zone && zone !== NO_ZONE ? { zone } : {}),
        ...(deliveryLat !== undefined && deliveryLng !== undefined ? { lat: deliveryLat, lng: deliveryLng } : {}),
      });
      if (result.publicToken) {
        addLocalOrder(restaurantId, {
          token: result.publicToken,
          orderNumber: result.orderNumber ?? '',
          createdAt: new Date().toISOString(),
          total: snap.totalSnapshot,
        });
      } else if (clientIdForRef) {
        // Pedido aceptado por el hub local sin conexión a la nube: todavía no
        // hay token público (se genera cuando sincronice con Supabase). Se
        // guarda con el clientId para que "Mis pedidos" lo resuelva en cuanto
        // sincronice (ver my-orders.tsx / getOrderRefByClientId).
        addLocalOrder(restaurantId, {
          token: '',
          clientId: clientIdForRef,
          orderNumber: result.orderNumber ?? '',
          createdAt: new Date().toISOString(),
          total: snap.totalSnapshot,
        });
      }
    }

    setSnapshot(snap.itemsSnapshot);
    setSnapshotFee(snap.feeSnapshot);
    setSnapshotDiscount(snap.discountSnapshot);
    setSnapshotTip(snap.tipSnapshot);
    setSnapshotTotal(snap.totalSnapshot);
    setSnapshotPayment(snap.paymentSnapshot);
    setSnapshotCashAmount(snap.cashAmountSnapshot);
    setSnapshotOrderType(snap.orderTypeSnapshot);
    setOrderNumber(result.orderNumber ?? '');
    setTrackToken(result.publicToken ?? '');
    setOrderId(result.orderId ?? '');

    if (clientIdRef.current) removeQueuedOrder(restaurantId, clientIdRef.current);
    clientIdRef.current = null;
    pendingPayloadRef.current = null;
    pendingSnapshotRef.current = null;

    // El pedido ya salió: cierra la sesión de mesa del comensal para que no
    // siga "detectándose" en ella si vuelve a abrir el mismo enlace después.
    if (snap.orderTypeSnapshot === 'DINE_IN') clearScannedTable(restaurantId);

    clearCart();
    setStep('success');

    // Kiosko: el aparato del mostrador no tiene WhatsApp del cliente; el
    // pedido ya entró por el sistema y la pantalla vuelve sola al menú.
    if (isKioskMode()) return;

    const waUrl = buildWhatsAppUrl({
      orderNumber: result.orderNumber ?? '',
      snapshot: snap.itemsSnapshot,
      fee: snap.feeSnapshot,
      tip: snap.tipSnapshot,
      total: snap.totalSnapshot,
      discount: snap.discountSnapshot,
      payment: snap.paymentSnapshot,
      cashAmt: snap.cashAmountSnapshot,
      orderType: snap.orderTypeSnapshot,
    });
    if (waUrl) {
      // Nota: si esto corre desde un reintento automático (sin clic directo
      // del usuario), el navegador puede bloquear el popup — es un
      // degradado aceptable, el pedido ya quedó confirmado igual.
      try { window.open(waUrl, '_blank', 'noopener'); } catch {}
    }
  }

  /** Antes de encolar en el dispositivo, intenta el hub local del restaurante
      (Fase 2 offline) — si el comensal está en su WiFi, esto resuelve el
      pedido al instante (con impresión inmediata) en vez de esperar a que
      vuelva la señal. Si el hub también falla (o no hay uno configurado),
      cae a la cola local de siempre. */
  async function queueCurrentOrder() {
    const clientId = clientIdRef.current;
    const payload = pendingPayloadRef.current;
    if (!clientId || !payload) return;

    if (hubUrl) {
      const hubResult = await tryHubOrder(hubUrl, hubToken, payload);
      if (hubResult) { finishSuccess(hubResult); return; }
    }

    saveQueuedOrder(restaurantId, {
      clientId,
      payload,
      queuedAt: new Date().toISOString(),
      total: pendingSnapshotRef.current?.totalSnapshot,
    });
    setStep('queued');
  }

  /** Reintenta el pedido en cola. Idempotente: mismo clientId siempre,
      así que reintentar nunca lo duplica (ver migración 061). */
  function retryQueued() {
    if (retryingRef.current) return;
    const payload = pendingPayloadRef.current;
    if (!payload) return;
    retryingRef.current = true;
    start(async () => {
      try {
        const result = await createOrder(payload);
        if (result.error) {
          // El servidor lo rechaza en definitiva (ej. producto agotado
          // mientras esperaba la señal) — no tiene sentido seguir
          // reintentando lo mismo.
          if (clientIdRef.current) removeQueuedOrder(restaurantId, clientIdRef.current);
          clientIdRef.current = null;
          pendingPayloadRef.current = null;
          pendingSnapshotRef.current = null;
          setStep('form');
          setError(result.error);
          return;
        }
        finishSuccess(result);
      } catch {
        /* sigue sin conexión: se reintentará con el próximo evento/temporizador */
      } finally {
        retryingRef.current = false;
      }
    });
  }

  // Reintento automático mientras el pedido esté en cola: al volver la señal
  // (evento 'online') y, de respaldo, cada 15s (el evento 'online' no
  // siempre dispara, notablemente en iOS Safari).
  useEffect(() => {
    if (step !== 'queued') return;
    const onOnline = () => retryQueued();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => retryQueued(), 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Al montar: si quedó algo en la cola de una visita anterior (la pestaña
  // se cerró a mitad de un corte de conexión), reintenta en segundo plano
  // sin tocar la pantalla actual — si se confirma, queda en "Mis pedidos".
  useEffect(() => {
    (async () => {
      for (const q of getQueuedOrders(restaurantId)) {
        try {
          const result = await createOrder(q.payload);
          if (result.success) {
            removeQueuedOrder(restaurantId, q.clientId);
            if (result.publicToken) {
              addLocalOrder(restaurantId, {
                token: result.publicToken,
                orderNumber: result.orderNumber ?? '',
                createdAt: q.queuedAt,
                total: q.total ?? 0,
              });
            }
          } else if (result.error) {
            removeQueuedOrder(restaurantId, q.clientId); // rechazo definitivo del servidor
          }
        } catch {
          /* sigue sin conexión: se reintentará en la próxima visita */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Anti doble-submit: si ya se está enviando, ignora clics repetidos
    // (evita pedidos duplicados aunque el botón quede visible).
    if (isPending) return;
    setError('');
    if (!valid) { setTried(true); return; }

    const itemsSnapshot = items.map((i) => ({
      name: i.rewardId ? `🎁 ${i.name}` : i.name,
      opts: i.options?.map((o) => o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName).join(', ') ?? '',
      qty: i.quantity,
      sub: i.price * i.quantity,
    }));
    const feeSnapshot   = deliveryFee;
    const tipSnapshot   = tipAmount;
    const totalSnapshot = finalTotal;

    if (!clientIdRef.current) clientIdRef.current = crypto.randomUUID();

    const payload = {
      restaurantId,
      items: items.filter((i) => !i.rewardId).map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        options: i.options?.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId, ...(o.variantId ? { variantId: o.variantId } : {}) })),
      })),
      rewardLines: items.filter((i) => i.rewardId).map((i) => ({ rewardId: i.rewardId! })),
      customer: {
        name, phone, type,
        ...(type === 'DELIVERY' ? { address, notes } : { notes }),
        ...(type === 'DINE_IN' && tableNumber  ? { tableNumber }      : {}),
        ...(type === 'DINE_IN' && coursePreference ? { coursePreference } : {}),
        ...(type === 'DELIVERY' && zonesActive ? { zone } : {}),
        ...(type === 'DELIVERY' && deliveryLat !== undefined && deliveryLng !== undefined
          ? { deliveryLat, deliveryLng }
          : {}),
      },
      deliveryFee: feeSnapshot,
      ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      paymentMethod: type === 'DINE_IN' ? 'CASH' : paymentMethod,
      ...(needsCashAmount && cashAmountNum > 0 ? { cashAmount: cashAmountNum } : {}),
      tipAccepted: showTip,
      clientId: clientIdRef.current,
    };
    pendingPayloadRef.current = payload;
    pendingSnapshotRef.current = {
      itemsSnapshot, feeSnapshot, tipSnapshot, totalSnapshot,
      discountSnapshot: discount,
      paymentSnapshot: type === 'DINE_IN' ? 'CASH' : paymentMethod,
      cashAmountSnapshot: needsCashAmount ? cashAmountNum : 0,
      orderTypeSnapshot: type,
    };

    // WRITE-AHEAD: el pedido queda en la cola del dispositivo ANTES de
    // intentar cualquier red (finishSuccess lo quita al confirmarse). Bug
    // real reproducido en pruebas (2026-07-10, panel de mesero — misma
    // ventana aquí): si la página muere durante el intento (pestaña
    // cerrada, WebView reiniciado, celular bloqueado), el pedido solo
    // existía en memoria y se perdía sin rastro. Con la cola primero, el
    // peor caso es un pedido que el reintento de la próxima visita envía
    // solo — nunca uno perdido; el clientId idempotente (migración 061)
    // garantiza que jamás se duplica.
    saveQueuedOrder(restaurantId, {
      clientId: clientIdRef.current,
      payload,
      queuedAt: new Date().toISOString(),
      total: totalSnapshot,
    });

    start(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // "Sin internet" no implica "sin LAN" — justo el caso que resuelve
        // el hub local, por eso se intenta igual antes de encolar.
        await queueCurrentOrder();
        return;
      }
      let result: CreateOrderResult;
      try {
        result = await createOrder(payload);
      } catch {
        // Falló a nivel de red (no es un error de negocio): puede que el
        // servidor ya lo haya recibido — se encola y se reintenta con el
        // MISMO clientId, que es idempotente (migración 061).
        await queueCurrentOrder();
        return;
      }
      if (result.error) {
        // Rechazo definitivo del servidor: fuera de la cola (si se quedara,
        // el reintento de la próxima visita reenviaría un pedido ya
        // rechazado).
        if (clientIdRef.current) removeQueuedOrder(restaurantId, clientIdRef.current);
        setError(result.error);
        return;
      }
      finishSuccess(result);
    });
  }

  function buildWhatsAppUrl(data?: {
    orderNumber: string;
    snapshot: { name: string; opts: string; qty: number; sub: number }[];
    fee: number;
    tip: number;
    total: number;
    discount?: number;
    payment?: 'CASH' | 'CARD';
    cashAmt?: number;
    orderType?: OrderType;
  }) {
    if (!whatsappNumber) return null;
    const num       = data?.orderNumber ?? orderNumber;
    const lineItems = data?.snapshot ?? snapshot;
    const fee       = data?.fee ?? snapshotFee;
    const disc      = data?.discount ?? snapshotDiscount;
    const tipAmt    = data?.tip ?? snapshotTip;
    const tot       = data?.total ?? snapshotTotal;
    const pmeth     = data?.payment ?? snapshotPayment;
    const cAmt      = data?.cashAmt ?? snapshotCashAmount;
    const oType     = data?.orderType ?? snapshotOrderType;
    if (oType === 'DINE_IN') return null;
    const clean     = whatsappNumber.replace(/\D/g, '');

    const mapsLink = type === 'DELIVERY' && deliveryLat !== undefined && deliveryLng !== undefined
      ? `\nhttps://maps.google.com/?q=${deliveryLat.toFixed(6)},${deliveryLng.toFixed(6)}`
      : '';

    let where: string;
    if (type === 'DINE_IN') {
      where = `🍽 Mesa ${tableNumber ?? '?'}${coursePreference ? ` · Servicio: ${coursePreference}` : ''}`;
    } else if (type === 'PICKUP') {
      where = content.checkout.pickup;
    } else {
      where = `${content.checkout.delivery}: ${address}${zone && zone !== NO_ZONE ? ` (${zone})` : ''}${mapsLink}`;
    }

    const lines: string[] = [
      `🍽 Nuevo pedido *${num}*`, '',
      `👤 ${name}`, `📱 ${phone}`,
      `📦 ${where}`, '',
      '🛒 Pedido:',
      ...lineItems.map((i) => `• ${i.qty}x ${i.name}${i.opts ? ` (${i.opts})` : ''} — ${formatPrice(i.sub, config)}`), '',
    ];
    if (fee > 0) {
      lines.push(`📦 ${content.cart.shipping}: ${formatPrice(fee, config)}`);
    }
    if (disc > 0) {
      lines.push(`🏷 Descuento: -${formatPrice(disc, config)}`);
    }
    if (tipAmt > 0) {
      lines.push(`🙏 Propina (${config.tipPercent}%): ${formatPrice(tipAmt, config)}`);
    }
    lines.push(`💰 ${content.cart.total}: *${formatPrice(tot, config)}*`);
    if (pmeth === 'CARD') {
      lines.push(`💳 Pago: Tarjeta al recibir`);
    } else {
      const changeInfo = cAmt > 0 ? ` — paga con ${formatPrice(cAmt, config)} (cambio: ${formatPrice(cAmt - tot, config)})` : '';
      lines.push(`💵 Pago: Efectivo${changeInfo}`);
    }
    if (notes) lines.push('', `📝 ${notes}`);
    return `https://wa.me/${clean}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  /* ── Carrito vacío ── */
  if (items.length === 0 && step !== 'success' && step !== 'queued') {
    return (
      <main className="themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <Glass style={{ padding: '32px 24px', textAlign: 'center', maxWidth: 380, width: '100%' }}>
          <Icon name="bag" size={44} strokeWidth={1.3} style={{ color: 'var(--u-text-4)', margin: '0 auto 16px' }} />
          <h2 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 10 }}>{content.cart.empty}</h2>
          <PrimaryButton href="/">{content.cart.emptyCta}</PrimaryButton>
        </Glass>
      </main>
    );
  }

  /* ── Pedido en cola (sin conexión) ── */
  if (step === 'queued') {
    return (
      <main className="anim-fade-up themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--surface-2)', color: 'var(--u-text-2)',
          }}>
            <Icon name="clock" size={34} strokeWidth={1.6} />
          </div>
          <div>
            <h1 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 8 }}>Sin conexión</h1>
            <p style={{ fontSize: 14, color: 'var(--u-text-2)', lineHeight: 1.5 }}>
              Tu pedido se guardó. Se enviará solo en cuanto vuelva la señal —
              no cierres esta pantalla.
            </p>
          </div>
          {error && (
            <p style={{ fontSize: 13, color: 'var(--c-danger, #ff6b6b)' }}>{error}</p>
          )}
          <button
            onClick={retryQueued}
            disabled={isPending}
            className="btn-accent press"
            style={{ padding: '13px 28px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Reintentando…' : 'Reintentar ahora'}
          </button>
        </div>
      </main>
    );
  }

  /* ── Confirmación ── */
  if (step === 'success') {
    // Kiosko: sin WhatsApp ni seguimiento en el aparato compartido — solo el
    // número de pedido grande y el regreso al menú para el siguiente cliente.
    const waUrl = kiosk ? '' : buildWhatsAppUrl();
    const subtitle = content.confirmation.subtitle || `${config.brandName} ya recibió tu pedido y lo está preparando.`;
    const typeLabel = type === 'DINE_IN'
      ? `Mesa ${tableNumber ?? '?'}`
      : type === 'PICKUP'
        ? content.checkout.pickup
        : content.checkout.delivery;
    return (
      <main className="anim-fade-up themed-type" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div className="anim-pop" style={{ width: 92, height: 92, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--u-text)', color: 'var(--brand-bg)' }}>
            <Icon name="check" size={46} strokeWidth={2.6} />
          </div>
          <div>
            <h2 className="t-display" style={{ ...confirmTitleT.vars, fontSize: 30 * confirmTitleT.size }}>{content.confirmation.title}</h2>
            <p className="t-serif" style={{ fontSize: 17, marginTop: 8 }}>{subtitle}</p>
          </div>
          <Glass style={{ borderRadius: 18, padding: 18, width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <Row k={content.confirmation.orderNo} v={orderNumber || '—'} />
            <Row k={content.confirmation.type} v={typeLabel} />
            {type === 'DINE_IN' && coursePreference && (
              <Row k="Servicio" v={coursePreference} />
            )}
            <Row k={content.confirmation.eta} v={content.confirmation.etaValue} />
            {snapshotOrderType !== 'DINE_IN' && (
              <Row
                k={content.confirmation.payment}
                v={snapshotPayment === 'CARD' ? content.checkout.payCard : content.checkout.payCash}
              />
            )}
          </Glass>
          {waUrl && (
            <div style={{ width: '100%' }}>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="press"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px 24px', borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: 14, textDecoration: 'none', color: '#fff', background: '#25D366', boxShadow: '0 4px 16px rgba(37,211,102,0.35)' }}>
                <Icon name="whatsapp" size={18} /> Enviar pedido por WhatsApp
              </a>
              <p style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 7, textAlign: 'center' }}>
                Si WhatsApp no se abrió solo, toca el botón para confirmar con el restaurante.
              </p>
            </div>
          )}
          {trackToken && !kiosk && (
            <PrimaryButton href={`/pedido/${trackToken}`} full iconRight="arrowRight">
              {content.confirmation.track}
            </PrimaryButton>
          )}
          {kiosk && (
            <p style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.6, margin: 0 }}>
              Guarda tu número de pedido{orderNumber ? ` (${orderNumber})` : ''} — te llamaremos
              al mostrador cuando esté listo.
            </p>
          )}

          {/* Encuesta de satisfacción */}
          {encuestasActive && !ratingSent && (
            <Glass style={{ borderRadius: 18, padding: 18, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', textAlign: 'center' }}>
                ¿Cómo fue tu experiencia?
              </div>
              {/* Estrellas */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((s) => {
                  const filled = s <= (ratingHover || ratingValue);
                  return (
                    <button
                      key={s}
                      type="button"
                      className="press"
                      onMouseEnter={() => setRatingHover(s)}
                      onMouseLeave={() => setRatingHover(0)}
                      onClick={() => setRatingValue(s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 28, lineHeight: 1 }}
                      aria-label={`${s} estrella${s !== 1 ? 's' : ''}`}
                    >
                      <svg width={28} height={28} viewBox="0 0 24 24"
                        fill={filled ? 'var(--c-warn, #fbbf24)' : 'none'}
                        stroke={filled ? 'var(--c-warn, #fbbf24)' : 'var(--u-text-3)'}
                        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                        style={{ transition: 'all 120ms' }}
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  );
                })}
              </div>
              {/* Comentario (solo si eligió estrella) */}
              {ratingValue > 0 && (
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Comentario opcional…"
                  rows={2}
                  style={{
                    background: 'var(--surface-1)', border: '1px solid var(--u-hair)',
                    borderRadius: 10, padding: '10px 12px', color: 'var(--u-text)',
                    fontSize: 13, resize: 'none', width: '100%', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              )}
              {ratingValue > 0 && (
                <button
                  type="button"
                  disabled={ratingPending}
                  className="press"
                  onClick={() => {
                    startRating(async () => {
                      // El resultado sí importa: la acción puede rechazar
                      // (pedido ya calificado, módulo apagado, exceso de
                      // envíos). Antes se daba por enviada siempre y el
                      // comensal veía "gracias" aunque no se guardara nada.
                      const res = await submitRating({
                        restaurantId,
                        rating: ratingValue,
                        comment: ratingComment || undefined,
                        orderId: orderId || undefined,
                        customerName: name || undefined,
                      });
                      if (res?.error) { setRatingError(res.error); return; }
                      setRatingError(null);
                      setRatingSent(true);
                    });
                  }}
                  style={{
                    padding: '11px', borderRadius: 12, border: 'none',
                    background: 'var(--brand-accent)', color: 'var(--brand-on-accent, #fff)',
                    fontWeight: 700, fontSize: 14, cursor: ratingPending ? 'default' : 'pointer',
                    opacity: ratingPending ? 0.7 : 1,
                  }}
                >
                  {ratingPending ? 'Enviando…' : 'Enviar calificación'}
                </button>
              )}
              {ratingError && (
                <p role="alert" style={{ fontSize: 12.5, color: 'var(--c-danger, #f87171)', margin: 0, textAlign: 'center', lineHeight: 1.45 }}>
                  {ratingError}
                </p>
              )}
            </Glass>
          )}
          {encuestasActive && ratingSent && (
            <p style={{ fontSize: 14, color: 'var(--c-ok, #4ade80)', fontWeight: 600, textAlign: 'center' }}>
              ¡Gracias por tu calificación! ⭐
            </p>
          )}

          {kiosk ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <PrimaryButton href="/" full iconRight="arrowRight">
                Hacer otro pedido
              </PrimaryButton>
              <p className="t-mute" style={{ fontSize: 11.5, margin: 0 }}>
                La pantalla volverá al menú automáticamente.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/mis-pedidos" className="press t-mute" style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'none', padding: '6px 10px' }}>
                Mis pedidos
              </Link>
              <Link href="/" className="press t-mute" style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'none', padding: '6px 10px' }}>
                {content.confirmation.again}
              </Link>
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ── Formulario ── */
  return (
    <main className="anim-fade-up themed-type" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" className="press t-mute" style={{ fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="chevronLeft" size={16} /> {restaurantName}
        </Link>
        <h1 className="t-display" style={{ ...checkoutTitleT.vars, fontSize: 28 * checkoutTitleT.size }}>{content.checkout.title}</h1>
      </div>

      {/* Resumen */}
      <Glass style={{ padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div key={item.lineId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {item.rewardId && <Icon name="gift" size={13} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />}
                <span>
                  {item.quantity}× {item.name}
                  {item.options && item.options.length > 0 && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                      {item.options.map((o) => o.variantName ? `${o.choiceName} (${o.variantName})` : o.choiceName).join(' · ')}
                    </span>
                  )}
                </span>
              </span>
              {item.rewardId
                ? <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', whiteSpace: 'nowrap' }}>{(item.pointsCost ?? 0).toLocaleString('es-GT')} pts</span>
                : <Price amount={item.price * item.quantity} size={13.5} muted />}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(deliveryFee > 0 || discount > 0 || tipAmount > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.subtotal}</span>
                <Price amount={total} size={13.5} muted />
              </div>
            )}
            {deliveryFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.shipping}</span>
                <Price amount={deliveryFee} size={13.5} muted />
              </div>
            )}
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--c-ok, #4ade80)' }}>Descuento{appliedCoupon ? ` · ${appliedCoupon.code}` : ''}</span>
                <span style={{ fontSize: 13.5, color: 'var(--c-ok, #4ade80)', fontWeight: 600 }}>−{formatPrice(discount, config)}</span>
              </div>
            )}
            {tipAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Propina ({config.tipPercent}%)</span>
                <Price amount={tipAmount} size={13.5} muted />
              </div>
            )}
            {pointsToRedeem > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--brand-accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="gift" size={13} /> Recompensas (puntos a usar)</span>
                <span style={{ fontSize: 13.5, color: 'var(--brand-accent)', fontWeight: 600 }}>{pointsToRedeem.toLocaleString('es-GT')} pts</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{content.cart.total}</span>
              <Price amount={finalTotal} size={20} />
            </div>
          </div>

          {/* Cupón — solo si el restaurante tiene cupones activos */}
          {hasCoupons && <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
            {appliedCoupon ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--c-ok, #4ade80)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={15} /> Cupón {appliedCoupon.code} aplicado
                </span>
                <button type="button" onClick={() => { setAppliedCoupon(null); setCouponCode(''); setCouponMsg(''); }} className="press t-mute" style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'var(--u-text-3)' }}>
                  Quitar
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="¿Tienes un cupón?"
                  style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', padding: '10px 12px', color: 'var(--u-text)', fontSize: 13.5, outline: 'none', textTransform: 'uppercase' }}
                />
                <button type="button" onClick={applyCoupon} disabled={couponChecking || !couponCode.trim()} className="press glass-quiet" style={{ padding: '10px 16px', borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', opacity: couponChecking || !couponCode.trim() ? 0.6 : 1 }}>
                  {couponChecking ? '…' : 'Aplicar'}
                </button>
              </div>
            )}
            {couponMsg && <p style={{ fontSize: 12, color: 'var(--c-danger, #f87171)', marginTop: 7 }}>{couponMsg}</p>}
          </div>}

          {/* Propina — obligatoria cuando el restaurante la habilita. */}
          {tipAvailable && (
            <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="sparkle" size={15} style={{ color: 'var(--brand-accent)' }} />
                  Propina ({config.tipPercent}%)
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
                  +{formatPrice(tipAmount, config)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Glass>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tipo de pedido */}
        {typeOptions.length > 1 && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>{content.checkout.typeLabel}</label>
            <div className="glass-quiet" style={{ display: 'flex', padding: 4, borderRadius: 14, marginTop: 6 }}>
              {typeOptions.map((o) => {
                const on = type === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setType(o.id)} className="press"
                    style={{ flex: 1, padding: '10px 6px', borderRadius: 11, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: on ? activeBg : 'transparent', color: on ? activeText : 'var(--u-text-2)', fontWeight: 600, fontSize: 12.5, transition: 'all 160ms', whiteSpace: 'nowrap' }}>
                    <Icon name={o.icon} size={15} />{o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <FormSection glass={config.checkoutFormGlass}>

        {welcomeBack && (
          <div className="glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 'var(--radius-lg)', fontSize: 12.5, color: 'var(--u-text-2)' }}>
            <Icon name="checkCircle" size={15} style={{ flexShrink: 0, color: 'var(--u-text-3)' }} />
            ¡Hola de nuevo, {name.split(' ')[0]}! Completamos tus datos por ti.
          </div>
        )}

        <Field label={type === 'DINE_IN' ? `${content.checkout.name} (opcional)` : content.checkout.name} icon="user" value={name} onChange={setName} placeholder={content.checkout.namePh} error={tried && errs.name} />
        <Field label={type === 'DINE_IN' ? `${content.checkout.phone} (opcional)` : content.checkout.phone} icon="phone" type="tel" value={phone} onChange={setPhone} placeholder={content.checkout.phonePh} error={(tried || phone.trim().length > 0) && errs.phone} />
        {phone.trim().length > 0 && !errs.phone && (
          <p style={{ fontSize: 11.5, color: 'var(--c-ok, #4ade80)', marginTop: -12 }}>
            Número válido ✓
          </p>
        )}

        {/* ── DINE_IN: mesa asignada por QR (solo lectura) ── */}
        {type === 'DINE_IN' && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>{content.checkout.mesa}</label>
            {tableNumber ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 13, marginTop: 8,
                padding: '13px 16px', borderRadius: 14,
                background: 'var(--surface-1)',
                border: '1px solid var(--u-hair-2)',
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 11, flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  background: activeBg, color: activeText,
                  fontWeight: 700, fontSize: 22,
                }}>
                  {tableNumber}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--u-text)' }}>Mesa {tableNumber}</div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>{content.checkout.mesaDetected}</div>
                </div>
              </div>
            ) : (
              <div style={{
                marginTop: 8, padding: '12px 14px', borderRadius: 14,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)',
                fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5,
              }}>
                {content.checkout.mesaNotFound}
              </div>
            )}
            {tried && errs.table && (
              <p style={{ fontSize: 12, color: 'var(--c-danger, #ff6b6b)', marginTop: 7 }}>{errs.table}</p>
            )}
          </div>
        )}

        {/* ── DINE_IN: preferencia de servicio ── */}
        {type === 'DINE_IN' && config.dineInCourseOptions.length > 0 && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>{content.checkout.courseLabel} <span style={{ color: 'var(--u-text-4)', fontWeight: 400 }}>(opcional)</span></label>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
              {['', ...config.dineInCourseOptions].map((opt) => {
                const on = coursePreference === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setCoursePreference(opt)}
                    className="press"
                    style={{
                      padding: '8px 13px', borderRadius: 99, cursor: 'pointer',
                      fontWeight: 600, fontSize: 12.5,
                      border: `1px solid ${on ? 'transparent' : 'var(--u-hair-2)'}`,
                      background: on ? activeBg : 'var(--surface-1)',
                      color: on ? activeText : 'var(--u-text-2)',
                      transition: 'all 150ms',
                    }}
                  >
                    {opt === '' ? content.checkout.courseNone : opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DELIVERY: zona de cobertura ── */}
        {type === 'DELIVERY' && zonesActive && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>Zona de entrega</label>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 6 }}>
              {[...deliveryZones, NO_ZONE].map((z) => {
                const isOther = z === NO_ZONE;
                const on = zone === z;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZone(z)}
                    className="press"
                    style={{
                      padding: '9px 14px', borderRadius: 99, cursor: 'pointer',
                      fontWeight: 600, fontSize: 13,
                      border: `1px solid ${on ? 'transparent' : 'var(--u-hair-2)'}`,
                      background: on ? activeBg : 'var(--surface-1)',
                      color: on ? activeText : isOther ? 'var(--u-text-4)' : 'var(--u-text-2)',
                      transition: 'all 150ms',
                    }}
                  >
                    {isOther ? 'Mi zona no aparece' : z}
                  </button>
                );
              })}
            </div>
            {tried && errs.zone && !outOfZone && (
              <p style={{ fontSize: 12, color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>{errs.zone}</p>
            )}
            {outOfZone && (
              <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 13, color: 'var(--u-text-2)', lineHeight: 1.5, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <Icon name="mapPin" size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                <span>Por ahora el delivery no llega a tu zona.
                {typeOptions.some((o) => o.id === 'PICKUP') && (
                  <>
                    {' '}Pero puedes pasar por tu pedido:
                    <button
                      type="button"
                      onClick={() => setType('PICKUP')}
                      className="press"
                      style={{ display: 'block', marginTop: 8, padding: '8px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 600, fontSize: 12.5 }}
                    >
                      Cambiar a {content.checkout.pickup}
                    </button>
                  </>
                )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── DELIVERY: mapa interactivo ── */}
        {type === 'DELIVERY' && !outOfZone && geoActive && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>
              Tu ubicación de entrega
            </label>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '4px 0 8px', lineHeight: 1.5 }}>
              Arrastra el pin azul hasta tu puerta exacta. Si cae fuera del área
              naranja, el restaurante no puede llegar ahí.
            </p>
            {profileChecked ? (
              <DeliveryMap
                initialLat={deliveryLat}
                initialLng={deliveryLng}
                restaurantLat={restaurantLat}
                restaurantLng={restaurantLng}
                radiusKm={deliveryRadiusKm}
                onLocationChange={(lat, lng) => {
                  setDeliveryLat(lat);
                  setDeliveryLng(lng);
                }}
              />
            ) : (
              <div style={{
                height: 280, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--u-text-4)', fontSize: 13,
              }}>
                Cargando mapa…
              </div>
            )}
            {geoDistanceKm !== null && (
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12.5,
                color: geoOutOfRange ? 'var(--c-danger, #f87171)' : 'var(--c-ok, #4ade80)',
              }}>
                <Icon
                  name={geoOutOfRange ? 'x' : 'check'}
                  size={14}
                  strokeWidth={2.5}
                />
                {geoOutOfRange
                  ? `Fuera del rango — estás a ${geoDistanceKm.toFixed(1)} km (máx. ${deliveryRadiusKm} km)`
                  : `Dentro del rango — a ${geoDistanceKm.toFixed(1)} km del restaurante`
                }
              </div>
            )}
            {tried && errs.geo && (
              <p style={{ fontSize: 12, color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>{errs.geo}</p>
            )}
          </div>
        )}

        {/* ── DELIVERY: campo de dirección en texto ── */}
        {type === 'DELIVERY' && !outOfZone && (
          <Field
            label={geoActive ? 'Referencias o indicaciones (opcional)' : content.checkout.address}
            icon="mapPin"
            value={address}
            onChange={setAddress}
            placeholder={geoActive ? 'Ej. Portón azul, frente al parque…' : content.checkout.addressPh}
            error={tried && errs.address}
          />
        )}

        <Field label={content.checkout.notes} value={notes} onChange={setNotes} placeholder={content.checkout.notesPh} />

        </FormSection>

        {/* Pago — solo DELIVERY y PICKUP; en DINE_IN el mesero lo maneja */}
        {type !== 'DINE_IN' && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>{content.checkout.payLabel}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {/* Efectivo */}
              <PayOption
                icon="banknote"
                label={type === 'DELIVERY' ? content.checkout.payCash : content.checkout.payCashPickup}
                sublabel={type === 'DELIVERY' ? content.checkout.payCashSub : content.checkout.payCashPickupSub}
                selected={paymentMethod === 'CASH'}
                onClick={() => setPaymentMethod('CASH')}
                activeBg={activeBg}
                activeText={activeText}
                glass={payGlass}
                textShadow={labelShadow}
              />
              {/* Tarjeta — solo si el restaurante lo habilita */}
              {config.acceptsCard && (
                <PayOption
                  icon="creditCard"
                  label={content.checkout.payCard}
                  sublabel={type === 'DELIVERY' ? content.checkout.payCardSub : content.checkout.payCardPickupSub}
                  selected={paymentMethod === 'CARD'}
                  onClick={() => setPaymentMethod('CARD')}
                  activeBg={activeBg}
                  activeText={activeText}
                  glass={payGlass}
                  textShadow={labelShadow}
                />
              )}
            </div>

            {/* Efectivo con cambio — solo DELIVERY + CASH */}
            {type === 'DELIVERY' && paymentMethod === 'CASH' && (
              <div style={{ marginTop: 12 }}>
                <label className="t-kicker" style={{ fontSize: 10.5, textShadow: labelShadow }}>{content.checkout.cashAmountLabel}</label>
                <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '3px 0 8px', lineHeight: 1.5 }}>
                  {content.checkout.cashAmountSub}
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  min={finalTotal}
                  step="any"
                  placeholder={`Mínimo ${formatPrice(finalTotal, config)}`}
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: `1px solid ${tried && !cashAmountValid ? 'var(--c-danger, #ff6b6b)' : 'var(--u-hair)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                    color: 'var(--u-text)',
                    fontSize: 15,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                />
                {tried && !cashAmountValid && (
                  <p style={{ fontSize: 12, color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>
                    {cashAmount.trim() ? `El monto mínimo es ${formatPrice(finalTotal, config)}` : 'Ingresa el monto con el que pagarás'}
                  </p>
                )}
                {cashAmountErr && !tried && (
                  <p style={{ fontSize: 12, color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>{cashAmountErr}</p>
                )}
                {cashAmount.trim() !== '' && cashAmountNum >= finalTotal && (
                  <p style={{ fontSize: 12.5, color: 'var(--c-ok, #4ade80)', marginTop: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="check" size={13} strokeWidth={3} />
                    Cambio que recibirás: <strong>{formatPrice(cashAmountNum - finalTotal, config)}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 13, color: 'var(--c-danger, #ff6b6b)', background: 'color-mix(in srgb, var(--c-danger, #ff6b6b) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #ff6b6b) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '10px 14px' }}>{error}</p>
        )}

        <PrimaryButton size="lg" full iconRight="arrowRight" disabled={isPending} style={{ opacity: isPending ? 0.7 : 1, marginTop: 4 }}>
          {isPending ? 'Enviando…' : content.checkout.confirm}
        </PrimaryButton>
      </form>
    </main>
  );
}

function PayOption({ icon, label, sublabel, selected, onClick, activeBg, activeText, glass, textShadow }: {
  icon: string; label: string; sublabel: string; selected: boolean; onClick: () => void;
  activeBg: string; activeText: string; glass?: boolean; textShadow?: string;
}) {
  // Glass: fondo translúcido + blur para que la opción se distinga de cualquier
  // paleta de fondo (resuelve "no se ve qué dice"). El seleccionado gana un aro
  // de acento + sombra para destacar sin depender solo del color.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press${glass ? ' glass-quiet' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        padding: 15, borderRadius: 14, width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1.5px solid ${selected ? activeBg : (glass ? 'var(--u-hair-2)' : 'var(--u-hair-2)')}`,
        background: glass ? undefined : (selected ? 'var(--surface-2)' : 'var(--surface-1)'),
        boxShadow: selected ? `0 0 0 1.5px ${activeBg}, 0 8px 22px rgba(0,0,0,0.28)` : undefined,
        transition: 'all 160ms',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: selected ? activeBg : 'var(--surface-3)', color: selected ? activeText : 'var(--u-text)', transition: 'all 160ms' }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--u-text)', textShadow }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--u-text-2)', marginTop: 2, textShadow }}>{sublabel}</div>
      </div>
      <span style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, border: `2px solid ${selected ? activeBg : 'var(--u-hair-2)'}`, background: selected ? activeBg : 'transparent', display: 'grid', placeItems: 'center', transition: 'all 160ms' }}>
        {selected && <Icon name="check" size={12} strokeWidth={3} style={{ color: activeText }} />}
      </span>
    </button>
  );
}

function FormSection({ glass, children }: { glass: boolean; children: React.ReactNode }) {
  if (glass) {
    return (
      <Glass style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </Glass>
    );
  }
  return <>{children}</>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--u-text-3)' }}>
      <span>{k}</span>
      <span className="t-mono" style={{ color: 'var(--u-text-2)' }}>{v}</span>
    </div>
  );
}
