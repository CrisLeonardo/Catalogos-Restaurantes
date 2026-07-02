'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { createCoupon, toggleCoupon, deleteCoupon } from '@/lib/actions/cupones';
import type { Coupon } from '@/lib/db/cupones';

interface Props {
  restaurantId: string;
  coupons: Coupon[];
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase' as const, marginBottom: 4, display: 'block',
};

const emptyForm = {
  code: '', description: '', discount_type: 'PERCENT' as 'PERCENT' | 'FIXED',
  discount_value: '', min_order: '', max_uses: '', valid_until: '',
};

function couponStatus(c: Coupon): { label: string; color: string } {
  if (!c.is_active) return { label: 'Pausado', color: 'var(--u-text-4)' };
  const now = new Date();
  if (c.valid_until && new Date(c.valid_until) < now) return { label: 'Vencido', color: '#f87171' };
  if (c.max_uses && c.uses >= c.max_uses) return { label: 'Agotado', color: '#fbbf24' };
  return { label: 'Activo', color: '#4ade80' };
}

export default function CuponesPanel({ restaurantId, coupons }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(coupons.length === 0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function setField(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createCoupon(restaurantId, {
        code: form.code,
        description: form.description || undefined,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value) || 0,
        min_order: form.min_order ? parseFloat(form.min_order) : undefined,
        max_uses: form.max_uses ? parseInt(form.max_uses) : undefined,
        valid_until: form.valid_until || undefined,
      });
      if (res.error) { setError(res.error); return; }
      setForm(emptyForm);
      setShowForm(false);
      router.refresh();
    });
  }

  function handleToggle(id: string, current: boolean) {
    setBusyId(id);
    startTransition(async () => {
      const res = await toggleCoupon(restaurantId, id, !current);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este cupón? Esta acción no se puede deshacer.')) return;
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteCoupon(restaurantId, id);
      setBusyId(null);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  const active = coupons.filter((c) => {
    const s = couponStatus(c);
    return s.label === 'Activo';
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header con stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Glass variant="quiet" style={{ padding: '10px 18px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--brand-accent)', fontFamily: 'var(--font-display)' }}>{active}</span>
            <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>activos</span>
          </Glass>
          <Glass variant="quiet" style={{ padding: '10px 18px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--u-text)', fontFamily: 'var(--font-display)' }}>{coupons.length}</span>
            <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>total</span>
          </Glass>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="press"
          style={{ padding: '8px 16px', background: 'var(--admin-panel-btn)', color: 'var(--admin-panel-btn-text)', border: 'none', borderRadius: 99, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="plus" size={15} /> Nuevo cupón
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Formulario nuevo cupón */}
      {showForm && (
        <Glass variant="quiet" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)', marginBottom: 14 }}>Crear cupón</div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Código *</label>
                <input style={inputStyle} value={form.code} onChange={(e) => setField('code', e.target.value.toUpperCase())} required placeholder="VERANO20" />
              </div>
              <div>
                <label style={labelStyle}>Tipo *</label>
                <select style={{ ...inputStyle, background: '#1a1a1c', colorScheme: 'dark' }} value={form.discount_type} onChange={(e) => setField('discount_type', e.target.value)}>
                  <option value="PERCENT" style={{ background: '#1a1a1c', color: '#f0f0f0' }}>Porcentaje (%)</option>
                  <option value="FIXED" style={{ background: '#1a1a1c', color: '#f0f0f0' }}>Monto fijo (Q)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Valor * ({form.discount_type === 'PERCENT' ? '%' : 'Q'})</label>
                <input style={inputStyle} type="number" min={0.01} max={form.discount_type === 'PERCENT' ? 100 : undefined} step={0.01} value={form.discount_value} onChange={(e) => setField('discount_value', e.target.value)} required placeholder={form.discount_type === 'PERCENT' ? '10' : '25.00'} />
              </div>
              <div>
                <label style={labelStyle}>Orden mínima (Q)</label>
                <input style={inputStyle} type="number" min={0} step={0.01} value={form.min_order} onChange={(e) => setField('min_order', e.target.value)} placeholder="Sin mínimo" />
              </div>
              <div>
                <label style={labelStyle}>Máx. de usos</label>
                <input style={inputStyle} type="number" min={1} value={form.max_uses} onChange={(e) => setField('max_uses', e.target.value)} placeholder="Ilimitado" />
              </div>
              <div>
                <label style={labelStyle}>Válido hasta</label>
                <input style={inputStyle} type="date" value={form.valid_until} onChange={(e) => setField('valid_until', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Descripción interna</label>
                <input style={inputStyle} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="ej. Campaña verano 2026" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button type="submit" disabled={isPending} className="press"
                style={{ padding: '9px 20px', background: 'var(--admin-panel-btn)', color: 'var(--admin-panel-btn-text)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13.5, cursor: isPending ? 'wait' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
                {isPending ? 'Guardando…' : 'Crear cupón'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="press"
                style={{ padding: '9px 16px', background: 'none', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', color: 'var(--u-text-3)', fontSize: 13.5, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </form>
        </Glass>
      )}

      {/* Lista de cupones */}
      {coupons.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--u-text-3)' }}>
          <Icon name="ticket" size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Aún no tienes cupones</div>
          <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 4 }}>Crea tu primer código de descuento.</div>
        </div>
      ) : coupons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {coupons.map((c) => {
            const { label: statusLabel, color: statusColor } = couponStatus(c);
            const busy = busyId === c.id && isPending;
            return (
              <Glass key={c.id} variant="quiet" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', opacity: busy ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', flexShrink: 0 }}>
                  <Icon name="ticket" size={18} style={{ color: statusLabel === 'Activo' ? 'var(--brand-accent)' : 'var(--u-text-4)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--u-text)', letterSpacing: '0.03em' }}>{c.code}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>● {statusLabel}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                    <span>{c.discount_type === 'PERCENT' ? `${c.discount_value}% desc.` : `Q${Number(c.discount_value).toFixed(2)} desc.`}</span>
                    {c.min_order && <span>Min: Q{Number(c.min_order).toFixed(2)}</span>}
                    {c.max_uses && <span>Usos: {c.uses}/{c.max_uses}</span>}
                    {!c.max_uses && c.uses > 0 && <span>Usos: {c.uses}</span>}
                    {c.valid_until && <span>Vence: {new Date(c.valid_until).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                  {c.description && <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>{c.description}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {/* Toggle activo/inactivo */}
                  <button type="button" onClick={() => handleToggle(c.id, c.is_active)} disabled={busy} className="press"
                    style={{ width: 38, height: 22, borderRadius: 999, flexShrink: 0, padding: 3, background: c.is_active ? 'var(--admin-panel-btn)' : 'color-mix(in srgb, var(--u-text) 18%, transparent)', border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'flex', justifyContent: c.is_active ? 'flex-end' : 'flex-start', transition: 'background 180ms' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 999, background: c.is_active ? 'var(--admin-panel-btn-text)' : '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                  </button>
                  <button type="button" onClick={() => handleDelete(c.id)} disabled={busy} className="press"
                    style={{ padding: '5px 8px', background: 'none', border: 'none', color: 'var(--u-text-4)', cursor: busy ? 'wait' : 'pointer' }}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </Glass>
            );
          })}
        </div>
      )}
    </div>
  );
}
