'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import ImageUpload from './image-upload';
import {
  updateRestaurantInfo,
  updateRestaurantTheme,
  type RestaurantState,
} from '@/lib/actions/restaurant';
import type { Restaurant, RestaurantTheme } from '@/types';

interface ProfileFormProps {
  restaurantId: string;
  restaurant: Restaurant;
  theme: RestaurantTheme;
}

const empty: RestaurantState = null;

export default function ProfileForm({ restaurantId, restaurant, theme }: ProfileFormProps) {
  const [infoState, infoAction, infoIsPending] = useActionState(updateRestaurantInfo, empty);
  const [themeState, themeAction, themeIsPending] = useActionState(updateRestaurantTheme, empty);
  const [logoUrl, setLogoUrl] = useState<string>(theme.logo_url ?? '');

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

  const sectionTitle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 18,
    marginBottom: 16,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Información del restaurante ─────────────────────── */}
      <section>
        <h2 style={sectionTitle}>Información</h2>
        <form action={infoAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />

          <Glass variant="quiet" style={{ padding: 16 }}>
            <label htmlFor="name" style={labelStyle}>Nombre del restaurante *</label>
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
            <label htmlFor="whatsapp_number" style={labelStyle}>WhatsApp</label>
            <input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              defaultValue={restaurant.whatsapp_number ?? ''}
              placeholder="+502 5555 0000"
              style={inputStyle}
            />
          </Glass>

          <Glass variant="quiet" style={{ padding: 16 }}>
            <label htmlFor="contact_email" style={labelStyle}>Email de contacto</label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              defaultValue={restaurant.contact_email ?? ''}
              placeholder="hola@mirestaurante.com"
              style={inputStyle}
            />
          </Glass>

          {infoState?.error && <ErrorMsg msg={infoState.error} />}

          <button
            type="submit"
            disabled={infoIsPending}
            className="press btn-accent"
            style={saveBtnStyle(infoIsPending)}
          >
            {infoIsPending ? 'Guardando…' : 'Guardar información'}
          </button>
        </form>
      </section>

      {/* ── Apariencia ──────────────────────────────────────── */}
      <section>
        <h2 style={sectionTitle}>Apariencia</h2>
        <form action={themeAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="logo_url" value={logoUrl} />

          {/* Logo */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label style={labelStyle}>Logo</label>
            <ImageUpload
              restaurantId={restaurantId}
              currentUrl={theme.logo_url}
              folder="logo"
              onUpload={setLogoUrl}
            />
          </Glass>

          {/* Nombre de marca */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label htmlFor="brand_name" style={labelStyle}>Nombre de marca (portada)</label>
            <input
              id="brand_name"
              name="brand_name"
              type="text"
              defaultValue={theme.brand_name ?? ''}
              placeholder={restaurant.name}
              style={inputStyle}
            />
          </Glass>

          {/* Colores */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label style={labelStyle}>Colores</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ColorRow label="Acento / primario" name="color_primary" defaultValue={theme.color_primary} />
              <ColorRow label="Fondo" name="color_bg" defaultValue={theme.color_bg} />
              <ColorRow label="Texto" name="color_text" defaultValue={theme.color_text} />
            </div>
          </Glass>

          {/* Intensidad glass */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label style={labelStyle}>Efecto glass</label>
            <SegmentedControl
              name="glass_intensity"
              options={[
                { value: 'translucido', label: 'Translúcido' },
                { value: 'esmerilado', label: 'Esmerilado' },
                { value: 'solido', label: 'Sólido' },
              ]}
              defaultValue={theme.glass_intensity}
            />
          </Glass>

          {/* Estilo portada */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label style={labelStyle}>Estilo de portada</label>
            <SegmentedControl
              name="portada_style"
              options={[
                { value: 'spotlight', label: 'Spotlight' },
                { value: 'poster', label: 'Poster' },
                { value: 'stack', label: 'Stack' },
              ]}
              defaultValue={theme.portada_style}
            />
          </Glass>

          {/* Vista catálogo */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label style={labelStyle}>Vista del catálogo</label>
            <SegmentedControl
              name="catalog_view"
              options={[
                { value: 'grid', label: 'Cuadrícula' },
                { value: 'list', label: 'Lista' },
              ]}
              defaultValue={theme.catalog_view}
            />
          </Glass>

          {themeState?.error && <ErrorMsg msg={themeState.error} />}

          <button
            type="submit"
            disabled={themeIsPending}
            className="press btn-accent"
            style={saveBtnStyle(themeIsPending)}
          >
            {themeIsPending ? 'Guardando…' : 'Guardar apariencia'}
          </button>
        </form>
      </section>
    </div>
  );
}

/* ── Helpers UI ──────────────────────────────────────────── */

function ColorRow({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        type="color"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 2 }}
      />
      <span style={{ fontSize: 14, color: 'var(--u-text-2)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
        {value}
      </span>
    </div>
  );
}

function SegmentedControl({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  const [selected, setSelected] = useState(defaultValue);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <input type="hidden" name={name} value={selected} />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSelected(opt.value)}
          className="press"
          style={{
            padding: '7px 14px',
            borderRadius: 'var(--radius-full)',
            fontSize: 13,
            border: '1px solid',
            cursor: 'pointer',
            background: selected === opt.value ? 'rgba(255,255,255,0.12)' : 'transparent',
            borderColor: selected === opt.value ? 'var(--u-hair-2)' : 'var(--u-hair)',
            color: selected === opt.value ? 'var(--u-text)' : 'var(--u-text-3)',
            transition: 'all 150ms',
          }}
        >
          {opt.label}
        </button>
      ))}
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

function saveBtnStyle(isPending: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px',
    borderRadius: 'var(--radius-full)',
    fontWeight: 600,
    fontSize: 15,
    border: 'none',
    cursor: isPending ? 'not-allowed' : 'pointer',
    opacity: isPending ? 0.7 : 1,
  };
}
