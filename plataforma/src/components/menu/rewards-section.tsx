'use client';

/* ============================================================
   RECOMPENSAS — apartado de lealtad en el menú del comensal
   ------------------------------------------------------------
   Tarjeta de entrada + hoja (bottom-sheet) con:
   · saldo de puntos (por cuenta Google o por teléfono),
   · catálogo de recompensas canjeables ("Canjear" → al carrito a Q0),
   · login con Google opcional para ver/canjear desde cualquier equipo.
   Los puntos se descuentan al confirmar el pedido (servidor autoritativo).
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { useCart } from '@/lib/cart-context';
import { getMyLoyalty, linkMyAccountByPhone } from '@/lib/actions/loyalty';
import { getLocalProfile } from '@/lib/customer-local';
import { createClient } from '@/lib/supabase/client';
import GoogleSignInButton from '@/components/menu/google-signin';
import type { DinerLoyalty } from '@/lib/db/loyalty';

export interface MenuReward {
  id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  points_cost: number;
  stock: number | null;
}

interface Props {
  restaurantId: string;
  rewards: MenuReward[];
  redeemValue: number;
  googleAuthEnabled: boolean;
  ordersEnabled: boolean;
}

const fmtPts = (n: number) => n.toLocaleString('es-GT');

export default function RewardsSection({ restaurantId, rewards, redeemValue, googleAuthEnabled, ordersEnabled }: Props) {
  const { items, addItem, removeItem } = useCart();
  const [open, setOpen] = useState(false);
  const [loyalty, setLoyalty] = useState<DinerLoyalty | null>(null);
  const [savedPhone, setSavedPhone] = useState('');

  const refresh = useCallback(async (phone?: string) => {
    try {
      const data = await getMyLoyalty(restaurantId, phone);
      setLoyalty(data);
    } catch {
      setLoyalty(null);
    }
  }, [restaurantId]);

  // Saldo inicial (cuenta Google si hay sesión, si no por el teléfono guardado).
  useEffect(() => {
    const p = getLocalProfile(restaurantId);
    const phone = p?.phone ?? '';
    setSavedPhone(phone);
    refresh(phone || undefined);
  }, [restaurantId, refresh]);

  const balance = loyalty?.identified ? loyalty.balance : null;
  const rewardLineIds = new Set(items.filter((i) => i.rewardId).map((i) => i.rewardId));

  function redeem(r: MenuReward) {
    if (rewardLineIds.has(r.id)) { removeItem(`reward:${r.id}`); return; }
    addItem({
      productId: r.product_id ?? `reward-${r.id}`,
      name: r.title,
      price: 0,
      image_url: r.image_url,
      rewardId: r.id,
      pointsCost: r.points_cost,
    });
  }

  return (
    <>
      {/* Tarjeta de entrada */}
      <Glass
        interactive
        onClick={() => setOpen(true)}
        className="anim-fade-up"
        style={{ borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', marginBottom: 14 }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--brand-accent)', color: 'var(--brand-bg)' }}>
          <Icon name="gift" size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-display" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>Recompensas</div>
          <div className="t-mute" style={{ fontSize: 12.5, marginTop: 2 }}>
            {balance != null
              ? `Tienes ${fmtPts(balance)} ${balance === 1 ? 'punto' : 'puntos'} · canjéalos por productos`
              : 'Acumula puntos y canjéalos por productos'}
          </div>
        </div>
        <Icon name="chevronRight" size={18} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
      </Glass>

      {open && (
        <RewardsSheet
          onClose={() => setOpen(false)}
          rewards={rewards}
          loyalty={loyalty}
          balance={balance}
          redeemValue={redeemValue}
          googleAuthEnabled={googleAuthEnabled}
          ordersEnabled={ordersEnabled}
          rewardLineIds={rewardLineIds}
          onRedeem={redeem}
          onRefresh={refresh}
          restaurantId={restaurantId}
          initialPhone={savedPhone}
        />
      )}
    </>
  );
}

