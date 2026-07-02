'use client';

/* ============================================================
   RECOMPENSAS — apartado de lealtad estilo "menú de canje"
   ------------------------------------------------------------
   Reusa EXACTAMENTE el look del menú (mismas tarjetas: foto o
   patrón de marca, tags, grid/lista según la config del
   restaurante) pero el precio se muestra en PUNTOS y arriba va
   el saldo del comensal. Canjear = agrega al carrito a Q0; los
   puntos se descuentan al confirmar el pedido. Estilo McDonald's.
   ============================================================ */

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { roleSize } from '@/lib/theme/resolve';
import { Icon, ICON_PATHS } from '@/components/icons';
import { Tag } from '@/components/menu/ui';
import { BrandPattern, seedFromString } from '@/components/brand-pattern';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig } from '@/lib/theme/context';
import { getMyLoyalty, linkMyAccountByPhone } from '@/lib/actions/loyalty';
import { getLocalProfile } from '@/lib/customer-local';
import { createClient } from '@/lib/supabase/client';
import GoogleSignInButton from '@/components/menu/google-signin';
import OverlayBackground from '@/components/menu/overlay-background';
import type { DinerLoyalty } from '@/lib/db/loyalty';

export interface MenuReward {
  id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  tags: string[] | null;
  points_cost: number;
  stock: number | null;
}

interface Props {
  restaurantId: string;
  rewards: MenuReward[];
  redeemValue: number;
  googleAuthEnabled: boolean;
  ordersEnabled: boolean;
  open: boolean;
  onClose: () => void;
}

const fmtPts = (n: number) => n.toLocaleString('es-GT');
const pickIcon = (icon: string | null | undefined): string => (icon && ICON_PATHS[icon.trim()] ? icon.trim() : 'utensils');

export default function RewardsSection({ restaurantId, rewards, redeemValue, googleAuthEnabled, ordersEnabled, open, onClose }: Props) {
  const { items, addItem, removeItem } = useCart();
  const [loyalty, setLoyalty] = useState<DinerLoyalty | null>(null);
  const [savedPhone, setSavedPhone] = useState('');

  const refresh = useCallback(async () => {
    try {
      setLoyalty(await getMyLoyalty(restaurantId));
    } catch {
      setLoyalty(null);
    }
  }, [restaurantId]);

  useEffect(() => {
    setSavedPhone(getLocalProfile(restaurantId)?.phone ?? '');
    refresh();
  }, [restaurantId, refresh]);

  const balance = loyalty?.identified ? loyalty.balance : null;
  const rewardLineIds = new Set(items.filter((i) => i.rewardId).map((i) => i.rewardId));

  function toggle(r: MenuReward) {
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
      {open && (
        <RewardsMenu
          onClose={onClose}
          rewards={rewards}
          loyalty={loyalty}
          balance={balance}
          redeemValue={redeemValue}
          googleAuthEnabled={googleAuthEnabled}
          ordersEnabled={ordersEnabled}
          rewardLineIds={rewardLineIds}
          onToggle={toggle}
          onRefresh={refresh}
          restaurantId={restaurantId}
          initialPhone={savedPhone}
        />
      )}
    </>
  );
}

/* ── Arte del producto (idéntico al menú: foto o patrón de marca) ── */
function RewardArt({ r, icon, scale = 1 }: { r: MenuReward; icon: string; scale?: number }) {
  const config = useThemeConfig();
  const usePhoto = r.image_url && config.productArt !== 'pattern';
  if (usePhoto) {
    return <Image src={r.image_url!} alt={r.title} fill style={{ objectFit: 'cover' }} sizes="(max-width: 440px) 50vw, 220px" />;
  }
  return (
    <div style={{ position: 'absolute', inset: 0, color: 'var(--u-text)' }}>
      <BrandPattern icon={icon} seed={seedFromString(r.id)} iconScale={scale} />
    </div>
  );
}

/* ── "Precio" en puntos ─────────────────────────────────────── */
function PointsPrice({ cost, size = 15, dim = false }: { cost: number; size?: number; dim?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, fontSize: size, color: dim ? 'var(--u-text-4)' : 'var(--brand-accent)', whiteSpace: 'nowrap', fontFamily: 'var(--ui-font-mono)' }}>
      <Icon name="star" size={size * 0.85} /> {fmtPts(cost)} <span style={{ fontSize: size * 0.7, opacity: 0.8, fontWeight: 700 }}>pts</span>
    </span>
  );
}

