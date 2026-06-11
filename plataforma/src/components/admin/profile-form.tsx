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

  // El resolver da prioridad a config (JSONB) sobre las columnas legacy:
  // mostramos lo que realmente está en efecto.
  const cfg = (theme.config ?? {}) as { logoUrl?: string | null; colorAccent?: string };
  const currentLogo = cfg.logoUrl !== undefined ? cfg.logoUrl : theme.logo_url;
  const currentAccent = cfg.colorAccent ?? theme.color_primary;

  const [logoUrl, setLogoUrl] = useState<string>(currentLogo ?? '');

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
            <label htmlFor="orders_whatsapp" style={labelStyle}>WhatsApp para recibir pedidos</label>
            <input
              id="orders_whatsapp"
              name="orders_whatsapp"
              type="tel"
              defaultValue={restaurant.orders_whatsapp ?? ''}
              placeholder="+502 5555 0000"
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 8 }}>
              Cada pedido confirmado se envía por WhatsApp a este número.
              Si lo dejas vacío, se usa el WhatsApp de arriba.
            </p>
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

      {/* ── Apariencia (básica) ─────────────────────────────── */}
      {/* El diseño completo lo hace Leogin desde el Super Admin; el dueño
          ajusta su logo y color de acento sin poder romper el resto. */}
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
              currentUrl={currentLogo}
              folder="logo"
              onUpload={setLogoUrl}
            />
          </Glass>

          {/* Color de acento */}
          <Glass variant="quiet" style={{ padding: 16 }}>
            <label style={labelStyle}>Color de tu marca</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ColorRow label="Acento / primario" name="color_primary" defaultValue={currentAccent} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 10 }}>
              El resto del diseño (fondo, tipografías, portada) lo personaliza
              el equipo de Leogin por ti. Escríbenos si quieres cambios.
            </p>
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
