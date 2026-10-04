'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { saveDriver, toggleDriverActive, type DriverState } from '@/lib/actions/drivers';
import type { Driver } from '@/lib/db/drivers';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';

/* ============================================================
   /admin/repartidores — alta y baja de repartidores
   ------------------------------------------------------------
   `profile_id` enlaza al repartidor con un usuario del personal para que
   pueda entrar a /repartidor desde su teléfono. Es opcional: un repartidor
   sin usuario igual recibe asignaciones, solo que no las ve en la app —
   el encargado le avisa. Así se puede empezar a usar el módulo sin crear
   un usuario para cada motorista el primer día.
   ============================================================ */

export default function DriversPanel({
  restaurantId, drivers, staff,
}: {
  restaurantId: string;
  drivers: Driver[];
  staff: { id: string; full_name: string | null }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, isPending] = useActionState<DriverState, FormData>(saveDriver, null);

  useEffect(() => {
    if (state && 'ok' in state) {
      setEditing(null);
      setShowForm(false);
    }
  }, [state, router]);

  const labelSt: React.CSSProperties = FIELD_LABEL;

  /* Antes: el formulario «Agregar repartidor» siempre abierto debajo de la
     lista y un «Repartidores» repetido bajo la barra. Ahora, como el resto
     del panel: «+ Nuevo repartidor» arriba a la derecha, el formulario solo
     cuando se pide (o al editar) y, sin nadie, el estado vacío con la misma
     acción (auditoría 2026-10-02, T-09 y T-10). */
  const formOpen = showForm || editing !== null;
  const closeForm = () => { setShowForm(false); setEditing(null); };

  return (
    <div className="adm-w-read" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, flex: '1 1 260px', lineHeight: 1.5 }}>
          Quién lleva los pedidos a domicilio. Desde Pedidos les asignas cada
          entrega, y ellos la marcan como entregada desde su teléfono.
        </p>
        {drivers.length > 0 && !formOpen && (
          <Button type="button" onClick={() => setShowForm(true)} className="shrink-0 rounded-adm-full">
            <Icon name="plus" size={15} /> Nuevo repartidor
          </Button>
        )}
      </div>

      {formOpen && (
        <Card className="p-5">
          <form action={formAction}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <input type="hidden" name="id" value={editing?.id ?? ''} />

            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
              {editing ? `Editar a ${editing.nombre}` : 'Nuevo repartidor'}
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={labelSt} htmlFor="d-nombre">Nombre</label>
              <input id="d-nombre" name="nombre" required className="adm-field"
                defaultValue={editing?.nombre ?? ''} key={`n-${editing?.id ?? 'new'}`} />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ marginBottom: 14, flex: '1 1 200px' }}>
                <label style={labelSt} htmlFor="d-tel">Teléfono</label>
                <input id="d-tel" name="telefono" className="adm-field"
                  defaultValue={editing?.telefono ?? ''} key={`t-${editing?.id ?? 'new'}`} />
              </div>
              <div style={{ marginBottom: 14, flex: '1 1 200px' }}>
                <label style={labelSt} htmlFor="d-veh">Vehículo</label>
                <input id="d-veh" name="vehiculo" className="adm-field" placeholder="Moto, bicicleta…"
                  defaultValue={editing?.vehiculo ?? ''} key={`v-${editing?.id ?? 'new'}`} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={labelSt}>Usuario del personal (opcional)</p>
              {/* El selector del panel y no el nativo del sistema (gris, con
                  la letra del sistema operativo) — auditoría 2026-10-02, AJU-16. */}
              <Select
                key={`p-${editing?.id ?? 'new'}`}
                name="profile_id"
                aria-label="Usuario del personal"
                defaultValue={editing?.profile_id ?? ''}
                placeholder="Sin acceso a la app"
                options={[
                  { value: '', label: 'Sin acceso a la app' },
                  ...staff.map((s) => ({ value: s.id, label: s.full_name ?? 'Sin nombre' })),
                ]}
              />
              <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 5 }}>
                Para que vea sus entregas en el teléfono, el usuario necesita además
                el permiso <strong>Reparto</strong> en Personal.
              </p>
            </div>

            {state && 'error' in state && (
              <p className="note note-danger" style={{ marginBottom: 12 }}>{state.error}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar'}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {drivers.length === 0 ? (
        !formOpen && (
          <EmptyState
            icon="truck"
            title="Aún no tienes repartidores"
            desc="Dalos de alta para asignarles cada entrega desde Pedidos. Con acceso a la app, la marcan como entregada desde su teléfono."
            action={{ label: 'Agregar el primero', onClick: () => setShowForm(true) }}
          />
        )
      ) : (
        <Card className="overflow-hidden p-0">
          {drivers.map((d, i) => (
            <div
              key={d.id}
              style={{
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 12, opacity: d.activo ? 1 : 0.55,
                borderTop: i > 0 ? '1px solid var(--u-hair)' : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>{d.nombre}</p>
                <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 3 }}>
                  {[d.telefono, d.vehiculo, d.profile_id ? 'con acceso a la app' : 'sin acceso a la app']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setEditing(d); }}>
                  Editar
                </Button>
                <form action={toggleDriverActive}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="activo" value={d.activo ? 'false' : 'true'} />
                  <Button type="submit" variant={d.activo ? 'ghost' : 'secondary'} size="sm">
                    {d.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </Card>
      )}

      <p style={{ fontSize: 12, color: 'var(--u-text-4)', display: 'flex', gap: 6, margin: 0 }}>
        <Icon name="truck" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Un repartidor desactivado no se borra: sigue siendo el responsable de las entregas que ya hizo.</span>
      </p>
    </div>
  );
}
