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
import { ESTANDAR_MAX_ORDER_TYPES, INCLUDED_MODULES, PLANS, PUBLIC_PLANS, planPriceLabel, type PlanCode } from '@/lib/plans';
import { usePlanPricing } from '@/components/plan-pricing-context';
import type { OrderType } from '@/lib/theme/defaults';

const q = (n: number) => 'Q' + Math.round(n).toLocaleString('es-GT');

/** ¿El plan incluye este módulo? (si no, solo está activo por excepción manual de Leogin). */
function includedInPlan(plan: string | null | undefined, key: ActivatableModuleKey): boolean {
  return INCLUDED_MODULES[(plan ?? 'BASICO') as PlanCode]?.includes(key) ?? false;
}

/** Qué le pasa a la mensualidad del dueño si prende/apaga este módulo: nada —
 *  los planes son de precio fijo, apagarlo solo lo esconde de su panel. */
function modulePriceNote(
  plan: string | null | undefined,
  key: ActivatableModuleKey,
): { title: string; detail: string; free: boolean } {
  return {
    title: includedInPlan(plan, key) ? 'Incluido en tu plan' : 'Activado para tu restaurante',
    detail: 'Apagarlo solo lo esconde del panel — tu mensualidad no cambia.',
    free: true,
  };
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
  /** Mensualidad que se está facturando (precio fijo del plan). */
  billedNow?: number | null;
}

const BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  POPULAR: { bg: 'var(--c-warn-bg)', color: 'var(--c-warn)' },
  NUEVO: { bg: 'var(--c-alt-bg)', color: 'var(--c-alt)' },
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
  const c = on ? (color ?? 'var(--c-ok)') : 'var(--u-text-4)';
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
function SelfServiceCard({ m, on, busy, onToggle, priceNote }: { m: ModuleMeta; on: boolean; busy: boolean; onToggle: (next: boolean) => void; priceNote: { title: string; detail: string; free: boolean } }) {
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
      <div style={{ fontSize: 11, fontWeight: 700, color: priceNote.free ? 'var(--c-ok)' : 'var(--brand-accent)' }}>
        {priceNote.title}
        <span style={{ display: 'block', fontWeight: 400, color: 'var(--u-text-4)', marginTop: 2 }}>
          {priceNote.detail}
        </span>
      </div>
      {m.hint && (
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="helpCircle" size={12} /> {m.hint}
        </div>
      )}
      {on && m.href && (
        <a href={m.href} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          Abrir {m.navLabel ?? m.label} <Icon name="arrowRight" size={13} />
        </a>
      )}
    </Card>
  );
}

/** Tarjeta de módulo que requiere configuración de Leogin (p.ej. FEL). */
function ManagedCard({ m, active, supportHref, priceNote }: { m: ModuleMeta; active: boolean; supportHref: string; priceNote: { title: string; detail: string; free: boolean } }) {
  return (
    <CardShell
      m={m}
      active={active}
      footer={
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          padding: '4px 9px', borderRadius: 99,
          background: active ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
          color: active ? 'var(--c-ok)' : 'var(--u-text-4)',
        }}>
          {active ? 'Activo' : 'Gestionado'}
        </span>
      }
    >
      {active
        ? <StatusDot on label="Activo · lo administra Leogin" />
        : <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 600, marginTop: 2 }}>Lo activa el equipo de Leogin</div>}
      <div style={{ fontSize: 11, fontWeight: 700, color: priceNote.free ? 'var(--c-ok)' : 'var(--brand-accent)', marginTop: 4 }}>
        {priceNote.title}
      </div>
      <div style={{ marginTop: 10 }}>
        {active && m.href ? (
          <a href={m.href} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Abrir {m.navLabel ?? m.label} <Icon name="arrowRight" size={13} />
          </a>
        ) : (
          <a href={supportHref} target={supportHref.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="press"
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', border: '1px solid rgba(var(--brand-accent-rgb, 99,102,241),0.3)', borderRadius: 99 }}>
            <Icon name="sparkle" size={13} /> Solicitar activación
          </a>
        )}
      </div>
    </CardShell>
  );
}

/** Tarjeta "esto lo pierdes por tu plan" — funciones y módulos que solo trae
   un plan superior. Siempre visible, nunca se oculta. */
