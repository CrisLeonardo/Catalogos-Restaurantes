'use client';

import { useActionState, useEffect } from 'react';
import { savePlatformSettings, type PlatformContactSettings, type PlatformSettingsState } from '@/lib/actions/super-admin';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import SaveBar from '@/components/admin/save-bar';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { useFormDirty } from '@/lib/use-form-dirty';

interface Props {
  settings: PlatformContactSettings;
}

/* Super › Configuración › Soporte, con las piezas del panel (D-8): tarjeta,
   campo único (T-26) y la barra de guardar que aparece solo con cambios
   (T-08), como la pestaña Portada de al lado. */
export default function PlatformSettingsForm({ settings }: Props) {
  const [state, action, pending] = useActionState<PlatformSettingsState, FormData>(savePlatformSettings, null);
  const { ref, dirty, markSaved } = useFormDirty();

  // Lo guardado pasa a ser el nuevo punto de partida (la barra se va).
  useEffect(() => {
    if (state && 'saved' in state) markSaved();
  }, [state, markSaved]);

  const hint = { fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 } as const;

  return (
    <form ref={ref} action={action} style={{ maxWidth: 560 }}>
      <Card style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>
          Datos de contacto del soporte
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="support_whatsapp" style={{ ...FIELD_LABEL, marginBottom: 0 }}>
            Número de WhatsApp
          </label>
          <Input
            id="support_whatsapp"
            name="support_whatsapp"
            type="tel"
            defaultValue={settings.support_whatsapp}
            placeholder="+502 1234 5678"
          />
          <p style={hint}>
            Incluye el código de país, ej. +502 para Guatemala. Se usa para el botón de WhatsApp en Soporte.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="support_email" style={{ ...FIELD_LABEL, marginBottom: 0 }}>
            Correo electrónico de soporte
          </label>
          <Input
            id="support_email"
            name="support_email"
            type="email"
            defaultValue={settings.support_email}
            placeholder="soporte@ejemplo.com"
          />
          <p style={hint}>
            Se usa para el botón de correo en la página de Soporte de cada restaurante.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="payment_instructions" style={{ ...FIELD_LABEL, marginBottom: 0 }}>
            Cómo te pagan los restaurantes
          </label>
          <Textarea
            id="payment_instructions"
            name="payment_instructions"
            rows={4}
            maxLength={600}
            defaultValue={settings.payment_instructions}
            placeholder={'Depósito o transferencia a Banco Industrial\nCuenta monetaria 000-000000-0\nA nombre de …'}
          />
          <p style={hint}>
            Se le enseña al restaurante en «Mi suscripción» cuando tiene un cobro pendiente,
            junto con un botón para mandarte el comprobante por WhatsApp.
          </p>
        </div>
      </Card>

      <SaveBar dirty={dirty} pending={pending} status={state} />
    </form>
  );
}
