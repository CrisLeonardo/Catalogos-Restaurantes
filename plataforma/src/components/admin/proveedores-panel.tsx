'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { saveSupplier, deleteSupplier, createPurchaseOrder, setPurchaseOrderStatus, type POLineInput } from '@/lib/actions/suppliers';
import type { Supplier, PurchaseOrder, SupplierSummary } from '@/lib/db/suppliers';

interface Props {
  restaurantId: string;
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  summary: SupplierSummary;
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 4, display: 'block',
};
function money(n: number) {
  return 'Q ' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: '#9aa3ad', ENVIADA: '#f59e0b', RECIBIDA: '#22c55e', CANCELADA: '#ef4444',
};

export default function ProveedoresPanel({ restaurantId, suppliers, orders, summary }: Props) {
  const [tab, setTab] = useState<'ordenes' | 'proveedores'>('ordenes');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Proveedores" value={String(summary.suppliers)} />
        <Kpi label="Órdenes abiertas" value={String(summary.ordenesAbiertas)} accent />
        <Kpi label="Comprado este mes" value={money(summary.gastoMes)} />
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--u-hair)' }}>
        {([['ordenes', 'Órdenes de compra'], ['proveedores', 'Proveedores']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="press"
            style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--brand-accent)' : 'transparent'}`, color: tab === k ? 'var(--u-text)' : 'var(--u-text-3)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'proveedores'
        ? <SuppliersTab restaurantId={restaurantId} suppliers={suppliers} />
        : <OrdersTab restaurantId={restaurantId} suppliers={suppliers} orders={orders} />}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Glass variant="quiet" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="t-kicker" style={{ fontSize: 9.5 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', lineHeight: 1 }}>{value}</span>
    </Glass>
  );
}

/* ── Proveedores ────────────────────────────────────────────── */

type EditState = { id?: string; name: string; contact_name: string; phone: string; email: string; notes: string } | null;

function SuppliersTab({ restaurantId, suppliers }: { restaurantId: string; suppliers: Supplier[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<EditState>(null);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!edit) return;
    setError(null);
    start(async () => {
      const res = await saveSupplier(restaurantId, edit);
      if (res.error) { setError(res.error); return; }
      setEdit(null);
      router.refresh();
    });
  }
  function remove(s: Supplier) {
    if (!window.confirm(`¿Eliminar al proveedor "${s.name}"?`)) return;
    start(async () => {
      const res = await deleteSupplier(restaurantId, s.id);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setEdit({ name: '', contact_name: '', phone: '', email: '', notes: '' })} className="press btn-accent" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>+ Nuevo proveedor</button>
      </div>
      {error && <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>{error}</div>}

      {edit && (
        <Glass variant="quiet" style={{ padding: 16 }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{edit.id ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div><label style={labelStyle}>Nombre *</label><input style={inputStyle} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label style={labelStyle}>Contacto</label><input style={inputStyle} value={edit.contact_name} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} /></div>
            <div><label style={labelStyle}>Teléfono</label><input style={inputStyle} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><label style={labelStyle}>Email</label><input style={inputStyle} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Notas</label><input style={inputStyle} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} disabled={isPending} className="press btn-accent" style={{ padding: '8px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>{isPending ? 'Guardando…' : 'Guardar'}</button>
            <button onClick={() => setEdit(null)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-full)', fontSize: 13, background: 'none', border: '1px solid var(--u-hair-2)', color: 'var(--u-text-3)', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </Glass>
      )}

      {suppliers.length === 0 && !edit ? (
        <Glass variant="quiet" style={{ padding: 28, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>Aún no tienes proveedores registrados.</Glass>
      ) : (
        <Glass variant="quiet" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
              {['Proveedor', 'Contacto', 'Teléfono', ''].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--u-hair)', opacity: s.active ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{s.name}{!s.active && <span style={{ fontSize: 10, color: 'var(--u-text-4)', marginLeft: 6 }}>inactivo</span>}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--u-text-3)' }}>{s.contact_name || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--u-text-3)' }}>{s.phone || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEdit({ id: s.id, name: s.name, contact_name: s.contact_name, phone: s.phone, email: s.email, notes: s.notes })} className="press" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--u-hair-2)', background: 'none', cursor: 'pointer', color: 'var(--u-text-2)' }}><Icon name="edit" size={13} /></button>
                      <button onClick={() => remove(s)} disabled={isPending} className="press" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(220,50,50,0.2)', background: 'none', cursor: 'pointer', color: '#f87171' }}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}
    </div>
  );
}

/* ── Órdenes de compra ──────────────────────────────────────── */

type DraftLine = { descripcion: string; cantidad: string; unidad: string; costo_unitario: string };

function OrdersTab({ restaurantId, suppliers, orders }: { restaurantId: string; suppliers: Supplier[]; orders: PurchaseOrder[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ descripcion: '', cantidad: '', unidad: 'unidad', costo_unitario: '' }]);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((a, l) => a + (parseFloat(l.cantidad) || 0) * (parseFloat(l.costo_unitario) || 0), 0);

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function reset() {
    setCreating(false); setSupplierId(''); setNotes('');
    setLines([{ descripcion: '', cantidad: '', unidad: 'unidad', costo_unitario: '' }]);
  }
  function create() {
    setError(null);
    const payload: POLineInput[] = lines.map((l) => ({ descripcion: l.descripcion, cantidad: parseFloat(l.cantidad) || 0, unidad: l.unidad, costo_unitario: parseFloat(l.costo_unitario) || 0 }));
    start(async () => {
      const res = await createPurchaseOrder(restaurantId, supplierId || null, notes, payload);
      if (res.error) { setError(res.error); return; }
      reset();
      router.refresh();
    });
  }
  function changeStatus(po: PurchaseOrder, estado: 'ENVIADA' | 'RECIBIDA' | 'CANCELADA') {
    start(async () => {
      const res = await setPurchaseOrderStatus(restaurantId, po.id, estado);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {!creating && <button onClick={() => setCreating(true)} className="press btn-accent" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>+ Nueva orden</button>}
      </div>
      {error && <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>{error}</div>}

      {creating && (
        <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>Nueva orden de compra</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Proveedor</label>
              <select style={inputStyle} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Sin asignar</option>
                {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Notas</label><input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Entrega, referencia…" /></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Renglones</label>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px 32px', gap: 8, alignItems: 'center' }}>
                <input style={inputStyle} placeholder="Descripción (insumo)" value={l.descripcion} onChange={(e) => setLine(i, { descripcion: e.target.value })} />
                <input style={{ ...inputStyle, textAlign: 'right' }} type="number" min="0" step="0.001" placeholder="Cant." value={l.cantidad} onChange={(e) => setLine(i, { cantidad: e.target.value })} />
                <input style={inputStyle} placeholder="Unidad" value={l.unidad} onChange={(e) => setLine(i, { unidad: e.target.value })} />
                <input style={{ ...inputStyle, textAlign: 'right' }} type="number" min="0" step="0.0001" placeholder="Costo Q" value={l.costo_unitario} onChange={(e) => setLine(i, { costo_unitario: e.target.value })} />
                <button type="button" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(220,50,50,0.2)', background: 'none', cursor: 'pointer', color: '#f87171' }}><Icon name="x" size={12} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setLines((ls) => [...ls, { descripcion: '', cantidad: '', unidad: 'unidad', costo_unitario: '' }])} className="press" style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', fontSize: 12.5, color: 'var(--u-text-2)' }}>+ Renglón</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--u-hair)', paddingTop: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Total: <span style={{ color: 'var(--brand-accent)', fontFamily: 'var(--ui-font-mono)' }}>{money(total)}</span></span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={create} disabled={isPending} className="press btn-accent" style={{ padding: '8px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>{isPending ? 'Creando…' : 'Crear orden'}</button>
              <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 'var(--radius-full)', fontSize: 13, background: 'none', border: '1px solid var(--u-hair-2)', color: 'var(--u-text-3)', cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </Glass>
      )}

      {orders.length === 0 && !creating ? (
        <Glass variant="quiet" style={{ padding: 28, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>Aún no has creado órdenes de compra.</Glass>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((po) => (
            <Glass key={po.id} variant="quiet" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Orden #{String(po.folio).padStart(4, '0')}</div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{po.supplier_name || 'Sin proveedor'} · {new Date(po.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `${ESTADO_COLOR[po.estado]}22`, color: ESTADO_COLOR[po.estado] }}>{po.estado}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                {(po.items ?? []).map((it) => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--u-text-2)' }}>
                    <span>{it.cantidad} {it.unidad} · {it.descripcion}</span>
                    <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money(Number(it.subtotal))}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{money(Number(po.total))}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {po.estado === 'BORRADOR' && <ActionBtn label="Marcar enviada" onClick={() => changeStatus(po, 'ENVIADA')} disabled={isPending} />}
                  {(po.estado === 'BORRADOR' || po.estado === 'ENVIADA') && <ActionBtn label="Recibida" accent onClick={() => changeStatus(po, 'RECIBIDA')} disabled={isPending} />}
                  {(po.estado === 'BORRADOR' || po.estado === 'ENVIADA') && <ActionBtn label="Cancelar" danger onClick={() => changeStatus(po, 'CANCELADA')} disabled={isPending} />}
                </div>
              </div>
            </Glass>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, accent, danger }: { label: string; onClick: () => void; disabled?: boolean; accent?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="press" style={{
      padding: '6px 12px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, cursor: disabled ? 'wait' : 'pointer',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.3)' : accent ? 'transparent' : 'var(--u-hair-2)'}`,
      background: accent ? 'var(--brand-accent)' : danger ? 'rgba(239,68,68,0.1)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
      color: accent ? '#fff' : danger ? '#f87171' : 'var(--u-text-2)',
    }}>{label}</button>
  );
}
