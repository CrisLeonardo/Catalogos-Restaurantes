'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/icons';
import { getLocalProfile, saveLocalProfile, type LocalCustomerProfile } from '@/lib/customer-local';
import { getMyAccount, linkMyAccountByPhone } from '@/lib/actions/loyalty';
import { createDinerClient } from '@/lib/supabase/client';
import GoogleSignInButton from '@/components/menu/google-signin';
import OverlayBackground from '@/components/menu/overlay-background';
import type { MyAccount } from '@/lib/actions/loyalty';

const DeliveryMap = dynamic(() => import('@/components/delivery-map'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 220, borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--u-text-4)', fontSize: 'var(--m-fs-sm)',
    }}>
      Cargando mapa…
    </div>
  ),
});

interface Props {
  restaurantId: string;
  loyaltyOn: boolean;
  googleAuthEnabled: boolean;
  whatsappNumber: string | null;
  /** Ubicación del restaurante + radio de cobertura — si están configurados,
     se muestra el mapa interactivo (igual que en el checkout de domicilio). */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliveryRadiusKm?: number | null;
  onClose: () => void;
}

const fmtPts = (n: number) => n.toLocaleString('es-GT');

/* 15 px: Safari en iPhone amplía la página entera al enfocar un campo de menos
   de 16, así que «Mi cuenta» daba el mismo salto que daba el checkout. El piso
   es ABSOLUTO y no la escala del tema: con fontScale a 0,85 cualquier paso de
   la escala vuelve a caer por debajo de 16 y el zoom regresa. */
const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--u-hair)',
  borderRadius: 'var(--m-r-md)',
  padding: '11px 13px',
  minHeight: 'var(--m-tap)',
  color: 'var(--u-text)',
  fontSize: 'max(16px, var(--m-fs-md))',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

