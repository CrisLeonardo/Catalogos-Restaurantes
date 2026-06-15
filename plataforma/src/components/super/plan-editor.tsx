'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import {
  updateRestaurantPlan,
  type SuperState,
} from '@/lib/actions/super-admin';
import type { Restaurant } from '@/types';

type Plan = 'BASICO' | 'POPULAR' | 'PREMIUM';

interface Modules {
  orders: boolean;
  whatsapp_notify: boolean;
  analitica: boolean;
  inventario: boolean;
  promociones: boolean;
  personal: boolean;
  finanzas: boolean;
  multi_branch: boolean;
}

const PLAN_PRESETS: Record<Plan, Modules> = {
  BASICO: {
    orders: false, whatsapp_notify: false, analitica: false,
    inventario: false, promociones: false, personal: false,
    finanzas: false, multi_branch: false,
  },
  POPULAR: {
    orders: true, whatsapp_notify: true, analitica: true,
    inventario: true, promociones: true, personal: true,
    finanzas: true, multi_branch: true,
  },
  PREMIUM: {
    orders: true, whatsapp_notify: true, analitica: true,
    inventario: true, promociones: true, personal: true,
    finanzas: true, multi_branch: true,
  },
};

const PLAN_META: Record<Plan, { label: string; price: string; sub: string; popular?: boolean }> = {
  BASICO:   { label: 'Básico',   price: 'Q200',       sub: 'por sucursal / mes' },
  POPULAR:  { label: 'Popular',  price: 'Q600',       sub: 'por sucursal / mes', popular: true },
  PREMIUM:  { label: 'Premium',  price: 'Q1,200',     sub: '2 sucursales incluidas' },
};

const MODULE_LIST: { key: keyof Modules; label: string; description: string }[] = [
  { key: 'orders',         label: 'Pedidos en línea',      description: 'Carrito + checkout + estados en tiempo real' },
  { key: 'whatsapp_notify',label: 'Notificación WhatsApp', description: 'Mensaje wa.me al confirmar pedido' },
  { key: 'analitica',      label: 'Analítica',             description: 'Horas pico, más vendidos, conversión' },
  { key: 'inventario',     label: 'Inventario',            description: 'Control de stock y anti-sobreventa' },
  { key: 'finanzas',       label: 'Finanzas',              description: 'Reportes, corte de caja, exportación' },
  { key: 'promociones',    label: 'Promociones',           description: 'Cupones y descuentos en checkout' },
  { key: 'personal',       label: 'Personal',              description: 'Gestión de staff y permisos por sección' },
  { key: 'multi_branch',   label: 'Multi-sucursal',        description: 'Panel de grupo y selector de sucursal' },
];

const empty: SuperState = null;

export default function PlanEditor({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, isPending] = useActionState(updateRestaurantPlan, empty);

  const [plan, setPlan] = useState<Plan>(
    (restaurant.plan_actual as Plan) ?? 'BASICO',
  );
  const [mods, setMods] = useState<Modules>({
    orders:          restaurant.modules.orders,
    whatsapp_notify: restaurant.modules.whatsapp_notify,
    analitica:       restaurant.modules.analitica        ?? false,
    inventario:      restaurant.modules.inventario       ?? false,
    promociones:     restaurant.modules.promociones      ?? false,
    personal:        restaurant.modules.personal         ?? false,
    finanzas:        restaurant.modules.finanzas         ?? false,
    multi_branch:    restaurant.modules.multi_branch     ?? false,
  });

  function selectPlan(p: Plan) {
    setPlan(p);
    setMods(PLAN_PRESETS[p]);
  }

  function toggle(key: keyof Modules) {
    setMods((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="id"                  value={restaurant.id} />
      <input type="hidden" name="plan_actual"          value={plan} />
      <input type="hidden" name="module_orders"        value={String(mods.orders)} />
      <input type="hidden" name="module_whatsapp"      value={String(mods.whatsapp_notify)} />
      <input type="hidden" name="module_analitica"     value={String(mods.analitica)} />
      <input type="hidden" name="module_inventario"    value={String(mods.inventario)} />
      <input type="hidden" name="module_promociones"   value={String(mods.promociones)} />
      <input type="hidden" name="module_personal"      value={String(mods.personal)} />
      <input type="hidden" name="module_finanzas"      value={String(mods.finanzas)} />
      <input type="hidden" name="module_multi_branch"  value={String(mods.multi_branch)} />

      {/* Plan selector */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
          Plan
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['BASICO', 'POPULAR', 'PREMIUM'] as const).map((p) => {
            const active = plan === p;
            const meta = PLAN_META[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectPlan(p)}
                className="press"
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid',
                  borderColor: active ? 'var(--brand-accent)' : 'var(--u-hair)',
                  background: active ? 'rgba(var(--brand-accent-rgb,217,119,87),0.1)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                {meta.popular && (
                  <span style={{
                    position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--brand-accent)', color: '#fff',
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                    padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                  }}>
                    MÁS VENDIDO
                  </span>
                )}
                <div style={{ fontWeight: 700, fontSize: 14, color: active ? 'var(--brand-accent)' : 'var(--u-text-3)', marginBottom: 2 }}>
                  {meta.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: active ? 'var(--u-text)' : 'var(--u-text-2)', marginBottom: 2 }}>
                  {meta.price}
                </div>
                <div style={{ fontSize: 10, color: 'var(--u-text-4)' }}>
                  {meta.sub}
                </div>
              </button>
            );
          })}
        </div>
      </Glass>

      {/* Módulos */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
          Módulos
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Catálogo — siempre activo */}
          <ModuleRow label="Catálogo" description="Menú QR público — siempre activo" enabled locked />

          {MODULE_LIST.map(({ key, label, description }) => (
            <ModuleRow
              key={key}
              label={label}
              description={description}
              enabled={mods[key]}
              onToggle={() => toggle(key)}
            />
          ))}
        </div>
      </Glass>

      {state?.error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 14 }}>
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? 'Guardando…' : 'Guardar plan'}
      </button>
    </form>
  );
}

function ModuleRow({
  label, description, enabled, locked, onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--u-hair)', opacity: locked ? 0.45 : 1 }}>
      <button
        type="button"
        disabled={locked}
        onClick={onToggle}
        className={locked ? undefined : 'press'}
        aria-label={label}
        style={{
          width: 40, height: 24, borderRadius: 12, flexShrink: 0,
          background: enabled ? 'var(--brand-accent)' : 'rgba(255,255,255,0.1)',
          border: 'none', cursor: locked ? 'default' : 'pointer',
          position: 'relative', transition: 'background 200ms',
        }}
      >
        <span style={{
          position: 'absolute', width: 18, height: 18, borderRadius: '50%',
          background: 'white', top: 3, left: enabled ? 19 : 3,
          transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--u-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 1 }}>{description}</div>
      </div>
    </div>
  );
}
