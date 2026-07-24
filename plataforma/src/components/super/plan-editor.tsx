'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import {
  updateRestaurantPlan,
  type SuperState,
} from '@/lib/actions/super-admin';
import { ACTIVATABLE_MODULES, type ActivatableModuleKey } from '@/lib/modules';
import { PLANS, PLAN_ORDER, PUBLIC_PLANS, INCLUDED_MODULES, ADDON_MODULES, defaultPlanPricing, type PlanPricing } from '@/lib/plans';
import type { Restaurant } from '@/types';
import type { PlanCode } from '@/lib/plans';

interface PlanFeatures {
  orders: boolean;
  whatsapp_notify: boolean;
  analitica: boolean;
  inventario: boolean;
  promociones: boolean;
  personal: boolean;
  finanzas: boolean;
  multi_branch: boolean;
}

type ManagedModules = Record<string, boolean>;

const FEATURE_KEYS: (keyof PlanFeatures)[] = [
  'orders', 'whatsapp_notify', 'analitica', 'inventario',
  'promociones', 'personal', 'finanzas', 'multi_branch',
];

// Flags legacy (restaurants.modules.{orders,whatsapp_notify,...}) — sin GMV
// desde mig. 072. Se mantienen porque otras partes del código ya los leen;
// el precio real ahora sale de plans.ts + módulos a la carta, no de aquí.
const PLAN_PRESETS: Record<PlanCode, PlanFeatures> = {
  BASICO:   { orders: false, whatsapp_notify: false, analitica: false, inventario: false, promociones: false, personal: false, finanzas: false, multi_branch: false },
  ESTANDAR: { orders: true,  whatsapp_notify: true,  analitica: false, inventario: false, promociones: false, personal: false, finanzas: true,  multi_branch: false },
  PREMIUM:  { orders: true,  whatsapp_notify: true,  analitica: true,  inventario: true,  promociones: true,  personal: true,  finanzas: true,  multi_branch: false },
  PRO:      { orders: true,  whatsapp_notify: true,  analitica: true,  inventario: true,  promociones: true,  personal: true,  finanzas: true,  multi_branch: false },
};

// Qué módulos activables vienen gratis con cada plan — misma fuente que la
// página pública /planes (INCLUDED_MODULES en plans.ts). BASICO/ESTANDAR no
// incluyen ninguno gratis (se venden a la carta); el super admin puede
// activarlos igual manualmente y se facturan según ADDON_MODULES.
const MANAGED_PRESETS: Record<PlanCode, Record<string, boolean>> = Object.fromEntries(
  PLAN_ORDER.map((code) => [
    code,
    Object.fromEntries(
      ACTIVATABLE_MODULES.map((m) => [m.key, INCLUDED_MODULES[code].includes(m.key)]),
    ),
  ]),
) as Record<PlanCode, Record<string, boolean>>;

function fmtQ0(n: number) {
  return 'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });
}

/** ¿Este plan se ofrece a clientes? Si no, solo tú puedes asignarlo aquí. */
function isPublicPlan(p: PlanCode): boolean {
  return (PUBLIC_PLANS as PlanCode[]).includes(p);
}

/* El precio mostrado sale del PlanPricing vigente (overrides del super
   admin en /super/configuracion), por eso se construye con función. */
function buildPlanMeta(pricing: PlanPricing): Record<PlanCode, { label: string; price: string; sub: string; badge?: string }> {
  return Object.fromEntries(
    PLAN_ORDER.map((code) => {
      const p = PLANS[code];
      return [code, { label: p.name, price: fmtQ0(pricing.prices[code]), sub: p.tagline, badge: p.badge }];
    }),
  ) as Record<PlanCode, { label: string; price: string; sub: string; badge?: string }>;
}

const ALL_PLANS: PlanCode[] = PLAN_ORDER;

const FEATURE_LIST: { key: keyof PlanFeatures; label: string; description: string }[] = [
  { key: 'orders',          label: 'Pedidos en línea',      description: 'Carrito + checkout + estados en tiempo real' },
  { key: 'whatsapp_notify', label: 'Notificación WhatsApp', description: 'Mensaje wa.me al confirmar pedido' },
  { key: 'analitica',       label: 'Analítica',             description: 'Horas pico, más vendidos, conversión' },
  { key: 'inventario',      label: 'Inventario',            description: 'Control de stock y anti-sobreventa' },
  { key: 'finanzas',        label: 'Finanzas',              description: 'Reportes, corte de caja, exportación' },
  { key: 'promociones',     label: 'Promociones',           description: 'Cupones y descuentos en checkout' },
  { key: 'personal',        label: 'Personal',              description: 'Gestión de staff y permisos por sección' },
  { key: 'multi_branch',    label: 'Multi-sucursal',        description: 'Panel de grupo y selector de sucursal' },
];

const VALID_PLANS = new Set<string>(ALL_PLANS);

const empty: SuperState = null;

