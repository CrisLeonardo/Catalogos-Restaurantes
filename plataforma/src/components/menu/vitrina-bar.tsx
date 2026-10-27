'use client';

/* Barra superior y bolsa de la Vitrina (maqueta: docs/diseno/vitrina/maqueta.html).

   En la Vitrina la barra de navegación de abajo se va: abajo solo queda la
   BOLSA, una píldora oscura que aparece cuando hay algo apartado, y arriba
   una barra fija con la marca a la izquierda y «Bolsa · N» a la derecha,
   como en cualquier tienda en línea. Pedidos, puntos, cuenta e idioma pasan
   a un menú de esa barra: siguen a dos toques, pero no le roban la pantalla
   a las fotos. */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { useCart } from '@/lib/cart-context';
import { useLocale } from '@/lib/locale/context';
import { useThemeConfig, useThemeContent, usePrice } from '@/lib/theme/context';

/** Alto de la barra superior (sin la zona segura del teléfono). */
export const VITRINA_TOP_H = 58;

export function VitrinaTopBar({
  ordersEnabled, loyaltyOn, kiosk, onCart, onPedidos, onPuntos, onCuenta,
}: {
  ordersEnabled: boolean;
  loyaltyOn: boolean;
  kiosk: boolean;
  onCart: () => void;
  onPedidos: () => void;
  onPuntos: () => void;
  onCuenta: () => void;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const { count } = useCart();
  const { locale, setLocale, available } = useLocale();
  const [abierto, setAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sub = [config.tagline, config.zone].filter(Boolean).join(' · ');

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  /* En la maqueta la barra lleva solo la marca y la bolsa. Con un ícono por
     cada destino el nombre del restaurante se cortaba («AZU…») en un teléfono
     de 375 px, así que pedidos, puntos, cuenta e idioma van juntos en un
     menú de tres puntos. */
  const opciones: Array<{ label: string; icon: string; onClick: () => void }> = [
    ...(!kiosk && ordersEnabled ? [{ label: 'Mis pedidos', icon: 'receipt', onClick: onPedidos }] : []),
    ...(!kiosk && loyaltyOn ? [{ label: 'Mis puntos', icon: 'star', onClick: onPuntos }] : []),
    ...(!kiosk ? [{ label: 'Mi cuenta', icon: 'user', onClick: onCuenta }] : []),
    ...(available.length > 1
      ? [{
          label: locale === 'en' ? 'Ver en español' : 'View in English',
          icon: 'globe',
          onClick: () => setLocale(locale === 'en' ? 'es' : 'en'),
        }]
      : []),
  ];

  return (
    <header className="m-vt" role="banner">
      <div className="menu-canvas m-vt-in">
        <div className="m-vt-brand">
          <span className="m-vt-name">{config.brandName}</span>
          {sub && <span className="m-vt-sub">{sub}</span>}
        </div>
        <div className="m-vt-actions">
          {opciones.length > 0 && (
            <div className="m-vt-menu" ref={menuRef}>
              <button
                type="button"
                className="press m-vt-icon"
                aria-label="Más opciones"
                aria-haspopup="menu"
                aria-expanded={abierto}
                onClick={() => setAbierto((v) => !v)}
              >
                <Icon name="more" size={18} />
              </button>
              {abierto && (
                <div className="m-vt-pop" role="menu">
                  {opciones.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="menuitem"
                      className="press"
                      onClick={() => { setAbierto(false); o.onClick(); }}
                    >
                      <Icon name={o.icon} size={16} /> {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {ordersEnabled && (
            <button
              type="button"
              className="press m-vt-bag"
              onClick={onCart}
              aria-label={`${content.cart.title}: ${count} ${count === 1 ? content.cart.itemsOne : content.cart.itemsMany}`}
            >
              {content.cart.title} · {count}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Precio como en la maqueta: la moneda pequeña y arriba, y sin «.00» cuando
    el monto es redondo (Q45, no Q45.00). Con centavos se enseñan. */
export function PrecioCartel({ amount, muted = false }: { amount: number; muted?: boolean }) {
  const { symbol, position, format } = usePrice();
  const redondo = Math.round(amount * 100) % 100 === 0;
  const cifra = redondo ? String(Math.round(amount)) : format(amount);
  const sym = <small className="m-precio-sym">{symbol}</small>;
  return (
    <span className="m-precio" data-muted={muted ? '1' : undefined}>
      {position === 'prefix' && sym}
      {cifra}
      {position !== 'prefix' && sym}
    </span>
  );
}

export function VitrinaBag({ onOpen }: { onOpen: () => void }) {
  const { count, total } = useCart();
  const content = useThemeContent();
  const { symbol, position, format } = usePrice();
  if (count === 0) return null;
  const monto = position === 'prefix' ? `${symbol}${format(total)}` : `${format(total)} ${symbol}`;
  return (
    <div className="m-vbag-wrap">
      <div className="m-vbag anim-slide-up" role="status" data-carrito-destino="">
        <div className="m-vbag-info">
          <b>{count} {count === 1 ? content.cart.itemsOne : content.cart.itemsMany}</b>
          <span>{monto}</span>
        </div>
        <button type="button" className="press m-vbag-cta" onClick={onOpen}>
          {content.cart.barCta} →
        </button>
      </div>
    </div>
  );
}
