'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
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
import { ADDON_MODULES, INCLUDED_MODULES, type PlanCode } from '@/lib/plans';
import type { OrderType } from '@/lib/theme/defaults';

/** Nota de precio para un módulo según si el plan actual lo incluye gratis. */
function modulePriceNote(plan: string | null | undefined, key: ActivatableModuleKey): string {
  const p = (plan ?? 'BASICO') as PlanCode;
  const included = INCLUDED_MODULES[p]?.includes(key);
  if (included) return 'Incluido en tu plan';
  const addon = ADDON_MODULES[key];
  return `Q${addon.price}/mes a la carta`;
}

/** Canal de servicio para efectos de precio/UI. "local" agrupa comer en el
   restaurante (mesa con QR) y para llevar en mostrador: son la misma idea de
   "vienen a mi local", así que cuentan como un solo canal (ver mig. 064). */
type Channel = 'local' | 'delivery';

const CHANNEL_META: { id: Channel; label: string; description: string; icon: string; configHref?: string; types: OrderType[] }[] = [
  {
    id: 'local',
    label: 'Comer en local y para llevar',
    description: 'El cliente pide desde la mesa con QR o para retirar en el mostrador. Requiere configurar el número de mesas.',
    icon: 'utensils',
    configHref: '/admin/mesas',
    types: ['dine_in', 'pickup'],
  },
  {
    id: 'delivery',
    label: 'Pedidos a domicilio',
    description: 'El cliente ingresa su dirección y el pedido se entrega donde está. Puedes definir zonas y costo de envío.',
    icon: 'truck',
    configHref: '/admin/personalizacion',
    types: ['delivery'],
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
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={label}
      className="press"
      style={{
        width: 46, height: 26, borderRadius: 999, flexShrink: 0,
        background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 10%, transparent)',
        boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,0.18)',
        border: 'none', cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 200ms', opacity: (busy || disabled) ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', width: 20, height: 20, borderRadius: 999,
        background: '#fff', boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
        top: 3, left: on ? 23 : 3,
        transition: 'left 180ms ease',
      }} />
    </button>
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
    <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
    </Glass>
  );
}

