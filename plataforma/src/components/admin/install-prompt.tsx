'use client';

/* ============================================================
   INSTALL PROMPT DEL ADMIN — recuerda cada cierto tiempo a quien
   entra desde el navegador móvil que puede "añadir Leogin al
   inicio" (no hay app en Play Store/App Store, ver
   /api/admin-manifest). Combina dos vías:
     1. Recordatorio automático y periódico (cada REMIND_DAYS días,
        no solo una vez) mientras no esté instalado.
     2. Un botón fijo en la topbar que abre las mismas instrucciones
        en cualquier momento — funciona tanto en Android (usa el
        prompt nativo si el navegador lo ofreció) como en iOS
        (instrucciones manuales, Apple no permite prompt nativo).
   No aparece en escritorio: ahí existe el instalador real de
   Leogin Desktop.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';

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
  const isAndroid = /Android/.test(ua);
  return isAndroid ? 'android' : null;
}

function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// A diferencia del banner del catálogo (que se descarta 30 días y no
// vuelve), aquí SÍ debe volver: quien no lo instala una vez suele
// olvidarlo, y el panel se usa a diario. Cada apertura marca "mostrado
// hace X" — el recordatorio automático solo se dispara si ya pasó ese
// plazo, así no se vuelve molesto.
const LAST_SHOWN_KEY = 'admin-install-prompt-v1';
const REMIND_DAYS = 7;

function getLastShown(): number {
  try {
    return parseInt(localStorage.getItem(LAST_SHOWN_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

function markShown() {
  try {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
  } catch {
    /* sin acceso a storage → simplemente no se recuerda la fecha */
  }
}

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

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Cerrar"
      style={{
        flexShrink: 0, display: 'grid', placeItems: 'center',
        /* 36 y no 28: es la única salida de una hoja que tapa la pantalla
           entera, y con 28 px el pulgar fallaba y tocaba el velo. */
        width: 36, height: 36, borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
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
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>Entra al panel sin buscarlo en el navegador</p>
        </div>
        <CloseButton onClick={onDismiss} />
      </div>
      <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          <>Toca el botón <strong style={{ color: 'var(--u-text)' }}>Compartir</strong>{' '}
            <span style={{ display: 'inline-flex', verticalAlign: 'middle', opacity: 0.7 }}><ShareIcon /></span>{' '}
            en la barra de Safari</>,
          <>Toca <strong style={{ color: 'var(--u-text)' }}>&ldquo;Agregar a pantalla de inicio&rdquo;</strong></>,
          <>Confirma tocando <strong style={{ color: 'var(--u-text)' }}>&ldquo;Agregar&rdquo;</strong></>,
        ].map((label, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: 'var(--radius-full)',
              background: 'var(--brand-accent)', display: 'grid', placeItems: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--brand-on-accent, #fff)',
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 13, color: 'var(--u-text-2)', lineHeight: 1.45, paddingTop: 3 }}>{label}</span>
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

function AndroidSteps({
  onInstall,
  onDismiss,
  hasNativePrompt,
}: {
  onInstall: () => void;
  onDismiss: () => void;
  hasNativePrompt: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-lg)', flexShrink: 0,
            background: 'var(--brand-accent)', display: 'grid', placeItems: 'center',
            color: 'var(--brand-on-accent, #fff)',
          }}>
            <Icon name="download" size={22} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--u-text)', lineHeight: 1.3 }}>Añade Leogin al inicio</p>
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
              {hasNativePrompt
                ? 'Entra al panel sin buscarlo en el navegador'
                : 'Menú ⋮ del navegador → "Instalar app" o "Añadir a pantalla de inicio"'}
            </p>
          </div>
        </div>
        <CloseButton onClick={onDismiss} />
      </div>
      {hasNativePrompt && (
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
      )}
    </div>
  );
}

export default function AdminInstallPrompt() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [open, setOpen] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  /* Si el navegador ofreció el prompt nativo. Estado y no el ref leído al
     pintar: el evento suele llegar DESPUÉS de montar y, leyendo el ref, la
     hoja seguía enseñando las instrucciones a mano teniendo el botón
     «Instalar» disponible. */
  const [hayNativo, setHayNativo] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) return;
    const plat = getPlatform();
    if (!plat) return;
    setPlatform(plat);

    if (plat === 'android') {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setHayNativo(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  // Recordatorio automático: solo si ya pasaron REMIND_DAYS desde la
  // última vez que se mostró (auto o manual). Así vuelve a aparecer
  // cada cierto tiempo en vez de una sola vez para siempre.
  useEffect(() => {
    if (!platform) return;
    const due = Date.now() - getLastShown() > REMIND_DAYS * 24 * 60 * 60 * 1000;
    if (!due) return;
    const timer = setTimeout(() => {
      setOpen(true);
      markShown();
    }, 3000);
    return () => clearTimeout(timer);
  }, [platform]);

  function openManually() {
    setOpen(true);
    markShown();
  }

  function close() {
    setOpen(false);
  }

  async function install() {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt.current = null;
    setHayNativo(false);
    setOpen(false);
  }

  if (!platform) return null; // escritorio: ahí se usa el instalador de Leogin Desktop

  return (
    <>
      <Button
        onClick={openManually}
        title="Añadir Leogin al inicio"
        aria-label="Añadir Leogin al inicio"
        variant="ghost"
        size="icon"
        className="shrink-0"
      >
        <Icon name="download" size={18} />
      </Button>
      {open && typeof document !== 'undefined' && createPortal(
        // Portal a <body>: si este overlay quedara anidado dentro de
        // .admin-topbar (que tiene backdrop-filter), ese ancestro se
        // convierte en el "containing block" del position:fixed y el
        // inset:0 se calcula contra la topbar (64px) en vez de la pantalla
        // completa — la hoja terminaba recortada arriba, medio tapada por
        // la cabecera. Desde <body> no hay ese problema.
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: 'color-mix(in srgb, black 45%, transparent)',
            padding: '0 12px calc(16px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="anim-slide-up" style={{ width: '100%', maxWidth: 460 }}>
            <Glass style={{ padding: '18px 16px', borderRadius: 'var(--radius-xl)' }}>
              {platform === 'ios' ? (
                <IOSSteps onDismiss={close} />
              ) : (
                <AndroidSteps onInstall={install} onDismiss={close} hasNativePrompt={hayNativo} />
              )}
            </Glass>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
