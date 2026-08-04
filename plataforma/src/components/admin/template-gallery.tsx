'use client';

/* Galería de plantillas prediseñadas — usada por el editor del dueño
   (/admin/personalizacion) y el del Super Admin. Cada tarjeta es un mock
   CSS en miniatura del menú (portada + catálogo) pintado con la paleta,
   forma y ESTRUCTURA reales de la plantilla, para que se entienda de un
   vistazo hasta dónde llega la personalización. Las fuentes se aproximan
   con el stack de respaldo de cada familia (no cargamos 22 familias de
   Google solo para miniaturas).

   La miniatura tiene que dibujar de verdad la navegación y la forma del
   platillo: si todas se vieran como una rejilla de tarjetas, la galería
   mentiría justo sobre lo único que distingue a las plantillas nuevas. */

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

  const cta = (size: 'sm' | 'lg' = 'lg'): React.CSSProperties => {
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

  /* ── Piezas de platillo en miniatura ── */

  const tile = (h: number) => (
    <div style={{ background: tileBg, border: `1px solid ${hair}`, borderRadius: r(8), overflow: 'hidden' }}>
      <div style={{ height: h, background: `linear-gradient(135deg, ${rgbaOf(c.colorAccent, 0.34)}, ${rgbaOf(c.colorAccent, 0.1)})` }} />
      <div style={{ padding: 4 }}>
        <div style={{ height: 3.5, width: '78%', borderRadius: 2, background: rgbaOf(c.colorText, 0.72) }} />
        <div style={{ height: 3, width: '38%', borderRadius: 2, background: c.colorAccent, marginTop: 3 }} />
      </div>
    </div>
  );

  const row = (w: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: tileBg, border: `1px solid ${hair}`, borderRadius: r(7), padding: 4 }}>
      <div style={{ width: 16, height: 16, borderRadius: r(5), background: rgbaOf(c.colorAccent, 0.3), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ height: 3.5, width: `${w * 100}%`, borderRadius: 2, background: rgbaOf(c.colorText, 0.72) }} />
        <div style={{ height: 2.5, width: '52%', borderRadius: 2, background: rgbaOf(c.colorText, 0.28), marginTop: 2.5 }} />
      </div>
      <div style={{ fontSize: 5.5, fontWeight: 800, color: c.colorAccent, fontFamily: 'ui-monospace, monospace' }}>Q45</div>
    </div>
  );

  // Carta impresa: sin arte, con el filete punteado que une nombre y precio.
  const textLine = (w: number) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '3.5px 0', borderBottom: `1px solid ${hair}` }}>
      <div style={{ height: 3.5, width: `${w * 46}%`, borderRadius: 2, background: rgbaOf(c.colorText, 0.78), flexShrink: 0, marginBottom: 0.5 }} />
      <div style={{ flex: 1, borderBottom: `1px dotted ${rgbaOf(c.colorText, 0.36)}`, marginBottom: 1.5 }} />
      <div style={{ fontSize: 5.5, fontWeight: 700, color: c.colorAccent, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>Q45</div>
    </div>
  );

  const items = () => {
    if (c.cardStyle === 'texto') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[1, 0.78, 0.62, 0.88].map((w, i) => <div key={i}>{textLine(w)}</div>)}
        </div>
      );
    }
    if (c.cardStyle === 'fila') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0.9, 0.7, 0.8].map((w, i) => <div key={i}>{row(w)}</div>)}
        </div>
      );
    }
    if (c.cardStyle === 'carrusel') {
      // La última pieza se corta a propósito: eso es lo que dice "esto se desliza".
      return (
        <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
          {[30, 30, 30, 16].map((w, i) => (
            <div key={i} style={{ width: w, flexShrink: 0, opacity: i === 3 ? 0.5 : 1 }}>{tile(18)}</div>
          ))}
        </div>
      );
    }
    if (c.cardStyle === 'mosaico') {
      return (
        <div style={{ columnCount: 2, columnGap: 4 }}>
          {[22, 13, 16, 11].map((h, i) => (
            <div key={i} style={{ breakInside: 'avoid', marginBottom: 4 }}>{tile(h)}</div>
          ))}
        </div>
      );
    }
    const cols = c.catalogColumns === 3 ? 3 : 2;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
        {Array.from({ length: cols }, (_, i) => <div key={i}>{tile(cols === 3 ? 16 : 22)}</div>)}
      </div>
    );
  };

  /* ── Navegación en miniatura ── */

  const chipRow = (isIndex: boolean) => (
    <div style={{ display: 'flex', gap: 3 }}>
      <div style={{ padding: '2px 6px', borderRadius: 99, fontSize: 5, fontWeight: 700, background: c.checkoutActiveColor === 'accent' ? c.colorAccent : c.colorText, color: c.checkoutActiveColor === 'accent' ? c.onAccent : c.colorBg }}>
        {isIndex ? 'Tacos' : 'Todo'}
      </div>
      {(isIndex ? ['Bebidas', 'Postres'] : ['Tacos', 'Bebidas']).map((t) => (
        <div key={t} style={{ padding: '2px 6px', borderRadius: 99, fontSize: 5, fontWeight: 600, background: tileBg, border: `1px solid ${hair}`, color: text2 }}>{t}</div>
      ))}
    </div>
  );

  const sectionHead = (label: string, dim = false) => (
    <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 2, borderBottom: `1px solid ${hair}`, marginBottom: 3 }}>
      <div style={{ fontSize: 6.5, color: dim ? text2 : c.colorText, textTransform: 'uppercase', ...approxFont(c.fontPoster, true) }}>{label}</div>
    </div>
  );

  const foldBar = (label: string, open: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: tileBg, border: `1px solid ${hair}`, borderRadius: r(6), padding: '3.5px 5px' }}>
      <span style={{ fontSize: 6, color: open ? c.colorText : text2, ...approxFont(c.fontPoster, true) }}>{label}</span>
      <span style={{ fontSize: 6, color: text2, lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
    </div>
  );

  const catalogBody = () => {
    if (c.catalogNav === 'portadas') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['Tacos', 'Bebidas'].map((t) => (
            <div key={t} style={{ position: 'relative', height: 26, borderRadius: r(8), overflow: 'hidden', border: `1px solid ${hair}`, background: `linear-gradient(135deg, ${rgbaOf(c.colorAccent, 0.42)}, ${rgbaOf(c.colorAccent, 0.12)})` }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.58), transparent 72%)' }} />
              <div style={{ position: 'absolute', left: 5, bottom: 3, fontSize: 7.5, color: '#fff', ...approxFont(c.fontPoster, true) }}>{t}</div>
            </div>
          ))}
        </div>
      );
    }
    if (c.catalogNav === 'acordeon') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {foldBar('Tacos', true)}
          {items()}
          {foldBar('Bebidas', false)}
          {foldBar('Postres', false)}
        </div>
      );
    }
    if (c.catalogNav === 'secciones') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {chipRow(true)}
          <div>{sectionHead('Tacos')}{items()}</div>
          <div>{sectionHead('Bebidas', true)}</div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {chipRow(false)}
        {items()}
      </div>
    );
  };

  // Sin portada a pantalla completa el título del menú es la primera impresión.
  const compactHero = c.portadaVariant === 'none' || c.portadaVariant === 'directo';

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
          <div style={{ ...cta(), marginTop: 2 }}>Ver el menú</div>
        </div>
      )}
      {c.portadaVariant === 'poster' && (
        <div style={{ padding: '4px 2px 2px', position: 'relative' }}>
          <div style={{ fontSize: 5, letterSpacing: '0.28em', color: text2, textTransform: 'uppercase', ...approxFont(c.fontPoster) }}>EST · 2024</div>
          <div style={{ fontSize: 20, lineHeight: 0.9, color: c.colorText, textTransform: 'uppercase', marginTop: 2, ...approxFont(c.fontPoster, true) }}>Tu Resto</div>
          <div style={{ ...cta(), width: '58%', margin: '5px 0 0' }}>Ver el menú</div>
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
      {c.portadaVariant === 'fullbleed' && (
        <div style={{ position: 'relative', height: 82, margin: '-8px -8px 0', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(130% 80% at 50% 18%, ${rgbaOf(c.colorAccent, 0.62)}, transparent 68%), linear-gradient(180deg, ${c.colorBg2}, ${c.colorBg})` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.16) 58%, transparent)' }} />
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 6 }}>
            <div style={{ fontSize: 15, lineHeight: 0.95, color: '#fff', ...approxFont(c.fontDisplay, true) }}>Tu Resto</div>
            <div style={{ ...cta(), width: '72%', margin: '5px 0 0' }}>Ver el menú</div>
          </div>
        </div>
      )}
      {c.portadaVariant === 'ticket' && (
        <div style={{ width: '80%', margin: '3px auto 0', background: tileBg, border: `1px solid ${hair}`, borderRadius: 2, padding: '7px 8px', textAlign: 'center', position: 'relative' }}>
          <div style={{ fontSize: 4.5, letterSpacing: '0.2em', color: text2, textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>EST · 2024</div>
          <div style={{ borderTop: `1px dashed ${rgbaOf(c.colorText, 0.3)}`, margin: '5px 0' }} />
          <div style={{ fontSize: 10.5, color: c.colorText, ...approxFont(c.fontDisplay, true) }}>Tu Resto</div>
          <div style={{ borderTop: `1px dashed ${rgbaOf(c.colorText, 0.3)}`, margin: '5px 0' }} />
          <div style={{ ...cta(), width: '90%' }}>Ver el menú</div>
        </div>
      )}
      {c.portadaVariant === 'directo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0 0' }}>
          <div style={{ width: 15, height: 15, borderRadius: '28%', background: tileBg, border: `1px solid ${hair}`, flexShrink: 0 }} />
          <div style={{ fontSize: 9, color: c.colorText, ...approxFont(c.fontDisplay, true) }}>Tu Restaurante</div>
        </div>
      )}

      {/* Catálogo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: compactHero ? 11 : 8, color: c.colorText, textTransform: 'uppercase', ...approxFont(c.fontPoster, true) }}>El menú</div>
          {c.showSearch && <div style={{ width: 26, height: 6, borderRadius: 99, background: tileBg, border: `1px solid ${hair}` }} />}
        </div>
        {catalogBody()}
      </div>
    </div>
  );
}

/* ── Galería ────────────────────────────────────────────────── */

type Filter = 'Todas' | 'Estructura' | 'Oscuro' | 'Claro';

const FILTER_LABEL: Record<Filter, string> = {
  Todas: 'Todas',
  Estructura: 'Otra estructura',
  Oscuro: 'Oscuras',
  Claro: 'Claras',
};

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
  const [filter, setFilter] = useState<Filter>('Todas');
  // "Otra estructura" es el filtro que de verdad hacía falta: con 22 plantillas,
  // buscar las que cambian el esqueleto abriendo paletas una por una no es viable.
  const shown = BUILTIN_TEMPLATES.filter((t) =>
    filter === 'Todas' ? true : filter === 'Estructura' ? t.structural === true : t.mode === filter,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['Todas', 'Estructura', 'Oscuro', 'Claro'] as const).map((f) => {
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
              {FILTER_LABEL[f]}
            </button>
          );
        })}
      </div>

      {filter === 'Estructura' && (
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.5, margin: 0 }}>
          Estas no cambian solo el color: cambian cómo se recorre la carta, qué forma tiene cada
          platillo y cuánto ancho ocupa la página. Puedes aplicar una y luego repintarla con tus
          colores.
        </p>
      )}

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
                    <span
                      style={{
                        fontSize: 9.5, fontWeight: 700, borderRadius: 99, padding: '1.5px 7px', flexShrink: 0,
                        color: tpl.structural ? 'var(--brand-accent-ink, #D97757)' : 'var(--u-text-4)',
                        border: `1px solid ${tpl.structural ? 'color-mix(in srgb, var(--brand-accent, #D97757) 45%, transparent)' : 'var(--u-hair)'}`,
                      }}
                    >
                      {tpl.structural ? 'Estructura' : tpl.mode}
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
