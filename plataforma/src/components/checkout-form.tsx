'use client';

import React, { useEffect, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, Field, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { formatPrice, shadowCss } from '@/lib/theme/resolve';
import { createOrder } from '@/lib/actions/orders';
import { validatePromo } from '@/lib/actions/promos';
import { getLoyaltyRedeemInfo } from '@/lib/actions/loyalty';
import { addLocalOrder, getLocalProfile, saveLocalProfile } from '@/lib/customer-local';
import { isValidGuatemalaPhone } from '@/lib/schemas';
import { submitRating } from '@/lib/actions/encuestas';
import { getScannedTable } from '@/lib/table-session';

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
  hasPromos?: boolean;
  loyaltyActive?: boolean;
  encuestasActive?: boolean;
}

type Step = 'form' | 'success';
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
  hasPromos = false,
  loyaltyActive = false,
  encuestasActive = false,
}: Props) {
  const config  = useThemeConfig();
  const content = useThemeContent();
  const checkoutTitleT = useText('heading', 'checkoutTitle');
  const confirmTitleT  = useText('heading', 'confirmationTitle');
  const { items, total, clearCart, pointsToRedeem } = useCart();

  // "Comer en local" solo se ofrece si el comensal escaneó el QR de su mesa.
  const [hasScannedTable, setHasScannedTable] = useState(false);

  const typeOptions = [
    config.orderTypes.includes('dine_in')  && hasScannedTable && { id: 'DINE_IN'   as const, label: content.checkout.dineIn, icon: 'utensils' },
    config.orderTypes.includes('delivery') && { id: 'DELIVERY'  as const, label: content.checkout.delivery, icon: 'truck' },
    config.orderTypes.includes('pickup')   && { id: 'PICKUP'    as const, label: content.checkout.pickup, icon: 'bag' },
  ].filter(Boolean) as { id: OrderType; label: string; icon: string }[];

  const activeBg   = config.checkoutActiveColor === 'accent' ? 'var(--brand-accent)' : 'var(--u-text)';
  const activeText = config.checkoutActiveColor === 'accent' ? 'var(--brand-on-accent)' : 'var(--brand-bg)';

  // Legibilidad: sombra por defecto del checkout (item #2) + glass en pago (item #3).
  const labelShadow = shadowCss(config.checkoutTextShadow);
  const payGlass    = config.checkoutPayGlass !== false;

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
  const [ratingPending, startRating] = useTransition();

  const [snapshot, setSnapshot] = useState<{ name: string; opts: string; qty: number; sub: number }[]>([]);
  const [snapshotTotal, setSnapshotTotal] = useState(0);
  const [snapshotFee, setSnapshotFee] = useState(0);
  const [snapshotDiscount, setSnapshotDiscount] = useState(0);
  const [snapshotPayment, setSnapshotPayment] = useState<'CASH' | 'CARD'>('CASH');
  const [snapshotCashAmount, setSnapshotCashAmount] = useState(0);
  const [snapshotOrderType, setSnapshotOrderType] = useState<OrderType>('DINE_IN');
  const [snapshotTip, setSnapshotTip] = useState(0);
  const [snapshotLoyalty, setSnapshotLoyalty] = useState(0);

  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [type, setType]       = useState<OrderType>(typeOptions[0]?.id ?? 'DINE_IN');
  const [address, setAddress] = useState('');
  const [zone, setZone]       = useState('');
  const [notes, setNotes]     = useState('');
  const [welcomeBack, setWelcomeBack] = useState(false);

  // Método de pago
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [cashAmount, setCashAmount] = useState('');

  // Propina sugerida (solo "comer en local"). Preseleccionada pero visible y
  // removible en 1 toque. El monto lo recalcula el servidor desde tipPercent.
  const [tipOn, setTipOn] = useState(true);

  // DINE_IN: mesa y preferencia de servicio
  const [tableNumber, setTableNumber]         = useState<number | null>(null);
  const [coursePreference, setCoursePreference] = useState('');

  // Geo: coordenadas del pin del cliente en el mapa
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);

  // Cupón / promoción
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ discount: number; name: string; code: string } | null>(null);
  const [promoMsg, setPromoMsg] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);

  // Lealtad / canje de puntos
  const [redeemInfo, setRedeemInfo] = useState<{ active: boolean; balance: number; minRedeem: number; redeemValue: number } | null>(null);
  const [redeemOn, setRedeemOn] = useState(false);

  useEffect(() => {
    const p = getLocalProfile(restaurantId);
    if (!p) return;

    setName(p.name);
    setPhone(p.phone);
    if (p.address) setAddress(p.address);
    if (p.zone && deliveryZones.includes(p.zone)) setZone(p.zone);
    setWelcomeBack(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    if (!config.orderTypes.includes('dine_in')) return;
    // No se borra la mesa al leerla: el botón "Llamar al mesero" también la usa.
    // Se mantiene mientras el comensal está sentado (la sobrescribe el próximo escaneo).
    const n = getScannedTable(restaurantId);
    if (n != null && n <= config.dineInTableCount) {

      setHasScannedTable(true);
      setType('DINE_IN');
      setTableNumber(n);
    }
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

  // Lealtad: al escribir un teléfono válido, consulta el saldo de puntos del
  // cliente (si el módulo está activo). Deferido (setTimeout) para no llamar
  // setState de forma síncrona dentro del efecto.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      if (!loyaltyActive || !isValidGuatemalaPhone(phone)) {
        if (!cancelled) { setRedeemInfo(null); setRedeemOn(false); }
        return;
      }
      const info = await getLoyaltyRedeemInfo(restaurantId, phone);
      if (!cancelled) setRedeemInfo(info.active ? info : null);
    }, 400);
    return () => { cancelled = true; clearTimeout(id); };
  }, [phone, loyaltyActive, restaurantId]);

  const errs = {
    name:  !name.trim() ? content.checkout.errName : '',
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
  const discount     = appliedPromo ? Math.min(appliedPromo.discount, total + deliveryFee) : 0;

  // Propina sugerida — solo en "comer en local" y si el restaurante la habilita.
  // El servidor recalcula el monto desde tipPercent; el cliente solo lo acepta/quita.
  const tipAvailable = type === 'DINE_IN' && config.tipEnabled === true && (Number(config.tipPercent) || 0) > 0;
  const showTip      = tipAvailable && tipOn;
  const tipAmount    = showTip ? Math.round(total * (Number(config.tipPercent) || 0)) / 100 : 0;

  // Lealtad: máximo de puntos canjeables = min(saldo, lo que cabe en el total).
  const redeemValue     = redeemInfo?.redeemValue ?? 0;
  const baseForLoyalty  = Math.max(0, total + deliveryFee - discount);
  const maxRedeemPoints = redeemInfo?.active && redeemValue > 0
    ? Math.min(redeemInfo.balance, Math.floor(baseForLoyalty / redeemValue))
    : 0;
  const canRedeem       = !!redeemInfo?.active && maxRedeemPoints > 0 && maxRedeemPoints >= (redeemInfo?.minRedeem ?? 0);
  const redeemPoints    = redeemOn && canRedeem ? maxRedeemPoints : 0;
  const loyaltyDiscount = Math.round(redeemPoints * redeemValue * 100) / 100;

  const finalTotal   = Math.max(0, total + deliveryFee - discount - loyaltyDiscount + tipAmount);

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
    if (appliedPromo) { setAppliedPromo(null); setPromoMsg(''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, deliveryFee]);

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoChecking(true);
    setPromoMsg('');
    const res = await validatePromo(restaurantId, promoCode.trim(), total, deliveryFee);
    setPromoChecking(false);
    if (res.ok) {
      setAppliedPromo({ discount: res.discount, name: res.name, code: res.code });
      setPromoMsg('');
    } else {
      setAppliedPromo(null);
      setPromoMsg(res.error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Anti doble-submit: si ya se está enviando, ignora clics repetidos
    // (evita pedidos duplicados aunque el botón quede visible).
    if (isPending) return;
    setError('');
    if (!valid) { setTried(true); return; }

    const itemsSnapshot = items.map((i) => ({
      name: i.rewardId ? `🎁 ${i.name}` : i.name,
      opts: i.options?.map((o) => o.choiceName).join(', ') ?? '',
      qty: i.quantity,
      sub: i.price * i.quantity,
    }));
    const feeSnapshot   = deliveryFee;
    const tipSnapshot   = tipAmount;
    const totalSnapshot = finalTotal;

    start(async () => {
      const result = await createOrder({
        restaurantId,
        items: items.filter((i) => !i.rewardId).map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          options: i.options?.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId })),
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
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        paymentMethod: type === 'DINE_IN' ? 'CASH' : paymentMethod,
        ...(needsCashAmount && cashAmountNum > 0 ? { cashAmount: cashAmountNum } : {}),
        tipAccepted: showTip,
        ...(redeemPoints > 0 ? { redeemPoints } : {}),
      });
      if (result.error) { setError(result.error); return; }

      saveLocalProfile(restaurantId, {
        name, phone,
        ...(address.trim() ? { address } : {}),
        ...(zone && zone !== NO_ZONE ? { zone } : {}),
      });
      if (result.publicToken) {
        addLocalOrder(restaurantId, {
          token: result.publicToken,
          orderNumber: result.orderNumber ?? '',
          createdAt: new Date().toISOString(),
          total: totalSnapshot,
        });
      }

      setSnapshot(itemsSnapshot);
      setSnapshotFee(feeSnapshot);
      setSnapshotDiscount(discount);
      setSnapshotLoyalty(loyaltyDiscount);
      setSnapshotTip(tipSnapshot);
      setSnapshotTotal(totalSnapshot);
      setSnapshotPayment(type === 'DINE_IN' ? 'CASH' : paymentMethod);
      setSnapshotCashAmount(needsCashAmount ? cashAmountNum : 0);
      setSnapshotOrderType(type);
      setOrderNumber(result.orderNumber ?? '');
      setTrackToken(result.publicToken ?? '');
      setOrderId(result.orderId ?? '');
      clearCart();
      setStep('success');

      const waUrl = buildWhatsAppUrl({
        orderNumber: result.orderNumber ?? '',
        snapshot: itemsSnapshot,
        fee: feeSnapshot,
        tip: tipSnapshot,
        total: totalSnapshot,
        discount,
        loyalty: loyaltyDiscount,
        payment: type === 'DINE_IN' ? 'CASH' : paymentMethod,
        cashAmt: needsCashAmount ? cashAmountNum : 0,
        orderType: type,
      });
      if (waUrl) {
        try { window.open(waUrl, '_blank', 'noopener'); } catch {}
      }
    });
  }

  function buildWhatsAppUrl(data?: {
    orderNumber: string;
    snapshot: { name: string; opts: string; qty: number; sub: number }[];
    fee: number;
    tip: number;
    total: number;
    discount?: number;
    loyalty?: number;
    payment?: 'CASH' | 'CARD';
    cashAmt?: number;
    orderType?: OrderType;
  }) {
    if (!whatsappNumber) return null;
    const num       = data?.orderNumber ?? orderNumber;
    const lineItems = data?.snapshot ?? snapshot;
    const fee       = data?.fee ?? snapshotFee;
    const disc      = data?.discount ?? snapshotDiscount;
    const loyaltyAmt = data?.loyalty ?? snapshotLoyalty;
    const tipAmt    = data?.tip ?? snapshotTip;
    const tot       = data?.total ?? snapshotTotal;
    const pmeth     = data?.payment ?? snapshotPayment;
    const cAmt      = data?.cashAmt ?? snapshotCashAmount;
    const oType     = data?.orderType ?? snapshotOrderType;
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
    if (loyaltyAmt > 0) {
      lines.push(`⭐ Puntos canjeados: -${formatPrice(loyaltyAmt, config)}`);
    }
    if (tipAmt > 0) {
      lines.push(`🙏 Propina (${config.tipPercent}%): ${formatPrice(tipAmt, config)}`);
    }
    lines.push(`💰 ${content.cart.total}: *${formatPrice(tot, config)}*`);
    if (oType !== 'DINE_IN') {
      if (pmeth === 'CARD') {
        lines.push(`💳 Pago: Tarjeta al recibir`);
      } else {
        const changeInfo = cAmt > 0 ? ` — paga con ${formatPrice(cAmt, config)} (cambio: ${formatPrice(cAmt - tot, config)})` : '';
        lines.push(`💵 Pago: Efectivo${changeInfo}`);
      }
    }
    if (notes) lines.push('', `📝 ${notes}`);
    return `https://wa.me/${clean}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  /* ── Carrito vacío ── */
  if (items.length === 0 && step !== 'success') {
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

  /* ── Confirmación ── */
  if (step === 'success') {
    const waUrl = buildWhatsAppUrl();
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
          {trackToken && (
            <PrimaryButton href={`/pedido/${trackToken}`} full iconRight="arrowRight">
              {content.confirmation.track}
            </PrimaryButton>
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
                        fill={filled ? '#fbbf24' : 'none'}
                        stroke={filled ? '#fbbf24' : 'var(--u-text-3)'}
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
                      await submitRating({
                        restaurantId,
                        rating: ratingValue,
                        comment: ratingComment || undefined,
                        orderId: orderId || undefined,
                        customerName: name || undefined,
                      });
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
            </Glass>
          )}
          {encuestasActive && ratingSent && (
            <p style={{ fontSize: 14, color: '#4ade80', fontWeight: 600, textAlign: 'center' }}>
              ¡Gracias por tu calificación! ⭐
            </p>
          )}

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Link href="/mis-pedidos" className="press t-mute" style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'none', padding: '6px 10px' }}>
              Mis pedidos
            </Link>
            <Link href="/" className="press t-mute" style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'none', padding: '6px 10px' }}>
              {content.confirmation.again}
            </Link>
          </div>
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
                      {item.options.map((o) => o.choiceName).join(' · ')}
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
                <span style={{ fontSize: 13, color: '#4ade80' }}>Descuento{appliedPromo ? ` · ${appliedPromo.name}` : ''}</span>
                <span style={{ fontSize: 13.5, color: '#4ade80', fontWeight: 600 }}>−{formatPrice(discount, config)}</span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="star" size={13} /> {redeemPoints} puntos canjeados</span>
                <span style={{ fontSize: 13.5, color: '#4ade80', fontWeight: 600 }}>−{formatPrice(loyaltyDiscount, config)}</span>
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
          {hasPromos && <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
            {appliedPromo ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={15} /> Cupón {appliedPromo.code} aplicado
                </span>
                <button type="button" onClick={() => { setAppliedPromo(null); setPromoCode(''); setPromoMsg(''); }} className="press t-mute" style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'var(--u-text-3)' }}>
                  Quitar
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="¿Tienes un cupón?"
                  style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', padding: '10px 12px', color: 'var(--u-text)', fontSize: 13.5, outline: 'none', textTransform: 'uppercase' }}
                />
                <button type="button" onClick={applyPromo} disabled={promoChecking || !promoCode.trim()} className="press glass-quiet" style={{ padding: '10px 16px', borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', opacity: promoChecking || !promoCode.trim() ? 0.6 : 1 }}>
                  {promoChecking ? '…' : 'Aplicar'}
                </button>
              </div>
            )}
            {promoMsg && <p style={{ fontSize: 12, color: '#f87171', marginTop: 7 }}>{promoMsg}</p>}
          </div>}

          {/* Lealtad — canje de puntos (si el cliente tiene cuenta con saldo) */}
          {redeemInfo?.active && redeemInfo.balance > 0 && (
            <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="star" size={15} style={{ color: 'var(--brand-accent)' }} />
                  Tienes <strong>{redeemInfo.balance.toLocaleString('es-GT')}</strong> puntos
                  <span style={{ color: 'var(--u-text-4)' }}>≈ {formatPrice(redeemInfo.balance * redeemInfo.redeemValue, config)}</span>
                </span>
                {canRedeem ? (
                  <button
                    type="button"
                    onClick={() => setRedeemOn((v) => !v)}
                    className="press"
                    style={{
                      fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      padding: '7px 13px', borderRadius: 'var(--radius-full)',
                      border: redeemOn ? 'none' : '1px solid var(--u-hair)',
                      background: redeemOn ? 'var(--brand-accent)' : 'transparent',
                      color: redeemOn ? 'var(--brand-on-accent)' : 'var(--u-text-2)',
                    }}
                  >
                    {redeemOn ? 'Quitar' : `Canjear −${formatPrice(maxRedeemPoints * redeemValue, config)}`}
                  </button>
                ) : null}
              </div>
              {!canRedeem && (
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6 }}>
                  Necesitas al menos {redeemInfo.minRedeem.toLocaleString('es-GT')} puntos para canjear.
                </p>
              )}
            </div>
          )}

          {/* Propina sugerida — solo "comer en local". Preseleccionada y removible. */}
          {tipAvailable && (
            <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="sparkle" size={15} style={{ color: 'var(--brand-accent)' }} />
                  Propina para el equipo ({config.tipPercent}%)
                </span>
                <button
                  type="button"
                  onClick={() => setTipOn((v) => !v)}
                  className="press"
                  aria-pressed={tipOn}
                  style={{
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    padding: '7px 13px', borderRadius: 'var(--radius-full)',
                    border: tipOn ? 'none' : '1px solid var(--u-hair)',
                    background: tipOn ? 'var(--brand-accent)' : 'transparent',
                    color: tipOn ? 'var(--brand-on-accent)' : 'var(--u-text-2)',
                  }}
                >
                  {tipOn ? `Incluida +${formatPrice(tipAmount, config)}` : 'Agregar'}
                </button>
              </div>
              {!tipOn && (
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6 }}>
                  Opcional. Un detalle para quien te atiende.
                </p>
              )}
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

        <Field label={content.checkout.name} icon="user" value={name} onChange={setName} placeholder={content.checkout.namePh} error={tried && errs.name} />
        <Field label={type === 'DINE_IN' ? `${content.checkout.phone} (opcional)` : content.checkout.phone} icon="phone" type="tel" value={phone} onChange={setPhone} placeholder={content.checkout.phonePh} error={(tried || phone.trim().length > 0) && errs.phone} />
        {phone.trim().length > 0 && !errs.phone && (
          <p style={{ fontSize: 11.5, color: '#4ade80', marginTop: -12 }}>
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
              <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 7 }}>{errs.table}</p>
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
              <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{errs.zone}</p>
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
            <DeliveryMap
              restaurantLat={restaurantLat}
              restaurantLng={restaurantLng}
              radiusKm={deliveryRadiusKm}
              onLocationChange={(lat, lng) => {
                setDeliveryLat(lat);
                setDeliveryLng(lng);
              }}
            />
            {geoDistanceKm !== null && (
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12.5,
                color: geoOutOfRange ? '#f87171' : '#4ade80',
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
              <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{errs.geo}</p>
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
                    border: `1px solid ${tried && !cashAmountValid ? '#ff6b6b' : 'var(--u-hair)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                    color: 'var(--u-text)',
                    fontSize: 15,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                />
                {tried && !cashAmountValid && (
                  <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>
                    {cashAmount.trim() ? `El monto mínimo es ${formatPrice(finalTotal, config)}` : 'Ingresa el monto con el que pagarás'}
                  </p>
                )}
                {cashAmountErr && !tried && (
                  <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{cashAmountErr}</p>
                )}
                {cashAmount.trim() !== '' && cashAmountNum >= finalTotal && (
                  <p style={{ fontSize: 12.5, color: '#4ade80', marginTop: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="check" size={13} strokeWidth={3} />
                    Cambio que recibirás: <strong>{formatPrice(cashAmountNum - finalTotal, config)}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 13, color: '#ff6b6b', background: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.20)', borderRadius: 'var(--radius-lg)', padding: '10px 14px' }}>{error}</p>
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
