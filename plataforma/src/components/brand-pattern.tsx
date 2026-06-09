/* BrandPattern — arte generativo de producto (espiral de círculos + ícono de comida).
   Determinístico desde `seed`. Usa currentColor: el contenedor define el color
   (normalmente var(--u-text)). Portado de Glass.jsx del prototipo.

   Reemplaza el placeholder "foto": cuando un producto no tiene imagen real, se
   muestra este patrón de marca para que la tarjeta siga viéndose premium. */

import type { CSSProperties } from 'react';
import { ICON_PATHS } from '@/components/icons';

/** Hash estable string → número, para usar el id del producto como seed. */
export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000;
}

/* PRNG entero (mulberry32): determinístico y BIT-IDÉNTICO en servidor y
   cliente (solo usa enteros), a diferencia de Math.sin que difiere por motor
   y provoca hydration mismatch en los atributos del SVG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

interface BrandPatternProps {
  icon?: string;
  seed?: number;
  iconScale?: number;
  faint?: number;
  style?: CSSProperties;
}

export function BrandPattern({
  icon = 'utensils',
  seed = 0,
  iconScale = 1,
  faint = 0.16,
  style,
}: BrandPatternProps) {
  const rand = mulberry32(seed + 1);
  const clusters = [
    { cx: r2(18 + rand() * 14), cy: r2(70 + rand() * 18), n: 3 + Math.floor(rand() * 2) },
    { cx: r2(74 + rand() * 16), cy: r2(24 + rand() * 18), n: 2 + Math.floor(rand() * 3) },
    { cx: r2(82 + rand() * 10), cy: r2(78 + rand() * 14), n: 2 + Math.floor(rand() * 2) },
  ];
  const path = ICON_PATHS[icon] ?? ICON_PATHS.utensils;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block', color: 'inherit', ...style }}
      aria-hidden
    >
      <g stroke="currentColor" strokeOpacity={faint} fill="none" strokeWidth="1.1">
        {clusters.map((c, ci) => (
          <g key={ci}>
            {Array.from({ length: c.n }).map((_, ri) => (
              <circle key={ri} cx={c.cx} cy={c.cy} r={3 + ri * 5.5} />
            ))}
            <circle cx={c.cx} cy={c.cy} r="1.4" fill="currentColor" fillOpacity={faint + 0.1} stroke="none" />
          </g>
        ))}
      </g>
      <g
        transform={`translate(50 50) scale(${1.7 * iconScale}) translate(-12 -12)`}
        stroke="currentColor"
        strokeOpacity="0.92"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {path}
      </g>
    </svg>
  );
}
