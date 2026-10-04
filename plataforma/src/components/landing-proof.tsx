import type { CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import type { Showcase, TestimonialView } from '@/lib/db/landing';

/* ============================================================
   PRUEBA SOCIAL DE LA PORTADA (auditoría 2026-10-02, WEB-02/03)
   ------------------------------------------------------------
   · LandingPhone: el teléfono de la portada. Con un restaurante en
     vitrina (Super › Configuración › Portada) pinta SU menú: nombre,
     logo, colores, platillos con foto y precios. Sin vitrina, un
     ejemplo con iconos de comida (antes: cuadros de color y media
     pantalla negra vacía).
   · Testimonials: «Ya lo usan», solo si hay testimonios guardados.
   Sin estado ni efectos: se pinta en el servidor.
   ============================================================ */

/** El ejemplo de siempre, ahora con iconos y la pantalla llena. */
const EXAMPLE: Showcase = {
  name: 'Tu Restaurante',
  line: 'Cocina de la casa · Zona 1',
  logo: null,
  menuUrl: '',
  colors: { bg: '#0b0b0c', text: '#F5F3EF', accent: '#d97757', onAccent: '#ffffff', scheme: 'dark' },
  categories: ['Tacos', 'Burritos', 'Bebidas', 'Postres'],
  items: [
    { id: 'e1', name: 'Tacos al pastor', description: 'Con piña, cilantro y cebolla', price: 'Q45', image: null, icon: 'flame' },
    { id: 'e2', name: 'Burrito de res', description: 'Frijol, arroz, queso y pico', price: 'Q52', image: null, icon: 'croissant' },
    { id: 'e3', name: 'Horchata fría', description: 'Casera, con canela', price: 'Q15', image: null, icon: 'coffee' },
    { id: 'e4', name: 'Rellenitos', description: 'De plátano, con frijol y azúcar', price: 'Q18', image: null, icon: 'cookie' },
  ],
  cart: { count: 2, total: 'Q97' },
};

export function LandingPhone({ showcase }: { showcase: Showcase | null }) {
  const s = showcase ?? EXAMPLE;
  const vars = {
    '--ph-bg': s.colors.bg,
    '--ph-text': s.colors.text,
    '--ph-accent': s.colors.accent,
    '--ph-on-accent': s.colors.onAccent,
    // Como --brand-accent-ink: en un fondo claro el acento se oscurece
    // para leerse como texto (el precio).
    '--ph-accent-ink': s.colors.scheme === 'light'
      ? `color-mix(in srgb, ${s.colors.accent} 76%, #000000)`
      : s.colors.accent,
  } as CSSProperties;

  return (
    <figure className="lp-ph" aria-label={showcase ? `Menú de ${s.name} en un teléfono` : 'Así se ve un menú de Leogin en un teléfono'}>
      <div aria-hidden className="lp-ph-halo" />
      <div className="lp-device lp-device-phone" aria-hidden>
        <div className="lp-device-screen-phone lp-ph-screen" style={vars}>
          <div className="lp-ph-head">
            <div className="lp-ph-brand">
              {s.logo
                // eslint-disable-next-line @next/next/no-img-element -- ya viene reducida por /img (assetSrc)
                ? <img src={s.logo} alt="" width={34} height={34} className="lp-ph-logo" loading="lazy" decoding="async" />
                : <span className="lp-ph-logo">{s.name.trim().charAt(0).toUpperCase()}</span>}
              <div style={{ minWidth: 0 }}>
                <div className="lp-ph-name">{s.name}</div>
                {s.line && <div className="lp-ph-line">{s.line}</div>}
              </div>
            </div>
          </div>

          <div className="lp-ph-chips">
            <span className="lp-ph-chip" data-on="">Todo</span>
            {s.categories.map((c) => <span key={c} className="lp-ph-chip">{c}</span>)}
          </div>

          <div className="lp-ph-items">
            {s.items.map((it) => (
              <div key={it.id} className="lp-ph-item">
                {it.image
                  // eslint-disable-next-line @next/next/no-img-element -- ya viene reducida por /img (assetSrc)
                  ? <img src={it.image} alt="" width={52} height={52} className="lp-ph-art" loading="lazy" decoding="async" />
                  : <span className="lp-ph-art"><Icon name={it.icon} size={22} /></span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lp-ph-item-name">{it.name}</div>
                  {it.description && <div className="lp-ph-item-desc">{it.description}</div>}
                  <div className="lp-ph-price t-mono">{it.price}</div>
                </div>
                <span className="lp-ph-add"><Icon name="plus" size={14} strokeWidth={2.6} /></span>
              </div>
            ))}
          </div>

          <div className="lp-ph-cart">
            <span>Ver carrito · {s.cart.count}</span>
            <span className="t-mono">{s.cart.total}</span>
          </div>
        </div>
      </div>
      {showcase && (
        <figcaption className="lp-ph-caption">
          Menú real de{' '}
          <a href={s.menuUrl} className="lp-link">{s.name}</a>
        </figcaption>
      )}
    </figure>
  );
}

export function Testimonials({ items }: { items: TestimonialView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="lp-quotes" data-count={items.length}>
      {items.map((t) => (
        <figure key={`${t.restaurant}-${t.person}`} className="lp-card lp-quote">
          <blockquote className="lp-quote-text">«{t.quote}»</blockquote>
          <figcaption className="lp-quote-who">
            {t.logo
              // eslint-disable-next-line @next/next/no-img-element -- ya viene reducida por /img (assetSrc)
              ? <img src={t.logo} alt="" width={40} height={40} className="lp-quote-logo" loading="lazy" decoding="async" />
              : <span className="lp-quote-logo" style={{ color: t.accent }}>{t.restaurant.trim().charAt(0).toUpperCase()}</span>}
            <span style={{ minWidth: 0 }}>
              <span className="lp-quote-person">{t.person}</span>
              <span className="lp-quote-role">
                {t.role ? `${t.role} · ` : ''}
                <a href={t.menuUrl} className="lp-link">{t.restaurant}</a>
              </span>
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
