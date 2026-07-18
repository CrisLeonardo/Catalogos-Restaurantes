/* ============================================================
   RECORDATORIOS DE COBRO — enlaces listos para enviar
   ------------------------------------------------------------
   Construye el wa.me / mailto con un mensaje amable y completo
   (monto, conceptos, si ya venció) para cobrarle a un restaurante
   en un clic. Pure functions — server y cliente.
   ============================================================ */

import type { ReceivableRow } from '@/lib/db/billing';

const SYMBOLS: Record<string, string> = { GTQ: 'Q', MXN: '$', USD: '$', EUR: '€' };

function money(n: number, currency: string): string {
  const sym = SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${(n ?? 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Normaliza un teléfono a dígitos para wa.me; agrega 502 (GT) si vienen 8 dígitos pelones. */
export function waDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.length === 8 ? `502${digits}` : digits;
}

/** Mensaje de recordatorio de pago para un restaurante con cobros pendientes. */
export function reminderMessage(r: ReceivableRow): string {
  const overdue = r.overdueTotal > 0;
  const items = r.invoices
    .slice(0, 4)
    .map((i) => `· ${i.description ?? 'Cobro'} — ${money(i.amount, r.currency)}${i.overdue ? ' (vencido)' : i.dueDate ? ` (vence ${i.dueDate})` : ''}`)
    .join('\n');
  const extra = r.invoices.length > 4 ? `\n· … y ${r.invoices.length - 4} cobro(s) más` : '';

  const saludo = `Hola 👋 Te saluda Leogin.`;
  const cuerpo = overdue
    ? `Tu restaurante *${r.name}* tiene pagos vencidos por *${money(r.pendingTotal, r.currency)}*:`
    : `Te recuerdo que *${r.name}* tiene pendiente *${money(r.pendingTotal, r.currency)}*:`;
  const cierre = overdue
    ? `¿Me confirmas cuándo puedes realizar el pago para mantener tu menú activo? ¡Gracias!`
    : `¿Me confirmas cuándo puedes realizar el pago? ¡Gracias!`;

  return `${saludo}\n\n${cuerpo}\n${items}${extra}\n\n${cierre}`;
}

/** Enlace listo (WhatsApp si hay número; si no, mailto; null sin contacto). */
export function reminderHref(r: ReceivableRow): { href: string; kind: 'whatsapp' | 'email' } | null {
  const msg = reminderMessage(r);
  const wa = waDigits(r.whatsapp);
  if (wa) return { href: `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, kind: 'whatsapp' };
  if (r.email) {
    return {
      href: `mailto:${r.email}?subject=${encodeURIComponent(`Recordatorio de pago — ${r.name}`)}&body=${encodeURIComponent(msg.replace(/\*/g, ''))}`,
      kind: 'email',
    };
  }
  return null;
}