/** Tarjeta self-service: toggle libre. */
function SelfServiceCard({ m, on, busy, onToggle, priceNote }: { m: ModuleMeta; on: boolean; busy: boolean; onToggle: (next: boolean) => void; priceNote: string }) {
  return (
    <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
    </Glass>
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

export default function ModulesPanel({ restaurantId, modules, settings, orderTypes, supportWhatsapp, planActual }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Estado local para modos de pedido (optimistic).
  const [localOrderTypes, setLocalOrderTypes] = useState<OrderType[]>(orderTypes);
  const [orderBusy, setOrderBusy] = useState<Channel | null>(null);

  // Estándar: el paquete (canales) se fija en el registro y solo lo cambia
  // Leogin. El dueño ve sus canales como incluidos (no editables).
  const isEstandar = planActual === 'ESTANDAR';
  const isBasico = planActual === 'BASICO';
  const isDeliveryBundle = localOrderTypes.includes('delivery');
  const estandarBundleLabel = isDeliveryBundle ? 'Solo Delivery' : 'Local';

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

  function toggleChannel(channel: typeof CHANNEL_META[number]) {
    const isOn = channel.types.some((t) => localOrderTypes.includes(t));
    const next = isOn
      ? localOrderTypes.filter((t) => !channel.types.includes(t))
      : [...new Set([...localOrderTypes, ...channel.types])];

    if (next.length === 0) {
      setError('Debe haber al menos un canal de servicio activo.');
      return;
    }
    setError(null);
    setLocalOrderTypes(next);
    setOrderBusy(channel.id);
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
    : '/admin/soporte';

  // Módulos visibles en el panel (oculta los gestionados que no requieren setup).
  const visible = ACTIVATABLE_MODULES.filter((m) => showsInPanel(modules, m.key));
  const activeCount = ACTIVATABLE_MODULES.filter((m) => isModuleActive(modules, settings, m.key)).length;
  const selfCount = visible.filter((m) => !m.requiresSetup).length;
  const selfActive = visible.filter((m) => !m.requiresSetup && settings[m.key]?.enabled !== false).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

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
              Activa pedidos para llevar desde <strong style={{ color: 'var(--brand-accent)' }}>Estándar (Q399/mes)</strong>.{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--brand-accent)', fontWeight: 700, textDecoration: 'none' }}>Actualizar →</a>
            </p>
          </div>
        )}
        {isEstandar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'rgba(var(--brand-accent-rgb,99,102,241),0.07)', border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.18)', marginBottom: 12 }}>
            <Icon name="alertCircle" size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              Tu plan Estándar incluye el paquete <strong style={{ color: 'var(--u-text-2)' }}>{estandarBundleLabel}</strong>.
              Para combinar delivery y local en un mismo menú, cambia a <strong style={{ color: 'var(--brand-accent)' }}>Premium (Q749/mes)</strong>.{' '}
              <a href="/admin/suscripcion" style={{ color: 'var(--brand-accent)', fontWeight: 700, textDecoration: 'none' }}>Actualizar →</a>
            </p>
          </div>
        )}
        {(planActual === 'PREMIUM' || planActual === 'PRO') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', marginBottom: 12 }}>
            <Icon name="sparkle" size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
            <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--u-text-2)' }}>Plan a tu medida:</strong> desactiva un canal que no uses y baja tu
              mensualidad Q100. Pagas solo por lo que usas.{' '}
              <a href="/admin/suscripcion" style={{ color: '#4ade80', fontWeight: 700, textDecoration: 'none' }}>Ver mi mensualidad →</a>
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {CHANNEL_META.map((m) => {
            const on = m.types.some((t) => localOrderTypes.includes(t));
            // BASICO: solo el canal local (para llevar, sin mesas). ESTANDAR:
            // solo los canales de su paquete (los demás se ofrecen como mejora a Premium).
            const lockedPremium = isBasico ? m.id !== 'local' : isEstandar ? !on : false;
            // ESTANDAR: los canales incluidos no son editables por el dueño.
            const readOnly = isEstandar && on;
            const busy = orderBusy === m.id && isPending;
            const activeChannels = CHANNEL_META.filter((c) => c.types.some((t) => localOrderTypes.includes(t)));
            const isLast = activeChannels.length === 1 && on;

            if (lockedPremium) {
              return (
                <Glass key={m.id} variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, opacity: 0.6, position: 'relative', overflow: 'hidden' }}>
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
                      <Icon name={m.icon} size={20} />
                    </span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-3)' }}>{m.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <Icon name="key" size={11} style={{ color: 'var(--u-text-4)' }} />
                        <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>Requiere Premium</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, margin: 0 }}>{m.description}</p>
                </Glass>
              );
            }

            return (
              <Glass key={m.id} variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      <StatusDot on={on} label={readOnly ? 'Incluido en tu plan' : on ? 'Activo' : 'Inactivo'} />
                    </div>
                  </div>
                  <Toggle
                    on={on}
                    busy={busy}
                    disabled={isLast || readOnly}
                    onClick={() => { if (!readOnly) toggleChannel(m); }}
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
              </Glass>
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
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
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
                      priceNote={modulePriceNote(planActual, m.key)}
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
                    priceNote={modulePriceNote(planActual, m.key)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Nota multi-sucursal (en vez de "mejorar plan") */}
      <Glass variant="quiet" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--u-text-3)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="grid" size={18} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          <span>¿Tienes varias sucursales? Únelas en un panel de grupo con métricas consolidadas.</span>
        </div>
        <a href="/admin/soporte" className="press"
          style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid rgba(var(--brand-accent-rgb, 99,102,241),0.3)', borderRadius: 99, flexShrink: 0 }}>
          Hablar con Leogin <Icon name="arrowRight" size={13} />
        </a>
      </Glass>
    </div>
  );
}
