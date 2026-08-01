'use client';

/* Galería de plantillas prediseñadas — usada por el editor del dueño
   (/admin/personalizacion) y el del Super Admin. Cada tarjeta es un mock
   CSS en miniatura del menú (portada + catálogo) pintado con la paleta,
   forma y vista reales de la plantilla, para que se entienda de un vistazo
   hasta dónde llega la personalización. Las fuentes se aproximan con el
   stack de respaldo de cada familia (no cargamos 16 familias de Google
   solo para miniaturas). */

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { BUILTIN_TEMPLATES, type BuiltinTemplate } from '@/lib/theme/templates';
import { DEFAULT_CONFIG, findFont, type ThemeConfig } from '@/lib/theme/defaults';

function rgbaOf(hex: string, a: number): string {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function approxFont(family: string, bold = false): React.CSSProperties {
  const f = findFont(family);
  const stack = f?.stack ?? 'system-ui, sans-serif';
  // Las condensadas (Anton/Bebas) y las black pesan más para conservar el carácter.
  const heavy = /Anton|Bebas|Archivo|Unbounded|Syne/.test(family);
  return {
    fontFamily: stack,
    fontWeight: bold || heavy ? 800 : 600,
    ...(heavy ? { letterSpacing: '-0.01em' } : {}),
  };
}

/* ── Miniatura: portada + catálogo pintados con la config ──
   Exportada: la reutiliza owner-templates.tsx para las plantillas propias
   del restaurante (misma forma BuiltinTemplate → mismo mini-preview). */
export function Thumb({ tpl }: { tpl: BuiltinTemplate }) {
  const c: ThemeConfig = { ...DEFAULT_CONFIG, ...tpl.config };
  const light = c.scheme === 'light';
  const hair = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)';
  const tileBg = light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
  const text2 = rgbaOf(c.colorText, 0.62);
  const r = (px: number) => Math.round(px * c.cornerRadius);

  const bg =
    c.backgroundType === 'gradient' && c.backgroundGradient
      ? c.backgroundGradient
      : c.backgroundType === 'asphalt'
        ? `radial-gradient(120% 90% at 50% 0%, ${c.colorBg2}, ${c.colorBg})`
        : c.colorBg;

  const cta = (label: string, size: 'sm' | 'lg' = 'lg') => {
    const base: React.CSSProperties = {
      borderRadius: 99, textAlign: 'center',
      padding: size === 'lg' ? '4px 0' : '2.5px 8px',
      fontSize: 6.5, fontWeight: 800, letterSpacing: '0.02em',
      width: size === 'lg' ? '82%' : 'auto', margin: '0 auto',
    };
    if (c.ctaStyle === 'accent') return { ...base, background: c.colorAccent, color: c.onAccent };
    if (c.ctaStyle === 'outline') return { ...base, background: 'transparent', color: c.colorText, border: `1px solid ${rgbaOf(c.colorText, 0.55)}` };
    return { ...base, background: c.colorText, color: c.colorBg };
  };

  const productTiles = () => {
    if (c.catalogView === 'list') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0.9, 0.7, 0.8].map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: tileBg, border: `1px solid ${hair}`, borderRadius: r(7), padding: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: r(5), background: rgbaOf(c.colorAccent, 0.3), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 3.5, width: `${w * 100}%`, borderRadius: 2, background: rgbaOf(c.colorText, 0.72) }} />
                <div style={{ height: 2.5, width: '52%', borderRadius: 2, background: rgbaOf(c.colorText, 0.28), marginTop: 2.5 }} />
              </div>
              <div style={{ fontSize: 5.5, fontWeight: 800, color: c.colorAccent, fontFamily: 'ui-monospace, monospace' }}>Q45</div>
            </div>
          ))}
        </div>
      );
    }
    const cols = c.catalogColumns === 3 ? 3 : 2;
    const n = cols === 3 ? 3 : 2;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ background: tileBg, border: `1px solid ${hair}`, borderRadius: r(8), overflow: 'hidden' }}>
            <div style={{ height: cols === 3 ? 16 : 22, background: `linear-gradient(135deg, ${rgbaOf(c.colorAccent, 0.34)}, ${rgbaOf(c.colorAccent, 0.1)})` }} />
            <div style={{ padding: 4 }}>
              <div style={{ height: 3.5, width: '78%', borderRadius: 2, background: rgbaOf(c.colorText, 0.72) }} />
              <div style={{ height: 3, width: '38%', borderRadius: 2, background: c.colorAccent, marginTop: 3 }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      aria-hidden
      style={{
        position: 'relative', width: '100%', aspectRatio: '10 / 13', overflow: 'hidden',
        borderRadius: 12, border: `1px solid ${hair}`, background: bg,
        display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
      }}
    >
      {c.ambientGlow && (
        <div style={{ position: 'absolute', top: -22, left: '18%', width: 90, height: 90, borderRadius: '50%', background: `radial-gradient(circle, ${rgbaOf(c.colorAccent, 0.26)}, transparent 65%)`, pointerEvents: 'none' }} />
      )}

      {/* Portada */}
      {c.portadaVariant === 'spotlight' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0 4px', position: 'relative' }}>
          <div style={{ width: 20, height: 20, borderRadius: '28%', background: tileBg, border: `1px solid ${hair}`, display: 'grid', placeItems: 'center', fontSize: 9, color: c.colorText, ...approxFont(c.fontDisplay, true) }}>T</div>
          <div style={{ fontSize: 11, color: c.colorText, ...approxFont(c.fontDisplay, true) }}>Tu Restaurante</div>
          <div style={{ fontSize: 6.5, color: text2, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Sabor que enamora</div>
          <div style={{ ...cta('Ver el menú'), marginTop: 2 }}>Ver el menú</div>
        </div>
      )}
      {c.portadaVariant === 'poster' && (
        <div style={{ padding: '4px 2px 2px', position: 'relative' }}>
          <div style={{ fontSize: 5, letterSpacing: '0.28em', color: text2, textTransform: 'uppercase', ...approxFont(c.fontPoster) }}>EST · 2024</div>
          <div style={{ fontSize: 20, lineHeight: 0.9, color: c.colorText, textTransform: 'uppercase', marginTop: 2, ...approxFont(c.fontPoster, true) }}>Tu Resto</div>
          <div style={{ ...cta('Ver'), width: '58%', margin: '5px 0 0' }}>Ver el menú</div>
        </div>
      )}
      {c.portadaVariant === 'stack' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 0 1px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: '28%', background: tileBg, border: `1px solid ${hair}` }} />
            <div style={{ fontSize: 8.5, color: c.colorText, ...approxFont(c.fontDisplay, true) }}>Tu Restaurante</div>
          </div>
          {[0, 1].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: tileBg, border: `1px solid ${hair}`, borderRadius: r(7), padding: '3.5px 5px' }}>
              <div style={{ width: 9, height: 9, borderRadius: r(4), background: rgbaOf(c.colorAccent, 0.32) }} />
              <div style={{ height: 3, flex: 1, maxWidth: '62%', borderRadius: 2, background: rgbaOf(c.colorText, 0.55) }} />
            </div>
          ))}
        </div>
      )}

      {/* Catálogo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: c.portadaVariant === 'none' ? 11 : 8, color: c.colorText, textTransform: 'uppercase', ...approxFont(c.fontPoster, true) }}>El menú</div>
          {c.showSearch && <div style={{ width: 26, height: 6, borderRadius: 99, background: tileBg, border: `1px solid ${hair}` }} />}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <div style={{ padding: '2px 6px', borderRadius: 99, fontSize: 5, fontWeight: 700, background: c.checkoutActiveColor === 'accent' ? c.colorAccent : c.colorText, color: c.checkoutActiveColor === 'accent' ? c.onAccent : c.colorBg }}>Todo</div>
          {['Tacos', 'Bebidas'].map((t) => (
            <div key={t} style={{ padding: '2px 6px', borderRadius: 99, fontSize: 5, fontWeight: 600, background: tileBg, border: `1px solid ${hair}`, color: text2 }}>{t}</div>
          ))}
        </div>
        {productTiles()}
      </div>
    </div>
  );
}

/* ── Galería ────────────────────────────────────────────────── */
export default function TemplateGallery({
  onApply,
  appliedId,
  mode = 'apply',
}: {
  /** Se llama con la plantilla elegida; el editor hace el merge y avisa. */
  onApply: (tpl: BuiltinTemplate) => void;
  /** id de la última plantilla aplicada (marca "Aplicada ✓"). */
  appliedId?: string | null;
  /** 'apply' = editor de tema (Aplicada) · 'pick' = registro (Elegida). */
  mode?: 'apply' | 'pick';
}) {
  const [filter, setFilter] = useState<'Todas' | 'Oscuro' | 'Claro'>('Todas');
  const shown = BUILTIN_TEMPLATES.filter((t) => filter === 'Todas' || t.mode === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['Todas', 'Oscuro', 'Claro'] as const).map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="press"
              style={{
                padding: '6px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                color: on ? 'var(--admin-content-bg-solid, var(--brand-bg))' : 'var(--u-text-3)',
              }}
            >
              {f === 'Todas' ? 'Todas' : f === 'Oscuro' ? 'Oscuras' : 'Claras'}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
        {shown.map((tpl) => {
          const applied = appliedId === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onApply(tpl)}
              className="press"
              title={mode === 'pick'
                ? `Empezar con el estilo "${tpl.name}" (podrás personalizarlo después)`
                : `Aplicar "${tpl.name}" (tu logo, textos y configuración de pedidos se conservan)`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left',
                padding: 7, borderRadius: 15, cursor: 'pointer',
                border: `1.5px solid ${applied ? 'var(--brand-accent, #D97757)' : 'var(--u-hair)'}`,
                background: applied
                  ? 'color-mix(in srgb, var(--brand-accent, #D97757) 8%, transparent)'
                  : 'color-mix(in srgb, var(--u-text) 3%, transparent)',
                transition: 'border-color 150ms, background 150ms',
              }}
            >
              <Thumb tpl={tpl} />
              <div style={{ padding: '0 3px 3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text)', flex: 1, minWidth: 0 }}>{tpl.name}</span>
                  {applied ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-ink, #D97757)', flexShrink: 0 }}>
                      <Icon name="checkCircle" size={11} /> {mode === 'pick' ? 'Elegida' : 'Aplicada'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--u-text-4)', border: '1px solid var(--u-hair)', borderRadius: 99, padding: '1.5px 7px', flexShrink: 0 }}>
                      {tpl.mode}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--u-text-4)', lineHeight: 1.4, marginTop: 3 }}>{tpl.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
