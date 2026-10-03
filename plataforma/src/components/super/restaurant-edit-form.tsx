'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import {
  updateRestaurantBasic,
  type SuperState,
} from '@/lib/actions/super-admin';
import type { Restaurant } from '@/types';
import { FIELD_LABEL } from '@/components/admin/field-label';

const empty: SuperState = null;

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  color: 'var(--u-text)',
  fontSize: 15,
  outline: 'none',
};

/* El rótulo de campo del panel (D-8): en minúscula, no en mayúsculas de cartel. */
const labelStyle: React.CSSProperties = FIELD_LABEL;

function Field({
  label,
  hint,
  span2,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={span2 ? { gridColumn: '1 / -1' } : undefined}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6 }}>{hint}</p>}
    </div>
  );
}

export default function RestaurantEditForm({
  restaurant,
}: {
  restaurant: Restaurant;
}) {
  const [state, formAction, isPending] = useActionState(
    updateRestaurantBasic,
    empty,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={restaurant.id} />

      <Glass variant="quiet" style={{ padding: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          <Field label="Nombre *">
            <input name="name" type="text" required defaultValue={restaurant.name} style={inputStyle} />
          </Field>

          <Field
            label="Slug"
            hint={
              <>URL: <strong style={{ color: 'var(--u-text-3)' }}>{restaurant.slug}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'leogin.online'}</strong> — cambiarlo rompe los QR ya impresos.</>
            }
          >
            <input name="slug" type="text" required defaultValue={restaurant.slug} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 14 }} />
          </Field>

          <Field label="Tagline" span2>
            <input name="tagline" type="text" defaultValue={restaurant.tagline ?? ''} placeholder="Una frase que describe tu lugar" style={inputStyle} />
          </Field>

          <Field label="Dirección" span2 hint="Se muestra en el selector de sucursal del grupo.">
            <input name="address" type="text" defaultValue={restaurant.address ?? ''} placeholder="Ej. 5a Av. 10-23, Zona 1, Ciudad de Guatemala" style={inputStyle} />
          </Field>

          <Field label="Email">
            <input name="contact_email" type="email" defaultValue={restaurant.contact_email ?? ''} style={inputStyle} />
          </Field>

          <Field label="WhatsApp" hint="Con código de país (ej. +502…). Se usa para avisos de pedidos y para contactar al dueño.">
            <input name="whatsapp_number" type="tel" defaultValue={restaurant.whatsapp_number ?? ''} placeholder="+502 0000 0000" style={inputStyle} />
          </Field>

          <Field label="Estado" span2>
            <StatusSelector defaultValue={restaurant.status} />
          </Field>
        </div>

        {state?.error && <ErrorMsg msg={state.error} />}

        <button
          type="submit"
          disabled={isPending}
          className="press btn-accent"
          style={{
            marginTop: 18,
            padding: '12px 28px',
            borderRadius: 'var(--radius-full)',
            fontWeight: 600,
            fontSize: 14.5,
            border: 'none',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Guardando…' : 'Guardar información'}
        </button>
      </Glass>
    </form>
  );
}

function StatusSelector({ defaultValue }: { defaultValue: 'active' | 'suspended' }) {
  const [selected, setSelected] = useState<'active' | 'suspended'>(defaultValue);

  const options = [
    { value: 'active' as const, label: 'Activo', color: 'var(--c-ok)' },
    { value: 'suspended' as const, label: 'Suspendido', color: 'var(--c-danger)' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
      <input type="hidden" name="status" value={selected} />
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className="press"
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid',
              borderColor: active ? `color-mix(in srgb, ${opt.color} 27%, transparent)` : 'var(--u-hair)',
              background: active ? `color-mix(in srgb, ${opt.color} 10%, transparent)` : 'transparent',
              color: active ? opt.color : 'var(--u-text-3)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--c-danger-bg)',
        border: '1px solid var(--c-danger-line)',
        color: 'var(--c-danger)',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}
