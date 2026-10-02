'use client';

import { useActionState, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { updateRestaurantInfo, type RestaurantState } from '@/lib/actions/restaurant';
import { useFormDirty } from '@/lib/use-form-dirty';
import { friendlyError } from '@/lib/friendly-error';
import type { Restaurant } from '@/types';
import SaveBar from '@/components/admin/save-bar';

interface ProfileFormProps {
  restaurantId: string;
  restaurant: Restaurant;
}

const empty: RestaurantState = null;

export default function ProfileForm({ restaurantId, restaurant }: ProfileFormProps) {
  const [infoState, infoAction, infoIsPending] = useActionState(updateRestaurantInfo, empty);
  /* La barra de guardar sale solo si de verdad cambiaste algo. La
     confirmación de guardado no se maneja aquí: esta acción termina en
     redirect a `?saved=1` y la propia pantalla pinta el aviso "Cambios
     guardados correctamente" (ver perfil/page.tsx). Tras el redirect el
     formulario se monta de nuevo, limpio, y la barra se va sola. */
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

  /* Rótulo en minúscula como el resto del panel (`.adm-label`), no en
     MAYÚSCULAS espaciadas (auditoría 2026-10-02, T-11). */
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--u-text-2)',
    fontWeight: 600,
    marginBottom: 6,
    display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Información del restaurante ─────────────────────────
          Antes: un encabezado «Información» (la barra dice «Perfil») y una
          tarjeta por campo, seis tarjetas para cinco datos. Ahora los datos
          van juntos en una ficha y WhatsApp en la suya, porque trae su
          interruptor (auditoría 2026-10-02, AJU-04). */}
      <section>
        <form ref={infoRef} action={infoAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="orders_whatsapp" value="" />

          <Card className="flex flex-col gap-4 p-4">
            <div>
            <label htmlFor="name" style={labelStyle}>Nombre del restaurante *</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={restaurant.name}
              style={inputStyle}
            />
            </div>

            <div>
            <label htmlFor="tagline" style={labelStyle}>Lema</label>
            <input
              id="tagline"
              name="tagline"
              type="text"
              defaultValue={restaurant.tagline ?? ''}
              placeholder="Una frase que describe tu lugar"
              style={inputStyle}
            />
            </div>

            <div>
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
              Se muestra cuando los clientes eligen sucursal en el enlace del grupo.
            </p>
            </div>

            <div>
            <label htmlFor="contact_email" style={labelStyle}>Correo de contacto</label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              defaultValue={restaurant.contact_email ?? ''}
              placeholder="hola@mirestaurante.com"
              style={inputStyle}
            />
            </div>
          </Card>

          <Card data-tour-step="perfil-whatsapp" className="p-4">
            <label htmlFor="whatsapp_number" style={labelStyle}>WhatsApp</label>
            <input
              id="whatsapp_number"
              name="whatsapp_number"
              type="tel"
              value={whatsappVal}
              onChange={(e) => setWhatsappVal(e.target.value)}
              placeholder="5555 1234"
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
                Escríbelo como quieras: 8 dígitos o con el +502 delante.
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

          <SaveBar
            dirty={infoDirty}
            pending={infoIsPending}
            status={infoState?.error ? { error: friendlyError(infoState.error) } : null}
            disabled={!!whatsappErr}
            hint={whatsappErr ? 'Revisa el número de WhatsApp' : undefined}
          />
        </form>
      </section>
    </div>
  );
}
