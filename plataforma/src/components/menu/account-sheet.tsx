'use client';

import { useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { getLocalProfile, saveLocalProfile, type LocalCustomerProfile } from '@/lib/customer-local';
import { getMyLoyalty, getMyCheckoutProfile } from '@/lib/actions/loyalty';
import { createClient } from '@/lib/supabase/client';
import GoogleSignInButton from '@/components/menu/google-signin';
import OverlayBackground from '@/components/menu/overlay-background';
import type { DinerLoyalty } from '@/lib/db/loyalty';
import type { User } from '@supabase/supabase-js';

interface Props {
  restaurantId: string;
  loyaltyOn: boolean;
  redeemValue: number;
  googleAuthEnabled: boolean;
  whatsappNumber: string | null;
  onClose: () => void;
}

const fmtPts = (n: number) => n.toLocaleString('es-GT');

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--u-hair)',
  borderRadius: 12,
  padding: '11px 13px',
  color: 'var(--u-text)',
  fontSize: 15,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

export default function AccountSheet({ restaurantId, loyaltyOn, redeemValue, googleAuthEnabled, whatsappNumber, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loyalty, setLoyalty] = useState<DinerLoyalty | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getLocalProfile(restaurantId);
      // El tipo de entrega es preferencia de este dispositivo; no se guarda
      // en la cuenta, así que siempre se toma de aquí si existe.
      if (local?.deliveryType) setDeliveryType(local.deliveryType);

      // Prioridad: cuenta de Google enlazada (sigue al comensal a cualquier
      // dispositivo) sobre el perfil local de este dispositivo únicamente.
      const remote = await getMyCheckoutProfile(restaurantId).catch(() => null);
      if (cancelled) return;
      if (remote) {
        setName(remote.name);
        setPhone(remote.phone);
        setAddress(remote.address ?? '');
        return;
      }
      if (local) {
        setName(local.name);
        setPhone(local.phone);
        setAddress(local.address ?? '');
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u ?? null);
      if (loyaltyOn) {
        try { setLoyalty(await getMyLoyalty(restaurantId)); } catch { /* ignore */ }
      }
    })();
  }, [restaurantId, loyaltyOn]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleSave() {
    const profile: LocalCustomerProfile = {
      name: name.trim(),
      phone: phone.trim(),
      address: deliveryType === 'delivery' ? (address.trim() || undefined) : undefined,
      deliveryType,
    };
    saveLocalProfile(restaurantId, profile);
    setSaved(true);
    setMsg(null);
    setTimeout(() => setSaved(false), 2200);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try { await createClient().auth.signOut({ scope: 'local' }); } catch {}
    setUser(null);
    setLoyalty(null);
    setSigningOut(false);
  }

  async function getLocation() {
    if (!navigator.geolocation) { setMsg('Tu dispositivo no soporta geolocalización.'); return; }
    setLocating(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=es`,
            { headers: { 'Accept-Language': 'es' } },
          );
          const data = await res.json() as { display_name?: string };
          setAddress(data.display_name ?? `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
        } catch {
          setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
        } finally {
          setLocating(false);
        }
      },
      () => { setMsg('No se pudo obtener tu ubicación. Verifica los permisos.'); setLocating(false); },
      { timeout: 10000 },
    );
  }

  const balance = loyalty?.identified ? loyalty.balance : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mi cuenta"
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--brand-bg)', overflowY: 'auto' }}
    >
      <OverlayBackground />

      <main
        className="anim-fade-up themed-type"
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 460, margin: '0 auto',
          padding: `calc(16px + env(safe-area-inset-top, 0px)) 16px calc(88px + env(safe-area-inset-bottom, 0px))`,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
          <button
            onClick={onClose}
            className="press glass-quiet"
            style={{ width: 40, height: 40, borderRadius: 13, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Volver"
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <div>
            <div className="t-kicker" style={{ fontSize: 11 }}>Perfil</div>
            <h1 className="t-display" style={{ fontSize: 26, lineHeight: 1 }}>Mi cuenta</h1>
          </div>
        </div>

        {/* Tarjeta de puntos */}
        {loyaltyOn && balance != null && (
          <Glass style={{ borderRadius: 18, padding: '16px 18px', background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 22%, transparent), transparent 75%)' }}>
            <div className="t-kicker" style={{ fontSize: 10 }}>Tus puntos de fidelidad</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--brand-accent)', lineHeight: 0.95 }}>{fmtPts(balance)}</span>
              <span className="t-mute" style={{ fontSize: 14 }}>{balance === 1 ? 'punto' : 'puntos'}</span>
            </div>
            {redeemValue > 0 && (
              <div className="t-mute" style={{ fontSize: 11.5, marginTop: 5 }}>
                ≈ Q{(balance * redeemValue).toFixed(2)} en valor
              </div>
            )}
          </Glass>
        )}

        {/* Sesión con Google */}
        {googleAuthEnabled && (
          <Glass variant="quiet" style={{ borderRadius: 16, padding: '14px 16px' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {user.user_metadata?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.user_metadata.avatar_url as string} alt="" style={{ width: 38, height: 38, borderRadius: 99, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(user.user_metadata?.full_name as string) ?? user.email}
                  </div>
                  <div className="t-mute" style={{ fontSize: 12 }}>Cuenta de Google</div>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="press"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--u-hair)', borderRadius: 999, padding: '6px 12px', color: 'var(--u-text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Icon name="logOut" size={13} /> Salir
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Accede con Google</div>
                <p className="t-mute" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
                  {loyaltyOn
                    ? 'Inicia sesión para ver y usar tus puntos de fidelidad en cualquier dispositivo.'
                    : 'Guarda tus datos y encuentra tus pedidos en cualquier dispositivo.'}
                </p>
                <GoogleSignInButton full />
              </>
            )}
          </Glass>
        )}

        {/* Formulario de datos */}
        <Glass variant="quiet" style={{ borderRadius: 16, padding: '16px' }}>
          <div className="t-kicker" style={{ fontSize: 10.5, marginBottom: 12 }}>Mis datos</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="t-mute" style={{ fontSize: 12 }}>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre completo" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="t-mute" style={{ fontSize: 12 }}>Teléfono</label>
              <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu número (8 dígitos)" style={inputStyle} />
            </div>

            {/* Tipo de entrega */}
            <div>
              <div className="t-mute" style={{ fontSize: 12, marginBottom: 8 }}>Tipo de entrega preferido</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['delivery', 'pickup'] as const).map((type) => {
                  const active = deliveryType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDeliveryType(type)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                        background: active ? 'var(--u-text)' : 'var(--surface-2)',
                        color: active ? 'var(--brand-bg)' : 'var(--u-text-2)',
                        fontWeight: 600, fontSize: 13, transition: 'background 160ms, color 160ms',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <Icon name={type === 'delivery' ? 'home' : 'bag'} size={15} />
                      {type === 'delivery' ? 'A domicilio' : 'Para recoger'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dirección — solo cuando es a domicilio */}
            {deliveryType === 'delivery' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="t-mute" style={{ fontSize: 12 }}>Dirección de entrega</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Calle, número, zona…"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={getLocation}
                    disabled={locating}
                    title="Usar mi ubicación actual"
                    className="press glass-quiet"
                    style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}
                    aria-label="Obtener mi ubicación"
                  >
                    {locating
                      ? <span style={{ fontSize: 13, fontWeight: 700 }}>…</span>
                      : <Icon name="mapPin" size={18} />
                    }
                  </button>
                </div>
              </div>
            )}
          </div>

          {msg && <p style={{ fontSize: 12.5, marginTop: 10, color: '#f87171', lineHeight: 1.4 }}>{msg}</p>}

          <button
            onClick={handleSave}
            className="press btn-accent"
            style={{ marginTop: 14, width: '100%', padding: '13px 18px', borderRadius: 14, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {saved
              ? <><Icon name="check" size={16} strokeWidth={2.5} /> Datos guardados</>
              : 'Guardar datos'
            }
          </button>

          <p className="t-mute" style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.5, marginTop: 8 }}>
            {user
              ? 'Estos datos vienen de tu cuenta y se actualizan solos con tu próximo pedido. Lo que cambies aquí es solo para este dispositivo.'
              : 'Tus datos se guardan en este dispositivo y se usan para agilizar tus pedidos.'}
          </p>
        </Glass>

        {/* Contacto por WhatsApp */}
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press"
            style={{
              display: 'flex', alignItems: 'center', gap: 13,
              padding: '14px 16px', borderRadius: 16,
              background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.22)',
              textDecoration: 'none', color: 'var(--u-text)',
            }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'rgba(37,211,102,0.15)', color: '#25D366' }}>
              <Icon name="whatsapp" size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Contactar al restaurante</div>
              <div className="t-mute" style={{ fontSize: 12 }}>Enviar mensaje por WhatsApp</div>
            </div>
            <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </a>
        )}
      </main>
    </div>
  );
}
