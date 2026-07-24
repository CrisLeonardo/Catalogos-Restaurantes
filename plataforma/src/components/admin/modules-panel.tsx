'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { setModuleEnabled } from '@/lib/actions/modules';
import { updateOwnOrderTypes } from '@/lib/actions/restaurant';
import {
  ACTIVATABLE_MODULES,
  MODULE_GROUPS,
  isModuleActive,
  showsInPanel,
  type ActivatableModuleKey,
  type ModuleMeta,
  type ModulesMap,
  type ModuleSettings,
} from '@/lib/modules';
import { ESTANDAR_MAX_ORDER_TYPES, INCLUDED_MODULES, PLANS, isAddonAvailable, planPriceLabel, type PlanCode, type PlanPricing } from '@/lib/plans';
import { usePlanPricing } from '@/components/plan-pricing-context';
import type { OrderType } from '@/lib/theme/defaults';

/** Nota de precio para un módulo según si el plan actual lo incluye gratis. */
function modulePriceNote(pricing: PlanPricing, plan: string | null | undefined, key: ActivatableModuleKey): string {
  const p = (plan ?? 'BASICO') as PlanCode;
  const included = INCLUDED_MODULES[p]?.includes(key);
  if (included) return 'Incluido en tu plan';
  return `Q${pricing.modulePrices[key] ?? 0}/mes a la carta`;
}

/** Cada modo de pedido es su propio canal independiente — comer en local,
   para llevar y a domicilio ya no se agrupan entre sí (antes "local" unía
   comer en local + para llevar en un solo toggle). */
const CHANNEL_META: { id: OrderType; label: string; description: string; icon: string; configHref?: string }[] = [
  {
    id: 'dine_in',
    label: 'Comer en el local',
    description: 'El cliente pide desde la mesa escaneando el QR. Requiere configurar el número de mesas.',
    icon: 'utensils',
    configHref: '/admin/mesas',
  },
  {
    id: 'pickup',
    label: 'Para llevar',
    description: 'El cliente hace su pedido en línea y lo retira en el mostrador de tu local.',
    icon: 'bag',
    configHref: '/admin/personalizacion',
  },
  {
    id: 'delivery',
    label: 'A domicilio',
    description: 'El cliente ingresa su dirección y el pedido se entrega donde está. Puedes definir zonas y costo de envío.',
    icon: 'truck',
    configHref: '/admin/personalizacion',
  },
];

interface Props {
  restaurantId: string;
  modules: ModulesMap;
  settings: ModuleSettings;
  orderTypes: OrderType[];
  /** Datos de contacto del soporte para "solicitar activación". */
  supportWhatsapp?: string;
  /** Plan actual — determina qué tipos de pedido están disponibles. */
  planActual?: string | null;
  /** Q de descuento por cada método de pedido desactivado (platform_settings). */
  channelDiscountPer?: number;
  /** Máximo de métodos descontables a la vez. */
  channelDiscountMax?: number;
}

const BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  POPULAR: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  NUEVO: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
};

function Badge({ label }: { label: string }) {
  const style = BADGE_COLOR[label] ?? { bg: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-3)' };
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99, background: style.bg, color: style.color }}>
      {label}
    </span>
  );
}

function Toggle({ on, busy, disabled, onClick, label }: { on: boolean; busy: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <Switch
      checked={on}
      onCheckedChange={onClick}
      disabled={busy || disabled}
      aria-label={label}
    />
  );
}

function StatusDot({ on, label, color }: { on: boolean; label: string; color?: string }) {
  const c = on ? (color ?? '#4ade80') : 'var(--u-text-4)';
  return (
    <div style={{ fontSize: 11, color: c, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: on ? c : 'color-mix(in srgb, var(--u-text) 20%, transparent)', display: 'inline-block' }} />
      {label}
    </div>
  );
}

function CardShell({ m, active, children, footer }: { m: ModuleMeta; active: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  const iconColor = active ? 'var(--brand-accent)' : 'var(--u-text-2)';
  return (
    <Card className="flex flex-col gap-3 p-4.5">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: active ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
            display: 'grid', placeItems: 'center', color: iconColor,
            border: `1px solid ${active ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.2)' : 'transparent'}`,
          }}>
            <Icon name={m.icon} size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</span>
              {m.badge && <Badge label={m.badge} />}
            </div>
            {children}
          </div>
        </div>
        {footer}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, margin: 0 }}>{m.description}</p>
    </Card>
  );
}

