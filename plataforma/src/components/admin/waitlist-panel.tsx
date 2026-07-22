'use client';

/* WaitlistPanel — cola en vivo de walk-ins sin reserva (Fase 3 auditoría de
   lanzamiento). Anotar → Avisar (con WhatsApp si hay teléfono) → Sentar. */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
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

export default function WaitlistPanel({ restaurantId, entries, recent, summary }: Props) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { label: 'Esperando', value: String(summary.waiting), accent: true },
          { label: 'Avisados', value: String(summary.notified) },
          { label: 'Espera promedio hoy', value: summary.avgWaitMinutesToday != null ? `${summary.avgWaitMinutesToday} min` : '—' },
        ].map(({ label, value, accent }) => (
          <Card key={label} className="p-3.5">
            <div style={{ fontSize: 24, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', fontFamily: 'var(--font-display)' }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', marginTop: 2 }}>{label}</div>
          </Card>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: 'var(--c-danger, #f87171)', fontSize: 13 }}>
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
                <div style={{ width: 8, height: 8, borderRadius: 99, background: w.status === 'NOTIFIED' ? '#4ade80' : '#fbbf24', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{w.customer_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                    {w.party_size} {w.party_size === 1 ? 'persona' : 'personas'} · {elapsedLabel(w.created_at, now)}
                    {w.phone ? ` · ${w.phone}` : ''}
                  </div>
                  {w.notes && <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3, fontStyle: 'italic' }}>{w.notes}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: w.status === 'NOTIFIED' ? '#4ade80' : '#fbbf24' }}>
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
                  <Button type="button" onClick={() => handleAction(w.id, markWaitlistSeated)} disabled={busy} size="sm" className="rounded-adm-full">
                    Sentar
                  </Button>
                  <Button type="button" onClick={() => handleAction(w.id, cancelWaitlistEntry)} disabled={busy} variant="outline" size="sm"
                    className="rounded-adm-full border-[rgba(248,113,113,0.3)] text-[#f87171]">
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
          <div className="t-kicker" style={{ fontSize: 10.5, marginBottom: 10 }}>Hoy más temprano</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recent.slice(0, 8).map((w) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', fontSize: 12.5, color: 'var(--u-text-3)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: w.status === 'SEATED' ? '#4ade80' : '#f87171', flexShrink: 0 }} />
                <span style={{ color: 'var(--u-text-2)', fontWeight: 600 }}>{w.customer_name}</span>
                <span>{w.party_size} {w.party_size === 1 ? 'persona' : 'personas'}</span>
                <span>· {w.status === 'SEATED' ? 'sentados' : 'cancelado'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
