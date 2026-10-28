'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Field, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice, shadowCss, tipAppliesToType } from '@/lib/theme/resolve';
import { createOrder, type CreateOrderResult } from '@/lib/actions/orders';
import { getMyCheckoutProfile } from '@/lib/actions/loyalty';
import { addLocalOrder, getLocalProfile, saveLocalProfile } from '@/lib/customer-local';
import { getQueuedOrders, removeQueuedOrder, saveQueuedOrder } from '@/lib/order-queue';
import { tryHubOrder, warmUpHub } from '@/lib/hub-fallback';
import { isValidGuatemalaPhone } from '@/lib/schemas';
import { getScannedTable, clearScannedTable, watchScannedTable } from '@/lib/table-session';
import { isKioskMode } from '@/lib/kiosk';
import { useStableLinkPrefix } from '@/lib/tenant-client';
import {
  NO_ZONE, haversineKm, buildWhatsAppUrl,
  type OrderType, type PendingSnapshot, type CheckoutDone,
} from '@/components/checkout/checkout-model';
import OrderSummary, { type AppliedCoupon } from '@/components/checkout/order-summary';
import CheckoutSuccess from '@/components/checkout/checkout-success';
import { PayOption, FormSection, CheckoutQueued } from '@/components/checkout/form-parts';
import EmptyCart from '@/components/checkout/empty-cart';
import type { Sugerencia } from '@/components/menu/pairings';
import type { DatosBancarios } from '@/lib/pago-plan';
import { elegirEncargo } from '@/lib/encargo-elegido';

const DeliveryMap = dynamic(() => import('./delivery-map'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 280, borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--u-text-4)', fontSize: 'var(--m-fs-sm)',
    }}>
      Cargando mapa…
    </div>
  ),
});

interface Props {
  restaurantId: string;
  restaurantName: string;
  whatsappNumber: string | null;
  /** Zonas de cobertura con su tarifa (migración 103/104). La tarifa se
   *  muestra aquí, pero el cobro real lo recalcula el servidor contra la BD. */
  deliveryZones?: { nombre: string; tarifa: number }[];
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
  /** «Lo más pedido» para el carrito vacío (CAT-09). */
  sugeridos?: Sugerencia[];
  /** Tanda de encargos elegida en el menú y validada por el servidor (mig. 149). */
  encargo?: { id: string; titulo: string; entrega: string; quedan: number; pagoAdelantado: boolean } | null;
  /** Cuenta del restaurante si recibe transferencias (null = no se ofrece). */
  transferencia?: DatosBancarios | null;
  /** Venía de un encargo que ya se llenó o cerró: el pedido va para ahora. */
  encargoNoDisponible?: boolean;
}

type Step = 'form' | 'success' | 'queued';

