'use client';

/* Kit de UI del cliente — todo consume el motor (config + textos + moneda).
   Portado del prototipo (Glass.jsx / ClientScreens.jsx). */

import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { usePrice, useThemeConfig } from '@/lib/theme/context';

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
  const sym = (
    <span style={{ fontSize: size * 0.66, opacity: 0.6, margin: position === 'prefix' ? '0 1px 0 0' : '0 0 0 1px' }}>
      {symbol}
    </span>
  );
  return (
    <span
      className="t-mono"
      style={{ fontSize: size, fontWeight: 600, color: muted ? 'var(--u-text-3)' : 'var(--u-text)', whiteSpace: 'nowrap', ...style }}
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
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: small ? '2px 7px' : '3px 9px', borderRadius: 999,
        background: 'rgba(255,255,255,0.10)', border: '1px solid var(--u-hair-2)',
        color: 'var(--u-text)', fontWeight: 600,
        fontSize: small ? 9.5 : 10.5, letterSpacing: '0.02em',
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
  children, onClick, href, iconRight, full = false, size = 'md', style,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  iconRight?: string;
  full?: boolean;
  size?: 'md' | 'lg';
  style?: CSSProperties;
}) {
  const config = useThemeConfig();
  const pad = size === 'lg' ? '15px 22px' : '12px 18px';
  const fs = size === 'lg' ? 15 : 14;
  const sharedStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: pad, borderRadius: 'var(--radius-lg)', fontWeight: 600, fontSize: fs,
    cursor: 'pointer', border: 'none', textDecoration: 'none', width: full ? '100%' : undefined, ...style,
  };
  const cls = `press ${ctaClass(config.ctaStyle)}`;
  const inner = (<>{children}{iconRight && <Icon name={iconRight} size={size === 'lg' ? 18 : 16} />}</>);

  if (href) {
    return <Link href={href} onClick={onClick} className={cls} style={sharedStyle}>{inner}</Link>;
  }
  return <button onClick={onClick} className={cls} style={sharedStyle}>{inner}</button>;
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
    background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)',
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
  const border = error ? 'rgba(255,255,255,0.85)' : focused ? 'rgba(255,255,255,0.45)' : 'var(--u-hair)';
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
          style={{
            width: '100%', padding: icon ? '13px 14px 13px 40px' : '13px 14px',
            borderRadius: 'var(--radius-lg)', color: 'var(--u-text)', fontSize: 14.5, outline: 'none',
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${border}`,
            transition: 'border-color 150ms',
            boxShadow: focused ? '0 0 0 4px rgba(255,255,255,0.06)' : 'none',
          }}
        />
      </div>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--u-text-2)' }}>
          <Icon name="alertCircle" size={12} />{error}
        </div>
      )}
    </div>
  );
}
