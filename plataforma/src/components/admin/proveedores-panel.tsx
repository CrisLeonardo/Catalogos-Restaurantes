'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { saveSupplier, deleteSupplier, createPurchaseOrder, setPurchaseOrderStatus, type POLineInput } from '@/lib/actions/suppliers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { Supplier, PurchaseOrder, SupplierSummary, PurchaseableProduct, PurchaseableIngredient } from '@/lib/db/suppliers';
import { fmtMoney } from '@/lib/money';

interface Props {
  restaurantId: string;
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  summary: SupplierSummary;
  products: PurchaseableProduct[];
  ingredients: PurchaseableIngredient[];
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
  return fmtMoney(Number(n));
}
const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: '#9aa3ad', ENVIADA: 'var(--c-warn)', RECIBIDA: 'var(--c-ok)', CANCELADA: 'var(--c-danger)',
};

export default function ProveedoresPanel({ restaurantId, suppliers, orders, summary, products, ingredients }: Props) {
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
        : <OrdersTab restaurantId={restaurantId} suppliers={suppliers} orders={orders} products={products} ingredients={ingredients} />}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 p-3.5">
      <span className="adm-label">{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', lineHeight: 1 }}>{value}</span>
    </Card>
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
        <Button onClick={() => setEdit({ name: '', contact_name: '', phone: '', email: '', notes: '' })} className="rounded-adm-full">+ Nuevo proveedor</Button>
      </div>
      {error && <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 13 }}>{error}</div>}

      {edit && (
        <Card className="p-4">
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{edit.id ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div><label style={labelStyle}>Nombre *</label><input style={inputStyle} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label style={labelStyle}>Contacto</label><input style={inputStyle} value={edit.contact_name} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} /></div>
            <div><label style={labelStyle}>Teléfono</label><input style={inputStyle} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><label style={labelStyle}>Email</label><input style={inputStyle} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Notas</label><input style={inputStyle} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button onClick={save} disabled={isPending} size="sm" className="rounded-adm-full">{isPending ? 'Guardando…' : 'Guardar'}</Button>
            <Button onClick={() => setEdit(null)} variant="outline" size="sm" className="rounded-adm-full">Cancelar</Button>
          </div>
        </Card>
      )}

      {suppliers.length === 0 && !edit ? (
        <EmptyState
          icon="truck"
          title="Aún no tenés proveedores registrados"
          desc="Registrá a quién le comprás para llevar el control de tus órdenes de compra."
          action={{ label: 'Agregar el primero', onClick: () => setEdit({ name: '', contact_name: '', phone: '', email: '', notes: '' }) }}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          {/* En móvil se oculta "Contacto" para que nombre/teléfono/acciones
              quepan sin desbordar; los botones crecen a target táctil cómodo. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
              {['Proveedor', 'Contacto', 'Teléfono', ''].map((h) => <th key={h} className={h === 'Contacto' ? 'hide-mobile' : undefined} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--u-hair)', opacity: s.active ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{s.name}{!s.active && <span style={{ fontSize: 10, color: 'var(--u-text-4)', marginLeft: 6 }}>inactivo</span>}</td>
                  <td className="hide-mobile" style={{ padding: '10px 12px', color: 'var(--u-text-3)' }}>{s.contact_name || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--u-text-3)' }}>{s.phone || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button onClick={() => setEdit({ id: s.id, name: s.name, contact_name: s.contact_name, phone: s.phone, email: s.email, notes: s.notes })} variant="outline" size="icon" className="size-9" title="Editar" aria-label={`Editar ${s.name}`}><Icon name="edit" size={14} /></Button>
                      <Button onClick={() => remove(s)} disabled={isPending} variant="outline" size="icon" className="size-9 border-[var(--c-danger-line)] text-[var(--c-danger)]" title="Eliminar" aria-label={`Eliminar ${s.name}`}><Icon name="trash" size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ── Órdenes de compra ──────────────────────────────────────── */

type DraftLine = { descripcion: string; cantidad: string; unidad: string; costo_unitario: string; linkValue: string };
const EMPTY_LINE: DraftLine = { descripcion: '', cantidad: '', unidad: 'unidad', costo_unitario: '', linkValue: '' };

function OrdersTab({
  restaurantId, suppliers, orders, products, ingredients,
}: {
  restaurantId: string; suppliers: Supplier[]; orders: PurchaseOrder[];
  products: PurchaseableProduct[]; ingredients: PurchaseableIngredient[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const linkOptions = [
    { value: '', label: 'Sin vincular (solo texto)' },
    ...products.map((p) => ({ value: `p:${p.id}`, label: `📦 ${p.name}` })),
    ...ingredients.map((i) => ({ value: `i:${i.id}`, label: `🧂 ${i.name} (${i.unit})` })),
  ];

  const total = lines.reduce((a, l) => a + (parseFloat(l.cantidad) || 0) * (parseFloat(l.costo_unitario) || 0), 0);

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function setLink(i: number, value: string) {
    setLines((ls) => ls.map((l, j) => {
      if (j !== i) return l;
      if (!value) return { ...l, linkValue: '' };
      const [prefix, id] = value.split(':');
      if (prefix === 'p') {
        const prod = products.find((p) => p.id === id);
        return { ...l, linkValue: value, descripcion: prod?.name ?? l.descripcion, unidad: 'unidad' };
      }
      const ing = ingredients.find((x) => x.id === id);
      return { ...l, linkValue: value, descripcion: ing?.name ?? l.descripcion, unidad: ing?.unit ?? l.unidad };
    }));
  }
  function reset() {
    setCreating(false); setSupplierId(''); setNotes('');
    setLines([{ ...EMPTY_LINE }]);
  }
  function create() {
    setError(null);
    const payload: POLineInput[] = lines.map((l) => {
      const [prefix, id] = l.linkValue ? l.linkValue.split(':') : [null, null];
      return {
        descripcion: l.descripcion,
        cantidad: parseFloat(l.cantidad) || 0,
        unidad: l.unidad,
        costo_unitario: parseFloat(l.costo_unitario) || 0,
        product_id: prefix === 'p' ? id : null,
        ingredient_id: prefix === 'i' ? id : null,
      };
    });
    start(async () => {
      const res = await createPurchaseOrder(restaurantId, supplierId || null, notes, payload);
      if (res.error) { setError(res.error); return; }
      reset();
      router.refresh();
    });
  }
  function changeStatus(po: PurchaseOrder, estado: 'ENVIADA' | 'RECIBIDA' | 'CANCELADA') {
    if (estado === 'RECIBIDA') {
      const linked = (po.items ?? []).filter((it) => it.product_id || it.ingredient_id).length;
      const msg = linked > 0
        ? `Esta orden tiene ${linked} renglón(es) vinculado(s) a producto/insumo: al recibirla se sumará su stock y se recalculará el costo promedio ponderado. ¿Continuar?`
        : '¿Marcar esta orden como recibida?';
      if (!window.confirm(msg)) return;
    }
    start(async () => {
      const res = await setPurchaseOrderStatus(restaurantId, po.id, estado);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {!creating && <Button onClick={() => setCreating(true)} className="rounded-adm-full">+ Nueva orden</Button>}
      </div>
      {error && <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 13 }}>{error}</div>}

      {creating && (
        <Card className="flex flex-col gap-3 p-4">
          <p style={{ fontWeight: 600, fontSize: 14 }}>Nueva orden de compra</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Proveedor</label>
              <Select
                options={[{ value: '', label: 'Sin asignar' }, ...suppliers.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))]}
                value={supplierId}
                onValueChange={setSupplierId}
              />
            </div>
            <div><label style={labelStyle}>Notas</label><input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Entrega, referencia…" /></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Renglones</label>
            {/* .po-line: 5 columnas en escritorio; en móvil la descripción toma
                la fila completa y cant/unidad/costo/✕ pasan debajo (antes las
                columnas fijas dejaban la descripción en ~30px, inusable). */}
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 9px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--u-text) 3%, transparent)' }}>
                <Select
                  options={linkOptions}
                  value={l.linkValue}
                  onValueChange={(v) => setLink(i, v)}
                />
                <div className="po-line">
                  <input style={inputStyle} placeholder="Descripción (insumo)" value={l.descripcion} onChange={(e) => setLine(i, { descripcion: e.target.value })} />
                  <input style={{ ...inputStyle, textAlign: 'right' }} type="number" inputMode="decimal" min="0" step="0.001" placeholder="Cant." value={l.cantidad} onChange={(e) => setLine(i, { cantidad: e.target.value })} />
                  <input style={inputStyle} placeholder="Unidad" value={l.unidad} onChange={(e) => setLine(i, { unidad: e.target.value })} />
                  <input style={{ ...inputStyle, textAlign: 'right' }} type="number" inputMode="decimal" min="0" step="0.0001" placeholder="Costo Q" value={l.costo_unitario} onChange={(e) => setLine(i, { costo_unitario: e.target.value })} />
                  <Button type="button" variant="outline" size="icon" className="size-8 border-[var(--c-danger-line)] text-[var(--c-danger)]" aria-label="Quitar renglón" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}><Icon name="x" size={13} /></Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}>+ Renglón</Button>
            <p style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
              Vincular un renglón a un producto o insumo real hace que, al marcar la orden como recibida, se sume su stock y se recalcule su costo promedio ponderado (Kardex). Sin vincular, el renglón queda solo como registro contable.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--u-hair)', paddingTop: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Total: <span style={{ color: 'var(--brand-accent-ink)', fontFamily: 'var(--ui-font-mono)' }}>{money(total)}</span></span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={create} disabled={isPending} size="sm" className="rounded-adm-full">{isPending ? 'Creando…' : 'Crear orden'}</Button>
              <Button onClick={reset} variant="outline" size="sm" className="rounded-adm-full">Cancelar</Button>
            </div>
          </div>
        </Card>
      )}

      {orders.length === 0 && !creating ? (
        <EmptyState
          icon="receipt"
          title="Aún no has creado órdenes de compra"
          desc="Una orden registra qué le pedís a un proveedor y suma el stock automáticamente al recibirla."
          action={{ label: 'Crear la primera', onClick: () => setCreating(true) }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((po) => (
            <Card key={po.id} className="p-3.5">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Orden #{String(po.folio).padStart(4, '0')}</div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{po.supplier_name || 'Sin proveedor'} · {new Date(po.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `color-mix(in srgb, ${ESTADO_COLOR[po.estado]} 13%, transparent)`, color: ESTADO_COLOR[po.estado] }}>{po.estado}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                {(po.items ?? []).map((it) => {
                  const linkLabel = it.product_name ? `📦 ${it.product_name}` : it.ingredient_name ? `🧂 ${it.ingredient_name}` : null;
                  return (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--u-text-2)' }}>
                      <span>{it.cantidad} {it.unidad} · {it.descripcion}{linkLabel && <span style={{ color: 'var(--brand-accent-ink)' }}> · {linkLabel}</span>}</span>
                      <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money(Number(it.subtotal))}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{money(Number(po.total))}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {po.estado === 'BORRADOR' && <ActionBtn label="Marcar enviada" onClick={() => changeStatus(po, 'ENVIADA')} disabled={isPending} />}
                  {(po.estado === 'BORRADOR' || po.estado === 'ENVIADA') && <ActionBtn label="Recibida" accent onClick={() => changeStatus(po, 'RECIBIDA')} disabled={isPending} />}
                  {(po.estado === 'BORRADOR' || po.estado === 'ENVIADA') && <ActionBtn label="Cancelar" danger onClick={() => changeStatus(po, 'CANCELADA')} disabled={isPending} />}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, accent, danger }: { label: string; onClick: () => void; disabled?: boolean; accent?: boolean; danger?: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="sm"
      variant={accent ? 'primary' : danger ? 'outline' : 'secondary'}
      className={cn('rounded-adm-full', danger && 'border-[var(--c-danger-line)] text-[var(--c-danger)]')}
    >
      {label}
    </Button>
  );
}
