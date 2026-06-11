'use client';

/* ============================================================
   ZONAS DE COBERTURA DEL DELIVERY — editor del dueño
   ------------------------------------------------------------
   Lista simple de zonas/colonias a las que SÍ llega el reparto.
   · Con zonas configuradas: el comensal elige su zona en el
     checkout; si no aparece, solo puede pedir para recoger.
   · Sin zonas: el delivery no se restringe (como hasta ahora).
   ============================================================ */

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { updateDeliveryZones, type RestaurantState } from '@/lib/actions/restaurant';
import type { Restaurant } from '@/types';

const empty: RestaurantState = null;

export default function DeliveryZonesEditor({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, isPending] = useActionState(updateDeliveryZones, empty);
  const [zones, setZones] = useState<string[]>(restaurant.delivery_zones ?? []);
  const [draft, setDraft] = useState('');

  function addZone() {
    const z = draft.trim();
    if (!z) return;
    if (!zones.some((x) => x.toLowerCase() === z.toLowerCase())) {
      setZones((prev) => [...prev, z]);
    }
    setDraft('');
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="restaurantId" value={restaurant.id} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />

      <Glass variant="quiet" style={{ padding: 16 }}>
        <label
          style={{
            fontSize: 12, color: 'var(--u-text-3)', fontWeight: 500,
            letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
          }}
        >
          Zonas a las que llega tu delivery
        </label>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 12, lineHeight: 1.5 }}>
          Si agregas zonas, el cliente debe elegir la suya al pedir a domicilio;
          si la suya no está, solo podrá pedir para recoger. Sin zonas = entregas
          a cualquier dirección.
        </p>

        {/* Chips de zonas */}
        {zones.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
            {zones.map((z) => (
              <span
                key={z}
                className="glass-quiet"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 8px 7px 13px', borderRadius: 99,
                  fontSize: 13, fontWeight: 600, color: 'var(--u-text)',
                }}
              >
                <Icon name="mapPin" size={13} style={{ color: 'var(--u-text-3)' }} />
                {z}
                <button
                  type="button"
                  onClick={() => setZones((prev) => prev.filter((x) => x !== z))}
                  className="press"
                  title={`Quitar ${z}`}
                  style={{
                    width: 22, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.08)', color: 'var(--u-text-3)',
                    display: 'grid', placeItems: 'center',
                  }}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Agregar zona */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addZone(); }
            }}
            placeholder="Ej. Zona 1, Centro, San Cristóbal…"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--u-hair-2)',
              borderRadius: 'var(--radius-md)', padding: '10px 12px',
              color: 'var(--u-text)', fontSize: 14, outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={addZone}
            className="press glass-quiet"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
              color: 'var(--u-text)', fontWeight: 600, fontSize: 13,
            }}
          >
            <Icon name="plus" size={14} /> Agregar
          </button>
        </div>
      </Glass>

      {state?.error && (
        <div
          style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)',
            color: '#f87171', fontSize: 14,
          }}
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="press btn-accent"
        style={{
          width: '100%', padding: '14px', borderRadius: 'var(--radius-full)',
          fontWeight: 600, fontSize: 15, border: 'none',
          cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Guardando…' : 'Guardar zonas de entrega'}
      </button>
    </form>
  );
}