export default function AccountSheet({
  restaurantId, loyaltyOn, googleAuthEnabled, whatsappNumber,
  restaurantLat = null, restaurantLng = null, deliveryRadiusKm = null,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Fuente única de verdad: sesión + enlace + puntos, resueltos SIEMPRE
  // server-side (cookies) en una sola llamada — ver getMyAccount. Antes esta
  // pantalla también hacía su propia `supabase.auth.getUser()` en el
  // navegador; si esa llamada fallaba (red, bloqueadores) la sesión se veía
  // como "no iniciada" aunque sí lo estuviera, y ocultaba los datos/puntos.
  const [account, setAccount] = useState<MyAccount | null>(null);
  // Mientras esto es true no se sabe aún si hay sesión — sin esta bandera la
  // tarjeta de Google mostraba "Accede con Google" un instante en cada
  // apertura (incluso con sesión válida), dando la impresión de que el
  // inicio de sesión "no se detectó".
  const [accountLoading, setAccountLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [linkPhone, setLinkPhone] = useState('');
  const [linkTotal, setLinkTotal] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  // null = todavía no contestó; el formulario de teléfono+total (que exige
  // escribir datos) solo aparece si dice que sí. Antes se mostraba siempre,
  // aunque fuera la primera vez que esa persona pedía — quien nunca había
  // pedido veía un formulario que no le servía de nada.
  const [wantsLink, setWantsLink] = useState<boolean | null>(null);

  const loadAccount = useCallback(async () => {
    const local = getLocalProfile(restaurantId);

    const acc = await getMyAccount(restaurantId).catch(() => null);
    setAccount(acc);

    // Prioridad: cuenta de Google enlazada (sigue al comensal a cualquier
    // dispositivo) sobre el perfil local de este dispositivo únicamente.
    if (acc?.checkout) {
      setName(acc.checkout.name);
      setPhone(acc.checkout.phone);
      setAddress(acc.checkout.address ?? '');
      if (acc.checkout.lat != null && acc.checkout.lng != null) {
        setLat(acc.checkout.lat);
        setLng(acc.checkout.lng);
      }
      return;
    }
    if (local) {
      setName(local.name);
      setPhone(local.phone);
      setAddress(local.address ?? '');
      if (local.lat != null && local.lng != null) {
        setLat(local.lat);
        setLng(local.lng);
      }
      setLinkPhone(local.phone);
    }
  }, [restaurantId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAccount();
      if (!cancelled) setAccountLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadAccount]);

  async function handleLink() {
    const cleanPhone = linkPhone.replace(/\D/g, '');
    if (cleanPhone.length < 8) { setLinkMsg('Ingresa tu número de 8 dígitos.'); return; }
    const total = Number(linkTotal.replace(',', '.'));
    if (!linkTotal.trim() || !Number.isFinite(total) || total < 0) { setLinkMsg('Ingresa el total (Q) de tu pedido más reciente.'); return; }
    setLinkBusy(true);
    setLinkMsg(null);
    const res = await linkMyAccountByPhone(restaurantId, cleanPhone, total);
    if (res.error) {
      setLinkMsg(res.error);
    } else {
      setLinkMsg('¡Listo! Tu cuenta quedó enlazada.');
      await loadAccount();
    }
    setLinkBusy(false);
  }

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
      lat, lng,
    };
    saveLocalProfile(restaurantId, profile);
    setSaved(true);
    setMsg(null);
    setTimeout(() => setSaved(false), 2200);
  }

  async function handleSignOut() {
    setSigningOut(true);
    // scope 'local' no hace petición de red (solo borra la sesión de este
    // navegador) — no depende de que el navegador alcance el servidor de Auth.
    try { await createDinerClient().auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    await loadAccount();
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

  const loggedIn = !!account?.loggedIn;
  const identified = !!account?.identified;
  const balance = loyaltyOn && account?.loyalty?.identified ? account.loyalty.balance : null;
  const geoActive = restaurantLat != null && restaurantLng != null && deliveryRadiusKm != null;

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
            className="press m-tap"
            style={{ borderRadius: 'var(--m-r-md)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}
            aria-label="Volver"
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <div>
            <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)' }}>Perfil</div>
            <h1 className="t-display" style={{ fontSize: 'var(--m-fs-2xl)', lineHeight: 1 }}>Mi cuenta</h1>
          </div>
        </div>

        {/* Tarjeta de puntos */}
        {loyaltyOn && balance != null && (
          <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)', background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-accent) 22%, transparent), var(--surface-2) 75%)' }}>
            <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)' }}>Tus puntos de fidelidad</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 'calc(36px * var(--font-scale))', fontWeight: 800, color: 'var(--brand-accent-ink)', lineHeight: 0.95 }}>{fmtPts(balance)}</span>
              <span className="t-mute" style={{ fontSize: 'var(--m-fs-md)' }}>{balance === 1 ? 'punto' : 'puntos'}</span>
            </div>
          </div>
        )}

        {/* Sesión con Google */}
        {googleAuthEnabled && (
          <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)' }}>
            {accountLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6 }}>
                <div style={{ width: 38, height: 38, borderRadius: 'var(--m-r-pill)', background: 'var(--surface-2)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ width: '55%', height: 12, borderRadius: 'var(--m-r-xs)', background: 'var(--surface-2)' }} />
                  <div style={{ width: '35%', height: 10, borderRadius: 'var(--m-r-xs)', background: 'var(--surface-2)' }} />
                </div>
              </div>
            ) : loggedIn && identified ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {account?.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatarUrl} alt="" style={{ width: 38, height: 38, borderRadius: 'var(--m-r-pill)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--m-fs-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {account?.name ?? account?.email}
                  </div>
                  <div className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Cuenta de Google</div>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="press"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--u-hair)', borderRadius: 'var(--m-r-pill)', padding: '6px 12px', color: 'var(--u-text-3)', fontSize: 'var(--m-fs-xs)', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Icon name="logOut" size={13} /> Salir
                </button>
              </div>
            ) : loggedIn && !identified ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  {account?.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.avatarUrl} alt="" style={{ width: 38, height: 38, borderRadius: 'var(--m-r-pill)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--m-fs-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {account?.name ?? account?.email}
                    </div>
                    <div className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Cuenta de Google</div>
                  </div>
                </div>
                {wantsLink === null ? (
                  <div>
                    <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', marginBottom: 12, lineHeight: 1.5 }}>
                      ¿Ya habías pedido antes en este restaurante?
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setWantsLink(true)}
                        className="press"
                        style={{ flex: 1, padding: '10px 16px', borderRadius: 'var(--m-r-md)', border: '1px solid var(--u-hair)', background: 'var(--surface-2)', color: 'var(--u-text)', fontWeight: 600, fontSize: 'var(--m-fs-sm)', cursor: 'pointer' }}
                      >
                        Sí, ya había pedido
                      </button>
                      <button
                        onClick={() => setWantsLink(false)}
                        className="press"
                        style={{ flex: 1, padding: '10px 16px', borderRadius: 'var(--m-r-md)', border: '1px solid var(--u-hair)', background: 'none', color: 'var(--u-text-3)', fontWeight: 600, fontSize: 'var(--m-fs-sm)', cursor: 'pointer' }}
                      >
                        No, es mi primera vez
                      </button>
                    </div>
                  </div>
                ) : wantsLink === false ? (
                  <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', lineHeight: 1.5 }}>
                    Perfecto — cuando hagas tu primer pedido con esta cuenta, tus datos quedan guardados solos para la próxima vez.
                  </p>
                ) : (
                  <>
                    <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', marginBottom: 10, lineHeight: 1.5 }}>
                      Ingresa el número con el que pediste y el total de tu pedido más reciente (para confirmar que el número es tuyo) y enlazamos tu historial y tus datos a esta cuenta.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        inputMode="numeric"
                        value={linkPhone}
                        onChange={(e) => setLinkPhone(e.target.value)}
                        placeholder="Tu número (8 dígitos)"
                        style={inputStyle}
                      />
                      <input
                        inputMode="decimal"
                        value={linkTotal}
                        onChange={(e) => setLinkTotal(e.target.value)}
                        placeholder="Total de tu pedido más reciente (Q)"
                        style={inputStyle}
                      />
                      <button
                        onClick={handleLink}
                        disabled={linkBusy}
                        className="press btn-accent"
                        style={{ padding: '11px 18px', borderRadius: 'var(--m-r-md)', fontWeight: 600, fontSize: 'var(--m-fs-md)', border: 'none', cursor: 'pointer' }}
                      >
                        {linkBusy ? '…' : 'Enlazar'}
                      </button>
                    </div>
                    {linkMsg && (
                      <p style={{ fontSize: 'var(--m-fs-sm)', marginTop: 8, color: linkMsg.startsWith('¡') ? 'var(--c-ok, #4ade80)' : 'var(--c-danger, #f87171)' }}>{linkMsg}</p>
                    )}
                  </>
                )}
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="press"
                  style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--u-text-3)', fontSize: 'var(--m-fs-xs)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 'var(--m-fs-md)', marginBottom: 6 }}>Accede con Google</div>
                <p className="t-mute" style={{ fontSize: 'var(--m-fs-sm)', marginBottom: 12, lineHeight: 1.5 }}>
                  {loyaltyOn
                    ? 'Inicia sesión para ver y usar tus puntos de fidelidad en cualquier dispositivo.'
                    : 'Guarda tus datos y encuentra tus pedidos en cualquier dispositivo.'}
                </p>
                <GoogleSignInButton full returnTab="cuenta" />
              </>
            )}
          </div>
        )}

        {/* Formulario de datos */}
        <div className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 'var(--m-sp-4)' }}>
          <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', marginBottom: 12 }}>Mis datos</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre completo" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Teléfono</label>
              <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu número (8 dígitos)" style={inputStyle} />
            </div>

            {/* Dirección de entrega — se usa para autocompletar tus pedidos a domicilio */}
            {geoActive ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Tu ubicación de entrega</label>
                {/* Se espera a que cargue el perfil (local/cuenta) antes de montar el
                   mapa: el pin inicial solo se lee UNA vez al montar Leaflet, así que
                   montarlo antes de saber lat/lng guardados lo dejaría siempre en el
                   centro del restaurante en vez de la última ubicación del cliente. */}
                {accountLoading ? (
                  <div style={{
                    height: 220, borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--u-text-4)', fontSize: 'var(--m-fs-sm)',
                  }}>
                    Cargando mapa…
                  </div>
                ) : (
                  <DeliveryMap
                    initialLat={lat}
                    initialLng={lng}
                    restaurantLat={restaurantLat}
                    restaurantLng={restaurantLng}
                    radiusKm={deliveryRadiusKm}
                    onLocationChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
                  />
                )}
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej. Portón azul, frente al parque…"
                  style={inputStyle}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Dirección de entrega</label>
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
                    className="press m-surface"
                    style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 'var(--m-r-md)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}
                    aria-label="Obtener mi ubicación"
                  >
                    {locating
                      ? <span style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 700 }}>…</span>
                      : <Icon name="mapPin" size={18} />
                    }
                  </button>
                </div>
              </div>
            )}
          </div>

          {msg && <p style={{ fontSize: 'var(--m-fs-sm)', marginTop: 10, color: 'var(--c-danger)', lineHeight: 1.4 }}>{msg}</p>}

          <button
            onClick={handleSave}
            className="press btn-accent"
            style={{ marginTop: 14, width: '100%', padding: '13px 18px', borderRadius: 'var(--m-r-md)', fontWeight: 700, fontSize: 'var(--m-fs-md)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {saved
              ? <><Icon name="check" size={16} strokeWidth={2.5} /> Datos guardados</>
              : 'Guardar datos'
            }
          </button>

          <p className="t-mute" style={{ fontSize: 'var(--m-fs-xs)', textAlign: 'center', lineHeight: 1.5, marginTop: 8 }}>
            {loggedIn && identified
              ? 'Estos datos vienen de tu cuenta y se actualizan solos con tu próximo pedido. Lo que cambies aquí es solo para este dispositivo.'
              : 'Tus datos se guardan en este dispositivo y se usan para agilizar tus pedidos.'}
          </p>
        </div>

        {/* Cómo llegar: ubicación exacta del restaurante en Google Maps */}
        {restaurantLat != null && restaurantLng != null && (
          <a
            href={`https://www.google.com/maps?q=${restaurantLat.toFixed(6)},${restaurantLng.toFixed(6)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press"
            style={{
              display: 'flex', alignItems: 'center', gap: 13,
              padding: '14px 16px', borderRadius: 'var(--m-r-lg)',
              background: 'var(--surface-1)', border: '1px solid var(--u-hair)',
              textDecoration: 'none', color: 'var(--u-text)',
            }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 'var(--m-r-md)', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--surface-2)', color: 'var(--u-text-2)' }}>
              <Icon name="mapPin" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--m-fs-md)' }}>Cómo llegar</div>
              <div className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Ver ubicación en el mapa</div>
            </div>
            <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </a>
        )}

        {/* Contacto por WhatsApp */}
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press"
            style={{
              display: 'flex', alignItems: 'center', gap: 13,
              padding: '14px 16px', borderRadius: 'var(--m-r-lg)',
              background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.22)',
              textDecoration: 'none', color: 'var(--u-text)',
            }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 'var(--m-r-md)', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'rgba(37,211,102,0.15)', color: '#25D366' }}>
              <Icon name="whatsapp" size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--m-fs-md)' }}>Contactar al restaurante</div>
              <div className="t-mute" style={{ fontSize: 'var(--m-fs-xs)' }}>Enviar mensaje por WhatsApp</div>
            </div>
            <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </a>
        )}
      </main>
    </div>
  );
}
