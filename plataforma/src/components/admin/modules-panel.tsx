'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { setModuleEnabled } from '@/lib/actions/modules';
import { updateOwnOrderTypes } from '@/lib/actions/restaurant';
import {
  ACTIVATABLE_MODULES,
  isEntitled,
  isTurnedOn,
  type ActivatableModuleKey,
  type ModuleMeta,
  type ModulesMap,
  type ModuleSettings,
} from '@/lib/modules';
import type { OrderType } from '@/lib/theme/defaults';

const ORDER_TYPE_META: { id: OrderType; label: string; description: string; icon: string; configHref?: string }[] = [
  {
    id: 'dine_in',
    label: 'Comer en local',
    description: 'Los clientes escanean el QR de su mesa y hacen el pedido desde ahí. Requiere configurar el número de mesas.',
    icon: 'utensils',
    configHref: '/admin/mesas',
  },
  {
    id: 'delivery',
    label: 'Pedidos a domicilio',
    description: 'El cliente ingresa su dirección y el pedido se entrega donde está. Puedes definir zonas y costo de envío.',
    icon: 'truck',
    configHref: '/admin/personalizacion',
  },
  {
    id: 'pickup',
    label: 'Para llevar',
    description: 'El cliente hace su pedido en línea y lo retira en el local. Sin costo de envío ni dirección requerida.',
    icon: 'bag',
  },
];

interface Props {
  restaurantId: string;
  modules: ModulesMap;
  settings: ModuleSettings;
  orderTypes: OrderType[];
}

const BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  POPULAR: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  NUEVO: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
};

function Badge({ label }: { label: string }) {
  const style = BADGE_COLOR[label] ?? { bg: 'rgba(255,255,255,0.08)', color: 'var(--u-text-3)' };
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99, background: style.bg, color: style.color }}>
      {label}
    </span>
  );
}

