'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { saveOrdersAndCurrency } from '@/lib/actions/restaurant';
import { ServicePreferencesCtl } from '@/components/admin/service-preferences-ctl';
import type { ThemeConfig } from '@/lib/theme/defaults';

type Patch = Pick<ThemeConfig,
  'orderTypes' | 'dineInTableCount' | 'dineInCourseOptions' |
  'tipEnabled' | 'tipPercent' | 'tipOrderTypes' | 'acceptsCard' |
  'currencySymbol' | 'currencyPosition' | 'locale' | 'animations' |
  'kdsYellowMin' | 'kdsRedMin' | 'kdsConfirmFirst' |
  'autoConfirmEnabled' | 'autoConfirmMinutes'
>;

const ORDER_TYPE_LABEL: Record<ThemeConfig['orderTypes'][number], string> = {
  dine_in: 'Comer en local',
  pickup: 'Para llevar',
  delivery: 'Domicilio',
};

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
      <div className="t-kicker" style={{ fontSize: 10.5 }}>Métodos de pago</div>

      <Toggle label="Pago con tarjeta" value={patch.acceptsCard} onChange={(v) => set('acceptsCard', v)} />
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
        A domicilio, el repartidor lleva el dispositivo POS para cobrar con tarjeta al entregar. Para recoger, se cobra con la terminal del local.
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
        Los modos de pedido (domicilio, para llevar, comer en local) se activan desde Módulos. La cantidad de mesas se configura en Mesas.
      </p>

      {patch.orderTypes.includes('dine_in') && (
        <>
          <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Preferencias de servicio</div>
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
            El cliente elige una al ordenar (ej. &quot;entrada primero&quot;), para comer en local.
          </p>
          <ServicePreferencesCtl
            items={patch.dineInCourseOptions}
            onChange={(v) => set('dineInCourseOptions', v)}
          />
        </>
      )}

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Propina</div>
      <Toggle label="Habilitar propina" value={patch.tipEnabled} onChange={(v) => set('tipEnabled', v)} />
      {patch.tipEnabled && (
        <>
          <NumberCtl label="Porcentaje de propina (%)" value={patch.tipPercent} min={1} max={50} onChange={(v) => set('tipPercent', v)} />
          <Field label="Aplica a">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {patch.orderTypes.map((t) => (
                <Toggle
                  key={t}
                  label={ORDER_TYPE_LABEL[t]}
                  value={patch.tipOrderTypes.includes(t)}
                  onChange={(v) => set('tipOrderTypes', toggleIn(patch.tipOrderTypes, t, v))}
                />
              ))}
            </div>
          </Field>
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
            Se agrega automáticamente al total en los tipos de pedido marcados (el comensal no puede quitarla).
          </p>
        </>
      )}

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