function LockedPlanCard({ icon, label, description, priceNote, badge = 'PREMIUM', lockLabel = 'No incluido en tu plan' }: { icon: string; label: string; description: string; priceNote: string; badge?: string; lockLabel?: string }) {
  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden p-4.5" style={{ opacity: 0.65 }}>
      <div style={{
        position: 'absolute', top: 10, right: 10,
        fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
        background: 'rgba(var(--brand-accent-rgb,99,102,241),0.15)', color: 'var(--brand-accent-ink)',
        letterSpacing: '0.06em',
      }}>
        {badge}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text-4)' }}>
          <Icon name={icon} size={20} />
        </span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-3)' }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <Icon name="key" size={11} style={{ color: 'var(--u-text-4)' }} />
            <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{lockLabel}</span>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, margin: 0 }}>{description}</p>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-accent-ink)' }}>{priceNote}</div>
    </Card>
  );
}

/** Sección siempre visible con lo que el plan actual NO incluye: todo lo que
   trae Premium y este plan no — panel de mesero, analítica/inventario/personal
   y los módulos que no vienen en Básico/Estándar. Oculta solo si ya tienes
   Premium/Pro (que lo incluyen todo). */
function PremiumGapsSection({ plan, modules, settings }: { plan: PlanCode; modules: ModulesMap; settings: ModuleSettings }) {
  const pricing = usePlanPricing();
  const premiumLabel = planPriceLabel(pricing, 'PREMIUM');
  const f = PLANS[plan];
  // Solo se anuncian módulos que algún plan A LA VENTA realmente incluye —
  // "proveedores" y "fel" son exclusivos de Pro, que está pausado (aún no
  // están listos, ver nota "PAUSADO" en plans.ts) y no se ofrece a clientes.
  // Sin este filtro, un dueño en Premium veía esas dos tarjetas anunciadas
  // como "Incluido en Premium" cuando en realidad ni Premium las trae ni Pro
  // se puede contratar todavía.
  const missingModules = ACTIVATABLE_MODULES.filter(
    (m) =>
      !INCLUDED_MODULES[plan]?.includes(m.key) &&
      !isModuleActive(modules, settings, m.key) &&
      PUBLIC_PLANS.some((p) => INCLUDED_MODULES[p]?.includes(m.key)),
  );
  const missingWaiter = !f.hasWaiterPanel;
  const missingAnalytics = !f.hasAnalytics;

  if (!missingWaiter && !missingAnalytics && missingModules.length === 0) return null;

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
            description="Estadísticas avanzadas, control de inventario y costos, y personal con roles."
            priceNote={`Incluido en Premium (${premiumLabel})`}
          />
        )}
        {missingModules.map((m) => (
          <LockedPlanCard
            key={m.key}
            icon={m.icon}
            label={m.label}
            description={m.description}
            priceNote={`Incluido en Premium (${premiumLabel})`}
          />
        ))}
      </div>
      <a href="/admin/suscripcion" className="press"
        style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        Ver comparativa de planes <Icon name="arrowRight" size={13} />
      </a>
    </div>
  );
}

/** Tarjeta de mensualidad: los planes son de precio fijo, así que aquí no hay
 *  nada que simular — prender o apagar un módulo o un canal nunca cambia este
 *  número. Solo enseña el precio y manda a /admin/suscripcion para el detalle. */
function LiveBillCard({ planCode, billedNow }: { planCode: PlanCode; billedNow: number | null }) {
  const pricing = usePlanPricing();
  const amount = billedNow ?? pricing.prices[planCode] ?? 0;

  return (
    <Card className="p-4.5" style={{ border: '1px solid var(--u-hair-2)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Tu mensualidad
          </div>
          <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 30, color: 'var(--u-text)', lineHeight: 1.1, marginTop: 4 }}>
            {q(amount)}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-4)', fontFamily: 'var(--font-sans)' }}> / mes</span>
          </div>
        </div>
        <a href="/admin/suscripcion" className="press"
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          Ver mi suscripción <Icon name="arrowRight" size={12} />
        </a>
      </div>
      <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '10px 0 0', lineHeight: 1.5 }}>
        Precio fijo del plan {PLANS[planCode].name}: prender o apagar módulos y modos de pedido
        no cambia tu mensualidad. Si tienes un precio acordado directo con Leogin, manda ese.
      </p>
    </Card>
  );
}

