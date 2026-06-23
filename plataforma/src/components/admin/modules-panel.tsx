'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { setModuleEnabled } from '@/lib/actions/modules';
import {
  ACTIVATABLE_MODULES,
  isEntitled,
  isTurnedOn,
  type ActivatableModuleKey,
  type ModulesMap,
  type ModuleSettings,
} from '@/lib/modules';

interface Props {
  restaurantId: string;
  modules: ModulesMap;
  settings: ModuleSettings;
}

export default function ModulesPanel({ restaurantId, modules, settings }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'var(--u-text-3)' }}>
        Activa o desactiva los módulos disponibles en tu plan. Los módulos bloqueados los habilita Leogin;
        si te interesa alguno, contáctanos.
      </p>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {ACTIVATABLE_MODULES.map((m) => {
          const entitled = isEntitled(modules, m.key);
          const on = isTurnedOn(settings, m.key);
          const busy = busyKey === m.key && isPending;
          return (
            <Glass key={m.key} variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, opacity: entitled ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', flexShrink: 0, color: entitled && on ? 'var(--brand-accent)' : 'var(--u-text-3)' }}>
                    <Icon name={m.icon} size={18} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>{m.label}</div>
                    {entitled ? (
                      <div style={{ fontSize: 11.5, color: on ? '#4ade80' : 'var(--u-text-4)', fontWeight: 600, marginTop: 1 }}>
                        {on ? '● Activo' : '○ Inactivo'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="key" size={11} /> No incluido en tu plan
                      </div>
                    )}
                  </div>
                </div>

                {/* Toggle / candado */}
                {entitled ? (
                  <button
                    type="button"
                    onClick={() => toggle(m.key, !on)}
                    disabled={busy}
                    aria-label={`${on ? 'Desactivar' : 'Activar'} ${m.label}`}
                    className="press"
                    style={{
                      width: 44, height: 26, borderRadius: 999, flexShrink: 0, padding: 3,
                      background: on ? 'var(--brand-accent)' : 'rgba(255,255,255,0.12)',
                      border: 'none', cursor: busy ? 'wait' : 'pointer',
                      display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
                      transition: 'background 180ms', opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </button>
                ) : (
                  <span style={{ width: 44, height: 26, borderRadius: 999, flexShrink: 0, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', color: 'var(--u-text-4)' }}>
                    <Icon name="key" size={13} />
                  </span>
                )}
              </div>

              <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.45, margin: 0 }}>{m.description}</p>

              {entitled && on && (
                <a href={m.href} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  Abrir {m.navLabel} <Icon name="arrowRight" size={13} />
                </a>
              )}
            </Glass>
          );
        })}
      </div>
    </div>
  );
}
