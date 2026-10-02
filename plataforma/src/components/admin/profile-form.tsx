'use client';

import { useActionState, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { updateRestaurantInfo, type RestaurantState } from '@/lib/actions/restaurant';
import { useFormDirty } from '@/lib/use-form-dirty';
import { friendlyError } from '@/lib/friendly-error';
import type { Restaurant } from '@/types';

interface ProfileFormProps {
  restaurantId: string;
  restaurant: Restaurant;
}

const empty: RestaurantState = null;

export default function ProfileForm({ restaurantId, restaurant }: ProfileFormProps) {
  const [infoState, infoAction, infoIsPending] = useActionState(updateRestaurantInfo, empty);
  /* El botón solo se enciende si de verdad cambiaste algo. La confirmación de
     guardado no se maneja aquí: esta acción termina en redirect a
     `?saved=1` y la propia pantalla pinta el aviso "Cambios guardados
     correctamente" (ver perfil/page.tsx). Tras el redirect el formulario se
     monta de nuevo, limpio, y el botón vuelve solo a "Sin cambios". */
  const { ref: infoRef, dirty: infoDirty } = useFormDirty();

  const [whatsappVal, setWhatsappVal] = useState(restaurant.whatsapp_number ?? '');
  const [ordersWaEnabled, setOrdersWaEnabled] = useState(restaurant.orders_whatsapp_enabled !== false);

  function validateWhatsApp(v: string): string {
    if (!v.trim()) return '';
    const digits = v.replace(/[\s\-\(\)\+\.]/g, '');
    if (/^\d{8}$/.test(digits) || /^502\d{8}$/.test(digits)) return '';
    return 'Ingresa 8 dígitos (ej. 12345678 ó 1234-5678) o con código de país (ej. +502 12345678)';
  }

  const whatsappErr = validateWhatsApp(whatsappVal);

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
        <form ref={infoRef} action={infoAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="orders_whatsapp" value="" />

          <Card className="p-4">
            <label htmlFor="name" style={labelStyle}>Nombre del restaurante *</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={restaurant.name}
              style={inputStyle}
            />
          </Card>

          <Card className="p-4">
            <label htmlFor="tagline" style={labelStyle}>Lema</label>
            <input
              id="tagline"
              name="tagline"
              type="text"
              defaultValue={restaurant.tagline ?? ''}
              placeholder="Una frase que describe tu lugar"
              style={inputStyle}
            />
          </Card>

          <Card className="p-4">
            <label htmlFor="address" style={labelStyle}>Dirección</label>
            <input
              id="address"
              name="address"
              type="text"
              defaultValue={restaurant.address ?? ''}
              placeholder="Ej. 5a Av. 10-23, Zona 1"
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6 }}>
              Se muestra cuando los clientes eligen sucursal en el link del grupo.
            </p>
          </Card>

          <Card data-tour-step="perfil-whatsapp" className="p-4">
            <label htmlFor="whatsapp_number" style={labelStyle}>WhatsApp</label>
            <input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              value={whatsappVal}
              onChange={(e) => setWhatsappVal(e.target.value)}
              placeholder="12345678 · 1234-5678 · 1234 5678 · +502 12345678"
              style={{
                ...inputStyle,
                borderColor: whatsappErr ? 'var(--c-danger-line)' : undefined,
              }}
            />
            {whatsappErr ? (
              <p style={{ fontSize: 12, color: 'var(--c-danger)', marginTop: 6 }}>{whatsappErr}</p>
            ) : whatsappVal.trim() ? (
              <p style={{ fontSize: 12, color: 'var(--c-ok)', marginTop: 6 }}>Número válido ✓</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6 }}>
                Acepta: 12345678 · 1234-5678 · 1234 5678 · +502 1234 5678
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--u-hair-2)' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Recibir pedidos por WhatsApp</div>
                <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>
                  Al confirmar, el comensal ve el botón para enviarte el pedido por WhatsApp a este número.
                </p>
              </div>
              <input type="hidden" name="orders_whatsapp_enabled" value={ordersWaEnabled ? 'true' : 'false'} />
              <Switch
                checked={ordersWaEnabled}
                onCheckedChange={setOrdersWaEnabled}
                aria-label="Recibir pedidos por WhatsApp"
              />
            </div>
          </Card>

          <Card className="p-4">
            <label htmlFor="contact_email" style={labelStyle}>Email de contacto</label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              defaultValue={restaurant.contact_email ?? ''}
              placeholder="hola@mirestaurante.com"
              style={inputStyle}
            />
          </Card>

          {infoState?.error && <ErrorMsg msg={friendlyError(infoState.error)} />}

          {/* El botón dice la verdad sobre el estado de la pantalla: apagado
              si no hay nada que guardar, y "Guardado" cuando acaba. */}
          <Button
            type="submit"
            disabled={infoIsPending || !!whatsappErr || !infoDirty}
            size="lg"
            className="w-full rounded-adm-full"
          >
            {infoIsPending ? 'Guardando…' : infoDirty ? 'Guardar información' : 'Sin cambios que guardar'}
          </Button>
        </form>
      </section>
    </div>
  );
}

/* ── Helpers UI ──────────────────────────────────────────── */

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
