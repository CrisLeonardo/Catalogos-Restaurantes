'use client';

/* ============================================================
   AVISO "AÑADE LEOGIN AL INICIO" — web comercial y Mi cuenta.
   ------------------------------------------------------------
   Dos modos, según si quien lo ve ya tiene un panel propio:

   · SIN restaurante (prospecto en la web comercial, o cuenta nueva en Mi
     cuenta): instalar AQUÍ es correcto — no hay otro sitio al que mandarlo
     todavía. Mismo patrón que components/install-banner.tsx (el del menú
     del comensal): Android intercepta `beforeinstallprompt`, iOS enseña los
     pasos manuales.

   · CON un restaurante propio (`redirectUrl`): instalar AQUÍ sería un error
     — el panel real vive en `<slug>-admin.<dominio>`, un origen DISTINTO de
     este (dominio raíz), y un ícono instalado aquí queda con el scope
     equivocado. Android no soporta que una PWA abarque dos orígenes
     (`scope_extensions` existe pero solo en escritorio, no en móvil — ver
     [[feature-set-2026-09-01-pwa-scope-cruce-subdominios]]), así que la
     única salida real es instalarlo DESDE el panel. Este modo no ofrece
     instalar nada: manda para allá.

   Con 2+ restaurantes no aplica ninguno de los dos textos especiales: no
   hay un panel único al que mandar, así que el llamador simplemente no pasa
   `redirectUrl` y este componente ofrece instalar aquí mismo (ver
   mi-cuenta-client.tsx).
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

/** Manda al panel en vez de instalar aquí — dueño con un solo restaurante. */
function RedirectCard({ redirectUrl, onDismiss }: { redirectUrl: string; onDismiss: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--u-text)', lineHeight: 1.3 }}>Añade Leogin al inicio</p>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.5 }}>
            Hazlo desde tu panel, no desde aquí — así abre como una app de
            verdad y no como una página suelta.
          </p>
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
          onClick={() => window.location.assign(redirectUrl)}
          className="btn-accent"
          style={{ flex: 2, padding: '12px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none' }}
        >
          Ir a mi panel
        </button>
      </div>
    </div>
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

export default function LeoginInstallBanner({ redirectUrl = null }: { redirectUrl?: string | null }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandaloneMode() || wasDismissed()) return;
    const plat = getPlatform();
    if (!plat) return; // escritorio: sin flujo de instalación aquí

    // Con destino de panel, no hace falta esperar el prompt nativo ni el
    // retraso de iOS: el aviso no instala nada por sí mismo, así que puede
    // mostrarse de inmediato.
    if (redirectUrl) {
      setPlatform(plat);
      setVisible(true);
      return;
    }

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
  }, [redirectUrl]);

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
        {redirectUrl ? (
          <RedirectCard redirectUrl={redirectUrl} onDismiss={dismiss} />
        ) : platform === 'ios' ? (
          <IOSSteps onDismiss={dismiss} />
        ) : (
          <AndroidCard onInstall={install} onDismiss={dismiss} />
        )}
      </Glass>
    </div>
  );
}
