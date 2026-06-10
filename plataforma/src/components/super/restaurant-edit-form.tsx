'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import {
  updateRestaurantBasic,
  type SuperState,
} from '@/lib/actions/super-admin';
import type { Restaurant } from '@/types';

const empty: SuperState = null;

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  color: 'var(--u-text)',
  fontSize: 15,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--u-text-3)',
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

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
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <input type="hidden" name="id" value={restaurant.id} />

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="name" style={labelStyle}>Nombre *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={restaurant.name}
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="slug" style={labelStyle}>Slug</label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          defaultValue={restaurant.slug}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 14 }}
        />
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6 }}>
          URL: <strong style={{ color: 'var(--u-text-3)' }}>{restaurant.slug}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'leogin.online'}</strong>
        </p>
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="tagline" style={labelStyle}>Tagline</label>
        <input
          id="tagline"
          name="tagline"
          type="text"
          defaultValue={restaurant.tagline ?? ''}
          placeholder="Una frase que describe tu lugar"
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="contact_email" style={labelStyle}>Email</label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          defaultValue={restaurant.contact_email ?? ''}
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="whatsapp_number" style={labelStyle}>WhatsApp</label>
        <input
          id="whatsapp_number"
          name="whatsapp_number"
          type="tel"
          defaultValue={restaurant.whatsapp_number ?? ''}
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label style={labelStyle}>Estado</label>
        <StatusSelector defaultValue={restaurant.status} />
      </Glass>

      {state?.error && <ErrorMsg msg={state.error} />}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%',
          padding: '13px',
          borderRadius: 'var(--radius-full)',
          fontWeight: 600,
          fontSize: 15,
          border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar información'}
      </button>
    </form>
  );
}

function StatusSelector({ defaultValue }: { defaultValue: 'active' | 'suspended' }) {
  const [selected, setSelected] = useState<'active' | 'suspended'>(defaultValue);

  const options = [
    { value: 'active' as const, label: 'Activo', color: '#4ade80' },
    { value: 'suspended' as const, label: 'Suspendido', color: '#f87171' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
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
              borderColor: active ? `${opt.color}44` : 'var(--u-hair)',
              background: active ? `${opt.color}18` : 'transparent',
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
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(220,50,50,0.12)',
        border: '1px solid rgba(220,50,50,0.25)',
        color: '#f87171',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}
