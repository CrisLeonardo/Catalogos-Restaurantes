import { formatPrice } from '@/lib/theme/resolve';
import type { ThemeConfig, ThemeContent } from '@/lib/theme/defaults';

/* ============================================================
   CHECKOUT — lo que no es pantalla
   ------------------------------------------------------------
   `checkout-form.tsx` medía 1.468 líneas con 40 `useState` en un
   solo componente: cada tecla del comensal volvía a pintar el
   resumen, el cupón, la encuesta y la confirmación (auditoría
   2026-10-02, REN-04). Se partió por piezas; aquí quedan los
   tipos y las cuentas puras que comparten.
   ============================================================ */

export type OrderType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';
export type PayMethod = 'CASH' | 'CARD' | 'TRANSFER';

/** «Mi zona no aparece» en el selector de zonas. */
export const NO_ZONE = '__fuera__';

export interface ItemSnap { name: string; opts: string; qty: number; sub: number }

/** Snapshot congelado al enviar — un reintento posterior (misma orden, mismo
    clientId) usa exactamente estos valores en vez de releer el estado
    en vivo del formulario. */
export interface PendingSnapshot {
  itemsSnapshot: ItemSnap[];
  feeSnapshot: number;
  tipSnapshot: number;
  totalSnapshot: number;
  discountSnapshot: number;
  paymentSnapshot: PayMethod;
  cashAmountSnapshot: number;
  orderTypeSnapshot: OrderType;
}

/** Lo que enseña la confirmación. Se fija al confirmarse el pedido y no se
    relee del formulario: si la sesión de mesa caduca después (se cierra al
    pedir), el formulario saltaba a «Para llevar» y la confirmación de un
    pedido EN la mesa decía «Para llevar». */
export interface CheckoutDone {
  orderNumber: string;
  trackToken: string;
  orderId: string;
  orderType: OrderType;
  payment: PayMethod;
  tableNumber: number | null;
  coursePreference: string;
  /** Enlace de WhatsApp con el pedido ya escrito (null en el local y en kiosko). */
  waUrl: string | null;
  /** Encargo (mig. 149): «vie 30 oct · 8 a 11 a. m.» en vez del tiempo estimado. */
  encargoEntrega?: string | null;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

/** Lo que escribió el comensal, tal como sale en el mensaje de WhatsApp. */
export interface WhatsAppForm {
  name: string;
  phone: string;
  address: string;
  zone: string;
  notes: string;
  tableNumber: number | null;
  coursePreference: string;
  deliveryLat?: number;
  deliveryLng?: number;
}

/** El pedido escrito para WhatsApp, o null si no aplica (sin número o en el local). */
export function buildWhatsAppUrl({
  whatsappNumber, config, content, orderNumber, snap, form,
}: {
  whatsappNumber: string | null;
  config: ThemeConfig;
  content: ThemeContent;
  orderNumber: string;
  snap: PendingSnapshot;
  form: WhatsAppForm;
}): string | null {
  if (!whatsappNumber) return null;
  const type = snap.orderTypeSnapshot;
  if (type === 'DINE_IN') return null;
  const clean = whatsappNumber.replace(/\D/g, '');

  const mapsLink = type === 'DELIVERY' && form.deliveryLat !== undefined && form.deliveryLng !== undefined
    ? `\nhttps://maps.google.com/?q=${form.deliveryLat.toFixed(6)},${form.deliveryLng.toFixed(6)}`
    : '';

  const where = type === 'PICKUP'
    ? content.checkout.pickup
    : `${content.checkout.delivery}: ${form.address}${form.zone && form.zone !== NO_ZONE ? ` (${form.zone})` : ''}${mapsLink}`;

  // Nota: emojis del set Unicode 6.0 (2010) — el más compatible entre
  // versiones viejas de WhatsApp/fuentes de emoji. Se evitan adiciones más
  // recientes (🛒 es Unicode 9.0, 🏷/🍽 son Unicode 7.0) que en teléfonos
  // con fuente de emoji desactualizada salen como el cuadro "�".
  const lines: string[] = [
    `🍴 Nuevo pedido *${orderNumber}*`, '',
    `👤 ${form.name}`, `📱 ${form.phone}`,
    `📦 ${where}`, '',
    '📋 Pedido:',
    ...snap.itemsSnapshot.map((i) => `• ${i.qty}x ${i.name}${i.opts ? ` (${i.opts})` : ''} — ${formatPrice(i.sub, config)}`), '',
  ];
  if (snap.feeSnapshot > 0) {
    lines.push(`📦 ${content.cart.shipping}: ${formatPrice(snap.feeSnapshot, config)}`);
  }
  if (snap.discountSnapshot > 0) {
    lines.push(`➖ Descuento: -${formatPrice(snap.discountSnapshot, config)}`);
  }
  if (snap.tipSnapshot > 0) {
    lines.push(`🙏 Propina (${config.tipPercent}%): ${formatPrice(snap.tipSnapshot, config)}`);
  }
  lines.push(`💰 ${content.cart.total}: *${formatPrice(snap.totalSnapshot, config)}*`);
  if (snap.paymentSnapshot === 'CARD') {
    lines.push(`💳 Pago: Tarjeta al recibir`);
  } else if (snap.paymentSnapshot === 'TRANSFER') {
    lines.push(`🏦 Pago: Transferencia (subo el comprobante en el seguimiento del pedido)`);
  } else {
    const cAmt = snap.cashAmountSnapshot;
    const changeInfo = cAmt > 0 ? ` — paga con ${formatPrice(cAmt, config)} (cambio: ${formatPrice(cAmt - snap.totalSnapshot, config)})` : '';
    lines.push(`💵 Pago: Efectivo${changeInfo}`);
  }
  if (form.notes) lines.push('', `📝 ${form.notes}`);
  return `https://wa.me/${clean}?text=${encodeURIComponent(lines.join('\n'))}`;
}
