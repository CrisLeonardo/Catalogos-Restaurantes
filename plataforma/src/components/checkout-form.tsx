'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Glass, Price } from '@/components/glass';
import { useCart } from '@/lib/cart-context';
import { createOrder } from '@/lib/actions/orders';

interface Props {
  restaurantId:   string;
  restaurantName: string;
  whatsappNumber: string | null;
}

type Step = 'form' | 'success';

export default function CheckoutForm({
  restaurantId,
  restaurantName,
  whatsappNumber,
}: Props) {
  const { items, total, clearCart } = useCart();

  const [step, setStep] = useState<Step>('form');
  const [orderNumber, setOrderNumber] = useState('');
  const [error, setError]   = useState('');
  const [isPending, start]  = useTransition();

  // Snapshot del carrito al confirmar (para usarlo en la confirmación después del clearCart)
  const [snapshot, setSnapshot] = useState<{ name: string; qty: number; sub: number }[]>([]);
  const [snapshotTotal, setSnapshotTotal] = useState(0);

  // Campos del formulario
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [type,    setType]    = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [address, setAddress] = useState('');
  const [notes,   setNotes]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Capturar snapshot ANTES de limpiar el carrito
    const itemsSnapshot = items.map((i) => ({
      name: i.name,
      qty:  i.quantity,
      sub:  i.price * i.quantity,
    }));
    const totalSnapshot = total;

    start(async () => {
      const result = await createOrder({
        restaurantId,
        items: items.map((i) => ({
          productId: i.productId,
          name:      i.name,
          price:     i.price,
          quantity:  i.quantity,
        })),
        customer: { name, phone, type, address, notes },
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSnapshot(itemsSnapshot);
      setSnapshotTotal(totalSnapshot);
      setOrderNumber(result.orderNumber ?? '');
      clearCart();
      setStep('success');
    });
  }

  function buildWhatsAppUrl() {
    if (!whatsappNumber) return null;
    const clean = whatsappNumber.replace(/\D/g, '');
    const lines: string[] = [
      `🍽 Nuevo pedido *${orderNumber}*`,
      '',
      `👤 ${name}`,
      `📱 ${phone}`,
      `📦 ${type === 'PICKUP' ? 'Para llevar' : `Domicilio: ${address}`}`,
      '',
      '🛒 Pedido:',
      ...snapshot.map((i) => `• ${i.qty}x ${i.name} — $${i.sub.toFixed(0)}`),
      '',
      `💰 Total: *$${snapshotTotal.toFixed(0)}*`,
    ];
    if (notes) lines.push('', `📝 ${notes}`);
    return `https://wa.me/${clean}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  /* ── Carrito vacío ──────────────────────────────────────── */
  if (items.length === 0 && step !== 'success') {
    return (
      <main
        style={{
          minHeight: '100svh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        <Glass style={{ padding: '32px 24px', textAlign: 'center', maxWidth: 380, width: '100%' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🛒</div>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 10 }}>
            Carrito vacío
          </h2>
          <p className="t-mute" style={{ fontSize: 14, marginBottom: 24 }}>
            Agrega platillos al carrito desde el menú.
          </p>
          <Link
            href="/"
            className="press btn-accent"
            style={{
              display: 'inline-block', padding: '12px 24px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700, fontSize: 14,
              textDecoration: 'none', color: '#fff',
            }}
          >
            Ver menú
          </Link>
        </Glass>
      </main>
    );
  }

  /* ── Confirmación ───────────────────────────────────────── */
  if (step === 'success') {
    const waUrl = buildWhatsAppUrl();
    return (
      <main
        className="anim-fade-up"
        style={{
          minHeight: '100svh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        <Glass style={{ padding: '32px 24px', textAlign: 'center', maxWidth: 380, width: '100%' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 className="t-display" style={{ fontSize: 'var(--fs-h1)', marginBottom: 8 }}>
            ¡Pedido recibido!
          </h2>
          <p className="t-kicker" style={{ fontSize: 11, marginBottom: 20 }}>
            {orderNumber}
          </p>
          <p className="t-mute" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
            Nos pondremos en contacto contigo en breve.{' '}
            {type === 'PICKUP' ? 'Pasa a recoger tu pedido cuando esté listo.' : 'Te lo enviamos a domicilio.'}
          </p>

          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 24px', marginBottom: 12,
                borderRadius: 'var(--radius-full)',
                fontWeight: 700, fontSize: 14,
                textDecoration: 'none', color: '#fff',
                background: '#25D366',
                boxShadow: '0 4px 16px rgba(37,211,102,0.35)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Notificar al restaurante
            </a>
          )}

          <Link
            href="/"
            className="press"
            style={{
              display: 'block', padding: '12px 24px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 600, fontSize: 14,
              textDecoration: 'none', color: 'var(--u-text-2)',
              border: '1px solid var(--u-hair)',
              textAlign: 'center',
            }}
          >
            Volver al menú
          </Link>
        </Glass>
      </main>
    );
  }

  /* ── Formulario ─────────────────────────────────────────── */
  return (
    <main
      className="anim-fade-up"
      style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '28px 16px 80px' }}
    >
      {/* Encabezado */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/"
          className="press t-mute"
          style={{ fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}
        >
          ← Volver al menú
        </Link>
        <h1 className="t-display" style={{ fontSize: 'var(--fs-h1)' }}>
          Tu pedido
        </h1>
        <p className="t-mute" style={{ fontSize: 13, marginTop: 4 }}>{restaurantName}</p>
      </div>

      {/* Resumen del carrito */}
      <Glass style={{ padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.productId}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ fontSize: 13, color: 'var(--u-text-2)' }}>
                {item.quantity}× {item.name}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
                ${(item.price * item.quantity).toFixed(0)}
              </span>
            </div>
          ))}
          <div
            style={{
              borderTop: '1px solid var(--u-hair)',
              paddingTop: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--u-text-2)' }}>Total</span>
            <Price amount={total} size={18} />
          </div>
        </div>
      </Glass>

      {/* Formulario */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Tipo de pedido */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Tipo de pedido
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['PICKUP', 'DELIVERY'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className="press"
                style={{
                  flex: 1, padding: '11px 8px',
                  borderRadius: 'var(--radius-lg)',
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                  border:     type === t ? 'none' : '1px solid var(--u-hair)',
                  background: type === t ? 'var(--brand-accent)' : 'rgba(255,255,255,0.05)',
                  color:      type === t ? '#fff' : 'var(--u-text-2)',
                  transition: 'all 150ms',
                }}
              >
                {t === 'PICKUP' ? '🥡 Para llevar' : '🛵 Domicilio'}
              </button>
            ))}
          </div>
        </div>

        {/* Nombre */}
        <InputField
          label="Tu nombre"
          type="text"
          value={name}
          onChange={setName}
          placeholder="¿Cómo te llamas?"
          required
        />

        {/* Teléfono */}
        <InputField
          label="Teléfono"
          type="tel"
          value={phone}
          onChange={setPhone}
          placeholder="55 1234 5678"
          required
        />

        {/* Dirección (solo si DELIVERY) */}
        {type === 'DELIVERY' && (
          <InputField
            label="Dirección de entrega"
            type="text"
            value={address}
            onChange={setAddress}
            placeholder="Calle, número, colonia..."
            required
          />
        )}

        {/* Notas */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sin cebolla, alergia a... extra salsa..."
            rows={3}
            style={{
              width: '100%', padding: '11px 14px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--u-hair)',
              color: 'var(--u-text)',
              fontSize: 14, lineHeight: 1.5,
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{
            fontSize: 13, color: '#ff6b6b',
            background: 'rgba(255,107,107,0.10)',
            border: '1px solid rgba(255,107,107,0.20)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
          }}>
            {error}
          </p>
        )}

        {/* Pago en efectivo */}
        <p className="t-mute" style={{ fontSize: 12, textAlign: 'center' }}>
          💵 Pago en efectivo contra entrega
        </p>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="press btn-accent"
          style={{
            padding: '14px 20px',
            borderRadius: 'var(--radius-full)',
            fontWeight: 700, fontSize: 15,
            cursor: isPending ? 'not-allowed' : 'pointer',
            border: 'none', color: '#fff',
            opacity: isPending ? 0.7 : 1,
            transition: 'opacity 150ms',
          }}
        >
          {isPending ? 'Enviando pedido…' : 'Confirmar pedido'}
        </button>
      </form>
    </main>
  );
}

/* ── InputField helper ─────────────────────────────────────── */

function InputField({
  label, type, value, onChange, placeholder, required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%', padding: '11px 14px',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--u-hair)',
          color: 'var(--u-text)',
          fontSize: 14,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}