function RewardsSheet({
  onClose, rewards, loyalty, balance, redeemValue, googleAuthEnabled, ordersEnabled,
  rewardLineIds, onRedeem, onRefresh, restaurantId, initialPhone,
}: {
  onClose: () => void;
  rewards: MenuReward[];
  loyalty: DinerLoyalty | null;
  balance: number | null;
  redeemValue: number;
  googleAuthEnabled: boolean;
  ordersEnabled: boolean;
  rewardLineIds: Set<string | undefined>;
  onRedeem: (r: MenuReward) => void;
  onRefresh: (phone?: string) => void;
  restaurantId: string;
  initialPhone: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const cleanPhone = phone.replace(/\D/g, '');

  async function lookup() {
    if (cleanPhone.length < 8) { setMsg('Ingresa tu número de 8 dígitos.'); return; }
    setBusy(true); setMsg(null);
    await onRefresh(cleanPhone);
    setBusy(false);
  }

  async function link() {
    if (cleanPhone.length < 8) { setMsg('Ingresa tu número de 8 dígitos.'); return; }
    setBusy(true); setMsg(null);
    const res = await linkMyAccountByPhone(restaurantId, cleanPhone);
    if (res.error) setMsg(res.error);
    else { setMsg('¡Listo! Tu cuenta quedó enlazada.'); await onRefresh(cleanPhone); }
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    try { await createClient().auth.signOut({ scope: 'local' }); } catch {}
    await onRefresh(cleanPhone || undefined);
    setBusy(false);
  }

  const loggedIn = !!loyalty?.loggedIn;
  const linked = !!loyalty?.linkedAccount;
  const identified = !!loyalty?.identified;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Recompensas"
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div
        className="glass anim-slide-up themed-type"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 460, borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0', padding: '20px 20px 28px', maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="t-display" style={{ fontSize: 24, display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <Icon name="gift" size={22} style={{ color: 'var(--brand-accent)' }} /> Recompensas
          </h2>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 11, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Saldo / identidad */}
          <Glass variant="quiet" style={{ borderRadius: 16, padding: '16px 18px' }}>
            {identified ? (
              <>
                <div className="t-kicker" style={{ fontSize: 10 }}>Tu saldo{loyalty?.name ? ` · ${loyalty.name}` : ''}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--brand-accent)', lineHeight: 1 }}>{fmtPts(balance ?? 0)}</span>
                  <span className="t-mute" style={{ fontSize: 14 }}>{(balance ?? 0) === 1 ? 'punto' : 'puntos'}</span>
                </div>
                {redeemValue > 0 && (
                  <div className="t-mute" style={{ fontSize: 12, marginTop: 4 }}>≈ Q{((balance ?? 0) * redeemValue).toFixed(2)} en valor</div>
                )}
                {loggedIn && (
                  <button onClick={signOut} disabled={busy} className="press" style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--u-text-3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Cerrar sesión
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="t-display" style={{ fontSize: 16, fontWeight: 700 }}>Mira y canjea tus puntos</div>
                <p className="t-mute" style={{ fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 1.5 }}>
                  Inicia sesión o ingresa el número con el que pides para ver tu saldo.
                </p>
                {googleAuthEnabled && (
                  <div style={{ marginBottom: 12 }}>
                    <GoogleSignInButton full />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Tu número (8 dígitos)"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', padding: '11px 13px', color: 'var(--u-text)', fontSize: 15, outline: 'none' }}
                  />
                  <button onClick={lookup} disabled={busy} className="press btn-accent" style={{ padding: '0 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                    {busy ? '…' : 'Ver'}
                  </button>
                </div>
              </>
            )}

            {/* Enlazar historial por teléfono a la cuenta Google */}
            {loggedIn && !linked && identified && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--u-hair)' }}>
                <button onClick={link} disabled={busy} className="press" style={{ background: 'none', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-full)', padding: '8px 14px', color: 'var(--u-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  Enlazar este número a mi cuenta
                </button>
              </div>
            )}
            {loggedIn && !identified && (
              <p className="t-mute" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
                Sesión iniciada. Haz tu primer pedido y empezarás a acumular, o ingresa el número con el que ya pediste para enlazar tus puntos.
              </p>
            )}
            {!identified && loggedIn && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Número con el que pediste"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', padding: '10px 13px', color: 'var(--u-text)', fontSize: 14, outline: 'none' }}
                />
                <button onClick={link} disabled={busy} className="press btn-accent" style={{ padding: '0 16px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                  Enlazar
                </button>
              </div>
            )}
            {msg && <p style={{ fontSize: 12.5, marginTop: 10, color: msg.startsWith('¡') || msg.startsWith('Listo') ? '#4ade80' : '#f87171' }}>{msg}</p>}
          </Glass>

          {/* Catálogo */}
          {rewards.length === 0 ? (
            <Glass variant="quiet" style={{ borderRadius: 16, padding: '28px 20px', textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
              Aún no hay recompensas disponibles. ¡Sigue acumulando puntos!
            </Glass>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rewards.map((r) => {
                const inCart = rewardLineIds.has(r.id);
                const affordable = balance == null || balance >= r.points_cost;
                const soldOut = r.stock != null && r.stock <= 0;
                return (
                  <Glass key={r.id} variant="quiet" style={{ borderRadius: 16, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 13, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                      {r.image_url
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={r.image_url} alt={r.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Icon name="gift" size={24} style={{ color: 'var(--u-text-4)' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-display" style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2 }}>{r.title}</div>
                      {r.description && <div className="t-mute" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.description}</div>}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, color: 'var(--brand-accent)', fontWeight: 700, fontSize: 13 }}>
                        <Icon name="star" size={13} /> {fmtPts(r.points_cost)} pts
                      </div>
                    </div>
                    {ordersEnabled && (
                      <button
                        onClick={() => onRedeem(r)}
                        disabled={!inCart && (soldOut || !affordable)}
                        className="press"
                        style={{
                          flexShrink: 0, padding: '9px 14px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5,
                          border: inCart ? '1px solid var(--u-hair-2)' : 'none', cursor: (!inCart && (soldOut || !affordable)) ? 'not-allowed' : 'pointer',
                          background: inCart ? 'transparent' : (soldOut || !affordable) ? 'var(--surface-2)' : 'var(--brand-accent)',
                          color: inCart ? 'var(--u-text)' : (soldOut || !affordable) ? 'var(--u-text-4)' : 'var(--brand-bg)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {inCart ? 'Quitar' : soldOut ? 'Agotado' : !affordable ? `Faltan ${fmtPts(r.points_cost - (balance ?? 0))}` : 'Canjear'}
                      </button>
                    )}
                  </Glass>
                );
              })}
            </div>
          )}

          <p className="t-mute" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.5, marginTop: 2 }}>
            Los puntos se descuentan al confirmar tu pedido. Acumulas puntos en cada compra entregada.
          </p>
        </div>
      </div>
    </div>
  );
}