export default function ModulesPanel({ restaurantId, modules, settings, orderTypes, supportWhatsapp, planActual, billedNow = null }: Props) {
  const router = useRouter();
  const pricing = usePlanPricing();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Estado local para modos de pedido (optimistic).
  const [localOrderTypes, setLocalOrderTypes] = useState<OrderType[]>(orderTypes);
  const [orderBusy, setOrderBusy] = useState<OrderType | null>(null);
  const [localSettings, setLocalSettings] = useState<ModuleSettings>(settings);

  // Estándar: el dueño elige libremente sus modos de pedido, con tope de
  // ESTANDAR_MAX_ORDER_TYPES (2 de 3) — el 3ero requiere subir a Premium.
  const isEstandar = planActual === 'ESTANDAR';
  const isBasico = planActual === 'BASICO';

  function toggle(key: ActivatableModuleKey, next: boolean) {
    setError(null);
    setBusyKey(key);
    // Optimista: el interruptor cambia al instante; si el servidor rechaza, se revierte.
    const prev = localSettings;
    setLocalSettings({ ...localSettings, [key]: { ...(localSettings[key] ?? {}), enabled: next } });
    startTransition(async () => {
      const res = await setModuleEnabled(restaurantId, key, next);
      setBusyKey(null);
      if (res.error) { setLocalSettings(prev); setError(res.error); return; }
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
  const activeCount = ACTIVATABLE_MODULES.filter((m) => isModuleActive(modules, localSettings, m.key)).length;
  const selfCount = visible.filter((m) => !m.requiresSetup).length;
  const selfActive = visible.filter((m) => !m.requiresSetup && localSettings[m.key]?.enabled !== false).length;

  const currentPlan = (planActual ?? 'BASICO') as PlanCode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* La mensualidad va ARRIBA del todo: precio fijo del plan, no cambia
         con lo que se prenda o apague en esta pantalla. */}
      <LiveBillCard planCode={currentPlan} billedNow={billedNow} />

      <PremiumGapsSection plan={currentPlan} modules={modules} settings={localSettings} />

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
            <Icon name="alertCircle" size={14} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              El plan <strong style={{ color: 'var(--u-text-2)' }}>Básico</strong> es solo menú digital — no incluye pedidos en línea.
              Activa pedidos para llevar desde <strong style={{ color: 'var(--brand-accent-ink)' }}>Estándar ({planPriceLabel(pricing, 'ESTANDAR')})</strong>.{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--brand-accent-ink)', fontWeight: 700, textDecoration: 'none' }}>Actualizar →</a>
            </p>
          </div>
        )}
        {/* Estándar: es un TOPE, no un descuento. Se dice como lo que es —
           "elige 2 de 3" — sin mezclarlo con el ahorro de Premium. */}
        {isEstandar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'rgba(var(--brand-accent-rgb,99,102,241),0.07)', border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.18)', marginBottom: 12 }}>
            <Icon name="alertCircle" size={14} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              Tu plan Estándar incluye <strong style={{ color: 'var(--u-text-2)' }}>{ESTANDAR_MAX_ORDER_TYPES} de los 3 modos</strong> — tú eliges cuáles,
              y cambiarlos no altera tu precio de {planPriceLabel(pricing, 'ESTANDAR')}. Para tener los tres a la vez,
              cambia a <strong style={{ color: 'var(--brand-accent-ink)' }}>Premium ({planPriceLabel(pricing, 'PREMIUM')})</strong>.{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--brand-accent-ink)', fontWeight: 700, textDecoration: 'none' }}>Actualizar →</a>
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
                    background: 'rgba(var(--brand-accent-rgb,99,102,241),0.15)', color: 'var(--brand-accent-ink)',
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
                {isLast && (
                  <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="helpCircle" size={12} /> Es tu único modo activo: no se puede apagar.
                  </div>
                )}
                {on && m.configHref && (
                  <a href={m.configHref} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
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
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 13 }}>
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
                  const active = isModuleActive(modules, localSettings, m.key);
                  return (
                    <ManagedCard
                      key={m.key}
                      m={m}
                      active={active}
                      supportHref={supportHref}
                      priceNote={modulePriceNote(planActual, m.key)}
                    />
                  );
                }
                const on = localSettings[m.key]?.enabled !== false; // defaults ON para módulos habilitados
                const busy = busyKey === m.key && isPending;
                return (
                  <SelfServiceCard
                    key={m.key}
                    m={m}
                    on={on}
                    busy={busy}
                    onToggle={(next) => toggle(m.key, next)}
                    priceNote={modulePriceNote(planActual, m.key)}
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
          style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid rgba(var(--brand-accent-rgb, 99,102,241),0.3)', borderRadius: 99, flexShrink: 0 }}>
          Hablar con Leogin <Icon name="arrowRight" size={13} />
        </a>
      </Card>
    </div>
  );
}
