'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { saveOrdersAndCurrency } from '@/lib/actions/restaurant';
import type { ThemeConfig } from '@/lib/theme/defaults';

type Patch = Pick<ThemeConfig,
  'orderTypes' | 'dineInTableCount' | 'dineInCourseOptions' |
  'tipEnabled' | 'tipPercent' | 'acceptsCard' |
  'currencySymbol' | 'currencyPosition' | 'locale' | 'animations' |
  'kdsYellowMin' | 'kdsRedMin' | 'kdsConfirmFirst' |
  'autoConfirmEnabled' | 'autoConfirmMinutes'
>;

interface Props {
  restaurantId: string;
  config: Patch;
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function NumberCtl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
      <input
        type="number" inputMode="decimal"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min));
          onChange(n);
        }}
        style={{ ...inputStyle, width: 70, textAlign: 'center', padding: '6px 8px', fontSize: 14 }}
      />
    </div>
  );
}

function StringListCtl({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text-2)', padding: '7px 10px', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair)' }}>
              {item}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="press"
              style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', flexShrink: 0 }}
            >
              Quitar
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="Nueva preferencia…"
            style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: 13 }}
          />
          <button
            type="button"
            onClick={add}
            className="press"
            style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-2)', flexShrink: 0 }}
          >
            Agregar
          </button>
        </div>
      </div>
    </Field>
  );
}

function ReadOnly({ label, value }: { label: string; value: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: 0.55 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
      <div style={{ width: 42, height: 25, borderRadius: 99, padding: 3, background: value ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)', display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start', flexShrink: 0, cursor: 'not-allowed' }}>
        <span style={{ width: 19, height: 19, borderRadius: 99, background: value ? 'var(--brand-bg)' : 'var(--u-text)' }} />
      </div>
    </div>
  );
}

function toggleIn<T>(arr: T[], val: T, on: boolean): T[] {
  const has = arr.includes(val);
  if (on && !has) return [...arr, val];
  if (!on && has) return arr.filter((x) => x !== val);
  return arr;
}

export default function OrdersCurrencyEditor({ restaurantId, config: initial }: Props) {
  const [patch, setPatch] = useState<Patch>(initial);
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof Patch>(k: K, v: Patch[K]) {
    setPatch((p) => ({ ...p, [k]: v }));
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveOrdersAndCurrency({ restaurantId, patch });
      if (res.error) setMsg(`Error: ${res.error}`);
      else setMsg('Guardado ✓');
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="t-kicker" style={{ fontSize: 10.5 }}>Tipos de pedido</div>

      <Toggle label="Comer en local" value={patch.orderTypes.includes('dine_in')} onChange={(v) => set('orderTypes', toggleIn(patch.orderTypes, 'dine_in', v))} />
      {patch.orderTypes.includes('dine_in') && (
        <>
          <NumberCtl label="Cantidad de mesas" value={patch.dineInTableCount} min={1} max={50} onChange={(v) => set('dineInTableCount', v)} />
          <StringListCtl label="Preferencias de servicio" items={patch.dineInCourseOptions} onChange={(v) => set('dineInCourseOptions', v)} />
          <Toggle label="Habilitar propina" value={patch.tipEnabled} onChange={(v) => set('tipEnabled', v)} />
          {patch.tipEnabled && (
            <>
              <NumberCtl label="Porcentaje de propina (%)" value={patch.tipPercent} min={1} max={50} onChange={(v) => set('tipPercent', v)} />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
                Se agrega automáticamente al total del comensal (no puede quitarla).
              </p>
            </>
          )}
        </>
      )}
      <ReadOnly label="Domicilio" value={patch.orderTypes.includes('delivery')} />
      <ReadOnly label="Para llevar" value={patch.orderTypes.includes('pickup')} />
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
        Domicilio y Para llevar solo se activan desde el panel Leogin.
      </p>
      <Toggle label="Aceptar pago con tarjeta" value={patch.acceptsCard} onChange={(v) => set('acceptsCard', v)} />

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Confirmación automática</div>
      <Toggle label="Confirmar pedidos automáticamente" value={patch.autoConfirmEnabled} onChange={(v) => set('autoConfirmEnabled', v)} />
      {patch.autoConfirmEnabled && (
        <>
          <NumberCtl label="Confirmar después de (min)" value={patch.autoConfirmMinutes} min={1} max={60} onChange={(v) => set('autoConfirmMinutes', v)} />
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
            Los pedidos nuevos pasan a &ldquo;En preparación&rdquo; automáticamente si nadie los confirma antes.
          </p>
        </>
      )}

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Cocina (KDS)</div>
      <Toggle
        label="Pedidos solo al confirmar"
        value={patch.kdsConfirmFirst}
        onChange={(v) => set('kdsConfirmFirst', v)}
      />
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -6 }}>
        {patch.kdsConfirmFirst
          ? 'Los pedidos llegan a la pantalla de cocina solo después de que el admin los confirme en el panel de pedidos.'
          : 'Los pedidos aparecen en cocina en cuanto el cliente los envía (comportamiento clásico).'}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 4, borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
        Semáforo: minutos de espera para cambiar de color. 🟢 a tiempo · 🟡 apúrate · 🔴 tarde.
      </p>
      <NumberCtl label="Pasar a ámbar a los (min)" value={patch.kdsYellowMin} min={1} max={120} onChange={(v) => set('kdsYellowMin', Math.min(v, patch.kdsRedMin - 1))} />
      <NumberCtl label="Pasar a rojo a los (min)" value={patch.kdsRedMin} min={2} max={240} onChange={(v) => set('kdsRedMin', Math.max(v, patch.kdsYellowMin + 1))} />

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Moneda y formato</div>
      <Field label="Símbolo de moneda">
        <input type="text" value={patch.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} style={{ ...inputStyle, maxWidth: 100 }} />
      </Field>
      <Field label="Posición del símbolo">
        <div style={{ display: 'flex', gap: 6 }}>
          {(['prefix', 'suffix'] as const).map((val) => {
            const on = patch.currencyPosition === val;
            return (
              <Button key={val} type="button" onClick={() => set('currencyPosition', val)} variant={on ? 'primary' : 'secondary'} size="sm" className="rounded-adm-full">
                {val === 'prefix' ? 'Antes (Q10)' : 'Después (10Q)'}
              </Button>
            );
          })}
        </div>
      </Field>
      <Field label="Locale (formato de números)">
        <input type="text" value={patch.locale} onChange={(e) => set('locale', e.target.value)} placeholder="es-GT" style={{ ...inputStyle, maxWidth: 140 }} />
      </Field>

      <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
        <Toggle label="Animaciones" value={patch.animations} onChange={(v) => set('animations', v)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <Button onClick={save} disabled={isPending} className="rounded-adm-full">
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
      </div>
    </Card>
  );
}
