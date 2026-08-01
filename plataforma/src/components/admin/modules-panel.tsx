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
import { whenChangeApplies, chargeLabel } from '@/lib/billing-timing';
import type { OrderType } from '@/lib/theme/defaults';

const q = (n: number) => 'Q' + Math.round(n).toLocaleString('es-GT');

/** ¿El plan incluye este módulo sin costo extra? */
function includedInPlan(plan: string | null | undefined, key: ActivatableModuleKey): boolean {
  return INCLUDED_MODULES[(plan ?? 'BASICO') as PlanCode]?.includes(key) ?? false;
}

/**
 * Qué le cuesta al dueño este módulo, dicho en su idioma.
 *
 * El cambio importante frente a la versión anterior está en el caso
 * "incluido": antes solo decía "Incluido en tu plan" y, justo al lado, los
 * módulos de pago decían "si lo apagas deja de cobrarse". El dueño aprendía
 * "apagar = ahorrar" y lo aplicaba también a los incluidos, donde apagar no
 * ahorra ni un quetzal. Ahora se dice explícitamente.
 */
function modulePriceNote(
  pricing: PlanPricing,
  plan: string | null | undefined,
  key: ActivatableModuleKey,
  on: boolean,
  chargeMonth: string,
): { title: string; detail: string; free: boolean } {
  if (includedInPlan(plan, key)) {
    return {
      title: 'Incluido en tu plan',
      detail: 'Apagarlo solo lo esconde del panel — tu mensualidad no cambia.',
      free: true,
    };
  }
  const price = pricing.modulePrices[key] ?? 0;
  return on
    ? { title: `${q(price)} al mes`, detail: `Si lo apagas, deja de cobrarse en ${chargeMonth}.`, free: false }
    : { title: `${q(price)} al mes si lo enciendes`, detail: 'Apagado no se cobra.', free: false };
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
  /** Mensualidad que se está facturando AHORA (con la regla antiabuso aplicada). */
  billedNow?: number | null;
  /** Lo que facturará el motor de cobro el mes que viene si todo queda como está. */
  nextPeriodFee?: number | null;
  /** Descuento por volumen de sucursales, para que el simulador cuadre con el cobro real. */
  branchDiscountPct?: number;
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

/** Tarjeta "esto lo pierdes por tu plan" — no vendible a la carta (todo el panel) o
   módulo a la carta que no tienes activo todavía. Siempre visible, nunca se oculta. */
function LockedPlanCard({ icon, label, description, priceNote, badge = 'PREMIUM', lockLabel = 'No incluido en tu plan' }: { icon: string; label: string; description: string; priceNote: string; badge?: string; lockLabel?: string }) {
  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden p-4.5" style={{ opacity: 0.65 }}>
      {/* El distintivo era el literal "PREMIUM" para todas las tarjetas, incluidas
         las de módulos que se compran sueltos sobre cualquier plan — decía
         "necesitas Premium" cuando en realidad bastaba con añadir el módulo. */}
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
            description="Estadísticas avanzadas, control de inventario y costos, y personal con roles."
            priceNote={`Incluido en Premium (${premiumLabel})`}
          />
        )}
        {missingAddons.map((m) => (
          <LockedPlanCard
            key={m.key}
            icon={m.icon}
            label={m.label}
            description={m.description}
            // Estos SÍ se pueden añadir sobre el plan actual: el distintivo
            // "PREMIUM" hacía creer que había que cambiar de plan.
            badge="A LA CARTA"
            lockLabel="Se añade a tu plan"
            priceNote={`${q(pricing.modulePrices[m.key] ?? 0)} al mes sobre tu plan · o gratis con Premium`}
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

/* ── Mensualidad en vivo ───────────────────────────────────────
   La pieza que faltaba. Antes el dueño tocaba interruptores y no
   veía NADA sobre su precio: para enterarse tenía que irse a
   /admin/suscripcion, y aun ahí el número solo reflejaba lo ya
   facturado. Toda la explicación del cobro estaba en un párrafo
   de 60 palabras sobre "el 75% de los días del mes".

   Aquí se invierte: en vez de explicar la regla, se enseña el
   resultado — cuánto pagas hoy, cuánto vas a pagar con lo que
   acabas de encender/apagar, y desde qué cobro. */

interface BillLine { label: string; amount: number; kind: 'base' | 'discount' | 'addon' }

/**
 * Aquí conviven TRES cifras que antes se confundían en una sola:
 *
 *  · billedNow      — lo que se cobra este mes. Ya está decidido.
 *  · nextPeriodFee  — lo que cobrará el mes que viene si nada cambia. Lo
 *                     calcula el propio motor de cobro (no se estima aquí),
 *                     así que ya incorpora los cambios hechos DÍAS ATRÁS y su
 *                     regla del 75%.
 *  · total (vivo)   — lo que daría la configuración que el dueño está tocando
 *                     ahora mismo, para que el número se mueva con el dedo.
 *
 * Mezclarlas era justo lo que hacía incomprensible la pantalla: el dueño
 * apagaba algo, no veía cambiar nada, y el único texto disponible le hablaba
 * de porcentajes del ciclo.
 */
function LiveBillCard({
  planCode, lines, total, billedNow, nextPeriodFee, timing,
}: {
  planCode: PlanCode;
  lines: BillLine[];
  total: number;
  billedNow: number | null;
  nextPeriodFee: number | null;
  timing: ReturnType<typeof whenChangeApplies>;
}) {
  const r = (n: number) => Math.round(n);
  // ¿El dueño acaba de tocar algo que aún no está reflejado en la proyección?
  const simulating = nextPeriodFee != null && r(nextPeriodFee) !== r(total);
  const projected = nextPeriodFee ?? total;
  const changes = billedNow != null && r(projected) !== r(billedNow);
  const cheaper = changes && projected < (billedNow ?? 0);

  return (
    <Card className="p-4.5" style={{ border: changes ? '1px solid var(--c-warn-line)' : '1px solid var(--u-hair-2)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>
            Tu mensualidad de este mes
          </div>
          <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 800, fontSize: 30, color: 'var(--u-text)', lineHeight: 1.1, marginTop: 4 }}>
            {billedNow != null ? q(billedNow) : q(total)}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-4)', fontFamily: 'var(--font-sans)' }}> / mes</span>
          </div>
        </div>
        <a href="/admin/suscripcion" className="press"
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          Ver mi suscripción <Icon name="arrowRight" size={12} />
        </a>
      </div>

      {/* Lo que viene, si deja las cosas como están. */}
      {changes && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)',
          background: cheaper ? 'var(--c-ok-bg)' : 'var(--c-warn-bg)',
          border: `1px solid ${cheaper ? 'var(--c-ok-line)' : 'var(--c-warn-line)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Icon name={cheaper ? 'sparkle' : 'clock'} size={13} style={{ color: cheaper ? 'var(--c-ok)' : 'var(--c-warn)' }} />
            <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>
              {simulating ? 'Con lo que acabas de cambiar pagarías' : 'Tu próximo cobro será'}
            </span>
            <strong style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 17, fontWeight: 800, color: cheaper ? 'var(--c-ok)' : 'var(--u-text)' }}>
              {q(simulating ? total : projected)}
            </strong>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
          Cómo se arma
        </div>
        {lines.map((l, i) => (
          <div key={`${l.label}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
            <span style={{ color: 'var(--u-text-3)' }}>{l.label}</span>
            <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 600, color: l.kind === 'discount' ? 'var(--c-ok)' : 'var(--u-text-2)' }}>
              {l.kind === 'discount' ? `− ${q(Math.abs(l.amount))}` : l.kind === 'addon' ? `+ ${q(l.amount)}` : q(l.amount)}
            </span>
          </div>
        ))}
      </div>

      {/* En vez del párrafo del 75%: una fecha concreta. */}
      <div style={{
        marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <Icon name="clock" size={13} style={{ color: 'var(--u-text-4)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
          Lo que enciendas o apagues <strong style={{ color: 'var(--u-text-2)' }}>hoy</strong> se refleja en{' '}
          <strong style={{ color: 'var(--u-text-2)' }}>{chargeLabel(timing)}</strong>; el cobro de este mes ya no cambia.
          {timing.nextCycle && timing.daysLeftToMakeIt > 0 && (
            <> Te quedan {timing.daysLeftToMakeIt} día{timing.daysLeftToMakeIt !== 1 ? 's' : ''} para que entre en ese cobro; después pasaría al siguiente.</>
          )}
        </p>
      </div>
      <p style={{ fontSize: 11, color: 'var(--u-text-4)', margin: '8px 0 0', lineHeight: 1.45 }}>
        Plan {PLANS[planCode].name}. Es tu precio automático; si tienes un precio acordado con Leogin, manda ese.
      </p>
    </Card>
  );
}

export default function ModulesPanel({ restaurantId, modules, settings, orderTypes, supportWhatsapp, planActual, channelDiscountPer = 50, channelDiscountMax = 2, billedNow = null, nextPeriodFee = null, branchDiscountPct = 0 }: Props) {
  const router = useRouter();
  const pricing = usePlanPricing();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Estado local para modos de pedido (optimistic).
  const [localOrderTypes, setLocalOrderTypes] = useState<OrderType[]>(orderTypes);
  const [orderBusy, setOrderBusy] = useState<OrderType | null>(null);
  const [localSettings, setLocalSettings] = useState<ModuleSettings>(settings);

  // Momento en que un cambio hecho AHORA se nota en el cobro. Se calcula una
  // vez por render para que todas las frases de la pantalla digan la misma
  // fecha (antes cada texto repetía a su manera la regla del 75%).
  const timing = whenChangeApplies();
  const chargeMonth = chargeLabel(timing);

  // Estándar: el dueño elige libremente sus modos de pedido, con tope de
  // ESTANDAR_MAX_ORDER_TYPES (2 de 3) — el 3ero requiere subir a Premium.
  const isEstandar = planActual === 'ESTANDAR';
  const isBasico = planActual === 'BASICO';

  function toggle(key: ActivatableModuleKey, next: boolean) {
    setError(null);
    setBusyKey(key);
    // Optimista: la mensualidad en vivo debe moverse en el mismo gesto. Si el
    // servidor rechaza, se revierte.
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

  /* ── Simulador de mensualidad ────────────────────────────────
     Réplica exacta de leogin_compute_monthly_fee (mig. 078) sobre el
     estado que el dueño está viendo AHORA. Si cambias la fórmula en
     SQL, cámbiala aquí: el número que se enseña y el que se factura
     tienen que salir igual o se pierde la confianza entera. */
  const hasChannelDiscount = PLANS[currentPlan].hasChannelDiscount;
  const base = pricing.prices[currentPlan] ?? 0;
  const channelsOffLive = Math.max(0, CHANNEL_META.length - localOrderTypes.length);
  const discountedChannels = hasChannelDiscount ? Math.min(channelsOffLive, channelDiscountMax) : 0;
  const channelDiscount = discountedChannels * channelDiscountPer;

  const billedAddons = ACTIVATABLE_MODULES.filter(
    (m) =>
      modules?.[m.key] === true &&                    // Leogin lo habilitó
      !includedInPlan(currentPlan, m.key) &&          // el plan no lo trae gratis
      localSettings[m.key]?.enabled !== false,        // y el dueño lo tiene encendido
  );

  const planNet = Math.max(base - channelDiscount, 0) * (1 - branchDiscountPct);
  const addonTotal = billedAddons.reduce((s, m) => s + (pricing.modulePrices[m.key] ?? 0), 0);
  const liveTotal = Math.round(planNet + addonTotal);

  const offChannelLabels = CHANNEL_META
    .filter((c) => !localOrderTypes.includes(c.id))
    .slice(0, discountedChannels)
    .map((c) => c.label);

  const billLines: BillLine[] = [
    { label: `Plan ${PLANS[currentPlan].name}`, amount: base, kind: 'base' },
    ...offChannelLabels.map((label): BillLine => ({ label: `${label} apagado`, amount: channelDiscountPer, kind: 'discount' })),
    ...(branchDiscountPct > 0
      ? [{ label: `Descuento por sucursales (${Math.round(branchDiscountPct * 100)}%)`, amount: Math.round((base - channelDiscount) * branchDiscountPct), kind: 'discount' as const }]
      : []),
    ...billedAddons.map((m): BillLine => ({ label: m.label, amount: pricing.modulePrices[m.key] ?? 0, kind: 'addon' })),
  ];

  /**
   * Qué le pasa al precio si el dueño toca ESTE método de pedido.
   *
   * Se calcula simulando el cambio y comparando descuentos, en vez de
   * afirmar "cada método apagado son −Q50": con el tope de 2 de 3, el
   * tercero no descuenta nada y la frase genérica mentía.
   */
  function channelDelta(id: OrderType): string | null {
    if (!hasChannelDiscount) return null;
    const on = localOrderTypes.includes(id);
    if (on && localOrderTypes.length === 1) return null; // el último no se puede apagar

    const nextOff = on ? channelsOffLive + 1 : channelsOffLive - 1;
    const nextDiscount = Math.min(Math.max(nextOff, 0), channelDiscountMax) * channelDiscountPer;
    const delta = nextDiscount - channelDiscount; // + = ahorra más, − = ahorra menos

    if (delta === 0) {
      return on
        ? `Apagarlo no baja tu precio: el descuento ya llegó a su tope de ${q(channelDiscountMax * channelDiscountPer)}.`
        : 'Encenderlo no sube tu precio.';
    }
    return on
      ? `Apagarlo: −${q(delta)} al mes`
      : `Encenderlo: +${q(Math.abs(delta))} al mes`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* La mensualidad va ARRIBA del todo: es la consecuencia de cada
         interruptor de esta pantalla y antes no se veía por ningún lado. */}
      <LiveBillCard
        planCode={currentPlan}
        lines={billLines}
        total={liveTotal}
        billedNow={billedNow}
        nextPeriodFee={nextPeriodFee}
        timing={timing}
      />

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
        {/* Premium/Pro: aquí SÍ hay ahorro. Una frase; el detalle lo lleva la
           tarjeta de mensualidad y cada tarjeta dice su propio efecto. */}
        {hasChannelDiscount && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'var(--c-ok-bg)', border: '1px solid var(--c-ok-line)', marginBottom: 12 }}>
            <Icon name="sparkle" size={14} style={{ color: 'var(--c-ok)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--u-text-2)' }}>Pagas solo por lo que usas:</strong> si no ofreces alguno de estos
              modos, apágalo y tu mensualidad baja {q(channelDiscountPer)}. Puedes ahorrar hasta{' '}
              <strong style={{ color: 'var(--u-text-2)' }}>{q(channelDiscountMax * channelDiscountPer)}</strong> (siempre queda al menos un modo encendido).
              Cada tarjeta te dice cuánto cambia tu precio antes de tocarla.
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
                {/* El efecto en el precio, junto al interruptor que lo provoca.
                   Antes vivía en un párrafo aparte que hablaba de todos los
                   métodos a la vez y no decía qué pasaba con ESTE. */}
                {(() => {
                  const delta = channelDelta(m.id);
                  if (!delta) return null;
                  const saves = delta.startsWith('Apagarlo: −');
                  return (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: saves ? 'var(--c-ok)' : 'var(--u-text-4)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name={saves ? 'sparkle' : 'helpCircle'} size={12} />
                      {delta}
                    </div>
                  );
                })()}
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
                      priceNote={modulePriceNote(pricing, planActual, m.key, active, chargeMonth)}
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
                    priceNote={modulePriceNote(pricing, planActual, m.key, on, chargeMonth)}
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
