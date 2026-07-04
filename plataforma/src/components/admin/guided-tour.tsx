'use client';

/* ============================================================
   GuidedTourHost — motor de tours guiados del centro de ayuda
   ------------------------------------------------------------
   Sustituye a las capturas de pantalla: señala la interfaz REAL
   con un spotlight (mismo lenguaje visual del tour de bienvenida)
   y navega solo entre las páginas del panel.

   · Vive montado una vez en AdminShell (el layout persiste entre
     navegaciones, así el tour sobrevive los cambios de página).
   · Se arranca desde cualquier parte con startGuidedTour(id) —
     dispara un evento; el host escucha y toma el control.
   · El paso activo se refleja en sessionStorage: si el dueño
     recarga a media explicación, el tour continúa donde iba.
   · Si el target de un paso no aparece (módulo apagado, plan
     menor, layout móvil distinto) se muestra la burbuja centrada
     sin spotlight: el tour degrada, nunca se rompe.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { getGuidedTour, type GuidedTourDef } from '@/lib/tutorial/tours';

const STORE_KEY = 'leogin-guided-tour';
const START_EVENT = 'leogin:start-tour';
const BUBBLE_W = 308;
const PAD = 9;
/** Reintentos × intervalo esperando el target tras navegar (≈3 s). */
const LOCATE_TRIES = 15;
const LOCATE_MS = 200;

/** Arranca un tour guiado desde cualquier componente del panel. */
export function startGuidedTour(tourId: string): void {
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { tourId } }));
}

type Stored = { tourId: string; step: number };

