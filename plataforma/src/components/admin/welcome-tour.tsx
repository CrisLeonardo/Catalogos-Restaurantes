'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icons';

const TOUR_KEY = 'leogin_tour_completed';
const BUBBLE_W = 308;
const PAD = 9;

type StepDef = {
  title: string;
  desc: string;
  target: string | null;
};

const STEPS: StepDef[] = [
  {
    title: '¡Bienvenido a tu panel!',
    desc: 'Este es tu centro de control: tu menú, tus pedidos y tus clientes. Te enseñamos dónde está cada cosa en menos de un minuto.',
    target: null,
  },
  {
    title: 'Seis lugares, nada más',
    desc: 'Todo el sistema vive en estas seis secciones. Al entrar en cualquiera aparecen sus pestañas arriba: no hay nada escondido, solo un nivel más adentro.',
    target: 'nav',
  },
  {
    title: 'Hoy',
    desc: 'Lo que está pasando ahora mismo: los pedidos en curso, las ventas del día y lo único que necesita tu atención. Si algo se rompe, te enteras aquí.',
    target: 'hoy',
  },
  {
    title: 'Tu menú',
    desc: 'Empieza aquí: agrega tus platillos con foto y precio y organízalos por categorías. Quedan visibles en tu menú digital de inmediato.',
    target: 'menu',
  },
  {
    title: 'Ajustes',
    desc: 'Tu código QR, los colores de tu marca, tu equipo, tu plan y las guías paso a paso: todo lo que se configura una vez vive aquí.',
    target: 'ajustes',
  },
];

interface Props {
  restaurantName?: string;
  preview?: boolean;
}

export default function WelcomeTour({ restaurantName, preview }: Props) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (preview) return;
    if (localStorage.getItem(TOUR_KEY) !== 'true') {
      const t = setTimeout(() => setActive(true), 700);
      return () => clearTimeout(t);
    }
  }, [preview]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 821);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const locateTarget = useCallback((stepIdx: number) => {
    const { target } = STEPS[stepIdx];
    if (!target) { setSpotRect(null); return; }

    const el = document.querySelector<HTMLElement>(`[data-tour-step="${target}"]`);
    if (!el) { setSpotRect(null); return; }

    const r = el.getBoundingClientRect();
    // Ya no hay secciones plegables que expandir (el menú son seis destinos
    // siempre visibles): si algo mide cero es que no está en pantalla, y el
    // paso sigue sin foco en vez de señalar a la nada.
    if (r.height === 0) { setSpotRect(null); return; }
    setSpotRect(r);
  }, []);

  useEffect(() => {
    if (!active) return;
    locateTarget(step);
    const refresh = () => locateTarget(step);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [active, step, locateTarget]);

  const complete = useCallback(() => {
    localStorage.setItem(TOUR_KEY, 'true');
    setActive(false);
  }, []);

  if (!active) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
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
      {/* Backdrop with SVG spotlight cutout */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour de bienvenida, paso ${step + 1} de ${STEPS.length}`}
        style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
        onClick={complete}
      >
        {spot ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100%" height="100%"
            style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}
          >
            <defs>
              <mask id="tour-spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx={spot.rx} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.70)" mask="url(#tour-spotlight-mask)" />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.70)' }} />
        )}

        {/* Pulsing ring around spotlight */}
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
              animation: 'tour-ring-pulse 2.4s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Bubble */}
      <div
        className="glass-solid"
        style={{
          ...bubbleStyle,
          zIndex: 9998,
          borderRadius: 'var(--radius-xl)',
          padding: '20px 20px 16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step progress bars */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 3, flex: i === step ? 2 : 1, borderRadius: 'var(--radius-full)',
                background: i < step
                  ? `rgba(${accentRgb}, 0.35)`
                  : i === step
                  ? `var(--brand-accent, #6366f1)`
                  : 'var(--u-hair)',
                transition: 'all 320ms ease',
              }}
            />
          ))}
        </div>

        {/* Step label */}
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--brand-accent-ink, #6366f1)',
          marginBottom: 7,
        }}>
          Paso {step + 1} de {STEPS.length}
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: 15, fontWeight: 800, color: 'var(--u-text)',
          margin: '0 0 8px', lineHeight: 1.2,
          fontFamily: 'var(--font-display, inherit)',
        }}>
          {step === 0 && restaurantName
            ? `¡Bienvenido, ${restaurantName}!`
            : current.title}
        </h3>

        {/* Description */}
        <p style={{
          fontSize: 13, color: 'var(--u-text-2)',
          margin: '0 0 18px', lineHeight: 1.65,
        }}>
          {current.desc}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={complete}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--u-text-4)', padding: '4px 2px',
            }}
          >
            Omitir
          </button>

          <div style={{ display: 'flex', gap: 7 }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="press glass-quiet"
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)',
                  padding: '8px 13px', fontSize: 12, fontWeight: 600,
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
              onClick={() => { if (isLast) complete(); else setStep((s) => s + 1); }}
              className="press"
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)',
                padding: '8px 18px', fontSize: 12, fontWeight: 700,
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
        @keyframes tour-ring-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.012); }
        }
      `}</style>
    </>
  );
}
