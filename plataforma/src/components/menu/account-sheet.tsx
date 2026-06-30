'use client';

import { useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { getLocalProfile, saveLocalProfile, type LocalCustomerProfile } from '@/lib/customer-local';
import { getMyLoyalty } from '@/lib/actions/loyalty';
import { createClient } from '@/lib/supabase/client';
import GoogleSignInButton from '@/components/menu/google-signin';
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
  const [saved, setSaved] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loyalty, setLoyalty] = useState<DinerLoyalty | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Cargar perfil guardado
  useEffect(() => {
    const p = getLocalProfile(restaurantId);
    if (p) { setName(p.name); setPhone(p.phone); setAddress(p.address ?? ''); }
  }, [restaurantId]);

  // Cargar sesión de Google y puntos de fidelidad
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u ?? null);
      if (loyaltyOn) {
        try {
          const p = getLocalProfile(restaurantId);
          const l = await getMyLoyalty(restaurantId, p?.phone || undefined);
          setLoyalty(l);
        } catch { /* ignore */ }
      }
    })();
  }, [restaurantId, loyaltyOn]);

  // Bloquear scroll del body mientras el sheet está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleSave() {
    const profile: LocalCustomerProfile = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || undefined,
    };
    saveLocalProfile(restaurantId, profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try { await createClient().auth.signOut({ scope: 'local' }); } catch {}
    setUser(null);
    setLoyalty(null);
    setSigningOut(false);
  }

  const balance = loyalty?.identified ? loyalty.balance : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mi cuenta"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />

      {/* Sheet */}
      <div
        className="glass anim-slide-up themed-type"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 460,
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
          padding: `20px 20px calc(96px + env(safe-area-inset-bottom, 0px))`,
          maxHeight: '90dvh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="t-display" style={{ fontSize: 24 }}>Mi cuenta</h2>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 11, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
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
                  Mantén tus puntos de fidelidad sincronizados aunque cambies de dispositivo.
                </p>
                <GoogleSignInButton full />
              </>
            )}
          </Glass>
        )}

        {/* Formulario de datos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="t-kicker" style={{ fontSize: 10.5 }}>Mis datos de entrega</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="t-mute" style={{ fontSize: 12 }}>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre completo" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="t-mute" style={{ fontSize: 12 }}>Teléfono</label>
            <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu número (8 dígitos)" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="t-mute" style={{ fontSize: 12 }}>Dirección de entrega</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, colonia…" style={inputStyle} />
          </div>

          <button
            onClick={handleSave}
            className="press btn-accent"
            style={{ marginTop: 4, padding: '13px 18px', borderRadius: 14, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {saved
              ? <><Icon name="check" size={16} strokeWidth={2.5} /> Datos guardados</>
              : 'Guardar datos'
            }
          </button>

          <p className="t-mute" style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
            Tus datos se guardan en este dispositivo y se usan para agilizar tus pedidos.
          </p>
        </div>

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
      </div>
    </div>
  );
}