/** Tarjeta self-service: toggle libre. */
function SelfServiceCard({ m, on, busy, onToggle, priceNote }: { m: ModuleMeta; on: boolean; busy: boolean; onToggle: (next: boolean) => void; priceNote: string }) {
  return (
    <Card className="flex flex-col gap-3 p-4.5">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
            display: 'grid', placeItems: 'center', color: on ? 'var(--brand-accent)' : 'var(--u-text-2)',
            border: `1px solid ${on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.2)' : 'transparent'}`,
          }}>
            <Icon name={m.icon} size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</span>
              {m.badge && <Badge label={m.badge} />}
            </div>
            <StatusDot on={on} label={on ? 'Activo' : 'Inactivo'} />
          </div>
        </div>
        <Toggle on={on} busy={busy} onClick={() => onToggle(!on)} label={`${on ? 'Desactivar' : 'Activar'} ${m.label}`} />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, margin: 0 }}>{m.description}</p>
      <div style={{ fontSize: 11, fontWeight: 700, color: priceNote === 'Incluido en tu plan' ? '#4ade80' : 'var(--brand-accent)' }}>
        {priceNote}
        {priceNote !== 'Incluido en tu plan' && (
          <span style={{ display: 'block', fontWeight: 400, color: 'var(--u-text-4)', marginTop: 2 }}>
            {on
              ? 'Si lo apagas, deja de cobrarse desde tu próximo ciclo (debe quedar apagado el 75% del mes).'
              : 'Apagado no se cobra — el cambio se refleja en tu próximo ciclo.'}
          </span>
        )}
      </div>
      {m.hint && (
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="helpCircle" size={12} /> {m.hint}
        </div>
      )}
      {on && m.href && (
        <a href={m.href} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          Abrir {m.navLabel ?? m.label} <Icon name="arrowRight" size={13} />
        </a>
      )}
    </Card>
  );
}

/** Tarjeta de módulo que requiere configuración de Leogin (p.ej. FEL). */
function ManagedCard({ m, active, supportHref, priceNote }: { m: ModuleMeta; active: boolean; supportHref: string; priceNote: string }) {
  return (
    <CardShell
      m={m}
      active={active}
      footer={
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          padding: '4px 9px', borderRadius: 99,
          background: active ? 'rgba(74,222,128,0.12)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
          color: active ? '#4ade80' : 'var(--u-text-4)',
        }}>
          {active ? 'Activo' : 'Gestionado'}
        </span>
      }
    >
      {active
        ? <StatusDot on label="Activo · lo administra Leogin" />
        : <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 600, marginTop: 2 }}>Lo activa el equipo de Leogin</div>}
      <div style={{ fontSize: 11, fontWeight: 700, color: priceNote === 'Incluido en tu plan' ? '#4ade80' : 'var(--brand-accent)', marginTop: 4 }}>
        {priceNote}
      </div>
      <div style={{ marginTop: 10 }}>
        {active && m.href ? (
          <a href={m.href} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Abrir {m.navLabel ?? m.label} <Icon name="arrowRight" size={13} />
          </a>
        ) : (
          <a href={supportHref} target={supportHref.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="press"
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', border: '1px solid rgba(var(--brand-accent-rgb, 99,102,241),0.3)', borderRadius: 99 }}>
            <Icon name="sparkle" size={13} /> Solicitar activación
          </a>
        )}
      </div>
    </CardShell>
  );
}

/** Tarjeta "esto lo pierdes por tu plan" — no vendible a la carta (todo el panel) o
   módulo a la carta que no tienes activo todavía. Siempre visible, nunca se oculta. */
function LockedPlanCard({ icon, label, description, priceNote }: { icon: string; label: string; description: string; priceNote: string }) {
  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden p-4.5" style={{ opacity: 0.65 }}>
      <div style={{
        position: 'absolute', top: 10, right: 10,
        fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
        background: 'rgba(var(--brand-accent-rgb,99,102,241),0.15)', color: 'var(--brand-accent)',
        letterSpacing: '0.06em',
      }}>
        PREMIUM
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text-4)' }}>
          <Icon name={icon} size={20} />
        </span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-3)' }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <Icon name="key" size={11} style={{ color: 'var(--u-text-4)' }} />
            <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>No incluido en tu plan</span>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, margin: 0 }}>{description}</p>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-accent)' }}>{priceNote}</div>
    </Card>
  );
}