function readStore(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    return typeof v?.tourId === 'string' && typeof v?.step === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeStore(v: Stored | null): void {
  try {
    if (v) sessionStorage.setItem(STORE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(STORE_KEY);
  } catch { /* no-op */ }
}

export default function GuidedTourHost() {
  const router = useRouter();
  const pathname = usePathname();
  const [tour, setTour] = useState<GuidedTourDef | null>(null);
  const [step, setStep] = useState(0);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  /** true mientras navegamos/esperamos el target (no pintar burbuja a medias). */
  const [settling, setSettling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const locateTimer = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 821);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Arranque por evento (botón "Ver en mi panel" del centro de ayuda).
  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent<{ tourId: string }>).detail?.tourId;
      const def = id ? getGuidedTour(id) : null;
      if (!def) return;
      writeStore({ tourId: def.id, step: 0 });
      setTour(def);
      setStep(0);
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);

  // Reanudar tras una recarga completa (el estado de React se pierde).
  useEffect(() => {
    const stored = readStore();
    if (!stored) return;
    const def = getGuidedTour(stored.tourId);
    if (!def || stored.step >= def.steps.length) { writeStore(null); return; }
    setTour(def);
    setStep(stored.step);
  }, []);

  const stopLocating = useCallback(() => {
    if (locateTimer.current !== null) {
      window.clearInterval(locateTimer.current);
      locateTimer.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    stopLocating();
    writeStore(null);
    setTour(null);
    setStep(0);
    setSpotRect(null);
  }, [stopLocating]);

  // Cada paso: navegar si hace falta y luego localizar el target con reintentos
  // (la página destino tarda en montar). Si nunca aparece → burbuja centrada.
  useEffect(() => {
    if (!tour) return;
    const def = tour.steps[step];
    if (!def) { finish(); return; }

    writeStore({ tourId: tour.id, step });

    if (def.path && pathname !== def.path) {
      setSettling(true);
      setSpotRect(null);
      router.push(def.path);
      return; // el cambio de pathname re-dispara este efecto
    }

    if (!def.target) {
      setSpotRect(null);
      setSettling(false);
      return;
    }

    setSettling(true);
    let tries = 0;
    stopLocating();
    const attempt = () => {
      tries += 1;
      const el = document.querySelector<HTMLElement>(`[data-tour-step="${def.target}"]`);
      if (el && el.getBoundingClientRect().height > 0) {
        stopLocating();
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Tras el scroll suave, medir en el lugar final.
        window.setTimeout(() => {
          setSpotRect(el.getBoundingClientRect());
          setSettling(false);
        }, 320);
        return;
      }
      if (tries >= LOCATE_TRIES) {
        stopLocating();
        setSpotRect(null);      // sin spotlight, pero el texto se muestra igual
        setSettling(false);
      }
    };
    attempt();
    locateTimer.current = window.setInterval(attempt, LOCATE_MS);
    return stopLocating;
  }, [tour, step, pathname, router, finish, stopLocating]);

  // Mantener el spotlight pegado al elemento en resize/scroll.
  useEffect(() => {
    if (!tour || settling) return;
    const def = tour.steps[step];
    if (!def?.target) return;
    const refresh = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour-step="${def.target}"]`);
      setSpotRect(el && el.getBoundingClientRect().height > 0 ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [tour, step, settling]);

  if (!tour) return null;
  const current = tour.steps[step];
  if (!current) return null;

  const isLast = step === tour.steps.length - 1;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const spot = spotRect
    ? {
        x: Math.max(0, spotRect.left - PAD),
        y: Math.max(0, spotRect.top - PAD),
        w: spotRect.width + PAD * 2,
        h: spotRect.height + PAD * 2,
        rx: 12,
      }
    : null;

  let bubbleStyle: React.CSSProperties;
  if (isMobile || !spot) {
    bubbleStyle = {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: Math.min(BUBBLE_W, vw - 32),
    };
  } else {
    const leftCandidate = spot.x + spot.w + 18;
    const topCandidate = Math.min(Math.max(spot.y + spot.h / 2 - 100, 20), vh - 300);
    bubbleStyle = {
      position: 'fixed',
      left: Math.min(leftCandidate, vw - BUBBLE_W - 16),
      top: topCandidate,
      width: BUBBLE_W,
    };
  }

  const accentRgb = 'var(--brand-accent-rgb, 99,102,241)';

  return (
    <>
      {/* Velo con recorte de spotlight (idéntico al tour de bienvenida) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Guía: ${tour.label}, paso ${step + 1} de ${tour.steps.length}`}
        style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
        onClick={finish}
      >
        {spot ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100%" height="100%"
            style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}
          >
            <defs>
              <mask id="guided-tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx={spot.rx} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.70)" mask="url(#guided-tour-mask)" />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.70)' }} />
        )}

        {spot && (
          <div
            style={{
              position: 'fixed',
              left: spot.x - 3, top: spot.y - 3,
              width: spot.w + 6, height: spot.h + 6,
              borderRadius: spot.rx + 3,
              border: `2px solid rgba(${accentRgb}, 0.7)`,
              boxShadow: `0 0 12px rgba(${accentRgb}, 0.3)`,
              pointerEvents: 'none',
              animation: 'guided-ring-pulse 2.4s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Burbuja */}
      <div
        className="glass-solid"
        style={{
          ...bubbleStyle,
          zIndex: 9998,
          borderRadius: 18,
          padding: '20px 20px 16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          opacity: settling ? 0 : 1,
          transition: 'opacity 180ms ease',
          pointerEvents: settling ? 'none' : 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {tour.steps.map((_, i) => (
            <div
              key={i}
              style={{
                height: 3, flex: i === step ? 2 : 1, borderRadius: 99,
                background: i < step
                  ? `rgba(${accentRgb}, 0.35)`
                  : i === step
                  ? 'var(--brand-accent, #6366f1)'
                  : 'var(--u-hair)',
                transition: 'all 320ms ease',
              }}
            />
          ))}
        </div>

        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--brand-accent, #6366f1)',
          marginBottom: 7,
        }}>
          {tour.label} · paso {step + 1} de {tour.steps.length}
        </div>

        <h3 style={{
          fontSize: 15, fontWeight: 800, color: 'var(--u-text)',
          margin: '0 0 8px', lineHeight: 1.2,
          fontFamily: 'var(--font-display, inherit)',
        }}>
          {current.title}
        </h3>

        <p style={{
          fontSize: 13, color: 'var(--u-text-2)',
          margin: '0 0 18px', lineHeight: 1.65,
        }}>
          {current.desc}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={finish}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--u-text-4)', padding: '4px 2px',
            }}
          >
            Salir
          </button>

          <div style={{ display: 'flex', gap: 7 }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="press glass-quiet"
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 10,
                  padding: '8px 13px', fontSize: 12.5, fontWeight: 600,
                  color: 'var(--u-text-2)', background: 'none',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <Icon name="chevronLeft" size={14} />
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={() => { if (isLast) finish(); else setStep((s) => s + 1); }}
              className="press"
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 10,
                padding: '8px 18px', fontSize: 12.5, fontWeight: 700,
                background: 'var(--brand-accent, #6366f1)',
                color: 'var(--brand-on-accent, #fff)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {isLast ? (
                <><Icon name="check" size={14} /> ¡Listo!</>
              ) : (
                <>Siguiente <Icon name="chevronRight" size={14} /></>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes guided-ring-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.012); }
        }
      `}</style>
    </>
  );
}
