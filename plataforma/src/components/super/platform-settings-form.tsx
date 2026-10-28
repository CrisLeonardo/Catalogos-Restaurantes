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

      </Card>

      <Card style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>
            Cuenta para recibir pagos
          </h3>
          <p style={{ ...hint, marginTop: 4 }}>
            El restaurante la ve en «Mi suscripción» con un botón para copiar el número,
            su código de pago y dónde subir el comprobante.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {([
            ['pay_bank', 'Banco', 'Banco Industrial', settings.pay_bank],
            ['pay_account_type', 'Tipo de cuenta', 'Monetaria', settings.pay_account_type],
            ['pay_account_number', 'Número de cuenta', '000-000000-0', settings.pay_account_number],
            ['pay_account_holder', 'A nombre de', 'Nombre del titular', settings.pay_account_holder],
          ] as const).map(([name, label, ph, value]) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor={name} style={{ ...FIELD_LABEL, marginBottom: 0 }}>{label}</label>
              <Input
                id={name}
                name={name}
                defaultValue={value}
                placeholder={ph}
                maxLength={80}
                inputMode={name === 'pay_account_number' ? 'numeric' : undefined}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="payment_instructions" style={{ ...FIELD_LABEL, marginBottom: 0 }}>
            Notas para el pago (opcional)
          </label>
          <Textarea
            id="payment_instructions"
            name="payment_instructions"
            rows={4}
            maxLength={600}
            defaultValue={settings.payment_instructions}
            placeholder={'También aceptamos depósito en agencia.\nSi pagas varios meses juntos, avísanos.'}
          />
          <p style={hint}>
            Sale debajo de la cuenta. Si no llenas banco y número, este texto hace de instrucciones completas.
          </p>
        </div>
      </Card>

      <SaveBar dirty={dirty} pending={pending} status={state} />
    </form>
  );
}
