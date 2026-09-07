'use client';

/* WaitlistPanel — cola en vivo de walk-ins sin reserva (Fase 3 auditoría de
   lanzamiento). Anotar → Avisar (con WhatsApp si hay teléfono) → Sentar. */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Stat, StatGroup } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import {
  addToWaitlist,
  markWaitlistNotified,
  markWaitlistSeated,
  cancelWaitlistEntry,
} from '@/lib/actions/waitlist';
import type { WaitlistEntry, WaitlistSummary } from '@/lib/db/waitlist';

interface Props {
  restaurantId: string;
  entries: WaitlistEntry[];
  recent: WaitlistEntry[];
  summary: WaitlistSummary;
  /** Mesas sin gente ni turno abierto, para sentar ahí a quien esperaba
      (migración 128, M-04). Vacío = el local no usa mesas numeradas, o no
      queda ninguna: entonces «Sentar» funciona como siempre, sin mesa. */
  freeTables: number[];
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase' as const, marginBottom: 4, display: 'block',
};

/** "hace 12 min" / "hace 1h 5min" — se recalcula solo con el reloj vivo. */
function elapsedLabel(from: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
  if (mins < 1) return 'recién llegó';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `hace ${h}h${m > 0 ? ` ${m}min` : ''}`;
}

function whatsappHref(phone: string, restaurantName: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`¡Hola! Ya tenemos mesa lista para ustedes en ${restaurantName || 'el restaurante'}. Te esperamos 🙂`);
  return `https://wa.me/${digits}?text=${msg}`;
}

