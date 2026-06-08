'use client';

import { useActionState, useState, useEffect } from 'react';
import { Glass } from '@/components/glass';
import { createRestaurant, type SuperState } from '@/lib/actions/super-admin';

const empty: SuperState = null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

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

export default function RestaurantForm() {
  const [state, formAction, isPending] = useActionState(createRestaurant, empty);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="name" style={labelStyle}>Nombre del restaurante *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Azúcar Negra"
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="slug" style={labelStyle}>Slug (subdominio) *</label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugEdited(true);
          }}
          placeholder="azucar-negra"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 14 }}
        />
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6 }}>
          URL:{' '}
          <strong style={{ color: 'var(--u-text-3)' }}>
            {slug || 'slug'}.tudominio.com
          </strong>
        </p>
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="tagline" style={labelStyle}>Tagline</label>
        <input
          id="tagline"
          name="tagline"
          type="text"
          placeholder="Una frase que describe tu lugar"
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="contact_email" style={labelStyle}>Email de contacto</label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          placeholder="hola@restaurante.com"
          style={inputStyle}
        />
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="whatsapp_number" style={labelStyle}>WhatsApp</label>
        <input
          id="whatsapp_number"
          name="whatsapp_number"
          type="tel"
          placeholder="+502 5555 0000"
          style={inputStyle}
        />
      </Glass>

      {state?.error && <ErrorMsg msg={state.error} />}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 'var(--radius-full)',
          fontWeight: 600,
          fontSize: 15,
          border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Creando…' : 'Crear restaurante'}
      </button>
    </form>
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
