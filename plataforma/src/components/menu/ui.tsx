'use client';

/* Kit de UI del cliente — todo consume el motor (config + textos + moneda).
   Portado del prototipo (Glass.jsx / ClientScreens.jsx). */

import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { usePrice, useThemeConfig, useText } from '@/lib/theme/context';
import { roleSize } from '@/lib/theme/resolve';

/* ── Precio (moneda configurable) ─────────────────────────── */

export function Price({
  amount,
  size = 16,
  muted = false,
  style,
}: {
  amount: number;
  size?: number;
  muted?: boolean;
  style?: CSSProperties;
}) {
  const { symbol, position, format } = usePrice();
  const config = useThemeConfig();
  const sz = size * roleSize(config, 'price');
  const sym = (
    <span style={{ fontSize: sz * 0.66, opacity: 0.6, margin: position === 'prefix' ? '0 1px 0 0' : '0 0 0 1px' }}>
      {symbol}
    </span>
  );
  return (
    <span
      className="ct-price"
      style={{ fontSize: sz, color: muted ? 'var(--u-text-3)' : undefined, whiteSpace: 'nowrap', ...style }}
    >
      {position === 'prefix' && sym}
      {format(amount)}
      {position === 'suffix' && sym}
    </span>
  );
}

/* ── Tag con ícono (mapea etiquetas conocidas) ───────────── */

const TAG_MAP: Record<string, { icon: string }> = {
  picante: { icon: 'flame' }, hot: { icon: 'flame' },
  nuevo: { icon: 'sparkle' }, new: { icon: 'sparkle' },
  favorito: { icon: 'star' }, fav: { icon: 'star' },
  veggie: { icon: 'leaf' }, veg: { icon: 'leaf' }, vegano: { icon: 'leaf' },
};

export function Tag({ label, small = false }: { label: string; small?: boolean }) {
  const meta = TAG_MAP[label.toLowerCase().trim()];
  const config = useThemeConfig();
  const sz = (small ? 9.5 : 10.5) * roleSize(config, 'tag');
  return (
    <span
      className="ct-tag"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: small ? '2px 7px' : '3px 9px', borderRadius: 999,
        background: 'var(--surface-strong)', border: '1px solid var(--u-hair-2)',
        fontSize: sz,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {meta && <Icon name={meta.icon} size={small ? 9 : 10} />}
      {label}
    </span>
  );
}

/* ── Botón CTA (estilo según config.ctaStyle) ─────────────── */

export function ctaClass(style: 'white' | 'accent' | 'outline'): string {
  return style === 'accent' ? 'btn-accent' : style === 'outline' ? 'btn-outline' : 'btn-white';
}

export function PrimaryButton({
  children, onClick, href, iconRight, full = false, size = 'md', style, elementKey, disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  iconRight?: string;
  full?: boolean;
  size?: 'md' | 'lg';
  style?: CSSProperties;
  /** Override de tipografía por elemento (ej. 'portadaCta'). */
  elementKey?: string;
  /** Deshabilita el botón (p.ej. mientras se envía un pedido) — evita doble-submit. */
  disabled?: boolean;
}) {
  const config = useThemeConfig();
  const t = useText('button', elementKey);
  const pad = size === 'lg' ? '15px 22px' : '12px 18px';
  const fs = (size === 'lg' ? 15 : 14) * t.size;
  const sharedStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: pad, borderRadius: 'var(--radius-lg)', fontSize: fs,
    // Sin `border: 'none'` aquí: un inline style le gana a CUALQUIER regla de
    // clase (.btn-white/.btn-accent/.btn-outline), así que fijarlo en 'none'
    // anulaba silenciosamente el borde 1px de .btn-outline — el CTA principal
    // (portada, checkout) quedaba sin relleno NI borde = invisible. Cada clase
    // btn-* ya declara su propio `border` en globals.css.
    cursor: disabled ? 'not-allowed' : 'pointer', textDecoration: 'none',
    width: full ? '100%' : undefined,
    ...t.vars, ...style,
  };
  const cls = `press ct-button ${ctaClass(config.ctaStyle)}`;
  const inner = (<>{children}{iconRight && <Icon name={iconRight} size={size === 'lg' ? 18 : 16} />}</>);

  // Variante enlace: si está deshabilitado, no navega (bloquea el click).
  if (href) {
    return (
      <Link
        href={disabled ? '#' : href}
        onClick={disabled ? (e) => e.preventDefault() : onClick}
        aria-disabled={disabled || undefined}
        className={cls}
        style={{ ...sharedStyle, ...(disabled ? { pointerEvents: 'none' } : {}) }}
      >
        {inner}
      </Link>
    );
  }
  return <button onClick={onClick} disabled={disabled} className={cls} style={sharedStyle}>{inner}</button>;
}

/* ── Stepper de cantidad ──────────────────────────────────── */

export function QtyStepper({
  value, onMinus, onPlus, size = 'md',
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  size?: 'md' | 'lg';
}) {
  const d = size === 'lg' ? 40 : 30;
  const r = size === 'lg' ? 13 : 9;
  const ic = size === 'lg' ? 18 : 14;
  const btn: CSSProperties = {
    width: d, height: d, borderRadius: r, border: 'none',
    background: 'var(--surface-2)', color: 'var(--u-text)',
    cursor: 'pointer', display: 'grid', placeItems: 'center',
  };
  return (
    <div className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 4, borderRadius: r + 5 }}>
      <button className="press" onClick={onMinus} style={btn} aria-label="Quitar uno"><Icon name="minus" size={ic} /></button>
      <div className="t-mono" style={{ minWidth: size === 'lg' ? 34 : 26, textAlign: 'center', fontSize: size === 'lg' ? 17 : 14, fontWeight: 600, color: 'var(--u-text)' }}>{value}</div>
      <button className="press" onClick={onPlus} style={btn} aria-label="Agregar uno"><Icon name="plus" size={ic} /></button>
    </div>
  );
}

/* ── Campo de formulario (checkout) ──────────────────────── */

export function Field({
  label, value, onChange, placeholder, icon, error, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: string;
  error?: string | false;
  type?: string;
}) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'color-mix(in srgb, var(--c-danger, #f87171) 75%, transparent)' : focused ? 'var(--u-text-3)' : 'var(--u-hair)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="t-kicker" style={{ fontSize: 10.5 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-3)' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="ct-body"
          style={{
            width: '100%', padding: icon ? '13px 14px 13px 40px' : '13px 14px',
            borderRadius: 'var(--radius-lg)', color: 'var(--u-text)', fontSize: 14.5, outline: 'none',
            background: 'var(--surface-2)', border: `1px solid ${border}`,
            transition: 'border-color 150ms',
            boxShadow: focused ? '0 0 0 4px var(--surface-2)' : 'none',
          }}
        />
      </div>
      {error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--c-danger, #f87171)' }}>
          <Icon name="alertCircle" size={12} />{error}
        </div>
      )}
    </div>
  );
}
