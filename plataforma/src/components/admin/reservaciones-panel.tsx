'use client';

import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import {
  createReservation,
  updateReservationStatus,
  deleteReservation,
} from '@/lib/actions/reservaciones';
import type { Reservation, ReservationSummary } from '@/lib/db/reservaciones';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Props {
  restaurantId: string;
  reservations: Reservation[];
  summary: ReservationSummary;
  /** Mesas libres ahora mismo, para decir EN CUÁL se sienta la reserva
      (migración 128, M-04). Vacío = no queda ninguna, o el local no usa
      mesas numeradas: «En mesa →» sigue funcionando sin número. */
  freeTables: number[];
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
  PENDING: 'var(--c-warn)',
  CONFIRMED: 'var(--c-info)',
  SEATED: 'var(--c-ok)',
  COMPLETED: 'var(--u-text-3)',
  CANCELLED: 'var(--c-danger)',
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
const labelStyle: React.CSSProperties = FIELD_LABEL;

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

export default function ReservacionesPanel({ restaurantId, reservations, summary, freeTables }: Props) {
  const [tab, setTab] = useState<'activas' | 'nueva'>('activas');
  const { confirm, dialog } = useConfirm();
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
    });
  }

  /* La mesa elegida para cada reserva, mientras no llegan. Por reserva y no
     una sola: en un servicio entran varias a la vez. */
  const [mesaDe, setMesaDe] = useState<Record<string, string>>({});

  function handleStatus(id: string, status: ReservationStatus) {
    const mesa = Number(mesaDe[id]);
    setBusyId(id);
    startTransition(async () => {
      const res = await updateReservationStatus(
        restaurantId, id, status,
        status === 'SEATED' && Number.isFinite(mesa) && mesa > 0 ? mesa : null,
      );
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      setMesaDe((prev) => { const next = { ...prev }; delete next[id]; return next; });
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: '¿Eliminar esta reservación?' }))) return;
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteReservation(restaurantId, id);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
    });
  }

  const grouped = groupByDate(reservations);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {dialog}
      <StatGroup>
        <Stat label="Hoy" value={String(summary.today)} />
        <Stat label="Pendientes" value={String(summary.pending)} />
        <Stat label="Confirmadas" value={String(summary.confirmed)} />
        <Stat label="Total próximas" value={String(reservations.length)} />
      </StatGroup>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* «+ Nueva reservación» arriba a la derecha, como en el resto del panel,
          en vez de una pestaña que escondía la lista (auditoría 2026-10-02,
          T-09). Con la lista vacía la acción la trae el estado vacío. */}
      {tab === 'activas' && grouped.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={() => setTab('nueva')} className="rounded-adm-full">
            <Icon name="plus" size={15} /> Nueva reservación
          </Button>
        </div>
      )}

      {tab === 'nueva' ? (
        <Card className="p-5" style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 15, fontWeight: 650, marginBottom: 14 }}>Nueva reservación</p>
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
                <input style={inputStyle} type="number" inputMode="decimal" min={1} max={100} value={form.party_size} onChange={(e) => setField('party_size', parseInt(e.target.value) || 1)} required />
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
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar reservación'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setTab('activas')}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No hay reservaciones próximas"
          desc="Las reservaciones que se agenden aparecerán aquí, agrupadas por día."
          action={{ label: 'Crear primera reservación', onClick: () => setTab('nueva') }}
        />
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
                    <Card key={r.id} className="flex flex-wrap items-center gap-3 p-3.5">
                      <div style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: STATUS_COLOR[r.status], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{r.customer_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                          {formatTime(r.time)} · {r.party_size} {r.party_size === 1 ? 'persona' : 'personas'}
                          {r.table_number ? ` · mesa ${r.table_number}` : ''}
                          {r.customer_phone ? ` · ${r.customer_phone}` : ''}
                        </div>
                        {r.notes && <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3, fontStyle: 'italic' }}>{r.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[r.status] }}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {/* En qué mesa se sientan (M-04). Solo en el paso que
                            los mete al salón: en «Confirmar» o «Completar» un
                            número de mesa no significa nada. */}
                        {nextStatus === 'SEATED' && freeTables.length > 0 && (
                          <select
                            value={mesaDe[r.id] ?? ''}
                            onChange={(e) => setMesaDe((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            aria-label={`Mesa para ${r.customer_name}`}
                            style={{
                              height: 32, borderRadius: 'var(--radius-full)', padding: '0 10px',
                              border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
                              color: 'var(--u-text)', fontSize: 12.5, cursor: 'pointer',
                            }}
                          >
                            <option value="" style={{ color: 'var(--u-text)' }}>Sin mesa</option>
                            {freeTables.map((n) => (
                              <option key={n} value={n} style={{ color: 'var(--u-text)' }}>Mesa {n}</option>
                            ))}
                          </select>
                        )}
                        {nextStatus && (
                          <Button type="button" onClick={() => handleStatus(r.id, nextStatus)} disabled={busy} variant="secondary" size="sm" className="rounded-adm-full">
                            {nextStatus === 'SEATED' && mesaDe[r.id]
                              ? `En mesa ${mesaDe[r.id]} →`
                              : `${STATUS_LABEL[nextStatus]} →`}
                          </Button>
                        )}
                        {r.status !== 'CANCELLED' && (
                          <Button type="button" onClick={() => handleStatus(r.id, 'CANCELLED')} disabled={busy} variant="outline" size="sm"
                            className="rounded-adm-full border-[var(--c-danger-line)] text-[var(--c-danger)]">
                            Cancelar
                          </Button>
                        )}
                        {(r.status === 'CANCELLED' || r.status === 'COMPLETED') && (
                          <Button type="button" onClick={() => handleDelete(r.id)} disabled={busy} variant="ghost" size="icon" className="size-7">
                            <Icon name="trash" size={13} />
                          </Button>
                        )}
                      </div>
                    </Card>
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