/** Sección siempre visible con lo que el plan actual NO incluye: funciones exclusivas
   de Premium que no se venden sueltas (mesero, analítica/inventario/personal) y módulos
   a la carta que aún no están activos. Oculta solo si ya tienes Premium/Pro. */
function PremiumGapsSection({ plan, modules, settings }: { plan: PlanCode; modules: ModulesMap; settings: ModuleSettings }) {
  const pricing = usePlanPricing();
  const premiumLabel = planPriceLabel(pricing, 'PREMIUM');
  const f = PLANS[plan];
  const missingAddons = ACTIVATABLE_MODULES.filter(
    (m) => isAddonAvailable(m.key) && !INCLUDED_MODULES[plan]?.includes(m.key) && !isModuleActive(modules, settings, m.key),
  );
  const missingWaiter = !f.hasWaiterPanel;
  const missingAnalytics = !f.hasAnalytics;

  if (!missingWaiter && !missingAnalytics && missingAddons.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
        Lo que obtienes con Premium
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginBottom: 12, marginTop: 0 }}>
        Esto es lo que tu plan <strong style={{ color: 'var(--u-text-2)' }}>{PLANS[plan].name}</strong> todavía no incluye.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
        {missingWaiter && (
          <LockedPlanCard
            icon="userPlus"
            label="Panel de mesero y mapa de mesas"
            description="Tu equipo toma pedidos desde una tablet en cada mesa y ves el mapa del salón en vivo. Es de todo el panel, no se compra por módulo."
            priceNote={`Incluido en Premium (${premiumLabel})`}
          />
        )}
        {missingAnalytics && (
          <LockedPlanCard
            icon="chart"
            label="Analítica, inventario y personal"
            description="Estadísticas avanzadas, control de inventario y costos, personal con roles, y promociones automáticas."
            priceNote={`Incluido en Premium (${premiumLabel})`}
          />
        )}
        {missingAddons.map((m) => (
          <LockedPlanCard
            key={m.key}
            icon={m.icon}
            label={m.label}
            description={m.description}
            priceNote={`Incluido en Premium · o Q${pricing.modulePrices[m.key] ?? 0}/mes a la carta`}
          />
        ))}
      </div>
      <a href="/admin/suscripcion" className="press"
        style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        Ver comparativa de planes <Icon name="arrowRight" size={13} />
      </a>
    </div>
  );
}

