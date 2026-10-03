'use client';

import { useState, useTransition } from 'react';
import { Glass } from '@/components/glass';
import { updateOrderTypes } from '@/lib/actions/super-admin';
import type { OrderType } from '@/lib/theme/defaults';

/* Cada modo de pedido es su propio canal independiente. Nota de billing: para
   el descuento "Plan a tu medida" (Premium+, ver mig. 070) "comer en local" y
   "para llevar" cuentan como un solo canal si CUALQUIERA de los dos está
   activo — el descuento solo aplica cuando ambos están apagados a la vez. */
const OPTIONS: { id: OrderType; label: string; desc: string }[] = [
  { id: 'dine_in', label: 'Comer en local', desc: 'Pedidos en mesa con QR' },
  { id: 'pickup',  label: 'Para llevar',    desc: 'Retiro en el mostrador' },
  { id: 'delivery', label: 'A domicilio',   desc: 'Entrega en la dirección del cliente' },
];

export default function OrderTypesEditor({
  restaurantId,
  initialOrderTypes,
}: {
  restaurantId: string;
  initialOrderTypes: OrderType[];
}) {
  const [selected, setSelected] = useState<OrderType[]>(initialOrderTypes);
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: OrderType) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
    setMsg(null);
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateOrderTypes(restaurantId, selected);
      setMsg(res.error ? `Error: ${res.error}` : 'Guardado ✓');
    });
  }

  return (
    <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
        Tipos de pedido
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '-4px 0 0', lineHeight: 1.45 }}>
        En planes Premium+, cada método de pedido apagado descuenta Q50 de la mensualidad
        automática (máx. 2 de los 3 — siempre se paga al menos un método). En Estándar el dueño
        puede elegir hasta 2 de los 3 modos desde su panel — aquí puedes fijar cualquier
        combinación. Mínimo un modo activo.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {OPTIONS.map(({ id, label, desc }) => {
          const enabled = selected.includes(id);
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => toggle(id)}
                className="press"
                aria-label={label}
                style={{
                  width: 40, height: 24, borderRadius: 'var(--radius-lg)',
                  background: enabled ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 10%, transparent)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 200ms', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', width: 18, height: 18, borderRadius: '50%',
                  background: 'white', top: 3, left: enabled ? 19 : 3,
                  transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--u-text)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="press btn-accent"
          style={{
            padding: '10px 20px', borderRadius: 'var(--radius-full)',
            fontWeight: 600, fontSize: 13, border: 'none',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Guardando…' : 'Guardar tipos de pedido'}
        </button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--c-ok)' }}>
            {msg}
          </span>
        )}
      </div>
    </Glass>
  );
}
