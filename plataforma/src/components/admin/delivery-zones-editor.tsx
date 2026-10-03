'use client';

/* ============================================================
   ZONAS DE COBERTURA DEL DELIVERY — editor del dueño
   ------------------------------------------------------------
   Zonas/colonias a las que SÍ llega el reparto, cada una con su tarifa.
   · Con zonas configuradas: el comensal elige la suya en el checkout y
     paga la tarifa de esa zona; si no aparece, solo puede pedir para
     recoger.
   · Sin zonas: el delivery no se restringe y se cobra la tarifa plana
     del tema (como hasta ahora).

   Tarifa 0 = envío gratis para esa zona. Desde la migración 104 esto vive
   en la tabla delivery_zones, no en el jsonb de restaurants.
   ============================================================ */

import { useActionState, useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { updateDeliveryZones, type ZonesState } from '@/lib/actions/restaurant';
import SaveBar from '@/components/admin/save-bar';
import { useFormDirty } from '@/lib/use-form-dirty';

const empty: ZonesState = null;

export interface ZoneDraft {
  nombre: string;
  tarifa: number;
}

export default function DeliveryZonesEditor({
  restaurantId, initialZones,
}: {
  restaurantId: string;
  initialZones: ZoneDraft[];
}) {
  const [state, formAction, isPending] = useActionState(updateDeliveryZones, empty);
  const { ref: formRef, dirty, markSaved } = useFormDirty();
  useEffect(() => { if (state && 'saved' in state) markSaved(); }, [state, markSaved]);
  const [zones, setZones] = useState<ZoneDraft[]>(initialZones);
  const [draft, setDraft] = useState('');

  function addZone() {
    const z = draft.trim();
    if (!z) return;
    if (!zones.some((x) => x.nombre.toLowerCase() === z.toLowerCase())) {
      setZones((prev) => [...prev, { nombre: z, tarifa: 0 }]);
    }
    setDraft('');
  }

  function setTarifa(nombre: string, valor: string) {
    const n = Number(valor);
    setZones((prev) => prev.map((z) =>
      z.nombre === nombre ? { ...z, tarifa: Number.isFinite(n) && n > 0 ? n : 0 } : z,
    ));
  }

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />

      <Glass variant="quiet" style={{ padding: 16 }}>
        {/* Título de la ficha como el de «Validación por mapa», no un rótulo
            en MAYÚSCULAS (auditoría 2026-10-02, T-11). */}
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', marginBottom: 4 }}>
          Zonas a las que llevas a domicilio
        </p>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 12, lineHeight: 1.5 }}>
          Si agregas zonas, el cliente debe elegir la suya al pedir a domicilio y
          paga la tarifa de esa zona; si la suya no está, solo podrá pedir para
          recoger. Sin zonas = entregas a cualquier dirección con la tarifa
          normal. Tarifa en 0 = envío gratis para esa zona.
        </p>

        {/* Zonas con su tarifa */}
        {zones.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {zones.map((z) => (
              <div
                key={z.nombre}
                className="glass-quiet"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px 8px 13px', borderRadius: 'var(--radius-md)',
                  fontSize: 13, fontWeight: 600, color: 'var(--u-text)',
                }}
              >
                <Icon name="mapPin" size={13} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>{z.nombre}</span>

                <label htmlFor={`tarifa-${z.nombre}`} style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 500 }}>
                  Envío
                </label>
                <input
                  id={`tarifa-${z.nombre}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={z.tarifa}
                  onChange={(e) => setTarifa(z.nombre, e.target.value)}
                  style={{
                    width: 84, background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                    border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)',
                    padding: '7px 9px', color: 'var(--u-text)', fontSize: 13, outline: 'none',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />

                <button
                  type="button"
                  onClick={() => setZones((prev) => prev.filter((x) => x.nombre !== z.nombre))}
                  className="press"
                  title={`Quitar ${z.nombre}`}
                  style={{
                    width: 22, height: 22, borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                    background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-3)',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
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
              flex: 1, background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
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

      <SaveBar dirty={dirty} pending={isPending} status={state} label="Guardar zonas" />
    </form>
  );
}
