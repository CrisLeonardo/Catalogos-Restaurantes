'use client';

/* ============================================================
   EDITOR DE UBICACIÓN Y RADIO DE DELIVERY — admin
   ------------------------------------------------------------
   El dueño coloca un pin en el mapa para indicar dónde está
   el restaurante y configura hasta cuántos km llega el reparto.
   Con eso activado, el checkout muestra un mapa al cliente y
   valida que su pin caiga dentro del radio.
   ============================================================ */

import { useActionState, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { updateRestaurantLocation } from '@/lib/actions/restaurant';
import type { Restaurant } from '@/types';

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

const empty = null;

export default function RestaurantLocationEditor({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, isPending] = useActionState(updateRestaurantLocation, empty);

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
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="restaurantId" value={restaurant.id} />

      {/* Datos enviados al servidor; se actualizan cuando el usuario mueve el pin */}
      <input type="hidden" name="location_lat"       value={geoEnabled ? lat.toFixed(7)  : ''} />
      <input type="hidden" name="location_lng"       value={geoEnabled ? lng.toFixed(7)  : ''} />
      <input type="hidden" name="delivery_radius_km" value={geoEnabled ? radius.toString() : ''} />

      <Glass variant="quiet" style={{ padding: 16 }}>
        {/* Toggle para activar/desactivar validación geográfica */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', marginBottom: 2 }}>
              Validación por mapa (radio)
            </p>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
              El cliente verá un mapa en el checkout y solo podrá pedir si su pin
              cae dentro del radio que definas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGeoEnabled((v) => !v)}
            className="press"
            aria-pressed={geoEnabled}
            style={{
              flexShrink: 0,
              marginLeft: 16,
              width: 48, height: 28, borderRadius: 99,
              border: 'none', cursor: 'pointer',
              background: geoEnabled ? 'var(--c-accent, #D97757)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)',
              position: 'relative', transition: 'background 200ms',
            }}
          >
            <span style={{
              position: 'absolute', top: 3,
              left: geoEnabled ? 23 : 3,
              width: 22, height: 22, borderRadius: 99,
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
              transition: 'left 200ms',
            }} />
          </button>
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
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
            fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5,
          }}>
            <Icon name="mapPin" size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            La validación por mapa está desactivada. El checkout usará las zonas
            de texto (si las configuraste) o aceptará cualquier dirección.
          </div>
        )}
      </Glass>

      {state?.error && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)',
          background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)',
          color: '#f87171', fontSize: 14,
        }}>
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%', padding: 14, borderRadius: 'var(--radius-full)',
          fontWeight: 600, fontSize: 15, border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar ubicación y radio'}
      </button>
    </form>
  );
}
