'use client';

import { useActionState } from 'react';
import { savePlatformSettings, type PlatformContactSettings, type PlatformSettingsState } from '@/lib/actions/super-admin';

interface Props {
  settings: PlatformContactSettings;
}

export default function PlatformSettingsForm({ settings }: Props) {
  const [state, action, pending] = useActionState<PlatformSettingsState, FormData>(savePlatformSettings, null);
  const saved = state !== null && 'saved' in state;
  const errorMsg = state !== null && 'error' in state ? state.error : null;

  return (
    <div
      style={{
        borderRadius: 16,
        background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--u-text) 10%, transparent)',
        padding: '24px 26px',
        maxWidth: 480,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginBottom: 20 }}>
        Datos de contacto del soporte
      </h2>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="support_whatsapp" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Número de WhatsApp
          </label>
          <input
            id="support_whatsapp"
            name="support_whatsapp"
            type="tel"
            defaultValue={settings.support_whatsapp}
            placeholder="+502 1234 5678"
            style={{
              padding: '11px 14px', borderRadius: 10, fontSize: 14,
              background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--u-text) 12%, transparent)',
              color: 'var(--u-text)',
              outline: 'none',
              width: '100%',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
            Incluye el código de país, ej. +502 para Guatemala. Se usa para el botón de WhatsApp en Soporte.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="support_email" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Correo electrónico de soporte
          </label>
          <input
            id="support_email"
            name="support_email"
            type="email"
            defaultValue={settings.support_email}
            placeholder="soporte@ejemplo.com"
            style={{
              padding: '11px 14px', borderRadius: 10, fontSize: 14,
              background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--u-text) 12%, transparent)',
              color: 'var(--u-text)',
              outline: 'none',
              width: '100%',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
            Se usa para el botón de correo en la página de Soporte de cada restaurante.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="payment_instructions" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Cómo te pagan los restaurantes
          </label>
          <textarea
            id="payment_instructions"
            name="payment_instructions"
            rows={4}
            maxLength={600}
            defaultValue={settings.payment_instructions}
            placeholder={'Depósito o transferencia a Banco Industrial\nCuenta monetaria 000-000000-0\nA nombre de …'}
            style={{
              padding: '11px 14px', borderRadius: 10, fontSize: 14, lineHeight: 1.5,
              background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--u-text) 12%, transparent)',
              color: 'var(--u-text)',
              outline: 'none',
              width: '100%',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
            Se le enseña al restaurante en «Mi suscripción» cuando tiene un cobro pendiente,
            junto con un botón para mandarte el comprobante por WhatsApp.
          </p>
        </div>

        {errorMsg && (
          <p style={{ fontSize: 13, color: 'var(--c-danger)', padding: '10px 14px', borderRadius: 8, background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)' }}>
            {errorMsg}
          </p>
        )}

        {saved && (
          <p style={{ fontSize: 13, color: 'var(--c-ok)', padding: '10px 14px', borderRadius: 8, background: 'var(--c-ok-bg)', border: '1px solid var(--c-ok-line)' }}>
            Configuración guardada correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: pending ? 'not-allowed' : 'pointer',
            background: pending ? 'color-mix(in srgb, var(--u-text) 8%, transparent)' : 'var(--u-text)',
            color: pending ? 'var(--u-text-3)' : 'var(--brand-bg)',
            border: 'none',
            transition: 'all 150ms',
            alignSelf: 'flex-start',
          }}
        >
          {pending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
