'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import {
  updateRestaurantPlan,
  type SuperState,
} from '@/lib/actions/super-admin';
import type { Restaurant } from '@/types';

const empty: SuperState = null;

interface PlanEditorProps {
  restaurant: Restaurant;
}

export default function PlanEditor({ restaurant }: PlanEditorProps) {
  const [state, formAction, isPending] = useActionState(
    updateRestaurantPlan,
    empty,
  );

  const [plan, setPlan] = useState<'CATALOGO' | 'PREMIUM'>(
    restaurant.plan_actual,
  );
  const [orders, setOrders] = useState(restaurant.modules.orders);
  const [whatsapp, setWhatsapp] = useState(restaurant.modules.whatsapp_notify);

  // Al elegir un plan, ajusta los módulos a su preset (el usuario aún puede
  // afinarlos después con los toggles).
  function selectPlan(p: 'CATALOGO' | 'PREMIUM') {
    setPlan(p);
    const on = p === 'PREMIUM';
    setOrders(on);
    setWhatsapp(on);
  }

  return (
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <input type="hidden" name="id" value={restaurant.id} />
      <input type="hidden" name="plan_actual" value={plan} />
      <input type="hidden" name="module_orders" value={String(orders)} />
      <input type="hidden" name="module_whatsapp" value={String(whatsapp)} />

      {/* Plan selector */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p
          style={{
            fontSize: 12,
            color: 'var(--u-text-3)',
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Plan
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['CATALOGO', 'PREMIUM'] as const).map((p) => {
            const active = plan === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectPlan(p)}
                className="press"
                style={{
                  flex: 1,
                  padding: '14px 10px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid',
                  borderColor: active ? 'var(--brand-accent)' : 'var(--u-hair)',
                  background: active
                    ? 'rgba(var(--brand-accent-rgb, 217,119,87), 0.1)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    color: active ? 'var(--brand-accent)' : 'var(--u-text-3)',
                    marginBottom: 4,
                  }}
                >
                  {p === 'CATALOGO' ? 'Catálogo' : 'Premium'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: active ? 'var(--u-text-2)' : 'var(--u-text-4)',
                  }}
                >
                  {p === 'CATALOGO' ? 'Solo menú' : 'Menú + Pedidos'}
                </div>
              </button>
            );
          })}
        </div>
      </Glass>

      {/* Módulos */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p
          style={{
            fontSize: 12,
            color: 'var(--u-text-3)',
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Módulos
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ModuleRow
            label="Catálogo"
            description="Siempre activo"
            enabled={true}
            locked
          />
          <ModuleRow
            label="Pedidos en línea"
            description="Carrito + checkout + estados"
            enabled={orders}
            onToggle={() => setOrders((v) => !v)}
          />
          <ModuleRow
            label="Notificación WhatsApp"
            description="Mensaje wa.me al confirmar pedido"
            enabled={whatsapp}
            onToggle={() => setWhatsapp((v) => !v)}
          />
        </div>
      </Glass>

      {state?.error && <ErrorMsg msg={state.error} />}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%',
          padding: '13px',
          borderRadius: 'var(--radius-full)',
          fontWeight: 600,
          fontSize: 15,
          border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar plan'}
      </button>
    </form>
  );
}

function ModuleRow({
  label,
  description,
  enabled,
  locked,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: locked ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        disabled={locked}
        onClick={onToggle}
        className={locked ? undefined : 'press'}
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          background: enabled ? 'var(--brand-accent)' : 'rgba(255,255,255,0.1)',
          border: 'none',
          cursor: locked ? 'default' : 'pointer',
          position: 'relative',
          transition: 'background 200ms',
          flexShrink: 0,
        }}
        aria-label={label}
      >
        <span
          style={{
            position: 'absolute',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'white',
            top: 3,
            left: enabled ? 19 : 3,
            transition: 'left 200ms',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--u-text)' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(220,50,50,0.12)',
        border: '1px solid rgba(220,50,50,0.25)',
        color: '#f87171',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}
