'use client';

/* Galería de plantillas prediseñadas — usada por el editor del dueño
   (/admin/personalizacion) y el del Super Admin.

   Se elige en dos pasos, y ese es el punto: primero la ESTRUCTURA (cómo se
   recorre la carta, qué forma tiene el platillo, cuánto ancho ocupa) y después
   el ESTILO dentro de esa estructura. Antes había 16 estilos que compartían un
   solo esqueleto más 6 arquetipos sueltos con un único color cada uno: quien
   quería la estructura de "Revista" se tenía que quedar con su negro y su rojo.
   Ahora las 22 paletas están en las 7 estructuras.

   Cada tarjeta es un mock CSS en miniatura del menú (portada + catálogo)
   pintado con la paleta, forma y estructura reales de la plantilla, para que se
   entienda de un vistazo hasta dónde llega la personalización. Las fuentes se
   aproximan con el stack de respaldo de cada familia (no cargamos 22 familias
   de Google solo para miniaturas).

   La miniatura tiene que dibujar de verdad la navegación y la forma del
   platillo: si todas se vieran como una rejilla de tarjetas, la galería
   mentiría justo sobre lo único que distingue a las estructuras. */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import {
  MENU_STRUCTURES, templatesForStructure,
  type BuiltinTemplate, type StructureId,
} from '@/lib/theme/templates';
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

  /* El lienzo del menú también se dibuja: una estructura de página ancha en una
     miniatura vertical de teléfono no se distingue de una de móvil, que es
     justo lo que el dueño está eligiendo aquí. */
  const canvas = c.layoutWidth ?? 'movil';
  const wide = canvas !== 'movil';
  const ratio = canvas === 'revista' ? '10 / 10' : canvas === 'ancho' ? '10 / 11' : '10 / 13';

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

  // Destacado: la pieza de ancho completo que abre la sección.
  const featured = () => (
    <div style={{ position: 'relative', height: wide ? 15 : 24, borderRadius: r(8), overflow: 'hidden', border: `1px solid ${hair}`, background: `linear-gradient(135deg, ${rgbaOf(c.colorAccent, 0.5)}, ${rgbaOf(c.colorAccent, 0.14)})` }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 76%)' }} />
      <div style={{ position: 'absolute', left: 4, top: 3, padding: '1px 4px', borderRadius: 99, fontSize: 4, fontWeight: 800, background: c.colorAccent, color: c.onAccent }}>FAV</div>
      <div style={{ position: 'absolute', left: 4, bottom: 3, height: 3.5, width: '44%', borderRadius: 2, background: 'rgba(255,255,255,0.9)' }} />
    </div>
  );

  const items = () => {
    if (c.cardStyle === 'texto') {
      const lines = [1, 0.78, 0.62, 0.88, 0.7, 0.94];
      // A dos columnas solo en la página de revista: es lo que hace el menú de
      // verdad, y la miniatura no puede prometer una composición que no sale.
      const twoCol = canvas === 'revista';
      return (
        <div style={{ columnCount: twoCol ? 2 : 1, columnGap: 8 }}>
          {lines.slice(0, twoCol ? 6 : wide ? 3 : 4).map((w, i) => (
            <div key={i} style={{ breakInside: 'avoid' }}>{textLine(w)}</div>
          ))}
        </div>
      );
    }
    if (c.cardStyle === 'fila') {
      const rows = wide ? [0.9, 0.7, 0.8, 0.75] : [0.9, 0.7, 0.8];
      return (
        <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: 4 }}>
          {rows.map((w, i) => <div key={i}>{row(w)}</div>)}
        </div>
      );
    }
    if (c.cardStyle === 'carrusel') {
      // La última pieza se corta a propósito: eso es lo que dice "esto se desliza".
      const widths = wide ? [30, 30, 30, 30, 16] : [30, 30, 30, 16];
      return (
        <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
          {widths.map((w, i) => (
            <div key={i} style={{ width: w, flexShrink: 0, opacity: i === widths.length - 1 ? 0.5 : 1 }}>{tile(18)}</div>
          ))}
        </div>
      );
    }
    if (c.cardStyle === 'mosaico') {
      /* Mosaico real: el destacado abre a todo lo ancho y debajo van columnas
         de alturas distintas. Dibujarlo como una rejilla pareja escondería
         exactamente lo que hace distinta a esta estructura. */
      const cols = wide ? [[12, 8], [9, 10], [10, 8]] : [[20, 12], [13, 18]];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {c.featuredFavorites && featured()}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, 1fr)`, gap: 4, alignItems: 'start' }}>
            {cols.map((col, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {col.map((h, j) => <div key={j}>{tile(h)}</div>)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    const cols = wide ? 3 : c.catalogColumns === 3 ? 3 : 2;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {c.featuredFavorites && featured()}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
          {Array.from({ length: wide ? cols * 2 : cols }, (_, i) => <div key={i}>{tile(cols === 3 ? 16 : 22)}</div>)}
        </div>
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
      <div style={{ fontSize: wide ? 8 : 6.5, color: dim ? text2 : c.colorText, textTransform: 'uppercase', ...approxFont(c.fontPoster, true) }}>{label}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: 4 }}>
          {(wide ? ['Tacos', 'Bebidas', 'Postres', 'Extras'] : ['Tacos', 'Bebidas']).map((t) => (
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
      /* La segunda sección: entera cuando la pieza es baja (una repisa que se
         desliza), y solo asomando su rótulo cuando no cabe. En lienzo ancho ni
         se asoma: el mock se pasaba de alto y la miniatura recortaba una
         tarjeta por la mitad. */
      const secondFull = c.cardStyle === 'carrusel';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {chipRow(true)}
          <div>{sectionHead('Tacos')}{items()}</div>
          {secondFull
            ? <div>{sectionHead('Bebidas')}{items()}</div>
            : !wide && <div>{sectionHead('Bebidas', true)}</div>}
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
        /* La proporción dice de un vistazo qué lienzo es: alta = teléfono,
           cuadrada = página ancha o de revista. El mock que va dentro está
           dibujado en píxeles fijos, así que por debajo de ~183 px de ancho
           dejaría de caber — de ahí el mínimo de la rejilla de la galería. */
        position: 'relative', width: '100%', aspectRatio: ratio, overflow: 'hidden',
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
        <div style={{ position: 'relative', height: wide ? 35 : 82, margin: '-8px -8px 0', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(130% 80% at 50% 18%, ${rgbaOf(c.colorAccent, 0.62)}, transparent 68%), linear-gradient(180deg, ${c.colorBg2}, ${c.colorBg})` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.16) 58%, transparent)' }} />
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: wide ? 4 : 6 }}>
            <div style={{ fontSize: wide ? 12 : 15, lineHeight: 0.95, color: '#fff', ...approxFont(c.fontDisplay, true) }}>Tu Resto</div>
            <div style={{ ...cta(), width: wide ? '40%' : '48%', margin: wide ? '3px 0 0' : '5px 0 0' }}>Ver el menú</div>
          </div>
        </div>
      )}
      {c.portadaVariant === 'ticket' && (
        <div style={{ width: wide ? '58%' : '80%', margin: wide ? '1px auto 0' : '3px auto 0', background: tileBg, border: `1px solid ${hair}`, borderRadius: 2, padding: wide ? '5px 7px' : '7px 8px', textAlign: 'center', position: 'relative' }}>
          <div style={{ fontSize: 4.5, letterSpacing: '0.2em', color: text2, textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>EST · 2024</div>
          <div style={{ borderTop: `1px dashed ${rgbaOf(c.colorText, 0.3)}`, margin: wide ? '3px 0' : '5px 0' }} />
          <div style={{ fontSize: 10.5, color: c.colorText, ...approxFont(c.fontDisplay, true) }}>Tu Resto</div>
          <div style={{ borderTop: `1px dashed ${rgbaOf(c.colorText, 0.3)}`, margin: wide ? '3px 0' : '5px 0' }} />
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

/* ── Glifos de estructura ────────────────────────────────────
   El nombre solo ("Estantes", "Compacto") no dice nada la primera vez. Cada
   glifo dibuja el esqueleto en cuatro trazos: es lo que hace que el filtro se
   entienda sin tener que ir abriéndolos uno por uno. */
function StructureGlyph({ id }: { id: StructureId }) {
  const s = { width: 18, height: 18, flexShrink: 0 };
  const bar = (x: number, y: number, w: number, h: number, o = 1, rx = 1) => (
    <rect key={`${x}-${y}-${w}`} x={x} y={y} width={w} height={h} rx={rx} fill="currentColor" opacity={o} />
  );
  const paths: Record<StructureId, React.ReactNode> = {
    clasico: <>{bar(2, 2, 14, 4, 0.35, 1.4)}{bar(2, 8, 6.5, 8, 1, 1.4)}{bar(9.5, 8, 6.5, 8, 1, 1.4)}</>,
    carta: <>{bar(2, 3, 9, 1.6, 1)}{bar(13, 3, 3, 1.6, 0.55)}{bar(2, 8, 7, 1.6, 1)}{bar(13, 8, 3, 1.6, 0.55)}{bar(2, 13, 8, 1.6, 1)}{bar(13, 13, 3, 1.6, 0.55)}</>,
    revista: <>{bar(2, 2, 14, 4, 1, 1.4)}{bar(2, 8, 4, 8, 0.6, 1.2)}{bar(7, 8, 4, 5.5, 0.6, 1.2)}{bar(12, 8, 4, 7, 0.6, 1.2)}</>,
    kiosco: <>{bar(2, 2.5, 14, 6, 1, 1.6)}{bar(2, 10.5, 14, 5.5, 0.45, 1.6)}</>,
    estantes: <>{bar(2, 3, 3, 5, 0.5, 1.2)}{bar(2, 11, 3, 5, 0.5, 1.2)}{bar(6, 3, 5.5, 5, 1, 1.2)}{bar(6, 11, 5.5, 5, 1, 1.2)}{bar(12.5, 3, 5.5, 5, 0.5, 1.2)}{bar(12.5, 11, 5.5, 5, 0.5, 1.2)}</>,
    pizarra: <>{bar(2, 2, 14, 3, 1, 1.2)}{bar(3.5, 6.5, 8, 1.4, 0.55)}{bar(3.5, 9.5, 6, 1.4, 0.55)}{bar(2, 13, 14, 3, 0.45, 1.2)}</>,
    compacto: <>{bar(2, 2, 14, 3, 1, 1.2)}{bar(2, 6.5, 14, 2.4, 0.5, 1)}{bar(2, 10, 14, 2.4, 0.5, 1)}{bar(2, 13.5, 14, 2.4, 0.5, 1)}</>,
  };
  return <svg viewBox="0 0 18 18" style={s} aria-hidden>{paths[id]}</svg>;
}

/* ── Galería ────────────────────────────────────────────────── */

type Mode = 'Todas' | 'Oscuro' | 'Claro';

const MODE_LABEL: Record<Mode, string> = { Todas: 'Todos los tonos', Oscuro: 'Oscuros', Claro: 'Claros' };

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
        background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 5%, transparent)',
        color: on ? 'var(--admin-content-bg-solid, var(--brand-bg))' : 'var(--u-text-3)',
        transition: 'background 150ms, color 150ms',
      }}
    >
      {children}
    </button>
  );
}

