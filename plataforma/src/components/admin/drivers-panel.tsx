'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { saveDriver, toggleDriverActive, type DriverState } from '@/lib/actions/drivers';
import type { Driver } from '@/lib/db/drivers';

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
  const [state, formAction, isPending] = useActionState<DriverState, FormData>(saveDriver, null);

  useEffect(() => {
    if (state && 'ok' in state) {
      setEditing(null);
      router.refresh();
    }
  }, [state, router]);

  const labelSt: React.CSSProperties = {
    fontSize: 10, color: 'var(--u-text-3)', fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };
  const inputSt: React.CSSProperties = {
    width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
    border: '1px solid var(--u-hair)', borderRadius: 11, padding: '11px 13px',
    color: 'var(--u-text)', fontSize: 14, outline: 'none',
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Repartidores</h1>
      <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 22 }}>
        Quién lleva los pedidos a domicilio. Desde Pedidos les asignás cada
        entrega, y ellos la marcan como entregada desde su teléfono.
      </p>

      {drivers.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 18 }}>
          Todavía no hay repartidores dados de alta.
        </p>
      )}

      {drivers.map((d) => (
        <div
          key={d.id}
          style={{
            border: '1px solid var(--u-hair)', borderRadius: 14, padding: 14,
            marginBottom: 10, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: 12, opacity: d.activo ? 1 : 0.55,
          }}
        >
          <div>
            <p style={{ fontSize: 15, fontWeight: 600 }}>{d.nombre}</p>
            <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 3 }}>
              {[d.telefono, d.vehiculo, d.profile_id ? 'con acceso a la app' : 'sin acceso a la app']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => setEditing(d)}>
              Editar
            </button>
            <form action={toggleDriverActive}>
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="activo" value={d.activo ? 'false' : 'true'} />
              <button type="submit" className={`chip ${d.activo ? 'chip-danger' : 'chip-ok'}`} style={{ cursor: 'pointer' }}>
                {d.activo ? 'Desactivar' : 'Activar'}
              </button>
            </form>
          </div>
        </div>
      ))}

      <form action={formAction} style={{ marginTop: 26 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input type="hidden" name="id" value={editing?.id ?? ''} />

        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
          {editing ? `Editar a ${editing.nombre}` : 'Agregar repartidor'}
        </h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelSt} htmlFor="d-nombre">Nombre</label>
          <input id="d-nombre" name="nombre" required style={inputSt}
            defaultValue={editing?.nombre ?? ''} key={`n-${editing?.id ?? 'new'}`} />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ marginBottom: 14, flex: '1 1 200px' }}>
            <label style={labelSt} htmlFor="d-tel">Teléfono</label>
            <input id="d-tel" name="telefono" style={inputSt}
              defaultValue={editing?.telefono ?? ''} key={`t-${editing?.id ?? 'new'}`} />
          </div>
          <div style={{ marginBottom: 14, flex: '1 1 200px' }}>
            <label style={labelSt} htmlFor="d-veh">Vehículo</label>
            <input id="d-veh" name="vehiculo" style={inputSt} placeholder="Moto, bicicleta…"
              defaultValue={editing?.vehiculo ?? ''} key={`v-${editing?.id ?? 'new'}`} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelSt} htmlFor="d-profile">Usuario del personal (opcional)</label>
          <select id="d-profile" name="profile_id" style={inputSt}
            defaultValue={editing?.profile_id ?? ''} key={`p-${editing?.id ?? 'new'}`}>
            <option value="">Sin acceso a la app</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name ?? s.id}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 5 }}>
            Para que vea sus entregas en el teléfono, el usuario necesita además
            el permiso <strong>Reparto</strong> en Personal.
          </p>
        </div>

        {state && 'error' in state && (
          <p className="chip chip-danger" style={{ display: 'block', whiteSpace: 'normal', borderRadius: 12, padding: 10, marginBottom: 12, lineHeight: 1.5 }}>
            {state.error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar'}
          </button>
          {editing && (
            <button type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => setEditing(null)}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 22, display: 'flex', gap: 6 }}>
        <Icon name="truck" size={12} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Un repartidor desactivado no se borra: sigue siendo el responsable de las entregas que ya hizo.</span>
      </p>
    </div>
  );
}
