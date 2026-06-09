'use client';

import { useId } from 'react';

/* ============================================================
   Logo PROVISIONAL de Leogin.
   Monograma "L" + punto de acento sobre tile coral (la marca
   de la plataforma). Reemplázalo por el logo original cuando
   lo tengas: basta con cambiar <LeoginMark> y/o public/logo-mark.svg.
   ============================================================ */

/** Solo la marca (tile coral con la "L"). Escalable y nítida. */
export function LeoginMark({ size = 28 }: { size?: number }) {
  const raw = useId();
  const gid = `leogin-grad-${raw.replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="Leogin"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8917A" />
          <stop offset="1" stopColor="#C75D3E" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${gid})`} />
      {/* sutil brillo superior */}
      <rect width="100" height="100" rx="24" fill="#ffffff" fillOpacity="0.06" />
      {/* Monograma L */}
      <path d="M36 26 h13 v37 h21 v13 H36 Z" fill="#ffffff" />
      {/* Punto de acento */}
      <circle cx="64" cy="33" r="7" fill="#ffffff" fillOpacity="0.55" />
    </svg>
  );
}

/** Marca + wordmark "Leogin". Úsalo en landing, login y panel. */
export default function LeoginLogo({
  size = 28,
  wordmark = true,
}: {
  size?: number;
  wordmark?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.34 }}>
      <LeoginMark size={size} />
      {wordmark && (
        <span
          className="t-display"
          style={{ fontSize: size * 0.66, lineHeight: 1, letterSpacing: '-0.02em' }}
        >
          Leogin
        </span>
      )}
    </span>
  );
}