/* ── Control de canje (esquina, como el "+" del menú) ───────── */
function RedeemControl({ inCart, affordable, soldOut }: { inCart: boolean; affordable: boolean; soldOut: boolean }) {
  if (inCart) {
    return (
      <span className="t-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, background: 'var(--u-text)', color: 'var(--brand-bg)', fontWeight: 700, fontSize: 12 }}>
        <Icon name="check" size={11} strokeWidth={3} /> En carrito
      </span>
    );
  }
  if (soldOut) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--u-text-4)' }}>Agotado</span>;
  }
  if (!affordable) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--u-text-4)' }}>Te faltan puntos</span>;
  }
  return (
    <span className="btn-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 99, fontWeight: 700, fontSize: 12.5 }}>
      <Icon name="gift" size={13} /> Canjear
    </span>
  );
}

function RewardTile({ r, balance, inCart, ordersEnabled, onToggle }: { r: MenuReward; balance: number | null; inCart: boolean; ordersEnabled: boolean; onToggle: (r: MenuReward) => void }) {
  const config = useThemeConfig();
  const soldOut = r.stock != null && r.stock <= 0;
  const affordable = balance == null || balance >= r.points_cost;
  const canTap = ordersEnabled && !soldOut && (affordable || inCart);
  return (
    <Glass
      interactive={canTap}
      onClick={() => canTap && onToggle(r)}
      style={{ borderRadius: 18, overflow: 'hidden', cursor: canTap ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', height: '100%', opacity: soldOut ? 0.6 : 1 }}
    >
      <div style={{ position: 'relative', aspectRatio: '1.25', background: 'var(--surface-1)', overflow: 'hidden' }}>
        <RewardArt r={r} icon={pickIcon(r.icon)} />
        {config.showTags && r.tags && r.tags.length > 0 && (
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {r.tags.slice(0, 2).map((t) => <Tag key={t} label={t} small />)}
          </div>
        )}
      </div>
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div className="ct-product-name" style={{ fontSize: 14.5 * roleSize(config, 'productName'), flex: 1 }}>{r.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <PointsPrice cost={r.points_cost} dim={!affordable && !inCart} />
          {ordersEnabled && <RedeemControl inCart={inCart} affordable={affordable} soldOut={soldOut} />}
        </div>
      </div>
    </Glass>
  );
}

function RewardRow({ r, balance, inCart, ordersEnabled, onToggle }: { r: MenuReward; balance: number | null; inCart: boolean; ordersEnabled: boolean; onToggle: (r: MenuReward) => void }) {
  const config = useThemeConfig();
  const soldOut = r.stock != null && r.stock <= 0;
  const affordable = balance == null || balance >= r.points_cost;
  const canTap = ordersEnabled && !soldOut && (affordable || inCart);
  return (
    <Glass interactive={canTap} onClick={() => canTap && onToggle(r)} style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 13, alignItems: 'center', cursor: canTap ? 'pointer' : 'default', opacity: soldOut ? 0.6 : 1 }}>
      <div style={{ width: 74, height: 74, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-1)', position: 'relative' }}>
        <RewardArt r={r} icon={pickIcon(r.icon)} scale={0.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="ct-product-name" style={{ fontSize: 15.5 * roleSize(config, 'productName') }}>{r.title}</div>
          {config.showTags && r.tags?.[0] && <Tag label={r.tags[0]} small />}
        </div>
        {r.description && <div className="line-clamp-2 ct-product-desc" style={{ fontSize: 12 * roleSize(config, 'productDesc') }}>{r.description}</div>}
        <PointsPrice cost={r.points_cost} dim={!affordable && !inCart} />
      </div>
      {ordersEnabled && <RedeemControl inCart={inCart} affordable={affordable} soldOut={soldOut} />}
    </Glass>
  );
}

function RewardsMenu({
  onClose, rewards, loyalty, balance, redeemValue, googleAuthEnabled, ordersEnabled,
  rewardLineIds, onToggle, onRefresh, restaurantId, initialPhone,
}: {
  onClose: () => void;
  rewards: MenuReward[];
  loyalty: DinerLoyalty | null;
  balance: number | null;
  redeemValue: number;
  googleAuthEnabled: boolean;
  ordersEnabled: boolean;
  rewardLineIds: Set<string | undefined>;
  onToggle: (r: MenuReward) => void;
  onRefresh: () => void;
  restaurantId: string;
  initialPhone: string;
}) {
  const config = useThemeConfig();
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const cleanPhone = phone.replace(/\D/g, '');
  const identified = !!loyalty?.identified;
  const loggedIn = !!loyalty?.loggedIn;

  async function link() {
    if (cleanPhone.length < 8) { setMsg('Ingresa tu número de 8 dígitos.'); return; }
    setBusy(true); setMsg(null);
    const res = await linkMyAccountByPhone(restaurantId, cleanPhone);
    if (res.error) setMsg(res.error);
    else { setMsg('¡Listo! Tu cuenta quedó enlazada.'); await onRefresh(); }
    setBusy(false);
  }
  async function signOut() {
    setBusy(true);
    try { await createClient().auth.signOut({ scope: 'local' }); } catch {}
    await onRefresh();
    setBusy(false);
  }

  const cols = config.catalogColumns;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--brand-bg)', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-label="Recompensas">
      <OverlayBackground />
      <main className="themed-type" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 460, margin: '0 auto', padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(88px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 40, height: 40, borderRadius: 13, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer', flexShrink: 0 }} aria-label="Volver al menú">
            <Icon name="chevronLeft" size={20} />
          </button>
          <div>
            <div className="t-kicker" style={{ fontSize: 11 }}>Programa de lealtad</div>
            <h1 className="t-display" style={{ fontSize: 26, lineHeight: 1 }}>Recompensas</h1>
          </div>
        </div>

        {/* Tarjeta de saldo / identidad (estilo "tarjeta de puntos") */}
        <Glass style={{ borderRadius: 20, padding: '18px 20px', marginBottom: 18, background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 75%)' }}>
          {identified ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="t-kicker" style={{ fontSize: 10 }}>Tus puntos{loyalty?.name ? ` · ${loyalty.name.split(' ')[0]}` : ''}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 42, fontWeight: 800, color: 'var(--brand-accent)', lineHeight: 0.9 }}>{fmtPts(balance ?? 0)}</span>
                  <span className="t-mute" style={{ fontSize: 15 }}>{(balance ?? 0) === 1 ? 'punto' : 'puntos'}</span>
                </div>
                {redeemValue > 0 && <div className="t-mute" style={{ fontSize: 12, marginTop: 5 }}>≈ Q{((balance ?? 0) * redeemValue).toFixed(2)} en valor</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <Icon name="gift" size={30} style={{ color: 'var(--brand-accent)' }} />
                {loggedIn && <button onClick={signOut} disabled={busy} className="press" style={{ background: 'none', border: 'none', color: 'var(--u-text-3)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Cerrar sesión</button>}
              </div>
            </div>
          ) : loggedIn ? (
            <div>
              <div className="t-display" style={{ fontSize: 17, fontWeight: 700 }}>Recupera tu historial</div>
              <p className="t-mute" style={{ fontSize: 13, marginTop: 4, marginBottom: 13, lineHeight: 1.5 }}>
                ¿Ya habías pedido antes? Ingresa el número con el que pediste para enlazar tus puntos a esta cuenta.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu número (8 dígitos)"
                  style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', padding: '11px 13px', color: 'var(--u-text)', fontSize: 15, outline: 'none' }} />
                <button onClick={link} disabled={busy} className="press btn-accent" style={{ padding: '0 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                  {busy ? '…' : 'Enlazar'}
                </button>
              </div>
              <button onClick={signOut} disabled={busy} className="press" style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--u-text-3)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Cerrar sesión</button>
            </div>
          ) : (
            <div>
              <div className="t-display" style={{ fontSize: 17, fontWeight: 700 }}>Mira y canjea tus puntos</div>
              <p className="t-mute" style={{ fontSize: 13, marginTop: 4, marginBottom: 13, lineHeight: 1.5 }}>
                {googleAuthEnabled
                  ? 'Inicia sesión con Google para ver tu saldo y canjear tus puntos.'
                  : 'El programa de lealtad estará disponible muy pronto.'}
              </p>
              {googleAuthEnabled && <GoogleSignInButton full />}
            </div>
          )}
          {msg && <p style={{ fontSize: 12.5, marginTop: 10, color: msg.startsWith('¡') ? 'var(--c-ok, #4ade80)' : 'var(--c-danger, #f87171)' }}>{msg}</p>}
        </Glass>

        {/* Catálogo de canje (mismas tarjetas del menú, precio en puntos) */}
        {rewards.length === 0 ? (
          <Glass variant="quiet" style={{ borderRadius: 16, padding: '36px 20px', textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
            Aún no hay recompensas disponibles. ¡Sigue acumulando puntos en cada pedido!
          </Glass>
        ) : config.catalogView === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {rewards.map((r, i) => (
              <div key={r.id} className={config.animations ? 'anim-fade-up' : ''} style={{ animationDelay: config.animations ? `${Math.min(i, 8) * 35}ms` : undefined }}>
                <RewardTile r={r} balance={balance} inCart={rewardLineIds.has(r.id)} ordersEnabled={ordersEnabled} onToggle={onToggle} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rewards.map((r, i) => (
              <div key={r.id} className={config.animations ? 'anim-fade-up' : ''} style={{ animationDelay: config.animations ? `${Math.min(i, 8) * 35}ms` : undefined }}>
                <RewardRow r={r} balance={balance} inCart={rewardLineIds.has(r.id)} ordersEnabled={ordersEnabled} onToggle={onToggle} />
              </div>
            ))}
          </div>
        )}

        <p className="t-mute" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.5, marginTop: 18 }}>
          Toca una recompensa para agregarla a tu pedido. Los puntos se descuentan al confirmar.
        </p>
      </main>

    </div>
  );
}
