'use client';

/* GiftCardsPanel — emitir/cancelar tarjetas de regalo + aplicar un vale
   a un pedido real (Fase 2 auditoría de lanzamiento). */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import {
  issueGiftCard, cancelGiftCard, findOrdersForRedeem, redeemGiftCard,
  type GiftCard, type GiftCardState, type OrderLookup, type RedeemState,
} from '@/lib/actions/gift-cards';

const money = (n: number) => `Q${Number(n).toFixed(2)}`;

const label: React.CSSProperties = { fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' };
const input: React.CSSProperties = { width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)', borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none' };

export default function GiftCardsPanel({ restaurantId, giftCards }: { restaurantId: string; giftCards: GiftCard[] }) {
  const router = useRouter();
  const [issuing, setIssuing] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => setRedeeming(true)} className="press glass-quiet" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 99, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'transparent', color: 'var(--u-text)', fontWeight: 600, fontSize: 13 }}>
          <Icon name="wallet" size={15} /> Aplicar vale a un pedido
        </button>
        <button onClick={() => setIssuing(true)} className="press" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 99, cursor: 'pointer', background: 'var(--u-text)', color: 'var(--brand-bg)', border: 'none', fontWeight: 600, fontSize: 13 }}>
          <Icon name="plus" size={15} /> Emitir vale
        </button>
      </div>

      {giftCards.length === 0 ? (
        <div className="glass" style={{ borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
          No hay tarjetas de regalo emitidas todavía.
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
          {giftCards.map((g, i) => {
            const expired = g.expires_at ? new Date(g.expires_at) < new Date() : false;
            const inactive = g.status === 'CANCELLED' || expired || g.balance <= 0;
            return (
              <div key={g.id} style={{ padding: '14px 16px', borderBottom: i < giftCards.length - 1 ? '1px solid var(--u-hair)' : 'none', display: 'flex', alignItems: 'center', gap: 12, opacity: inactive ? 0.55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="t-mono" style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{g.code}</span>
                    {g.status === 'CANCELLED' && <span style={{ fontSize: 10.5, color: 'var(--c-danger, #f87171)' }}>cancelado</span>}
                    {g.status === 'ACTIVE' && expired && <span style={{ fontSize: 10.5, color: 'var(--c-danger, #f87171)' }}>vencido</span>}
                    {g.status === 'ACTIVE' && !expired && g.balance <= 0 && <span style={{ fontSize: 10.5, color: 'var(--u-text-4)' }}>agotado</span>}
                    {g.recipient_name && <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>· {g.recipient_name}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 3 }}>
                    {g.note ? `${g.note} · ` : ''}
                    Emitido {new Date(g.created_at).toLocaleDateString('es-GT')}
                    {g.expires_at ? ` · vence ${new Date(g.expires_at).toLocaleDateString('es-GT')}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}>{money(g.balance)}</div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>de {money(g.initial_balance)}</div>
                </div>
                {g.status === 'ACTIVE' && (
                  <form action={cancelGiftCard} onSubmit={(e) => { if (!confirm('¿Cancelar este vale? Ya no podrá redimirse.')) e.preventDefault(); }}>
                    <input type="hidden" name="restaurantId" value={restaurantId} />
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="press glass-quiet" title="Cancelar vale" style={{ width: 34, height: 34, borderRadius: 9, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--c-danger, #f87171)', cursor: 'pointer' }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {issuing && (
        <IssueModal restaurantId={restaurantId} onClose={() => setIssuing(false)} onSaved={() => { setIssuing(false); router.refresh(); }} />
      )}
      {redeeming && (
        <RedeemModal restaurantId={restaurantId} onClose={() => setRedeeming(false)} onSaved={() => { setRedeeming(false); router.refresh(); }} />
      )}
    </div>
  );
}

function IssueModal({ restaurantId, onClose, onSaved }: { restaurantId: string; onClose: () => void; onSaved: () => void }) {
  const [state, formAction, isPending] = useActionState<GiftCardState, FormData>(issueGiftCard, null);

  const issued = state && 'ok' in state ? state.code : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center', background: 'rgba(7,7,8,0.65)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-solid anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--u-hair)' }}>
          <div className="t-display" style={{ fontSize: 20 }}>Emitir vale</div>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>

        {issued ? (
          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>Vale creado. Comparte este código con el cliente:</div>
            <div className="t-mono" style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', padding: '14px', borderRadius: 12, border: '1px dashed var(--u-hair-2)', color: 'var(--u-text)' }}>{issued}</div>
            <button onClick={onSaved} className="press btn-accent" style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', cursor: 'pointer' }}>Listo</button>
          </div>
        ) : (
          <form action={formAction} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <div>
              <label style={label}>Saldo (Q) *</label>
              <input name="initial_balance" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="100.00" required style={input} />
            </div>
            <div>
              <label style={label}>Para (opcional)</label>
              <input name="recipient_name" placeholder="Nombre del cliente" style={input} />
            </div>
            <div>
              <label style={label}>Nota (opcional)</label>
              <input name="note" placeholder="Ej. regalo de cumpleaños" style={input} />
            </div>
            <div>
              <label style={label}>Vence (opcional)</label>
              <input name="expires_at" type="date" style={input} />
            </div>
            {state && 'error' in state && <div style={{ fontSize: 13, color: 'var(--c-danger, #f87171)' }}>{state.error}</div>}
            <button type="submit" disabled={isPending} className="press btn-accent" style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Emitiendo…' : 'Emitir vale'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RedeemModal({ restaurantId, onClose, onSaved }: { restaurantId: string; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrderLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [order, setOrder] = useState<OrderLookup | null>(null);
  const [state, formAction, isPending] = useActionState<RedeemState, FormData>(redeemGiftCard, null);

  useEffect(() => { if (state && 'ok' in state) onSaved(); }, [state, onSaved]);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await findOrdersForRedeem(restaurantId, query));
    } finally {
      setSearching(false);
    }
  }

  const remaining = order ? Math.max(0, Number(order.total) - Number(order.gift_card_amount)) : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center', background: 'rgba(7,7,8,0.65)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-solid anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--u-hair)' }}>
          <div className="t-display" style={{ fontSize: 20 }}>Aplicar vale a un pedido</div>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>

        <form action={formAction} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <input type="hidden" name="restaurantId" value={restaurantId} />

          <div>
            <label style={label}>Buscar pedido por número</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
                placeholder="ORD-2026-00123"
                style={{ ...input, flex: 1 }}
              />
              <button type="button" onClick={search} disabled={searching} className="press glass-quiet" style={{ padding: '0 16px', borderRadius: 11, border: '1px solid var(--u-hair-2)', background: 'transparent', color: 'var(--u-text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {searching ? '…' : 'Buscar'}
              </button>
            </div>
          </div>

          {!order && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {results.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOrder(o)}
                  className="press"
                  style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', color: 'var(--u-text)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span className="t-mono" style={{ fontWeight: 700 }}>{o.order_number}</span>
                    <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money(o.total)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>{o.customer_name}{o.gift_card_amount > 0 ? ` · ya tiene vale de ${money(o.gift_card_amount)}` : ''}</div>
                </button>
              ))}
            </div>
          )}

          {order && (
            <>
              <input type="hidden" name="orderId" value={order.id} />
              <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--u-hair-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="t-mono" style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--u-text)' }}>{order.order_number}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>{order.customer_name} · total {money(order.total)}</div>
                </div>
                <button type="button" onClick={() => setOrder(null)} className="press" style={{ fontSize: 12, color: 'var(--u-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>Cambiar</button>
              </div>

              <div>
                <label style={label}>Código del vale</label>
                <input name="code" placeholder="REGALO-XXXXXX" required style={{ ...input, textTransform: 'uppercase' }} />
              </div>

              <div>
                <label style={label}>Monto a aplicar (Q)</label>
                <input name="amount" type="number" inputMode="decimal" min="0.01" max={remaining || undefined} step="0.01" defaultValue={remaining > 0 ? remaining.toFixed(2) : ''} required style={input} />
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6 }}>No puede superar el total pendiente del pedido ({money(remaining)}).</p>
              </div>
            </>
          )}

          {state && 'error' in state && <div style={{ fontSize: 13, color: 'var(--c-danger, #f87171)' }}>{state.error}</div>}
          {state && 'ok' in state && <div style={{ fontSize: 13, color: '#4ade80' }}>Vale aplicado. Saldo restante: {money(state.newBalance)}</div>}

          <button type="submit" disabled={!order || isPending} className="press btn-accent" style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', cursor: !order || isPending ? 'not-allowed' : 'pointer', opacity: !order || isPending ? 0.6 : 1 }}>
            {isPending ? 'Aplicando…' : 'Aplicar vale'}
          </button>
        </form>
      </div>
    </div>
  );
}