export default function ModulesPanel({ restaurantId, modules, settings, orderTypes, supportWhatsapp, planActual, channelDiscountPer = 50, channelDiscountMax = 2 }: Props) {
  const router = useRouter();
  const pricing = usePlanPricing();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Estado local para modos de pedido (optimistic).
  const [localOrderTypes, setLocalOrderTypes] = useState<OrderType[]>(orderTypes);
  const [orderBusy, setOrderBusy] = useState<OrderType | null>(null);

  // Estándar: el dueño elige libremente sus modos de pedido, con tope de
  // ESTANDAR_MAX_ORDER_TYPES (2 de 3) — el 3ero requiere subir a Premium.
  const isEstandar = planActual === 'ESTANDAR';
  const isBasico = planActual === 'BASICO';

  function toggle(key: ActivatableModuleKey, next: boolean) {
    setError(null);
    setBusyKey(key);
    startTransition(async () => {
      const res = await setModuleEnabled(restaurantId, key, next);
      setBusyKey(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function toggleType(m: typeof CHANNEL_META[number]) {
    const isOn = localOrderTypes.includes(m.id);

    if (!isOn && isEstandar && localOrderTypes.length >= ESTANDAR_MAX_ORDER_TYPES) {
      setError(`Tu plan Estándar permite hasta ${ESTANDAR_MAX_ORDER_TYPES} modos de pedido activos. Desactiva otro primero, o actualiza a Premium para tener los 3.`);
      return;
    }

    const next = isOn
      ? localOrderTypes.filter((t) => t !== m.id)
      : [...localOrderTypes, m.id];

    if (next.length === 0) {
      setError('Debe haber al menos un modo de pedido activo.');
      return;
    }
    setError(null);
    setLocalOrderTypes(next);
    setOrderBusy(m.id);
    startTransition(async () => {
      const res = await updateOwnOrderTypes(restaurantId, next);
      setOrderBusy(null);
      if (res.error) {
        setLocalOrderTypes(localOrderTypes); // revert
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const supportHref = supportWhatsapp
    ? `https://wa.me/${supportWhatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent('Hola, quiero activar la Factura Electrónica (FEL) en mi restaurante.')}`
    : '/admin/ayuda';

  // Módulos visibles en el panel (oculta los gestionados que no requieren setup).
  const visible = ACTIVATABLE_MODULES.filter((m) => showsInPanel(modules, m.key));
  const activeCount = ACTIVATABLE_MODULES.filter((m) => isModuleActive(modules, settings, m.key)).length;
  const selfCount = visible.filter((m) => !m.requiresSetup).length;
  const selfActive = visible.filter((m) => !m.requiresSetup && settings[m.key]?.enabled !== false).length;

  const currentPlan = (planActual ?? 'BASICO') as PlanCode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      <PremiumGapsSection plan={currentPlan} modules={modules} settings={settings} />

      {/* ── Modos de pedido ──────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
          Modos de pedido
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginBottom: 12, marginTop: 0 }}>
          Controla qué canales de compra están disponibles en tu menú. Al menos uno debe estar activo.
        </p>
        {planActual === 'BASICO' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'rgba(var(--brand-accent-rgb,99,102,241),0.07)', border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.18)', marginBottom: 12 }}>
            <Icon name="alertCircle" size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              El plan <strong style={{ color: 'var(--u-text-2)' }}>Básico</strong> es solo menú digital — no incluye pedidos en línea.
              Activa pedidos para llevar desde <strong style={{ color: 'var(--brand-accent)' }}>Estándar ({planPriceLabel(pricing, 'ESTANDAR')})</strong>.{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--brand-accent)', fontWeight: 700, textDecoration: 'none' }}>Actualizar →</a>
            </p>
          </div>
        )}
        {isEstandar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'rgba(var(--brand-accent-rgb,99,102,241),0.07)', border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.18)', marginBottom: 12 }}>
            <Icon name="alertCircle" size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              Tu plan Estándar te deja elegir hasta <strong style={{ color: 'var(--u-text-2)' }}>{ESTANDAR_MAX_ORDER_TYPES} de 3 modos de pedido</strong>.
              Para tener comer en local, para llevar y a domicilio juntos, cambia a <strong style={{ color: 'var(--brand-accent)' }}>Premium ({planPriceLabel(pricing, 'PREMIUM')})</strong>.{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--brand-accent)', fontWeight: 700, textDecoration: 'none' }}>Actualizar →</a>
            </p>
          </div>
        )}
        {(planActual === 'PREMIUM' || planActual === 'PRO') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', marginBottom: 12 }}>
            <Icon name="sparkle" size={14} style={{ color: 'var(--c-ok, #4ade80)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--u-text-2)' }}>Plan a tu medida:</strong> cada método de pedido que desactives baja tu
              mensualidad <strong style={{ color: 'var(--u-text-2)' }}>Q{channelDiscountPer}</strong> (hasta {channelDiscountMax} de los 3 —
              siempre se paga al menos uno). El descuento entra hasta tu <strong style={{ color: 'var(--u-text-2)' }}>próximo cobro</strong>, y
              se calcula sobre todo el mes: necesitas dejarlo apagado al menos el 75% de los días de este mes para que aplique
              (un 25% de margen para probarlo sin perder el descuento — entre más tarde en el mes lo apagues, menos margen te queda).{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--c-ok, #4ade80)', fontWeight: 700, textDecoration: 'none' }}>Ver mi mensualidad →</a>
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {CHANNEL_META.map((m) => {
            const on = localOrderTypes.includes(m.id);
            const activeCount = localOrderTypes.length;
            // BASICO: solo "para llevar" (sin pedidos reales todavía, ver banner arriba).
            // ESTANDAR: cualquier modo, hasta el tope de 2 — el que falta pide Premium.
            const lockedPremium = isBasico
              ? m.id !== 'pickup'
              : isEstandar
                ? (!on && activeCount >= ESTANDAR_MAX_ORDER_TYPES)
                : false;
            const lockLabel = isBasico ? 'Requiere Estándar' : 'Requiere Premium';
            const lockBadge = isBasico ? 'ESTÁNDAR' : 'PREMIUM';
            const busy = orderBusy === m.id && isPending;
            const isLast = activeCount === 1 && on;

            if (lockedPremium) {
              return (
                <Card key={m.id} className="relative flex flex-col gap-3 overflow-hidden p-4.5" style={{ opacity: 0.6 }}>
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                    background: 'rgba(var(--brand-accent-rgb,99,102,241),0.15)', color: 'var(--brand-accent)',
                    letterSpacing: '0.06em',
                  }}>
                    {lockBadge}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text-4)' }}>
                      <Icon name={m.icon} size={20} />
                    </span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-3)' }}>{m.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <Icon name="key" size={11} style={{ color: 'var(--u-text-4)' }} />
                        <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{lockLabel}</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, margin: 0 }}>{m.description}</p>
                </Card>
              );
            }

            return (
              <Card key={m.id} className="flex flex-col gap-3 p-4.5">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                      display: 'grid', placeItems: 'center',
                      color: on ? 'var(--brand-accent)' : 'var(--u-text-3)',
                      border: `1px solid ${on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.2)' : 'transparent'}`,
                    }}>
                      <Icon name={m.icon} size={20} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</div>
                      <StatusDot on={on} label={on ? 'Activo' : 'Inactivo'} />
                    </div>
                  </div>
                  <Toggle
                    on={on}
                    busy={busy}
                    disabled={isLast}
                    onClick={() => toggleType(m)}
                    label={`${on ? 'Desactivar' : 'Activar'} ${m.label}`}
                  />
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, margin: 0 }}>
                  {m.description}
                </p>
                {on && m.configHref && (
                  <a href={m.configHref} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    Configurar <Icon name="arrowRight" size={13} />
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Módulos ───────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
          Módulos
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginBottom: 4, marginTop: 0 }}>
          Activa solo las herramientas que tu restaurante necesita. Lo que no uses, déjalo apagado para un panel más limpio.
          {' '}Puedes prenderlas o apagarlas cuando quieras.
        </p>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
          <strong style={{ color: 'var(--u-text-2)' }}>{activeCount}</strong> activo{activeCount !== 1 ? 's' : ''}
          {selfCount > 0 && <> · {selfActive} de {selfCount} herramientas opcionales</>}
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: 'var(--c-danger, #f87171)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Secciones por grupo */}
      {MODULE_GROUPS.map((g) => {
        const mods = visible.filter((m) => m.group === g.id);
        if (mods.length === 0) return null;
        return (
          <div key={g.id}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>
              {g.label}
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '0 0 11px' }}>{g.description}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {mods.map((m) => {
                if (m.requiresSetup) {
                  return (
                    <ManagedCard
                      key={m.key}
                      m={m}
                      active={isModuleActive(modules, settings, m.key)}
                      supportHref={supportHref}
                      priceNote={modulePriceNote(pricing, planActual, m.key)}
                    />
                  );
                }
                const on = settings[m.key]?.enabled !== false; // defaults ON para módulos habilitados
                const busy = busyKey === m.key && isPending;
                return (
                  <SelfServiceCard
                    key={m.key}
                    m={m}
                    on={on}
                    busy={busy}
                    onToggle={(next) => toggle(m.key, next)}
                    priceNote={modulePriceNote(pricing, planActual, m.key)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Nota multi-sucursal (en vez de "mejorar plan") */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div style={{ fontSize: 13, color: 'var(--u-text-3)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="grid" size={18} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          <span>¿Tienes varias sucursales? Únelas en un panel de grupo con métricas consolidadas.</span>
        </div>
        <a href="/admin/ayuda" className="press"
          style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid rgba(var(--brand-accent-rgb, 99,102,241),0.3)', borderRadius: 99, flexShrink: 0 }}>
          Hablar con Leogin <Icon name="arrowRight" size={13} />
        </a>
      </Card>
    </div>
  );
}
