'use client';

/* PromotionsPanel — CRUD de promociones/cupones (Fase D). */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import {
  createPromotion, updatePromotion, togglePromotion, deletePromotion,
  type PromoState,
} from '@/lib/actions/promos';
import type { Promotion } from '@/types';

function valueLabel(p: Promotion): string {
  if (p.kind === 'PERCENT') return `${p.value}% off`;
  if (p.kind === 'AMOUNT') return `Q${Number(p.value).toFixed(2)} off`;
  return 'Envío gratis';
}

export default function PromotionsPanel({ restaurantId, promotions }: { restaurantId: string; promotions: Promotion[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ open: boolean; promo: Promotion | null }>({ open: false, promo: null });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditor({ open: true, promo: null })} className="press" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 99, cursor: 'pointer', background: 'var(--u-text)', color: 'var(--brand-bg)', border: 'none', fontWeight: 600, fontSize: 13 }}>
          <Icon name="plus" size={15} /> Nueva promoción
        </button>
      </div>

      {promotions.length === 0 ? (
        <div className="glass" style={{ borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
          No hay promociones todavía. Crea un cupón o un descuento automático.
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
          {promotions.map((p, i) => (
            <div key={p.id} style={{ padding: '14px 16px', borderBottom: i < promotions.length - 1 ? '1px solid var(--u-hair)' : 'none', display: 'flex', alignItems: 'center', gap: 12, opacity: p.active ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--u-text)' }}>{p.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-accent)', padding: '2px 8px', borderRadius: 99, background: 'rgba(217,119,87,0.12)' }}>{valueLabel(p)}</span>
                  {p.code ? (
                    <span className="t-mono" style={{ fontSize: 11, color: 'var(--u-text-2)', padding: '2px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', border: '1px solid var(--u-hair)' }}>{p.code}</span>
                  ) : (
                    <span style={{ fontSize: 10.5, color: 'var(--u-text-4)' }}>automática</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3 }}>
                  {p.min_order > 0 ? `Mínimo Q${Number(p.min_order).toFixed(0)} · ` : ''}
                  {p.usage_limit != null ? `${p.used_count}/${p.usage_limit} usos` : `${p.used_count} usos`}
                </div>
              </div>

              <form action={togglePromotion}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={String(!p.active)} />
                <button type="submit" className="press" title={p.active ? 'Pausar' : 'Activar'} style={{ width: 42, height: 25, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3, background: p.active ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)', display: 'flex', justifyContent: p.active ? 'flex-end' : 'flex-start' }}>
                  <span style={{ width: 19, height: 19, borderRadius: 99, background: p.active ? 'var(--brand-bg)' : 'color-mix(in srgb, var(--u-text) 90%, transparent)' }} />
                </button>
              </form>

              <button onClick={() => setEditor({ open: true, promo: p })} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', cursor: 'pointer' }}>
                <Icon name="edit" size={14} />
              </button>
              <form action={deletePromotion} onSubmit={(e) => { if (!confirm('¿Eliminar esta promoción?')) e.preventDefault(); }}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--c-danger, #f87171)', cursor: 'pointer' }}>
                  <Icon name="trash" size={14} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {editor.open && (
        <PromoModal
          restaurantId={restaurantId}
          promo={editor.promo}
          onClose={() => setEditor({ open: false, promo: null })}
          onSaved={() => { setEditor({ open: false, promo: null }); router.refresh(); }}
        />
      )}
    </div>
  );
}

function PromoModal({ restaurantId, promo, onClose, onSaved }: { restaurantId: string; promo: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !promo;
  const action = isNew ? createPromotion : updatePromotion;
  const [state, formAction, isPending] = useActionState<PromoState, FormData>(action, null);
  const [kind, setKind] = useState(promo?.kind ?? 'PERCENT');

  useEffect(() => { if (state && 'ok' in state) onSaved(); }, [state, onSaved]);

  const label: React.CSSProperties = { fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' };
  const input: React.CSSProperties = { width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)', borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center', background: 'rgba(7,7,8,0.65)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-solid anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--u-hair)' }}>
          <div className="t-display" style={{ fontSize: 20 }}>{isNew ? 'Nueva promoción' : 'Editar promoción'}</div>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>
        <form action={formAction} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          {!isNew && <input type="hidden" name="id" value={promo!.id} />}

          <div>
            <label style={label}>Nombre *</label>
            <input name="name" defaultValue={promo?.name ?? ''} placeholder="Ej. 2x1 martes, Bienvenida…" required style={input} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Tipo</label>
              {/* Fondo adaptativo (antes #1a1a1a fijo: caja oscura flotando en el
                  panel claro). Las <option> van claras fijas como en el resto de
                  selects del admin (el desplegable nativo se dibuja aparte). */}
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Promotion['kind'])} style={input}>
                <option value="PERCENT" style={{ background: '#fff', color: '#111' }}>% de descuento</option>
                <option value="AMOUNT" style={{ background: '#fff', color: '#111' }}>Monto fijo (Q)</option>
                <option value="FREE_DELIVERY" style={{ background: '#fff', color: '#111' }}>Envío gratis</option>
              </select>
            </div>
            <div>
              <label style={label}>{kind === 'PERCENT' ? 'Porcentaje' : kind === 'AMOUNT' ? 'Monto (Q)' : 'Valor'}</label>
              <input name="value" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={promo?.value ?? ''} disabled={kind === 'FREE_DELIVERY'} placeholder={kind === 'PERCENT' ? '10' : '0.00'} style={{ ...input, opacity: kind === 'FREE_DELIVERY' ? 0.5 : 1 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Código (cupón)</label>
              <input name="code" defaultValue={promo?.code ?? ''} placeholder="Vacío = automática" style={{ ...input, textTransform: 'uppercase' }} />
            </div>
            <div>
              <label style={label}>Compra mínima (Q)</label>
              <input name="min_order" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={promo?.min_order ?? 0} style={input} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Límite de usos</label>
              <input name="usage_limit" type="number" inputMode="decimal" min="1" defaultValue={promo?.usage_limit ?? ''} placeholder="Sin límite" style={input} />
            </div>
            <div>
              <label style={label}>Vence (opcional)</label>
              <input name="ends_at" type="date" defaultValue={promo?.ends_at ? promo.ends_at.slice(0, 10) : ''} style={input} />
            </div>
          </div>

          {state && 'error' in state && <div style={{ fontSize: 13, color: 'var(--c-danger, #f87171)' }}>{state.error}</div>}

          <button type="submit" disabled={isPending} className="press btn-accent" style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
            {isPending ? 'Guardando…' : isNew ? 'Crear promoción' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}