export default function PlanEditor({
  restaurant,
  pricing = defaultPlanPricing(),
}: {
  restaurant: Restaurant;
  pricing?: PlanPricing;
}) {
  const [state, formAction, isPending] = useActionState(updateRestaurantPlan, empty);
  const PLAN_META = buildPlanMeta(pricing);

  const rawPlan = restaurant.plan_actual as string;
  const initialPlan: PlanCode = VALID_PLANS.has(rawPlan) ? (rawPlan as PlanCode) : 'PREMIUM';
  const isLegacy = !VALID_PLANS.has(rawPlan);

  const [plan, setPlan] = useState<PlanCode>(initialPlan);

  const mod = restaurant.modules as Record<string, boolean | undefined>;
  const [feats, setFeats] = useState<PlanFeatures>({
    orders:          mod.orders === true,
    whatsapp_notify: mod.whatsapp_notify === true,
    analitica:       mod.analitica === true,
    inventario:      mod.inventario === true,
    promociones:     mod.promociones === true,
    personal:        mod.personal === true,
    finanzas:        mod.finanzas === true,
    multi_branch:    mod.multi_branch === true,
  });

  const [managed, setManaged] = useState<ManagedModules>(
    Object.fromEntries(ACTIVATABLE_MODULES.map((m) => [m.key, mod[m.key] === true])),
  );

  function selectPlan(p: PlanCode) {
    setPlan(p);
    setFeats(PLAN_PRESETS[p]);
    setManaged(MANAGED_PRESETS[p]);
  }

  function toggleFeat(key: keyof PlanFeatures) {
    setFeats((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleManaged(key: string) {
    setManaged((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="id"         value={restaurant.id} />
      <input type="hidden" name="plan_actual" value={plan} />
      {FEATURE_KEYS.map((k) => (
        <input key={k} type="hidden" name={`feature_${k}`} value={String(feats[k])} />
      ))}
      {ACTIVATABLE_MODULES.map((m) => (
        <input key={m.key} type="hidden" name={`managed_${m.key}`} value={String(managed[m.key] === true)} />
      ))}

      {/* Plan selector */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
          Plan
        </p>
        {isLegacy && (
          <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', fontSize: 12.5 }}>
            Plan heredado «{rawPlan}». Selecciona el nuevo plan para actualizarlo.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {ALL_PLANS.map((p) => {
            const active = plan === p;
            const meta = PLAN_META[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectPlan(p)}
                className="press"
                style={{
                  padding: '10px 6px',
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
                {!isPublicPlan(p) ? (
                  <span style={{
                    position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                    background: '#fbbf24', color: '#1a1a1a',
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
                    padding: '2px 6px', borderRadius: 99, whiteSpace: 'nowrap',
                  }}>
                    NO PUBLICADO
                  </span>
                ) : meta.badge && (
                  <span style={{
                    position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--brand-accent)', color: '#fff',
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
                    padding: '2px 6px', borderRadius: 99, whiteSpace: 'nowrap',
                  }}>
                    {meta.badge}
                  </span>
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: active ? 'var(--brand-accent)' : 'var(--u-text-3)', marginBottom: 1 }}>
                  {meta.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: active ? 'var(--u-text)' : 'var(--u-text-2)', marginBottom: 1 }}>
                  {meta.price}
                </div>
                <div style={{ fontSize: 9, color: 'var(--u-text-4)' }}>
                  {meta.sub}
                </div>
              </button>
            );
          })}
        </div>
      </Glass>

      {/* Incluido en el plan */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
          Incluido en el plan
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <ModuleRow label="Catálogo" description="Menú QR público — siempre activo" enabled locked />
          {FEATURE_LIST.map(({ key, label, description }) => (
            <ModuleRow
              key={key}
              label={label}
              description={description}
              enabled={feats[key]}
              onToggle={() => toggleFeat(key)}
            />
          ))}
        </div>
      </Glass>

      {/* Módulos gestionados por Leogin */}
      <Glass variant="quiet" style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
          Módulos gestionados por Leogin
        </p>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '0 0 12px', lineHeight: 1.5, display: 'flex', gap: 7 }}>
          <Icon name="helpCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Activa los módulos que quieres que este restaurante pueda usar. Si los <strong>activas</strong>, aparecerán en el
            panel del restaurante como <strong>encendidos</strong> y el dueño decidirá si los mantiene activos. Si los
            <strong> dejas apagados</strong>, el restaurante no los verá ni podrá usarlos.
          </span>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {ACTIVATABLE_MODULES.map((m) => {
            const included = INCLUDED_MODULES[plan].includes(m.key);
            const addon = ADDON_MODULES[m.key as ActivatableModuleKey];
            const addonPrice = pricing.modulePrices[m.key as ActivatableModuleKey] ?? addon.price;
            const addonSetup = m.key === 'fel' ? pricing.moduleSetupFeeFel : addon.setupFee;
            const priceNote = (included
              ? `Incluido gratis en ${PLAN_META[plan].label}`
              : `Q${addonPrice}/mes a la carta${addonSetup ? ` + Q${addonSetup} activación` : ''} — no incluido en ${PLAN_META[plan].label}`)
              + (addon.comingSoon ? ' · aún no se ofrece a clientes (solo tú lo activas aquí)' : '');
            return (
              <ModuleRow
                key={m.key}
                label={m.label}
                description={m.requiresSetup ? `${priceNote} · requiere configuración de Leogin` : priceNote}
                enabled={managed[m.key] === true}
                onToggle={() => toggleManaged(m.key)}
              />
            );
          })}
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
          background: enabled ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 10%, transparent)',
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
