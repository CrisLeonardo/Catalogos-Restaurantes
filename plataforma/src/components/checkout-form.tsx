'use client';

import { useEffect, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Price, Field, PrimaryButton } from '@/components/menu/ui';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig, useThemeContent } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { createOrder } from '@/lib/actions/orders';
import { addLocalOrder, getLocalProfile, saveLocalProfile } from '@/lib/customer-local';
import { isValidGuatemalaPhone } from '@/lib/schemas';

const DeliveryMap = dynamic(() => import('./delivery-map'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 280, borderRadius: 'var(--radius-lg)',
      background: 'rgba(255,255,255,0.04)',
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
}: Props) {
  const config  = useThemeConfig();
  const content = useThemeContent();
  const { items, total, clearCart } = useCart();

  const typeOptions = [
    config.orderTypes.includes('dine_in')  && { id: 'DINE_IN'   as const, label: 'Comer aquí', icon: 'utensils' },
    config.orderTypes.includes('delivery') && { id: 'DELIVERY'  as const, label: content.checkout.delivery, icon: 'truck' },
    config.orderTypes.includes('pickup')   && { id: 'PICKUP'    as const, label: content.checkout.pickup, icon: 'bag' },
  ].filter(Boolean) as { id: OrderType; label: string; icon: string }[];

  const [step, setStep] = useState<Step>('form');
  const [orderNumber, setOrderNumber] = useState('');
  const [trackToken, setTrackToken] = useState('');
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [isPending, start] = useTransition();

  const [snapshot, setSnapshot] = useState<{ name: string; opts: string; qty: number; sub: number }[]>([]);
  const [snapshotTotal, setSnapshotTotal] = useState(0);
  const [snapshotFee, setSnapshotFee] = useState(0);

  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [type, setType]       = useState<OrderType>(typeOptions[0]?.id ?? 'DINE_IN');
  const [address, setAddress] = useState('');
  const [zone, setZone]       = useState('');
  const [notes, setNotes]     = useState('');
  const [welcomeBack, setWelcomeBack] = useState(false);

  // DINE_IN: mesa y preferencia de servicio
  const [tableNumber, setTableNumber]         = useState<number | null>(null);
  const [coursePreference, setCoursePreference] = useState('');

  // Geo: coordenadas del pin del cliente en el mapa
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);

  useEffect(() => {
    const p = getLocalProfile(restaurantId);
    if (!p) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(p.name);
    setPhone(p.phone);
    if (p.address) setAddress(p.address);
    if (p.zone && deliveryZones.includes(p.zone)) setZone(p.zone);
    setWelcomeBack(true);
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

  const errs = {
    name:  !name.trim() ? content.checkout.errName : '',
    phone: !phone.trim()
      ? content.checkout.errPhone
      : !isValidGuatemalaPhone(phone)
        ? 'Número inválido. Ingresa 8 dígitos (ej. 5555 0000)'
        : '',
    address: type === 'DELIVERY' && !geoActive && !address.trim() ? content.checkout.errAddress : '',
    zone:    type === 'DELIVERY' && zonesActive && !zone ? 'Elige tu zona' : '',
    geo:     geoActive && (deliveryLat === undefined || deliveryLng === undefined)
              ? 'Coloca tu ubicación en el mapa' : '',
    table:   type === 'DINE_IN' && !tableNumber ? 'Selecciona el número de mesa' : '',
  };
  const valid = !errs.name && !errs.phone && !errs.address && !errs.zone && !errs.geo && !errs.table
    && !outOfZone && !geoOutOfRange;

  const deliveryFee = type === 'DELIVERY' ? config.deliveryFee : 0;
  const finalTotal  = total + deliveryFee;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!valid) { setTried(true); return; }

    const itemsSnapshot = items.map((i) => ({
      name: i.name,
      opts: i.options?.map((o) => o.choiceName).join(', ') ?? '',
      qty: i.quantity,
      sub: i.price * i.quantity,
    }));
    const feeSnapshot   = deliveryFee;
    const totalSnapshot = finalTotal;

    start(async () => {
      const result = await createOrder({
        restaurantId,
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          options: i.options?.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId })),
        })),
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
      setSnapshotTotal(totalSnapshot);
      setOrderNumber(result.orderNumber ?? '');
      setTrackToken(result.publicToken ?? '');
      clearCart();
      setStep('success');

      const waUrl = buildWhatsAppUrl({
        orderNumber: result.orderNumber ?? '',
        snapshot: itemsSnapshot,
        fee: feeSnapshot,
        total: totalSnapshot,
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
    total: number;
  }) {
    if (!whatsappNumber) return null;
    const num       = data?.orderNumber ?? orderNumber;
    const lineItems = data?.snapshot ?? snapshot;
    const fee       = data?.fee ?? snapshotFee;
    const tot       = data?.total ?? snapshotTotal;
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
    lines.push(`💰 ${content.cart.total}: *${formatPrice(tot, config)}*`);
    if (notes) lines.push('', `📝 ${notes}`);
    return `https://wa.me/${clean}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  /* ── Carrito vacío ── */
  if (items.length === 0 && step !== 'success') {
    return (
      <main style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
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
      <main className="anim-fade-up" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div className="anim-pop" style={{ width: 92, height: 92, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--u-text)', color: 'var(--brand-bg)' }}>
            <Icon name="check" size={46} strokeWidth={2.6} />
          </div>
          <div>
            <h2 className="t-display" style={{ fontSize: 30 }}>{content.confirmation.title}</h2>
            <p className="t-serif" style={{ fontStyle: 'italic', fontSize: 17, color: 'var(--u-text-2)', marginTop: 8 }}>{subtitle}</p>
          </div>
          <Glass style={{ borderRadius: 18, padding: 18, width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <Row k={content.confirmation.orderNo} v={orderNumber || '—'} />
            <Row k={content.confirmation.type} v={typeLabel} />
            {type === 'DINE_IN' && coursePreference && (
              <Row k="Servicio" v={coursePreference} />
            )}
            <Row k={content.confirmation.eta} v={content.confirmation.etaValue} />
            <Row k={content.confirmation.payment} v={content.checkout.payCash} />
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
    <main className="anim-fade-up" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" className="press t-mute" style={{ fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="chevronLeft" size={16} /> {restaurantName}
        </Link>
        <h1 className="t-display" style={{ fontSize: 28 }}>{content.checkout.title}</h1>
      </div>

      {/* Resumen */}
      <Glass style={{ padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div key={item.lineId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0 }}>
                {item.quantity}× {item.name}
                {item.options && item.options.length > 0 && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                    {item.options.map((o) => o.choiceName).join(' · ')}
                  </span>
                )}
              </span>
              <Price amount={item.price * item.quantity} size={13.5} muted />
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {deliveryFee > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.subtotal}</span>
                  <Price amount={total} size={13.5} muted />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{content.cart.shipping}</span>
                  <Price amount={deliveryFee} size={13.5} muted />
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{content.cart.total}</span>
              <Price amount={finalTotal} size={20} />
            </div>
          </div>
        </div>
      </Glass>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tipo de pedido */}
        {typeOptions.length > 1 && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>{content.checkout.typeLabel}</label>
            <div className="glass-quiet" style={{ display: 'flex', padding: 4, borderRadius: 14, marginTop: 6 }}>
              {typeOptions.map((o) => {
                const on = type === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setType(o.id)} className="press"
                    style={{ flex: 1, padding: '10px 6px', borderRadius: 11, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: on ? 'var(--u-text)' : 'transparent', color: on ? 'var(--brand-bg)' : 'var(--u-text-2)', fontWeight: 600, fontSize: 12.5, transition: 'all 160ms', whiteSpace: 'nowrap' }}>
                    <Icon name={o.icon} size={15} />{o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {welcomeBack && (
          <div className="glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 'var(--radius-lg)', fontSize: 12.5, color: 'var(--u-text-2)' }}>
            <Icon name="checkCircle" size={15} style={{ flexShrink: 0, color: 'var(--u-text-3)' }} />
            ¡Hola de nuevo, {name.split(' ')[0]}! Completamos tus datos por ti.
          </div>
        )}

        <Field label={content.checkout.name} icon="user" value={name} onChange={setName} placeholder={content.checkout.namePh} error={tried && errs.name} />
        <Field label={content.checkout.phone} icon="phone" type="tel" value={phone} onChange={setPhone} placeholder={content.checkout.phonePh} error={(tried || phone.trim().length > 0) && errs.phone} />
        {phone.trim().length > 0 && !errs.phone && (
          <p style={{ fontSize: 11.5, color: '#4ade80', marginTop: -12 }}>
            Número válido ✓
          </p>
        )}

        {/* ── DINE_IN: selector de mesa ── */}
        {type === 'DINE_IN' && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Número de mesa</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7, marginTop: 8 }}>
              {Array.from({ length: config.dineInTableCount }, (_, i) => i + 1).map((n) => {
                const on = tableNumber === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTableNumber(n)}
                    className="press"
                    style={{
                      padding: '10px 0',
                      borderRadius: 11,
                      border: `1px solid ${on ? 'transparent' : 'var(--u-hair-2)'}`,
                      background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
                      color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
                      fontWeight: 700, fontSize: 15,
                      cursor: 'pointer', transition: 'all 150ms',
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {tried && errs.table && (
              <p style={{ fontSize: 12, color: '#ff6b6b', marginTop: 7 }}>{errs.table}</p>
            )}
          </div>
        )}

        {/* ── DINE_IN: preferencia de servicio ── */}
        {type === 'DINE_IN' && config.dineInCourseOptions.length > 0 && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Preferencia de servicio <span style={{ color: 'var(--u-text-4)', fontWeight: 400 }}>(opcional)</span></label>
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
                      background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
                      color: on ? 'var(--brand-bg)' : 'var(--u-text-2)',
                      transition: 'all 150ms',
                    }}
                  >
                    {opt === '' ? 'Sin preferencia' : opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DELIVERY: zona de cobertura ── */}
        {type === 'DELIVERY' && zonesActive && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Zona de entrega</label>
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
                      background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
                      color: on ? 'var(--brand-bg)' : isOther ? 'var(--u-text-4)' : 'var(--u-text-2)',
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
              <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 13, color: 'var(--u-text-2)', lineHeight: 1.5 }}>
                😔 Por ahora el delivery no llega a tu zona.
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
              </div>
            )}
          </div>
        )}

        {/* ── DELIVERY: mapa interactivo ── */}
        {type === 'DELIVERY' && !outOfZone && geoActive && (
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>
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

        {/* Pago */}
        <div>
          <label className="t-kicker" style={{ fontSize: 10.5 }}>{content.checkout.payLabel}</label>
          <Glass style={{ borderRadius: 14, padding: 15, display: 'flex', alignItems: 'center', gap: 13, marginTop: 6 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)', color: 'var(--u-text)' }}>
              <Icon name="receipt" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--u-text)' }}>{content.checkout.payCash}</div>
              <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{content.checkout.payCashSub}</div>
            </div>
            <span style={{ width: 22, height: 22, borderRadius: 99, background: 'var(--u-text)', color: 'var(--brand-bg)', display: 'grid', placeItems: 'center' }}>
              <Icon name="check" size={14} strokeWidth={3} />
            </span>
          </Glass>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#ff6b6b', background: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.20)', borderRadius: 'var(--radius-lg)', padding: '10px 14px' }}>{error}</p>
        )}

        <PrimaryButton size="lg" full iconRight="arrowRight" style={{ opacity: isPending ? 0.7 : 1, marginTop: 4 }}>
          {isPending ? 'Enviando…' : content.checkout.confirm}
        </PrimaryButton>
      </form>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--u-text-3)' }}>
      <span>{k}</span>
      <span className="t-mono" style={{ color: 'var(--u-text-2)' }}>{v}</span>
    </div>
  );
}
