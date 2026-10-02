'use client';

/* ============================================================
   EDITOR DE UBICACIÓN Y RADIO DE DELIVERY — admin
   ------------------------------------------------------------
   El dueño coloca un pin en el mapa para indicar dónde está
   el restaurante y configura hasta cuántos km llega el reparto.
   Con eso activado, el checkout muestra un mapa al cliente y
   valida que su pin caiga dentro del radio.
   ============================================================ */

import { useActionState, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { updateRestaurantLocation, type SaveState } from '@/lib/actions/restaurant';
import type { Restaurant } from '@/types';
import SaveBar from '@/components/admin/save-bar';
import { useFormDirty } from '@/lib/use-form-dirty';

const LocationMap = dynamic(
  () => import('./restaurant-location-map'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: 300, borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--u-text-4)', fontSize: 13,
      }}>
        Cargando mapa…
      </div>
    ),
  }
);

// Guatemala City como fallback si el restaurante no tiene ubicación aún
const DEFAULT_LAT = 14.64072;
const DEFAULT_LNG = -90.51327;
const DEFAULT_RADIUS = 3;

const empty: SaveState = null;

export default function RestaurantLocationEditor({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, isPending] = useActionState(updateRestaurantLocation, empty);
  const { ref: formRef, dirty, markSaved } = useFormDirty();
  useEffect(() => { if (state && 'saved' in state) markSaved(); }, [state, markSaved]);

  const [lat,    setLat]    = useState(restaurant.location_lat    ?? DEFAULT_LAT);
  const [lng,    setLng]    = useState(restaurant.location_lng    ?? DEFAULT_LNG);
  const [radius, setRadius] = useState(restaurant.delivery_radius_km ?? DEFAULT_RADIUS);
  const [geoEnabled, setGeoEnabled] = useState(
    restaurant.location_lat !== null && restaurant.location_lng !== null && restaurant.delivery_radius_km !== null
  );

  const handleLocationChange = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
  }, []);

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="restaurantId" value={restaurant.id} />

      {/* Datos enviados al servidor; se actualizan cuando el usuario mueve el pin */}
      <input type="hidden" name="location_lat"       value={geoEnabled ? lat.toFixed(7)  : ''} />
      <input type="hidden" name="location_lng"       value={geoEnabled ? lng.toFixed(7)  : ''} />
      <input type="hidden" name="delivery_radius_km" value={geoEnabled ? radius.toString() : ''} />

      <Card className="p-4">
        {/* Toggle para activar/desactivar validación geográfica */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', marginBottom: 2 }}>
              Validación por mapa (radio)
            </p>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
              Al pedir, el cliente verá un mapa y solo podrá pedir si su pin
              cae dentro del radio que definas.
            </p>
          </div>
          <Switch
            checked={geoEnabled}
            onCheckedChange={setGeoEnabled}
            aria-label="Validación por mapa"
            className="ml-4 shrink-0"
          />
        </div>

        {geoEnabled && (
          <>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', marginBottom: 10, lineHeight: 1.5 }}>
              Arrastra el pin naranja hasta la ubicación exacta de tu restaurante.
              El círculo punteado muestra el área de cobertura.
            </p>

            <LocationMap
              lat={lat}
              lng={lng}
              radiusKm={radius}
              onLocationChange={handleLocationChange}
            />

            {/* Coordenadas en texto (solo lectura, informativo) */}
            <div style={{
              marginTop: 8, display: 'flex', gap: 8,
              fontSize: 11.5, color: 'var(--u-text-4)', fontVariantNumeric: 'tabular-nums',
            }}>
              <span>Lat {lat.toFixed(5)}</span>
              <span>·</span>
              <span>Lng {lng.toFixed(5)}</span>
            </div>

            {/* Radio de entrega */}
            <div style={{ marginTop: 14 }}>
              <label style={{
                fontSize: 12, color: 'var(--u-text-3)',
                fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'block', marginBottom: 8,
              }}>
                Radio de entrega
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range"
                  min={0.5} max={30} step={0.5}
                  value={radius}
                  onChange={(e) => setRadius(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--c-accent, #D97757)', cursor: 'pointer' }}
                />
                <div style={{
                  minWidth: 68, padding: '6px 10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                  textAlign: 'center', fontWeight: 700,
                  fontSize: 15, color: 'var(--u-text)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {radius % 1 === 0 ? radius : radius.toFixed(1)} km
                </div>
              </div>

              {/* Opción de escribir el radio exacto */}
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>o escribe:</span>
                <input
                  type="number" inputMode="decimal"
                  min={0.5} max={500} step={0.1}
                  value={radius}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) setRadius(v);
                  }}
                  style={{
                    width: 80,
                    background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                    border: '1px solid var(--u-hair-2)',
                    borderRadius: 'var(--radius-md)',
                    padding: '7px 10px',
                    color: 'var(--u-text)', fontSize: 14, outline: 'none',
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>km</span>
              </div>
            </div>
          </>
        )}

        {!geoEnabled && (
          <div className="note note-info" style={{ fontWeight: 500 }}>
            <Icon name="mapPin" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              La validación por mapa está apagada. Al pedir se usan las zonas
              de abajo (si agregas alguna) o se acepta cualquier dirección.
            </span>
          </div>
        )}
      </Card>


      <SaveBar dirty={dirty} pending={isPending} status={state} label="Guardar ubicación" />
    </form>
  );
}
