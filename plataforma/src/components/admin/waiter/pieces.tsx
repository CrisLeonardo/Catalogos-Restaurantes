'use client';

/* Las piezas menudas del armazón de dos paneles.
   ------------------------------------------------------------------
   Están juntas porque son pequeñas y porque las cuatro pantallas del
   mesero (sala, comanda, cobrar, llevar) las usan a la vez: separarlas
   en cuatro archivos de veinte líneas haría más ruido que orden.

   El vocabulario es el mismo del panel (ui/list.tsx, ui/section.tsx):
   una etiqueta encima, un grupo con filas separadas por un pelo de
   línea, y los números en monoespaciada. */

import type { CSSProperties, ReactNode } from 'react';

/* ── Números ───────────────────────────────────────────────────
   Los importes van SIEMPRE en monoespaciada con cifras tabulares:
   en una lista de mesas, los totales tienen que alinearse por la
   coma para poder compararlos de un vistazo. */
export function Mono({ children, size = 14.5, color = 'var(--u-text)', weight = 600 }: {
  children: ReactNode; size?: number; color?: string; weight?: number;
}) {
  return (
    <span style={{
      fontFamily: 'var(--ui-font-mono)', fontWeight: weight, fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.02em', fontSize: size, color,
    }}>
      {children}
    </span>
  );
}

/* ── Etiqueta de sección ───────────────────────────────────────
   Como `ui/section.tsx`, pero admite una acción que NO navega (aquí
   casi ninguna lo hace: editan, marcan o cambian de modo sin salir
   del panel). */
export function Label({ children, action, onAction, aside }: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  aside?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '0 4px 8px' }}>
      <span className="adm-label" style={{ flex: 1, minWidth: 0, color: 'var(--u-text-3)' }}>{children}</span>
      {action && (
        <button
          type="button"
          onClick={onAction}
          style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
            fontSize: 12.5, fontWeight: 600, color: 'var(--brand-accent-ink)',
          }}
        >
          {action}
        </button>
      )}
      {aside}
    </div>
  );
}

/* ── Grupo ─────────────────────────────────────────────────────
   Una tarjeta con filas dentro. La divisoria la pone el CONTENEDOR
   entre hijos consecutivos: así ninguna fila necesita saber si es
   la primera o la última, y reordenarlas nunca deja una línea
   huérfana arriba o abajo. */
export function Group({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="wp-group"
      style={{
        background: 'var(--adm-card)',
        border: '1px solid var(--adm-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--adm-shadow-xs)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Una fila del grupo. `lead` es el icono o la casilla de la izquierda;
    `right` lo que va pegado al canto derecho. */
export function Row({ lead, title, sub, right, trail, onClick, pad = '12px 16px', style }: {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
  pad?: string;
  style?: CSSProperties;
}) {
  const inner = (
    <>
      {lead}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--u-text)' }}>{title}</div>
        {sub ? <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, lineHeight: 1.35 }}>{sub}</div> : null}
      </div>
      {right ? <div style={{ flexShrink: 0, textAlign: 'right' }}>{right}</div> : null}
      {trail}
    </>
  );

  const base: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: pad, minHeight: 44,
    width: '100%', textAlign: 'left', ...style,
  };

  // Una fila que hace algo es un <button> de verdad, no un div con onClick:
  // responde al teclado y se anuncia como lo que es.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="press" style={{ ...base, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}>
        {inner}
      </button>
    );
  }
  return <div style={base}>{inner}</div>;
}

/** La divisoria entre filas. Sangrada por defecto para que arranque
    donde arranca el texto, no donde arranca la tarjeta. */
export function Hr({ full = false }: { full?: boolean }) {
  return <div style={{ height: 1, background: 'var(--adm-border)', marginLeft: full ? 0 : 16 }} />;
}

/* ── Control segmentado ────────────────────────────────────────
   Sala/Pedidos, el reparto de la cuenta, la propina, la forma de
   pago. El aspecto vive en globals.css (`.wp-seg`). */
export function Seg<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="wp-seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          data-on={o.value === value ? '1' : '0'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Punto de estado ───────────────────────────────────────────
   El punto NUNCA dice el estado por sí solo: la palabra que lleva
   al lado es la que informa, y quien no distingue los colores lee
   exactamente lo mismo. */
export function Pill({ color, children, align = 'flex-start' }: {
  color: string; children: ReactNode; align?: 'flex-start' | 'flex-end';
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: align, gap: 6, fontSize: 13, color }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 'var(--radius-full)', background: 'currentColor', flexShrink: 0 }} />
      {children}
    </span>
  );
}

/** Cuadrito de icono a la izquierda de una fila. */
export function Tile({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span style={{
      display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--radius-sm)', flexShrink: 0,
      background: accent
        ? 'color-mix(in srgb, var(--adm-accent-500) 12%, transparent)'
        : 'color-mix(in srgb, var(--u-text) 8%, transparent)',
      color: accent ? 'var(--brand-accent-ink)' : 'var(--u-text-2)',
    }}>
      {children}
    </span>
  );
}

/* ── Tecla ─────────────────────────────────────────────────────
   El atajo se enseña JUNTO a la acción, no escondido en una ayuda
   que nadie abre: así quien empieza con el ratón se lo aprende
   solo. En pantalla táctil se apaga desde CSS (no hay teclado que
   anunciar). */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="wp-key">{children}</kbd>;
}