/* Las piezas grandes viven en components/checkout/ (REN-04): el resumen
   memorizado, la confirmación con su encuesta y la pantalla sin conexión.
   Aquí quedan el formulario y el envío del pedido. */

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
  sugeridos = [],
  encargo = null,
  transferencia = null,
  encargoNoDisponible = false,
}: Props) {
  const config  = useThemeConfig();
  const content = useThemeContent();
  const checkoutTitleT = useText('heading', 'checkoutTitle');
  const { items, total, clearCart, pointsToRedeem } = useCart();
  // Prefijo del link estable de mesa (null hasta montar — ver useStableLinkPrefix).
  const stablePrefix = useStableLinkPrefix();
  const tp = (path: string) => (stablePrefix ? `${stablePrefix}${path}` : path);

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
        // Un encargo es para otro día: nunca «comer aquí».
        config.orderTypes.includes('dine_in')  && hasScannedTable && !encargo && { id: 'DINE_IN'   as const, label: content.checkout.dineIn, icon: 'utensils' },
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
  // Lo que enseña la confirmación; se fija al confirmarse (ver CheckoutDone).
  const [done, setDone] = useState<CheckoutDone | null>(null);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [isPending, start] = useTransition();

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
    const t = setTimeout(() => { window.location.href = tp('/'); }, 45_000);
    return () => clearTimeout(t);
  }, [kiosk, step]);

  // Método de pago
  // Una tanda con «pago adelantado» solo admite transferencia (createOrder
  // lo vuelve a exigir).
  const soloTransferencia = !!encargo?.pagoAdelantado && !!transferencia;
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>(soloTransferencia ? 'TRANSFER' : 'CASH');
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

  // Cupón aplicado (lo que se escribe en la casilla vive en OrderSummary).
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

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
          if (remote.zone && deliveryZones.some((z) => z.nombre === remote.zone)) setZone(remote.zone);
          if (remote.lat != null && remote.lng != null) { setDeliveryLat(remote.lat); setDeliveryLng(remote.lng); }
          setWelcomeBack(true);
          return;
        }

        const p = getLocalProfile(restaurantId);
        if (!p) return;
        setName(p.name);
        setPhone(p.phone);
        if (p.address) setAddress(p.address);
        if (p.zone && deliveryZones.some((z) => z.nombre === p.zone)) setZone(p.zone);
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

  // Envío: manda la tarifa de la zona elegida; sin zonas configuradas (o antes
  // de elegir una), la tarifa plana del tema. Tiene que coincidir con lo que
  // calcula computeOrderPricing en el servidor — si no, el comensal vería un
  // total y se le cobraría otro.
  const selectedZone = deliveryZones.find((z) => z.nombre === zone) ?? null;
  const deliveryFee  = type === 'DELIVERY'
    ? (selectedZone ? selectedZone.tarifa : config.deliveryFee)
    : 0;
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
    if (appliedCoupon) setAppliedCoupon(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, deliveryFee]);

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

    // Kiosko: el aparato del mostrador no tiene WhatsApp del cliente; el
    // pedido ya entró por el sistema y la pantalla vuelve sola al menú.
    const waUrl = isKioskMode() ? null : buildWhatsAppUrl({
      whatsappNumber, config, content,
      orderNumber: result.orderNumber ?? '',
      snap,
      // El mensaje al restaurante también dice que es encargo y para cuándo.
      form: {
        name, phone, address, zone, tableNumber, coursePreference, deliveryLat, deliveryLng,
        notes: encargo ? `Encargo: ${encargo.titulo} · ${encargo.entrega}${notes ? ` · ${notes}` : ''}` : notes,
      },
    });
    setDone({
      orderNumber: result.orderNumber ?? '',
      trackToken: result.publicToken ?? '',
      orderId: result.orderId ?? '',
      orderType: snap.orderTypeSnapshot,
      payment: snap.paymentSnapshot,
      tableNumber,
      coursePreference,
      waUrl,
      encargoEntrega: encargo?.entrega ?? null,
    });

    if (clientIdRef.current) removeQueuedOrder(restaurantId, clientIdRef.current);
    clientIdRef.current = null;
    pendingPayloadRef.current = null;
    pendingSnapshotRef.current = null;

    // El pedido ya salió: cierra la sesión de mesa del comensal para que no
    // siga "detectándose" en ella si vuelve a abrir el mismo enlace después.
    if (snap.orderTypeSnapshot === 'DINE_IN') clearScannedTable(restaurantId);

    clearCart();
    if (encargo || encargoNoDisponible) elegirEncargo(restaurantId, null);
    setStep('success');

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
      ...(encargo ? { encargoId: encargo.id } : {}),
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

  /* ── Carrito vacío ── */
  if (items.length === 0 && step !== 'success' && step !== 'queued') {
    return <EmptyCart sugeridos={sugeridos} menuHref={tp('/')} />;
  }

  /* ── Pedido en cola (sin conexión) ── */
  if (step === 'queued') {
    return <CheckoutQueued error={error} pending={isPending} onRetry={retryQueued} />;
  }

  /* ── Confirmación ── */
  if (step === 'success' && done) {
    return (
      <CheckoutSuccess
        done={done}
        kiosk={kiosk}
        encuestasActive={encuestasActive}
        restaurantId={restaurantId}
        customerName={name}
        tp={tp}
      />
    );
  }

  /* ── Formulario ── */
  return (
    <main className="anim-fade-up themed-type" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href={tp('/')} className="press t-mute" style={{ fontSize: 'var(--m-fs-sm)', minHeight: 'var(--m-tap)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="chevronLeft" size={16} /> {restaurantName}
        </Link>
        <h1 className="t-display" style={{ ...checkoutTitleT.vars, fontSize: 28 * checkoutTitleT.size }}>{content.checkout.title}</h1>
      </div>

      <OrderSummary
        restaurantId={restaurantId}
        items={items}
        total={total}
        pointsToRedeem={pointsToRedeem}
        deliveryFee={deliveryFee}
        discount={discount}
        tipAmount={tipAmount}
        tipAvailable={tipAvailable}
        finalTotal={finalTotal}
        hasCoupons={hasCoupons}
        appliedCoupon={appliedCoupon}
        onCouponChange={setAppliedCoupon}
      />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Encargo (mig. 149): que no quede duda de que esto es para otro día. */}
        {encargo && (
          <div style={{ background: 'var(--brand-bg)', border: '1px solid var(--u-hair)', borderRadius: 'var(--m-r-md)', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="calendar" size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--brand-accent-ink)' }} />
            <div>
              <div style={{ fontSize: 'var(--m-fs-md)', fontWeight: 800, color: 'var(--u-text)' }}>Encargo: {encargo.titulo}</div>
              <div style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', marginTop: 2 }}>
                Entrega {encargo.entrega} · {encargo.quedan === 1 ? 'queda 1 lugar' : `quedan ${encargo.quedan} lugares`}
              </div>
            </div>
          </div>
        )}
        {encargoNoDisponible && (
          <p role="status" style={{ background: 'var(--brand-bg)', border: '1px solid var(--u-hair)', borderRadius: 'var(--m-r-md)', padding: '12px 14px', margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', lineHeight: 1.5 }}>
            Ese encargo ya se llenó o dejó de recibir pedidos. Si confirmas, tu pedido va para ahora.
          </p>
        )}
        {/* Tipo de pedido */}
        {typeOptions.length > 1 && (
          <div>
            <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>{content.checkout.typeLabel}</label>
            <div className="glass-quiet" style={{ display: 'flex', padding: 4, borderRadius: 'var(--m-r-md)', marginTop: 'var(--m-sp-2)' }}>
              {typeOptions.map((o) => {
                const on = type === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setType(o.id)} className="press"
                    /* Es la PRIMERA decisión del checkout (a domicilio / para
                       llevar / en el local) y medía 40 px de alto. */
                    style={{ flex: 1, padding: '0 6px', minHeight: 'var(--m-tap)', borderRadius: 'var(--m-r-sm)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: on ? activeBg : 'transparent', color: on ? activeText : 'var(--u-text-2)', fontWeight: 600, fontSize: 'var(--m-fs-sm)', transition: 'all 160ms', whiteSpace: 'nowrap' }}>
                    <Icon name={o.icon} size={15} />{o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <FormSection glass={config.checkoutFormGlass}>

        {welcomeBack && (
          <div className="glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)' }}>
            <Icon name="checkCircle" size={15} style={{ flexShrink: 0, color: 'var(--u-text-3)' }} />
            ¡Hola de nuevo, {name.split(' ')[0]}! Completamos tus datos por ti.
          </div>
        )}

        {/* autoComplete: deja que el teléfono rellene nombre y número de una
           vez. Para quien teclea con un dedo es la diferencia entre terminar
           el pedido y dejarlo a medias. */}
        <Field
          label={type === 'DINE_IN' ? `${content.checkout.name} (opcional)` : content.checkout.name}
          icon="user" value={name} onChange={setName}
          placeholder={content.checkout.namePh}
          autoComplete="name"
          error={tried && errs.name}
        />
        <Field
          label={type === 'DINE_IN' ? `${content.checkout.phone} (opcional)` : content.checkout.phone}
          icon="phone" type="tel" inputMode="tel" value={phone} onChange={setPhone}
          placeholder={content.checkout.phonePh}
          autoComplete="tel"
          hint={type === 'DINE_IN' ? undefined : 'Lo usamos solo para avisarte sobre este pedido.'}
          error={(tried || phone.trim().length > 0) && errs.phone}
        />
        {phone.trim().length > 0 && !errs.phone && (
          <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-ok)', marginTop: -12 }}>
            Número válido ✓
          </p>
        )}

        {/* ── DINE_IN: mesa asignada por QR (solo lectura) ── */}
        {type === 'DINE_IN' && (
          <div>
            <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>{content.checkout.mesa}</label>
            {tableNumber ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 13, marginTop: 8,
                padding: '13px 16px', borderRadius: 'var(--m-r-md)',
                background: 'var(--surface-1)',
                border: '1px solid var(--u-hair-2)',
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 'var(--m-r-sm)', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  background: activeBg, color: activeText,
                  fontWeight: 700, fontSize: 'var(--m-fs-2xl)',
                }}>
                  {tableNumber}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--m-fs-md)', color: 'var(--u-text)' }}>Mesa {tableNumber}</div>
                  <div style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', marginTop: 2 }}>{content.checkout.mesaDetected}</div>
                </div>
              </div>
            ) : (
              <div style={{
                marginTop: 8, padding: '12px 14px', borderRadius: 'var(--m-r-md)',
                background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)',
                fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', lineHeight: 1.5,
              }}>
                {content.checkout.mesaNotFound}
              </div>
            )}
            {tried && errs.table && (
              <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-danger, #ff6b6b)', marginTop: 7 }}>{errs.table}</p>
            )}
          </div>
        )}

        {/* ── DINE_IN: preferencia de servicio ── */}
        {type === 'DINE_IN' && config.dineInCourseOptions.length > 0 && (
          <div>
            <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>{content.checkout.courseLabel} <span style={{ color: 'var(--u-text-4)', fontWeight: 400 }}>(opcional)</span></label>
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
                      padding: '8px 13px', borderRadius: 'var(--m-r-pill)', cursor: 'pointer',
                      fontWeight: 600, fontSize: 'var(--m-fs-sm)',
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
            <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>Zona de entrega</label>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 6 }}>
              {[...deliveryZones.map((z) => z.nombre), NO_ZONE].map((z) => {
                const isOther = z === NO_ZONE;
                const on = zone === z;
                const tarifa = deliveryZones.find((dz) => dz.nombre === z)?.tarifa ?? 0;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZone(z)}
                    className="press"
                    style={{
                      padding: '9px 14px', borderRadius: 'var(--m-r-pill)', cursor: 'pointer',
                      fontWeight: 600, fontSize: 'var(--m-fs-sm)',
                      border: `1px solid ${on ? 'transparent' : 'var(--u-hair-2)'}`,
                      background: on ? activeBg : 'var(--surface-1)',
                      color: on ? activeText : isOther ? 'var(--u-text-4)' : 'var(--u-text-2)',
                      transition: 'all 150ms',
                    }}
                  >
                    {isOther ? 'Mi zona no aparece' : tarifa > 0 ? `${z} · ${formatPrice(tarifa, config)}` : z}
                  </button>
                );
              })}
            </div>
            {tried && errs.zone && !outOfZone && (
              <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>{errs.zone}</p>
            )}
            {outOfZone && (
              <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', lineHeight: 1.5, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <Icon name="mapPin" size={16} style={{ color: 'var(--c-warn)', flexShrink: 0, marginTop: 1 }} />
                <span>Por ahora el delivery no llega a tu zona.
                {typeOptions.some((o) => o.id === 'PICKUP') && (
                  <>
                    {' '}Pero puedes pasar por tu pedido:
                    <button
                      type="button"
                      onClick={() => setType('PICKUP')}
                      className="press"
                      style={{ display: 'block', marginTop: 8, padding: '8px 14px', borderRadius: 'var(--m-r-pill)', border: 'none', cursor: 'pointer', background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 600, fontSize: 'var(--m-fs-sm)' }}
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
            <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>
              Tu ubicación de entrega
            </label>
            <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-4)', margin: '4px 0 8px', lineHeight: 1.5 }}>
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
                color: 'var(--u-text-4)', fontSize: 'var(--m-fs-sm)',
              }}>
                Cargando mapa…
              </div>
            )}
            {geoDistanceKm !== null && (
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 'var(--m-fs-sm)',
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
              <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>{errs.geo}</p>
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
            autoComplete={geoActive ? undefined : 'street-address'}
            hint={geoActive ? 'Algo que ayude al repartidor a encontrarte.' : undefined}
            placeholder={geoActive ? 'Ej. Portón azul, frente al parque…' : content.checkout.addressPh}
            error={tried && errs.address}
          />
        )}

        <Field label={content.checkout.notes} value={notes} onChange={setNotes} placeholder={content.checkout.notesPh} />

        </FormSection>

        {/* Pago — solo DELIVERY y PICKUP; en DINE_IN el mesero lo maneja */}
        {type !== 'DINE_IN' && (
          <div>
            <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>{content.checkout.payLabel}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {/* Efectivo (no en una tanda que se paga por adelantado) */}
              {!soloTransferencia && <PayOption
                icon="banknote"
                label={type === 'DELIVERY' ? content.checkout.payCash : content.checkout.payCashPickup}
                sublabel={type === 'DELIVERY' ? content.checkout.payCashSub : content.checkout.payCashPickupSub}
                selected={paymentMethod === 'CASH'}
                onClick={() => setPaymentMethod('CASH')}
                activeBg={activeBg}
                activeText={activeText}
                glass={payGlass}
                textShadow={labelShadow}
              />}
              {/* Tarjeta — solo si el restaurante lo habilita */}
              {config.acceptsCard && !soloTransferencia && (
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
              {/* Transferencia (mig. 149): solo con la cuenta configurada. La
                  cuenta y la subida del comprobante están en el seguimiento. */}
              {transferencia && (
                <PayOption
                  icon="wallet"
                  label="Transferencia"
                  sublabel={`${transferencia.banco} · subes tu comprobante al terminar`}
                  selected={paymentMethod === 'TRANSFER'}
                  onClick={() => setPaymentMethod('TRANSFER')}
                  activeBg={activeBg}
                  activeText={activeText}
                  glass={payGlass}
                  textShadow={labelShadow}
                />
              )}
            </div>
            {soloTransferencia && (
              <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', margin: '8px 0 0', lineHeight: 1.5, textShadow: labelShadow }}>
                Este encargo se paga por adelantado: así te apartamos tu lugar.
              </p>
            )}

            {/* Efectivo con cambio — solo DELIVERY + CASH */}
            {type === 'DELIVERY' && paymentMethod === 'CASH' && (
              <div style={{ marginTop: 12 }}>
                <label className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', textShadow: labelShadow }}>{content.checkout.cashAmountLabel}</label>
                <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-4)', margin: '3px 0 8px', lineHeight: 1.5 }}>
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
                    minHeight: 'var(--m-tap)',
                    color: 'var(--u-text)',
                    fontSize: 'max(16px, var(--m-fs-md))',
                    fontWeight: 600,
                    outline: 'none',
                  }}
                />
                {tried && !cashAmountValid && (
                  <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>
                    {cashAmount.trim() ? `El monto mínimo es ${formatPrice(finalTotal, config)}` : 'Ingresa el monto con el que pagarás'}
                  </p>
                )}
                {cashAmountErr && !tried && (
                  <p style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--c-danger, #ff6b6b)', marginTop: 6 }}>{cashAmountErr}</p>
                )}
                {cashAmount.trim() !== '' && cashAmountNum >= finalTotal && (
                  <p style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-ok)', marginTop: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="check" size={13} strokeWidth={3} />
                    Cambio que recibirás: <strong>{formatPrice(cashAmountNum - finalTotal, config)}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger, #ff6b6b)', background: 'color-mix(in srgb, var(--c-danger, #ff6b6b) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-danger, #ff6b6b) 20%, transparent)', borderRadius: 'var(--radius-lg)', padding: '10px 14px' }}>{error}</p>
        )}

        <PrimaryButton size="lg" full iconRight="arrowRight" disabled={isPending} style={{ opacity: isPending ? 0.7 : 1, marginTop: 4 }}>
          {isPending ? 'Enviando…' : content.checkout.confirm}
        </PrimaryButton>
      </form>
    </main>
  );
}