export default function TemplateGallery({
  onApply,
  appliedId,
  mode = 'apply',
  initialStructure = 'clasico',
}: {
  /** Se llama con la plantilla elegida; el editor hace el merge y avisa. */
  onApply: (tpl: BuiltinTemplate) => void;
  /** id de la última plantilla aplicada (marca "Aplicada ✓"). */
  appliedId?: string | null;
  /** 'apply' = editor de tema (Aplicada) · 'pick' = registro (Elegida). */
  mode?: 'apply' | 'pick';
  /** Estructura con la que abre la galería (la que el menú ya usa). */
  initialStructure?: StructureId;
}) {
  const [structureId, setStructureId] = useState<StructureId>(initialStructure);
  const [tone, setTone] = useState<Mode>('Todas');

  const structure = MENU_STRUCTURES.find((s) => s.id === structureId) ?? MENU_STRUCTURES[0];
  const all = useMemo(() => templatesForStructure(structure.id), [structure.id]);
  const shown = tone === 'Todas' ? all : all.filter((t) => t.mode === tone);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Paso 1 · la estructura ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>1 · La estructura</span>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>cómo se recorre tu carta</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MENU_STRUCTURES.map((s) => (
            <Chip key={s.id} on={s.id === structureId} onClick={() => setStructureId(s.id)} title={s.desc}>
              <StructureGlyph id={s.id} />
              {s.name}
            </Chip>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: 0 }}>
          <strong style={{ color: 'var(--u-text-2)' }}>{structure.desc}</strong>{' '}
          <span style={{ color: 'var(--u-text-4)' }}>{structure.hint}</span>
        </p>
      </div>

      {/* ── Paso 2 · el estilo ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>2 · El estilo</span>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
            {shown.length} paletas con la estructura «{structure.name}»
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['Todas', 'Oscuro', 'Claro'] as const).map((m) => (
            <Chip key={m} on={tone === m} onClick={() => setTone(m)}>{MODE_LABEL[m]}</Chip>
          ))}
        </div>

        {/* 190 px de ancho mínimo por tarjeta y no 148: descontando el padding
            del botón deja la miniatura en 176 px, que es el ancho a partir del
            cual el mock (dibujado en píxeles fijos) cabe entero. Con 148, en
            una columna de ancho intermedio salían tres tarjetas por fila y la
            miniatura recortaba la última fila de platillos contra el borde. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {shown.map((tpl) => {
            const applied = appliedId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApply(tpl)}
                className="press"
                title={mode === 'pick'
                  ? `Empezar con «${tpl.name}» en estructura ${structure.name} (podrás personalizarlo después)`
                  : `Aplicar «${tpl.name}» en estructura ${structure.name} (tu logo, textos y configuración de pedidos se conservan)`}
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
                          color: 'var(--u-text-4)', border: '1px solid var(--u-hair)',
                        }}
                      >
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
    </div>
  );
}
