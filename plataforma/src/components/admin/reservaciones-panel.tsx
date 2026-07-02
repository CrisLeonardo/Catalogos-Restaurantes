'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import {
  createReservation,
  updateReservationStatus,
  deleteReservation,
} from '@/lib/actions/reservaciones';
import type { Reservation, ReservationSummary } from '@/lib/db/reservaciones';

interface Props {
  restaurantId: string;
  reservations: Reservation[];
  summary: ReservationSummary;
}

type ReservationStatus = Reservation['status'];

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  SEATED: 'En mesa',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const STATUS_COLOR: Record<ReservationStatus, string> = {
  PENDING: '#fbbf24',
  CONFIRMED: '#60a5fa',
  SEATED: '#4ade80',
  COMPLETED: 'var(--u-text-3)',
  CANCELLED: '#f87171',
};

const NEXT_STATUS: Partial<Record<ReservationStatus, ReservationStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'SEATED',
  SEATED: 'COMPLETED',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase' as const, marginBottom: 4, display: 'block',
};

function formatDate(date: string) {
  const d = new Date(date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Hoy';
  if (d.getTime() === tomorrow.getTime()) return 'Mañana';
  return d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function groupByDate(reservations: Reservation[]): [string, Reservation[]][] {
  const map = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function ReservacionesPanel({ restaurantId, reservations, summary }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'activas' | 'nueva'>('activas');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', party_size: 2,
    date: new Date().toISOString().slice(0, 10), time: '19:00', notes: '',
  });

  function setField(k: string, v: string | number) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createReservation(restaurantId, form);
      if (res.error) { setError(res.error); return; }
      setForm({ customer_name: '', customer_phone: '', party_size: 2, date: new Date().toISOString().slice(0, 10), time: '19:00', notes: '' });
      setTab('activas');
      router.refresh();
    });
  }

  function handleStatus(id: string, status: ReservationStatus) {
    setBusyId(id);
    startTransition(async () => {
      const res = await updateReservationStatus(restaurantId, id, status);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta reservación?')) return;
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteReservation(restaurantId, id);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  const grouped = groupByDate(reservations);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { label: 'Hoy', value: String(summary.today), accent: true },
          { label: 'Pendientes', value: String(summary.pending) },
          { label: 'Confirmadas', value: String(summary.confirmed) },
          { label: 'Total próximas', value: String(reservations.length) },
        ].map(({ label, value, accent }) => (
          <Glass key={label} variant="quiet" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', fontFamily: 'var(--font-display)' }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 2 }}>{label}</div>
          </Glass>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--u-hair)' }}>
        {([['activas', 'Reservaciones'], ['nueva', 'Nueva reservación']] as const).map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="press"
            style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--brand-accent)' : 'transparent'}`, color: tab === k ? 'var(--u-text)' : 'var(--u-text-3)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: -1 }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'nueva' ? (
        <Glass variant="quiet" style={{ padding: 20, maxWidth: 520 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nombre del cliente *</label>
                <input style={inputStyle} value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} required placeholder="Juan García" />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={inputStyle} value={form.customer_phone} onChange={(e) => setField('customer_phone', e.target.value)} placeholder="+502 0000-0000" />
              </div>
              <div>
                <label style={labelStyle}>Personas *</label>
                <input style={inputStyle} type="number" min={1} max={100} value={form.party_size} onChange={(e) => setField('party_size', parseInt(e.target.value) || 1)} required />
              </div>
              <div>
                <label style={labelStyle}>Fecha *</label>
                <input style={inputStyle} type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>Hora *</label>
                <input style={inputStyle} type="time" value={form.time} onChange={(e) => setField('time', e.target.value)} required />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notas</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Preferencias, alergia, ocasión especial…" />
              </div>
            </div>
            <button type="submit" disabled={isPending} className="press"
              style={{ padding: '10px 20px', background: 'var(--brand-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 14, cursor: isPending ? 'wait' : 'pointer', opacity: isPending ? 0.7 : 1, alignSelf: 'flex-start' }}>
              {isPending ? 'Guardando…' : 'Guardar reservación'}
            </button>
          </form>
        </Glass>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-3)' }}>
          <Icon name="calendar" size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>No hay reservaciones próximas</div>
          <button type="button" onClick={() => setTab('nueva')} className="press"
            style={{ marginTop: 12, padding: '8px 18px', background: 'var(--brand-accent)', color: '#fff', border: 'none', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Crear primera reservación
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(([date, list]) => (
            <div key={date}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--u-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {formatDate(date)} — {new Date(date + 'T00:00:00').toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map((r) => {
                  const nextStatus = NEXT_STATUS[r.status];
                  const busy = busyId === r.id && isPending;
                  return (
                    <Glass key={r.id} variant="quiet" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOR[r.status], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{r.customer_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                          {formatTime(r.time)} · {r.party_size} {r.party_size === 1 ? 'persona' : 'personas'}
                          {r.customer_phone ? ` · ${r.customer_phone}` : ''}
                        </div>
                        {r.notes && <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3, fontStyle: 'italic' }}>{r.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[r.status] }}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {nextStatus && (
                          <button type="button" onClick={() => handleStatus(r.id, nextStatus)} disabled={busy} className="press"
                            style={{ padding: '5px 12px', background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', border: 'none', borderRadius: 99, color: 'var(--u-text)', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>
                            {STATUS_LABEL[nextStatus]} →
                          </button>
                        )}
                        {r.status !== 'CANCELLED' && (
                          <button type="button" onClick={() => handleStatus(r.id, 'CANCELLED')} disabled={busy} className="press"
                            style={{ padding: '5px 10px', background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 99, color: '#f87171', fontSize: 11.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>
                            Cancelar
                          </button>
                        )}
                        {(r.status === 'CANCELLED' || r.status === 'COMPLETED') && (
                          <button type="button" onClick={() => handleDelete(r.id)} disabled={busy} className="press"
                            style={{ padding: '5px 10px', background: 'none', border: 'none', color: 'var(--u-text-4)', fontSize: 11.5, cursor: busy ? 'wait' : 'pointer' }}>
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </div>
                    </Glass>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