export default function WaitlistPanel({ restaurantId, entries, recent, summary, freeTables }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'cola' | 'nueva'>('cola');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* La mesa elegida para cada quien, mientras no se les sienta. Por entrada
     y no una sola: el host puede tener dos grupos a punto de entrar. */
  const [mesaDe, setMesaDe] = useState<Record<string, string>>({});

  const [form, setForm] = useState({ customer_name: '', party_size: 2, phone: '', notes: '' });
  function setField(k: string, v: string | number) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addToWaitlist(restaurantId, form);
      if (res.error) { setError(res.error); return; }
      setForm({ customer_name: '', party_size: 2, phone: '', notes: '' });
      setTab('cola');
      router.refresh();
    });
  }

  function handleAction(id: string, action: (restaurantId: string, id: string) => Promise<{ error?: string }>) {
    setBusyId(id);
    startTransition(async () => {
      const res = await action(restaurantId, id);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  /** Sentarlos, con mesa si se eligió una. */
  function handleSeat(id: string) {
    const mesa = Number(mesaDe[id]);
    setBusyId(id);
    startTransition(async () => {
      const res = await markWaitlistSeated(restaurantId, id, Number.isFinite(mesa) && mesa > 0 ? mesa : null);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      setMesaDe((prev) => { const next = { ...prev }; delete next[id]; return next; });
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <StatGroup>
        <Stat label="Esperando" value={String(summary.waiting)} />
        <Stat label="Avisados" value={String(summary.notified)} />
        <Stat
          label="Espera promedio hoy"
          value={summary.avgWaitMinutesToday != null ? `${summary.avgWaitMinutesToday} min` : '—'}
        />
      </StatGroup>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--u-hair)' }}>
        {([['cola', 'En espera'], ['nueva', 'Agregar grupo']] as const).map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="press"
            style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--brand-accent)' : 'transparent'}`, color: tab === k ? 'var(--u-text)' : 'var(--u-text-3)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: -1 }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'nueva' ? (
        <Card className="p-5" style={{ maxWidth: 480 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nombre del grupo *</label>
              <input style={inputStyle} value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} required placeholder="Familia Pérez" autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Personas *</label>
                <input style={inputStyle} type="number" inputMode="decimal" min={1} max={100} value={form.party_size} onChange={(e) => setField('party_size', parseInt(e.target.value) || 1)} required />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={inputStyle} value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="Opcional — para avisar por WhatsApp" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notas</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Preferencia de mesa, ocasión especial…" />
            </div>
            <Button type="submit" disabled={isPending} className="self-start">
              {isPending ? 'Agregando…' : 'Agregar a la lista'}
            </Button>
          </form>
        </Card>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-3)' }}>
          <Icon name="users" size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Nadie está esperando mesa ahora</div>
          <Button type="button" onClick={() => setTab('nueva')} className="mt-3 rounded-adm-full" size="sm">
            Agregar un grupo
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((w) => {
            const busy = busyId === w.id && isPending;
            return (
              <Card key={w.id} className="flex flex-wrap items-center gap-3 p-3.5">
                <div style={{ width: 8, height: 8, borderRadius: 99, background: w.status === 'NOTIFIED' ? 'var(--c-ok)' : 'var(--c-warn)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{w.customer_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                    {w.party_size} {w.party_size === 1 ? 'persona' : 'personas'} · {elapsedLabel(w.created_at, now)}
                    {w.phone ? ` · ${w.phone}` : ''}
                  </div>
                  {w.notes && <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3, fontStyle: 'italic' }}>{w.notes}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: w.status === 'NOTIFIED' ? 'var(--c-ok)' : 'var(--c-warn)' }}>
                    {w.status === 'NOTIFIED' ? 'Avisado' : 'Esperando'}
                  </span>
                  {w.status === 'WAITING' && w.phone && (
                    <a
                      href={whatsappHref(w.phone, '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleAction(w.id, markWaitlistNotified)}
                      className="press"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999, background: '#25D366', color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}
                    >
                      <Icon name="whatsapp" size={13} /> Avisar
                    </a>
                  )}
                  {w.status === 'WAITING' && !w.phone && (
                    <Button type="button" onClick={() => handleAction(w.id, markWaitlistNotified)} disabled={busy} variant="secondary" size="sm" className="rounded-adm-full">
                      Avisar
                    </Button>
                  )}
                  {/* En qué mesa (M-04). Antes «Sentar» marcaba la ficha y el
                      salón no se enteraba: la mesa seguía saliendo libre. */}
                  {freeTables.length > 0 && (
                    <select
                      value={mesaDe[w.id] ?? ''}
                      onChange={(e) => setMesaDe((prev) => ({ ...prev, [w.id]: e.target.value }))}
                      aria-label={`Mesa para ${w.customer_name}`}
                      style={{
                        height: 32, borderRadius: 999, padding: '0 10px',
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
                  <Button
                    type="button"
                    onClick={() => handleSeat(w.id)}
                    disabled={busy}
                    size="sm"
                    className="rounded-adm-full"
                  >
                    {mesaDe[w.id] ? `Sentar en ${mesaDe[w.id]}` : 'Sentar'}
                  </Button>
                  <Button type="button" onClick={() => handleAction(w.id, cancelWaitlistEntry)} disabled={busy} variant="outline" size="sm"
                    className="rounded-adm-full border-[var(--c-danger-line)] text-[var(--c-danger)]">
                    Cancelar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'cola' && recent.length > 0 && (
        <div>
          <div className="adm-label" style={{ marginBottom: 10 }}>Hoy más temprano</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.slice(0, 8).map((w) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', fontSize: 12.5, color: 'var(--u-text-3)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: w.status === 'SEATED' ? 'var(--c-ok)' : 'var(--c-danger)', flexShrink: 0 }} />
                <span style={{ color: 'var(--u-text-2)', fontWeight: 600 }}>{w.customer_name}</span>
                <span>{w.party_size} {w.party_size === 1 ? 'persona' : 'personas'}</span>
                <span>
                  · {w.status === 'SEATED'
                    ? `sentados${w.table_number ? ` en la mesa ${w.table_number}` : ''}`
                    : 'cancelado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
