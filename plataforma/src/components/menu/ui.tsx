'use client';

/* Kit de UI del cliente — todo consume el motor (config + textos + moneda).
   Portado del prototipo (Glass.jsx / ClientScreens.jsx). */

import type { CSSProperties, ReactNode } from 'react';
import { useId, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { usePrice, useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';
import { roleSize } from '@/lib/theme/resolve';

/* ── Superficie de una pieza de la carta ──────────────────────
   Sustituye a `Glass` en los platillos. El motivo está explicado a fondo en
   globals.css (sección «MENÚ DEL COMENSAL · KIT»): el vidrio se reserva para
   lo que flota por encima de la carta, no para cada tarjeta.

   Conserva TODO lo que `Glass` aportaba a una tarjeta clicable, que era su
   parte menos vistosa y la más importante: rol de botón, foco por teclado,
   Enter/Espacio y un nombre accesible corto. Sin esto, una tarjeta se anuncia
   concatenando su contenido entero ("Mocha Negra Espresso doble, cacao 70%…
   26.00 Agregar") y el botón «Agregar» de dentro queda anidado en otro
   control. */
export function MenuSurface({
  className = '',
  style,
  children,
  onClick,
  ariaLabel,
  unavailable = false,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  /** Agotado: se puede mirar, no pedir — deja de ser clicable. */
  unavailable?: boolean;
}) {
  const clickable = Boolean(onClick) && !unavailable;
  return (
    <div
      className={`m-surface ${clickable ? 'press' : ''} ${className}`}
      data-clickable={clickable ? '1' : undefined}
      data-unavailable={unavailable ? '1' : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? ariaLabel : undefined}
      style={style}
    >
      {children}
    </div>
  );
}

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
  /* El simbolo de moneda salia a 9,24 px con un precio de 14: es el unico
     texto del menu que seguia por debajo del piso. Se subordina por PROPORCION
     y no por hacerlo diminuto, con el mismo piso de 12 px que el resto; y la
     opacidad sube de 0,6 a 0,75, que a 0,6 sobre el fondo se quedaba corta de
     contraste. */
  const sym = (
    <span style={{ fontSize: `max(12px, ${(sz * 0.72).toFixed(2)}px)`, opacity: 0.75, margin: position === 'prefix' ? '0 1px 0 0' : '0 0 0 1px' }}>
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

/** Lo escrito a mano en español que es una de las sugeridas («nuevo»). */
const TAG_ALIAS: Record<string, string> = {
  picante: 'hot', nuevo: 'new', nueva: 'new', favorito: 'fav', favorita: 'fav', vegano: 'veg', vegana: 'veg', veggie: 'veg',
};

export function Tag({ label, small = false }: { label: string; small?: boolean }) {
  const content = useThemeContent();
  const key = label.toLowerCase().trim();
  const meta = TAG_MAP[key];
  /* Las etiquetas sugeridas se guardan con su clave ('new', 'hot'…) y la
     carta enseñaba la clave tal cual: «new», «nuevo» en minúscula. Se pinta
     el nombre que el tema tiene para cada una (auditoría 2026-10-02, CAT-05). */
  const alias = TAG_ALIAS[key] ?? key;
  const shown = alias in content.tags ? content.tags[alias as keyof typeof content.tags] : label;
  /* Estaban a 9,5 y 10,5 px. «Picante» es justo el dato por el que alguien
     decide NO pedir un plato, y era el texto más pequeño de la carta. Pasan al
     piso del menú (12 px), que sigue multiplicando por el rol `tag` del tema.
     El `small` ya no cambia el tamaño de la letra —no había margen debajo del
     piso— sino el relleno: sigue habiendo una etiqueta más discreta. */
  return (
    <span
      className="ct-tag"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: small ? '3px 8px' : '4px 10px', borderRadius: 'var(--m-r-pill)',
        background: 'var(--surface-strong)', border: '1px solid var(--u-hair-2)',
        fontSize: 'calc(var(--m-fs-xs) * var(--t-tag-size, 1))',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {meta && <Icon name={meta.icon} size={small ? 11 : 12} />}
      {shown}
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
  /* Los botones medían 30 px en la talla normal. Es el control que más se toca
     de todo el pedido —subir y bajar cantidades en el carrito— y era la pieza
     más pequeña de la pantalla: quitar uno por error y tener que volver a
     sumarlo es la clase de fricción que hace abandonar un carrito.
     Ahora 44 px (40 en la talla chica, que ya va dentro de una fila con su
     propio margen de toque alrededor). */
  const d = size === 'lg' ? 48 : 40;
  const ic = size === 'lg' ? 20 : 17;
  const btn: CSSProperties = {
    width: d, height: d, borderRadius: 'var(--m-r-sm)', border: 'none',
    background: 'var(--surface-2)', color: 'var(--u-text)',
    cursor: 'pointer', display: 'grid', placeItems: 'center',
  };
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3,
        borderRadius: 'var(--m-r-md)',
        background: 'var(--surface-1)', border: '1px solid var(--u-hair)',
      }}
    >
      <button className="press" onClick={onMinus} style={btn} aria-label="Quitar uno"><Icon name="minus" size={ic} /></button>
      <div
        className="t-mono"
        style={{
          minWidth: size === 'lg' ? 34 : 28, textAlign: 'center',
          fontSize: size === 'lg' ? 'var(--m-fs-lg)' : 'var(--m-fs-md)',
          fontWeight: 600, color: 'var(--u-text)',
        }}
      >
        {value}
      </div>
      <button className="press" onClick={onPlus} style={btn} aria-label="Agregar uno"><Icon name="plus" size={ic} /></button>
    </div>
  );
}

/* ── Campo de formulario (checkout) ──────────────────────── */

/**
 * Campo del checkout — nombre, teléfono, dirección.
 *
 * Es el formulario donde se gana o se pierde el pedido, y donde más ayuda
 * necesita quien no se maneja bien con un teléfono. Lo que se corrigió:
 *
 *  · La etiqueta era un <label> suelto, sin unir a su casilla. Además de
 *    dejarla muda para cualquier lectura asistida, tocar el texto no
 *    enfocaba el campo — un gesto que la gente da por hecho.
 *  · Letra de 14,5px: Safari en iPhone amplía la página entera al enfocar
 *    un campo por debajo de 16px, y el checkout se descuadraba justo al
 *    empezar a escribir.
 *  · `autocomplete` no existía, así que el teléfono no ofrecía el nombre y
 *    el número ya guardados. Rellenar solo es la diferencia entre pedir y
 *    abandonar para quien teclea con un dedo.
 *  · El error salía en pantalla pero no estaba enlazado al campo: nadie
 *    sabía a cuál de ellos se refería.
 */
export function Field({
  label, value, onChange, placeholder, icon, error, type = 'text', autoComplete, inputMode, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: string;
  error?: string | false;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'search';
  /** Aclaración breve bajo la etiqueta (ej. "para avisarte cuando esté listo"). */
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const border = error ? 'color-mix(in srgb, var(--c-danger, #f87171) 75%, transparent)' : focused ? 'var(--u-text-3)' : 'var(--u-hair)';
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', cursor: 'pointer' }}>{label}</label>
      {hint && (
        <p id={hintId} style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)', margin: '-2px 0 0', lineHeight: 1.4 }}>{hint}</p>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span aria-hidden style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-3)' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="ct-body"
          style={{
            width: '100%', padding: icon ? '14px 14px 14px 40px' : '14px 14px',
            minHeight: 48,
            borderRadius: 'var(--radius-lg)', color: 'var(--u-text)', fontSize: 'var(--m-fs-lg)', outline: 'none',
            background: 'var(--surface-2)', border: `1px solid ${border}`,
            transition: 'border-color 150ms',
            boxShadow: focused ? '0 0 0 4px var(--surface-2)' : 'none',
          }}
        />
      </div>
      {error && (
        <div id={errorId} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger)' }}>
          <Icon name="alertCircle" size={13} />{error}
        </div>
      )}
    </div>
  );
}
