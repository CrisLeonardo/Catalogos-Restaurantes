'use client';

/* ============================================================
   INSTALL BANNER — sugiere instalar la PWA al cliente final.
   • Android/Chrome: intercepta beforeinstallprompt y muestra
     el botón nativo de instalación.
   • iOS/Safari: muestra instrucciones paso a paso (Apple no
     permite banners automáticos de instalación).
   Se omite si la app ya está instalada (standalone) o si el
   usuario ya descartó el banner (localStorage, 30 días).
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';

/* ── Tipos ──────────────────────────────────────────────── */
type Platform = 'ios' | 'android';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/* ── Helpers de detección ───────────────────────────────── */
function getInstalledPlatform(): Platform | null {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream;
  if (isIOS) {
    // Sólo Safari puede instalar PWA en iOS; Chrome/Edge/FF en iOS no pueden.
    const isSafari =
      /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isSafari ? 'ios' : null;
  }
  const isAndroid = /Android/.test(ua);
  return isAndroid ? 'android' : null;
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const DISMISS_KEY = 'pwa-banner-v1';
const DISMISS_DAYS = 30;

function wasDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function saveDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* sin acceso a storage → no importa */ }
}

/* ── Íconos SVG inline ──────────────────────────────────── */

/** Ícono Compartir de iOS (caja con flecha hacia arriba) */
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

/** Ícono + cuadrado (Agregar a pantalla de inicio) */
function AddSquareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/* ── Sub-componente: instrucciones iOS ──────────────────── */
function IOSBanner({ brandName, onDismiss }: { brandName: string; onDismiss: () => void }) {
  const steps = [
    {
      icon: <ShareIcon />,
      label: (
        <>
          Toca el botón{' '}
          <strong style={{ color: 'var(--u-text)' }}>Compartir</strong>{' '}
          <span style={{ display: 'inline-flex', verticalAlign: 'middle', opacity: 0.7 }}>
            <ShareIcon />
          </span>{' '}
          en la barra de Safari
        </>
      ),
    },
    {
      icon: <AddSquareIcon />,
      label: (
        <>
          Toca{' '}
          <strong style={{ color: 'var(--u-text)' }}>
            &ldquo;Agregar a pantalla de inicio&rdquo;
          </strong>
        </>
      ),
    },
    {
      icon: null,
      label: (
        <>
          Confirma tocando{' '}
          <strong style={{ color: 'var(--u-text)' }}>&ldquo;Agregar&rdquo;</strong>
        </>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--u-text)', lineHeight: 1.3 }}>
            Instala {brandName}
          </p>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
            Accede rápido desde tu pantalla de inicio
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Cerrar"
          style={{
            flexShrink: 0, display: 'grid', placeItems: 'center',
            width: 28, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.10)', color: 'var(--u-text-2)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Pasos */}
      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: 99,
              background: 'var(--brand-accent)',
              display: 'grid', placeItems: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--brand-on-accent, #fff)',
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.45, paddingTop: 3 }}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {/* Botón de cierre */}
      <button
        onClick={onDismiss}
        style={{
          width: '100%', padding: '11px 16px', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--u-hair-2)', background: 'transparent',
          color: 'var(--u-text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Entendido
      </button>
    </div>
  );
}

/* ── Sub-componente: botón de instalación Android ───────── */
function AndroidBanner({
  brandName,
  onInstall,
  onDismiss,
}: {
  brandName: string;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Ícono de app */}
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: 'var(--brand-accent)',
            display: 'grid', placeItems: 'center',
            color: 'var(--brand-on-accent, #fff)',
          }}>
            <Icon name="utensils" size={24} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--u-text)', lineHeight: 1.3 }}>
              Agrega {brandName} a tu inicio
            </p>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
              Ábrela rápido, sin buscarla en el navegador
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Cerrar"
          style={{
            flexShrink: 0, display: 'grid', placeItems: 'center',
            width: 28, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.10)', color: 'var(--u-text-2)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onDismiss}
          style={{
            flex: 1, padding: '11px 12px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--u-hair-2)', background: 'transparent',
            color: 'var(--u-text-3)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ahora no
        </button>
        <button
          onClick={onInstall}
          className="btn-accent"
          style={{
            flex: 2, padding: '11px 12px', borderRadius: 'var(--radius-lg)',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}

/* ── Componente principal ───────────────────────────────── */
interface Props {
  brandName: string;
}

export default function InstallBanner({ brandName }: Props) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (wasDismissed()) return;

    const plat = getInstalledPlatform();
    if (!plat) return;

    if (plat === 'android') {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setPlatform('android');
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    if (plat === 'ios') {
      const timer = setTimeout(() => {
        setPlatform('ios');
        setVisible(true);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    saveDismiss();
    setVisible(false);
  }

  async function install() {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') saveDismiss();
    deferredPrompt.current = null;
    setVisible(false);
  }

  if (!visible || !platform) return null;

  return (
    <div
      className="anim-slide-up"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        padding: '0 12px calc(16px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <Glass style={{ padding: '18px 16px', borderRadius: 'var(--radius-xl)', maxWidth: 460, margin: '0 auto' }}>
        {platform === 'ios' ? (
          <IOSBanner brandName={brandName} onDismiss={dismiss} />
        ) : (
          <AndroidBanner brandName={brandName} onInstall={install} onDismiss={dismiss} />
        )}
      </Glass>
    </div>
  );
}
