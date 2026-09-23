'use client';

import { useActionState, useMemo, useState } from 'react';
import { Glass } from '@/components/glass';
import PreviewPane, { useThemePreviewChannel } from '@/components/super/preview-pane';
import { createRestaurant, type SuperState } from '@/lib/actions/super-admin';
import { DEFAULT_CONFIG, DEFAULT_CONTENT } from '@/lib/theme/defaults';

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
  background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
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
  const [tagline, setTagline] = useState('');

  // El slug se deriva del nombre mientras el usuario no lo edite a mano.
  function onNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  // Vista previa en vivo: mientras escribes nombre/tagline, /preview/new
  // muestra cómo se vería el sitio (tema default + menú de ejemplo).
  const previewState = useMemo(
    () => ({
      config: {
        ...DEFAULT_CONFIG,
        brandName: name.trim() || DEFAULT_CONFIG.brandName,
        tagline: tagline.trim() || DEFAULT_CONFIG.tagline,
      },
      content: DEFAULT_CONTENT,
      customCss: '',
    }),
    [name, tagline],
  );
  useThemePreviewChannel('new', previewState);

  return (
    <div className="theme-editor-layout">
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, maxWidth: 680, width: '100%' }}>
      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="name" style={labelStyle}>Nombre del restaurante *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Tu Restaurante"
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
          placeholder="mi-restaurante"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 14 }}
        />
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6 }}>
          URL:{' '}
          <strong style={{ color: 'var(--u-text-3)' }}>
            {slug || 'slug'}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'leogin.com'}
          </strong>
        </p>
      </Glass>

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label htmlFor="tagline" style={labelStyle}>Tagline</label>
        <input
          id="tagline"
          name="tagline"
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
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

    {/* Vista previa en vivo (tema default + menú de ejemplo) */}
    <PreviewPane previewId="new" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div
      style={{
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
