'use client';

/* ============================================================
   AVISO "AÑADE LEOGIN AL INICIO" — web comercial y Mi cuenta.
   ------------------------------------------------------------
   Instalar aquí SIEMPRE es correcto, tenga quien lo ve cero restaurantes o
   diez: desde la migración a origen único, el ícono cubre este dominio
   entero — Mi cuenta y el panel de cualquier restaurante (`/panel/<slug>/…`)
   viven en él. Mismo patrón que components/install-banner.tsx (el del menú
   del comensal): Android intercepta `beforeinstallprompt`, iOS enseña los
   pasos manuales.

   Hasta 2026-09-02 esto tenía un segundo modo (`redirectUrl`) que, al dueño
   de UN restaurante, en vez de instalar lo mandaba a hacerlo desde
   `<slug>-admin.<dominio>`: el panel vivía en otro ORIGEN y el scope de una
   PWA no puede abarcar dos (`scope_extensions` no existe en Android). Ese
   desvío se borró con la migración — ya no hay dos orígenes que reconciliar.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';

type Platform = 'ios' | 'android';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function getPlatform(): Platform | null {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream;
  if (isIOS) {
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isSafari ? 'ios' : null;
  }
  return /Android/.test(ua) ? 'android' : null;
}

function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const DISMISS_KEY = 'leogin-banner-v1';
const DISMISS_DAYS = 30;

function wasDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function saveDismiss() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* no-op */ }
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Cerrar"
      style={{
        flexShrink: 0, display: 'grid', placeItems: 'center',
        width: 28, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: 'var(--surface-3)', color: 'var(--u-text-2)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}


function IOSSteps({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--u-text)', lineHeight: 1.3 }}>Añade Leogin al inicio</p>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>Entra sin buscarlo en el navegador</p>
        </div>
        <CloseButton onClick={onDismiss} />
      </div>
      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          <>Toca el botón <strong style={{ color: 'var(--u-text)' }}>Compartir</strong> en la barra de Safari</>,
          <>Toca <strong style={{ color: 'var(--u-text)' }}>&ldquo;Agregar a pantalla de inicio&rdquo;</strong></>,
          <>Confirma tocando <strong style={{ color: 'var(--u-text)' }}>&ldquo;Agregar&rdquo;</strong></>,
        ].map((label, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: 99,
              background: 'var(--brand-accent)', display: 'grid', placeItems: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--brand-on-accent, #fff)',
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 13.5, color: 'var(--u-text-2)', lineHeight: 1.45, paddingTop: 3 }}>{label}</span>
          </li>
        ))}
      </ol>
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

function AndroidCard({ onInstall, onDismiss }: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: 'var(--brand-accent)', display: 'grid', placeItems: 'center',
            color: 'var(--brand-on-accent, #fff)',
          }}>
            <Icon name="download" size={22} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--u-text)', lineHeight: 1.3 }}>Añade Leogin al inicio</p>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>Entra sin buscarlo en el navegador</p>
          </div>
        </div>
        <CloseButton onClick={onDismiss} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onDismiss}
          style={{
            flex: 1, padding: '12px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--u-hair-2)', background: 'transparent',
            color: 'var(--u-text-3)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ahora no
        </button>
        <button
          onClick={onInstall}
          className="btn-accent"
          style={{ flex: 2, padding: '12px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none' }}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}

export default function LeoginInstallBanner() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandaloneMode() || wasDismissed()) return;
    const plat = getPlatform();
    if (!plat) return; // escritorio: sin flujo de instalación aquí

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
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '100vw', zIndex: 200,
        padding: '0 12px calc(16px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <Glass style={{ padding: '18px 16px', borderRadius: 'var(--radius-xl)', maxWidth: 460, margin: '0 auto' }}>
        {platform === 'ios' ? (
          <IOSSteps onDismiss={dismiss} />
        ) : (
          <AndroidCard onInstall={install} onDismiss={dismiss} />
        )}
      </Glass>
    </div>
  );
}