function ModuleCard({
  m, entitled, on, busy,
  onToggle,
}: {
  m: ModuleMeta;
  entitled: boolean;
  on: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const iconColor = entitled && on ? 'var(--brand-accent)' : entitled ? 'var(--u-text-2)' : 'var(--u-text-4)';

  return (
    <Glass
      variant="quiet"
      style={{
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: entitled ? 1 : 0.65,
        transition: 'opacity 200ms',
      }}
    >
      {/* Header: icono + nombre + badge + toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: entitled && on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)' : 'rgba(255,255,255,0.06)',
            display: 'grid', placeItems: 'center', color: iconColor,
            border: `1px solid ${entitled && on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.2)' : 'transparent'}`,
          }}>
            <Icon name={m.icon} size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</span>
              {m.badge && <Badge label={m.badge} />}
            </div>
            {entitled ? (
              <div style={{ fontSize: 11, color: on ? '#4ade80' : 'var(--u-text-4)', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: on ? '#4ade80' : 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
                {on ? 'Activo' : 'Inactivo'}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="key" size={10} /> No disponible en tu plan
              </div>
            )}
          </div>
        </div>

        {/* Toggle o candado */}
        {entitled ? (
          <button
            type="button"
            onClick={() => onToggle(!on)}
            disabled={busy}
            aria-label={`${on ? 'Desactivar' : 'Activar'} ${m.label}`}
            className="press"
            style={{
              width: 46, height: 26, borderRadius: 999, flexShrink: 0, padding: 3,
              background: on ? 'var(--brand-accent)' : 'rgba(255,255,255,0.1)',
              border: 'none', cursor: busy ? 'wait' : 'pointer',
              display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
              transition: 'background 200ms', opacity: busy ? 0.5 : 1,
            }}
          >
            <span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transition: 'transform 200ms' }} />
          </button>
        ) : (
          <a
            href="/admin/suscripcion"
            title="Ver planes"
            style={{ width: 46, height: 26, borderRadius: 999, flexShrink: 0, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', color: 'var(--u-text-4)', textDecoration: 'none' }}
          >
            <Icon name="key" size={13} />
          </a>
        )}
      </div>

      {/* Descripción */}
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, margin: 0 }}>
        {m.description}
      </p>

      {/* Acciones */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        {entitled && on && m.href ? (
          <a
            href={m.href}
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Abrir {m.navLabel ?? m.label} <Icon name="arrowRight" size={13} />
          </a>
        ) : !entitled ? (
          <a
            href="/admin/suscripcion"
            style={{ fontSize: 12, color: 'var(--u-text-4)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            Ver planes <Icon name="arrowRight" size={12} />
          </a>
        ) : (
          <span />
        )}
      </div>
    </Glass>
  );
}

export default function ModulesPanel({ restaurantId, modules, settings, orderTypes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Estado local para modos de pedido (optimistic)
  const [localOrderTypes, setLocalOrderTypes] = useState<OrderType[]>(orderTypes);
  const [orderBusy, setOrderBusy] = useState<OrderType | null>(null);

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

  function toggleOrderType(id: OrderType) {
    const isOn = localOrderTypes.includes(id);
    const next = isOn
      ? localOrderTypes.filter((t) => t !== id)
      : [...localOrderTypes, id];

    if (next.length === 0) {
      setError('Debe haber al menos un modo de pedido activo.');
      return;
    }
    setError(null);
    setLocalOrderTypes(next);
    setOrderBusy(id);
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

  const activeCount = ACTIVATABLE_MODULES.filter(
    (m) => isEntitled(modules, m.key) && isTurnedOn(settings, m.key),
  ).length;
  const entitledCount = ACTIVATABLE_MODULES.filter((m) => isEntitled(modules, m.key)).length;

  const sections = ['Operación', 'Negocio'] as const;
  const bySection = (sec: string) => ACTIVATABLE_MODULES.filter((m) => m.navSection === sec);

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {ORDER_TYPE_META.map((m) => {
            const on = localOrderTypes.includes(m.id);
            const busy = orderBusy === m.id && isPending;
            const isLast = localOrderTypes.length === 1 && on;
            return (
              <Glass key={m.id} variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.12)' : 'rgba(255,255,255,0.06)',
                      display: 'grid', placeItems: 'center',
                      color: on ? 'var(--brand-accent)' : 'var(--u-text-3)',
                      border: `1px solid ${on ? 'rgba(var(--brand-accent-rgb, 99,102,241),0.2)' : 'transparent'}`,
                    }}>
                      <Icon name={m.icon} size={20} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, color: on ? '#4ade80' : 'var(--u-text-4)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: on ? '#4ade80' : 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
                        {on ? 'Activo' : 'Inactivo'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleOrderType(m.id)}
                    disabled={busy || isLast}
                    title={isLast ? 'No puedes desactivar el único modo activo' : undefined}
                    className="press"
                    style={{
                      width: 46, height: 26, borderRadius: 999, flexShrink: 0, padding: 3,
                      background: on ? 'var(--brand-accent)' : 'rgba(255,255,255,0.1)',
                      border: 'none', cursor: (busy || isLast) ? 'not-allowed' : 'pointer',
                      display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
                      transition: 'background 200ms', opacity: (busy || isLast) ? 0.45 : 1,
                    }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                  </button>
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

      {/* ── Módulos activables ───────────────────────────────── */}
      {/* Resumen */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0 }}>
          {activeCount > 0
            ? <><strong style={{ color: 'var(--u-text)' }}>{activeCount} módulo{activeCount !== 1 ? 's' : ''}</strong> activo{activeCount !== 1 ? 's' : ''} · {entitledCount} disponibles en tu plan</>
            : 'Activa los módulos disponibles en tu plan o mejora para desbloquear más.'}
        </p>
        {entitledCount < ACTIVATABLE_MODULES.length && (
          <a
            href="/admin/suscripcion"
            className="press"
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid rgba(var(--brand-accent-rgb, 99,102,241),0.3)', borderRadius: 99, flexShrink: 0 }}
          >
            <Icon name="sparkle" size={13} /> Mejorar plan
          </a>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Secciones */}
      {sections.map((sec) => {
        const mods = bySection(sec);
        return (
          <div key={sec}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--u-text-4)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
              {sec}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {mods.map((m) => {
                const entitled = isEntitled(modules, m.key);
                const on = isTurnedOn(settings, m.key);
                const busy = busyKey === m.key && isPending;
                return (
                  <ModuleCard
                    key={m.key}
                    m={m}
                    entitled={entitled}
                    on={on}
                    busy={busy}
                    onToggle={(next) => toggle(m.key, next)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* CTA inferior si hay módulos bloqueados */}
      {entitledCount < ACTIVATABLE_MODULES.length && (
        <Glass variant="quiet" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--u-text-3)' }}>
            <strong style={{ color: 'var(--u-text)' }}>{ACTIVATABLE_MODULES.length - entitledCount} módulo{ACTIVATABLE_MODULES.length - entitledCount !== 1 ? 's' : ''}</strong> bloqueado{ACTIVATABLE_MODULES.length - entitledCount !== 1 ? 's' : ''}. Mejora tu plan para desbloquearlos.
          </div>
          <a href="/admin/suscripcion" className="press"
            style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--brand-accent)', borderRadius: 99, padding: '8px 18px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            Ver planes <Icon name="arrowRight" size={14} />
          </a>
        </Glass>
      )}
    </div>
  );
}
