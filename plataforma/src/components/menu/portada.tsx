'use client';

/* Portada del cliente — 3 variantes (spotlight / poster / stack), o ninguna.
   Todo sale del motor: logo, marca, tagline, zona, textos y CTA. Portado de
   ClientApp.jsx, adaptado a un hero web que hace scroll al menú. */

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';

function scrollToMenu() {
  document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Marca: usa el logo subido o, si no hay, un monograma con la inicial. */
function BrandMark({ size = 96 }: { size?: number }) {
  const config = useThemeConfig();
  if (config.logoUrl) {
    return (
      <Image
        src={config.logoUrl}
        alt={config.brandName}
        width={size}
        height={size}
        style={{ width: size, height: 'auto', objectFit: 'contain', display: 'block' }}
      />
    );
  }
  const initial = config.brandName.trim().charAt(0).toUpperCase() || '·';
  return (
    <div
      className="glass"
      style={{
        width: size, height: size, borderRadius: '28%', display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.42, color: 'var(--u-text)',
      }}
    >
      {initial}
    </div>
  );
}

function OpenBadge({ isOpen }: { isOpen: boolean }) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const label = isOpen ? content.portada.badgeOpen : content.portada.badgeClosed;
  const text = [label, config.zone].filter(Boolean).join(' · ');
  const dotColor = isOpen ? 'var(--u-text)' : 'var(--c-danger, #f87171)';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999,
        background: 'var(--surface-3)', border: '1px solid var(--u-hair-2)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)',
      }}
    >
      {config.portadaShowStatus && (
        <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor, boxShadow: `0 0 8px ${dotColor}`, animation: config.animations && isOpen ? 'pulse-ring 2.2s infinite' : undefined }} />
      )}
      {text}
    </span>
  );
}

const heroWrap: CSSProperties = {
  position: 'relative', minHeight: '100svh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 22, padding: '40px 8px',
};

export default function Portada({ isOpen = true }: { isOpen?: boolean }) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const titleT = useText('heading', 'portadaTitle');
  const subT = useText('serif', 'portadaSubtitle');
  if (config.portadaVariant === 'none') return null;

  const title = content.portada.title || config.brandName;
  const subtitle = content.portada.subtitle || config.tagline;
  const anim = config.animations;

  /* ── Spotlight ── */
  if (config.portadaVariant === 'spotlight') {
    return (
      <section style={heroWrap}>
        <div
          aria-hidden
          style={{
            position: 'absolute', top: '18%', width: 280, height: 280, borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-accent) 20%, transparent), transparent 65%)',
            filter: 'blur(8px)', pointerEvents: 'none',
          }}
        />
        {config.portadaShowLogo && (
          <div className={anim ? 'anim-pop' : ''} style={{ animation: anim ? 'bob 5s ease-in-out infinite' : undefined }}>
            <BrandMark size={168} />
          </div>
        )}
        <div className={anim ? 'anim-fade-up' : ''}>
          <h1 className="t-display" style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * clamp(40px, 12vw, 60px))` }}>{title}</h1>
          {subtitle && (
            <p className="t-serif" style={{ ...subT.vars, fontSize: 19 * subT.size, marginTop: 12 }}>{subtitle}</p>
          )}
        </div>
        <div className={anim ? 'anim-fade-up' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', width: '100%', maxWidth: 320 }}>
          {config.portadaShowBadge && <OpenBadge isOpen={isOpen} />}
          <PrimaryButton size="lg" full iconRight="arrowRight" onClick={scrollToMenu} elementKey="portadaCta" style={{ marginTop: 4 }}>
            {content.portada.cta}
          </PrimaryButton>
        </div>
      </section>
    );
  }

  /* ── Poster ── */
  if (config.portadaVariant === 'poster') {
    return (
      <section style={{ ...heroWrap, alignItems: 'stretch', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {config.portadaShowBadge ? <OpenBadge isOpen={isOpen} /> : <span />}
          {config.portadaShowLogo && <BrandMark size={46} />}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="t-poster" style={{ fontSize: 14, letterSpacing: '0.3em', color: 'var(--u-text-3)' }}>{content.portada.posterKicker}</div>
          <div className="t-poster" style={{ fontSize: 'clamp(56px, 22vw, 104px)', lineHeight: 0.84, marginTop: 6 }}>{title}</div>
          {subtitle && (
            <p className="t-serif" style={{ fontStyle: 'italic', fontSize: 20, color: 'var(--u-text-2)', marginTop: 18 }}>{subtitle}</p>
          )}
        </div>
        <PrimaryButton size="lg" full iconRight="arrowRight" onClick={scrollToMenu} elementKey="portadaCta">{content.portada.cta}</PrimaryButton>
      </section>
    );
  }

  /* ── Stack ── */
  const feats = [
    { t: subtitle, i: 'sparkle' },
    { t: config.zone ? `Pedidos en ${config.zone}` : 'Pedí en línea', i: 'truck' },
    { t: 'Hecho al momento', i: 'flame' },
  ].filter((f) => f.t);
  return (
    <section style={{ ...heroWrap, justifyContent: 'flex-start', gap: 18 }}>
      <div className={anim ? 'anim-fade-up' : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 6 }}>
        {config.portadaShowLogo && <BrandMark size={92} />}
        <h1 className="t-display" style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * clamp(30px, 9vw, 40px))` }}>{title}</h1>
        {subtitle && <p className="t-serif" style={{ ...subT.vars, fontSize: 17 * subT.size }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360, flex: 1, justifyContent: 'center' }}>
        {feats.map((f, i) => (
          <Glass key={i} style={{ padding: '15px 16px', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text)' }}>
              <Icon name={f.i} size={20} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--u-text)', textAlign: 'left' }}>{f.t}</span>
          </Glass>
        ))}
      </div>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {config.portadaShowBadge && <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><OpenBadge isOpen={isOpen} /></div>}
        <PrimaryButton size="lg" full iconRight="arrowRight" onClick={scrollToMenu} elementKey="portadaCta">{content.portada.cta}</PrimaryButton>
      </div>
    </section>
  );
}
