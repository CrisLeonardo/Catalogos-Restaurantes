'use client';

import { useId } from 'react';

/** Solo la marca: cuadrado oscuro con la "L" en gradiente coral→naranja. */
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
        <linearGradient id={gid} x1="27" y1="19" x2="72" y2="81" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8534A" />
          <stop offset="1" stopColor="#F5A030" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="#1C1C1E" />
      <path d="M27 19 h18 v44 h27 v18 H27 Z" fill={`url(#${gid})`} />
    </svg>
  );
}

/** Marca + wordmark "Leogin" con gradiente coral→naranja en el texto. */
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
          style={{
            fontSize: size * 0.66,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(90deg, #E8534A 0%, #F5A030 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Leogin
        </span>
      )}
    </span>
  );
}
